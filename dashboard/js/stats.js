import { topicColumns, politicians, politicianById } from "./config.js";
import { youthPriorityValues } from "./config.js";
import { state } from "./state.js";
import { clamp, rankDescending, pearson, kendallTau } from "./utils.js";
import { routeParams } from "./router.js";

export const scoreValue = (post, topicId) => Number(post.scores?.[topicId] || 0);

export function topScores(post, limit = 3) {
  return topicColumns
    .map((topic) => ({ ...topic, score: scoreValue(post, topic.id) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function meanScore(list, topicId) {
  const values = list.map((post) => scoreValue(post, topicId)).filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function topicSummary(list = state.posts) {
  return topicColumns
    .map((topic) => {
      const average = meanScore(list, topic.id);
      const leaders = politicians
        .map((person) => {
          const personPosts = list.filter((post) => post.politician === person.id);
          return { ...person, average: meanScore(personPosts, topic.id), postCount: personPosts.length };
        })
        .sort((a, b) => b.average - a.average);

      return { ...topic, average, leader: leaders[0] };
    })
    .sort((a, b) => b.average - a.average);
}

export function keywordSummary(list = state.posts, limit = 14) {
  const counts = new Map();
  list.forEach((post) => {
    post.keywords.forEach((keyword) => {
      const normalized = keyword.trim();
      if (normalized.length > 2) counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export function groupByPolitician(list) {
  return politicians
    .map((person) => ({
      person,
      posts: list.filter((post) => post.politician === person.id),
    }))
    .filter((group) => group.posts.length);
}

export function mediaSplit(list) {
  return list.reduce(
    (acc, post) => {
      acc[post.type] = (acc[post.type] || 0) + 1;
      return acc;
    },
    { image: 0, video: 0 },
  );
}

export function scoredPosts(list = state.posts) {
  return list.filter((post) => topicColumns.some((topic) => scoreValue(post, topic.id) > 0));
}

export function postsByPolitician(id) {
  return state.posts.filter((post) => post.politician === id);
}

export function filteredPosts({ ignoreSearch = false } = {}) {
  const params = routeParams();
  const needle = ignoreSearch ? "" : state.query.trim().toLowerCase();
  return state.posts.filter((post) => {
    const person = politicianById(post.politician);
    const topic = params.get("topic");
    const politician = params.get("politician");
    const type = params.get("type");
    const matchesSearch =
      !needle ||
      [post.caption, post.text, post.folderId, person?.name, person?.handle, ...post.keywords]
        .join(" ")
        .toLowerCase()
        .includes(needle);

    return (
      matchesSearch &&
      (!politician || post.politician === politician) &&
      (!type || post.type === type) &&
      (!topic || scoreValue(post, topic) >= 4)
    );
  });
}

export function politicianTopicVector(personId) {
  const list = postsByPolitician(personId);
  return topicColumns.map((topic) => meanScore(list, topic.id));
}

export function coverageValue(personId, topicId, threshold = 3) {
  const list = scoredPosts(postsByPolitician(personId));
  if (!list.length) return 0;
  return list.filter((post) => scoreValue(post, topicId) >= threshold).length / list.length;
}

export function politicianCoverageVector(personId) {
  return topicColumns.map((topic) => coverageValue(personId, topic.id));
}

export function youthRanks() {
  return rankDescending(youthPriorityValues);
}

export function politicianCoverageRanks(personId) {
  return rankDescending(politicianCoverageVector(personId));
}

export function neglectedYouthRankTopics(limit = 3) {
  const youthRankValues = youthRanks();
  const politicalRanksByPerson = politicians.map((person) => politicianCoverageRanks(person.id));

  return topicColumns
    .map((topic, index) => {
      const politicalRanks = politicalRanksByPerson
        .map((ranks) => ranks[index])
        .filter((rank) => Number.isFinite(rank));
      const politicalRank = politicalRanks.length
        ? politicalRanks.reduce((sum, rank) => sum + rank, 0) / politicalRanks.length
        : Infinity;
      const youthRank = youthRankValues[index];

      return {
        ...topic,
        youthRank,
        politicalRank,
        rankGap: politicalRank - youthRank,
      };
    })
    .filter((topic) => topic.youthRank <= 10 && topic.rankGap > 0)
    .sort((a, b) => b.rankGap - a.rankGap || a.youthRank - b.youthRank)
    .slice(0, limit);
}

export function neglectedYouthRankTopicsForPolitician(personId, limit = 3) {
  const youthRankValues = youthRanks();
  const politicalRankValues = politicianCoverageRanks(personId);

  return topicColumns
    .map((topic, index) => {
      const youthRank = youthRankValues[index];
      const politicalRank = politicalRankValues[index];

      return {
        ...topic,
        youthRank,
        politicalRank,
        rankGap: politicalRank - youthRank,
      };
    })
    .filter((topic) => topic.youthRank <= 10 && topic.rankGap > 0)
    .sort((a, b) => b.rankGap - a.rankGap || a.youthRank - b.youthRank)
    .slice(0, limit);
}

export function topicVector(topicId) {
  return scoredPosts().map((post) => scoreValue(post, topicId));
}

export function topKOverlap(personId, k) {
  const youthRankValues = youthRanks();
  const youthCutoff = youthRankValues
    .slice()
    .sort((a, b) => a - b)[Math.min(k, youthRankValues.length) - 1];
  const youthTop = new Set(
    topicColumns.filter((_, index) => youthRankValues[index] <= youthCutoff).map((topic) => topic.id),
  );
  const ranks = politicianCoverageRanks(personId);
  const ordered = topicColumns.map((topic, index) => ({ id: topic.id, rank: ranks[index] })).sort((a, b) => a.rank - b.rank);
  const cutoff = ordered[Math.min(k, ordered.length) - 1]?.rank ?? Infinity;
  const politicianTop = new Set(ordered.filter((topic) => topic.rank <= cutoff).map((topic) => topic.id));
  return [...youthTop].filter((id) => politicianTop.has(id)).length;
}
