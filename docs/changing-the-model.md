# Changing / Adding the Local Model

How to switch the local LLM, add new models to the picker, and run a bigger model on a
more powerful machine. The assistant is used here to **write and modify actuarial scripts**
(the UL / FIA / VA model engines), so a code-focused model is the right choice.

> Related: [local-llm-training.md](local-llm-training.md) (how the model + RAG work) ·
> [running-the-project.md](running-the-project.md) (how to start everything) ·
> [example-prompts.md](example-prompts.md) (prompts to try).

---

## How the model is selected

There are three layers, from quickest to most permanent:

| Layer | Where | Scope |
|---|---|---|
| **UI dropdown** | Code Editor → AI panel → ⚙ → **Model** | Per browser (saved in `localStorage` as `ai_model`), sent as the `model` field on every chat request. Installed models show **✓ installed**. |
| **Server default** | `OLLAMA_MODEL` env var → [server/routes.ts](../server/routes.ts) | Default for everyone when the UI hasn't chosen a model. |
| **Dropdown list** | Automatic | Every model you `ollama pull` shows up in the picker on its own (live from `/api/local-llm/status`). `AI_MODELS.ollama` in [CodeEditorPanel.tsx](../client/src/components/CodeEditorPanel.tsx) only controls *suggestions for not-yet-pulled* models. |

---

## Step 1 — Pull the model (that's the only required step)

```powershell
ollama pull qwen2.5-coder:7b      # download
ollama list                        # confirm it's installed
```

**Any model you pull appears in the dropdown automatically** — no code edit needed. The UI
reads the live installed list from `/api/local-llm/status` and lists every pulled model marked
**✓ installed**. If you pulled it while the editor was open, click **refresh models** (next to
the Model dropdown in the ⚙ panel) to pick it up — no need to reload.

> Embedding models (e.g. `nomic-embed-text`) are filtered out of the chat-model dropdown, since
> they can't generate chat responses.

## Step 2 — (Optional) add a curated suggestion

The dropdown also shows a few *suggested* models you haven't pulled yet, marked **⤓ pull
required**, so they're discoverable. To change that suggestion list, edit `AI_MODELS.ollama` in
[client/src/components/CodeEditorPanel.tsx](../client/src/components/CodeEditorPanel.tsx):

```ts
ollama: [
  { value: "qwen2.5-coder:3b",  label: "Qwen2.5 Coder 3B (recommended for this PC)" },
  { value: "qwen2.5-coder:7b",  label: "Qwen2.5 Coder 7B (smarter, needs more RAM/GPU)" },
  { value: "qwen2.5-coder:14b", label: "Qwen2.5 Coder 14B (best, GPU recommended)" },  // ← add a suggestion
  { value: "deepseek-coder-v2", label: "DeepSeek Coder V2 16B" },
  { value: "llama3.1:8b",       label: "Llama 3.1 8B (general)" },
],
```

This list only affects *suggestions for not-yet-installed* models. Pulled models always show up
on their own. `value` must match the exact Ollama tag.

## Step 3 — Pick it / set the default

- **In the UI:** open ⚙, choose the model, **Save settings**.
- **As the server default:** set the env var before starting the app:
  ```powershell
  $env:OLLAMA_MODEL = "qwen2.5-coder:7b"
  npm run dev
  ```

---

## Recommended models by hardware (for actuarial Python)

Coder models follow code conventions best. Sizes are the Q4 download size.

| Machine | Model | Size | Notes |
|---|---|---|---|
| **This VM** — 2 CPU cores, no GPU | `qwen2.5-coder:3b` | ~1.9 GB | The current default. Usable speed, decent code. |
| 8-core CPU, 16–32 GB RAM | `qwen2.5-coder:7b` | ~4.7 GB | Noticeably better actuarial logic; slower on CPU. |
| GPU ≥ 12 GB VRAM | `qwen2.5-coder:14b` | ~9 GB | Strong. Fast on GPU. |
| GPU ≥ 24 GB VRAM | `qwen2.5-coder:32b` / `deepseek-coder-v2` | ~20 GB | Best quality for complex projections/reserving code. |

> **Why CPU is slow:** the model computes every token on the CPU. A 3B model is the practical
> ceiling on a 2-core box. Step up only on a machine with more cores or a GPU — that's when
> the 7B/14B/32B coders become worthwhile.

---

## Run the model on a *different* machine than the app

Keep the app on this VM but run the model on a GPU server — **no code change**, one env var:

```powershell
# On the app machine:
$env:OLLAMA_BASE = "http://gpu-server-ip:11434"
npm run dev
```

On the GPU server, let Ollama accept remote connections and pull the model there:

```powershell
$env:OLLAMA_HOST = "0.0.0.0"
ollama serve
ollama pull qwen2.5-coder:14b
```

`OLLAMA_BASE` is read in [server/routes.ts](../server/routes.ts) and [server/rag.ts](../server/rag.ts).

---

## Important: the embedding model is separate

Two models are in play:

| Role | Default | Env var |
|---|---|---|
| **Chat / code** | `qwen2.5-coder:3b` | `OLLAMA_MODEL` |
| **Embeddings (RAG index)** | `nomic-embed-text` | `OLLAMA_EMBED_MODEL` |

- You can change the **chat model** freely, anytime — no re-indexing needed.
- If you change the **embedding model**, you **must re-run "Train on docs"**. Vectors from
  different embedding models aren't comparable, so retrieval would silently return junk otherwise.

---

## Speed / quality tuning (env vars)

Read in [server/routes.ts](../server/routes.ts); all optional.

| Variable | Default | Effect |
|---|---|---|
| `OLLAMA_KEEP_ALIVE` | `30m` | How long the model stays loaded in RAM. Keep it long so requests don't pay the reload cost (~11s cold vs ~1s warm here). |
| `OLLAMA_NUM_PREDICT` | `1024` | Max tokens generated. Lower = faster, shorter answers. |
| `OLLAMA_NUM_CTX` | `8192` | Context window. Larger fits more RAG context but is slower to process. |
