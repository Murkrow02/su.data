# 2. Text Transcriber — OCR + Speech-to-Text

> **Stage 2 of the HDS pipeline.** Turns the multimodal Instagram corpus into a single textual representation usable by an LLM scorer.

---

## 1. Purpose

Instagram political content is multimodal: the same "message" may be split across the caption, on-image text (slogans, infographics, slides), and the spoken audio of a Reel or video. To analyse the content with a text-only LLM (Stage 3), every modality must first be projected into Italian text.

This tool walks every post folder produced by the scraper and writes:

* `<folder_id>.json` — the post's caption, type and the **fused** transcribed text.
* `<profile>.json` — the per-profile aggregate, ready to feed the scorer.

---

## 2. Theoretical Framing

The choice to fuse (caption + OCR + ASR) into a single `text` field rests on a deliberate modelling assumption:

> *For the purpose of agenda alignment, what matters is whether a topic appears in the post — not which modality conveyed it.*

Examples:

* A reel where the politician says "lavoro precario, salari bassi" but writes a generic caption ("oggi a Milano") — the agenda signal lives in the audio.
* An infographic image with on-screen bullet points "AFFITTI ALLE STELLE / ABITAZIONE DIRITTO COSTITUZIONALE" and an empty caption — the agenda signal lives in the OCR.

By concatenating the modalities, the downstream scorer sees the full evidence and can score the post against each Eurobarometer topic independently. Treating modalities separately would either double-count topic signals or arbitrarily privilege one modality.

This fusion is appropriate **because the scoring step is topical**, not stylistic. A discourse-analytic study would need to keep the modalities apart.

---

## 3. Data Flow

```
   data/content/<profile>/<folder_id>/   ← scraper output
       ├── <folder_id>_<n>.{jpg|png|webp}      → Tesseract OCR ──┐
       ├── <folder_id>_<n>.mp4                 → FFmpeg → faster-whisper ─┤
       └── info.json                                                      │
                                                                          ▼
       ├── <folder_id>.json   {folder_id, caption, type, text, language}
       └── (after all folders processed)
   data/content/<profile>/<profile>.json   ← list of all per-post objects
```

* **Inputs** — the post folders written by the scraper.
* **Outputs** — per-post `<folder_id>.json` + per-profile `<profile>.json`.
* **Downstream consumer** — `tools/scorer/scorer.py`.

---

## 4. Setup

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

The script fails fast at startup if either binary is missing on `PATH`.

The first run downloads the faster-whisper model (~1.5 GB on disk for `large-v3-turbo`); subsequent runs use the local cache.

---

## 5. Usage

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

## 6. Methodology / Algorithms

### 6.1 OCR pipeline (Tesseract)

For each image, the pipeline applies a small pre-processing chain before invoking Tesseract:

1. `convert("L")` → 8-bit grayscale (Tesseract's preferred input).
2. `ImageOps.autocontrast` → linear stretch over the active intensity range.
3. `ImageFilter.SHARPEN` → high-pass kernel to recover edge contrast lost in JPEG / Instagram's re-compression.

The Tesseract call uses `lang="ita+eng"` because Italian political infographics frequently embed English loanwords (jobs act, green deal, lockdown). Tesseract internally falls back across the listed languages on a token-by-token basis. Output text is collapsed to single-spaced form.

OCR errors on stylised infographics are tolerated: the scorer (Stage 3) operates at topic-level, not at lexical level, so misspellings of common words still trigger the right topic when they occur in characteristic contexts.

### 6.2 Audio extraction (FFmpeg)

For each video the script extracts a 16 kHz mono PCM WAV via the `ffmpeg-python` wrapper:

```
ffmpeg -i <video> -ar 16000 -ac 1 -f wav -y <video>_audio.wav
```

* **16 kHz / mono** is the canonical sample rate for end-to-end speech models — exceeds it would only inflate file size without accuracy gain.
* The intermediate WAV is removed in a `finally` block so failures do not leak files.

### 6.3 Speech-to-text (faster-whisper, large-v3-turbo)

The default model is `deepdml/faster-whisper-large-v3-turbo-ct2`, a CTranslate2 conversion of OpenAI's Whisper *large-v3-turbo*. Trade-offs that motivated this choice:

| Model                  | WER (it) | RTF (CPU int8) | Disk  | Notes                                |
|------------------------|----------|----------------|-------|--------------------------------------|
| `tiny`                 | ~30%     | 0.05×          | 75 MB | Useless on noisy short reels.        |
| `medium`               | ~9%      | 0.4×           | 1.5 GB | Decent quality, very slow on CPU.    |
| `large-v3`             | ~5%      | 0.9×           | 3.0 GB | State-of-art quality, very slow.     |
| **`large-v3-turbo`**   | ~6%      | 0.25×          | 1.5 GB | **Selected.** Near-large quality at ~4× speed. |

`int8` quantisation keeps the RAM footprint under 4 GB and runs on Apple Silicon CPUs without GPU. `beam_size=5` is the faster-whisper default; `language="it"` is forced because language ID on very short clips is unreliable.

### 6.4 Modality fusion

Per post, the textual outputs of all media are concatenated in folder-listing order, separated by single spaces, and stored in the `text` field. The caption is stored separately in `caption`; both are passed to the LLM scorer, which receives them as `f"{caption}\n\n{text}"`.

Empty modalities (image with no readable text, silent video) yield an empty string and are simply omitted from the concatenation — they do not introduce noise tokens.

### 6.5 Aggregation

After all post folders have been processed, the script enumerates them in sorted order and concatenates each `<folder_id>.json` into a single list, written as `<profile>.json`. This file is the canonical input shape expected by Stage 3.

---

## 7. Output Artifacts

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

## 8. Limitations & Notes

* **OCR on stylised text.** Instagram political infographics often use thin / decorative fonts; Tesseract recall on those is around 70–85% by token, but the lexical errors are dominated by misrecognition of accents and confusable digits, both of which rarely shift topic classification.
* **ASR on dialect / overlapping speech.** Whisper handles standard Italian well. Heavy Sicilian/Neapolitan dialect or speakers talking over each other degrade WER; we accept this as bounded noise.
* **Music-only or silent reels.** When ASR returns an empty string we keep the empty `text` field; the scorer falls back to the caption alone.
* **Re-encoding.** FFmpeg re-encodes to PCM WAV regardless of source codec; this is the simplest way to get a Whisper-compatible signal without depending on the source container's audio stream layout.
* **Reproducibility.** `large-v3-turbo` is deterministic at greedy `beam_size=1`; with `beam_size=5` (default) outputs may vary by ≤1% of tokens between runs. For reproducible runs set `--whisper-model` and pin the version of `faster-whisper`.
* **Performance budget.** On Apple M-series CPUs, expect ~5–10 minutes per 30-post profile (typical mix of images and 1-min reels).
