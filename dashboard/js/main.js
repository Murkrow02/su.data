import { state } from "./state.js";
import { app, searchInput } from "./dom.js";
import { routeParams, routePath } from "./router.js";
import { loadData } from "./data.js";
import {
  setActiveNav,
  renderLoading,
  renderError,
  renderLanding,
  renderAbout,
  renderOverview,
  renderPoliticians,
  renderPolitician,
  renderPosts,
  renderPost,
  renderTopics,
} from "./views.js";

function render({ focusMain = true } = {}) {
  if (state.loadError) {
    renderError();
    return;
  }
  if (!state.posts.length) {
    renderLoading();
    return;
  }

  const [route, id] = routePath().split("/").filter(Boolean);
  if (!route) renderLanding();
  else if (route === "overview") renderOverview();
  else if (route === "politicians") renderPoliticians();
  else if (route === "politician") renderPolitician(id);
  else if (route === "posts") renderPosts();
  else if (route === "post") renderPost(id);
  else if (route === "topics") renderTopics();
  else if (route === "about") renderAbout();
  else renderLanding();

  if (focusMain && document.activeElement !== searchInput) app.focus({ preventScroll: true });

  if (window.renderMathInElement) {
    window.renderMathInElement(app, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
    });
  }
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  const [routePart] = location.hash.replace("#", "").split("?");
  const [route] = routePart.split("/").filter(Boolean);
  if (route !== "posts") {
    const params = new URLSearchParams();
    params.set("search", "1");
    if (state.query.trim()) params.set("q", state.query);
    history.replaceState(null, "", `#/posts?${params.toString()}`);
  } else {
    const params = routeParams();
    params.set("search", "1");
    if (state.query.trim()) params.set("q", state.query);
    else params.delete("q");
    params.delete("page");
    history.replaceState(null, "", `#/posts?${params.toString()}`);
  }
  render({ focusMain: false });
});

window.addEventListener("hashchange", () => { window.scrollTo(0, 0); render(); });
render();
loadData().then(render);
