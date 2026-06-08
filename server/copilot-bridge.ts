/**
 * copilot-bridge.ts
 *
 * Manages a single @github/copilot-language-server child process and bridges
 * every WebSocket connection (at /ws/copilot-lsp) to it via stdio.
 *
 * LSP uses Content-Length–framed JSON-RPC over stdio.
 * The WebSocket side exchanges raw JSON-RPC strings (no framing).
 *
 * Auth flow (device code, initiated by the frontend):
 *   1. Frontend sends {"method":"signInInitiate",...}
 *   2. LSP returns {userCode, verificationUri}
 *   3. Frontend shows the code to the user
 *   4. Frontend sends {"method":"signInConfirm","params":{"userCode":"..."}}
 *   5. LSP confirms; Copilot completions start working
 */

import { spawn, type ChildProcess } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";

function getLSPPath(): string {
  // Resolve relative to cwd (project root) — works in both ESM and CJS bundles.
  const candidate = path.join(
    process.cwd(),
    "node_modules",
    "@github",
    "copilot-language-server",
    "dist",
    "main.js",
  );
  if (!fs.existsSync(candidate)) {
    throw new Error(`@github/copilot-language-server not found at ${candidate}`);
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// LSP message framing helpers
// ---------------------------------------------------------------------------

class LSPReader {
  private buf = "";

  /** Feed raw bytes from LSP stdout; returns complete JSON-RPC payloads. */
  feed(chunk: Buffer | string): string[] {
    this.buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const out: string[] = [];
    while (true) {
      const sep = this.buf.indexOf("\r\n\r\n");
      if (sep === -1) break;
      const header = this.buf.slice(0, sep);
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { this.buf = ""; break; }
      const len = parseInt(m[1], 10);
      const bodyStart = sep + 4;
      if (this.buf.length < bodyStart + len) break;
      out.push(this.buf.slice(bodyStart, bodyStart + len));
      this.buf = this.buf.slice(bodyStart + len);
    }
    return out;
  }
}

function frame(json: string): Buffer {
  const body = Buffer.from(json, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

// ---------------------------------------------------------------------------
// LSP process lifecycle
// ---------------------------------------------------------------------------

let lsp: ChildProcess | null = null;
let lspReady = false;
const clients = new Set<WebSocket>();
let lspReader = new LSPReader();

function startLSP() {
  if (lsp) return;
  let lspPath: string;
  try { lspPath = getLSPPath(); }
  catch (e) { console.error("[CopilotLSP] package not found:", e); return; }

  console.log("[CopilotLSP] starting", lspPath);
  lsp = spawn("node", [lspPath, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
  lspReader = new LSPReader();

  lsp.stdout?.on("data", (chunk: Buffer) => {
    const messages = lspReader.feed(chunk);
    for (const msg of messages) {
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    }
  });

  lsp.stderr?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log("[CopilotLSP]", line);
  });

  lsp.on("exit", (code) => {
    console.log(`[CopilotLSP] exited (code ${code})`);
    lsp = null;
    lspReady = false;
    // Notify clients
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          method: "$/copilot/lspStatus",
          params: { status: "stopped" },
        }));
      }
    }
  });

  lspReady = true;
}

// ---------------------------------------------------------------------------
// Public: attach to a WebSocketServer
// ---------------------------------------------------------------------------

export function initCopilotBridge(wss: WebSocketServer) {
  startLSP();

  wss.on("connection", (ws: WebSocket) => {
    clients.add(ws);

    if (!lsp) {
      // Try to restart if it died
      startLSP();
    }

    ws.on("message", (data: Buffer) => {
      if (lsp?.stdin?.writable) {
        lsp.stdin.write(frame(data.toString("utf8")));
      }
    });

    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });
}

export function getLSPStatus() {
  return { running: lsp !== null, ready: lspReady, clients: clients.size };
}
