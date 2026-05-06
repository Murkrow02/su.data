export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function rankDescending(values) {
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);
  const ranks = Array(values.length);

  for (let start = 0; start < ordered.length; ) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end += 1;
    const averageRank = (start + 1 + end) / 2;
    ordered.slice(start, end).forEach((item) => {
      ranks[item.index] = averageRank;
    });
    start = end;
  }

  return ranks;
}

export function formatRank(rank) {
  return Number.isInteger(rank) ? String(rank) : rank.toFixed(1);
}

export function spreadTies(positions, separation = 0.8) {
  const groups = new Map();
  positions.forEach((position, index) => {
    const key = position.toFixed(8);
    groups.set(key, [...(groups.get(key) || []), index]);
  });

  const spread = [...positions];
  groups.forEach((indices) => {
    if (indices.length < 2) return;
    const start = -((indices.length - 1) * separation) / 2;
    indices.forEach((index, offsetIndex) => {
      spread[index] = positions[index] + start + offsetIndex * separation;
    });
  });

  return spread;
}

export function pearson(left, right) {
  const pairs = left
    .map((value, index) => [value, right[index]])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 2) return 0;
  const leftMean = pairs.reduce((sum, [value]) => sum + value, 0) / pairs.length;
  const rightMean = pairs.reduce((sum, [, value]) => sum + value, 0) / pairs.length;
  let numerator = 0;
  let leftDen = 0;
  let rightDen = 0;
  pairs.forEach(([a, b]) => {
    const da = a - leftMean;
    const db = b - rightMean;
    numerator += da * db;
    leftDen += da * da;
    rightDen += db * db;
  });
  return leftDen && rightDen ? numerator / Math.sqrt(leftDen * rightDen) : 0;
}

export function kendallTau(left, right) {
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < left.length; i += 1) {
    for (let j = i + 1; j < left.length; j += 1) {
      const product = Math.sign(left[i] - left[j]) * Math.sign(right[i] - right[j]);
      if (product > 0) concordant += 1;
      if (product < 0) discordant += 1;
    }
  }
  const total = concordant + discordant;
  return total ? (concordant - discordant) / total : 0;
}
