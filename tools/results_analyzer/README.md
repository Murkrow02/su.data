# 5. Results Analyzer — Rankings, Alignment & Robustness

> **Stage 5 of the HDS pipeline.** Reads the per-post LLM scores produced by Stage 3 and writes the rankings, alignment metrics, robustness checks and figures used by the report.

---

## 1. Data Flow

```
   data/scores/<profile>.csv     ← Stage 3 (scorer) output, one CSV per politician
                       │
                       ▼
   tools/results_analyzer/analyzer.py
                       │
                       ▼
   data/results/
   ├── csv/
   │   ├── rankings.csv
   │   ├── coverage_rates.csv
   │   ├── bootstrap_alignment_ci.csv
   │   ├── bias_corrected_ranks.csv
   │   ├── bias_corrected_alignment.csv
   │   ├── threshold_sensitivity.csv
   │   └── threshold_alignment.csv
   └── plots/
       ├── rankings.png
       ├── alignment.png
       ├── metric_alignment_corr.png
       ├── metric_topk_overlap.png
       ├── metric_politician_similarity.png
       ├── metric_topic_consensus.png
       ├── metric_alignment_bootstrap_ci.png
       ├── metric_bias_correction.png
       ├── metric_threshold_sensitivity.png
       ├── pol_mean_scores_heatmap.png
       ├── pol_coverage_heatmap.png
       ├── pol_coverage_with_ci.png
       ├── pol_topic_cooccurrence.png
       └── pol_topic_score_correlation.png
```

* **Input** — `data/scores/*.csv` (one per politician). Columns: `folder_id`, `type`, `language`, the 10 topic Likert scores, `keywords`, `sentiment`, `propaganda`. Rows with any missing topic score are filtered out.
* **Ground truth** — `YOUTH_RAW_PCT_IT` from `tools/shared/topics.py`, sourced from Flash Eurobarometer EP013EP Q2 (Italy row).
* **Output** — `data/results/{csv,plots}/`.

---

## 2. Setup

```bash
cd tools/results_analyzer
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Dependencies: `pandas`, `numpy`, `scipy`, `matplotlib`, `seaborn`. No GPU, no LLM, no network.

The 10 topic keys, labels and youth percentages are loaded from `data/topics.json` via `tools/shared/topics.py`. To rename or add a topic, edit that JSON once — every tool picks up the change.

---

## 3. Usage

```bash
# Default: read data/scores/, write data/results/, threshold τ=3
python analyzer.py

# Custom input or output
python analyzer.py ../../data/scores/
python analyzer.py ../../data/scores/ --output ../../data/results/

# Higher salience bar
python analyzer.py --threshold 4

# Restrict to a subset of politicians
python analyzer.py --profiles ellyesse giorgiameloni
```

| Argomento          | Default                    | Descrizione                                                          |
|--------------------|----------------------------|----------------------------------------------------------------------|
| `input_dir`        | `data/scores/`             | Cartella con i CSV dello scorer (uno per politico).                  |
| `--output`, `-o`   | `data/results/`            | Cartella di output per `csv/` e `plots/`.                            |
| `--threshold`,`-t` | `3`                        | Soglia τ (1–5) sopra cui un topic è "presente" in un post.           |
| `--profiles`       | tutti i CSV in `input_dir` | Subset di profili (CSV stem) da includere nell'analisi.              |

The threshold-sensitivity analysis always runs across τ ∈ {2, 3, 4} regardless of `--threshold`. The bootstrap CI uses `BOOT_N = 2000` resamples and seed `BOOT_SEED = 42` (constants at the top of `analyzer.py`).

---

## 4. Pipeline Stages (in execution order)

The script runs four blocks in sequence, all from `main()` in `analyzer.py`:

1. **Rankings & alignment plots** — `plot_rankings`, `plot_alignment`.
2. **Alignment metrics** — `build_topic_gaps`, `build_alignment_summary`, `build_topk_overlap`, `build_politician_similarity`, `build_topic_consensus`, `build_coverage_table`, then their plots.
3. **Robustness** — `build_bootstrap_alignment_ci`, `build_bias_corrected_ranks` / `build_bias_corrected_alignment`, `build_threshold_sensitivity` / `build_threshold_alignment`, with the corresponding figures.
4. **Communicative profile** — mean-score heatmap, coverage heatmap, coverage-with-CI, topic co-occurrence, topic score correlation.

Then the seven CSVs are written to `data/results/csv/`.

---

## 5. Output Artifacts

### 5.1 CSVs

| File                              | Granularity              | Key columns                                                                                                  |
|-----------------------------------|--------------------------|--------------------------------------------------------------------------------------------------------------|
| `rankings.csv`                    | (entity, topic)          | `Entità`, `Metrica`, `Topic`, `Rank`, `Valore`                                                               |
| `coverage_rates.csv`              | (politician, topic)      | `n_posts`, `n_above`, `coverage`, `ci_low_95`, `ci_high_95`, `ci_width` (Wilson)                             |
| `bootstrap_alignment_ci.csv`      | politician               | `spearman_rho`, `rho_ci_low/high_95`, `rho_share_cross_0`, same for `kendall_tau`, `n_boot`                  |
| `bias_corrected_ranks.csv`        | (politician, topic)      | `coverage_orig`, `rank_orig`, `coverage_corrected`, `rank_corrected`, `rank_shift`, `coverage_delta`, `topic_bias` |
| `bias_corrected_alignment.csv`    | politician               | `spearman_orig/corrected`, `kendall_orig/corrected`, `rank_shift_mean_abs/max_abs`                           |
| `threshold_sensitivity.csv`       | (politician, τ, topic)   | `coverage`, `rank`, `youth_rank`                                                                             |
| `threshold_alignment.csv`         | (politician, τ)          | `spearman_rho`, `kendall_tau`                                                                                |

### 5.2 Plots

| File                                  | Cosa mostra                                                                            |
|---------------------------------------|----------------------------------------------------------------------------------------|
| `rankings.png`                        | Bar chart panel: youth + one panel per politico, topic ordinati per rank.              |
| `alignment.png`                       | Slopegraph giovani ↔ politico (uno per politico, ties spread verticalmente).            |
| `metric_alignment_corr.png`           | Bar grouped: Spearman ρ e Kendall τ giovani ↔ politico.                                 |
| `metric_topk_overlap.png`             | Bar grouped: Top-3 e Top-5 Jaccard giovani ↔ politico.                                  |
| `metric_politician_similarity.png`    | Heatmap P×P di Spearman ρ tra politici.                                                |
| `metric_topic_consensus.png`          | Scatter (mean rank, std) per topic.                                                    |
| `metric_alignment_bootstrap_ci.png`   | Forest plot di Spearman ρ e Kendall τ con CI 95% bootstrap (resampling sui post).      |
| `metric_bias_correction.png`          | Spearman ρ pre/post bias-correction + Δ rank per (politico, topic).                    |
| `metric_threshold_sensitivity.png`    | Heatmap rank-per-(topic × τ) per politico + Spearman ρ a ogni τ.                       |
| `pol_mean_scores_heatmap.png`         | Heatmap (politico × topic) dello score medio LLM (1–5).                                |
| `pol_coverage_heatmap.png`            | Heatmap (politico × topic) della coverage rate.                                        |
| `pol_coverage_with_ci.png`            | Bar grouped per topic con error bars Wilson CI 95%.                                    |
| `pol_topic_cooccurrence.png`          | Una 10×10 Jaccard matrix per politico.                                                 |
| `pol_topic_score_correlation.png`     | Una 10×10 Pearson matrix per politico.                                                 |

---

## 6. Configuration & Extension

* **Adding a politician.** Drop a new `<profile>.csv` into `data/scores/`, then add the friendly name to `POLITICIAN_NAMES` and a hex colour to `POL_COLORS` at the top of `analyzer.py`. All metrics auto-extend.
* **Bias values for new models.** `MODEL_BIAS_GEMMA` is the per-topic mean bias of the production model (gemma3:4b) measured on the 30-post validation set (`data/model_validation/results/results.md`). To run the bias-correction block on a different scoring model, replace this dict with that model's per-topic bias.
* **Bootstrap parameters.** Edit `BOOT_N`, `BOOT_SEED`, `BOOT_ALPHA` constants. Resampling is post-level: each iteration draws `N_p` posts with replacement, recomputes coverage, re-ranks the 10 topics and recomputes ρ / τ vs. youth.
* **Threshold sweep range.** The two threshold-sensitivity helpers default to `(2, 3, 4)`; pass a different tuple to `build_threshold_sensitivity` / `build_threshold_alignment` if needed.

---

## 7. Reproducibility

* Deterministic given the input CSVs and `BOOT_SEED`. No network, no sampling outside the seeded bootstrap.
* Plots are written via `_save()` at 150 dpi with `bbox_inches="tight"`.
* Stage 3 (`tools/scorer/`) produces the input CSVs; Stage 4 (`tools/model_validation/`) produces the bias dictionary used here.
* Topics live in `data/topics.json`, loaded via `tools/shared/topics.py`.
