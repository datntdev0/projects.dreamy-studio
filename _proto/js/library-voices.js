(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const API = LB.api;
  const player = LB.player;
  const { esc, ic } = A;
  const CAP = window.DS.CAP["05"];
  const st = () => LB.state;
  const LANGS = [["VI", "Vietnamese"], ["EN", "English"], ["ZH", "Chinese"], ["JA", "Japanese"], ["KO", "Korean"]];
  const ENG = {
    local: { label: "Local TTS", short: "LOCAL", note: "Runs on this machine, no data leaves it." },
    cloud: { label: "Cloud speech", short: "CLOUD", note: "Sends data to the provider." },
  };
  const engLabel = (v) => (v.engine === "cloud" ? LB.speech.name(v.provider) : ENG.local.label);
  const engShort = (v) => (v.engine === "cloud" ? String(LB.speech.name(v.provider)).split(/[ .]/)[0].toUpperCase() : "LOCAL");
  const engNote = (v) => (v.engine === "cloud" ? `Sends data to ${LB.speech.name(v.provider)}.` : ENG.local.note);
  const sendNote = (v, chars) => (LB.speech.billing(v.provider) === "credit" ? `The text above (${chars} characters) will be sent to ${LB.speech.name(v.provider)} · billed to the account’s credits` : `The text above (${chars} characters) will be sent to ${LB.speech.name(v.provider)} · ${money(chars * 0.000016)}`);
  const MIN_SEC = 10;
  const MAX_SEC = 300;
  const SCRIPT = ["Night falls over Harrowmere, and the last lamp on the pier is still burning.", "The lamp keeper does not light the fire for the ships, she said, but for the things still lying under the water.", "I read slowly, every word clear, pausing a beat after each full stop."];

  const voices = () => st().voices;
  const voice = (id) => voices().find((v) => v.id === id);
  const usable = (v) => v && v.status === "ready" && (v.engine === "cloud" ? LB.speech.ready(v.provider) : LB.tts.localOk(v));
  const whyNot = (v) => (v.status === "failed" ? "Clone failed" : v.status === "processing" ? "Processing" : v.engine === "local" && !LB.tts.localOk(v) ? (LB.tts.backendOk() ? `Requires installing the ${LB.tts.familyName(v.family)} model` : "Python backend is off") : v.engine === "cloud" && !LB.speech.ready(v.provider) ? `Requires connecting ${LB.speech.name(v.provider)}` : "");
  const initial = (v) => String(v.name).trim().charAt(0).toUpperCase() || "?";
  const avatar = (v, cls = "") => `<span class="vc-av tone-${LB.hash(v.name) % 4} ${cls}" aria-hidden="true">${esc(initial(v))}</span>`;
  const sampleText = (lang) => (lang === "VI" ? LB.sample.vi : LB.sample.en);
  const langName = (c) => LANGS.find((l) => l[0] === c)?.[1] || c;
  const money = (n) => `≈ $${n.toFixed(4)}`;

  function vc() {
    const u = API.ui("vc");
    if (!u.init) {
      const first = voices().find(usable) || voices().find((v) => v.status === "ready");
      Object.assign(u, { init: true, filter: "all", pick: first?.id || null, speed: 1, auto: true, gen: null, text: sampleText(first?.lang || "VI") });
    }
    return u;
  }
  const filtered = () => {
    const u = vc();
    const needle = (u.q || "").trim().toLowerCase();
    return voices().filter((v) => (u.filter === "all" || v.kind === u.filter) && (!needle || `${v.name} ${v.style} ${v.lang} ${v.gender}`.toLowerCase().includes(needle)));
  };
  const cloneJob = (v) => A.PL.list.find((p) => p.kind === "voice-clone" && p.status === "running" && p.tasks.some((t) => t.key === v.id));

  function statusCell(v) {
    if (v.status === "processing") {
      const p = cloneJob(v);
      return `<div class="vc-prog"><div class="progress" data-prog="${p?.id || ""}"><i style="width:${p?.progress || 0}%"></i></div><span class="mono t-mute" data-prog-text="${p?.id || ""}">${p?.progress || 0}%</span></div>`;
    }
    if (v.status === "failed") return `<span class="badge badge-danger">ERROR</span>`;
    if (!usable(v)) return `<span class="badge badge-warning" data-tip="${esc(whyNot(v))}">${v.engine === "cloud" ? "NOT CONNECTED" : LB.tts.backendOk() ? "MODEL REQUIRED" : "BACKEND OFF"}</span>`;
    return `<span class="dot dot-success"></span><span class="t-sm"> Ready</span>`;
  }

  function engineStrip() {
    const n = LB.tts.count();
    const up = LB.tts.backendOk();
    const c = LB.speech.count();
    return `<div class="vc-strip">
      <span class="vc-eng ${n ? "is-ok" : "is-warn"}"><span class="dot ${n ? "dot-success" : "dot-warning"}"></span><b>Local TTS</b><span class="t-mute">${!up ? "Backend is off" : n ? `${n} models ready` : "No model installed"}</span></span>
      <span class="vc-eng ${c ? "is-ok" : "is-warn"}"><span class="dot ${c ? "dot-success" : "dot-warning"}"></span><b>Cloud speech</b><span class="t-mute">${c ? `${c} providers connected` : "No provider connected"}</span></span>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-act="settings" data-v="tts">${ic("settings")}${n ? "Local TTS models" : "Install TTS model"}</button>
      <button class="btn btn-sm" data-act="settings" data-v="speech">${ic("cloud")}Speech providers</button></div>`;
  }

  function dock() {
    const u = vc();
    const v = voice(u.pick);
    const ok = usable(v);
    const eng = v ? { note: engNote(v) } : null;
    const g = u.gen;
    const chars = u.text.length;
    const note = !v ? "Choose a voice in the list above to preview it." : !ok ? `${esc(whyNot(v))}.${v.status === "ready" ? ` <a data-act="settings" data-v="${v.engine === "local" ? (LB.tts.backendOk() ? "tts" : "backend") : "speech"}" tabindex="0">Open Settings → ${v.engine === "local" ? (LB.tts.backendOk() ? "Local TTS models" : "Python backend") : "Speech providers"}</a>` : ""}` : v.engine === "cloud" ? sendNote(v, chars) : eng.note;
    const result = g?.state === "gen"
      ? `<div class="vc-result is-gen"><span class="dot dot-running"></span><span class="t-sm">Generating voice…</span></div>`
      : g?.state === "ready"
        ? `<div class="vc-result">${`<button type="button" class="lb-pbtn is-lg" data-act="lb-play" data-lb-play="pv" data-id="pv" aria-label="Play">${ic("play")}</button>`}
            ${API.scroller({ id: "pv", seed: g.seed, meta: { dur: g.dur } }, 5)}<span class="mono lb-dur" data-lb-time="pv" data-d="${g.dur}">${LB.dur(g.dur)}</span></div>
            <div class="t-sm t-mute">${esc(voice(g.voice)?.name || "")} · speed ${g.speed}× · ${g.chars} characters</div>`
        : `<div class="vc-result is-idle t-sm t-mute">Click “Preview” to generate a short preview with the selected voice.</div>`;
    return `<div class="vc-dock">
      <div class="vc-dock-l">
        <div class="vc-dock-row">
          <div class="vc-cur">${v ? `${avatar(v)}<div class="vc-cur-b"><div class="t-ink">${esc(v.name)}</div><div class="row-badges"><span class="badge">${esc(v.lang)}</span><span class="badge ${v.kind === "cloned" ? "badge-primary" : ""}">${v.kind === "cloned" ? "CLONED" : "DEFAULT"}</span><span class="badge">${ENG[v.engine].short}</span></div></div>` : `<span class="t-sm t-mute">No voice selected</span>`}</div>
          <div class="field"><label>Speed</label>${API.seg("vc-speed", [[0.9, "0.9×"], [1, "1×"], [1.1, "1.1×"], [1.25, "1.25×"]], u.speed)}</div>
          <button class="btn btn-primary vc-go" data-act="vc-gen" ${ok && g?.state !== "gen" ? "" : "disabled"}>${ic("play")}Preview</button></div>
        <div class="field"><label for="vc-text">Sample text</label><textarea id="vc-text" class="textarea" rows="2" data-on="vc-text">${esc(u.text)}</textarea>
          <span class="field-hint ${ok || !v ? "" : "vc-warn"}" id="vc-note">${note}</span></div>
      </div>
      <div class="vc-dock-r"><span class="eyebrow">Preview result</span>${result}</div></div>`;
  }

  function voicesView() {
    const u = vc();
    const list = filtered();
    const rows = list.map((v) => `<tr tabindex="0" data-act="vc-sel" data-id="${v.id}" class="${u.pick === v.id ? "is-selected" : ""} ${v.status === "failed" ? "is-muted" : ""}">
        <td><div class="nm-title">${avatar(v)}<div><div class="t-ink">${esc(v.name)}</div><div class="t-sm t-mute">${esc(v.style)}</div></div></div></td>
        <td><span class="badge">${esc(v.lang)}</span></td><td>${esc(v.gender)}</td>
        <td><span class="badge ${v.kind === "cloned" ? "badge-primary" : ""}">${v.kind === "cloned" ? "CLONED" : "DEFAULT"}</span></td>
        <td class="mono t-mute">${esc(engShort(v))}</td><td class="vc-st">${statusCell(v)}</td>
        <td class="row-actions">${v.status === "ready" ? `<button class="btn btn-sm" data-act="vc-try" data-id="${v.id}" ${usable(v) ? "" : "disabled"} data-tip="${usable(v) ? "Preview this voice" : esc(whyNot(v))}">${ic("play")}Preview</button>` : ""}</td></tr>`).join("");
    return `<div class="nv lb">
      ${API.bar(
        `<label class="search"><span class="sr-only">Find a voice</span><input id="vc-q" class="input" type="search" value="${esc(u.q || "")}" placeholder="Search by name, language…" data-on="vc-q"></label><span class="t-sm t-mute">${list.length} voices</span>`,
        `${API.seg("vc-filter", [["all", "All"], ["default", "Default"], ["cloned", "Cloned"]], u.filter)}<button class="btn btn-sm btn-primary" data-act="vc-clone">${ic("mic")}Clone voice</button>`)}
      ${engineStrip()}
      <div class="nv-body is-col"><div class="nv-scroll" data-keep="vc">${list.length ? `<table class="table"><thead><tr><th>Voice</th><th>Language</th><th>Gender</th><th>Source</th><th>Engine</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : API.emptyBox(u.filter === "cloned" && !u.q ? "No voices have been cloned yet" : "No voices match", u.filter === "cloned" && !u.q ? "Clone a voice from a clean audio clip (10 seconds to 5 minutes) or record yourself in the app." : "Try another keyword or change the filters.", u.filter === "cloned" && !u.q ? `<button class="btn btn-primary" data-act="vc-clone">${ic("mic")}Clone voice</button>` : "")}</div>
        ${dock()}</div></div>`;
  }

  function voicesInspector() {
    const v = voice(vc().pick);
    if (!v) {
      const cl = voices().filter((x) => x.kind === "cloned");
      return `${API.insSec("Voice library", API.kv([["Default voices", voices().filter((x) => x.kind === "default").length], ["Cloned", cl.length], ["Local TTS", LB.tts.count() ? `<span class="badge badge-success">${LB.tts.count()} MODELS</span>` : `<span class="badge badge-warning">NOT INSTALLED</span>`], ["Cloud speech", LB.speech.count() ? `<span class="badge badge-success">${LB.speech.count()} PROVIDER</span>` : `<span class="badge badge-warning">NOT CONNECTED</span>`]]))}
        <section class="ins-sec"><span class="eyebrow">Clone voice</span><p class="t-sm t-mute">Create your own voice from a clean audio clip or by recording. Only clone your own voice or a voice you have the right to use.</p><button class="btn btn-block btn-primary" data-act="vc-clone">${ic("mic")}Clone voice…</button></section>
        <section class="ins-sec"><span class="eyebrow">Choose a voice</span><p class="t-sm t-mute">Choose a voice in the list to see details, preview and manage it.</p></section>`;
    }
    const src = v.src ? `<div class="lb-ins-wave">${`<button type="button" class="lb-pbtn" data-act="lb-play" data-lb-play="vs:${v.id}" data-id="vs:${v.id}" aria-label="Play">${ic("play")}</button>`}${API.scroller({ id: `vs:${v.id}`, seed: v.id, meta: { dur: v.src.dur } }, 5)}<span class="mono lb-dur" data-lb-time="vs:${v.id}" data-d="${v.src.dur}">${LB.dur(v.src.dur)}</span></div>` : "";
    return `<section class="ins-sec vc-hero">${avatar(v, "is-lg")}<div class="vc-hero-b"><div class="ins-hero-t">${esc(v.name)}</div>
        <div class="row-badges"><span class="badge">${esc(v.lang)}</span><span class="badge ${v.kind === "cloned" ? "badge-primary" : ""}">${v.kind === "cloned" ? "CLONED" : "DEFAULT"}</span><span class="badge">${esc(engShort(v))}</span></div>
        <div class="t-sm t-mute">${esc(v.style)}</div></div></section>
      ${v.status === "failed" ? `<section class="ins-sec"><div class="ld-warn">${ic("alert")}<span>${esc(v.error || "Clone was unsuccessful.")}</span></div><button class="btn btn-block" data-act="vc-retry" data-id="${v.id}">${ic("refresh")}Clone again with another sample</button></section>` : ""}
      ${v.kind === "cloned" ? `<section class="ins-sec ins-form"><div class="field"><label for="vc-f-name">Name</label><input id="vc-f-name" class="input" value="${esc(v.name)}" data-change="vc-edit" data-id="${v.id}" data-f="name" autocomplete="off"></div>
        <div class="field"><label for="vc-f-desc">Description</label><textarea id="vc-f-desc" class="textarea" rows="3" data-change="vc-edit" data-id="${v.id}" data-f="desc">${esc(v.desc || "")}</textarea></div></section>` : ""}
      ${API.insSec("Information", API.kv([["Language", esc(langName(v.lang))], ["Gender", esc(v.gender)], ["Engine", `${esc(engLabel(v))}<div class="t-sm t-mute">${esc(engNote(v))}</div>`], ...(v.engine === "local" ? [["Model", esc(v.modelName || LB.tts.familyName(v.family))]] : []), ["Status", v.status === "ready" ? (usable(v) ? "Ready" : esc(whyNot(v))) : v.status === "processing" ? "Processing" : "Error"], ...(v.kind === "cloned" ? [["Created at", `<span class="mono">${esc(v.created)}</span>`]] : [])]))}
      ${v.src ? `<section class="ins-sec"><span class="eyebrow">Original sample · ${v.src.type === "record" ? "recording" : esc(v.src.name)}</span>${src}</section>` : ""}
      <section class="ins-sec ins-actions">${v.status === "ready" ? `<button class="btn" data-act="vc-try" data-id="${v.id}" ${usable(v) ? "" : "disabled"}>${ic("play")}Preview</button>` : ""}${v.kind === "cloned" ? `<button class="btn btn-danger" data-act="vc-del" data-id="${v.id}">${ic("trash")}Delete</button>` : ""}</section>`;
  }

  A.VIEWS.voices = { fill: true, render: voicesView, inspector: voicesInspector, mount: () => player.paint() };

  player.resolvers.push((id) => {
    const u = vc();
    if (id === "pv") return u.gen?.dur ? { dur: u.gen.dur } : null;
    if (id === "vs:rec") return CL.rec.sec ? { dur: CL.rec.sec } : null;
    if (id === "vs:file") return CL.file?.dur ? { dur: CL.file.dur, url: CL.file.url } : null;
    if (id.startsWith("vs:")) { const v = voice(id.slice(3)); return v?.src ? { dur: v.src.dur } : null; }
    return null;
  });

  function pickVoice(id) {
    const u = vc();
    const v = voice(id);
    if (u.pick !== id) {
      u.pick = id;
      if (u.auto && v) u.text = sampleText(v.lang);
      u.gen = null;
      player.stop();
    }
  }
  function generate() {
    const u = vc();
    const v = voice(u.pick);
    if (!usable(v)) { A.toast(v ? `${whyNot(v)}.` : "Choose a voice to preview.", "warning"); return; }
    if (!u.text.trim()) { A.toast("Enter the text to preview.", "warning"); return; }
    player.stop();
    const text = u.text.trim();
    u.gen = { state: "gen" };
    A.rerender();
    const token = (u.token = (u.token || 0) + 1);
    setTimeout(() => {
      if (token !== u.token || u.gen?.state !== "gen") return;
      const dur = Math.max(2, Math.min(40, Math.round(text.length / (13 * u.speed))));
      u.gen = { state: "ready", voice: v.id, speed: u.speed, chars: text.length, dur, seed: `${v.id}|${text}|${u.speed}` };
      A.rerender();
      player.toggle("pv", { dur });
    }, 900);
  }

  const CL = { mode: "file", file: null, lib: "", rec: { state: "idle", sec: 0, timer: null }, name: "", lang: "VI", desc: "", engine: "local", model: "", provider: "", consent: false, replace: "" };

  const sampleDur = () => (CL.mode === "record" ? CL.rec.sec : CL.file?.dur ?? 0);
  const sampleReady = () => (CL.mode === "record" ? CL.rec.state === "done" : !!CL.file);
  function sampleIssue() {
    if (!sampleReady()) return CL.mode === "record" ? "Not recorded" : "No sample selected";
    const d = sampleDur();
    if (d && d < MIN_SEC) return `Sample too short (${LB.dur(d)}, at least ${MIN_SEC} seconds required)`;
    if (d > MAX_SEC) return `Sample too long (${LB.dur(d)}, at most ${LB.dur(MAX_SEC)})`;
    return "";
  }
  const nameTaken = () => voices().some((v) => v.id !== CL.replace && v.name.toLowerCase() === CL.name.trim().toLowerCase());
  const engineOk = () => (CL.engine === "cloud" ? !!CL.provider : !!CL.model);
  function missing() {
    const m = [];
    if (sampleIssue()) m.push(sampleIssue());
    if (!CL.name.trim()) m.push("Enter a voice name");
    else if (nameTaken()) m.push("Voice name already exists");
    if (!engineOk()) m.push(CL.engine === "cloud" ? "No cloud provider supports cloning yet, connect one in Settings" : "No Local model supports cloning yet, choose Cloud or install a model");
    if (!CL.consent) m.push("Confirm the right to use this voice");
    return m;
  }
  function syncClone() {
    const m = missing();
    const b = A.$('#layer [data-act="vc-clone-submit"]');
    if (b) b.disabled = m.length > 0;
    const hint = A.$("#vcl-missing");
    if (hint) { hint.textContent = m.length ? `Missing: ${m.join("; ")}.` : ""; hint.hidden = !m.length; }
  }
  const aliveCl = () => !!A.$("#layer .modal.vcl");

  function sampleBlock() {
    if (CL.mode === "record") {
      const r = CL.rec;
      const t = `${String(Math.floor(r.sec / 60)).padStart(2, "0")}:${String(r.sec % 60).padStart(2, "0")}`;
      return `<div class="vc-script"><span class="eyebrow">Read the following passage in a natural voice</span>${SCRIPT.map((s) => `<p>${esc(s)}</p>`).join("")}</div>
        <div class="vc-rec">
          ${r.state === "recording"
            ? `<button class="btn btn-danger" data-act="vc-rec-stop">${ic("stop")}Stop</button><span class="vc-rec-t mono" id="vc-rec-t"><span class="dot dot-danger"></span> ${t}</span><span class="vc-meter" id="vc-meter">${Array.from({ length: 24 }, () => "<i></i>").join("")}</span>`
            : r.state === "done"
              ? `<button type="button" class="lb-pbtn" data-act="lb-play" data-lb-play="vs:rec" data-id="vs:rec" aria-label="Play">${ic("play")}</button><span class="mono lb-dur" data-lb-time="vs:rec" data-d="${r.sec}">${LB.dur(r.sec)}</span><span class="t-sm t-mute">Recorded ${t}</span><span class="spacer"></span><button class="btn btn-sm" data-act="vc-rec-start">${ic("refresh")}Record again</button>`
              : `<button class="btn btn-primary" data-act="vc-rec-start">${ic("record")}Start recording</button><span class="t-sm t-mute">Record in a quiet place, at least ${MIN_SEC} seconds.</span>`}
        </div>
        <span class="field-hint">Prototype: recording is simulated; the real app will ask for microphone permission.</span>`;
    }
    const f = CL.file;
    const lib = st().assets.filter((x) => x.type === "sound" && x.meta?.dur);
    return `<div class="lb-drop ${f ? "is-compact" : ""}" role="group" aria-label="Audio file drop area">
        ${f ? `<div class="lbu-fn">${ic("music")}<div class="lb-rname"><div class="t-ink lbu-name">${esc(f.name)}</div><div class="t-sm t-mute">${LB.bytes(f.size)}${f.dur ? ` · ${LB.dur(f.dur)}` : " · reading duration…"}${f.lib ? " · from the Sounds library" : ""}</div></div>
          ${f.dur ? `<button type="button" class="lb-pbtn is-sm" data-act="lb-play" data-lb-play="vs:file" data-id="vs:file" aria-label="Play">${ic("play")}</button>` : ""}
          <button class="btn btn-sm btn-ghost" data-act="vc-file-clear">${ic("x")}Deselect</button></div>`
          : `${ic("upload", "lb-drop-ic")}<div class="lb-drop-t">Drag and drop an audio file here</div><div class="t-sm t-mute">or</div>
            <div class="lb-drop-act"><label class="btn">Choose files…<input type="file" hidden accept=".wav,.mp3,.m4a,.flac,.ogg" data-change="vc-file"></label></div><div class="t-sm t-mute">WAV, MP3, M4A, FLAC, OGG · ${MIN_SEC} seconds to ${LB.dur(MAX_SEC)} · up to 50 MB</div>`}</div>
      ${f ? "" : `<div class="form-2"><div class="field"><label for="vcl-lib">Or choose from the Sounds library</label><select id="vcl-lib" class="select" data-on="vc-lib"><option value="">Choose a sound…</option>${lib.map((x) => `<option value="${x.id}">${esc(x.name)} · ${LB.dur(x.meta.dur)}</option>`).join("")}</select></div>
        <div class="field"><label>&nbsp;</label><span class="field-hint">No file yet? <a data-act="vc-sample" tabindex="0">Use the sample file</a> to try quickly.</span></div></div>`}`;
  }

  function drawClone() {
    const issue = sampleIssue();
    const m = missing();
    const localModels = LB.tts.cloneModels();
    const cloudProv = LB.speech.cloneProviders();
    const eng = (id, title, text, disabled) => `<label class="opt ${CL.engine === id ? "is-on" : ""}"><input type="radio" name="vcl-eng" ${CL.engine === id ? "checked" : ""} ${disabled ? "disabled" : ""} data-on="vc-eng" data-v="${id}"><span class="opt-b"><span class="t-ink">${title}</span><span class="t-sm t-mute">${text}</span></span></label>`;
    A.modal({
      title: CL.replace ? "Clone the voice again" : "Clone voice", eyebrow: CAP, cls: "modal-lg vcl",
      body: `<div class="field"><span class="eyebrow">1 · Voice sample</span>${API.seg("vc-mode", [["file", `${ic("upload")}From audio file`], ["record", `${ic("mic")}Live recording`]], CL.mode)}</div>
        ${sampleBlock()}
        ${issue && sampleReady() ? `<p class="field-err">${esc(issue)}.</p>` : ""}
        <div class="field"><span class="eyebrow">2 · Voice information</span></div>
        <div class="form-2"><div class="field"><label for="vcl-name">Voice name</label><input id="vcl-name" class="input" value="${esc(CL.name)}" placeholder="Example: My voice" data-on="vc-f" data-f="name" autocomplete="off"></div>
          <div class="field"><label for="vcl-lang">Sample language</label><select id="vcl-lang" class="select" data-on="vc-f" data-f="lang">${API.opts(LANGS, CL.lang)}</select></div></div>
        <div class="field"><label for="vcl-desc">Description</label><input id="vcl-desc" class="input" value="${esc(CL.desc)}" placeholder="Optional, e.g. for the narration part" data-on="vc-f" data-f="desc" autocomplete="off"></div>
        <div class="field"><span class="eyebrow">3 · Where to process</span><div class="opts">
          ${eng("local", "Local TTS", localModels.length ? "The voice sample is processed on this machine and not sent out." : "No model supports cloning yet (VieNeu-TTS, OmniVoice). Install one in Settings to use it.", !localModels.length)}
          ${CL.engine === "local" && localModels.length ? `<div class="field vc-model"><label for="vcl-model">Clone model</label><select id="vcl-model" class="select" data-on="vc-model">${localModels.map((x) => `<option value="${x.id}" ${x.id === CL.model ? "selected" : ""}>${esc(x.name)}${x.design ? " · has voice design" : ""}</option>`).join("")}</select></div>` : ""}
          ${localModels.length ? "" : `<button class="btn btn-sm vc-model-link" data-act="settings" data-v="tts">${ic("settings")}Open Local TTS models</button>`}
          ${eng("cloud", "Cloud speech", cloudProv.length ? "Your voice sample will be sent to the provider you choose to create the cloned voice." : "No cloning-capable provider is connected (ElevenLabs, VieNeu.io). Connect one in Settings to use it.", !cloudProv.length)}
          ${CL.engine === "cloud" && cloudProv.length ? `<div class="field vc-model"><label for="vcl-prov">Provider</label><select id="vcl-prov" class="select" data-on="vc-prov">${cloudProv.map((x) => `<option value="${x.id}" ${x.id === CL.provider ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>` : ""}
          ${cloudProv.length ? "" : `<button class="btn btn-sm vc-model-link" data-act="settings" data-v="speech">${ic("cloud")}Open Speech providers</button>`}</div></div>
        <label class="check"><input type="checkbox" data-on="vc-consent" ${CL.consent ? "checked" : ""}><span>This is my own voice, or I have the consent and legal right to create a copy of this voice. I will not use a cloned voice to impersonate others.</span></label>
        <p class="field-err" id="vcl-missing" ${m.length ? "" : "hidden"}>${m.length ? `Missing: ${esc(m.join("; "))}.` : ""}</p>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><span class="spacer"></span><button class="btn btn-primary" data-act="vc-clone-submit" ${m.length ? "disabled" : ""}>${ic("mic")}Clone voice</button>`,
    });
    player.paint();
  }
  function openClone(o = {}) {
    stopRec();
    player.stop();
    Object.assign(CL, { mode: "file", file: null, lib: "", rec: { state: "idle", sec: 0, timer: null }, name: o.name || "", lang: o.lang || "VI", desc: "", engine: LB.tts.cloneModels().length || !LB.speech.cloneProviders().length ? "local" : "cloud", model: LB.tts.cloneModels()[0]?.id || "", provider: LB.speech.cloneProviders()[0]?.id || "", consent: false, replace: o.replace || "" });
    drawClone();
  }

  function stopRec() { clearInterval(CL.rec.timer); CL.rec.timer = null; }
  function startRec() {
    stopRec();
    player.stop();
    CL.rec = { state: "recording", sec: 0, timer: null };
    drawClone();
    CL.rec.timer = setInterval(() => {
      if (!aliveCl() || CL.rec.state !== "recording") { stopRec(); return; }
      CL.rec.tick = (CL.rec.tick || 0) + 1;
      if (CL.rec.tick % 5 === 0) CL.rec.sec++;
      const t = A.$("#vc-rec-t");
      if (t) t.innerHTML = `<span class="dot dot-danger"></span> ${String(Math.floor(CL.rec.sec / 60)).padStart(2, "0")}:${String(CL.rec.sec % 60).padStart(2, "0")}`;
      A.$$("#vc-meter i").forEach((b) => { b.style.height = `${14 + Math.random() * 86}%`; });
      if (CL.rec.sec >= MAX_SEC) { CL.rec.state = "done"; stopRec(); drawClone(); }
    }, 200);
  }

  function setFile(file) {
    CL.file = file;
    drawClone();
    if (file.real && !file.dur) {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => { if (CL.file === file) { file.dur = Math.round(a.duration) || 0; if (aliveCl()) drawClone(); } };
      a.onerror = () => { if (CL.file === file) { file.dur = 0; A.toast("Could not read this audio file.", "warning"); CL.file = null; if (aliveCl()) drawClone(); } };
      a.src = file.url;
    }
  }

  function submitClone() {
    if (missing().length) return;
    const id = `VOC-${String(++st().seq.voice).padStart(2, "0")}`;
    const rec = CL.mode === "record";
    const v = {
      id, name: CL.name.trim(), kind: "cloned", provider: CL.engine === "cloud" ? CL.provider : "", family: CL.engine === "local" ? LB.tts.CATALOG.find((x) => x.id === CL.model)?.family : "", modelName: CL.engine === "local" ? LB.tts.CATALOG.find((x) => x.id === CL.model)?.name : "", lang: CL.lang, gender: "—", style: rec ? "Live recording" : "From audio file", engine: CL.engine, status: "processing", created: A.stamp(), desc: CL.desc.trim(),
      src: { type: rec ? "record" : "file", name: rec ? "Recording" : CL.file.name, dur: sampleDur() || 30 },
    };
    if (CL.replace) st().voices = voices().filter((x) => x.id !== CL.replace);
    voices().push(v);
    stopRec();
    A.closeModal();
    const u = vc();
    u.pick = id;
    u.filter = u.filter === "default" ? "all" : u.filter;
    A.startPipeline({
      kind: "voice-clone", label: `Clone voice: ${v.name}`, detail: `${engLabel(v)} · ${LB.dur(v.src.dur)} sample`,
      tasks: [{ key: id, label: "Process sample" }, { key: `${id}-b`, label: "Extract voice features" }, { key: `${id}-c`, label: "Quality check" }],
      onDone: () => { v.status = "ready"; },
      onCancel: () => { v.status = "failed"; v.error = "You cancelled cloning this voice."; },
    });
    A.rerender();
  }

  let pendingDel = "";
  function openDelete(id) {
    const v = voice(id);
    if (!v) return;
    pendingDel = id;
    A.modal({
      title: "Delete cloned voice", eyebrow: CAP,
      body: `<div class="del-row">${avatar(v, "is-md")}<div><div class="t-ink">${esc(v.name)}</div><div class="t-sm t-mute">${esc(v.lang)} · ${esc(engLabel(v))}</div></div></div>
        <div class="ld-warn">${ic("alert")}<span>The voice data and original sample will be deleted from the folder <span class="path">library\\voices\\</span>. Audio already generated with this voice is not affected. This cannot be undone.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-danger" data-act="vc-del-confirm">${ic("trash")}Delete voice</button>`,
    });
  }

  Object.assign(A.ACT, {
    "vc-sel": (el) => { pickVoice(el.dataset.id); A.rerender(); },
    "vc-try": (el, e) => { e?.stopPropagation(); pickVoice(el.dataset.id); generate(); },
    "vc-filter": (el) => { vc().filter = el.dataset.v; A.rerender(); },
    "vc-speed": (el) => { const u = vc(); u.speed = +el.dataset.v; u.gen = null; player.stop(); A.rerender(); },
    "vc-gen": generate,
    "vc-clone": () => openClone(),
    "vc-retry": (el) => { const v = voice(el.dataset.id); openClone({ name: v?.name, lang: v?.lang, replace: v?.id }); },
    "vc-mode": (el) => { if (CL.mode === el.dataset.v) return; stopRec(); player.stop(); CL.mode = el.dataset.v; drawClone(); },
    "vc-rec-start": startRec,
    "vc-rec-stop": () => { stopRec(); CL.rec.state = CL.rec.sec ? "done" : "idle"; if (!CL.rec.sec) A.toast("The recording is too short, please try again.", "warning"); drawClone(); },
    "vc-file-clear": () => { player.stop(); CL.file = null; drawClone(); },
    "vc-sample": () => setFile({ name: "narrator-sample-warm.wav", size: 7.1 * LB.MB, dur: 42, fake: true }),
    "vc-clone-submit": submitClone,
    "vc-del": (el) => openDelete(el.dataset.id),
    "vc-del-confirm": () => {
      const v = voice(pendingDel);
      st().voices = voices().filter((x) => x.id !== pendingDel);
      const u = vc();
      if (u.pick === pendingDel) { u.pick = voices().find(usable)?.id || null; u.gen = null; player.stop(); }
      pendingDel = "";
      A.closeModal();
      A.rerender();
      A.toast(`Deleted voice “${v?.name}”.`);
    },
  });
  Object.assign(A.ON, {
    "vc-q": (el) => { vc().q = el.value; A.rerender(); },
    "vc-text": (el) => {
      const u = vc();
      u.text = el.value;
      u.auto = false;
      const v = voice(u.pick);
      const note = A.$("#vc-note");
      if (note && v && usable(v)) note.textContent = v.engine === "cloud" ? sendNote(v, el.value.length) : ENG.local.note;
      if (u.gen) { u.gen = null; player.stop(); A.rerender(); }
    },
    "vc-f": (el) => { CL[el.dataset.f] = el.value; syncClone(); },
    "vc-eng": (el) => { CL.engine = el.dataset.v; drawClone(); },
    "vc-model": (el) => { CL.model = el.value; syncClone(); },
    "vc-prov": (el) => { CL.provider = el.value; syncClone(); },
    "vc-consent": (el) => { CL.consent = el.checked; syncClone(); },
    "vc-lib": (el) => {
      const x = API.byId(el.value);
      el.value = "";
      if (x) setFile({ name: x.name, size: x.size, dur: x.meta.dur, url: x.url || "", fake: !x.url, lib: true });
    },
    "vc-file": (el) => {
      const f = el.files[0];
      el.value = "";
      if (!f) return;
      if (!/\.(wav|mp3|m4a|flac|ogg)$/i.test(f.name)) { A.toast("Only WAV, MP3, M4A, FLAC or OGG files are accepted.", "warning"); return; }
      if (f.size > 50 * LB.MB) { A.toast("The file is larger than 50 MB.", "warning"); return; }
      setFile({ name: f.name, size: f.size, dur: 0, real: true, url: URL.createObjectURL(f) });
    },
    "vc-edit": (el) => {
      const v = voice(el.dataset.id);
      const val = el.value.trim();
      if (el.dataset.f === "name") {
        if (!val) { el.value = v.name; A.toast("The voice name cannot be empty.", "warning"); return; }
        if (voices().some((x) => x.id !== v.id && x.name.toLowerCase() === val.toLowerCase())) { el.value = v.name; A.toast("A voice with this name already exists.", "warning"); return; }
        v.name = val;
      } else v.desc = val;
      A.rerender();
    },
  });

  const zone = (e) => (A.$("#layer .modal.vcl") && CL.mode === "file" && !CL.file ? e.target.closest?.(".lb-drop") : null);
  const isFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  document.addEventListener("dragover", (e) => { const z = isFiles(e) && zone(e); if (z) { e.preventDefault(); z.classList.add("is-over"); } });
  document.addEventListener("dragleave", (e) => { const z = zone(e); if (z && !z.contains(e.relatedTarget)) z.classList.remove("is-over"); });
  document.addEventListener("drop", (e) => {
    const z = zone(e);
    if (!z) return;
    e.preventDefault();
    z.classList.remove("is-over");
    const f = e.dataTransfer?.files?.[0];
    if (f) A.ON["vc-file"]({ files: [f], set value(_) {} });
  });
})();
