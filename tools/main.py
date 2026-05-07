"""HDS pipeline wizard.

Interactive driver that orchestrates the five HDS pipeline stages:
  1. Scrape Instagram         (tools/content_scraping/scraper.py)
  2. Transcribe media         (tools/text_transcriber/transcriber.py)
  3. Score posts (LLM)        (tools/scorer/scorer.py)
  4. Validate models          (tools/model_validation/validator.py)   [optional]
  5. Analyze results          (tools/results_analyzer/analyzer.py)

Each tool keeps its own venv. The wizard invokes the right Python binary,
streams output live, and shows a status table after every stage.

Stdlib only — runnable as `python tools/main.py` from anywhere.
"""

from __future__ import annotations

import csv
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

REPO_ROOT    = Path(__file__).resolve().parent.parent
TOOLS_DIR    = REPO_ROOT / "tools"
CONTENT_DIR  = REPO_ROOT / "data" / "content"
SCORES_DIR   = REPO_ROOT / "data" / "scores"
RESULTS_DIR  = REPO_ROOT / "data" / "results"


@dataclass
class Stage:
    key:        str
    title:      str
    tool:       str           # subfolder under tools/
    script:     str           # script filename
    needs_prof: bool = True   # whether wizard prompts for profile(s)
    internal:   bool = False  # hidden from menu, skipped in full pipeline


STAGES: list[Stage] = [
    Stage("1", "Scrape Instagram",         "content_scraping",   "scraper.py",      needs_prof=True),
    Stage("2", "Transcribe media",         "text_transcriber",   "transcriber.py",  needs_prof=True),
    Stage("3", "Score posts (LLM)",        "scorer",             "scorer.py",       needs_prof=True),
    Stage("4", "Validate models",          "model_validation",   "validator.py",    needs_prof=False, internal=True),
    Stage("5", "Analyze results & plots",  "results_analyzer",   "analyzer.py",     needs_prof=False),
]


# --- Venv resolution ---

def venv_python(tool: str) -> Path:
    base = TOOLS_DIR / tool / "venv"
    if os.name == "nt":
        candidate = base / "Scripts" / "python.exe"
    else:
        candidate = base / "bin" / "python"
    if not candidate.exists():
        sys.exit(
            f"[ERROR] venv non trovato per il tool '{tool}'.\n"
            f"        Crealo con: python -m venv {base}\n"
            f"        e installa: pip install -r {TOOLS_DIR / tool / 'requirements.txt'}"
        )
    return candidate


# --- Status discovery ---

def discover_profiles() -> list[str]:
    if not CONTENT_DIR.exists():
        return []
    return sorted(d.name for d in CONTENT_DIR.iterdir()
                  if d.is_dir() and not d.name.startswith((".", "_")))


def _date_bounds(dates: list[str]) -> tuple[str, str]:
    if not dates:
        return ("", "")
    return (min(dates), max(dates))


def _scrape_bounds(prof_dir: Path) -> tuple[str, str]:
    dates = [
        d.name[:10] for d in prof_dir.iterdir()
        if d.is_dir() and not d.name.startswith((".", "_")) and len(d.name) >= 10
    ]
    return _date_bounds(dates)


def _transcribe_bounds(prof_dir: Path, prof: str) -> tuple[str, str]:
    json_path = prof_dir / f"{prof}.json"
    if not json_path.exists():
        return ("", "")
    try:
        posts = json.loads(json_path.read_text(encoding="utf-8"))
        dates = [p["folder_id"][:10] for p in posts if len(p.get("folder_id", "")) >= 10]
        return _date_bounds(dates)
    except Exception:
        return ("", "")


def _score_bounds(prof: str) -> tuple[str, str]:
    csv_path = SCORES_DIR / f"{prof}.csv"
    if not csv_path.exists():
        return ("", "")
    try:
        with csv_path.open(encoding="utf-8") as f:
            dates = [
                row["folder_id"][:10]
                for row in csv.DictReader(f)
                if len(row.get("folder_id", "")) >= 10
            ]
        return _date_bounds(dates)
    except Exception:
        return ("", "")


def status_table() -> str:
    profs = discover_profiles()
    if not profs:
        return "  (nessun profilo ancora scrapato in data/content/)\n"

    # Collect per-profile data
    Profile = tuple[str, bool, bool, bool, bool, tuple, tuple, tuple]
    data: list[Profile] = []
    for prof in profs:
        prof_dir    = CONTENT_DIR / prof
        scraped     = any(d.is_dir() and not d.name.startswith("_") for d in prof_dir.iterdir())
        transcribed = (prof_dir / f"{prof}.json").exists()
        scored      = (SCORES_DIR / f"{prof}.csv").exists()
        analyzed    = (RESULTS_DIR / "csv" / "rankings.csv").exists() and scored
        data.append((
            prof, scraped, transcribed, scored, analyzed,
            _scrape_bounds(prof_dir) if scraped else ("", ""),
            _transcribe_bounds(prof_dir, prof) if transcribed else ("", ""),
            _score_bounds(prof) if scored else ("", ""),
        ))

    # Build rows: header + for each profile: tick row, start row, end row
    DATE_W = 10  # len("YYYY-MM-DD")
    header = ("Profilo", "Scrape", "Transcribe", "Score", "Analyze")
    all_rows = [header]
    for prof, sc, tr, sk, an, sc_b, tr_b, sk_b in data:
        all_rows.append((prof, "✓" if sc else "·", "✓" if tr else "·", "✓" if sk else "·", "✓" if an else "·"))
        all_rows.append(("", sc_b[0], tr_b[0], sk_b[0], ""))
        all_rows.append(("", sc_b[1], tr_b[1], sk_b[1], ""))

    widths = [max(len(r[c]) for r in all_rows) for c in range(5)]

    out = []
    prof_idx = 0
    for i, row in enumerate(all_rows):
        if i == 0:
            out.append("  " + "  ".join(cell.ljust(widths[c]) for c, cell in enumerate(row)))
            out.append("  " + "  ".join("-" * widths[c] for c in range(5)))
        else:
            block = (i - 1) % 3  # 0=tick, 1=start, 2=end
            if block == 0 and i > 1:
                out.append("")  # blank line between profiles
            out.append("  " + "  ".join(cell.ljust(widths[c]) for c, cell in enumerate(row)))

    return "\n".join(out) + "\n"


# --- Subprocess runner ---

def run_stage(stage: Stage, extra_args: Sequence[str] = ()) -> int:
    py     = venv_python(stage.tool)
    script = TOOLS_DIR / stage.tool / stage.script
    cmd    = [str(py), str(script), *extra_args]
    print(f"\n>>> {stage.title}")
    print(f"    $ {' '.join(cmd)}\n")
    return subprocess.run(cmd, cwd=REPO_ROOT).returncode


# --- Prompting ---

def prompt_profile(stage: Stage, allow_new: bool) -> list[str]:
    """Return list of profiles to process for `stage`, possibly empty (= use tool default)."""
    profs = discover_profiles()
    if not profs and not allow_new:
        print("  Nessun profilo trovato. Esegui prima lo scraping.")
        return []

    print(f"\n  Profili disponibili per '{stage.title}':")
    for i, p in enumerate(profs, 1):
        print(f"    [{i}] {p}")
    extras = []
    if allow_new:
        extras.append(f"    [N] Nuovo profilo (inserisci username)")
    extras.append("    [↵] Default del tool (interattivo)")
    extras.append("    [*] Tutti i profili")
    print("\n".join(extras))

    raw = input("  Scelta: ").strip()
    if not raw:
        return []
    if raw == "*":
        return profs
    if allow_new and raw.lower() == "n":
        new = input("  Username: ").strip()
        return [new] if new else []
    tokens = [t for t in raw.replace(",", " ").split() if t]
    try:
        picks = [profs[int(t) - 1] for t in tokens]
    except (ValueError, IndexError):
        print("  Input non valido — uso default del tool.")
        return []
    return picks


def prompt_stage() -> Stage | str | None:
    print("\nQuale stage vuoi eseguire?")
    for s in STAGES:
        if not s.internal:
            print(f"  [{s.key}] {s.title}")
    print("  [A] Pipeline completa (1 → 2 → 3 → 5) per uno o più profili")
    print("  [Q] Esci")
    raw = input("Scelta: ").strip().lower()
    if raw in {"q", "quit", "exit"}:
        return None
    if raw == "a":
        return "all"
    for s in STAGES:
        if s.key == raw and not s.internal:
            return s
    print("  Input non valido.")
    return prompt_stage()


# --- Main loop ---

def banner() -> None:
    print("=" * 64)
    print("  HDS Pipeline Wizard")
    print("  Semantic Gap: Italian Youth ⇄ Political Leaders' Instagram")
    print("=" * 64)


def show_status() -> None:
    print("\nStato del dataset:")
    print(status_table())


def run_full_pipeline_for(profile: str) -> None:
    """Run stages 1→2→3→5 sequentially for a single profile."""
    for s in STAGES:
        if s.internal:
            continue
        if s.needs_prof:
            args = [profile] if s.key in {"1", "2"} else ["-i", str(CONTENT_DIR / profile / f"{profile}.json")]
        else:
            args = ["--profiles", profile] if s.key == "5" else []
        rc = run_stage(s, args)
        if rc != 0:
            print(f"[ABORT] Stage '{s.title}' uscito con codice {rc}.")
            return
    print(f"\n[DONE] Pipeline completata per {profile}.")


def main() -> None:
    banner()
    while True:
        show_status()
        choice = prompt_stage()
        if choice is None:
            print("Bye.")
            return

        if choice == "all":
            profs = prompt_profile(STAGES[0], allow_new=True)
            if not profs:
                continue
            for p in profs:
                run_full_pipeline_for(p)
            continue

        stage: Stage = choice
        extra: list[str] = []
        if stage.needs_prof:
            allow_new = stage.key == "1"
            picks = prompt_profile(stage, allow_new=allow_new)
            if len(picks) == 1:
                if stage.key == "3":
                    p = picks[0]
                    extra = ["-i", str(CONTENT_DIR / p / f"{p}.json")]
                else:
                    extra = [picks[0]]
            elif len(picks) > 1:
                # loop the stage on each picked profile
                for p in picks:
                    one_extra = ["-i", str(CONTENT_DIR / p / f"{p}.json")] if stage.key == "3" else [p]
                    rc = run_stage(stage, one_extra)
                    if rc != 0:
                        print(f"[ABORT] {p}: stage uscito con codice {rc}.")
                        break
                continue
            # else: no picks → fall through, tool will prompt itself
        run_stage(stage, extra)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[INTERRUPTED]")
