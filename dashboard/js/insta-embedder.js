const InstaEmbedder = {
  _scriptPromise: null,

  _loadScript() {
    if (window.instgrm) return Promise.resolve(true);
    if (this._scriptPromise) return this._scriptPromise;
    this._scriptPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://www.instagram.com/embed.js";
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
    return this._scriptPromise;
  },

  async embed(containerId, { oembedHtml, url }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!oembedHtml) return;

    container.innerHTML = oembedHtml;
    const ok = await this._loadScript();
    if (ok && window.instgrm) window.instgrm.Embeds.process();
  },
};

export default InstaEmbedder;
