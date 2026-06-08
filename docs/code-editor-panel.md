# Code Editor Panel — In-Browser VS Code Experience

## Overview

The **Code Editor Panel** replaces the previous limited script editor (`ScriptEditorModal`) with a full VS Code-like development environment embedded directly in the FIA Validation Tool UI. Users can browse the entire project, edit any file, and use GitHub Copilot for AI-assisted coding — all without leaving the browser.

Clicking **View Code** in the top ribbon opens the panel as a full-screen overlay below the ribbon bar.

---

## Feature Summary

| Feature | Details |
|---|---|
| Monaco Editor | VS Code's actual editor engine — syntax highlighting, minimap, bracket coloring, code folding, word wrap |
| Full project file tree | Browse every folder and file in the project root (excludes `node_modules`, `.git`, `dist`, `__pycache__`) |
| Multi-tab editing | Open multiple files simultaneously; each tab tracks unsaved changes with an amber `●` indicator |
| Ctrl+S to save | Keyboard shortcut saves the active file; also available via the Save button in the tab bar |
| Copilot inline completions | Ghost-text suggestions as you type, powered by `@github/copilot-language-server` |
| Copilot authentication | Device-code OAuth flow — one-time sign-in via `github.com/login/device` |
| Copilot Chat | Right-side chat panel — ask questions about the open file; responses stream in real time |
| Right-click context menu | New File, New Folder, Delete on any tree node |
| Create files/folders inline | Type a name and press Enter directly in the explorer sidebar |

---

## Architecture

```
Browser
  ├── File Explorer (left, 240 px)
  │     API: GET /api/code-editor/tree
  │
  ├── Monaco Editor (center, flex-1)
  │     API: GET /api/code-editor/file?path=...
  │          PUT /api/code-editor/file  (save)
  │          POST /api/code-editor/file (create)
  │          DELETE /api/code-editor/file?path=...
  │          WebSocket /ws/copilot-lsp  → inline completions
  │
  └── Copilot Chat (right, 320 px)
        API: POST /api/code-editor/copilot-chat  (GitHub PAT → Copilot API → SSE stream)

Server
  ├── Express routes   server/routes.ts
  ├── Copilot bridge   server/copilot-bridge.ts
  │     Spawns: node <project>/node_modules/@github/copilot-language-server/dist/main.js --stdio
  │     Bridges: WebSocket JSON-RPC ↔ LSP Content-Length–framed stdio
  └── WebSocket server server/index.ts  (upgrade handler at /ws/copilot-lsp)
```

---

## New & Modified Files

### New files

| File | Purpose |
|---|---|
| `client/src/components/CodeEditorPanel.tsx` | Full VS Code-like React panel (file tree, Monaco, Copilot chat) |
| `server/copilot-bridge.ts` | Spawns the Copilot LSP process; bridges every WebSocket client to it via stdin/stdout |

### Modified files

| File | Change |
|---|---|
| `server/routes.ts` | Added `/api/code-editor/*` routes (tree, file CRUD, copilot-chat endpoint) |
| `server/index.ts` | Imports `WebSocketServer` and `initCopilotBridge`; registers the `/ws/copilot-lsp` upgrade handler |
| `client/src/components/layout/TopRibbon.tsx` | Added `showCodeEditor` state; "View Code" button now opens `CodeEditorPanel` instead of `ScriptEditorModal` |
| `package.json` | Added `@monaco-editor/react` and `@github/copilot-language-server` dependencies |

---

## Backend API Reference

All file paths are **relative to the project root** and are validated server-side to prevent path traversal.

### File Tree

```
GET /api/code-editor/tree
```

Returns the full recursive directory tree.

**Response**
```json
{
  "tree": [
    {
      "name": "client",
      "path": "client",
      "type": "directory",
      "children": [ ... ]
    },
    {
      "name": "server",
      "path": "server",
      "type": "directory",
      "children": [ ... ]
    }
  ],
  "root": "C:\\projects\\Updated-FIA-Validation-Tool-UI"
}
```

Excluded directories: `node_modules`, `.git`, `dist`, `__pycache__`, `.next`, `build`, `.venv`, `venv`, `.cache`.

---

### Read File

```
GET /api/code-editor/file?path=server/routes.ts
```

Returns the UTF-8 content of any text file. Binary files (images, xlsx, etc.) return `415 Unsupported Media Type`.

**Response**
```json
{ "path": "server/routes.ts", "content": "..." }
```

---

### Save File

```
PUT /api/code-editor/file
Content-Type: application/json

{ "path": "server/routes.ts", "content": "..." }
```

Overwrites the file on disk. Creates intermediate directories if needed.

---

### Create File or Folder

```
POST /api/code-editor/file
Content-Type: application/json

{ "path": "client/src/utils/helper.ts", "isDir": false, "content": "" }
```

Set `isDir: true` to create a directory. Returns `409 Conflict` if the path already exists.

---

### Delete File or Folder

```
DELETE /api/code-editor/file?path=client/src/utils/helper.ts
```

Recursively deletes directories. Returns `404` if not found.

---

### Rename / Move

```
POST /api/code-editor/rename
Content-Type: application/json

{ "oldPath": "server/old.ts", "newPath": "server/new.ts" }
```

---

### Copilot Chat

```
POST /api/code-editor/copilot-chat
Content-Type: application/json

{
  "message": "Explain what this function does",
  "code": "<current file content>",
  "filename": "server/routes.ts",
  "language": "typescript",
  "githubToken": "ghp_xxxxxxxxxxxxxxxxxxxx"
}
```

Exchanges the GitHub Personal Access Token for a short-lived Copilot token, then calls `https://api.githubcopilot.com/chat/completions` and streams the response back as Server-Sent Events (SSE).

The `githubToken` is **never stored server-side** — it is used only for the duration of the request.

---

## Copilot LSP Bridge

**File:** `server/copilot-bridge.ts`

### How it works

1. On server startup, `initCopilotBridge(wss)` is called.
2. It spawns `node .../copilot-language-server/dist/main.js --stdio` as a child process.
3. When a browser client connects to `/ws/copilot-lsp`, the bridge pipes messages in both directions:
   - **Browser → LSP:** raw JSON-RPC string received from WebSocket is wrapped in `Content-Length` headers and written to LSP stdin.
   - **LSP → Browser:** `Content-Length`-framed messages read from LSP stdout have headers stripped and are broadcast as raw JSON to all connected WebSocket clients.
4. All connected clients share a single LSP process. Auth state is maintained by the LSP process itself.

### LSP message framing

The LSP stdio protocol uses:
```
Content-Length: <byte-length>\r\n
\r\n
<JSON-RPC payload>
```

The WebSocket side uses plain JSON strings. The `LSPReader` class in `copilot-bridge.ts` handles incremental buffer parsing to extract complete messages.

---

## GitHub Copilot Authentication (Inline Completions)

Inline completions use the `@github/copilot-language-server` package and GitHub's device-code OAuth flow. **No API key is required** — only an active GitHub Copilot subscription.

### One-time setup per server session

1. Open the Code Editor panel (View Code button).
2. The Copilot status badge shows **"sign in"**.
3. Click **Sign in with GitHub** in the Copilot chat panel.
4. A device code (e.g. `ABCD-1234`) and URL (`github.com/login/device`) appear.
5. Visit the URL in any browser, enter the code, and authorize.
6. Click **"I've entered the code — Continue"** in the panel.
7. Status changes to **"ready"**. Ghost-text suggestions are now active.

Authentication persists for the life of the LSP process (i.e., until the server restarts).

---

## Copilot Chat Setup

Chat uses the GitHub Copilot API directly and requires a **GitHub Personal Access Token (PAT)**.

### How to get a PAT

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens (or classic).
2. Create a new token. For Copilot Individual, no special scopes are required beyond basic account access.
3. Copy the token (it starts with `ghp_`).

### How to use it in the editor

1. Click the ⚙ (settings) icon in the Copilot Chat header.
2. Paste the token in the input field and click **Save Token**.
3. The token is stored in `localStorage` (browser only, never sent to the server except per-request).
4. Type a question in the chat input and press **Enter** or click **↑**.

### Example prompts

- `explain this function`
- `add error handling to the save route`
- `write a unit test for this module`
- `refactor this to use async/await`
- `what does this Python script do?`

---

## Supported File Types

The editor opens any text-based file. Binary files (`.xlsx`, `.png`, `.pdf`, etc.) are blocked at the API level.

| Extension | Language / Highlighting |
|---|---|
| `.ts`, `.tsx` | TypeScript |
| `.js`, `.jsx`, `.mjs` | JavaScript |
| `.py` | Python |
| `.json`, `.jsonc` | JSON |
| `.md` | Markdown |
| `.css`, `.scss` | CSS / SCSS |
| `.html`, `.htm` | HTML |
| `.yaml`, `.yml` | YAML |
| `.sh`, `.bash` | Shell |
| `.ps1` | PowerShell |
| `.sql` | SQL |
| `.xml` | XML |
| `.env`, `.txt` | Plain text |

---

## Security Notes

- All file paths sent to the backend are resolved against the project root (`process.cwd()`). Any path that resolves outside the root is rejected with `400 Bad Request`.
- The GitHub PAT for chat is passed per-request and is never written to disk or stored in server memory.
- The Copilot LSP process runs locally on the server machine and communicates with GitHub's servers only for token validation and completion requests.
