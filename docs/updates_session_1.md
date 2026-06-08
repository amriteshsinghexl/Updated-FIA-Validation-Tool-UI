# Session 1 Updates — FIA Validation Tool UI

This document records all changes made in the first development session. Use it as context at the start of the next session.

---

## 1. Dependency Fix

**Problem:** `npm start` failed with `'cross-env' is not recognized`.

**Cause:** `node_modules` had never been installed in this environment. `cross-env` is declared in `devDependencies` but was absent.

**Fix:** Ran `npm install` to install all 447 packages.

---

## 2. Dynamic Product List from Folder Names

### Goal
Replace the hardcoded product dropdown (`VA`, `FIA`, `Fixed Annuity`) with a live list derived from folder names inside `C:\projects\`. Adding a new product folder automatically makes it appear — no code changes required.

### Server — `server/routes.ts`

Added `GET /api/products`:

```ts
const PRODUCTS_DIR =
  process.env.PRODUCTS_DIR ?? path.resolve(process.cwd(), "..");
// Defaults to C:\projects\ (parent of the app's own directory)

app.get("/api/products", (_req, res) => {
  const entries = fs.readdirSync(PRODUCTS_DIR, { withFileTypes: true });
  const products = entries
    .filter(e => e.isDirectory() && e.name !== path.basename(process.cwd()))
    .map(e => ({ id: e.name, label: e.name }));
  res.json({ products });
});
```

- Excludes the app's own folder (`Updated-FIA-Validation-Tool-UI`) automatically.
- Override the scan directory via `PRODUCTS_DIR` environment variable.
- Currently returns: `[{ id: "UL", label: "UL" }]`

### Client — `client/src/pages/InputsView.tsx`

- `useEffect` fetches `/api/products` once on mount.
- First product is auto-selected as default.
- `<SelectItem>` list rendered dynamically from API response.

---

## 3. Model Run Integration

### Goal
Clicking **Run Calculation** actually executes `C:\projects\{product}\run_model.py` and streams its stdout/stderr live into the UI.

### Convention
Each product folder must contain a `run_model.py` entry point at its root.

| Run Type | Command |
|---|---|
| Portfolio (all scenarios) | `python run_model.py` |
| Single Scenario | `python run_model.py --scenario-id {id}` |
| Analysis Mode: Debug | adds `--mode per_policy` |
| Analysis Mode: Summary | adds `--mode summary` (default) |

Python executable defaults to `python`. Override with `PYTHON_EXEC` env var.

---

### New Server Endpoints — `server/routes.ts`

#### `POST /api/run`

Spawns `run_model.py` for the selected product.

**Request body:**
```json
{
  "product":    "UL",
  "runType":    "portfolio" | "single",
  "scenarioId": 1,
  "mode":       "summary" | "per_policy" | "both",
  "device":     "cpu" | "cuda",
  "outputDir":  "./results/custom_run"
}
```

**Response:**
```json
{ "runId": "uuid-v4" }
```

- Returns immediately; the process runs in the background.
- All stdout/stderr is buffered in an in-memory `Map<runId, RunJob>`.

#### `GET /api/run/:runId/stream`

Server-Sent Events (SSE) stream. Each event is one of:

```json
{ "line": "some output text" }
{ "done": true, "exitCode": 0 }
```

- Late-joining clients receive all buffered lines first, then live updates.
- Disconnect safe: subscriber is removed from the job's set on `req.close`.

#### `GET /api/run/:runId/status`

Returns full buffered output and current status.

```json
{
  "runId": "...",
  "status": "running" | "completed" | "failed",
  "exitCode": 0,
  "lineCount": 42,
  "output": ["line1", "line2", ...],
  "elapsedMs": 3200
}
```

#### `POST /api/calculate` (kept for compatibility)

Now delegates to the same job/spawn logic as `/api/run`. Returns `{ runId, streamUrl }`.

---

### RunJob Store

```ts
interface RunJob {
  runId: string;
  status: "running" | "completed" | "failed";
  exitCode: number | null;
  output: string[];           // all lines, buffered
  subscribers: Set<Response>; // active SSE clients
  startedAt: number;
  endedAt: number | null;
}
```

Jobs older than 1 hour are cleaned up automatically every 10 minutes.

---

### UI Changes — `client/src/pages/InputsView.tsx`

- **Run Type** options renamed: `Portfolio (all scenarios)` / `Single Scenario`
- **Policy ID** field replaced by **Scenario ID** field (integer, maps to `--scenario-id`)
- **Button label** is dynamic: "Run Portfolio" / "Run Single Scenario"
- **Terminal output panel** replaces the old JSON result card:
  - Dark terminal with syntax-coloured output:
    - Green → normal stdout
    - Yellow/bold → separator lines (lines starting with `=`)
    - Red → `[stderr]` or `[error]` prefixed lines
  - Auto-scrolls to bottom as lines arrive
  - Status banner: blue pulsing dot (running) / green tick (completed) / red X (failed) with exit code
  - `×` button clears the panel and closes the SSE connection
  - Line count shown in footer

---

## 4. TypeScript Config Fix

Added `"target": "ES2022"` to `tsconfig.json` to resolve TS2802 errors when iterating `Set<Response>` and `Map`. Also replaced `for...of` loops over `Set`/`Map` with `.forEach()` as the definitive fix.

---

## 5. File Changes Summary

| File | Change |
|---|---|
| `server/routes.ts` | Added `/api/products`, `/api/run`, `/api/run/:id/stream`, `/api/run/:id/status`; updated `/api/calculate` |
| `client/src/pages/InputsView.tsx` | Dynamic product dropdown; SSE-connected terminal output panel |
| `tsconfig.json` | Added `"target": "ES2022"` |
| `package.json` | No changes (cross-env was already declared, just not installed) |

---

## 6. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PRODUCTS_DIR` | `../` (parent of app root) | Directory scanned for product folders |
| `PYTHON_EXEC` | `python` | Python executable used to spawn `run_model.py` |

---

## 7. How to Run

```powershell
# Install dependencies (first time only)
npm install

# Development mode (Vite + tsx watch)
npm run dev

# Production build + start
npm run build
npm start
```

Open `http://localhost:3000`. Select **UL** from the product dropdown and click **Run Portfolio** to execute `C:\projects\UL\run_model.py`.
