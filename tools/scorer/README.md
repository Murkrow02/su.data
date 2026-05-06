# 3. Scorer — LLM Topic / Sentiment / Propaganda Scoring

> **Stage 3 of the HDS pipeline.** Calls a local LLM once per post to produce the structured per-post features consumed by Stages 4 and 5.

---

## 1. What it produces

For every post in a politician's `<profile>.json`, a single LLM call returns:

1. **Topic relevance** — score 1–5 against each of the 10 Eurobarometer EP013EP youth topics (`1` absent · `2` marginal · `3` secondary · `4` significant · `5` main subject).
2. **Keywords** — 3–8 Italian content terms.
3. **Sentiment** — `positive` / `neutral` / `negative` / `mixed`.
4. **Propaganda level** — `none` / `low` / `medium` / `high`.

Output: one CSV row per post in `data/scores/<profile>.csv`, the canonical input to Stages 4 (validation) and 5 (analysis).

---

## 2. Data Flow

```
   data/content/<profile>/<profile>.json   ← transcriber output
                       │
                       ▼
   tools/scorer/scorer.py   →   data/scores/<profile>.csv
```

* **Input** — JSON array of posts, each with `folder_id`, `caption`, `text`, `type`, `language`.
* **Output** — CSV at `data/scores/<profile>.csv`. One row per post; resume is automatic.
* **Downstream** — `analyzer.py` (Stage 5) and `validator.py` (Stage 4).

---

## 3. Setup

```bash
cd tools/scorer
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

The scorer talks to any **OpenAI-compatible** local endpoint. The default expects [Ollama](https://ollama.com/) on `http://localhost:11434/v1`:

```bash
ollama serve
ollama pull gemma4             # default model
```

vLLM, llama.cpp `--api-server`, and any other OpenAI-shim backend work as long as the endpoint accepts `chat.completions` with the standard schema.

---

## 4. Usage

```bash
# Menu interattivo: lista i profili che hanno un <profile>.json
python scorer.py

# Modello di default, profilo specifico
python scorer.py -i ../../data/content/ellyesse/ellyesse.json

# Modello + profilo
python scorer.py -m gemma4 -i ../../data/content/giorgiameloni/giorgiameloni.json

# Solo alcuni post
python scorer.py --post-ids 2025-09-01_001 2025-09-01_002

# Reset (ignora il CSV esistente, rifà tutto)
python scorer.py -i .../ellyesse.json --no-resume
```

| Argomento       | Default                          | Descrizione                                               |
|-----------------|----------------------------------|-----------------------------------------------------------|
| `-m, --model`   | `gemma4`                         | Nome del modello sul server LLM.                          |
| `-i, --input`   | menu                             | JSON aggregato del profilo.                               |
| `-o, --output`  | `data/scores/<profilo>.csv`      | CSV di output (auto-derivato dal nome del file input).    |
| `--post-ids`    | tutti                            | Lista di `folder_id` da processare.                       |
| `--base-url`    | `http://localhost:11434/v1`      | Endpoint LLM.                                             |
| `--api-key`     | `ollama`                         | API key (dummy per server locali).                        |
| `--temperature` | `0.0`                            | Sampling temperature (0 = greedy).                        |
| `--max-tokens`  | `1024`                           | Budget tokens nella risposta.                             |
| `--no-resume`   | off                              | Ignora l'output esistente e riparte da zero.              |

---

## 5. Implementation Notes

### 5.1 Prompt construction

The system prompt instructs the model to return a JSON object with `scores`, `keywords`, `sentiment`, `propaganda`. The 10 topic keys are interpolated dynamically from `tools/shared/topics.py`, so adding or renaming a topic only requires editing `data/topics.json`. The user message is `f"POST:\n{caption}\n\n{text}"`.

### 5.2 Robust JSON parsing

Open-weight LLMs occasionally wrap output in `<think>` blocks, markdown fences, or prose. The parser applies these fallbacks in order:

1. Strip `<think>...</think>` (Qwen3-style).
2. `json.loads` direct.
3. Strip ` ```json ` fences and try again.
4. Regex-extract the first `{...}` block, try again.
5. Give up → all fields recorded as empty.

Field-level validation:

* Topic scores must be integers 1–5; out-of-range or non-integer values become empty.
* Keywords are coerced to a `;`-separated string of up to 8 terms.
* Sentiment / propaganda are lower-cased and validated against the closed set; unknown values become empty.

### 5.3 Retry policy

On `APIConnectionError`, `APITimeoutError`, `InternalServerError` each post is retried up to 3 times with exponential backoff (2 s, 4 s, 8 s). After exhausting retries the row is written with empty fields and the run continues.

### 5.4 Resume

If `<profile>.csv` exists, the scorer reads `folder_id`, builds the set of already-scored posts, and processes only the complement. The CSV is opened in append mode and `flush()`ed after every row.

---

## 6. Output Schema

CSV columns:

| Colonna                         | Tipo    | Descrizione                                                |
|---------------------------------|---------|------------------------------------------------------------|
| `folder_id`                     | string  | Identifier of the post (matches Stage 1/2 folder).         |
| `type`                          | enum    | `image` / `video` (passed through from `info.json`).       |
| `language`                      | enum    | `it` (passed through from transcriber).                    |
| `ambiente_clima` … `abitazione` | int 1–5 | Likert score for each of the 10 EB topics.                 |
| `keywords`                      | string  | 3–8 terms, `;`-separated.                                  |
| `sentiment`                     | enum    | `positive` / `neutral` / `negative` / `mixed`.             |
| `propaganda`                    | enum    | `none` / `low` / `medium` / `high`.                        |

Empty cells (`""`) indicate a parsing or upstream failure; downstream tools either skip those rows (`analyzer.py`) or treat them as missing (`validator.py`).

---

## 7. Limitations & Notes

* **Cost / latency.** ~10 s per post on `gemma4` int4 quantised on Apple M-series CPU. Estimate ~5 min per 30-post profile, plus model warmup.
* **Context length.** Each call sends a single post; we do not feed prior posts as context.
* **Model selection.** `gemma4` was the best-performing model on the human-validation sample at the time of writing; rerun Stage 4 with a different model to verify.
* **Reproducibility.** Greedy decoding (`temperature=0.0`) gives byte-stable outputs on a fixed model + fixed prompt. Pin the exact model version (e.g. `qwen3:14b-instruct-q4_K_M`) for the final report.
* **Topic extension.** Adding an 11th topic requires only editing `data/topics.json`; the prompt regenerates from `tools/shared/topics.py` automatically, but you must re-score every profile.
