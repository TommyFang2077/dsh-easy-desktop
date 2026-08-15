(function () {
  const SUFFIX = " (modlens vision)";
  function textOf(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }
  function hideTwins(root) {
    const nodes = root.querySelectorAll("button, [role='menuitem'], [role='option'], [role='group'], h1, h2, h3, h4, span, div, p");
    const visionBases = new Set();
    for (const el of nodes) {
      if (el.childElementCount > 3) continue;
      const t = textOf(el);
      if (t.endsWith(SUFFIX) && t.length > SUFFIX.length) {
        visionBases.add(t.slice(0, -SUFFIX.length));
      }
    }
    if (visionBases.size === 0) return;
    for (const el of nodes) {
      if (el.childElementCount > 3) continue;
      const t = textOf(el);
      if (!visionBases.has(t)) continue;
      const row = el.closest("[role='group'], [role='menuitem'], li, section") || el;
      if (row && row.style.display !== "none") row.style.display = "none";
    }
  }
  const run = function () {
    try { hideTwins(document.body); } catch (e) {}
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
  const obs = new MutationObserver(run);
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
