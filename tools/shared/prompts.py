"""Interactive selection helpers shared across HDS tools.

When a script needs a profile / model / generic choice and the user has
not provided it via CLI, these helpers list what is available on disk
and prompt via stdin. Empty input picks the first option; `*` picks all.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable, Sequence


def _print_menu(title: str, options: Sequence[str]) -> None:
    print(f"\n{title}")
    for i, opt in enumerate(options, start=1):
        print(f"  [{i}] {opt}")


def select_one(options: Sequence[str], title: str = "Scegli un'opzione:",
               default_idx: int = 0) -> str:
    """Prompt for exactly one selection from `options`. Returns the chosen string."""
    if not options:
        sys.exit("[ERROR] Nessuna opzione disponibile.")
    if len(options) == 1:
        print(f"{title} → {options[0]} (unica opzione)")
        return options[0]
    _print_menu(title, options)
    while True:
        raw = input(f"Scelta [1-{len(options)}, default {default_idx + 1}]: ").strip()
        if not raw:
            return options[default_idx]
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return options[int(raw) - 1]
        print(f"  Input non valido: '{raw}'. Riprova.")


def select_many(options: Sequence[str], title: str = "Seleziona una o più opzioni:",
                allow_all: bool = True) -> list[str]:
    """Prompt for multiple selections (comma/space separated indices). `*` selects all."""
    if not options:
        sys.exit("[ERROR] Nessuna opzione disponibile.")
    if len(options) == 1:
        print(f"{title} → {options[0]} (unica opzione)")
        return [options[0]]
    _print_menu(title, options)
    hint = " (separa con spazio o virgola; `*` = tutti)" if allow_all else " (separa con spazio o virgola)"
    while True:
        raw = input(f"Scelta{hint}: ").strip()
        if not raw:
            print("  Inserisci almeno un indice.")
            continue
        if allow_all and raw == "*":
            return list(options)
        tokens = [t for t in raw.replace(",", " ").split() if t]
        try:
            picks = sorted({int(t) for t in tokens})
        except ValueError:
            print(f"  Input non valido: '{raw}'. Riprova.")
            continue
        if any(p < 1 or p > len(options) for p in picks):
            print(f"  Indici fuori range. Usa 1-{len(options)}.")
            continue
        return [options[p - 1] for p in picks]


def _list_subdirs(folder: Path) -> list[str]:
    if not folder.exists():
        return []
    return sorted(
        d.name for d in folder.iterdir()
        if d.is_dir() and not d.name.startswith((".", "_"))
    )


def _list_csv_stems(folder: Path) -> list[str]:
    if not folder.exists():
        return []
    return sorted(p.stem for p in folder.glob("*.csv"))


def select_profile(folder: Path, kind: str = "subdirs",
                   title: str = "Seleziona un profilo:",
                   allow_new: bool = False, multi: bool = False
                   ) -> str | list[str]:
    """List profiles found under `folder` and prompt the user.

    `kind`:
      - "subdirs" → folder names (used by scraper / transcriber / scorer input)
      - "csv"     → *.csv stems (used by analyzer / scorer output discovery)

    If `allow_new` is true, the user can type a brand-new name not in the list.
    If `multi` is true, returns a list of selections; otherwise a single string.
    """
    options = _list_subdirs(folder) if kind == "subdirs" else _list_csv_stems(folder)

    if multi:
        if not options:
            sys.exit(f"[ERROR] Nessun profilo trovato in {folder}.")
        return select_many(options, title=title, allow_all=True)

    if allow_new:
        if options:
            _print_menu(title, options + ["Nuovo profilo (inserisci username)"])
            while True:
                raw = input(f"Scelta [1-{len(options) + 1}]: ").strip()
                if raw.isdigit():
                    n = int(raw)
                    if 1 <= n <= len(options):
                        return options[n - 1]
                    if n == len(options) + 1:
                        new = input("Username Instagram: ").strip()
                        if new:
                            return new
                print("  Input non valido. Riprova.")
        else:
            new = input("Nessun profilo esistente. Username Instagram: ").strip()
            if not new:
                sys.exit("[ERROR] Nessun profilo specificato.")
            return new

    if not options:
        sys.exit(f"[ERROR] Nessun profilo trovato in {folder}.")
    return select_one(options, title=title)


def select_models(folder: Path, exclude: Iterable[str] = ("human_avg",)) -> list[str]:
    """Discover model names from CSV filenames inside any subfolder of `folder`."""
    if not folder.exists():
        sys.exit(f"[ERROR] Cartella non trovata: {folder}")
    excl = set(exclude)
    found: set[str] = set()
    for politician_dir in folder.iterdir():
        if not politician_dir.is_dir():
            continue
        for csv in politician_dir.glob("*.csv"):
            if csv.stem not in excl:
                found.add(csv.stem)
    options = sorted(found)
    if not options:
        sys.exit(f"[ERROR] Nessun CSV modello trovato in {folder}/*/")
    return select_many(options, title="Seleziona i modelli da validare:", allow_all=True)
