# 1. Content Scraping — Instagram Scraper

> **Stage 1 of the HDS pipeline.** Extracts the raw signal — politicians' Instagram posts — that all downstream analyses are built on.

---

## 1. Purpose

This tool builds the empirical corpus on which the entire *Semantic Gap* study rests. For each tracked politician it downloads, in a configurable date window:

* every published post (image, carousel, video, reel) within range,
* the post caption,
* a structural metadata file (`info.json`) used by Stage 2 (Transcriber) and Stage 3 (Scorer).

It is the single source of "what the politicians actually said on social media in this period". The fidelity of every later metric — Coverage Rate, Jensen-Shannon Divergence, Agenda Alignment Score — depends on the completeness and date-correctness of this corpus.

---

## 2. Theoretical Framing

Instagram is treated as a **public proxy for a politician's communicative agenda** in the sense of agenda-setting theory (McCombs & Shaw, 1972): the salience of a topic in the political discourse is operationalised as the frequency with which it is selected for posting. Compared to TV interviews or parliamentary speech, Instagram has three properties relevant to this thesis:

1. **First-person authorship.** The candidate (or their staff) controls the content, framing and timing — there is no journalistic mediation.
2. **Mass-distribution by default.** Each post is broadcast to followers and surfaced algorithmically; there is intent for the message to reach an audience that includes young voters.
3. **Temporal density.** Politicians post several times per week, allowing a fine-grained reconstruction of their agenda within the survey window.

Restricting the analysis to a fixed date range tied to the Eurobarometer fielding period (Sept–Oct 2024) is critical: the youth priorities measured by EB EP013EP are themselves date-stamped, so comparing them to a politician's communication in a non-overlapping period would conflate change-over-time with cross-sectional gap.

---

## 3. Data Flow

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
* **Outputs** — per-post folders under `data/content/<profile>/`. Each post folder is a unit-of-analysis for downstream tools.
* **Downstream consumer** — `tools/text_transcriber/transcriber.py` reads the same folders.

---

## 4. Setup

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

## 5. Usage

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

## 6. Methodology / Algorithms

### 6.1 Date filtering and the early-exit heuristic

Instagram's `Profile.get_posts()` returns posts in reverse chronological order. We iterate from newest to oldest:

* skip posts strictly newer than `--end`,
* keep posts within `[start, end]`,
* count consecutive posts strictly older than `--start` and break after **five** of them.

The break threshold of five trades off completeness against API quota: it tolerates a short out-of-order streak (Instagram occasionally serves a pinned or reshared post out of date order) while bounding the worst-case number of fetched posts.

### 6.2 Folder identifier scheme

Each post receives a deterministic folder name `YYYY-MM-DD_NNN`, where `NNN` is a zero-padded counter local to that day. This:

* is stable across re-runs (existing folders are scanned to derive the next counter),
* sorts naturally,
* preserves the chronological grouping needed by aggregation (Stage 2 produces one `<profile>.json` per profile by sorting `folder_id`s lexicographically).

### 6.3 Media renaming

`instaloader` writes media into a temporary `_temp_<shortcode>` folder, mixes them with extras (`.txt`, `.json.xz`, video thumbnails) and uses Instagram's shortcode as a prefix. We:

1. strip non-media extras,
2. rename surviving media to `<folder_id>_<n>.<ext>`,
3. delete the temporary folder.

Result: every post folder contains *only* numeric, ordered media filenames plus `info.json`. This is what makes the Transcriber's pipeline deterministic.

### 6.4 Rate limiting & politeness

* `instaloader` is initialised with `sleep=True` and `quiet=True`, so it inserts default rate-limit pauses between requests.
* The scraper additionally `time.sleep(3)` between posts.
* No comments, video thumbnails, or follower lists are downloaded — only the strictly necessary objects.

### 6.5 Why no metadata?

`save_metadata=False` is passed to `instaloader`. We *do* need the caption and the post type, but not the JSON dump of likes / view counts / location. Slimming the payload reduces the on-disk footprint by ~40%, and keeps the pipeline's data-protection surface minimal: `info.json` records only the strict minimum each downstream tool needs.

---

## 7. Output Artifacts

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

Plus the media files themselves at `<folder_id>_<n>.<ext>`.

Per-profile aggregate `<profile>.json` is **not** produced here — that file is created by Stage 2 (Transcriber) once OCR/STT have run.

---

## 8. Limitations & Notes

* **Instagram TOS.** This pipeline uses authenticated session cookies of a real user; it is suitable for academic research on a small, fixed set of public political accounts. Do not redistribute the downloaded media.
* **GDPR / data protection.** Only public posts are downloaded. No follower lists, no comments, no profile metadata of third parties.
* **Stories & Reels.** Stories (24h ephemeral) are out of scope. Public Reels appear in `get_posts()` and are captured.
* **Reproducibility.** Re-running the scraper on the same window is idempotent for already-present folders (it counts existing date-prefixed dirs to assign the next `NNN`). To force a clean re-fetch, delete the relevant date folders first.
* **Carousels.** A single post that is a carousel of N images yields N media files, all named with the same `folder_id`. The `type` is set to the type of the first slide as exposed by `instaloader.Post.is_video`.
* **Rate-limit failures.** Instagram occasionally throttles or returns transient HTTP errors mid-iteration; the scraper logs the per-post status (`OK` / `ERROR: ...`) and continues with the next post rather than aborting the run.
