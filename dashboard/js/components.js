import { topicColumns, politicians, politicianById } from "./config.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { topScores, topicSummary, keywordSummary, scoreValue } from "./stats.js";
import { keywordSearchHref, hrefWithPage } from "./router.js";

export function pageShell(kicker, title, text, content) {
  return `
    <section class="page-heading">
      <p class="kicker">${escapeHtml(kicker)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(text)}</p>
    </section>
    ${content}
  `;
}

export function topicPill(topic, score) {
  return `
    <a class="topic-pill" href="#/posts?topic=${topic.id}" style="--topic:${topic.color}">
      ${escapeHtml(topic.label)}
      ${score ? `<strong>${score}/5</strong>` : ""}
    </a>
  `;
}

export function highlightText(text, query) {
  const safe = escapeHtml(text);
  if (!query || !query.trim()) return safe;
  const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${escapedQuery})`, "gi"), '<mark class="hl">$1</mark>');
}

export function keywordCloud(items, baseHref = "#/posts", activeQuery = "") {
  return `
    <div class="keyword-cloud">
      ${items
        .map((item) => {
          const isActive = activeQuery && item.label.toLowerCase() === activeQuery.toLowerCase();
          return `
        <a href="${keywordSearchHref(item.label, baseHref)}" class="keyword-token${isActive ? " is-active" : ""}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${item.count}</strong>
        </a>
      `;
        })
        .join("")}
    </div>
  `;
}

export function chartShell(kicker, title, text, body, info = "") {
  const infoBlock = info
    ? `
      <details class="chart-info">
        <summary aria-label="Apri spiegazione del grafico"><span>i</span></summary>
        <div class="chart-info-card">${info}</div>
      </details>
    `
    : "";
  return `
    <section class="native-chart">
      <div class="chart-copy">
        <div class="chart-head">
          <div>
            <span>${escapeHtml(kicker)}</span>
            <h2>${escapeHtml(title)}</h2>
          </div>
          ${infoBlock}
        </div>
        <p>${escapeHtml(text)}</p>
      </div>
      ${body}
    </section>
  `;
}

export function topicMeter(topic) {
  const min = topic.metricMin ?? 1;
  const max = topic.metricMax || 5;
  const ratio = (topic.average - min) / (max - min || 1);
  const width = topic.average <= min ? 0 : Math.max(4, ratio * 100);
  return `
    <a class="topic-meter" href="#/posts?topic=${topic.id}">
      <span>${escapeHtml(topic.label)}</span>
      <div><i style="width:${width}%;--topic:${topic.color}"></i></div>
      <strong>${topic.average.toFixed(2)}</strong>
    </a>
  `;
}

export function postCard(post, mode = "compact") {
  const person = politicianById(post.politician);
  const palette = person.palette;
  const title = post.caption || post.text || "Contenuto senza testo";
  const excerpt = title.replace(/\s+/g, " ").slice(0, 180);

  return `
    <article class="post-card post-card-rich">
      <a class="post-media" href="#/post/${encodeURIComponent(post.id)}" aria-label="Apri post ${escapeHtml(post.folderId)}">
        <div class="generated-media" style="--a:${palette[0]};--b:${palette[1]};--c:${palette[2]}">
          <span>${escapeHtml(person.handle)}</span>
        </div>
        <span class="media-type media-type--${escapeHtml(post.type)}">
          ${post.type === "video"
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Video`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg> Foto`
          }
        </span>
      </a>
      <div class="post-body">
        <div class="post-meta">${escapeHtml(person.name)} · ID ${escapeHtml(post.folderId)}</div>
        <h3><a href="#/post/${encodeURIComponent(post.id)}">${escapeHtml(title.slice(0, 96))}${title.length > 96 ? "..." : ""}</a></h3>
        <p>${escapeHtml(excerpt)}${title.length > 180 ? "..." : ""}</p>
        <div class="topic-strip">${topScores(post).map((topic) => topicPill(topic, topic.score)).join("")}</div>
        ${post.keywords.length ? keywordCloud(post.keywords.slice(0, 6).map((label) => ({ label, count: "" }))) : ""}
        ${
          mode === "full"
            ? `<a class="text-link" href="#/post/${encodeURIComponent(post.id)}">Apri testo completo</a>`
            : ""
        }
      </div>
    </article>
  `;
}

export function miniPostRow(post) {
  const person = politicianById(post.politician);
  const [mainTopic] = topScores(post, 1);
  const polColor = person.palette[2];
  const text = (post.caption || post.text || "Contenuto").replace(/\s+/g, " ");
  return `
    <a class="post-row" href="#/post/${encodeURIComponent(post.id)}" style="--topic:${polColor}">
      <span>${escapeHtml(person.name)}</span>
      <strong>${highlightText(text.slice(0, 132), state.query)}${text.length > 132 ? "..." : ""}</strong>
      <span class="post-row-meta"><em>${escapeHtml(mainTopic.label)}</em><b class="post-row-score">${mainTopic.score}/5</b></span>
    </a>
  `;
}

export function postTile(post, index) {
  const person = politicianById(post.politician);
  const [mainTopic] = topScores(post, 1);
  const polColor = person.palette[2];
  const title = (post.caption || post.text || "Contenuto senza testo").replace(/\s+/g, " ");
  return `
    <a class="post-tile" href="#/post/${encodeURIComponent(post.id)}" style="--topic:${polColor}" aria-label="Apri post ${escapeHtml(post.folderId)}">
      <div class="tile-top-row">
        <span class="tile-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="media-type media-type--${escapeHtml(post.type)} tile-type-badge">
          ${post.type === "video"
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Video`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg> Foto`
          }
        </span>
      </div>
      <div>
        <strong>${escapeHtml(person.name)}</strong>
        <small>ID ${escapeHtml(post.folderId)}</small>
      </div>
      <h3>${highlightText(title.slice(0, 84), state.query)}${title.length > 84 ? "..." : ""}</h3>
      <p>${escapeHtml(mainTopic.label)} · ${mainTopic.score}/5</p>
      <em>Apri</em>
    </a>
  `;
}

export function postGroup(group) {
  const highlights = [...group.posts].sort((a, b) => topScores(b, 1)[0].score - topScores(a, 1)[0].score).slice(0, 4);
  const [mainTopic] = topicSummary(group.posts);
  return `
    <section class="post-group" style="--topic:${mainTopic?.color || "var(--red)"}">
      <header>
        <div>
          <span>${escapeHtml(group.person.handle)}</span>
          <h2>${escapeHtml(group.person.name)}</h2>
        </div>
        <a class="button ghost" href="#/posts?politician=${group.person.id}">Mostra solo questi</a>
      </header>
      <div class="post-tile-grid">${highlights.map(postTile).join("")}</div>
    </section>
  `;
}

export function pagination(page, totalPages, baseHref) {
  if (totalPages <= 1) return "";
  const windowPages = Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter(
    (item) => item >= 1 && item <= totalPages,
  );

  return `
    <nav class="pagination" aria-label="Pagine post">
      <a class="page-control ${page === 1 ? "is-disabled" : ""}" href="${page === 1 ? "#" : hrefWithPage(baseHref, page - 1)}">Precedente</a>
      ${windowPages
        .map((item) => `<a class="page-number ${item === page ? "is-active" : ""}" href="${hrefWithPage(baseHref, item)}">${item}</a>`)
        .join("")}
      <a class="page-control ${page === totalPages ? "is-disabled" : ""}" href="${page === totalPages ? "#" : hrefWithPage(baseHref, page + 1)}">Successiva</a>
    </nav>
  `;
}

export function politicianMini(person) {
  const list = state.posts.filter((post) => post.politician === person.id);
  const [mainTopic] = topicSummary(list);
  return `
    <a href="#/politician/${person.id}" class="politician-mini" style="--a:${person.palette[0]};--b:${person.palette[1]};--c:${person.palette[2]}">
      <span></span>
      <div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(mainTopic?.label || "Corpus in caricamento")}</small></div>
      <b>${list.length}</b>
    </a>
  `;
}

export function landingEntryPanel() {
  return `
    <article class="landing-entry-panel">
      <p class="kicker">Da dove iniziare</p>
      <h2>Una lettura guidata tra metodo e contenuti.</h2>
       <div class="landing-entry-links">
        <a href="#/overview"><span>Panoramica</span><strong>Capisci il quadro generale</strong></a>
        <a href="#/politicians"><span>Politici</span><strong>Confronta i profili</strong></a>
        <a href="#/about"><span>La Ricerca</span><strong>Il racconto del progetto</strong></a>
      </div>
      <div class="landing-stats" aria-label="Dimensione del corpus">
        <div><strong>${state.posts.length}</strong><span>post</span></div>
        <div><strong>${politicians.length}</strong><span>profili</span></div>
        <div><strong>${topicColumns.length}</strong><span>topic</span></div>
      </div>

    </article>
  `;
}

export function landingKeywordMap() {
  const keywords = keywordSummary(state.posts, 28);
  const items = keywords
    .map((item, index) => {
      const color = topicColumns[index % topicColumns.length].color;
      return `<a class="kw-tick" href="${keywordSearchHref(item.label)}" style="--color:${color}">${escapeHtml(item.label)}</a>`;
    })
    .join("");

  return `
    <section class="landing-keyword-map" aria-label="Keyword ricorrenti nei post">
      <div class="keyword-map-head">
        <span>Parole ricorrenti</span>
        <strong>Clicca una parola per cercarla nei post</strong>
      </div>
      <div class="kw-ticker-wrap">
        <div class="kw-ticker">${items}${items}</div>
      </div>
    </section>
  `;
}
