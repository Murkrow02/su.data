"""Topic configuration loader.

Reads `data/topics.json` (Flash Eurobarometer EP013EP, Youth Survey 2024,
Q2 row Italy) and exposes typed Python objects used across the pipeline.
"""

import json

from .paths import TOPICS_JSON

with TOPICS_JSON.open(encoding="utf-8") as _f:
    _data = json.load(_f)

TOPICS = _data["topics"]

TOPIC_KEYS         = [t["key"]   for t in TOPICS]
TOPIC_LABELS       = [t["label"] for t in TOPICS]
TOPIC_LABELS_DICT  = {t["key"]: t["label"] for t in TOPICS}

_RAW_SUM         = sum(t["it_pct"] for t in TOPICS)
YOUTH_WEIGHTS_IT = {t["key"]: t["it_pct"] / _RAW_SUM for t in TOPICS}
YOUTH_RAW_PCT_IT = {t["key"]: t["it_pct"]            for t in TOPICS}

EB_SOURCE = _data["_source"]


def _strip_meta(d: dict) -> dict:
    return {k: v for k, v in d.items() if not k.startswith("_")}


YOUTH_VALUES_IT        = _strip_meta(_data["youth_values_it"])
YOUTH_EU_SENTIMENT_IT  = _strip_meta(_data["youth_eu_sentiment_it"])
YOUTH_PARTICIPATION_IT = _strip_meta(_data["youth_participation_it"])
YOUTH_BARRIERS_IT      = _strip_meta(_data["youth_barriers_it"])
YOUTH_EU_BENEFITS_IT   = _strip_meta(_data["youth_eu_benefits_it"])
