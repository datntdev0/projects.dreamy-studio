/*
 * Workspace management shared by the prototype entry pages (mock, no backend).
 *  - recent workspaces (localStorage) and the workspace currently open (sessionStorage)
 *  - recent list rows, loading card, failure messages
 *  - a simulated load run (application → backend → workspace) with cancel
 * The system folder dialog is not simulated: asking for it only shows a toast.
 */
window.WS = (function () {
  "use strict";

  const D = window.DS;
  const sharedRoot = document.body.dataset.sharedRoot || "shared";
  const SPLASH_PAGE = document.body.dataset.splashPage || "../0.splash/0.splash.html";
  const MAIN_PAGE = document.body.dataset.mainPage || "../1.library/1.library.html";
  const FIRST_RUN = /[?&]first-run\b/.test(location.search);
  const FAILURE_HOLD_MS = 1200;
  const RECENT_WORKSPACE_LIMIT = 5;
  const STEP_ORDER = ["application", "backend", "workspace"];
  const CODES_WITHOUT_DETAIL = ["folder_missing", "folder_not_directory", "db_newer_version"];

  const STEP_LABELS = {
    application: "Chuẩn bị ứng dụng: application.dreamydb và nhật ký",
    backend: "Khởi động backend cục bộ",
    workspace: "Chuẩn bị workspace: thư mục và workspace.dreamydb",
  };
  const STEP_NAMES = {
    application: "khởi động ứng dụng",
    backend: "backend cục bộ",
    workspace: "khởi động workspace",
  };
  const MODE_LABELS = {
    create: "Đang khởi tạo workspace",
    open: "Đang mở workspace",
    prepare: "Đang chuẩn bị workspace",
  };
  const CAUSES = {
    folder_missing: "thư mục workspace không tồn tại",
    folder_not_directory: "đường dẫn đã chọn không phải là thư mục",
    folder_not_readable: "không có quyền đọc thư mục workspace",
    folder_not_writable: "không có quyền ghi vào thư mục workspace",
    db_corrupt: "dữ liệu bị hỏng hoặc không phải tệp CSDL hợp lệ",
    db_newer_version: "dữ liệu do phiên bản phần mềm mới hơn tạo ra, không thể nâng cấp",
    db_migration_failed: "nâng cấp dữ liệu thất bại",
    db_io: "không đọc hoặc ghi được dữ liệu",
    logs_failed: "không chuẩn bị được nhật ký ứng dụng",
    backend_missing: "không tìm thấy chương trình backend cục bộ",
    backend_start_failed: "backend cục bộ không khởi động được hoặc đã dừng đột ngột",
    backend_timeout: "backend cục bộ không sẵn sàng kịp thời",
  };
  const REASONS = {
    missing: "Thư mục không còn tồn tại hoặc ổ đĩa chưa được gắn.",
    not_a_directory: "Đường dẫn này không còn là một thư mục.",
    no_access: "Không có quyền truy cập thư mục này.",
  };
  const PICK_FOLDER_NOTICE = "Hộp thoại chọn thư mục của hệ điều hành sẽ được hiển thị.";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const baseName = (p) => p.replace(/\\+$/, "").split("\\").pop() || p;
  const samePath = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  const keyed = (storage) => ({
    get(key, fallback) {
      try { const v = storage().getItem(`ds.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { storage().setItem(`ds.${key}`, JSON.stringify(value)); } catch { /* storage blocked */ }
    },
  });
  const local = keyed(() => localStorage);
  const session = keyed(() => sessionStorage);

  const normalize = (w) => ({ ...w, status: w.status || (w.missing ? "not_found" : "ok"), reason: w.reason || (w.missing ? "missing" : undefined) });
  let recent = FIRST_RUN ? [] : local.get("ws.recent", D.seedWorkspaces).map(normalize);
  const saveRecent = () => local.set("ws.recent", recent);

  const current = () => session.get("current", null);

  function list() {
    const cur = current();
    const rows = recent.map((w) => ({ ...w, isCurrent: !!cur && samePath(w.path, cur.path) }));
    if (cur && !rows.some((w) => w.isCurrent)) rows.unshift({ ...normalize(cur), status: "ok", isCurrent: true });
    return rows.slice(0, RECENT_WORKSPACE_LIMIT);
  }

  function deleteWorkspace(path) {
    recent = recent.filter((w) => !samePath(w.path, path));
    saveRecent();
  }

  function commit(entry) {
    const opened = { ...normalize(entry), lastOpened: stamp(), status: "ok", reason: undefined };
    delete opened.fail;
    recent = [opened, ...recent.filter((w) => !samePath(w.path, entry.path))];
    saveRecent();
    session.set("current", opened);
    return opened;
  }

  function requireCurrent() {
    const cur = current();
    if (!cur) location.replace(SPLASH_PAGE);
    return cur;
  }

  function errorText(error) {
    const showDetail = !!error.detail && !CODES_WITHOUT_DETAIL.includes(error.code);
    return `Bước ${STEP_NAMES[error.step]} lỗi: ${CAUSES[error.code]}${showDetail ? ` (${error.detail})` : ""}`;
  }

  function formatOpened(text) {
    const date = new Date(String(text).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return text;
    return new Intl.DateTimeFormat("vi", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function metaHtml(w) {
    return `<div class="t-sm t-mute" data-testid="recent-row-meta"><span data-testid="recent-row-projects">${w.projects ?? 0} project</span> · <span data-testid="recent-row-size" data-ws-size="${esc(w.path)}">…</span> · mở lần cuối <span class="mono" data-testid="recent-row-opened">${esc(formatOpened(w.lastOpened))}</span></div>`;
  }

  function rowHtml(w, lastUsedPath) {
    if (w.isCurrent) {
      return `<div class="ws-row is-current" data-testid="recent-row">${ic("hdd")}<div class="ws-main">
          <div class="ws-name" data-testid="recent-row-name">${esc(w.name)}<span class="badge badge-primary" data-testid="recent-current">ĐANG MỞ</span></div>
          <div class="path t-mute" data-testid="recent-row-path">${esc(w.path)}</div>${metaHtml(w)}</div></div>`;
    }
    if (w.status === "ok") {
      const last = lastUsedPath && samePath(w.path, lastUsedPath) ? `<span class="badge badge-primary" data-testid="recent-last-used">LAST USED</span>` : "";
      return `<div class="ws-row" role="button" tabindex="0" data-act="open-recent" data-path="${esc(w.path)}" data-testid="recent-row">${ic("hdd")}<div class="ws-main">
          <div class="ws-name" data-testid="recent-row-name">${esc(w.name)}${last}</div>
          <div class="path t-mute" data-testid="recent-row-path">${esc(w.path)}</div>${metaHtml(w)}</div>
          <button class="btn btn-sm" tabindex="-1" data-testid="recent-open">Mở</button>
          <button class="btn btn-sm btn-danger" data-act="workspace-delete" data-path="${esc(w.path)}" data-testid="recent-delete">Delete</button></div>`;
    }
    return `<div class="ws-row is-error" data-testid="recent-row">${ic("alert")}<div class="ws-main">
        <div class="ws-name"><span class="path" data-testid="recent-row-path">${esc(w.path)}</span><span class="badge badge-danger" data-testid="recent-not-found">NOT FOUND</span></div>
        <div class="t-sm ws-err" data-testid="recent-not-found-reason">${esc(REASONS[w.reason] || REASONS.missing)}</div></div>
        <button class="btn btn-sm" data-act="relocate-recent" data-path="${esc(w.path)}" data-testid="recent-relocate">Tìm lại…</button>
        <button class="btn btn-sm btn-danger" data-act="workspace-delete" data-path="${esc(w.path)}" data-testid="recent-delete">Delete</button></div>`;
  }

  function rowsHtml(rows, lastUsedPath = null) {
    return `<div class="ws-list" data-testid="recent-list">${rows.map((w) => rowHtml(w, lastUsedPath)).join("")}</div>`;
  }

  function lastUsedPath(rows) {
    return rows.find((w) => w.status === "ok" && !w.isCurrent)?.path ?? null;
  }

  async function hydrateSizes(root) {
    const sizes = new Map(list().map((w) => [w.path, w.size || "—"]));
    const cells = [...root.querySelectorAll("[data-ws-size]")];
    await Promise.all(cells.map(async (cell) => {
      await sleep(180 + Math.random() * 420);
      if (cell.isConnected) cell.textContent = sizes.get(cell.dataset.wsSize) || "—";
    }));
  }

  function stepIcon(state) {
    if (state === "done") return ic("check");
    if (state === "error") return ic("x");
    if (state === "running") return `<span class="dot dot-running" data-testid="loading-step-running"></span>`;
    return `<span class="dot" data-testid="loading-step-pending"></span>`;
  }

  function loadingHtml(L) {
    const steps = L.steps.map((s) => `<div class="ld-step ${s.state === "pending" ? "" : `is-${s.state}`}" data-state="${s.state}" data-testid="loading-step">${stepIcon(s.state)}<span data-testid="loading-step-label">${esc(STEP_LABELS[s.id])}</span></div>`).join("");
    return `<div class="ld" role="status" aria-live="polite" data-testid="loading-card">
        <img class="ld-logo" src="${sharedRoot}/assets/dreamy-studio-mark.svg" alt="" data-testid="loading-logo">
        <div data-testid="loading-header">
          <span class="eyebrow" data-testid="loading-mode">${MODE_LABELS[L.mode || "prepare"]}</span>
          <h2 class="t-display-xs" data-testid="loading-name">${esc(L.name)}</h2>
          <div class="path ld-path t-mute" data-testid="loading-path">${esc(L.path)}</div>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${L.pct}" data-testid="loading-progress"><i style="width:${L.pct}%"></i></div>
        <div class="mono t-mute" data-testid="loading-percent">${L.pct}%</div>
        <div class="ld-steps" data-testid="loading-steps">${steps}</div>
        ${L.failed ? `<div class="ld-warn is-error" role="alert" data-testid="loading-failed">${ic("alert")}<span>Không thể hoàn tất, đang quay lại màn hình chính.</span></div>` : ""}
        <button class="btn btn-ghost btn-sm" data-act="cancel-loading" data-testid="loading-cancel">Hủy</button>
      </div>`;
  }

  let token = 0;
  let active = null;

  async function start(entry, { mount, onReady, onFail, onCancel }) {
    const my = ++token;
    active = { mount, onCancel };
    const L = { mode: null, name: baseName(entry.path), path: entry.path, steps: STEP_ORDER.map((id) => ({ id, state: "pending" })), pct: 0, failed: false };
    const draw = () => { mount.innerHTML = loadingHtml(L); };
    const alive = () => my === token;
    draw();
    await sleep(350);
    if (!alive()) return;
    L.mode = "open";
    L.name = entry.name;
    draw();
    for (let i = 0; i < L.steps.length; i++) {
      const step = L.steps[i];
      step.state = "running";
      draw();
      await sleep(260 + Math.random() * 240);
      if (!alive()) return;
      if (entry.fail && entry.fail.step === step.id) {
        step.state = "error";
        L.failed = true;
        draw();
        await sleep(FAILURE_HOLD_MS);
        if (!alive()) return;
        active = null;
        onFail(errorText(entry.fail));
        return;
      }
      step.state = "done";
      L.pct = Math.floor(((i + 1) * 100) / L.steps.length);
      draw();
    }
    await sleep(400);
    if (!alive()) return;
    active = null;
    onReady(commit(entry));
  }

  function cancel() {
    token++;
    const run = active;
    active = null;
    run?.onCancel();
  }

  function toast(message, kind = "success", { sticky = false } = {}) {
    let box = document.getElementById("toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "toasts";
      box.className = "toast-stack";
      document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = `toast ${sticky ? "is-sticky" : ""}`;
    el.setAttribute("role", kind === "danger" ? "alert" : "status");
    el.innerHTML = `<span class="dot dot-${kind}"></span><span>${esc(message)}</span>${sticky ? `<button type="button" class="toast-x" aria-label="Đóng thông báo" data-testid="toast-dismiss">${ic("x")}</button>` : ""}`;
    box.appendChild(el);
    if (sticky) el.querySelector(".toast-x").addEventListener("click", () => el.remove());
    else setTimeout(() => el.remove(), 3800);
  }

  const pickFolder = () => toast(PICK_FOLDER_NOTICE, "info");

  return {
    SPLASH_PAGE, MAIN_PAGE, FIRST_RUN, esc, ic, stamp, local, current, list, deleteWorkspace, requireCurrent,
    rowsHtml, lastUsedPath, hydrateSizes, start, cancel, toast, pickFolder,
  };
})();
