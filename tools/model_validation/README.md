# 4. Model Validation — LLM vs Human Annotations

> **Stage 4 of the HDS pipeline (optional but recommended).** Compares the LLM scorer against human-averaged annotations on a fixed validation sample and produces the metrics + figures used to pick the production model.

---

## 1. What it produces

For each LLM under test, the validator:

* loads the LLM's score CSV and the human-averaged ground-truth CSV for each politician,
* computes a battery of agreement metrics (Cohen's weighted κ, Spearman ρ, MAE, Wilcoxon, Krippendorff α, mean bias),
* aggregates them globally and per-topic,
* writes a single Markdown report (`results.md`) plus four PNG plots.

The validation sample is **30 posts × 10 topics × 4 human annotators** (10 posts each across 3 politicians). Human scores are pre-averaged and rounded down to integers in `data/model_validation/politicians/<politician>/human_avg.csv`.

---

## 2. Data Flow

```
   data/model_validation/politicians/
   ├── ellyesse/
   │   ├── human_avg.csv      ← human ground truth (averaged)
   │   ├── gemma4.csv         ← LLM under test (1 file per model)
   │   ├── qwen3-14b.csv
   │   └── mistral.csv
   ├── giorgiameloni/…
   └── giuseppeconte_ufficiale/…

                       │
                       ▼
   tools/model_validation/validator.py

                       │
                       ▼
   data/model_validation/results/
   ├── results.md              ← Markdown report
   └── plots/
       ├── mae_per_model.png
       ├── kappa_per_model.png
       ├── heatmap_topic_model.png
       └── bias_per_topic.png
```

* **Inputs** — paired CSVs (`folder_id` + 10 topic columns scored 1–5).
* **Outputs** — a single Markdown report and four PNG plots.

CSV column schema (both human and LLM): `folder_id, type, language, ambiente_clima, lavoro_economia, …, abitazione`. Type/language are ignored by the validator.

---

## 3. Setup

```bash
cd tools/model_validation
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Dependencies: `pandas`, `numpy`, `scipy`, `scikit-learn`, `matplotlib`. No GPU, no LLM, no network.

### Building `human_avg.csv`

If you have N annotators each producing one CSV with the same column schema:

```python
import pandas as pd
from functools import reduce

annotators  = [pd.read_csv(f"annotator_{i}.csv") for i in range(1, 5)]
common_cols = ["ambiente_clima", "lavoro_economia", "costo_vita", "salute_welfare",
               "istruzione_formazione", "uguaglianza_genere", "difesa_sicurezza",
               "immigrazione", "democrazia_legalita", "abitazione"]

avg = reduce(lambda l, r: l.add(r[common_cols], fill_value=0), annotators)[common_cols] / len(annotators)
avg = avg.apply(lambda c: c.apply(lambda x: int(x)))   # round down to keep {1..5}
avg.insert(0, "folder_id", annotators[0]["folder_id"])
avg.to_csv("human_avg.csv", index=False)
```

Round-down (`int()`) rather than `round()` keeps human values inside the same `{1,…,5}` set as the LLM, avoiding mixed-domain comparisons.

---

## 4. Usage

```bash
# Menu interattivo: scopre i modelli da data/model_validation/politicians/*/*.csv
python validator.py

# Esplicito
python validator.py --models gemma4
python validator.py --models gemma4 qwen3-14b mistral
```

| Argomento  | Default | Descrizione                                            |
|------------|---------|--------------------------------------------------------|
| `--models` | menu    | Modelli LLM da validare; auto-discovery dai CSV file.  |

---

## 5. Metrics computed

| Metrica                          | Significato                                                                  |
|----------------------------------|------------------------------------------------------------------------------|
| Cohen's weighted κ (quadratic)   | Agreement on ordinal scale; Landis–Koch bands applied.                       |
| Spearman ρ                       | Rank correlation between LLM and human vectors.                              |
| MAE                              | Mean absolute distance in scale points.                                      |
| Wilcoxon signed-rank             | Tests whether `(LLM − human)` is symmetric around 0 (systematic bias check). |
| Krippendorff α (ordinal, 2-rater)| Corroborates κ.                                                              |
| Mean bias                        | Signed mean of `(LLM − human)`; direction and magnitude of drift.            |

All metrics operate on paired ordinal data and respect the pairing of human/LLM observations on the same `folder_id`.

---

## 6. Output Artifacts

`data/model_validation/results/results.md` — generated Markdown report containing:

* Header table with the model ranking by MAE, plus all six metrics for every model and a Landis–Koch label.
* Methodology section (template; you may want to edit before submission).
* Per-politician breakdown — same metrics restricted to each politician's 10 posts.
* Per-topic breakdown — MAE and Bias per (model, topic), with green/yellow/red interpretive flags.
* Embedded plot references (relative paths to `plots/*.png`).

`plots/`:

| File                          | Cosa mostra                                                       |
|-------------------------------|-------------------------------------------------------------------|
| `mae_per_model.png`           | Bar chart of global MAE per model.                                |
| `kappa_per_model.png`         | Bar chart of global κ per model with Landis–Koch reference line.  |
| `heatmap_topic_model.png`     | MAE heatmap (rows = topics, cols = models).                       |
| `bias_per_topic.png`          | Grouped bars of bias per topic, one colour per model.             |

The per-topic mean bias produced here feeds the bias-correction block in Stage 5 (`MODEL_BIAS_GEMMA` in `tools/results_analyzer/analyzer.py`).

---

## 7. Limitations & Notes

* **Sample size.** 30 posts × 10 topics = 300 paired observations per model. Enough to separate "moderate" from "substantial" agreement, but the per-politician κ has wide CIs — interpret per-politician numbers as *trends*.
* **Human round-down.** Averaging four annotators and rounding down keeps integer scores but biases the human vector slightly toward conservatism. The Bias metric on a high-quality LLM should therefore be slightly positive, not strictly zero.
* **Single ground truth.** Human "average" hides intra-annotator disagreement; the current pipeline does not expose Krippendorff's α between human annotators.
* **Selection.** The 10 posts per politician should be drawn at random across the date range; a topical pre-filter would inflate κ on the dominant topics.
* **Reproducibility.** All metrics are deterministic given the input CSVs.
* **Extending to new models.** Drop a new `<model>.csv` next to `human_avg.csv` for each politician; rerun. The validator auto-discovers it.
