# Policy Data View — UI Feature

**Date:** 2026-06-01  
**Files changed:** `client/src/pages/DataView.tsx`  
**Route:** `/data` (reachable via the top ribbon → **Inputs** popout → **Data View** button)

---

## Overview

The Data View page was rebuilt from a static placeholder into a live file manager that lists, uploads, replaces, downloads, and deletes policy data files stored in the UL model's `policy_data` directory (`C:\projects\UL\policy_data`).

---

## Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  TopRibbon  (unchanged)                                            │
├────────────────────────────────────────────────────────────────────┤
│  Policy Data                         [Upload File]                 │
│  C:\projects\UL\policy_data                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Drop files here or click to upload                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐                        │
│  │  Total Files: 6  │  │  Total Size: …   │                        │
│  └──────────────────┘  └──────────────────┘                        │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Policy Data Files                                         │    │
│  │─────────────────────────────────────────────────────────── │    │
│  │  File Name            Size     Modified     Actions        │    │
│  │  test_policies_1.csv  2.1 KB   2026-05-30   ⬇ Replace Del │    │
│  │  test_policies_20.csv 4.5 KB   2026-05-30   ⬇ Replace Del │    │
│  │  ...                                                        │    │
│  └────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Component: `DataView`

**Location:** `client/src/pages/DataView.tsx`

### State

| State variable | Type | Purpose |
|---|---|---|
| `isDragging` | `boolean` | Highlights the drop zone while a drag is in progress |
| `pendingDelete` | `string \| null` | Filename awaiting confirmation before deletion |
| `replacingFile` | `string \| null` | Filename being targeted by the replace file picker |

### Refs

| Ref | Purpose |
|---|---|
| `fileInputRef` | Hidden `<input type="file" multiple>` for uploading new files |
| `replaceInputRef` | Hidden `<input type="file">` for replacing a specific existing file |

---

## Data Fetching (React Query v5)

### File list

```ts
useQuery({
  queryKey: ["/api/policy-data"],
  queryFn: () => fetch("/api/policy-data").then(r => r.json()),
})
// Returns: { files: Array<{ name, size, modified }> }
```

The query is invalidated after every successful upload or delete so the table refreshes automatically.

---

## Mutations

### Upload new file

Triggered by the "Upload File" button, clicking the drop zone, or dragging files onto it.

```ts
useMutation({
  mutationFn: ({ file, targetName }) =>
    fetch(`/api/policy-data/upload/${encodeURIComponent(targetName ?? file.name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,          // File object sent as raw bytes
    }),
  onSuccess: () => invalidate ["/api/policy-data"],
})
```

- Multiple files can be dropped or selected at once; each triggers a separate mutation.
- The file is streamed directly from the browser as raw bytes — no base64 encoding.

### Replace existing file

Triggered by the **Replace** button on a table row. Opens a file picker; the selected file is written over the existing entry using its current name.

```ts
uploadMutation.mutate({ file, targetName: replacingFile })
// targetName keeps the server-side filename unchanged
```

### Delete file

Triggered by the **Delete** button on a table row. An inline Yes/No confirmation replaces the button before the request is sent.

```ts
useMutation({
  mutationFn: (filename) =>
    fetch(`/api/policy-data/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  onSuccess: () => invalidate ["/api/policy-data"],
})
```

### Download file

The download icon is a plain `<a href="/api/policy-data/:filename" download>` anchor — no mutation required.

---

## Helper Functions

### `formatBytes(bytes: number): string`

Converts a raw byte count to a human-readable string.

| Range | Output format |
|---|---|
| < 1 024 | `N B` |
| < 1 048 576 | `N.N KB` |
| ≥ 1 048 576 | `N.N MB` |

### `formatDate(iso: string): string`

Calls `new Date(iso).toLocaleString()` — renders in the browser's locale.

---

## Types

```ts
interface PolicyFile {
  name: string;
  size: number;     // bytes
  modified: string; // ISO 8601
}
```

---

## User Interactions Summary

| Action | How to trigger |
|---|---|
| Upload new file(s) | Click **Upload File** button, click drop zone, or drag-and-drop onto drop zone |
| Replace a file | Click **Replace** in the file's row, select a new file |
| Delete a file | Click **Delete**, confirm with **Yes** in the inline prompt |
| Download a file | Click the download icon (⬇) in the file's row |
| Cancel delete | Click **No** in the inline confirmation |

---

## Dependencies Used

| Package | Usage |
|---|---|
| `@tanstack/react-query` v5 | Data fetching and cache invalidation |
| `lucide-react` | Icons: `Upload`, `Trash2`, `RefreshCw`, `Download`, `FileText`, `Database`, `AlertCircle`, `Loader2`, `FileSpreadsheet` |
| `@/hooks/use-toast` | Success / error toast notifications |
| `@/components/ui/button` | Action buttons |
| `@/components/ui/card` | Stats cards and file table card |
| `@/components/ui/table` | File listing table |
| `@/lib/utils` (`cn`) | Conditional class merging |

---

## API Endpoints Used

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/policy-data` | Fetch file list |
| `POST` | `/api/policy-data/upload/:filename` | Upload or replace a file |
| `GET` | `/api/policy-data/:filename` | Download a file |
| `DELETE` | `/api/policy-data/:filename` | Delete a file |

See [policy-data-api.md](../../UL/docs/policy-data-api.md) in the UL project for full backend documentation.

---

## Extending the View

To add a file preview panel (like the Assumptions view):

1. Add `selectedFile: string | null` state.
2. Make table rows clickable to set `selectedFile`.
3. Add a `useQuery` keyed on `["/api/policy-data", selectedFile]` that calls `GET /api/policy-data/:filename`.
4. Render the content in a right-hand panel — for CSV files, re-use the `CsvTable` pattern from `AssumptionsView.tsx`.
