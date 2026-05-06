# 5. Results Analyzer — Rankings, Alignment & Communicative Profile

> **Stage 5 of the HDS pipeline.** Synthesises the per-post scores produced by Stage 3 into the macro-claims of the report: agenda-alignment metrics, topic rankings, communicative-profile heatmaps.

---

## 1. Purpose

`analyzer.py` reads the LLM scoring CSVs of the tracked politicians and produces:

* **Topic rankings** — for each politician, an ordered list of the 10 Eurobarometer topics by *Coverage Rate* (frequency above a salience threshold).
* **Alignment metrics** — Spearman ρ, Kendall τ, Top-K Jaccard between each politician's ranking and the youth ranking from Eurobarometer EP013EP.
* **Coverage uncertainty** — Wilson 95% confidence intervals on every per-(politician, topic) coverage rate, so cross-profile differences can be assessed against sampling noise.
* **Communicative profile** — heatmaps of mean score and coverage, plus topic-level co-occurrence and score-correlation matrices.

The output is the empirical evidence underlying every macro-claim of the *Semantic Gap* thesis: which politicians address the topics young Italians prioritise, which invert those priorities, and how their agendas compare to one another.

---

## 2. Theoretical Framing

### 2.1 The agenda-gap thesis

The project operationalises the *semantic gap* between young voters' issue priorities and politicians' communicative agendas by comparing two ranked vectors over the same 10 topics: the youth distribution from Eurobarometer Q2 (a survey-based ground truth) and the per-politician coverage distribution (a content-based proxy from Instagram). Closeness of the two ranks is interpreted, in agenda-setting terms, as the politician *picking up* the issues their younger constituents care about.

### 2.2 Why ranks rather than raw scores

We compare *ranks* because the two distributions are not measured on the same unit:

* The youth side is a percentage of survey respondents who selected each topic in a *pick top-3* item (Q2). It is bounded but not a probability over the same sample space as the politician's posts.
* The politician side is a coverage rate over their posts.

Forcing the two onto a common 0–1 axis is convenient but the units differ — only the *order* is directly comparable. Spearman ρ, Kendall τ and Top-K Jaccard all operate on rank, sidestepping the unit mismatch.

### 2.3 Coverage Rate vs Mean Score

We considered two natural per-topic statistics: the **mean Likert score** $\bar s_i^{(p)}$ and the **coverage rate** $c_i^{(p)} = P(\text{score}_i \geq \tau)$. The script uses coverage as the canonical metric for ranking, for three reasons:

1. **Concept match with the ground truth.** EB Q2 asks respondents to *select* up to three priorities — it is a binary inclusion measure. Coverage mirrors this on the politician side: it counts how often the politician *selects* a topic for posting.
2. **Robustness to ordinal noise.** Mean score aggregates 1–5 values as if they were equidistant; the Likert scale does not guarantee this. Thresholding at $\tau$ collapses ordinal noise into a binary salience flag.
3. **Cross-validation.** Rankings produced by mean score and coverage are highly correlated (Spearman ρ > 0.9 typically) — the substantive conclusions are robust to the choice. Coverage is preferred for theoretical reasons; mean score remains available in the heatmaps.

---

## 3. Data Flow

```
   data/scores/<profile>.csv     ← scorer output (one CSV per politician)
                       │
                       ▼
   tools/results_analyzer/analyzer.py
                       │
                       ▼
   data/results/
   ├── csv/
   │   ├── rankings.csv           ← long-format ranking CSV
   │   └── coverage_rates.csv     ← coverage + Wilson 95% CI per (politician, topic)
   └── plots/
       ├── rankings.png
       ├── alignment.png
       ├── metric_alignment_corr.png
       ├── metric_topk_overlap.png
       ├── metric_politician_similarity.png
       ├── metric_topic_consensus.png
       ├── pol_mean_scores_heatmap.png
       ├── pol_coverage_heatmap.png
       ├── pol_coverage_with_ci.png
       ├── pol_topic_cooccurrence.png
       └── pol_topic_score_correlation.png
```

* **Input** — `data/scores/*.csv` (one file per politician). Each row is a post; columns include `folder_id`, `type`, `language`, the 10 topic Likert scores, `keywords`, `sentiment`, `propaganda`. Rows with any missing topic score are filtered out.
* **Ground truth** — `YOUTH_RAW_PCT_IT` from `tools/shared/topics.py`, sourced from Flash Eurobarometer EP013EP Q2 (Italy row, n ≈ 960, ages 16–30, fielded Sept–Oct 2024).
* **Output** — `data/results/{csv,plots}/`.

---

## 4. Setup

```bash
cd tools/results_analyzer
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Dependencies: `pandas`, `numpy`, `scipy`, `matplotlib`. No GPU, no LLM, no network.

The 10 topic keys, labels, and youth percentages all come from `tools/shared/topics.py`, which is loaded from the canonical `data/topics.json`. To add or rename a topic, edit `data/topics.json` once — every tool picks up the change.

---

## 5. Usage

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

| Argomento         | Default                      | Descrizione                                                   |
|-------------------|------------------------------|---------------------------------------------------------------|
| `input_dir`       | `data/scores/`               | Cartella con i CSV dello scorer (uno per politico).           |
| `--output`, `-o`  | `data/results/`              | Cartella di output per `csv/` e `plots/`.                     |
| `--threshold`,`-t`| `3`                          | Soglia $\tau$ (1–5) sopra cui un topic è "presente".          |
| `--profiles`      | tutti i CSV in `input_dir`   | Subset di profili (CSV stem) da includere nell'analisi.       |

---

## 6. Methodology / Algorithms

### 6.1 Notation

| Symbol                           | Meaning                                                              |
|----------------------------------|----------------------------------------------------------------------|
| $i \in \{1,\dots,10\}$           | Topic index                                                          |
| $j \in \{1,\dots,N_p\}$          | Post index                                                           |
| $p$                              | Politician                                                           |
| $\text{score}_{i,j}^{(p)}\in\{1,\dots,5\}$ | LLM Likert score for topic $i$ in post $j$                |
| $\text{pct}_i \in [0,100]$       | Eurobarometer % for topic $i$                                        |
| $\tau$                           | Salience threshold (default 3)                                       |
| $r_i^{(y)},\,r_i^{(p)}$          | Ranks (youth, politician) with average tie-breaking                  |
| $v_i^{(p)} \in [0,1]$            | Normalised importance derived from rank                              |

### 6.2 Coverage Rate and ranking

$$
c_i^{(p)} = \frac{1}{N_p}\sum_{j=1}^{N_p} \mathbb{1}\!\left[s_{i,j}^{(p)} \geq \tau\right] \in [0,1]
$$

where $s_{i,j}^{(p)}$ is shorthand for $\text{score}_{i,j}^{(p)}$ and the indicator function is

$$
\mathbb{1}[\text{condition}] = \begin{cases} 1 & \text{if the condition is true} \\ 0 & \text{if the condition is false} \end{cases}
$$

so that the sum counts how many of the $N_p$ posts cross the salience threshold $\tau$ on topic $i$, and the division by $N_p$ turns that count into a proportion in $[0,1]$.

Ranks are produced by `scipy.stats.rankdata(-c, method="average")` so that ties share their average rank. The normalised importance vector is

$$
v_i^{(p)} = \frac{n - r_i^{(p)}}{n - 1},\qquad n = 10
$$

The rank-1 topic gets $v=1.0$; the rank-10 topic gets $0.0$. The youth side is built identically from $\text{pct}_i$.

EB ground-truth ranking (with ties at 3.5 for *Costo della vita / Salute* at 34% and at 8.5 for *Immigrazione / Democrazia* at 15%):

| Rank  | Topic                    | $\text{pct}_i$ | $v_i^{(y)}$ |
|-------|--------------------------|----------------|-------------|
| 1     | Ambiente e clima         | 46%            | 1.000       |
| 2     | Lavoro e economia        | 38%            | 0.889       |
| 3.5   | Costo della vita         | 34%            | 0.722       |
| 3.5   | Salute e welfare         | 34%            | 0.722       |
| 5     | Istruzione e formazione  | 26%            | 0.556       |
| 6     | Uguaglianza di genere    | 24%            | 0.444       |
| 7     | Difesa e sicurezza       | 16%            | 0.333       |
| 8.5   | Immigrazione             | 15%            | 0.167       |
| 8.5   | Democrazia e legalità    | 15%            | 0.167       |
| 10    | Abitazione               | 9%             | 0.000       |

### 6.3 Wilson 95% confidence interval on coverage

Each coverage rate $c_i^{(p)}$ is a sample mean of $N_p$ binary indicators (post crosses the threshold on topic $i$ or not), so it is a binomial proportion with sampling noise of order $\sqrt{c(1-c)/N_p}$. The script reports a **Wilson score interval** at the 95% level for every $(p,i)$ pair:

$$
\text{CI}_{95\%} = \frac{1}{1 + z^2/N}\left[\,\hat p + \frac{z^2}{2N} \;\pm\; z\sqrt{\frac{\hat p(1-\hat p)}{N} + \frac{z^2}{4N^2}}\,\right]
$$

with $\hat p = c_i^{(p)}$, $N = N_p$ and $z = 1.96$. Wilson is preferred over the textbook Wald interval $\hat p \pm z\sqrt{\hat p(1-\hat p)/N}$ for two reasons that matter here:

1. **It is well-defined at the boundaries.** Several topics (e.g. *Uguaglianza di genere* for Meloni) have $\hat p$ close to zero. Wald collapses to a degenerate $[0,0]$ interval at exactly $\hat p = 0$ and produces values below $0$ nearby; Wilson stays bounded in $[0,1]$ and remains informative.
2. **Better empirical coverage at small $\hat p$.** With most coverage rates in the $5$–$50\%$ range, Wilson's coverage probability is closer to the nominal $95\%$ than Wald's, which is known to be anti-conservative for proportions far from $0.5$.

The interval is asymmetric (especially near 0 or 1), and the analyzer carries the asymmetry through to the error bars on `pol_coverage_with_ci.png`.

**Reading the intervals.** Two coverage rates whose Wilson intervals do not overlap differ at the $\alpha = 0.05$ level under a binomial model; overlap means the difference is consistent with sampling noise and should not be over-interpreted. The intervals are *per estimate*, not joint over the ten topics — no multiple-comparison correction is applied, since the table is descriptive rather than a screening procedure.

### 6.4 Spearman ρ and Kendall τ

Both quantify monotonic concordance between the youth and politician rank vectors.

**Spearman ρ** — Pearson correlation of ranks. With ties, the script uses `scipy.stats.spearmanr` (Pearson on tied ranks). In the no-tie case it reduces to the classical $1 - 6\sum d_i^2 / [n(n^2-1)]$.

**Kendall τ-b** — counts concordant ($C$) and discordant ($D$) pairs:

$$
\tau^{(p)} = \frac{C - D}{C + D + T}
$$

with $T$ the count of pairs tied on either side. For $n=10$ there are $\binom{10}{2}=45$ pairs.

We report both because they have different sensitivities: ρ amplifies large rank disagreements, τ treats every pair-inversion equally. Concordance of the two indices is a robustness signal; divergence flags a few high-leverage discordant pairs.

### 6.5 Top-K Jaccard

For $k \in \{3, 5\}$:

$$
J_k^{(p)} = \frac{\left|T_k^{(y)} \cap T_k^{(p)}\right|}{\left|T_k^{(y)} \cup T_k^{(p)}\right|}
$$

with $T_k^{(\cdot)}$ the set of topics whose rank does not exceed the $k$-th smallest rank — *inclusive* on ties, so a tie at the boundary brings all tied topics into the set. $J_3$ probes podium overlap; $J_5$ probes upper-half overlap.

### 6.6 Politician-vs-politician similarity

A $P\times P$ matrix of Spearman ρ between the rank vectors of every pair of politicians. Diagonal is 1; off-diagonal cells answer "do these two politicians prioritise topics in the same order?" Useful for situating each politician relative to the rest of the panel rather than only relative to the youth.

### 6.7 Topic consensus

For each topic the script computes $\bar r_i$ (mean rank across politicians) and $\sigma_i$ (population standard deviation, `ddof=0`, since this *describes* the panel rather than estimating a population variance). The scatter of $(\bar r_i, \sigma_i)$ separates four regimes:

| $\bar r_i$ | $\sigma_i$ | Interpretation                                            |
|------------|------------|-----------------------------------------------------------|
| Low        | Low        | Cross-party priority — consensus on this topic.           |
| Low        | High       | Average priority but politicians disagree — polarisation. |
| High       | Low        | Universally ignored topic.                                |
| High       | High       | Differentiating topic — some treat it, others ignore it.  |

### 6.8 Topic co-occurrence (Jaccard)

For each politician, a $10\times10$ symmetric matrix where cell $(a,b)$ is the Jaccard similarity between the *post-sets* in which topics $a$ and $b$ exceed $\tau$:

$$
A_i^{(p)} = \{j : \text{score}_{i,j}^{(p)} \geq \tau\}, \qquad
J_{ab}^{(p)} = \frac{|A_a^{(p)} \cap A_b^{(p)}|}{|A_a^{(p)} \cup A_b^{(p)}|}
$$

Computed efficiently as $B B^\top$ on the binary score-above-threshold matrix $B \in \{0,1\}^{10\times N_p}$. Jaccard is preferred over raw joint probability because it normalises out marginal coverage: two rare topics that always co-occur receive $J=1$, regardless of how rare each is.

### 6.9 Topic score-correlation (Pearson)

Pearson correlation of the per-post score vectors of every pair of topics. Operates on the raw 1–5 values without thresholding, capturing whether *intensity* covaries (positive correlation = topics rise together within a post; negative = mutually exclusive intensities). Complements Jaccard: a politician with topic-specialised posts will show high Pearson correlation magnitudes; a generalist with diversified posts will show low magnitudes regardless of Jaccard.

---

## 7. Output Artifacts

### 7.1 `csv/rankings.csv`

Long-format ranking table — one row per (entity, topic):

| Colonna   | Tipo   | Descrizione                                                            |
|-----------|--------|------------------------------------------------------------------------|
| `Entità`  | string | `"Giovani IT"` or politician's display name.                          |
| `Metrica` | string | `"EB %"` (youth) or `"Coverage ≥τ"` (politician).                      |
| `Topic`   | string | Topic label (e.g. `"Ambiente e clima"`).                               |
| `Rank`    | float  | Average-tie-breaking rank, 1 = most relevant.                          |
| `Valore`  | float  | $\text{pct}_i / 100$ (youth) or $v_i^{(p)}$ (politician), 4 decimals.  |

Total rows: $10 \times (1 + P)$.

### 7.2 `csv/coverage_rates.csv`

One row per (politician, topic) with the point estimate and Wilson 95% CI:

| Colonna       | Tipo   | Descrizione                                                              |
|---------------|--------|--------------------------------------------------------------------------|
| `politician`  | string | Politician's display name.                                               |
| `topic`       | string | Topic label.                                                             |
| `n_posts`     | int    | $N_p$, total scored posts for that politician.                           |
| `n_above`     | int    | Count of posts with $\text{score}_{i,j}^{(p)} \geq \tau$.                |
| `coverage`    | float  | $c_i^{(p)} = \text{n\_above}/\text{n\_posts}$, 4 decimals.               |
| `ci_low_95`   | float  | Lower bound of the Wilson 95% CI on $c_i^{(p)}$.                         |
| `ci_high_95`  | float  | Upper bound of the Wilson 95% CI.                                        |
| `ci_width`    | float  | $\text{ci\_high\_95} - \text{ci\_low\_95}$, useful for sorting.          |

Total rows: $10 \times P$.

### 7.3 `plots/`

The 10 figures are described in detail in §6 above. Two-line summary per file:

| File                                  | What it shows                                                                          |
|---------------------------------------|----------------------------------------------------------------------------------------|
| `rankings.png`                        | Side-by-side bar charts of the 10 topics, one column per entity (youth + politicians). |
| `alignment.png`                       | Slopegraph linking each topic's rank in the youth column to its rank per politician.   |
| `metric_alignment_corr.png`           | Grouped bars of Spearman ρ and Kendall τ between youth and each politician.            |
| `metric_topk_overlap.png`             | Top-3 / Top-5 Jaccard overlap between youth and each politician.                       |
| `metric_politician_similarity.png`    | $P\times P$ Spearman ρ matrix between politicians' rankings.                            |
| `metric_topic_consensus.png`          | Scatter of $(\bar r_i, \sigma_i)$ over the 10 topics (consensus vs polarisation).      |
| `pol_mean_scores_heatmap.png`         | Heatmap of mean Likert score per (politician, topic).                                  |
| `pol_coverage_heatmap.png`            | Heatmap of coverage rate per (politician, topic).                                      |
| `pol_coverage_with_ci.png`            | Grouped bar chart of coverage rate with Wilson 95% CI as error bars.                   |
| `pol_topic_cooccurrence.png`          | Per-politician $10\times10$ Jaccard matrix of topic post-sets.                         |
| `pol_topic_score_correlation.png`     | Per-politician $10\times10$ Pearson correlation matrix of per-post topic scores.       |

---

## 8. Limitations & Notes

* **Threshold sensitivity.** The default $\tau=3$ admits "secondary" topics. With $\tau=4$ only "significant" topics count: more selective, but with fewer above-threshold posts the per-topic coverage variance grows. For < 100 posts per politician, $\tau=3$ keeps the coverage estimates stable.
* **Ordinal floor.** Ranks compress information: two politicians with very different absolute coverages but identical orderings receive identical ρ = 1. Read ranking metrics together with the absolute heatmaps to avoid mistaking *ordering convergence* for *content convergence*.
* **Survey ground truth.** EB Q2 asks for top-3 priorities, so $\sum_i \text{pct}_i \ne 100\%$. The ranking is well-defined; the absolute axis on the youth column of `rankings.png` is therefore a *selection probability*, not a probability mass.
* **Sample size and uncertainty.** Coverage is a sample mean of binary indicators; its standard error is $\sqrt{c(1-c)/N_p}$. With the typical $N_p \in [200, 300]$ on this project, a coverage of 0.30 has SE ≈ 0.026 (CI half-width ≈ 5 percentage points). Differences of less than $\sim$5 pp on a single topic should be read against `coverage_rates.csv` rather than taken at face value; rank-level metrics (ρ, τ, Jaccard) aggregate over all 10 topics and are more stable.
* **Adding politicians.** Drop a new `<profile>.csv` into `data/scores/` and add a friendly name + colour at the top of `analyzer.py` (`POLITICIAN_NAMES`, `POL_COLORS`). All metrics auto-extend.
* **Reproducibility.** Deterministic given the input CSVs and the threshold. No sampling, no randomness.
* **Cross-references.**
  * Stage 3 (`tools/scorer/`) produces the input CSVs.
  * Stage 4 (`tools/model_validation/`) checks the LLM's reliability before its scores are used here.
  * Topics live in `data/topics.json`, loaded via `tools/shared/topics.py`.
