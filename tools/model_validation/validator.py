#!/usr/bin/env python3
"""Statistical validation of LLM annotations vs human-averaged annotations.

Stage 4 (optional) of the HDS pipeline. For each LLM model, compares its
per-post scores to the average of N human annotators on the same posts and
generates a single Markdown report with tables and plots.

Input  : data/model_validation/politicians/<politician>/{human_avg.csv, <model>.csv}
Output : data/model_validation/results/{results.md, plots/*.png}
"""

import argparse
import os
import sys
import warnings
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import spearmanr, wilcoxon
from sklearn.metrics import cohen_kappa_score, mean_absolute_error

# Make tools/shared importable regardless of CWD.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared import MODEL_VALIDATION_DIR, TOPIC_KEYS, TOPIC_LABELS_DICT  # noqa: E402
from shared.prompts import select_models  # noqa: E402

warnings.filterwarnings("ignore", category=RuntimeWarning)

INPUT_DIR    = MODEL_VALIDATION_DIR / "politicians"
RESULTS_DIR  = MODEL_VALIDATION_DIR / "results"
PLOTS_DIR    = RESULTS_DIR / "plots"

TOPICS       = TOPIC_KEYS
TOPIC_LABELS = TOPIC_LABELS_DICT


def get_politicians() -> list[str]:
    if not INPUT_DIR.exists():
        return []
    return sorted(d.name for d in INPUT_DIR.iterdir()
                  if d.is_dir() and not d.name.startswith("."))


# --- Krippendorff's Alpha (ordinal) ---
def krippendorff_alpha_ordinal(col_human, col_llm):
    values = sorted(set(col_human) | set(col_llm))
    n = len(col_human)
    if n < 2:
        return float("nan")
    Do = sum((h - l) ** 2 for h, l in zip(col_human, col_llm)) / n
    all_vals = list(col_human) + list(col_llm)
    total = len(all_vals)
    De = sum((all_vals[i] - all_vals[j]) ** 2
             for i in range(total) for j in range(i + 1, total))
    De = De / (total * (total - 1) / 2)
    if De == 0:
        return 1.0
    return 1.0 - Do / De


# --- Data Loading ---
def load_pair(politician: str, model: str):
    human_path = INPUT_DIR / politician / "human_avg.csv"
    model_path = INPUT_DIR / politician / f"{model}.csv"
    if not human_path.exists() or not model_path.exists():
        return None
    human_df = pd.read_csv(human_path)
    model_df = pd.read_csv(model_path)
    merged = human_df.merge(model_df, on="folder_id", suffixes=("_human", "_llm"))
    topic_cols = [f"{t}_human" for t in TOPICS] + [f"{t}_llm" for t in TOPICS]
    existing_cols = [c for c in topic_cols if c in merged.columns]
    merged = merged.dropna(subset=existing_cols)
    return merged


# --- Metrics ---
def compute_metrics(human_vals, llm_vals):
    results = {}
    n = len(human_vals)
    if n == 0:
        return {k: float("nan") for k in [
            "n", "kappa", "spearman", "sp_p", "mae",
            "wilc_stat", "wilc_p", "kripp_alpha", "bias"]}

    results["n"] = n
    h_round = np.round(human_vals).astype(int)
    l_round = np.round(llm_vals).astype(int)
    try:
        results["kappa"] = cohen_kappa_score(h_round, l_round, weights="quadratic")
    except Exception:
        results["kappa"] = float("nan")

    if np.std(human_vals) == 0 and np.std(llm_vals) == 0:
        results["spearman"], results["sp_p"] = 1.0, 0.0
    elif np.std(human_vals) == 0 or np.std(llm_vals) == 0:
        results["spearman"], results["sp_p"] = float("nan"), float("nan")
    else:
        rho, pval = spearmanr(human_vals, llm_vals)
        results["spearman"], results["sp_p"] = rho, pval

    results["mae"] = mean_absolute_error(human_vals, llm_vals)

    diffs = llm_vals - human_vals
    nonzero = diffs[diffs != 0]
    if len(nonzero) < 2:
        results["wilc_stat"], results["wilc_p"] = float("nan"), float("nan")
    else:
        try:
            stat, pval = wilcoxon(nonzero)
            results["wilc_stat"], results["wilc_p"] = stat, pval
        except Exception:
            results["wilc_stat"], results["wilc_p"] = float("nan"), float("nan")

    results["kripp_alpha"] = krippendorff_alpha_ordinal(
        human_vals.tolist(), llm_vals.tolist())
    results["bias"] = float(np.mean(diffs))
    return results


def compute_per_topic(merged_df):
    rows = []
    for topic in TOPICS:
        hcol, lcol = f"{topic}_human", f"{topic}_llm"
        if hcol not in merged_df.columns or lcol not in merged_df.columns:
            continue
        h = merged_df[hcol].values.astype(float)
        l = merged_df[lcol].values.astype(float)
        rows.append({
            "topic": topic,
            "label": TOPIC_LABELS[topic],
            "mae": round(float(np.mean(np.abs(l - h))), 4),
            "bias": round(float(np.mean(l - h)), 4),
            "n": len(h),
        })
    return rows


# --- Plotting ---
def plot_mae_per_model(summary, out_path):
    models = [s["model"] for s in summary]
    maes = [s["mae"] for s in summary]
    fig, ax = plt.subplots(figsize=(8, 5))
    colors = plt.cm.Set2(np.linspace(0, 1, len(models)))
    bars = ax.bar(models, maes, color=colors, edgecolor="black", linewidth=0.5)
    for bar, v in zip(bars, maes):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02,
                f"{v:.3f}", ha="center", va="bottom", fontsize=11)
    ax.set_ylabel("Mean Absolute Error")
    ax.set_title("MAE per Modello")
    ax.set_ylim(0, max(maes) * 1.3 if max(maes) > 0 else 1)
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def plot_kappa_per_model(summary, out_path):
    models = [s["model"] for s in summary]
    kappas = [s["kappa"] for s in summary]
    fig, ax = plt.subplots(figsize=(8, 5))
    colors = plt.cm.Set2(np.linspace(0, 1, len(models)))
    bars = ax.bar(models, kappas, color=colors, edgecolor="black", linewidth=0.5)
    for bar, v in zip(bars, kappas):
        if not np.isnan(v):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02,
                    f"{v:.3f}", ha="center", va="bottom", fontsize=11)
    ax.set_ylabel("Cohen's Weighted Kappa")
    ax.set_title("Agreement per Modello")
    ax.axhline(y=0.6, color="gray", linestyle="--", alpha=0.5, label="Soglia moderata")
    ax.legend()
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def plot_heatmap(all_topics, out_path):
    if not all_topics:
        return
    df = pd.DataFrame(all_topics)
    # Aggregate across politicians
    df = df.groupby(["model", "topic"]).agg({"mae": "mean"}).reset_index()
    pivot = df.pivot_table(index="topic", columns="model", values="mae")
    pivot = pivot.reindex(TOPICS)
    labels = [TOPIC_LABELS.get(t, t) for t in pivot.index]

    fig, ax = plt.subplots(figsize=(max(8, len(pivot.columns) * 3), 8))
    im = ax.imshow(pivot.values, cmap="YlOrRd", aspect="auto")
    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels(pivot.columns, fontsize=11)
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(labels, fontsize=10)
    for i in range(len(pivot.index)):
        for j in range(len(pivot.columns)):
            val = pivot.values[i, j]
            if not np.isnan(val):
                thresh = pivot.values[~np.isnan(pivot.values)].max() * 0.6
                ax.text(j, i, f"{val:.2f}", ha="center", va="center", fontsize=10,
                        color="white" if val > thresh else "black")
    plt.colorbar(im, ax=ax, label="MAE")
    ax.set_title("MAE per Topic × Modello")
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def plot_bias(all_topics, out_path):
    if not all_topics:
        return
    df = pd.DataFrame(all_topics)
    # Aggregate across politicians
    df = df.groupby(["model", "topic"]).agg({"bias": "mean"}).reset_index()
    models = df["model"].unique()
    fig, ax = plt.subplots(figsize=(14, 6))
    x = np.arange(len(TOPICS))
    width = 0.8 / len(models)
    colors = plt.cm.Set2(np.linspace(0, 1, len(models)))
    for i, model in enumerate(models):
        mdf = df[df["model"] == model].set_index("topic").reindex(TOPICS)
        ax.bar(x + i * width, mdf["bias"].values, width, label=model,
               color=colors[i], edgecolor="black", linewidth=0.3)
    ax.set_xticks(x + width * (len(models) - 1) / 2)
    ax.set_xticklabels([TOPIC_LABELS[t] for t in TOPICS], fontsize=8, rotation=30, ha="right")
    ax.set_ylabel("Bias (positivo = LLM sovrastima)")
    ax.set_title("Bias per Topic per Modello")
    ax.axhline(y=0, color="black", linewidth=0.8)
    ax.legend()
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


# --- Markdown Report ---
def interpret_kappa(k):
    if np.isnan(k): return "N/A"
    if k < 0.20: return "Scarso"
    if k < 0.40: return "Discreto"
    if k < 0.60: return "Moderato"
    if k < 0.80: return "Buono"
    return "Eccellente"


def fmt(v, decimals=3):
    if isinstance(v, float) and np.isnan(v):
        return "N/A"
    return f"{v:.{decimals}f}"


def generate_report(models, politicians, global_summary, per_pol_data, all_topics):
    lines = []
    a = lines.append

    a("# Risultati Validazione LLM vs Annotazioni Umane\n")
    a(f"> Report generato il {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
    a(f"**Modelli confrontati**: {', '.join(m.upper() for m in models)}  ")
    a(f"**Politici analizzati**: {', '.join(politicians)}  ")
    a(f"**Scala di valutazione**: 1-5 (1=non rilevante, 5=molto rilevante)  ")
    a(f"**Topic valutati**: {len(TOPICS)}  ")
    a("")

    # --- Metodologia ---
    a("## Metodologia\n")
    a("Ogni modello LLM è stato confrontato con la media (arrotondata per difetto) "
      "delle annotazioni di 4 annotatori umani su 10 post per 3 politici (30 post totali, "
      "10 topic ciascuno).\n")
    a("### Metriche utilizzate\n")
    a("| Metrica | Descrizione |")
    a("|---------|-------------|")
    a("| **Cohen's Weighted Kappa (κ)** | Accordo tra rater, corretto per il caso. "
      "Pesi quadratici. κ<0.20=scarso, 0.20-0.40=discreto, 0.40-0.60=moderato, "
      "0.60-0.80=buono, >0.80=eccellente |")
    a("| **Spearman's ρ** | Correlazione ordinale tra voti umani e LLM |")
    a("| **MAE** | Errore medio assoluto (in punti sulla scala 1-5) |")
    a("| **Wilcoxon Signed-Rank** | Test non parametrico per bias sistematico "
      "(p<0.05 = bias significativo) |")
    a("| **Krippendorff's α** | Reliability inter-rater per dati ordinali |")
    a("")

    # --- Classifica ---
    a("---\n")
    a("## 🏆 Classifica Modelli\n")
    ranked = sorted(global_summary, key=lambda x: x["mae"])
    medals = ["🥇", "🥈", "🥉"]
    a("| # | Modello | MAE | Kappa (κ) | Livello | Spearman ρ | Krippendorff α | Bias |")
    a("|---|---------|-----|-----------|---------|------------|----------------|------|")
    for i, s in enumerate(ranked):
        medal = medals[i] if i < 3 else f"{i+1}"
        sig = " ⚠️" if (not np.isnan(s["wilc_p"]) and s["wilc_p"] < 0.05) else ""
        a(f"| {medal} | **{s['model'].upper()}** | {fmt(s['mae'])} | "
          f"{fmt(s['kappa'])} | {interpret_kappa(s['kappa'])} | "
          f"{fmt(s['spearman'])} | {fmt(s['kripp_alpha'])} | "
          f"{fmt(s['bias'], 3)}{sig} |")
    a("")

    # Best model commentary
    best = ranked[0]
    a(f"> Il modello più accurato è **{best['model'].upper()}** con un MAE di "
      f"**{fmt(best['mae'])}** e un Kappa di **{fmt(best['kappa'])}** "
      f"({interpret_kappa(best['kappa'])}).\n")

    # --- Grafici globali ---
    a("---\n")
    a("## Grafici\n")
    a("### MAE per Modello\n")
    a("![MAE per modello](plots/mae_per_model.png)\n")
    a("### Agreement (Kappa) per Modello\n")
    a("![Kappa per modello](plots/kappa_per_model.png)\n")
    a("### Heatmap MAE per Topic × Modello\n")
    a("![Heatmap](plots/heatmap_topic_model.png)\n")
    a("### Bias per Topic\n")
    a("![Bias per topic](plots/bias_per_topic.png)\n")

    # --- Dettaglio per politico ---
    a("---\n")
    a("## Dettaglio per Politico\n")
    for politician in politicians:
        a(f"### {politician}\n")
        pol_data = [d for d in per_pol_data if d["politician"] == politician]
        if not pol_data:
            a("_Nessun dato disponibile._\n")
            continue
        a("| Modello | N | MAE | Kappa | Spearman ρ | Wilcoxon p | Bias |")
        a("|---------|---|-----|-------|------------|------------|------|")
        for d in sorted(pol_data, key=lambda x: x["mae"]):
            sig = " ⚠️" if (not np.isnan(d["wilc_p"]) and d["wilc_p"] < 0.05) else ""
            a(f"| {d['model'].upper()} | {d['n']:.0f} | {fmt(d['mae'])} | "
              f"{fmt(d['kappa'])} ({interpret_kappa(d['kappa'])}) | "
              f"{fmt(d['spearman'])} | {fmt(d['wilc_p'], 4)}{sig} | "
              f"{fmt(d['bias'], 3)} |")
        a("")

    # --- Analisi per topic ---
    a("---\n")
    a("## Analisi per Topic\n")
    if all_topics:
        topic_df = pd.DataFrame(all_topics)
        for model in models:
            mdf = topic_df[topic_df["model"] == model].set_index("topic").reindex(TOPICS)
            a(f"### {model.upper()}\n")
            a("| Topic | MAE | Bias | Interpretazione |")
            a("|-------|-----|------|-----------------|")
            for topic in TOPICS:
                if topic in mdf.index:
                    row = mdf.loc[topic]
                    mae_val = row["mae"]
                    bias_val = row["bias"]
                    if mae_val < 0.2:
                        interp = "✅ Ottimo"
                    elif mae_val < 0.5:
                        interp = "🟡 Accettabile"
                    else:
                        interp = "🔴 Critico"
                    bias_dir = "sovrastima" if bias_val > 0.05 else ("sottostima" if bias_val < -0.05 else "neutro")
                    a(f"| {TOPIC_LABELS[topic]} | {fmt(mae_val)} | "
                      f"{fmt(bias_val, 3)} ({bias_dir}) | {interp} |")
            a("")

    return "\n".join(lines)


# --- Main ---
def run_validation(models: list[str]):
    politicians = get_politicians()
    print(f"\n{'='*60}")
    print(f"  LLM vs Human Annotation Validation")
    print(f"  Politicians: {politicians}")
    print(f"  Models: {models}")
    print(f"{'='*60}\n")

    global_summary = []
    per_pol_data = []
    all_topic_data = []

    for model in models:
        print(f"  Analisi: {model.upper()}...", end=" ")
        all_human, all_llm = [], []

        for politician in politicians:
            merged = load_pair(politician, model)
            if merged is None or len(merged) == 0:
                continue

            h_vals, l_vals = [], []
            for topic in TOPICS:
                hcol, lcol = f"{topic}_human", f"{topic}_llm"
                if hcol in merged.columns and lcol in merged.columns:
                    h_vals.extend(merged[hcol].values)
                    l_vals.extend(merged[lcol].values)

            h_arr = np.array(h_vals, dtype=float)
            l_arr = np.array(l_vals, dtype=float)
            all_human.extend(h_vals)
            all_llm.extend(l_vals)

            pol_metrics = compute_metrics(h_arr, l_arr)
            pol_metrics["politician"] = politician
            pol_metrics["model"] = model
            per_pol_data.append(pol_metrics)

        if not all_human:
            print("❌ nessun dato")
            continue

        h_global = np.array(all_human, dtype=float)
        l_global = np.array(all_llm, dtype=float)
        gm = compute_metrics(h_global, l_global)
        gm["model"] = model
        global_summary.append(gm)

        # Per-topic globale
        for politician in politicians:
            merged = load_pair(politician, model)
            if merged is None:
                continue
            for row in compute_per_topic(merged):
                row["model"] = model
                all_topic_data.append(row)

        print(f"✅ Kappa={fmt(gm['kappa'])} MAE={fmt(gm['mae'])}")

    if not global_summary:
        print("\n❌ Nessun dato da analizzare.")
        return

    # --- Plots ---
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)

    plot_mae_per_model(global_summary, str(PLOTS_DIR / "mae_per_model.png"))
    plot_kappa_per_model(global_summary, str(PLOTS_DIR / "kappa_per_model.png"))
    plot_heatmap(all_topic_data, str(PLOTS_DIR / "heatmap_topic_model.png"))
    plot_bias(all_topic_data, str(PLOTS_DIR / "bias_per_topic.png"))

    # --- Aggregate topic data per model (for report) ---
    agg_topics = []
    topic_df = pd.DataFrame(all_topic_data)
    for model in models:
        for topic in TOPICS:
            subset = topic_df[(topic_df["model"] == model) & (topic_df["topic"] == topic)]
            if len(subset) > 0:
                agg_topics.append({
                    "topic": topic,
                    "label": TOPIC_LABELS[topic],
                    "model": model,
                    "mae": round(float(subset["mae"].mean()), 4),
                    "bias": round(float(subset["bias"].mean()), 4),
                })

    # --- Generate report ---
    report = generate_report(models, politicians, global_summary, per_pol_data, agg_topics)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = RESULTS_DIR / "results.md"
    report_path.write_text(report, encoding="utf-8")

    print(f"\n[OK] Report:  {report_path}")
    print(f"[OK] Grafici: {PLOTS_DIR}/")


def main():
    parser = argparse.ArgumentParser(
        description="Validate LLM annotations vs human averages",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        epilog="""Esempi:
  python validator.py                              # menu interattivo dei modelli
  python validator.py --models gemma4
  python validator.py --models gemma4 qwen mistral
""",
    )
    parser.add_argument("--models", nargs="+", default=None,
                        help="Modelli da validare (default: menu interattivo).")
    args = parser.parse_args()
    models = args.models or select_models(INPUT_DIR)
    run_validation(models)


if __name__ == "__main__":
    main()
