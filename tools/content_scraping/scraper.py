"""Instagram Scraper.

Downloads media + caption metadata from a politician's Instagram profile
within a configurable date window. Stage 1 of the HDS pipeline.

Per-post output: data/content/<profile>/<YYYY-MM-DD_NNN>/
                   ├── <folder_id>_<n>.{jpg|png|webp|mp4}
                   └── info.json   {folder_id, caption, type}
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import instaloader
from dotenv import load_dotenv
from requests.cookies import RequestsCookieJar

# Make tools/shared importable regardless of CWD.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared import CONTENT_DIR, REPO_ROOT, select_profile  # noqa: E402

SCRIPT_DIR   = Path(__file__).resolve().parent

load_dotenv(REPO_ROOT / ".env")
load_dotenv(SCRIPT_DIR / ".env")
SESSION_FILE = SCRIPT_DIR / "session.txt"

MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".mp4", ".webp"}


# --- Session Management ---

def load_or_create_session(loader: instaloader.Instaloader) -> str:
    username = _try_load_session(loader)
    if username:
        return username
    print("[SESSION] session.txt non trovato o scaduto, rigenero dai cookie .env...")
    return _create_session_from_cookies(loader)


def _try_load_session(loader: instaloader.Instaloader) -> str | None:
    if not SESSION_FILE.exists():
        return None
    try:
        loader.load_session_from_file("_", str(SESSION_FILE))
        username = loader.test_login()
        if username:
            print(f"[SESSION] Sessione caricata. Login: {username}")
            return username
        print("[SESSION] Sessione scaduta.")
    except Exception as e:
        print(f"[SESSION] Errore caricamento sessione: {e}")
    return None


def _create_session_from_cookies(loader: instaloader.Instaloader) -> str:
    import os
    cookies = {
        "sessionid": os.getenv("SESSION_ID"),
        "csrftoken": os.getenv("CSRF_TOKEN"),
        "ds_user_id": os.getenv("DS_USER_ID"),
        "mid":       os.getenv("MID"),
    }
    if not all(cookies.values()):
        sys.exit(
            "[ERROR] Variabili mancanti nel .env. Servono: SESSION_ID, CSRF_TOKEN, "
            "DS_USER_ID, MID.\n        Recuperali da Chrome: F12 > Application > "
            "Cookies > instagram.com"
        )

    jar = RequestsCookieJar()
    for name, value in cookies.items():
        jar.set(name, value, domain=".instagram.com", path="/")
    loader.context._session.cookies.update(jar)

    username = loader.test_login()
    if not username:
        sys.exit("[ERROR] Login fallito. Cookie nel .env non validi o scaduti.")

    loader.context.username = username
    loader.save_session_to_file(str(SESSION_FILE))
    print(f"[SESSION] Login riuscito: {username} (sessione salvata in {SESSION_FILE})")
    return username


# --- Utility ---

def get_folder_id(base_path: Path, date_str: str) -> str:
    if not base_path.exists():
        return f"{date_str}_001"
    existing = [
        d for d in base_path.iterdir()
        if d.is_dir() and d.name.startswith(date_str) and not d.name.startswith("_temp")
    ]
    return f"{date_str}_{len(existing) + 1:03d}"


def rename_media_files(temp_folder: Path, final_folder: Path, folder_id: str) -> list[str]:
    media_files: list[str] = []
    counter = 1
    for path in sorted(temp_folder.iterdir()):
        if path.suffix.lower() in {".txt", ".json", ".xz"} or path.name.endswith(".json.xz"):
            path.unlink(missing_ok=True)
            continue
        if path.suffix.lower() in MEDIA_EXTS:
            new_name = f"{folder_id}_{counter}{path.suffix.lower()}"
            path.rename(final_folder / new_name)
            media_files.append(new_name)
            counter += 1
    return media_files


def parse_date(date_str: str, label: str) -> datetime.date:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        sys.exit(f"[ERROR] Formato data non valido per --{label}: '{date_str}'. Usa YYYY-MM-DD.")


# --- Main ---

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Instagram Scraper — scarica media e metadati da un profilo Instagram.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        epilog="""Esempi:
  python scraper.py                            # menu interattivo dei profili
  python scraper.py matteosalviniofficial
  python scraper.py matteosalviniofficial --start 2026-04-01
  python scraper.py matteosalviniofficial --start 2026-04-01 --end 2026-04-11
""",
    )
    p.add_argument("profile", nargs="?", default=None,
                   help="Username del profilo Instagram (se omesso → menu interattivo).")
    p.add_argument("-s", "--start", default=None,
                   help="Data inizio YYYY-MM-DD (default: 7 giorni fa).")
    p.add_argument("-e", "--end", default=None,
                   help="Data fine YYYY-MM-DD (default: oggi).")
    p.add_argument("--urls-only", action="store_true",
                   help="Salva solo URL e metadati (no download media). Utile con backfill_urls.py.")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    target_profile = args.profile or select_profile(
        CONTENT_DIR,
        title="Profili già scaricati (oppure inserisci un nuovo username):",
        allow_new=True,
    )

    today = datetime.now().date()

    if args.end:
        end_date = parse_date(args.end, "end")
    else:
        raw = input(f"Data fine   YYYY-MM-DD [default: {today}]: ").strip()
        end_date = parse_date(raw, "end") if raw else today

    if args.start:
        start_date = parse_date(args.start, "start")
    else:
        default_start = end_date - timedelta(days=7)
        raw = input(f"Data inizio YYYY-MM-DD [default: {default_start}]: ").strip()
        start_date = parse_date(raw, "start") if raw else default_start
    if start_date > end_date:
        sys.exit(f"[ERROR] Data inizio ({start_date}) successiva a data fine ({end_date}).")

    dataset_dir = CONTENT_DIR / target_profile
    dataset_dir.mkdir(parents=True, exist_ok=True)

    urls_only = args.urls_only

    print(f"[CONFIG] Profilo:    {target_profile}")
    print(f"[CONFIG] Intervallo: {start_date} → {end_date}")
    print(f"[CONFIG] Modalità:   {'solo URL' if urls_only else 'download completo'}")
    print(f"[CONFIG] Output:     {dataset_dir}\n")

    loader = instaloader.Instaloader(
        download_comments=False,
        save_metadata=False,
        dirname_pattern=str(dataset_dir / "_temp_{shortcode}"),
        filename_pattern="{shortcode}_{filename}",
        sleep=True,
        quiet=True,
        download_video_thumbnails=False,
    )
    load_or_create_session(loader)

    profile = instaloader.Profile.from_username(loader.context, target_profile)
    print(f"[INFO] Post totali sul profilo: {profile.mediacount}\n")
    action = "Raccolgo URL" if urls_only else "Scarico media"
    print(f"{action}: {target_profile} | intervallo ({start_date} → {end_date})")

    count       = 0
    old_streak  = 0

    for post in profile.get_posts():
        post_date = post.date_utc.date()
        post_url = f"https://www.instagram.com/p/{post.shortcode}/"
        if post_date > end_date:
            continue
        if post_date < start_date:
            old_streak += 1
            if old_streak >= 5:
                break
            continue
        old_streak = 0

        folder_id    = get_folder_id(dataset_dir, str(post_date))
        final_folder = dataset_dir / folder_id
        final_folder.mkdir(parents=True, exist_ok=True)

        info = {
            "folder_id": folder_id,
            "caption":   post.caption or "",
            "type":      "video" if post.is_video else "image",
            "url":       post_url,
        }

        if urls_only:
            (final_folder / "info.json").write_text(
                json.dumps(info, indent=4, ensure_ascii=False),
                encoding="utf-8",
            )
            count += 1
            print(f"[{count:>2}] {post_date}  {info['type']:<6}  {post_url}")
        else:
            temp_folder = dataset_dir / f"_temp_{post.shortcode}"
            status = "OK"
            try:
                loader.download_post(post, target_profile)
            except Exception as e:
                status = f"ERROR: {e}"

            if temp_folder.exists():
                rename_media_files(temp_folder, final_folder, folder_id)
                shutil.rmtree(temp_folder, ignore_errors=True)
                (final_folder / "info.json").write_text(
                    json.dumps(info, indent=4, ensure_ascii=False),
                    encoding="utf-8",
                )
                count += 1
                print(f"[{count:>2}] {post_date}  {info['type']:<6}  {status}")

        time.sleep(1 if urls_only else 3)

    print(f"\n[DONE] {count} post scaricati in {dataset_dir}")


if __name__ == "__main__":
    main()
