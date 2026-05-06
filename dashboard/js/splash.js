(function bootSplashOverlay() {
  const root = document.getElementById("splash-root");
  if (!root) return;

  const splashDurationMs = 11500;

  function dismiss() {
    root.classList.add("is-hidden");
    window.setTimeout(() => root.remove(), 520);
  }

  window.setTimeout(dismiss, splashDurationMs);

  window.addEventListener("message", (e) => {
    if (e.data?.type === "splashSkip") dismiss();
  });
})();
