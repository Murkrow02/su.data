"""HDS Agenda Alignment Analyzer — Stage 5 of the HDS pipeline.

Reads per-politician scoring CSVs and produces ranking, agenda-alignment and
communicative-profile plots, plus a single rankings.csv summary.

Input  : data/scores/<profile>.csv (scorer output)
Output : data/results/{plots/*.png, csv/rankings.csv}
"""

import argparse
import itertools
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.stats import gaussian_kde, kendalltau, norm, rankdata, spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared import (  # noqa: E402
    SCORES_DIR,
    RESULTS_DIR,
    TOPIC_KEYS,
    TOPIC_LABELS,
    YOUTH_RAW_PCT_IT,
)

# ── Constants ─────────────────────────────────────────────────────────────────

POLITICIAN_NAMES = {
    "ellyesse":                "Elly Schlein",
    "giorgiameloni":           "Giorgia Meloni",
    "giuseppeconte_ufficiale": "Giuseppe Conte",
}

POL_COLORS = {
    "Elly Schlein":   "#C0392B",
    "Giorgia Meloni": "#1A5276",
    "Giuseppe Conte": "#D4AC0D",
}

YOUTH_COLOR  = "#27AE60"
YOUTH_ENTITY = "Giovani IT"
YOUTH_METRIC = "EB %"

# Abbreviated labels for compact axes (10×10 heatmaps, radar, etc.)
_TOPIC_SHORT = [
    "Ambiente", "Lavoro", "Costo vita", "Salute",
    "Istruzione", "Uguaglianza", "Difesa",
    "Immigrazione", "Democrazia", "Abitazione",
]

# Per-topic mean bias of the production model (gemma3:4b) measured on the
# 30-post validation set. Positive values = LLM overshoots vs. the human
# reference. Same key order as TOPIC_KEYS. Source:
# data/model_validation/results/results.md (sezione "Analisi per Topic").
MODEL_BIAS_GEMMA = {
    "ambiente_clima":        0.033,
    "lavoro_economia":       0.261,
    "costo_vita":            0.070,
    "salute_welfare":        0.032,
    "istruzione_formazione": 0.074,
    "uguaglianza_genere":    0.152,
    "difesa_sicurezza":      0.052,
    "immigrazione":         -0.067,
    "democrazia_legalita":   0.374,
    "abitazione":            0.000,
}

# Bootstrap parameters for CIs on rank correlations (resampled at the
# post level — each iteration draws N_p posts with replacement, recomputes
# Coverage Rates, re-ranks the 10 topics and recomputes ρ / τ vs. youth).
BOOT_N        = 2000
BOOT_SEED     = 42
BOOT_ALPHA    = 0.05  # 95% CI

# ── Utilities ─────────────────────────────────────────────────────────────────

def _rank_avg(values: np.ndarray) -> np.ndarray:
    """Rank descending, average tie-breaking (rank 1 = highest value)."""
    return rankdata(-values, method="average")


def _importance(ranks: np.ndarray) -> np.ndarray:
    """Linear projection rank → [0,1]: rank 1 → 1.0, rank n → 0.0."""
    n = len(ranks)
    return (n - ranks) / (n - 1)


def _spread_ties(positions: list, sep: float = 0.38) -> list:
    """Offset tied y-positions so that labels/markers don't overlap."""
    groups = defaultdict(list)
    for i, p in enumerate(positions):
        groups[round(float(p), 8)].append(i)
    result = list(positions)
    for _, indices in groups.items():
        n = len(indices)
        if n > 1:
            offsets = np.linspace(-(n - 1) * sep / 2, (n - 1) * sep / 2, n)
            for k, idx in enumerate(indices):
                result[idx] = positions[idx] + offsets[k]
    return result


def _save(fig: plt.Figure, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  → {path.name}")


def _pol_name(key: str) -> str:
    return POLITICIAN_NAMES.get(key, key)


def _pol_color(name: str) -> str:
    return POL_COLORS.get(name, "#7F8C8D")


def _last_name(name: str) -> str:
    return name.split()[-1]


def _set_style() -> None:
    plt.rcParams.update({"figure.facecolor": "white", "axes.facecolor": "#FAFAFA"})


def _safe_corr(fn, x: pd.Series, y: pd.Series) -> float:
    result = fn(x, y)
    value = result.statistic if hasattr(result, "statistic") else result[0]
    return round(float(value), 6) if pd.notna(value) else np.nan


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return np.nan
    return len(a & b) / len(a | b)


def _top_k_topics(frame: pd.DataFrame, rank_col: str, k: int) -> set[str]:
    ranks = frame[rank_col].sort_values().reset_index(drop=True)
    if ranks.empty:
        return set()
    cutoff = ranks.iloc[min(k, len(ranks)) - 1]
    return set(frame.loc[frame[rank_col] <= cutoff, "topic"])


def _wilson_ci(k: int, n: int, alpha: float = 0.05) -> tuple[float, float]:
    """Wilson score interval for a binomial proportion k/n.

    More accurate than Wald near 0 and 1, and well-defined when k=0 or k=n.
    Returns (lower, upper) clipped to [0, 1].
    """
    if n == 0:
        return (0.0, 1.0)
    z   = float(norm.ppf(1 - alpha / 2))
    p   = k / n
    den = 1 + z**2 / n
    ctr = (p + z**2 / (2 * n)) / den
    mar = z * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2)) / den
    return (max(0.0, ctr - mar), min(1.0, ctr + mar))


def _annotate_bars(ax, fmt: str = "{:.2f}", threshold: float = 0.03) -> None:
    for patch in ax.patches:
        h = patch.get_height()
        if abs(h) > threshold:
            ax.text(
                patch.get_x() + patch.get_width() / 2,
                h + 0.025 * np.sign(h),
                fmt.format(h),
                ha="center", va="bottom" if h >= 0 else "top",
                fontsize=7, fontweight="bold",
            )

# ── Loading ───────────────────────────────────────────────────────────────────

def load_csvs(folder: Path) -> dict[str, pd.DataFrame]:
    dfs = {}
    for path in sorted(folder.glob("*.csv")):
        df = pd.read_csv(path)
        for k in TOPIC_KEYS:
            df[k] = pd.to_numeric(df[k], errors="coerce")
        df["politician"] = _pol_name(path.stem)
        df["scored"]     = df[TOPIC_KEYS].notna().all(axis=1)
        dfs[path.stem]   = df
        n, ns = len(df), df["scored"].sum()
        print(f"  {path.stem}: {n} post totali, {ns} scorati")
    return dfs


# ── Rankings ──────────────────────────────────────────────────────────────────

def plot_rankings(dfs: dict, out: Path, threshold: int = 3) -> pd.DataFrame:
    """Youth ranking (left) + one Coverage panel per politician."""
    n_pols = len(dfs)
    fig = plt.figure(figsize=(4.5 * (n_pols + 1), 7))
    gs  = fig.add_gridspec(1, n_pols + 1, wspace=0.6)

    def _fmt_rank(r: float) -> str:
        return f"{int(r)}" if r == int(r) else f"{r:.1f}"

    def _draw_panel(ax, labels, vals, ranks, color, alpha, title, xlabel):
        bars = ax.barh(np.arange(10), vals, color=color, alpha=alpha,
                       edgecolor="white", height=0.7)
        ax.set_yticks(np.arange(10))
        ax.set_yticklabels(
            [f"{_fmt_rank(r)}. {l}" for r, l in zip(ranks, labels)], fontsize=7.5
        )
        ax.set_xlim(0, 1)
        ax.xaxis.set_major_formatter(mticker.PercentFormatter(xmax=1.0, decimals=0))
        ax.set_xlabel(xlabel, fontsize=7.5)
        ax.set_title(title, fontsize=9.5, fontweight="bold", color=color, pad=6)
        ax.invert_yaxis()
        for bar, val in zip(bars, vals):
            if val > 0.06:
                ax.text(
                    max(val - 0.025, 0.01), bar.get_y() + bar.get_height() / 2,
                    f"{val:.0%}", va="center", ha="right",
                    color="white", fontweight="bold", fontsize=7,
                )

    rows = []

    # ── Youth ─────────────────────────────────────────────────────────────────
    ax_y    = fig.add_subplot(gs[0, 0])
    pcts    = np.array([YOUTH_RAW_PCT_IT[k] for k in TOPIC_KEYS], dtype=float)
    ranks_y = _rank_avg(pcts)
    order_y = np.argsort(ranks_y)
    _draw_panel(
        ax_y,
        labels=[TOPIC_LABELS[i] for i in order_y],
        vals=pcts[order_y] / 100.0,
        ranks=ranks_y[order_y],
        color=YOUTH_COLOR, alpha=0.88,
        title="Giovani IT\n(Eurobarometer 2024)",
        xlabel="% che lo considera priorità",
    )
    for i in order_y:
        rows.append({
            "Entità":  YOUTH_ENTITY,
            "Metrica": YOUTH_METRIC,
            "Topic":   TOPIC_LABELS[i],
            "Rank":    ranks_y[i],
            "Valore":  round(float(pcts[i] / 100.0), 4),
        })

    # ── Politician panels ─────────────────────────────────────────────────────
    for col, (key, df) in enumerate(dfs.items()):
        name   = _pol_name(key)
        color  = _pol_color(name)
        scored = df[df["scored"]]

        cov_raw   = np.array(
            [(scored[k] >= threshold).mean() for k in TOPIC_KEYS], dtype=float
        )
        ranks_pol = _rank_avg(cov_raw)
        order_pol = np.argsort(ranks_pol)
        imp_pol   = _importance(ranks_pol)

        ax = fig.add_subplot(gs[0, col + 1])
        _draw_panel(
            ax,
            labels=[TOPIC_LABELS[i] for i in order_pol],
            vals=imp_pol[order_pol],
            ranks=ranks_pol[order_pol],
            color=color, alpha=0.88,
            title=f"{name}\n(Coverage ≥{threshold})",
            xlabel="Importanza [0–1]\nranking da coverage rate",
        )
        for i in order_pol:
            rows.append({
                "Entità":  name,
                "Metrica": f"Coverage ≥{threshold}",
                "Topic":   TOPIC_LABELS[i],
                "Rank":    ranks_pol[i],
                "Valore":  round(float(imp_pol[i]), 4),
            })

    fig.suptitle(
        "Classifiche Tematiche — Giovani vs Politici\n"
        "(rank 1 = topic più rilevante per quell'entità)",
        fontsize=12, fontweight="bold", y=1.02,
    )
    _save(fig, out / "rankings.png")
    return pd.DataFrame(rows)


# ── Alignment Slopegraph ──────────────────────────────────────────────────────

def plot_alignment(dfs: dict, out: Path, threshold: int = 3) -> None:
    """Slopegraph: youth rankings vs each politician (Coverage).
    Ties are spread vertically so labels don't overlap.
    """
    n_pols = len(dfs)
    fig, axes = plt.subplots(n_pols, 1, figsize=(5, 4.5 * n_pols), squeeze=False)
    plt.subplots_adjust(hspace=0.5)

    pcts    = np.array([YOUTH_RAW_PCT_IT[k] for k in TOPIC_KEYS], dtype=float)
    ranks_y = _rank_avg(pcts)

    for row_idx, (key, df) in enumerate(dfs.items()):
        name   = _pol_name(key)
        color  = _pol_color(name)
        scored = df[df["scored"]]

        cov_raw   = np.array(
            [(scored[k] >= threshold).mean() for k in TOPIC_KEYS], dtype=float
        )
        ranks_pol = _rank_avg(cov_raw)

        # Spread tied positions so labels don't overlap
        ly = _spread_ties([float(ranks_y[i])   for i in range(10)], 0.8)
        lp = _spread_ties([float(ranks_pol[i]) for i in range(10)], 0.8)

        ax = axes[row_idx, 0]
        for i in range(10):
            topic = TOPIC_LABELS[i]
            ax.plot([0, 1], [ly[i], lp[i]], marker="o", markersize=4,
                    color=color, alpha=0.6, linewidth=1.5)
            ax.text(-0.05, ly[i], f"{ranks_y[i]:g}. {topic}",
                    ha="right", va="center", fontsize=7.5)
            ax.text( 1.05, lp[i], f"{ranks_pol[i]:g}. {topic}",
                    ha="left",  va="center", fontsize=7.5)

        ax.set_xlim(-0.5, 1.5)
        ax.set_ylim(10.9, 0.1)
        ax.set_xticks([0, 1])
        ax.set_xticklabels(["Giovani", name], fontsize=8.5, fontweight="bold")
        ax.set_yticks([])
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.set_title(f"{name} — Coverage ≥{threshold}",
                     fontsize=9, fontweight="bold", color=color, pad=10)

    fig.suptitle(
        "Confronto Classifiche: Giovani IT vs Politici\n"
        "(Slopegraph: pendenza indica il disallineamento)",
        fontsize=12, fontweight="bold", y=1.01,
    )
    _save(fig, out / "alignment.png")


# ── Metrics Computation ───────────────────────────────────────────────────────

def _politician_frames(df: pd.DataFrame):
    for entity in sorted(e for e in df["Entità"].unique() if e != YOUTH_ENTITY):
        yield entity, df[df["Entità"] == entity].copy()


def build_topic_gaps(df: pd.DataFrame) -> pd.DataFrame:
    youth = (
        df[(df["Entità"] == YOUTH_ENTITY) & (df["Metrica"] == YOUTH_METRIC)]
        [["Topic", "Rank", "Valore"]]
        .rename(columns={"Rank": "youth_rank", "Valore": "youth_value"})
    )
    rows = []
    for entity, pol_df in _politician_frames(df):
        merged = youth.merge(
            pol_df[["Topic", "Rank", "Valore", "Metrica"]].rename(
                columns={"Rank": "politician_rank", "Valore": "politician_importance"}
            ),
            on="Topic", how="inner",
        )
        for r in merged.itertuples(index=False):
            rank_gap = r.politician_rank - r.youth_rank
            if abs(rank_gap) <= 1:
                gap_class = "aligned"
            elif rank_gap < 0:
                gap_class = "over_prioritized_by_politician"
            else:
                gap_class = "under_prioritized_by_politician"

            y_high = r.youth_rank <= 5
            p_high = r.politician_rank <= 5
            if y_high and p_high:
                quadrant = "high_youth_high_politician"
            elif y_high:
                quadrant = "high_youth_low_politician"
            elif p_high:
                quadrant = "low_youth_high_politician"
            else:
                quadrant = "low_youth_low_politician"

            rows.append({
                "politician":            entity,
                "topic":                 r.Topic,
                "youth_rank":            r.youth_rank,
                "politician_rank":       r.politician_rank,
                "rank_gap":              round(float(rank_gap), 6),
                "abs_rank_gap":          round(float(abs(rank_gap)), 6),
                "youth_value":           r.youth_value,
                "politician_importance": r.politician_importance,
                "gap_class":             gap_class,
                "quadrant":              quadrant,
            })
    return pd.DataFrame(rows).sort_values(
        ["politician", "abs_rank_gap"], ascending=[True, False]
    )


def build_alignment_summary(topic_gaps: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for politician, group in topic_gaps.groupby("politician", sort=True):
        top3_y = _top_k_topics(group, "youth_rank",      3)
        top3_p = _top_k_topics(group, "politician_rank", 3)
        top5_y = _top_k_topics(group, "youth_rank",      5)
        top5_p = _top_k_topics(group, "politician_rank", 5)
        ws     = group["youth_value"].sum()
        wgap   = float((group["youth_value"] * group["abs_rank_gap"]).sum() / ws) if ws > 0 else np.nan
        rows.append({
            "politician":                  politician,
            "spearman_rank_corr":          _safe_corr(spearmanr,  group["youth_rank"], group["politician_rank"]),
            "kendall_tau":                 _safe_corr(kendalltau, group["youth_rank"], group["politician_rank"]),
            "mean_abs_rank_gap":           round(float(group["abs_rank_gap"].mean()), 6),
            "weighted_mean_abs_rank_gap":  round(wgap, 6) if pd.notna(wgap) else np.nan,
            "top3_overlap_count":          len(top3_y & top3_p),
            "top3_jaccard":                round(_jaccard(top3_y, top3_p), 6),
            "top5_overlap_count":          len(top5_y & top5_p),
            "top5_jaccard":                round(_jaccard(top5_y, top5_p), 6),
            "aligned_topics_abs_gap_le_1": int((group["abs_rank_gap"] <= 1).sum()),
            "over_prioritized_topics":     int((group["rank_gap"] < -1).sum()),
            "under_prioritized_topics":    int((group["rank_gap"] > 1).sum()),
        })
    return pd.DataFrame(rows).sort_values("weighted_mean_abs_rank_gap")


def build_topk_overlap(topic_gaps: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for politician, group in topic_gaps.groupby("politician", sort=True):
        for k in (3, 5):
            yt = _top_k_topics(group, "youth_rank",      k)
            pt = _top_k_topics(group, "politician_rank", k)
            rows.append({
                "politician":             politician,
                "k":                      k,
                "overlap_count":          len(yt & pt),
                "jaccard":                round(_jaccard(yt, pt), 6),
                "shared_topics":          "; ".join(sorted(yt & pt)),
                "youth_only_topics":      "; ".join(sorted(yt - pt)),
                "politician_only_topics": "; ".join(sorted(pt - yt)),
            })
    return pd.DataFrame(rows).sort_values(["politician", "k"])


def build_politician_similarity(df: pd.DataFrame) -> pd.DataFrame:
    pols = {
        entity: pol_df[["Topic", "Rank"]].rename(columns={"Rank": entity})
        for entity, pol_df in _politician_frames(df)
    }
    rows = []
    for left, right in itertools.combinations(sorted(pols), 2):
        merged = pols[left].merge(pols[right], on="Topic", how="inner")
        gap    = (merged[left] - merged[right]).abs()
        rows.append({
            "politician_a":           left,
            "politician_b":           right,
            "spearman_rank_corr":     _safe_corr(spearmanr,  merged[left], merged[right]),
            "kendall_tau":            _safe_corr(kendalltau, merged[left], merged[right]),
            "mean_abs_rank_distance": round(float(gap.mean()), 6),
            "max_abs_rank_distance":  round(float(gap.max()),  6),
        })
    return pd.DataFrame(rows).sort_values("mean_abs_rank_distance")


def build_coverage_table(dfs: dict, threshold: int = 3) -> pd.DataFrame:
    """Per-(politician, topic) coverage rate with Wilson 95% CI.

    Columns: politician, topic, n_posts, n_above, coverage, ci_low_95,
    ci_high_95, ci_width. Lets the caller compare profiles against
    sampling noise: differences with overlapping CIs are not distinguishable
    from random fluctuation at the 5% level.
    """
    rows = []
    for key, df in dfs.items():
        name   = _pol_name(key)
        scored = df[df["scored"]]
        n      = len(scored)
        for topic_key, topic_label in zip(TOPIC_KEYS, TOPIC_LABELS):
            k        = int((scored[topic_key] >= threshold).sum())
            cov      = k / n if n > 0 else np.nan
            lo, hi   = _wilson_ci(k, n)
            rows.append({
                "politician":  name,
                "topic":       topic_label,
                "n_posts":     n,
                "n_above":     k,
                "coverage":    round(float(cov), 4),
                "ci_low_95":   round(float(lo), 4),
                "ci_high_95":  round(float(hi), 4),
                "ci_width":    round(float(hi - lo), 4),
            })
    return pd.DataFrame(rows).sort_values(
        ["politician", "coverage"], ascending=[True, False]
    )


def _coverage_ranks(df: pd.DataFrame, threshold: int) -> tuple[np.ndarray, np.ndarray]:
    """Coverage Rate per topic and corresponding average ranks (rank 1 = top)."""
    scored = df[df["scored"]]
    cov    = np.array(
        [(scored[k] >= threshold).mean() for k in TOPIC_KEYS], dtype=float
    )
    return cov, _rank_avg(cov)


def build_bootstrap_alignment_ci(
    dfs: dict, threshold: int = 3,
    n_boot: int = BOOT_N, seed: int = BOOT_SEED, alpha: float = BOOT_ALPHA,
    return_samples: bool = False,
):
    """Bootstrap 95% CIs for Spearman ρ and Kendall τ_b vs. youth ranking.

    Resamples posts with replacement (post-level uncertainty), recomputes
    Coverage Rates, re-ranks the 10 topics and recomputes the correlation
    against the fixed youth ranking. Reports point estimate, percentile
    CI, and the share of resamples whose correlation crosses zero — a
    direct test of whether the observed alignment is distinguishable from
    no-alignment given the post-level sampling noise.

    If return_samples=True returns (summary_df, samples_dict) where
    samples_dict maps politician name → {"rho": np.ndarray, "tau": np.ndarray}.
    """
    pcts    = np.array([YOUTH_RAW_PCT_IT[k] for k in TOPIC_KEYS], dtype=float)
    ranks_y = _rank_avg(pcts)
    rng     = np.random.default_rng(seed)

    rows    = []
    samples: dict[str, dict[str, np.ndarray]] = {}
    for key, df in dfs.items():
        name   = _pol_name(key)
        scored = df[df["scored"]].reset_index(drop=True)
        n      = len(scored)
        if n == 0:
            continue
        scores_mat = scored[TOPIC_KEYS].to_numpy(dtype=float)  # n × 10

        cov_obs   = (scores_mat >= threshold).mean(axis=0)
        ranks_obs = _rank_avg(cov_obs)
        rho_obs   = float(spearmanr(ranks_y, ranks_obs).statistic)
        tau_obs   = float(kendalltau(ranks_y, ranks_obs).statistic)

        rhos = np.empty(n_boot)
        taus = np.empty(n_boot)
        for b in range(n_boot):
            idx       = rng.integers(0, n, size=n)
            cov_b     = (scores_mat[idx] >= threshold).mean(axis=0)
            ranks_b   = _rank_avg(cov_b)
            rhos[b]   = spearmanr(ranks_y, ranks_b).statistic
            taus[b]   = kendalltau(ranks_y, ranks_b).statistic

        samples[name] = {"rho": rhos, "tau": taus}

        lo_p, hi_p = 100 * alpha / 2, 100 * (1 - alpha / 2)
        rho_lo, rho_hi = np.nanpercentile(rhos, [lo_p, hi_p])
        tau_lo, tau_hi = np.nanpercentile(taus, [lo_p, hi_p])

        rho_zero = float(np.mean((rhos < 0) != (rho_obs < 0)))  # share crossing 0
        tau_zero = float(np.mean((taus < 0) != (tau_obs < 0)))

        rows.append({
            "politician":          name,
            "n_posts":             n,
            "spearman_rho":        round(rho_obs, 6),
            "rho_ci_low_95":       round(float(rho_lo), 6),
            "rho_ci_high_95":      round(float(rho_hi), 6),
            "rho_ci_width":        round(float(rho_hi - rho_lo), 6),
            "rho_share_cross_0":   round(rho_zero, 6),
            "kendall_tau":         round(tau_obs, 6),
            "tau_ci_low_95":       round(float(tau_lo), 6),
            "tau_ci_high_95":      round(float(tau_hi), 6),
            "tau_ci_width":        round(float(tau_hi - tau_lo), 6),
            "tau_share_cross_0":   round(tau_zero, 6),
            "n_boot":              n_boot,
        })
    result = pd.DataFrame(rows).sort_values("spearman_rho", ascending=False)
    return (result, samples) if return_samples else result


def _apply_bias_correction(dfs: dict, bias: dict[str, float]) -> dict:
    """Return a copy of dfs with per-topic bias subtracted from scores.

    Score is clipped to the [1, 5] Likert range after subtraction. Posts
    with NaN scores keep NaN. Used to test whether ranking conclusions
    survive a uniform correction for the model's per-topic mean bias
    measured on the validation set.
    """
    corrected = {}
    for key, df in dfs.items():
        cdf = df.copy()
        for k in TOPIC_KEYS:
            cdf[k] = (cdf[k] - bias.get(k, 0.0)).clip(lower=1.0, upper=5.0)
        cdf["scored"] = cdf[TOPIC_KEYS].notna().all(axis=1)
        corrected[key] = cdf
    return corrected


def build_bias_corrected_ranks(
    dfs: dict, bias: dict[str, float], threshold: int = 3,
) -> pd.DataFrame:
    """Compare original vs. bias-corrected Coverage / rank per (politician, topic).

    Subtracts the model's mean per-topic bias from each Likert score before
    re-thresholding at τ. The resulting Coverage Rates and ranks isolate
    the share of the observed agenda that is *not* attributable to the
    LLM's calibration drift. Worst-case adjustment: the correction is
    applied uniformly to every post, regardless of whether that post was
    actually overshooting or correctly classified.
    """
    pcts     = np.array([YOUTH_RAW_PCT_IT[k] for k in TOPIC_KEYS], dtype=float)
    ranks_y  = _rank_avg(pcts)
    dfs_corr = _apply_bias_correction(dfs, bias)

    rows = []
    for key in dfs:
        name        = _pol_name(key)
        cov_o, rk_o = _coverage_ranks(dfs[key],      threshold)
        cov_c, rk_c = _coverage_ranks(dfs_corr[key], threshold)
        for j, (tk, tlabel) in enumerate(zip(TOPIC_KEYS, TOPIC_LABELS)):
            rows.append({
                "politician":         name,
                "topic":              tlabel,
                "youth_rank":         float(ranks_y[j]),
                "coverage_orig":      round(float(cov_o[j]), 4),
                "rank_orig":          float(rk_o[j]),
                "coverage_corrected": round(float(cov_c[j]), 4),
                "rank_corrected":     float(rk_c[j]),
                "rank_shift":         float(rk_c[j] - rk_o[j]),
                "coverage_delta":     round(float(cov_c[j] - cov_o[j]), 4),
                "topic_bias":         round(float(bias.get(tk, 0.0)), 6),
            })
    return pd.DataFrame(rows).sort_values(
        ["politician", "rank_orig"], ascending=[True, True]
    )


def build_bias_corrected_alignment(
    dfs: dict, bias: dict[str, float], threshold: int = 3,
) -> pd.DataFrame:
    """Spearman ρ / τ_b before vs. after bias correction, per politician."""
    pcts     = np.array([YOUTH_RAW_PCT_IT[k] for k in TOPIC_KEYS], dtype=float)
    ranks_y  = _rank_avg(pcts)
    dfs_corr = _apply_bias_correction(dfs, bias)

    rows = []
    for key in dfs:
        name      = _pol_name(key)
        _, rk_o   = _coverage_ranks(dfs[key],      threshold)
        _, rk_c   = _coverage_ranks(dfs_corr[key], threshold)
        rows.append({
            "politician":            name,
            "spearman_orig":         _safe_corr(spearmanr,  pd.Series(ranks_y), pd.Series(rk_o)),
            "spearman_corrected":    _safe_corr(spearmanr,  pd.Series(ranks_y), pd.Series(rk_c)),
            "kendall_orig":          _safe_corr(kendalltau, pd.Series(ranks_y), pd.Series(rk_o)),
            "kendall_corrected":     _safe_corr(kendalltau, pd.Series(ranks_y), pd.Series(rk_c)),
            "rank_shift_mean_abs":   round(float(np.mean(np.abs(rk_c - rk_o))), 6),
            "rank_shift_max_abs":    round(float(np.max (np.abs(rk_c - rk_o))), 6),
        })
    return pd.DataFrame(rows).sort_values("spearman_corrected", ascending=False)


def build_threshold_sensitivity(
    dfs: dict, thresholds: tuple[int, ...] = (2, 3, 4),
) -> pd.DataFrame:
    """Long-form table of Coverage / rank per (politician, topic, τ).

    Used to verify whether the rankings reported in the paper survive a
    plausible perturbation of the salience cutoff. Together with
    `build_threshold_alignment` (Spearman ρ at each τ) this provides the
    formal sensitivity analysis missing from the original draft.
    """
    pcts     = np.array([YOUTH_RAW_PCT_IT[k] for k in TOPIC_KEYS], dtype=float)
    ranks_y  = _rank_avg(pcts)
    rows     = []
    for key, df in dfs.items():
        name = _pol_name(key)
        for t in thresholds:
            cov, ranks = _coverage_ranks(df, t)
            for j, tlabel in enumerate(TOPIC_LABELS):
                rows.append({
                    "politician": name,
                    "threshold":  t,
                    "topic":      tlabel,
                    "youth_rank": float(ranks_y[j]),
                    "coverage":   round(float(cov[j]),    4),
                    "rank":       float(ranks[j]),
                })
    return pd.DataFrame(rows).sort_values(
        ["politician", "threshold", "rank"], ascending=[True, True, True]
    )


def build_threshold_alignment(
    dfs: dict, thresholds: tuple[int, ...] = (2, 3, 4),
) -> pd.DataFrame:
    """Spearman ρ and Kendall τ vs. youth at each cutoff."""
    pcts    = np.array([YOUTH_RAW_PCT_IT[k] for k in TOPIC_KEYS], dtype=float)
    ranks_y = _rank_avg(pcts)
    rows    = []
    for key, df in dfs.items():
        name = _pol_name(key)
        for t in thresholds:
            _, ranks = _coverage_ranks(df, t)
            rows.append({
                "politician":   name,
                "threshold":    t,
                "spearman_rho": _safe_corr(spearmanr,  pd.Series(ranks_y), pd.Series(ranks)),
                "kendall_tau":  _safe_corr(kendalltau, pd.Series(ranks_y), pd.Series(ranks)),
            })
    return pd.DataFrame(rows).sort_values(["politician", "threshold"])


def build_topic_consensus(df: pd.DataFrame) -> pd.DataFrame:
    pol_df = df[df["Entità"] != YOUTH_ENTITY]
    rows   = []
    for topic, group in pol_df.groupby("Topic", sort=True):
        ranks = group["Rank"]
        rows.append({
            "topic":                topic,
            "mean_politician_rank": round(float(ranks.mean()), 6),
            "std_politician_rank":  round(float(ranks.std(ddof=0)), 6),
            "rank_range":           round(float(ranks.max() - ranks.min()), 6),
            "min_rank":             round(float(ranks.min()), 6),
            "max_rank":             round(float(ranks.max()), 6),
        })
    return pd.DataFrame(rows).sort_values(["std_politician_rank", "mean_politician_rank"])


# ── Alignment Metrics Charts ──────────────────────────────────────────────────

def plot_alignment_summary(summary: pd.DataFrame, out: Path) -> None:
    """Bar chart: Spearman ρ and Kendall τ, zoomed to actual value range."""
    pols   = summary["politician"].tolist()
    x      = np.arange(len(pols))
    w      = 0.3
    colors = [_pol_color(p) for p in pols]

    all_vals = pd.concat([summary["spearman_rank_corr"], summary["kendall_tau"]]).dropna()
    pad  = 0.12
    ymin = max(float(all_vals.min()) - pad, -1.0)
    ymax = min(float(all_vals.max()) + pad,  1.0)

    fig, ax = plt.subplots(figsize=(6, 4))
    for i, (col, label) in enumerate([
        ("spearman_rank_corr", "Spearman ρ"),
        ("kendall_tau",        "Kendall τ"),
    ]):
        ax.bar(x + (i - 0.5) * w, summary[col].tolist(), w,
               label=label, color=colors,
               alpha=0.9 if i == 0 else 0.5, edgecolor="white")

    if ymin <= 0 <= ymax:
        ax.axhline(0, color="black", linewidth=0.8, linestyle="--", alpha=0.5)
    ax.set_ylim(ymin, ymax)
    ax.set_xticks(x)
    ax.set_xticklabels([_last_name(p) for p in pols], fontsize=9)
    ax.set_ylabel("Correlazione di Rank", fontsize=8)
    ax.set_title("Allineamento Ranking Giovani ↔ Politici\n(Spearman ρ e Kendall τ — Coverage)",
                 fontsize=10, fontweight="bold")
    ax.legend(fontsize=8)
    ax.grid(axis="y", linestyle="--", alpha=0.3)
    _annotate_bars(ax)

    plt.tight_layout()
    _save(fig, out / "metric_alignment_corr.png")


def plot_topk_overlap(topk: pd.DataFrame, out: Path) -> None:
    """Grouped bar chart: Jaccard @ k=3 and k=5 per politician."""
    pols   = sorted(topk["politician"].unique())
    x      = np.arange(len(pols))
    w      = 0.3
    colors = [_pol_color(p) for p in pols]

    fig, ax = plt.subplots(figsize=(6, 4))
    for i, k in enumerate([3, 5]):
        vals = (
            topk[topk["k"] == k].set_index("politician")
            .reindex(pols)["jaccard"].fillna(0).tolist()
        )
        ax.bar(x + (i - 0.5) * w, vals, w,
               label=f"Top-{k} Jaccard",
               color=colors, alpha=0.9 if i == 0 else 0.5, edgecolor="white")

    ax.set_ylim(0, 1)
    ax.set_xticks(x)
    ax.set_xticklabels([_last_name(p) for p in pols], fontsize=9)
    ax.set_ylabel("Jaccard Similarity", fontsize=8)
    ax.yaxis.set_major_formatter(mticker.PercentFormatter(xmax=1.0, decimals=0))
    ax.set_title("Sovrapposizione Top-K Topics: Giovani vs Politici\n(Jaccard @ k=3 e k=5 — Coverage)",
                 fontsize=10, fontweight="bold")
    ax.legend(fontsize=8)
    ax.grid(axis="y", linestyle="--", alpha=0.3)

    plt.tight_layout()
    _save(fig, out / "metric_topk_overlap.png")


def plot_politician_similarity(similarity: pd.DataFrame, out: Path) -> None:
    """Heatmap matrix of Spearman ρ between politicians."""
    pols = sorted(set(similarity["politician_a"].tolist() + similarity["politician_b"].tolist()))
    n    = len(pols)
    idx  = {p: i for i, p in enumerate(pols)}

    matrix = np.eye(n)
    for row in similarity.itertuples():
        i, j = idx[row.politician_a], idx[row.politician_b]
        matrix[i, j] = matrix[j, i] = row.spearman_rank_corr

    fig, ax = plt.subplots(figsize=(5, 5))
    im    = ax.imshow(matrix, cmap="coolwarm", vmin=-1, vmax=1)
    short = [_last_name(p) for p in pols]
    ax.set_xticks(np.arange(n))
    ax.set_xticklabels(short, fontsize=9, rotation=30, ha="right")
    ax.set_yticks(np.arange(n))
    ax.set_yticklabels(short, fontsize=9)
    ax.set_title("Similarità tra Politici\n(Spearman ρ — Coverage)", fontsize=10, fontweight="bold")

    for i in range(n):
        for j in range(n):
            ax.text(j, i, f"{matrix[i, j]:.2f}", ha="center", va="center",
                    fontsize=10, fontweight="bold",
                    color="white" if abs(matrix[i, j]) > 0.5 else "black")

    plt.colorbar(im, ax=ax, label="Spearman ρ")
    plt.tight_layout()
    _save(fig, out / "metric_politician_similarity.png")


def plot_bootstrap_alignment_ci(boot_df: pd.DataFrame, out: Path,
                                 threshold: int = 3) -> None:
    """Forest plot: Spearman ρ and Kendall τ with bootstrap 95% CIs.

    The visual answer to the peer-review point on under-powered rank
    correlations: bars whose CIs cross zero are not distinguishable from
    no-alignment given the post-level sampling noise; pairs of bars whose
    CIs overlap are not distinguishable from each other.
    """
    pols   = boot_df["politician"].tolist()
    n_pols = len(pols)
    fig, axes = plt.subplots(1, 2, figsize=(11, max(3, 1.0 * n_pols + 1.6)),
                              sharey=True)

    for ax, (col, lo_col, hi_col, label, xlim) in zip(axes, [
        ("spearman_rho", "rho_ci_low_95", "rho_ci_high_95", "Spearman ρ", (-1.0, 1.0)),
        ("kendall_tau",  "tau_ci_low_95", "tau_ci_high_95", "Kendall τ_b", (-1.0, 1.0)),
    ]):
        y      = np.arange(n_pols)
        point  = boot_df[col].to_numpy()
        lo     = boot_df[lo_col].to_numpy()
        hi     = boot_df[hi_col].to_numpy()
        err    = np.array([point - lo, hi - point])
        colors = [_pol_color(p) for p in pols]

        ax.errorbar(point, y, xerr=err, fmt="none", ecolor="black",
                    elinewidth=1.4, capsize=4, alpha=0.75)
        for yi, p, c in zip(y, point, colors):
            ax.scatter(p, yi, s=80, color=c, edgecolor="white",
                       linewidths=1.2, zorder=3)

        ax.axvline(0, color="black", linestyle="--", linewidth=0.8, alpha=0.5)
        ax.set_xlim(*xlim)
        ax.set_yticks(y)
        ax.set_yticklabels([_last_name(p) for p in pols], fontsize=9)
        ax.set_xlabel(label, fontsize=9)
        ax.grid(axis="x", linestyle="--", alpha=0.3)

        for yi, lov, hiv in zip(y, lo, hi):
            ax.text(hiv + 0.04, yi, f"[{lov:+.2f}, {hiv:+.2f}]",
                    va="center", fontsize=7.5, color="#555555")

    axes[0].invert_yaxis()
    fig.suptitle(
        f"Bootstrap CI 95% per le correlazioni di ranking (Coverage ≥{threshold})\n"
        f"Resampling sui post (B={int(boot_df['n_boot'].iloc[0])}); "
        "CI che incrociano lo zero ⇒ allineamento indistinguibile dal rumore",
        fontsize=11, fontweight="bold",
    )
    plt.tight_layout()
    _save(fig, out / "metric_alignment_bootstrap_ci.png")


def plot_bootstrap_distributions(
    samples: dict,
    boot_df: pd.DataFrame,
    out: Path,
    threshold: int = 3,
    alpha: float = BOOT_ALPHA,
) -> None:
    """KDE of the B bootstrap Spearman ρ and Kendall τ_b distributions.

    One row per politician (ρ left, τ right). Darker-shaded tails show the
    α/2 = 2.5% excluded from each side; dashed verticals mark the CI bounds
    with their percentile labels; the solid vertical is the point estimate.
    """
    pols   = list(samples.keys())
    n_pols = len(pols)
    lo_p   = 100 * alpha / 2        # 2.5
    hi_p   = 100 * (1 - alpha / 2)  # 97.5

    fig, axes = plt.subplots(n_pols, 2, figsize=(12, 3.8 * n_pols), squeeze=False)
    plt.subplots_adjust(hspace=0.60, wspace=0.35)

    for row_i, pol in enumerate(pols):
        color  = _pol_color(pol)
        row_df = boot_df[boot_df["politician"] == pol].iloc[0]

        for col_i, (metric, lo_col, hi_col, pt_col, xlabel) in enumerate([
            ("rho", "rho_ci_low_95", "rho_ci_high_95", "spearman_rho", "Spearman ρ"),
            ("tau", "tau_ci_low_95", "tau_ci_high_95", "kendall_tau",  "Kendall τ_b"),
        ]):
            ax     = axes[row_i, col_i]
            data   = samples[pol][metric]
            lo_val = float(row_df[lo_col])
            hi_val = float(row_df[hi_col])
            pt_val = float(row_df[pt_col])

            # KDE curve over the actual data range
            kde = gaussian_kde(data, bw_method="scott")
            xs  = np.linspace(
                max(-1.0, float(data.min()) - 0.08),
                min( 1.0, float(data.max()) + 0.08),
                500,
            )
            ys = kde(xs)

            ax.plot(xs, ys, color=color, linewidth=1.8, zorder=3)

            # Shaded regions
            mask_lo = xs <= lo_val
            mask_ci = (xs >= lo_val) & (xs <= hi_val)
            mask_hi = xs >= hi_val

            ax.fill_between(xs[mask_lo], ys[mask_lo], alpha=0.45, color=color,
                            zorder=2)
            ax.fill_between(xs[mask_hi], ys[mask_hi], alpha=0.45, color=color,
                            zorder=2)
            ax.fill_between(xs[mask_ci], ys[mask_ci], alpha=0.12, color=color,
                            zorder=1)

            # CI boundary verticals
            ax.axvline(lo_val, color=color, linewidth=1.3, linestyle="--", zorder=4)
            ax.axvline(hi_val, color=color, linewidth=1.3, linestyle="--", zorder=4)

            # Point estimate
            ax.axvline(pt_val, color="black", linewidth=1.8, linestyle="-", zorder=5,
                       label=f"Stima puntuale: {pt_val:+.3f}")

            # Zero reference
            ax.axvline(0, color="#888888", linewidth=0.8, linestyle=":", alpha=0.7,
                       zorder=1, label="Zero (nessun allineamento)")

            # Mixed-transform annotations (x = data coords, y = axes fraction)
            trans = ax.get_xaxis_transform()

            # Percentile labels above the dashed boundary lines
            ax.text(lo_val, 0.97, f"P{lo_p:.0f}\n{lo_val:+.3f}",
                    ha="center", va="top", fontsize=7, color=color,
                    fontweight="bold", transform=trans)
            ax.text(hi_val, 0.97, f"P{hi_p:.0f}\n{hi_val:+.3f}",
                    ha="center", va="top", fontsize=7, color=color,
                    fontweight="bold", transform=trans)

            # "2.5%" labels inside the shaded tails
            ax.text(lo_val - 0.02, 0.52, "2.5%",
                    ha="right", va="center", fontsize=8.5, color=color,
                    fontweight="bold", transform=trans)
            ax.text(hi_val + 0.02, 0.52, "2.5%",
                    ha="left",  va="center", fontsize=8.5, color=color,
                    fontweight="bold", transform=trans)

            ax.set_xlabel(xlabel, fontsize=9)
            ax.set_ylabel("Densità KDE", fontsize=8)
            if col_i == 0:
                ax.set_title(pol, fontsize=10.5, fontweight="bold",
                             color=color, loc="left", pad=8)
            ax.legend(fontsize=7.5, loc="upper left")
            ax.grid(axis="x", linestyle="--", alpha=0.3)
            ax.set_xlim(-1.05, 1.05)

    fig.suptitle(
        f"Distribuzioni Bootstrap — Spearman ρ e Kendall τ_b (Coverage ≥{threshold})\n"
        f"B = {int(boot_df['n_boot'].iloc[0])} ricampionamenti — "
        "zone scure = 2.5% escluso da ciascun estremo del CI al 95%",
        fontsize=11, fontweight="bold", y=1.01,
    )
    _save(fig, out / "metric_alignment_bootstrap_distributions.png")


def plot_bias_correction(corr_align: pd.DataFrame,
                          corr_ranks: pd.DataFrame, out: Path,
                          threshold: int = 3) -> None:
    """Two-panel chart: Spearman ρ before vs. after correction (left) and
    rank shifts per (politician, topic) (right).

    Tests directly the §6.4 claim that "the high rank survives the bias
    margin": if the bias-corrected rank of democracy/legality drops below
    the youth rank of 8.5 the claim collapses; otherwise it is supported
    quantitatively rather than rhetorically.
    """
    fig, axes = plt.subplots(1, 2, figsize=(13.5, 5),
                              gridspec_kw={"width_ratios": [1, 2.2]})

    # ── Left: Spearman before/after, per politician ───────────────────────
    ax    = axes[0]
    pols  = corr_align["politician"].tolist()
    x     = np.arange(len(pols))
    w     = 0.35
    color = [_pol_color(p) for p in pols]
    orig  = corr_align["spearman_orig"].to_numpy()
    corr  = corr_align["spearman_corrected"].to_numpy()
    ax.bar(x - w / 2, orig, w, label="Originale",
           color=color, alpha=0.5, edgecolor="white")
    ax.bar(x + w / 2, corr, w, label="Bias-corrected",
           color=color, alpha=0.95, edgecolor="white")
    ax.axhline(0, color="black", linewidth=0.8, linestyle="--", alpha=0.5)

    ymin = min(orig.min(), corr.min()) - 0.06
    ymax = max(orig.max(), corr.max()) + 0.10
    ax.set_ylim(ymin, ymax)
    for xi, vo, vc in zip(x, orig, corr):
        ax.text(xi - w / 2, vo + 0.012 * np.sign(vo or 1),
                f"{vo:+.2f}", ha="center",
                va="bottom" if vo >= 0 else "top",
                fontsize=7, color="#444444")
        ax.text(xi + w / 2, vc + 0.012 * np.sign(vc or 1),
                f"{vc:+.2f}", ha="center",
                va="bottom" if vc >= 0 else "top",
                fontsize=7, fontweight="bold")

    ax.set_xticks(x)
    ax.set_xticklabels([_last_name(p) for p in pols], fontsize=9)
    ax.set_ylabel("Spearman ρ", fontsize=9)
    ax.set_title("Effetto della correzione del bias\nsull'allineamento globale",
                 fontsize=10, fontweight="bold")
    ax.legend(fontsize=8, loc="upper right")
    ax.grid(axis="y", linestyle="--", alpha=0.3)

    # ── Right: rank shifts per (politician, topic) ────────────────────────
    ax2     = axes[1]
    pivot   = corr_ranks.pivot(index="topic", columns="politician",
                                 values="rank_shift").reindex(TOPIC_LABELS)
    pol_cols = list(pivot.columns)
    n_pols  = len(pol_cols)
    width   = 0.8 / n_pols
    xpos    = np.arange(len(TOPIC_LABELS))
    for i, p in enumerate(pol_cols):
        ax2.bar(xpos + (i - (n_pols - 1) / 2) * width,
                pivot[p].to_numpy(), width,
                color=_pol_color(p), alpha=0.9, edgecolor="white",
                label=_last_name(p))
    ax2.axhline(0, color="black", linewidth=0.8, linestyle="--", alpha=0.5)
    ax2.set_xticks(xpos)
    ax2.set_xticklabels(_TOPIC_SHORT, rotation=35, ha="right", fontsize=8.5)
    ax2.set_ylabel("Δ rank (corrected − originale)", fontsize=9)
    ax2.set_title("Spostamento di rank per topic dopo correzione del bias\n"
                  "(positivo = il topic perde rilevanza, peggiora di rank)",
                  fontsize=10, fontweight="bold")
    ax2.legend(fontsize=8, loc="best")
    ax2.grid(axis="y", linestyle="--", alpha=0.3)

    fig.suptitle(
        f"Correzione formale del bias del modello — soglia ≥{threshold}\n"
        "Bias per topic sottratto ai punteggi prima del thresholding (clip in [1,5])",
        fontsize=11, fontweight="bold", y=1.02,
    )
    plt.tight_layout()
    _save(fig, out / "metric_bias_correction.png")


def plot_threshold_sensitivity(thr_ranks: pd.DataFrame,
                                thr_align: pd.DataFrame, out: Path) -> None:
    """Heatmap (one panel per politician) of rank-by-(topic × τ) plus a
    summary panel of Spearman ρ vs. youth at each τ.

    Reading: stable rows are topics whose ordering does not depend on
    the cutoff; large color jumps along a row signal threshold-fragile
    rankings. The summary panel shows whether the global correlation is
    qualitatively stable across τ.
    """
    pols       = sorted(thr_ranks["politician"].unique())
    thresholds = sorted(thr_ranks["threshold"].unique())
    n_pols     = len(pols)

    fig = plt.figure(figsize=(4.2 * n_pols + 5.0, 5.4))
    gs  = fig.add_gridspec(
        1, n_pols + 2,
        width_ratios=[1.0] * n_pols + [0.08, 1.6],
        wspace=0.18,
    )

    im = None
    for col, p in enumerate(pols):
        sub = thr_ranks[thr_ranks["politician"] == p]
        mat = (sub.pivot(index="topic", columns="threshold", values="rank")
                  .reindex(TOPIC_LABELS).reindex(columns=thresholds))
        ax  = fig.add_subplot(gs[0, col])
        im  = ax.imshow(mat.to_numpy(), cmap="YlGnBu_r", vmin=1, vmax=10,
                        aspect="auto")
        ax.set_xticks(np.arange(len(thresholds)))
        ax.set_xticklabels([f"τ≥{t}" for t in thresholds], fontsize=9)
        if col == 0:
            ax.set_yticks(np.arange(len(TOPIC_LABELS)))
            ax.set_yticklabels(_TOPIC_SHORT, fontsize=8.5)
            ax.set_ylabel("Topic", fontsize=9)
        else:
            ax.set_yticks([])
        ax.set_title(_last_name(p), fontsize=10, fontweight="bold",
                     color=_pol_color(p))
        for i in range(len(TOPIC_LABELS)):
            for j in range(len(thresholds)):
                v = mat.iat[i, j]
                ax.text(j, i, f"{v:.1f}".rstrip("0").rstrip("."),
                        ha="center", va="center",
                        fontsize=8, fontweight="bold",
                        color="white" if v <= 4 else "black")

    cax = fig.add_subplot(gs[0, n_pols])
    cb  = fig.colorbar(im, cax=cax, label="Rank (1=top, 10=bot)")
    cb.ax.tick_params(labelsize=8)

    # ── Summary: Spearman ρ at each τ ─────────────────────────────────────
    ax_sum = fig.add_subplot(gs[0, -1])
    width  = 0.8 / len(thresholds)
    xpos   = np.arange(n_pols)
    bar_colors = [_pol_color(p) for p in pols]
    for i, t in enumerate(thresholds):
        sub = (thr_align[thr_align["threshold"] == t]
               .set_index("politician").reindex(pols))
        vals = sub["spearman_rho"].to_numpy()
        alphas = 0.45 + 0.25 * i
        bars = ax_sum.bar(
            xpos + (i - (len(thresholds) - 1) / 2) * width,
            vals, width,
            color=bar_colors, alpha=alphas,
            edgecolor="white", linewidth=0.8,
            label=f"τ≥{t}",
        )
        for bar, v in zip(bars, vals):
            ax_sum.text(
                bar.get_x() + bar.get_width() / 2,
                v + 0.02 * np.sign(v or 1),
                f"{v:+.2f}", ha="center",
                va="bottom" if v >= 0 else "top",
                fontsize=6.5,
            )

    ax_sum.axhline(0, color="black", linewidth=0.8, linestyle="--", alpha=0.5)
    ax_sum.set_xticks(xpos)
    ax_sum.set_xticklabels([_last_name(p) for p in pols], fontsize=9)
    ax_sum.set_ylabel("Spearman ρ vs. giovani", fontsize=9)
    ax_sum.set_ylim(-0.5, 0.5)
    ax_sum.set_title("Correlazione globale\na ogni soglia τ",
                     fontsize=10, fontweight="bold")
    ax_sum.legend(fontsize=8, loc="upper right", framealpha=0.9)
    ax_sum.grid(axis="y", linestyle="--", alpha=0.3)

    fig.suptitle(
        "Sensitivity analysis sulla soglia di salienza τ — "
        "rank per topic a τ ∈ {2, 3, 4} e correlazione globale a ciascun τ",
        fontsize=11, fontweight="bold", y=1.00,
    )
    _save(fig, out / "metric_threshold_sensitivity.png")


def plot_topic_consensus(consensus: pd.DataFrame, out: Path) -> None:
    """Scatter: mean politician rank vs std per topic."""
    fig, ax = plt.subplots(figsize=(6, 5))

    sc = ax.scatter(
        consensus["mean_politician_rank"], consensus["std_politician_rank"],
        s=100, alpha=0.85, edgecolors="white", linewidths=0.8,
        c=consensus["std_politician_rank"], cmap="YlOrRd",
    )
    for _, row in consensus.iterrows():
        ax.annotate(row["topic"], (row["mean_politician_rank"], row["std_politician_rank"]),
                    textcoords="offset points", xytext=(4, 4), fontsize=7)

    ax.set_xlabel("Rank Medio tra Politici", fontsize=8)
    ax.set_ylabel("Std del Rank tra Politici", fontsize=8)
    ax.set_title("Consenso dei Politici per Topic\n(bassa std = alto consenso — Coverage)",
                 fontsize=10, fontweight="bold")
    ax.invert_xaxis()
    ax.grid(linestyle="--", alpha=0.3)
    plt.colorbar(sc, ax=ax, label="Std rank")

    plt.tight_layout()
    _save(fig, out / "metric_topic_consensus.png")


# ── Politician Profile Charts (no youth reference) ────────────────────────────

def plot_mean_scores_heatmap(dfs: dict, out: Path) -> None:
    """Heatmap: mean LLM score (1–5) — politicians on y, topics on x."""
    pols  = list(dfs.keys())
    names = [_pol_name(k) for k in pols]

    matrix = np.zeros((len(pols), 10))
    for i, (key, df) in enumerate(dfs.items()):
        scored = df[df["scored"]]
        for j, topic in enumerate(TOPIC_KEYS):
            matrix[i, j] = scored[topic].mean()

    fig, ax = plt.subplots(figsize=(10, max(3, len(pols) * 1.5)))
    im = ax.imshow(matrix, cmap="YlOrRd", vmin=1, vmax=5, aspect="auto")

    ax.set_xticks(np.arange(10))
    ax.set_xticklabels(_TOPIC_SHORT, fontsize=8.5, rotation=35, ha="right")
    ax.set_yticks(np.arange(len(pols)))
    ax.set_yticklabels([_last_name(n) for n in names], fontsize=9)
    ax.set_title("Score Medio per Topic e Politico\n(scala 1–5, LLM scoring)",
                 fontsize=10, fontweight="bold")

    for i in range(len(pols)):
        for j in range(10):
            ax.text(j, i, f"{matrix[i, j]:.2f}", ha="center", va="center",
                    fontsize=8.5, fontweight="bold",
                    color="white" if matrix[i, j] > 3.5 else "black")

    plt.colorbar(im, ax=ax, label="Score medio (1–5)")
    plt.tight_layout()
    _save(fig, out / "pol_mean_scores_heatmap.png")


def plot_coverage_heatmap(dfs: dict, out: Path, threshold: int = 3) -> None:
    """Heatmap: coverage rate — politicians on y, topics on x."""
    pols  = list(dfs.keys())
    names = [_pol_name(k) for k in pols]

    matrix = np.zeros((len(pols), 10))
    for i, (key, df) in enumerate(dfs.items()):
        scored = df[df["scored"]]
        for j, topic in enumerate(TOPIC_KEYS):
            matrix[i, j] = (scored[topic] >= threshold).mean()

    fig, ax = plt.subplots(figsize=(10, max(3, len(pols) * 1.5)))
    im = ax.imshow(matrix, cmap="Blues", vmin=0, vmax=1, aspect="auto")

    ax.set_xticks(np.arange(10))
    ax.set_xticklabels(_TOPIC_SHORT, fontsize=8.5, rotation=35, ha="right")
    ax.set_yticks(np.arange(len(pols)))
    ax.set_yticklabels([_last_name(n) for n in names], fontsize=9)
    ax.set_title(f"Coverage Rate per Topic e Politico\n(% post con score ≥ {threshold})",
                 fontsize=10, fontweight="bold")

    for i in range(len(pols)):
        for j in range(10):
            ax.text(j, i, f"{matrix[i, j]:.0%}", ha="center", va="center",
                    fontsize=8.5, fontweight="bold",
                    color="white" if matrix[i, j] > 0.55 else "black")

    plt.colorbar(im, ax=ax, label=f"Coverage rate (soglia ≥{threshold})")
    plt.tight_layout()
    _save(fig, out / "pol_coverage_heatmap.png")


def plot_coverage_with_ci(coverage_table: pd.DataFrame, out: Path,
                          threshold: int = 3) -> None:
    """Grouped bar chart: coverage per (topic, politician) with Wilson 95% CI.

    Topics on x in canonical order (matches the rest of the analyzer); one
    bar per politician with asymmetric error bars from the Wilson interval.
    Bars whose CIs overlap are not distinguishable at α=0.05.
    """
    pols     = sorted(coverage_table["politician"].unique())
    n_pols   = len(pols)
    n_topics = len(TOPIC_LABELS)
    width    = 0.8 / n_pols
    x        = np.arange(n_topics)

    fig, ax = plt.subplots(figsize=(12, 5))

    for i, pol in enumerate(pols):
        sub = (coverage_table[coverage_table["politician"] == pol]
               .set_index("topic").reindex(TOPIC_LABELS))
        cov = sub["coverage"].to_numpy()
        lo  = sub["ci_low_95"].to_numpy()
        hi  = sub["ci_high_95"].to_numpy()
        err = np.array([cov - lo, hi - cov])  # asymmetric (Wilson)
        ax.bar(
            x + (i - (n_pols - 1) / 2) * width, cov, width,
            label=_last_name(pol), color=_pol_color(pol),
            alpha=0.9, edgecolor="white",
            yerr=err, capsize=2.5, ecolor="black",
            error_kw={"alpha": 0.7, "linewidth": 0.8},
        )

    ax.set_xticks(x)
    ax.set_xticklabels(_TOPIC_SHORT, rotation=35, ha="right", fontsize=8.5)
    ax.set_ylabel("Coverage Rate", fontsize=8)
    ax.yaxis.set_major_formatter(mticker.PercentFormatter(xmax=1.0, decimals=0))
    ymax = float(coverage_table["ci_high_95"].max()) + 0.05
    ax.set_ylim(0, max(ymax, 0.6))
    ax.set_title(
        f"Coverage Rate per Topic con CI 95% di Wilson (soglia ≥{threshold})\n"
        "Barre con CI sovrapposti non sono distinguibili dal rumore campionario",
        fontsize=10, fontweight="bold",
    )
    ax.legend(fontsize=8)
    ax.grid(axis="y", linestyle="--", alpha=0.3)

    plt.tight_layout()
    _save(fig, out / "pol_coverage_with_ci.png")


def plot_topic_cooccurrence(dfs: dict, out: Path, threshold: int = 3) -> None:
    """Per-politician Jaccard similarity heatmap of topic co-occurrence.

    J(A,B) = |A∩B| / |A∪B| where A,B are the sets of posts with score ≥ threshold.
    Diagonal is always 1 (J(A,A) = 1).
    """
    n_pols = len(dfs)
    fig, axes = plt.subplots(1, n_pols, figsize=(6 * n_pols, 6), squeeze=False)

    for col, (key, df) in enumerate(dfs.items()):
        name    = _pol_name(key)
        color   = _pol_color(name)
        scored  = df[df["scored"]]
        n_posts = len(scored)

        binary = np.array(
            [(scored[k] >= threshold).astype(float).values for k in TOPIC_KEYS]
        )  # 10 × n_posts

        joint  = binary @ binary.T                                  # |A ∩ B| counts
        counts = binary.sum(axis=1)                                 # |A| counts
        union  = counts[:, None] + counts[None, :] - joint         # |A ∪ B| counts
        with np.errstate(invalid="ignore"):
            jaccard = np.where(union > 0, joint / union, 0.0)      # 10 × 10, diag = 1

        ax = axes[0, col]
        im = ax.imshow(jaccard, cmap="Blues", vmin=0, vmax=1, aspect="auto")

        ax.set_xticks(np.arange(10))
        ax.set_xticklabels(_TOPIC_SHORT, fontsize=6.5, rotation=40, ha="right")
        ax.set_yticks(np.arange(10))
        ax.set_yticklabels(_TOPIC_SHORT, fontsize=6.5)
        ax.set_title(f"{name}\n(n={n_posts} post)", fontsize=9,
                     fontweight="bold", color=color)

        for i in range(10):
            for j in range(10):
                ax.text(j, i, f"{jaccard[i, j]:.2f}", ha="center", va="center",
                        fontsize=6, color="white" if jaccard[i, j] > 0.55 else "black")

        plt.colorbar(im, ax=ax, label="Jaccard J(i,j)")

    fig.suptitle(
        f"Co-occorrenza dei Topic per Politico — Jaccard Similarity\n"
        f"(J=1 sulla diagonale, J(i,j) = post con entrambi ≥{threshold} / post con almeno uno ≥{threshold})",
        fontsize=11, fontweight="bold",
    )
    plt.tight_layout()
    _save(fig, out / "pol_topic_cooccurrence.png")


def plot_topic_score_correlation(dfs: dict, out: Path) -> None:
    """Per-politician heatmap: Pearson r between topic score vectors across posts."""
    n_pols = len(dfs)
    fig, axes = plt.subplots(1, n_pols, figsize=(6 * n_pols, 6), squeeze=False)

    for col, (key, df) in enumerate(dfs.items()):
        name   = _pol_name(key)
        color  = _pol_color(name)
        scored = df[df["scored"]]

        scores = scored[TOPIC_KEYS].values.T  # 10 × n_posts
        corr   = np.corrcoef(scores)          # 10 × 10

        ax = axes[0, col]
        im = ax.imshow(corr, cmap="RdYlGn", vmin=-1, vmax=1, aspect="auto")

        ax.set_xticks(np.arange(10))
        ax.set_xticklabels(_TOPIC_SHORT, fontsize=6.5, rotation=40, ha="right")
        ax.set_yticks(np.arange(10))
        ax.set_yticklabels(_TOPIC_SHORT, fontsize=6.5)
        ax.set_title(f"{name}", fontsize=9, fontweight="bold", color=color)

        for i in range(10):
            for j in range(10):
                ax.text(j, i, f"{corr[i, j]:.2f}", ha="center", va="center",
                        fontsize=6, color="white" if abs(corr[i, j]) > 0.55 else "black")

        plt.colorbar(im, ax=ax, label="Pearson r")

    fig.suptitle(
        "Correlazione tra Score dei Topic per Politico\n"
        "(Pearson r tra i vettori di score nei post — alti valori = topic trattati insieme)",
        fontsize=12, fontweight="bold",
    )
    plt.tight_layout()
    _save(fig, out / "pol_topic_score_correlation.png")




# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Genera classifiche tematiche, metriche di allineamento e profili comunicativi.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        epilog="""Esempi:
  python analyzer.py
  python analyzer.py ../../data/scores/
  python analyzer.py ../../data/scores/ --output ../../data/results/
  python analyzer.py --threshold 4
  python analyzer.py --profiles ellyesse giorgiameloni
""",
    )
    p.add_argument("input_dir", nargs="?", default=None,
                   help="Cartella con i CSV di scoring (default: data/scores/).")
    p.add_argument("--output",    "-o", default=None,
                   help="Cartella di output (default: data/results/).")
    p.add_argument("--threshold", "-t", type=int, default=3,
                   help="Score minimo (1–5) per considerare un topic 'trattato' in un post.")
    p.add_argument("--profiles",  nargs="+", default=None, metavar="STEM",
                   help="Limita l'analisi ai politici con questi stem CSV (default: tutti).")
    return p.parse_args()


def main() -> None:
    args    = parse_args()
    in_dir  = Path(args.input_dir).resolve() if args.input_dir else SCORES_DIR
    out_dir = Path(args.output).resolve()    if args.output    else RESULTS_DIR

    if not in_dir.exists():
        sys.exit(f"[ERROR] Cartella non trovata: {in_dir}")

    plots_dir = out_dir / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nInput:     {in_dir}")
    print(f"Output:    {out_dir}")
    print(f"Threshold: ≥ {args.threshold}")
    if args.profiles:
        print(f"Profili:   {', '.join(args.profiles)}")
    print()

    _set_style()

    print("Caricamento CSV...")
    dfs = load_csvs(in_dir)
    if args.profiles:
        wanted = set(args.profiles)
        missing = wanted - dfs.keys()
        if missing:
            sys.exit(f"[ERROR] Profili non trovati: {sorted(missing)}")
        dfs = {k: v for k, v in dfs.items() if k in wanted}
    if not dfs:
        sys.exit("[ERROR] Nessun CSV trovato nella cartella.")

    # ── Ranking / alignment ───────────────────────────────────────────────────
    print("\n[Rankings] Classifiche tematiche...")
    rankings = plot_rankings(dfs, plots_dir, args.threshold)

    print("[Alignment] Slopegraph giovani vs politici...")
    plot_alignment(dfs, plots_dir, args.threshold)

    # ── Alignment metrics ─────────────────────────────────────────────────────
    print("\n[Metrics] Calcolo metriche di allineamento...")
    topic_gaps        = build_topic_gaps(rankings)
    alignment_summary = build_alignment_summary(topic_gaps)
    topk_overlap      = build_topk_overlap(topic_gaps)
    similarity        = build_politician_similarity(rankings)
    consensus         = build_topic_consensus(rankings)
    coverage_table    = build_coverage_table(dfs, args.threshold)

    print("[Charts] Correlazioni di allineamento...")
    plot_alignment_summary(alignment_summary, plots_dir)

    print("[Charts] Overlap top-K topics...")
    plot_topk_overlap(topk_overlap, plots_dir)

    print("[Charts] Similarità tra politici...")
    plot_politician_similarity(similarity, plots_dir)

    print("[Charts] Consenso per topic...")
    plot_topic_consensus(consensus, plots_dir)

    # ── Robustness: bootstrap CIs, bias correction, threshold sensitivity ────
    print("\n[Robustness] Bootstrap CI sulle correlazioni di rank...")
    boot_ci, boot_samples = build_bootstrap_alignment_ci(
        dfs, args.threshold, return_samples=True
    )
    plot_bootstrap_alignment_ci(boot_ci, plots_dir, args.threshold)

    print("[Robustness] Distribuzioni bootstrap per politico...")
    plot_bootstrap_distributions(boot_samples, boot_ci, plots_dir, args.threshold)

    print("[Robustness] Correzione formale del bias del modello...")
    corr_ranks    = build_bias_corrected_ranks(dfs, MODEL_BIAS_GEMMA, args.threshold)
    corr_align    = build_bias_corrected_alignment(dfs, MODEL_BIAS_GEMMA, args.threshold)
    plot_bias_correction(corr_align, corr_ranks, plots_dir, args.threshold)

    print("[Robustness] Sensitivity analysis su τ ∈ {2, 3, 4}...")
    thr_ranks = build_threshold_sensitivity(dfs, (2, 3, 4))
    thr_align = build_threshold_alignment  (dfs, (2, 3, 4))
    plot_threshold_sensitivity(thr_ranks, thr_align, plots_dir)

    # ── Politician profile (no youth reference) ───────────────────────────────
    print("\n[Profile] Heatmap score medi...")
    plot_mean_scores_heatmap(dfs, plots_dir)

    print("[Profile] Heatmap coverage...")
    plot_coverage_heatmap(dfs, plots_dir, args.threshold)

    print("[Profile] Coverage con CI 95% (Wilson)...")
    plot_coverage_with_ci(coverage_table, plots_dir, args.threshold)

    print("[Profile] Co-occorrenza topic...")
    plot_topic_cooccurrence(dfs, plots_dir, args.threshold)

    print("[Profile] Correlazione score tra topic...")
    plot_topic_score_correlation(dfs, plots_dir)

    # ── Rankings CSV (reference data) ─────────────────────────────────────────
    csv_dir = out_dir / "csv"
    csv_dir.mkdir(parents=True, exist_ok=True)
    rankings.to_csv(csv_dir / "rankings.csv", index=False)
    print(f"\n  → rankings.csv")
    coverage_table.to_csv(csv_dir / "coverage_rates.csv", index=False)
    print(f"  → coverage_rates.csv")
    boot_ci.to_csv(csv_dir / "bootstrap_alignment_ci.csv", index=False)
    print(f"  → bootstrap_alignment_ci.csv")
    corr_ranks.to_csv(csv_dir / "bias_corrected_ranks.csv", index=False)
    print(f"  → bias_corrected_ranks.csv")
    corr_align.to_csv(csv_dir / "bias_corrected_alignment.csv", index=False)
    print(f"  → bias_corrected_alignment.csv")
    thr_ranks.to_csv(csv_dir / "threshold_sensitivity.csv", index=False)
    print(f"  → threshold_sensitivity.csv")
    thr_align.to_csv(csv_dir / "threshold_alignment.csv", index=False)
    print(f"  → threshold_alignment.csv")

    print(f"\nAnalisi completata. Output in: {out_dir}")


if __name__ == "__main__":
    main()
