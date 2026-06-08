# Financial Summary View — UI Feature

**Date:** 2026-06-01  
**Files changed:** `client/src/pages/FinancialSummaryView.tsx`, `client/src/App.tsx`, `client/src/components/layout/TopRibbon.tsx`, `server/routes.ts`  
**Route:** `/financial-summary` (reachable via **Results Reports → Financial Summary** in the top ribbon)

---

## Overview

The Financial Summary view displays the actuarial projection output produced by the UL model's most recent run. It reads two CSV files from `C:\projects\UL\results\test_1` via a new Express endpoint and renders them as:

1. **Scenario KPI cards** — high-level metrics from `scenario_metrics_summary.csv`
2. **Projection output table** — per-period cashflow data from `summary_scen1.csv`, paginated and formatted in millions

A **Download CSV** button exports the full dataset (both sections) as a single formatted CSV file.

---

## Navigation

```
Top Ribbon  →  Results Reports group  →  Reports ▾  →  Financial Summary
```

The `DropdownMenuItem` in `TopRibbon.tsx` calls `setLocation("/financial-summary")` on click.

---

## Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  TopRibbon  (unchanged)                                            │
├────────────────────────────────────────────────────────────────────┤
│  📄 Financial Summary                                              │
│     Results: test_1 — monetary values in millions (÷ 1,000,000)   │
├────────────┬────────────┬──────────┬──────────┬──────────┬────────┤
│ Scenario ID│ Elapsed(s) │ Output   │ APE(mil) │ PV CF    │  ...   │
│     1      │  1089.63   │ scen1.csv│26,996,165│-17,772,084│  ...  │
├────────────────────────────────────────────────────────────────────┤
│  Projection Output — Scenario 1          [Download CSV]  ◀ 1/N ▶  │
├────────┬──────────┬───────────┬──────────┬──────────┬─────────────┤
│ Period │Policies  │Prem Income│Death Outgo│Surr Outgo│ Total Res  │
│   0    │   —      │    —      │    —      │    —     │    ...     │
│   1    │490,787.89│14,395,729 │   31.99   │   41.10  │    ...     │
│  ...   │  ...     │  ...      │   ...     │  ...     │    ...     │
└────────┴──────────┴───────────┴──────────┴──────────┴─────────────┘
```

---

## Component: `FinancialSummaryView`

**Location:** `client/src/pages/FinancialSummaryView.tsx`

### State

| Variable | Type | Purpose |
|---|---|---|
| `page` | `number` | Current page index (0-based) for the projection table |

### Constants

| Constant | Value | Purpose |
|---|---|---|
| `PAGE_SIZE` | `100` | Rows per page in the projection table |
| `COLUMN_LABELS` | `Record<string, string>` | Human-readable header labels keyed by CSV column name |

---

## Data Fetching (React Query v5)

```ts
useQuery<FinancialSummaryData>({
  queryKey: ["/api/results/financial-summary"],
})
```

The default `queryFn` is supplied by the app's shared `queryClient` configuration, which converts the query key to a `GET` request URL. No additional `queryFn` is required.

**Response shape:**

```ts
interface FinancialSummaryData {
  metrics?: {          // from scenario_metrics_summary.csv
    headers: string[];
    rows: string[][];
  };
  summary?: {          // from summary_scen1.csv
    headers: string[];
    rows: string[][];  // rows[periodIndex][colIndex]
  };
}
```

---

## Number Formatting

All numeric values from `summary_scen1.csv` are raw model units. The `fmtNum()` helper divides by `1,000,000` before display:

```ts
function fmtNum(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (n === 0) return "—";
  const m = n / 1_000_000;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(m);
}
```

- Negative values are rendered in **red** (`text-red-600`).
- The `Period` column (`t`) is rendered as-is (integer, no formatting).
- Zero values render as `—` to reduce visual noise.

---

## Download — `downloadCsv()`

```ts
function downloadCsv(summary: ParsedCsv, metrics?: ParsedCsv): void
```

Builds a CSV in-memory using two sections:

1. **Scenario Metrics** — raw values from `scenario_metrics_summary.csv` headers/rows
2. **Projection Output** — human-readable column labels as headers; `fmtNum()`-formatted values in millions

Triggers a browser download of `financial_summary_test_1.csv` via a temporary `<a>` element and `URL.createObjectURL()`. No server round-trip is required.

The button is placed in the projection table header bar:

```tsx
<Button variant="outline" size="sm" onClick={() => downloadCsv(summary, metrics)}>
  <Download className="h-3.5 w-3.5" /> Download CSV
</Button>
```

---

## Pagination

The projection table paginates `summary.rows` client-side. Navigation arrows appear in the top-right of the table header.

| Element | Behaviour |
|---|---|
| `◀` button | Decrements `page`; disabled at page 0 |
| `▶` button | Increments `page`; disabled at last page |
| Page indicator | `{page + 1} / {totalPages}` |
| `totalPages` | `Math.ceil(summary.rows.length / PAGE_SIZE)` |

---

## Table Styling

| Feature | Detail |
|---|---|
| Sticky header | `sticky top-0 z-10` on `<thead>` |
| Dark header | `bg-slate-900 text-white` |
| Alternating rows | Even: `bg-background`; odd: `bg-muted/30` |
| Negative numbers | `text-red-600` |
| Period column | Centered, bold, muted |
| All other cells | Right-aligned, monospace |
| Overflow | Horizontal + vertical scroll via `overflow-auto` on container |
| Height | `max-h-[calc(100vh-260px)]` — fills the viewport minus ribbon and header |

---

## Types

```ts
interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

interface FinancialSummaryData {
  metrics?: ParsedCsv;
  summary?: ParsedCsv;
}
```

---

## Route Registration

**`client/src/App.tsx`**

```tsx
import FinancialSummaryView from "@/pages/FinancialSummaryView";
// ...
<Route path="/financial-summary" component={FinancialSummaryView} />
```

---

## TopRibbon Change

**`client/src/components/layout/TopRibbon.tsx`** — line 205

```tsx
// Before
<DropdownMenuItem className="text-xs py-2">Financial Summary</DropdownMenuItem>

// After
<DropdownMenuItem className="text-xs py-2" onClick={() => setLocation("/financial-summary")}>
  Financial Summary
</DropdownMenuItem>
```

---

## Dependencies Used

| Package | Usage |
|---|---|
| `@tanstack/react-query` v5 | Fetching and caching the financial summary data |
| `lucide-react` | Icons: `FileText`, `ChevronLeft`, `ChevronRight`, `Download` |
| `@/components/ui/card` | KPI metric cards |
| `@/components/ui/button` | Pagination controls and Download button |

---

## Backend Endpoint

The view depends on `GET /api/results/financial-summary` served by the FIA Validation Tool's Express server.  
See `server/routes.ts` → `RESULTS_DIR` constant and the `/api/results/financial-summary` handler.  
Full backend documentation: `C:\projects\UL\docs\results-api.md`
