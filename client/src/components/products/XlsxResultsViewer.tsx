import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet, Download, ChevronLeft, ChevronRight, ChevronDown,
  PanelLeftClose, PanelLeftOpen, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Generic multi-file XLSX results browser, scoped to a product.
// Reads /api/products/:productId/results{,/:file/sheets,/:file/sheet/:s,/:file/download}.

interface ResultFile { name: string; size: number; modified: string; }
interface SheetData { filename: string; sheetName: string; headers: string[]; rows: string[][]; }

const PAGE_SIZE = 100;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function fmtCell(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
}

export default function XlsxResultsViewer({ productId }: { productId: string }) {
  const base = `/api/products/${encodeURIComponent(productId)}/results`;

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Reset when the product changes
  useEffect(() => { setSelectedFile(null); setSelectedSheet(null); setExpandedFile(null); setPage(0); }, [productId]);

  const { data: fileListData, isLoading: filesLoading } = useQuery<{ files: ResultFile[] }>({
    queryKey: [base, productId],
    queryFn: async () => { const r = await fetch(base); if (!r.ok) throw new Error("Failed to load results"); return r.json(); },
  });

  const files = fileListData?.files ?? [];
  const activeFile = selectedFile ?? files[0]?.name ?? null;

  useEffect(() => { if (activeFile && expandedFile === null) setExpandedFile(activeFile); }, [activeFile, expandedFile]);

  const { data: sheetsData } = useQuery<{ sheets: string[] }>({
    queryKey: [`${base}/sheets`, productId, activeFile],
    queryFn: async () => { const r = await fetch(`${base}/${encodeURIComponent(activeFile!)}/sheets`); if (!r.ok) throw new Error("Failed to load sheets"); return r.json(); },
    enabled: !!activeFile,
  });

  const sheets = sheetsData?.sheets ?? [];
  const activeSheet = selectedSheet ?? sheets[0] ?? null;

  const { data: sheetData, isLoading: sheetLoading } = useQuery<SheetData>({
    queryKey: [`${base}/sheet`, productId, activeFile, activeSheet],
    queryFn: async () => {
      const r = await fetch(`${base}/${encodeURIComponent(activeFile!)}/sheet/${encodeURIComponent(activeSheet!)}`);
      if (!r.ok) throw new Error("Failed to load sheet");
      return r.json();
    },
    enabled: !!activeFile && !!activeSheet,
  });

  const totalPages = sheetData ? Math.ceil(sheetData.rows.length / PAGE_SIZE) : 0;
  const pagedRows = sheetData ? sheetData.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  const handleFileSelect = (name: string) => { setSelectedFile(name); setSelectedSheet(null); setPage(0); setExpandedFile(name); };
  const toggleExpand = (name: string) => setExpandedFile((prev) => (prev === name ? null : name));
  const handleSheetSelect = (name: string) => { setSelectedSheet(name); setPage(0); };
  const handleDownload = () => { if (activeFile) window.open(`${base}/${encodeURIComponent(activeFile)}/download`, "_blank"); };

  if (filesLoading) return <div className="p-8 text-center text-muted-foreground text-sm">Loading results...</div>;
  if (files.length === 0) return <div className="p-8 text-center text-muted-foreground text-sm">No result files found in the results directory.</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-slate-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors" onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-sm font-bold leading-tight">Financial Summary</h1>
            <p className="text-[10px] text-muted-foreground">{productId} results &mdash; {activeFile ?? "select a file"}{activeSheet ? ` / ${activeSheet}` : ""}</p>
          </div>
        </div>
        {activeFile && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" /> Download Excel
          </Button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="w-64 flex-shrink-0 flex flex-col border-r border-border bg-slate-50/60 overflow-hidden">
            <div className="px-3 pt-2 pb-1 flex-shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Files ({files.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto pb-2">
              {files.map((f) => {
                const isExpanded = expandedFile === f.name;
                const isActiveFile = f.name === activeFile;
                return (
                  <div key={f.name}>
                    <div
                      className={cn("group flex items-center gap-1 w-full px-2 py-1.5 border-l-2 cursor-pointer transition-colors", isActiveFile ? "border-primary bg-primary/5" : "border-transparent hover:bg-slate-100")}
                      onClick={() => handleFileSelect(f.name)}
                      title={f.name}
                    >
                      <button className="p-0.5 rounded text-slate-400 hover:text-slate-700 flex-shrink-0" onClick={(e) => { e.stopPropagation(); toggleExpand(f.name); }} title={isExpanded ? "Collapse" : "Expand"}>
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-green-600" />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-xs font-medium truncate", isActiveFile ? "text-primary" : "text-slate-700")}>{f.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{formatBytes(f.size)} &middot; {new Date(f.modified).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {isExpanded && isActiveFile && (
                      <div>
                        {sheets.length === 0 ? (
                          <p className="pl-9 pr-3 py-1 text-[11px] text-slate-400 italic">No sheets</p>
                        ) : (
                          sheets.map((s) => (
                            <button
                              key={s}
                              onClick={() => handleSheetSelect(s)}
                              title={s}
                              className={cn("flex items-center gap-1.5 w-full text-left pl-9 pr-3 py-1 text-[11px] border-l-2 transition-colors", s === activeSheet ? "border-primary bg-primary/10 text-primary font-medium" : "border-transparent text-slate-600 hover:bg-slate-100")}
                            >
                              <FileText className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">{s}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        <div className="flex-1 overflow-auto p-4">
          {sheetLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading sheet data...</div>
          ) : sheetData && sheetData.headers.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{activeSheet} &mdash; {sheetData.rows.length.toLocaleString()} rows</h2>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></Button>
                    <span>{page + 1} / {totalPages}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
              <div className="border rounded-md overflow-auto max-h-[calc(100vh-220px)]">
                <table className="text-xs border-collapse min-w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-white">
                      {sheetData.headers.map((h, i) => (
                        <th key={i} className="border border-slate-700 px-3 py-2 font-semibold whitespace-nowrap text-left">{h || `Col ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        {sheetData.headers.map((_, ci) => {
                          const cell = String(row[ci] ?? "");
                          const num = parseFloat(cell);
                          const isNum = !isNaN(num) && cell !== "";
                          const isNeg = isNum && num < 0;
                          return (
                            <td key={ci} className={`border border-border px-3 py-1.5 font-mono whitespace-nowrap ${isNum ? (isNeg ? "text-right text-red-600" : "text-right") : "text-left text-muted-foreground"}`}>
                              {cell === "" ? "—" : isNum ? fmtCell(cell) : cell}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <FileSpreadsheet className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a file and sheet to view its contents</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
