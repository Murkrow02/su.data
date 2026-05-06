"""Political Content Scorer — Stage 3 of the HDS pipeline.

Scores politician Instagram posts against Eurobarometer youth priority topics
using a local LLM (Ollama / vLLM / llama.cpp).

Single LLM call per post extracts:
  * Topic relevance scores (1-5) for 10 Eurobarometer categories
  * Content keywords (3-8, chosen by LLM based on content richness)
  * Sentiment (positive/neutral/negative/mixed)
  * Propaganda level (none/low/medium/high)

Ground truth: Flash Eurobarometer EP013EP, Youth Survey 2024, Q2 Italy.

Input  : data/content/<profile>/<profile>.json (transcriber output)
Output : data/scores/<profile>.csv
"""

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

from openai import OpenAI
from tqdm import tqdm

# Make tools/shared importable regardless of CWD.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared import CONTENT_DIR, SCORES_DIR, TOPIC_KEYS, TOPIC_LABELS  # noqa: E402
from shared.prompts import select_one  # noqa: E402

DEFAULT_MODEL    = "gemma4"
DEFAULT_BASE_URL = "http://localhost:11434/v1"

# ── Prompt ────────────────────────────────────────────────────────────────────

_TOPIC_LIST = "\n".join(f'  "{key}": "{label}"' for key, label in zip(TOPIC_KEYS, TOPIC_LABELS))

SYSTEM_PROMPT = f"""\
You are a precise political content analysis engine. Analyze the given Italian \
political social media post and return a JSON object with exactly these fields:

1. "scores": an object mapping each topic key to an integer score 1-5.
2. "keywords": an array of 3-8 Italian keywords describing the specific content.
3. "sentiment": one of "positive", "neutral", "negative", "mixed".
4. "propaganda": one of "none", "low", "medium", "high".

TOPIC KEYS AND THEIR MEANINGS:
{{
{_TOPIC_LIST}
}}

SCORING SCALE (apply strictly):
1 = Topic completely absent from the text.
2 = Topic barely hinted at, possibly only implied (one indirect reference).
3 = Topic present and recognisable but secondary or treated briefly.
4 = Topic is a significant part of the text, discussed with some depth.
5 = Topic is the main subject; the text is primarily about this topic.

KEYWORD RULES:
- Extract 3-8 content-specific Italian terms depending on richness.
- Keywords should describe WHAT the text discusses, not generic labels.
- Short posts (1-2 sentences): 3 keywords. Long/rich posts: up to 8.

SENTIMENT: Overall tone of the post toward the political topics it discusses.
- "positive": hopeful, constructive, proposing solutions
- "negative": critical, alarmed, denouncing problems
- "neutral": informative, factual, descriptive
- "mixed": combines positive and negative elements

PROPAGANDA: Does the post make concrete proposals or just attack opponents?
- "none": substantive content, policy discussion, factual reporting
- "low": mostly substantive with minor rhetorical flourishes
- "medium": significant partisan framing, some attacks, limited substance
- "high": pure attacks on opponents, slogans, no concrete proposals

RULES:
- Score each topic independently. Multiple topics can score 5.
- Base scores ONLY on the text provided, not your prior knowledge.
- Do not infer topics not supported by the text.
- Output ONLY valid JSON. No explanations, no markdown fences, no extra text.

VALID OUTPUT EXAMPLE:
{{"scores":{{"ambiente_clima":1,"lavoro_economia":4,"costo_vita":3,"salute_welfare":1,"istruzione_formazione":1,"uguaglianza_genere":1,"difesa_sicurezza":1,"immigrazione":1,"democrazia_legalita":2,"abitazione":1}},"keywords":["precariato","giovani","stipendi","contratti"],"sentiment":"negative","propaganda":"low"}}"""


def build_user_prompt(caption: str, text: str) -> str:
    combined = f"{caption}\n\n{text}".strip() if caption else text.strip()
    return f"POST:\n{combined}"


# ── JSON Parsing (robust) ─────────────────────────────────────────────────────

def _try_parse_json(raw: str) -> dict | None:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def parse_response(raw: str) -> dict:
    """Parse LLM response into structured dict. Multiple fallback strategies."""
    # 0. Strip <think>...</think> blocks (Qwen3 thinking mode)
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    #tqdm.write(f"[DEBUG RAW] {repr(raw[:500])}")

    # 1. Direct parse
    result = _try_parse_json(raw)
    if result:
        return result

    # 2. Strip markdown fences
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
    result = _try_parse_json(cleaned)
    if result:
        return result

    # 3. Extract first {...} block
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        result = _try_parse_json(match.group())
        if result:
            return result

    return {}


def extract_scores(parsed: dict) -> dict[str, int | None]:
    """Extract validated topic scores from parsed response."""
    scores_raw = parsed.get("scores", {})
    scores = {}
    for key in TOPIC_KEYS:
        val = scores_raw.get(key)
        if isinstance(val, int) and 1 <= val <= 5:
            scores[key] = val
        elif isinstance(val, str) and val.isdigit() and 1 <= int(val) <= 5:
            scores[key] = int(val)
        else:
            scores[key] = None
    return scores


def extract_keywords(parsed: dict) -> str:
    """Extract keywords as semicolon-separated string."""
    kws = parsed.get("keywords", [])
    if isinstance(kws, list):
        clean = [str(k).strip() for k in kws if k]
        return ";".join(clean[:8])
    return ""


def extract_enum(parsed: dict, field: str, valid: set) -> str:
    """Extract and validate an enum field."""
    val = parsed.get(field, "")
    if isinstance(val, str) and val.lower() in valid:
        return val.lower()
    return ""


# ── LLM Call with Retry ───────────────────────────────────────────────────────

RETRYABLE = (
    "openai.APIConnectionError",
    "openai.APITimeoutError",
    "openai.InternalServerError",
)


def score_post(
    client: OpenAI,
    model: str,
    caption: str,
    text: str,
    temperature: float = 0.0,
    max_tokens: int = 512,
    max_retries: int = 3,
) -> dict:
    """Single LLM call returning scores + keywords + sentiment + propaganda."""
    user_prompt = build_user_prompt(caption, text)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user_prompt},
    ]

    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            raw = response.choices[0].message.content or ""
            return parse_response(raw)

        except Exception as exc:
            exc_type = type(exc).__name__
            if attempt < max_retries - 1 and any(r in exc_type for r in ("Connection", "Timeout", "Internal", "Server")):
                wait = 2 ** (attempt + 1)
                tqdm.write(f"[RETRY {attempt+1}/{max_retries}] {exc_type}: {exc} — waiting {wait}s")
                time.sleep(wait)
            else:
                raise

    return {}


# ── Resume Logic ──────────────────────────────────────────────────────────────

def load_existing_ids(csv_path: Path) -> set[str]:
    """Read already-scored folder_ids from existing CSV."""
    if not csv_path.exists():
        return set()
    ids = set()
    with csv_path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fid = row.get("folder_id", "").strip()
            if fid:
                ids.add(fid)
    return ids


# ── Main Processing ───────────────────────────────────────────────────────────

FIELDNAMES = ["folder_id", "type", "language"] + TOPIC_KEYS + ["keywords", "sentiment", "propaganda"]
SENTIMENT_VALS = {"positive", "neutral", "negative", "mixed"}
PROPAGANDA_VALS = {"none", "low", "medium", "high"}


def process(
    posts: list[dict],
    client: OpenAI,
    model: str,
    output_path: Path,
    temperature: float,
    max_tokens: int,
    resume: bool,
) -> None:
    # Resume: skip already-scored posts
    if resume:
        existing = load_existing_ids(output_path)
        if existing:
            before = len(posts)
            posts = [p for p in posts if p.get("folder_id", "") not in existing]
            print(f"Resume: skipping {before - len(posts)} already-scored posts, {len(posts)} remaining.")
    else:
        existing = set()

    if not posts:
        print("Nothing to score.")
        return

    # Open file: append if resuming, write if fresh
    append_mode = resume and output_path.exists() and existing
    mode = "a" if append_mode else "w"

    with output_path.open(mode, newline="", encoding="utf-8") as fout:
        writer = csv.DictWriter(fout, fieldnames=FIELDNAMES)
        if not append_mode:
            writer.writeheader()

        for post in tqdm(posts, desc="Scoring", unit="post"):
            folder_id = post.get("folder_id", "")
            caption   = post.get("caption", "") or ""
            text      = post.get("text", "")    or ""
            post_type = post.get("type", "")
            language  = post.get("language", "")

            row = {"folder_id": folder_id, "type": post_type, "language": language}

            if not text.strip() and not caption.strip():
                row.update({k: "" for k in TOPIC_KEYS})
                row.update({"keywords": "", "sentiment": "", "propaganda": ""})
                writer.writerow(row)
                fout.flush()
                continue

            try:
                parsed = score_post(client, model, caption, text, temperature, max_tokens)
            except Exception as exc:
                tqdm.write(f"[ERROR] {folder_id}: {exc}")
                parsed = {}

            scores = extract_scores(parsed)
            row.update({k: (v if v is not None else "") for k, v in scores.items()})
            row["keywords"]   = extract_keywords(parsed)
            row["sentiment"]  = extract_enum(parsed, "sentiment", SENTIMENT_VALS)
            row["propaganda"] = extract_enum(parsed, "propaganda", PROPAGANDA_VALS)

            writer.writerow(row)
            fout.flush()


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Score political posts against Eurobarometer youth topics.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        epilog="""Esempi:
  python scorer.py                                   # menu interattivo, modello di default
  python scorer.py -m qwen3:14b
  python scorer.py -i ../../data/content/ellyesse/ellyesse.json
  python scorer.py -m gemma4 -i ../../data/content/giorgiameloni/giorgiameloni.json --no-resume
  python scorer.py --post-ids 2025-09-01_001 2025-09-01_002
""",
    )
    p.add_argument("-m", "--model", default=DEFAULT_MODEL,
                   help="Nome del modello sul server LLM locale.")
    p.add_argument("-i", "--input", default=None,
                   help="Path al JSON aggregato del profilo (default: menu interattivo).")
    p.add_argument("--output", "-o", default=None,
                   help="Path CSV di output (default: data/scores/<profilo>.csv).")
    p.add_argument("--post-ids", nargs="+", default=None, metavar="FOLDER_ID",
                   help="Filtra ai post con questi folder_id.")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL del server LLM.")
    p.add_argument("--api-key",  default="ollama",        help="API key (dummy per server locali).")
    p.add_argument("--temperature", type=float, default=0.0, help="Temperatura di sampling.")
    p.add_argument("--max-tokens",  type=int,   default=1024, help="Max token nella risposta LLM.")
    p.add_argument("--no-resume", action="store_true", help="Ignora l'output esistente e riparti.")
    return p.parse_args()


def discover_aggregated_jsons() -> list[Path]:
    """Find data/content/<profile>/<profile>.json files (transcriber outputs)."""
    if not CONTENT_DIR.exists():
        return []
    candidates: list[Path] = []
    for prof_dir in sorted(p for p in CONTENT_DIR.iterdir() if p.is_dir()):
        agg = prof_dir / f"{prof_dir.name}.json"
        if agg.exists():
            candidates.append(agg)
    return candidates


def resolve_input(arg_input: str | None) -> Path:
    if arg_input:
        path = Path(arg_input)
        if not path.exists():
            sys.exit(f"[ERROR] Input file not found: {path}")
        return path
    candidates = discover_aggregated_jsons()
    if not candidates:
        sys.exit(
            f"[ERROR] Nessun JSON aggregato trovato in {CONTENT_DIR}/*/.\n"
            "        Esegui prima il transcriber su almeno un profilo."
        )
    labels = [f"{p.parent.name}  ({p})" for p in candidates]
    pick   = select_one(labels, title="Seleziona il profilo da scorare:")
    return candidates[labels.index(pick)]


def infer_politician_name(input_path: Path) -> str:
    """
    Infer politician name from input path.
    Prefer parent folder name for paths like data/content/<politician>/<file>.json,
    fallback to file stem for generic JSON paths.
    """
    if input_path.parent != Path(".") and input_path.parent.name:
        return input_path.parent.name
    return input_path.stem


def main() -> None:
    args = parse_args()

    input_path = resolve_input(args.input)

    if args.output:
        output_path = Path(args.output)
    else:
        politician_name = infer_politician_name(input_path)
        output_path = SCORES_DIR / f"{politician_name}.csv"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with input_path.open(encoding="utf-8") as f:
        posts = json.load(f)

    if not isinstance(posts, list):
        sys.exit("[ERROR] JSON root must be a list of post objects.")

    if args.post_ids:
        whitelist = set(args.post_ids)
        before = len(posts)
        posts = [p for p in posts if p.get("folder_id", "") in whitelist]
        print(f"Filter: {before} → {len(posts)} posts (matched {len(posts)}/{len(whitelist)} requested ids)")

    print(f"Loaded {len(posts)} posts from {input_path}")
    print(f"Topics: {len(TOPIC_KEYS)} (Eurobarometer Q2)")
    print(f"Model:  {args.model} @ {args.base_url}")
    print(f"Output: {output_path}")
    print(f"Resume: {'off' if args.no_resume else 'on'}\n")

    client = OpenAI(base_url=args.base_url, api_key=args.api_key)

    process(
        posts=posts,
        client=client,
        model=args.model,
        output_path=output_path,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
        resume=not args.no_resume,
    )

    print(f"\nDone. Results saved to {output_path}")


if __name__ == "__main__":
    main()