# Running the Project

How to start the FIA Validation Tool UI with the local LLM assistant, from a clean machine.

> Related: [changing-the-model.md](changing-the-model.md) · [local-llm-training.md](local-llm-training.md) ·
> [example-prompts.md](example-prompts.md).

---

## 1. Prerequisites

| Tool | Why | Check |
|---|---|---|
| **Node.js 18+** | Runs the app (server + client) | `node -v` |
| **npm** | Installs dependencies | `npm -v` |
| **Python** (launched as `py`) | Only for running the actuarial model engine (`run_model.py`) | `py --version` |
| **Ollama** | Runs the local LLM | `ollama --version` |

The app lives in `C:\projects\Updated-FIA-Validation-Tool-UI`. The product model code it edits/
runs lives in sibling folders (`C:\projects\UL`, `C:\projects\VA`, …).

---

## 2. One-time setup

### a) Install Node dependencies
```powershell
cd C:\projects\Updated-FIA-Validation-Tool-UI
npm install
```

### b) Install Ollama + pull the models
```powershell
winget install --id Ollama.Ollama        # installs Ollama + a background service on :11434
ollama pull qwen2.5-coder:3b              # the code/chat model (default)
ollama pull nomic-embed-text             # embeddings for "Train on docs"
ollama list                               # confirm both are present
```

If the Ollama service isn't already running:
```powershell
ollama serve
```

---

## 3. Start the app

### Development (hot reload)
```powershell
npm run dev
```
Open **http://localhost:3000**. The server prints `Server running on http://localhost:3000`.

### Production
```powershell
npm run build
npm start            # serves on PORT (default 3000)
```

### Type-check only
```powershell
npm run check
```

---

## 4. First run — turn on the local assistant

1. Click **View Code** in the top ribbon.
2. In the right-hand AI panel, click **⚙** and set **AI Provider → Local LLM ★ free**.
3. You should see **● Ollama running** and the installed models. Pick `qwen2.5-coder:3b`, **Save**.
4. Click **Train on docs** once (indexes your docs + scripts; takes a few seconds).
5. Open an actuarial script (e.g. `UL/ulp_model/forward_projection.py`) and start prompting.
   See [example-prompts.md](example-prompts.md).

No GitHub sign-in or API key is needed for the Local LLM provider — everything runs on this
machine.

---

## 5. Ports

| Port | Service |
|---|---|
| `3000` | The app (UI + API + local-LLM endpoints). The only non-firewalled port. |
| `11434` | Ollama (local model server). |
| `8000` | *Optional* — the UL FastAPI backend, only if you use the legacy `/api/v1/scripts` script editor. |

---

## 6. Environment variables (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | App port |
| `PYTHON_EXEC` | `py` | Python used to run `run_model.py` |
| `PRODUCTS_DIR` | parent of app (`C:\projects`) | Where product folders are scanned |
| `EDITOR_ROOT` | parent of app (`C:\projects`) | Root the code editor + RAG index resolve paths against |
| `OLLAMA_BASE` | `http://localhost:11434` | Ollama URL (point elsewhere to use a remote/GPU box) |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b` | Default chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model for the RAG index |
| `OLLAMA_KEEP_ALIVE` / `OLLAMA_NUM_PREDICT` / `OLLAMA_NUM_CTX` | `30m` / `1024` / `8192` | Speed/quality tuning |
| `DEBUG_HTTP` | unset | `1` = verbose per-request logging (incl. response bodies) |
| `DEBUG_COPILOT` | unset | `1` = print Copilot LSP stderr |

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| AI panel shows **● Ollama not running** | Run `ollama serve`; confirm `curl http://localhost:11434/api/tags` responds. |
| First response takes ~10s, then fast | Normal — the model loads into RAM on first use, then stays warm (`OLLAMA_KEEP_ALIVE`). |
| Every response is slow | Expected on CPU. Use a smaller model, or a machine with more cores / a GPU — see [changing-the-model.md](changing-the-model.md). |
| **Train on docs** errors | Make sure `nomic-embed-text` is pulled (`ollama list`). |
| Answers ignore the project | Tick **"Use trained knowledge when answering"** and run **Train on docs** at least once. |
| `'tsc' is not recognized` | `node_modules` isn't installed — run `npm install`. |
| Terminal too noisy | Already quieted by default; set `DEBUG_HTTP=1` only when debugging. |
