# Assumption File Manager — UI Feature

**Date:** 2026-06-01  
**Files changed:** `client/src/pages/AssumptionsView.tsx`  
**Route:** `/assumptions` (reachable via the top ribbon → **Inputs** popout → **Assumptions** button, under the Input Views group)

---

## Overview

The Assumptions page was rebuilt from a static placeholder into a live file manager that reads, displays, uploads, and deletes assumption parameter table files stored in the UL model's `param_tables` directory.

---

## Layout

```
┌────────────────────────────────────────────────────────────────┐
│  TopRibbon  (unchanged)                                        │
├────────────────────┬───────────────────────────────────────────┤
│  LEFT PANEL        │  RIGHT PANEL                             │
│  Parameter Tables  │                                          │
│  [Upload New File] │  admin_chg_tbl.csv   [Replace] [Delete] │
│  ─────────────────│  28 rows × 5 cols                        │
│  admin_chg_tbl.csv │  ──────────────────────────────────────  │
│  alloc_chg_tbl.csv │  #  | col1 | col2 | col3 | col4 | col5  │
│  basic_lb_rate.csv │  1  | ...  | ...  | ...  | ...  | ...   │
│  coi_tbl.csv       │  2  | ...  | ...  | ...  | ...  | ...   │
│  ...               │  ...                                     │
└────────────────────┴───────────────────────────────────────────┘
```

---

## Component: `AssumptionsView`

**Location:** `client/src/pages/AssumptionsView.tsx`

### State

| State variable | Type | Purpose |
|---|---|---|
| `selectedFile` | `string \| null` | Filename currently open in the right panel |

### Refs

| Ref | Purpose |
|---|---|
| `uploadInputRef` | Hidden `<input type="file">` for uploading a brand-new file |
| `replaceInputRef` | Hidden `<input type="file">` for replacing the currently selected file |

---

## Data Fetching (React Query v5)

### File list

```ts
useQuery({
  queryKey: ["/api/assumptions/files"],
  queryFn: () => fetch("/api/assumptions/files").then(r => r.json()),
})
// Returns: { files: Array<{ name, size, modified }> }
```

### File content

```ts
useQuery({
  queryKey: ["/api/assumptions/files", selectedFile],
  queryFn: () => fetch(`/api/assumptions/files/${encodeURIComponent(selectedFile)}`).then(r => r.json()),
  enabled: !!selectedFile,
})
// Returns: CsvData | TextData  (see Types section)
```

---

## Mutations

### Upload / Replace

```ts
useMutation({
  mutationFn: ({ filename, content }) =>
    fetch("/api/assumptions/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content }),
    }),
  onSuccess: () => { invalidate file list + file content queries; set selectedFile to uploaded filename }
})
```

The file is read client-side with `FileReader.readAsText()` before being sent.  
- **Upload New File** uses `file.name` as the filename.  
- **Replace** re-uses the currently `selectedFile` name (overwrites in-place).

### Delete

```ts
useMutation({
  mutationFn: (filename) =>
    fetch(`/api/assumptions/files/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  onSuccess: () => { invalidate file list; clear selectedFile if it was deleted }
})
```

A `window.confirm()` dialog is shown before the DELETE request is sent.

---

## Sub-component: `CsvTable`

Renders CSV data as a spreadsheet-style HTML table.

| Feature | Detail |
|---|---|
| Sticky header row | `sticky top-0 z-10` — stays visible while scrolling |
| Row numbers | First column, `#`, non-selectable; 1-indexed |
| Alternating row colors | Even rows white, odd rows `bg-slate-50/60` |
| Hover highlight | `hover:bg-blue-50/60` |
| Monospace values | `font-mono` on all data cells |
| Horizontal scroll | Parent `overflow-auto` on the container |

---

## Types

```ts
interface FileInfo {
  name: string;
  size: number;       // bytes
  modified: string;   // ISO 8601
}

interface CsvData {
  filename: string;
  type: "csv";
  headers: string[];
  rows: string[][];   // rows[rowIndex][colIndex]
}

interface TextData {
  filename: string;
  type: "text";
  content: string;
}

type FileData = CsvData | TextData;
```

---

## File Type Handling

| Extension | Display mode |
|---|---|
| `.csv` | Parsed table (`CsvTable` component) |
| `.yaml` / `.yml` | Raw text in `<pre>` with monospace font |
| Any other | Raw text in `<pre>` |

---

## Accepted Upload Extensions

`.csv`, `.yaml`, `.yml`, `.txt`

---

## Dependencies Used

| Package | Usage |
|---|---|
| `@tanstack/react-query` v5 | Data fetching and cache invalidation |
| `lucide-react` | Icons: `Upload`, `Trash2`, `FileSpreadsheet`, `FileText`, `RefreshCw` |
| `@/hooks/use-toast` | Success / error notifications |
| `@/components/ui/button` | Action buttons |
| `@/lib/utils` (`cn`) | Conditional class merging |

---

## Adding More File Types

To add special rendering for a new extension (e.g., `.json`):

1. Add the extension to the `accept` attribute on both file inputs.
2. In the backend route (`GET /api/assumptions/files/:filename`), return `{ type: "json", ... }`.
3. Add a new branch in `AssumptionsView`'s content render block alongside the `csv` and `text` cases.
