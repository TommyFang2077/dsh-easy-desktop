(function () {
  if (window.__dshDesktopChrome) return;
  window.__dshDesktopChrome = true;

  const css = `
    :root { --dsh-desktop-titlebar-h: 36px; }
    html.dsh-desktop-offset {
      box-sizing: border-box !important;
      padding-top: var(--dsh-desktop-titlebar-h);
    }
    #dsh-desktop-titlebar {
      position: fixed; top: 0; left: 0; right: 0; height: var(--dsh-desktop-titlebar-h);
      z-index: 2147483646; display: flex; align-items: center;
      padding: 0 12px; box-sizing: border-box;
      background: rgba(246, 246, 248, 0.72);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
      border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
      user-select: none; -webkit-user-select: none;
    }
    @media (prefers-color-scheme: dark) {
      #dsh-desktop-titlebar {
        background: rgba(28, 28, 30, 0.72);
        border-bottom-color: rgba(255, 255, 255, 0.08);
      }
      #dsh-desktop-titlebar .more { color: rgba(255,255,255,0.45); }
      #dsh-desktop-titlebar .menu {
        background: rgba(44, 44, 46, 0.96);
        box-shadow: 0 8px 28px rgba(0,0,0,0.45);
      }
      #dsh-desktop-titlebar .menu button { color: #f5f5f7; }
      #dsh-desktop-titlebar .menu button:hover { background: rgba(255,255,255,0.08); }
    }
    #dsh-desktop-titlebar .traffic {
      display: flex; gap: 8px; align-items: center; height: 100%;
    }
    #dsh-desktop-titlebar .tl {
      width: 12px; height: 12px; min-width: 12px; min-height: 12px;
      max-width: 12px; max-height: 12px; flex: none; overflow: hidden;
      box-sizing: border-box; border-radius: 50%; border: 0;
      padding: 0; margin: 0; display: grid; place-items: center; cursor: default;
      position: relative;
    }
    #dsh-desktop-titlebar .tl.close { background: #ff5f57; }
    #dsh-desktop-titlebar .tl.min { background: #febc2e; }
    #dsh-desktop-titlebar .tl.zoom { background: #28c840; }
    #dsh-desktop-titlebar .tl::after {
      content: ""; font-size: 9px; line-height: 1; font-weight: 700;
      color: rgba(0,0,0,0.55); opacity: 0;
    }
    #dsh-desktop-titlebar .traffic:hover .tl.close::after { content: "×"; opacity: 1; }
    #dsh-desktop-titlebar .traffic:hover .tl.min::after { content: "–"; opacity: 1; }
    #dsh-desktop-titlebar .traffic:hover .tl.zoom::after { content: "+"; opacity: 1; }
    #dsh-desktop-titlebar .drag { flex: 1; height: 100%; }
    #dsh-desktop-titlebar .more {
      appearance: none; border: 0; background: transparent;
      color: rgba(0,0,0,0.35); font-size: 15px; letter-spacing: 0.08em;
      width: 28px; height: 20px; border-radius: 6px; cursor: default;
    }
    #dsh-desktop-titlebar .more:hover { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.7); }
    #dsh-desktop-titlebar .menu {
      position: absolute; top: calc(var(--dsh-desktop-titlebar-h) + 2px); left: 8px; min-width: 168px;
      padding: 4px; border-radius: 10px;
      background: rgba(255,255,255,0.96);
      box-shadow: 0 8px 28px rgba(0,0,0,0.16);
      display: none; flex-direction: column;
    }
    #dsh-desktop-titlebar .menu.open { display: flex; }
    #dsh-desktop-titlebar .menu button {
      appearance: none; border: 0; background: transparent;
      text-align: left; padding: 7px 10px; border-radius: 6px;
      font: 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      color: #1d1d1f; cursor: default;
    }
    #dsh-desktop-titlebar .menu button:hover { background: rgba(0,0,0,0.05); }
    #dsh-desktop-titlebar .menu button:disabled { opacity: 0.35; }
  `;

  function api() {
    return window.__TAURI__ || null;
  }

  function inject() {
    if (document.getElementById("dsh-desktop-titlebar")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);

    const bar = document.createElement("header");
    bar.id = "dsh-desktop-titlebar";
    bar.innerHTML =
      '<button class="more" type="button" aria-label="更多">•••</button>' +
      '<div class="menu">' +
        '<button type="button" data-cmd="restart">重新启动</button>' +
        '<button type="button" data-cmd="open_in_browser">在浏览器中打开</button>' +
      "</div>" +
      '<div class="drag" data-tauri-drag-region></div>' +
      '<div class="traffic">' +
        '<button class="tl min" data-win="minimize" aria-label="最小化"></button>' +
        '<button class="tl zoom" data-win="zoom" aria-label="缩放"></button>' +
        '<button class="tl close" data-win="close" aria-label="关闭"></button>' +
      "</div>";
    document.documentElement.appendChild(bar);
    if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname)) {
      document.documentElement.classList.add("dsh-desktop-offset");
    }

    const menu = bar.querySelector(".menu");
    const more = bar.querySelector(".more");
    more.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.toggle("open");
    });
    document.addEventListener("click", function () {
      menu.classList.remove("open");
    });

    bar.addEventListener("dblclick", function (e) {
      if (e.target.closest(".tl, .more, .menu")) return;
      const t = api();
      if (t && t.window) t.window.getCurrentWindow().toggleMaximize();
    });

    bar.addEventListener("click", function (e) {
      const t = api();
      const winBtn = e.target.closest("[data-win]");
      if (winBtn && t && t.window) {
        const w = t.window.getCurrentWindow();
        const act = winBtn.getAttribute("data-win");
        if (act === "close") w.close();
        else if (act === "minimize") w.minimize();
        else if (act === "zoom") w.toggleMaximize();
        return;
      }
      const cmd = e.target.closest("[data-cmd]");
      if (cmd && t && t.core) {
        menu.classList.remove("open");
        t.core.invoke(cmd.getAttribute("data-cmd"));
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }

  function clipboardText(e, type) {
    try {
      return e.clipboardData ? (e.clipboardData.getData(type) || "") : "";
    } catch (err) {
      return "";
    }
  }

  async function readAsyncClipboardImages() {
    if (!navigator.clipboard || !navigator.clipboard.read) return [];
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.indexOf("image/") !== 0) continue;
          const blob = await item.getType(type);
          if (!blob || !blob.size) continue;
          const ext = (type.split("/")[1] || "png").replace("jpeg", "jpg");
          files.push(new File([blob], "clipboard." + ext, { type: blob.type || type }));
        }
      }
      return files;
    } catch (err) {
      return [];
    }
  }

  const harness = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  if (harness && location.protocol.indexOf("http") === 0) {
    document.addEventListener("paste", async function (e) {
      if (window.__dshDesktopIngesting) return;
      const ingest = window.__dshDesktopIngestFiles;
      const fromEvent = window.__dshDesktopImageFilesFromEvent;
      const pathLike = window.__dshDesktopLooksLikeImagePath;
      if (!ingest) return;
      try {
        const local = fromEvent ? fromEvent(e) : [];
        const text = clipboardText(e, "text/plain");
        const uris = clipboardText(e, "text/uri-list");
        const html = clipboardText(e, "text/html");
        const imagePath = Boolean(pathLike && (pathLike(text) || pathLike(uris)));
        const hasText = Boolean(String(text).trim() || String(html).trim());
        // Image files in the event, or a pasted image path, are ours. Empty
        // payload is the Linux case where the image is only on the native
        // clipboard. Non-empty text/html must reach the page — do not cancel
        // first and then fail to recover an image.
        if (!local.length && !imagePath && hasText) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        window.__dshDesktopIngesting = true;
        try {
          if (local.length) {
            await ingest(local);
            return;
          }
          let files = await readAsyncClipboardImages();
          if (!files.length) {
            const t = api();
            if (t && t.core) {
              const payload = await t.core.invoke("read_clipboard_images");
              if (payload && payload.length && window.__dshDesktopPasteFiles) {
                await window.__dshDesktopPasteFiles(payload);
                return;
              }
            }
          }
          if (files.length) await ingest(files);
        } finally {
          window.__dshDesktopIngesting = false;
        }
      } catch (err) {
        window.__dshDesktopIngesting = false;
      }
    }, true);
  }
})();
