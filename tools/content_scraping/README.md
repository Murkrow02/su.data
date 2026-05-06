# 1. Content Scraping — Instagram Scraper

> **Stage 1 of the HDS pipeline.** Downloads the politicians' Instagram posts (media + caption + minimal metadata) within a configurable date window.

---

## 1. What it produces

For each tracked politician and date window, the scraper writes one folder per post under `data/content/<profile>/<YYYY-MM-DD_NNN>/` containing the media files and an `info.json`. This is the unit-of-analysis consumed by Stage 2.

---

## 2. Data Flow

```
                        ┌────────────────────────────┐
                        │  Instagram (instaloader)   │
                        └─────────────┬──────────────┘
                                      │
                                      ▼
   data/content/<profile>/<YYYY-MM-DD_NNN>/
   ├── <folder_id>_1.{jpg|png|webp|mp4}     ← media (1..N per post)
   ├── <folder_id>_2.…
   └── info.json   {folder_id, caption, type}
```

* **Inputs** — Instagram session cookies (`.env` at repo root) and a profile username.
* **Outputs** — per-post folders under `data/content/<profile>/`.
* **Downstream consumer** — `tools/text_transcriber/transcriber.py`.

---

## 3. Setup

```bash
cd tools/content_scraping
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` at the repository root with the cookies of a logged-in Instagram session:

```env
SESSION_ID=...
CSRF_TOKEN=...
DS_USER_ID=...
MID=...
```

Cookies can be retrieved from any browser via `F12 → Application → Cookies → instagram.com`. The first run uses these cookies to mint `session.txt`; subsequent runs load the cached session and only fall back to the cookies if the session has expired.

> **Privacy.** `.env` and `session.txt` must never be committed (`.gitignore` already excludes them).

---

## 4. Usage

```bash
# Interactive: lists profiles already in data/content/ and prompts for a choice
# (or lets you type a brand-new username)
python scraper.py

# Explicit profile, last 7 days
python scraper.py matteosalviniofficial

# Custom date window
python scraper.py matteosalviniofficial --start 2026-04-01 --end 2026-04-11
```

| Argomento     | Tipo        | Default      | Descrizione                                  |
|---------------|-------------|--------------|----------------------------------------------|
| `profile`     | posizionale | menu         | Username Instagram (omit to be prompted).    |
| `--start, -s` | flag        | 7 days ago   | Inclusive start date (`YYYY-MM-DD`).         |
| `--end, -e`   | flag        | today        | Inclusive end date (`YYYY-MM-DD`).           |

The wizard `tools/main.py` calls this stage with the right venv binary.

---

## 5. Implementation Notes

### 5.1 Date filtering

Instagram's `Profile.get_posts()` returns posts in reverse chronological order. The scraper iterates from newest to oldest, skipping posts strictly newer than `--end`, keeping posts within `[start, end]`, and breaking after **5** consecutive posts strictly older than `--start`. The threshold tolerates short out-of-order streaks (pinned/reshared posts) while bounding fetch volume.

### 5.2 Folder identifier scheme

Each post receives a deterministic folder name `YYYY-MM-DD_NNN`, with `NNN` a zero-padded counter local to that day. The counter is derived by scanning existing folders, so re-runs are idempotent and natural sort matches chronology.

### 5.3 Media renaming

`instaloader` writes media into a temporary `_temp_<shortcode>` folder mixed with extras (`.txt`, `.json.xz`, video thumbnails). The scraper:

1. Strips non-media extras.
2. Renames surviving media to `<folder_id>_<n>.<ext>`.
3. Deletes the temporary folder.

Result: every post folder contains only numeric, ordered media filenames plus `info.json`.

### 5.4 Rate limiting

* `instaloader` is initialised with `sleep=True` and `quiet=True` (default rate-limit pauses between requests).
* The scraper additionally `time.sleep(3)` between posts.
* No comments, video thumbnails or follower lists are downloaded.

### 5.5 Slim payload

`save_metadata=False` is passed to `instaloader`. `info.json` records only `folder_id`, `caption` and `type` — the strict minimum each downstream tool needs.

---

## 6. Output Schema

Each post folder contains `info.json`:

```json
{
    "folder_id": "2026-04-10_001",
    "caption":   "Testo della caption del post...",
    "type":      "video"
}
```

| Campo       | Tipo   | Descrizione                                         |
|-------------|--------|-----------------------------------------------------|
| `folder_id` | string | Identifier of the post (== folder name).            |
| `caption`   | string | Raw caption (may contain emoji, URLs, line breaks). |
| `type`      | enum   | `"image"` (single or carousel) or `"video"`.        |

Plus the media files at `<folder_id>_<n>.<ext>`. Per-profile aggregate `<profile>.json` is **not** produced here — it is created by Stage 2 once OCR/STT have run.

---

## 7. Limitations & Notes

* **Instagram TOS.** This pipeline uses authenticated session cookies of a real user; suitable for academic research on a small, fixed set of public political accounts. Do not redistribute downloaded media.
* **GDPR / data protection.** Only public posts are downloaded. No follower lists, no comments, no third-party profile metadata.
* **Stories & Reels.** Stories (24h ephemeral) are out of scope. Public Reels appear in `get_posts()` and are captured.
* **Reproducibility.** Re-running on the same window is idempotent for already-present folders. To force a clean re-fetch, delete the relevant date folders first.
* **Carousels.** A carousel of N images yields N media files sharing the same `folder_id`. `type` is set to the type of the first slide (`instaloader.Post.is_video`).
* **Rate-limit failures.** Instagram occasionally throttles or returns transient HTTP errors mid-iteration; the scraper logs `OK` / `ERROR: ...` per post and continues.
