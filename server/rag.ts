/**
 * rag.ts — Local Retrieval-Augmented Generation over project docs + scripts.
 *
 * "Training" the local model here means: chunk the selected docs/scripts,
 * embed every chunk with a local Ollama embedding model (no API key, no GPU
 * needed), and persist the vectors to a flat JSON store. At prompt time we
 * embed the user's question, cosine-rank the chunks, and inject the top matches
 * so the model answers grounded in THIS codebase — suggesting code that follows
 * the existing logic and conventions.
 *
 * No external vector DB: the corpus (docs + a handful of model scripts) is
 * small enough that an in-memory cosine scan over a JSON file is instant and
 * keeps the disk/dependency footprint near zero — important on this CPU-only,
 * disk-constrained box.
 */

import fs from "fs";
import path from "path";

export const OLLAMA_BASE = process.env.OLLAMA_BASE ?? "http://localhost:11434";
export const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

// Where the vector store lives (next to the server bundle, outside the tree we index).
const INDEX_PATH = process.env.RAG_INDEX_PATH ?? path.join(process.cwd(), "rag-index.json");

// File types worth indexing. Code + docs only.
const INDEX_EXTS = new Set([
  ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs",
  ".md", ".txt", ".sql", ".yaml", ".yml", ".json",
]);
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "__pycache__",
  ".next", "build", ".venv", "venv", ".cache", "results",
]);
const MAX_FILE_BYTES = 512 * 1024; // skip anything bigger than 512 KB

export interface Chunk {
  id: string;
  source: string;     // path relative to the index root
  startLine: number;
  endLine: number;
  text: string;
  vector: number[];
}

export interface RagIndex {
  model: string;
  builtAt: string;
  sources: string[];  // the roots that were indexed
  chunkCount: number;
  chunks: Chunk[];
}

// ---------------------------------------------------------------------------
// Embeddings (via Ollama)
// ---------------------------------------------------------------------------

// Hard cap on characters sent to the embedding model. nomic-embed-text has a
// modest context window; staying well under it avoids "input exceeds context".
const MAX_EMBED_CHARS = 6000;

export async function embed(text: string, model = EMBED_MODEL): Promise<number[]> {
  const prompt = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
  const r = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Embedding failed (${r.status}): ${detail || "is the embedding model pulled?"}`);
  }
  const data = (await r.json()) as { embedding?: number[] };
  if (!data.embedding?.length) throw new Error("Embedding response had no vector");
  return data.embedding;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------------------
// Chunking — line-windowed with overlap so context never splits mid-thought.
// ---------------------------------------------------------------------------

const WINDOW_LINES = 80;
const OVERLAP_LINES = 12;
const MAX_CHUNK_CHARS = 3000; // keep each chunk comfortably inside the embed context

function chunkFile(source: string, content: string): Omit<Chunk, "vector">[] {
  const lines = content.split(/\r?\n/);
  const out: Omit<Chunk, "vector">[] = [];
  let part = 0;

  const emit = (startIdx: number, endIdx: number) => {
    const text = lines.slice(startIdx, endIdx).join("\n").trim();
    if (text) {
      out.push({ id: `${source}#${part}`, source, startLine: startIdx + 1, endLine: endIdx, text });
      part++;
    }
  };

  let start = 0;
  while (start < lines.length) {
    // Grow the window until we hit the line cap OR the character cap.
    let end = start;
    let chars = 0;
    while (end < lines.length && (end - start) < WINDOW_LINES && chars < MAX_CHUNK_CHARS) {
      chars += lines[end].length + 1;
      end++;
    }
    if (end === start) end = start + 1; // guarantee progress on a single huge line
    emit(start, end);
    if (end >= lines.length) break;
    start = Math.max(end - OVERLAP_LINES, start + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function collectFiles(absRoot: string, indexRoot: string, acc: string[]): void {
  let stat: fs.Stats;
  try { stat = fs.statSync(absRoot); } catch { return; }

  if (stat.isFile()) {
    const ext = path.extname(absRoot).toLowerCase();
    if (INDEX_EXTS.has(ext) && stat.size <= MAX_FILE_BYTES) {
      acc.push(path.relative(indexRoot, absRoot).replace(/\\/g, "/"));
    }
    return;
  }
  if (!stat.isDirectory()) return;

  let names: string[];
  try { names = fs.readdirSync(absRoot); } catch { return; }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    collectFiles(path.join(absRoot, name), indexRoot, acc);
  }
}

// ---------------------------------------------------------------------------
// Index build / load / retrieve
// ---------------------------------------------------------------------------

export interface BuildProgress {
  phase: "scanning" | "embedding" | "saving" | "done" | "error";
  file?: string;
  current?: number;
  total?: number;
  message?: string;
}

/**
 * Build (or rebuild) the vector index.
 * @param indexRoot  absolute path that `sources` are relative to (EDITOR_ROOT)
 * @param sources    relative dirs/files to index
 * @param model      embedding model name
 * @param onProgress streamed progress callback
 */
export async function buildIndex(
  indexRoot: string,
  sources: string[],
  model: string,
  onProgress: (p: BuildProgress) => void,
): Promise<RagIndex> {
  onProgress({ phase: "scanning", message: "Scanning files…" });

  const files: string[] = [];
  for (const src of sources) {
    const abs = path.resolve(indexRoot, src);
    if (!abs.startsWith(path.resolve(indexRoot))) continue; // path-traversal guard
    collectFiles(abs, indexRoot, files);
  }
  // de-dupe
  const uniqueFiles = Array.from(new Set(files));

  // Build the chunk list first so we know the total for progress reporting.
  const pending: Omit<Chunk, "vector">[] = [];
  for (const rel of uniqueFiles) {
    try {
      const content = fs.readFileSync(path.resolve(indexRoot, rel), "utf-8");
      pending.push(...chunkFile(rel, content));
    } catch { /* skip unreadable */ }
  }

  const chunks: Chunk[] = [];
  for (let i = 0; i < pending.length; i++) {
    const c = pending[i];
    onProgress({ phase: "embedding", file: c.source, current: i + 1, total: pending.length });
    const vector = await embed(c.text, model);
    chunks.push({ ...c, vector });
  }

  onProgress({ phase: "saving", message: "Saving index…" });
  const index: RagIndex = {
    model,
    builtAt: new Date().toISOString(),
    sources,
    chunkCount: chunks.length,
    chunks,
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index), "utf-8");
  onProgress({ phase: "done", total: chunks.length, message: `Indexed ${chunks.length} chunks from ${uniqueFiles.length} files.` });
  return index;
}

let _cache: RagIndex | null = null;

export function loadIndex(): RagIndex | null {
  if (_cache) return _cache;
  try {
    if (!fs.existsSync(INDEX_PATH)) return null;
    _cache = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as RagIndex;
    return _cache;
  } catch { return null; }
}

export function invalidateCache(): void { _cache = null; }

export function indexStatus(): {
  exists: boolean; builtAt?: string; chunkCount?: number; sources?: string[]; model?: string;
} {
  const idx = loadIndex();
  if (!idx) return { exists: false };
  return { exists: true, builtAt: idx.builtAt, chunkCount: idx.chunkCount, sources: idx.sources, model: idx.model };
}

export interface RetrievedChunk {
  source: string;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
}

/** Embed the query and return the top-K most similar chunks. */
export async function retrieve(query: string, topK = 5, embedModel?: string): Promise<RetrievedChunk[]> {
  const idx = loadIndex();
  if (!idx || idx.chunks.length === 0) return [];
  const qv = await embed(query, embedModel ?? idx.model ?? EMBED_MODEL);
  return idx.chunks
    .map((c) => ({
      source: c.source,
      startLine: c.startLine,
      endLine: c.endLine,
      text: c.text,
      score: cosine(qv, c.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
