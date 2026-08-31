(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const PROVIDERS = [
    { id: "claude", command: "claude", name: "Claude Code CLI", version: "2.1.4", env: "CLAUDE_CONFIG_DIR", login: "claude auth login", account: "user@example.com", caps: ["TRANSLATION", "KNOWLEDGE", "ASSISTANT"] },
    { id: "antigravity", command: "agy", name: "Antigravity CLI", version: "1.0.3", env: "", login: "agy login", account: "user@example.com", caps: ["TRANSLATION", "KNOWLEDGE", "ASSISTANT"] },
    { id: "codex", command: "codex", name: "Codex CLI", version: "0.87.0", env: "CODEX_HOME", login: "codex login", account: "user@example.com", caps: ["KNOWLEDGE", "ASSISTANT"] },
  ];
  PROVIDERS.forEach((p) => { p.kind = "cli"; });
  const cloudProviders = [
    { id: "anthropic", name: "Anthropic API", site: "console.anthropic.com", note: "Call Claude through the Anthropic API with an API key created in the Console." },
    { id: "openai", name: "OpenAI", site: "platform.openai.com", note: "Uses the Chat/Responses API. You can change the Base URL if you use an OpenAI-compatible gateway.", baseUrl: "https://api.openai.com/v1" },
    { id: "google", name: "Google AI Studio (Gemini)", site: "aistudio.google.com", note: "Use an API key created in Google AI Studio to call the Gemini API." },
    { id: "openrouter", name: "OpenRouter", site: "openrouter.ai", note: "One API key to use many models from many providers.", baseUrl: "https://openrouter.ai/api/v1" },
    { id: "custom", name: "Custom (OpenAI-compatible)", site: "your server", note: "Use an OpenAI-compatible server, for example Ollama or LM Studio running on this machine or on your network.", baseUrl: "" }
  ];
  const cliProviders = [...PROVIDERS];
  const provider = (id) => PROVIDERS.find((p) => p.id === id);
  const listeners = [];
  const tests = new Map();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const profileDir = (id) => `%LOCALAPPDATA%\\DreamyStudio\\llm\\${id}`;
  const seed = () => ({ checked: false, default: "claude", providers: Object.fromEntries(PROVIDERS.map((p) => [p.id, {
    enabled: true, found: p.id !== "codex", path: p.id === "codex" ? "" : `C:\\Users\\user\\AppData\\Roaming\\npm\\${p.command}.cmd`,
    version: p.id === "codex" ? "" : p.version, args: "", signed: p.id === "claude", account: p.id === "claude" ? p.account : "", signing: false,
    status: p.id === "claude" ? "ok" : "none", error: "", at: p.id === "claude" ? A.stamp() : "", latency: 120 + LB.hash(p.id) % 280,
  }])) });
  const S = () => (LB.state.llm ||= seed());
  const P = (id) => S().providers[id];
  const ready = (id) => !!P(id) && P(id).found && P(id).enabled && P(id).signed && P(id).status === "ok";
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

  const detection = () => cliProviders.map((p) => ({ id: p.id, name: p.name, status: !P(p.id).found ? "missing" : "ok", detail: P(p.id).found ? `${P(p.id).version} · ${P(p.id).path}` : "Not found in PATH" }));
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
    if (!s.signed) return badge("badge-warning", "NOT SIGNED IN");
    const styles = { none: ["", "NOT CHECKED"], checking: ["badge-running", "CHECKING"], ok: ["badge-success", "READY"], error: ["badge-danger", "ERROR"] };
    return badge(...styles[s.status]);
  };
  const message = (p, s) => {
    if (!s.found) return "Not installed on this machine.";
    if (s.signing) return `<span class="dot dot-running"></span><span>Waiting for you to finish signing in on the terminal…</span>`;
    if (!s.signed) return `${ic("alert")}<span>Sign in to the app's own profile before using this CLI.</span>`;
    if (s.status === "ok") return `${ic("check")}<span>Check succeeded · ${s.latency} ms · ${esc(s.at)}</span>`;
    if (s.status === "error") return `${ic("alert")}<span>Check failed.</span>`;
    if (s.status === "checking") return `<span class="dot dot-running"></span><span>Running <span class="path">${p.command}</span>…</span>`;
    return "Signed in. Click Check to try running the command.";
  };
  const stepMark = (n, done) => `<span class="cl-n">${done ? ic("check") : n}</span>`;
  const installStep = (p, s) => s.found
    ? `<div class="cl-step is-done">${stepMark(1, true)}<div class="cl-step-b"><div class="cl-step-t"><b>Install</b>${badge("badge-success", "FOUND IN PATH")}</div>
      <div class="field"><label class="sr-only" for="cl-${p.id}-path">Executable path</label><div class="cl-pathrow"><input id="cl-${p.id}-path" data-testid="cl-${p.id}-path" class="input mono-in" value="${esc(s.path)}" data-change="cl-field" data-p="${p.id}" data-f="path" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-sm btn-icon" data-act="cl-copy" data-p="${p.id}" aria-label="Copy path">${ic("copy")}</button></div></div></div></div>`
    : `<div class="cl-step is-todo">${stepMark(1, false)}<div class="cl-step-b"><div class="cl-step-t"><b>Install</b>${badge("badge-warning", "NOT FOUND")}<span class="t-sm t-mute"><span class="path">${p.command}</span> is not in PATH</span></div>
      <div class="cl-guide"><span>Install the CLI then click Rescan, or enter the executable path by hand.</span><div class="field"><label class="sr-only" for="cl-${p.id}-manual">Executable path</label><div class="cl-pathrow"><input id="cl-${p.id}-manual" data-testid="cl-${p.id}-manual" class="input mono-in" placeholder="C:\\...\\${p.command}.cmd" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-sm" data-act="cl-use-path" data-p="${p.id}">Use this path</button></div></div></div></div></div>`;
  const loginStep = (p, s) => {
    if (!s.found) return `<div class="cl-step is-locked">${stepMark(2, false)}<div class="cl-step-b"><div class="cl-step-t"><b>Sign in</b><span class="t-sm t-mute">Install the CLI first.</span></div></div></div>`;
    const dir = `<div class="field"><label class="sr-only" for="cl-${p.id}-profile">Profile folder</label><div class="cl-pathrow"><input id="cl-${p.id}-profile" data-testid="cl-${p.id}-profile" class="input mono-in" readonly value="${esc(profileDir(p.id))}"><button type="button" class="btn btn-sm btn-icon" data-act="cl-open-profile" data-p="${p.id}" aria-label="Open profile folder">${ic("folder-open")}</button></div><span class="field-hint">The app's own profile${p.env ? `, passed to the CLI through <span class="path">${p.env}</span>` : ""}. It does not share the session you signed in with in a terminal.</span></div>`;
    if (s.signed) return `<div class="cl-step is-done">${stepMark(2, true)}<div class="cl-step-b"><div class="cl-step-t"><b>Sign in</b>${badge("badge-success", "SIGNED IN")}<span class="t-sm t-mute">${esc(s.account)}</span></div>${dir}</div></div>`;
    return `<div class="cl-step is-todo">${stepMark(2, false)}<div class="cl-step-b"><div class="cl-step-t"><b>Sign in</b>${badge("badge-warning", s.signing ? "WAITING" : "NOT SIGNED IN")}</div>
      <div class="cl-guide"><span>The app's profile is empty. Click <b>Sign in</b> to open a terminal running <span class="path">${p.login}</span> in this profile, finish signing in, then come back and click <b>Check</b>.</span></div>${dir}</div></div>`;
  };
  const args = (p, s) => `<div class="spc-fields"><div class="field cl-wide"><label for="cl-${p.id}-args">Extra arguments</label><input id="cl-${p.id}-args" data-testid="cl-${p.id}-args" class="input mono-in" value="${esc(s.args)}" placeholder="e.g. --max-turns 5" data-change="cl-field" data-p="${p.id}" data-f="args" autocomplete="off" spellcheck="false"><span class="field-hint">Added to every command run. Do not enter secret keys here.</span></div></div>`;
  const card = (p) => {
    const s = P(p.id);
    const mode = !s.found ? "is-missing" : !s.signed ? "is-login" : s.status === "error" ? "is-error" : ready(p.id) ? "is-ready" : "";
    return `<article class="cl-card ${mode} ${s.enabled ? "" : "is-off"}" data-testid="cl-${p.id}">
      <header class="spc-h"><div class="spc-t"><span class="t-ink spc-name">${p.name}</span>${statusBadge(s)}${LB.llm.isDefault(p.id) ? badge("badge-primary", "DEFAULT") : ""}</div><label class="check spc-on"><input type="checkbox" data-testid="cl-${p.id}-enable" data-change="cl-enable" data-p="${p.id}" ${s.found && s.enabled ? "checked" : ""} ${s.found ? "" : "disabled"}><span>Enable</span></label></header>
      <div class="tts-m-meta"><span class="path t-mute">${p.command}</span>${s.found ? badge("cl-version", s.version) : ""}${p.caps.map((c) => badge("badge-primary", c)).join("")}</div>
      <div class="cl-steps">${installStep(p, s)}${loginStep(p, s)}</div>
      ${s.status === "error" && s.signed ? `<div class="tts-err">${ic("alert")}<span>${esc(s.error)}</span></div>` : ""}
      ${s.found ? args(p, s) : ""}
      <footer class="spc-foot"><div class="spc-msg t-sm ${s.signed && s.status === "ok" ? "is-ok" : "t-mute"}" data-testid="cl-${p.id}-status" role="status">${message(p, s)}</div>${s.found ? `${s.signed ? `<button type="button" class="btn btn-sm" data-testid="cl-${p.id}-logout" data-act="cl-logout" data-p="${p.id}">Sign out</button>` : ""}<button type="button" class="btn btn-sm ${s.signed ? "" : "btn-primary"}" data-testid="cl-${p.id}-login" data-act="cl-login" data-p="${p.id}" ${s.signing ? "disabled" : ""}>${ic("terminal")}${s.signed ? "Sign in again" : "Sign in"}</button><button type="button" class="btn btn-sm ${s.signed ? "btn-primary" : ""}" data-testid="cl-${p.id}-test" data-act="cl-test" data-p="${p.id}" ${!s.enabled || !s.signed || s.status === "checking" ? "disabled" : ""}>${ic("refresh")}Check</button><button type="button" class="btn btn-sm" data-testid="cl-${p.id}-default" data-act="cl-default" data-p="${p.id}" ${!ready(p.id) || LB.llm.isDefault(p.id) ? "disabled" : ""}>Set as default</button>` : ""}</footer></article>`;
  };
  const cloudCard = (p) => `<article class="cl-card cl-cloud is-soon" data-testid="cl-${p.id}" aria-disabled="true"><header class="spc-h"><div class="spc-t"><span class="t-ink spc-name">${esc(p.name)}</span>${badge("badge-info", "COMING SOON")}</div><label class="check spc-on"><input type="checkbox" disabled><span>Enable</span></label></header><div class="tts-m-meta"><span class="path t-mute">${esc(p.site)}</span></div><p class="t-sm t-mute">${esc(p.note)}</p><div class="spc-fields"><div class="field spc-key ${p.baseUrl === undefined ? "is-solo" : ""}"><label for="cl-${p.id}-key">API key</label><div class="spc-keyrow"><input id="cl-${p.id}-key" data-testid="cl-${p.id}-key" class="input mono-in" type="password" disabled placeholder="Paste API key"><button type="button" class="btn btn-icon" disabled aria-label="Show / hide key">${ic("eye")}</button></div></div>${p.baseUrl !== undefined ? `<div class="field"><label for="cl-${p.id}-baseUrl">Base URL</label><input id="cl-${p.id}-baseUrl" data-testid="cl-${p.id}-baseUrl" class="input mono-in" disabled value="${esc(p.baseUrl)}" placeholder="http://localhost:11434/v1"></div>` : ""}</div></article>`;
  const defaultOptions = () => available().map((p) => `<option value="${p.id}" ${LB.llm.isDefault(p.id) ? "selected" : ""}>${p.name}</option>`).join("");
  const render = () => `<div class="tts cl-view" data-testid="cl-settings"><header class="tts-head"><div><h3 class="t-display-xs">LLM providers</h3></div></header><p class="t-sm t-mute">Connect the LLMs used for translation, knowledge analysis and the Assistant. CLIs installed on this machine are supported now; cloud services via an API key are coming soon.</p><div class="spc-note">${ic("shield")}<span>Each CLI runs in the app's own sign-in profile, stored next to the application database and separate from the session you use in a terminal. You sign in once per CLI. The content to process is sent to the respective provider’s service; costs and limits are determined by your account.</span></div><section class="tts-card"><header class="tts-card-h cl-detection-h"><span class="eyebrow">Default</span>${badge(available().length ? "badge-success" : "badge-warning", available().length ? `${available().length} / ${PROVIDERS.length} READY` : "NO LLM READY")}</header><div class="field"><label for="cl-default">Default LLM</label><span class="field-hint">Used when a task does not choose its own provider.</span><select id="cl-default" data-testid="cl-default" class="select" data-change="cl-default" ${available().length ? "" : "disabled"}>${available().length ? (S().default ? "" : '<option value="" selected>No LLM is ready</option>') + defaultOptions() : '<option value="">No LLM is ready</option>'}</select></div></section><header class="cl-sec-h"><span class="eyebrow">CLI on this machine</span><button type="button" class="btn btn-sm" data-act="cl-scan" ${running ? "disabled" : ""}>${ic("refresh")}Rescan</button></header><section class="tts-card" aria-label="Detect"><div class="ld-steps tts-checks" id="cl-checks" role="status" aria-live="polite">${checkRows()}</div></section><section class="tts-list">${cliProviders.map(card).join("")}</section><header class="cl-sec-h"><span class="eyebrow">Cloud services</span>${badge("badge-info", "COMING SOON")}</header><section class="tts-list">${cloudProviders.map(cloudCard).join("")}</section><p class="t-sm t-mute tts-foot">${ic("info")}<span>Prototype: CLI scanning, sign-in and connection checks are simulated, no real commands run. A CLI whose path contains “bad” or the argument <span class="path">--fail</span> will fail the check so you can see the error state.</span></p></div>`;
  async function test(id) {
    const s = P(id);
    if (!s?.found || !s.enabled || !s.signed || s.status === "checking") return;
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
      s.error = `Command exited with code 1: the session in the app's profile is not valid. Click Sign in again, finish signing in on the terminal, then check again.`;
    } else {
      s.status = "ok";
      s.latency = 120 + LB.hash(id + s.path + s.args) % 280;
      s.at = A.stamp();
      if (!S().default && s.enabled) S().default = id;
    }
    changed();
  }
  async function login(id) {
    const s = P(id);
    if (!s?.found || s.signing) return;
    const epoch = generation;
    tests.delete(id);
    Object.assign(s, { signing: true, signed: false, account: "", status: "none", error: "" });
    reconcile();
    changed();
    await sleep(1600);
    if (epoch !== generation || P(id) !== s || !s.signing) return;
    Object.assign(s, { signing: false, signed: true, account: PROVIDERS.find((p) => p.id === id).account });
    changed();
  }
  const logout = (id) => {
    tests.delete(id);
    Object.assign(P(id), { signing: false, signed: false, account: "", status: "none", error: "" });
    reconcile();
    changed();
  };
  const setDefault = (id) => { if (ready(id)) { S().default = id; changed(); } };
  const copyPath = async (id) => {
    try { await navigator.clipboard.writeText(P(id).path); }
    catch { A.$(`#cl-${id}-path`)?.select(); }
  };
  A.SETTINGS_VIEWS.llm = { cls: "modal-xl", render, mount() { if (!S().checked && !running) scan(); } };
  Object.assign(A.ACT, {
    "cl-scan": scan,
    "cl-login": (el) => login(el.dataset.p),
    "cl-logout": (el) => logout(el.dataset.p),
    "cl-open-profile": () => A.toast("Opens the profile folder in the file explorer.", "info"),
    "cl-test": (el) => test(el.dataset.p),
    "cl-default": (el) => setDefault(el.dataset.p),
    "cl-copy": (el) => copyPath(el.dataset.p),
    "cl-use-path": (el) => {
      const id = el.dataset.p;
      const path = A.$(`#cl-${id}-manual`)?.value.trim() || "";
      if (!/^[A-Za-z]:\\.+\.(exe|cmd|bat)$/i.test(path)) { A.toast("Enter the full path to a .exe, .cmd or .bat file.", "warning"); return; }
      Object.assign(P(id), { found: true, enabled: true, path, version: PROVIDERS.find((p) => p.id === id).version, signed: false, account: "", status: "none", error: "" });
      changed();
    },
  });
  Object.assign(A.ON, {
    "cl-default": (el) => setDefault(el.value),
    "cl-field": (el) => {
      const s = P(el.dataset.p);
      const value = el.value.trim();
      if (s[el.dataset.f] === value) return;
      s[el.dataset.f] = value;
      tests.delete(el.dataset.p);
      if (s.status !== "none") { s.status = "none"; s.error = ""; }
      reconcile();
      changed();
    },
    "cl-enable": (el) => {
      const s = P(el.dataset.p);
      if (!s.found) return;
      s.enabled = el.checked;
      reconcile();
      changed();
    },
  });
})();
