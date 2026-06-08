import React, { useState, useEffect, useCallback } from "react";
import { Code, Plus, Trash2, Save, X, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ULP_BASE = (import.meta as any).env?.VITE_ULP_API_BASE ?? "http://localhost:8000";

interface ScriptMeta {
  filename: string;
  size_bytes: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ULP_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.json().then((d: any) => d.detail).catch(() => res.statusText);
    throw new Error(typeof detail === "string" ? detail : res.statusText);
  }
  return res.json() as Promise<T>;
}

interface ScriptEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScriptEditorModal({ open, onOpenChange }: ScriptEditorModalProps) {
  const [scripts, setScripts] = useState<ScriptMeta[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const isDirty = content !== savedContent;

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const data = await apiFetch<{ scripts: ScriptMeta[] }>("/api/v1/scripts");
      setScripts(data.scripts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scripts");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchList();
    } else {
      setSelectedFile(null);
      setContent("");
      setSavedContent("");
      setShowNewInput(false);
      setNewFileName("");
      setError("");
      setConfirmDelete(null);
    }
  }, [open, fetchList]);

  async function loadScript(filename: string) {
    setLoadingContent(true);
    setError("");
    try {
      const data = await apiFetch<{ filename: string; content: string }>(
        `/api/v1/scripts/${encodeURIComponent(filename)}`
      );
      setContent(data.content);
      setSavedContent(data.content);
      setSelectedFile(filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load script");
    } finally {
      setLoadingContent(false);
    }
  }

  async function handleSave() {
    if (!selectedFile) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/v1/scripts/${encodeURIComponent(selectedFile)}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      setSavedContent(content);
      await fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save script");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    const trimmed = newFileName.trim();
    if (!trimmed) { setError("Enter a filename"); return; }
    const name = trimmed.endsWith(".py") ? trimmed : `${trimmed}.py`;
    setError("");
    try {
      await apiFetch("/api/v1/scripts", {
        method: "POST",
        body: JSON.stringify({ filename: name, content: "" }),
      });
      await fetchList();
      setShowNewInput(false);
      setNewFileName("");
      await loadScript(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create script");
    }
  }

  async function handleDelete(filename: string) {
    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/api/v1/scripts/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (selectedFile === filename) {
        setSelectedFile(null);
        setContent("");
        setSavedContent("");
      }
      setConfirmDelete(null);
      await fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete script");
    } finally {
      setDeleting(false);
    }
  }

  function handleSelectFile(filename: string) {
    if (selectedFile === filename) return;
    if (isDirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    loadScript(filename);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = content.substring(0, start) + "    " + content.substring(end);
      setContent(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 4;
      });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (isDirty) handleSave();
    }
  }

  if (!open) return null;

  return (
    /* Panel anchored directly below the h-24 (96px) top ribbon */
    <div className="fixed inset-x-0 top-24 bottom-0 z-40 flex flex-col bg-background border-t border-border shadow-[0_4px_24px_rgba(0,0,0,0.12)] animate-in slide-in-from-top-1 duration-150">

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">ULP Model Scripts</span>
          <span className="text-xs text-muted-foreground font-mono">— ulp_model/</span>
        </div>
        <div className="flex items-center gap-2">
          {selectedFile && (
            <Button
              size="sm"
              disabled={!isDirty || saving}
              onClick={handleSave}
              className="h-7 text-xs"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              Save
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2 text-sm text-red-700 shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="text-red-400 hover:text-red-700" onClick={() => setError("")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — file list */}
        <div className="w-56 shrink-0 border-r flex flex-col overflow-hidden bg-muted/10">
          <div className="p-2 border-b shrink-0">
            {showNewInput ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  className="h-7 text-xs"
                  placeholder="filename.py"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setShowNewInput(false); setNewFileName(""); }
                  }}
                />
                <Button size="sm" className="h-7 px-2 text-xs shrink-0" onClick={handleCreate}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1.5 shrink-0"
                  onClick={() => { setShowNewInput(false); setNewFileName(""); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs"
                onClick={() => setShowNewInput(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                New Script
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-1">
            {loadingList ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : scripts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 px-2">
                No scripts found.
              </p>
            ) : (
              scripts.map((s) => (
                <div
                  key={s.filename}
                  className={cn(
                    "group flex items-center justify-between px-2 py-1.5 rounded-sm cursor-pointer text-xs hover:bg-accent select-none",
                    selectedFile === s.filename && "bg-primary/10 text-primary font-medium"
                  )}
                  onClick={() => handleSelectFile(s.filename)}
                >
                  <span className="truncate flex items-center gap-1.5 min-w-0">
                    {selectedFile === s.filename && isDirty && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 inline-block" />
                    )}
                    <span className="truncate">{s.filename}</span>
                  </span>

                  {confirmDelete === s.filename ? (
                    <div
                      className="flex gap-1 shrink-0 ml-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="text-[10px] text-red-600 hover:text-red-800 font-semibold"
                        onClick={() => handleDelete(s.filename)}
                        disabled={deleting}
                      >
                        {deleting ? "…" : "Del"}
                      </button>
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => setConfirmDelete(null)}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      className="opacity-0 group-hover:opacity-100 shrink-0 ml-1 text-muted-foreground hover:text-red-500 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(s.filename); }}
                      title="Delete script"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel — code editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFile ? (
            <>
              <div className="px-3 py-1.5 border-b bg-muted/10 shrink-0 flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">
                  {selectedFile}
                  {isDirty && (
                    <span className="ml-2 text-amber-600 font-semibold">● unsaved</span>
                  )}
                </span>
                <span className="text-[10px] text-muted-foreground">Ctrl+S to save · Tab to indent</span>
              </div>
              {loadingContent ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <textarea
                  className="flex-1 resize-none p-4 font-mono text-sm bg-background text-foreground outline-none border-0 leading-relaxed"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Code className="h-10 w-10 opacity-20" />
              <p className="text-sm">Select a script to view and edit its content</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
