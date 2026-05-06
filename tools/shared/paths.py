"""Canonical filesystem paths for the HDS pipeline.

All paths are absolute and derived from this file's location, so importing
modules can rely on them regardless of the caller's working directory.
"""

from pathlib import Path

REPO_ROOT             = Path(__file__).resolve().parents[2]
DATA_DIR              = REPO_ROOT / "data"
CONTENT_DIR           = DATA_DIR / "content"
SCORES_DIR            = DATA_DIR / "scores"
RESULTS_DIR           = DATA_DIR / "results"
MODEL_VALIDATION_DIR  = DATA_DIR / "model_validation"
DOCUMENTS_DIR         = DATA_DIR / "documents"
TOPICS_JSON           = DATA_DIR / "topics.json"
