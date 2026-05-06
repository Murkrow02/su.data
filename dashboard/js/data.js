import { topicColumns, politicians } from "./config.js";
import { state } from "./state.js";

const SCORES_PATH = "/data/scores";
const CONTENT_PATH = "/data/content";

export function parseCsv(text, delimiter = ",") {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])),
  );
}

export async function loadPoliticianPosts(person) {
  const [csvText, rawItems] = await Promise.all([
    fetch(`${SCORES_PATH}/${person.id}.csv`).then((response) => response.text()),
    fetch(`${CONTENT_PATH}/${person.id}/${person.id}.json`).then((response) => response.json()),
  ]);

  const csvByFolder = new Map(parseCsv(csvText).map((row) => [row.folder_id, row]));
  return rawItems.map((raw) => {
    const row = csvByFolder.get(raw.folder_id) || {};
    const scores = Object.fromEntries(topicColumns.map((topic) => [topic.id, Number(row[topic.id] || 0)]));
    const keywords = (row.keywords || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);

    return {
      id: `${person.id}:${raw.folder_id}`,
      folderId: raw.folder_id,
      politician: person.id,
      type: row.type || raw.type || "post",
      url:        raw.url || "",
      oembedHtml: raw.oembed_html || "",
      caption: raw.caption || "",
      text: raw.text || "",
      language: row.language || raw.language || "",
      keywords,
      scores,
    };
  });
}

export async function loadData() {
  try {
    const batches = await Promise.all(politicians.map(loadPoliticianPosts));
    state.posts = batches.flat();
  } catch (error) {
    state.loadError = error.message;
  }
}
