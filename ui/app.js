const statusEl = document.getElementById("status");
const spinner = document.getElementById("spinner");
const retry = document.getElementById("retry");
const detail = document.getElementById("detail");

function tauri() {
  return window.__TAURI__;
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  const failed = kind === "error";
  spinner.hidden = failed;
  retry.hidden = !failed;
  if (!failed) {
    detail.hidden = true;
    detail.textContent = "";
  }
}

async function boot() {
  const api = tauri();
  if (!api) {
    setStatus("桌面接口未就绪", "error");
    return;
  }
  await api.event.listen("status", function (event) {
    setStatus(event.payload.message || "正在启动…", "ok");
  });
  await api.event.listen("error", function (event) {
    setStatus(event.payload.message || "启动失败", "error");
    if (event.payload.detail) {
      detail.hidden = false;
      detail.textContent = event.payload.detail;
    }
  });
  await api.event.listen("ready", function (event) {
    if (event.payload && event.payload.url) {
      window.location.replace(event.payload.url);
    }
  });
  retry.addEventListener("click", function () {
    setStatus("正在重新启动…", "ok");
    api.core.invoke("restart");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
