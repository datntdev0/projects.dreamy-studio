(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const tasks = [
    { id: "translate", name: "Dịch", icon: "lang", blurb: "Dịch chương từ ngôn ngữ gốc, theo hướng dẫn dịch và từ điển của novel.", batch: 2 },
    { id: "analyze", name: "Phân tích tri thức", icon: "graph", blurb: "Trích xuất nhân vật, địa điểm, sự kiện và quan hệ theo ontology của novel.", batch: 4 },
  ];
  const listeners = [];
  const provider = (id) => LB.llm.PROVIDERS.find((p) => p.id === id);
  const stored = A.store.get("analysis", {});
  const normalize = (task) => {
    const value = stored?.[task.id];
    return {
      provider: value?.provider === "default" || provider(value?.provider) ? value.provider : "default",
      batch: Number.isInteger(value?.batch) && value.batch >= 1 && value.batch <= 10 ? value.batch : task.batch,
    };
  };
  const state = Object.fromEntries(tasks.map((task) => [task.id, normalize(task)]));
  const primary = (task) => state[task]?.provider === "default" ? LB.llm.default() : state[task]?.provider;
  const effective = (task) => {
    if (!state[task]) return null;
    const id = primary(task);
    return LB.llm.ready(id) ? id : null;
  };
  const refresh = () => A.refreshSettings("analysis");
  const emit = () => listeners.forEach((fn) => fn());
  const reconcile = () => {
    let changed = false;
    for (const task of tasks) {
      const s = state[task.id];
    }
    return changed;
  };
  const persist = () => A.store.set("analysis", state);
  const changed = () => { reconcile(); persist(); refresh(); emit(); };
  const llmChanged = () => { if (reconcile()) persist(); refresh(); emit(); };
  const option = (value, label, current, disabled = false) => `<option value="${esc(value)}" ${value === current ? "selected" : ""} ${disabled ? "disabled" : ""}>${esc(label)}</option>`;
  const providerOption = (p, current) => option(p.id, `${p.name}${LB.llm.ready(p.id) ? "" : " (chưa sẵn sàng)"}`, current, !LB.llm.ready(p.id) && p.id !== current);
  const openLLM = () => '<button type="button" class="btn btn-sm" data-act="settings" data-v="llm">Mở LLM providers</button>';
  const field = (task, key, label, options, hint = "", disabled = false) => `<div class="field"><label for="an-${key}-${task}">${label}</label><select id="an-${key}-${task}" class="select" data-testid="an-${key}-${task}" data-change="an-field" data-p="${task}" data-f="${key}" ${disabled ? "disabled" : ""} ${hint ? `aria-describedby="an-${key}-${task}-hint"` : ""}>${options}</select>${hint ? `<span class="field-hint" id="an-${key}-${task}-hint">${hint}</span>` : ""}</div>`;
  const card = (task) => {
    const s = state[task.id];
    const id = primary(task.id);
    const active = effective(task.id);
    const ready = !!active;
    const status = ready ? "SẴN SÀNG" : "CHƯA SẴN SÀNG";
    const statusClass = ready ? "badge-success" : "badge-warning";
    const message = ready ? `${provider(active).name} · sẵn sàng` : "Không có LLM sẵn sàng cho tác vụ này.";
    return `<article class="tts-card an-card" data-testid="an-card-${task.id}">
      <header class="tts-card-h">${ic(task.icon)}<span class="t-ink an-name">${task.name}</span><span class="spacer"></span><span class="badge ${statusClass}" data-testid="an-status-${task.id}" role="status">${status}</span></header>
      <p class="t-sm t-mute">${task.blurb}</p>
      <div class="form-2">
        ${field(task.id, "provider", "Provider", option("default", `Mặc định (${provider(LB.llm.default())?.name || "chưa có"})`, s.provider) + LB.llm.PROVIDERS.map((p) => providerOption(p, s.provider)).join(""))}
        ${field(task.id, "batch", "Số chương mỗi lượt", Array.from({ length: 10 }, (_, i) => option(i + 1, i + 1, s.batch)).join(""), "Số chương gửi trong một lần gọi.")}
      </div>
      <footer class="spc-foot"><div class="spc-msg t-sm ${ready ? "is-ok" : "an-warning"}" role="status">${ic(ready ? "check" : "alert")}<span>${esc(message)}</span></div>${ready ? "" : openLLM()}</footer>
    </article>`;
  };
  const render = () => `<div class="tts an-view" data-testid="an-settings">
    <header class="tts-head"><div><h3 class="t-display-xs">Analysis providers</h3></div></header>
    <p class="t-sm t-mute">Chọn LLM provider dùng cho dịch và phân tích tri thức trên novel. Việc kết nối, API key, đường dẫn CLI và kiểm tra nằm ở tab LLM providers.</p>
    ${LB.llm.list().some((p) => LB.llm.ready(p.id)) ? "" : `<div class="tts-pending an-pending">${ic("alert")}<div class="tts-pending-b"><b>Chưa có LLM nào sẵn sàng</b><p class="t-sm">Kết nối và kiểm tra một LLM trước khi gán cho tác vụ.</p></div>${openLLM()}</div>`}
    ${tasks.map(card).join("")}
    <div class="spc-note">${ic("shield")}<span>Nội dung chương và prompt được gửi tới dịch vụ của nhà cung cấp tương ứng, trực tiếp hoặc qua CLI đã chọn. Chi phí và giới hạn do tài khoản của bạn quyết định.</span></div>
  </div>`;

  reconcile();
  LB.analysis = { PROVIDERS: tasks, get: (task) => state[task] ? { ...state[task] } : null, effective, on: (fn) => listeners.push(fn) };
  LB.llm.on(llmChanged);
  A.SETTINGS_VIEWS.analysis = { cls: "modal-xl", render };
  A.ON["an-field"] = (el) => {
    const task = el.dataset.p;
    const key = el.dataset.f;
    const s = state[task];
    if (!s) return;
    const value = key === "batch" ? Number(el.value) : el.value;
    if (key === "provider" && value !== "default" && !provider(value)) return;
    if (key === "batch" && (!Number.isInteger(value) || value < 1 || value > 10)) return;
    if (!["provider", "batch"].includes(key) || s[key] === value) return;
    s[key] = value;
    changed();
  };
})();
