# VA Model Integration

Documents all changes that add Variable Annuity (VA) as a product alongside UL
in the FIA Validation Tool UI.

---

## Architecture summary

| Layer | Change |
|---|---|
| `server/routes.ts` | VA spawns `run.py` directly (no FastAPI proxy); `/api/open-file`; VA assumptions CRUD endpoints |
| `client/src/context/ProductContext.tsx` | New — shared product state across components |
| `client/src/App.tsx` | Wrapped with `<ProductProvider>`; `/va-assumptions` route added |
| `client/src/pages/InputsView.tsx` | VA now shows Run Type + Analysis Mode (same as UL) |
| `client/src/pages/VAAssumptionsView.tsx` | New — in-app multi-sheet editor for `Assumptions_Extracted.xlsx` |
| `client/src/components/layout/TopRibbon.tsx` | VA Assumptions button navigates to `/va-assumptions` instead of opening file |

---

## 1. `ProductContext.tsx` (new file)

**Path:** `client/src/context/ProductContext.tsx`

Provides a React context so both `InputsView` and `TopRibbon` share the same
selected product without prop-drilling.

```tsx
const { product, setProduct } = useProduct();
const isVA = product === "VA";
```

`ProductProvider` is mounted in `App.tsx` wrapping the entire app.

---

## 2. `server/routes.ts`

### VA run — direct subprocess

`POST /api/run` with `product=VA` now spawns `run.py` directly instead of
proxying to a FastAPI backend.

**Command built by Express:**
```
py  C:\projects\VA\run.py
    --policy-path      C:\projects\VA\data\Input_PolicyDataRaw.xlsx
    --assumptions-path C:\projects\VA\data\Assumptions_Extracted.xlsx
    --output-dir       C:\projects\VA\results
    [--policy-id <scenarioId>]   ← only when runType = "single"
    [--months <months>]
```

- stdout/stderr are piped and pushed line-by-line to the SSE job store — identical
  mechanism to UL.
- `runType="single"` with a `scenarioId` maps to `--policy-id`.

**Python executable:** `py` (Windows Python Launcher) — resolves to
`C:\Users\vmuser\AppData\Local\Programs\Python\Python314\python.exe`.
Controlled by the `PYTHON_EXEC` env var (default `"py"`).

### `/api/open-file` (new endpoint)

`POST /api/open-file` accepts `{ filePath: string }` and opens the file or
folder with the Windows default application using `start "" "<path>"`.

Used by the ribbon buttons to open VA data files and the results folder.

### Parameters accepted from UI (VA run body)

| Field | Usage |
|---|---|
| `product` | `"VA"` — selects the VA branch |
| `runType` | `"portfolio"` or `"single"` |
| `scenarioId` | Policy ID — passed as `--policy-id` when `runType="single"` |
| `months` | Projection months — passed as `--months` |
| `mode` | `"summary"` / `"per_policy"` — informational, not forwarded to `run.py` |

---

## 3. `client/src/pages/InputsView.tsx`

### Product state lifted to context

`product` / `setProduct` now come from `useProduct()` instead of local state.
This keeps `TopRibbon` in sync without prop-passing.

### Unified form fields (all products)

The conditional VA / UL form split is removed.  All products show the same
fields:

| Field | Notes |
|---|---|
| Valuation Date | Dropdown — Q1–Q4 2025 |
| Projection Months | Shown for VA only (defaults to 480); hidden for UL |
| Product | Dynamic from `GET /api/products` |
| Run Type | "All Policies" / "Single Policy" for VA; "Portfolio" / "Single Scenario" for UL |
| Policy ID / Scenario ID | Text for VA, number for UL; shown only when Run Type = Single |
| Analysis Mode | Summary / Debug — shown for all products |

**Removed fields:** Reserve Basis, Reserve Method, VA Policy ID (were VA-only).

### Run body (same structure for all products)

```js
{
  product,
  runType,
  scenarioId: runType === "single" ? scenarioId : undefined,
  mode: analysisMode === "debug" ? "per_policy" : "summary",
  months: isVA ? projectionMonths : undefined,
}
```

### Terminal header

- VA: `VA/run.py [--policy-id <id>] [--months N]`
- UL: `UL/run_model.py [--scenario-id N]`

### Button labels

| State | Label |
|---|---|
| Running | "Running…" |
| VA, idle | "Run VA Model" |
| UL portfolio, idle | "Run Portfolio" |
| UL single, idle | "Run Single Scenario" |

---

## 4. `client/src/components/layout/TopRibbon.tsx`

### VA-aware ribbon buttons

When `product === "VA"`, ribbon buttons behave differently from UL:

| Button | Non-VA behaviour | VA behaviour |
|---|---|---|
| Data View | Navigate to `/data` | Open `C:\projects\VA\data\Input_PolicyDataRaw.xlsx` via `POST /api/open-file` |
| Assumptions | Navigate to `/assumptions` | Navigate to `/va-assumptions` (in-app editor) |
| Reports → Financial Summary | Navigate to `/financial-summary` | Navigate to `/va-financial-summary` (VA results tree viewer) |
| Reports → Open Results Folder | — | Open `C:\projects\VA\results\` folder via `POST /api/open-file` |

The `openVAFile(filePath)` helper is used for Data View and Results Folder:

```ts
function openVAFile(filePath: string) {
  fetch("/api/open-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath }),
  });
}
```

The **Assumptions** button navigates to `/va-assumptions` using `<Link href="/va-assumptions">`,
giving the user an in-app multi-sheet editor for `Assumptions_Extracted.xlsx` instead of
opening the file externally.

---

## 5. `client/src/pages/VAAssumptionsView.tsx` (new)

**Path:** `client/src/pages/VAAssumptionsView.tsx`  
**Route:** `/va-assumptions`

In-browser editor for `C:\projects\VA\data\Assumptions_Extracted.xlsx`.

### Features

| Feature | Description |
|---|---|
| Sheet sidebar | Left-hand panel listing the file name (`Assumptions_Extracted.xlsx`) and one row per worksheet; active sheet highlighted with a left-border accent |
| Collapse sidebar | `PanelLeftClose` / `PanelLeftOpen` button in the header hides/shows the sheet sidebar so the table can use the full width |
| Inline cell editing | Double-click any header or data cell to edit; Enter or Blur commits |
| Add Row / Add Column | Buttons at the bottom of the table |
| Delete row | Hover over a row to reveal the trash icon |
| Add sheet | Click `+` next to the tabs; type a name and press Enter |
| Delete sheet | Click `×` on the active tab (disabled when only one sheet remains) |
| Save | Sends `POST /api/va/assumptions/sheet/:sheetName`; enabled only when data is dirty |
| Download | Opens `GET /api/va/assumptions/download` to download the full `.xlsx` |
| Unsaved-changes guard | Confirms before switching sheets when there are pending edits |

### API calls made

| Action | Endpoint |
|---|---|
| Load sheet list | `GET /api/va/assumptions/sheets` |
| Load sheet data | `GET /api/va/assumptions/sheet/:sheetName` |
| Save edits | `POST /api/va/assumptions/sheet/:sheetName` |
| Add new sheet | `POST /api/va/assumptions/sheets` |
| Delete sheet | `DELETE /api/va/assumptions/sheet/:sheetName` |
| Download file | `GET /api/va/assumptions/download` |

---

## How to start

```bash
# FIA UI only — no separate VA process needed
cd C:\projects\Updated-FIA-Validation-Tool-UI
npm run dev
```

Open **http://localhost:3000** → select **VA** → configure Run Type → click **Run VA Model**.

---

## Product discovery

`GET /api/products` scans `C:\projects\` and returns all subfolders.

| Folder | Run mechanism |
|---|---|
| `UL` | Express subprocess → `run_model.py` |
| `VA` | Express subprocess → `run.py` (direct) |

---

## VA docs location

| File | Contents |
|---|---|
| `docs/va-financial-summary-view.md` | VA Financial Summary view — file/sheet tree sidebar + results table |
| `C:\projects\VA\docs\api_reference.md` | Express endpoints for VA runs + `/api/open-file` |
| `C:\projects\VA\docs\architecture.md` | System diagram, request flow, directory layout |
| `C:\projects\VA\docs\running.md` | CLI usage, arguments, input/output paths |
