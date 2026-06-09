/**
 * CodeEditorPanel — full-screen VS Code-like editor
 *
 * Features added/changed:
 *   - File tree now rooted at C:\projects (all projects visible)
 *   - GitHub account management: PAT, device-code flow, OAuth browser popup
 *   - "Open in new window" button (opens /code-editor standalone)
 *   - `standalone` prop: when true, panel fills the full viewport (no ribbon offset)
 */

import React, {
  useState, useEffect, useCallback, useRef,
} from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as MonacoNS from "monaco-editor";
import {
  X, FolderOpen, Folder as FolderIcon, ChevronRight, ChevronDown,
  Save, RefreshCw, Loader2, AlertCircle, Bot,
  FilePlus, FolderPlus, Trash2, Settings,
  ExternalLink, Copy, Check, LogOut, User,
  Paperclip, Upload, Database, Sparkles, FileText, Target,
} from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Language + icon helpers
// ---------------------------------------------------------------------------

const LANG_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
  ".py": "python", ".json": "json", ".jsonc": "json",
  ".md": "markdown", ".css": "css", ".scss": "scss",
  ".html": "html", ".htm": "html",
  ".yaml": "yaml", ".yml": "yaml",
  ".sh": "shell", ".bash": "shell", ".ps1": "powershell",
  ".sql": "sql", ".xml": "xml", ".toml": "ini",
  ".txt": "plaintext", ".env": "plaintext",
};

const ICON_MAP: Record<string, string> = {
  ".ts": "🔷", ".tsx": "⚛️", ".js": "🟨", ".jsx": "⚛️",
  ".py": "🐍", ".json": "📋", ".md": "📝",
  ".css": "🎨", ".scss": "🎨", ".html": "🌐",
  ".yaml": "⚙️", ".yml": "⚙️", ".sh": "📜", ".env": "🔐",
  ".sql": "🗃️", ".xml": "📄",
};

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}
function getLang(name: string) { return LANG_MAP[ext(name)] ?? "plaintext"; }
function getIcon(name: string) { return ICON_MAP[ext(name)] ?? "📄"; }

/** Flatten a file tree into a sorted list of file paths (directories omitted). */
function flattenFiles(nodes: FsNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === "file") acc.push(n.path);
    else if (n.children) flattenFiles(n.children, acc);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FsNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FsNode[];
  size?: number;
}

interface Tab {
  path: string;
  content: string;
  saved: string;
  lang: string;
}

interface ChatMsg { role: "user" | "assistant"; text: string; }

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiTree(): Promise<FsNode[]> {
  const r = await fetch("/api/code-editor/tree");
  return (await r.json()).tree ?? [];
}
async function apiRead(path: string): Promise<string> {
  const r = await fetch(`/api/code-editor/file?path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new Error((await r.json()).error ?? "Read failed");
  return (await r.json()).content;
}
async function apiSave(path: string, content: string) {
  const r = await fetch("/api/code-editor/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? "Save failed");
}
async function apiCreate(path: string, isDir: boolean) {
  const r = await fetch("/api/code-editor/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, isDir }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? "Create failed");
}
async function apiDelete(path: string) {
  const r = await fetch(`/api/code-editor/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  if (!r.ok) throw new Error((await r.json()).error ?? "Delete failed");
}

// ---------------------------------------------------------------------------
// Copilot LSP client
// ---------------------------------------------------------------------------

type CopilotStatus = "off" | "connecting" | "authenticating" | "ready";

class CopilotClient {
  private ws: WebSocket | null = null;
  private id = 0;
  private pending = new Map<number, { ok: (v: any) => void; err: (e: any) => void }>();
  private initId = -1;
  private docVersions = new Map<string, number>();

  onStatus: (s: CopilotStatus) => void = () => {};
  onAuthInfo: (info: { userCode: string; verificationUri: string } | null) => void = () => {};

  connect() {
    if (this.ws) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.onStatus("connecting");
    this.ws = new WebSocket(`${proto}//${location.host}/ws/copilot-lsp`);

    this.ws.onopen = () => {
      const id = ++this.id;
      this.initId = id;
      this._send({
        jsonrpc: "2.0", id, method: "initialize",
        params: {
          processId: null,
          clientInfo: { name: "FIA-Validation-Tool", version: "1.0" },
          rootUri: null,
          capabilities: { textDocument: { synchronization: {}, completion: {} } },
          initializationOptions: {},
        },
      });
    };

    this.ws.onmessage = ({ data }) => {
      let msg: any;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { ok, err } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) err(new Error(msg.error.message ?? String(msg.error)));
        else ok(msg.result);
        if (msg.id === this.initId) {
          this._send({ jsonrpc: "2.0", method: "initialized", params: {} });
          this.onStatus("authenticating");
        }
        return;
      }
      if (msg.method === "window/logMessage") {
        const text: string = msg.params?.message ?? "";
        if (/authenticated|signed in/i.test(text)) {
          this.onStatus("ready");
          this.onAuthInfo(null);
        }
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.onStatus("off");
      this.pending.forEach(({ err }) => err(new Error("WebSocket closed")));
      this.pending.clear();
    };

    this.ws.onerror = () => { this.ws?.close(); };
  }

  private _send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  request<T = any>(method: string, params?: any): Promise<T> {
    const id = ++this.id;
    return new Promise((ok, err) => {
      this.pending.set(id, { ok, err });
      this._send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params?: any) {
    this._send({ jsonrpc: "2.0", method, params });
  }

  openDoc(path: string, content: string, lang: string) {
    const uri = `file:///${path.replace(/\\/g, "/")}`;
    const version = 1;
    this.docVersions.set(uri, version);
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: lang, version, text: content },
    });
  }
  changeDoc(path: string, content: string) {
    const uri = `file:///${path.replace(/\\/g, "/")}`;
    const version = (this.docVersions.get(uri) ?? 0) + 1;
    this.docVersions.set(uri, version);
    this.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    });
  }
  closeDoc(path: string) {
    const uri = `file:///${path.replace(/\\/g, "/")}`;
    this.docVersions.delete(uri);
    this.notify("textDocument/didClose", { textDocument: { uri } });
  }

  async signInInitiate(): Promise<{ userCode: string; verificationUri: string }> {
    return this.request("signInInitiate", {});
  }
  async signInConfirm(userCode: string) {
    return this.request("signInConfirm", { userCode });
  }
  async checkStatus() {
    return this.request("checkStatus", {});
  }

  async getCompletions(filePath: string, content: string, line: number, character: number): Promise<string[]> {
    const uri = `file:///${filePath.replace(/\\/g, "/")}`;
    try {
      const res = await this.request<any>("getCompletions", {
        doc: {
          uri, source: content,
          tabSize: 2, indentSize: 2, insertSpaces: true,
          path: filePath, relativePath: filePath,
          languageId: getLang(filePath),
          position: { line, character },
          version: this.docVersions.get(uri) ?? 1,
        },
      });
      return (res?.completions ?? []).map((c: any) => c.text ?? c.displayText ?? "") as string[];
    } catch { return []; }
  }

  disconnect() { this.ws?.close(); }
}

// ---------------------------------------------------------------------------
// File tree node component
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: FsNode;
  depth: number;
  expanded: Set<string>;
  activeFile: string | null;
  onToggle(path: string): void;
  onOpen(node: FsNode): void;
  onContext(e: React.MouseEvent, node: FsNode): void;
}

function TreeNode({ node, depth, expanded, activeFile, onToggle, onOpen, onContext }: TreeNodeProps) {
  const isOpen = expanded.has(node.path);
  const isActive = activeFile === node.path;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 py-[2px] cursor-pointer select-none text-xs group",
          "hover:bg-[#2a2d2e]",
          isActive && "bg-[#094771] hover:bg-[#094771]",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => node.type === "directory" ? onToggle(node.path) : onOpen(node)}
        onContextMenu={(e) => { e.preventDefault(); onContext(e, node); }}
      >
        {node.type === "directory" ? (
          <>
            {isOpen
              ? <ChevronDown className="h-3 w-3 shrink-0 text-[#c5c5c5]" />
              : <ChevronRight className="h-3 w-3 shrink-0 text-[#c5c5c5]" />}
            {isOpen
              ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />
              : <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <span className="text-[11px] shrink-0">{getIcon(node.name)}</span>
          </>
        )}
        <span className={cn("truncate", node.type === "directory" ? "text-[#c5c5c5]" : "text-[#d4d4d4]")}>
          {node.name}
        </span>
      </div>

      {node.type === "directory" && isOpen && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          activeFile={activeFile}
          onToggle={onToggle}
          onOpen={onOpen}
          onContext={onContext}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// GitHub Auth Modal
// ---------------------------------------------------------------------------

type AuthMethod = "login" | "pat" | "device" | "oauth" | "app-settings";

// Keys for localStorage GitHub App credentials
const LS_CLIENT_ID = "github_client_id";
const LS_CLIENT_SECRET = "github_client_secret";

interface GitHubAuthModalProps {
  onClose(): void;
  onAuthenticated(token: string, user: GitHubUser): void;
}

function GitHubAuthModal({ onClose, onAuthenticated }: GitHubAuthModalProps) {
  const [method, setMethod] = useState<AuthMethod>("login");
  // login tab state
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loginError, setLoginError] = useState<"invalid_password" | "invalid_token" | null>(null);
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<{
    device_code: string; user_code: string; verification_uri: string; interval: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // GitHub OAuth App credentials — editable in the "App Settings" tab
  const [clientId, setClientId] = useState(() => localStorage.getItem(LS_CLIENT_ID) ?? "");
  const [clientSecret, setClientSecret] = useState(() => localStorage.getItem(LS_CLIENT_SECRET) ?? "");
  const [appSaved, setAppSaved] = useState(false);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  function saveAppSettings() {
    localStorage.setItem(LS_CLIENT_ID, clientId.trim());
    localStorage.setItem(LS_CLIENT_SECRET, clientSecret.trim());
    setAppSaved(true);
    setTimeout(() => setAppSaved(false), 2000);
  }

  async function validateToken(token: string) {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/github/auth/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Invalid token");
      const { user } = await r.json();
      onAuthenticated(token, user as GitHubUser);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Authentication failed");
    } finally { setLoading(false); }
  }

  async function startDeviceFlow() {
    const cid = localStorage.getItem(LS_CLIENT_ID) || clientId;
    if (!cid) { setErr("Enter your GitHub Client ID in the App Settings tab first."); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/github/auth/device/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: cid }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Device flow failed");
      setDeviceInfo(data);
      schedulePoll(data.device_code, cid, data.interval ?? 5);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to start device flow");
    } finally { setLoading(false); }
  }

  function schedulePoll(device_code: string, cid: string, interval: number) {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/github/auth/device/poll", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code, client_id: cid }),
        });
        const data = await r.json();
        if (data.access_token) {
          await validateToken(data.access_token);
        } else if (data.error === "authorization_pending" || data.error === "slow_down") {
          schedulePoll(device_code, cid, data.error === "slow_down" ? interval + 5 : interval);
        } else {
          setErr(`Device flow error: ${data.error ?? "unknown"}`);
          setDeviceInfo(null);
        }
      } catch { schedulePoll(device_code, cid, interval); }
    }, interval * 1000);
  }

  async function startOAuthPopup() {
    const cid = localStorage.getItem(LS_CLIENT_ID) || clientId;
    const csec = localStorage.getItem(LS_CLIENT_SECRET) || clientSecret;
    if (!cid) { setErr("Enter your GitHub Client ID in the App Settings tab first."); return; }
    if (!csec) { setErr("Enter your GitHub Client Secret in the App Settings tab first."); return; }
    setErr("");
    try {
      const r = await fetch("/api/github/auth/oauth/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: cid, client_secret: csec }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const { url } = await r.json();
      const popup = window.open(url, "github-oauth", "width=620,height=740,popup=yes");
      if (!popup) throw new Error("Popup blocked — allow popups and try again");
      const handler = (e: MessageEvent) => {
        if (e.data?.type === "github-auth" && e.data.token) {
          window.removeEventListener("message", handler);
          validateToken(e.data.token);
          popup.close();
        }
      };
      window.addEventListener("message", handler);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "OAuth failed");
    }
  }

  function copyCode() {
    if (deviceInfo?.user_code) {
      navigator.clipboard.writeText(deviceInfo.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const methods: { id: AuthMethod; label: string }[] = [
    { id: "login", label: "Sign In" },
    { id: "pat", label: "Token" },
    { id: "device", label: "Device Code" },
    { id: "oauth", label: "Browser" },
    { id: "app-settings", label: "⚙ App" },
  ];

  async function handleLogin() {
    if (!loginUser.trim() || !loginPass.trim()) return;
    setLoading(true); setErr(""); setLoginError(null);
    // GitHub no longer accepts plain passwords via the API (deprecated Aug 2021).
    // We try the supplied value as a PAT first; if it fails we show a helpful message.
    try {
      const r = await fetch("/api/github/auth/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: loginPass.trim() }),
      });
      if (r.ok) {
        const { user } = await r.json();
        // Verify the username matches (optional safety check)
        if (user.login.toLowerCase() !== loginUser.trim().toLowerCase()) {
          setErr(`Token belongs to @${user.login}, not @${loginUser.trim()}.`);
          return;
        }
        onAuthenticated(loginPass.trim(), user as GitHubUser);
      } else {
        // If the value looks like a raw password (no ghp_/github_pat prefix), surface a specific guide
        const looksLikePAT = /^(ghp_|github_pat_|gho_|ghs_)/i.test(loginPass.trim());
        setLoginError(looksLikePAT ? "invalid_token" : "invalid_password");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Authentication failed");
    } finally { setLoading(false); }
  }

  const hasAppCreds = !!(localStorage.getItem(LS_CLIENT_ID));

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-lg w-full max-w-sm mx-6" style={{ background: "#252526", border: "1px solid #3c3c3c" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#3c3c3c" }}>
          <div className="flex items-center gap-2">
            <GithubIcon className="h-5 w-5 text-white" />
            <span className="text-sm font-semibold text-white">Sign in to GitHub</span>
          </div>
          <button onClick={onClose} className="text-[#969696] hover:text-white rounded p-0.5 hover:bg-[#3c3c3c]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Method tabs */}
        <div className="flex gap-1 p-3 pb-0">
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMethod(m.id); setErr(""); setLoginError(null); setDeviceInfo(null); }}
              className={cn(
                "flex-1 py-1.5 rounded text-[11px] font-medium transition-colors",
                method === m.id ? "text-white" : "text-[#969696] hover:text-[#c5c5c5]",
              )}
              style={{ background: method === m.id ? "#007acc" : "#1e1e1e" }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {err && (
            <div className="flex gap-2 items-start p-2 rounded text-xs text-red-300" style={{ background: "#3c1515", border: "1px solid #7c2d2d" }}>
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {/* ── Sign In (username + password/token) ── */}
          {method === "login" && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-[#969696] mb-1">GitHub username or email</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="octocat"
                  value={loginUser}
                  onChange={(e) => { setLoginUser(e.target.value); setLoginError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full px-3 py-2 rounded text-xs text-white outline-none"
                  style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#969696] mb-1">Password / Personal Access Token</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••••••••••••••"
                    value={loginPass}
                    onChange={(e) => { setLoginPass(e.target.value); setLoginError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className="w-full px-3 py-2 pr-10 rounded text-xs text-white outline-none"
                    style={{ background: "#3c3c3c", border: loginError ? "1px solid #7c2d2d" : "1px solid #5c5c5c" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5c5c5c] hover:text-[#969696] text-[10px]"
                  >
                    {showPass ? "hide" : "show"}
                  </button>
                </div>
              </div>

              {/* Contextual error messages */}
              {loginError === "invalid_password" && (
                <div className="p-2.5 rounded text-[11px] space-y-1.5" style={{ background: "#2d1a00", border: "1px solid #7c4400" }}>
                  <p className="text-amber-300 font-semibold">GitHub no longer accepts plain passwords via the API.</p>
                  <p className="text-[#969696]">Use a <strong className="text-white">Personal Access Token</strong> as your password instead:</p>
                  <ol className="list-decimal list-inside text-[#969696] space-y-0.5 leading-relaxed">
                    <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer" className="text-blue-400 underline">github.com/settings/tokens/new</a></li>
                    <li>Name it, set <em>No expiration</em>, tick <em>repo</em> + <em>read:user</em></li>
                    <li>Click <em>Generate token</em> and paste it above</li>
                  </ol>
                </div>
              )}

              {loginError === "invalid_token" && (
                <div className="p-2.5 rounded text-[11px] text-red-300" style={{ background: "#3c1515", border: "1px solid #7c2d2d" }}>
                  Token rejected by GitHub — check it hasn't expired and has <em>repo</em> + <em>read:user</em> scopes.
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={!loginUser.trim() || !loginPass.trim() || loading}
                className="w-full py-2 rounded text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "#238636" }}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GithubIcon className="h-3.5 w-3.5" />}
                {loading ? "Signing in…" : "Sign in"}
              </button>

              <p className="text-center text-[10px] text-[#5c5c5c]">
                Don't have a token?{" "}
                <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer" className="text-blue-400 underline">
                  Create one on GitHub
                </a>
              </p>
            </div>
          )}

          {/* ── Personal Access Token ── */}
          {method === "pat" && (
            <>
              <p className="text-[11px] text-[#969696]">
                Create a token at <span className="text-blue-400">github.com → Settings → Developer settings → Personal access tokens</span>
              </p>
              <input
                type="password"
                autoFocus
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && validateToken(pat)}
                className="w-full px-3 py-2 rounded text-xs text-white outline-none"
                style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
              />
              <button
                onClick={() => validateToken(pat)}
                disabled={!pat.trim() || loading}
                className="w-full py-2 rounded text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "#007acc" }}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {loading ? "Verifying…" : "Connect with token"}
              </button>
            </>
          )}

          {/* ── Device code flow ── */}
          {method === "device" && (
            <>
              {!hasAppCreds && (
                <div className="flex gap-2 items-start p-2 rounded text-xs text-amber-300" style={{ background: "#2d2000", border: "1px solid #5c4000" }}>
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Set your GitHub Client ID in the <button className="underline" onClick={() => setMethod("app-settings")}>App Settings</button> tab first.</span>
                </div>
              )}
              {!deviceInfo ? (
                <>
                  <p className="text-xs text-[#969696]">
                    GitHub shows a one-time code you enter at <span className="text-blue-400">github.com/login/device</span> — works exactly like VS Code's "Sign in with GitHub".
                  </p>
                  <button
                    onClick={startDeviceFlow}
                    disabled={loading || !hasAppCreds}
                    className="w-full py-2 rounded text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: "#238636" }}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GithubIcon className="h-3.5 w-3.5" />}
                    {loading ? "Starting…" : "Get device code"}
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-[#969696]">
                    Open <a href={deviceInfo.verification_uri} target="_blank" rel="noreferrer" className="text-blue-400 underline">{deviceInfo.verification_uri}</a> and enter:
                  </p>
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-1 text-center text-2xl font-mono font-bold tracking-[0.3em] py-3 rounded select-all"
                      style={{ background: "#0d1117", color: "#58a6ff" }}
                    >
                      {deviceInfo.user_code}
                    </div>
                    <button onClick={copyCode} className="p-2 rounded text-[#969696] hover:text-white hover:bg-[#3c3c3c]" title="Copy code">
                      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#5c5c5c]">
                    <Loader2 className="h-3 w-3 animate-spin" /> Waiting for authorization…
                  </div>
                  <button onClick={() => { if (pollRef.current) clearTimeout(pollRef.current); setDeviceInfo(null); }} className="text-xs text-[#969696] hover:text-white">
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── OAuth browser popup ── */}
          {method === "oauth" && (
            <>
              {(!localStorage.getItem(LS_CLIENT_ID) || !localStorage.getItem(LS_CLIENT_SECRET)) && (
                <div className="flex gap-2 items-start p-2 rounded text-xs text-amber-300" style={{ background: "#2d2000", border: "1px solid #5c4000" }}>
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Set your GitHub Client ID <em>and</em> Client Secret in the <button className="underline" onClick={() => setMethod("app-settings")}>App Settings</button> tab first.</span>
                </div>
              )}
              <p className="text-xs text-[#969696]">
                Opens GitHub's authorization page in a popup window. Your app credentials are sent only to your own server.
              </p>
              <button
                onClick={startOAuthPopup}
                disabled={loading}
                className="w-full py-2 rounded text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "#238636" }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Sign in with GitHub
              </button>
            </>
          )}

          {/* ── App Settings ── */}
          {method === "app-settings" && (
            <div className="space-y-3">
              <div className="p-2 rounded text-[11px] text-[#969696]" style={{ background: "#1e1e1e" }}>
                <p className="font-semibold text-[#c5c5c5] mb-1">How to create a GitHub OAuth App</p>
                <ol className="list-decimal list-inside space-y-0.5 leading-relaxed">
                  <li>Go to <span className="text-blue-400">github.com → Settings → Developer settings → OAuth Apps</span></li>
                  <li>Click <em>New OAuth App</em></li>
                  <li>Set <em>Authorization callback URL</em> to<br/><span className="text-blue-400 break-all">{window.location.origin}/api/github/auth/callback</span></li>
                  <li>Copy the <em>Client ID</em> and generate a <em>Client secret</em></li>
                </ol>
                <p className="mt-1.5 text-[#5c5c5c]">Credentials are saved in your browser only — never sent to any third party.</p>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] text-[#969696] mb-1">GitHub Client ID</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Iv1.xxxxxxxxxxxxxxxx"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3 py-2 rounded text-xs text-white outline-none font-mono"
                    style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#969696] mb-1">GitHub Client Secret <span className="text-[#5c5c5c]">(only needed for Browser Login)</span></label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••••••••••••••••••••••••••"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="w-full px-3 py-2 rounded text-xs text-white outline-none"
                    style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                  />
                </div>
              </div>

              <button
                onClick={saveAppSettings}
                disabled={!clientId.trim()}
                className="w-full py-2 rounded text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
                style={{ background: appSaved ? "#238636" : "#007acc" }}
              >
                {appSaved ? <><Check className="h-3.5 w-3.5" /> Saved!</> : "Save credentials"}
              </button>

              {clientId.trim() && (
                <p className="text-[11px] text-green-500 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Client ID configured — use the Device Code or Browser Login tabs to sign in.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onClose(): void;
  standalone?: boolean;
}

export function CodeEditorPanel({ open, onClose, standalone }: Props) {
  // ---------- file tree ----------
  const [tree, setTree] = useState<FsNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["Updated-FIA-Validation-Tool-UI", "UL"]));

  // ---------- tabs / editor ----------
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoNS | null>(null);
  const completionDispose = useRef<MonacoNS.IDisposable | null>(null);

  // ---------- copilot ----------
  const copilot = useRef<CopilotClient>(new CopilotClient());
  const [copilotStatus, setCopilotStatus] = useState<CopilotStatus>("off");
  const [authInfo, setAuthInfo] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [showCopilot, setShowCopilot] = useState(true);

  // ---------- chat ----------
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [ghToken, setGhToken] = useState(() => localStorage.getItem("gh_copilot_token") ?? "");
  const [copilotNotEnabled, setCopilotNotEnabled] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0); // seconds the current request has been running
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // ---------- prompt attachments / target file / RAG ----------
  interface Attachment { name: string; content: string; fromTree: boolean; }
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [targetFile, setTargetFile] = useState<string | null>(null);
  const [useRag, setUseRag] = useState(() => localStorage.getItem("llm_use_rag") !== "false");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachFilter, setAttachFilter] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ---------- RAG index / "training" ----------
  interface IndexStatus { exists: boolean; builtAt?: string; chunkCount?: number; sources?: string[]; defaultSources?: string[]; }
  const [indexInfo, setIndexInfo] = useState<IndexStatus>({ exists: false });
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<{ current: number; total: number; phase: string; message?: string } | null>(null);

  // ---------- AI provider settings ----------
  type AIProvider = "copilot" | "openai" | "anthropic" | "azure" | "gemini" | "ollama";
  const [aiProvider, setAiProvider] = useState<AIProvider>(
    () => (localStorage.getItem("ai_provider") as AIProvider) ?? "copilot",
  );
  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem("ai_api_key") ?? "");
  const [aiModel, setAiModel] = useState(() => localStorage.getItem("ai_model") ?? "");
  const [aiAzureEndpoint, setAiAzureEndpoint] = useState(() => localStorage.getItem("ai_azure_endpoint") ?? "");
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiSettingsSaved, setAiSettingsSaved] = useState(false);

  const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
    copilot: "GitHub Copilot",
    openai: "OpenAI",
    anthropic: "Anthropic (Claude)",
    azure: "Azure OpenAI",
    gemini: "Google Gemini",
    ollama: "Local LLM (Ollama)",
  };

  const AI_MODELS: Record<AIProvider, { value: string; label: string }[]> = {
    copilot: [{ value: "gpt-4o", label: "GPT-4o (Copilot)" }],
    openai: [
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o mini" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    ],
    anthropic: [
      { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    ],
    azure: [{ value: "", label: "Use deployment name as model" }],
    gemini: [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    ],
    ollama: [
      { value: "qwen2.5-coder:1.5b", label: "Qwen2.5 Coder 1.5B (fastest on CPU)" },
      { value: "qwen2.5-coder:3b", label: "Qwen2.5 Coder 3B (balanced — default)" },
      { value: "llama3.2:3b", label: "Llama 3.2 3B (fast, general)" },
      { value: "qwen2.5-coder:7b", label: "Qwen2.5 Coder 7B (smarter, slow on CPU)" },
      { value: "deepseek-coder:6.7b", label: "DeepSeek Coder 6.7B" },
    ],
  };

  function saveAiSettings() {
    localStorage.setItem("ai_provider", aiProvider);
    localStorage.setItem("ai_api_key", aiApiKey.trim());
    localStorage.setItem("ai_model", aiModel);
    localStorage.setItem("ai_azure_endpoint", aiAzureEndpoint.trim());
    setAiSettingsSaved(true);
    setTimeout(() => { setAiSettingsSaved(false); setShowAiSettings(false); }, 1200);
  }

  // ---------- github account ----------
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("github_user") ?? "null"); } catch { return null; }
  });
  const [showGitHubAuth, setShowGitHubAuth] = useState(false);

  // ---------- context menu ----------
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FsNode } | null>(null);

  // ---------- inline creation ----------
  const [creating, setCreating] = useState<{ type: "file" | "directory"; parent: string } | null>(null);
  const [newName, setNewName] = useState("");

  // ---------- status ----------
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const active = tabs.find((t) => t.path === activeTab) ?? null;

  // ---- load tree ----
  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try { setTree(await apiTree()); }
    catch { setError("Failed to load file tree"); }
    finally { setTreeLoading(false); }
  }, []);

  // ---- lifecycle ----
  useEffect(() => {
    if (!open) return;
    loadTree();
    const c = copilot.current;
    c.onStatus = setCopilotStatus;
    c.onAuthInfo = setAuthInfo;
    c.connect();

    // Check if Ollama is running
    fetch("/api/local-llm/status")
      .then((r) => r.json())
      .then((d) => { setOllamaRunning(d.running); setOllamaModels(d.models ?? []); })
      .catch(() => { setOllamaRunning(false); setOllamaModels([]); });

    return () => { c.disconnect(); setCopilotStatus("off"); };
  }, [open]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  // Tick an elapsed-seconds counter while a chat request is in flight, so the
  // user can see the local model is still working (CPU responses are slow).
  useEffect(() => {
    if (!chatLoading) { setGenElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setGenElapsed(Math.round((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [chatLoading]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); doSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, activeTab, tabs]);

  useEffect(() => {
    const h = () => setCtxMenu(null);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, []);

  // ---- open a file ----
  async function openFile(node: FsNode) {
    if (tabs.find((t) => t.path === node.path)) { setActiveTab(node.path); return; }
    try {
      const content = await apiRead(node.path);
      const lang = getLang(node.name);
      const tab: Tab = { path: node.path, content, saved: content, lang };
      setTabs((p) => [...p, tab]);
      setActiveTab(node.path);
      copilot.current.openDoc(node.path, content, lang);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed");
    }
  }

  // ---- close tab ----
  function closeTab(path: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    const tab = tabs.find((t) => t.path === path);
    if (tab && tab.content !== tab.saved && !confirm("Close without saving?")) return;
    copilot.current.closeDoc(path);
    const rest = tabs.filter((t) => t.path !== path);
    setTabs(rest);
    if (activeTab === path) setActiveTab(rest.at(-1)?.path ?? null);
  }

  // ---- save ----
  async function doSave() {
    if (!active) return;
    setSaving(true);
    try {
      await apiSave(active.path, active.content);
      setTabs((p) => p.map((t) => t.path === active.path ? { ...t, saved: t.content } : t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  function onEditorChange(val: string | undefined) {
    if (val == null || !activeTab) return;
    setTabs((p) => p.map((t) => t.path === activeTab ? { ...t, content: val } : t));
    copilot.current.changeDoc(activeTab, val);
  }

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    completionDispose.current?.dispose();
    completionDispose.current = monaco.languages.registerInlineCompletionsProvider("*", {
      provideInlineCompletions: async (model: any, position: any) => {
        if (copilotStatus !== "ready") return { items: [] };
        const filePath = model.uri.path.replace(/^\//, "");
        const completions = await copilot.current.getCompletions(
          filePath, model.getValue(),
          position.lineNumber - 1, position.column - 1,
        );
        return {
          items: completions.slice(0, 5).map((text) => ({
            insertText: text,
            range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
          })),
        };
      },
      freeInlineCompletions() {},
    });
  };

  // ---- tree helpers ----
  function toggleDir(path: string) {
    setExpanded((p) => { const n = new Set(p); n.has(path) ? n.delete(path) : n.add(path); return n; });
  }

  function handleCtxMenu(e: React.MouseEvent, node: FsNode) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }

  async function handleDelete(node: FsNode) {
    if (!confirm(`Delete "${node.name}"? This cannot be undone.`)) return;
    setCtxMenu(null);
    try {
      await apiDelete(node.path);
      if (node.type === "file") closeTab(node.path);
      await loadTree();
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); }
  }

  async function handleCreate() {
    if (!creating || !newName.trim()) return;
    const p = creating.parent ? `${creating.parent}/${newName.trim()}` : newName.trim();
    try {
      await apiCreate(p, creating.type === "directory");
      await loadTree();
      setExpanded((prev) => new Set([...prev, creating.parent]));
      if (creating.type === "file") await openFile({ name: newName.trim(), path: p, type: "file" });
    } catch (e) { setError(e instanceof Error ? e.message : "Create failed"); }
    setCreating(null);
    setNewName("");
  }

  // ---- Copilot sign-in (inline completions) ----
  async function handleSignIn() {
    try {
      const info = await copilot.current.signInInitiate();
      setAuthInfo(info);
    } catch { setError("Failed to start Copilot sign-in"); }
  }

  async function handleSignInConfirm() {
    if (!authInfo) return;
    try {
      await copilot.current.signInConfirm(authInfo.userCode);
      setAuthInfo(null);
    } catch { setError("Sign-in confirmation failed — please try again"); }
  }

  // ---- GitHub account management ----
  function handleAuthenticated(token: string, user: GitHubUser) {
    localStorage.setItem("github_token", token);
    localStorage.setItem("github_user", JSON.stringify(user));
    localStorage.setItem("gh_copilot_token", token);
    setGithubUser(user);
    setGhToken(token);
    setShowGitHubAuth(false);
  }

  function disconnectGitHub() {
    localStorage.removeItem("github_token");
    localStorage.removeItem("github_user");
    setGithubUser(null);
  }

  // ---- prompt attachments ----
  const allFiles = React.useMemo(() => flattenFiles(tree), [tree]);

  // Model dropdown options. For Ollama, list every model the user has pulled
  // (live from /api/local-llm/status) automatically — no code edit needed —
  // then append curated suggestions they haven't pulled yet.
  const modelOptions = React.useMemo(() => {
    if (aiProvider !== "ollama") return AI_MODELS[aiProvider];
    const curated = AI_MODELS.ollama;
    const niceLabel = (tag: string) => {
      const hit = curated.find((c) => c.value === tag || `${c.value}:latest` === tag);
      return hit ? hit.label.replace(/\s*\(.*\)$/, "") : tag;
    };
    // Installed chat models (exclude embedding models — not usable for chat).
    const installed = ollamaModels
      .filter((m) => !/embed/i.test(m))
      .map((m) => ({ value: m, label: `${niceLabel(m)}  ✓ installed` }));
    // Curated suggestions not yet pulled.
    const suggestions = curated
      .filter((c) => !ollamaModels.some((m) => m === c.value || m === `${c.value}:latest`))
      .map((c) => ({ value: c.value, label: `${c.label}  ⤓ pull required` }));
    return [...installed, ...suggestions];
  }, [aiProvider, ollamaModels]);

  // Default the "target file to update" to the active tab.
  useEffect(() => { if (activeTab) setTargetFile(activeTab); }, [activeTab]);

  async function attachFromTree(filePath: string) {
    if (attachments.some((a) => a.name === filePath)) { setShowAttachMenu(false); return; }
    try {
      const content = await apiRead(filePath);
      setAttachments((p) => [...p, { name: filePath, content, fromTree: true }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach file");
    }
    setShowAttachMenu(false);
    setAttachFilter("");
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((p) => [
          ...p.filter((a) => a.name !== file.name),
          { name: file.name, content: String(reader.result ?? ""), fromTree: false },
        ]);
      };
      reader.readAsText(file);
    });
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  function removeAttachment(name: string) {
    setAttachments((p) => p.filter((a) => a.name !== name));
  }

  // ---- apply AI output back to the editor (no GitHub needed) ----
  /** Pull the largest fenced code block out of an assistant reply. */
  function extractCode(text: string): string | null {
    const blocks = [...text.matchAll(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ""));
    if (!blocks.length) return null;
    return blocks.sort((a, b) => b.length - a.length)[0];
  }

  /** Insert code at the cursor in the active Monaco editor. */
  function insertIntoEditor(code: string) {
    const ed = editorRef.current;
    if (!ed || !activeTab) return;
    const sel = ed.getSelection();
    if (sel) ed.executeEdits("ai-insert", [{ range: sel, text: code, forceMoveMarkers: true }]);
    ed.focus();
  }

  /** Replace the whole active file with code (then Ctrl+S / Save persists it). */
  function replaceEditorContent(code: string) {
    if (!activeTab) return;
    setTabs((p) => p.map((t) => t.path === activeTab ? { ...t, content: code } : t));
    copilot.current.changeDoc(activeTab, code);
  }

  /**
   * Smart apply: find the line (or function) the snippet changes and replace it
   * in place, preserving the file's indentation. Handles two common cases:
   *   • a single assignment `x = …`  → replaces the matching `x =` line
   *   • a `def`/`class` block        → replaces that whole function/class
   * Falls back to inserting at the cursor (with a notice) if it can't locate a match.
   */
  function applySmart(code: string) {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    const model = ed?.getModel?.() ?? null;
    if (!ed || !monaco || !model) { insertIntoEditor(code); return; }

    const snippetLines = code.replace(/\s+$/, "").split("\n");
    const meaningful = snippetLines.filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (!meaningful.length) { insertIntoEditor(code); return; }

    const fileLines: string[] = model.getValue().split(/\r?\n/);
    const cursor = ed.getPosition()?.lineNumber ?? 1;
    const eol = model.getEOL();

    // Re-indent the snippet so its base indent matches the target line.
    const snBase = Math.min(...snippetLines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
    const reindent = (target: string) =>
      snippetLines.map((l) => (l.trim() === "" ? "" : target + l.slice(snBase))).join(eol);

    let startLine = -1, endLine = -1, indent = "";

    const asg = meaningful.length === 1 && meaningful[0].match(/^\s*([A-Za-z_][\w.[\]]*)\s*=(?!=)/);
    const def = meaningful[0].match(/^\s*(def|class)\s+([A-Za-z_]\w*)/);

    if (asg) {
      const re = new RegExp("^\\s*" + asg[1].replace(/[.[\]]/g, "\\$&") + "\\s*=(?!=)");
      const hits = fileLines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
      if (hits.length) {
        const best = hits.reduce((a, b) =>
          Math.abs(b - (cursor - 1)) < Math.abs(a - (cursor - 1)) ? b : a);
        startLine = endLine = best + 1;
        indent = fileLines[best].match(/^\s*/)![0];
      }
    } else if (def) {
      const re = new RegExp("^\\s*" + def[1] + "\\s+" + def[2] + "\\b");
      const di = fileLines.findIndex((l) => re.test(l));
      if (di >= 0) {
        indent = fileLines[di].match(/^\s*/)![0];
        let end = fileLines.length - 1;
        for (let i = di + 1; i < fileLines.length; i++) {
          if (fileLines[i].trim() === "") continue;
          if (fileLines[i].match(/^\s*/)![0].length <= indent.length) { end = i - 1; break; }
        }
        startLine = di + 1; endLine = end + 1;
      }
    }

    if (startLine < 0) {
      insertIntoEditor(code);
      setError("Couldn't locate the exact line to change — inserted at the cursor instead. For larger edits use 'Replace file'.");
      return;
    }

    const range = new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
    ed.executeEdits("ai-apply", [{ range, text: reindent(indent), forceMoveMarkers: true }]);
    ed.setSelection(new monaco.Range(startLine, 1, startLine, 1));
    ed.revealLineInCenter(startLine);
    ed.focus();
  }

  // ---- re-check Ollama + installed models (used by the status box and the
  //      refresh button next to the model dropdown) ----
  const refreshOllama = useCallback(() => {
    setOllamaRunning(null);
    fetch("/api/local-llm/status")
      .then((r) => r.json())
      .then((d) => { setOllamaRunning(d.running); setOllamaModels(d.models ?? []); })
      .catch(() => { setOllamaRunning(false); setOllamaModels([]); });
  }, []);

  // ---- RAG index ("training") ----
  const refreshIndexStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/local-llm/index/status");
      setIndexInfo(await r.json());
    } catch { setIndexInfo({ exists: false }); }
  }, []);

  useEffect(() => { if (open) refreshIndexStatus(); }, [open, refreshIndexStatus]);

  function toggleRag(v: boolean) {
    setUseRag(v);
    localStorage.setItem("llm_use_rag", String(v));
  }

  async function runIndexing() {
    setIndexing(true);
    setIndexProgress({ current: 0, total: 0, phase: "scanning", message: "Starting…" });
    try {
      const res = await fetch("/api/local-llm/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // use server default sources
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No progress stream");
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
          if (raw === "[DONE]") continue;
          try {
            const p = JSON.parse(raw);
            if (p.phase === "error") { setError(p.message ?? "Indexing failed"); continue; }
            setIndexProgress({
              current: p.current ?? 0, total: p.total ?? 0,
              phase: p.phase, message: p.message,
            });
          } catch { /* ignore partial */ }
        }
      }
      await refreshIndexStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Indexing failed");
    } finally {
      setIndexing(false);
      setTimeout(() => setIndexProgress(null), 2500);
    }
  }

  // ---- AI chat (Copilot or alternative provider) ----
  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput("");
    setChatMsgs((p) => [...p, { role: "user", text: msg }]);
    setChatLoading(true);

    const provider = (localStorage.getItem("ai_provider") as AIProvider) ?? aiProvider;
    const apiKey = localStorage.getItem("ai_api_key") ?? aiApiKey;
    const model = localStorage.getItem("ai_model") ?? aiModel;
    const azureEndpoint = localStorage.getItem("ai_azure_endpoint") ?? aiAzureEndpoint;

    // For providers without structured attachment support, fold attachments
    // (and the target-file hint) into the message text.
    const attachmentText = attachments.length
      ? "\n\n" + attachments
          .map((a) => `### Attached file: ${a.name}\n\`\`\`\n${a.content.slice(0, 12000)}\n\`\`\``)
          .join("\n\n")
      : "";
    const targetHint = targetFile && targetFile !== active?.path
      ? `\n\n(Scope your code suggestions to updating the file: ${targetFile})`
      : "";

    const commonPayload = {
      message: msg,
      code: active?.content ?? "",
      filename: active?.path ?? "",
      language: active?.lang ?? "plaintext",
    };

    try {
      let res: Response;

      if (provider === "copilot") {
        const token = ghToken || localStorage.getItem("gh_copilot_token") || "";
        res = await fetch("/api/code-editor/copilot-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...commonPayload, message: msg + targetHint + attachmentText, githubToken: token }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: res.statusText }));
          if (d.code === "COPILOT_NOT_ENABLED") {
            setCopilotNotEnabled(true);
            setChatLoading(false);
            setChatMsgs((p) => p.slice(0, -1));
            return;
          }
          throw new Error(d.error ?? "Chat failed");
        }
      } else if (provider === "ollama") {
        res = await fetch("/api/local-llm/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...commonPayload,
            model: model || "qwen2.5-coder:3b",
            useRag,
            targetFile: targetFile ?? undefined,
            attachments: attachments.map((a) => ({ name: a.name, content: a.content })),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(d.error ?? "Local LLM chat failed — is Ollama running?");
        }
      } else {
        if (!apiKey) throw new Error(`No API key set. Open ⚙ Settings and add your ${AI_PROVIDER_LABELS[provider]} API key.`);
        res = await fetch("/api/code-editor/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...commonPayload,
            message: msg + targetHint + attachmentText,
            provider,
            apiKey,
            model: model || undefined,
            azureEndpoint: azureEndpoint || undefined,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(d.error ?? "AI chat failed");
        }
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      let assistant = "";
      setChatMsgs((p) => [...p, { role: "assistant", text: "" }]);
      const dec = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw);
            // Error forwarded from server
            if (parsed.error) throw new Error(parsed.error);
            const delta = parsed?.choices?.[0]?.delta?.content ?? "";
            assistant += delta;
            setChatMsgs((p) => {
              const n = [...p];
              n[n.length - 1] = { role: "assistant", text: assistant };
              return n;
            });
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
              throw parseErr;
            }
          }
        }
      }
    } catch (e) {
      setChatMsgs((p) => [
        ...p,
        { role: "assistant", text: `⚠️ ${e instanceof Error ? e.message : "Chat error"}` },
      ]);
    } finally { setChatLoading(false); }
  }

  // ---- open in new window ----
  function openInNewWindow() {
    window.open("/code-editor", "_blank", "noopener,width=1600,height=960");
  }

  if (!open) return null;

  const statusColor: Record<CopilotStatus, string> = {
    off: "text-[#5c5c5c]", connecting: "text-blue-400",
    authenticating: "text-amber-400", ready: "text-green-400",
  };

  const panelTop = standalone ? "inset-0" : "inset-x-0 top-24 bottom-0";

  return (
    <div
      className={cn("fixed z-40 flex flex-col overflow-hidden", panelTop)}
      style={{ background: "#1e1e1e", color: "#d4d4d4", fontFamily: "var(--font-sans)" }}
    >
      {/* ── Tab bar ── */}
      <div className="flex items-center overflow-x-auto shrink-0 border-b" style={{ background: "#252526", borderColor: "#1e1e1e" }}>
        {tabs.map((tab) => {
          const dirty = tab.content !== tab.saved;
          const name = tab.path.split("/").pop() ?? tab.path;
          const isActive = activeTab === tab.path;
          return (
            <div
              key={tab.path}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0 group",
                "border-r border-[#1e1e1e]",
                isActive
                  ? "bg-[#1e1e1e] text-white border-t-2 border-t-blue-500 pt-[5px]"
                  : "text-[#969696] hover:text-white hover:bg-[#2d2d2d]",
              )}
              onClick={() => setActiveTab(tab.path)}
            >
              <span className="text-[10px]">{getIcon(name)}</span>
              <span className="max-w-[120px] truncate">{name}</span>
              {dirty && <span className="text-amber-400 text-[10px]">●</span>}
              <button
                className="ml-0.5 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[#3c3c3c]"
                onClick={(e) => closeTab(tab.path, e)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <div className="flex-1" />
        <div className="flex items-center gap-1 px-2 shrink-0">
          {active && (
            <button
              onClick={doSave}
              disabled={saving || active.content === active.saved}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-[#969696] hover:text-white hover:bg-[#3c3c3c] rounded disabled:opacity-30 transition-colors"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </button>
          )}
          {/* Open in new window */}
          {!standalone && (
            <button
              onClick={openInNewWindow}
              className="p-1.5 text-[#969696] hover:text-white hover:bg-[#3c3c3c] rounded"
              title="Open in new window"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-[#969696] hover:text-white hover:bg-[#3c3c3c] rounded"
            title="Close editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-red-300 bg-red-950/60 border-b border-red-800 shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ── File explorer sidebar ── */}
        <div className="flex flex-col overflow-hidden shrink-0" style={{ width: 240, background: "#252526", borderRight: "1px solid #3c3c3c" }}>

          {/* GitHub account section */}
          <div className="shrink-0 border-b" style={{ borderColor: "#3c3c3c" }}>
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-1.5">
                <GithubIcon className="h-3.5 w-3.5 text-[#969696]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#bbbbbb]">GitHub</span>
              </div>
              {githubUser ? (
                <div className="flex items-center gap-1.5">
                  <img
                    src={githubUser.avatar_url}
                    alt={githubUser.login}
                    className="h-5 w-5 rounded-full border"
                    style={{ borderColor: "#3c3c3c" }}
                  />
                  <span className="text-[11px] text-[#d4d4d4] truncate max-w-[70px]">{githubUser.login}</span>
                  <button
                    onClick={disconnectGitHub}
                    title="Disconnect GitHub account"
                    className="p-0.5 text-[#5c5c5c] hover:text-red-400 rounded"
                  >
                    <LogOut className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowGitHubAuth(true)}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <User className="h-3 w-3" />
                  Sign in
                </button>
              )}
            </div>
            {githubUser?.name && (
              <p className="px-3 pb-1.5 text-[10px] text-[#5c5c5c] truncate">{githubUser.name}</p>
            )}
          </div>

          {/* Explorer header */}
          <div className="flex items-center justify-between px-3 py-2 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#bbbbbb]">Explorer</span>
            <div className="flex gap-0.5">
              <button title="New File" className="p-1 rounded text-[#969696] hover:text-white hover:bg-[#3c3c3c]"
                onClick={() => { setCreating({ type: "file", parent: "" }); setNewName(""); }}>
                <FilePlus className="h-3.5 w-3.5" />
              </button>
              <button title="New Folder" className="p-1 rounded text-[#969696] hover:text-white hover:bg-[#3c3c3c]"
                onClick={() => { setCreating({ type: "directory", parent: "" }); setNewName(""); }}>
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button title="Refresh" className="p-1 rounded text-[#969696] hover:text-white hover:bg-[#3c3c3c]"
                onClick={loadTree}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Inline create input */}
          {creating && (
            <div className="px-2 pb-1 shrink-0">
              <input
                autoFocus
                className="w-full px-2 py-1 text-xs rounded outline-none text-white"
                style={{ background: "#3c3c3c", border: "1px solid #007acc" }}
                placeholder={creating.type === "file" ? "new-file.ts" : "new-folder"}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(null); setNewName(""); }
                }}
              />
              <p className="text-[10px] text-[#5c5c5c] mt-0.5">Enter to create · Esc to cancel</p>
            </div>
          )}

          {/* Tree */}
          <div className="flex-1 overflow-y-auto py-1">
            {treeLoading
              ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#969696]" /></div>
              : tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  activeFile={activeTab}
                  onToggle={toggleDir}
                  onOpen={openFile}
                  onContext={handleCtxMenu}
                />
              ))
            }
          </div>
        </div>

        {/* ── Monaco editor ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {active ? (
            <>
              {/* Breadcrumb */}
              <div className="px-4 py-1 text-[11px] text-[#969696] shrink-0 border-b" style={{ background: "#1e1e1e", borderColor: "#252526" }}>
                {active.path.split("/").map((seg, i, arr) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-1 text-[#5c5c5c]">›</span>}
                    <span className={i === arr.length - 1 ? "text-white" : ""}>{seg}</span>
                  </span>
                ))}
                {active.content !== active.saved && (
                  <span className="ml-3 text-amber-500 text-[10px]">● unsaved</span>
                )}
                <span className="ml-4 text-[#3c3c3c] text-[10px]">Ctrl+S saves</span>
              </div>
              <Editor
                key={active.path}
                language={active.lang}
                value={active.content}
                onChange={onEditorChange}
                onMount={onEditorMount}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  fontFamily: "Consolas, 'Courier New', monospace",
                  minimap: { enabled: true },
                  lineNumbers: "on",
                  wordWrap: "on",
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  insertSpaces: true,
                  folding: true,
                  bracketPairColorization: { enabled: true },
                  suggest: { showInlineDetails: true },
                  inlineSuggest: { enabled: true },
                }}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#3c3c3c]">
              <svg width="80" height="80" viewBox="0 0 100 100" fill="none">
                <path d="M74.5 6.5L38.5 39.5L16.5 22.5L6.5 27.5V72.5L16.5 77.5L38.5 60.5L74.5 93.5L93.5 84.5V15.5L74.5 6.5Z" fill="#007ACC" opacity="0.3"/>
                <path d="M74.5 6.5L38.5 39.5V60.5L74.5 93.5L93.5 84.5V15.5L74.5 6.5Z" fill="#1F9CF0" opacity="0.3"/>
              </svg>
              <p className="text-sm text-[#5c5c5c]">Select a file from the explorer to edit</p>
              <p className="text-xs text-[#3c3c3c]">Right-click files for options · Ctrl+S to save</p>
            </div>
          )}
        </div>

        {/* ── Copilot Chat ── */}
        {showCopilot && (
          <div
            className="flex flex-col overflow-hidden shrink-0"
            style={{ width: 320, background: "#1e1e1e", borderLeft: "1px solid #3c3c3c" }}
          >
            {/* AI panel header */}
            <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b" style={{ background: "#252526", borderColor: "#3c3c3c" }}>
              <div className="flex items-center gap-2 min-w-0">
                <Bot className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="text-xs font-semibold text-[#d4d4d4] truncate">
                  {AI_PROVIDER_LABELS[aiProvider]}
                </span>
                {chatLoading && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400 shrink-0 animate-pulse" title="The model is generating a response">
                    <Loader2 className="h-3 w-3 animate-spin" /> generating {genElapsed}s
                  </span>
                )}
                {!chatLoading && aiProvider === "copilot" && (
                  <span className={cn("text-[10px] font-medium shrink-0", statusColor[copilotStatus])}>
                    {copilotStatus === "ready" ? "● ready" :
                     copilotStatus === "authenticating" ? "● sign in" :
                     copilotStatus === "connecting" ? "○ …" : "○ off"}
                  </span>
                )}
                {!chatLoading && aiProvider !== "copilot" && aiProvider !== "ollama" && aiApiKey && (
                  <span className="text-[10px] text-green-400 shrink-0">● ready</span>
                )}
                {!chatLoading && aiProvider !== "copilot" && aiProvider !== "ollama" && !aiApiKey && (
                  <span className="text-[10px] text-amber-400 shrink-0">⚠ no key</span>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="p-0.5 text-[#969696] hover:text-white rounded" title="AI provider settings"
                  onClick={() => setShowAiSettings((v) => !v)}>
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <button className="p-0.5 text-[#969696] hover:text-white rounded"
                  onClick={() => setShowCopilot(false)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* ── AI provider settings panel ── */}
            {showAiSettings && (
              <div className="px-3 py-3 border-b shrink-0 space-y-2.5 text-xs" style={{ borderColor: "#3c3c3c", background: "#252526" }}>
                {/* Provider selector */}
                <div>
                  <p className="text-[#969696] mb-1.5 font-semibold">AI Provider</p>
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      ["copilot",   "GitHub Copilot"],
                      ["ollama",    "Local LLM ★ free"],
                      ["openai",    "OpenAI"],
                      ["anthropic", "Anthropic"],
                      ["gemini",    "Google Gemini"],
                      ["azure",     "Azure OpenAI"],
                    ] as [AIProvider, string][]).map(([p, label]) => (
                      <button
                        key={p}
                        onClick={() => { setAiProvider(p); setAiModel(""); }}
                        className={cn(
                          "py-1.5 px-2 rounded text-[11px] font-medium text-left transition-colors",
                          aiProvider === p ? "text-white" : "text-[#969696] hover:text-[#c5c5c5]",
                        )}
                        style={{ background: aiProvider === p ? "#007acc" : "#1e1e1e" }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ollama status (no key needed) */}
                {aiProvider === "ollama" && (
                  <div className="rounded p-2.5 space-y-1" style={{ background: "#1e1e1e", border: "1px solid #3c3c3c" }}>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-bold", ollamaRunning ? "text-green-400" : "text-red-400")}>
                        {ollamaRunning === null ? "○ checking…" : ollamaRunning ? "● Ollama running" : "● Ollama not running"}
                      </span>
                      <button className="text-[10px] text-[#5c5c5c] hover:text-white ml-auto"
                        onClick={refreshOllama}>
                        refresh
                      </button>
                    </div>
                    {ollamaRunning && ollamaModels.length > 0 && (
                      <p className="text-[10px] text-[#5c5c5c]">
                        Models: {ollamaModels.join(", ")}
                      </p>
                    )}
                    {!ollamaRunning && ollamaRunning !== null && (
                      <p className="text-[10px] text-amber-500">
                        Start Ollama: open a terminal and run <span className="font-mono">ollama serve</span>
                      </p>
                    )}
                    <p className="text-[10px] text-[#5c5c5c]">No API key required — runs entirely on this machine.</p>
                  </div>
                )}

                {/* ── Train on docs & scripts (RAG) ── */}
                {aiProvider === "ollama" && (
                  <div className="rounded p-2.5 space-y-2" style={{ background: "#1e1e1e", border: "1px solid #3c3c3c" }}>
                    <div className="flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-purple-400" />
                      <span className="text-[11px] font-semibold text-[#d4d4d4]">Train on docs &amp; scripts</span>
                    </div>
                    <p className="text-[10px] text-[#969696] leading-relaxed">
                      Indexes the project docs and model scripts so the assistant answers from <em>your</em> logic
                      and suggests code that matches it. Re-run after docs change.
                    </p>

                    {/* Index status */}
                    <div className="text-[10px] text-[#5c5c5c]">
                      {indexInfo.exists ? (
                        <span className="text-green-400">
                          ● Indexed {indexInfo.chunkCount} chunks · {indexInfo.builtAt ? new Date(indexInfo.builtAt).toLocaleString() : ""}
                        </span>
                      ) : (
                        <span className="text-amber-500">● Not trained yet</span>
                      )}
                    </div>
                    {indexInfo.exists && indexInfo.sources?.length ? (
                      <p className="text-[10px] text-[#5c5c5c] truncate">Sources: {indexInfo.sources.join(", ")}</p>
                    ) : null}

                    {/* Progress */}
                    {indexProgress && (
                      <div className="space-y-1">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#3c3c3c" }}>
                          <div
                            className="h-full transition-all"
                            style={{
                              background: "#8b5cf6",
                              width: indexProgress.total
                                ? `${Math.round((indexProgress.current / indexProgress.total) * 100)}%`
                                : "30%",
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-[#969696] truncate">
                          {indexProgress.phase === "embedding"
                            ? `Embedding ${indexProgress.current}/${indexProgress.total}…`
                            : indexProgress.message ?? indexProgress.phase}
                        </p>
                      </div>
                    )}

                    <button
                      onClick={runIndexing}
                      disabled={indexing || !ollamaRunning}
                      className="w-full py-1.5 rounded text-[11px] font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
                      style={{ background: "#7c3aed" }}
                      title={!ollamaRunning ? "Start Ollama first" : undefined}
                    >
                      {indexing
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Training…</>
                        : <><Sparkles className="h-3 w-3" /> {indexInfo.exists ? "Re-train on docs" : "Train on docs"}</>}
                    </button>

                    {/* RAG toggle */}
                    <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        checked={useRag}
                        onChange={(e) => toggleRag(e.target.checked)}
                        className="accent-purple-500"
                      />
                      <span className="text-[10px] text-[#c5c5c5]">Use trained knowledge when answering</span>
                    </label>
                  </div>
                )}

                {/* API Key */}
                {aiProvider !== "copilot" && aiProvider !== "ollama" && (
                  <div>
                    <label className="block text-[#969696] mb-1">
                      {aiProvider === "openai" ? "OpenAI API Key" :
                       aiProvider === "anthropic" ? "Anthropic API Key" :
                       aiProvider === "gemini" ? "Google Gemini API Key" : "Azure API Key"}
                    </label>
                    <input
                      type="password"
                      placeholder={
                        aiProvider === "openai" ? "sk-..." :
                        aiProvider === "anthropic" ? "sk-ant-..." :
                        aiProvider === "gemini" ? "AIza..." :
                        "Azure API key"
                      }
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      className="w-full px-2 py-1.5 rounded outline-none text-white text-xs"
                      style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                    />
                  </div>
                )}

                {/* Azure endpoint */}
                {aiProvider === "azure" && (
                  <div>
                    <label className="block text-[#969696] mb-1">Azure Endpoint</label>
                    <input
                      type="text"
                      placeholder="https://YOUR-RESOURCE.openai.azure.com"
                      value={aiAzureEndpoint}
                      onChange={(e) => setAiAzureEndpoint(e.target.value)}
                      className="w-full px-2 py-1.5 rounded outline-none text-white text-xs"
                      style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                    />
                  </div>
                )}

                {/* Model selector */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[#969696]">Model</label>
                    {aiProvider === "ollama" && (
                      <button
                        onClick={refreshOllama}
                        disabled={ollamaRunning === null}
                        className="flex items-center gap-1 text-[10px] text-[#5c5c5c] hover:text-white disabled:opacity-40"
                        title="Re-check Ollama and refresh the installed-model list"
                      >
                        <RefreshCw className={cn("h-3 w-3", ollamaRunning === null && "animate-spin")} />
                        refresh models
                      </button>
                    )}
                  </div>
                  {aiProvider === "azure" ? (
                    <input
                      type="text"
                      placeholder="Deployment name (e.g. gpt-4o)"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="w-full px-2 py-1.5 rounded outline-none text-white text-xs"
                      style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                    />
                  ) : (
                    <select
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="w-full px-2 py-1.5 rounded outline-none text-white text-xs"
                      style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                    >
                      {modelOptions.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Copilot PAT */}
                {aiProvider === "copilot" && (
                  <div>
                    <label className="block text-[#969696] mb-1">GitHub Token (for chat)</label>
                    <input
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={ghToken}
                      onChange={(e) => setGhToken(e.target.value)}
                      className="w-full px-2 py-1.5 rounded outline-none text-white text-xs"
                      style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                    />
                  </div>
                )}

                <button
                  onClick={saveAiSettings}
                  disabled={aiProvider !== "copilot" && aiProvider !== "ollama" && !aiApiKey.trim()}
                  className="w-full py-1.5 rounded text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
                  style={{ background: aiSettingsSaved ? "#238636" : "#007acc" }}
                >
                  {aiSettingsSaved ? <><Check className="h-3.5 w-3.5" /> Saved!</> : "Save settings"}
                </button>

                <p className="text-[#5c5c5c] text-[10px]">Keys stored in your browser only — never sent to third parties.</p>
              </div>
            )}

            {/* Sign-in flow for inline completions */}
            {copilotStatus === "authenticating" && !authInfo && (
              <div className="px-3 py-3 border-b shrink-0" style={{ borderColor: "#3c3c3c" }}>
                <p className="text-xs text-[#969696] mb-2">Sign in to enable inline completions</p>
                <button
                  onClick={handleSignIn}
                  className="w-full py-1.5 rounded text-xs font-semibold text-white"
                  style={{ background: "#007acc" }}
                >
                  Sign in with GitHub
                </button>
              </div>
            )}

            {authInfo && (
              <div className="px-3 py-3 border-b shrink-0 space-y-2" style={{ borderColor: "#3c3c3c" }}>
                <p className="text-xs font-semibold text-[#d4d4d4]">Authenticate GitHub Copilot</p>
                <div className="rounded p-3 text-center space-y-1.5" style={{ background: "#0d1117" }}>
                  <p className="text-[10px] text-[#969696]">Go to</p>
                  <a href={authInfo.verificationUri} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-400 underline break-all block">
                    {authInfo.verificationUri}
                  </a>
                  <p className="text-[10px] text-[#969696] pt-1">Enter this code:</p>
                  <p className="text-2xl font-mono font-bold tracking-[0.3em] text-white">
                    {authInfo.userCode}
                  </p>
                </div>
                <button
                  onClick={handleSignInConfirm}
                  className="w-full py-1 rounded text-xs font-medium text-white"
                  style={{ background: "#238636" }}
                >
                  I've entered the code — Continue
                </button>
              </div>
            )}

            {/* ── Copilot not enabled help banner ── */}
            {copilotNotEnabled && (
              <div className="m-3 rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid #3c3c3c" }}>
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2" style={{ background: "#2d1a00" }}>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-semibold text-amber-300">Copilot not enabled</span>
                  </div>
                  <button onClick={() => setCopilotNotEnabled(false)} className="text-[#5c5c5c] hover:text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Body */}
                <div className="px-3 py-3 text-[11px] text-[#969696] space-y-2.5" style={{ background: "#1e1e1e" }}>
                  <p>Your GitHub account doesn't have an active Copilot subscription. Here's how to enable it:</p>

                  <div className="space-y-1.5">
                    <p className="text-[#c5c5c5] font-semibold text-[11px]">Option 1 — Free (Students / Teachers / OSS)</p>
                    <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                      <li>Go to <a href="https://education.github.com/pack" target="_blank" rel="noreferrer" className="text-blue-400 underline">education.github.com/pack</a> (students)</li>
                      <li>Or <a href="https://github.com/github-copilot/signup/copilot_individual" target="_blank" rel="noreferrer" className="text-blue-400 underline">github.com/github-copilot/signup</a> for a 30-day free trial</li>
                    </ol>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[#c5c5c5] font-semibold text-[11px]">Option 2 — Paid subscription</p>
                    <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                      <li>Go to <a href="https://github.com/settings/copilot" target="_blank" rel="noreferrer" className="text-blue-400 underline">github.com/settings/copilot</a></li>
                      <li>Click <em>Enable GitHub Copilot</em></li>
                      <li>Choose <em>Individual</em> ($10/mo or $100/yr) and complete billing</li>
                    </ol>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[#c5c5c5] font-semibold text-[11px]">After subscribing</p>
                    <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                      <li>Make sure your PAT has <em>no scope restrictions</em> on Copilot — or regenerate it</li>
                      <li>Come back here and click the ⚙ icon to re-enter the token</li>
                    </ol>
                  </div>

                  <a
                    href="https://github.com/settings/copilot"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded text-[11px] font-semibold text-white mt-1"
                    style={{ background: "#238636" }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Copilot settings on GitHub
                  </a>
                </div>
              </div>
            )}

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatMsgs.length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <Bot className="h-10 w-10 mx-auto text-[#3c3c3c]" />
                  <p className="text-xs text-[#5c5c5c]">Ask {AI_PROVIDER_LABELS[aiProvider]} about your code</p>
                  {aiProvider === "ollama" && indexInfo.exists && useRag && (
                    <p className="text-[10px] text-purple-400">✓ grounded in your docs &amp; scripts</p>
                  )}
                  <div className="text-[10px] text-[#3c3c3c] space-y-1 text-left mx-auto max-w-[220px]">
                    {["explain this function", "add error handling", "write unit tests", "refactor this code"].map((s) => (
                      <p key={s} className="px-2 py-1 rounded cursor-pointer hover:text-[#5c5c5c]"
                        style={{ background: "#252526" }}
                        onClick={() => { setChatInput(s); }}>
                        {s}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {chatMsgs.map((m, i) => {
                const isStreaming = chatLoading && m.role === "assistant" && i === chatMsgs.length - 1;
                return (
                <div key={i} className={cn("text-xs rounded p-2 leading-relaxed", m.role === "user" ? "ml-4" : "mr-4")}
                  style={{ background: m.role === "user" ? "#252526" : "#1a2a1a" }}>
                  <span className={cn("text-[10px] font-bold block mb-1", m.role === "user" ? "text-blue-400" : "text-green-400")}>
                    {m.role === "user" ? "You" : `● ${AI_PROVIDER_LABELS[aiProvider]}`}
                  </span>
                  {m.text
                    ? (
                      <pre className="whitespace-pre-wrap font-mono text-[11px]">
                        {m.text}{isStreaming && <span className="animate-pulse">▌</span>}
                      </pre>
                    ) : isStreaming ? (
                      <div className="flex items-center gap-2 text-[11px] text-[#8fb98f]">
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        <span>Working locally on CPU… {genElapsed}s</span>
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-[11px]"><Loader2 className="h-3 w-3 animate-spin inline" /></pre>
                    )}
                  {m.role === "assistant" && active && extractCode(m.text) && (
                    <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t" style={{ borderColor: "#2a3a2a" }}>
                      <button
                        onClick={() => applySmart(extractCode(m.text)!)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white"
                        style={{ background: "#0e639c" }}
                        title={`Find the matching line/function in ${active.path.split("/").pop()} and replace it in place`}>
                        <FilePlus className="h-3 w-3" /> Apply change
                      </button>
                      <button
                        onClick={() => insertIntoEditor(extractCode(m.text)!)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#d4d4d4] hover:text-white"
                        style={{ background: "#3c3c3c" }}
                        title="Insert at the cursor position instead">
                        At cursor
                      </button>
                      <button
                        onClick={() => { if (confirm(`Replace the entire contents of ${active.path.split("/").pop()}? Save (Ctrl+S) to write it to disk.`)) replaceEditorContent(extractCode(m.text)!); }}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#d4d4d4] hover:text-white"
                        style={{ background: "#3c3c3c" }}
                        title={`Replace all of ${active.path.split("/").pop()} with this code`}>
                        <RefreshCw className="h-3 w-3" /> Replace file
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(extractCode(m.text)!)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#969696] hover:text-white hover:bg-[#3c3c3c]"
                        title="Copy code">
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat input */}
            <div className="p-2 shrink-0 border-t relative" style={{ borderColor: "#3c3c3c" }}>
              {!active && attachments.length === 0 &&
                <p className="text-[10px] text-[#5c5c5c] mb-1">Open or attach a file to chat about it</p>}
              {aiProvider === "copilot" && !ghToken && !githubUser && active && (
                <p className="text-[10px] text-amber-600 mb-1">
                  <button onClick={() => setShowGitHubAuth(true)} className="underline hover:text-amber-500">
                    Sign in to GitHub
                  </button>{" "}or add token (⚙) to enable chat
                </p>
              )}

              {/* Context chips — the open editor file is auto-inserted, plus any attachments */}
              {(active || attachments.length > 0) && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {active && (
                    <span
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-amber-200"
                      style={{ background: "#2d2400", border: "1px solid #5c4a00" }}
                      title={`${active.path} — current editor file, included in the prompt`}>
                      <FileText className="h-3 w-3 text-amber-400 shrink-0" />
                      <span className="max-w-[120px] truncate">{active.path.split("/").pop()}</span>
                      <span className="text-[8px] text-[#a88600]">in editor</span>
                    </span>
                  )}
                  {attachments.map((a) => (
                    <span key={a.name}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#d4d4d4]"
                      style={{ background: "#252526", border: "1px solid #3c3c3c" }}
                      title={a.name}>
                      <FileText className="h-3 w-3 text-blue-400 shrink-0" />
                      <span className="max-w-[120px] truncate">{a.name.split("/").pop()}</span>
                      {!a.fromTree && <span className="text-[8px] text-[#5c5c5c]">(upload)</span>}
                      <button onClick={() => removeAttachment(a.name)} className="text-[#5c5c5c] hover:text-red-400">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Target file + attach controls */}
              <div className="flex items-center gap-1 mb-1.5">
                <button
                  onClick={() => { setShowAttachMenu((v) => !v); setAttachFilter(""); }}
                  className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-[#969696] hover:text-white hover:bg-[#3c3c3c]"
                  title="Attach files as context"
                >
                  <Paperclip className="h-3 w-3" /> Attach
                </button>
                <button
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-[#969696] hover:text-white hover:bg-[#3c3c3c]"
                  title="Upload a file from your computer"
                >
                  <Upload className="h-3 w-3" /> Upload
                </button>
                <input ref={uploadInputRef} type="file" multiple className="hidden" onChange={handleUpload} />

                <div className="flex items-center gap-1 ml-auto min-w-0">
                  <Target className="h-3 w-3 text-amber-400 shrink-0" />
                  <select
                    value={targetFile ?? ""}
                    onChange={(e) => setTargetFile(e.target.value || null)}
                    className="max-w-[150px] truncate rounded px-1 py-0.5 text-[10px] text-[#d4d4d4] outline-none"
                    style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                    title="File the assistant should write code for"
                  >
                    <option value="">No target file</option>
                    {Array.from(new Set([
                      ...tabs.map((t) => t.path),
                      ...attachments.filter((a) => a.fromTree).map((a) => a.name),
                      ...(targetFile ? [targetFile] : []),
                    ])).map((p) => (
                      <option key={p} value={p}>{p.split("/").pop()}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Attach popover — searchable list over the project tree */}
              {showAttachMenu && (
                <div
                  className="absolute bottom-full left-2 right-2 mb-1 rounded shadow-xl overflow-hidden z-50"
                  style={{ background: "#252526", border: "1px solid #454545" }}
                >
                  <input
                    autoFocus
                    value={attachFilter}
                    onChange={(e) => setAttachFilter(e.target.value)}
                    placeholder="Filter files… (e.g. model.py)"
                    className="w-full px-2 py-1.5 text-[11px] text-white outline-none border-b"
                    style={{ background: "#3c3c3c", borderColor: "#3c3c3c" }}
                  />
                  <div className="max-h-52 overflow-y-auto py-1">
                    {allFiles
                      .filter((f) => f.toLowerCase().includes(attachFilter.toLowerCase()))
                      .slice(0, 60)
                      .map((f) => {
                        const attached = attachments.some((a) => a.name === f);
                        return (
                          <button
                            key={f}
                            onClick={() => attachFromTree(f)}
                            disabled={attached}
                            className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-left hover:bg-[#094771] disabled:opacity-40"
                          >
                            <span className="text-[10px] shrink-0">{getIcon(f)}</span>
                            <span className="flex-1 truncate text-[#d4d4d4]">{f}</span>
                            {attached && <Check className="h-3 w-3 text-green-400 shrink-0" />}
                          </button>
                        );
                      })}
                    {allFiles.filter((f) => f.toLowerCase().includes(attachFilter.toLowerCase())).length === 0 && (
                      <p className="px-2 py-2 text-[10px] text-[#5c5c5c]">No files match.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-1">
                <textarea
                  className="flex-1 resize-none rounded px-2 py-1.5 text-xs text-white placeholder-[#5c5c5c] outline-none"
                  style={{ background: "#3c3c3c", border: "1px solid #5c5c5c" }}
                  rows={2}
                  placeholder={aiProvider === "ollama" ? "Ask the local model… (Enter to send)" : "Ask the assistant… (Enter to send)"}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={!active && attachments.length === 0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                  }}
                />
                <button
                  onClick={sendChat}
                  disabled={(!active && attachments.length === 0) || !chatInput.trim() || chatLoading}
                  className="px-2 rounded text-xs font-semibold text-white disabled:opacity-30 transition-colors"
                  style={{ background: "#007acc" }}
                >
                  {chatLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "↑"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Collapsed Copilot toggle */}
        {!showCopilot && (
          <button
            onClick={() => setShowCopilot(true)}
            className="flex flex-col items-center justify-center gap-1 text-[#969696] hover:text-white hover:bg-[#2a2d2e] transition-colors"
            style={{ width: 32, background: "#252526", borderLeft: "1px solid #3c3c3c" }}
            title="Show Copilot"
          >
            <Bot className="h-4 w-4" />
          </button>
        )}

        {/* ── GitHub auth modal ── */}
        {showGitHubAuth && (
          <GitHubAuthModal
            onClose={() => setShowGitHubAuth(false)}
            onAuthenticated={handleAuthenticated}
          />
        )}
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          className="fixed z-50 rounded shadow-xl py-1 text-xs min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y, background: "#252526", border: "1px solid #454545" }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.node.type === "directory" && (
            <>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[#d4d4d4] hover:bg-[#094771]"
                onClick={() => { setCreating({ type: "file", parent: ctxMenu.node.path }); setNewName(""); setCtxMenu(null); }}>
                <FilePlus className="h-3.5 w-3.5" /> New File
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[#d4d4d4] hover:bg-[#094771]"
                onClick={() => { setCreating({ type: "directory", parent: ctxMenu.node.path }); setNewName(""); setCtxMenu(null); }}>
                <FolderPlus className="h-3.5 w-3.5" /> New Folder
              </button>
              <div className="my-1 border-t" style={{ borderColor: "#3c3c3c" }} />
            </>
          )}
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-[#094771]"
            onClick={() => handleDelete(ctxMenu.node)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
