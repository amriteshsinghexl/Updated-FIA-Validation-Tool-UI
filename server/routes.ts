import express, { type Express, type Response } from "express";
import { type Server } from "http";
import fs from "fs";
import path from "path";
import { spawn, exec } from "child_process";
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import {
  buildIndex, indexStatus, retrieve, invalidateCache,
  EMBED_MODEL, type BuildProgress, type RetrievedChunk,
} from "./rag";
import {
  PRODUCTS_DIR, listProducts, getProduct, resolveInProduct,
  type ProductConfig,
} from "./products";

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

// Spawn a Python subprocess, stream its stdout/stderr line-by-line into a new
// job, and return the job id. Used by /api/run for every product.
function startJob(args: string[], cwd: string): string {
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

  const proc = spawn(PYTHON_EXEC, args, { cwd, shell: false, env: { ...process.env } });

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

  return runId;
}

// Build the argv for a product run from its manifest + the request body.
function buildRunArgs(
  cfg: ProductConfig,
  body: { runType?: string; scenarioId?: unknown; outputDir?: unknown; device?: unknown; mode?: unknown; months?: unknown },
): string[] {
  const { run } = cfg;
  const args: string[] = [resolveInProduct(cfg.id, run.script)];

  if (body.runType === "single" && run.singleFlag && body.scenarioId != null && String(body.scenarioId) !== "") {
    args.push(run.singleFlag, String(body.scenarioId));
  }
  if (run.monthsFlag && body.months != null && String(body.months) !== "") {
    args.push(run.monthsFlag, String(body.months));
  }
  // Always-on args declared in the manifest (paths are relative to the product dir).
  for (const [flag, value] of run.fixedArgs) {
    args.push(flag, resolveInProduct(cfg.id, value));
  }
  // Optional args supplied by the request body, only if the manifest names a flag.
  if (run.outputFlag && body.outputDir) args.push(run.outputFlag, String(body.outputDir));
  if (run.deviceFlag && body.device) args.push(run.deviceFlag, String(body.device));
  if (run.modeFlag && body.mode) args.push(run.modeFlag, String(body.mode));

  return args;
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
  // Returns the normalized manifest for every product folder in PRODUCTS_DIR.
  // Adding a new product folder (+ optional fia.config.json) makes it appear
  // in the UI and become runnable with no code changes.
  // ------------------------------------------------------------------
  app.get("/api/products", (_req, res) => {
    try {
      const configs = listProducts();
      res.json({
        // `products` keeps the old { id, label } shape for any older caller;
        // `configs` carries the full manifest the UI now drives itself from.
        products: configs.map((c) => ({ id: c.id, label: c.label })),
        configs,
      });
    } catch (err) {
      console.error("Failed to read products directory:", err);
      res.status(500).json({ error: "Could not read products directory", path: PRODUCTS_DIR });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/products/:id  — single product manifest
  // ------------------------------------------------------------------
  app.get("/api/products/:id", (req, res) => {
    const cfg = getProduct(req.params.id);
    if (!cfg) return res.status(404).json({ error: "Product not found" });
    res.json(cfg);
  });

  // ------------------------------------------------------------------
  // POST /api/run
  // Spawns the model script inside the selected product's folder, building the
  // command line entirely from the product's manifest (fia.config.json).
  // Returns { runId } immediately; use /api/run/:runId/stream for output.
  // ------------------------------------------------------------------
  app.post("/api/run", async (req, res) => {
    const { product, runType, scenarioId } = req.body;

    if (!product) return res.status(400).json({ error: "product is required" });

    const cfg = getProduct(product);
    if (!cfg) return res.status(404).json({ error: `Product not found: ${product}` });

    const scriptPath = resolveInProduct(cfg.id, cfg.run.script);
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `${cfg.run.script} not found in product '${cfg.id}'` });
    }
    if (runType === "single" && cfg.run.singleFlag && !scenarioId) {
      return res.status(400).json({ error: "scenarioId is required for single runs" });
    }

    const args = buildRunArgs(cfg, req.body);
    const runId = startJob(args, resolveInProduct(cfg.id, "."));
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
  // POST /api/calculate (kept for compatibility — delegates to the manifest)
  // ------------------------------------------------------------------
  app.post("/api/calculate", async (req, res) => {
    const { runType, policyId, product } = req.body;
    if (!product) return res.status(400).json({ error: "product is required" });

    const cfg = getProduct(product);
    if (!cfg) return res.status(404).json({ error: `Product not found: ${product}` });

    const scriptPath = resolveInProduct(cfg.id, cfg.run.script);
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `${cfg.run.script} not found for product '${product}'` });
    }

    const args = buildRunArgs(cfg, { runType, scenarioId: policyId });
    const runId = startJob(args, resolveInProduct(cfg.id, "."));
    res.json({ runId, streamUrl: `/api/run/${runId}/stream` });
  });

  // ===================================================================
  // Generic, product-scoped data / assumptions / results endpoints.
  // Every path resolves directories from the product's manifest, so a new
  // product gets working Data / Assumptions / Results views with no new code.
  // ===================================================================

  // Resolve the product config or send a 404. Returns null when not found.
  function product(req: any, res: Response): ProductConfig | null {
    const cfg = getProduct(req.params.id);
    if (!cfg) { res.status(404).json({ error: "Product not found" }); return null; }
    return cfg;
  }

  // ------------------------------------------------------------------
  // Assumptions — CSV/text parameter tables (kind: "csv-files")
  //   GET    /api/products/:id/assumptions/files
  //   GET    /api/products/:id/assumptions/files/:filename
  //   POST   /api/products/:id/assumptions/files          { filename, content }
  //   DELETE /api/products/:id/assumptions/files/:filename
  // ------------------------------------------------------------------
  app.get("/api/products/:id/assumptions/files", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const dir = cfg.assumptions.dir ? resolveInProduct(cfg.id, cfg.assumptions.dir) : null;
    if (!dir || !fs.existsSync(dir)) return res.json({ files: [] });
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => {
          const stat = fs.statSync(path.join(dir, e.name));
          return { name: e.name, size: stat.size, modified: stat.mtime.toISOString() };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ files });
    } catch (err) {
      console.error("assumptions/files list error:", err);
      res.status(500).json({ error: "Could not list assumptions directory" });
    }
  });

  app.get("/api/products/:id/assumptions/files/:filename", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const { filename } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    if (!cfg.assumptions.dir) return res.status(404).json({ error: "No assumptions directory" });
    const filePath = resolveInProduct(cfg.id, path.join(cfg.assumptions.dir, filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      if (path.extname(filename).toLowerCase() === ".csv") {
        res.json({ filename, type: "csv", ...parseCSV(content) });
      } else {
        res.json({ filename, type: "text", content });
      }
    } catch {
      res.status(500).json({ error: "Could not read file" });
    }
  });

  app.post("/api/products/:id/assumptions/files", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const { filename, content } = req.body as { filename: string; content: string };
    if (!filename || typeof content !== "string") return res.status(400).json({ error: "filename and content are required" });
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    if (!cfg.assumptions.dir) return res.status(404).json({ error: "No assumptions directory" });
    const dir = resolveInProduct(cfg.id, cfg.assumptions.dir);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), content, "utf-8");
      res.json({ success: true, filename });
    } catch (err) {
      console.error("assumptions/files write error:", err);
      res.status(500).json({ error: "Could not write file" });
    }
  });

  app.delete("/api/products/:id/assumptions/files/:filename", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const { filename } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    if (!cfg.assumptions.dir) return res.status(404).json({ error: "No assumptions directory" });
    const filePath = resolveInProduct(cfg.id, path.join(cfg.assumptions.dir, filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Could not delete file" });
    }
  });

  // ------------------------------------------------------------------
  // Data — in-app file manager (kind: "list")
  //   GET    /api/products/:id/data
  //   GET    /api/products/:id/data/:filename            (download)
  //   POST   /api/products/:id/data/:filename            (raw upload)
  //   DELETE /api/products/:id/data/:filename
  // ------------------------------------------------------------------
  app.get("/api/products/:id/data", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const dir = resolveInProduct(cfg.id, cfg.data.dir);
    if (!fs.existsSync(dir)) return res.json({ files: [], dir });
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => {
          const stat = fs.statSync(path.join(dir, e.name));
          return { name: e.name, size: stat.size, modified: stat.mtime.toISOString() };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ files, dir });
    } catch (err) {
      console.error("data list error:", err);
      res.status(500).json({ error: "Could not list data directory" });
    }
  });

  app.get("/api/products/:id/data/:filename", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const { filename } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    const filePath = resolveInProduct(cfg.id, path.join(cfg.data.dir, filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.download(filePath, filename);
  });

  app.post(
    "/api/products/:id/data/:filename",
    express.raw({ type: "*/*", limit: "500mb" }),
    (req, res) => {
      const cfg = product(req, res); if (!cfg) return;
      const { filename } = req.params;
      if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
      const dir = resolveInProduct(cfg.id, cfg.data.dir);
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, req.body as Buffer);
        res.json({ success: true, filename, size: fs.statSync(filePath).size });
      } catch (err) {
        console.error("data upload error:", err);
        res.status(500).json({ error: "Could not write file" });
      }
    }
  );

  app.delete("/api/products/:id/data/:filename", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const { filename } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    const filePath = resolveInProduct(cfg.id, path.join(cfg.data.dir, filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Could not delete file" });
    }
  });

  // ------------------------------------------------------------------
  // Open the product's data file or results folder with the OS default app.
  //   POST /api/products/:id/open-data
  //   POST /api/products/:id/open-results
  // ------------------------------------------------------------------
  function osOpen(target: string) {
    exec(`start "" "${path.normalize(target)}"`, (err: Error | null) => {
      if (err) console.error("os-open error:", err.message);
    });
  }
  app.post("/api/products/:id/open-data", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const rel = cfg.data.file ?? cfg.data.dir;
    osOpen(resolveInProduct(cfg.id, rel));
    res.json({ success: true });
  });
  app.post("/api/products/:id/open-results", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    osOpen(resolveInProduct(cfg.id, cfg.results.dir));
    res.json({ success: true });
  });

  // ------------------------------------------------------------------
  // Results — CSV financial summary (kind: "csv-summary")
  //   GET /api/products/:id/results/summary
  // Reads the two CSVs named in results.files ([metrics, summary]) from
  // results.dir and returns them parsed.
  // ------------------------------------------------------------------
  app.get("/api/products/:id/results/summary", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    try {
      const [metricsName, summaryName] = cfg.results.files;
      const result: Record<string, unknown> = {};
      if (metricsName) {
        const f = resolveInProduct(cfg.id, path.join(cfg.results.dir, metricsName));
        if (fs.existsSync(f)) result.metrics = parseCSV(fs.readFileSync(f, "utf-8"));
      }
      if (summaryName) {
        const f = resolveInProduct(cfg.id, path.join(cfg.results.dir, summaryName));
        if (fs.existsSync(f)) result.summary = parseCSV(fs.readFileSync(f, "utf-8"));
      }
      res.json(result);
    } catch (err) {
      console.error("results/summary error:", err);
      res.status(500).json({ error: "Could not read financial summary" });
    }
  });

  // ------------------------------------------------------------------
  // Assumptions — multi-sheet XLSX workbook (kind: "xlsx-sheets")
  //   GET    /api/products/:id/assumptions/sheets
  //   GET    /api/products/:id/assumptions/download
  //   GET    /api/products/:id/assumptions/sheet/:sheetName
  //   POST   /api/products/:id/assumptions/sheet/:sheetName  { headers, rows }
  //   POST   /api/products/:id/assumptions/sheets            { sheetName }
  //   DELETE /api/products/:id/assumptions/sheet/:sheetName
  // ------------------------------------------------------------------

  // Resolve the workbook path from the manifest; 404s if not configured/missing.
  function assumptionsWorkbook(cfg: ProductConfig, res: Response): string | null {
    if (!cfg.assumptions.file) { res.status(404).json({ error: "No assumptions workbook configured" }); return null; }
    const file = resolveInProduct(cfg.id, cfg.assumptions.file);
    if (!fs.existsSync(file)) { res.status(404).json({ error: "Assumptions file not found", path: file }); return null; }
    return file;
  }

  app.get("/api/products/:id/assumptions/sheets", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const file = assumptionsWorkbook(cfg, res); if (!file) return;
    try {
      res.json({ sheets: XLSX.readFile(file).SheetNames });
    } catch (err) {
      console.error("assumptions/sheets error:", err);
      res.status(500).json({ error: "Could not read assumptions file" });
    }
  });

  app.get("/api/products/:id/assumptions/download", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const file = assumptionsWorkbook(cfg, res); if (!file) return;
    res.download(file, path.basename(file));
  });

  app.get("/api/products/:id/assumptions/sheet/:sheetName", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const file = assumptionsWorkbook(cfg, res); if (!file) return;
    const sheetName = decodeURIComponent(req.params.sheetName);
    try {
      const ws = XLSX.readFile(file).Sheets[sheetName];
      if (!ws) return res.status(404).json({ error: "Sheet not found" });
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
      res.json({ sheetName, headers: (data[0] as string[]) ?? [], rows: data.slice(1) as string[][] });
    } catch (err) {
      console.error("assumptions/sheet GET error:", err);
      res.status(500).json({ error: "Could not read sheet" });
    }
  });

  app.post("/api/products/:id/assumptions/sheet/:sheetName", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const file = assumptionsWorkbook(cfg, res); if (!file) return;
    const sheetName = decodeURIComponent(req.params.sheetName);
    const { headers, rows } = req.body as { headers: string[]; rows: string[][] };
    if (!Array.isArray(headers) || !Array.isArray(rows)) return res.status(400).json({ error: "headers and rows arrays are required" });
    try {
      const wb = XLSX.readFile(file);
      wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      if (!wb.SheetNames.includes(sheetName)) wb.SheetNames.push(sheetName);
      XLSX.writeFile(wb, file);
      res.json({ success: true, sheetName });
    } catch (err) {
      console.error("assumptions/sheet POST error:", err);
      res.status(500).json({ error: "Could not save sheet" });
    }
  });

  app.post("/api/products/:id/assumptions/sheets", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const file = assumptionsWorkbook(cfg, res); if (!file) return;
    const { sheetName } = req.body as { sheetName?: string };
    if (!sheetName || typeof sheetName !== "string" || !sheetName.trim()) return res.status(400).json({ error: "sheetName is required" });
    const name = sheetName.trim();
    try {
      const wb = XLSX.readFile(file);
      if (wb.SheetNames.includes(name)) return res.status(409).json({ error: "Sheet already exists" });
      wb.Sheets[name] = XLSX.utils.aoa_to_sheet([[]]);
      wb.SheetNames.push(name);
      XLSX.writeFile(wb, file);
      res.json({ success: true, sheetName: name });
    } catch (err) {
      console.error("assumptions/sheets POST error:", err);
      res.status(500).json({ error: "Could not create sheet" });
    }
  });

  app.delete("/api/products/:id/assumptions/sheet/:sheetName", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const file = assumptionsWorkbook(cfg, res); if (!file) return;
    const sheetName = decodeURIComponent(req.params.sheetName);
    try {
      const wb = XLSX.readFile(file);
      if (!wb.SheetNames.includes(sheetName)) return res.status(404).json({ error: "Sheet not found" });
      if (wb.SheetNames.length === 1) return res.status(400).json({ error: "Cannot delete the only sheet" });
      wb.SheetNames = wb.SheetNames.filter((s) => s !== sheetName);
      delete wb.Sheets[sheetName];
      XLSX.writeFile(wb, file);
      res.json({ success: true });
    } catch (err) {
      console.error("assumptions/sheet DELETE error:", err);
      res.status(500).json({ error: "Could not delete sheet" });
    }
  });

  // ------------------------------------------------------------------
  // Results — multi-file XLSX tree (kind: "xlsx-tree")
  //   GET /api/products/:id/results                       — list .xlsx files
  //   GET /api/products/:id/results/:filename/download
  //   GET /api/products/:id/results/:filename/sheets
  //   GET /api/products/:id/results/:filename/sheet/:s
  // ------------------------------------------------------------------
  app.get("/api/products/:id/results", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const dir = resolveInProduct(cfg.id, cfg.results.dir);
    if (!fs.existsSync(dir)) return res.json({ files: [] });
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.(xlsx|xls)$/i.test(e.name))
        .map((e) => {
          const stat = fs.statSync(path.join(dir, e.name));
          return { name: e.name, size: stat.size, modified: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));
      res.json({ files });
    } catch (err) {
      console.error("results list error:", err);
      res.status(500).json({ error: "Could not list results directory" });
    }
  });

  app.get("/api/products/:id/results/:filename/download", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const { filename } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    const filePath = resolveInProduct(cfg.id, path.join(cfg.results.dir, filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.download(filePath, filename);
  });

  app.get("/api/products/:id/results/:filename/sheets", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const { filename } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    const filePath = resolveInProduct(cfg.id, path.join(cfg.results.dir, filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    try {
      res.json({ filename, sheets: XLSX.readFile(filePath).SheetNames });
    } catch (err) {
      console.error("results sheets error:", err);
      res.status(500).json({ error: "Could not read Excel file" });
    }
  });

  app.get("/api/products/:id/results/:filename/sheet/:sheetName", (req, res) => {
    const cfg = product(req, res); if (!cfg) return;
    const { filename, sheetName } = req.params;
    if (!isSafeFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
    const decodedSheet = decodeURIComponent(sheetName);
    const filePath = resolveInProduct(cfg.id, path.join(cfg.results.dir, filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    try {
      const ws = XLSX.readFile(filePath).Sheets[decodedSheet];
      if (!ws) return res.status(404).json({ error: "Sheet not found" });
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
      res.json({ filename, sheetName: decodedSheet, headers: (data[0] as string[]) ?? [], rows: data.slice(1) as string[][] });
    } catch (err) {
      console.error("results sheet error:", err);
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
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:3b";

  // Default corpus to "train" on: docs + model scripts across the projects.
  // Only paths that actually exist are kept. All relative to EDITOR_ROOT.
  function defaultIndexSources(): string[] {
    const candidates = [
      "UL/docs", "UL/ulp_model", "UL/app",
      "VA/docs",
      "Updated-FIA-Validation-Tool-UI/docs",
    ];
    return candidates.filter((rel) => {
      try { return fs.existsSync(path.resolve(EDITOR_ROOT, rel)); } catch { return false; }
    });
  }

  // GET /api/local-llm/status — check if Ollama is reachable and list models
  app.get("/api/local-llm/status", async (_req: any, res: any) => {
    try {
      const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return res.status(502).json({ running: false, error: "Ollama returned non-OK" });
      const data = await r.json() as { models: { name: string }[] };
      const models = (data.models ?? []).map((m: { name: string }) => m.name);
      res.json({
        running: true, models, activeModel: OLLAMA_MODEL,
        embedModel: EMBED_MODEL,
        embedModelReady: models.some((m) => m.startsWith(EMBED_MODEL)),
        index: indexStatus(),
      });
    } catch {
      res.status(502).json({ running: false, error: "Ollama not reachable — run: ollama serve", index: indexStatus() });
    }
  });

  // GET /api/local-llm/index/status — describe the current RAG index
  app.get("/api/local-llm/index/status", (_req: any, res: any) => {
    res.json({ ...indexStatus(), defaultSources: defaultIndexSources() });
  });

  // POST /api/local-llm/index — (re)build the RAG index. Streams progress as SSE.
  // Body: { sources?: string[], embedModel?: string }
  app.post("/api/local-llm/index", async (req: any, res: any) => {
    const { sources, embedModel } = req.body as { sources?: string[]; embedModel?: string };
    const roots = (sources?.length ? sources : defaultIndexSources())
      .map((s) => String(s).replace(/^[/\\]+/, ""));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    const send = (p: BuildProgress) => res.write(`data: ${JSON.stringify(p)}\n\n`);

    try {
      await buildIndex(EDITOR_ROOT, roots, embedModel ?? EMBED_MODEL, send);
      invalidateCache();
    } catch (err) {
      send({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });

  // POST /api/local-llm/chat — streaming chat completions via Ollama, grounded
  // in the RAG index and any attached / target files.
  // Body: { message, code?, filename?, language?, model?,
  //         useRag?, targetFile?, attachments?: [{ name, content }] }
  app.post("/api/local-llm/chat", async (req: any, res: any) => {
    const {
      message, code, filename, language, model,
      useRag = true, targetFile, attachments = [],
    } = req.body as {
      message: string; code?: string; filename?: string;
      language?: string; model?: string;
      useRag?: boolean; targetFile?: string;
      attachments?: { name: string; content: string }[];
    };
    if (!message) return res.status(400).json({ error: "message required" });

    const useModel = model ?? OLLAMA_MODEL;

    // ---- Retrieve grounding context from the index ----
    // Keep this small: on CPU, a big prompt means slow/never-arriving first token.
    let retrieved: RetrievedChunk[] = [];
    const ragTopK = Number(process.env.OLLAMA_RAG_TOPK ?? 3);
    if (useRag && indexStatus().exists) {
      try { retrieved = await retrieve(message, ragTopK); } catch { /* fall back to no-RAG */ }
    }

    const systemPrompt =
      "You are an expert coding assistant embedded in the FIA / actuarial model validation tool. " +
      "You are given excerpts from THIS project's documentation and source code as CONTEXT. " +
      "Base your answer on that context and follow the existing logic, naming, and conventions. " +
      "When asked to change a file, return the exact, complete code for the relevant section in a code block. " +
      "If the context does not cover something, say so rather than inventing APIs. Be concise." +
      (filename ? ` The user is currently editing "${filename}" (${language ?? "code"}).` : "") +
      (targetFile ? ` The user wants to UPDATE the file "${targetFile}" — scope your code suggestions to that file.` : "");

    // ---- Assemble the user turn: context + attachments + current/target file + question ----
    const parts: string[] = [];

    if (retrieved.length) {
      parts.push(
        "### CONTEXT — relevant excerpts from this project\n" +
        retrieved
          .map((c) => {
            const txt = c.text.length > 1500 ? c.text.slice(0, 1500) + "\n…" : c.text;
            return `From ${c.source} (lines ${c.startLine}-${c.endLine}):\n\`\`\`\n${txt}\n\`\`\``;
          })
          .join("\n\n"),
      );
    }

    for (const att of attachments) {
      if (!att?.content) continue;
      const trimmed = att.content.length > 12_000 ? att.content.slice(0, 12_000) + "\n…(truncated)" : att.content;
      parts.push(`### ATTACHED FILE: ${att.name}\n\`\`\`\n${trimmed}\n\`\`\``);
    }

    if (code?.trim()) {
      const label = targetFile && targetFile === filename ? `TARGET FILE (to update): ${filename}` : `CURRENT FILE: ${filename ?? ""}`;
      parts.push(`### ${label}\n\`\`\`${language ?? ""}\n${code}\n\`\`\``);
    }

    parts.push(`### REQUEST\n${message}`);
    const userContent = parts.join("\n\n");

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
          // Keep the model resident in RAM so it isn't reloaded (slow on CPU)
          // between prompts. Cap output and context to keep responses snappy.
          keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "30m",
          options: {
            num_predict: Number(process.env.OLLAMA_NUM_PREDICT ?? 768),
            num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 4096),
            temperature: 0.1,
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS ?? 600000)),
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
