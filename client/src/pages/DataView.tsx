import React, { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, FileText, Upload, Trash2, RefreshCw, AlertCircle, Loader2, FileSpreadsheet, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface PolicyFile {
  name: string;
  size: number;
  modified: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

async function uploadFile(file: File, targetName?: string): Promise<void> {
  const filename = targetName ?? file.name;
  const res = await fetch(`/api/policy-data/upload/${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error ?? "Upload failed");
  }
}

async function deleteFile(filename: string): Promise<void> {
  const res = await fetch(`/api/policy-data/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Delete failed" }));
    throw new Error(err.error ?? "Delete failed");
  }
}

const DataView = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [replacingFile, setReplacingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery<{ files: PolicyFile[] }>({
    queryKey: ["/api/policy-data"],
    queryFn: async () => {
      const res = await fetch("/api/policy-data");
      if (!res.ok) throw new Error("Failed to load files");
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, targetName }: { file: File; targetName?: string }) =>
      uploadFile(file, targetName),
    onSuccess: (_data, { targetName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-data"] });
      toast({ title: targetName ? "File replaced" : "File uploaded", description: "Policy data updated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-data"] });
      toast({ title: "File deleted" });
      setPendingDelete(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      Array.from(e.dataTransfer.files).forEach((file) =>
        uploadMutation.mutate({ file })
      );
    },
    [uploadMutation]
  );

  const handleNewFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach((file) =>
      uploadMutation.mutate({ file })
    );
    e.target.value = "";
  };

  const handleReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && replacingFile) {
      uploadMutation.mutate({ file, targetName: replacingFile });
    }
    e.target.value = "";
    setReplacingFile(null);
  };

  const triggerReplace = (filename: string) => {
    setReplacingFile(filename);
    replaceInputRef.current?.click();
  };

  const files = data?.files ?? [];
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const isUploading = uploadMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policy Data</h1>
          <p className="text-sm text-muted-foreground mt-1">C:\projects\UL\policy_data</p>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload File
        </Button>
      </div>

      <input ref={fileInputRef} type="file" multiple hidden onChange={handleNewFiles} />
      <input ref={replaceInputRef} type="file" hidden onChange={handleReplaceFile} />

      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-8 text-center transition-colors cursor-pointer select-none",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className={cn("h-8 w-8 mb-2", isDragging ? "text-primary" : "text-muted-foreground")} />
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">CSV, Parquet, and other data files</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "—" : files.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "—" : formatBytes(totalSize)}</div>
          </CardContent>
        </Card>
      </div>

      {/* File table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Policy Data Files</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading files...</span>
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-12 text-destructive gap-2">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load files</span>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <FileSpreadsheet className="h-8 w-8" />
              <span>No files found. Upload files to get started.</span>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-900">
                <TableRow>
                  <TableHead className="text-white">File Name</TableHead>
                  <TableHead className="text-white">Size</TableHead>
                  <TableHead className="text-white">Modified</TableHead>
                  <TableHead className="text-right text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.name} className="hover:bg-slate-50">
                    <TableCell className="font-medium font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        {file.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatBytes(file.size)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDate(file.modified)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a href={`/api/policy-data/${encodeURIComponent(file.name)}`} download={file.name}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 hover:bg-blue-50 hover:text-blue-700"
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 hover:bg-amber-50 hover:text-amber-700"
                          onClick={() => triggerReplace(file.name)}
                          disabled={isUploading}
                          title="Replace file"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Replace
                        </Button>
                        {pendingDelete === file.name ? (
                          <div className="flex items-center gap-1 ml-1">
                            <span className="text-xs text-destructive font-medium">Delete?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => deleteMutation.mutate(file.name)}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setPendingDelete(null)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setPendingDelete(file.name)}
                            title="Delete file"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DataView;
