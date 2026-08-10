(function () {
  const A = window.DSApp;
  const { esc, ic } = A;
  const APP_PATH = "%APPDATA%\\DreamyStudio";
  const refresh = () => A.refreshSettings("general");
  const language = (next) => {
    if (A.store.get("lang", "vi") !== next) A.ACT.language();
    refresh();
  };
  const theme = (next) => {
    if (document.documentElement.getAttribute("data-theme") !== next) A.ACT.theme();
    else A.store.set("theme", next);
    refresh();
  };
  const reset = () => {
    language("vi");
    theme("dark");
    A.toast("Đã khôi phục cài đặt mặc định.");
  };
  const pathField = (id, label, path, hint) => `<div class="field">
    <span class="gn-path-label" id="${id}-label">${label}</span>
    <div class="tts-dir" data-testid="${id}" role="group" aria-labelledby="${id}-label"><span class="path" title="${esc(path)}">${esc(path)}</span><button type="button" class="btn btn-sm" data-act="gn-open-dir" aria-label="Mở ${label}">${ic("folder-open")}Mở</button></div>
    <span class="field-hint">${hint}</span>
  </div>`;

  const render = () => {
    const lang = A.store.get("lang", "vi");
    const currentTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    return `<div class="tts">
      <header class="tts-head"><div><h3 class="t-display-xs">General</h3></div></header>
      <p class="t-sm t-mute">Cài đặt giao diện, dữ liệu và lưu trữ.</p>
      <section class="tts-card">
        <header class="tts-card-h"><span class="eyebrow">Giao diện</span></header>
        <div class="gn-rows">
          <div class="gn-row"><div class="field"><span class="t-ink" id="gn-lang-label">Ngôn ngữ giao diện</span><span class="field-hint">Áp dụng ngay cho toàn bộ ứng dụng.</span></div>
            <div class="seg gn-seg" data-testid="gn-lang" role="group" aria-labelledby="gn-lang-label"><button type="button" class="${lang === "vi" ? "is-active" : ""}" data-act="gn-lang-vi" aria-pressed="${lang === "vi"}">Tiếng Việt</button><button type="button" class="${lang === "en" ? "is-active" : ""}" data-act="gn-lang-en" aria-pressed="${lang === "en"}">English</button></div></div>
          <div class="gn-row"><div class="field"><span class="t-ink" id="gn-theme-label">Chủ đề</span><span class="field-hint">Đồng bộ với nút đổi theme ở thanh trạng thái.</span></div>
            <div class="seg gn-seg" data-testid="gn-theme" role="group" aria-labelledby="gn-theme-label"><button type="button" class="${currentTheme === "dark" ? "is-active" : ""}" data-act="gn-theme-dark" aria-pressed="${currentTheme === "dark"}">${ic("moon")}Tối</button><button type="button" class="${currentTheme === "light" ? "is-active" : ""}" data-act="gn-theme-light" aria-pressed="${currentTheme === "light"}">${ic("sun")}Sáng</button></div></div>
        </div>
      </section>
      <section class="tts-card">
        <header class="tts-card-h gn-storage-head"><span class="eyebrow">Dữ liệu và lưu trữ</span><span class="spacer"></span><button type="button" class="btn btn-sm btn-ghost gn-switch" data-act="switch-workspace">Đổi workspace…</button></header>
        ${pathField("gn-ws-path", "Workspace đang mở", A.S.workspace.path, "Đổi workspace bằng lệnh Đổi workspace… ở thanh tiêu đề.")}
        ${pathField("gn-app-path", "Dữ liệu ứng dụng", APP_PATH, "Mô hình, cấu hình và API key chỉ nằm trên máy này, không đi cùng workspace.")}
      </section>
      <footer class="gn-footer"><div class="spc-note">${ic("info")}<span>Prototype: ngôn ngữ chỉ lưu lựa chọn, giao diện vẫn là tiếng Việt.</span></div><button type="button" class="btn btn-sm btn-ghost" data-testid="gn-reset" data-act="gn-reset">Khôi phục mặc định</button></footer>
    </div>`;
  };
  const mount = () => A.$("#layer .gn-switch")?.addEventListener("click", A.closeModal);

  A.SETTINGS_VIEWS.general = { cls: "modal-xl", render, mount };
  Object.assign(A.ACT, {
    "gn-lang-vi": () => language("vi"),
    "gn-lang-en": () => language("en"),
    "gn-theme-dark": () => theme("dark"),
    "gn-theme-light": () => theme("light"),
    "gn-open-dir": () => A.toast("Prototype: sẽ mở thư mục trong File Explorer."),
    "gn-reset": reset,
  });
})();
