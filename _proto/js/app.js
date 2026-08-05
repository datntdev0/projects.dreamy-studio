/*
 * Dreamy Studio prototype.
 *  - Splash: welcome (open workspace via folder picker) → loading (init workspace + start app) → main layout.
 *  - Main layout: title bar, activity rail, explorer, editor tabs, inspector / assistant, pipelines panel, status bar.
 *  - Functional screens are "coming soon": each lists the requirements it will cover.
 * Everything is mock; no backend. Open index.html directly in a browser.
 */
(function () {
  "use strict";

  const D = window.DS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (name, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  /** localStorage that never throws (private windows, blocked storage). */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(`ds.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`ds.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  /* ---------------- data lookups ---------------- */
  const ITEMS = {};
  Object.entries(D.NAV).forEach(([rail, r]) =>
    r.sections.forEach((s) => s.items.forEach((i) => { ITEMS[i.id] = { ...i, rail, section: s.title }; })));

  const FIRST_RUN = /[?&]first-run\b/.test(location.search);

  const VIEWS = {};
  const EXPLORER_EXTRA = {};
  const EXPLORER_HEAD = {};
  const viewKey = (id) => String(id).split(":")[0];

  /* ---------------- state ---------------- */
  const S = {
    screen: "splash", // "splash" | "app"
    loading: null, // { ws, steps, pct } while the loading splash is shown
    token: 0, // bumped to cancel an in-flight loading run
    notice: null, // error shown on the welcome splash after a failed start
    relocate: null, // index of the NOT FOUND entry being re-located via the folder picker
    recent: FIRST_RUN ? [] : store.get("recent", D.seedWorkspaces),
    workspace: null,
    rail: "projects",
    explorerOpen: true,
    inspectorOpen: true,
    rightTab: "inspector",
    bottomOpen: false,
    bottomTab: "pipelines",
    tabs: ["home"],
    active: "home",
    collapsed: new Set(),
    log: [],
    scroll: {},
    renderedFor: null,
    settingsTab: "general",
    onOk: null,
  };
  const saveRecent = () => store.set("recent", S.recent);

  /* ---------------- screens ---------------- */
  function showScreen(name) {
    S.screen = name;
    $("#splash").hidden = name !== "splash";
    $("#app").hidden = name !== "app";
  }

  /* ---- splash: welcome (REQ-01-001) ---- */
  function renderWelcome() {
    S.loading = null;
    showScreen("splash");
    document.title = "Dreamy Studio";
    const rows = S.recent.map((w, i) => w.missing
      ? `<div class="ws-row is-error">
          ${ic("alert")}
          <div class="ws-main">
            <div class="ws-name"><span class="path">${esc(w.path)}</span><span class="badge badge-danger">NOT FOUND</span></div>
            <div class="t-sm ws-err">${esc(w.error)}</div>
          </div>
          <button class="btn btn-sm" data-act="pick-folder" data-i="${i}">Tìm lại…</button>
          <button class="btn btn-sm btn-ghost" data-act="remove-recent" data-i="${i}">Bỏ khỏi danh sách</button>
        </div>`
      : `<div class="ws-row" tabindex="0" data-act="open-recent" data-i="${i}">
          ${ic("hdd")}
          <div class="ws-main">
            <div class="ws-name">${esc(w.name)}${i === 0 ? `<span class="badge badge-primary">LAST USED</span>` : ""}</div>
            <div class="path t-mute">${esc(w.path)}</div>
            <div class="t-sm t-mute">${w.projects} project · ${esc(w.size)} · mở lần cuối <span class="mono">${esc(w.lastOpened)}</span></div>
          </div>
          <button class="btn btn-sm" tabindex="-1">Mở</button>
        </div>`).join("");

    const right = S.recent.length
      ? `<div class="sp-head"><span class="eyebrow">Workspace gần đây</span><span class="badge">${S.recent.length}</span></div>
         <div class="ws-list">${rows}</div>`
      : `<div class="ws-first">
          <div class="illus"></div>
          <h2 class="t-display-xs">Chưa có workspace nào</h2>
          <p class="t-sm t-mute">Workspace là một thư mục bình thường trên máy tính do bạn chọn. Dreamy Studio lưu toàn bộ novel, project và thư viện của bạn bên trong đó.</p>
          <p class="t-sm t-mute">Nếu thư mục chưa phải workspace, Dreamy Studio sẽ khởi tạo tại đó bằng tệp <span class="mono">workspace.dreamydb</span> và giữ nguyên các tệp sẵn có.</p>
        </div>`;
    const notice = S.notice ? `<div class="ld-warn is-error" role="alert">${ic("alert")}<span>${esc(S.notice)}</span></div>` : "";

    $("#splash").innerHTML = `
      <div class="sp-card">
        <div class="sp-left">
          <img class="logo" src="assets/dreamy-studio-mark.svg" alt="Dreamy Studio">
          <h1 class="t-display-sm">Dreamy Studio</h1>
          <p class="mono t-mute">V${esc(D.version)}</p>
          <p class="t-sm">Biến tác phẩm văn học thành audiobook, hình ảnh và video, ngay trên máy tính của bạn.</p>
          <div class="sp-actions">
            <button class="btn btn-primary" data-act="pick-folder" data-testid="sp-open-workspace">${ic("folder-open")}Mở workspace…</button>
          </div>
          <span class="spacer"></span>
          <div class="sp-note">${ic("lock")}<span>Nội dung dự án chỉ được lưu trên máy tính của bạn.</span></div>
        </div>
        <div class="sp-right">${notice}${right}</div>
      </div>`;
  }

  /* ---- splash: loading (REQ-01-001) ---- */
  function renderLoading() {
    const L = S.loading;
    const stepIcon = (st) => ({
      done: ic("check"),
      warn: ic("alert"),
      error: ic("x"),
      running: `<span class="dot dot-running"></span>`,
      pending: `<span class="dot"></span>`,
    }[st]);
    const warns = L.steps.filter((s) => (s.state === "warn" || s.state === "error") && s.note);
    $("#splash").innerHTML = `
      <div class="ld" role="status" aria-live="polite">
        <img class="ld-logo" src="assets/dreamy-studio-mark.svg" alt="">
        <div>
          <span class="eyebrow">${L.created ? "Đang khởi tạo workspace" : "Đang mở workspace"}</span>
          <h2 class="t-display-xs">${esc(L.ws.name)}</h2>
          <div class="path ld-path t-mute">${esc(L.ws.path)}</div>
        </div>
        <div class="progress" aria-hidden="true"><i style="width:${L.pct}%"></i></div>
        <div class="ld-steps">
          ${L.steps.map((s) => `<div class="ld-step is-${s.state}">${stepIcon(s.state)}<span>${esc(s.label)}</span><span class="ld-detail mono">${esc(s.detail)}</span></div>`).join("")}
        </div>
        ${warns.map((s) => `<div class="ld-warn ${s.state === "error" ? "is-error" : ""}">${ic("alert")}<span>${esc(s.note)}</span></div>`).join("")}
        <button class="btn btn-ghost btn-sm" data-act="cancel-loading">Hủy</button>
      </div>`;
  }

  /** Where a picked folder stands on the (mock) disk. Unknown folders count as empty. */
  function folderKind(path) {
    const key = path.toLowerCase();
    const disk = D.DISK_FOLDERS.find((f) => f.path.toLowerCase() === key);
    if (disk) return disk.kind;
    return S.recent.some((w) => !w.missing && w.path.toLowerCase() === key) ? "workspace" : "empty";
  }

  /** `relocate`: index of a NOT FOUND entry that this pick should replace. */
  async function startWorkspace(ws, { relocate = null } = {}) {
    const token = ++S.token;
    closeModal();
    S.notice = null;
    const kind = folderKind(ws.path);
    const created = kind !== "workspace";
    const L = D.LOAD_STEPS;
    const steps = [
      { ...L.check, fail: kind === "locked" ? "Không có quyền ghi vào thư mục này. Hãy chọn thư mục khác." : "" },
      { ...L.wsdb[created ? "new" : "open"] },
      { ...L.appdb },
      { ...L.logs },
    ].map((s) => ({ ...s, state: "pending" }));
    S.loading = { ws, created, steps, pct: 0 };
    S.log = [];
    showScreen("splash");
    renderLoading();
    log("info", "workspace", `${created ? "Initializing" : "Opening"} ${ws.path}`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      step.state = "running";
      renderLoading();
      await sleep(240 + Math.random() * 220);
      if (token !== S.token) return;
      if (step.fail) {
        step.state = "error";
        step.note = `${step.label}: ${step.fail}`;
        log("err", step.id, step.note);
        renderLoading();
        await sleep(1600);
        if (token !== S.token) return;
        S.notice = step.note;
        return renderWelcome();
      }
      step.state = "done";
      S.loading.pct = Math.round(((i + 1) / steps.length) * 100);
      log("ok", step.id, step.label);
      renderLoading();
    }
    await sleep(500);
    if (token !== S.token) return;
    if (relocate !== null) S.recent = S.recent.filter((_, i) => i !== relocate);
    enterShell(ws);
  }

  function enterShell(ws) {
    const entry = { path: ws.path, name: ws.name, projects: ws.projects ?? 0, size: ws.size ?? "0 B", lastOpened: stamp() };
    S.recent = [entry, ...S.recent.filter((w) => w.path.toLowerCase() !== ws.path.toLowerCase())];
    saveRecent();
    S.workspace = entry;
    S.loading = null;
    S.tabs = ["home"];
    S.active = "home";
    S.scroll = {};
    S.renderedFor = null;
    PL.list = [];
    window.NV?.reseed();
    window.LB?.reseed();
    window.PJ?.reseed();
    window.SC?.reseed();
    window.CR?.reseed();
    window.AB?.reseed();
    window.DT?.reseed();
    S.rail = "projects";
    S.rightTab = "inspector";
    document.title = `${entry.name} — Dreamy Studio`;
    showScreen("app");
    renderShell();
  }

  const log = (lv, src, msg) => S.log.push([new Date().toTimeString().slice(0, 8), lv, src, msg]);

  /* ---------------- main layout ---------------- */
  function renderShell() {
    $("#shell").classList.toggle("no-explorer", !S.explorerOpen);
    $("#shell").classList.toggle("no-inspector", !S.inspectorOpen);
    $("#tb-ws").innerHTML = `${ic("hdd")}<span class="name">${esc(S.workspace.name)}</span>${ic("chev-d")}`;
    renderRail();
    renderExplorer();
    renderTabs();
    renderEditor();
    renderInspector();
    renderBottom();
    renderStatus();
    syncToggles();
  }

  function syncToggles() {
    $("#tg-explorer").classList.toggle("is-active", S.explorerOpen);
    $("#tg-bottom").classList.toggle("is-active", S.bottomOpen);
    $("#tg-inspector").classList.toggle("is-active", S.inspectorOpen);
  }

  function renderRail() {
    const rails = Object.entries(D.NAV).map(([id, r]) => {
      const on = S.rail === id && S.explorerOpen;
      return `<button class="rail-btn ${on ? "is-active" : ""}" data-act="rail" data-v="${id}" data-tip-r="${esc(r.label)}" aria-label="${esc(r.label)}" aria-pressed="${on}">${ic(r.icon)}</button>`;
    }).join("");
    const asst = S.rightTab === "assistant" && S.inspectorOpen;
    $("#rail").innerHTML = `${rails}<span class="spacer"></span>
      <button class="rail-btn ${asst ? "is-active" : ""}" data-act="assistant" data-tip-r="Assistant" aria-label="Assistant" aria-pressed="${asst}">${ic("spark")}</button>
      <button class="rail-btn" data-act="settings" data-tip-r="Settings (Ctrl ,)" aria-label="Settings">${ic("settings")}</button>`;
  }

  function renderExplorer() {
    const rail = D.NAV[S.rail];
    const sections = rail.sections.filter((s) => !s.hidden).map((s) => {
      const key = `${S.rail}.${s.id}`;
      const open = s.headless || !S.collapsed.has(key);
      const rows = s.items.map((i) =>
        `<div class="tree-row ${S.active === i.id ? "is-selected" : ""}" tabindex="0" role="treeitem" data-act="open" data-id="${i.id}">${ic(i.icon)}<span class="tree-label">${esc(i.title)}</span></div>`).join("");
      return `<section class="ex-sec">
        ${s.headless ? "" : `<header class="ex-sec-head" tabindex="0" data-act="sec-toggle" data-k="${key}">${ic(open ? "chev-d" : "chev-r")}<span>${esc(s.title)}</span></header>`}
        ${open ? `<div class="ex-sec-body" role="tree">${EXPLORER_HEAD[s.id]?.() || ""}${rows}${EXPLORER_EXTRA[s.id]?.() || ""}</div>` : ""}
      </section>`;
    }).join("");
    $("#explorer").innerHTML = `
      <header class="pane-head"><span class="eyebrow">${esc(rail.label)}</span><span class="spacer"></span>
        <button class="btn btn-icon btn-sm" data-act="toggle-explorer" data-tip="Thu gọn (Ctrl B)" aria-label="Thu gọn">${ic("chev-l")}</button></header>
      <div class="pane-body">${sections}</div>`;
  }

  const tabInfo = (id) => id === "home" ? { title: "Home", logo: true } : { title: ITEMS[id].tab || ITEMS[id].title, icon: ITEMS[id].icon };

  function renderTabs() {
    $("#tabbar").innerHTML = `<div class="etabs">${S.tabs.map((id) => {
      const t = tabInfo(id);
      const on = id === S.active;
      return `<div class="etab ${on ? "is-active" : ""}" role="tab" aria-selected="${on}" tabindex="0" data-act="open" data-id="${id}" title="${esc(t.title)}">
        ${t.logo ? `<img src="assets/dreamy-studio-mark.svg" alt="">` : ic(t.icon)}<span class="etab-label">${esc(t.title)}</span>
        <button class="etab-close" data-act="close-tab" data-id="${id}" aria-label="Đóng tab" data-tip="Đóng (Ctrl W)">${ic("x")}</button></div>`;
    }).join("")}</div>`;
    $(".etab.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderCrumbs() {
    const parts = [`<span>${esc(S.workspace.name)}</span>`];
    if (S.active === "home") parts.push("Home");
    else parts.push(esc(ITEMS[S.active].section), esc(ITEMS[S.active].title));
    $("#crumbs").innerHTML = parts.join(ic("chev-r"));
  }

  const reqList = (reqs) => `<div class="req-list">${reqs.map(([id, text]) => `<div class="req-row"><span class="mono">${esc(id)}</span><span>${esc(text)}</span></div>`).join("")}</div>`;

  function comingSoon({ icon, cap, title, blurb, reqs }) {
    return `<div class="cs">
      <div class="cs-ico">${ic(icon)}</div>
      <div><span class="eyebrow">${esc(cap)}</span>
        <div class="cs-title"><h1 class="t-display-md">${esc(title)}</h1><span class="badge badge-info">COMING SOON</span></div></div>
      <p>${esc(blurb)}</p>
      <div><span class="eyebrow">Sẽ bao gồm</span></div>
      ${reqList(reqs)}
    </div>`;
  }

  function renderHome() {
    const cards = Object.entries(D.NAV).map(([id, r]) => {
      const first = r.sections[0].items[0].id;
      const items = r.sections.flatMap((s) => s.items);
      return `<button class="card home-card" data-act="rail-open" data-v="${id}" data-id="${first}">
        <span class="top">${ic(r.icon)}${esc(r.label)}<span class="spacer"></span><span class="badge badge-info">COMING SOON</span></span>
        <ul>${items.map((i) => `<li>${esc(i.title)}</li>`).join("")}</ul></button>`;
    }).join("");
    return `<div class="home">
      <div class="home-head">
        <span class="eyebrow">Workspace</span>
        <h1 class="t-display-md">${esc(S.workspace.name)}</h1>
        <span class="path t-mute">${esc(S.workspace.path)}</span>
      </div>
      <div class="home-grid">${cards}</div>
    </div>`;
  }

  function saveScroll() {
    if (!S.renderedFor) return;
    const ed = $("#editor");
    S.scroll[`${S.renderedFor}|#`] = ed.scrollTop;
    $$("[data-keep]", ed).forEach((el) => { S.scroll[`${S.renderedFor}|${el.dataset.keep}`] = el.scrollTop; });
  }
  function restoreScroll() {
    const ed = $("#editor");
    ed.scrollTop = S.scroll[`${S.active}|#`] || 0;
    $$("[data-keep]", ed).forEach((el) => { el.scrollTop = S.scroll[`${S.active}|${el.dataset.keep}`] || 0; });
  }
  function renderEditor() {
    renderCrumbs();
    saveScroll();
    const ed = $("#editor");
    const view = VIEWS[viewKey(S.active)];
    ed.classList.toggle("is-fill", !!view?.fill);
    if (S.active === "home") ed.innerHTML = renderHome();
    else if (view) { ed.innerHTML = view.render(S.active); view.mount?.(ed, S.active); }
    else ed.innerHTML = comingSoon(ITEMS[S.active]);
    S.renderedFor = S.active;
    restoreScroll();
  }
  function rerender() {
    const f = document.activeElement;
    const fid = f && f.id && $("#editor").contains(f) ? f.id : null;
    const sel = fid && typeof f.selectionStart === "number" ? [f.selectionStart, f.selectionEnd] : null;
    renderEditor();
    renderInspector();
    renderTabs();
    renderStatus();
    if (fid) {
      const n = document.getElementById(fid);
      n?.focus();
      if (sel && n?.setSelectionRange) { try { n.setSelectionRange(sel[0], sel[1]); } catch { } }
    }
  }
  let pendingRefresh = false;
  function softRerender() {
    if (document.activeElement?.matches?.("#editor textarea")) { pendingRefresh = true; return; }
    rerender();
  }
  document.addEventListener("focusout", () => {
    if (!pendingRefresh) return;
    setTimeout(() => { if (!document.activeElement?.matches?.("#editor textarea")) { pendingRefresh = false; rerender(); } }, 0);
  });

  function renderInspector() {
    const head = `<header class="ins-head">${[["inspector", "Inspector"], ["assistant", "Assistant"]].map(([id, label]) =>
      `<button class="ins-tab ${S.rightTab === id ? "is-active" : ""}" data-act="right-tab" data-v="${id}" aria-pressed="${S.rightTab === id}">${label}</button>`).join("")}
      <span class="spacer"></span>
      <button class="btn btn-icon btn-sm" data-act="toggle-inspector" data-tip="Thu gọn" aria-label="Thu gọn">${ic("chev-r")}</button></header>`;
    let body;
    if (S.rightTab === "assistant") {
      body = `<div class="asst">
        <div class="asst-body">
          <div class="cs-ico">${ic("spark")}</div>
          <div><span class="eyebrow">${esc(D.ASSISTANT.cap)}</span>
            <div class="cs-title"><h3 class="t-display-xs">Smart Assistant</h3><span class="badge badge-info">COMING SOON</span></div></div>
          <p class="t-sm">${esc(D.ASSISTANT.blurb)}</p>
          ${reqList(D.ASSISTANT.reqs)}
        </div>
        <div class="asst-input"><input class="input" placeholder="Hỏi Assistant…" disabled aria-label="Hỏi Assistant"><button class="btn btn-icon btn-primary" disabled aria-label="Gửi">${ic("send-up")}</button></div>
      </div>`;
    } else if (VIEWS[viewKey(S.active)]?.inspector) {
      body = VIEWS[viewKey(S.active)].inspector(S.active);
    } else if (S.active === "home") {
      body = `<section class="ins-sec"><span class="eyebrow">Workspace</span>
        <dl class="kv"><dt>Tên</dt><dd>${esc(S.workspace.name)}</dd><dt>Đường dẫn</dt><dd class="path">${esc(S.workspace.path)}</dd><dt>Mở lúc</dt><dd class="mono">${esc(S.workspace.lastOpened)}</dd></dl></section>`;
    } else {
      const it = ITEMS[S.active];
      body = `<section class="ins-sec"><span class="eyebrow">${esc(it.title)}</span>
        <dl class="kv"><dt>Nhóm</dt><dd>${esc(it.section)}</dd><dt>Capability</dt><dd>${esc(it.cap)}</dd><dt>Trạng thái</dt><dd><span class="badge badge-info">COMING SOON</span></dd><dt>Yêu cầu</dt><dd>${it.reqs.length}</dd></dl></section>
        <div class="ins-empty"><p>Thuộc tính của mục đang chọn sẽ hiển thị ở đây.</p></div>`;
    }
    $("#inspector").innerHTML = `${head}<div class="pane-body">${body}</div>`;
  }

  function renderBottom() {
    const el = $("#bottom");
    el.hidden = !S.bottomOpen;
    if (!S.bottomOpen) return;
    const tab = (id, label) => `<button class="ins-tab ${S.bottomTab === id ? "is-active" : ""}" data-act="bottom-tab" data-v="${id}">${label}</button>`;
    const nRun = PL.list.filter((p) => p.status === "running").length;
    const body = S.bottomTab === "pipelines" && PL.list.length
      ? `<div class="pl-list">${PL.list.map(plRow).join("")}</div>`
      : S.bottomTab === "pipelines"
      ? `<div class="empty"><div class="empty-inner"><h3 class="t-display-xs">Chưa có pipeline nào chạy</h3>
          <p class="t-sm t-mute">Các tác vụ dài như dịch, phân tích, tạo audio hay render sẽ hiển thị tiến độ tại đây. Số pipeline và task chạy song song được cấu hình trong Settings.</p>
          <button class="btn btn-sm" data-act="settings" data-v="pipeline">${ic("settings")}Pipeline executor</button></div></div>`
      : `<div class="log">${S.log.map(([t, lv, src, msg]) => `<div class="log-row log-${lv}"><span class="t-mute">${t}</span><span class="log-lv">${lv}</span><span class="t-mute">${esc(src)}</span><span>${esc(msg)}</span></div>`).join("")}</div>`;
    el.innerHTML = `<div class="resizer-h" data-resize="bottom" aria-hidden="true"></div>
      <header class="bottom-head">${tab("pipelines", `Pipelines${PL.list.length ? ` <span class="count">${nRun ? nRun + " chạy / " : ""}${PL.list.length}</span>` : ""}`)}${tab("output", "Output")}<span class="spacer"></span>
        <button class="btn btn-icon btn-sm" data-act="toggle-bottom" data-tip="Đóng panel" aria-label="Đóng panel">${ic("x")}</button></header>
      <div class="bottom-body">${body}</div>`;
  }

  function pipelineStatus() {
    const run = PL.list.filter((p) => p.status === "running");
    if (!run.length) return `<button class="sb-item" data-act="toggle-bottom" data-tip-t="Pipelines (Ctrl J)" aria-label="Pipelines">${ic("activity")}<span class="mono">PIPELINES · IDLE</span></button>`;
    return `<button class="sb-item sb-running" data-act="toggle-bottom" data-tip-t="Pipelines (Ctrl J)" aria-label="Pipelines"><span class="dot dot-running"></span><span class="mono">${run.length} RUNNING · <span data-sb-avg>${avgProgress(run)}%</span></span></button>`;
  }
  function renderStatus() {
    const theme = document.documentElement.getAttribute("data-theme");
    const tts = D.STARTUP_STEPS.find((s) => s.id === "tts");
    $("#statusbar").innerHTML = `
      <button class="sb-item" data-act="switch-workspace" data-tip-t="Đổi workspace">${ic("hdd")}<span class="path">${esc(S.workspace.path)}</span></button>
      <span class="spacer"></span>
      ${pipelineStatus()}
      ${tts.result === "warn" ? `<button class="sb-item sb-warn" data-act="settings" data-v="tts" data-tip-t="Local TTS chưa sẵn sàng"><span class="dot dot-warning"></span><span class="mono">LOCAL TTS · ${window.LB?.tts && !window.LB.tts.backendOk() ? "BACKEND STOPPED" : "NOT INSTALLED"}</span></button>` : ""}
      <button class="sb-item" data-act="theme" data-tip-t="Đổi theme" aria-label="Đổi theme">${ic(theme === "light" ? "moon" : "sun")}</button>
      <span class="sb-item mono">V${esc(D.version)}</span>`;
  }

  /* ---------------- dialogs ---------------- */
  function modal({ title, eyebrow = "", body, foot = "", cls = "", testid = "" }) {
    $("#layer").innerHTML = `<div class="scrim" data-act="scrim"><div class="modal ${cls}" ${testid ? `data-testid="${testid}"` : ""} role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="modal-head">${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ""}<h2 class="t-display-xs">${esc(title)}</h2><span class="spacer"></span>
        <button class="btn btn-icon btn-sm" data-act="close-modal" aria-label="Đóng (Esc)" data-tip="Đóng (Esc)">${ic("x")}</button></header>
      <div class="modal-body">${body}</div>${foot ? `<footer class="modal-foot">${foot}</footer>` : ""}</div></div>`;
    ($("#layer .modal-body input") || $("#layer .modal-foot .btn-primary") || $("#layer .modal"))?.focus?.();
  }
  const closeModal = () => { $("#layer").innerHTML = ""; };

  /** Switch workspace dialog (REQ-01-002). */
  function openSwitchDialog() {
    const rows = S.recent.map((w, i) => {
      const cur = S.workspace && w.path === S.workspace.path;
      if (w.missing) {
        return `<div class="ws-row is-error">${ic("alert")}<div class="ws-main"><div class="ws-name"><span class="path">${esc(w.path)}</span><span class="badge badge-danger">NOT FOUND</span></div><div class="t-sm ws-err">${esc(w.error)}</div></div></div>`;
      }
      return `<div class="ws-row ${cur ? "is-current" : ""}" ${cur ? "" : `tabindex="0" data-act="open-recent" data-i="${i}"`}>
        ${ic("hdd")}<div class="ws-main"><div class="ws-name">${esc(w.name)}${cur ? `<span class="badge badge-primary">ĐANG MỞ</span>` : ""}</div><div class="path t-mute">${esc(w.path)}</div></div>
        ${cur ? "" : `<button class="btn btn-sm" tabindex="-1">Mở</button>`}</div>`;
    }).join("");
    modal({
      title: "Đổi workspace", eyebrow: "Workspace", cls: "modal-lg",
      body: `<p class="t-sm t-mute">Các tab đang mở sẽ được đóng và ứng dụng khởi động lại với workspace mới. Nội dung của workspace hiện tại vẫn được giữ nguyên trong thư mục của nó.</p>
        <div class="ws-list">${rows}</div>`,
      foot: `<button class="btn" data-act="pick-folder">${ic("folder-open")}Mở thư mục khác…</button><span class="spacer"></span><button class="btn btn-ghost" data-act="close-modal">Đóng</button>`,
    });
  }

  const ABS_PATH = /^[A-Za-z]:\\/;
  const baseName = (p) => p.replace(/\\+$/, "").split("\\").pop() || p;

  /** Mock of the operating system's "select folder" dialog (REQ-01-001). Picking a folder starts loading at once. */
  function openFolderPicker() {
    const rows = D.DISK_FOLDERS.map((f) => `<div class="ws-row" tabindex="0" data-act="pick-row" data-path="${esc(f.path)}">
        ${ic("folder-open")}<div class="ws-main"><div class="path">${esc(f.path)}</div><div class="t-sm t-mute">${esc(f.note)}</div></div></div>`).join("");
    modal({
      title: "Chọn thư mục", eyebrow: "Hệ điều hành", cls: "modal-lg", testid: "folder-picker",
      body: `<p class="t-sm t-mute">Hộp thoại chọn thư mục của hệ điều hành (mô phỏng). Chọn một thư mục làm workspace.</p>
        <div class="ws-list">${rows}</div>
        <div class="field"><label for="p-path">Thư mục</label><input id="p-path" class="input" placeholder="D:\\DreamyWorkspace" autocomplete="off"></div>
        <p class="field-err" id="p-err" hidden></p>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-act="pick-submit">Chọn thư mục</button>`,
    });
  }

  const showErr = (id, input, msg) => {
    const e = $(id);
    e.textContent = msg;
    e.hidden = !msg;
    $(input)?.classList.toggle("is-invalid", !!msg);
  };

  const SETTINGS_VIEWS = {};
  function openSettings(tab) {
    if (tab && D.SETTINGS.some((s) => s.id === tab)) S.settingsTab = tab;
    const cur = D.SETTINGS.find((s) => s.id === S.settingsTab);
    const view = SETTINGS_VIEWS[cur.id];
    modal({
      title: "Settings", eyebrow: D.CAP["12"], cls: view?.cls || "modal-lg",
      body: `<div class="settings ${view ? "has-view" : ""}">
        <nav class="settings-nav" aria-label="Settings sections">${D.SETTINGS.map((s) =>
          `<div class="tree-row ${s.id === cur.id ? "is-selected" : ""}" tabindex="0" data-act="settings-tab" data-v="${s.id}">${ic(s.icon)}<span class="tree-label">${esc(s.title)}</span></div>`).join("")}</nav>
        ${view ? `<div class="settings-pane">${view.render()}</div>` : `<div style="display:grid;gap:12px;align-content:start">
          <div class="cs-title"><h3 class="t-display-xs">${esc(cur.title)}</h3><span class="badge badge-info">COMING SOON</span></div>
          ${reqList(cur.reqs)}
        </div>`}</div>`,
      foot: `<button class="btn btn-primary" data-act="close-modal">Đóng</button>`,
    });
    view?.mount?.();
  }
  function refreshSettings(tab) {
    if (!$("#layer .settings") || S.settingsTab !== tab) return;
    const y = $("#layer .modal-body")?.scrollTop || 0;
    openSettings(tab);
    const b = $("#layer .modal-body");
    if (b) b.scrollTop = y;
  }

  function openAbout() {
    modal({
      title: "Dreamy Studio", eyebrow: "Giới thiệu", cls: "",
      body: `<div style="display:flex;gap:16px;align-items:center"><img src="assets/dreamy-studio-mark.svg" width="56" height="56" alt="">
          <div><div class="t-ink">Phiên bản <span class="mono">${esc(D.version)}</span></div><div class="t-sm t-mute">Prototype giao diện — chưa có backend.</div></div></div>
        <p class="t-sm t-mute">Dreamy Studio cung cấp công cụ để người dùng tạo và phân phối nội dung từ tài nguyên do họ tự chọn. Người dùng chịu trách nhiệm bảo đảm mình có quyền sử dụng tài nguyên cho mục đích dự kiến và quyết định nội dung được gửi đến dịch vụ bên ngoài hoặc đăng lên tài khoản của mình.</p>`,
      foot: `<button class="btn btn-primary" data-act="close-modal">Đóng</button>`,
    });
  }

  /* ---------------- menus ---------------- */
  const closeMenu = () => $$("body > .menu").forEach((m) => m.remove());
  function openMenu(anchor, items) {
    closeMenu();
    const r = anchor.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "menu";
    el.setAttribute("role", "menu");
    el.innerHTML = items.map((it) => it === "-" ? `<hr class="divider">`
      : `<div class="menu-row ${it.disabled ? "is-disabled" : ""}" role="menuitem" ${it.disabled ? "" : `data-act="${it.act}" ${it.v ? `data-v="${it.v}"` : ""}`}>${it.icon ? ic(it.icon) : `<span class="ic"></span>`}<span>${esc(it.label)}</span><span class="spacer"></span>${it.kbd ? `<span class="kbd">${it.kbd}</span>` : ""}</div>`).join("");
    document.body.appendChild(el);
    el.style.left = `${Math.min(r.left, innerWidth - el.offsetWidth - 8)}px`;
    el.style.top = `${r.bottom + 2}px`;
  }
  const MENUS = {
    file: () => [
      { label: "Mở workspace…", icon: "folder-open", act: "pick-folder" },
      { label: "Đổi workspace…", icon: "swap", act: "switch-workspace" },
      "-",
      { label: "Settings", icon: "settings", act: "settings", kbd: "Ctrl ," },
      { label: "Đóng tab", icon: "x", act: "close-tab", v: S.active, kbd: "Ctrl W" },
    ],
    view: () => [
      { label: "Explorer", icon: "panel-left", act: "toggle-explorer", kbd: "Ctrl B" },
      { label: "Inspector", icon: "panel-right", act: "toggle-inspector", kbd: "Ctrl Alt B" },
      { label: "Pipelines", icon: "panel-bottom", act: "toggle-bottom", kbd: "Ctrl J" },
      "-",
      { label: "Đổi theme sáng / tối", icon: "sun", act: "theme" },
    ],
    help: () => [{ label: "Giới thiệu Dreamy Studio", icon: "info", act: "about" }],
  };

  /* ---------------- actions ---------------- */
  function openTab(id, info) {
    if (info) ITEMS[id] = { id, ...info };
    if (!S.tabs.includes(id)) S.tabs.push(id);
    S.active = id;
    if (ITEMS[id]) S.rail = ITEMS[id].rail;
    renderShell();
  }
  function closeTab(id) {
    const i = S.tabs.indexOf(id);
    if (i < 0) return;
    S.tabs.splice(i, 1);
    if (!S.tabs.length) S.tabs.push("home");
    if (S.active === id) S.active = S.tabs[Math.min(i, S.tabs.length - 1)];
    renderShell();
  }
  function applyTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    store.set("theme", next);
    if (S.screen === "app") renderStatus();
  }

  const ACT = {
    scrim: (el, e) => { if (e.target === el) closeModal(); },
    "close-modal": closeModal,
    "pick-folder": (el) => {
      S.relocate = el?.dataset?.i === undefined ? null : +el.dataset.i;
      openFolderPicker();
    },
    "pick-row": (el) => {
      const input = $("#p-path");
      input.value = el.dataset.path;
      showErr("#p-err", "#p-path", "");
      input.focus();
    },
    "switch-workspace": openSwitchDialog,
    "open-recent": (el) => {
      const w = S.recent[+el.dataset.i];
      if (w && !w.missing) startWorkspace(w);
    },
    "remove-recent": (el) => {
      S.recent.splice(+el.dataset.i, 1);
      saveRecent();
      renderWelcome();
    },
    "pick-submit": () => {
      const path = $("#p-path").value.trim().replace(/\\+$/, "");
      let err = "";
      if (!path) err = "Chọn một thư mục.";
      else if (!ABS_PATH.test(path)) err = "Đường dẫn phải là đường dẫn đầy đủ, ví dụ D:\\DreamyWorkspace.";
      showErr("#p-err", "#p-path", err);
      if (err) return;
      const idx = S.recent.findIndex((w) => w.path.toLowerCase() === path.toLowerCase());
      if (idx >= 0) {
        const known = S.recent[idx];
        known.missing = false; // a re-selected folder counts as found
        delete known.error;
        return startWorkspace(known, { relocate: S.relocate === idx ? null : S.relocate });
      }
      startWorkspace({ path, name: baseName(path), projects: 0, size: "—" }, { relocate: S.relocate });
    },
    "cancel-loading": () => { S.token++; renderWelcome(); },

    rail: (el) => {
      const v = el.dataset.v;
      if (S.rail === v && S.explorerOpen) S.explorerOpen = false;
      else { S.rail = v; S.explorerOpen = true; }
      renderShell();
    },
    "rail-open": (el) => { S.rail = el.dataset.v; S.explorerOpen = true; openTab(el.dataset.id); },
    open: (el) => openTab(el.dataset.id),
    "pl-cancel": (el) => cancelPipeline(el.dataset.id),
    "pl-clear": () => { PL.list = PL.list.filter((p) => p.status === "running"); renderBottom(); renderStatus(); },
    "close-tab": (el, e) => { e?.stopPropagation(); closeTab(el.dataset.id || el.dataset.v); },
    "sec-toggle": (el) => {
      const k = el.dataset.k;
      S.collapsed.has(k) ? S.collapsed.delete(k) : S.collapsed.add(k);
      renderExplorer();
    },
    "toggle-explorer": () => { S.explorerOpen = !S.explorerOpen; renderShell(); },
    "toggle-inspector": () => { S.inspectorOpen = !S.inspectorOpen; renderShell(); },
    "toggle-bottom": () => { S.bottomOpen = !S.bottomOpen; renderBottom(); syncToggles(); },
    "bottom-tab": (el) => { S.bottomTab = el.dataset.v; renderBottom(); },
    "right-tab": (el) => { S.rightTab = el.dataset.v; renderRail(); renderInspector(); },
    assistant: () => {
      if (S.rightTab === "assistant" && S.inspectorOpen) S.inspectorOpen = false;
      else { S.rightTab = "assistant"; S.inspectorOpen = true; }
      renderShell();
    },
    settings: (el) => openSettings(el?.dataset?.v),
    "settings-tab": (el) => openSettings(el.dataset.v),
    about: openAbout,
    theme: () => applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"),
    "app-menu": (el) => openMenu(el, MENUS[el.dataset.v]()),
  };

  const ON = {};

  /* ---------------- events ---------------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (!a?.dataset.act.endsWith("menu") || !e.target.closest("body > .menu")) closeMenu();
    if (a && ACT[a.dataset.act]) {
      // không chặn radio / checkbox (trong dialog hoặc ô chọn của danh sách), nếu không trình duyệt hoàn lại trạng thái checked sau khi handler chạy
      if (a.dataset.act !== "scrim" && !e.target.matches?.('input[type="checkbox"], input[type="radio"]')) e.preventDefault();
      ACT[a.dataset.act](a, e);
    }
  });
  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-on]");
    if (el && ON[el.dataset.on]) ON[el.dataset.on](el, e);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (el && ON[el.dataset.change]) ON[el.dataset.change](el, e);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("body > .menu")) return closeMenu();
      if ($("#layer").innerHTML) return closeModal();
      return;
    }
    if (e.key === "Enter") {
      if (e.target.dataset?.enter && ACT[e.target.dataset.enter]) { ACT[e.target.dataset.enter](e.target, e); return; }
      if ($("#layer .modal") && e.target.matches("#layer input")) {
        $("#layer .modal-foot .btn-primary")?.click();
        return;
      }
      if (e.target.matches("[data-act][tabindex]")) { e.target.click(); return; }
    }
    if (!e.ctrlKey || S.screen !== "app") return;
    const k = e.key.toLowerCase();
    if (k === "b" && e.altKey) { e.preventDefault(); ACT["toggle-inspector"](); }
    else if (k === "b") { e.preventDefault(); ACT["toggle-explorer"](); }
    else if (k === "j") { e.preventDefault(); ACT["toggle-bottom"](); }
    else if (k === ",") { e.preventDefault(); openSettings(); }
    else if (k === "w") { e.preventDefault(); closeTab(S.active); }
  });

  /* panel resizers */
  document.addEventListener("pointerdown", (e) => {
    const r = e.target.closest("[data-resize]");
    if (!r) return;
    const which = r.dataset.resize;
    const shell = $("#shell");
    const startX = e.clientX, startY = e.clientY;
    const start = which === "explorer" ? $("#explorer").offsetWidth : which === "inspector" ? $("#inspector").offsetWidth : $("#bottom").offsetHeight;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const move = (ev) => {
      if (which === "explorer") shell.style.setProperty("--ex-w", `${clamp(start + ev.clientX - startX, 200, 420)}px`);
      if (which === "inspector") shell.style.setProperty("--in-w", `${clamp(start - (ev.clientX - startX), 240, 480)}px`);
      if (which === "bottom") $("#edcol").style.setProperty("--bt-h", `${clamp(start - (ev.clientY - startY), 120, 520)}px`);
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); document.body.classList.remove("is-resizing"); };
    document.body.classList.add("is-resizing");
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  });

  function toast(msg, kind = "success") {
    let box = $("#toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.className = "toast-stack"; document.body.appendChild(box); }
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML = `<span class="dot dot-${kind}"></span><span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  const PL = { list: [], seq: 1, concurrency: 2, timer: null };
  const avgProgress = (ps) => Math.round(ps.reduce((a, p) => a + p.progress, 0) / (ps.length || 1));
  const taskDone = (p) => p.tasks.filter((t) => t.status === "done").length;

  function plRow(p) {
    const badge = { running: `<span class="badge badge-running">RUNNING</span>`, done: `<span class="badge badge-success">DONE</span>`, cancelled: `<span class="badge">CANCELLED</span>` }[p.status];
    return `<div class="pl-row">
      <div class="pl-main"><div class="t-ink">${esc(p.label)}</div><div class="t-sm t-mute">${esc(p.detail)} · <span class="mono">${p.id}</span> · ${taskDone(p)}/${p.tasks.length} task</div></div>
      <div class="pl-prog"><div class="progress" data-prog="${p.id}"><i style="width:${p.progress}%"></i></div><span class="mono" data-prog-text="${p.id}">${p.progress}%</span></div>
      ${badge}
      ${p.status === "running" ? `<button class="btn btn-sm" data-act="pl-cancel" data-id="${p.id}">Hủy</button>` : ""}
    </div>`;
  }

  function startPipeline({ kind, label, detail = "", tasks, onTask, onDone, onCancel }) {
    const p = {
      id: `PL-${String(PL.seq++).padStart(3, "0")}`, kind, label, detail, status: "running", progress: 0, started: stamp(), onTask, onDone, onCancel,
      tasks: tasks.map((t) => ({ ...t, status: "queued", progress: 0 })),
    };
    PL.list.unshift(p);
    log("info", p.id, `${label} · ${p.tasks.length} task`);
    if (!PL.timer) PL.timer = setInterval(plTick, 450);
    renderStatus();
    renderBottom();
    toast(`Đã bắt đầu: ${label}`, "running");
    return p;
  }
  function cancelPipeline(id) {
    const p = PL.list.find((x) => x.id === id);
    if (!p || p.status !== "running") return;
    p.status = "cancelled";
    p.tasks.forEach((t) => { if (t.status !== "done") t.status = "cancelled"; });
    log("warn", p.id, "Cancelled");
    p.onCancel?.(p);
    toast(`Đã hủy: ${p.label}`, "warning");
    plAfterChange();
  }
  function plAfterChange() {
    renderStatus();
    renderBottom();
    softRerender();
    if (!PL.list.some((p) => p.status === "running")) { clearInterval(PL.timer); PL.timer = null; }
  }
  function plTick() {
    let changed = false;
    PL.list.filter((p) => p.status === "running").forEach((p) => {
      const running = p.tasks.filter((t) => t.status === "running");
      for (const t of p.tasks) {
        if (running.length >= PL.concurrency) break;
        if (t.status === "queued") { t.status = "running"; running.push(t); changed = true; }
      }
      running.forEach((t) => {
        t.progress = Math.min(100, t.progress + 9 + Math.random() * 14);
        if (t.progress >= 100) { t.status = "done"; changed = true; p.onTask?.(t, p); }
      });
      p.progress = Math.round(p.tasks.reduce((a, t) => a + t.progress, 0) / p.tasks.length);
      if (p.tasks.every((t) => t.status === "done")) {
        p.status = "done";
        p.progress = 100;
        changed = true;
        log("ok", p.id, `${p.label} · done`);
        p.onDone?.(p);
        toast(`Hoàn tất: ${p.label}`, "success");
      }
    });
    updateBars();
    if (changed) plAfterChange();
  }
  function updateBars() {
    const value = (ref) => {
      const [pid, key] = ref.split("|");
      const p = PL.list.find((x) => x.id === pid);
      return key ? Math.round(p?.tasks.find((t) => t.key === key)?.progress ?? 0) : p?.progress ?? 0;
    };
    $$("[data-prog]").forEach((el) => {
      const bar = el.querySelector("i");
      if (bar) bar.style.width = `${value(el.dataset.prog)}%`;
    });
    $$("[data-prog-text]").forEach((el) => { el.textContent = `${value(el.dataset.progText)}%`; });
    const sb = $("[data-sb-avg]");
    if (sb) sb.textContent = `${avgProgress(PL.list.filter((p) => p.status === "running"))}%`;
  }

  window.DSApp = {
    S, ITEMS, VIEWS, ACT, ON, EXPLORER_EXTRA, EXPLORER_HEAD, PL, SETTINGS_VIEWS, openSettings, refreshSettings,
    $, $$, esc, ic, stamp, store, modal, closeModal, openMenu, toast, openTab, closeTab, rerender, renderInspector, renderExplorer, renderStatus, log, startPipeline, cancelPipeline,
  };

  renderWelcome();
})();
