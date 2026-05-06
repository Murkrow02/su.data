# HDS Pipeline — Tooling Index

> Five-stage pipeline that turns Italian politicians' Instagram activity into the alignment metrics underpinning the *Semantic Gap* report. Each stage lives in its own folder with its own venv and its own README.

---

## Pipeline Overview

```
   ┌────────────────────────────────────────────────────────────────────┐
   │  Flash Eurobarometer EP013EP — Youth Survey 2024 (Italy, Q2)       │
   │  → ground-truth distribution YOUTH_RAW_PCT_IT (10 topics)          │
   └────────────────────────────────────────────────────────────────────┘
                                  │  used by Stage 5
                                  ▼
   ┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
   │ 1. Scraping     │───▶│ 2. Transcribing  │───▶│ 3. Scoring (LLM) │
   │ Instagram posts │    │ OCR + ASR fusion │    │ 10 topic Likert  │
   │ instaloader     │    │ Tesseract+Whisper│    │ + sent + propag. │
   └─────────────────┘    └──────────────────┘    └────────┬─────────┘
                                                           │
                                ┌──────────────────────────┼──────────────────────────┐
                                ▼                                                     ▼
                       ┌──────────────────┐                               ┌──────────────────────┐
                       │ 4. Validation    │   κ_w, ρ, MAE, Wilcoxon, α     │ 5. Analysis & Plots │
                       │ (LLM vs humans)  │   ──────────────────────────▶  │ ranks + alignment   │
                       │  optional        │   feeds back into model choice │ heatmaps + report   │
                       └──────────────────┘                               └──────────────────────┘
```

| Stage | Folder                          | Script              | Input                                        | Output                                          |
|------:|---------------------------------|---------------------|----------------------------------------------|-------------------------------------------------|
|  1    | `tools/content_scraping/`       | `scraper.py`        | Instagram (cookies in `.env`)                | `data/content/<profile>/<YYYY-MM-DD_NNN>/`      |
|  2    | `tools/text_transcriber/`       | `transcriber.py`    | per-post folders                             | per-post `<id>.json`, per-profile `<prof>.json` |
|  3    | `tools/scorer/`                 | `scorer.py`         | `<profile>.json`                             | `data/scores/<profile>.csv`                     |
|  4    | `tools/model_validation/`       | `validator.py`      | `data/model_validation/politicians/*/*.csv`  | `data/model_validation/results/results.md`      |
|  5    | `tools/results_analyzer/`       | `analyzer.py`       | `data/scores/*.csv`                          | `data/results/{plots,csv}/`                     |

Each `tools/<stage>/README.md` is a self-contained chapter — purpose, theoretical framing, data flow, setup, usage, methodology, output schema, limitations. Concatenating them top-to-bottom produces a draft of the project's technical report.

---

## Quick Start

```bash
# From the repo root
python tools/main.py
```

The wizard prints a status table for every tracked profile (✓ scraped / ✓ transcribed / ✓ scored / ✓ analysed), then prompts which stage to run. It auto-discovers profiles in `data/content/` and CSVs in `data/scores/`, picks the right per-tool venv, and streams the subprocess output live.

Per-tool invocation works the same way — every script has a zero-argument default and prompts interactively when a choice is needed:

```bash
source tools/scorer/venv/bin/activate && python tools/scorer/scorer.py
```

---

## Layout

```
tools/
├── README.md                  ← this file
├── main.py                    ← wizard / orchestrator (stdlib only)
├── shared/                    ← canonical paths, topics loader, prompt helpers
│   ├── paths.py
│   ├── topics.py              ← reads data/topics.json
│   └── prompts.py
├── content_scraping/
├── text_transcriber/
├── scorer/
├── model_validation/
└── results_analyzer/
```

The `shared/` package is the single source of truth for paths and topic configuration. Every tool imports from it instead of hard-coding directory arithmetic. Editing `data/topics.json` is the only place needed to add or rename a topic — every downstream script picks up the change.

---

## Per-Stage Cheatsheet

```bash
# 1. Scrape
python tools/content_scraping/scraper.py                     # menu
python tools/content_scraping/scraper.py giorgiameloni
python tools/content_scraping/scraper.py giorgiameloni --start 2024-09-01 --end 2024-10-31

# 2. Transcribe
python tools/text_transcriber/transcriber.py                 # menu
python tools/text_transcriber/transcriber.py giorgiameloni

# 3. Score
python tools/scorer/scorer.py                                # menu, default model
python tools/scorer/scorer.py -m qwen3:14b -i data/content/giorgiameloni/giorgiameloni.json

# 4. Validate (optional — only after running scorer for the validation politicians)
python tools/model_validation/validator.py                   # menu, auto-discovers models
python tools/model_validation/validator.py --models gemma4 qwen3-14b mistral

# 5. Analyse
python tools/results_analyzer/analyzer.py                    # default I/O
python tools/results_analyzer/analyzer.py --threshold 4
python tools/results_analyzer/analyzer.py --profiles ellyesse giorgiameloni
```

---

## Conventions

* **Zero-arg defaults.** Every script runs without flags, prompting interactively when a profile / model must be picked.
* **Canonical I/O.** Each stage reads from / writes to a fixed location under `data/`. No `--input` magic outside the tool's own directory.
* **Per-tool venvs.** Heavy and conflicting deps (faster-whisper, instaloader, openai) live in isolated venvs under `tools/<stage>/venv/`. The wizard invokes the correct binary per stage.
* **Stdlib-only orchestration.** `main.py` has no third-party deps; it just shells out to per-tool venvs.
* **Determinism.** Stages 2–5 are deterministic given fixed inputs and pinned model versions. Stage 1 is idempotent on already-fetched date folders.
