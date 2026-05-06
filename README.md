# Human Data Science — The Semantic Gap

> Codebase for the **Human Data Science** course project. End-to-end pipeline — scrape, transcribe, score, validate, analyse — that produces every figure and metric in `docs/relazione.pdf`.

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


## Privacy and ethics

This pipeline downloads only public Instagram posts of public political accounts via authenticated session cookies (`.env`, never committed). No follower lists, no comments, no stories. Captions and media are processed locally by an open-weight LLM running on Ollama — content does not leave the machine.

---

