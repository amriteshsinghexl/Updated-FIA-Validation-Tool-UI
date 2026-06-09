# VA Financial Summary View — UI Feature

**Date:** 2026-06-09
**File:** `client/src/pages/VAFinancialSummaryView.tsx`
**Route:** `/va-financial-summary` (reachable via **Results Reports → Financial Summary** in the top ribbon when product = **VA**)

---

## Overview

The VA Financial Summary view browses the Excel result files produced by the VA
model (`C:\projects\VA\results`). It lists every result file and its worksheets
in a **collapsible left-hand tree** and renders the selected sheet as a
paginated table on the right.

The ribbon's **Reports → Financial Summary** item routes to `/va-financial-summary`
when the active product is VA, and to `/financial-summary` (the UL view) otherwise:

```tsx
onClick={() => setLocation(isVA ? "/va-financial-summary" : "/financial-summary")}
```

---

## Layout

```
┌───────────────────────────────────────────────────────────────────────┐
│ [⮜] 📄 Financial Summary                              [Download Excel] │
│      VA Results — <file> / <sheet>                                     │
├──────────────────────────┬────────────────────────────────────────────┤
│ FILES (n)                │  <sheet> — N rows              ◀ 1/N ▶      │
│ ▾ 📄 results_2025Q4.xlsx │ ┌────────┬─────────┬─────────┬────────────┐ │
│     📄 Summary           │ │ Header │ Header  │ Header  │   ...      │ │
│     📄 Cashflows  ◀ active│ │  val   │  val    │  val    │   ...      │ │
│ ▸ 📄 results_2025Q3.xlsx │ │  ...   │  ...    │  ...    │   ...      │ │
│ ▸ 📄 results_2025Q2.xlsx │ └────────┴─────────┴─────────┴────────────┘ │
└──────────────────────────┴────────────────────────────────────────────┘
       ▲ left sidebar tree            ▲ sheet data table
```

---

## Sidebar — file / sheet tree

The sidebar replaces the earlier "file cards on top + sheet tabs in a row"
layout. Files and sheets are now a single vertical tree.

| Element | Behaviour |
|---|---|
| **File node** | Chevron + spreadsheet icon + filename + size · date. Clicking the row selects the file (loads its sheets) **and** expands it. |
| **Expand / collapse chevron** | `▸` collapsed / `▾` expanded. Clicking the chevron (`stopPropagation`) toggles the node **without** changing the selection. |
| **Sheet children** | Rendered indented (`pl-9`) beneath the expanded, active file. Clicking a sheet loads it into the table. Active sheet highlighted with `border-primary` + tint. |
| **Sidebar toggle** | The `PanelLeftClose` / `PanelLeftOpen` button at the far left of the header collapses/expands the **entire** sidebar so the table can use the full width. |

Only the **active** file shows its sheet children, because sheet names are
fetched per-file (`/api/va/results/:file/sheets`) keyed on `activeFile`.
Expanding a different file makes it active and loads its sheets.

### Auto-expand on load

A `useEffect` expands the active file the first time it becomes known, so the
tree opens to the currently displayed file/sheet instead of fully collapsed:

```ts
useEffect(() => {
  if (activeFile && expandedFile === null) {
    setExpandedFile(activeFile);
  }
}, [activeFile, expandedFile]);
```

The guard (`expandedFile === null`) means it only fires once — after the user
manually collapses a file it stays collapsed.

---

## State

| Variable | Type | Purpose |
|---|---|---|
| `selectedFile` | `string \| null` | User-chosen file (`activeFile` falls back to `files[0]`) |
| `selectedSheet` | `string \| null` | User-chosen sheet (`activeSheet` falls back to `sheets[0]`) |
| `page` | `number` | Current page index (0-based) for the sheet table |
| `expandedFile` | `string \| null` | Which file node is expanded in the tree |
| `sidebarOpen` | `boolean` | Whether the whole sidebar is shown (default `true`) |

### Handlers

| Handler | Effect |
|---|---|
| `handleFileSelect(name)` | Sets selected file, resets sheet + page, sets `expandedFile = name` |
| `toggleExpand(name)` | Toggles `expandedFile` between `name` and `null` (chevron only) |
| `handleSheetSelect(name)` | Sets selected sheet, resets page |
| `handleDownload()` | Opens `GET /api/va/results/:file/download` |

---

## Data fetching (React Query v5)

| Query key | Returns | Enabled when |
|---|---|---|
| `["/api/va/results"]` | `{ files: ResultFile[] }` | always |
| `` [`/api/va/results/${activeFile}/sheets`] `` | `{ sheets: string[] }` | `activeFile` set |
| `` [`/api/va/results/${activeFile}/sheet/${activeSheet}`] `` | `SheetData` | file + sheet set |

```ts
interface ResultFile { name: string; size: number; modified: string; }
interface SheetData  { filename: string; sheetName: string; headers: string[]; rows: string[][]; }
```

---

## Table styling

| Feature | Detail |
|---|---|
| Sticky header | `sticky top-0 z-10` on `<thead>` |
| Dark header | `bg-slate-900 text-white` |
| Alternating rows | Even: `bg-background`; odd: `bg-muted/30` |
| Numeric cells | Right-aligned, monospace, formatted via `fmtCell()` (2–4 decimals) |
| Negative numbers | `text-red-600` |
| Empty cells | render as `—` |
| Height | `max-h-[calc(100vh-220px)]` inside a `flex-1 overflow-auto` pane |
| Empty state | Spreadsheet icon + "Select a file and sheet to view its contents" |

---

## Pagination

Client-side, `PAGE_SIZE = 100`. Arrows in the table header bar; `totalPages =
Math.ceil(sheetData.rows.length / PAGE_SIZE)`.

---

## Dependencies used

| Package | Usage |
|---|---|
| `@tanstack/react-query` v5 | File list, sheet list, sheet data |
| `lucide-react` | `FileSpreadsheet`, `FileText`, `Download`, `ChevronLeft/Right/Down`, `PanelLeftClose/Open` |
| `@/components/ui/button` | Pagination + Download controls |
| `@/lib/utils` (`cn`) | Conditional class names for tree nodes |

---

## Backend endpoints

| Action | Endpoint |
|---|---|
| List result files | `GET /api/va/results` |
| List sheets in a file | `GET /api/va/results/:file/sheets` |
| Load sheet data | `GET /api/va/results/:file/sheet/:sheetName` |
| Download Excel | `GET /api/va/results/:file/download` |

See `server/routes.ts` for the VA results handlers.
