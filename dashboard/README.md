# Su.Data — Political Instagram Observatory

> Static single-page dashboard to explore the scraped, transcribed, and LLM-scored Instagram corpus produced by the HDS pipeline.

---

## What it does

The dashboard consumes the JSON and CSV outputs of pipeline Stages 1–5 and presents them through six interactive views:

| Route | View | Description |
|-------|------|-------------|
| `/` | Home | Entry point with project summary |
| `/overview` | Panoramica | Cross-politician aggregate metrics |
| `/politicians` | Politici | Per-politician profile, slopegraph, and rank correlations |
| `/posts` | Post | Full-text search across captions, OCR, and transcriptions |
| `/topics` | Argomenti | Topic-level heatmaps and co-occurrence matrix |
| `/about` | About | Team and methodology notes |

Key metrics surfaced in the UI mirror those computed by Stage 5 (`results_analyzer`): **mean score**, **coverage rate** (threshold τ = 3), **Spearman ρ**, **Kendall τ**, and **Top-K overlap** against the Flash Eurobarometer EP013EP youth-priority distribution.

---

## Quick start

```bash
# From the repo root
python3 -m http.server 4173
```

Then open:

```
http://localhost:4173/dashboard/
```

No build step, no Node, no bundler — plain ES modules served directly by Python's built-in HTTP server.

---

## Layout

```
dashboard/
├── index.html          ← single HTML shell, templates, font/icon imports
├── favicon.svg
├── styles.css          ← all styling (CSS custom properties, no framework)
└── js/
    ├── main.js         ← entry point, wires router + state + first render
    ├── router.js       ← hash-based SPA router (#/path)
    ├── state.js        ← shared reactive state (loaded profiles, active filters)
    ├── data.js         ← fetches and normalises JSON/CSV data files
    ├── config.js       ← topic list, politician registry, chart info texts
    ├── views.js        ← one render function per route
    ├── components.js   ← reusable card/chip/modal components
    ├── charts.js       ← D3-based chart primitives (slopegraph, heatmap, bars)
    ├── stats.js        ← coverage, ranking, Spearman/Kendall/Top-K computation
    ├── dom.js          ← DOM helpers (query wrappers, template cloning)
    ├── insta-embedder.js ← lazy-loads official Instagram embed for each post
    └── utils.js        ← general-purpose helpers (format, clamp, debounce)
```

---

## Data dependencies

The dashboard reads files produced by the pipeline — it does **not** re-run any analysis. Expected locations (relative to repo root):

| File | Produced by | Used for |
|------|-------------|----------|
| `data/content/<profile>/<profile>.json` | Stage 2 | Post list, captions, OCR, transcriptions |
| `data/scores/<profile>.csv` | Stage 3 | Per-post Likert scores (1–5) for each of 10 topics |
| `data/results/csv/` | Stage 5 | Pre-computed rankings and alignment metrics |

Run the pipeline wizard first (`python tools/main.py`) — the dashboard displays whatever profiles are present in `data/scores/`.

---

## Tracked politicians

`giorgiameloni`, `giuseppeconte_ufficiale`, `ellyesse`, `silviasalis`. Politician metadata (display name, party, role, colour palette) is declared in `js/config.js`.

---

## Methodology notes

Scoring uses a 1–5 ordinal scale per topic per post:
`1` absent · `2` marginal · `3` present · `4` relevant · `5` dominant

Coverage is the share of posts scoring ≥ τ on a topic (τ = 3 by default). Rankings derived from coverage are compared to the youth-priority ranking via Spearman ρ and Kendall τ; Top-K overlap counts shared topics between the two top-k sets. Chart info panels in the UI show the formulas inline.
