# View Code Panel — Developer Script Editor

This document describes the **View Code** feature added to the top ribbon. It gives developers a live in-app editor for all Python scripts in the ULP model engine (`C:\projects\UL\ulp_model\`), without leaving the UI.

---

## Overview

Clicking **View Code** in the *Developer View* group of the top ribbon opens a full-height panel directly below the ribbon. The panel fills the content area and contains:

- A **file list sidebar** (left) showing every `.py` file in `ulp_model/`
- A **code editor pane** (right) for reading and editing the selected file
- **Create**, **Save**, and **Delete** actions

The panel closes automatically when any other ribbon button is clicked.

---

## UI Behaviour

| Action | Result |
|--------|--------|
| Click **View Code** | Panel slides open below the ribbon |
| Click any other ribbon button | Panel closes immediately |
| Click **×** in panel header | Panel closes |
| Select a file from the sidebar | File content loads into the editor |
| Edit content, press **Ctrl+S** or click **Save** | Changes written to disk via API |
| Press **Tab** inside editor | Inserts 4 spaces |
| Click **New Script** | Inline filename input appears; press Enter or click **Add** to create |
| Hover a file, click trash icon | Inline confirmation (Del / No) appears |
| Confirm delete | File removed from disk; editor clears if it was open |

An amber dot (●) appears on the filename in the sidebar and in the editor breadcrumb when there are unsaved changes. Navigating away from a dirty file triggers a browser confirmation dialog.

---

## Files Changed

### `client/src/components/ScriptEditorModal.tsx` *(new)*

Self-contained panel component. Renders as a `position: fixed` div anchored at `top: 96px` (the ribbon height) that fills the full viewport below the ribbon. Uses no Dialog/overlay — it is not a popup.

**Key implementation details:**

- **API base**: reads `VITE_ULP_API_BASE` env var, falls back to `http://localhost:8000`
- **State**: `scripts[]`, `selectedFile`, `content`, `savedContent` (used to compute `isDirty`)
- **Tab key**: intercepts Tab in the textarea and inserts 4 spaces
- **Ctrl+S**: intercepts the keyboard shortcut and calls save
- **Animation**: `animate-in slide-in-from-top-1 duration-150` (Tailwind animate)

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Whether the panel is visible |
| `onOpenChange` | `(open: boolean) => void` | Called to close the panel |

---

### `client/src/components/layout/TopRibbon.tsx` *(modified)*

| Change | Detail |
|--------|--------|
| Added import | `ScriptEditorModal` from `@/components/ScriptEditorModal` |
| Added state | `const [showScriptEditor, setShowScriptEditor] = useState(false)` |
| Ribbon `<div>` | `onClick={() => setShowScriptEditor(false)}` — any click on the ribbon closes the panel |
| View Code button | Wrapped in `<div onClick={(e) => e.stopPropagation()}>` so opening the panel does not immediately trigger the close handler |
| Return shape | Wrapped in `<>…</>` Fragment; `<ScriptEditorModal>` rendered as a sibling of the ribbon `<div>` (outside `overflow-x-auto`) |

---

## Backend Dependency

The panel calls the `/api/v1/scripts` CRUD endpoints served by the UL FastAPI backend on port 8000. The backend must be running before the panel can load or save files. If the backend is unreachable, a red error banner is shown inside the panel.

See `C:\projects\UL\docs\scripts-api.md` for the full API reference.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_ULP_API_BASE` | `http://localhost:8000` | Base URL for the UL FastAPI backend |
