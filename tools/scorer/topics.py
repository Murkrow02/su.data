"""Back-compat shim. Real config lives in tools/shared/topics.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.topics import (  # noqa: E402,F401
    TOPICS,
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
