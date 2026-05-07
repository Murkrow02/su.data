"""Remove media files from data/content, keeping only JSON metadata.

Deletes jpg, mp4, and webp files inside post folders so only the
JSON files needed for analysis remain on disk.

Usage:
    python tools/utils/clean_media.py
    python tools/utils/clean_media.py --dry-run
"""

import argparse
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parents[2] / "data" / "content"

MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".mp4", ".wav", ".webp", ".png", ".gif", ".mov"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete media files, keep JSON metadata.")
    parser.add_argument("--dry-run", action="store_true", help="Print files to delete without deleting them.")
    args = parser.parse_args()

    media_files = [
        f for f in CONTENT_DIR.rglob("*")
        if f.is_file() and f.suffix.lower() in MEDIA_EXTENSIONS
    ]

    if not media_files:
        print("No media files found.")
        return

    total_size = sum(f.stat().st_size for f in media_files)
    label = "[DRY RUN] " if args.dry_run else ""

    print(f"{label}Found {len(media_files)} media files ({total_size / 1_048_576:.1f} MB)\n")

    deleted = 0
    for f in sorted(media_files):
        rel = f.relative_to(CONTENT_DIR)
        size_kb = f.stat().st_size / 1024
        print(f"  {label}delete {rel} ({size_kb:.0f} KB)")
        if not args.dry_run:
            f.unlink()
            deleted += 1

    if args.dry_run:
        print(f"\n[DRY RUN] Would delete {len(media_files)} files ({total_size / 1_048_576:.1f} MB). Run without --dry-run to apply.")
    else:
        print(f"\nDeleted {deleted} files ({total_size / 1_048_576:.1f} MB freed).")


if __name__ == "__main__":
    main()
