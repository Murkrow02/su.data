import { topicColumns, politicians, politicianById, topicById, youthSurveySource, youthPriorityValues } from "./config.js";
import { state } from "./state.js";
import { app, searchInput } from "./dom.js";
import { escapeHtml, clamp, pearson, kendallTau } from "./utils.js";
import {
  postsByPolitician,
  topicSummary,
  keywordSummary,
  filteredPosts,
  scoredPosts,
  groupByPolitician,
  scoreValue,
  topScores,
  youthRanks,
  politicianCoverageRanks,
  topKOverlap,
} from "./stats.js";
import { routeParams, hrefWithPage } from "./router.js";
import {
  pageShell,
  topicPill,
  keywordCloud,
  postCard,
  miniPostRow,
  postTile,
  postGroup,
  pagination,
  topicMeter,
  landingEntryPanel,
  landingKeywordMap,
  highlightText,
} from "./components.js";
import InstaEmbedder from "./insta-embedder.js";
import {
  meanScoreHeatmap,
  politicianSimilarityMatrix,
  topicCorrelationMatrix,
  coverageHeatmap,
  topKOverlapBars,
  alignmentSlopegraph,
  topicLeaderBars,
  neglectedYouthRankCard,
  profileNeglectedYouthRankCard,
  profileTopKOverlapCard,
} from "./charts.js";

export function setActiveNav(route) {
  if (route !== "/about" && window.__researchScrollCleanup) window.__researchScrollCleanup();
  document.querySelectorAll(".nav a").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.link === route);
  });
}

export function renderLoading() {
  app.innerHTML = `
    <section class="page-heading">
      <p class="kicker">Caricamento</p>
      <h1>Sto leggendo dataset e score.</h1>
      <p>Sto preparando post, testi estratti e score tematici per costruire le viste di analisi.</p>
    </section>
  `;
}

export function renderError() {
  app.innerHTML = pageShell(
    "Errore dati",
    "Il sito non riesce a leggere i file locali.",
    `Avvia il server dalla root del progetto. Dettaglio: ${state.loadError}`,
    "",
  );
}

export function renderLanding() {
  setActiveNav("/");
  const hotTopics = topicSummary().slice(0, 4);
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="kicker">Osservatorio agenda giovani-politica</p>
        <h1>Quanto la comunicazione politica intercetta le priorità dei giovani?</h1>
        <p>
          Su.Data permette di esplorare le priorità comunicative sui social dei principali politici italiani.
        </p>
        <div class="hero-actions">
          <a class="button primary" href="#/overview">Inizia dalla panoramica</a>
          <a class="button ghost" href="#/about">Leggi il metodo</a>
        </div>
      </div>
      ${landingEntryPanel()}
    </section>

    <section class="method-strip">
      <article>
        <span>01</span>
        <h2>Dal contenuto al testo</h2>
        <p>Ogni post conserva caption, OCR delle immagini e trascrizione audio dei video quando disponibile.</p>
      </article>
      <article>
        <span>02</span>
        <h2>Dallo score ai topic</h2>
        <p>Il contenuto dei post viene analizzato e classificato su dieci topic tematici, con score ordinale 1-5 per ogni tema ed estrazione di keyword.</p>
      </article>
      <article>
        <span>03</span>
        <h2>Analisi e confronti</h2>
        <p>Coverage, ranking e correlazioni mostrano dove politica e priorità giovanili si avvicinano o divergono.</p>
      </article>
    </section>

    <section class="landing-section-intro">
      <p class="kicker">Percorsi possibili</p>
      <h2>I temi più presenti sono una porta d'ingresso: apri grafici, profili e post per controllare il dato.</h2>
    </section>

    <section class="impact-grid">
      ${hotTopics
        .map(
          (topic) => `
        <a class="impact-card" href="#/posts?topic=${topic.id}" style="--topic:${topic.color}">
          <span>Topic caldo</span>
          <h2>${escapeHtml(topic.label)}</h2>
          <p>Guida: <strong>${escapeHtml(topic.leader.name)}</strong></p>
        </a>
      `,
        )
        .join("")}
    </section>

    ${landingKeywordMap()}
  `;
}

export function renderAbout() {
  setActiveNav("/about");
  if (window.__researchScrollCleanup) window.__researchScrollCleanup();

  const youthItems = topicColumns.map((topic, index) => ({
    ...topic,
    value: youthPriorityValues[index],
    rank: index + 1,
  }));

  const topYouthItems = youthItems.slice(0, 5);
  const allTopics = youthItems
    .map(
      (topic, index) => `
        <li style="--topic:${topic.color}; --w:${Math.round(topic.value * 100)}%">
          <span class="research-topic-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="research-topic-dot"></span>
          <strong>${escapeHtml(topic.label)}</strong>
          <em>${Math.round(topic.value * 100)}%</em>
          <span class="research-topic-bar"><i></i></span>
        </li>
      `,
    )
    .join("");

  const kf = (latex, display = true) =>
    window.katex
      ? window.katex.renderToString(latex, { throwOnError: false, displayMode: display })
      : (display ? `<code>\\[${latex}\\]</code>` : `<code>\\(${latex}\\)</code>`);

  const phase4Profiles = [
    { id: "schlein", name: "Elly Schlein", short: "Schlein", n: 233, color: "#d63030", soft: "rgba(214, 48, 48, 0.1)" },
    { id: "conte", name: "Giuseppe Conte", short: "Conte", n: 231, color: "#c58b00", soft: "rgba(232, 168, 0, 0.16)" },
    { id: "meloni", name: "Giorgia Meloni", short: "Meloni", n: 278, color: "#1a3470", soft: "rgba(26, 52, 112, 0.12)" },
  ];
  const phase4Topics = [
    { id: "ambiente", label: "Ambiente", full: "Ambiente e clima", youth: 1, color: "#be4a2f" },
    { id: "lavoro", label: "Lavoro", full: "Lavoro e economia", youth: 2, color: "#8b5d2e" },
    { id: "costo", label: "Costo vita", full: "Costo della vita", youth: 3.5, color: "#be4a2f" },
    { id: "salute", label: "Salute", full: "Salute e welfare", youth: 3.5, color: "#3f6ea8" },
    { id: "istruzione", label: "Istruzione", full: "Istruzione e formazione", youth: 5, color: "#6f57a8" },
    { id: "uguaglianza", label: "Uguaglianza", full: "Uguaglianza di genere", youth: 6, color: "#bb4f7e" },
    { id: "difesa", label: "Difesa", full: "Difesa e sicurezza", youth: 7, color: "#495057" },
    { id: "immigrazione", label: "Immigrazione", full: "Immigrazione", youth: 8.5, color: "#197278" },
    { id: "democrazia", label: "Democrazia", full: "Democrazia e legalità", youth: 8.5, color: "#253f72" },
    { id: "abitazione", label: "Abitazione", full: "Abitazione", youth: 10, color: "#cc7a00" },
  ];
  const phase4Alignment = [
    { profile: "schlein", spearman: "+0,19", spearmanCi: "[+0,07; +0,36]", kendall: "+0,20", kendallCi: "[+0,09; +0,30]", j: "0,25 / 0,43" },
    { profile: "conte", spearman: "+0,09", spearmanCi: "[−0,01; +0,28]", kendall: "+0,07", kendallCi: "[+0,02; +0,20]", j: "0,25 / 0,43" },
    { profile: "meloni", spearman: "+0,01", spearmanCi: "[−0,07; +0,30]", kendall: "+0,05", kendallCi: "[−0,05; +0,25]", j: "0,25 / 0,25" },
  ];
  const phase4Forest = {
    spearman: [
      { profile: "schlein", value: 0.19, low: 0.06, high: 0.34 },
      { profile: "conte", value: 0.09, low: -0.01, high: 0.28 },
      { profile: "meloni", value: 0.01, low: -0.09, high: 0.27 },
    ],
    kendall: [
      { profile: "schlein", value: 0.20, low: 0.11, high: 0.30 },
      { profile: "conte", value: 0.07, low: 0.02, high: 0.20 },
      { profile: "meloni", value: 0.05, low: -0.07, high: 0.21 },
    ],
  };
  const phase4Coverage = {
    schlein: { ambiente: 6.9, lavoro: 35.5, costo: 20.5, salute: 22.5, istruzione: 11.4, uguaglianza: 9.8, difesa: 19.7, immigrazione: 6.0, democrazia: 53.6, abitazione: 6.0 },
    conte: { ambiente: 6.5, lavoro: 42.4, costo: 32.0, salute: 29.9, istruzione: 15.6, uguaglianza: 1.7, difesa: 34.6, immigrazione: 4.3, democrazia: 50.6, abitazione: 6.9 },
    meloni: { ambiente: 7.6, lavoro: 31.2, costo: 5.5, salute: 7.3, istruzione: 5.2, uguaglianza: 1.2, difesa: 31.8, immigrazione: 7.9, democrazia: 36.7, abitazione: 2.4 },
  };
  const phase4Ranks = {
    schlein: { ambiente: 9, lavoro: 2, costo: 4, salute: 3, istruzione: 6, uguaglianza: 7, difesa: 5, immigrazione: 8, democrazia: 1, abitazione: 10 },
    conte: { ambiente: 8, lavoro: 2, costo: 4, salute: 5, istruzione: 6, uguaglianza: 10, difesa: 3, immigrazione: 9, democrazia: 1, abitazione: 7 },
    meloni: { ambiente: 6, lavoro: 3, costo: 7, salute: 5, istruzione: 8, uguaglianza: 10, difesa: 2, immigrazione: 4, democrazia: 1, abitazione: 9 },
  };
  const formatDecimal = (value) => (value > 0 ? "+" : value < 0 ? "−" : "") + Math.abs(value).toFixed(2).replace(".", ",");
  const phase4Profile = (id) => phase4Profiles.find((profile) => profile.id === id);
  const phase4Rank = (value) => String(value).replace(".", ",");
  const phase4X = (value) => 60 + ((value + 0.5) / 1) * 300;
  const phase4Y = (rank) => 28 + ((rank - 1) / 9) * 244;
  const phase4TieOffset = (items, item, rankOf) => {
    const tied = items.filter((candidate) => rankOf(candidate) === rankOf(item));
    if (tied.length <= 1) return 0;
    return (tied.findIndex((candidate) => candidate.id === item.id) - (tied.length - 1) / 2) * 13;
  };

  const phase4AlignmentTable = () => `
    <table class="int4-alignment-table">
      <thead>
        <tr><th>Politico</th><th>Spearman ρ <span>CI 95%</span></th><th>Kendall τ<sub>b</sub> <span>CI 95%</span></th><th>J<sub>3</sub> / J<sub>5</sub></th></tr>
      </thead>
      <tbody>
        ${phase4Alignment
          .map((row) => {
            const profile = phase4Profile(row.profile);
            return `
              <tr style="--profile:${profile.color};--soft:${profile.soft}">
                <td><strong>${profile.name}</strong><span>N=${profile.n}</span></td>
                <td><b>${row.spearman}</b> <em>${row.spearmanCi}</em></td>
                <td><b>${row.kendall}</b> <em>${row.kendallCi}</em></td>
                <td><b>${row.j}</b></td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  const phase4ForestPlot = () => `
    <div class="int4-forest-card">
      <header><span>Bootstrap CI 95%</span><strong>resampling sui post · B=2000</strong></header>
      <div class="int4-forest-panels">
        ${[
          ["Spearman ρ", phase4Forest.spearman, phase4X, [-0.5, 0, 0.5]],
          ["Kendall τ_b", phase4Forest.kendall, (v) => 60 + ((v + 0.25) / 0.8) * 300, [-0.2, 0, 0.2, 0.4]],
        ]
          .map(
            ([title, rows, xFn, ticks]) => {
              const isKendall = title.includes("Kendall");
              return `
              <section class="int4-forest-panel ${isKendall ? "int4-forest-panel--kendall" : ""}">
                <h3>${title}</h3>
                <svg viewBox="0 0 430 220" role="img" aria-label="${title} con intervalli bootstrap">
                  <line class="zero" x1="${xFn(0)}" y1="22" x2="${xFn(0)}" y2="164"></line>
                  <line class="axis" x1="${xFn(ticks[0])}" y1="164" x2="${xFn(ticks[ticks.length - 1])}" y2="164"></line>
                  ${ticks.map((tick) => `<text class="tick" x="${xFn(tick)}" y="190" text-anchor="middle">${formatDecimal(tick)}</text>`).join("")}
                  ${rows
                    .map((row, index) => {
                      const profile = phase4Profile(row.profile);
                      const y = 42 + index * 52;
                      return `
                        <text class="name" x="4" y="${y + 4}">${profile.short}</text>
                        <line x1="${xFn(row.low)}" y1="${y}" x2="${xFn(row.high)}" y2="${y}" stroke="${profile.color}" stroke-width="5" stroke-linecap="round"></line>
                        <circle cx="${xFn(row.value)}" cy="${y}" r="7" fill="${profile.color}"></circle>
                        <text class="value" x="${xFn(row.high) + 14}" y="${y + 4}">${formatDecimal(row.value)} [${formatDecimal(row.low)}; ${formatDecimal(row.high)}]</text>
                      `;
                    })
                    .join("")}
                </svg>
              </section>
            `;
            },
          )
          .join("")}
      </div>
    </div>
  `;

  const phase4Slopegraph = () => `
    <div class="int4-slope-grid">
      ${["schlein", "meloni", "conte"]
        .map((profileId) => {
          const profile = phase4Profile(profileId);
          return `
            <article class="int4-slope-panel" style="--profile:${profile.color}">
              <h3>${profile.name}</h3>
              <svg viewBox="0 0 360 322" role="img" aria-label="Slopegraph ${profile.name}">
                <text class="axis-label" x="96" y="18" text-anchor="middle">Giovani</text>
                <text class="axis-label" x="264" y="18" text-anchor="middle">${profile.short}</text>
                <line class="axis-line" x1="96" y1="28" x2="96" y2="272"></line>
                <line class="axis-line" x1="264" y1="28" x2="264" y2="272"></line>
                ${phase4Topics
                  .map((topic) => {
                    const youthOffset = phase4TieOffset(phase4Topics, topic, (candidate) => candidate.youth);
                    const polOffset = phase4TieOffset(phase4Topics, topic, (candidate) => phase4Ranks[profileId][candidate.id]);
                    const youthY = phase4Y(topic.youth) + youthOffset;
                    const polY = phase4Y(phase4Ranks[profileId][topic.id]) + polOffset;
                    const focus = ["ambiente", "democrazia"].includes(topic.id);
                    const color = focus ? topic.color : "rgba(24,23,19,0.22)";
                    return `
                      <line x1="96" y1="${youthY}" x2="264" y2="${polY}" stroke="${color}" stroke-width="${focus ? 4 : 1.5}" opacity="${focus ? 0.95 : 0.7}"></line>
                      <circle cx="96" cy="${youthY}" r="${focus ? 4.8 : 2.8}" fill="${color}"></circle>
                      <circle cx="264" cy="${polY}" r="${focus ? 4.8 : 2.8}" fill="${color}"></circle>
                      <text class="${focus ? "topic focus" : "topic"}" x="88" y="${youthY + 4}" text-anchor="end">${phase4Rank(topic.youth)} ${topic.label}</text>
                      <text class="${focus ? "topic focus" : "topic"}" x="272" y="${polY + 4}">${phase4Rank(phase4Ranks[profileId][topic.id])} ${topic.label}</text>
                    `;
                  })
                  .join("")}
              </svg>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  const phase4Heatmap = ({ highlights = false } = {}) => `
    <div class="int4-heatmap" style="--cols:${phase4Topics.length}">
      <div class="int4-heat-corner"></div>
      ${phase4Topics.map((topic) => `<div class="int4-heat-rank">${phase4Rank(topic.youth)}</div>`).join("")}
      <div class="int4-heat-corner small">Politico</div>
      ${phase4Topics.map((topic) => `<div class="int4-heat-label">${topic.label}</div>`).join("")}
      ${phase4Profiles
        .map(
          (profile) => `
            <div class="int4-heat-side" style="--profile:${profile.color}">${profile.short}</div>
            ${phase4Topics
              .map((topic) => {
                const value = phase4Coverage[profile.id][topic.id];
                const special =
                  highlights &&
                  ((profile.id === "meloni" && ["difesa", "immigrazione"].includes(topic.id)) ||
                    (["schlein", "conte"].includes(profile.id) && topic.id === "democrazia"));
                const tone = `color-mix(in srgb, var(--blue) ${Math.round((value / 100) * 76)}%, #fffaf2)`;
                return `<div class="int4-heat-cell ${special ? "is-highlight" : ""}" style="--cell:${tone};--profile:${profile.color}"><strong>${Math.round(value)}%</strong>${special ? `<em>${profile.id === "meloni" && topic.id === "difesa" ? "#2" : profile.id === "meloni" ? "più alta" : "#1"}</em>` : ""}</div>`;
              })
              .join("")}
          `,
        )
        .join("")}
    </div>
  `;

  const phase4CaseBars = ({ topicId, max, ticks, warning = "" }) => {
    const topic = phase4Topics.find((t) => t.id === topicId);
    const rows = {
      ambiente: [
        { profile: "schlein", n: 498, value: 6.83, low: 4.93, high: 9.39, rank: "#8" },
        { profile: "conte", n: 472, value: 5.72, low: 3.96, high: 8.19, rank: "#8" },
        { profile: "meloni", n: 330, value: 6.97, low: 4.69, high: 10.24, rank: "#6" },
      ],
      democrazia: [
        { profile: "schlein", n: 498, value: 56.63, low: 52.24, high: 60.91, rank: "#1" },
        { profile: "conte", n: 472, value: 49.15, low: 44.67, high: 53.65, rank: "#1" },
        { profile: "meloni", n: 330, value: 36.67, low: 31.65, high: 41.99, rank: "#1" },
      ],
    }[topicId];
    const youthInfo = topicId === "ambiente" ? "#1 Posto" : "#8,5 Posto";
    const yTop = 70;
    const yBaseline = 460;
    const xStart = 130;
    const xEnd = 760;
    const chartH = yBaseline - yTop;
    const yFor = (v) => yBaseline - (v / max) * chartH;
    const colW = (xEnd - xStart) / rows.length;
    const fmt = (v) => v.toFixed(1).replace(".", ",");
    return `
      <div class="int4-case-card">
        <header class="int4-case-header">
          <div class="int4-case-heading">
            <span class="int4-case-eyebrow">Coverage Rate · CI 95% Wilson · soglia τ ≥ 3</span>
            <strong class="int4-case-topic">${topic.full}</strong>
          </div>
          <div class="int4-case-youth"><em>Rank giovani</em><b>${youthInfo}</b></div>
        </header>
        <div class="int4-case-chart">
          <svg viewBox="0 0 800 580" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Coverage Rate ${topic.full}">
            ${ticks
              .map((pct) => `
                <line class="case-grid" x1="${xStart}" y1="${yFor(pct)}" x2="${xEnd}" y2="${yFor(pct)}" />
                <text class="case-ytick" x="${xStart - 14}" y="${yFor(pct) + 6}" text-anchor="end">${pct}%</text>
              `)
              .join("")}
            <line class="case-axis" x1="${xStart}" y1="${yTop}" x2="${xStart}" y2="${yBaseline}" />
            <line class="case-axis" x1="${xStart}" y1="${yBaseline}" x2="${xEnd}" y2="${yBaseline}" />
            ${rows
              .map((row, i) => {
                const cx = xStart + colW / 2 + i * colW;
                const yVal = yFor(row.value);
                const yLow = yFor(row.low);
                const yHigh = yFor(row.high);
                const profile = phase4Profile(row.profile);
                const barW = Math.min(116, colW * 0.55);
                return `
                  <rect class="case-bar" x="${cx - barW / 2}" y="${yVal}" width="${barW}" height="${yBaseline - yVal}" fill="${profile.color}" />
                  <line class="case-whisker" x1="${cx}" y1="${yLow}" x2="${cx}" y2="${yHigh}" />
                  <line class="case-whisker-cap" x1="${cx - 18}" y1="${yLow}" x2="${cx + 18}" y2="${yLow}" />
                  <line class="case-whisker-cap" x1="${cx - 18}" y1="${yHigh}" x2="${cx + 18}" y2="${yHigh}" />
                  <text class="case-bar-value" x="${cx}" y="${yHigh - 18}" text-anchor="middle">${fmt(row.value)}%</text>
                  <text class="case-bar-ci" x="${cx}" y="${yHigh - 40}" text-anchor="middle">[${fmt(row.low)}–${fmt(row.high)}]</text>
                  <text class="case-bar-name" x="${cx}" y="${yBaseline + 42}" text-anchor="middle">${profile.short}</text>
                  <text class="case-bar-meta" x="${cx}" y="${yBaseline + 76}" text-anchor="middle">Rank ${row.rank} · n=${row.n}</text>
                `;
              })
              .join("")}
          </svg>
        </div>
        ${warning ? `<p class="int4-case-warning"><strong>!</strong> ${warning}</p>` : ""}
      </div>
    `;
  };

  const speakerSlides = [
    {
      eyebrow: "01 / Domanda di ricerca",
      title: "La comunicazione social dei politici italiani è allineata alle priorità giovanili?",
      tone: "question",
      copy: `
        <p>La distanza tra giovani e politica viene spesso raccontata in modo qualitativo, attraverso impressioni o esempi isolati. Noi abbiamo provato a trattarla come un problema di misura.</p>
        <p>Non ci siamo limitati a dire che giovani e politica sembrano distanti: ci siamo chiesti se questa distanza si vede anche nell'ordine dei temi che emergono dai dati.</p>
      `,
      aside: `
        <div class="research-question-card big">
          <span>Domanda di ricerca</span>
          <div class="question-vs-asym">
            <div class="pole pole-a">
              <strong>Agenda comunicativa</strong>
              <small>cosa pubblicano i leader su Instagram</small>
            </div>
            <div class="vs-circle">vs</div>
            <div class="pole pole-b">
              <strong>Priorità giovanili</strong>
              <small>cosa dichiarano i giovani 16-30</small>
            </div>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "02 / Il concetto chiave",
      title: "Il gap semantico è la distanza tra due classifiche di temi, non un giudizio sui politici.",
      tone: "compare",
      copy: `
        <p>Da una parte c'è la classifica delle priorità giovanili: l'ordine dei temi che i giovani italiani tra 16 e 30 anni indicano come più importanti.</p>
        <p>Dall'altra c'è la classifica dell'agenda comunicativa: i temi più presenti nei post Instagram dei leader analizzati.</p>
      `,
      aside: `
        <div class="research-compare">
          <article><span>Classifica A</span><strong>Priorità giovanili</strong><p>Temi ordinati per percentuale di selezione nel Flash Eurobarometro, giovani 16-30 anni.</p></article>
          <article><span>Classifica B</span><strong>Agenda comunicativa</strong><p>Temi ordinati per coverage nei post Instagram dei leader analizzati.</p></article>
          <article class="research-compare-gap"><span>Gap semantico</span><strong>Distanza tra le due gerarchie</strong><p>Misurabile con metriche ordinali: Spearman, Kendall, Top-K Jaccard.</p></article>
        </div>
      `,
    },
    {
      eyebrow: "03 / La fonte",
      title: "Il Flash Eurobarometro EP013EP produce una classifica diretta di priorità politiche per i giovani.",
      tone: "source",
      copy: `
        <p>La domanda Q2 chiede ai giovani: <em>"Tra i seguenti, quali tre temi dovrebbero essere affrontati come priorità dall'Unione Europea nei prossimi cinque anni?"</em> È una domanda pick top-3 su lista chiusa.</p>
        <p>Per ogni tema sappiamo quale percentuale di giovani italiani lo ha selezionato. È la fonte più recente e direttamente trasformabile in ranking.</p>
      `,
      aside: `
        <div class="research-source-stack">
          <div class="research-source-card">
            <span>Fonte adottata</span>
            <strong>Flash Eurobarometer EP013EP</strong>
            <p>${escapeHtml(youthSurveySource)}</p>
            <small>Domanda Q2 — pick top-3 su lista chiusa</small>
          </div>
          <div class="research-source-rejected">
            <span>Fonte considerata e scartata</span>
            <strong>ISTAT — Aspetti della vita quotidiana 2023</strong>
            <p>Quadro ampio sulla condizione giovanile, ma troppo disperso: non produce una classifica esplicita di priorità politiche direttamente confrontabile con un'agenda comunicativa.</p>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "04 / Il ranking giovanile",
      title: "Ambiente e clima al primo posto con il 46%.",
      tone: "ranking",
      copy: `
        <p>Ordinando le percentuali di selezione otteniamo il ranking di riferimento. Lavoro ed economia è secondo al 38%; costo della vita e salute e welfare condividono il terzo posto al 34%. I pareggi vengono trattati con il rank medio.</p>
        <p>Questa gerarchia è il benchmark con cui confrontiamo l'agenda comunicativa di ciascun profilo analizzato.</p>
      `,
      aside: `
        <ol class="research-rank-preview">
          ${topYouthItems
            .map(
              (topic) => `
                <li style="--topic:${topic.color}; --w:${Math.round(topic.value * 100)}%">
                  <span>${topic.rank}</span>
                  <strong>${escapeHtml(topic.label)}</strong>
                  <em>${Math.round(topic.value * 100)}%</em>
                  <i></i>
                </li>
              `,
            )
            .join("")}
        </ol>
      `,
    },
    {
      eyebrow: "05 / Ranking, non percentuali",
      title: "Stessa griglia di dieci temi su entrambi i lati. E confrontiamo i ranking, non le percentuali.",
      tone: "topics",
      copy: `
        <p>Le percentuali Eurobarometro e i Coverage Rate dei post non sono numeri direttamente comparabili: scale diverse, unità diverse. L'unico livello davvero comune è quello ordinale.</p>
        <p>Per questo l'analisi confronta il <strong>ranking</strong> dei dieci temi su entrambi i lati. Una posizione, non una percentuale.</p>
      `,
      aside: `
        <ul class="research-topic-list">
          ${allTopics}
        </ul>
      `,
    },
    {
      eyebrow: "06 / Il campo di osservazione",
      title: "Instagram è il primo canale digitale per l'informazione politica tra i giovani italiani di 16-30 anni.",
      tone: "roster",
      copy: `
        <p>Lo indica l'Eurobarometro EP013EP. TikTok è comparabile, ma i contenuti dei politici italiani vengono spesso pubblicati in cross-posting: Instagram cattura la maggior parte del segnale comunicativo rivolto al pubblico giovane.</p>
        <p>I profili analizzati sono i leader dei tre partiti più votati alle elezioni politiche del 2022, con volumi di attività confrontabili.</p>
      `,
      aside: `
        <div class="research-roster-mini">
          ${politicians
            .filter((person) => ["giorgiameloni", "ellyesse", "giuseppeconte_ufficiale"].includes(person.id))
            .map(
              (person) => `
                <article style="--photo:url('${person.photo}'); --accent:${person.palette[1]}">
                  <span></span>
                  <div>
                    <strong>${escapeHtml(person.name)}</strong>
                    <em>${escapeHtml(person.party)}</em>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
      `,
    },
    {
      eyebrow: "07 / Lo scraping",
      title: "Abbiamo raccolto tutto quello che è disponibile pubblicamente. Tranne l'engagement.",
      tone: "scrape",
      copy: `
        <p>Per ciascun profilo abbiamo scaricato i post pubblicati nella finestra di osservazione: caption, immagini, video, metadati pubblici e i numeri di like e visualizzazioni dichiarati pubblicamente da ogni post.</p>
        <p>Quello che resta fuori è l'<em>engagement interno</em>: i dati demografici di chi interagisce, ad esempio la percentuale di giovani 16-30 che mette like a un post. Questi dati sono visibili soltanto al titolare dell'account dentro Instagram Insights e non sono accessibili dall'esterno.</p>
      `,
      aside: `
        <div class="research-scrape-card big">
          <span>Cosa entra nell'analisi</span>
          <ul class="scrape-list">
            <li class="ok"><b>Caption</b><em>testo della descrizione del post</em></li>
            <li class="ok"><b>Immagini</b><em>tutte le slide del carousel</em></li>
            <li class="ok"><b>Video</b><em>reel completi</em></li>
            <li class="ok"><b>Metadati pubblici</b><em>data, tipo, ID, like e view dichiarati</em></li>
            <li class="no"><b>Engagement interno</b><em>demografia di chi interagisce: solo Instagram Insights</em></li>
          </ul>
        </div>
      `,
    },
    {
      eyebrow: "08 / Estrazione del messaggio",
      title: "Da quei file abbiamo estratto il messaggio: testo dalle immagini, parlato dai video.",
      tone: "extract",
      copy: `
        <p>Su Instagram il messaggio politico spesso non è nella caption: è in una grafica, in una card informativa o nel parlato di un reel.</p>
        <p>Abbiamo usato modelli di riconoscimento per leggere il testo presente nelle immagini e per trascrivere l'audio dei video. Ogni post viene così ridotto a un unico testo unificato pronto per l'analisi tematica.</p>
      `,
      aside: `
        <div class="research-pipeline-card">
          <span>Estrazione</span>
          <div class="pipeline-flow">
            <div class="pipe-node"><b>Caption</b><i>già testo</i><em>scaricata direttamente</em></div>
            <div class="pipe-node"><b>Immagine</b><i>OCR</i><em>testo nelle grafiche</em></div>
            <div class="pipe-node"><b>Video</b><i>ASR</i><em>parlato trascritto</em></div>
          </div>
          <div class="pipe-merge">
            <b>Testo unificato del post</b>
            <em>→ pronto per lo scoring tematico</em>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "09 / Scelte non utilizzate",
      title: "Avevamo considerato un approccio basato su topic emersi automaticamente.<br><span class=\"title-break\">Non funzionava.</span>",
      tone: "decision",
      copy: `
        <p>L'idea iniziale era far emergere i topic dai post tramite BERT e poi confrontarli con i temi della survey via similarità coseno.</p>
        <p>Ma BERT raggruppa parole e topic in modo troppo rigido: la similarità coseno tra i topic emersi e quelli dell'Eurobarometro restituiva valori instabili e poco interpretabili. Per questo abbiamo abbandonato la strada del calcolo metrico via embedding.</p>
      `,
      aside: `
        <div class="research-decision-grid">
          <article>
            <span>Provato</span>
            <strong>BERT + similarità coseno</strong>
            <p>Topic raggruppati rigidamente; il confronto semantico con i temi Eurobarometro non funziona in modo affidabile.</p>
          </article>
          <article class="is-chosen">
            <span>Adottato</span>
            <strong>Scoring LLM su griglia fissa</strong>
            <p>Punteggio Likert 1–5 sui dieci temi Eurobarometro per ogni post: stesso vocabolario su entrambi i lati.</p>
          </article>
        </div>
      `,
    },
    {
      eyebrow: "10 / L'esito più sorprendente",
      title: "Ambiente e clima è il tema #1 per i giovani. Per i tre leader scivola tra il rank 6 e il rank 9.",
      tone: "result",
      copy: `
        <p>È l'inversione più netta dell'analisi: il tema in cima alla classifica giovanile, scelto dal 46% dei rispondenti, finisce sistematicamente nella metà bassa delle agende comunicative.</p>
        <p>E lo specchio: <strong>democrazia e legalità</strong>, che tra i giovani è solo al rank 8.5, è in vetta a tutti e tre i profili.</p>
      `,
      aside: `
        <div class="research-result-card">
          <article class="result-block under">
            <span class="result-tag">Sotto-rappresentato</span>
            <strong class="result-topic">Ambiente e clima</strong>
            <div class="result-row">
              <div class="rank-cell youth">
                <em>Giovani</em>
                <b>#1</b>
                <small>46%</small>
              </div>
              <span class="rank-arrow">↘</span>
              <div class="rank-cell pol">
                <em>Politici</em>
                <div class="rank-stack">
                  <span><i>Meloni</i><b>#6</b></span>
                  <span><i>Conte</i><b>#8</b></span>
                  <span><i>Schlein</i><b>#9</b></span>
                </div>
              </div>
            </div>
          </article>
          <article class="result-block over">
            <span class="result-tag">Sovra-rappresentato</span>
            <strong class="result-topic">Democrazia e legalità</strong>
            <div class="result-row">
              <div class="rank-cell youth low">
                <em>Giovani</em>
                <b>#8.5</b>
                <small>15%</small>
              </div>
              <span class="rank-arrow">↗</span>
              <div class="rank-cell pol high">
                <em>Politici</em>
                <div class="rank-stack">
                  <span><i>Schlein</i><b>#1</b></span>
                  <span><i>Conte</i><b>#1</b></span>
                  <span><i>Meloni</i><b>#1</b></span>
                </div>
              </div>
            </div>
          </article>
        </div>
      `,
    },
    {
      eyebrow: "",
      title: "Capiamo come abbiamo fatto.",
      tone: "intermission",
      copy: `<p>Le fasi successive del progetto.</p>`,
      aside: ``,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 01",
      title: "Cinque stadi. Lo scoring biforca verso validazione e analisi.",
      tone: "pipe-overview",
      copy: ``,
      aside: `
        <div class="int2-pipeline-bar">
          <div class="int2-stage">
            <span>Stadio 1</span>
            <b>Scraping</b>
            <em>Instaloader</em>
          </div>
          <div class="int2-arrow">→</div>
          <div class="int2-stage">
            <span>Stadio 2</span>
            <b>OCR + ASR</b>
            <em>Tesseract · Whisper</em>
          </div>
          <div class="int2-arrow">→</div>
          <div class="int2-stage int2-stage--key">
            <span>Stadio 3</span>
            <b>Scoring LLM</b>
            <em>Ollama · locale</em>
          </div>
          <div class="int2-arrow int2-arrow--fork">
            <span>↗</span>
            <span>↘</span>
          </div>
          <div class="int2-stage-stack">
            <div class="int2-stage">
              <span>Stadio 4</span>
              <b>Validazione</b>
              <em>vs annotatori umani</em>
            </div>
            <div class="int2-stage">
              <span>Stadio 5</span>
              <b>Analisi finale</b>
              <em>Coverage + ranking</em>
            </div>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 02",
      title: "Stadio 1 — Instaloader. Solo contenuti pubblici.",
      tone: "pipe-scrape",
      copy: ``,
      aside: `
        <div class="int2-scrape-grid">
          <div class="int2-code-block">
            <div class="int2-code-header">
              <span>Output JSON</span>
              <b>per ogni post</b>
            </div>
            <pre>{
  "folder_id" : "2025-09-01_001",
  "caption"   : "Oggi al Senato...",
  "type"      : "video"
}</pre>
          </div>
          <div class="int2-meta-stack">
            <article class="int2-meta-card ok">
              <b>Contenuti pubblici</b>
              <em>caption · immagine · video · metadati</em>
            </article>
            <article class="int2-meta-card ok">
              <b>GDPR compliant</b>
              <em>account politici pubblici · niente profiling</em>
            </article>
            <article class="int2-meta-card no">
              <b>Esclusi</b>
              <em>follower · commenti · engagement interno</em>
            </article>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 03",
      title: "Stadio 2 — Tre input convergono in un unico testo.",
      tone: "pipe-extract",
      copy: ``,
      aside: `
        <div class="int2-merge-grid">
          <div class="int2-merge-inputs">
            <div class="int2-input-row">
              <span class="int2-tag">CAP</span>
              <div>
                <b>Caption</b>
                <em>già testo · scaricata diretta</em>
              </div>
            </div>
            <div class="int2-input-row">
              <span class="int2-tag">OCR</span>
              <div>
                <b>Immagine</b>
                <em>Tesseract · slogan e infografiche</em>
              </div>
            </div>
            <div class="int2-input-row">
              <span class="int2-tag">ASR</span>
              <div>
                <b>Video</b>
                <em>faster-whisper large-v3-turbo</em>
              </div>
            </div>
          </div>
          <div class="int2-merge-arrow">→</div>
          <div class="int2-merge-output">
            <span>Output unificato</span>
            <b>Testo del post</b>
            <em>pronto per scoring tematico</em>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 04",
      title: "Stadio 3 — Una chiamata, dieci score. Locale.",
      tone: "pipe-scoring",
      copy: ``,
      aside: `
        <div class="int2-scoring-flow">
          <article class="int2-flow-step">
            <span>Input</span>
            <b>Prompt</b>
            <p>"Analizza · score 1–5 per ogni tema · output JSON valido"</p>
            <small>10 temi Eurobarometro</small>
          </article>
          <div class="int2-arrow">→</div>
          <article class="int2-flow-step int2-flow-step--key">
            <span>Engine</span>
            <b>Ollama locale</b>
            <p>nessuna API esterna · privacy garantita</p>
            <small>temperature = 0</small>
          </article>
          <div class="int2-arrow">→</div>
          <article class="int2-flow-step">
            <span>Output</span>
            <b>JSON multi-tema</b>
            <pre>{
  "ambiente_clima"     : 1,
  "lavoro_economia"    : 4,
  "democrazia_legalita": 3,
  ...
}</pre>
          </article>
        </div>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 05",
      title: "Scala Likert 1–5. Asimmetrica e deterministica.",
      tone: "pipe-likert",
      copy: ``,
      aside: `
        <div class="int2-likert-bar">
          <div class="int2-likert-step int2-likert--1">
            <b>1</b>
            <em>completamente assente</em>
          </div>
          <div class="int2-likert-step int2-likert--2">
            <b>2</b>
            <em>appena accennato</em>
          </div>
          <div class="int2-likert-step int2-likert--3">
            <b>3</b>
            <em>presente, secondario</em>
          </div>
          <div class="int2-likert-step int2-likert--4">
            <b>4</b>
            <em>significativo, profondità</em>
          </div>
          <div class="int2-likert-step int2-likert--5">
            <b>5</b>
            <em>oggetto principale del post</em>
          </div>
        </div>
        <p class="int2-likert-caption">Stessa rubrica per LLM e annotatori umani · temperature = 0 → output deterministico</p>

        <div class="int2-prompt-sketch">
          <header>
            <span>Idea del prompt</span>
            <em>scorer.py · system message</em>
          </header>
          <div class="int2-prompt-grid">
            <article>
              <small>Ruolo</small>
              <p>«Sei un motore di analisi di contenuti politici italiani.»</p>
            </article>
            <article>
              <small>Compito</small>
              <p>Per ciascuno dei 10 temi Eurobarometro, assegna uno score 1–5 <strong>indipendente</strong>.</p>
            </article>
            <article>
              <small>Rubrica</small>
              <p>Stessa scala fornita agli umani: <strong>1</strong> assente → <strong>5</strong> oggetto principale.</p>
            </article>
            <article>
              <small>Vincoli</small>
              <p>Solo il testo del post. Nessuna conoscenza esterna. Output <strong>solo JSON valido</strong>.</p>
            </article>
          </div>
          <code class="int2-prompt-out">{ "scores": { "ambiente_clima": 1, "lavoro_economia": 4, … }, "keywords": [ … ], "sentiment": "…", "propaganda": "…" }</code>
        </div>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 06",
      title: "Stadio 4 — 3 modelli vs 4 umani su 30 post × 10 temi.",
      tone: "pipe-valid",
      copy: ``,
      aside: `
        <div class="int2-valid-grid">
          <div class="int2-valid-side int2-valid-humans">
            <span>Riferimento</span>
            <div class="int2-humans-row">
              <i></i><i></i><i></i><i></i>
            </div>
            <b>4 annotatori umani</b>
            <em>media arrotondata per difetto</em>
          </div>
          <div class="int2-valid-center">
            <div class="int2-grid-30">
              ${Array.from({ length: 30 }).map((_, i) => `<i${(i + 1) % 10 === 0 ? ' class="row-end"' : ""}></i>`).join("")}
            </div>
            <strong>30 post · 10 temi</strong>
            <em>300 coppie modello-umano per modello</em>
          </div>
          <div class="int2-valid-side int2-valid-models">
            <span>Candidati</span>
            <div class="int2-model-list">
              <b>gemma4:e4b</b>
              <b>llama3.1:8b</b>
              <b>qwen3:14b</b>
            </div>
            <em>open-weight · locali</em>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 07",
      title: "Cinque metriche per scale ordinali appaiate.",
      tone: "pipe-metrics",
      copy: ``,
      aside: `
        <div class="int2-metric-groups">
          <div class="int2-metric-group">
            <span class="int2-group-head">Errore</span>
            <div class="int2-metric-row">
              <article>
                <b>MAE</b>
                <em>scarto medio assoluto in punti scala</em>
                <small>Misura di quanto il modello si discosta in media dal giudizio umano — il criterio principale per scegliere il modello migliore.</small>
              </article>
              <article>
                <b>Bias medio</b>
                <em>segno dell'errore sistematico (over/under-stima)</em>
                <small>Rivela se il modello tende strutturalmente ad alzare o abbassare gli score rispetto agli umani, indipendentemente dall'entità dell'errore.</small>
              </article>
            </div>
          </div>
          <div class="int2-metric-group">
            <span class="int2-group-head">Accordo</span>
            <div class="int2-metric-row">
              <article>
                <b>κ pesato</b>
                <em>accordo · penalizza errori grandi</em>
                <small>Verifica che modello e umani concordino oltre il caso, dando più peso agli errori di più punti su scala ordinale.</small>
              </article>
              <article>
                <b>α Krippendorff</b>
                <em>reliability ordinale robusta su distribuzioni asimmetriche</em>
                <small>Conferma l'affidabilità ordinale anche quando i punteggi si addensano su 1–2, dove κ perde sensibilità.</small>
              </article>
            </div>
          </div>
          <div class="int2-metric-group">
            <span class="int2-group-head">Ordinamento</span>
            <div class="int2-metric-row">
              <article>
                <b>Spearman ρ</b>
                <em>accordo sull'ordinamento dei valori</em>
                <small>Controlla che il modello preservi la gerarchia dei temi — fondamentale perché il ranking è poi usato nell'analisi comparativa.</small>
              </article>
            </div>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 08",
      title: "Gemma4:e4b vince su tutte e tre le metriche chiave.",
      tone: "pipe-choice",
      copy: ``,
      aside: `
        <div class="int2-choice-grid">
          <article class="int2-mini-bars">
            <header>
              <span>MAE</span>
              <b>più basso = meglio</b>
            </header>
            <div class="int2-bars int2-bars--mini">
              <div class="int2-bar int2-bar--win">
                <label>gemma4</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:49%"></div></div>
                <strong>0.244</strong>
              </div>
              <div class="int2-bar">
                <label>qwen3</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:56%"></div></div>
                <strong>0.282</strong>
              </div>
              <div class="int2-bar int2-bar--lose">
                <label>llama3.1</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:95%"></div></div>
                <strong>0.473</strong>
              </div>
            </div>
          </article>
          <article class="int2-mini-bars">
            <header>
              <span>Bias medio</span>
              <b>vicino a 0 = meglio</b>
            </header>
            <div class="int2-bars int2-bars--mini">
              <div class="int2-bar int2-bar--win">
                <label>gemma4</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:20%"></div></div>
                <strong>+0.10</strong>
              </div>
              <div class="int2-bar">
                <label>qwen3</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:42%"></div></div>
                <strong>+0.21</strong>
              </div>
              <div class="int2-bar int2-bar--lose">
                <label>llama3.1</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:82%"></div></div>
                <strong>+0.41</strong>
              </div>
            </div>
          </article>
          <article class="int2-mini-bars">
            <header>
              <span>Kappa pesato</span>
              <b>più alto = meglio</b>
            </header>
            <div class="int2-bars int2-bars--mini">
              <div class="int2-bar int2-bar--win">
                <label>gemma4</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:78%"></div></div>
                <strong>0.784</strong>
              </div>
              <div class="int2-bar int2-bar--win">
                <label>qwen3</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:78%"></div></div>
                <strong>0.780</strong>
              </div>
              <div class="int2-bar int2-bar--lose">
                <label>llama3.1</label>
                <div class="int2-bar-track"><div class="int2-bar-fill" style="width:60%"></div></div>
                <strong>0.601</strong>
              </div>
            </div>
          </article>
        </div>
        <p class="int2-choice-note">Nota: kappa gemma–qwen quasi pari (0.784 vs 0.780). Differenza decisiva su MAE e bias · gemma è anche 4B vs 14B di qwen → costo inferenza inferiore.</p>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 09",
      title: "Limite noto: democrazia e difesa sovrastimati.",
      tone: "pipe-limits",
      copy: ``,
      aside: `
        <div class="int2-bars-card">
          <header><span>MAE per tema (gemma4) — media globale 0.244</span></header>
          <div class="int2-bars">
            <div class="int2-bar int2-bar--warn">
              <label>democrazia_legalita</label>
              <div class="int2-bar-track"><div class="int2-bar-fill" style="width:97%"></div></div>
              <strong>0.58</strong>
            </div>
            <div class="int2-bar int2-bar--warn">
              <label>difesa_sicurezza</label>
              <div class="int2-bar-track"><div class="int2-bar-fill" style="width:92%"></div></div>
              <strong>0.55</strong>
            </div>
            <div class="int2-bar">
              <label>altri 8 temi (media)</label>
              <div class="int2-bar-track"><div class="int2-bar-fill" style="width:30%"></div></div>
              <strong>~0.18</strong>
            </div>
          </div>
          <footer>
            <div>
              <span>Bias democrazia</span>
              <b style="grid-column:span 3;color:var(--red)">+0.37 — sovrastima sistematica</b>
            </div>
            <div>
              <span>Causa</span>
              <b style="grid-column:span 3;font-family:inherit;font-weight:400">cornici retoriche generiche attivano il tema su contenuto decorativo</b>
            </div>
          </footer>
        </div>
      `,
    },
    {
      eyebrow: "Fase 2 / Pipeline · 10",
      title: "Pipeline validata. 742 post × 10 temi.",
      tone: "pipe-close",
      copy: ``,
      aside: `
        <div class="int2-close-grid">
          <div class="int2-close-stat">
            <span>Post</span>
            <strong>742</strong>
            <em>processati end-to-end</em>
          </div>
          <div class="int2-close-arrow">×</div>
          <div class="int2-close-stat">
            <span>Temi</span>
            <strong>10</strong>
            <em>griglia Eurobarometro</em>
          </div>
          <div class="int2-close-arrow">=</div>
          <div class="int2-close-stat int2-close-stat--key">
            <span>Score totali</span>
            <strong>7.420</strong>
            <em>MAE medio 0.244 · gemma4:e4b</em>
          </div>
        </div>
        <div class="int2-close-note">
          <span>Caveat metodologico</span>
          <p>Validazione vs media di 4 annotatori umani — non ground truth assoluto. I risultati sono misure costruite, verificabili e utili. Non sentenze automatiche.</p>
        </div>
      `,
    },
    {
      eyebrow: "",
      title: "Come confrontiamo le due agende.",
      tone: "intermission",
      copy: `<p>Fase 3 — Le metriche di allineamento.</p>`,
      aside: ``,
    },
    {
      eyebrow: "Fase 3 / Metriche · 01",
      title: "Le sorgenti dei dati: due scale non paragonabili.",
      tone: "metrics-src",
      copy: `
        <p>Le percentuali di selezione di una survey <em>pick top-3</em> e gli score Likert prodotti da un classificatore automatico non vivono sulla stessa metrica. Confrontarle per valori grezzi sarebbe scorretto.</p>
      `,
      aside: `
        <div class="research-scale-compare">
          <article>
            <span>Lato Eurobarometro</span>
            <strong>Pick top-3</strong>
            <p>Ogni rispondente sceglie fino a tre temi da una lista chiusa. Output: percentuale di selezione per tema.</p>
          </article>
          <article>
            <span>Lato Instagram</span>
            <strong>Likert 1–5 multi-tema</strong>
            <p>Ogni post riceve un punteggio su tutti i 10 temi contemporaneamente. Un post può coprire molti temi.</p>
          </article>
          <div class="research-formula-block">
            <span>Eurobarometro</span>
            ${kf('x_{r,t} \\in \\{0, 1\\},\\quad \\textstyle\\sum_{t} x_{r,t} \\leq 3')}
          </div>
          <div class="research-formula-block">
            <span>Instagram</span>
            ${kf('s_{i,t} \\in \\{1,2,3,4,5\\},\\quad \\forall\\, t \\in T')}
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 3 / Metriche · 02",
      title: "Il ranking è il livello davvero confrontabile.",
      tone: "metrics-rank",
      copy: `
        <p>Scrivere «46% dei giovani vs. 7% dei post» suggerirebbe un confronto numerico diretto fra unità diverse. Scrivere «rank 1 vs. rank 9» è un'affermazione precisa: stiamo confrontando <strong>ordini di priorità</strong>.</p>
      `,
      aside: `
        <div class="research-pipeline">
          <div class="research-pipe-step">
            <span>Eurobarometro</span>
            <strong>% di selezione per tema</strong>
          </div>
          <div class="research-pipe-arrow">→</div>
          <div class="research-pipe-step research-pipe-step--accent">
            <span>Trasformazione comune</span>
            <strong>Ranking dei 10 temi</strong>
            <p>rank medio sui pareggi</p>
          </div>
          <div class="research-pipe-arrow">←</div>
          <div class="research-pipe-step">
            <span>Instagram</span>
            <strong>Coverage Rate per tema</strong>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 3 / Metriche · 03",
      title: "Il Coverage Rate: una proporzione di post.",
      tone: "metrics-cr",
      copy: `
        <p>Per ogni politico \\(p\\) e tema \\(i\\), la frazione di post in cui il tema è presente in modo non marginale — con soglia \\(\\tau = 3\\).</p>
        <div class="research-katex-formula" style="margin-top:16px">\\[ c_i^{(p)} = \\frac{1}{N_p}\\sum_{j=1}^{N_p} \\mathbf{1}\\!\\left[s_{i,j}^{(p)} \\geq \\tau\\right] \\]</div>
        <p style="margin-top:16px"><strong>Perché non la media aritmetica?</strong> La distanza 2→3 non equivale a 4→5: la scala è ordinale, non a intervalli. La logica binaria replica anche la struttura della survey.</p>
        <p style="margin-top:12px"><strong>Intervalli di confidenza.</strong> I rate di coverage usano la formula di <em>Wilson</em>, stabile agli estremi e corretta anche per campioni piccoli — evitando l'approssimazione normale che si destabilizza vicino a 0 o 1.</p>
      `,
      aside: `
        <div class="research-likert-scale">
          <p class="research-likert-label">Rubrica Likert · τ = 3 è la soglia di riconoscibilità</p>
          <div class="research-likert-steps">
            <div class="research-likert-step">
              <span class="step-n">1</span>
              <span class="step-t">tema completamente assente</span>
            </div>
            <div class="research-likert-step">
              <span class="step-n">2</span>
              <span class="step-t">appena accennato</span>
            </div>
            <div class="research-likert-step research-likert-step--active research-likert-step--thr">
              <span class="step-n">3 — τ</span>
              <span class="step-t">riconoscibile, secondario</span>
            </div>
            <div class="research-likert-step research-likert-step--active">
              <span class="step-n">4</span>
              <span class="step-t">significativo, con profondità</span>
            </div>
            <div class="research-likert-step research-likert-step--active">
              <span class="step-n">5</span>
              <span class="step-t">oggetto principale del post</span>
            </div>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 3 / Metriche · 04",
      title: "La soglia τ non è arbitraria: lo verifichiamo.",
      tone: "metrics-sens",
      copy: `
        <p>Ricalcoliamo Coverage Rate e ranking con \\(\\tau \\in \\{2, 3, 4\\}\\) e osserviamo come cambia la correlazione di Spearman fra ranking giovanile e ranking politico.</p>
        <ul class="research-points" style="margin-top:20px">
          <li><strong>Quadro qualitativo stabile.</strong> L'ordinamento dei tre profili per allineamento globale resta identico al variare di τ.</li>
          <li><strong>Variazione contenuta.</strong> Le differenze di Spearman al variare di τ sono nell'ordine dei centesimi.</li>
        </ul>
        <p style="margin-top:16px;font-style:italic;color:var(--muted)">Conclusione: il quadro che leggeremo nei risultati non è un artefatto del cutoff scelto.</p>
      `,
      aside: `
        <table class="research-sens-table">
          <thead>
            <tr>
              <th>Politico</th>
              <th>ρ · τ = 2</th>
              <th>ρ · τ = 3</th>
              <th>ρ · τ = 4</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Elly Schlein</td>
              <td>+0.19</td>
              <td>+0.19</td>
              <td>+0.15</td>
            </tr>
            <tr>
              <td>Giuseppe Conte</td>
              <td>+0.09</td>
              <td>+0.09</td>
              <td>+0.10</td>
            </tr>
            <tr>
              <td>Giorgia Meloni</td>
              <td>+0.03</td>
              <td>+0.01</td>
              <td>−0.02</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">Ordinamento per ρ invariante al variare di τ</td>
            </tr>
          </tfoot>
        </table>
      `,
    },
    {
      eyebrow: "Fase 3 / Metriche · 05",
      title: "Tre metriche, tre angolazioni.",
      tone: "metrics-trio",
      copy: `
        <p>Per controllare che il risultato non dipenda da una sola scelta di pesi, ogni confronto è riportato con tre indici complementari.</p>
      `,
      aside: `
        <div class="research-metrics-trio">
          <article class="has-formula-popup metric-card--blue">
            <div class="metric-sym">${kf('\\rho', false)}</div>
            <span>Spearman</span>
            <strong>Allineamento globale.</strong>
            <p>Correlazione fra i due ranking. Pesa molto gli scarti di rango ampi: un tema dal podio giovanile alla coda politica incide forte.</p>
            <em>Risposta diretta alla RQ</em>
            <div class="metric-formula-popup">
              <span>Formula</span>
              ${kf('\\rho = 1 - \\dfrac{6\\displaystyle\\sum_{t} d_{t}^{2}}{n(n^{2}-1)}')}
            </div>
          </article>
          <article class="has-formula-popup metric-card--green">
            <div class="metric-sym">${kf('\\tau_b', false)}</div>
            <span>Kendall tau-b</span>
            <strong>Coppie concordi.</strong>
            <p>Per ogni coppia di temi: l'ordine è concorde o discorde fra giovani e politico? La variante tau-b gestisce i pareggi.</p>
            <em>Controllo di robustezza</em>
            <div class="metric-formula-popup">
              <span>Formula</span>
              ${kf('\\tau_b = \\dfrac{C - D}{\\sqrt{(C+D+T_x)(C+D+T_y)}}')}
            </div>
          </article>
          <article class="has-formula-popup metric-card--red">
            <div class="metric-sym metric-sym--j">
              <span>J<sub>3</sub></span>
              <span>J<sub>5</sub></span>
            </div>
            <span>Top-K Jaccard</span>
            <strong>Allineamento locale.</strong>
            <p>I temi nel top-K giovanile sono anche nel top-K politico? Riportato per K = 3 (podio) e K = 5 (metà alta).</p>
            <em>k = 3 · k = 5</em>
            <div class="metric-formula-popup">
              <span>Formula</span>
              ${kf('J_K = \\dfrac{|\\,T_K^{\\text{giov}} \\cap T_K^{\\text{pol}}\\,|}{|\\,T_K^{\\text{giov}} \\cup T_K^{\\text{pol}}\\,|}')}
            </div>
          </article>
        </div>
      `,
    },
    {
      eyebrow: "Fase 3 / Metriche · 06",
      title: "Bootstrap a livello di post, B = 2 000.",
      tone: "metrics-boot",
      copy: `
        <p>Con soli <strong>n = 10 temi</strong>, le correlazioni globali hanno potenza statistica limitata. Non basta un valore puntuale: serve una stima dell'incertezza.</p>
        <ul class="research-points" style="margin-top:20px">
          <li><strong>Ricampiona</strong> i post del profilo con reinserimento.</li>
          <li><strong>Ricalcola</strong> i 10 Coverage Rate sul nuovo campione.</li>
          <li><strong>Riallinea</strong> a Spearman e Kendall contro il ranking giovanile (fissato).</li>
          <li>Ripeti <strong>B = 2 000</strong> volte → distribuzione delle correlazioni.</li>
        </ul>
      `,
      aside: `
        <div class="research-cband-card">
          <span>Esempio · Schlein — ρ = +0,19</span>
          <p>95% CI bootstrap = <strong>[+0,07 ; +0,36]</strong></p>
          <div class="research-cbands">
            <div class="research-cband">
              <span class="cband-name">Schlein</span>
              <div class="cband-track">
                <div class="cband-zero" style="left:30%"></div>
                <div class="cband-band" style="left:37%;right:34%"></div>
                <div class="cband-point" style="left:49%"></div>
              </div>
              <span class="cband-val">+0,19</span>
            </div>
            <div class="research-cband">
              <span class="cband-name">Conte</span>
              <div class="cband-track">
                <div class="cband-zero" style="left:30%"></div>
                <div class="cband-band" style="left:29%;right:42%"></div>
                <div class="cband-point" style="left:39%"></div>
              </div>
              <span class="cband-val">+0,09</span>
            </div>
            <div class="research-cband">
              <span class="cband-name">Meloni</span>
              <div class="cband-track">
                <div class="cband-zero" style="left:30%"></div>
                <div class="cband-band" style="left:23%;right:40%"></div>
                <div class="cband-point" style="left:31%"></div>
              </div>
              <span class="cband-val">+0,01</span>
            </div>
          </div>
          <div class="cband-axis-labels">
            <span>−0,3</span><span>0</span><span>+0,3</span><span>+0,6</span>
          </div>
          <p style="margin:0;font-size:14px;color:var(--muted)">Conclusione: <strong style="color:var(--ink)">l'incertezza prepara la lettura</strong>. Un CI ampio colloca il quadro in un <strong style="color:var(--ink)">allineamento debole</strong>.</p>
        </div>
      `,
    },
    {
      eyebrow: "",
      title: "Cosa dicono i dati.",
      tone: "intermission",
      copy: `<p>Fase 4 — I risultati dell'analisi.</p>`,
      aside: ``,
    },
    {
      eyebrow: "Fase 4 / Risultati · 01",
      title: "Allineamento globale: nessun profilo riproduce davvero l'ordine delle priorità giovanili.",
      tone: "int4-table",
      copy: `
        <p>La tabella risponde alla domanda centrale: quanto il ranking politico ricalca il ranking giovanile?</p>
        <p>La risposta è debole per tutti. Spearman resta vicino allo zero: Schlein +0,19, Conte +0,09, Meloni +0,01. Kendall tau-b racconta la stessa storia, quindi il risultato non dipende da una singola metrica.</p>
      `,
      aside: phase4AlignmentTable(),
    },
    {
      eyebrow: "Fase 4 / Risultati · 02",
      title: "Gli intervalli di confidenza impediscono di trasformare differenze piccole in classifiche robuste.",
      tone: "int4-forest",
      copy: `
        <p>Gli intervalli sono calcolati con bootstrap non parametrico su B=2000 ricampionamenti. Con soli dieci temi, la risoluzione statistica delle correlazioni globali è limitata.</p>
        <p>Schlein mostra un segnale debole ma distinguibile dal rumore; Conte resta al margine; Meloni include lo zero. Il punto non è chi vince, ma che nessuno si avvicina a un allineamento forte.</p>
      `,
      aside: phase4ForestPlot(),
    },
    {
      eyebrow: "Fase 4 / Risultati · 03",
      title: "Lo slopegraph rende visibile il gap: quasi tutte le linee si incrociano.",
      tone: "int4-slope",
      copy: `
        <p>Ogni linea collega il rank giovanile al rank politico dello stesso tema. Le linee inclinate e incrociate mostrano il disaccordo tra i due ordinamenti.</p>
        <p>Il pattern è comune: ambiente e clima scende dalla prima posizione, mentre democrazia e legalità sale dal fondo alla vetta.</p>
      `,
      aside: phase4Slopegraph(),
    },
    {
      eyebrow: "Fase 4 / Risultati · 04",
      title: "Coverage Rate: le celle più scure non si concentrano dove i giovani mettono le priorità.",
      tone: "int4-heat",
      copy: `
        <p>Le colonne sono ordinate per priorità giovanile decrescente: ambiente a sinistra, abitazione a destra. Se ci fosse allineamento, le celle più scure dovrebbero stare a sinistra.</p>
        <p>Succede l'opposto: la densità cresce verso i temi meno prioritari per i giovani. Ambiente e clima resta quasi bianco su tutti e tre i profili.</p>
      `,
      aside: phase4Heatmap(),
    },
    {
      eyebrow: "Fase 4 / Risultati · 05",
      title: "Ambiente e clima: il tema più sotto-rappresentato.",
      tone: "int4-case",
      copy: `
        <p>Ambiente e clima è il primo tema per i giovani italiani, con il 46% delle selezioni. Nei ranking politici scivola al rank 8 per Schlein, 8 per Conte, 6 per Meloni.</p>
        <p>I Coverage Rate confermano: meno di un post su dieci tratta il tema che i giovani mettono in cima. La sensitivity analysis indica che non sale mai sopra il rank 6 con τ = 2, 3 o 4.</p>
      `,
      aside: phase4CaseBars({ topicId: "ambiente", max: 12, ticks: [0, 3, 6, 9, 12] }),
    },
    {
      eyebrow: "Fase 4 / Risultati · 06",
      title: "Democrazia e legalità: il tema più sovra-rappresentato.",
      tone: "int4-case",
      copy: `
        <p>Tra i giovani è nella parte bassa, al rank 8,5. Nei tre profili politici è invece in testa o al vertice: 56,6% per Schlein, 49,2% per Conte, 36,7% per Meloni.</p>
        <p>Il contesto politico aiuta a leggerlo, ma va mantenuta una riserva: in validazione questo è uno dei temi su cui il modello mostra overshooting.</p>
      `,
      aside: phase4CaseBars({ topicId: "democrazia", max: 65, ticks: [0, 15, 30, 45, 60], warning: "Overshooting: il modello tende a sovrastimare questo tema nella validazione (MAE 0,58)." }),
    },
    {
      eyebrow: "Fase 4 / Risultati · 07",
      title: "Il disallineamento è comune, ma i profili non sono indistinti.",
      tone: "int4-heat-notes",
      copy: `
        <p>Meloni è l'unico profilo in cui difesa e sicurezza entra nei primi due rank, con Coverage Rate intorno al 32%. Anche immigrazione è più alta rispetto a Schlein e Conte.</p>
        <p>Schlein e Conte sono più simili tra loro, entrambi dominati da democrazia e legalità e lavoro. La pipeline cattura differenze interpretabili, non profili piatti.</p>
      `,
      aside: `
        <div class="int4-heat-notes-wrap">
          ${phase4Heatmap({ highlights: true })}
          <div class="int4-profile-notes">
            <p><strong>Meloni</strong> unico profilo con Difesa top-2 (32%).</p>
            <p><strong>Meloni</strong> Immigrazione più alta di Schlein e Conte.</p>
            <p><strong>Schlein ≈ Conte</strong> simili su Democrazia e Lavoro.</p>
          </div>
        </div>
      `,
    },
    {
      eyebrow: "Fase 4 / Risultati · 08",
      title: "Tre limiti da dichiarare prima della conclusione.",
      tone: "int4-limits",
      copy: `
        <p>I risultati sono leggibili, ma non vanno sovrainterpretati. Il limite statistico principale è n=10 temi; quello empirico è la specificità del riferimento Eurobarometro; quello metodologico è il giudizio umano residuo nella pipeline.</p>
      `,
      aside: `
        <div class="int4-limit-grid">
          <article><span>1</span><strong>Potenza statistica</strong><p>n=10 temi → CI bootstrap circa ±0,3. Non discrimina robustamente tra profili.</p></article>
          <article><span>2</span><strong>Specificità del riferimento</strong><p>Eurobarometro = istantanea 2024. Altri target possono produrre altri ranking.</p></article>
          <article><span>3</span><strong>Giudizio umano residuo</strong><p>Prompt design, campione di validazione e interpretazione restano scelte qualitative.</p></article>
        </div>
      `,
    },
    {
      eyebrow: "Conclusione",
      title: "La nostra tesi è confermata.",
      tone: "int4-close",
      copy: `
        <p class="int4-close-question">La comunicazione social dei politici italiani è allineata alle priorità giovanili?</p>
        <p class="int4-close-answer">No.</p>
        <p class="int4-close-detail">Il gap c'è. E ora è misurato.</p>
      `,
      aside: ``,
    },
    {
      eyebrow: "Il gruppo di ricerca",
      title: "Chi c'è dietro Su.Data.",
      tone: "team",
      copy: `
        <p>Un progetto realizzato per il corso di Human Data Science.</p>
      `,
      aside: `
        <div class="research-team-grid">
          <article class="team-member">
            <div class="team-photo" style="--photo:url('Dashboard/dati/Marco_Coppola.jpg')"></div>
            <div class="team-info">
              <h3>Marco Coppola</h3>
              <blockquote>"Se nel mondo esistesse un po' di bene…"</blockquote>
              <small>(Vota Verdi)</small>
            </div>
          </article>
          <article class="team-member">
            <div class="team-photo" style="--photo:url('Dashboard/dati/Davide_DeRosa.jpg')"></div>
            <div class="team-info">
              <h3>Davide De Rosa</h3>
              <blockquote>"Non acconsento alla profilazione dei miei dati."</blockquote>
              <small>(Vota Fratelli D'Italia)</small>
            </div>
          </article>
          <article class="team-member">
            <div class="team-photo" style="--photo:url('Dashboard/dati/Marco_Miozza.png')"></div>
            <div class="team-info">
              <h3>Marco Miozza</h3>
              <blockquote>"Fischia il vento e infuria la bufera."</blockquote>
              <small>(Vota Calenda)</small>
            </div>
          </article>
          <article class="team-member">
            <div class="team-photo" style="--photo:url('Dashboard/dati/Valerio_DeNicola.jpg')"></div>
            <div class="team-info">
              <h3>Valerio Pio De Nicola</h3>
              <blockquote>"Osala oppure usala."</blockquote>
              <small>(Vota Forza Italia)</small>
            </div>
          </article>
        </div>
      `,
    },
  ];

  app.innerHTML = `
    <section class="research-deck" aria-label="La ricerca, prima fase">
      <nav class="research-progress" aria-label="Indice slide ricerca">
        <button type="button" class="research-progress-arrow" data-progress-dir="-1" aria-label="Scorri su">▲</button>
        <div class="research-progress-list">
          ${speakerSlides
            .map(
              (slide, index) => `
                <button type="button" data-slide-jump="${index + 1}" aria-label="Vai alla slide ${index + 1}">
                  <span>${String(index + 1).padStart(2, "0")}</span>
                </button>
              `,
            )
            .join("")}
        </div>
        <button type="button" class="research-progress-arrow" data-progress-dir="1" aria-label="Scorri giù">▼</button>
      </nav>

      <div class="research-slides-stage" style="--slide-count:${speakerSlides.length}">
        ${speakerSlides
          .map(
            (slide, index) => `
              <article id="research-slide-${index + 1}" class="research-slide research-slide--${slide.tone}" data-research-slide="${index + 1}" style="--accent:${youthItems[index % youthItems.length].color}">
                <div class="research-slide-inner">
                  <div class="research-slide-copy">
                    <p class="kicker">${escapeHtml(slide.eyebrow)}</p>
                    <h1>${slide.title}</h1>
                    <div class="research-slide-text">${slide.copy}</div>
                  </div>
                  <aside class="research-slide-aside">
                    ${slide.aside}
                  </aside>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;

  const slides = [...app.querySelectorAll("[data-research-slide]")];
  const progressLinks = [...app.querySelectorAll("[data-slide-jump]")];
  const progressList = app.querySelector(".research-progress-list");
  const updateArrows = () => {
    if (!progressList) return;
    const [upBtn, downBtn] = app.querySelectorAll(".research-progress-arrow");
    if (upBtn) upBtn.classList.toggle("is-hidden", progressList.scrollTop <= 0);
    if (downBtn) downBtn.classList.toggle("is-hidden", progressList.scrollTop + progressList.clientHeight >= progressList.scrollHeight - 1);
  };
  let activeIndex = 0;
  let isAnimating = false;
  let touchStartY = 0;
  let wheelDebt = 0;
  const lockMs = 920;
  const wheelThreshold = 78;
  const touchThreshold = 44;

  const setActiveSlide = (nextIndex, { instant = false } = {}) => {
    const clampedIndex = clamp(nextIndex, 0, slides.length - 1);
    if (clampedIndex === activeIndex && !instant) return;
    const previousIndex = activeIndex;
    activeIndex = clampedIndex;

    slides.forEach((slide, index) => {
      const offset = index - activeIndex;
      slide.style.setProperty("--section-offset", offset);
      slide.classList.toggle("is-active", index === activeIndex);
      slide.classList.toggle("is-before", index < activeIndex);
      slide.classList.toggle("is-after", index > activeIndex);
      slide.setAttribute("aria-hidden", index === activeIndex ? "false" : "true");
      slide.tabIndex = index === activeIndex ? 0 : -1;
    });
    progressLinks.forEach((link) => {
      const isActive = Number(link.dataset.slideJump) === activeIndex + 1;
      link.classList.toggle("is-active", isActive);
      link.setAttribute("aria-current", isActive ? "step" : "false");
    });

    if (progressList) {
      const activeLink = progressLinks[clampedIndex];
      if (activeLink) {
        const listTop = progressList.scrollTop;
        const listH = progressList.clientHeight;
        const linkTop = activeLink.offsetTop;
        const linkH = activeLink.offsetHeight;
        if (linkTop < listTop) progressList.scrollTop = linkTop - 8;
        else if (linkTop + linkH > listTop + listH) progressList.scrollTop = linkTop + linkH - listH + 8;
      }
      updateArrows();
    }

    if (!instant && previousIndex !== activeIndex) {
      isAnimating = true;
      window.setTimeout(() => {
        isAnimating = false;
        wheelDebt = 0;
      }, lockMs);
    }
  };

  const moveBy = (direction) => {
    if (isAnimating) return;
    setActiveSlide(activeIndex + direction);
  };

  const onWheel = (event) => {
    const direction = event.deltaY > 0 ? 1 : -1;
    event.preventDefault();
    if (isAnimating) return;
    if (Math.sign(wheelDebt) !== Math.sign(event.deltaY)) wheelDebt = 0;
    wheelDebt += event.deltaY;
    if (Math.abs(wheelDebt) < wheelThreshold) return;
    moveBy(direction);
  };

  const onKeydown = (event) => {
    const downKeys = ["ArrowDown", "PageDown", "Space"];
    const upKeys = ["ArrowUp", "PageUp"];
    if (![...downKeys, ...upKeys, "Home", "End"].includes(event.code)) return;
    event.preventDefault();
    if (event.code === "Home") setActiveSlide(0);
    else if (event.code === "End") setActiveSlide(slides.length - 1);
    else moveBy(downKeys.includes(event.code) ? 1 : -1);
  };

  const onTouchStart = (event) => {
    touchStartY = event.touches[0]?.clientY ?? 0;
  };

  const onTouchMove = (event) => {
    event.preventDefault();
  };

  const onTouchEnd = (event) => {
    const touchEndY = event.changedTouches[0]?.clientY ?? touchStartY;
    const delta = touchStartY - touchEndY;
    if (Math.abs(delta) < touchThreshold) return;
    moveBy(delta > 0 ? 1 : -1);
  };

  progressLinks.forEach((link) => {
    link.addEventListener("click", () => setActiveSlide(Number(link.dataset.slideJump) - 1));
  });

  app.querySelectorAll(".research-progress-arrow").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = Number(btn.dataset.progressDir);
      progressList.scrollTop += dir * (34 + 8) * 3;
      updateArrows();
    });
  });

  setActiveSlide(0, { instant: true });
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.__researchScrollCleanup = () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.__researchScrollCleanup = null;
  };
}

export function renderOverview() {
  setActiveNav("/overview");
  const [hotTopic] = topicSummary();
  const hotTopicPosts = state.posts
    .filter((post) => scoreValue(post, hotTopic.id) >= 4)
    .sort((a, b) => scoreValue(b, hotTopic.id) - scoreValue(a, hotTopic.id));
  const topKeywords = keywordSummary(state.posts, 16);
  const leaderPosts = postsByPolitician(hotTopic.leader.id).filter((post) => scoreValue(post, hotTopic.id) >= 4);

  const yr = youthRanks();
  const alignmentRanking = politicians
    .map((person) => {
      const pr = politicianCoverageRanks(person.id);
      const rho = pearson(yr, pr);
      const tau = kendallTau(yr, pr);
      const top3 = topKOverlap(person.id, 3);
      return { ...person, rho, tau, top3 };
    })
    .sort((a, b) => b.rho - a.rho);

  const fmtSigned = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);

  const podiumCard = (person, rank) => `
    <div class="podium-slot rank-${rank}">
      <a class="podium-card" href="#/politician/${person.id}">
        <span class="podium-rank-num">${rank}</span>
        <div class="podium-portrait" style="--photo:url('${person.photo}')"></div>
        <div class="podium-meta">
          <p class="podium-handle">${escapeHtml(person.handle)}</p>
          <h3 class="podium-name">${escapeHtml(person.name)}</h3>
          <p class="podium-party">${escapeHtml(person.party)}</p>
        </div>
        <div class="podium-rho">
          <span>ρ Spearman</span>
          <strong>${fmtSigned(person.rho)}</strong>
        </div>
        <div class="podium-aux">
          <span>τ Kendall <b>${fmtSigned(person.tau)}</b></span>
          <span>Top-3 overlap <b>${person.top3}/3</b></span>
        </div>
      </a>
      <div class="podium-step">${rank}°</div>
    </div>`;

  const [first, second, third, ...rest] = alignmentRanking;

  const podiumHtml = `
    <section class="overview-alignment">
      <header>
        <p class="kicker">Allineamento ai giovani</p>
        <h2>Chi intercetta meglio le loro priorità?</h2>
        <p>Classifica per ρ di Spearman tra il ranking tematico di coverage del politico e le priorità dei giovani 16-30 (Flash Eurobarometer).</p>
      </header>
      <div class="alignment-podium">
        ${podiumCard(second, 2)}
        ${podiumCard(first, 1)}
        ${podiumCard(third, 3)}
      </div>
      ${rest.map((person, i) => `
        <a class="alignment-fourth" href="#/politician/${person.id}">
          <span class="fourth-rank">${i + 4}</span>
          <span class="fourth-portrait" style="--photo:url('${person.photo}')"></span>
          <div class="fourth-meta">
            <p>${escapeHtml(person.handle)}</p>
            <h3>${escapeHtml(person.name)}</h3>
          </div>
          <div class="fourth-scores">
            <span>ρ Spearman<b>${fmtSigned(person.rho)}</b></span>
            <span>τ Kendall<b>${fmtSigned(person.tau)}</b></span>
            <span>Top-3<b>${person.top3}/3</b></span>
          </div>
        </a>`).join("")}
    </section>`;

  app.innerHTML = pageShell(
    "Panoramica",
    "Le cose da capire subito.",
    "Facciamo un riepilogo dei temi più caldi, dei profili guida e dei post rappresentativi.",
    `
    <section class="overview-hero-grid">
      <article class="big-insight" style="--topic:${hotTopic.color}">
        <span>Topic più discusso</span>
        <h2>${escapeHtml(hotTopic.label)}</h2>
        <p>Tra tutti i post è il tema con lo score medio più alto. Il profilo che lo guida è <strong>${escapeHtml(hotTopic.leader.name)}</strong>.</p>
        <div class="insight-actions">
          <a class="button primary" href="#/posts?topic=${hotTopic.id}">Vedi i post sul topic</a>
          <a class="button ghost" href="#/politician/${hotTopic.leader.id}">Apri il profilo guida</a>
        </div>
      </article>
      ${topicLeaderBars()}
    </section>

    ${podiumHtml}
    ${neglectedYouthRankCard()}

    <section class="section-grid">
      <article class="statement-panel">
        <span>Keywords</span>
        <h2>Quali sono le parole chiave più frequenti?</h2>
        ${keywordCloud(topKeywords)}
      </article>
      <article class="composition-card">
        <div class="card-title"><span>Chi guida il tema più discusso?</span></div>
        <a class="card-leader-name" href="#/politician/${hotTopic.leader.id}">${escapeHtml(hotTopic.leader.name)}</a>
        <p class="soft-copy">${leaderPosts.length} post su <em>${escapeHtml(hotTopic.label)}</em>.</p>
        <div class="topic-strip">${leaderPosts.slice(0, 4).map((post) => `<a class="chip chip-preview" href="#/post/${encodeURIComponent(post.id)}">${escapeHtml((post.caption || post.text || "Contenuto").replace(/\s+/g, " ").slice(0, 60))}${(post.caption || post.text || "").length > 60 ? "…" : ""}</a>`).join("")}</div>
      </article>
    </section>

    <section class="preview-band">
      <div>
        <p class="kicker">Contenuti rappresentativi</p>
        <h2>Post da leggere per capire il tema dominante.</h2>
      </div>
      <div class="post-row-list">${hotTopicPosts.slice(0, 6).map(miniPostRow).join("")}</div>
    </section>

    <section class="plot-grid">${meanScoreHeatmap()}${coverageHeatmap()}${alignmentSlopegraph()}${topKOverlapBars()}</section>
  `,
  );
}

export function renderPoliticians() {
  setActiveNav("/politicians");
  app.innerHTML = pageShell(
    "Politici",
    "Visualizza i profili dei politici analizzati.",
    "",
    `
    <section class="politician-grid">
      ${politicians
        .map((person) => {
          const list = postsByPolitician(person.id);
          const [mainTopic] = topicSummary(list);
          const keywords = keywordSummary(list, 5);
          return `
        <article class="politician-card metric-politician-card" style="--a:${person.palette[0]};--b:${person.palette[1]};--c:${person.palette[2]}">
          <a href="#/politician/${person.id}" class="portrait" style="--photo:url('${person.photo}')"><span></span></a>
          <div>
            <p>${escapeHtml(person.handle)}</p>
            <h2><a href="#/politician/${person.id}">${escapeHtml(person.name)}</a></h2>
            <span>${escapeHtml(person.role)} · ${escapeHtml(person.party)}</span>
          </div>
          <a class="politician-topic-link" href="#/posts?topic=${mainTopic?.id || ""}" style="--topic:${mainTopic?.color || "var(--blue)"}">
            <span>Topic principale</span>
            <strong>${escapeHtml(mainTopic?.label || "-")}</strong>
          </a>
          ${keywordCloud(keywords)}
          <div class="insight-actions">
            <a class="button primary" href="#/politician/${person.id}">Apri scheda</a>
            <a class="button ghost" href="#/posts?politician=${person.id}">Vedi post</a>
          </div>
        </article>
      `;
        })
        .join("")}
    </section>
    <section class="plot-grid">${politicianSimilarityMatrix()}</section>
  `,
  );
}

export function renderPolitician(id) {
  const person = politicianById(id) || politicians[0];
  const personPosts = postsByPolitician(person.id);
  const topics = topicSummary(personPosts).slice(0, 6);
  const top3 = topics.slice(0, 3);
  const keywords = keywordSummary(personPosts, 14);
  const strongestPosts = [...personPosts].sort(
    (a, b) => topScores(b, 1)[0].score - topScores(a, 1)[0].score,
  );

  setActiveNav("/politicians");
  app.innerHTML = `
    <section class="profile-hero" style="--a:${person.palette[0]};--b:${person.palette[1]};--c:${person.palette[2]}">
      <a class="back-link" href="#/politicians">← Politici</a>
      <div class="profile-name">
        <p>${escapeHtml(person.handle)}</p>
        <h1>${escapeHtml(person.name)}</h1>
        <span>${escapeHtml(person.role)} · ${escapeHtml(person.party)}</span>
      </div>
      <div class="portrait" style="--photo:url('${person.photo}')"><span></span></div>
    </section>
    <section class="top3-grid">
      ${top3.map((topic, i) => `
        <a class="impact-card" href="#/posts?politician=${person.id}&topic=${topic.id}" style="--topic:${topic.color}">
          <span>${String(i + 1).padStart(2, "0")}</span>
          <h2>${escapeHtml(topic.label)}</h2>
          <p>Score medio <strong>${topic.average.toFixed(2)}</strong></p>
        </a>
      `).join("")}
    </section>
    <section class="split-content">
      <div class="composition-card">
        <div class="card-title"><span>Impronta tematica</span><strong>Score medio del profilo</strong></div>
        <div class="radar-list">${topics.map(topicMeter).join("")}</div>
      </div>
      <div class="composition-card">
        <div class="card-title"><span>Keyword</span><strong>Termini più ricorrenti</strong></div>
        ${keywordCloud(keywords, `#/posts?politician=${person.id}`)}
      </div>
    </section>
    ${profileNeglectedYouthRankCard(person)}
    <section class="preview-band">
      <div>
        <p class="kicker">Post da controllare</p>
        <h2>I contenuti con topic score più alto.</h2>
      </div>
      <div class="post-row-list">${strongestPosts.slice(0, 8).map(miniPostRow).join("")}</div>
    </section>
    <section class="plot-grid">${alignmentSlopegraph(person.id)}${profileTopKOverlapCard(person)}</section>
  `;
}

export function renderPosts() {
  setActiveNav("/posts");
  const params = routeParams();
  const hasSearchParam = params.get("search") === "1";
  const routeQuery = params.get("q") || "";
  if (hasSearchParam && state.query !== routeQuery) {
    state.query = routeQuery;
    searchInput.value = routeQuery;
  }
  if (!hasSearchParam && state.query) {
    state.query = "";
    searchInput.value = "";
  }
  const list = filteredPosts();
  const activePerson = politicianById(params.get("politician"));
  const activeTopic = topicById(params.get("topic"));
  const activeType = params.get("type");
  const topTopics = topicSummary(list).slice(0, 5);
  const stableList = filteredPosts({ ignoreSearch: true });
  const topKeywords = keywordSummary(stableList, 10);
  const grouped = groupByPolitician(list);
  const hasFocusedFilter = activePerson || activeTopic || activeType || state.query.trim();
  const perPage = 18;
  const totalPages = Math.max(1, Math.ceil(list.length / perPage));
  const page = clamp(Number(params.get("page") || 1), 1, totalPages);
  const offset = (page - 1) * perPage;
  const visible = hasFocusedFilter ? list.slice(offset, offset + perPage) : [];
  const baseHref = `#/posts${[...params.entries()].filter(([key]) => key !== "page").length ? `?${new URLSearchParams([...params.entries()].filter(([key]) => key !== "page")).toString()}` : ""}`;

  // Build URL preserving current params, overriding specific keys (null = delete)
  function filterHref(overrides) {
    const next = new URLSearchParams(params);
    for (const [key, val] of Object.entries(overrides)) {
      if (val === null) next.delete(key);
      else next.set(key, val);
    }
    next.delete("page");
    const str = next.toString();
    return `#/posts${str ? "?" + str : ""}`;
  }

  const activeFiltersCount = [activePerson, activeType, activeTopic, state.query.trim()].filter(Boolean).length;

  app.innerHTML = pageShell(
    "Post",
    state.query ? `Risultati per "${state.query}"` : "Archivio dei contenuti.",
    hasFocusedFilter ? `${list.length} post trovati` : "",
    `
    <section class="posts-workspace">
      <aside class="filter-panel">

        <div class="filter-section">
          <span class="filter-section-label">Politico</span>
          <div class="filter-chips">
            <a class="chip ${!activePerson ? "is-selected" : ""}" href="${filterHref({ politician: null })}">Tutti</a>
            ${politicians.map((person) => `<a class="chip ${activePerson?.id === person.id ? "is-selected" : ""}" href="${filterHref({ politician: activePerson?.id === person.id ? null : person.id })}" style="${activePerson?.id === person.id ? `--chip-bg:${person.palette[1]};--chip-fg:#fff` : ""}">${escapeHtml(person.name.split(" ").at(-1))}</a>`).join("")}
          </div>
        </div>

        <div class="filter-section">
          <span class="filter-section-label">Tipo contenuto</span>
          <div class="filter-chips">
            <a class="chip ${!activeType ? "is-selected" : ""}" href="${filterHref({ type: null })}">Tutti</a>
            <a class="chip ${activeType === "video" ? "is-selected" : ""}" href="${filterHref({ type: activeType === "video" ? null : "video" })}">Video</a>
            <a class="chip ${activeType === "image" ? "is-selected" : ""}" href="${filterHref({ type: activeType === "image" ? null : "image" })}">Immagini</a>
          </div>
        </div>

        ${activeFiltersCount > 0 ? `
        <div class="filter-section filter-section--reset">
          <a class="reset-filters-link" href="#/posts">Azzera filtri${activeFiltersCount > 1 ? ` (${activeFiltersCount})` : ""}</a>
        </div>` : ""}

        <div class="filter-section">
          <span class="filter-section-label">Topic</span>
          <div class="filter-chips filter-chips--wrap">
            ${topicColumns.map((topic) => `<a class="chip topic-chip${activeTopic?.id === topic.id ? " is-selected topic-chip--active" : ""}" href="${filterHref({ topic: activeTopic?.id === topic.id ? null : topic.id })}" style="${activeTopic?.id === topic.id ? `--chip-bg:${topic.color};--chip-fg:#fff` : `--topic-hint:${topic.color}`}">${escapeHtml(topic.label)}</a>`).join("")}
          </div>
        </div>

        <div class="filter-section">
          <span class="filter-section-label">Keyword</span>
          ${keywordCloud(topKeywords, "#/posts", state.query)}
        </div>

      </aside>
      <div>
        ${activeTopic ? `<div class="active-filter-banner" style="--topic:${activeTopic.color}"><span>Filtro topic</span><strong>${escapeHtml(activeTopic.label)}</strong><a href="${filterHref({ topic: null })}" class="banner-clear">Rimuovi ×</a></div>` : ""}
        ${
          hasFocusedFilter
            ? `<div class="post-tile-grid focused-results">${visible.map(postTile).join("")}</div>
               ${pagination(page, totalPages, baseHref)}
               ${list.length > perPage ? `<p class="soft-copy result-limit">Pagina ${page} di ${totalPages}. Usa ricerca o filtri per restringere la lista.</p>` : ""}`
            : `<div class="post-groups">${grouped.map(postGroup).join("")}</div>`
        }
      </div>
    </section>
  `,
  );
}

export function renderPost(id) {
  const post = state.posts.find((item) => item.id === decodeURIComponent(id)) || state.posts[0];
  const postUrl = post.url || "https://www.instagram.com/p/DXpD4j9jK0q/";
  const person = politicianById(post.politician);
  setActiveNav("/posts");
  app.innerHTML = `
    <section class="post-detail">
      <a class="back-link" href="#/posts?politician=${post.politician}">← Post di ${escapeHtml(person.name)}</a>
      <div class="post-detail-media">
        <div id="insta-embed">
          <div class="generated-media big" style="--a:${person.palette[0]};--b:${person.palette[1]};--c:${person.palette[2]}">
            ${postUrl ? `
              <a class="media-open-overlay" href="${escapeHtml(postUrl)}" target="_blank" rel="noopener">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="white" opacity="0.92"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.308.975.975 1.246 2.242 1.308 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.308 3.608-.975.975-2.242 1.246-3.608 1.308-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.308-.975-.975-1.246-2.242-1.308-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.308-3.608.975-.975 2.242-1.246 3.608-1.308C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.333.014 7.053.072 5.775.131 4.602.431 3.635 1.398 2.668 2.365 2.368 3.538 2.309 4.816 2.251 6.096 2.237 6.504 2.237 12c0 5.496.014 5.904.072 7.184.059 1.278.359 2.451 1.326 3.418.967.967 2.14 1.267 3.418 1.326C8.333 23.986 8.741 24 12 24s3.667-.014 4.947-.072c1.278-.059 2.451-.359 3.418-1.326.967-.967 1.267-2.14 1.326-3.418.058-1.28.072-1.688.072-7.184 0-5.496-.014-5.904-.072-7.184-.059-1.278-.359-2.451-1.326-3.418C19.398.431 18.225.131 16.947.072 15.667.014 15.259 0 12 0z"/><path d="M12 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                <span>Apri su Instagram</span>
              </a>` : ""}
          </div>
        </div>
      </div>
      <article class="post-detail-copy">
        <p class="kicker">${escapeHtml(person.name)} · ID ${escapeHtml(post.folderId)}</p>
        <h1>${escapeHtml((post.caption || post.text || "Contenuto").slice(0, 140))}${(post.caption || post.text || "").length > 140 ? "..." : ""}</h1>
        <h2>Topic score</h2>
        <div class="radar-list">${topScores(post, 10).map((topic) => topicMeter({ ...topic, average: topic.score })).join("")}</div>
        <h2>Keyword</h2>
        ${post.keywords.length ? keywordCloud(post.keywords.map((label) => ({ label, count: "" }))) : "<p class='soft-copy'>Nessuna keyword disponibile.</p>"}
      </article>
      <div class="post-detail-texts">
        <div>
          <h2>Caption completa</h2>
          <p class="transcript">${highlightText(post.caption || "Nessuna caption disponibile.", state.query)}</p>
        </div>
        <div>
          <h2>Testo OCR o trascrizione</h2>
          <p class="transcript">${highlightText(post.text || "Nessun testo estratto.", state.query)}</p>
        </div>
      </div>
    </section>
  `;

  if (postUrl) InstaEmbedder.embed("insta-embed", { oembedHtml: post.oembedHtml, url: postUrl });
}

export function renderTopics() {
  setActiveNav("/topics");
  const summaries = topicSummary();
  app.innerHTML = pageShell(
    "Argomenti",
    "I 10 topic dell'Eurobarometro",
    "",
    `
    <section class="topic-grid">
      ${topicColumns
        .map((topic, index) => {
          const summary = summaries.find((item) => item.id === topic.id);
          return `
        <article class="topic-card" style="--topic:${topic.color}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <h2>${escapeHtml(topic.label)}</h2>
          <div class="topic-card-bottom">
            <strong>${summary.average.toFixed(2)}</strong>
            <small>score medio nel corpus</small>
            <a class="topic-leader-link" href="#/politician/${summary.leader.id}">
              <span>Guida</span>
              ${escapeHtml(summary.leader.name)}
            </a>
          </div>
          <a class="button ghost compact-button" href="#/posts?topic=${topic.id}">Vedi post</a>
        </article>
      `;
        })
        .join("")}
    </section>
    <section class="plot-grid">${topicCorrelationMatrix()}</section>
  `,
  );
}
