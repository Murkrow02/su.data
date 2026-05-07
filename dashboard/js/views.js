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
      eyebrow: "05 / Scelte non utilizzate",
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
      eyebrow: "06 / Ranking, non percentuali",
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
      eyebrow: "07 / Il campo di osservazione",
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
      eyebrow: "08 / Lo scraping",
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
      eyebrow: "09 / Estrazione del messaggio",
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
      eyebrow: "Fase 2 / Raccolta dati",
      title: "Il corpus: struttura, dimensioni e finestra temporale.",
      tone: "phase2",
      copy: `
        <p>[Placeholder] Questa sezione descriverà come abbiamo costruito il dataset: i profili selezionati, la finestra di osservazione, il numero totale di post raccolti e la distribuzione per tipo di contenuto.</p>
      `,
      aside: `
        <div class="research-phase-wip">
          <span>In costruzione</span>
          <strong>Raccolta dati</strong>
          <p>I contenuti di questa sezione verranno completati a breve.</p>
        </div>
      `,
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
      eyebrow: "Fase 4 / Dashboard",
      title: "Come leggere i dati: grafici, metriche e viste comparative.",
      tone: "phase4",
      copy: `
        <p>[Placeholder] Questa sezione descriverà la struttura della dashboard: le viste disponibili, le metriche utilizzate e come interpretare i grafici di correlazione e confronto.</p>
      `,
      aside: `
        <div class="research-phase-wip">
          <span>In costruzione</span>
          <strong>Dashboard</strong>
          <p>I contenuti di questa sezione verranno completati a breve.</p>
        </div>
      `,
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
              <small>(Vota Futuro Nazione)</small>
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
