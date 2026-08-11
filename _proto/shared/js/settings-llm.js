(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const PROVIDERS = [
    { id: "claude", command: "claude", name: "Claude Code CLI", version: "2.1.4", caps: ["DỊCH", "TRI THỨC", "ASSISTANT"] },
    { id: "antigravity", command: "agy", name: "Antigravity CLI", version: "1.0.3", caps: ["DỊCH", "TRI THỨC", "ASSISTANT"] },
    { id: "codex", command: "codex", name: "Codex CLI", version: "0.87.0", caps: ["TRI THỨC", "ASSISTANT"] },
  ];
  PROVIDERS.forEach((p) => { p.kind = "cli"; });
  const cloudCaps = ["DỊCH", "TRI THỨC", "ASSISTANT"];
  const cloudProviders = [
    { id: "anthropic", name: "Anthropic API", site: "console.anthropic.com", note: "Gọi Claude qua Anthropic API bằng API key tạo trong Console." },
    { id: "openai", name: "OpenAI", site: "platform.openai.com", note: "Dùng Chat/Responses API. Có thể đổi Base URL nếu bạn dùng cổng tương thích OpenAI.", baseUrl: "https://api.openai.com/v1", baseUrlEditable: true },
    { id: "google", name: "Google AI Studio (Gemini)", site: "aistudio.google.com", note: "Dùng API key tạo trong Google AI Studio để gọi Gemini API." },
    { id: "openrouter", name: "OpenRouter", site: "openrouter.ai", note: "Một API key để dùng nhiều mô hình của nhiều nhà cung cấp.", baseUrl: "https://openrouter.ai/api/v1" },
    { id: "custom", name: "Tùy chỉnh (OpenAI-compatible)", site: "máy chủ của bạn", note: "Dùng máy chủ tương thích OpenAI, ví dụ Ollama hoặc LM Studio chạy trên máy này hoặc trong mạng của bạn.", baseUrl: "", baseUrlEditable: true }
  ];
  cloudProviders.forEach((p) => Object.assign(p, { kind: "cloud", caps: cloudCaps, keyRequired: p.id !== "custom", baseUrlEditable: !!p.baseUrlEditable }));
  const cliProviders = [...PROVIDERS];
  PROVIDERS.push(...cloudProviders);
  const provider = (id) => PROVIDERS.find((p) => p.id === id);
  const listeners = [];
  const tests = new Map();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const seed = () => ({ checked: false, default: "claude", providers: Object.fromEntries(PROVIDERS.map((p) => [p.id, p.kind === "cloud" ? { enabled: true, saved: false, key: "", draft: "", baseUrl: p.baseUrl ?? "", status: "none", error: "", at: "", latency: 0 } : {
    enabled: p.id !== "codex", found: p.id !== "codex", path: p.id === "codex" ? "" : `C:\\Users\\user\\AppData\\Roaming\\npm\\${p.command}.cmd`,
    version: p.id === "codex" ? "" : p.version, args: "", status: p.id === "claude" ? "ok" : p.id === "codex" ? "missing" : "none", error: "", at: p.id === "claude" ? A.stamp() : "", latency: 120 + LB.hash(p.id) % 280,
  }])) });
  const S = () => (LB.state.llm ||= seed());
  const P = (id) => S().providers[id];
  const ready = (id) => !!P(id) && (provider(id)?.kind === "cloud" || P(id).found) && P(id).enabled && P(id).status === "ok";
  const available = () => PROVIDERS.filter((p) => ready(p.id));
  const refresh = () => A.refreshSettings("llm");
  const emit = () => listeners.forEach((fn) => fn());
  const changed = () => { refresh(); emit(); };
  const reconcile = () => { if (S().default && !ready(S().default)) S().default = available()[0]?.id || null; };
  const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;
  let checks = null;
  let running = false;
  let generation = 0;
  const reseed = LB.reseed;
  LB.reseed = function () { reseed.call(this); generation++; checks = null; running = false; LB.state.llm = seed(); emit(); };
  delete LB.cli;
  LB.llm = {
    PROVIDERS,
    list: () => PROVIDERS.map((p) => ({ ...p, ...P(p.id) })),
    ready,
    isDefault: (id) => !!id && S().default === id,
    default: () => S().default,
    on: (fn) => listeners.push(fn),
    open: () => A.openSettings("llm"),
  };

  const detection = () => cliProviders.map((p) => ({ id: p.id, name: p.name, status: !P(p.id).found ? "missing" : P(p.id).status === "ok" ? "ok" : "none", detail: P(p.id).found ? `${P(p.id).version} · ${P(p.id).path}` : "Không tìm thấy trong PATH" }));
  const checkRows = () => (checks || detection()).map((p) => `<div class="ld-step is-${p.status === "ok" ? "done" : p.status === "missing" ? "warn" : p.status}">${p.status === "ok" ? ic("check") : p.status === "missing" ? ic("alert") : `<span class="dot ${p.status === "running" ? "dot-running" : ""}"></span>`}<span>${esc(p.name)}</span><span class="ld-detail">${esc(p.detail)}</span></div>`).join("");
  const paintChecks = () => { const el = A.$("#cl-checks"); if (el) el.innerHTML = checkRows(); };
  async function scan() {
    if (running) return;
    const epoch = generation;
    running = true;
    checks = detection().map((p) => ({ ...p, status: "pending", detail: "" }));
    refresh();
    for (let i = 0; i < cliProviders.length; i++) {
      checks[i].status = "running";
      paintChecks();
      await sleep(240);
      if (epoch !== generation) return;
      checks[i] = detection()[i];
      paintChecks();
    }
    running = false;
    checks = null;
    S().checked = true;
    refresh();
  }
  const statusBadge = (s) => {
    if (!s.found) return badge("badge-warning", "CHƯA CÀI");
    if (!s.enabled) return badge("", "ĐÃ TẮT");
    const styles = { none: ["", "CHƯA KIỂM TRA"], checking: ["badge-running", "ĐANG KIỂM TRA"], ok: ["badge-success", "ĐÃ KẾT NỐI"], error: ["badge-danger", "LỖI"] };
    return badge(...styles[s.status]);
  };
  const message = (p, s) => {
    if (!s.found) return "Chưa cài trên máy này.";
    if (s.status === "ok") return `${ic("check")}<span>Kiểm tra thành công · ${s.latency} ms · ${esc(s.at)}</span>`;
    if (s.status === "error") return `${ic("alert")}<span>${esc(s.error)}</span>`;
    if (s.status === "checking") return `<span class="dot dot-running"></span><span>Đang chạy <span class="path">${p.command} --version</span>…</span>`;
    return "Chưa kiểm tra. Bấm Kiểm tra để chạy thử lệnh.";
  };
  const fields = (p, s) => `<div class="spc-fields">
    <div class="field cl-wide"><label for="cl-${p.id}-path">Đường dẫn executable</label><div class="cl-pathrow"><input id="cl-${p.id}-path" class="input mono-in" value="${esc(s.path)}" data-change="cl-field" data-p="${p.id}" data-f="path" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-sm btn-icon" data-act="cl-copy" data-p="${p.id}" aria-label="Sao chép đường dẫn">${ic("copy")}</button></div></div>
    <div class="field cl-wide"><label for="cl-${p.id}-args">Tham số bổ sung</label><input id="cl-${p.id}-args" class="input mono-in" value="${esc(s.args)}" placeholder="ví dụ: --max-turns 5" data-change="cl-field" data-p="${p.id}" data-f="args" autocomplete="off" spellcheck="false"><span class="field-hint">Thêm vào mỗi lần chạy lệnh. Không nhập khóa bí mật vào đây.</span></div></div>`;
  const missing = (p) => `<div class="tts-pending">${ic("alert")}<div class="tts-pending-b"><b>Không tìm thấy <span class="path">${p.command}</span> trong PATH</b><p class="t-sm">Cài CLI rồi bấm Quét lại, hoặc nhập đường dẫn executable thủ công.</p><div class="field"><label class="sr-only" for="cl-${p.id}-manual">Đường dẫn executable</label><div class="cl-pathrow"><input id="cl-${p.id}-manual" class="input mono-in" placeholder="C:\\...\\${p.command}.cmd" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-sm" data-act="cl-use-path" data-p="${p.id}">Dùng đường dẫn này</button></div></div></div></div>`;
  const card = (p) => {
    const s = P(p.id);
    return `<article class="cl-card ${s.enabled ? "" : "is-off"} ${s.found ? "" : "is-missing"}" data-testid="cl-${p.id}">
      <header class="spc-h"><div class="spc-t"><span class="t-ink spc-name">${p.name}</span>${statusBadge(s)}${LB.llm.isDefault(p.id) ? badge("badge-primary", "MẶC ĐỊNH") : ""}</div><label class="check spc-on"><input type="checkbox" data-change="cl-enable" data-p="${p.id}" ${s.found && s.enabled ? "checked" : ""} ${s.found ? "" : "disabled"}><span>Bật</span></label></header>
      <div class="tts-m-meta"><span class="path t-mute">${p.command}</span>${s.found ? badge("cl-version", s.version) : ""}${p.caps.map((c) => badge("badge-primary", c)).join("")}</div>
      ${s.found ? fields(p, s) : missing(p)}
      <footer class="spc-foot"><div class="spc-msg t-sm ${s.status === "ok" ? "is-ok" : s.status === "error" ? "is-err" : "t-mute"}" role="status">${message(p, s)}</div>${s.found ? `<button type="button" class="btn btn-sm btn-primary" data-act="cl-test" data-p="${p.id}" ${!s.enabled || s.status === "checking" ? "disabled" : ""}>${ic("refresh")}Kiểm tra</button><button type="button" class="btn btn-sm" data-act="cl-default" data-p="${p.id}" ${!ready(p.id) || LB.llm.isDefault(p.id) ? "disabled" : ""}>Đặt mặc định</button>` : ""}</footer></article>`;
  };
  const cloudMessage = (p, s) => {
    if (s.status === "checking") return '<span class="dot dot-running"></span><span>Đang kiểm tra kết nối tới ' + esc(p.name) + '…</span>';
    if (s.status === "ok") return ic("check") + '<span>Kết nối thành công · ' + s.latency + ' ms · ' + esc(s.at) + '</span>';
    if (s.status === "error") return ic("alert") + '<span>' + esc(s.error) + '</span>';
    return s.saved ? "Đã lưu khóa, chưa kiểm tra." : "Nhập API key rồi bấm kiểm tra kết nối.";
  };
  const cloudField = (p, f, label, placeholder = "") => {
    const id = 'cl-' + p.id + '-' + f;
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" data-testid="' + id + '" class="input mono-in" value="' + esc(P(p.id)[f]) + '" placeholder="' + placeholder + '" ' + (f === "baseUrl" && !p.baseUrlEditable ? 'readonly' : '') + ' data-change="cl-field" data-p="' + p.id + '" data-f="' + f + '" autocomplete="off" spellcheck="false"></div>';
  };
  const cloudButton = (p, action, label, disabled, primary = false) => '<button type="button" class="btn btn-sm ' + (primary ? 'btn-primary' : '') + '" data-testid="cl-' + p.id + '-' + (action === 'cloud-test' ? 'test' : action) + '" data-act="cl-' + action + '" data-p="' + p.id + '" ' + (disabled ? 'disabled' : '') + '>' + (primary ? ic("refresh") : '') + label + '</button>';
  const cloudCard = (p) => {
    const s = P(p.id);
    const statuses = { none: ["", "CHƯA CẤU HÌNH"], checking: ["badge-running", "ĐANG KIỂM TRA"], ok: ["badge-success", "ĐÃ KẾT NỐI"], error: ["badge-danger", "LỖI KẾT NỐI"] };
    const id = 'cl-' + p.id;
    return '<article class="cl-card cl-cloud ' + (s.enabled ? '' : 'is-off') + '" data-testid="' + id + '"><header class="spc-h"><div class="spc-t"><span class="t-ink spc-name">' + esc(p.name) + '</span>' + (s.enabled ? badge(...statuses[s.status]) : badge('', 'ĐÃ TẮT')) + (LB.llm.isDefault(p.id) ? badge('badge-primary', 'MẶC ĐỊNH') : '') + '</div><label class="check spc-on"><input type="checkbox" data-testid="' + id + '-enable" data-change="cl-enable" data-p="' + p.id + '" ' + (s.enabled ? 'checked' : '') + '><span>Bật</span></label></header><div class="tts-m-meta"><span class="path t-mute">' + esc(p.site) + '</span>' + p.caps.map((c) => badge('badge-primary', c)).join('') + '</div><p class="t-sm t-mute">' + esc(p.note) + '</p><div class="spc-fields"><div class="field spc-key ' + (p.baseUrl === undefined ? 'is-solo' : '') + '"><label for="' + id + '-key">API key</label><div class="spc-keyrow"><input id="' + id + '-key" data-testid="' + id + '-key" class="input mono-in" type="password" value="' + esc(s.draft) + '" placeholder="' + (s.saved ? '•••••••••••• (đã lưu, nhập để thay)' : 'Dán API key') + '" data-on="cl-key" data-p="' + p.id + '" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-icon" data-testid="' + id + '-eye" data-act="cl-eye" data-p="' + p.id + '" aria-label="Hiện / ẩn khóa">' + ic('eye') + '</button></div></div>' + (p.baseUrl !== undefined ? cloudField(p, 'baseUrl', 'Base URL', p.id === 'custom' ? 'http://localhost:11434/v1' : '') : '') + '</div><footer class="spc-foot"><div class="spc-msg t-sm ' + (s.status === 'ok' ? 'is-ok' : s.status === 'error' ? 'is-err' : 't-mute') + '" data-testid="' + id + '-status" role="status">' + cloudMessage(p, s) + '</div>' + cloudButton(p, 'cloud-test', 'Lưu và kiểm tra', s.status === 'checking', true) + cloudButton(p, 'default', 'Đặt mặc định', !ready(p.id) || LB.llm.isDefault(p.id)) + cloudButton(p, 'clear', 'Xóa khóa', !s.saved) + '</footer></article>';
  };
  const defaultOptions = () => [["cli", "CLI trên máy"], ["cloud", "Dịch vụ cloud"]].map(([kind, label]) => '<optgroup label="' + label + '">' + available().filter((p) => p.kind === kind).map((p) => '<option value="' + p.id + '" ' + (LB.llm.isDefault(p.id) ? 'selected' : '') + '>' + p.name + '</option>').join('') + '</optgroup>').join('');
  const render = () => '<div class="tts cl-view" data-testid="cl-settings"><header class="tts-head"><div><h3 class="t-display-xs">LLM providers</h3></div></header><p class="t-sm t-mute">Kết nối các LLM dùng cho dịch, phân tích tri thức và Assistant: CLI đã cài trên máy này hoặc dịch vụ cloud qua API key.</p><div class="spc-note">' + ic('shield') + '<span>CLI chạy bằng tài khoản đăng nhập sẵn có của bạn. API key chỉ lưu trên máy này, không nằm trong workspace và không đi cùng project khi xuất. Nội dung cần xử lý được gửi tới dịch vụ của nhà cung cấp tương ứng; chi phí và giới hạn do tài khoản của bạn quyết định.</span></div><section class="tts-card"><header class="tts-card-h cl-detection-h"><span class="eyebrow">Mặc định</span>' + badge(available().length ? 'badge-success' : 'badge-warning', available().length ? available().length + ' / 8 SẴN SÀNG' : 'CHƯA CÓ LLM SẴN SÀNG') + '</header><div class="field"><label for="cl-default">LLM mặc định</label><span class="field-hint">Dùng khi một tác vụ không chọn provider riêng.</span><select id="cl-default" data-testid="cl-default" class="select" data-change="cl-default" ' + (available().length ? '' : 'disabled') + '>' + (available().length ? (S().default ? '' : '<option value="" selected>Chưa có LLM sẵn sàng</option>') + defaultOptions() : '<option value="">Chưa có LLM sẵn sàng</option>') + '</select></div></section><header class="cl-sec-h"><span class="eyebrow">CLI trên máy</span><button type="button" class="btn btn-sm" data-act="cl-scan" ' + (running ? 'disabled' : '') + '>' + ic('refresh') + 'Quét lại</button></header><section class="tts-card" aria-label="Phát hiện"><div class="ld-steps tts-checks" id="cl-checks" role="status" aria-live="polite">' + checkRows() + '</div></section><section class="tts-list">' + cliProviders.map(card).join('') + '</section><header class="cl-sec-h"><span class="eyebrow">Dịch vụ cloud</span></header><section class="tts-list">' + cloudProviders.map(cloudCard).join('') + '</section><p class="t-sm t-mute tts-foot">' + ic('info') + '<span>Prototype: quét CLI và kiểm tra kết nối là mô phỏng, không chạy lệnh hay gọi mạng thật. CLI có đường dẫn chứa “bad” hoặc tham số <span class="path">--fail</span>, và API key ngắn hơn 8 ký tự hoặc bắt đầu bằng “bad”, sẽ thất bại để bạn thấy trạng thái lỗi.</span></p></div>';
  async function testCloud(id) {
    const p = provider(id);
    const s = P(id);
    if (s.status === "checking") return;
    const key = (s.draft || s.key || "").trim();
    const missing = p.keyRequired && !key ? ["key", "API key"] : id === "custom" && !s.baseUrl ? ["baseUrl", "Base URL"] : null;
    if (missing) { A.toast('Nhập ' + missing[1] + ' của ' + p.name + '.', 'warning'); A.$('#cl-' + id + '-' + missing[0])?.focus(); return; }
    const epoch = generation;
    const ticket = {};
    tests.set(id, ticket);
    Object.assign(s, { key, draft: "", saved: true, status: "checking", error: "" });
    reconcile();
    changed();
    await sleep(900);
    if (epoch !== generation || tests.get(id) !== ticket || P(id) !== s || s.status !== "checking") return;
    const invalid = key && (key.length < 8 || /^bad/i.test(key));
    const refused = id === "custom" && /bad/i.test(s.baseUrl);
    s.status = invalid || refused ? "error" : "ok";
    s.error = refused ? "Không kết nối được tới máy chủ: connection refused." : invalid ? id === "google" ? "400 API_KEY_INVALID: khóa không hợp lệ hoặc đã bị thu hồi trong Google AI Studio." : "401 Unauthorized: API key không hợp lệ hoặc đã bị thu hồi." : "";
    if (s.status === "ok") { s.latency = 120 + LB.hash(id + key) % 280; s.at = A.stamp(); if (!S().default && s.enabled) S().default = id; }
    changed();
  }
  async function test(id) {
    if (!P(id)?.found || !P(id).enabled || P(id).status === "checking") return;
    const s = P(id);
    const epoch = generation;
    const ticket = {};
    tests.set(id, ticket);
    s.status = "checking";
    s.error = "";
    reconcile();
    changed();
    await sleep(900);
    if (epoch !== generation || tests.get(id) !== ticket || P(id) !== s || s.status !== "checking") return;
    if (/bad/i.test(s.path) || s.args.includes("--fail")) {
      s.status = "error";
      s.error = `Lệnh thoát với mã 1: chưa đăng nhập. Chạy \`${PROVIDERS.find((p) => p.id === id).command} login\` trong terminal rồi kiểm tra lại.`;
    } else {
      s.status = "ok";
      s.latency = 120 + LB.hash(id + s.path + s.args) % 280;
      s.at = A.stamp();
      if (!S().default && s.enabled) S().default = id;
    }
    changed();
  }
  const setDefault = (id) => { if (ready(id)) { S().default = id; changed(); } };
  const copyPath = async (id) => {
    try { await navigator.clipboard.writeText(P(id).path); }
    catch { A.$(`#cl-${id}-path`)?.select(); }
  };
  A.SETTINGS_VIEWS.llm = { cls: "modal-xl", render, mount() { if (!S().checked && !running) scan(); } };
  Object.assign(A.ACT, {
    "cl-scan": scan,
    "cl-cloud-test": (el) => testCloud(el.dataset.p),
    "cl-eye": (el) => { const input = A.$('#cl-' + el.dataset.p + '-key'); if (input) input.type = input.type === "password" ? "text" : "password"; },
    "cl-clear": (el) => { tests.delete(el.dataset.p); Object.assign(P(el.dataset.p), { key: "", draft: "", saved: false, status: "none", error: "" }); reconcile(); changed(); },
    "cl-test": (el) => test(el.dataset.p),
    "cl-default": (el) => setDefault(el.dataset.p),
    "cl-copy": (el) => copyPath(el.dataset.p),
    "cl-use-path": (el) => {
      const id = el.dataset.p;
      const path = A.$(`#cl-${id}-manual`)?.value.trim() || "";
      if (!/^[A-Za-z]:\\.+\.(exe|cmd|bat)$/i.test(path)) { A.toast("Nhập đường dẫn đầy đủ tới file .exe, .cmd hoặc .bat.", "warning"); return; }
      Object.assign(P(id), { found: true, enabled: true, path, version: PROVIDERS.find((p) => p.id === id).version, status: "none", error: "" });
      changed();
    },
  });
  Object.assign(A.ON, {
    "cl-key": (el) => {
      const s = P(el.dataset.p);
      s.draft = el.value;
      tests.delete(el.dataset.p);
      if (s.status !== "none") {
        s.status = "none";
        s.error = "";
        reconcile();
        changed();
        const input = A.$('#cl-' + el.dataset.p + '-key');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }
    },
    "cl-default": (el) => setDefault(el.value),
    "cl-field": (el) => {
      const s = P(el.dataset.p);
      const value = el.value.trim();
      if (s[el.dataset.f] === value) return;
      s[el.dataset.f] = value;
      tests.delete(el.dataset.p);
      s.status = "none";
      s.error = "";
      reconcile();
      changed();
    },
    "cl-enable": (el) => {
      const s = P(el.dataset.p);
      if (provider(el.dataset.p).kind === "cli" && !s.found) return;
      s.enabled = el.checked;
      reconcile();
      changed();
    },
  });
})();
