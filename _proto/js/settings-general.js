(function () {
  const A = window.DSApp;
  const { esc, ic } = A;
  const APP_PATH = "%APPDATA%\\DreamyStudio";
  const refresh = () => A.refreshSettings("general");
  const language = (next) => {
    if (A.store.get("lang", "en") !== next) A.ACT.language();
    refresh();
  };
  const theme = (next) => {
    if (document.documentElement.getAttribute("data-theme") !== next) A.ACT.theme();
    else A.store.set("theme", next);
    refresh();
  };
  const reset = () => {
    language("en");
    theme("dark");
    A.toast("Restored the default settings.");
  };
  const pathField = (id, label, path, hint) => `<div class="field">
    <span class="gn-path-label" id="${id}-label">${label}</span>
    <div class="tts-dir" data-testid="${id}" role="group" aria-labelledby="${id}-label"><span class="path" title="${esc(path)}">${esc(path)}</span><button type="button" class="btn btn-sm" data-act="gn-open-dir" aria-label="Open ${label}">${ic("folder-open")}Open</button></div>
    <span class="field-hint">${hint}</span>
  </div>`;

  const render = () => {
    const lang = A.store.get("lang", "en");
    const currentTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    return `<div class="tts">
      <header class="tts-head"><div><h3 class="t-display-xs">General</h3></div></header>
      <p class="t-sm t-mute">Interface, data and storage settings.</p>
      <section class="tts-card">
        <header class="tts-card-h"><span class="eyebrow">Interface</span></header>
        <div class="gn-rows">
          <div class="gn-row"><div class="field"><span class="t-ink" id="gn-lang-label">Interface language</span><span class="field-hint">Applies immediately to the whole app.</span></div>
            <div class="seg gn-seg" data-testid="gn-lang" role="group" aria-labelledby="gn-lang-label"><button type="button" class="${lang === "vi" ? "is-active" : ""}" data-act="gn-lang-vi" aria-pressed="${lang === "vi"}">Vietnamese</button><button type="button" class="${lang === "en" ? "is-active" : ""}" data-act="gn-lang-en" aria-pressed="${lang === "en"}">English</button></div></div>
          <div class="gn-row"><div class="field"><span class="t-ink" id="gn-theme-label">Theme</span><span class="field-hint">Synced with the theme switch button in the status bar.</span></div>
            <div class="seg gn-seg" data-testid="gn-theme" role="group" aria-labelledby="gn-theme-label"><button type="button" class="${currentTheme === "dark" ? "is-active" : ""}" data-act="gn-theme-dark" aria-pressed="${currentTheme === "dark"}">${ic("moon")}Dark</button><button type="button" class="${currentTheme === "light" ? "is-active" : ""}" data-act="gn-theme-light" aria-pressed="${currentTheme === "light"}">${ic("sun")}Light</button></div></div>
        </div>
      </section>
      <section class="tts-card">
        <header class="tts-card-h gn-storage-head"><span class="eyebrow">Data and storage</span><span class="spacer"></span><button type="button" class="btn btn-sm btn-ghost gn-switch" data-act="switch-workspace">Switch workspace…</button></header>
        ${pathField("gn-ws-path", "Open workspace", A.S.workspace.path, "Switch workspace with the Switch workspace… command in the title bar.")}
        ${pathField("gn-app-path", "Application data", APP_PATH, "Models, configuration and API keys live only on this machine, they do not travel with the workspace.")}
      </section>
      <footer class="gn-footer"><div class="spc-note">${ic("info")}<span>Prototype: the language only stores the choice, the interface stays in English.</span></div><button type="button" class="btn btn-sm btn-ghost" data-testid="gn-reset" data-act="gn-reset">Restore defaults</button></footer>
    </div>`;
  };
  const mount = () => A.$("#layer .gn-switch")?.addEventListener("click", A.closeModal);

  A.SETTINGS_VIEWS.general = { cls: "modal-xl", render, mount };
  Object.assign(A.ACT, {
    "gn-lang-vi": () => language("vi"),
    "gn-lang-en": () => language("en"),
    "gn-theme-dark": () => theme("dark"),
    "gn-theme-light": () => theme("light"),
    "gn-open-dir": () => A.toast("Prototype: will open the folder in File Explorer."),
    "gn-reset": reset,
  });
})();
