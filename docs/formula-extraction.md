# Formula Extraction — UI Feature

**Date:** 2026-06-01  
**Files changed:** `client/src/components/layout/TopRibbon.tsx`  
**Navigation:** Top Ribbon → Results Reports → Reports ▾ → Formula Extraction  
**Backend dependency:** ULP FastAPI backend at `VITE_ULP_API_BASE` (default `http://localhost:8000`)

---

## Overview

The Formula Extraction feature connects the **Results Reports** dropdown to the ULP model's formula registry. It lets users:

1. **Browse** the actuarial formulas behind every output variable, grouped by model stage.
2. **Inspect** a variable's full formula, dependency graph, description, and AST-extracted Python source in a modal dialog.
3. **Export** the current model results as an Excel workbook (`.xlsx`) where selected cells contain live Excel formulas — enabling Excel's native *Trace Precedents* feature to show which cells were used to compute any given value.

---

## Navigation Path

```
Top Ribbon
  └── Results Reports group
        └── Reports ▾  (DropdownMenu)
              ├── Financial Summary
              ├── Audit Report
              ├── Validation Report
              └── Formula Extraction  →  sub-popover (right-side)
```

The Formula Extraction item is a `Popover` nested inside the `DropdownMenuContent`. Clicking it opens a right-aligned sub-panel without closing the parent dropdown.

---

## UI Layout

```
┌──────────────────────────────────────────┐
│  ULP Output Variables          [spinner] │
├──────────────────────────────────────────┤
│  ☑  Select All (33)                      │
├──────────────────────────────────────────┤
│  PART 2 — DECREMENTS                     │
│  ☐  Policies IF (Start of Month)     [ℹ] │
│  ☐  Number of Deaths                 [ℹ] │
│  ☐  Number of Surrenders             [ℹ] │
│  ☐  Number of Maturities             [ℹ] │
│  ☐  Policies In Force (End of Month) [ℹ] │
├──────────────────────────────────────────┤
│  PART 3 PASS 1 — CASHFLOWS              │
│  ☐  Basic Premium Income             [ℹ] │
│  ...                                     │
├──────────────────────────────────────────┤
│  [error message if export fails]         │
│  [▼ Export to Excel (N)]                 │
└──────────────────────────────────────────┘
```

- Variables are grouped by model stage using `formulasByPart` (derived from the API response).
- The **ℹ** icon appears on hover for each row; clicking it opens the formula detail dialog.
- The variable list is scrollable (`ScrollArea`, `h-64`).
- The export button shows a spinner while the Excel file is being generated.

---

## Formula Detail Dialog

Clicking the **ℹ** icon next to any variable opens a `Dialog` with:

| Section | Content |
|---|---|
| Title | `display_name` of the variable |
| Subtitle | Model stage (e.g. "Part 3 Pass 1 — Cashflows") |
| Formula | Actuarial formula string in a monospace code block |
| Depends On | `Badge` chips for each dependent output column |
| Description | Plain-text explanation of the computation |
| Python Source | AST-extracted Python snippet from the model file (if available), in a scrollable code block |

---

## State Variables

| Variable | Type | Purpose |
|---|---|---|
| `formulaEntries` | `FormulaEntry[]` | Formula registry loaded from the ULP backend |
| `formulaLoading` | `boolean` | True while the initial fetch is in progress |
| `selectedFields` | `string[]` | Column names currently checked in the list |
| `showFormulaDialog` | `boolean` | Controls the detail dialog open/close state |
| `activeFormula` | `FormulaEntry \| null` | Entry currently shown in the detail dialog |
| `exporting` | `boolean` | True while the Excel file is being fetched |
| `exportError` | `string \| null` | Last export error message (shown inline) |
| `formulasByPart` | `Record<string, FormulaEntry[]>` | Derived: entries grouped by model stage |

---

## Data Fetching

### Formula Registry

Fetched once on mount via `useEffect`:

```ts
async function fetchFormulaRegistry(): Promise<FormulaEntry[]> {
  const res = await fetch(`${ULP_BASE}/api/v1/outputs/formulas`);
  const data = await res.json();
  return data.formulas;
}
```

If the ULP backend is unreachable the list remains empty and a fallback message is shown:
> "ULP backend not reachable. Start the backend and refresh."

### Latest Run (for Excel export)

Before downloading Excel the UI resolves the most recent completed run:

```ts
async function fetchLatestRun(): Promise<{ run: string; scenario_id: number } | null> {
  const data = await fetch(`${ULP_BASE}/api/v1/outputs`).then(r => r.json());
  const latest = data.runs[data.runs.length - 1];
  // finds the first summary_scen*.csv in the run's file list
  // returns { run: "test_1", scenario_id: 1 }
}
```

If no run is found an inline error is shown instead of triggering a download.

---

## Excel Export Flow

```
User clicks "Export to Excel"
  → fetchLatestRun()
      → GET /api/v1/outputs
  → fetch(`/api/v1/outputs/{run}/excel/{scenario_id}?fields=col1,col2,...`)
      → ULP backend generates .xlsx filtered to selected columns (openpyxl)
  → response.blob()
  → URL.createObjectURL(blob)
  → programmatic <a download> click
  → revokeObjectURL
```

The downloaded file is named `ulp_{run}_scen{scenario_id}_formulas.xlsx`.

If one or more variables are checked in the list, only those columns (plus the `t` time index) appear in the **Summary Data** sheet of the downloaded workbook. The **Formula Reference** and **Python Source** sheets always contain all variables regardless of selection. If no variables are checked, the export includes all columns.

---

## `FormulaEntry` Interface

```ts
interface FormulaEntry {
  name:          string;       // CSV column name, e.g. "cf_before_zv"
  display_name:  string;       // "Cashflow Before Zeroising"
  formula:       string;       // actuarial formula string
  depends_on:    string[];     // other output column names
  part:          string;       // model stage label
  description:   string;       // longer explanation
  python_source: string | null; // AST-extracted Python source snippet
}
```

---

## Excel Workbook Contents

The downloaded `.xlsx` has three sheets:

| Sheet | Contents |
|---|---|
| **Summary Data** | All projection periods (one row per `t`). Cells that are pure linear combinations of other output columns contain live Excel formulas. Every cell has a hover comment with the formula, dependencies, and description. |
| **Formula Reference** | Lookup table — variable, display name, stage, formula, depends-on, description. Colour-coded by model stage. |
| **Python Source (AST)** | Raw Python code extracted from the model source for each variable. |

### Variables with Live Excel Formulas

Clicking these cells in Excel and using **Formulas → Trace Precedents** shows blue arrows to the cells they were computed from:

| Variable | Formula Logic |
|---|---|
| `no_pols_ifsm` | `MAX(no_pols_if[t-1] - no_mats[t-1], 0)` |
| `no_pols_if` | `no_pols_ifsm - no_deaths - no_surrs - no_mats` |
| `prem_inc_if` | `basic_prem_if + topup_prem_if` |
| `cf_before_zv` | Sum of income columns minus expense/outgo columns |
| `cf_after_tax` | `cf_after_zv - op_tax` |
| `tot_res_if` | `unit_res_end + zeroising_res_if` |
| `cf_after_scr` | `cf_after_tax + scr[t-1] - scr[t] + scr_inv_inc - scr_inc_tax` |

---

## ULP Backend Configuration

The ULP API base URL is read from the Vite environment variable:

```
VITE_ULP_API_BASE=http://localhost:8000
```

Defaults to `http://localhost:8000` if not set. Configure in `.env.local` for non-default ports or remote deployments.

---

## New Imports in `TopRibbon.tsx`

| Import | Source |
|---|---|
| `useEffect`, `useCallback` | `react` |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` | `@/components/ui/dialog` |
| `Badge` | `@/components/ui/badge` |
| `ScrollArea` | `@/components/ui/scroll-area` |
| `Download`, `Loader2`, `Info` | `lucide-react` |

---

## Backend Reference

Full backend documentation for the formula registry and Excel endpoint:  
`C:\projects\UL\docs\formula-extraction-api.md`

---

## Error States

| Condition | User-facing message |
|---|---|
| ULP backend down at page load | List shows "ULP backend not reachable. Start the backend and refresh." |
| No completed run found on export | Inline error: "No completed ULP run found. Run the model first." |
| Server error during Excel generation | Inline error: "Server error: {status}" |
| Network failure during export | Inline error: error message from the `fetch` rejection |
