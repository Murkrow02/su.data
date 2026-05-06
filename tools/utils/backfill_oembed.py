"""Backfill oEmbed HTML into aggregated politician JSON files.

Reads each post's url field, calls Instagram's oEmbed endpoint (no auth needed),
and stores the returned html in the JSON. The dashboard injects it directly,
no runtime API call needed.

Usage:
    python tools/backfill_oembed.py
"""

import argparse
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parents[2] / "data" / "content"
OEMBED_URL  = "https://www.instagram.com/api/v1/oembed/"


RETRY_DELAYS = [4, 10]  # seconds to wait before each retry


def fetch_oembed_html(post_url: str) -> str | None:
    params = urllib.parse.urlencode({"url": post_url, "omitscript": "1"})
    url = f"{OEMBED_URL}?{params}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    for attempt, delay in enumerate([0] + RETRY_DELAYS):
        if delay:
            print(f"retry in {delay}s…", end=" ", flush=True)
            time.sleep(delay)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                return data.get("html", "")
        except urllib.error.HTTPError as e:
            if e.code == 401 and attempt < len(RETRY_DELAYS):
                continue
            print(f"[WARN] {post_url}: {e}")
            return None
        except Exception as e:
            print(f"[WARN] {post_url}: {e}")
            return None
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    args = parser.parse_args()

    profile_jsons = sorted(
        pj for pj in CONTENT_DIR.glob("*/*.json")
        if pj.stem == pj.parent.name
    )
    print(f"Profili trovati: {[pj.parent.name for pj in profile_jsons]}\n")

    for profile_json in profile_jsons:
        profile = profile_json.parent.name
        posts = json.loads(profile_json.read_text(encoding="utf-8"))
        todo = [p for p in posts if not p.get("oembed_html") and p.get("url")]
        print(f"[{profile}] {len(posts)} post totali, {len(todo)} da elaborare")

        if not todo:
            print(f"[{profile}] nothing to update\n")
            continue

        changed = 0
        for post in posts:
            if post.get("oembed_html") or not post.get("url"):
                continue
            print(f"  [{profile}] {post['folder_id']} …", end=" ", flush=True)
            html = fetch_oembed_html(post["url"])
            if html:
                post["oembed_html"] = html
                changed += 1
                print("OK")
            else:
                print("SKIP")
            time.sleep(1.5)

        if changed:
            profile_json.write_text(
                json.dumps(posts, indent=4, ensure_ascii=False), encoding="utf-8"
            )
        print(f"[{profile}] saved {changed}/{len(todo)} embeds\n")


if __name__ == "__main__":
    main()
