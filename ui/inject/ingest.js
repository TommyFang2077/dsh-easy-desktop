(function () {
  const IMAGE_PATH = /^(?:file:\/\/|(?:\/|\.{1,2}\/)).+\.(?:png|jpe?g|gif|webp|bmp|tiff?)$/i;
  function looksLikeImagePath(text) {
    const first = (text || "").trim().split(/\s+/, 1)[0] || "";
    return IMAGE_PATH.test(first);
  }
  document.addEventListener("paste", function (e) {
    try {
      const items = Array.from(e.clipboardData ? e.clipboardData.items : []);
      const files = items.filter(function (item) { return item.kind === "file"; })
        .map(function (item) { return item.getAsFile(); })
        .filter(Boolean);
      if (files.length > 0) return;
      const text = e.clipboardData ? (e.clipboardData.getData("text/plain") || "") : "";
      const uris = e.clipboardData ? (e.clipboardData.getData("text/uri-list") || "") : "";
      if (looksLikeImagePath(text) || looksLikeImagePath(uris)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    } catch (err) {}
  }, true);

  window.__dshDesktopPasteFiles = function (items) {
    try {
      const dt = new DataTransfer();
      for (const item of items) {
        const bin = atob(item.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        dt.items.add(new File([bytes], item.name, { type: item.type }));
      }
      const drop = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt
      });
      try {
        Object.defineProperty(drop, "dataTransfer", { value: dt, configurable: true });
      } catch (e) {}
      document.dispatchEvent(drop);
    } catch (err) {
      console.error("dsh-desktop paste image failed", err);
    }
  };
})();
