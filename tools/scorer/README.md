# 3. Scorer — LLM Topic / Sentiment / Propaganda Scoring

> **Stage 3 of the HDS pipeline.** Lifts each post from raw text to a structured row of topical and rhetorical features.

---

## 1. Purpose

For every post in a politician's `<profile>.json`, this tool obtains four annotations via a **single call** to a local LLM:

1. **Topic relevance** — score 1–5 against each of the 10 Eurobarometer EP013EP youth topics.
2. **Keywords** — 3–8 content-specific Italian terms describing what the post discusses.
3. **Sentiment** — `positive` / `neutral` / `negative` / `mixed`.
4. **Propaganda level** — `none` / `low` / `medium` / `high`, defined here as the gradient from substantive content to pure attack-without-proposal rhetoric.

The output CSV is the canonical input to Stages 4 (validation) and 5 (analysis). Every macro-claim of the project — Coverage Rate, Agenda Alignment, Top-K overlap — is computed on the columns this stage produces.

---

## 2. Theoretical Framing

### 2.1 LLM-as-annotator

Using a language model as an annotator on Likert-style content scoring is a well-attested research methodology in 2024–2026, motivated by:

* **Cost / scale.** Hand-annotating 100+ posts × 10 topics × 4 raters is infeasible for a course project; LLMs make N=100 effectively free.
* **Consistency.** A locked prompt, deterministic decoding (`temperature=0.0`) and a fixed model produce reproducible scores — unlike human annotators whose reliability drifts over a session.
* **Multilingual transfer.** Open-weight Italian-capable LLMs (Qwen3, Gemma, Mistral) handle Italian political vernacular without fine-tuning.

The risks — hallucination, calibration drift, prompt sensitivity — are addressed empirically by the **Stage 4 validator**, which compares the LLM scores against human-averaged annotations on a 30-post sample using Kappa, Spearman, MAE, Wilcoxon and Krippendorff's alpha. Models that fail to clear basic agreement are dropped before the final analysis.

### 2.2 Why a single call per post?

The prompt asks for all four annotations in one structured JSON response. Alternatives considered and rejected:

* **One call per topic.** 10× the cost; encourages local reasoning ("does the post talk about housing?") at the price of losing the global picture across topics. We need each topic score to be calibrated *against* the others.
* **Free-text reasoning then JSON.** Increases latency and tokens without measurably improving agreement on this rubric.

The single-call design forces the model to construct the full topic vector in one pass, which keeps relative scores internally consistent (a 5 on `lavoro_economia` will be a 5 *relative to* the other 9 topics in the same post).

### 2.3 The 1–5 Likert rubric

The rubric is intentionally rigorous and asymmetric:

| Score | Definition                                                         |
|-------|--------------------------------------------------------------------|
| 1     | Topic completely absent.                                           |
| 2     | Topic barely hinted at (one indirect reference).                   |
| 3     | Topic recognisable but secondary.                                  |
| 4     | Topic significant; discussed with some depth.                      |
| 5     | Topic is the main subject.                                         |

The first level is a *true zero*: 1 means the topic does not appear at all. This matters for Stage 5's Coverage Rate, which thresholds at `score ≥ τ` (default τ=3). A 5-point scale balances:

* Enough granularity to separate "marginal mention" from "central theme".
* Few enough levels for human raters in Stage 4 to converge.

### 2.4 Sentiment & Propaganda

Sentiment uses the standard 4-category schema; "mixed" is essential for political posts that hail a victory while attacking opponents in the same caption. Propaganda is defined operationally as the **proposal-to-attack ratio**:

* `none` — pure substance (policy details, factual reporting).
* `low` — substantive with rhetorical flourishes.
* `medium` — significant partisan framing, some attacks.
* `high` — attacks and slogans only, no proposals.

This dimension is ancillary to the agenda-gap thesis but lets the report comment on *how* topics are communicated, not only *whether*.

---

## 3. Data Flow

```
   data/content/<profile>/<profile>.json   ← transcriber output
                       │
                       ▼
   tools/scorer/scorer.py   →   data/scores/<profile>.csv
```

* **Input** — JSON array of posts: each item must have `folder_id`, `caption`, `text`, `type`, `language`.
* **Output** — CSV at `data/scores/<profile>.csv`. One row per post; resume is automatic.
* **Downstream** — `analyzer.py` (rankings, alignment) and `validator.py` (model agreement against humans).

---

## 4. Setup

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

## 5. Usage

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

## 6. Methodology / Algorithms

### 6.1 The full prompt

The system prompt instructs the model to return a JSON object with `scores`, `keywords`, `sentiment`, `propaganda`. The 10 topic keys are interpolated dynamically from `tools/shared/topics.py`, so adding or removing topics requires editing only the JSON config — no prompt changes. The user message is `f"POST:\n{caption}\n\n{text}"`.

The rubric, key meanings, valid enum values and a worked example are all in the system prompt — making the prompt self-contained reduces the risk that the model invents an extra field or a value outside the legal set.

### 6.2 Robust JSON parsing

Open-weight LLMs occasionally wrap their output in `<think>` blocks, markdown fences, or explanatory prose. The parser applies fallbacks in order:

1. Strip `<think>...</think>` (Qwen3-style).
2. `json.loads` direct.
3. Strip ` ```json ` fences and try again.
4. Regex-extract the first `{...}` block, try again.
5. Give up → all fields are recorded as empty.

Field-level validation:

* Topic scores must be integers 1–5; out-of-range or non-integer values become empty.
* Keywords are coerced to a `;`-separated string of up to 8 terms.
* Sentiment / propaganda are lower-cased and validated against the closed set; unknown values become empty.

### 6.3 Retry policy

The OpenAI client may raise transient errors (`APIConnectionError`, `APITimeoutError`, `InternalServerError`). Each post is retried up to 3 times with exponential backoff (2s, 4s, 8s). After exhausting retries the row is written with empty fields and the run continues — single-post failures do not abort a long batch.

### 6.4 Resume support

If `<profile>.csv` exists, the scorer reads the `folder_id` column, builds the set of already-scored posts, and processes only the complement. The CSV is opened in append mode and `flush()`ed after every row, so a kill mid-run loses at most one in-flight post. This is the only stateful piece of the pipeline; downstream stages re-derive everything from the CSV.

### 6.5 Determinism

Greedy decoding (`temperature=0.0`) gives byte-stable outputs on a fixed model + fixed prompt. Sampling-based decoding is intentionally avoided: course-grade reproducibility is more valuable here than the marginal quality bump from nucleus sampling.

### 6.6 Why local LLM

* **Privacy.** Politicians' captions contain personal pronouns and named third parties; sending them to a hosted API is unnecessary and politically sensitive.
* **Cost.** A 200-post run is ~10 min on Ollama / Apple Silicon; at OpenAI prices it would be cents but at Anthropic prices it would still be cheap. Local runs are *free* and stable across the project's lifetime.
* **Reproducibility.** Hosted models are silently re-trained; a locally pinned `gemma4` will produce the same scores in 2027 that it did in 2026.

---

## 7. Output Artifacts

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

## 8. Limitations & Notes

* **Annotator bias.** A 14B-parameter open-weight model is far from perfect on subtle political framing (irony, dog-whistles). Stage 4 quantifies this via Cohen's weighted κ.
* **Context length.** Each call sends a single post; we do not feed prior posts as context. The LLM sees no narrative arc, only the post in isolation. This is a deliberate independence assumption: per-post topic scores must be comparable across politicians and across time.
* **Cost / latency.** ~10 s per post on `gemma4` int4 quantised on Apple M-series CPU. Estimate ~5 min per 30-post profile, plus model warmup.
* **Model selection.** `gemma4` was the best-performing model on the human-validation sample at the time of writing; rerunning Stage 4 with a different model is the recommended way to verify.
* **Reproducibility.** Pin the exact model version (e.g. `qwen3:14b-instruct-q4_K_M`) for the final report; minor version bumps in Ollama can change tokenisation and therefore outputs.
* **Topic extension.** Adding an 11th topic requires only editing `data/topics.json`; the prompt regenerates from `tools/shared/topics.py` automatically, but you must also re-score every profile.
