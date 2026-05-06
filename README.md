# Human Data Science — The Semantic Gap

> Quantifying the divergence between Italian youth's policy priorities and the agenda Italian political leaders communicate on Instagram.

This is the codebase for a **Human Data Science** course project. It builds an end-to-end empirical pipeline — scrape, transcribe, score, validate, analyse — that produces every figure and metric used in the final report (`docs/relazione.pdf`).

---

## Thesis in one paragraph

The Flash Eurobarometer **EP013EP** (Youth Survey 2024, Q2, Italy row, ages 16–30) gives a survey-grounded ranking of the topics young Italians want their government to prioritise. We compare this ranking against an empirically-derived ranking of what Italian political leaders actually *post about* on Instagram during the same window. The gap between the two — measured by Spearman ρ, Kendall τ, and Top-K Jaccard over coverage rates — is the *semantic gap* the project aims to expose.

---

## Quick start

```bash
git clone <repo>
cd hds
python tools/main.py
```

The wizard prints a status table for every tracked profile and walks through the five pipeline stages interactively.

Each stage has its own isolated venv under `tools/<stage>/venv/`. Create them once (`python -m venv venv && pip install -r requirements.txt` inside each `tools/<stage>/`) — afterwards every script runs zero-arg with sensible defaults.

---

## Repository layout

```
hds/
├── data/                       ← inputs and outputs (not committed beyond stubs)
│   ├── content/<profile>/      ← scraped posts + transcriptions
│   ├── scores/<profile>.csv    ← LLM scores per post
│   ├── model_validation/       ← human/LLM CSVs and the validator report
│   ├── results/{plots,csv}/    ← analyzer output
│   └── topics.json             ← single source of truth for the 10 EB topics
├── docs/                       ← LaTeX report
├── tools/                      ← five-stage pipeline (see tools/README.md)
└── dashboard/                  ← (legacy) Streamlit visualisation
```

The pipeline and tooling are documented in detail in **[`tools/README.md`](tools/README.md)** — pipeline diagram, per-stage I/O, and conventions. Every individual stage has a self-contained README under `tools/<stage>/README.md`; concatenated they form a draft of the technical report.

---

## Tracked politicians

`ellyesse`, `giorgiameloni`, `giuseppeconte_ufficiale`, `matteosalviniofficial`, `silviasalis`. Adding a new politician is one wizard run away — Stage 1 prompts for the username, downstream stages auto-discover.

---

## Privacy and ethics

This pipeline downloads only public Instagram posts of public political accounts via authenticated session cookies (`.env`, never committed). No follower lists, no comments, no stories. Captions and media are processed locally by an open-weight LLM running on Ollama — content does not leave the machine.

---

## Reference

* Flash Eurobarometer **EP013EP** — Youth Survey 2024 (full PDF in `data/Youth_Survey_2024_FL013EP_report_en.pdf`).
* McCombs, M. & Shaw, D. (1972). *The Agenda-Setting Function of Mass Media*.
* Landis, J. R. & Koch, G. G. (1977). *The Measurement of Observer Agreement for Categorical Data* — used in Stage 4 for Cohen's κ interpretive bands.
