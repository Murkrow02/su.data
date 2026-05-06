"""Shared utilities for the HDS pipeline tools.

Exposes canonical paths, the Eurobarometer topic config, and interactive
helpers used by every tool to keep CLI behaviour consistent.
"""

from .paths import (
    REPO_ROOT,
    DATA_DIR,
    CONTENT_DIR,
    SCORES_DIR,
    RESULTS_DIR,
    MODEL_VALIDATION_DIR,
    DOCUMENTS_DIR,
    TOPICS_JSON,
)
from .prompts import select_one, select_many, select_profile, select_models
from .topics import (
    TOPIC_KEYS,
    TOPIC_LABELS,
    TOPIC_LABELS_DICT,
    YOUTH_RAW_PCT_IT,
    YOUTH_WEIGHTS_IT,
    YOUTH_VALUES_IT,
    YOUTH_EU_SENTIMENT_IT,
    YOUTH_PARTICIPATION_IT,
    YOUTH_BARRIERS_IT,
    YOUTH_EU_BENEFITS_IT,
    EB_SOURCE,
)

__all__ = [
    "REPO_ROOT", "DATA_DIR", "CONTENT_DIR", "SCORES_DIR", "RESULTS_DIR",
    "MODEL_VALIDATION_DIR", "DOCUMENTS_DIR", "TOPICS_JSON",
    "select_one", "select_many", "select_profile", "select_models",
    "TOPIC_KEYS", "TOPIC_LABELS", "TOPIC_LABELS_DICT",
    "YOUTH_RAW_PCT_IT", "YOUTH_WEIGHTS_IT",
    "YOUTH_VALUES_IT", "YOUTH_EU_SENTIMENT_IT", "YOUTH_PARTICIPATION_IT",
    "YOUTH_BARRIERS_IT", "YOUTH_EU_BENEFITS_IT", "EB_SOURCE",
]
