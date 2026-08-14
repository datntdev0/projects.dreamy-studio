(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const SC = window.SC;
  const AB = window.AB;
  const U = window.NVU;
  const LB = window.LB;
  const { esc, ic } = A;
  const T = SC.TYPES;

  const byP = (id) => PJ.state.projects.find((p) => p.id === id);
  const ui = (pid) => (AB.ui[pid] ||= { unit: null, view: "prod", sel: null, filter: "all", test: "", goto: null });
  const dur = (sec) => LB.dur(Math.round(sec));
  const pad = (n) => String(n).padStart(2, "0");
  const spkClass = (sp) => (window.SCR ? window.SCR.spkClass(sp) : "spk-x");
  const esc2 = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const STATE = { none: ["NOT GENERATED", ""], running: ["GENERATING", "badge-running"], done: ["GENERATED", "badge-success"], stale: ["NEEDS REGENERATION", "badge-warning"], flag: ["FAILED", "badge-danger"] };
  const stBadge = (st) => `<span class="badge ${STATE[st][1]}">${STATE[st][0]}</span>`;
  const UNIT_MARK = { done: ["is-ok", "check-circle", "Audio generated"], stale: ["is-warn", "alert", "Needs review"], doing: ["is-run", "", "In progress"], none: ["", "", "Not generated"] };

  function ctx(p) {
    const s = SC.scriptOf(p);
    SC.syncCast(p, s);
    const bk = AB.book(p);
    const x = ui(p.id);
    let u = s.units.find((q) => q.id === x.unit);
    if (!u) {
      const stat = (q) => AB.unitStat(s, bk, q).st;
      u = s.units.find((q) => q.blocks && stat(q) !== "done") || s.units.find((q) => q.blocks) || s.units[0];
      x.unit = u.id;
    }
    return { p, s, bk, x, u, rec: AB.rec(bk, u), locked: u.status === "locked" };
  }
  const activeCtx = () => {
    const id = A.S.active;
    if (!/^pmod:[^:]+:audiobook$/.test(id)) return null;
    const p = byP(String(id).split(":")[1]);
    return p ? ctx(p) : null;
  };
  const running = (c) => {
    const set = new Set();
    A.PL.list.forEach((pl) => {
      if (pl.kind === "audio" && pl.status === "running") pl.tasks.forEach((t) => { const [pid, uid, bid] = t.key.split("|"); if (t.status !== "done" && pid === c.p.id && uid === c.u.id) set.add(bid); });
    });
    return set;
  };
  const todo = (c) => AB.voiced(c.u).filter((b) => AB.segState(c.bk, c.s, c.u, b).st !== "done");
  const useCount = (s, sp) => s.units.reduce((a, u) => a + (u.blocks || []).filter((b) => (sp.kind === "narrator" ? ["heading", "narration"].includes(b.type) : b.type === "dialogue" && b.who === sp.id)).length, 0);
  const refresh = () => A.rerender();

  function hl(bk, text) {
    const terms = AB.hits(bk, text);
    if (!terms.length) return esc(text);
    const re = new RegExp(`(${terms.map((l) => esc2(l.term)).join("|")})`, "g");
    return text.split(re).map((part, i) => {
      const l = i % 2 ? terms.find((x) => x.term === part) : null;
      return l ? `<mark class="ab-hit" title="Read as: ${esc(l.say)}">${esc(part)}</mark>` : esc(part);
    }).join("");
  }

  function rail(c) {
    const { s, bk, u: cur } = c;
    const stats = s.units.map((q) => AB.unitStat(s, bk, q));
    const done = stats.filter((x) => x.st === "done").length;
    const rows = s.units.map((q, i) => {
      const st = stats[i];
      const [cls, icon, tip] = UNIT_MARK[st.st];
      const meta = st.meta ? tip : st.total ? `${st.done}/${st.total} segments · ${dur(st.dur)}` : "No content yet";
      const mark = icon ? `<span class="sc-mk ${cls}" title="${tip}">${ic(icon)}</span>` : st.st === "doing" ? `<span class="dot dot-running" title="${tip}"></span>` : `<span class="dot-o" title="${tip}"></span>`;
      return `<div class="sc-unit ${q.id === cur.id ? "is-active" : ""}" data-testid="ab-unit-${q.id}" tabindex="0" role="treeitem" data-act="ab-unit" data-id="${q.id}">
        <span class="sc-un mono">${pad(q.no)}</span>
        <div class="sc-ub"><div class="t-ink ellip">${esc(q.title || `${s.cfg.unit} ${q.no}`)}</div><div class="t-sm t-mute ellip">${meta}</div></div>
        ${q.status !== "locked" ? `<span class="sc-mk" title="Script not locked">${ic("unlock")}</span>` : ""}${mark}</div>`;
    }).join("");
    return `<aside class="sc-rail" data-testid="ab-rail" aria-label="${esc(s.cfg.unit.toLowerCase())} list">
      <div class="sc-rail-h"><span class="eyebrow">${esc(s.cfg.unit)}</span><span class="mono t-mute" data-testid="ab-rail-count">${done}/${s.units.length} generated</span></div>
      <div class="progress is-done sc-rail-pg"><i style="width:${s.units.length ? Math.round((done / s.units.length) * 100) : 0}%"></i></div>
      <div class="sc-units" role="tree" data-keep="ab-units">${rows}</div></aside>`;
  }

  function bar(c) {
    const { p, x } = c;
    const views = [["prod", `${ic("mic")}Production`], ["voices", `${ic("voice")}Voices`], ["rules", `${ic("lang")}Reading rules`]];
    let right = "";
    if (x.view === "prod" && c.u.blocks) {
      const n = todo(c).length;
      const blocked = AB.blockers(c.s, c.bk, c.u).length > 0;
      right = `<button class="btn btn-sm" data-testid="ab-play-all-btn" data-act="ab-play-all">${ic("play")}Listen to the whole chapter</button>
        <button class="btn btn-sm btn-primary" data-testid="ab-generate-btn" data-act="ab-generate" ${blocked || !n ? "disabled" : ""}>${ic("spark")}${n ? `Generate ${n} segments` : "Audio complete"}</button>`;
    }
    return U.bar(
      `<button class="btn btn-sm" data-testid="ab-back-btn" data-act="pj-back" data-id="${p.id}">${ic("arrow-left")}${esc(p.name)}</button>
       <span class="nv-ttl">${ic("mic")}<span class="t-ink">Audiobook</span></span>${U.seg("ab-view", views, x.view, "", "ab-views")}`,
      right,
    );
  }

  function bannerBtn(k, b) {
    if (k === "lock") return `<button class="btn btn-sm" data-testid="ab-open-script-btn" data-act="ab-open-script">Open Scripting</button>`;
    if (k === "who") return `<button class="btn btn-sm" data-testid="ab-go-who-btn" data-act="ab-edit" data-id="${b.id}">Edit in Scripting</button>`;
    if (k === "engine") return `<button class="btn btn-sm" data-testid="ab-fix-engine-btn" data-act="ab-view" data-v="voices">Change voice</button>`;
    return `<button class="btn btn-sm" data-testid="ab-pick-voice-btn" data-act="ab-view" data-v="voices">Choose voice</button>`;
  }
  function banners(c) {
    const bl = AB.blockers(c.s, c.bk, c.u);
    return bl.map((b) => `<div class="sc-ban is-warn" data-testid="ab-ban-${b.k}">${ic("alert")}<span>${esc(b.text)}</span>${bannerBtn(b.k, b)}</div>`).join("");
  }

  function sub(c, run) {
    const { u, s, bk } = c;
    const st = AB.unitStat(s, bk, u);
    const filters = [["all", "All"], ["todo", "Needs generation"], ["stale", "Needs review"], ["flag", "Failed"]];
    const ms = AB.rec(bk, u).mix;
    const total = st.dur + Math.max(0, st.total - 1) * ms.gap + ms.intro + ms.outro;
    return `<div class="tl-sub is-wrap ab-sub" data-testid="ab-sub">
      <span class="mono t-mute sc-sub-n">${esc(s.cfg.unit.toUpperCase())} ${pad(u.no)}</span><span class="t-ink ab-sub-t">${esc(u.title || `${s.cfg.unit} ${u.no}`)}</span>
      ${u.status === "locked" ? `<span class="badge badge-success">SCRIPT LOCKED</span>` : `<span class="badge badge-warning">SCRIPT NOT LOCKED</span>`}
      <span class="sc-stats mono" data-testid="ab-stats"><span>${st.total} segments</span><span>${st.done} generated</span><span>${run.size ? `${run.size} generating` : `${st.stale + st.none} to generate`}</span><span>≈ ${dur(total)}</span></span>
      <span class="spacer"></span>${U.seg("ab-filter", filters, c.x.filter, "", "ab-filters")}</div>`;
  }

  function segRow(b, n, c, run) {
    const { sp, v, speed } = AB.voiceFor(c.bk, c.s, b);
    const info = run.has(b.id) ? { st: "running" } : AB.segState(c.bk, c.s, c.u, b);
    const a = info.a;
    const t = T[b.type];
    const who = `<span class="ab-chip ${spkClass(sp)}"><i class="sc-dot"></i>${esc(sp ? sp.name : b.type === "dialogue" ? "No character assigned" : "No narrator yet")}</span>`;
    const note = info.st === "flag" ? `<div class="ab-why is-flag">${ic("flag")}<span>Failed: ${esc(a.flag)}</span></div>` : info.why && info.why.length ? `<div class="ab-why">${ic("alert")}<span>${esc(info.why.join(" · "))}</span></div>` : "";
    return `<div class="ab-seg is-${info.st} ${c.x.sel === b.id ? "is-sel" : ""}" data-testid="ab-seg-${b.id}" data-id="${b.id}" tabindex="0" data-act="ab-sel">
      <button type="button" class="ab-play" data-testid="ab-play-${b.id}" data-act="ab-play" data-id="${b.id}" ${a ? "" : "disabled"} aria-label="Listen to segment">${ic("play")}</button>
      <div class="ab-seg-b">
        <div class="ab-seg-h"><span class="ab-n mono">${pad(n)}</span><span class="type-tag">${ic(t.icon)}${esc(t.label)}</span>${who}
          <span class="ab-voice t-sm t-mute">${v ? `${esc(v.name)}${speed !== 1 ? ` · ${speed}×` : ""}` : "No voice yet"}</span>${b.paren ? `<span class="ab-par">${esc(b.paren)}</span>` : ""}</div>
        <p class="ab-text">${hl(c.bk, b.text)}</p>${note}</div>
      <div class="ab-seg-r"><span class="mono t-mute">${a ? dur(a.dur) : "—"}</span>${stBadge(info.st)}
        <span class="ab-act"><button type="button" class="btn btn-icon btn-sm" data-testid="ab-regen-${b.id}" data-act="ab-regen" data-id="${b.id}" title="Regenerate" aria-label="Regenerate">${ic("refresh")}</button>
          <button type="button" class="btn btn-icon btn-sm" data-testid="ab-edit-${b.id}" data-act="ab-edit" data-id="${b.id}" title="Edit in Scripting" aria-label="Edit in Scripting">${ic("pen")}</button></span></div></div>`;
  }

  function segList(c, run) {
    const f = c.x.filter;
    let n = 0;
    const rows = c.u.blocks.map((b) => {
      if (AB.VOICED.includes(b.type) && b.text.trim()) {
        n++;
        const st = run.has(b.id) ? "running" : AB.segState(c.bk, c.s, c.u, b).st;
        if (f === "todo" && st === "done") return "";
        if (f === "stale" && st !== "stale") return "";
        if (f === "flag" && st !== "flag") return "";
        return segRow(b, n, c, run);
      }
      if (f !== "all") return "";
      if (b.type === "pause") return `<div class="ab-gap" data-testid="ab-gap-${b.id}"><span>Pause ${(b.ms / 1000).toFixed(1)} seconds</span></div>`;
      if (b.type === "cue") return `<div class="ab-gap is-cue" data-testid="ab-cue-${b.id}">${ic("music")}<span>${esc(b.text)}</span><span class="t-sm t-mute">Sound suggestion, not generated at this step</span></div>`;
      return "";
    }).join("");
    return rows || U.empty("No segments match the filters", "Choose another filter to view.", "");
  }

  function prodMain(c) {
    const run = running(c);
    const body = c.u.blocks
      ? segList(c, run)
      : !c.u.meta
      ? U.empty(`This ${c.s.cfg.unit} has no script yet`, "Draft and lock the narration script in Scripting before generating audio.", `<div class="empty-act"><button class="btn btn-primary" data-testid="ab-empty-script-btn" data-act="ab-open-script">${ic("pen")}Open Scripting</button></div>`)
      : U.empty(`The prototype has no sample content for this ${c.s.cfg.unit.toLowerCase()} yet`, `This ${c.s.cfg.unit} ${{ done: "has complete audio", stale: "has audio that needs regeneration", none: "has no audio generated" }[AB.unitStat(c.s, c.bk, c.u).st] || "has no audio"} (mock data). The prototype only has full content for chapters 1–3 of “The Lantern Keeper of Harrowmere”.`, "");
    return `${sub(c, run)}${c.u.blocks ? banners(c) : ""}<div class="ab-scroll" data-keep="ab" data-testid="ab-scroll"><div class="ab-list" data-testid="ab-list">${body}</div></div><div class="ab-player" id="ab-player" data-testid="ab-player" hidden></div>`;
  }

  function voiceOptions(sel) {
    const opt = (v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.name)} · ${esc(v.lang)} · ${esc(v.gender)}${AB.usable(v) ? "" : ` — ${esc(AB.whyNot(v))}`}</option>`;
    const ready = AB.voices().filter((v) => v.status === "ready");
    return `<option value="">No voice selected</option><optgroup label="Local TTS">${ready.filter((v) => v.engine === "local").map(opt).join("")}</optgroup><optgroup label="Cloud speech">${ready.filter((v) => v.engine === "cloud").map(opt).join("")}</optgroup>`;
  }

  function voicesMain(c) {
    const { s, bk } = c;
    const lost = s.units.reduce((a, u) => a + (u.blocks || []).filter((b) => b.type === "dialogue" && !s.cast.some((x) => x.id === b.who)).length, 0);
    const rows = s.cast.map((sp) => {
      const cfg = bk.voices[sp.id] || { voice: "", speed: 1 };
      const v = cfg.voice ? AB.voiceById(cfg.voice) : null;
      const n = useCount(s, sp);
      const status = !v ? (n ? `<span class="badge badge-warning">NO VOICE</span>` : `<span class="badge">UNUSED</span>`) : AB.usable(v) ? `<span class="dot dot-success"></span><span class="t-sm"> Ready</span>` : `<span class="badge badge-warning" title="${esc(AB.whyNot(v))}">${v.engine === "cloud" ? "NOT CONNECTED" : "MODEL REQUIRED"}</span>`;
      return `<tr data-testid="ab-spk-${sp.id}">
        <td><div class="ab-spk"><i class="sc-dot ${spkClass(sp)}"></i><input class="input" data-testid="ab-spk-name-${sp.id}" value="${esc(sp.name)}" data-change="ab-spk-name" data-id="${sp.id}" aria-label="Speaker name" ${sp.kb || sp.kind === "narrator" ? "disabled" : ""}>${sp.kind === "narrator" ? `<span class="badge badge-primary">NARRATION</span>` : sp.kb ? `<span class="badge badge-info" title="From the Knowledgebase">KB</span>` : ""}</div></td>
        <td><select class="select ab-vsel" data-testid="ab-spk-voice-${sp.id}" data-change="ab-spk-voice" data-id="${sp.id}" aria-label="Voice">${voiceOptions(cfg.voice)}</select></td>
        <td><input class="input ab-speed" type="number" min="0.6" max="1.5" step="0.05" value="${cfg.speed}" data-testid="ab-spk-speed-${sp.id}" data-change="ab-spk-speed" data-id="${sp.id}" aria-label="Speed"></td>
        <td class="num mono t-mute">${n}</td><td>${status}</td>
        <td class="row-actions"><button class="btn btn-sm" data-testid="ab-spk-preview-${sp.id}" data-act="ab-preview" data-id="${sp.id}" ${v && AB.usable(v) ? "" : "disabled"}>${ic("play")}Preview</button>
          <button class="btn btn-icon btn-sm" data-testid="ab-spk-del-${sp.id}" data-act="ab-spk-del" data-id="${sp.id}" ${sp.kind === "narrator" || sp.kb || n ? "disabled" : ""} title="${sp.kind === "narrator" ? "The narrator cannot be deleted" : sp.kb ? "Characters from the Knowledgebase" : n ? "In use" : "Delete"}" aria-label="Delete">${ic("trash")}</button></td></tr>`;
    }).join("");
    return `<div class="ab-scroll ab-pad" data-keep="ab-v" data-testid="ab-voices"><div class="ab-wrap">
      <div class="ab-head"><h2 class="t-display-xs">Speakers and voices</h2><p class="t-sm t-mute">Each speaker uses one voice and one reading speed. The narrator voice reads titles and narration blocks. The character of each line of dialogue is locked in Scripting; here you only choose the voice. Characters come from the Knowledgebase or are added manually.</p></div>
      ${lost ? `<div class="sc-ban is-warn" data-testid="ab-lost-ban">${ic("alert")}<span>${lost} dialogues in the project have no character assigned in Scripting.</span><button class="btn btn-sm" data-testid="ab-lost-go-btn" data-act="ab-open-script">Open Scripting</button></div>` : ""}
      <div class="ab-tw"><table class="table ab-spk-table" data-testid="ab-spk-table"><thead><tr><th>Speaker</th><th>Voice</th><th>Speed</th><th class="num">Blocks</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="ab-add"><input id="ab-new-spk" class="input" data-testid="ab-spk-new-input" placeholder="New speaker name…" data-enter="ab-spk-add" autocomplete="off" aria-label="New speaker name"><button class="btn btn-sm" data-testid="ab-spk-add-btn" data-act="ab-spk-add">${ic("plus")}Add speaker</button></div>
    </div></div>`;
  }

  const occurrences = (s, term) => s.units.reduce((a, u) => a + (u.blocks || []).reduce((n, b) => n + (AB.VOICED.includes(b.type) && term ? b.text.split(term).length - 1 : 0), 0), 0);
  const affected = (c) => c.s.units.reduce((a, u) => a + (u.blocks ? AB.voiced(u).filter((b) => { const r = AB.segState(c.bk, c.s, u, b); return r.why && r.why.includes("Reading rule changed"); }).length : 0), 0);
  const testText = (c) => c.x.test || ((c.u.blocks || []).find((b) => b.type === "narration" && AB.hits(c.bk, b.text).length) || {}).text || "Wren Aldous climbs three hundred twelve steps of the Lantern Tower at Harrowmere.";

  function rulesMain(c) {
    const { s, bk } = c;
    const n = affected(c);
    const lex = bk.lex.map((l) => `<tr data-testid="ab-lex-${l.id}">
      <td><input class="input" data-testid="ab-lex-term-${l.id}" value="${esc(l.term)}" data-change="ab-lex-edit" data-id="${l.id}" data-f="term" aria-label="Source term"></td>
      <td><input class="input" data-testid="ab-lex-say-${l.id}" value="${esc(l.say)}" data-change="ab-lex-edit" data-id="${l.id}" data-f="say" aria-label="Reading"></td>
      <td><span class="type-tag">${esc(l.kind)}</span></td><td class="num mono t-mute">${occurrences(s, l.term)}×</td>
      <td class="row-actions"><button class="btn btn-icon btn-sm" data-testid="ab-lex-del-${l.id}" data-act="ab-lex-del" data-id="${l.id}" title="Delete" aria-label="Delete rule">${ic("trash")}</button></td></tr>`).join("");
    const sym = bk.symbols.map((x) => `<label class="check ab-sym" data-testid="ab-sym-${x.id}"><input type="checkbox" data-testid="ab-sym-input-${x.id}" data-change="ab-sym" data-id="${x.id}" ${x.on ? "checked" : ""}><span class="mono ab-sym-k">${esc(x.sym)}</span><span class="t-sm">${esc(x.rule)}</span></label>`).join("");
    const text = testText(c);
    return `<div class="ab-scroll ab-pad" data-keep="ab-r" data-testid="ab-rules"><div class="ab-wrap">
      <div class="ab-head"><h2 class="t-display-xs">Reading rules</h2><p class="t-sm t-mute">Applies to every ${esc(s.cfg.unit.toLowerCase())} of the project when generating audio. The text in the script is not changed, only how it is read. Any segment containing the changed word is marked as needing regeneration.</p></div>
      ${n ? `<div class="sc-ban is-warn" data-testid="ab-rules-ban">${ic("alert")}<span>${n} audio segments use the old rule and need regeneration.</span><button class="btn btn-sm" data-testid="ab-rules-go-btn" data-act="ab-view" data-v="prod">View in Production</button></div>` : ""}
      <section class="pw-card" data-testid="ab-lex"><h3 class="t-display-xs">Pronunciation · proper names, numbers, abbreviations</h3>
        <div class="ab-tw"><table class="table ab-lex-table"><thead><tr><th>Source term</th><th>Read as</th><th>Type</th><th class="num">Occurrences</th><th></th></tr></thead><tbody>${lex || `<tr><td colspan="5" class="t-mute">No rules yet.</td></tr>`}</tbody></table></div>
        <div class="ab-lex-add"><input id="ab-lx-term" class="input" data-testid="ab-lex-term-input" placeholder="Source term" autocomplete="off" aria-label="Source term"><input id="ab-lx-say" class="input" data-testid="ab-lex-say-input" placeholder="Read as" data-enter="ab-lex-add" autocomplete="off" aria-label="Reading">
          <select id="ab-lx-kind" class="select" data-testid="ab-lex-kind-select" aria-label="Type">${U.options(["Proper names", "Number", "Abbreviation", "Terms"].map((x) => [x, x]), "Proper names")}</select>
          <button class="btn btn-sm" data-testid="ab-lex-add-btn" data-act="ab-lex-add">${ic("plus")}Add rule</button></div></section>
      <div class="ab-two">
        <section class="pw-card" data-testid="ab-test"><h3 class="t-display-xs">Quick test</h3><span class="field-hint">Type a sentence to see how the rules are applied.</span>
          <textarea id="ab-test-in" class="textarea" rows="3" data-testid="ab-test-input" data-on="ab-test" aria-label="Test sentence">${esc(text)}</textarea>
          <div class="ab-test-out" id="ab-test-out" data-testid="ab-test-out">${esc(AB.readText(bk, text))}</div></section>
        <section class="pw-card" data-testid="ab-symbols"><h3 class="t-display-xs">Symbol</h3><div class="ab-syms">${sym}</div></section>
      </div></div></div>`;
  }

  function render(p) {
    const c = ctx(p);
    const v = c.x.view;
    return `<div class="nv" data-testid="ab-root">${bar(c)}<div class="nv-body">${v === "prod" ? rail(c) : ""}<div class="ab-main" data-testid="ab-main">${v === "voices" ? voicesMain(c) : v === "rules" ? rulesMain(c) : prodMain(c)}</div></div></div>`;
  }

  function mount(ed, p) {
    const x = ui(p.id);
    const id = x.goto;
    x.goto = null;
    if (window.ABX) window.ABX.paintPlayer();
    if (id) setTimeout(() => A.$(`.ab-seg[data-id="${id}"]`, ed)?.scrollIntoView({ block: "center" }), 0);
  }

  window.ABU = { ctx, activeCtx, ui, running, todo, refresh, spkClass, hl, stBadge, dur, pad, useCount, affected, byP, STATE };
  PJ.modViews = PJ.modViews || {};
  PJ.modViews.audiobook = { render, mount, inspector: (p) => (window.ABX ? window.ABX.inspector(ctx(p)) : "") };

  const sync = (c) => { AB.sync(c.p); A.renderExplorer(); };
  Object.assign(A.ACT, {
    "ab-view": (el) => { const c = activeCtx(); if (!c) return; c.x.view = el.dataset.v; c.x.sel = null; refresh(); },
    "ab-unit": (el) => { const c = activeCtx(); if (!c) return; c.x.unit = el.dataset.id; c.x.sel = null; refresh(); },
    "ab-filter": (el) => { const c = activeCtx(); if (!c) return; c.x.filter = el.dataset.v; refresh(); },
    "ab-sel": (el) => { const c = activeCtx(); if (!c) return; c.x.sel = el.dataset.id; A.$$("#editor .ab-seg").forEach((r) => r.classList.toggle("is-sel", r.dataset.id === c.x.sel)); A.renderInspector(); },
    "ab-goto": (el) => { const c = activeCtx(); if (!c) return; c.x.view = "prod"; c.x.sel = el.dataset.id; c.x.goto = el.dataset.id; refresh(); },
    "ab-open-script": () => { const c = activeCtx(); if (!c) return; window.SCR.ui(c.p.id).unit = c.u.id; A.ACT["pj-mod"]({ dataset: { id: c.p.id, m: "scripting" } }); },
    "ab-edit": (el) => {
      const c = activeCtx();
      if (!c) return;
      const sx = window.SCR.ui(c.p.id);
      Object.assign(sx, { unit: c.u.id, sel: el.dataset.id, goto: el.dataset.id, view: "edit" });
      A.ACT["pj-mod"]({ dataset: { id: c.p.id, m: "scripting" } });
    },
    "ab-spk-add": () => {
      const c = activeCtx();
      const el = A.$("#ab-new-spk");
      const name = el ? el.value.trim() : "";
      if (!c || !name) { if (el) el.focus(); return; }
      if (c.s.cast.some((x) => x.name.toLowerCase() === name.toLowerCase())) { A.toast("A speaker with this name already exists.", "warning"); return; }
      c.s.extraCast.push({ id: `spk${Date.now().toString(36)}`, name, c: c.s.cast.length });
      SC.syncCast(c.p, c.s);
      refresh();
      A.$("#ab-new-spk")?.focus();
    },
    "ab-spk-del": (el) => { const c = activeCtx(); if (!c) return; c.s.extraCast = c.s.extraCast.filter((x) => x.id !== el.dataset.id); delete c.bk.voices[el.dataset.id]; SC.syncCast(c.p, c.s); refresh(); },
    "ab-lex-add": () => {
      const c = activeCtx();
      const term = (A.$("#ab-lx-term") || {}).value;
      const say = (A.$("#ab-lx-say") || {}).value;
      if (!c || !term || !term.trim() || !say || !say.trim()) { A.$(term && term.trim() ? "#ab-lx-say" : "#ab-lx-term")?.focus(); return; }
      c.bk.lex.push({ id: `L${Date.now().toString(36)}`, term: term.trim(), say: say.trim(), kind: A.$("#ab-lx-kind").value });
      sync(c);
      refresh();
    },
    "ab-lex-del": (el) => { const c = activeCtx(); if (!c) return; c.bk.lex = c.bk.lex.filter((x) => x.id !== el.dataset.id); sync(c); refresh(); },
  });

  Object.assign(A.ON, {
    "ab-spk-name": (el) => {
      const c = activeCtx();
      const sp = c && c.s.extraCast.find((x) => x.id === el.dataset.id);
      if (!sp) return;
      const v = el.value.trim();
      if (!v) { el.value = sp.name; return; }
      sp.name = v;
      SC.syncCast(c.p, c.s);
      refresh();
    },
    "ab-spk-voice": (el) => { const c = activeCtx(); if (!c) return; const cfg = (c.bk.voices[el.dataset.id] ||= { voice: "", speed: 1 }); cfg.voice = el.value; sync(c); refresh(); },
    "ab-spk-speed": (el) => {
      const c = activeCtx();
      if (!c) return;
      const cfg = (c.bk.voices[el.dataset.id] ||= { voice: "", speed: 1 });
      cfg.speed = Math.max(0.6, Math.min(1.5, parseFloat(el.value) || 1));
      sync(c);
      refresh();
    },
    "ab-lex-edit": (el) => {
      const c = activeCtx();
      const l = c && c.bk.lex.find((x) => x.id === el.dataset.id);
      if (!l) return;
      const v = el.value.trim();
      if (!v) { el.value = l[el.dataset.f]; return; }
      l[el.dataset.f] = v;
      sync(c);
      refresh();
    },
    "ab-sym": (el) => { const c = activeCtx(); const x = c && c.bk.symbols.find((y) => y.id === el.dataset.id); if (x) x.on = el.checked; },
    "ab-test": (el) => {
      const c = activeCtx();
      if (!c) return;
      c.x.test = el.value;
      const out = A.$("#ab-test-out");
      if (out) out.textContent = AB.readText(c.bk, el.value);
    },
  });
})();
