# tools/utils

Utility scripts for maintaining the HDS dataset. Run from this folder with the tool's venv active, or from repo root.

---

## backfill_urls.py

Reads the `url` field from each per-post JSON (`<folder_id>.json` or `info.json`) and writes it into the aggregated `<profile>.json` used by the dashboard.

**When to run:** after scraping new posts (especially with `--urls-only`) or after the transcriber has processed new posts.

```bash
python tools/utils/backfill_urls.py
```

**Sources checked per post (in order):**
1. `data/content/<profile>/<folder_id>/<folder_id>.json` — transcriber output
2. `data/content/<profile>/<folder_id>/info.json` — scraper `--urls-only` output

---

## backfill_oembed.py

For every post that has a `url` but no `oembed_html`, calls Instagram's public oEmbed endpoint and stores the returned embed HTML in the aggregated `<profile>.json`.

The dashboard injects this HTML directly — no runtime API calls, no token needed.

**When to run:** after `backfill_urls.py` has populated URLs.

```bash
python tools/utils/backfill_oembed.py
```

**Notes:**
- Instagram's oEmbed endpoint occasionally returns 401 for some posts (private, deleted, or rate-limited). Those posts are skipped and can be retried later.
- Already-fetched posts (`oembed_html` present) are always skipped.
- Sleep: 0.5s between requests to avoid rate limiting.

**Typical flow:**
```bash
# 1. Collect URLs (fast, no media download)
python tools/content_scraping/scraper.py <profile> --urls-only

# 2. Push URLs into profile JSON
python tools/utils/backfill_urls.py

# 3. Fetch oEmbed HTML for all posts with URLs
python tools/utils/backfill_oembed.py
```
