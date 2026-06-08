import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Download, ChevronLeft, ChevronRight } from "lucide-react";

interface ResultFile {
  name: string;
  size: number;
  modified: string;
}

interface SheetData {
  filename: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
}

const PAGE_SIZE = 100;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtCell(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export default function VAFinancialSummaryView() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const { data: fileListData, isLoading: filesLoading } = useQuery<{ files: ResultFile[] }>({
    queryKey: ["/api/va/results"],
  });

  const files = fileListData?.files ?? [];
  const activeFile = selectedFile ?? files[0]?.name ?? null;

  const { data: sheetsData } = useQuery<{ sheets: string[] }>({
    queryKey: [`/api/va/results/${activeFile}/sheets`],
    enabled: !!activeFile,
  });

  const sheets = sheetsData?.sheets ?? [];
  const activeSheet = selectedSheet ?? sheets[0] ?? null;

  const { data: sheetData, isLoading: sheetLoading } = useQuery<SheetData>({
    queryKey: [
      `/api/va/results/${activeFile}/sheet/${encodeURIComponent(activeSheet ?? "")}`,
    ],
    enabled: !!activeFile && !!activeSheet,
  });

  const totalPages = sheetData ? Math.ceil(sheetData.rows.length / PAGE_SIZE) : 0;
  const pagedRows = sheetData
    ? sheetData.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : [];

  const handleFileSelect = (name: string) => {
    setSelectedFile(name);
    setSelectedSheet(null);
    setPage(0);
  };

  const handleSheetSelect = (name: string) => {
    setSelectedSheet(name);
    setPage(0);
  };

  const handleDownload = () => {
    if (!activeFile) return;
    window.open(`/api/va/results/${encodeURIComponent(activeFile)}/download`, "_blank");
  };

  if (filesLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        Loading VA results...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        No result files found in the VA results directory.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Financial Summary</h1>
            <p className="text-xs text-muted-foreground">
              VA Results &mdash; {activeFile ?? "select a file below"}
            </p>
          </div>
        </div>
        {activeFile && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            Download Excel
          </Button>
        )}
      </div>

      {/* File selector cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {files.map((f) => (
          <Card
            key={f.name}
            className={`cursor-pointer transition-all ${
              f.name === activeFile
                ? "border-primary ring-1 ring-primary"
                : "hover:border-primary/50"
            }`}
            onClick={() => handleFileSelect(f.name)}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate" title={f.name}>
                  {f.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(f.size)} &middot;{" "}
                  {new Date(f.modified).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sheet tabs */}
      {sheets.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {sheets.map((s) => (
            <button
              key={s}
              onClick={() => handleSheetSelect(s)}
              className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                s === activeSheet
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-border"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Loading indicator */}
      {sheetLoading && (
        <div className="p-8 text-center text-muted-foreground text-sm">
          Loading sheet data...
        </div>
      )}

      {/* Sheet data table */}
      {sheetData && sheetData.headers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {activeSheet} &mdash; {sheetData.rows.length.toLocaleString()} rows
            </h2>
            {totalPages > 1 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="border rounded-md overflow-auto max-h-[calc(100vh-340px)]">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 text-white">
                  {sheetData.headers.map((h, i) => (
                    <th
                      key={i}
                      className="border border-slate-700 px-3 py-2 font-semibold whitespace-nowrap text-left"
                    >
                      {h || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={ri % 2 === 0 ? "bg-background" : "bg-muted/30"}
                  >
                    {sheetData.headers.map((_, ci) => {
                      const cell = String(row[ci] ?? "");
                      const num = parseFloat(cell);
                      const isNum = !isNaN(num) && cell !== "";
                      const isNeg = isNum && num < 0;
                      return (
                        <td
                          key={ci}
                          className={`border border-border px-3 py-1.5 font-mono whitespace-nowrap ${
                            isNum
                              ? isNeg
                                ? "text-right text-red-600"
                                : "text-right"
                              : "text-left text-muted-foreground"
                          }`}
                        >
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
      )}
    </div>
  );
}
