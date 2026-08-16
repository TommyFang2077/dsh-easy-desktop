(function () {
  const IMAGE_PATH = /^(?:file:\/\/|(?:\/|\.{1,2}\/)).+\.(?:png|jpe?g|gif|webp|bmp|tiff?)$/i;
  const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|bmp|tiff?)$/i;

  function looksLikeImagePath(text) {
    const first = (text || "").trim().split(/\s+/, 1)[0] || "";
    return IMAGE_PATH.test(first);
  }

  function addImageFile(out, seen, file) {
    if (!file || !file.size) return;
    const type = file.type || "";
    if (type && !IMAGE_MIME.test(type)) return;
    if (!type && !IMAGE_PATH.test(file.name || "")) return;
    const key = (file.name || "") + ":" + file.size + ":" + type;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(file);
  }

  function imageFilesFromEvent(e) {
    const out = [];
    const seen = new Set();
    const data = e.clipboardData || e.dataTransfer;
    if (!data) return out;
    const items = data.items ? Array.from(data.items) : [];
    for (const item of items) {
      if (item.kind === "file" || (item.type && item.type.indexOf("image/") === 0)) {
        try {
          addImageFile(out, seen, item.getAsFile());
        } catch (err) {}
      }
    }
    if (data.files) {
      for (const file of data.files) addImageFile(out, seen, file);
    }
    return out;
  }

  function composer() {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) {
      return el;
    }
    return document.querySelector("form textarea, textarea, [contenteditable='true']");
  }

  function insertText(target, text) {
    const el = target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
      ? target
      : composer();
    if (!el || (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT")) return;
    el.focus();
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch (err) {
      inserted = false;
    }
    if (!inserted) {
      const proto = el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      const start = el.selectionStart || el.value.length;
      const end = el.selectionEnd || start;
      setter.call(el, el.value.slice(0, start) + text + el.value.slice(end));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function dataTransferOf(files) {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    return dt;
  }

  function dispatchWithData(type, target, dt, key) {
    let ev;
    try {
      if (type === "paste") {
        ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
      } else {
        ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      }
    } catch (err) {
      ev = new Event(type, { bubbles: true, cancelable: true });
    }
    try {
      Object.defineProperty(ev, key, { value: dt, configurable: true });
    } catch (err) {}
    target.dispatchEvent(ev);
    return ev;
  }

  function currentModelLabel() {
    const buttons = document.querySelectorAll("button[aria-label]");
    for (const button of buttons) {
      const label = button.getAttribute("aria-label") || "";
      if (/选择模型|select model|current model/i.test(label)) return label;
    }
    return "";
  }

  function shouldTakeoverPaste() {
    const label = currentModelLabel();
    return fetch("/modlens/paste?model=" + encodeURIComponent(label))
      .then(function (res) {
        if (!res.ok) return false;
        return res.json().then(function (body) {
          return body && body.takeover === true;
        });
      })
      .catch(function () {
        return false;
      });
  }

  function uploadModlens(files) {
    return Promise.all(
      files.map(function (file) {
        return file.arrayBuffer().then(function (buffer) {
          return fetch("/modlens/paste", { method: "POST", body: buffer }).then(function (res) {
            if (!res.ok) throw new Error("modlens paste failed " + res.status);
            return res.json();
          });
        });
      })
    ).then(function (results) {
      const text = results.map(function (r) { return r.path; }).filter(Boolean).join(" ");
      if (text) insertText(composer(), text + " ");
    });
  }

  function deliverNative(files) {
    const prev = window.__dshDesktopIngesting;
    window.__dshDesktopIngesting = true;
    try {
      const dt = dataTransferOf(files);
      const target = composer() || document;
      const paste = dispatchWithData("paste", target, dt, "clipboardData");
      if (paste.defaultPrevented) return;
      dispatchWithData("drop", document, dt, "dataTransfer");
    } finally {
      window.__dshDesktopIngesting = prev;
    }
  }

  window.__dshDesktopLooksLikeImagePath = looksLikeImagePath;
  window.__dshDesktopImageFilesFromEvent = imageFilesFromEvent;

  window.__dshDesktopIngestFiles = function (files) {
    if (!files || !files.length) return Promise.resolve();
    return shouldTakeoverPaste()
      .then(function (takeover) {
        if (takeover) return uploadModlens(files);
        deliverNative(files);
      })
      .catch(function (err) {
        console.error("dsh-desktop paste image failed", err);
      });
  };

  window.__dshDesktopPasteFiles = function (items) {
    try {
      const files = [];
      for (const item of items) {
        const bin = atob(item.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        files.push(new File([bytes], item.name, { type: item.type }));
      }
      return window.__dshDesktopIngestFiles(files);
    } catch (err) {
      console.error("dsh-desktop paste image failed", err);
      return Promise.resolve();
    }
  };
})();
