import express, { type Express, type Response } from "express";
import { type Server } from "http";
import fs from "fs";
import path from "path";
import { spawn, exec } from "child_process";
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";

// Directory that contains product folders (e.g. C:\projects\UL).
// Override with PRODUCTS_DIR env var; defaults to the parent of this app's root.
const PRODUCTS_DIR =
  process.env.PRODUCTS_DIR ?? path.resolve(process.cwd(), "..");

// Python executable — override with PYTHON_EXEC env var if needed.
const PYTHON_EXEC = process.env.PYTHON_EXEC ?? "py";


// ---------------------------------------------------------------------------
// Run job store
// ---------------------------------------------------------------------------

interface RunJob {
  runId: string;
  status: "running" | "completed" | "failed";
  exitCode: number | null;
  output: string[];           // buffered lines (for clients that connect late)
  subscribers: Set<Response>;
  startedAt: number;
  endedAt: number | null;
}

const jobs = new Map<string, RunJob>();

// Broadcast a line to all SSE subscribers and push it to the buffer.
function pushLine(job: RunJob, line: string): void {
  job.output.push(line);
  const payload = `data: ${JSON.stringify({ line })}\n\n`;
  job.subscribers.forEach((sub) => sub.write(payload));
}

// Mark job done and notify all subscribers.
function finishJob(job: RunJob, exitCode: number): void {
  job.status = exitCode === 0 ? "completed" : "failed";
  job.exitCode = exitCode;
  job.endedAt = Date.now();
  const payload = `data: ${JSON.stringify({ done: true, exitCode })}\n\n`;
  job.subscribers.forEach((sub) => { sub.write(payload); sub.end(); });
  job.subscribers.clear();
}

// Clean up completed jobs older than 1 hour.
setInterval(() => {
  const cutoff = Date.now() - 3_600_000;
  jobs.forEach((job, id) => {
    if (job.status !== "running" && (job.endedAt ?? 0) < cutoff) {
      jobs.delete(id);
    }
  });
}, 600_000);

// ---------------------------------------------------------------------------
// Policy data directory
// ---------------------------------------------------------------------------

const POLICY_DATA_DIR =
  process.env.POLICY_DATA_DIR ?? path.join(PRODUCTS_DIR, "UL", "policy_data");

// ---------------------------------------------------------------------------
// Assumption parameter tables directory
// ---------------------------------------------------------------------------

const PARAM_TABLES_DIR =
  process.env.PARAM_TABLES_DIR ?? path.join(PRODUCTS_DIR, "UL", "param_tables");

// ---------------------------------------------------------------------------
// Results directory (UL model output)
// ---------------------------------------------------------------------------

const RESULTS_DIR =
  process.env.RESULTS_DIR ?? path.join(PRODUCTS_DIR, "UL", "results", "test_1");

// ---------------------------------------------------------------------------
// VA assumptions file
// ---------------------------------------------------------------------------

const VA_DATA_DIR =
  process.env.VA_DATA_DIR ?? path.join(PRODUCTS_DIR, "VA", "data");
const VA_ASSUMPTIONS_FILE = path.join(VA_DATA_DIR, "Assumptions_Extracted.xlsx");

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  if (lines.length === 0) return { headers: [], rows: [] };
  const splitLine = (line: string) =>
    line.split(",").map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"));
  return {
    headers: splitLine(lines[0]),
    rows: lines.slice(1).filter(Boolean).map(splitLine),
  };
}

function isSafeFilename(name: string): boolean {
  return !(/[/\\]/.test(name)) && !/\.\./.test(name) && name.length > 0;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ------------------------------------------------------------------
  // GET /api/products
  // Returns folder names inside PRODUCTS_DIR as the product list.
  // Adding a new product folder automatically makes it appear in the UI.
  // ------------------------------------------------------------------
  app.get("/api/products", (_req, res) => {
    try {
      const entries = fs.readdirSync(PRODUCTS_DIR, { withFileTypes: true });
      const products = entries
        .filter(
          (e) =>
            e.isDirectory() &&
            e.name !== path.basename(process.cwd())  // exclude app's own folder
        )
        .map((e) => ({ id: e.name, label: e.name }));

      res.json({ products });
    } catch (err) {
      console.error("Failed to read products directory:", err);
      res.status(500).json({
        error: "Could not read products directory",
        path: PRODUCTS_DIR,
      });
    }
  });

  // ------------------------------------------------------------------
  // POST /api/run
  // Spawns the model script inside the selected product's folder.
  //   UL  → python run_model.py [--scenario-id N] [--device X] [--mode X]
  //   VA  → python lincoln_va/run.py [--reserve-basis X] [--reserve-method X]
  //              [--policy-id X] [--months N]
  // Returns { runId } immediately; use /api/run/:runId/stream for output.
  // ------------------------------------------------------------------
  app.post("/api/run", async (req, res) => {
    const {
      product,
      runType,
      scenarioId,
      outputDir,
      device,
      mode,
      months,
    } = req.body;

    if (!product) {
      return res.status(400).json({ error: "product is required" });
    }

    const productDir = path.join(PRODUCTS_DIR, product);
    if (!fs.existsSync(productDir)) {
      return res.status(404).json({ error: `Product directory not found: ${productDir}` });
    }

    // ----------------------------------------------------------------
    // VA product: spawn C:\projects\VA\run.py directly
    // ----------------------------------------------------------------
    if (product === "VA") {
      const vaDir = path.join(PRODUCTS_DIR, "VA");
      const scriptPath = path.join(vaDir, "run.py");

      if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ error: `run.py not found in ${vaDir}` });
      }

      const vaArgs: string[] = [
        scriptPath,
        "--policy-path",    path.join(vaDir, "data", "Input_PolicyDataRaw.xlsx"),
        "--assumptions-path", path.join(vaDir, "data", "Assumptions_Extracted.xlsx"),
        "--output-dir",     path.join(vaDir, "results"),
      ];

      if (months) vaArgs.push("--months", String(months));
      // runType "single" with a scenarioId → treat scenarioId as policy-id
      if (runType === "single" && scenarioId) {
        vaArgs.push("--policy-id", String(scenarioId));
      }

      const runId = randomUUID();
      const job: RunJob = {
        runId,
        status: "running",
        exitCode: null,
        output: [],
        subscribers: new Set(),
        startedAt: Date.now(),
        endedAt: null,
      };
      jobs.set(runId, job);

      const vaProc = spawn(PYTHON_EXEC, vaArgs, {
        cwd: vaDir,
        shell: false,
        env: { ...process.env },
      });

      let vaStdoutBuf = "";
      let vaStderrBuf = "";

      vaProc.stdout.on("data", (chunk: Buffer) => {
        vaStdoutBuf += chunk.toString();
        const lines = vaStdoutBuf.split(/\r?\n/);
        vaStdoutBuf = lines.pop() ?? "";
        for (const line of lines) pushLine(job, line);
      });

      vaProc.stderr.on("data", (chunk: Buffer) => {
        vaStderrBuf += chunk.toString();
        const lines = vaStderrBuf.split(/\r?\n/);
        vaStderrBuf = lines.pop() ?? "";
        for (const line of lines) pushLine(job, `[stderr] ${line}`);
      });

      vaProc.on("close", (code) => {
        if (vaStdoutBuf) pushLine(job, vaStdoutBuf);
        if (vaStderrBuf) pushLine(job, `[stderr] ${vaStderrBuf}`);
        finishJob(job, code ?? 1);
      });

      vaProc.on("error", (err) => {
        pushLine(job, `[error] Failed to start process: ${err.message}`);
        finishJob(job, 1);
      });

      return res.json({ runId });
    }

    // ----------------------------------------------------------------
    // All other products (UL, …): spawn run_model.py subprocess
    // ----------------------------------------------------------------
    const scriptPath = path.join(productDir, "run_model.py");
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `run_model.py not found in ${productDir}` });
    }
    if (runType === "single" && !scenarioId) {
      return res.status(400).json({ error: "scenarioId is required for single scenario runs" });
    }

    const args: string[] = ["run_model.py"];
    if (runType === "single") args.push("--scenario-id", String(scenarioId));
    if (outputDir) args.push("--output-dir", outputDir);
    if (device) args.push("--device", device);
    if (mode) args.push("--mode", mode);

    // Create job
    const runId = randomUUID();
    const job: RunJob = {
      runId,
      status: "running",
      exitCode: null,
      output: [],
      subscribers: new Set(),
      startedAt: Date.now(),
      endedAt: null,
    };
    jobs.set(runId, job);

    // Spawn Python process
    const proc = spawn(PYTHON_EXEC, args, {
      cwd: productDir,
      shell: false,
      env: { ...process.env },
    });

    let stdoutBuf = "";
    let stderrBuf = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) pushLine(job, line);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split(/\r?\n/);
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) pushLine(job, `[stderr] ${line}`);
    });

    proc.on("close", (code) => {
      if (stdoutBuf) pushLine(job, stdoutBuf);
      if (stderrBuf) pushLine(job, `[stderr] ${stderrBuf}`);
      finishJob(job, code ?? 1);
    });

    proc.on("error", (err) => {
      pushLine(job, `[error] Failed to start process: ${err.message}`);
      finishJob(job, 1);
    });

    res.json({ runId });
  });

  // ------------------------------------------------------------------
  // GET /api/run/:runId/stream
  // Server-Sent Events stream — sends stdout/stderr lines as they arrive.
  // Late-joining clients receive all buffered lines first.
  // ------------------------------------------------------------------
  app.get("/api/run/:runId/stream", (req, res) => {
    const job = jobs.get(req.params.runId);
    if (!job) {
      return res.status(404).json({ error: "Run not found" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Replay buffered output for late subscribers
    for (const line of job.output) {
      res.write(`data: ${JSON.stringify({ line })}\n\n`);
    }

    if (job.status !== "running") {
      res.write(`data: ${JSON.stringify({ done: true, exitCode: job.exitCode })}\n\n`);
      res.end();
      return;
    }

    job.subscribers.add(res);
    req.on("close", () => job.subscribers.delete(res));
  });

  // ------------------------------------------------------------------
  // GET /api/run/:runId/status
  // Returns current status and full buffered output.
  // ------------------------------------------------------------------
  app.get("/api/run/:runId/status", (req, res) => {
    const job = jobs.get(req.params.runId);
    if (!job) {
      return res.status(404).json({ error: "Run not found" });
    }
    res.json({
      runId: job.runId,
      status: job.status,
      exitCode: job.exitCode,
      lineCount: job.output.length,
      output: job.output,
      elapsedMs: job.endedAt
        ? job.endedAt - job.startedAt
        : Date.now() - job.startedAt,
    });
  });

  // ------------------------------------------------------------------
  // POST /api/calculate (kept for compatibility — now delegates to /api/run)
  // ------------------------------------------------------------------
  app.post("/api/calculate", async (req, res) => {
    const { runType, policyId, product } = req.body;
    if (!product) {
      return res.status(400).json({ error: "product is required" });
    }

    const productDir = path.join(PRODUCTS_DIR, product);
    const scriptPath = path.join(productDir, "run_model.py");

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `run_model.py not found for product '${product}'` });
    }

    const args: string[] = ["run_model.py"];
    if (runType === "single" && policyId) {
      args.push("--scenario-id", String(policyId));
    }

    const runId = randomUUID();
    const job: RunJob = {
      runId,
      status: "running",
      exitCode: null,
      output: [],
      subscribers: new Set(),
      startedAt: Date.now(),
      endedAt: null,
    };
    jobs.set(runId, job);

    const proc = spawn(PYTHON_EXEC, args, {
      cwd: productDir,
      shell: false,
      env: { ...process.env },
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
        pushLine(job, line);
      }
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
        pushLine(job, `[stderr] ${line}`);
      }
    });
    proc.on("close", (code) => finishJob(job, code ?? 1));
    proc.on("error", (err) => {
      pushLine(job, `[error] ${err.message}`);
      finishJob(job, 1);
    });

    res.json({ runId, streamUrl: `/api/run/${runId}/stream` });
  });

  // ------------------------------------------------------------------
  // GET /api/assumptions/files
  // Lists all files inside PARAM_TABLES_DIR.
  // ------------------------------------------------------------------
  app.get("/api/assumptions/files", (_req, res) => {
    try {
      if (!fs.existsSync(PARAM_TABLES_DIR)) {
        return res.json({ files: [] });
      }
      const entries = fs.readdirSync(PARAM_TABLES_DIR, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => {
          const stat = fs.statSync(path.join(PARAM_TABLES_DIR, e.name));
          return { name: e.name, size: stat.size, modified: stat.mtime.toISOString() };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ files });
    } catch (err) {
      console.error("assumptions/files list error:", err);
      res.status(500).json({ error: "Could not list param_tables directory" });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/assumptions/files/:filename
  // Returns parsed CSV (headers + rows) or raw text for other formats.
  // ------------------------------------------------------------------
  app.get("/api/assumptions/files/:filename", (req, res) => {
    const { filename } = req.params;
    if (!isSafeFilename(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(PARAM_TABLES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ext = path.extname(filename).toLowerCase();
      if (ext === ".csv") {
        res.json({ filename, type: "csv", ...parseCSV(content) });
      } else {
        res.json({ filename, type: "text", content });
      }
    } catch (err) {
      res.status(500).json({ error: "Could not read file" });
    }
  });

  // ------------------------------------------------------------------
  // POST /api/assumptions/files
  // Body: { filename: string, content: string }
  // Creates or overwrites a file in PARAM_TABLES_DIR.
  // ------------------------------------------------------------------
  app.post("/api/assumptions/files", (req, res) => {
    const { filename, content } = req.body as { filename: string; content: string };
    if (!filename || typeof content !== "string") {
      return res.status(400).json({ error: "filename and content are required" });
    }
    if (!isSafeFilename(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(PARAM_TABLES_DIR, filename);
    try {
      if (!fs.existsSync(PARAM_TABLES_DIR)) {
        fs.mkdirSync(PARAM_TABLES_DIR, { recursive: true });
      }
      fs.writeFileSync(filePath, content, "utf-8");
      res.json({ success: true, filename });
    } catch (err) {
      console.error("assumptions/files write error:", err);
      res.status(500).json({ error: "Could not write file" });
    }
  });

  // ------------------------------------------------------------------
  // DELETE /api/assumptions/files/:filename
  // Removes a file from PARAM_TABLES_DIR.
  // ------------------------------------------------------------------
  app.delete("/api/assumptions/files/:filename", (req, res) => {
    const { filename } = req.params;
    if (!isSafeFilename(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(PARAM_TABLES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Could not delete file" });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/policy-data
  // Lists all files in POLICY_DATA_DIR.
  // ------------------------------------------------------------------
  app.get("/api/policy-data", (_req, res) => {
    try {
      if (!fs.existsSync(POLICY_DATA_DIR)) {
        return res.json({ files: [] });
      }
      const entries = fs.readdirSync(POLICY_DATA_DIR, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => {
          const stat = fs.statSync(path.join(POLICY_DATA_DIR, e.name));
          return { name: e.name, size: stat.size, modified: stat.mtime.toISOString() };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ files });
    } catch (err) {
      console.error("policy-data list error:", err);
      res.status(500).json({ error: "Could not list policy_data directory" });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/policy-data/:filename
  // Downloads a file from POLICY_DATA_DIR.
  // ------------------------------------------------------------------
  app.get("/api/policy-data/:filename", (req, res) => {
    const { filename } = req.params;
    if (!isSafeFilename(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(POLICY_DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    res.download(filePath, filename);
  });

  // ------------------------------------------------------------------
  // POST /api/policy-data/upload/:filename
  // Uploads (creates or replaces) a file in POLICY_DATA_DIR.
  // Body: raw file bytes (application/octet-stream).
  // ------------------------------------------------------------------
  app.post(
    "/api/policy-data/upload/:filename",
    express.raw({ type: "*/*", limit: "500mb" }),
    (req, res) => {
      const { filename } = req.params;
      if (!isSafeFilename(filename)) {
        return res.status(400).json({ error: "Invalid filename" });
      }
      const filePath = path.join(POLICY_DATA_DIR, filename);
      try {
        if (!fs.existsSync(POLICY_DATA_DIR)) {
          fs.mkdirSync(POLICY_DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(filePath, req.body as Buffer);
        const stat = fs.statSync(filePath);
        res.json({ success: true, filename, size: stat.size });
      } catch (err) {
        console.error("policy-data upload error:", err);
        res.status(500).json({ error: "Could not write file" });
      }
    }
  );

  // ------------------------------------------------------------------
  // DELETE /api/policy-data/:filename
  // Removes a file from POLICY_DATA_DIR.
  // ------------------------------------------------------------------
  app.delete("/api/policy-data/:filename", (req, res) => {
    const { filename } = req.params;
    if (!isSafeFilename(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(POLICY_DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Could not delete file" });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/results/financial-summary
  // Returns parsed CSV data from UL/results/test_1.
  // ------------------------------------------------------------------
  app.get("/api/results/financial-summary", (_req, res) => {
    try {
      const metricsFile = path.join(RESULTS_DIR, "scenario_metrics_summary.csv");
      const summaryFile = path.join(RESULTS_DIR, "summary_scen1.csv");
      const result: Record<string, unknown> = {};

      if (fs.existsSync(metricsFile)) {
        result.metrics = parseCSV(fs.readFileSync(metricsFile, "utf-8"));
      }
      if (fs.existsSync(summaryFile)) {
        result.summary = parseCSV(fs.readFileSync(summaryFile, "utf-8"));
      }

      res.json(result);
    } catch (err) {
      console.error("results/financial-summary error:", err);
      res.status(500).json({ error: "Could not read financial summary" });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/va/assumptions/sheets
  // Lists all sheet names in the VA Assumptions_Extracted.xlsx file.
  // ------------------------------------------------------------------
  app.get("/api/va/assumptions/sheets", (_req, res) => {
    try {
      if (!fs.existsSync(VA_ASSUMPTIONS_FILE)) {
        return res.status(404).json({ error: "Assumptions file not found", path: VA_ASSUMPTIONS_FILE });
      }
      const wb = XLSX.readFile(VA_ASSUMPTIONS_FILE);
      res.json({ sheets: wb.SheetNames });
    } catch (err) {
      console.error("va/assumptions/sheets error:", err);
      res.status(500).json({ error: "Could not read assumptions file" });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/va/assumptions/download
  // Serves Assumptions_Extracted.xlsx as a file download.
  // ------------------------------------------------------------------
  app.get("/api/va/assumptions/download", (_req, res) => {
    if (!fs.existsSync(VA_ASSUMPTIONS_FILE)) {
      return res.status(404).json({ error: "Assumptions file not found" });
    }
    res.download(VA_ASSUMPTIONS_FILE, "Assumptions_Extracted.xlsx");
  });

  // ------------------------------------------------------------------
  // GET /api/va/assumptions/sheet/:sheetName
  // Returns headers + rows for one sheet (as 2-D string array).
  // ------------------------------------------------------------------
  app.get("/api/va/assumptions/sheet/:sheetName", (req, res) => {
    const sheetName = decodeURIComponent(req.params.sheetName);
    try {
      if (!fs.existsSync(VA_ASSUMPTIONS_FILE)) {
        return res.status(404).json({ error: "Assumptions file not found" });
      }
      const wb = XLSX.readFile(VA_ASSUMPTIONS_FILE);
      const ws = wb.Sheets[sheetName];
      if (!ws) {
        return res.status(404).json({ error: "Sheet not found" });
      }
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
      const headers: string[] = (data[0] as string[]) ?? [];
      const rows: string[][] = (data.slice(1) as string[][]);
      res.json({ sheetName, headers, rows });
    } catch (err) {
      console.error("va/assumptions/sheet GET error:", err);
      res.status(500).json({ error: "Could not read sheet" });
    }
  });

  // ------------------------------------------------------------------
  // POST /api/va/assumptions/sheet/:sheetName
  // Body: { headers: string[], rows: string[][] }
  // Saves (overwrites) a sheet in the XLSX file.
  // ------------------------------------------------------------------
  app.post("/api/va/assumptions/sheet/:sheetName", (req, res) => {
    const sheetName = decodeURIComponent(req.params.sheetName);
    const { headers, rows } = req.body as { headers: string[]; rows: string[][] };
    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      return res.status(400).json({ error: "headers and rows arrays are required" });
    }
    try {
      if (!fs.existsSync(VA_ASSUMPTIONS_FILE)) {
        return res.status(404).json({ error: "Assumptions file not found" });
      }
      const wb = XLSX.readFile(VA_ASSUMPTIONS_FILE);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      wb.Sheets[sheetName] = ws;
      if (!wb.SheetNames.includes(sheetName)) {
        wb.SheetNames.push(sheetName);
      }
      XLSX.writeFile(wb, VA_ASSUMPTIONS_FILE);
      res.json({ success: true, sheetName });
    } catch (err) {
      console.error("va/assumptions/sheet POST error:", err);
      res.status(500).json({ error: "Could not save sheet" });
    }
  });

  // ------------------------------------------------------------------
  // POST /api/va/assumptions/sheets
  // Body: { sheetName: string }
  // Adds a new empty sheet to the XLSX file.
  // ------------------------------------------------------------------
  app.post("/api/va/assumptions/sheets", (req, res) => {
    const { sheetName } = req.body as { sheetName?: string };
    if (!sheetName || typeof sheetName !== "string" || !sheetName.trim()) {
      return res.status(400).json({ error: "sheetName is required" });
    }
    const name = sheetName.trim();
    try {
      if (!fs.existsSync(VA_ASSUMPTIONS_FILE)) {
        return res.status(404).json({ error: "Assumptions file not found" });
      }
      const wb = XLSX.readFile(VA_ASSUMPTIONS_FILE);
      if (wb.SheetNames.includes(name)) {
        return res.status(409).json({ error: "Sheet already exists" });
      }
      const ws = XLSX.utils.aoa_to_sheet([[]]);
      wb.Sheets[name] = ws;
      wb.SheetNames.push(name);
      XLSX.writeFile(wb, VA_ASSUMPTIONS_FILE);
      res.json({ success: true, sheetName: name });
    } catch (err) {
      console.error("va/assumptions/sheets POST error:", err);
      res.status(500).json({ error: "Could not create sheet" });
    }
  });

  // ------------------------------------------------------------------
  // DELETE /api/va/assumptions/sheet/:sheetName
  // Removes a sheet from the XLSX file.
  // ------------------------------------------------------------------
  app.delete("/api/va/assumptions/sheet/:sheetName", (req, res) => {
    const sheetName = decodeURIComponent(req.params.sheetName);
    try {
      if (!fs.existsSync(VA_ASSUMPTIONS_FILE)) {
        return res.status(404).json({ error: "Assumptions file not found" });
      }
      const wb = XLSX.readFile(VA_ASSUMPTIONS_FILE);
      if (!wb.SheetNames.includes(sheetName)) {
        return res.status(404).json({ error: "Sheet not found" });
      }
      if (wb.SheetNames.length === 1) {
        return res.status(400).json({ error: "Cannot delete the only sheet" });
      }
      wb.SheetNames = wb.SheetNames.filter((s) => s !== sheetName);
      delete wb.Sheets[sheetName];
      XLSX.writeFile(wb, VA_ASSUMPTIONS_FILE);
      res.json({ success: true });
    } catch (err) {
      console.error("va/assumptions/sheet DELETE error:", err);
      res.status(500).json({ error: "Could not delete sheet" });
    }
  });

  // ------------------------------------------------------------------
  // VA Results endpoints
  // GET /api/va/results          — list .xlsx files in C:\projects\VA\results\
  // GET /api/va/results/:f/download  — download the xlsx
  // GET /api/va/results/:f/sheets    — list sheet names
  // GET /api/va/results/:f/sheet/:s  — return headers + rows for a sheet
  // ------------------------------------------------------------------

  const VA_RESULTS_DIR =
    process.env.VA_RESULTS_DIR ?? path.join(PRODUCTS_DIR, "VA", "results");

  app.get("/api/va/results", (_req, res) => {
    try {
      if (!fs.existsSync(VA_RESULTS_DIR)) {
        return res.json({ files: [] });
      }
      const entries = fs.readdirSync(VA_RESULTS_DIR, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile() && /\.(xlsx|xls)$/i.test(e.name))
        .map((e) => {
          const stat = fs.statSync(path.join(VA_RESULTS_DIR, e.name));
          return { name: e.name, size: stat.size, modified: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));
      res.json({ files });
    } catch (err) {
      console.error("va/results list error:", err);
      res.status(500).json({ error: "Could not list VA results directory" });
    }
  });

  app.get("/api/va/results/:filename/download", (req, res) => {
    const { filename } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    const filePath = path.join(VA_RESULTS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.download(filePath, filename);
  });

  app.get("/api/va/results/:filename/sheets", (req, res) => {
    const { filename } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    const filePath = path.join(VA_RESULTS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    try {
      const wb = XLSX.readFile(filePath);
      res.json({ filename, sheets: wb.SheetNames });
    } catch (err) {
      console.error("va/results sheets error:", err);
      res.status(500).json({ error: "Could not read Excel file" });
    }
  });

  app.get("/api/va/results/:filename/sheet/:sheetName", (req, res) => {
    const { filename, sheetName } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    const decodedSheet = decodeURIComponent(sheetName);
    const filePath = path.join(VA_RESULTS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    try {
      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets[decodedSheet];
      if (!ws) return res.status(404).json({ error: "Sheet not found" });
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
      const headers: string[] = (data[0] as string[]) ?? [];
      const rows: string[][] = data.slice(1) as string[][];
      res.json({ filename, sheetName: decodedSheet, headers, rows });
    } catch (err) {
      console.error("va/results sheet error:", err);
      res.status(500).json({ error: "Could not read sheet" });
    }
  });

  // ------------------------------------------------------------------
  // POST /api/open-file
  // Opens a file or folder using the OS default application (Windows).
  // Used by the ribbon buttons to open VA data files / results folder.
  // ------------------------------------------------------------------
  app.post("/api/open-file", (req, res) => {
    const { filePath: reqPath } = req.body as { filePath?: string };
    if (!reqPath || typeof reqPath !== "string") {
      return res.status(400).json({ error: "filePath is required" });
    }
    const normalizedPath = path.normalize(reqPath);
    // Open with Windows shell (works for files and directories)
    exec(`start "" "${normalizedPath}"`, (err: Error | null) => {
      if (err) console.error("open-file error:", err.message);
    });
    res.json({ success: true });
  });

  // ===========================================================================
  // GitHub Auth API
  // ===========================================================================

  // Short-lived map: state → {clientId, clientSecret} for the OAuth popup callback.
  // Credentials come from the UI (localStorage) so no server env vars are needed.
  const oauthStateMap = new Map<string, { clientId: string; clientSecret: string }>();

  // POST /api/github/auth/validate-token  — verify a GitHub PAT and return user info
  app.post("/api/github/auth/validate-token", async (req: any, res: any) => {
    const { token } = req.body as { token: string };
    if (!token) return res.status(400).json({ error: "token required" });
    try {
      const r = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "FIA-Validation-Tool/1.0" },
      });
      if (!r.ok) return res.status(401).json({ error: "Invalid token or no GitHub access" });
      res.json({ user: await r.json() });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/github/auth/device/start  — initiate GitHub OAuth device flow
  // client_id comes from the UI (stored in localStorage and sent in the request body).
  app.post("/api/github/auth/device/start", async (req: any, res: any) => {
    const clientId: string = req.body?.client_id || process.env.GITHUB_CLIENT_ID || "";
    if (!clientId) return res.status(400).json({ error: "GitHub Client ID is required. Enter it in the GitHub settings panel." });
    try {
      const r = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, scope: "repo read:user user:email" }),
      });
      res.json(await r.json());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/github/auth/device/poll  — poll until the user authorises the device code
  app.post("/api/github/auth/device/poll", async (req: any, res: any) => {
    const { device_code, client_id } = req.body as { device_code: string; client_id?: string };
    const clientId = client_id || process.env.GITHUB_CLIENT_ID || "";
    if (!clientId) return res.status(400).json({ error: "GitHub Client ID is required" });
    if (!device_code) return res.status(400).json({ error: "device_code required" });
    try {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
      res.json(await r.json());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/github/auth/oauth/prepare  — store credentials server-side, return auth URL.
  // client_id and client_secret are sent from the UI so no server env vars are needed.
  app.post("/api/github/auth/oauth/prepare", (req: any, res: any) => {
    const { client_id, client_secret } = req.body as { client_id?: string; client_secret?: string };
    const clientId = client_id || process.env.GITHUB_CLIENT_ID || "";
    const clientSecret = client_secret || process.env.GITHUB_CLIENT_SECRET || "";
    if (!clientId) return res.status(400).json({ error: "GitHub Client ID is required" });
    if (!clientSecret) return res.status(400).json({ error: "GitHub Client Secret is required for browser login" });
    const state = randomUUID();
    oauthStateMap.set(state, { clientId, clientSecret });
    setTimeout(() => oauthStateMap.delete(state), 10 * 60 * 1000);
    const redirectUri = `${req.protocol}://${req.get("host")}/api/github/auth/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo+read:user+user:email&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.json({ url });
  });

  // GET /api/github/auth/callback  — GitHub redirects here after the user authorises.
  // Credentials are looked up from the state map set by /oauth/prepare above.
  app.get("/api/github/auth/callback", async (req: any, res: any) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code) return res.status(400).send("code missing");
    const creds = state ? oauthStateMap.get(state) : undefined;
    const clientId = creds?.clientId || process.env.GITHUB_CLIENT_ID || "";
    const clientSecret = creds?.clientSecret || process.env.GITHUB_CLIENT_SECRET || "";
    if (!clientId || !clientSecret) return res.status(400).send("OAuth credentials not found — please try again");
    if (creds && state) oauthStateMap.delete(state);
    try {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      const data = await r.json() as { access_token?: string; error?: string };
      if (!data.access_token) return res.status(400).send(`Auth failed: ${data.error ?? "no token"}`);
      res.send(`<!DOCTYPE html><html><body><script>
        if(window.opener){window.opener.postMessage({type:'github-auth',token:${JSON.stringify(data.access_token)}},'*');}
        setTimeout(()=>window.close(),500);
      </script><p>Authenticated! Closing window…</p></body></html>`);
    } catch (err) {
      res.status(500).send(`Error: ${err}`);
    }
  });

  // ===========================================================================
  // Code Editor API — full project file browser + read/write/create/delete
  // ===========================================================================

  const EDITOR_ROOT = process.env.EDITOR_ROOT ?? path.resolve(process.cwd(), "..");
  const SKIP_DIRS = new Set([
    "node_modules", ".git", "dist", "__pycache__",
    ".next", "build", ".venv", "venv", ".cache",
  ]);
  const TEXT_EXTS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".json", ".jsonc", ".md", ".txt",
    ".css", ".scss", ".less", ".html", ".htm",
    ".yaml", ".yml", ".toml", ".env", ".sh", ".bat", ".ps1",
    ".sql", ".xml", ".csv", ".ini", ".cfg", ".conf",
    ".gitignore", ".gitattributes", ".eslintrc", ".prettierrc",
    ".editorconfig", ".nvmrc", ".babelrc",
  ]);

  function assertSafe(rel: string): string {
    const abs = path.resolve(EDITOR_ROOT, rel.replace(/^[/\\]+/, ""));
    if (!abs.startsWith(EDITOR_ROOT + path.sep) && abs !== EDITOR_ROOT) {
      throw new Error("Path outside project root");
    }
    return abs;
  }

  interface FsNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: FsNode[];
    size?: number;
  }

  function buildTree(dir: string, rel: string, depth: number): FsNode[] {
    if (depth > 8) return [];
    let names: string[];
    try { names = fs.readdirSync(dir) as string[]; }
    catch { return []; }

    const nodes: FsNode[] = [];
    for (const name of names) {
      const abs = path.join(dir, name);
      const childRel = (rel ? rel + "/" : "") + name;
      let stat: ReturnType<typeof fs.statSync>;
      try { stat = fs.statSync(abs); } catch { continue; }
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        nodes.push({
          name, path: childRel, type: "directory",
          children: buildTree(abs, childRel, depth + 1),
        });
      } else {
        nodes.push({ name, path: childRel, type: "file", size: stat.size });
      }
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // GET /api/code-editor/tree
  app.get("/api/code-editor/tree", (_req, res) => {
    try {
      res.json({ tree: buildTree(EDITOR_ROOT, "", 0), root: EDITOR_ROOT });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/code-editor/file?path=server/routes.ts
  app.get("/api/code-editor/file", (req, res) => {
    const rel = String(req.query.path || "");
    if (!rel) return res.status(400).json({ error: "path required" });
    try {
      const abs = assertSafe(rel);
      if (!fs.existsSync(abs)) return res.status(404).json({ error: "Not found" });
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) return res.status(400).json({ error: "Path is a directory" });
      const ext = path.extname(abs).toLowerCase();
      if (ext && !TEXT_EXTS.has(ext)) return res.status(415).json({ error: "Binary file" });
      const content = fs.readFileSync(abs, "utf-8");
      res.json({ path: rel, content });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // PUT /api/code-editor/file   body: { path, content }
  app.put("/api/code-editor/file", (req, res) => {
    const { path: rel, content } = req.body as { path: string; content: string };
    if (!rel || typeof content !== "string") return res.status(400).json({ error: "path and content required" });
    try {
      const abs = assertSafe(rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf-8");
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // POST /api/code-editor/file   body: { path, isDir?, content? }
  app.post("/api/code-editor/file", (req, res) => {
    const { path: rel, isDir, content = "" } = req.body as { path: string; isDir?: boolean; content?: string };
    if (!rel) return res.status(400).json({ error: "path required" });
    try {
      const abs = assertSafe(rel);
      if (fs.existsSync(abs)) return res.status(409).json({ error: "Already exists" });
      if (isDir) {
        fs.mkdirSync(abs, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf-8");
      }
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // DELETE /api/code-editor/file?path=...
  app.delete("/api/code-editor/file", (req, res) => {
    const rel = String(req.query.path || "");
    if (!rel) return res.status(400).json({ error: "path required" });
    try {
      const abs = assertSafe(rel);
      if (!fs.existsSync(abs)) return res.status(404).json({ error: "Not found" });
      fs.rmSync(abs, { recursive: true, force: true });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // POST /api/code-editor/rename   body: { oldPath, newPath }
  app.post("/api/code-editor/rename", (req, res) => {
    const { oldPath, newPath } = req.body as { oldPath: string; newPath: string };
    if (!oldPath || !newPath) return res.status(400).json({ error: "oldPath and newPath required" });
    try {
      const absOld = assertSafe(oldPath);
      const absNew = assertSafe(newPath);
      if (!fs.existsSync(absOld)) return res.status(404).json({ error: "Source not found" });
      if (fs.existsSync(absNew)) return res.status(409).json({ error: "Destination exists" });
      fs.renameSync(absOld, absNew);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // POST /api/code-editor/copilot-chat
  // Streams Copilot chat completions using the user's GitHub PAT.
  // Body: { message, code, filename, language, githubToken }
  app.post("/api/code-editor/copilot-chat", async (req: any, res: any) => {
    const { message, code, filename, language, githubToken } = req.body as {
      message: string; code: string; filename: string;
      language: string; githubToken: string;
    };
    if (!githubToken) return res.status(401).json({ error: "githubToken required" });
    if (!message) return res.status(400).json({ error: "message required" });

    try {
      // Exchange GitHub PAT for a short-lived Copilot token
      const tokenRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          "User-Agent": "FIA-Validation-Tool/1.0",
        },
      });
      if (!tokenRes.ok) {
        if (tokenRes.status === 401) {
          return res.status(401).json({ error: "GitHub token is invalid or expired. Re-connect your account.", code: "BAD_TOKEN" });
        }
        // 403 means the token is valid but Copilot is not enabled / not subscribed
        return res.status(403).json({ error: "GitHub Copilot is not enabled on this account.", code: "COPILOT_NOT_ENABLED" });
      }
      const { token: copilotToken } = await tokenRes.json() as { token: string };

      // Call Copilot Chat completions (OpenAI-compatible, streamed)
      const chatRes = await fetch("https://api.githubcopilot.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${copilotToken}`,
          "Content-Type": "application/json",
          "Copilot-Integration-Id": "vscode-chat",
          "Editor-Version": "FIA-Tool/1.0",
          "Editor-Plugin-Version": "copilot-chat/0.23.2",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `You are GitHub Copilot, an AI coding assistant. The user is editing "${filename}" (${language}). Help them write, understand, or improve code. Respond concisely with code blocks where relevant.`,
            },
            {
              role: "user",
              content: code
                ? `Here is the current file:\n\`\`\`${language}\n${code}\n\`\`\`\n\n${message}`
                : message,
            },
          ],
          model: "gpt-4o",
          stream: true,
          temperature: 0.0,
          max_tokens: 2048,
        }),
      });

      if (!chatRes.ok) {
        const detail = await chatRes.text();
        return res.status(chatRes.status).json({ error: detail });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no");

      // Pipe the SSE stream straight through to the client
      const reader = (chatRes.body as any)?.getReader?.() as ReadableStreamDefaultReader<Uint8Array> | undefined;
      if (!reader) return res.end();
      const decoder = new TextDecoder();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { res.end(); break; }
            res.write(decoder.decode(value, { stream: true }));
          }
        } catch { res.end(); }
      };
      pump();
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/code-editor/ai-chat
  // Generic AI chat supporting OpenAI, Anthropic (Claude), and Azure OpenAI.
  // All credentials come from the client request body — nothing is stored server-side.
  app.post("/api/code-editor/ai-chat", async (req: any, res: any) => {
    const { message, code, filename, language, provider, apiKey, model, azureEndpoint } = req.body as {
      message: string; code: string; filename: string; language: string;
      provider: "openai" | "anthropic" | "azure" | "gemini";
      apiKey: string; model?: string; azureEndpoint?: string;
    };
    if (!apiKey) return res.status(401).json({ error: "apiKey required" });
    if (!provider) return res.status(400).json({ error: "provider required" });
    if (!message) return res.status(400).json({ error: "message required" });

    const systemPrompt = `You are an AI coding assistant. The user is editing "${filename || "a file"}" (${language || "plaintext"}). Help them write, understand, and improve code. Be concise; use code blocks where relevant.`;
    const userContent = code
      ? `Here is the current file:\n\`\`\`${language}\n${code}\n\`\`\`\n\n${message}`
      : message;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    async function pipeStream(readable: ReadableStream<Uint8Array>) {
      const reader = (readable as any).getReader() as ReadableStreamDefaultReader<Uint8Array>;
      const dec = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(dec.decode(value, { stream: true }));
        }
      } catch { /* client disconnected */ }
    }

    try {
      if (provider === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: model || "claude-sonnet-4-6",
            max_tokens: 2048,
            stream: true,
            system: systemPrompt,
            messages: [{ role: "user", content: userContent }],
          }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({})) as any;
          res.write(`data: ${JSON.stringify({ error: e.error?.message || `Anthropic error ${r.status}` })}\n\n`);
          res.end(); return;
        }
        // Anthropic streams event:content_block_delta — convert to OpenAI-compat format for client
        const reader = (r.body as any).getReader() as ReadableStreamDefaultReader<Uint8Array>;
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            try {
              const evt = JSON.parse(raw);
              const text: string = evt.delta?.text ?? "";
              if (text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
            } catch { /* skip malformed */ }
          }
        }
      } else if (provider === "gemini") {
        // Google Gemini — uses generateContent with server-sent events
        const geminiModel = model || "gemini-2.0-flash";
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userContent }] }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
          }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({})) as any;
          res.write(`data: ${JSON.stringify({ error: e.error?.message || `Gemini error ${r.status}` })}\n\n`);
          res.end(); return;
        }
        // Gemini SSE: data: {"candidates":[{"content":{"parts":[{"text":"..."}],"role":"model"}}]}
        const reader = (r.body as any).getReader() as ReadableStreamDefaultReader<Uint8Array>;
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            try {
              const evt = JSON.parse(raw);
              const text: string = evt.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              if (text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
            } catch { /* skip malformed */ }
          }
        }
      } else {
        // OpenAI or Azure OpenAI
        const endpoint = provider === "azure"
          ? `${(azureEndpoint || "").replace(/\/$/, "")}/openai/deployments/${model || "gpt-4o"}/chat/completions?api-version=2024-02-01`
          : "https://api.openai.com/v1/chat/completions";

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(provider === "azure" ? { "api-key": apiKey } : { Authorization: `Bearer ${apiKey}` }),
        };

        const body: any = {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          stream: true,
          temperature: 0.2,
          max_tokens: 2048,
        };
        if (provider === "openai") body.model = model || "gpt-4o";

        const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
        if (!r.ok) {
          const e = await r.json().catch(() => ({})) as any;
          res.write(`data: ${JSON.stringify({ error: e.error?.message || `API error ${r.status}` })}\n\n`);
          res.end(); return;
        }
        await pipeStream(r.body!);
      }
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });

  // ===========================================================================
  // Local LLM (Ollama) — no API key required
  // ===========================================================================

  const OLLAMA_BASE = process.env.OLLAMA_BASE ?? "http://localhost:11434";
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b";

  // GET /api/local-llm/status — check if Ollama is reachable and list models
  app.get("/api/local-llm/status", async (_req: any, res: any) => {
    try {
      const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return res.status(502).json({ running: false, error: "Ollama returned non-OK" });
      const data = await r.json() as { models: { name: string }[] };
      const models = (data.models ?? []).map((m: { name: string }) => m.name);
      res.json({ running: true, models, activeModel: OLLAMA_MODEL });
    } catch {
      res.status(502).json({ running: false, error: "Ollama not reachable — run: ollama serve" });
    }
  });

  // POST /api/local-llm/chat — streaming chat completions via Ollama
  // Body: { message, code?, filename?, language?, model? }
  app.post("/api/local-llm/chat", async (req: any, res: any) => {
    const { message, code, filename, language, model } = req.body as {
      message: string; code?: string; filename?: string;
      language?: string; model?: string;
    };
    if (!message) return res.status(400).json({ error: "message required" });

    const useModel = model ?? OLLAMA_MODEL;

    const systemPrompt = filename
      ? `You are an expert coding assistant. The user is editing "${filename}" (${language ?? "code"}). Help them write, understand, fix, or improve their code. Be concise. Use code blocks where helpful.`
      : "You are an expert coding assistant. Help the user with their coding questions. Be concise and accurate.";

    const userContent = code?.trim()
      ? `Here is the current file:\n\`\`\`${language ?? ""}\n${code}\n\`\`\`\n\n${message}`
      : message;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      const ollamaRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: useModel,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!ollamaRes.ok) {
        const err = await ollamaRes.text();
        res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
        res.end();
        return;
      }

      // Ollama streams newline-delimited JSON; convert to SSE for the browser
      const reader = (ollamaRes.body as any)?.getReader?.() as ReadableStreamDefaultReader<Uint8Array> | undefined;
      if (!reader) { res.end(); return; }

      const dec = new TextDecoder();
      let leftover = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        leftover += dec.decode(value, { stream: true });
        const lines = leftover.split("\n");
        leftover = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            const text: string = obj?.message?.content ?? "";
            if (text) {
              // Emit as OpenAI-compatible SSE so the frontend can reuse the same parser
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
            }
            if (obj?.done) {
              res.write("data: [DONE]\n\n");
              res.end();
              return;
            }
          } catch { /* skip malformed line */ }
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
      res.end();
    }
  });

  return httpServer;
}
