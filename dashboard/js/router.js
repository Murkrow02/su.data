export function routeParams() {
  const [, queryString = ""] = location.hash.split("?");
  return new URLSearchParams(queryString);
}

export function routePath() {
  const [routePart] = location.hash.replace("#", "").split("?");
  return routePart || "/";
}

export function hrefWithPage(baseHref, page) {
  const [path, queryString = ""] = baseHref.split("?");
  const params = new URLSearchParams(queryString);
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  const next = params.toString();
  return `${path}${next ? `?${next}` : ""}`;
}

export function keywordSearchHref(label, baseHref = "#/posts") {
  const [path, queryString = ""] = baseHref.split("?");
  const params = new URLSearchParams(queryString);
  params.set("search", "1");
  params.set("q", label);
  params.delete("page");
  return `${path}?${params.toString()}`;
}
