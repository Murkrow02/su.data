"""Backfill Instagram post URLs into existing post JSONs.

Iterates a profile's Instagram posts (metadata only, no media download), matches
each post to a local JSON by caption, and writes the missing 'url' field.
Also updates the aggregated <profile>.json.

Useful when the scraper was run without URL support (pre-url era).

Usage (run with the content_scraping venv):
    python tools/utils/backfill_urls.py
    python tools/utils/backfill_urls.py matteosalviniofficial
    python tools/utils/backfill_urls.py matteosalviniofficial --start 2025-09-01 --end 2026-02-28
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

import instaloader
from dotenv import load_dotenv
from requests.cookies import RequestsCookieJar

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared import CONTENT_DIR, REPO_ROOT, select_profile  # noqa: E402

SCRAPER_DIR  = Path(__file__).resolve().parents[1] / "content_scraping"
SESSION_FILE = SCRAPER_DIR / "session.txt"

load_dotenv(REPO_ROOT / ".env")
load_dotenv(SCRAPER_DIR / ".env")


# --- Session (mirrors scraper.py logic, reads the same session file) ---

def _load_session(loader: instaloader.Instaloader) -> str | None:
    if not SESSION_FILE.exists():
        return None
    try:
        loader.load_session_from_file("_", str(SESSION_FILE))
        username = loader.test_login()
        if username:
            print(f"[SESSION] Sessione caricata: {username}")
            return username
        print("[SESSION] Sessione scaduta.")
    except Exception as e:
        print(f"[SESSION] Errore: {e}")
    return None


def _create_session_from_cookies(loader: instaloader.Instaloader) -> str:
    cookies = {
        "sessionid": os.getenv("SESSION_ID"),
        "csrftoken": os.getenv("CSRF_TOKEN"),
        "ds_user_id": os.getenv("DS_USER_ID"),
        "mid":        os.getenv("MID"),
    }
    if not all(cookies.values()):
        sys.exit(
            "[ERROR] Variabili mancanti nel .env: SESSION_ID, CSRF_TOKEN, DS_USER_ID, MID."
        )
    jar = RequestsCookieJar()
    for name, value in cookies.items():
        jar.set(name, value, domain=".instagram.com", path="/")
    loader.context._session.cookies.update(jar)
    username = loader.test_login()
    if not username:
        sys.exit("[ERROR] Login fallito — cookie nel .env non validi o scaduti.")
    loader.context.username = username
    loader.save_session_to_file(str(SESSION_FILE))
    print(f"[SESSION] Login riuscito: {username}")
    return username


def load_session(loader: instaloader.Instaloader) -> str:
    username = _load_session(loader)
    if username:
        return username
    print("[SESSION] Rigenero sessione dai cookie .env…")
    return _create_session_from_cookies(loader)


# --- Caption matching ---

def _normalize(text: str) -> str:
    return " ".join(text.strip().split())


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def find_match(
    ig_caption: str,
    candidates: list[dict],
    threshold: float = 0.92,
) -> dict | None:
    """Return the candidate whose caption best matches ig_caption."""
    norm_ig = _normalize(ig_caption)
    best, best_score = None, 0.0
    for c in candidates:
        score = _similarity(norm_ig, _normalize(c["caption"]))
        if score > best_score:
            best, best_score = c, score
    if best_score >= threshold:
        return best
    # exact prefix match as fallback (handles truncated captions)
    for c in candidates:
        norm_local = _normalize(c["caption"])
        if norm_ig.startswith(norm_local[:80]) or norm_local.startswith(norm_ig[:80]):
            return c
    return None


# --- Date range helpers ---

def parse_date(s: str, label: str):
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        sys.exit(f"[ERROR] Formato non valido per --{label}: '{s}'. Usa YYYY-MM-DD.")


# --- Main ---

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Backfill Instagram URLs into existing post JSONs.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("profile", nargs="?", default=None)
    p.add_argument("-s", "--start", default=None, help="Data inizio YYYY-MM-DD.")
    p.add_argument("-e", "--end",   default=None, help="Data fine YYYY-MM-DD.")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    target_profile = args.profile or select_profile(
        CONTENT_DIR,
        title="Scegli il profilo da aggiornare:",
        allow_new=False,
    )

    dataset_dir  = CONTENT_DIR / target_profile
    profile_json = dataset_dir / f"{target_profile}.json"

    if not dataset_dir.exists():
        sys.exit(f"[ERROR] Profilo non trovato: {dataset_dir}")

    # --- Load all local posts that still lack 'url' ---
    # Structure: { date_str: [ {folder_id, caption, json_path}, ... ] }
    local_by_date: dict[str, list[dict]] = {}
    for post_json in sorted(dataset_dir.glob("*/*.json")):
        if post_json.stem == target_profile:
            continue
        data = json.loads(post_json.read_text(encoding="utf-8"))
        if data.get("url"):
            continue  # already has url, skip
        date_str = post_json.stem[:10]  # YYYY-MM-DD
        local_by_date.setdefault(date_str, []).append({
            "folder_id": data["folder_id"],
            "caption":   data.get("caption", ""),
            "json_path": post_json,
        })

    if not any(local_by_date.values()):
        print("[INFO] Tutti i post hanno già il campo 'url'. Niente da fare.")
        return

    total_local = sum(len(v) for v in local_by_date.values())
    all_dates   = sorted(local_by_date)
    print(f"[INFO] Post locali senza url: {total_local}")
    print(f"[INFO] Intervallo locale:     {all_dates[0]} → {all_dates[-1]}\n")

    # Use provided dates or fall back to local range
    start_date = parse_date(args.start, "start") if args.start else datetime.strptime(all_dates[0],  "%Y-%m-%d").date()
    end_date   = parse_date(args.end,   "end")   if args.end   else datetime.strptime(all_dates[-1], "%Y-%m-%d").date()

    # --- Set up instaloader (metadata only, no download) ---
    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_comments=False,
        save_metadata=False,
        quiet=True,
        sleep=True,
    )
    load_session(loader)

    ig_profile = instaloader.Profile.from_username(loader.context, target_profile)
    print(f"[INFO] Post Instagram totali: {ig_profile.mediacount}")
    print(f"[INFO] Scansiono: {start_date} → {end_date}\n")

    matched     = 0
    unmatched   = []
    old_streak  = 0

    for post in ig_profile.get_posts():
        post_date = post.date_utc.date()

        if post_date > end_date:
            continue
        if post_date < start_date:
            old_streak += 1
            if old_streak >= 5:
                break
            continue
        old_streak = 0

        date_str   = str(post_date)
        candidates = local_by_date.get(date_str, [])
        if not candidates:
            continue  # day not in local data (already all matched or not scraped)

        ig_caption = post.caption or ""
        post_url   = f"https://www.instagram.com/p/{post.shortcode}/"

        match = find_match(ig_caption, candidates)

        if match is None:
            unmatched.append({"date": date_str, "url": post_url, "caption": ig_caption[:80]})
            print(f"[NOMATCH] {date_str}  {post_url}")
            time.sleep(1)
            continue

        # Write url to individual post JSON
        post_data = json.loads(match["json_path"].read_text(encoding="utf-8"))
        post_data["url"] = post_url
        # Re-order keys to put url after caption (cosmetic)
        ordered = {k: post_data[k] for k in ("folder_id",) if k in post_data}
        if "url" not in ordered:
            ordered["url"] = post_url
        for k, v in post_data.items():
            if k not in ordered:
                ordered[k] = v
        ordered["url"] = post_url  # ensure it's set

        match["json_path"].write_text(
            json.dumps(ordered, indent=4, ensure_ascii=False),
            encoding="utf-8",
        )

        # Remove from candidates so the same slot can't be matched twice
        local_by_date[date_str].remove(match)

        matched += 1
        print(f"[{matched:>3}] {date_str}  {match['folder_id']}  {post_url}")
        time.sleep(1)

    # --- Update aggregated profile JSON ---
    if profile_json.exists():
        posts = json.loads(profile_json.read_text(encoding="utf-8"))
        # Build lookup: folder_id -> url from individual JSONs
        url_by_folder: dict[str, str] = {}
        for post_json in dataset_dir.glob("*/*.json"):
            if post_json.stem == target_profile:
                continue
            d = json.loads(post_json.read_text(encoding="utf-8"))
            if d.get("url"):
                url_by_folder[d["folder_id"]] = d["url"]

        changed = 0
        for post in posts:
            if not post.get("url") and post["folder_id"] in url_by_folder:
                post["url"] = url_by_folder[post["folder_id"]]
                changed += 1

        if changed:
            profile_json.write_text(
                json.dumps(posts, indent=4, ensure_ascii=False),
                encoding="utf-8",
            )
            print(f"\n[DONE] Aggiornato {profile_json.name}: +{changed} url")

    print(f"\n[DONE] Matched: {matched}/{total_local}")
    if unmatched:
        print(f"[WARN] Non abbinati ({len(unmatched)}):")
        for u in unmatched:
            print(f"       {u['date']}  {u['url']}")
            print(f"       caption: {u['caption']!r}")


if __name__ == "__main__":
    main()
