# VA Assumptions API

**Date:** 2026-06-03  
**File changed:** `server/routes.ts` (in `Updated-FIA-Validation-Tool-UI`)  
**Base path:** `/api/va/assumptions`

---

## Overview

Six REST endpoints were added to the FIA Validation Tool's Express server to manage the VA model's
`Assumptions_Extracted.xlsx` file. They allow the frontend to list sheets, read sheet data,
save edits, add/delete sheets, and download the file — all without opening Excel.

The in-app UI is at route `/va-assumptions` (`VAAssumptionsView.tsx`).

---

## File Configuration

```ts
const VA_DATA_DIR =
  process.env.VA_DATA_DIR ?? path.join(PRODUCTS_DIR, "VA", "data");
const VA_ASSUMPTIONS_FILE = path.join(VA_DATA_DIR, "Assumptions_Extracted.xlsx");
```

- **Default:** `C:\projects\VA\data\Assumptions_Extracted.xlsx`
- **Override:** Set the `VA_DATA_DIR` environment variable.
- `PRODUCTS_DIR` defaults to the parent of the app's working directory (`C:\projects`), overridable via `PRODUCTS_DIR`.

---

## Security

Filenames are not user-supplied for these endpoints (the file path is fixed). Sheet names come
from the xlsx workbook itself or from the request body; no path traversal is possible because
all access goes through the SheetJS `XLSX` API rather than filesystem paths derived from input.

---

## Endpoints

### `GET /api/va/assumptions/sheets`

Returns the list of worksheet names in the file, in workbook order.

**Response**
```json
{ "sheets": ["Mortality", "Lapse", "Expense", "Interest", "Rider Charges"] }
```

**Error responses**

| Status | Condition |
|---|---|
| 404 | `Assumptions_Extracted.xlsx` does not exist at `VA_ASSUMPTIONS_FILE` |
| 500 | Filesystem or parse error |

---

### `GET /api/va/assumptions/download`

Serves `Assumptions_Extracted.xlsx` as a file download with the original filename.

**Response:** `application/octet-stream` binary — the full workbook as-is on disk.

**Error responses**

| Status | Condition |
|---|---|
| 404 | File does not exist |

---

### `GET /api/va/assumptions/sheet/:sheetName`

Returns the data for one worksheet as a 2-D array.

**URL parameter:** `sheetName` — URL-encoded sheet name (e.g. `Mortality`, `Rider%20Charges`).

**Response**
```json
{
  "sheetName": "Mortality",
  "headers": ["Age", "QX_Male", "QX_Female"],
  "rows": [
    ["25", "0.00120", "0.00085"],
    ["26", "0.00130", "0.00090"]
  ]
}
```

- `headers` — first row of the worksheet.
- `rows` — all subsequent rows; all values are strings (numbers are not parsed).
- Empty cells are returned as `""`.

**Error responses**

| Status | Condition |
|---|---|
| 404 | File not found, or `sheetName` does not exist in the workbook |
| 500 | Parse error |

---

### `POST /api/va/assumptions/sheet/:sheetName`

Overwrites a single sheet in the workbook with new data.  All other sheets are preserved.

**URL parameter:** `sheetName` — URL-encoded name of the sheet to update.

**Request body** (`Content-Type: application/json`)
```json
{
  "headers": ["Age", "QX_Male", "QX_Female"],
  "rows": [
    ["25", "0.00120", "0.00085"],
    ["26", "0.00130", "0.00090"]
  ]
}
```

**Response**
```json
{ "success": true, "sheetName": "Mortality" }
```

**Notes**
- If `sheetName` does not already exist in the workbook it is **appended** as a new sheet.
- The workbook is written back to `VA_ASSUMPTIONS_FILE` immediately.

**Error responses**

| Status | Condition |
|---|---|
| 400 | `headers` or `rows` missing / not arrays |
| 404 | File not found |
| 500 | Write error |

---

### `POST /api/va/assumptions/sheets`

Creates a new empty worksheet in the workbook.

**Request body** (`Content-Type: application/json`)
```json
{ "sheetName": "New Sheet" }
```

**Response**
```json
{ "success": true, "sheetName": "New Sheet" }
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | `sheetName` missing or blank |
| 404 | File not found |
| 409 | A sheet with that name already exists |
| 500 | Write error |

---

### `DELETE /api/va/assumptions/sheet/:sheetName`

Removes a worksheet from the workbook.

**URL parameter:** `sheetName` — URL-encoded name of the sheet to delete.

**Response**
```json
{ "success": true }
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Attempting to delete the last remaining sheet |
| 404 | File not found, or sheet not found |
| 500 | Write error |

---

## XLSX Library

The server uses [SheetJS (xlsx)](https://sheetjs.com/) to read and write `.xlsx` files:

```ts
import * as XLSX from "xlsx";

// Read
const wb = XLSX.readFile(VA_ASSUMPTIONS_FILE);
const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });

// Write
const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
XLSX.writeFile(wb, VA_ASSUMPTIONS_FILE);
```

All cell values are handled as strings. Numeric formatting present in the original file is
not preserved when a sheet is saved — values are written back as plain strings.

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `VA_DATA_DIR` | `<PRODUCTS_DIR>/VA/data` | Override the VA data directory |
| `PRODUCTS_DIR` | Parent of app working directory | Root of all product folders |

---

## Related

- [va-integration.md](va-integration.md) — full VA integration change log
- [assumptions-api.md](assumptions-api.md) — equivalent UL param_tables API
- Frontend: `client/src/pages/VAAssumptionsView.tsx`
