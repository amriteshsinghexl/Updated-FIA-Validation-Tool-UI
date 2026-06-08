import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Download,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  FileSpreadsheet,
  X,
  Check,
  Edit2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SheetData {
  sheetName: string;
  headers: string[];
  rows: string[][];
}

// ---------------------------------------------------------------------------
// Editable cell
// ---------------------------------------------------------------------------

const EditableCell = ({
  value,
  onChange,
  isHeader,
}: {
  value: string;
  onChange: (v: string) => void;
  isHeader?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={cn(
          "w-full h-full px-2 py-1 text-xs font-mono outline-none border border-blue-400 rounded-none bg-blue-50",
          isHeader && "font-semibold bg-blue-100"
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "px-3 py-1.5 text-xs font-mono cursor-text hover:bg-blue-50/60 select-none min-h-[28px] whitespace-nowrap",
        isHeader && "font-semibold"
      )}
      onDoubleClick={() => { setDraft(value); setEditing(true); }}
      title="Double-click to edit"
    >
      {value || <span className="text-slate-300 italic">—</span>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sheet tab component
// ---------------------------------------------------------------------------

const SheetTab = ({
  name,
  active,
  onSelect,
  onDelete,
  canDelete,
}: {
  name: string;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) => (
  <div
    className={cn(
      "group flex items-center gap-1 px-3 py-1.5 text-xs font-medium cursor-pointer border-b-2 transition-colors whitespace-nowrap",
      active
        ? "border-blue-500 text-blue-700 bg-blue-50/60"
        : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-100"
    )}
    onClick={onSelect}
  >
    <FileSpreadsheet className="h-3.5 w-3.5 flex-shrink-0" />
    <span>{name}</span>
    {canDelete && (
      <button
        className={cn(
          "ml-1 p-0.5 rounded transition-opacity text-slate-400 hover:text-red-500",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete sheet"
      >
        <X className="h-3 w-3" />
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Add-sheet dialog (inline)
// ---------------------------------------------------------------------------

const AddSheetBar = ({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string) => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-1 px-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) onAdd(name.trim());
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Sheet name…"
        className="h-7 w-36 px-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-400"
      />
      <button
        className="p-1 text-green-600 hover:text-green-700"
        onClick={() => name.trim() && onAdd(name.trim())}
        title="Confirm"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        className="p-1 text-slate-400 hover:text-slate-600"
        onClick={onCancel}
        title="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

const VAAssumptionsView = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<SheetData | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Fetch sheet list
  const { data: sheetsData, isLoading: sheetsLoading } = useQuery<{ sheets: string[] }>({
    queryKey: ["/api/va/assumptions/sheets"],
    queryFn: async () => {
      const res = await fetch("/api/va/assumptions/sheets");
      if (!res.ok) throw new Error("Failed to fetch sheets");
      return res.json();
    },
  });

  // Auto-select first sheet
  useEffect(() => {
    if (sheetsData?.sheets?.length && !activeSheet) {
      setActiveSheet(sheetsData.sheets[0]);
    }
  }, [sheetsData, activeSheet]);

  // Fetch active sheet data
  const { data: sheetData, isLoading: sheetLoading } = useQuery<SheetData>({
    queryKey: ["/api/va/assumptions/sheet", activeSheet],
    queryFn: async () => {
      const res = await fetch(
        `/api/va/assumptions/sheet/${encodeURIComponent(activeSheet!)}`
      );
      if (!res.ok) throw new Error("Failed to fetch sheet data");
      return res.json();
    },
    enabled: !!activeSheet,
  });

  // Sync fetched data into local editable state
  useEffect(() => {
    if (sheetData) {
      setEditedData({
        sheetName: sheetData.sheetName,
        headers: [...sheetData.headers],
        rows: sheetData.rows.map((r) => [...r]),
      });
      setIsDirty(false);
    }
  }, [sheetData]);

  // Save sheet mutation
  const saveMutation = useMutation({
    mutationFn: async (data: SheetData) => {
      const res = await fetch(
        `/api/va/assumptions/sheet/${encodeURIComponent(data.sheetName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headers: data.headers, rows: data.rows }),
        }
      );
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/va/assumptions/sheet", activeSheet] });
      toast({ title: "Sheet saved successfully" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // Add sheet mutation
  const addSheetMutation = useMutation({
    mutationFn: async (sheetName: string) => {
      const res = await fetch("/api/va/assumptions/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add sheet");
      }
      return res.json();
    },
    onSuccess: (_data, sheetName) => {
      queryClient.invalidateQueries({ queryKey: ["/api/va/assumptions/sheets"] });
      setActiveSheet(sheetName);
      setShowAddSheet(false);
      toast({ title: `Sheet "${sheetName}" created` });
    },
    onError: (err: Error) =>
      toast({ title: err.message ?? "Failed to add sheet", variant: "destructive" }),
  });

  // Delete sheet mutation
  const deleteSheetMutation = useMutation({
    mutationFn: async (sheetName: string) => {
      const res = await fetch(
        `/api/va/assumptions/sheet/${encodeURIComponent(sheetName)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: (_data, sheetName) => {
      queryClient.invalidateQueries({ queryKey: ["/api/va/assumptions/sheets"] });
      if (activeSheet === sheetName) {
        const remaining = sheetsData?.sheets?.filter((s) => s !== sheetName) ?? [];
        setActiveSheet(remaining[0] ?? null);
      }
      toast({ title: `Sheet "${sheetName}" deleted` });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleDeleteSheet = (name: string) => {
    if (window.confirm(`Delete sheet "${name}"? This cannot be undone.`)) {
      deleteSheetMutation.mutate(name);
    }
  };

  // Cell edit helpers
  const updateHeader = useCallback((colIdx: number, value: string) => {
    setEditedData((prev) => {
      if (!prev) return prev;
      const headers = [...prev.headers];
      headers[colIdx] = value;
      return { ...prev, headers };
    });
    setIsDirty(true);
  }, []);

  const updateCell = useCallback((rowIdx: number, colIdx: number, value: string) => {
    setEditedData((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r) => [...r]);
      if (!rows[rowIdx]) rows[rowIdx] = [];
      rows[rowIdx][colIdx] = value;
      return { ...prev, rows };
    });
    setIsDirty(true);
  }, []);

  const addRow = () => {
    setEditedData((prev) => {
      if (!prev) return prev;
      const emptyRow = Array(prev.headers.length).fill("");
      return { ...prev, rows: [...prev.rows, emptyRow] };
    });
    setIsDirty(true);
  };

  const addColumn = () => {
    setEditedData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        headers: [...prev.headers, `Col${prev.headers.length + 1}`],
        rows: prev.rows.map((r) => [...r, ""]),
      };
    });
    setIsDirty(true);
  };

  const deleteRow = (rowIdx: number) => {
    setEditedData((prev) => {
      if (!prev) return prev;
      return { ...prev, rows: prev.rows.filter((_, i) => i !== rowIdx) };
    });
    setIsDirty(true);
  };

  const sheets = sheetsData?.sheets ?? [];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden bg-white">
      {/* ------------------------------------------------------------------ */}
      {/* Top action bar                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-slate-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-slate-800">
            VA Assumptions
          </span>
          <span className="text-[10px] text-slate-400 ml-1">
            Assumptions_Extracted.xlsx
          </span>
          {isDirty && (
            <span className="text-[10px] text-amber-600 font-medium ml-1 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => window.open("/api/va/assumptions/download", "_blank")}
          >
            <Download className="h-3 w-3" /> Download
          </Button>

          <Button
            size="sm"
            className={cn(
              "h-7 text-xs gap-1.5",
              isDirty
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-slate-200 text-slate-500 cursor-not-allowed hover:bg-slate-200"
            )}
            onClick={() => editedData && saveMutation.mutate(editedData)}
            disabled={!isDirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Sheet tabs                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-end border-b border-border bg-white overflow-x-auto flex-shrink-0 px-2 pt-1">
        {sheetsLoading ? (
          <div className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400">
            <RefreshCw className="h-3 w-3 animate-spin" /> Loading sheets…
          </div>
        ) : (
          sheets.map((name) => (
            <SheetTab
              key={name}
              name={name}
              active={activeSheet === name}
              onSelect={() => {
                if (isDirty && !window.confirm("You have unsaved changes. Switch sheet anyway?")) return;
                setActiveSheet(name);
              }}
              onDelete={() => handleDeleteSheet(name)}
              canDelete={sheets.length > 1}
            />
          ))
        )}

        {showAddSheet ? (
          <AddSheetBar
            onAdd={(name) => addSheetMutation.mutate(name)}
            onCancel={() => setShowAddSheet(false)}
          />
        ) : (
          <button
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors"
            onClick={() => setShowAddSheet(true)}
            title="Add new sheet"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Table area                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-auto relative">
        {sheetLoading ? (
          <div className="flex items-center justify-center h-full gap-2 text-slate-400 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading sheet…
          </div>
        ) : !editedData ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <FileSpreadsheet className="h-10 w-10 opacity-30" />
            <p className="text-sm">Select a sheet to view its contents</p>
          </div>
        ) : (
          <>
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 text-white">
                  {/* Row number column */}
                  <th className="border border-slate-700 px-2 py-1.5 text-center font-medium w-10 text-slate-400 select-none">
                    #
                  </th>
                  {editedData.headers.map((h, ci) => (
                    <th
                      key={ci}
                      className="border border-slate-700 min-w-[100px] font-semibold"
                    >
                      <EditableCell
                        value={h}
                        onChange={(v) => updateHeader(ci, v)}
                        isHeader
                      />
                    </th>
                  ))}
                  {/* Delete-row column header */}
                  <th className="border border-slate-700 w-8 bg-slate-800" />
                </tr>
              </thead>
              <tbody>
                {editedData.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={cn(
                      "hover:bg-blue-50/40 transition-colors group",
                      ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                    )}
                  >
                    <td className="border border-slate-200 px-2 py-1 text-center text-slate-400 bg-slate-50 font-mono select-none">
                      {ri + 1}
                    </td>
                    {editedData.headers.map((_, ci) => (
                      <td key={ci} className="border border-slate-200 p-0">
                        <EditableCell
                          value={row[ci] ?? ""}
                          onChange={(v) => updateCell(ri, ci, v)}
                        />
                      </td>
                    ))}
                    <td className="border border-slate-200 text-center">
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1"
                        onClick={() => deleteRow(ri)}
                        title="Delete row"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Add row / add column strip */}
            <div className="flex items-center gap-2 p-2 border-t border-slate-100 bg-slate-50/50 sticky bottom-0">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] gap-1 text-slate-600"
                onClick={addRow}
              >
                <Plus className="h-3 w-3" /> Add Row
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] gap-1 text-slate-600"
                onClick={addColumn}
              >
                <Plus className="h-3 w-3" /> Add Column
              </Button>
              {editedData.rows.length > 0 && (
                <span className="text-[10px] text-slate-400 ml-2">
                  {editedData.rows.length} rows × {editedData.headers.length} cols
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VAAssumptionsView;
