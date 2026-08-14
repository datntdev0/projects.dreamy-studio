(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const RT = {
    bundle: { label: "App-bundled Python", path: "C:\\Program Files\\Dreamy Studio\\resources\\python\\python.exe", note: "Installer build: Python ships with the app, no separate Python install needed." },
    custom: { label: "Custom Python", note: "Run-from-source build: uses the Python and virtual environment you specify." },
  };
  const INFO = { py: "Python 3.11.9", dir: "%APPDATA%\\DreamyStudio", free: "212.7 GB" };
  const DEVICES = { auto: "Automatic (currently using CPU)", cpu: "CPU" };
  const PATH_RE = /^[A-Za-z]:\\.+python(w)?\.exe$/i;

  const B = () => LB.state.backend;
  const listeners = [];
  const consumers = [];
  const emit = () => listeners.forEach((fn) => fn());
  const ok = () => B().status === "running";
  const url = () => `http://127.0.0.1:${B().port}`;
  const pyPath = () => (B().source === "bundle" ? RT.bundle.path : B().customPython);
  const log = (line) => { const l = B().log; l.push(line); if (l.length > 60) l.shift(); };
  const req = (method, path, code, text) => log(`INFO:     127.0.0.1 - "${method} ${path} HTTP/1.1" ${code} ${text}`);
  const jobs = () => A.PL.list.filter((p) => p.status === "running" && /-download$/.test(p.kind));
  const applied = () => ({ source: B().source, customPython: B().customPython, device: B().device });
  const cfg = () => B().draft || applied();
  const pyOf = (c) => (c.source === "bundle" ? RT.bundle.path : c.customPython);
  const dirty = () => {
    const d = B().draft;
    if (!d) return false;
    const a = applied();
    return d.source !== a.source || d.device !== a.device || (d.source === "custom" && d.customPython !== a.customPython);
  };
  const refresh = () => A.refreshSettings("backend");
  const setDraft = (patch) => {
    B().draft = { ...cfg(), ...patch };
    if (!dirty()) B().draft = null;
    refresh();
  };

  LB.backend = {
    ok,
    status: () => B().status,
    url,
    pyPath,
    log,
    req,
    jobs,
    dir: INFO.dir,
    free: INFO.free,
    deviceLabel: () => DEVICES[B().device],
    on: (fn) => listeners.push(fn),
    register: (c) => consumers.push(c),
    open: () => A.openSettings("backend"),
  };

  let bootTimer = 0;
  let checks = null;
  let running = false;
  const reseed = LB.reseed;
  LB.reseed = function () { reseed.call(this); checks = null; running = false; clearTimeout(bootTimer); };

  function boot(reason) {
    const b = B();
    clearTimeout(bootTimer);
    jobs().forEach((p) => A.cancelPipeline(p.id));
    b.status = "starting";
    log(`INFO:     ${reason}`);
    log(`INFO:     Starting ${pyPath()} -m dreamy_backend.server --port ${b.port}`);
    refresh();
    emit();
    bootTimer = setTimeout(() => {
      b.status = "running";
      b.pid = 10000 + Math.floor(Math.random() * 50000);
      b.since = A.stamp();
      [`Started server process [${b.pid}]`, "Waiting for application startup.", "Application startup complete.", `Uvicorn running on ${url()} (Press CTRL+C to quit)`].forEach((l) => log(`INFO:     ${l}`));
      req("GET", "/health", 200, "OK");
      checks = null;
      refresh();
      emit();
    }, 1500);
  }
  function stop() {
    clearTimeout(bootTimer);
    jobs().forEach((p) => A.cancelPipeline(p.id));
    const b = B();
    b.status = "stopped";
    log("INFO:     Shutting down");
    log(`INFO:     Finished server process [${b.pid}]`);
    checks = null;
    refresh();
    emit();
  }

  const computeChecks = () => {
    const b = B();
    const up = b.status === "running";
    return [
      { id: "py", label: "Python runtime", state: "ok", detail: `${INFO.py} · ${pyPath()}` },
      { id: "api", label: "FastAPI server", state: up ? "ok" : "warn", detail: up ? `uvicorn · 127.0.0.1:${b.port} · PID ${b.pid}` : b.status === "starting" ? "Starting…" : "Not running" },
      { id: "health", label: "Health check", state: up ? "ok" : "warn", detail: up ? "GET /health → 200 · 8 ms" : "Not responding" },
      { id: "dev", label: "Accelerator", state: "warn", detail: "No CUDA GPU detected, will run on CPU" },
      { id: "disk", label: "Free space", state: "ok", detail: `${INFO.free} free on the data drive` },
    ];
  };
  const checkIcon = (s) => (s === "ok" ? ic("check") : s === "warn" ? ic("alert") : s === "error" ? ic("x") : s === "running" ? `<span class="dot dot-running"></span>` : `<span class="dot"></span>`);
  const checkRows = () => (checks || computeChecks()).map((c) => `<div class="ld-step is-${c.state === "ok" ? "done" : c.state}">${checkIcon(c.state)}<span>${esc(c.label)}</span><span class="ld-detail">${esc(c.detail || "")}</span></div>`).join("");
  const paintChecks = () => { const el = A.$("#be-checks"); if (el) el.innerHTML = checkRows(); };
  async function runChecks() {
    if (running) return;
    running = true;
    const final = computeChecks();
    checks = final.map((c) => ({ ...c, state: "pending", detail: "" }));
    A.$$('[data-act="be-check"]').forEach((b) => { b.disabled = true; });
    paintChecks();
    for (let i = 0; i < final.length; i++) {
      checks[i].state = "running";
      paintChecks();
      await sleep(240);
      checks[i] = final[i];
      paintChecks();
    }
    if (ok()) req("GET", "/health", 200, "OK");
    running = false;
    B().checked = true;
    A.$$('[data-act="be-check"]').forEach((b) => { b.disabled = false; });
  }

  const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;

  function pendingBar(c) {
    const a = applied();
    const rows = [];
    if (c.source !== a.source) rows.push(`Python source: ${RT[a.source].label} → ${RT[c.source].label}`);
    if (c.source === "custom" && (c.source !== a.source || c.customPython !== a.customPython)) rows.push(`python.exe: ${c.customPython}`);
    if (c.device !== a.device) rows.push(`Inference device: ${DEVICES[a.device]} → ${DEVICES[c.device]}`);
    const n = jobs().length;
    const up = B().status !== "stopped";
    return `<div class="tts-pending">${ic("alert")}<div class="tts-pending-b"><b>Changes not applied yet</b>
        <ul>${rows.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
        <span class="t-sm t-mute">${up ? "The backend will restart when you save." : "The backend will be started with the new settings."}${n ? ` ${n} running model download tasks will be cancelled.` : ""}</span></div>
      <div class="tts-pending-act"><button class="btn btn-sm btn-ghost" data-act="be-discard">Discard changes</button><button class="btn btn-sm btn-primary" data-act="be-apply" ${B().status === "starting" ? "disabled" : ""}>${up ? "Save and restart" : "Save and start"}</button></div></div>`;
  }

  function usageCard() {
    return `<section class="tts-card"><header class="tts-card-h"><span class="eyebrow">Using this backend</span></header>
      <div class="be-uses">${consumers.map((c) => `<button type="button" class="be-use" data-act="settings" data-v="${c.tab}">${ic(c.icon)}<span class="be-use-t">${esc(c.label)}</span><span class="t-sm t-mute">${esc(c.summary())}</span>${ic("chev-r")}</button>`).join("")}</div></section>`;
  }

  function render() {
    const b = B();
    const c = cfg();
    const st = { running: badge("badge-success", "RUNNING"), starting: badge("badge-running", "STARTING"), stopped: badge("badge-warning", "STOPPED") }[b.status];
    const lines = b.log.slice(-8);
    return `<div class="tts">
      <header class="tts-head"><div><h3 class="t-display-xs">Python backend</h3></div></header>
      <p class="t-sm t-mute">The app starts a Python backend (FastAPI) at the same time as opening a workspace, listening only on <span class="path">127.0.0.1</span>. Every local model, whether speech or otherwise, runs on this backend.</p>
      <section class="tts-card">
        <header class="tts-card-h"><span class="eyebrow">Status</span>${st}<span class="spacer"></span>
          <button class="btn btn-sm" data-act="be-check">${ic("refresh")}Check again</button>
          ${b.status === "stopped" ? `<button class="btn btn-sm btn-primary" data-act="be-start">${ic("play")}Start</button>` : `<button class="btn btn-sm" data-act="be-restart" ${b.status === "starting" ? "disabled" : ""}>${ic("swap")}Restart</button><button class="btn btn-sm" data-act="be-stop" ${b.status === "starting" ? "disabled" : ""}>${ic("stop")}Stop</button>`}</header>
        <div class="ld-steps tts-checks" id="be-checks" role="status" aria-live="polite">${checkRows()}</div>
      </section>
      <section class="tts-card">
        <header class="tts-card-h"><span class="eyebrow">Settings</span></header>
        <div class="form-2 tts-env">
          <div class="field"><label for="be-src">Python source</label><select id="be-src" class="select" data-change="be-source"><option value="bundle" ${c.source === "bundle" ? "selected" : ""}>${RT.bundle.label} (recommended)</option><option value="custom" ${c.source === "custom" ? "selected" : ""}>${RT.custom.label}</option></select>
            <span class="field-hint">${esc(RT[c.source].note)}</span></div>
          <div class="field"><label for="be-py">${c.source === "bundle" ? "Python bundle path" : "python.exe path"}</label>
            <input id="be-py" class="input mono-in" value="${esc(pyOf(c))}" ${c.source === "bundle" ? "readonly" : ""} data-change="be-pypath" autocomplete="off">
            <span class="field-hint">${c.source === "bundle" ? "Ships with the installer, not editable." : "The packages in the backend’s requirements.txt must be installed already."}</span></div>
          <div class="field"><label for="be-dev">Inference device</label><select id="be-dev" class="select" data-change="be-device"><option value="auto" ${c.device === "auto" ? "selected" : ""}>${DEVICES.auto}</option><option value="cpu" ${c.device === "cpu" ? "selected" : ""}>${DEVICES.cpu}</option><option value="cuda" disabled>CUDA GPU (not detected)</option></select></div>
          <div class="field"><label>Model data folder</label><div class="tts-dir"><span class="path">${esc(INFO.dir)}\\models</span><button class="btn btn-sm" data-act="be-open-dir">${ic("folder-open")}Open</button></div></div>
        </div>
        ${dirty() ? pendingBar(c) : ""}
      </section>
      ${consumers.length ? usageCard() : ""}
      <section class="tts-card"><div class="tts-log"><button class="tts-log-h" data-act="be-log">${ic(b.logOpen ? "chev-d" : "chev-r")}<span>Log backend</span><span class="mono t-mute">${esc(url())}</span></button>
        ${b.logOpen ? `<pre class="yaml tts-pre">${esc(lines.join("\n"))}</pre>` : ""}</div></section>
    </div>`;
  }

  A.SETTINGS_VIEWS.backend = {
    cls: "modal-xl",
    render,
    mount() { if (!B().checked && !checks) runChecks(); },
  };

  Object.assign(A.ACT, {
    "be-check": runChecks,
    "be-start": () => boot("Starting backend"),
    "be-restart": () => boot("Restarting backend"),
    "be-stop": stop,
    "be-log": () => { B().logOpen = !B().logOpen; refresh(); },
    "be-apply": () => {
      const d = B().draft;
      if (!d || !dirty()) { B().draft = null; refresh(); return; }
      if (d.source === "custom" && !PATH_RE.test(d.customPython)) { A.toast("The python.exe path is not valid.", "warning"); return; }
      B().source = d.source;
      B().customPython = d.customPython;
      B().device = d.device;
      B().draft = null;
      boot("Settings changed, restarting backend");
    },
    "be-discard": () => { B().draft = null; refresh(); },
    "be-open-dir": () => A.toast("Prototype: will open the data folder in File Explorer.", "warning"),
  });
  Object.assign(A.ON, {
    "be-device": (el) => setDraft({ device: el.value }),
    "be-source": (el) => setDraft({ source: el.value }),
    "be-pypath": (el) => {
      const v = el.value.trim();
      if (!PATH_RE.test(v)) { el.value = pyOf(cfg()); A.toast("Enter the full path to python.exe, for example C:\\Python311\\python.exe.", "warning"); return; }
      setDraft({ customPython: v });
    },
  });
})();
