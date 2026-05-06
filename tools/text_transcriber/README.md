# 2. Text Transcriber — OCR + Speech-to-Text

> **Stage 2 of the HDS pipeline.** Projects each multimodal post (caption + image OCR + video ASR) into a single Italian text representation usable by the LLM scorer.

---

## 1. What it produces

For every post folder produced by Stage 1, the transcriber writes:

* `<folder_id>.json` — caption, type, fused transcribed text and language.
* `<profile>.json` — per-profile aggregate (sorted list of all per-post objects), the canonical input to Stage 3.

---

## 2. Data Flow

```
   data/content/<profile>/<folder_id>/   ← scraper output
       ├── <folder_id>_<n>.{jpg|png|webp}      → Tesseract OCR ─────────────┐
       ├── <folder_id>_<n>.mp4                 → FFmpeg → faster-whisper ───┤
       └── info.json                                                        │
                                                                            ▼
       ├── <folder_id>.json   {folder_id, caption, type, text, language}
       └── (after all folders processed)
   data/content/<profile>/<profile>.json   ← list of all per-post objects
```

* **Inputs** — the post folders written by the scraper.
* **Outputs** — per-post `<folder_id>.json` + per-profile `<profile>.json`.
* **Downstream consumer** — `tools/scorer/scorer.py`.

---

## 3. Setup

```bash
cd tools/text_transcriber
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

System dependencies:

| Dipendenza | macOS                                            | Linux (Debian/Ubuntu)                                  |
|------------|--------------------------------------------------|--------------------------------------------------------|
| FFmpeg     | `brew install ffmpeg`                            | `sudo apt install ffmpeg`                              |
| Tesseract  | `brew install tesseract tesseract-lang`          | `sudo apt install tesseract-ocr tesseract-ocr-ita`     |

The script fails fast at startup if either binary is missing on `PATH`. The first run downloads the faster-whisper model (~1.5 GB on disk for `large-v3-turbo`); subsequent runs use the local cache.

---

## 4. Usage

```bash
# Menu interattivo (lista i profili in data/content/)
python transcriber.py

# Profilo esplicito, OCR + ASR
python transcriber.py giorgiameloni

# Solo audio video, salta OCR
python transcriber.py giorgiameloni --no-ocr

# Solo OCR, salta video
python transcriber.py giorgiameloni --no-transcribe

# Modello Whisper alternativo / GPU
python transcriber.py giorgiameloni --whisper-model small --device cuda --compute-type float16
```

| Argomento          | Default                                                | Descrizione                                |
|--------------------|--------------------------------------------------------|--------------------------------------------|
| `profile`          | menu                                                   | Profilo da elaborare.                      |
| `--ocr-lang`       | `ita+eng`                                              | Codici Tesseract (separati da `+`).        |
| `--whisper-model`  | `deepdml/faster-whisper-large-v3-turbo-ct2`            | HF id o path al modello CT2.               |
| `--device`         | `cpu`                                                  | `cpu`, `cuda`, `metal`.                    |
| `--compute-type`   | `int8`                                                 | `int8`, `int8_float16`, `float16`, `float32`. |
| `--no-ocr`         | off                                                    | Disattiva OCR.                             |
| `--no-transcribe`  | off                                                    | Disattiva ASR video.                       |

Idempotent: a post folder that already contains `<folder_id>.json` is skipped. Delete the file to force a redo.

---

## 5. Implementation Notes

### 5.1 OCR pipeline (Tesseract)

Per-image preprocessing before Tesseract:

1. `convert("L")` → 8-bit grayscale.
2. `ImageOps.autocontrast` → linear stretch over the active intensity range.
3. `ImageFilter.SHARPEN` → high-pass kernel.

Tesseract is invoked with `lang="ita+eng"` (Italian political infographics frequently embed English loanwords). Output is collapsed to single-spaced form.

### 5.2 Audio extraction (FFmpeg)

For each video the script extracts a 16 kHz mono PCM WAV via `ffmpeg-python`:

```
ffmpeg -i <video> -ar 16000 -ac 1 -f wav -y <video>_audio.wav
```

The intermediate WAV is removed in a `finally` block.

### 5.3 Speech-to-text (faster-whisper)

Default: `deepdml/faster-whisper-large-v3-turbo-ct2`, `int8` quantisation, `beam_size=5`, `language="it"` (forced — language ID on very short clips is unreliable).

### 5.4 Modality fusion

Per post, OCR and ASR outputs are concatenated in folder-listing order, single-space separated, and stored in `text`. The caption is kept separately in `caption`. Empty modalities are simply omitted from the concatenation. The scorer receives `f"{caption}\n\n{text}"`.

### 5.5 Aggregation

After all post folders are processed, the script enumerates them in sorted order and writes the concatenated list to `<profile>.json`.

---

## 6. Output Schema

Per-post (`<folder_id>.json`):

| Campo       | Tipo   | Descrizione                                              |
|-------------|--------|----------------------------------------------------------|
| `folder_id` | string | Identifier of the post.                                  |
| `caption`   | string | Original caption (verbatim from Instagram).              |
| `type`      | enum   | `"image"` or `"video"`.                                  |
| `text`      | string | Fused OCR + ASR transcription. Single-spaced.            |
| `language`  | enum   | `"it"` (forced).                                         |

Per-profile (`<profile>.json`): a JSON array of the per-post objects above, sorted by `folder_id`.

---

## 7. Limitations & Notes

* **OCR on stylised text.** Tesseract recall on thin / decorative fonts is around 70–85% by token; misrecognitions are dominated by accents and confusable digits, both of which rarely shift topic classification downstream.
* **ASR on dialect / overlapping speech.** Whisper handles standard Italian well; heavy regional dialects or speakers talking over each other degrade WER.
* **Music-only or silent reels.** Empty ASR returns an empty `text` field; the scorer falls back to the caption alone.
* **Reproducibility.** `large-v3-turbo` is deterministic at greedy `beam_size=1`; with `beam_size=5` (default) outputs may vary by ≤1% of tokens between runs. Pin `--whisper-model` and `faster-whisper` version for reproducible runs.
* **Performance budget.** ~5–10 minutes per 30-post profile on Apple M-series CPUs.
