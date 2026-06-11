import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Generic CSV/text "parameter tables" manager, scoped to a product.
// All requests go to /api/products/:productId/assumptions/files*.

interface FileInfo { name: string; size: number; modified: string; }
interface CsvData { filename: string; type: "csv"; headers: string[]; rows: string[][]; }
interface TextData { filename: string; type: "text"; content: string; }
type FileData = CsvData | TextData;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CsvTable = ({ data }: { data: CsvData }) => (
  <table className="text-xs border-collapse min-w-full">
    <thead className="sticky top-0 z-10">
      <tr className="bg-slate-900 text-white">
        <th className="border border-slate-700 px-3 py-1.5 text-center font-medium w-10 text-slate-400 select-none">#</th>
        {data.headers.map((h, i) => (
          <th key={i} className="border border-slate-700 px-3 py-1.5 text-left font-semibold whitespace-nowrap">
            {h || `Col${i + 1}`}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {data.rows.map((row, ri) => (
        <tr key={ri} className={cn("hover:bg-blue-50/60 transition-colors", ri % 2 === 0 ? "bg-white" : "bg-slate-50/60")}>
          <td className="border border-slate-200 px-3 py-1 text-center text-slate-400 bg-slate-50 font-mono select-none">{ri + 1}</td>
          {data.headers.map((_, ci) => (
            <td key={ci} className="border border-slate-200 px-3 py-1 font-mono whitespace-nowrap">{row[ci] ?? ""}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

export default function CsvAssumptionsManager({ productId, title = "Parameter Tables" }: { productId: string; title?: string }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const base = `/api/products/${encodeURIComponent(productId)}/assumptions/files`;
  const listKey = [base, productId];

  const { data: filesData, isLoading: filesLoading } = useQuery<{ files: FileInfo[] }>({
    queryKey: listKey,
    queryFn: async () => {
      const res = await fetch(base);
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const { data: fileData, isLoading: fileLoading } = useQuery<FileData>({
    queryKey: [base, productId, selectedFile],
    queryFn: async () => {
      const res = await fetch(`${base}/${encodeURIComponent(selectedFile!)}`);
      if (!res.ok) throw new Error("Failed to fetch file");
      return res.json();
    },
    enabled: !!selectedFile,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ filename, content }: { filename: string; content: string }) => {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content }),
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (_data, { filename }) => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: [base, productId, filename] });
      setSelectedFile(filename);
      toast({ title: "File uploaded successfully" });
    },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`${base}/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: (_data, filename) => {
      queryClient.invalidateQueries({ queryKey: listKey });
      if (selectedFile === filename) setSelectedFile(null);
      toast({ title: "File deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const readAndUpload = (file: File, overrideName?: string) => {
    const reader = new FileReader();
    reader.onload = (ev) => uploadMutation.mutate({ filename: overrideName ?? file.name, content: ev.target?.result as string });
    reader.readAsText(file);
  };

  const handleUploadNew = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readAndUpload(file);
    e.target.value = "";
  };
  const handleReplace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedFile) readAndUpload(file, selectedFile);
    e.target.value = "";
  };
  const handleDelete = (filename: string) => {
    if (window.confirm(`Delete "${filename}"? This cannot be undone.`)) deleteMutation.mutate(filename);
  };

  const files = filesData?.files ?? [];

  return (
    <div className="flex h-[calc(100vh-6rem)] overflow-hidden">
      <div className="w-60 flex-shrink-0 border-r border-border bg-slate-50 flex flex-col">
        <div className="p-3 border-b border-border bg-white space-y-2">
          <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">{title}</p>
          <input ref={uploadInputRef} type="file" className="hidden" accept=".csv,.yaml,.yml,.txt" onChange={handleUploadNew} />
          <Button size="sm" className="w-full h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => uploadInputRef.current?.click()} disabled={uploadMutation.isPending}>
            <Upload className="h-3.5 w-3.5" /> Upload New File
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filesLoading ? (
            <div className="flex items-center gap-2 p-4 text-xs text-slate-400"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
          ) : files.length === 0 ? (
            <div className="p-4 text-xs text-slate-400 italic">No files found</div>
          ) : (
            files.map((file) => (
              <div
                key={file.name}
                className={cn(
                  "group flex items-center justify-between px-3 py-2 cursor-pointer border-b border-slate-100 hover:bg-slate-100 transition-colors",
                  selectedFile === file.name && "bg-blue-50 border-l-2 border-l-blue-500"
                )}
                onClick={() => setSelectedFile(file.name)}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {file.name.endsWith(".csv") ? (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-slate-800 truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-400">{formatSize(file.size)}</p>
                  </div>
                </div>
                <button
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity p-0.5 ml-1"
                  onClick={(e) => { e.stopPropagation(); handleDelete(file.name); }}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {!selectedFile ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
            <FileSpreadsheet className="h-10 w-10 opacity-30" />
            <p className="text-sm">Select a file to view its contents</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0 bg-slate-50">
              <div className="flex items-center gap-2">
                {selectedFile.endsWith(".csv") ? (
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                ) : (
                  <FileText className="h-4 w-4 text-blue-500" />
                )}
                <span className="text-sm font-semibold text-slate-800">{selectedFile}</span>
                {fileData?.type === "csv" && (
                  <span className="text-[10px] text-slate-400 ml-1">{fileData.rows.length} rows × {fileData.headers.length} cols</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input ref={replaceInputRef} type="file" className="hidden" accept=".csv,.yaml,.yml,.txt" onChange={handleReplace} />
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => replaceInputRef.current?.click()} disabled={uploadMutation.isPending}>
                  <Upload className="h-3 w-3" /> Replace
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50" onClick={() => handleDelete(selectedFile)} disabled={deleteMutation.isPending}>
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {fileLoading ? (
                <div className="flex items-center justify-center h-full gap-2 text-slate-400 text-sm"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : fileData?.type === "csv" ? (
                <CsvTable data={fileData} />
              ) : fileData?.type === "text" ? (
                <pre className="p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">{fileData.content}</pre>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
