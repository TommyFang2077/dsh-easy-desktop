const statusEl = document.getElementById("status");
const spinner = document.getElementById("spinner");
const retry = document.getElementById("retry");
const detail = document.getElementById("detail");
const updatePanel = document.getElementById("update-panel");
const updateNotes = document.getElementById("update-notes");
const installUpdate = document.getElementById("install-update");
const skipUpdate = document.getElementById("skip-update");

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

function continueBoot(api) {
  updatePanel.hidden = true;
  spinner.hidden = false;
  setStatus("正在启动…", "ok");
  return api.core.invoke("skip_shell_update");
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
  await api.event.listen("shell-update-progress", function (event) {
    const progress = event.payload || {};
    const suffix = typeof progress.percent === "number" ? ` ${progress.percent}%` : "";
    setStatus(`正在下载更新…${suffix}`, "ok");
  });

  retry.addEventListener("click", function () {
    setStatus("正在重新启动…", "ok");
    api.core.invoke("restart");
  });
  skipUpdate.addEventListener("click", function () {
    continueBoot(api);
  });
  installUpdate.addEventListener("click", async function () {
    installUpdate.disabled = true;
    skipUpdate.disabled = true;
    spinner.hidden = false;
    setStatus("正在准备签名更新…", "ok");
    try {
      await api.core.invoke("install_shell_update");
    } catch (error) {
      installUpdate.disabled = false;
      skipUpdate.disabled = false;
      spinner.hidden = true;
      statusEl.textContent = `更新失败：${String(error)}`;
    }
  });

  const update = await api.core.invoke("check_shell_update");
  if (update) {
    spinner.hidden = true;
    retry.hidden = true;
    statusEl.textContent = `发现壳更新 ${update.version}`;
    updateNotes.textContent = update.notes || "更新包已经签名，安装前会在本机完成校验。";
    updatePanel.hidden = false;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
