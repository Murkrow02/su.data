import { topicColumns, politicians, chartInfo } from "./config.js";
import { clamp, rankDescending, spreadTies, pearson, kendallTau, formatRank, escapeHtml } from "./utils.js";
import {
  politicianTopicVector,
  politicianCoverageVector,
  youthRanks,
  politicianCoverageRanks,
  topicVector,
  topKOverlap,
  topicSummary,
  neglectedYouthRankTopics,
  neglectedYouthRankTopicsForPolitician,
} from "./stats.js";
import { chartShell } from "./components.js";

function scoreToneLocal(value, min = 1, max = 5) {
  const ratio = clamp((value - min) / (max - min || 1), 0, 1);
  return `color-mix(in srgb, var(--red) ${Math.round(ratio * 74)}%, #fffaf2)`;
}

export function meanScoreHeatmap() {
  const values = politicians.map((person) => politicianTopicVector(person.id));
  return chartShell(
    "Heatmap",
    "Su quale topic si concentra di più ogni profilo?",
    "Ogni cella rappresenta lo score medio di un profilo per ogni topic: più è alto, più il colore si avvicina al rosso.",
    `
    <div class="heatmap" style="--cols:${topicColumns.length}">
      <div class="heatmap-corner"></div>
      ${topicColumns.map((topic) => `<div class="heatmap-label top">${escapeHtml(topic.label)}</div>`).join("")}
      ${politicians
        .map(
          (person, rowIndex) => `
        <div class="heatmap-label side">${escapeHtml(person.name.split(" ").at(-1))}</div>
        ${topicColumns
          .map((topic, colIndex) => {
            const value = values[rowIndex][colIndex];
            return `<a class="heat-cell" href="#/posts?politician=${person.id}&topic=${topic.id}" style="--cell:${scoreToneLocal(value)}"><strong>${value.toFixed(2)}</strong></a>`;
          })
          .join("")}
      `,
        )
        .join("")}
    </div>
  `,
    chartInfo.meanScore,
  );
}

export function politicianSimilarityMatrix() {
  const vectors = politicians.map((person) => rankDescending(politicianCoverageVector(person.id)));
  return chartShell(
    "Somiglianza",
    "Chi condivide la stessa gerarchia di temi?",
    "Per ogni coppia di profili si calcola lo Spearman ρ tra i loro ranking di coverage (soglia τ = 3): quanto più due politici trattano i topic nello stesso ordine di frequenza, tanto più alto è il valore. La diagonale vale sempre 1.",
    `
    <div class="matrix similarity-matrix" style="--cols:${politicians.length}">
      <div class="heatmap-corner"></div>
      ${politicians.map((person) => `<div class="heatmap-label top">${escapeHtml(person.name.split(" ").at(-1))}</div>`).join("")}
      ${politicians
        .map(
          (left, rowIndex) => `
        <div class="heatmap-label side">${escapeHtml(left.name.split(" ").at(-1))}</div>
        ${politicians
          .map((right, colIndex) => {
            const value = rowIndex === colIndex ? 1 : pearson(vectors[rowIndex], vectors[colIndex]);
            const tone = `color-mix(in srgb, #9b1c1c ${Math.round(clamp(value, 0, 1) * 82)}%, #fef2f2)`;
            return `<a class="heat-cell" href="#/politician/${right.id}" style="--cell:${tone}"><strong>${value.toFixed(2)}</strong></a>`;
          })
          .join("")}
      `,
        )
        .join("")}
    </div>
  `,
    chartInfo.similarity,
  );
}

export function topicCorrelationMatrix() {
  const vectors = topicColumns.map((topic) => topicVector(topic.id));
  return chartShell(
    "Correlazione topic",
    "Quali topic aumentano insieme negli score.",
    "La matrice usa gli score dei post: colori più forti indicano relazioni più nette tra due topic.",
    `
    <div class="matrix topic-matrix" style="--cols:${topicColumns.length}">
      <div class="heatmap-corner"></div>
      ${topicColumns.map((topic) => `<div class="heatmap-label top short">${escapeHtml(topic.label.split(" ")[0])}</div>`).join("")}
      ${topicColumns
        .map(
          (left, rowIndex) => `
        <div class="heatmap-label side short">${escapeHtml(left.label.split(" ")[0])}</div>
        ${topicColumns
          .map((right, colIndex) => {
            const value = rowIndex === colIndex ? 1 : pearson(vectors[rowIndex], vectors[colIndex]);
            const strength = Math.round(Math.abs(value) * 78);
            const color = value >= 0 ? "var(--green)" : "var(--red)";
            return `<a class="heat-cell" href="#/posts?topic=${left.id}" style="--cell:color-mix(in srgb, ${color} ${strength}%, #fffaf2)"><strong>${value.toFixed(2)}</strong></a>`;
          })
          .join("")}
      `,
        )
        .join("")}
    </div>
  `,
    chartInfo.topicCorrelation,
  );
}

export function coverageHeatmap() {
  const values = politicians.map((person) => politicianCoverageVector(person.id));
  return chartShell(
    "Copertura",
    "Quanto un topic diventa rilevante all'interno del profilo?",
    "Ogni cella indica la quota normalizzata di contenuti con score almeno 3 sul topic.",
    `
    <div class="heatmap" style="--cols:${topicColumns.length}">
      <div class="heatmap-corner"></div>
      ${topicColumns.map((topic) => `<div class="heatmap-label top">${escapeHtml(topic.label)}</div>`).join("")}
      ${politicians
        .map(
          (person, rowIndex) => `
        <div class="heatmap-label side">${escapeHtml(person.name.split(" ").at(-1))}</div>
        ${topicColumns
          .map((topic, colIndex) => {
            const value = values[rowIndex][colIndex];
            const tone = `color-mix(in srgb, var(--blue) ${Math.round(value * 76)}%, #fffaf2)`;
            return `<a class="heat-cell" href="#/posts?politician=${person.id}&topic=${topic.id}" style="--cell:${tone}"><strong>${value.toFixed(2)}</strong></a>`;
          })
          .join("")}
      `,
        )
        .join("")}
    </div>
  `,
    chartInfo.coverage,
  );
}

export function rankCorrelationBars() {
  return "";
  const base = youthRanks();
  const rows = politicians.map((person) => {
    const ranks = politicianCoverageRanks(person.id);
    return {
      person,
      spearman: pearson(base, ranks),
      kendall: kendallTau(base, ranks),
    };
  });
  return chartShell(
    "Allineamento ranking",
    "Quanto la gerarchia dei topic resta vicina alla lista giovani.",
    "Il confronto usa solo le posizioni nella lista e il ranking di copertura dei politici.",
    `
    <div class="metric-bars">
      ${rows
        .map(
          ({ person, spearman, kendall }) => `
        <div class="metric-bar-row" style="--a:${Math.max(4, ((spearman + 1) / 2) * 100)}%;--b:${Math.max(4, ((kendall + 1) / 2) * 100)}%;--c:${person.palette[2]}">
          <strong>${escapeHtml(person.name)}</strong>
          <span>Spearman ${spearman.toFixed(2)}</span>
          <div class="dual-bar"><i></i><b></b></div>
          <span>Kendall ${kendall.toFixed(2)}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `,
    chartInfo.rankCorrelation,
  );
}

export function topKOverlapBars() {
  return chartShell(
    "Overlap top-k",
    "Quali profili intercettano i primi topic della lista.",
    "Le barre contano quanti topic sono condivisi tra la lista giovani e il ranking del politico.",
    `
    <div class="overlap-bars">
      ${politicians
        .map((person) => {
          const top3 = topKOverlap(person.id, 3);
          const top5 = topKOverlap(person.id, 5);
          return `
          <a class="overlap-card" href="#/politician/${person.id}" style="--c:${person.palette[2]};--top3:${Math.min(100, (top3 / 3) * 100)}%;--top5:${Math.min(100, (top5 / 5) * 100)}%" aria-label="Apri overlap personale di ${escapeHtml(person.name)}">
            <strong>${escapeHtml(person.name)}</strong>
            <span>Top 3 condivisi: ${top3}</span>
            <div><i></i></div>
            <span>Top 5 condivisi: ${top5}</span>
            <div><b></b></div>
          </a>
        `;
        })
        .join("")}
    </div>
  `,
    chartInfo.topK,
  );
}

export function profileTopKOverlapCard(person) {
  const top3 = topKOverlap(person.id, 3);
  const top5 = topKOverlap(person.id, 5);

  return chartShell(
    "Overlap personale",
    `Quanti topic prioritari dei giovani intercetta ${person.name}?`,
    "Il confronto resta sul singolo profilo: conta quanti topic sono condivisi tra la top dei giovani e il ranking di coverage del politico.",
    `
      <div class="profile-overlap-card" style="--c:${person.palette[2]};--top3:${Math.min(100, (top3 / 3) * 100)}%;--top5:${Math.min(100, (top5 / 5) * 100)}%">
        <div class="profile-overlap-score">
          <span>Top 3 giovani</span>
          <strong>${top3}/3</strong>
        </div>
        <div class="profile-overlap-track">
          <span>Topic condivisi nella top 3</span>
          <div><i></i></div>
        </div>
        <div class="profile-overlap-score">
          <span>Top 5 giovani</span>
          <strong>${top5}/5</strong>
        </div>
        <div class="profile-overlap-track">
          <span>Topic condivisi nella top 5</span>
          <div><b></b></div>
        </div>
      </div>
    `,
    chartInfo.topK,
  );
}

export function neglectedYouthRankCard() {
  const topics = neglectedYouthRankTopics(3);
  if (!topics.length) return "";

  const rows = topics
    .map((topic) => {
      const youthPosition = clamp(((topic.youthRank - 1) / 9) * 100, 0, 100);
      const politicalPosition = clamp(((topic.politicalRank - 1) / 9) * 100, 0, 100);
      const roundedGap = Math.max(1, Math.round(topic.rankGap));
      const rankGapLabel = `-${roundedGap} ${roundedGap === 1 ? "posizione" : "posizioni"}`;

      return `
        <a class="neglected-topic-row" href="#/posts?topic=${encodeURIComponent(topic.id)}" style="--topic:${topic.color};--youth:${youthPosition}%;--political:${politicalPosition}%">
          <div class="neglected-topic-main">
            <strong>${escapeHtml(topic.label)}</strong>
            <span>Scende di ${roundedGap} ${roundedGap === 1 ? "posizione" : "posizioni"} nel ranking medio dei politici.</span>
          </div>
          <div class="neglected-rank-stats">
            <span><small>Giovani</small><b>#${formatRank(topic.youthRank)}</b></span>
            <span><small>Politici</small><b>#${formatRank(topic.politicalRank)}</b></span>
          </div>
          <div class="neglected-rank-line" aria-hidden="true">
            <span class="rank-axis-start">#1</span>
            <span class="rank-axis-end">#10</span>
            <i class="is-youth" data-label="Giovani"></i>
            <i class="is-political" data-label="Politici"></i>
          </div>
          <span class="neglected-gap">${rankGapLabel}</span>
        </a>
      `;
    })
    .join("");

  return `
    <section class="neglected-youth-card">
      <header>
        <div>
          <p class="kicker">Top 10 giovani</p>
          <h2>Priorità giovani poco discusse</h2>
        </div>
        <p>Topic alti nella top 10 giovani che scendono nella comunicazione politica.</p>
      </header>
      <div class="neglected-topic-list">${rows}</div>
    </section>
  `;
}

export function profileNeglectedYouthRankCard(person) {
  const topics = neglectedYouthRankTopicsForPolitician(person.id, 3);
  if (!topics.length) return "";

  const rows = topics
    .map((topic) => {
      const youthPosition = clamp(((topic.youthRank - 1) / 9) * 100, 0, 100);
      const politicalPosition = clamp(((topic.politicalRank - 1) / 9) * 100, 0, 100);
      const roundedGap = Math.max(1, Math.round(topic.rankGap));

      return `
        <a class="profile-neglected-topic" href="#/posts?politician=${person.id}&topic=${encodeURIComponent(topic.id)}" style="--topic:${topic.color};--youth:${youthPosition}%;--political:${politicalPosition}%">
          <div class="profile-neglected-heading">
            <span>${escapeHtml(topic.label)}</span>
            <strong>-${roundedGap}</strong>
          </div>
          <div class="profile-neglected-ranks">
            <span>Giovani #${formatRank(topic.youthRank)}</span>
            <span>${escapeHtml(person.name.split(" ").at(-1))} #${formatRank(topic.politicalRank)}</span>
          </div>
          <div class="profile-neglected-track" aria-hidden="true">
            <i class="is-youth"></i>
            <i class="is-political"></i>
          </div>
        </a>
      `;
    })
    .join("");

  return `
    <section class="profile-neglected-card" style="--c:${person.palette[2]}">
      <header>
        <p class="kicker">Gap con top 10 giovani</p>
        <h2>Priorità giovani meno presenti nel profilo</h2>
        <p>Topic che stanno più in alto per i giovani rispetto al ranking di coverage di ${escapeHtml(person.name)}.</p>
      </header>
      <div class="profile-neglected-list">${rows}</div>
    </section>
  `;
}

export function alignmentSlopegraph(personId = null) {
  const y = (rank) => 24 + ((rank - 1) / 9) * 252;
  const youthRankValues = youthRanks();
  const youthRanksSpread = spreadTies(youthRankValues);
  const selectedPoliticians = personId ? politicians.filter((person) => person.id === personId) : politicians;
  const panels = selectedPoliticians
    .map((person) => {
      const ranks = politicianCoverageRanks(person.id);
      const politicianRanksSpread = spreadTies(ranks);
      const lines = topicColumns
        .map((topic, index) => {
          const y1 = y(youthRanksSpread[index]);
          const y2 = y(politicianRanksSpread[index]);
          return `
            <line x1="150" y1="${y1}" x2="430" y2="${y2}" stroke="${topic.color}" stroke-width="2" opacity="0.72" />
            <circle cx="150" cy="${y1}" r="4" fill="${topic.color}" />
            <circle cx="430" cy="${y2}" r="4" fill="${topic.color}" />
            <text x="140" y="${y1 + 4}" text-anchor="end">${formatRank(youthRankValues[index])}. ${escapeHtml(topic.label)}</text>
            <text x="440" y="${y2 + 4}">${formatRank(ranks[index])}. ${escapeHtml(topic.label)}</text>
          `;
        })
        .join("");
      return `
        <article class="slope-panel">
          <h3>${escapeHtml(person.name)}</h3>
          <svg viewBox="0 0 590 310" role="img" aria-label="Allineamento ranking ${escapeHtml(person.name)}">
            <text x="150" y="12" text-anchor="middle" class="axis-label">Lista giovani</text>
            <text x="430" y="12" text-anchor="middle" class="axis-label">${escapeHtml(person.name.split(" ").at(-1))}</text>
            ${lines}
          </svg>
        </article>
      `;
    })
    .join("");
  const isSingleProfile = selectedPoliticians.length === 1;

  return chartShell(
    "Slopegraph",
    isSingleProfile
      ? `Quanto si allinea ${selectedPoliticians[0].name} con le priorità dei giovani?`
      : "Quanto si allineano le agende dei politici con le priorità dei giovani?",
    isSingleProfile
      ? "Ogni linea collega la posizione del topic nella lista giovani con il ranking ottenuto dai contenuti del profilo."
      : "Ogni linea collega la posizione del topic del 'Profilo giovani' con il ranking ottenuto dai contenuti del politico.",
    `<div class="slope-grid">${panels}</div>`,
    chartInfo.slopegraph,
  );
}

export function topicLeaderBars() {
  const summaries = topicSummary().slice(0, 8);
  return chartShell(
    "Leadership tematica",
    "Topic e profili guida.",
    "Per ogni topic viene mostrato il profilo con score medio più alto",
    `
    <div class="leader-bars">
      ${summaries
        .map(
          (topic) => `
        <a class="leader-bar" href="#/posts?topic=${topic.id}" style="--topic:${topic.color};--w:${topic.average <= 1 ? 0 : Math.max(8, ((topic.average - 1) / 4) * 100)}%">
          <span>${escapeHtml(topic.label)}</span>
          <div><i></i></div>
          <strong>${escapeHtml(topic.leader.name)}</strong>
        </a>
      `,
        )
        .join("")}
    </div>
  `,
    chartInfo.leadership,
  );
}
