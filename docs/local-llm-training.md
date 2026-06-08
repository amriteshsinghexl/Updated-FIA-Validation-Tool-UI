# Local LLM + "Training on Docs" (Ollama + RAG)

This document describes the local-LLM assistant in the Code Editor's prompt window:
running a model entirely on this machine (no API key, no cloud), attaching files to a
prompt, picking the file you want updated, and "training" the model on the project's own
docs and scripts so its code suggestions follow **your** logic.

> "Training" here means **Retrieval-Augmented Generation (RAG)**, not fine-tuning.
> On a CPU-only box, true fine-tuning is impractical. Instead we embed the docs + scripts
> into a local vector index and inject the most relevant pieces into each prompt. The model
> answers grounded in the actual project, and you can re-index in seconds whenever docs change.

> **See also:** [running-the-project.md](running-the-project.md) (start everything) ·
> [changing-the-model.md](changing-the-model.md) (swap / add models, run on a GPU box) ·
> [example-prompts.md](example-prompts.md) (prompts for writing actuarial scripts).

---

## 1. Prerequisites — Ollama + models

[Ollama](https://ollama.com) runs the model locally. It was installed on this machine with:

```powershell
winget install --id Ollama.Ollama
```

Two models are pulled (chosen to fit this hardware — CPU-only, 16 GB RAM, limited disk):

| Model | Size | Role |
|---|---|---|
| `qwen2.5-coder:3b` | ~1.9 GB | Code chat / suggestions (the default) |
| `nomic-embed-text` | ~274 MB | Embeddings for the RAG index |

```powershell
ollama pull qwen2.5-coder:3b
ollama pull nomic-embed-text
```

Ollama runs a local server at `http://localhost:11434`. On Windows the installer registers it
to start automatically; if it isn't running, start it with:

```powershell
ollama serve
```

> **Model choice / hardware note.** This is a 2-core, CPU-only VM, so a 3B model is the sweet
> spot — usable speed and modest disk. A 7B coder model is noticeably smarter but slow on CPU
> and eats most of the free disk. Switch models in the AI settings dropdown; any model you
> `ollama pull` will appear there marked **✓ installed**.

---

## 2. Using the local model in the prompt window

1. Open the Code Editor (**View Code**) and the AI panel on the right.
2. Click the **⚙ settings** icon → set **AI Provider** to **Local LLM ★ free**.
3. The status row shows **● Ollama running** and the installed models.
4. Pick a model (default `qwen2.5-coder:3b`) and **Save settings**.
5. Type in the prompt box and press Enter. No API key, no internet required.

---

## 3. Attaching files to a prompt

Three ways to give the model extra context, all from the bottom of the prompt window:

| Control | What it does |
|---|---|
| **📎 Attach** | Opens a searchable list of every file in the project tree. Click one to attach its full text as context. Attach as many as you like. |
| **⬆ Upload** | Browse/select a file from **outside** the project (drag-drop friendly) — read in the browser and sent as ad-hoc context. |
| **🎯 Target file** | A dropdown (open tabs + attached files) marking *which file the model should write code for*. Its suggestions are scoped to that file. Defaults to the file you're currently editing. |

Attached files appear as removable chips above the prompt. The currently-open file is always
included automatically; attachments and the target file are sent **in addition** to it.

Attachments and the target hint work with every provider. With the **Local LLM** provider they
are sent as structured fields; with cloud providers they are folded into the message text.

---

## 4. Training on docs & scripts (the RAG index)

In **⚙ settings**, with the Local LLM provider selected, there is a **Train on docs & scripts**
panel:

1. Click **Train on docs** (or **Re-train on docs** after the first time).
2. A progress bar shows scanning → embedding each chunk → saving.
3. When done it reports e.g. *"Indexed 312 chunks"* with a timestamp.
4. Leave **"Use trained knowledge when answering"** ticked to ground answers in the index.

### What gets indexed

By default the server indexes the docs and model scripts that exist under `C:\projects`:

```
UL/docs            UL/ulp_model            UL/app
VA/docs
Updated-FIA-Validation-Tool-UI/docs
```

Each file is split into overlapping ~80-line chunks, embedded with `nomic-embed-text`, and
stored as vectors in a flat JSON file (`rag-index.json`, next to the server). At prompt time the
question is embedded, the top-5 most similar chunks are retrieved, and they are prepended to the
prompt as **CONTEXT**. The system prompt tells the model to follow the existing logic and return
exact, complete code for the relevant section.

Re-run training whenever the docs or scripts change — it only takes seconds for this corpus.

---

## 5. Backend API

All endpoints are served by the app's Express server (same origin as the UI).

### `GET /api/local-llm/status`
Reports whether Ollama is reachable, the installed models, the embedding model, and the current
index status.

```json
{
  "running": true,
  "models": ["qwen2.5-coder:3b", "nomic-embed-text:latest"],
  "activeModel": "qwen2.5-coder:3b",
  "embedModel": "nomic-embed-text",
  "embedModelReady": true,
  "index": { "exists": true, "chunkCount": 312, "builtAt": "2026-06-08T...", "sources": ["UL/docs", "..."] }
}
```

### `GET /api/local-llm/index/status`
Returns the index status plus `defaultSources` (the existing default roots).

### `POST /api/local-llm/index`
(Re)builds the index. Body: `{ "sources"?: string[], "embedModel"?: string }`. Omit `sources`
to use the defaults. Streams progress as Server-Sent Events:

```
data: {"phase":"embedding","file":"UL/ulp_model/model.py","current":42,"total":312}
data: {"phase":"done","total":312,"message":"Indexed 312 chunks from 18 files."}
data: [DONE]
```

### `POST /api/local-llm/chat`
Streaming chat (SSE, OpenAI-compatible deltas). Body:

```json
{
  "message": "Add a lapse decrement to the projection loop",
  "code": "<current file content>",
  "filename": "UL/ulp_model/forward_projection.py",
  "language": "python",
  "model": "qwen2.5-coder:3b",
  "useRag": true,
  "targetFile": "UL/ulp_model/forward_projection.py",
  "attachments": [{ "name": "UL/ulp_model/inputs.py", "content": "..." }]
}
```

When `useRag` is true and an index exists, the server retrieves relevant chunks and injects them
before the attachments and the current/target file.

---

## 6. Files

| File | Purpose |
|---|---|
| `server/rag.ts` *(new)* | Embeddings, chunking, vector store (JSON), build/retrieve. |
| `server/routes.ts` | `local-llm` status/index/chat endpoints; default index sources. |
| `client/src/components/CodeEditorPanel.tsx` | Attach/upload/target UI, Train panel, RAG toggle, provider wiring. |

---

## 7. Environment variables

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b` | Default chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model for the index |
| `RAG_INDEX_PATH` | `<cwd>/rag-index.json` | Where the vector index is stored |
| `EDITOR_ROOT` | parent of app dir (`C:\projects`) | Root that index sources & attachments resolve against |

---

## 8. Limitations & notes

- **CPU-only inference** — expect a few seconds before the first token and modest tokens/sec.
  The 3B model keeps this tolerable; larger models will be slower.
- **RAG, not fine-tuning** — the model's weights are unchanged. It "knows" your project only
  through retrieved context, which is why re-indexing after doc changes matters.
- The vector store is a flat JSON cosine scan — perfect for this small corpus, not for millions
  of chunks. Swap in a real vector DB if the corpus grows large.
- Everything runs locally: no code, docs, or prompts leave the machine when using the Local LLM
  provider.
