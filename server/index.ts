import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { initCopilotBridge } from "./copilot-bridge";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// High-frequency / streaming endpoints we don't want flooding the terminal.
const QUIET_PATHS = [
  "/api/local-llm/status",
  "/api/local-llm/index/status",
  "/api/local-llm/chat",
  "/api/local-llm/index",
  "/api/code-editor/tree",
];
// Set DEBUG_HTTP=1 to restore full per-request logging (incl. response bodies).
const DEBUG_HTTP = process.env.DEBUG_HTTP === "1";

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (DEBUG_HTTP) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;
    const duration = Date.now() - start;
    // By default keep the terminal calm: skip chatty/streaming paths and only
    // surface errors or genuinely slow calls. Use DEBUG_HTTP=1 for everything.
    if (!DEBUG_HTTP) {
      const isQuiet = QUIET_PATHS.some((p) => path.startsWith(p));
      if (isQuiet && res.statusCode < 400 && duration < 2000) return;
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
      return;
    }
    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
    if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
    log(logLine);
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Copilot LSP — WebSocket bridge at /ws/copilot-lsp
  const copilotWss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url === "/ws/copilot-lsp") {
      copilotWss.handleUpgrade(req, socket as any, head, (ws) => {
        copilotWss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });
  initCopilotBridge(copilotWss);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = Number(process.env.PORT || "3000");
  httpServer.listen(port, () => {   console.log(`Server running on   http://localhost:${port}`);
  });
  })();
