(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const PROVIDERS = [
    { id: "claude", command: "claude", name: "Claude Code CLI", version: "2.1.4", caps: ["TRANSLATION", "KNOWLEDGE", "ASSISTANT"] },
    { id: "antigravity", command: "agy", name: "Antigravity CLI", version: "1.0.3", caps: ["TRANSLATION", "KNOWLEDGE", "ASSISTANT"] },
    { id: "codex", command: "codex", name: "Codex CLI", version: "0.87.0", caps: ["KNOWLEDGE", "ASSISTANT"] },
  ];
  PROVIDERS.forEach((p) => { p.kind = "cli"; });
  const cloudCaps = ["TRANSLATION", "KNOWLEDGE", "ASSISTANT"];
  const cloudProviders = [
    { id: "anthropic", name: "Anthropic API", site: "console.anthropic.com", note: "Call Claude through the Anthropic API with an API key created in the Console." },
    { id: "openai", name: "OpenAI", site: "platform.openai.com", note: "Uses the Chat/Responses API. You can change the Base URL if you use an OpenAI-compatible gateway.", baseUrl: "https://api.openai.com/v1", baseUrlEditable: true },
    { id: "google", name: "Google AI Studio (Gemini)", site: "aistudio.google.com", note: "Use an API key created in Google AI Studio to call the Gemini API." },
    { id: "openrouter", name: "OpenRouter", site: "openrouter.ai", note: "One API key to use many models from many providers.", baseUrl: "https://openrouter.ai/api/v1" },
    { id: "custom", name: "Custom (OpenAI-compatible)", site: "your server", note: "Use an OpenAI-compatible server, for example Ollama or LM Studio running on this machine or on your network.", baseUrl: "", baseUrlEditable: true }
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

  const detection = () => cliProviders.map((p) => ({ id: p.id, name: p.name, status: !P(p.id).found ? "missing" : P(p.id).status === "ok" ? "ok" : "none", detail: P(p.id).found ? `${P(p.id).version} · ${P(p.id).path}` : "Not found in PATH" }));
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
    if (!s.found) return badge("badge-warning", "NOT INSTALLED");
    if (!s.enabled) return badge("", "DISABLED");
    const styles = { none: ["", "NOT CHECKED"], checking: ["badge-running", "CHECKING"], ok: ["badge-success", "CONNECTED"], error: ["badge-danger", "ERROR"] };
    return badge(...styles[s.status]);
  };
  const message = (p, s) => {
    if (!s.found) return "Not installed on this machine.";
    if (s.status === "ok") return `${ic("check")}<span>Check succeeded · ${s.latency} ms · ${esc(s.at)}</span>`;
    if (s.status === "error") return `${ic("alert")}<span>${esc(s.error)}</span>`;
    if (s.status === "checking") return `<span class="dot dot-running"></span><span>Running <span class="path">${p.command} --version</span>…</span>`;
    return "Not checked. Click Check to try running the command.";
  };
  const fields = (p, s) => `<div class="spc-fields">
    <div class="field cl-wide"><label for="cl-${p.id}-path">Executable path</label><div class="cl-pathrow"><input id="cl-${p.id}-path" class="input mono-in" value="${esc(s.path)}" data-change="cl-field" data-p="${p.id}" data-f="path" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-sm btn-icon" data-act="cl-copy" data-p="${p.id}" aria-label="Copy path">${ic("copy")}</button></div></div>
    <div class="field cl-wide"><label for="cl-${p.id}-args">Extra arguments</label><input id="cl-${p.id}-args" class="input mono-in" value="${esc(s.args)}" placeholder="e.g. --max-turns 5" data-change="cl-field" data-p="${p.id}" data-f="args" autocomplete="off" spellcheck="false"><span class="field-hint">Added to every command run. Do not enter secret keys here.</span></div></div>`;
  const missing = (p) => `<div class="tts-pending">${ic("alert")}<div class="tts-pending-b"><b>Not found <span class="path">${p.command}</span> trong PATH</b><p class="t-sm">Install the CLI then click Rescan, or enter the executable path by hand.</p><div class="field"><label class="sr-only" for="cl-${p.id}-manual">Executable path</label><div class="cl-pathrow"><input id="cl-${p.id}-manual" class="input mono-in" placeholder="C:\\...\\${p.command}.cmd" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-sm" data-act="cl-use-path" data-p="${p.id}">Use this path</button></div></div></div></div>`;
  const card = (p) => {
    const s = P(p.id);
    return `<article class="cl-card ${s.enabled ? "" : "is-off"} ${s.found ? "" : "is-missing"}" data-testid="cl-${p.id}">
      <header class="spc-h"><div class="spc-t"><span class="t-ink spc-name">${p.name}</span>${statusBadge(s)}${LB.llm.isDefault(p.id) ? badge("badge-primary", "DEFAULT") : ""}</div><label class="check spc-on"><input type="checkbox" data-change="cl-enable" data-p="${p.id}" ${s.found && s.enabled ? "checked" : ""} ${s.found ? "" : "disabled"}><span>Enable</span></label></header>
      <div class="tts-m-meta"><span class="path t-mute">${p.command}</span>${s.found ? badge("cl-version", s.version) : ""}${p.caps.map((c) => badge("badge-primary", c)).join("")}</div>
      ${s.found ? fields(p, s) : missing(p)}
      <footer class="spc-foot"><div class="spc-msg t-sm ${s.status === "ok" ? "is-ok" : s.status === "error" ? "is-err" : "t-mute"}" role="status">${message(p, s)}</div>${s.found ? `<button type="button" class="btn btn-sm btn-primary" data-act="cl-test" data-p="${p.id}" ${!s.enabled || s.status === "checking" ? "disabled" : ""}>${ic("refresh")}Check</button><button type="button" class="btn btn-sm" data-act="cl-default" data-p="${p.id}" ${!ready(p.id) || LB.llm.isDefault(p.id) ? "disabled" : ""}>Set as default</button>` : ""}</footer></article>`;
  };
  const cloudMessage = (p, s) => {
    if (s.status === "checking") return '<span class="dot dot-running"></span><span>Checking the connection to ' + esc(p.name) + '…</span>';
    if (s.status === "ok") return ic("check") + '<span>Connected successfully · ' + s.latency + ' ms · ' + esc(s.at) + '</span>';
    if (s.status === "error") return ic("alert") + '<span>' + esc(s.error) + '</span>';
    return s.saved ? "Key saved, not checked yet." : "Enter an API key then click check connection.";
  };
  const cloudField = (p, f, label, placeholder = "") => {
    const id = 'cl-' + p.id + '-' + f;
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" data-testid="' + id + '" class="input mono-in" value="' + esc(P(p.id)[f]) + '" placeholder="' + placeholder + '" ' + (f === "baseUrl" && !p.baseUrlEditable ? 'readonly' : '') + ' data-change="cl-field" data-p="' + p.id + '" data-f="' + f + '" autocomplete="off" spellcheck="false"></div>';
  };
  const cloudButton = (p, action, label, disabled, primary = false) => '<button type="button" class="btn btn-sm ' + (primary ? 'btn-primary' : '') + '" data-testid="cl-' + p.id + '-' + (action === 'cloud-test' ? 'test' : action) + '" data-act="cl-' + action + '" data-p="' + p.id + '" ' + (disabled ? 'disabled' : '') + '>' + (primary ? ic("refresh") : '') + label + '</button>';
  const cloudCard = (p) => {
    const s = P(p.id);
    const statuses = { none: ["", "NOT CONFIGURED"], checking: ["badge-running", "CHECKING"], ok: ["badge-success", "CONNECTED"], error: ["badge-danger", "CONNECTION ERROR"] };
    const id = 'cl-' + p.id;
    return '<article class="cl-card cl-cloud ' + (s.enabled ? '' : 'is-off') + '" data-testid="' + id + '"><header class="spc-h"><div class="spc-t"><span class="t-ink spc-name">' + esc(p.name) + '</span>' + (s.enabled ? badge(...statuses[s.status]) : badge('', 'DISABLED')) + (LB.llm.isDefault(p.id) ? badge('badge-primary', 'DEFAULT') : '') + '</div><label class="check spc-on"><input type="checkbox" data-testid="' + id + '-enable" data-change="cl-enable" data-p="' + p.id + '" ' + (s.enabled ? 'checked' : '') + '><span>Enable</span></label></header><div class="tts-m-meta"><span class="path t-mute">' + esc(p.site) + '</span>' + p.caps.map((c) => badge('badge-primary', c)).join('') + '</div><p class="t-sm t-mute">' + esc(p.note) + '</p><div class="spc-fields"><div class="field spc-key ' + (p.baseUrl === undefined ? 'is-solo' : '') + '"><label for="' + id + '-key">API key</label><div class="spc-keyrow"><input id="' + id + '-key" data-testid="' + id + '-key" class="input mono-in" type="password" value="' + esc(s.draft) + '" placeholder="' + (s.saved ? '•••••••••••• (saved, enter to replace)' : 'Paste API key') + '" data-on="cl-key" data-p="' + p.id + '" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-icon" data-testid="' + id + '-eye" data-act="cl-eye" data-p="' + p.id + '" aria-label="Show / hide key">' + ic('eye') + '</button></div></div>' + (p.baseUrl !== undefined ? cloudField(p, 'baseUrl', 'Base URL', p.id === 'custom' ? 'http://localhost:11434/v1' : '') : '') + '</div><footer class="spc-foot"><div class="spc-msg t-sm ' + (s.status === 'ok' ? 'is-ok' : s.status === 'error' ? 'is-err' : 't-mute') + '" data-testid="' + id + '-status" role="status">' + cloudMessage(p, s) + '</div>' + cloudButton(p, 'cloud-test', 'Save and check', s.status === 'checking', true) + cloudButton(p, 'default', 'Set as default', !ready(p.id) || LB.llm.isDefault(p.id)) + cloudButton(p, 'clear', 'Delete key', !s.saved) + '</footer></article>';
  };
  const defaultOptions = () => [["cli", "CLI on this machine"], ["cloud", "Cloud services"]].map(([kind, label]) => '<optgroup label="' + label + '">' + available().filter((p) => p.kind === kind).map((p) => '<option value="' + p.id + '" ' + (LB.llm.isDefault(p.id) ? 'selected' : '') + '>' + p.name + '</option>').join('') + '</optgroup>').join('');
  const render = () => '<div class="tts cl-view" data-testid="cl-settings"><header class="tts-head"><div><h3 class="t-display-xs">LLM providers</h3></div></header><p class="t-sm t-mute">Connect the LLMs used for translation, knowledge analysis and the Assistant: CLIs installed on this machine or cloud services via an API key.</p><div class="spc-note">' + ic('shield') + '<span>CLIs run with your existing signed-in account. API keys are stored only on this machine, not in the workspace, and do not travel with the project when exported. The content to process is sent to the respective provider’s service; costs and limits are determined by your account.</span></div><section class="tts-card"><header class="tts-card-h cl-detection-h"><span class="eyebrow">Default</span>' + badge(available().length ? 'badge-success' : 'badge-warning', available().length ? available().length + ' / 8 READY' : 'NO LLM READY') + '</header><div class="field"><label for="cl-default">Default LLM</label><span class="field-hint">Used when a task does not choose its own provider.</span><select id="cl-default" data-testid="cl-default" class="select" data-change="cl-default" ' + (available().length ? '' : 'disabled') + '>' + (available().length ? (S().default ? '' : '<option value="" selected>No LLM is ready</option>') + defaultOptions() : '<option value="">No LLM is ready</option>') + '</select></div></section><header class="cl-sec-h"><span class="eyebrow">CLI on this machine</span><button type="button" class="btn btn-sm" data-act="cl-scan" ' + (running ? 'disabled' : '') + '>' + ic('refresh') + 'Rescan</button></header><section class="tts-card" aria-label="Detect"><div class="ld-steps tts-checks" id="cl-checks" role="status" aria-live="polite">' + checkRows() + '</div></section><section class="tts-list">' + cliProviders.map(card).join('') + '</section><header class="cl-sec-h"><span class="eyebrow">Cloud services</span></header><section class="tts-list">' + cloudProviders.map(cloudCard).join('') + '</section><p class="t-sm t-mute tts-foot">' + ic('info') + '<span>Prototype: CLI scanning and connection checks are simulated, no real commands run and no network calls are made. A CLI whose path contains “bad” or the argument <span class="path">--fail</span>, and an API key shorter than 8 characters or starting with “bad”, will fail so you can see the error state.</span></p></div>';
  async function testCloud(id) {
    const p = provider(id);
    const s = P(id);
    if (s.status === "checking") return;
    const key = (s.draft || s.key || "").trim();
    const missing = p.keyRequired && !key ? ["key", "API key"] : id === "custom" && !s.baseUrl ? ["baseUrl", "Base URL"] : null;
    if (missing) { A.toast('Enter ' + missing[1] + ' of ' + p.name + '.', 'warning'); A.$('#cl-' + id + '-' + missing[0])?.focus(); return; }
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
    s.error = refused ? "Could not connect to the server: connection refused." : invalid ? id === "google" ? "400 API_KEY_INVALID: the key is invalid or was revoked in Google AI Studio." : "401 Unauthorized: the API key is invalid or was revoked." : "";
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
      s.error = `Command exited with code 1: not signed in. Run \`${PROVIDERS.find((p) => p.id === id).command} login\` in the terminal then check again.`;
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
      if (!/^[A-Za-z]:\\.+\.(exe|cmd|bat)$/i.test(path)) { A.toast("Enter the full path to a .exe, .cmd or .bat file.", "warning"); return; }
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
