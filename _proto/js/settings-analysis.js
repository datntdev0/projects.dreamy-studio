(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const tasks = [
    { id: "translate", name: "Translate", icon: "lang", blurb: "Translate chapters from the source language, following the novel’s translation guidelines and dictionary.", batch: 2 },
    { id: "analyze", name: "Analyze knowledge", icon: "graph", blurb: "Extract characters, places, events and relations following the novel’s ontology.", batch: 4 },
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
  const providerOption = (p, current) => option(p.id, `${p.name}${LB.llm.ready(p.id) ? "" : " (not ready)"}`, current, !LB.llm.ready(p.id) && p.id !== current);
  const openLLM = () => '<button type="button" class="btn btn-sm" data-act="settings" data-v="llm">Open LLM providers</button>';
  const field = (task, key, label, options, hint = "", disabled = false) => `<div class="field"><label for="an-${key}-${task}">${label}</label><select id="an-${key}-${task}" class="select" data-testid="an-${key}-${task}" data-change="an-field" data-p="${task}" data-f="${key}" ${disabled ? "disabled" : ""} ${hint ? `aria-describedby="an-${key}-${task}-hint"` : ""}>${options}</select>${hint ? `<span class="field-hint" id="an-${key}-${task}-hint">${hint}</span>` : ""}</div>`;
  const card = (task) => {
    const s = state[task.id];
    const id = primary(task.id);
    const active = effective(task.id);
    const ready = !!active;
    const status = ready ? "READY" : "NOT READY";
    const statusClass = ready ? "badge-success" : "badge-warning";
    const message = ready ? `${provider(active).name} · ready` : "No LLM is ready for this task.";
    return `<article class="tts-card an-card" data-testid="an-card-${task.id}">
      <header class="tts-card-h">${ic(task.icon)}<span class="t-ink an-name">${task.name}</span><span class="spacer"></span><span class="badge ${statusClass}" data-testid="an-status-${task.id}" role="status">${status}</span></header>
      <p class="t-sm t-mute">${task.blurb}</p>
      <div class="form-2">
        ${field(task.id, "provider", "Provider", option("default", `Default (${provider(LB.llm.default())?.name || "none"})`, s.provider) + LB.llm.PROVIDERS.map((p) => providerOption(p, s.provider)).join(""))}
        ${field(task.id, "batch", "Chapters per batch", Array.from({ length: 10 }, (_, i) => option(i + 1, i + 1, s.batch)).join(""), "The number of chapters sent in one call.")}
      </div>
      <footer class="spc-foot"><div class="spc-msg t-sm ${ready ? "is-ok" : "an-warning"}" role="status">${ic(ready ? "check" : "alert")}<span>${esc(message)}</span></div>${ready ? "" : openLLM()}</footer>
    </article>`;
  };
  const render = () => `<div class="tts an-view" data-testid="an-settings">
    <header class="tts-head"><div><h3 class="t-display-xs">Analysis providers</h3></div></header>
    <p class="t-sm t-mute">Choose the LLM provider used for translation and knowledge analysis on novels. Connection, API keys, CLI paths and checks are in the LLM providers tab.</p>
    ${LB.llm.list().some((p) => LB.llm.ready(p.id)) ? "" : `<div class="tts-pending an-pending">${ic("alert")}<div class="tts-pending-b"><b>No LLM is ready</b><p class="t-sm">Connect and test an LLM before assigning it to a task.</p></div>${openLLM()}</div>`}
    ${tasks.map(card).join("")}
    <div class="spc-note">${ic("shield")}<span>Chapter content and prompts are sent to the respective provider’s service, directly or through the selected CLI. Costs and limits are determined by your account.</span></div>
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
