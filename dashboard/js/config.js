export const topicColumns = [
  { id: "ambiente_clima", label: "Ambiente e clima", color: "#2f7d5b" },
  { id: "lavoro_economia", label: "Lavoro e economia", color: "#8b5d2e" },
  { id: "costo_vita", label: "Costo della vita", color: "#be4a2f" },
  { id: "salute_welfare", label: "Salute e welfare", color: "#3f6ea8" },
  { id: "istruzione_formazione", label: "Istruzione e formazione", color: "#6f57a8" },
  { id: "uguaglianza_genere", label: "Uguaglianza di genere", color: "#bb4f7e" },
  { id: "difesa_sicurezza", label: "Difesa e sicurezza", color: "#495057" },
  { id: "immigrazione", label: "Immigrazione", color: "#197278" },
  { id: "democrazia_legalita", label: "Democrazia e legalità", color: "#7851a9" },
  { id: "abitazione", label: "Abitazione", color: "#cc7a00" },
];

export const youthPriorityValues = [0.46, 0.38, 0.34, 0.34, 0.26, 0.24, 0.16, 0.15, 0.15, 0.09];
export const youthSurveySource =
  "Flash Eurobarometer EP013EP, Youth Survey 2024, Italia, giovani 16-30 anni, domanda Q2.";

export const chartInfo = {
  meanScore: `
    <p>Ogni post viene valutato su ciascuno dei 10 topic con una scala ordinale da 1 a 5: assente, marginale, presente, rilevante, dominante.</p>
    <div class="about-katex-formula">\\[ \\bar{s}_{i,p} = \\frac{1}{N_p} \\sum_{j=1}^{N_p} s_{i,j,p} \\]</div>
    <p>Il valore descrive l'intensità media del tema i nei post del profilo p. Serve a capire quanto un tema pesa nel linguaggio complessivo del profilo, ma non separa frequenza e centralità.</p>
  `,
  coverage: `
    <p>La coverage misura la frequenza con cui un tema supera la soglia minima di presenza. La soglia &tau; vale 3: il tema deve essere almeno <em>presente</em> nel post.</p>
    <div class="about-katex-formula">\\[ c_{i,p} = \\frac{1}{N_p} \\sum_{j=1}^{N_p} \\mathbf{1}[s_{i,j,p} \\geq \\tau] \\]</div>
    <p>Questa è la metrica principale per costruire il ranking dei politici: trasforma gli score in una misura di selezione tematica, più confrontabile con una survey a risposta multipla.</p>
  `,
  slopegraph: `
    <p>Il grafico collega due ranghi per ogni topic: quello derivato dalle priorità dei giovani e quello derivato dalla coverage del politico.</p>
    <div class="about-katex-formula">\\[ r_{i,y} = \\operatorname{rank}(-\\mathrm{pct}_i) \\qquad r_{i,p} = \\operatorname{rank}(-c_{i,p}) \\]</div>
    <p>I valori sono ordinati in modo decrescente. I pareggi usano average tie-breaking: se due topic occupano le posizioni 3 e 4 con lo stesso valore, entrambi ricevono rank 3.5.</p>
    <p><strong>Lettura:</strong> una linea orizzontale segnala priorità simile. Una linea che scende verso destra indica che il politico mette quel tema più in alto dei giovani; una linea che sale indica sotto-prioritizzazione.</p>
  `,
  rankCorrelation: `
    <p>Le barre sintetizzano la somiglianza ordinale tra il ranking dei giovani e il ranking del politico.</p>
    <div class="about-katex-formula">\\[ \\rho = \\operatorname{corr}(r_y,\\, r_p) \\qquad \\tau = \\frac{C - D}{C + D} \\]</div>
    <p>Spearman pesa gli scarti di rango ampi. Kendall confronta tutte le coppie di topic: C sono le coppie ordinate nello stesso verso, D quelle ordinate in verso opposto.</p>
    <p>Entrambi vanno da -1 a 1: 1 = stesso ordine, 0 = assenza di concordanza ordinale, -1 = inversione completa.</p>
  `,
  topK: `
    <p>Misura se i temi in cima alla lista dei giovani compaiono anche tra i temi più presenti nella comunicazione del politico.</p>
    <div class="about-katex-formula">\\[ \\text{overlap}_k = |\\,T_{k,y} \\cap T_{k,p}\\,| \\]</div>
    <p>T<sub>k,y</sub> e T<sub>k,p</sub> sono gli insiemi dei topic entro la top-k dei giovani e del politico. Nel sito viene mostrato il numero di topic condivisi.</p>
    <p>Se il confine della top-k cade su un pareggio, tutti i topic a pari merito vengono inclusi. Questo evita di scegliere arbitrariamente tra temi con lo stesso rank.</p>
  `,
  similarity: `
    <p>Questa matrice non usa i giovani come riferimento: confronta le agende comunicative dei politici tra loro.</p>
    <div class="about-katex-formula">\\[ \\operatorname{sim}(a,b) = \\operatorname{corr}\\!\\left(r_{\\mathrm{cov},a},\\, r_{\\mathrm{cov},b}\\right) \\]</div>
    <p>r<sub>cov,a</sub> e r<sub>cov,b</sub> sono i ranking di <strong>coverage</strong> dei due profili (soglia τ = 3). Pearson sui ranghi equivale a Spearman ρ: confronta la struttura di priorità indipendentemente dai valori assoluti.</p>
    <p>Valori vicini a 1 indicano che i due profili ordinano i topic in modo simile. Valori bassi o negativi indicano gerarchie tematiche divergenti.</p>
  `,
  topicCorrelation: `
    <p>La matrice guarda i topic, non i politici: verifica se due temi tendono ad avere score alti negli stessi post.</p>
    <div class="about-katex-formula">\\[ \\operatorname{corr}(a,b) = \\operatorname{corr}(S_a,\\, S_b) \\]</div>
    <p>S<sub>a</sub> e S<sub>b</sub> sono i vettori degli score 1-5 dei due topic sui post visualizzati.</p>
    <p>Valori positivi indicano temi che crescono insieme; valori vicini a 0 indicano indipendenza; valori negativi indicano che quando un tema è forte l'altro tende a essere debole.</p>
  `,
  leadership: `
    <p>Questa vista ordina i topic per score medio nel corpus e, per ciascun topic, identifica il profilo con la media più alta.</p>
    <div class="about-katex-formula">\\[ \\operatorname{leader}(i) = \\underset{p}{\\arg\\max}\\; \\bar{s}_{i,p} \\]</div>
    <p>Per ogni topic si confrontano gli score medi dei profili. Il leader è il profilo con valore massimo; la barra visualizza l'intensità relativa del topic nel corpus.</p>
    <p>È una guida di ingresso alla lettura, non una misura di allineamento con i giovani: per quello contano coverage, ranking, slopegraph e correlazioni ordinali.</p>
  `,
};

export const politicians = [
  {
    id: "giorgiameloni",
    name: "Giorgia Meloni",
    handle: "@giorgiameloni",
    party: "Fratelli d'Italia",
    role: "Presidente del Consiglio",
    palette: ["#dde6f5", "#1a3470", "#3a6fd8"],
    photo: "Dashboard/dati/Giorgia_Meloni.jpg",
  },
  {
    id: "giuseppeconte_ufficiale",
    name: "Giuseppe Conte",
    handle: "@giuseppeconte_ufficiale",
    party: "Movimento 5 Stelle",
    role: "Leader politico",
    palette: ["#fdf2d0", "#7a4800", "#e8a800"],
    photo: "Dashboard/dati/Giuseppe_Conte.jpg",
  },
  {
    id: "ellyesse",
    name: "Elly Schlein",
    handle: "@ellyesse",
    party: "Partito Democratico",
    role: "Segretaria",
    palette: ["#f5dde0", "#8b1a1a", "#d63030"],
    photo: "Dashboard/dati/Elly_Schlein.jpg",
  },
  {
    id: "silviasalis",
    name: "Silvia Salis",
    handle: "@silviasalis",
    party: "Partito Democratico",
    role: "Vicesindaca di Genova",
    palette: ["#e8f4e8", "#1a5c1a", "#2e8b2e"],
    photo: "Dashboard/dati/Silvia_Salis.jpg",
  },
  {
    id: "nicolafratoianni",
    name: "Nicola Fratoianni",
    handle: "@nicolafratoianni",
    party: "Alleanza Verdi Sinistra",
    role: "Segretario di Sinistra Italiana",
    palette: ["#fde9c7", "#a8431a", "#e07a1f"],
    photo: "Dashboard/dati/Nicola_Fratoianni.jpg",
  },
  {
    id: "carlocalenda",
    name: "Carlo Calenda",
    handle: "@carlocalenda",
    party: "Azione",
    role: "Segretario di Azione",
    palette: ["#eef4fb", "#002b5c", "#005696"],
    photo: "Dashboard/dati/Carlo_Calenda.png",
  },
];

const byId = (collection, id) => collection.find((item) => item.id === id);
export const topicById = (id) => byId(topicColumns, id);
export const politicianById = (id) => byId(politicians, id);
