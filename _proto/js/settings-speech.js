(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const PROVIDERS = [
    { id: "vieneu", name: "VieNeu.io", site: "vieneu.io", clone: true, billing: "usd", langs: "Vietnamese and English",
      note: "VieNeu’s speech service. Fill in the endpoint per the service’s API documentation.",
      fields: [{ id: "endpoint", label: "Endpoint", ph: "https://…", required: true }] },
    { id: "everai", name: "EverAI.vn", site: "everai.vn", clone: false, billing: "credit", langs: "7 languages, including Vietnamese",
      note: "Authenticates with a Bearer token created on the EverAI API page. Results come back asynchronously: the app sends a request, waits, then downloads the audio.",
      fields: [{ id: "endpoint", label: "Endpoint", value: "https://www.everai.vn/api/v1/tts", readonly: true }] },
    { id: "elevenlabs", name: "ElevenLabs", site: "elevenlabs.io", clone: true, billing: "usd", langs: "Many languages, including Vietnamese",
      note: "Supports voice cloning from a short sample. The voice sample will be uploaded to your ElevenLabs account.", fields: [] },
    { id: "google", name: "Google AI Studio", site: "aistudio.google.com", clone: false, billing: "usd", langs: "Many languages, including Vietnamese",
      note: "Use an API key created in Google AI Studio to call the Gemini API to generate speech.",
      fields: [{ id: "model", label: "TTS model", options: [["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-preview-tts"], ["gemini-2.5-pro-preview-tts", "gemini-2.5-pro-preview-tts"]], value: "gemini-2.5-flash-preview-tts" }] },
    { id: "openai", name: "OpenAI", site: "platform.openai.com", clone: false, billing: "usd", langs: "Many languages",
      note: "Uses the audio/speech endpoint. You can change the Base URL if you use an OpenAI-compatible gateway.",
      fields: [{ id: "baseUrl", label: "Base URL", value: "https://api.openai.com/v1" }, { id: "model", label: "TTS model", options: [["gpt-4o-mini-tts", "gpt-4o-mini-tts"], ["tts-1", "tts-1"], ["tts-1-hd", "tts-1-hd"]], value: "gpt-4o-mini-tts" }] },
  ];

  const S = () => LB.state.speech.providers;
  const prov = (id) => PROVIDERS.find((p) => p.id === id);
  const P = (id) => (S()[id] ||= { enabled: true, saved: false, fields: {}, status: "none" });
  const fieldVal = (pr, f) => P(pr.id).fields[f.id] ?? f.value ?? "";
  const ready = (id) => !!id && P(id).status === "ok" && P(id).enabled;

  LB.speech = {
    PROVIDERS,
    ready,
    name: (id) => prov(id)?.name || "Cloud speech",
    billing: (id) => prov(id)?.billing || "usd",
    count: () => PROVIDERS.filter((p) => ready(p.id)).length,
    cloneProviders: () => PROVIDERS.filter((p) => p.clone && ready(p.id)),
  };

  function sync() { if (A.S.screen === "app") A.rerender(); }

  const statusBadge = (p) => {
    const s = P(p.id);
    if (!s.enabled) return `<span class="badge">DISABLED</span>`;
    return { none: `<span class="badge">NOT CONFIGURED</span>`, checking: `<span class="badge badge-running">CHECKING</span>`, ok: `<span class="badge badge-success">CONNECTED</span>`, error: `<span class="badge badge-danger">CONNECTION ERROR</span>` }[s.status];
  };
  const msg = (p) => {
    const s = P(p.id);
    if (s.status === "checking") return `<span class="dot dot-running"></span><span class="t-sm">Checking the connection to ${esc(p.name)}…</span>`;
    if (s.status === "ok") return `${ic("check")}<span class="t-sm">Connected successfully · ${s.latency} ms · <span class="mono">${esc(s.at)}</span></span>`;
    if (s.status === "error") return `${ic("alert")}<span class="t-sm">${esc(s.error)}</span>`;
    return `<span class="t-sm t-mute">${s.saved ? "Key saved, not checked yet." : "Enter an API key then click check connection."}</span>`;
  };

  function field(p, f) {
    const id = `sp-${p.id}-${f.id}`;
    const v = fieldVal(p, f);
    if (f.options) return `<div class="field"><label for="${id}">${esc(f.label)}</label><select id="${id}" class="select" data-change="sp-field" data-p="${p.id}" data-f="${f.id}">${LB.api.opts(f.options, v)}</select></div>`;
    return `<div class="field"><label for="${id}">${esc(f.label)}${f.required ? " *" : ""}</label><input id="${id}" class="input ${f.readonly || f.value ? "mono-in" : ""}" value="${esc(v)}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ""} ${f.readonly ? "readonly" : ""} data-change="sp-field" data-p="${p.id}" data-f="${f.id}" autocomplete="off"></div>`;
  }

  function card(p) {
    const s = P(p.id);
    const busy = s.status === "checking";
    return `<article class="spc-card ${s.enabled ? "" : "is-off"}">
      <header class="spc-h">
        <div class="spc-t"><span class="t-ink spc-name">${esc(p.name)}</span>${statusBadge(p)}</div>
        <label class="check spc-on"><input type="checkbox" data-change="sp-enable" data-p="${p.id}" ${s.enabled ? "checked" : ""}><span>Enable</span></label>
      </header>
      <div class="tts-m-meta"><span class="path t-mute">${esc(p.site)}</span><span class="badge badge-primary">TTS</span>${p.clone ? `<span class="badge badge-primary">CLONE VOICE</span>` : `<span class="badge">NO CLONING</span>`}<span class="t-sm t-mute">${esc(p.langs)}</span></div>
      <p class="t-sm t-mute">${esc(p.note)}</p>
      <div class="spc-fields">
        <div class="field spc-key ${p.fields.length ? "" : "is-solo"}"><label for="sp-${p.id}-key">API key</label>
          <div class="spc-keyrow"><input id="sp-${p.id}-key" class="input mono-in" type="password" value="${esc(s.draft || "")}" placeholder="${s.saved ? "•••••••••••• (saved, enter to replace)" : "Paste API key"}" data-on="sp-key" data-p="${p.id}" autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-icon" data-act="sp-eye" data-p="${p.id}" aria-label="Show / hide key" data-tip="Show / hide">${ic("eye")}</button></div></div>
        ${p.fields.map((f) => field(p, f)).join("")}
      </div>
      <div class="spc-foot">
        <div class="spc-msg ${s.status === "ok" ? "is-ok" : s.status === "error" ? "is-err" : ""}">${msg(p)}</div>
        <button class="btn btn-sm btn-primary" data-act="sp-test" data-p="${p.id}" ${busy ? "disabled" : ""}>${ic("refresh")}Save and check</button>
        <button class="btn btn-sm" data-act="sp-clear" data-p="${p.id}" ${s.saved ? "" : "disabled"}>Delete key</button>
      </div>
    </article>`;
  }

  function render() {
    return `<div class="tts">
      <header class="tts-head"><div><h3 class="t-display-xs">Speech providers</h3></div></header>
      <p class="t-sm t-mute">Connect cloud speech services to read and clone voices when not using a Local model. ${LB.speech.count()} / ${PROVIDERS.length} providers connected.</p>
      <div class="spc-note">${ic("lock")}<span>API keys are stored only on this machine, not in the workspace, and do not travel with the project when exported. When you use a provider, the text to read (and the voice sample when cloning) is sent to that provider itself; costs are charged by the provider directly to your account.</span></div>
      <section class="tts-list">${PROVIDERS.map(card).join("")}</section>
      <p class="t-sm t-mute tts-foot">${ic("info")}<span>Prototype: connection checks are simulated, no network calls. A key shorter than 8 characters or starting with “bad” will be rejected so you can see the error state.</span></p>
    </div>`;
  }
  A.SETTINGS_VIEWS.speech = { cls: "modal-xl", render };

  async function test(id) {
    const p = prov(id);
    const s = P(id);
    const key = (s.draft || s.key || "").trim();
    if (!key) { A.toast(`Enter the API key of ${p.name}.`, "warning"); A.$(`#sp-${id}-key`)?.focus(); return; }
    const miss = p.fields.find((f) => f.required && !String(fieldVal(p, f)).trim());
    if (miss) { A.toast(`Enter the ${miss.label} of ${p.name}.`, "warning"); A.$(`#sp-${id}-${miss.id}`)?.focus(); return; }
    s.key = key;
    s.draft = "";
    s.saved = true;
    s.status = "checking";
    A.refreshSettings("speech");
    await sleep(900);
    if (key.length < 8 || /^bad/i.test(key)) {
      s.status = "error";
      s.error = id === "google" ? "400 API_KEY_INVALID: the key is invalid or was revoked in Google AI Studio." : "401 Unauthorized: the API key is invalid or was revoked.";
    } else {
      s.status = "ok";
      s.latency = 120 + (LB.hash(id + key) % 280);
      s.at = A.stamp();
      A.toast(`Connected ${p.name}.`);
    }
    A.refreshSettings("speech");
    sync();
  }
  Object.assign(A.ACT, {
    "sp-test": (el) => test(el.dataset.p),
    "sp-clear": (el) => {
      const s = P(el.dataset.p);
      Object.assign(s, { saved: false, key: "", draft: "", status: "none", error: "" });
      A.refreshSettings("speech");
      A.toast(`Deleted the ${prov(el.dataset.p).name} key.`);
      sync();
    },
    "sp-eye": (el) => { const i = A.$(`#sp-${el.dataset.p}-key`); if (i) i.type = i.type === "password" ? "text" : "password"; },
  });
  Object.assign(A.ON, {
    "sp-key": (el) => { P(el.dataset.p).draft = el.value; },
    "sp-field": (el) => { P(el.dataset.p).fields[el.dataset.f] = el.value.trim(); if (P(el.dataset.p).status === "ok") { P(el.dataset.p).status = "none"; A.refreshSettings("speech"); sync(); } },
    "sp-enable": (el) => { P(el.dataset.p).enabled = el.checked; A.refreshSettings("speech"); sync(); },
  });
})();
