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

  const speakerSlides = [
    {
      eyebrow: "01 / Domanda",
      title: "Il punto di partenza è una distanza misurabile.",
      tone: "question",
      copy: `
        <p>La ricerca nasce da una domanda precisa: l'ordine dei temi nei post Instagram dei leader politici italiani è compatibile con l'ordine delle priorità dichiarate dai giovani?</p>
        <p>Non vogliamo dire genericamente che giovani e politica sembrano lontani. Vogliamo capire se questa distanza compare anche nella gerarchia dei temi.</p>
      `,
      aside: `
        <div class="research-question-card">
          <span>Domanda guida</span>
          <strong>Agenda dei giovani</strong>
          <i>vs</i>
          <strong>Agenda comunicativa su Instagram</strong>
        </div>
      `,
    },
    {
      eyebrow: "02 / Concetto",
      title: "Il gap semantico non giudica i politici: confronta due ranking.",
      tone: "compare",
      copy: `
        <p>Da una parte c'è la classifica delle priorità giovanili. Dall'altra c'è la classifica dei temi più presenti nei contenuti dei politici.</p>
        <p>Il punto è circoscritto: quanto la comunicazione pubblica su Instagram ricalca, oppure non ricalca, la gerarchia di priorità dei giovani italiani?</p>
      `,
      aside: `
        <div class="research-compare">
          <article><span>A</span><strong>Priorità giovanili</strong><p>Temi scelti dai giovani italiani tra 16 e 30 anni.</p></article>
          <article><span>B</span><strong>Agenda politica</strong><p>Temi presenti nei post Instagram dei leader analizzati.</p></article>
        </div>
      `,
    },
    {
      eyebrow: "03 / Fonte",
      title: "La survey scelta doveva produrre una lista ordinabile.",
      tone: "source",
      copy: `
        <p>Usiamo il Flash Eurobarometer EP013EP del Parlamento Europeo, rivolto ai giovani tra 16 e 30 anni nei 27 Stati membri.</p>
        <p>Per l'Italia, la domanda Q2 chiede quali tre problemi l'Unione Europea dovrebbe affrontare come priorità nei prossimi cinque anni. Questo ci dà una base direttamente trasformabile in ranking.</p>
      `,
      aside: `
        <div class="research-source-card">
          <span>Fonte survey</span>
          <strong>Flash Eurobarometer EP013EP</strong>
          <p>${escapeHtml(youthSurveySource)}</p>
          <small>Domanda pick top-3 su lista chiusa</small>
        </div>
      `,
    },
    {
      eyebrow: "04 / Ranking giovani",
      title: "L'Eurobarometro diventa la gerarchia di riferimento.",
      tone: "ranking",
      copy: `
        <p>Ogni tema ha una percentuale di selezione. Ordinando queste percentuali otteniamo il ranking giovanile.</p>
        <p>Ambiente e clima è al primo posto; lavoro ed economia segue; costo della vita e salute e welfare condividono il terzo posto medio. I pareggi vengono trattati con rank medio.</p>
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
      eyebrow: "05 / Scelte escluse",
      title: "Abbiamo scartato fonti e topic che non erano davvero confrontabili.",
      tone: "decision",
      copy: `
        <p>I dati ISTAT sugli aspetti della vita quotidiana erano ricchi, ma troppo dispersi: non producevano una classifica esplicita di priorità politiche.</p>
        <p>Anche i topic estratti automaticamente con BERT avrebbero creato un confronto fragile, perché i topic emersi dai post non coincidono necessariamente con quelli chiusi della survey.</p>
      `,
      aside: `
        <div class="research-decision-grid">
          <article><span>Scartato</span><strong>ISTAT</strong><p>Quadro ampio, ma non ranking politico diretto.</p></article>
          <article><span>Scartato</span><strong>Topic automatici</strong><p>Spazi tematici non perfettamente sovrapponibili.</p></article>
          <article><span>Scelto</span><strong>10 temi comuni</strong><p>Stessa griglia per survey e Instagram.</p></article>
        </div>
      `,
    },
    {
      eyebrow: "06 / Vocabolario comune",
      title: "La soluzione è usare i dieci temi come griglia fissa.",
      tone: "topics",
      copy: `
        <p>Ogni post viene valutato rispetto agli stessi dieci temi dell'Eurobarometro. In questo modo il confronto non avviene tra oggetti diversi, ma dentro un vocabolario controllato.</p>
        <p>La domanda diventa più solida: tra questi dieci temi, quali sono centrali per i giovani e quali sono più presenti nella comunicazione politica?</p>
      `,
      aside: `
        <ul class="research-topic-list">
          ${allTopics}
        </ul>
      `,
    },
    {
      eyebrow: "07 / Campo di osservazione",
      title: "Instagram è il canale scelto perché intercetta il pubblico giovane.",
      tone: "roster",
      copy: `
        <p>L'Eurobarometro indica Instagram come primo canale digitale per l'informazione politica tra i giovani italiani di 16-30 anni.</p>
        <p>I profili analizzati sono Giorgia Meloni, Elly Schlein e Giuseppe Conte: leader dei tre principali partiti italiani alle elezioni politiche del 2022, con volumi di attività confrontabili.</p>
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
      eyebrow: "08 / Unità di analisi",
      title: "Un post non è solo caption: è contenuto multimodale.",
      tone: "modal",
      copy: `
        <p>Instagram combina testo scritto, grafiche e video. Per questo ogni post viene trasformato in un testo unificato composto da caption, OCR delle immagini e trascrizione audio dei reel.</p>
        <p>Così evitiamo una misura parziale: molti post affidano il messaggio principale a una card o al parlato, non alla sola descrizione.</p>
      `,
      aside: `
        <div class="research-modal-card">
          <span>Post Instagram</span>
          <strong>Caption</strong>
          <strong>OCR immagini</strong>
          <strong>Trascrizione reel</strong>
          <i>testo unificato</i>
        </div>
      `,
    },
    {
      eyebrow: "09 / Chiusura prima fase",
      title: "Il ranking è la lingua comune tra survey e Instagram.",
      tone: "closing",
      copy: `
        <p>Le percentuali dell'Eurobarometro e gli score ricavati dai post non sono numeri direttamente comparabili.</p>
        <p>Per questo l'analisi si sposta sul livello ordinale: non chiediamo se il 46% della survey equivalga a una percentuale di post, ma se i temi alti per i giovani restano alti anche nell'agenda comunicativa dei politici.</p>
      `,
      aside: `
        <div class="research-closing-card">
          <span>Messaggio da portare avanti</span>
          <strong>Non confrontiamo scale diverse. Confrontiamo gerarchie di temi.</strong>
        </div>
      `,
    },
  ];

  app.innerHTML = `
    <section class="research-deck" aria-label="La ricerca, prima fase">
      <nav class="research-progress" aria-label="Indice slide ricerca">
        ${speakerSlides
          .map(
            (slide, index) => `
              <button type="button" data-slide-jump="${index + 1}" aria-label="Vai alla slide ${index + 1}">
                <span>${String(index + 1).padStart(2, "0")}</span>
              </button>
            `,
          )
          .join("")}
      </nav>

      <div class="research-slides-stage" style="--slide-count:${speakerSlides.length}">
        ${speakerSlides
          .map(
            (slide, index) => `
              <article id="research-slide-${index + 1}" class="research-slide research-slide--${slide.tone}" data-research-slide="${index + 1}" style="--accent:${youthItems[index % youthItems.length].color}">
                <div class="research-slide-inner">
                  <div class="research-slide-copy">
                    <p class="kicker">${escapeHtml(slide.eyebrow)}</p>
                    <h1>${escapeHtml(slide.title)}</h1>
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
