# 4. Model Validation — LLM vs Human Annotations

> **Stage 4 of the HDS pipeline (optional but recommended).** Tests whether the LLM scorer is reliable enough to be used as a substitute for human annotators on the agenda-alignment task.

---

## 1. Purpose

Stage 3 (`scorer.py`) makes a strong claim: that an open-weight LLM can score 100+ Italian political posts on 10 Likert dimensions consistently enough to support the report's macro-conclusions. This tool tests that claim empirically.

For each LLM under test, the validator:

* loads the LLM's score CSV and the human-averaged ground-truth CSV for each politician,
* computes a battery of agreement metrics on **paired ordinal data**,
* aggregates them globally and per-topic,
* writes a single Markdown report (`results.md`) plus four PNG plots.

The report is the artefact that justifies (or rejects) the choice of scoring LLM in the final paper.

---

## 2. Theoretical Framing

### 2.1 What we are testing

The question is *not* "does the LLM produce the same numbers as a human?" but rather:

> *Is the LLM's score vector indistinguishable, in distribution and ordering, from the average of N independent human annotators?*

Average human annotation is treated as the gold standard, in the spirit of inter-annotator agreement studies: it absorbs idiosyncratic noise and represents the consensus interpretation of the rubric.

### 2.2 Why ordinal-aware metrics

The score scale `{1, 2, 3, 4, 5}` is ordinal but **not** interval — the gap between "barely hinted" (2) and "secondary" (3) is not the same as between "significant" (4) and "main subject" (5). Common pitfalls:

* **Plain accuracy** treats `1↔5` and `3↔4` as equally wrong.
* **Pearson correlation** assumes equidistant levels.
* **Chi-square** ignores the ordering altogether (see §6.7).

We therefore pick metrics that respect the ordering, the pairing of human/LLM observations on the same post, and the small sample size.

### 2.3 The validation sample

Per the project, the validation sample is **30 posts × 10 topics × 4 human annotators** spread across 3 politicians (10 posts each). Human scores are pre-averaged and rounded down to the nearest integer in `data/model_validation/politicians/<politician>/human_avg.csv`. This is the smallest sample that gives stable Cohen's κ to the second decimal place; smaller samples produce κ confidence intervals wider than the Landis–Koch interpretive bands.

---

## 3. Data Flow

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

CSV column schema (both human and LLM): `folder_id, type, language, ambiente_clima, lavoro_economia, …, abitazione`. Type/language are ignored by the validator; they exist for downstream consistency.

---

## 4. Setup

```bash
cd tools/model_validation
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Dependencies: `pandas`, `numpy`, `scipy`, `scikit-learn`, `matplotlib`. No GPU, no LLM, no network.

### Data prep — building `human_avg.csv`

If you have N annotators, each producing one CSV with the same column schema:

```python
import pandas as pd
from functools import reduce

annotators = [pd.read_csv(f"annotator_{i}.csv") for i in range(1, 5)]
common_cols = ["ambiente_clima", "lavoro_economia", "costo_vita", "salute_welfare",
               "istruzione_formazione", "uguaglianza_genere", "difesa_sicurezza",
               "immigrazione", "democrazia_legalita", "abitazione"]

avg = reduce(lambda l, r: l.add(r[common_cols], fill_value=0), annotators)[common_cols] / len(annotators)
avg = avg.apply(lambda c: c.apply(lambda x: int(x)))   # round down
avg.insert(0, "folder_id", annotators[0]["folder_id"])
avg.to_csv("human_avg.csv", index=False)
```

Round-down (`int()`) rather than `round()` is used to keep human values inside the same `{1,…,5}` set as the LLM, avoiding mixed-domain comparisons.

---

## 5. Usage

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

## 6. Methodology / Algorithms

The validator compares two paired ordinal vectors:

* $\mathbf{h} = (h_1, \dots, h_n)$ — average human annotations.
* $\mathbf{l} = (l_1, \dots, l_n)$ — LLM scores on the same posts and topics.

with $h_i, l_i \in \{1,2,3,4,5\}$.

### 6.1 Cohen's Weighted Kappa ($\kappa_w$)

$$\kappa_w = 1 - \frac{\sum_{i,j} w_{ij}\,o_{ij}}{\sum_{i,j} w_{ij}\,e_{ij}},
\qquad w_{ij} = \frac{(i-j)^2}{(k-1)^2},\; k = 5$$

Quadratic weights penalise large mismatches more than small ones (a 1↔5 confusion is 16× worse than a 3↔4). $o_{ij}$ and $e_{ij}$ are observed and chance-expected confusion-matrix frequencies.

**Landis & Koch (1977) interpretive bands**: <0.20 poor · 0.20–0.40 fair · 0.40–0.60 moderate · 0.60–0.80 substantial · >0.80 almost perfect.

### 6.2 Spearman's $\rho$

$$\rho = 1 - \frac{6 \sum d_i^2}{n(n^2 - 1)},\quad d_i = \text{rank}(h_i) - \text{rank}(l_i)$$

Operates on ranks; robust to outliers, no linearity assumption. A high $\rho$ means the LLM respects the *ordering* of human judgements even if absolute values diverge.

### 6.3 Mean Absolute Error

$$\mathrm{MAE} = \frac{1}{n}\sum_{i=1}^n |l_i - h_i|$$

Direct, interpretable: "average distance in scale points". MAE = 0.3 means the model is off by less than a third of a level on average. We prefer MAE over RMSE because the squared penalty of RMSE over-amplifies the 1↔5 outliers in a 5-level scale.

### 6.4 Wilcoxon Signed-Rank Test

Tests whether the differences $d_i = l_i - h_i$ are symmetric around zero. The null hypothesis is "no systematic bias". A $p < 0.05$ flags that the LLM systematically over- or under-scores.

We use the Wilcoxon rather than a paired $t$-test because the differences are integer-valued, bounded, and not normally distributed.

### 6.5 Krippendorff's $\alpha$ (ordinal variant)

$$\alpha = 1 - \frac{D_o}{D_e}$$

where $D_o$, $D_e$ are observed and expected disagreement under the ordinal distance. Generalises Cohen's κ to >2 raters and tolerates missing data; here we use the 2-rater ordinal version to corroborate $\kappa_w$. $\alpha = 1$ perfect agreement, $\alpha = 0$ chance, $\alpha < 0$ systematic disagreement.

### 6.6 Mean Bias

$$\mathrm{Bias} = \frac{1}{n}\sum_{i=1}^n (l_i - h_i)$$

The signed counterpart to MAE. Bias > 0 means the LLM over-scores topics on average (more permissive); Bias < 0 means it under-scores. Wilcoxon tests *significance*; Bias measures *direction and magnitude*.

### 6.7 Why **not** $\chi^2$?

Considered and explicitly rejected:

1. **Ignores order.** χ² treats `{1,2,3,4,5}` as nominal categories. A 1↔5 mismatch counts the same as a 3↔4 mismatch, semantically wrong for ordinal scoring.
2. **Ignores pairing.** Standard Pearson χ² does not exploit that each $(h_i, l_i)$ refers to the same post. Wilcoxon, κ and Spearman all do.
3. **Sparse table.** With ~30 posts the 5×5 table has many cells with expected count <5, violating χ²'s asymptotic validity.
4. **Redundant.** Anything χ² could tell us is already covered, more appropriately, by κ + Spearman + Wilcoxon + Bias.

---

## 7. Output Artifacts

`data/model_validation/results/results.md` — generated Markdown report containing:

* **Header table** with the model ranking by MAE, plus all six metrics for every model and a Landis–Koch label.
* **Methodology section** (template; you may want to edit before submission).
* **Per-politician breakdown** — same metrics restricted to each politician's 10 posts.
* **Per-topic breakdown** — MAE and Bias per (model, topic), with green/yellow/red interpretive flags.
* **Embedded plot references** (relative paths to `plots/*.png`).

`plots/` — four figures:

| File                          | Cosa mostra                                                       |
|-------------------------------|-------------------------------------------------------------------|
| `mae_per_model.png`           | Bar chart of global MAE per model.                                |
| `kappa_per_model.png`         | Bar chart of global κ per model with Landis–Koch reference line. |
| `heatmap_topic_model.png`     | MAE heatmap (rows = topics, cols = models).                       |
| `bias_per_topic.png`          | Grouped bars of bias per topic, one colour per model.             |

---

## 8. Limitations & Notes

* **Sample size.** 30 posts × 10 topics = 300 paired observations per model. This is enough to separate "moderate" from "substantial" agreement (~0.4 vs ~0.6 κ) but the per-politician κ has wide CIs — interpret per-politician numbers as *trends*, not point estimates.
* **Human round-down.** Averaging four annotators and rounding down keeps integer scores but biases the human vector slightly toward conservatism. The Bias metric on a *high-quality* LLM should therefore be slightly positive, not strictly zero.
* **Single ground truth.** Human "average" hides intra-annotator disagreement, which itself is a useful signal. The current pipeline does not expose Krippendorff's α *between* human annotators; future work could add it.
* **Selection.** The 10 posts per politician should be drawn at random across the date range; a topical pre-filter would inflate κ on the dominant topics.
* **Reproducibility.** All metrics are deterministic given the input CSVs.
* **Extending to new models.** Drop a new `<model>.csv` next to `human_avg.csv` for each politician; rerun. The validator auto-discovers it.
