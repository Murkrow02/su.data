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

  const pipelineSteps = [
    {
      n: "01",
      tag: "Raccolta",
      title: "Il corpus diventa il fatto.",
      body: "Per ogni profilo monitorato vengono recuperati tutti i post pubblicati nel periodo di analisi: caption, immagini, caroselli, video. Niente storie, niente commenti, niente metriche di engagement. Solo ciò che il politico ha scelto pubblicamente di dire.",
    },
    {
      n: "02",
      tag: "Lettura totale",
      title: "Niente resta fuori dal testo.",
      body: "La comunicazione su Instagram è multimodale: le immagini contengono slogan, infografiche, dati. I video parlano. Vengono lette tutte e tre le cose — testo della caption, testo dentro le immagini, parlato dei video — e fuse in un'unica rappresentazione testuale del post.",
    },
    {
      n: "03",
      tag: "Classificazione",
      title: "Dieci temi, uno score per ciascuno.",
      body: "Ogni post viene valutato su tutti e dieci i topic Eurobarometer con una scala 1–5: assente, marginale, presente, rilevante, dominante. Un post non appartiene a un solo tema: ne tocca diversi, con intensità diverse, e questo viene misurato in parallelo.",
    },
    {
      n: "04",
      tag: "Misurazione",
      title: "Dalla singola voce al profilo.",
      body: "Gli score per post diventano una firma tematica del profilo: media, coverage (quanto spesso il tema viene davvero trattato), ranking. È la mappa della voce pubblica del politico — non un'impressione, ma una distribuzione numerica su dieci assi.",
    },
    {
      n: "05",
      tag: "Confronto",
      title: "Quanto è ampio il gap.",
      body: "Il ranking tematico del politico viene messo a confronto con quello dei giovani via Spearman, Kendall e Top-K. Una linea orizzontale è allineamento; una diagonale è uno scarto. La distanza tra le due gerarchie è il gap semantico.",
    },
  ];

  const pipelineHTML = pipelineSteps
    .map(
      (s) => `
    <article class="about-pipeline-step">
      <span class="ix">${s.n}</span>
      <span class="tag">${s.tag}</span>
      <h3>${s.title}</h3>
      <p>${s.body}</p>
    </article>`,
    )
    .join("");

  app.innerHTML = `
    <section class="about-hero">
      <div class="about-hero-title">
        <p class="kicker">Progetto accademico · Human Data Science · A.A. 2024–25</p>
        <h1>C'è una distanza tra <em>ciò che i giovani chiedono</em> e ciò di cui la politica <em>parla davvero</em>.</h1>
      </div>
      <div class="about-hero-foot">
        <p>La chiamiamo <strong>gap semantico</strong>. Non la stimiamo: la <strong>misuriamo</strong>, post dopo post, confrontando la comunicazione Instagram di leader politici italiani con le priorità dichiarate dai giovani 16-30 nella survey europea.</p>
        <div class="about-hero-actions">
          <a class="button primary" href="#/overview">Vedi i risultati</a>
          <a class="button ghost" href="#/topics">Esplora i topic</a>
        </div>
      </div>
    </section>

    <section class="about-project">
      <header>
        <p class="kicker">Il progetto</p>
        <h2>Misurare, non stimare.</h2>
      </header>
      <div class="about-project-grid">
        <div class="about-project-block">
          <span class="ix">La domanda</span>
          <p>I leader politici italiani parlano davvero di ciò che i giovani considerano prioritario? La risposta intuitiva è «no» — ma intuizioni senza misura sono opinioni. Questo progetto prende la domanda sul serio e costruisce una risposta numerica.</p>
        </div>
        <div class="about-project-block">
          <span class="ix">Il metodo</span>
          <p>Ogni post Instagram viene classificato su dieci temi da un modello linguistico locale. Il ranking tematico che ne emerge — quante volte ogni tema compare, con quale intensità — viene confrontato con le priorità dei giovani 16-30 rilevate dalla Flash Eurobarometer.</p>
        </div>
        <div class="about-project-block">
          <span class="ix">Il risultato</span>
          <p>Non un'opinione, ma tre numeri: ρ di Spearman, τ di Kendall e Top-K overlap quantificano con precisione quanto le due agende coincidono. Il gap non si legge tra le righe: si calcola.</p>
        </div>
      </div>
    </section>

    <section class="about-sources">
      <header>
        <p class="kicker">Le fonti</p>
        <h2>Tre ingressi, una misura.</h2>
        <p>I dati vengono da tre sistemi distinti che vivono in spazi di misura diversi. Il confronto finale avviene sui ranghi — l'unica lingua che tutti e tre parlano.</p>
      </header>
      <div class="about-sources-grid">
        <article class="about-source-card">
          <span class="src-num">01</span>
          <h3>Le priorità dei giovani</h3>
          <p>Il vocabolario tematico e le percentuali di priorità vengono dalla <strong>Flash Eurobarometer EP013EP</strong> — Youth Survey 2024, domanda Q2, giovani 16-30 anni, Italia. Il profilo demografico di sfondo è costruito sui microdati <strong>ISTAT AVQ</strong> (Aspetti della Vita Quotidiana, 2021–2023): 29 archetipi sintetici generati via LLM a partire da cluster sociodemografici reali.</p>
          <div class="src-tag">Eurobarometer · ISTAT AVQ</div>
        </article>
        <article class="about-source-card">
          <span class="src-num">02</span>
          <h3>La comunicazione politica</h3>
          <p>Per ogni profilo monitorato vengono scaricati tutti i post pubblici del periodo. La lettura è <strong>multimodale</strong>: caption testuale, testo estratto con OCR dalle immagini, parlato trascritto con <strong>Whisper</strong> dai video. Niente storie, niente commenti, nessuna metrica di engagement. Solo ciò che il politico ha scelto consapevolmente di pubblicare.</p>
          <div class="src-tag">Instagram · OCR · Whisper</div>
        </article>
        <article class="about-source-card">
          <span class="src-num">03</span>
          <h3>La classificazione tematica</h3>
          <p>Un LLM locale (<strong>Qwen3 14B via Ollama</strong>) valuta ogni post su ciascuno dei dieci topic con scala ordinale 1–5: assente, marginale, presente, rilevante, dominante. L'inferenza gira interamente in locale su hardware consumer: nessun testo lascia il sistema, nessuna API esterna coinvolta.</p>
          <div class="src-tag">Qwen3 14B · Ollama · locale</div>
        </article>
      </div>
    </section>

    <section class="about-pipeline-band">
      <header>
        <p class="kicker">Il metodo</p>
        <h2>Da un post alla misura del gap, in cinque passaggi.</h2>
      </header>
      <div class="about-pipeline-grid">${pipelineHTML}</div>
    </section>

    <section class="about-metrics-band">
      <header>
        <p class="kicker">Come si misura</p>
        <h2>Tre metriche, un'unica domanda.</h2>
        <p>Survey e post esistono in spazi di misura diversi: percentuali di risposta da un lato, score LLM dall'altro. Il confronto avviene sui ranghi — l'ordine è la lingua comune.</p>
      </header>
      <div class="about-metrics-grid">
        <article class="about-metric">
          <span class="ix">α</span>
          <span class="tag">Coverage</span>
          <h3>Quanto spesso il tema viene davvero trattato.</h3>
          <div class="about-katex-formula">\\[ c_{i,p} = \\frac{1}{N_p} \\sum_{j=1}^{N_p} \\mathbf{1}[s_{i,j,p} \\geq 3] \\]</div>
          <p>Conta la quota di post in cui il tema è almeno <em>presente</em> (score ≥ 3). È la metrica più confrontabile con la survey: una scelta esplicita, non una sfumatura di intensità.</p>
        </article>
        <article class="about-metric">
          <span class="ix">β</span>
          <span class="tag">Ranking ordinale</span>
          <h3>Si confrontano gli ordini, non le quantità assolute.</h3>
          <div class="about-katex-formula">\\[ \\rho = \\operatorname{corr}(r_y,\\, r_p) \\qquad \\tau = \\frac{C - D}{C + D} \\]</div>
          <p>Spearman pesa gli scarti di rango ampi. Kendall confronta tutte le coppie di topic: C sono le coppie concordi, D quelle discordi. Entrambi vanno da −1 a +1.</p>
        </article>
        <article class="about-metric">
          <span class="ix">γ</span>
          <span class="tag">Top-K Overlap</span>
          <h3>I temi caldi dei giovani sono caldi anche per i politici?</h3>
          <div class="about-katex-formula">\\[ \\text{overlap}_k = |\\,T_{k,y} \\cap T_{k,p}\\,| \\]</div>
          <p>Si confrontano i podi: i K topic più scelti dai giovani contro i K più trattati dal politico. Una misura immediata, leggibile senza calcoli.</p>
        </article>
      </div>
    </section>

    <section class="about-glossary">
      <header>
        <p class="kicker">Numeri del progetto</p>
        <h2>I parametri in un colpo d'occhio.</h2>
        <p>Tutti i valori numerici usati nelle analisi, raccolti in un unico riferimento.</p>
      </header>
      <dl class="about-glossary-grid">
        <div class="about-glossary-item">
          <dt>Rispondenti italiani EP013EP (Q2)</dt>
          <dd>1012</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Età rispondenti</dt>
          <dd>16-30</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Periodo rilevazione Eurobarometer</dt>
          <dd>set-ott 2024</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Profili politici analizzati</dt>
          <dd>3</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Totale post analizzati</dt>
          <dd>742</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Post di validazione (umani)</dt>
          <dd>30 <span class="about-glossary-note">(10 per profilo)</span></dd>
        </div>
        <div class="about-glossary-item">
          <dt>Annotatori umani</dt>
          <dd>4</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Osservazioni appaiate per modello (val.)</dt>
          <dd>300</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Modelli LLM testati</dt>
          <dd>3</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Modello adottato</dt>
          <dd>gemma3:4b</dd>
        </div>
        <div class="about-glossary-item">
          <dt>κ<sub>w</sub> del modello adottato</dt>
          <dd>0,781</dd>
        </div>
        <div class="about-glossary-item">
          <dt>MAE del modello adottato</dt>
          <dd>0,244</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Bias medio modello</dt>
          <dd>+0,10</dd>
        </div>
        <div class="about-glossary-item">
          <dt>Soglia salienza Coverage</dt>
          <dd>τ = 3</dd>
        </div>
      </dl>
    </section>

    <section class="about-disclosure">
      <article>
        <span>Privacy</span>
        <h3>Solo contenuti pubblici, solo profili pubblici.</h3>
        <p>L'osservatorio analizza esclusivamente i post pubblici di account politici pubblici. Nessun follower, nessun commento, nessuna storia, nessun dato di terzi. La lettura del contenuto avviene tutta in locale: niente lascia il sistema.</p>
      </article>
      <article>
        <span>Honest by design</span>
        <h3>I numeri non sostituiscono i post.</h3>
        <p>OCR, trascrizioni e classificazione automatica sono utili, ma fallibili. Per questo ogni grafico è cliccabile fino al post di origine: il dato sintetico orienta la lettura, il contenuto originale la conferma o la smentisce.</p>
      </article>
      <article>
        <span>Limiti</span>
        <h3>Una fotografia, non una sentenza.</h3>
        <p>Il campione è limitato, la finestra temporale è breve, i topic sono dieci. Non rispondiamo alla domanda «chi è il politico migliore»; rispondiamo a una più stretta: <em>quanto la sua comunicazione su Instagram intercetta le priorità dei giovani in questo periodo?</em></p>
      </article>
    </section>

    <section class="about-closing">
      <p class="kicker">Il punto</p>
      <h2>La distanza tra <em>chiedere</em> e <em>parlarne</em> ha una forma. Si può guardare.</h2>
      <div class="about-closing-actions">
        <a class="button primary" href="#/overview">Inizia dalla panoramica</a>
        <a class="button ghost" href="#/topics">Esplora i topic</a>
      </div>
    </section>
  `;

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
