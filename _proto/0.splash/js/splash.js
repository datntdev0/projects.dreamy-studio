(function () {
  "use strict";

  const WS = window.WS;
  const $ = (s) => document.querySelector(s);
  const welcome = $("#sp-welcome");
  const loading = $("#sp-loading");
  const notice = $("#sp-notice");
  const recent = $("#sp-recent");
  const first = $("#sp-first");
  const listEl = $("#sp-list");

  function showNotice(message) {
    $("#sp-notice-text").textContent = message || "";
    notice.hidden = !message;
  }

  function renderRecent() {
    const rows = WS.list();
    recent.hidden = !rows.length;
    first.hidden = rows.length > 0;
    $("#sp-count").textContent = rows.length;
    listEl.innerHTML = rows.length ? WS.rowsHtml(rows, WS.lastUsedPath(rows)) : "";
    if (rows.length) WS.hydrateSizes(listEl);
  }

  function showWelcome(message) {
    loading.hidden = true;
    loading.innerHTML = "";
    welcome.hidden = false;
    showNotice(message);
    renderRecent();
  }

  function openRecent(path) {
    const entry = WS.list().find((w) => w.path === path);
    if (!entry) return;
    showNotice("");
    welcome.hidden = true;
    loading.hidden = false;
    WS.start(entry, {
      mount: loading,
      onReady: () => { location.href = WS.MAIN_PAGE; },
      onFail: (message) => showWelcome(message),
      onCancel: () => showWelcome(""),
    });
  }

  function syncThemeIcon() {
    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    $("#sp-theme-use").setAttribute("href", dark ? "#i-sun" : "#i-moon");
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("ds.theme", JSON.stringify(next)); } catch { /* storage blocked */ }
    syncThemeIcon();
  }

  function selectLanguage(value, persist = true) {
    if (persist) {
      try { localStorage.setItem("ds.lang", JSON.stringify(value)); } catch { /* storage blocked */ }
    }
    document.querySelectorAll('[data-act="language"]').forEach((b) => {
      const on = b.dataset.v === value;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  const ACT = {
    "pick-folder": () => WS.pickFolder(),
    "relocate-recent": () => WS.pickFolder(),
    "workspace-delete": (el) => {
      const row = WS.list().find((item) => item.path === el.dataset.path);
      if (row && window.confirm(`Delete ${row.name} and all of its files? This cannot be undone.`)) {
        WS.deleteWorkspace(row.path);
        renderRecent();
      }
    },
    "open-recent": (el) => openRecent(el.dataset.path),
    "cancel-loading": () => WS.cancel(),
    theme: toggleTheme,
    language: (el) => selectLanguage(el.dataset.v),
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el && ACT[el.dataset.act]) {
      e.preventDefault();
      ACT[el.dataset.act](el, e);
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.key !== "Enter" && e.key !== " ") || !e.target.matches('[role="button"][data-act]')) return;
    e.preventDefault();
    e.target.click();
  });

  try { selectLanguage(JSON.parse(localStorage.getItem("ds.lang")) === "en" ? "en" : "vi", false); } catch { /* storage blocked */ }
  $("#sp-version").textContent = window.DS.version;
  syncThemeIcon();
  renderRecent();
})();
