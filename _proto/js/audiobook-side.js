(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const SC = window.SC;
  const AB = window.AB;
  const U = window.NVU;
  const LB = window.LB;
  const X = window.ABU;
  const { esc, ic } = A;
  const T = SC.TYPES;

  const RATE = 6;
  const P = { q: [], i: -1, t: 0, on: false, timer: null };
  let flagId = null;
  const money = (n) => `≈ $${n.toFixed(3)}`;
  const mmss = (sec) => LB.dur(Math.round(sec));

  function paintPlayer() {
    const el = A.$("#ab-player");
    const cur = P.q[P.i];
    A.$$("#editor .ab-seg").forEach((r) => {
      const on = !!cur && r.dataset.id === cur.id;
      r.classList.toggle("is-playing", on);
      if (!on) r.style.removeProperty("--pg");
    });
    if (!el) return;
    el.hidden = !cur;
    if (!cur) { el.innerHTML = ""; return; }
    const total = P.q.reduce((a, x) => a + x.dur, 0);
    const done = P.q.slice(0, P.i).reduce((a, x) => a + x.dur, 0) + P.t;
    el.innerHTML = `<button class="btn btn-icon btn-sm" data-testid="ab-pl-toggle" data-act="ab-pp" aria-label="${P.on ? "Pause" : "Play"}">${ic(P.on ? "pause" : "play")}</button>
      <div class="ab-pl-b"><div class="t-sm t-ink ellip" data-testid="ab-pl-title">${esc(cur.title)}</div><div class="progress"><i id="ab-pl-bar" style="width:${Math.min(100, (done / total) * 100)}%"></i></div></div>
      <span class="mono t-mute" id="ab-pl-time">${mmss(done)} / ${mmss(total)}</span>
      <button class="btn btn-icon btn-sm" data-testid="ab-pl-stop" data-act="ab-stop" title="Stop" aria-label="Stop">${ic("stop")}</button>`;
    const row = cur.id && A.$(`#editor .ab-seg[data-id="${cur.id}"]`);
    if (row) row.style.setProperty("--pg", `${Math.min(100, (P.t / cur.dur) * 100)}%`);
  }
  function paintLight() {
    const cur = P.q[P.i];
    if (!cur) return;
    const total = P.q.reduce((a, x) => a + x.dur, 0);
    const done = P.q.slice(0, P.i).reduce((a, x) => a + x.dur, 0) + P.t;
    const bar = A.$("#ab-pl-bar");
    if (bar) bar.style.width = `${Math.min(100, (done / total) * 100)}%`;
    const tm = A.$("#ab-pl-time");
    if (tm) tm.textContent = `${mmss(done)} / ${mmss(total)}`;
    const row = A.$(`#editor .ab-seg[data-id="${cur.id}"]`);
    if (row) row.style.setProperty("--pg", `${Math.min(100, (P.t / cur.dur) * 100)}%`);
  }
  function stop() {
    clearInterval(P.timer);
    Object.assign(P, { q: [], i: -1, t: 0, on: false, timer: null });
    paintPlayer();
  }
  function tick() {
    if (!P.on) return;
    const it = P.q[P.i];
    P.t += 0.15 * RATE;
    if (P.t >= it.dur) {
      P.i++;
      P.t = 0;
      if (P.i >= P.q.length) { stop(); return; }
      paintPlayer();
      return;
    }
    paintLight();
  }
  function play(items) {
    clearInterval(P.timer);
    Object.assign(P, { q: items, i: 0, t: 0, on: true });
    P.timer = setInterval(tick, 150);
    paintPlayer();
  }

  const segItem = (c, b) => {
    const a = AB.rec(c.bk, c.u).audio[b.id];
    return a ? { id: b.id, dur: a.dur, title: `${c.u.title || c.s.cfg.unit} · ${b.text.slice(0, 48)}${b.text.length > 48 ? "…" : ""}` } : null;
  };

  function commit(p, uid, bid) {
    const s = SC.scriptOf(p);
    const bk = AB.book(p);
    const u = s.units.find((x) => x.id === uid);
    const b = u && (u.blocks || []).find((x) => x.id === bid);
    if (!b) return;
    const vf = AB.voiceFor(bk, s, b);
    AB.rec(bk, u).audio[bid] = { text: b.text, voice: vf.v ? vf.v.id : "", speed: vf.speed, rules: AB.sigOf(bk.lex, b.text), paren: b.paren, dur: AB.estDur(b.text, vf.speed), at: A.stamp(), flag: "" };
    AB.sync(p);
  }
  function startGen(c, ids) {
    const { p, u, s } = c;
    A.startPipeline({
      kind: "audio", label: `Audiobook · ${p.name}`, detail: `${s.cfg.unit} ${u.no} · ${ids.length} segments`,
      tasks: ids.map((id) => ({ key: `${p.id}|${u.id}|${id}`, label: id })),
      onTask: (t) => commit(p, u.id, t.key.split("|")[2]),
      onDone: () => { AB.sync(p); p.activity.unshift([A.stamp(), `Generate audio for ${s.cfg.unit.toLowerCase()} ${u.no}: ${ids.length} segments`]); A.renderExplorer(); },
    });
    A.rerender();
  }

  function openGenerate(c) {
    const list = X.todo(c);
    const groups = new Map();
    list.forEach((b) => {
      const { v } = AB.voiceFor(c.bk, c.s, b);
      const key = v && v.engine === "cloud" ? v.provider : "local";
      groups.set(key, (groups.get(key) || 0) + b.text.length);
    });
    let cost = 0;
    const rows = [...groups.entries()].map(([k, chars]) => {
      if (k === "local") return `<div class="sc-chk is-ok">${ic("hdd")}<span class="sc-chk-t">Local TTS · runs on this machine, no data leaves it</span><span class="mono">${U.fmt(chars)} characters</span></div>`;
      const credit = LB.speech.billing(k) === "credit";
      if (!credit) cost += chars * 0.000016;
      return `<div class="sc-chk is-warn">${ic("cloud")}<span class="sc-chk-t">${esc(LB.speech.name(k))} · the text will be sent to the provider, ${credit ? "billed to the account’s credits" : money(chars * 0.000016)}</span><span class="mono">${U.fmt(chars)} characters</span></div>`;
    }).join("");
    const stale = list.filter((b) => AB.segState(c.bk, c.s, c.u, b).st !== "none").length;
    A.modal({ title: `Generate audio for ${c.s.cfg.unit.toLowerCase()} ${c.u.no}`, eyebrow: "Audiobook", testid: "ab-gen-modal",
      body: `<p class="t-sm">Will generate <b>${list.length} segments</b>${stale ? `, of which ${stale} segments are regenerated because the script, voice or reading rules changed` : ""}. Segments that passed and have not changed are kept.</p>
        <div class="sc-chks" data-testid="ab-gen-groups">${rows}</div>
        <div class="sc-est" data-testid="ab-gen-estimate">${ic("info")}<div class="t-sm">Estimated cost: <b>${cost ? money(cost) : "no direct cost"}</b>. Progress is shown in the Pipelines panel.</div></div>`,
      foot: `<button class="btn" data-testid="ab-gen-cancel-btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="ab-gen-go-btn" data-act="ab-gen-go">${ic("spark")}Generate ${list.length} segments</button>` });
  }

  const kvRows = (c) => {
    const st = AB.unitStat(c.s, c.bk, c.u);
    return [["Chapters", `${esc(c.s.cfg.unit)} ${c.u.no}${c.u.title ? ` · ${esc(c.u.title)}` : ""}`], ["Script", c.locked ? `<span class="badge badge-success">LOCKED</span>` : `<span class="badge badge-warning">NOT LOCKED</span>`],
      ["Passage", st.total || "—"], ["Generated", st.total ? `${st.done}/${st.total}` : "—"], ["Needs attention", st.total ? st.stale + st.none : "—"], ["Audio", st.dur ? `≈ ${mmss(st.dur)}` : "—"]];
  };
  const mixField = (label, id, f, val, min, max, step, unit) => `<div class="field"><label for="${id}">${label}</label><div class="ab-mix"><input id="${id}" class="input" type="number" min="${min}" max="${max}" step="${step}" value="${val}" data-testid="ab-mix-${f}" data-change="ab-mix" data-f="${f}"><span class="t-sm t-mute">${unit}</span></div></div>`;

  function chapterPanel(c) {
    const m = AB.rec(c.bk, c.u).mix;
    const bl = c.u.blocks ? AB.blockers(c.s, c.bk, c.u) : [];
    return `${U.insSec("Chapters", U.kv(kvRows(c)))}
      ${c.u.blocks ? `<section class="ins-sec" data-testid="ab-ins-mix"><span class="eyebrow">Chapter assembly</span><div class="ins-form">
        ${mixField("Pause between segments", "ab-m-gap", "gap", m.gap, 0, 5, 0.1, "seconds")}${mixField("Silence at chapter start", "ab-m-intro", "intro", m.intro, 0, 10, 0.1, "seconds")}
        ${mixField("Silence at chapter end", "ab-m-outro", "outro", m.outro, 0, 10, 0.1, "seconds")}${mixField("Volume", "ab-m-vol", "vol", m.vol, -12, 6, 1, "dB")}</div>
        <span class="field-hint">Pauses in the script are added on top of this pause.</span></section>` : ""}
      ${bl.length ? `<section class="ins-sec" data-testid="ab-ins-blockers"><span class="eyebrow">Needs attention · ${bl.length}</span>${bl.map((b) => `<div class="sc-iss is-warn">${ic("alert")}<span>${esc(b.text)}</span></div>`).join("")}</section>` : ""}
      <section class="ins-sec ins-actions" data-testid="ab-ins-actions"><button class="btn" data-testid="ab-ins-script-btn" data-act="ab-open-script">${ic("pen")}Open Scripting</button></section>`;
  }

  function segPanel(c, b) {
    const { sp, v, speed } = AB.voiceFor(c.bk, c.s, b);
    const info = AB.segState(c.bk, c.s, c.u, b);
    const a = info.a;
    const t = T[b.type];
    const rd = AB.readText(c.bk, b.text);
    const fields = "";
    const status = info.st === "none" ? "Not generated" : info.st === "flag" ? "Failed" : info.st === "stale" ? "Needs regeneration" : "Generated";
    return `<section class="ins-sec" data-testid="ab-ins-seg"><span class="eyebrow">Selected segment</span><div class="ins-h">${ic(t.icon)}<span class="t-ink">${esc(t.label)}</span>${X.stBadge(info.st)}</div>
        <div class="ab-ro" data-testid="ab-ins-text">${esc(b.text)}</div>${rd !== b.text ? `<span class="eyebrow">Read as</span><div class="ab-ro is-read" data-testid="ab-ins-read">${esc(rd)}</div>` : ""}
        <span class="field-hint">Text can only be edited in Scripting.</span></section>
      ${fields ? `<section class="ins-sec">${fields}</section>` : ""}
      ${U.insSec("Audio", U.kv([["Status", status], ["Characters", sp ? esc(sp.name) : "—"], ...(b.paren ? [["Tone", esc(b.paren)]] : []), ["Voice", v ? `${esc(v.name)}<div class="t-sm t-mute">${esc(AB.engineName(v))}${AB.usable(v) ? "" : ` · ${esc(AB.whyNot(v))}`}</div>` : "Not selected"], ["Speed", `${speed}×`], ["Duration", a ? mmss(a.dur) : "—"], ["Created at", a ? `<span class="mono">${esc(a.at)}</span>` : "—"]]))}
      ${info.why && info.why.length ? `<section class="ins-sec"><span class="eyebrow">Why regeneration is needed</span>${info.why.map((w) => `<div class="sc-iss is-warn">${ic("alert")}<span>${esc(w)}</span></div>`).join("")}</section>` : ""}
      ${a && a.flag ? `<section class="ins-sec"><span class="eyebrow">Flag note</span><p class="t-sm">${esc(a.flag)}</p></section>` : ""}
      <section class="ins-sec ins-actions" data-testid="ab-ins-seg-actions">
        <button class="btn" data-testid="ab-ins-play" data-act="ab-play" data-id="${b.id}" ${a ? "" : "disabled"}>${ic("play")}Nghe</button>
        <button class="btn" data-testid="ab-ins-regen" data-act="ab-regen" data-id="${b.id}">${ic("refresh")}Regenerate</button>
        ${a ? (a.flag ? `<button class="btn" data-testid="ab-ins-unflag" data-act="ab-unflag" data-id="${b.id}">${ic("check")}Clear flag</button>` : `<button class="btn" data-testid="ab-ins-flag" data-act="ab-flag" data-id="${b.id}">${ic("flag")}Failed</button>`) : ""}
        <button class="btn" data-testid="ab-ins-edit" data-act="ab-edit" data-id="${b.id}">${ic("pen")}Edit in Scripting</button></section>`;
  }

  function voicesPanel() {
    return `${U.insSec("Engine", U.kv([["Local TTS", LB.tts.count() ? `<span class="badge badge-success">${LB.tts.count()} MODELS</span>` : `<span class="badge badge-warning">NOT INSTALLED</span>`], ["Cloud speech", LB.speech.count() ? `<span class="badge badge-success">${LB.speech.count()} PROVIDER</span>` : `<span class="badge badge-warning">NOT CONNECTED</span>`]]))}
      <section class="ins-sec ins-actions" data-testid="ab-ins-engine"><button class="btn" data-testid="ab-ins-tts-btn" data-act="settings" data-v="tts">${ic("cpu")}Local TTS</button><button class="btn" data-testid="ab-ins-speech-btn" data-act="settings" data-v="speech">${ic("cloud")}Cloud speech</button>
        <button class="btn" data-testid="ab-ins-library-btn" data-act="open" data-id="voices">${ic("voice")}Voice library</button></section>
      <section class="ins-sec"><span class="eyebrow">Note</span><p class="t-sm t-mute">Cloud voices send text to the provider when generating audio. Local voices run on this machine and need an installed model. Changing a voice or speed marks segments generated with that voice as needing regeneration.</p></section>`;
  }
  function rulesPanel(c) {
    return `${U.insSec("Reading rules", U.kv([["Pronunciation", c.bk.lex.length], ["Active symbols", c.bk.symbols.filter((x) => x.on).length], ["Affected segments", X.affected(c)]]))}
      <section class="ins-sec"><span class="eyebrow">How it works</span><p class="t-sm t-mute">Rules change how text is read, not the text in the script. Adding or changing a rule marks segments containing that word as needing regeneration; segments without that word are not affected.</p></section>`;
  }

  window.ABX = {
    paintPlayer,
    inspector(c) {
      if (c.x.view === "voices") return voicesPanel();
      if (c.x.view === "rules") return rulesPanel(c);
      const b = c.u.blocks ? c.u.blocks.find((x) => x.id === c.x.sel) : null;
      return b && AB.VOICED.includes(b.type) ? segPanel(c, b) : chapterPanel(c);
    },
  };

  Object.assign(A.ACT, {
    "ab-play": (el, e) => {
      if (e) e.stopPropagation();
      const c = X.activeCtx();
      const b = c && c.u.blocks.find((x) => x.id === el.dataset.id);
      const it = b && segItem(c, b);
      if (!it) return;
      if (P.q.length === 1 && P.q[0].id === it.id) { P.on = !P.on; paintPlayer(); return; }
      play([it]);
    },
    "ab-play-all": () => {
      const c = X.activeCtx();
      if (!c || !c.u.blocks) return;
      const items = c.u.blocks.map((b) => (b.type === "pause" ? { id: "", dur: b.ms / 1000, title: "Pauses" } : AB.VOICED.includes(b.type) ? segItem(c, b) : null)).filter(Boolean);
      if (!items.some((x) => x.id)) { A.toast("This chapter has no audio to listen to yet.", "warning"); return; }
      play(items.map((x) => (x.id ? x : { ...x, title: "Pauses" })));
    },
    "ab-pp": () => { if (P.q.length) { P.on = !P.on; paintPlayer(); } },
    "ab-stop": stop,
    "ab-preview": (el) => {
      const c = X.activeCtx();
      const sp = c && c.s.cast.find((x) => x.id === el.dataset.id);
      if (!sp) return;
      const cfg = c.bk.voices[sp.id];
      const v = cfg && AB.voiceById(cfg.voice);
      play([{ id: "", dur: 6, title: `Preview · ${sp.name} · ${v ? v.name : ""}` }]);
      if (v && v.engine === "cloud") A.toast(`Preview sends a sample sentence to ${LB.speech.name(v.provider)}.`, "warning");
    },
    "ab-generate": () => { const c = X.activeCtx(); if (c && X.todo(c).length && !AB.blockers(c.s, c.bk, c.u).length) openGenerate(c); },
    "ab-gen-go": () => {
      const c = X.activeCtx();
      if (!c) return;
      const ids = X.todo(c).map((b) => b.id);
      A.closeModal();
      if (ids.length) startGen(c, ids);
    },
    "ab-regen": (el, e) => {
      if (e) e.stopPropagation();
      const c = X.activeCtx();
      if (!c) return;
      const bl = AB.blockers(c.s, c.bk, c.u);
      if (bl.length) { A.toast(bl[0].text, "warning"); return; }
      if (X.running(c).has(el.dataset.id)) return;
      startGen(c, [el.dataset.id]);
    },
    "ab-flag": (el) => {
      const c = X.activeCtx();
      if (!c) return;
      flagId = el.dataset.id;
      A.modal({ title: "Flag a failed reading", eyebrow: "Audiobook", testid: "ab-flag-modal",
        body: `<p class="t-sm t-mute">Note what is wrong. Edit the script or change the voice, then regenerate this segment.</p><div class="field"><label for="ab-flag-note">Note</label><textarea id="ab-flag-note" class="textarea" rows="3" data-testid="ab-flag-note" placeholder="e.g. Wrong stress on a proper name, pauses too fast"></textarea></div>`,
        foot: `<button class="btn" data-testid="ab-flag-cancel-btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="ab-flag-save-btn" data-act="ab-flag-save">${ic("flag")}Flag</button>` });
    },
    "ab-flag-save": () => {
      const c = X.activeCtx();
      const a = c && flagId && AB.rec(c.bk, c.u).audio[flagId];
      if (!a) return;
      a.flag = ((A.$("#ab-flag-note") || {}).value || "").trim() || "Needs re-listening";
      AB.sync(c.p);
      A.closeModal();
      A.renderExplorer();
      X.refresh();
      A.toast("Flagged the segment as failed.", "warning");
    },
    "ab-unflag": (el) => {
      const c = X.activeCtx();
      const a = c && AB.rec(c.bk, c.u).audio[el.dataset.id];
      if (!a) return;
      a.flag = "";
      AB.sync(c.p);
      A.renderExplorer();
      X.refresh();
    },
  });

  Object.assign(A.ON, {
    "ab-mix": (el) => {
      const c = X.activeCtx();
      if (!c) return;
      const f = el.dataset.f;
      const n = parseFloat(el.value);
      const lim = { gap: [0, 5], intro: [0, 10], outro: [0, 10], vol: [-12, 6] }[f];
      AB.rec(c.bk, c.u).mix[f] = Math.max(lim[0], Math.min(lim[1], Number.isFinite(n) ? n : 0));
      X.refresh();
    },
  });
})();
