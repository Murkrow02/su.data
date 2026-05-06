"""Text Transcriber — extracts text from a profile's downloaded media.

Stage 2 of the HDS pipeline. For every post folder under
`data/content/<profile>/<YYYY-MM-DD_NNN>/`:
  * images → OCR (Tesseract, ita+eng)
  * videos → audio extraction (FFmpeg) → speech-to-text (faster-whisper)

Per-post output: <folder_id>.json   {folder_id, caption, type, text, language}
Aggregated:      <profile>.json     (list of all per-post objects)
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import ffmpeg
import pytesseract
from PIL import Image, ImageFilter, ImageOps
from dotenv import load_dotenv
from faster_whisper import WhisperModel

# Make tools/shared importable regardless of CWD.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared import CONTENT_DIR, REPO_ROOT, select_profile  # noqa: E402

load_dotenv(REPO_ROOT / ".env")

DEFAULT_OCR_LANG     = "ita+eng"
DEFAULT_WHISPER      = "deepdml/faster-whisper-large-v3-turbo-ct2"
DEFAULT_DEVICE       = "cpu"
DEFAULT_COMPUTE_TYPE = "int8"
IMAGE_EXTS           = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTS           = {".mp4"}


def _check_external_deps(need_ocr: bool, need_whisper: bool) -> None:
    missing: list[str] = []
    if need_whisper and shutil.which("ffmpeg") is None:
        missing.append("ffmpeg")
    if need_ocr:
        tess = shutil.which("tesseract")
        if tess is None:
            missing.append("tesseract")
        else:
            pytesseract.pytesseract.tesseract_cmd = tess
    if missing:
        sys.exit(
            f"[ERROR] Dipendenze di sistema mancanti: {', '.join(missing)}.\n"
            "        macOS: brew install ffmpeg tesseract tesseract-lang\n"
            "        Linux: sudo apt install ffmpeg tesseract-ocr tesseract-ocr-ita"
        )


def clean_text(text: str) -> str:
    return " ".join(text.split()).strip() if text else ""


def run_ocr_on_image(image_path: Path, lang: str) -> str:
    try:
        img = Image.open(image_path).convert("L")
        img = ImageOps.autocontrast(img)
        img = img.filter(ImageFilter.SHARPEN)
        return clean_text(pytesseract.image_to_string(img, lang=lang))
    except Exception as e:
        print(f"    [WARN] OCR fallita su {image_path.name}: {e}")
        return ""


def transcribe_video(video_path: Path, folder_path: Path, model: WhisperModel) -> str:
    audio_path = folder_path / f"{video_path.stem}_audio.wav"
    try:
        if not audio_path.exists():
            (
                ffmpeg
                .input(str(video_path))
                .output(str(audio_path), ar="16000", ac=1, format="wav")
                .overwrite_output()
                .run(quiet=True)
            )
        segments, _info = model.transcribe(str(audio_path), beam_size=5, language="it")
        return " ".join(seg.text.strip() for seg in segments).strip()
    except Exception as e:
        print(f"    [ERROR] Trascrizione video {video_path.name}: {e}")
        return ""
    finally:
        audio_path.unlink(missing_ok=True)


def combine_json_files(profile_name: str, dataset_dir: Path) -> None:
    posts: list[dict] = []
    for sub in sorted(d for d in dataset_dir.iterdir() if d.is_dir() and not d.name.startswith("_temp")):
        per_post = sub / f"{sub.name}.json"
        if per_post.exists():
            try:
                posts.append(json.loads(per_post.read_text(encoding="utf-8")))
            except Exception as e:
                print(f"[WARN] Lettura {per_post}: {e}")

    if not posts:
        print("[WARN] Nessun JSON trovato da aggregare.")
        return

    out = dataset_dir / f"{profile_name}.json"
    out.write_text(json.dumps(posts, indent=4, ensure_ascii=False), encoding="utf-8")
    print(f"[INFO] Aggregato: {out} ({len(posts)} post)")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Instagram Media Transcriber & OCR",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        epilog="""Esempi:
  python transcriber.py                          # menu interattivo
  python transcriber.py giorgiameloni
  python transcriber.py giorgiameloni --no-ocr   # solo audio video
""",
    )
    p.add_argument("profile", nargs="?", default=None,
                   help="Profilo Instagram da elaborare (default: menu interattivo).")
    p.add_argument("--ocr-lang", default=DEFAULT_OCR_LANG, help="Lingue Tesseract.")
    p.add_argument("--whisper-model", default=DEFAULT_WHISPER, help="Modello faster-whisper.")
    p.add_argument("--device", default=DEFAULT_DEVICE, help="Device per whisper (cpu/cuda).")
    p.add_argument("--compute-type", default=DEFAULT_COMPUTE_TYPE, help="Tipo di compute per whisper.")
    p.add_argument("--no-ocr", action="store_true", help="Disabilita OCR sulle immagini.")
    p.add_argument("--no-transcribe", action="store_true", help="Disabilita trascrizione video.")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    target_profile = args.profile or select_profile(
        CONTENT_DIR, title="Seleziona il profilo da elaborare:"
    )
    dataset_dir = CONTENT_DIR / target_profile
    if not dataset_dir.exists():
        sys.exit(f"[ERROR] Cartella non trovata: {dataset_dir}")

    enable_ocr        = not args.no_ocr
    enable_transcribe = not args.no_transcribe
    _check_external_deps(enable_ocr, enable_transcribe)

    print(f"[CONFIG] Profilo:    {target_profile}")
    print(f"[CONFIG] Dataset:    {dataset_dir}")
    print(f"[CONFIG] OCR:        {'on (' + args.ocr_lang + ')' if enable_ocr else 'off'}")
    print(f"[CONFIG] Whisper:    {args.whisper_model if enable_transcribe else 'off'} ({args.device}/{args.compute_type})")

    whisper_model: WhisperModel | None = None
    if enable_transcribe:
        print(f"[INFO] Inizializzazione faster-whisper {args.whisper_model}...")
        whisper_model = WhisperModel(
            args.whisper_model,
            device=args.device,
            compute_type=args.compute_type,
            cpu_threads=8,
            num_workers=2,
        )

    folders = sorted(d for d in dataset_dir.iterdir() if d.is_dir() and not d.name.startswith("_temp"))
    print(f"\n[INFO] {len(folders)} cartelle trovate per {target_profile}\n")

    count = 0
    for folder in folders:
        info_file  = folder / "info.json"
        final_json = folder / f"{folder.name}.json"
        if final_json.exists() or not info_file.exists():
            continue

        post_info = json.loads(info_file.read_text(encoding="utf-8"))
        print(f"[{count + 1:>2}] Elaborazione: {folder.name}")

        extracted: list[str] = []
        for media in folder.iterdir():
            ext = media.suffix.lower()
            if enable_ocr and ext in IMAGE_EXTS:
                print(f"    -> OCR    {media.name}")
                t = run_ocr_on_image(media, args.ocr_lang)
                if t:
                    extracted.append(t)
            elif enable_transcribe and ext in VIDEO_EXTS and whisper_model is not None:
                print(f"    -> Whisper {media.name}")
                t = transcribe_video(media, folder, whisper_model)
                if t:
                    extracted.append(t)

        post_data = {
            "folder_id": post_info["folder_id"],
            "url":       post_info.get("url", ""),
            "caption":   post_info["caption"],
            "type":      post_info["type"],
            "text":      " ".join(extracted).strip(),
            "language":  "it",
        }
        final_json.write_text(json.dumps(post_data, indent=4, ensure_ascii=False), encoding="utf-8")
        count += 1

    print(f"\n[DONE] {count} nuove cartelle elaborate.")
    combine_json_files(target_profile, dataset_dir)


if __name__ == "__main__":
    main()
