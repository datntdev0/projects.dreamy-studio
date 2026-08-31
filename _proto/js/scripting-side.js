(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const SC = window.SC;
  const R = window.SCR;
  const U = window.NVU;
  const { esc, ic } = A;
  const T = SC.TYPES;

  const field = (label, id, control) => `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
  const dis = (c) => (c.locked ? "disabled" : "");

  function syncProg(c) {
    if (!c.p.modules.includes("scripting")) return;
    const { s } = c;
    const done = s.units.filter((u) => u.status === "locked").length;
    const total = s.units.length;
    const stale = s.units.filter((u) => R.staleRefs(c, u).length).length;
    const any = s.units.some((u) => u.status !== "draft" || (u.blocks && u.blocks.length));
    const state = stale ? "stale" : done === total ? "done" : done || any ? "doing" : "idle";
    c.p.prog.scripting = { state, done, total, note: `${done}/${total} ${c.cfg.unit.toLowerCase()}${stale ? ` · ${stale} need review` : ""}` };
    c.p.activity.unshift([A.stamp(), `Script updated: ${done}/${total} ${c.cfg.unit.toLowerCase()} locked`]);
    A.renderExplorer();
  }

  function blockPanel(c, b) {
    const t = T[b.type];
    const rows = [field("Block type", "ib-type", `<select id="ib-type" class="select" data-testid="sc-ins-type" data-change="sc-ins-type" data-id="${b.id}" ${dis(c)}>${R.opts(c.cfg.types.map((x) => [x, T[x].label]), b.type)}</select>`)];
    if (b.type === "dialogue" && c.cfg.speakers) {
      rows.push(field("Characters", "ib-who", `<select id="ib-who" class="select" data-testid="sc-ins-who" data-change="sc-who-sel" data-id="${b.id}" ${dis(c)}><option value="">Unassigned</option>${U.options(c.s.cast.map((sp) => [sp.id, sp.name]), b.who)}</select>`));
      rows.push(field("Tone", "ib-par", `<input id="ib-par" class="input" data-testid="sc-ins-paren" value="${esc(b.paren)}" placeholder="e.g. whispering, angry" data-change="sc-fld" data-id="${b.id}" data-f="paren" ${dis(c)}>`));
    }
    if (b.type === "scene") {
      rows.push(field("Setting (from the Knowledgebase or entered by hand)", "ib-loc", `<input id="ib-loc" class="input" list="sc-places" data-testid="sc-ins-loc" value="${esc(b.loc)}" data-change="sc-fld" data-id="${b.id}" data-f="loc" ${dis(c)}>`));
      rows.push(field("Time", "ib-time", `<select id="ib-time" class="select" data-testid="sc-ins-time" data-change="sc-fld" data-id="${b.id}" data-f="time" ${dis(c)}>${R.opts(SC.TIMES, b.time)}</select>`));
      rows.push(field("Scene summary", "ib-beat", `<textarea id="ib-beat" class="textarea" rows="3" data-testid="sc-ins-beat" data-change="sc-fld" data-id="${b.id}" data-f="beat" ${dis(c)}>${esc(b.beat)}</textarea>`));
    }
    if (b.type === "pause") rows.push(field("Pause seconds", "ib-ms", `<input id="ib-ms" class="input" type="number" min="0" max="30" step="0.1" data-testid="sc-ins-ms" value="${(b.ms / 1000).toFixed(1)}" data-change="sc-fld" data-id="${b.id}" data-f="ms" ${dis(c)}>`));
    const stale = R.isStale(c, b);
    const refsRow = b.type === "scene" && b.refs.length ? U.kv([["Evidence", b.refs.map((r) => `<span class="sc-ref">Ch.${r.split(".")[0]} ¶${r.split(".")[1]}</span>`).join(" ")]]) : "";
    const src = b.ref ? U.kv([["Source paragraph", `<span class="mono">¶${b.ref.split(".")[1]}</span>`], ["Source match", stale ? `<span class="badge badge-warning">CHANGED</span>` : `<span class="badge badge-success">MATCHES</span>`]]) : "";
    const act = c.locked ? "" : `<section class="ins-sec ins-actions" data-testid="sc-ins-actions">
        <button class="btn" data-testid="sc-ins-up" data-act="sc-up" data-id="${b.id}">${ic("arrow-up")}Up</button><button class="btn" data-testid="sc-ins-down" data-act="sc-down" data-id="${b.id}">${ic("arrow-down")}Down</button>
        <button class="btn" data-testid="sc-ins-dup" data-act="sc-dup" data-id="${b.id}">${ic("copy")}Duplicate</button><button class="btn btn-danger" data-testid="sc-ins-del" data-act="sc-del" data-id="${b.id}">${ic("trash")}Delete</button></section>`;
    return `<section class="ins-sec" data-testid="sc-ins-block"><span class="eyebrow">Selected block</span><div class="ins-h">${ic(t.icon)}<span class="t-ink">${esc(t.label)}</span></div><p class="t-sm t-mute">${esc(t.hint)}</p><div class="ins-form">${rows.join("")}</div>${b.type === "dialogue" && !c.cfg.speakers ? `<span class="field-hint">Speakers and voices are chosen in the Audiobook module.</span>` : ""}</section>
      ${b.ref ? U.insSec("Source", src) : ""}${refsRow ? `<section class="ins-sec">${refsRow}</section>` : ""}${act}`;
  }

  function summaryPanel(c) {
    const { s, u, cfg } = c;
    const m = R.metrics(s, u);
    const total = Object.values(m.byWho).reduce((a, n) => a + n, 0) || 1;
    const who = Object.entries(m.byWho).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
      const sp = R.spk(s, id);
      return `<div class="sc-bar" data-testid="sc-dist-${id}"><span class="sc-bar-n ellip"><i class="sc-dot ${R.spkClass(sp)}"></i>${esc(sp ? sp.name : "Unassigned")}</span><div class="progress"><i style="width:${Math.round((n / total) * 100)}%"></i></div><span class="mono t-mute">${U.fmt(n)}</span></div>`;
    }).join("");
    const typeRows = Object.entries(m.byType).map(([t, n]) => `<div class="sc-bar" data-testid="sc-type-${t}"><span class="sc-bar-n ellip">${ic(T[t].icon)}${esc(T[t].label)}</span><div class="progress"><i style="width:${Math.round((n / (m.blocks || 1)) * 100)}%"></i></div><span class="mono t-mute">${n}</span></div>`).join("");
    const dist = cfg.speakers
      ? (who ? `<section class="ins-sec" data-testid="sc-ins-dist"><span class="eyebrow">Dialogue by character · word count</span>${who}</section>` : "")
      : (typeRows ? `<section class="ins-sec" data-testid="sc-ins-types"><span class="eyebrow">Distribution by block type</span>${typeRows}</section>` : "");
    const list = R.issues(c);
    const rows = list.slice(0, 8).map((i) => `<button type="button" class="sc-iss is-${i.lv}" data-testid="sc-issue" ${i.id ? `data-act="sc-goto" data-id="${i.id}"` : i.ref ? `data-act="sc-goto-ref" data-ref="${i.ref}"` : "disabled"}>${ic(i.lv === "error" ? "x-circle" : "alert")}<span>${esc(i.text)}</span></button>`).join("");
    const kv = [["Name", esc(u.title || "Unnamed")], ["Status", R.statusBadge(c, u)]];
    if (cfg.ranges) kv.push(["Source chapters", esc(R.chLabel(u))], ["Scene", m.scenes]);
    kv.push(["Dialogue", m.lines]);
    kv.push(["Blocks", m.blocks], ["Words", U.fmt(m.words)], ["Estimate", `≈ ${R.dur(m.secs)}`]);
    if (u.updated) kv.push(["Edited at", `<span class="mono">${esc(u.updated)}</span>`]);
    return `${U.insSec(`${cfg.unit} ${u.no}`, U.kv(kv))}
      ${dist}
      <section class="ins-sec" data-testid="sc-ins-issues"><span class="eyebrow">Check${list.length ? ` · ${list.length}` : ""}</span>${rows || `<p class="t-sm t-mute">${u.blocks && u.blocks.length ? "No issues." : "No content to check yet."}</p>`}${list.length > 8 ? `<span class="t-sm t-mute">and ${list.length - 8} more issues.</span>` : ""}</section>`;
  }

  function castPanel(c) {
    const { s, p } = c;
    const used = (id) => s.units.reduce((a, u) => a + (u.blocks || []).filter((b) => b.who === id).length, 0);
    const rows = s.cast.map((sp) => {
      const n = used(sp.id);
      return `<div class="sc-cast-r" data-testid="sc-cast-${sp.id}"><i class="sc-dot ${R.spkClass(sp)}"></i>
        <input class="input" data-testid="sc-cast-name-${sp.id}" value="${esc(sp.name)}" data-change="sc-spk-name" data-id="${sp.id}" aria-label="Name" ${sp.kb || sp.kind === "narrator" ? "disabled" : ""}>
        ${sp.kb ? `<span class="badge badge-info" title="From the Knowledgebase">KB</span>` : sp.kind === "narrator" ? `<span class="badge badge-primary">NARR</span>` : `<span class="mono t-mute" title="Block count">${n}</span>`}
        <button class="btn btn-icon btn-sm" data-testid="sc-cast-del-${sp.id}" data-act="sc-spk-del" data-id="${sp.id}" ${sp.kb || sp.kind === "narrator" || n ? "disabled" : ""} title="${sp.kb ? "Characters from the Knowledgebase" : sp.kind === "narrator" ? "Cannot delete" : n ? "In use" : "Delete"}" aria-label="Delete">${ic("trash")}</button></div>`;
    }).join("");
    return `<section class="ins-sec" data-testid="sc-ins-cast"><span class="eyebrow">Characters · ${s.cast.length}</span><div class="sc-cast">${rows || `<p class="t-sm t-mute">No characters yet.</p>`}</div>
        <div class="sc-cast-add"><input id="sc-new-spk" class="input" data-testid="sc-cast-new-input" placeholder="A character not yet in the KB…" data-enter="sc-spk-add" autocomplete="off" aria-label="New character name"><button class="btn btn-sm" data-testid="sc-cast-add-btn" data-act="sc-spk-add">${ic("plus")}Add</button></div>
        <span class="field-hint">${SC.kbAvail(p) ? "Characters come from the novel’s Knowledgebase, edit them there." : "The novel has no Knowledgebase yet, so you add characters manually."}</span></section>`;
  }

  function scriptPanel(c) {
    const { p, cfg } = c;
    const next = p.modules.includes("audiobook") && cfg.types.includes("narration") ? "audiobook" : p.modules.includes("storyboard") ? "storyboard" : "";
    if (!next && !R.hasDefault(c)) return "";
    return `<section class="ins-sec sc-ins-script" data-testid="sc-ins-script"><span class="eyebrow">Script</span>
      ${R.hasDefault(c) ? `<button class="btn btn-block" data-testid="sc-reset-btn" data-act="sc-reset">${ic("refresh")}Reset to default</button>` : ""}
      ${next ? `<button class="btn btn-block ${c.locked ? "btn-primary" : ""}" data-testid="sc-next-btn" data-act="pj-mod" data-id="${p.id}" data-m="${next}">${ic(PJ.MODULES[next].icon)}Continue in ${esc(PJ.MODULES[next].label)}</button>${c.locked ? "" : `<span class="field-hint">Lock this ${esc(cfg.unit.toLowerCase())} before production.</span>`}` : ""}</section>`;
  }

  function inspector(c) {
    const b = c.u.blocks ? R.find(c.u, c.x.sel) : null;
    const cast = c.cfg.speakers ? castPanel(c) : "";
    return `${scriptPanel(c)}${b ? blockPanel(c, b) : summaryPanel(c)}${cast}`;
  }
  R.inspector = inspector;

  function checkRows(c) {
    const list = R.issues(c);
    const f = c.cfg.types.includes("scene");
    const defs = [["none", "Has content", "error", true], ["empty", "Every block has content", "error", true], ["who", "Every dialogue has a character assigned", "error", c.cfg.speakers],
      ["scene", "Every scene has a setting", "error", f], ["noscene", "At least one scene", "warn", f],
      ["stale", "The narration matches the current source", "warn", c.cfg.source && !!c.src], ["uncovered", "Every source paragraph has narration", "warn", c.cfg.source && !!c.src]];
    return defs.filter((d) => d[3]).map(([k, label, lv]) => {
      const hits = list.filter((i) => i.k === k);
      return { k, label, lv, n: hits.length, first: hits[0] };
    });
  }
  function openCheck(c) {
    const rows = checkRows(c);
    const errors = rows.filter((r) => r.n && r.lv === "error").length;
    const warns = rows.filter((r) => r.n && r.lv === "warn").length;
    const row = (r) => `<div class="sc-chk is-${r.n ? r.lv : "ok"}" data-testid="sc-check-${r.k}">${ic(r.n ? (r.lv === "error" ? "x-circle" : "alert") : "check-circle")}<span class="sc-chk-t">${esc(r.label)}</span>${r.n ? `<span class="mono">${r.n}</span>` : ""}
        ${r.n && r.first && (r.first.id || r.first.ref) ? `<button class="btn btn-sm btn-ghost" data-testid="sc-check-go-${r.k}" data-act="${r.first.id ? "sc-goto" : "sc-goto-ref"}" data-id="${r.first.id || ""}" data-ref="${r.first.ref || ""}">Xem</button>` : ""}</div>`;
    A.modal({ title: `Lock ${c.cfg.unit.toLowerCase()} ${c.u.no}`, eyebrow: "Check before locking", testid: "sc-check-modal",
      body: `<p class="t-sm t-mute">The locked version is the one the production modules will use. Once locked, this ${esc(c.cfg.unit.toLowerCase())} is read-only until you unlock it.</p>
        <div class="sc-chks" data-testid="sc-checks">${rows.map(row).join("")}</div>
        ${errors ? `<div class="sc-ban is-err">${ic("x-circle")}<span>${errors} errors still need fixing before locking.</span></div>` : warns ? `<div class="sc-ban is-warn">${ic("alert")}<span>There are ${warns} warnings. You can still lock.</span></div>` : `<div class="sc-ban is-ok">${ic("check-circle")}<span>All checks passed.</span></div>`}`,
      foot: `<button class="btn" data-testid="sc-check-cancel-btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="sc-check-lock-btn" data-act="sc-lock" ${errors ? "disabled" : ""}>${ic("lock")}Lock ${esc(c.cfg.unit.toLowerCase())}</button>` });
  }

  function openUnlock(c) {
    const down = c.p.prog.audiobook && c.p.prog.audiobook.state !== "idle";
    A.modal({ title: `Unlock ${c.cfg.unit.toLowerCase()} ${c.u.no}?`, eyebrow: "Scripting", testid: "sc-unlock-modal",
      body: `<p class="t-sm">The ${esc(c.cfg.unit)} will return to draft status for editing.</p>${down ? `<div class="sc-ban is-warn">${ic("alert")}<span>Audio generated from the old locked version will be marked for review when the script changes.</span></div>` : ""}`,
      foot: `<button class="btn" data-testid="sc-unlock-cancel-btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="sc-unlock-ok-btn" data-act="sc-unlock-ok">${ic("unlock")}Unlock</button>` });
  }

  const rs = { scope: "unit" };
  const resettable = (c) => c.s.units.filter((u) => u.status !== "locked" && !u.meta && R.srcOf(c.p, u));

  function applyDefault(c, u) {
    const src = R.srcOf(c.p, u);
    if (!src) return false;
    const old = u.blocks || [];
    const used = new Set();
    const fresh = SC.draftAudio(c.s, u, src.list);
    fresh.forEach((b) => {
      const same = old.find((o) => !used.has(o.id) && o.type === b.type && o.ref === b.ref && (b.type === "pause" ? o.ms === b.ms : o.text === b.text));
      if (same) { used.add(same.id); b.id = same.id; }
    });
    u.blocks = fresh;
    u.meta = null;
    if (u.status === "review") u.status = "draft";
    u.updated = A.stamp();
    return true;
  }

  function openReset(c) {
    if (c.locked) { A.toast(`Unlock the ${c.cfg.unit.toLowerCase()} before resetting.`, "warning"); return; }
    const all = resettable(c);
    if (all.length < 2) rs.scope = "unit";
    const n = c.u.blocks ? c.u.blocks.length : 0;
    const radio = (v, label, hint, off) => `<label class="check pj-chk-row ${off ? "is-off" : ""}" data-testid="sc-reset-scope-${v}"><input type="radio" name="sc-rs" data-testid="sc-reset-scope-input-${v}" data-change="sc-rs-scope" value="${v}" ${rs.scope === v ? "checked" : ""} ${off ? "disabled" : ""}><span>${label}</span><span class="t-sm t-mute">${hint}</span></label>`;
    A.modal({ title: "Reset to default", eyebrow: "Scripting", testid: "sc-reset-modal",
      body: `<p class="t-sm">The default consists of one <b>title</b>, one <b>pause</b>, then <b>each source paragraph as exactly one narration block</b>, keeping the text of the current source paragraph unchanged.</p>
        <div class="field"><span class="eyebrow">Scope</span><div class="pj-chk-list">
          ${radio("unit", `${esc(c.cfg.unit)} ${c.u.no} is open`, `${n} blocks currently`, false)}
          ${radio("all", `Every unlocked ${esc(c.cfg.unit.toLowerCase())} that has a source`, `${all.length} ${esc(c.cfg.unit.toLowerCase())}`, all.length < 2)}</div></div>
        <div class="sc-ban is-warn">${ic("alert")}<span>Every edit in this scope will be lost. Audio already generated for blocks whose text is unchanged is kept.</span></div>`,
      foot: `<button class="btn" data-testid="sc-reset-cancel-btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="sc-reset-go-btn" data-act="sc-reset-go">${ic("refresh")}Reset</button>` });
  }

  Object.assign(A.ACT, {
    "sc-reset": () => { const c = R.activeCtx(); if (c && c.u) openReset(c); },
    "sc-reset-go": () => {
      const c = R.activeCtx();
      if (!c) return;
      const targets = rs.scope === "all" ? resettable(c) : [c.u];
      let n = 0;
      targets.forEach((u) => { if (applyDefault(c, u)) n++; });
      c.x.sel = null;
      A.closeModal();
      R.refresh();
      A.toast(n ? `Reset ${n} ${c.cfg.unit.toLowerCase()} to default.` : "No source to reset from.", n ? "success" : "warning");
    },
    "sc-default": () => {
      const c = R.activeCtx();
      if (!c) return;
      applyDefault(c, c.u);
      c.x.sel = null;
      R.refresh();
      A.toast("Created the default script from the source paragraphs.");
    },
    "sc-check": () => { const c = R.activeCtx(); if (c && c.u && !c.locked) openCheck(c); },
    "sc-lock": () => {
      const c = R.activeCtx();
      if (!c || c.locked) return;
      c.u.status = "locked";
      R.touch(c);
      A.closeModal();
      syncProg(c);
      R.refresh();
      A.toast(`Locked ${c.cfg.unit.toLowerCase()} ${c.u.no}.`);
    },
    "sc-unlock": () => { const c = R.activeCtx(); if (c && c.u && c.locked) openUnlock(c); },
    "sc-unlock-ok": () => {
      const c = R.activeCtx();
      if (!c) return;
      c.u.status = R.staleRefs(c).length ? "review" : "draft";
      R.touch(c);
      A.closeModal();
      syncProg(c);
      R.refresh();
      A.toast(`Unlocked ${c.cfg.unit.toLowerCase()} ${c.u.no}.`, "warning");
    },
    "sc-goto-ref": (el) => { const c = R.activeCtx(); if (!c) return; c.x.view = "edit"; c.x.ref = el.dataset.ref; A.closeModal(); R.refresh(); },
    "sc-spk-add": () => {
      const c = R.activeCtx();
      const el = A.$("#sc-new-spk");
      const name = el ? el.value.trim() : "";
      if (!c || !name) { if (el) el.focus(); return; }
      if (c.s.cast.some((x) => x.name.toLowerCase() === name.toLowerCase())) { A.toast("A character with this name already exists.", "warning"); return; }
      c.s.extraCast.push({ id: `spk${Date.now().toString(36)}`, name, c: c.s.cast.length });
      SC.syncCast(c.p, c.s);
      A.renderInspector();
      A.$("#sc-new-spk")?.focus();
    },
    "sc-spk-del": (el) => { const c = R.activeCtx(); if (!c) return; c.s.extraCast = c.s.extraCast.filter((x) => x.id !== el.dataset.id); SC.syncCast(c.p, c.s); R.refresh(); },
  });

  Object.assign(A.ON, {
    "sc-rs-scope": (el) => { rs.scope = el.value; },
    "sc-ins-type": (el) => { const c = R.activeCtx(); const b = c && R.find(c.u, el.dataset.id); if (b) R.setType(c, b, el.value); },
    "sc-spk-name": (el) => {
      const c = R.activeCtx();
      const sp = c && c.s.extraCast.find((x) => x.id === el.dataset.id);
      if (!sp) return;
      const v = el.value.trim();
      if (!v) { el.value = sp.name; return; }
      sp.name = v;
      SC.syncCast(c.p, c.s);
      R.refresh();
    },
  });
})();
