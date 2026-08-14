/*
 * Novel knowledgebase: one screen `knowledge:<id>` with three tabs Graph · List · Review.
 *  - Analysis opens as a dialog (choose a chapter range: missing / range / all; range and all have an overwrite option).
 *  - ontology.yml can be viewed in a dialog.
 *  - Review runs the deterministic checker (novel-kb-check.js) on the LLM output.
 *  - Entities / facts are edited with a draft dialog (novel-kb-edit.js), previewing the conflict check results before confirming.
 *  - Details of the selected item are in the Inspector.
 */
(function () {
  const A = window.DSApp;
  const U = window.NVU;
  const NV = window.NV;
  const C = window.KBC;
  const G = window.KBG;
  const { esc, ic } = A;
  const { N, ui, fmt } = U;

  const K = () => N().kb;
  const O = () => NV.ontology;
  const V = () => ui("kb", { tab: "graph", list: "entity", q: "", fType: "all", fCert: "all", fStatus: "all", onlyIssues: false, sel: null, rf: "open", rrule: "all" });
  const items = () => K().items;
  const byId = (id) => items().find((i) => i.id === id);
  const itemCh = (it) => Math.min(...it.ev.map((e) => NV.chOf(e.p)), 99);
  const TYPE_ICON = { character: "user", place: "globe", org: "library", object: "package", event: "activity", relation: "swap" };
  const typeOf = (it) => (it.kind === "entity" ? it.type : it.kind);
  const typeName = (t) => (O().entityTypes[t]?.label) || ({ event: "Events", relation: "Relation" }[t]);
  const TYPES_ALL = [...Object.entries(O().entityTypes).map(([k, v]) => [k, v.label]), ["event", "Events"]];
  const STATUS = { proposed: ["badge-info", "Proposed"], confirmed: ["badge-success", "Confirmed"], edited: ["badge-primary", "Edited"], rejected: ["", "Rejected"] };
  const nm = (it) => C.nameOf(it);
  const typeTag = (it) => `<span class="type-tag">${ic(TYPE_ICON[typeOf(it)])}${esc(typeName(typeOf(it)))}</span>`;
  const upTo = () => K().upTo;
  const visible = (it) => {
    if (it.status === "rejected" || itemCh(it) > upTo()) return false;
    if (it.kind === "relation") return !!byId(it.from) && !!byId(it.to) && visible(byId(it.from)) && visible(byId(it.to));
    return true;
  };
  const issues = () => C.run();
  const issueIds = (open) => new Set(open.filter((x) => x.sev === "error").flatMap((x) => x.ids));

  /* ---------------- toolbar ---------------- */
  function view(id) {
    U.bind(id);
    const v = V();
    if (!U.hasText()) return `<div class="nv">${U.bar(U.novelTitle())}<div class="nv-body">${U.noSample()}</div></div>`;
    const { open } = issues();
    const errs = open.filter((x) => x.sev === "error").length;
    const tabs = [["graph", `${ic("graph")}Graph`], ["list", `${ic("frames")}List`], ["review", `${ic("alert")}Review${open.length ? ` <span class="pill-n ${errs ? "is-warn" : ""}">${open.length}</span>` : ""}`]];
    const body = v.tab === "graph" ? graphTab() : v.tab === "list" ? listTab(open) : reviewTab();
    return `<div class="nv">
      ${U.bar(U.seg("kb-tab", tabs, v.tab),
        `<label class="bar-field" data-tip="Hide all claims in chapters after this point"><span>${ic("lock")}Read up to</span><select id="kb-upto" class="select" data-on="kb-upto">${U.options(N().chapters.map((c) => [c.n, `Ch.${c.n} · ${c.title}`]), upTo())}</select></label>
         <button class="btn btn-sm" data-act="kb-onto">${ic("file-code")}ontology.yml</button>
         <button class="btn btn-sm btn-primary" data-act="kb-analyze">${ic("graph")}Analyze…</button>`)}
      <div class="kb-main"><div class="kb-tabbody">${body}</div></div>
    </div>`;
  }

  /* ---------------- Graph ---------------- */
  function graphTab() {
    V().g ||= G.fresh();
    return `<div class="kb-graph" id="kbg">${G.markup(V().g, TYPES_ALL)}</div>`;
  }

  let graphApi = null;
  function mount(root) {
    graphApi = null;
    const host = A.$("#kbg", root);
    if (host && V().tab === "graph") {
      graphApi = G.mount(host, {
        state: V().g,
        getData: (f) => {
          const ents = items().filter((i) => i.kind === "entity" && visible(i));
          const nodes = ents.map((e) => ({ id: e.id, label: e.name, type: e.type }));
          const ids = new Set(ents.map((e) => e.id));
          const links = items().filter((r) => r.kind === "relation" && visible(r) && ids.has(r.from) && ids.has(r.to)).map((r) => ({ id: r.id, a: r.from, b: r.to, label: r.label, cert: r.cert, kind: "rel" }));
          if (f.types.event) {
            items().filter((x) => x.kind === "event" && visible(x)).forEach((ev) => {
              nodes.push({ id: ev.id, label: ev.name, type: "event" });
              const paras = new Set(ev.ev.map((e) => e.p));
              ents.filter((e) => e.ev.some((x) => paras.has(x.p))).forEach((e) => links.push({ id: `co:${ev.id}:${e.id}`, a: ev.id, b: e.id, label: "", cert: "text", kind: "co" }));
            });
          }
          return { nodes, links };
        },
        selId: () => V().sel,
        issueIds: () => issueIds(issues().open),
        onSelect: (id) => { V().sel = id; A.renderInspector(); graphApi?.applySel(); },
        onOpen: (id) => { V().sel = id; A.renderInspector(); graphApi?.applySel(); KBE.open({ ids: [id] }); },
      });
    }
  }

  /* ---------------- List ---------------- */
  function listTab(open) {
    const v = V();
    const ent = v.list === "entity";
    const needle = v.q.trim().toLowerCase();
    const flagged = new Set(open.flatMap((x) => x.ids));
    const pool = items().filter((i) => (ent ? i.kind === "entity" : i.kind !== "entity") && itemCh(i) <= upTo());
    const list = pool.filter((i) => (v.fType === "all" || typeOf(i) === v.fType) && (v.fCert === "all" || i.cert === v.fCert) && (v.fStatus === "all" || i.status === v.fStatus)
      && (!needle || nm(i).toLowerCase().includes(needle)) && (!v.onlyIssues || flagged.has(i.id)));
    const factCount = (e) => items().filter((x) => x.kind !== "entity" && x.status !== "rejected" && (x.from === e.id || x.to === e.id || (x.kind === "event" && x.ev.some((a) => e.ev.some((b) => b.p === a.p))))).length;
    const rows = list.map((i) => {
      const n = open.filter((x) => x.ids.includes(i.id));
      const warn = n.length ? `<span class="iss-dot ${n.some((x) => x.sev === "error") ? "is-err" : "is-warn"}" title="${n.length} issues to review in Review">${ic("alert")}${n.length}</span>` : "";
      return `<tr class="${v.sel === i.id ? "is-selected" : ""} ${i.status === "rejected" ? "is-muted" : ""}" tabindex="0" data-act="kb-sel" data-id="${i.id}" data-dbl="kb-edit">
        <td>${typeTag(i)}</td>
        <td><div class="t-ink">${esc(nm(i))}</div>${ent && i.summary ? `<div class="t-sm t-mute ellip">${esc(i.summary)}</div>` : ""}${!ent && i.kind === "event" ? `<div class="t-sm t-mute">${esc(i.when)}</div>` : ""}</td>
        ${ent ? `<td class="num mono t-mute">${factCount(i)}</td>` : ""}
        <td>${U.certBadge(i.cert)}</td><td><span class="badge ${STATUS[i.status][0]}">${STATUS[i.status][1]}</span></td><td class="cen">${warn}</td>
        <td class="row-actions"><button class="btn btn-icon btn-sm" data-act="kb-ok" data-id="${i.id}" aria-label="Confirm" data-tip="Confirm" ${i.status === "confirmed" ? "disabled" : ""}>${ic("check")}</button>
          <button class="btn btn-icon btn-sm" data-act="kb-edit" data-id="${i.id}" aria-label="Edit" data-tip="Edit">${ic("pen")}</button>
          <button class="btn btn-icon btn-sm" data-act="kb-no" data-id="${i.id}" aria-label="Rejected" data-tip="Rejected" ${i.status === "rejected" ? "disabled" : ""}>${ic("x")}</button></td></tr>`;
    }).join("");
    const nEnt = items().filter((i) => i.kind === "entity" && itemCh(i) <= upTo()).length;
    const nFact = items().filter((i) => i.kind !== "entity" && itemCh(i) <= upTo()).length;
    const bulk = items().filter((i) => i.status === "proposed" && i.cert === "text" && !i.stale && !flagged.has(i.id));
    const typeOpts = ent ? Object.entries(O().entityTypes).map(([k, x]) => [k, x.label]) : [["relation", "Relation"], ["event", "Events"]];
    return `<div class="tl-sub is-wrap">${U.seg("kb-list", [["entity", `Entity ${nEnt}`], ["fact", `Fact ${nFact}`]], v.list)}
        <label class="search"><span class="sr-only">Search</span><input id="kb-q" class="input" type="search" value="${esc(v.q)}" placeholder="${ent ? "Search entities…" : "Search facts…"}" data-on="kb-q"></label>
        <select class="select" data-on="kb-ft" aria-label="Type">${U.options([["all", "All types"], ...typeOpts], v.fType)}</select>
        <select class="select" data-on="kb-fc" aria-label="Provenance">${U.options([["all", "All provenances"], ["text", "Stated in text"], ["claim", "Character’s words"], ["inferred", "AI inference"]], v.fCert)}</select>
        <select class="select" data-on="kb-fs" aria-label="Status">${U.options([["all", "All statuses"], ["proposed", "Proposed"], ["confirmed", "Confirmed"], ["edited", "Edited"], ["rejected", "Rejected"]], v.fStatus)}</select>
        <label class="check"><input type="checkbox" data-on="kb-fi" ${v.onlyIssues ? "checked" : ""}><span>Only items with conflicts</span></label>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-act="kb-bulk" ${bulk.length ? "" : "disabled"} data-tip="Items in proposed status, with textual evidence and no conflicts">${ic("check")}Confirm safe items (${bulk.length})</button>
        <button class="btn btn-sm" data-act="kb-new" data-v="${ent ? "entity" : "fact"}">${ic("plus")}Add ${ent ? "entity" : "fact"}</button></div>
      <div class="kb-table" data-keep="kb-list">${list.length
    ? `<table class="table"><thead><tr><th>Type</th><th>${ent ? "Entity" : "Fact"}</th>${ent ? `<th class="num" title="Related fact count">Fact</th>` : ""}<th>Provenance</th><th>Status</th><th class="cen">${ic("alert")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : U.empty("No items match", "Try removing some filters.", `<button class="btn" data-act="kb-clear">Clear filters</button>`)}</div>`;
  }

  /* ---------------- Review (deterministic check) ---------------- */
  function reviewTab() {
    const v = V();
    const { open, ignored } = issues();
    const rules = C.perRule(open);
    const shown = (v.rf === "open" ? open : ignored).filter((x) => v.rrule === "all" || x.rule === v.rrule);
    const chip = (r) => `<button type="button" class="rule ${r.n ? (r.severity === "error" ? "is-err" : "is-warn") : "is-ok"} ${v.rrule === r.rule ? "is-active" : ""}" data-act="kb-rule" data-v="${r.rule}" title="${esc(r.desc)}">
        ${r.n ? `<b>${r.n}</b>` : ic("check")}<span>${esc(r.label)}</span></button>`;
    return `<div class="rv-rules">${rules.map(chip).join("")}</div>
      <div class="tl-sub">${U.seg("kb-rf", [["open", `Open ${open.length}`], ["ignored", `Ignored ${ignored.length}`]], v.rf)}
        ${v.rrule !== "all" ? `<button class="btn btn-sm btn-ghost" data-act="kb-rule" data-v="all">${ic("x")}Clear rule filter</button>` : ""}
        <span class="spacer"></span><span class="t-sm t-mute">${ic("check")} The checker runs on code, not an LLM. ${Object.keys(O().rules).length} rules from ontology.yml.</span></div>
      <div class="tl-list rv-list" data-keep="kb-rv">${shown.length ? shown.map(issueCard).join("")
    : U.empty(v.rf === "open" ? "No conflicts" : "No issues ignored yet", v.rf === "open" ? "The analysis result matches the ontology and the source text. Running an analysis or editing content will re-check automatically." : "Ignored issues will appear here and can be undone.")}</div>`;
  }

  function issueCard(x) {
    const r = O().rules[x.rule];
    const its = x.ids.map(byId).filter(Boolean);
    const chips = its.map((i) => `<button type="button" class="chip" data-act="kb-sel-id" data-id="${i.id}">${esc(typeName(typeOf(i)))} · ${esc(nm(i))}</button>`).join("");
    let extra = "";
    const d = x.data || {};
    if (x.rule === "evidence_quote" && d.q) {
      extra = `<div class="iss-ev"><span class="eyebrow">Evidence given by the LLM</span><blockquote class="quote is-bad">${esc(d.q)}</blockquote>${d.source ? `<span class="eyebrow">Source paragraph ${U.ref(d.p)}</span><blockquote class="quote">${esc(d.source)}</blockquote>` : ""}</div>`;
    } else if (x.rule === "attribute_single") {
      extra = `<div class="iss-ev">${d.list.map((a) => `<div class="kb-relrow"><span class="t-ink">${esc(C.attrLabel(a.k))}: “${esc(a.v)}”</span>${a.p ? U.ref(a.p) : ""}</div>`).join("")}</div>`;
    } else if (x.rule === "relation_unique") {
      extra = "";
    }
    const btn = (act, label, data = "", cls = "") => `<button class="btn btn-sm ${cls}" data-act="${act}" ${data}>${label}</button>`;
    const first = x.ids[0];
    const acts = [];
    if (x.rule === "evidence_quote") {
      if (d.q !== undefined) acts.push(btn("kb-fx-ev", `${ic("x")}Delete wrong evidence`, `data-id="${first}" data-i="${d.idx}"`));
      acts.push(btn("kb-fix", `${ic("pen")}Edit…`, `data-k="${esc(x.id)}"`), btn("kb-fx-rej", "Reject item", `data-id="${first}"`));
    } else if (x.rule === "attribute_single") {
      [...new Set(d.list.map((a) => a.v))].forEach((v) => acts.push(btn("kb-fx-attr", `Keep “${esc(v)}”`, `data-id="${first}" data-k="${d.k}" data-v="${esc(v)}"`)));
      acts.push(btn("kb-fix", `${ic("pen")}Edit…`, `data-k="${esc(x.id)}"`));
    } else if (x.rule === "entity_duplicate") {
      const [a, b] = its;
      acts.push(btn("kb-fx-merge", `${ic("swap")}Merge “${esc(b.name)}” into “${esc(a.name)}”`, `data-a="${a.id}" data-b="${b.id}"`), btn("kb-fx-merge", `Merge “${esc(a.name)}” into “${esc(b.name)}”`, `data-a="${b.id}" data-b="${a.id}"`), btn("kb-fix", `${ic("pen")}Edit…`, `data-k="${esc(x.id)}"`));
    } else if (x.rule === "relation_unique") {
      acts.push(btn("kb-fix", `${ic("pen")}Edit…`, `data-k="${esc(x.id)}"`));
    } else if (x.rule === "source_stale") {
      acts.push(btn("kb-keep", "Keep as is", `data-id="${first}"`), btn("kb-redo", `${ic("refresh")}Re-analyze…`, `data-id="${first}"`));
    } else {
      acts.push(btn("kb-fix", `${ic("pen")}Edit…`, `data-k="${esc(x.id)}"`), btn("kb-fx-rej", "Reject item", `data-id="${first}"`));
    }
    const dismissBtn = V().rf === "ignored" ? btn("kb-restore", "Undo", `data-k="${esc(x.id)}"`)
      : x.rule === "source_stale" ? "" : btn("kb-dismiss", x.rule === "entity_duplicate" ? "Keep both" : "Ignore", `data-k="${esc(x.id)}"`, "btn-ghost");
    return `<div class="card iss is-${x.sev}" data-act="kb-sel-id" data-id="${first}">
      <div class="iss-top"><span class="badge ${x.sev === "error" ? "badge-danger" : "badge-warning"}">${x.sev === "error" ? "ERROR" : "WARNING"}</span><b>${esc(r.label)}</b><span class="spacer"></span><span class="mono t-mute">${x.rule}</span></div>
      <p>${esc(x.msg)}</p><div class="iss-items">${chips}</div>${extra}
      <div class="w-act">${acts.join("")}${dismissBtn}</div></div>`;
  }

  /* ---------------- Inspector ---------------- */
  const evidenceHtml = (it) => it.ev.map((e) => `<div class="kb-ev"><blockquote class="quote">${esc(e.q)}</blockquote>${U.ref(e.p)}</div>`).join("") || `<p class="t-sm t-mute">No evidence yet.</p>`;

  function detail(it, open) {
    const attrs = it.kind === "entity" && it.attrs.length
      ? `<dl class="kv">${it.attrs.map((a) => `<dt>${esc(C.attrLabel(a.k))}</dt><dd>${esc(a.v)} ${a.p ? U.ref(a.p) : ""}</dd>`).join("")}</dl>` : "";
    const ends = it.kind === "relation"
      ? `<div class="kb-rel">${byId(it.from) ? `<button class="chip" data-act="kb-sel-id" data-id="${it.from}">${esc(byId(it.from).name)}</button>` : "?"}<span>—${esc(it.label)}→</span>${byId(it.to) ? `<button class="chip" data-act="kb-sel-id" data-id="${it.to}">${esc(byId(it.to).name)}</button>` : "?"}</div>` : "";
    const rel = it.kind === "entity" ? items().filter((r) => r.kind === "relation" && r.status !== "rejected" && (r.from === it.id || r.to === it.id)) : [];
    const relHtml = rel.length ? `<span class="eyebrow">Relation</span>${rel.map((r) => { const out = r.from === it.id; const o = byId(out ? r.to : r.from); return `<div class="kb-relrow"><span class="t-mute">${out ? "→" : "←"}</span><span>${esc(r.label)}</span>${o ? `<button class="chip" data-act="kb-sel-id" data-id="${o.id}">${esc(o.name)}</button>` : ""}</div>`; }).join("")}` : "";
    const mine = open.filter((x) => x.ids.includes(it.id) || (it.kind === "entity" && x.ids.some((id) => { const r = byId(id); return r && r.kind === "relation" && (r.from === it.id || r.to === it.id); })));
    const conflicts = mine.length ? `<section class="ins-sec"><span class="eyebrow">Conflicts (${mine.length})</span>${mine.map((x) => `<div class="iss-mini is-${x.sev}">${ic("alert")}<span>${esc(x.msg)}</span></div>`).join("")}
        <button class="btn btn-sm" data-act="kb-tab-review">View in Review</button></section>` : "";
    return `<section class="ins-sec">${typeTag(it)}<h3 class="t-display-xs">${esc(nm(it))}</h3>
        <div class="row-badges">${U.certBadge(it.cert)}<span class="badge ${STATUS[it.status][0]}">${STATUS[it.status][1]}</span></div>
        <div class="row-badges"><button class="btn btn-sm btn-primary" data-act="kb-edit" data-id="${it.id}">${ic("pen")}Edit…</button>
          <button class="btn btn-sm" data-act="kb-ok" data-id="${it.id}" ${it.status === "confirmed" ? "disabled" : ""}>${ic("check")}Confirm</button>
          <button class="btn btn-sm" data-act="kb-no" data-id="${it.id}" ${it.status === "rejected" ? "disabled" : ""}>Rejected</button></div>
        ${it.stale ? `<div class="ld-warn">${ic("alert")}<span>${esc(it.stale)}</span></div>` : ""}
        ${it.summary ? `<p class="t-sm">${esc(it.summary)}</p>` : ""}${ends}${attrs}${it.when ? U.kv([["Time", esc(it.when)]]) : ""}${relHtml}</section>
      ${conflicts}<section class="ins-sec"><span class="eyebrow">Evidence in the text</span>${evidenceHtml(it)}</section>`;
  }

  function inspector(id) {
    U.bind(id);
    if (!U.hasText()) return U.inspectorNovel();
    const { open } = issues();
    const sel = byId(V().sel);
    const by = (s) => items().filter((i) => i.status === s).length;
    const summary = U.insSec("Knowledge", U.kv([
      ["Analyzed", U.frac("graph", U.analyzedCount(), N().chapters.length, "Analyzed chapters")],
      ["Entity", items().filter((i) => i.kind === "entity" && i.status !== "rejected").length],
      ["Fact", items().filter((i) => i.kind !== "entity" && i.status !== "rejected").length],
      ["Proposed", by("proposed")], ["Confirmed", by("confirmed")],
      ["Conflicts", open.length ? `<span class="badge ${open.some((x) => x.sev === "error") ? "badge-danger" : "badge-warning"}">${open.length}</span>` : "0"],
      ["Ontology", `v${O().version} <a data-act="kb-onto" tabindex="0">Xem</a>`],
    ]));
    return `${sel ? detail(sel, open) : `<div class="ins-empty"><p>Choose a node in the Graph or a row in the List to see details.</p></div>`}${summary}`;
  }

  A.VIEWS.knowledge = { fill: true, render: view, mount, inspector };

  U.openKnowledge = (tab, id) => {
    const v = V();
    if (tab && tab !== "analyze") v.tab = tab;
    if (id) v.sel = id;
    U.openNovelTab("knowledge", N().reader.novel);
    if (tab === "analyze") openAnalyze();
  };

  /* ---------------- Dialog: analysis ---------------- */
  const AD = { mode: "missing", from: 1, to: 1, overwrite: false, provider: "claude", src: "src" };

  /** Languages that have content to analyze: the original and (if any) the translation. */
  function sourceLangs() {
    const novel = U.current();
    const nTr = Object.values(N().tr.chapters).filter((t) => !t.noSample).length;
    return [["src", `${novel.langName} (original)`], ...(nTr ? [["tr", `${N().tr.lang} (translation · ${nTr}/${N().chapters.length} chapters)`]] : [])];
  }
  const srcLabel = () => (AD.src === "tr" ? N().tr.lang : U.current().langName);
  /** Chapters that have content in the chosen source language. */
  const hasSource = (n) => AD.src === "src" || !!N().tr.chapters[n];

  function plan() {
    const all = N().chapters.map((c) => c.n);
    const done = (n) => K().analyzed[n] === "done";
    const inRange = AD.mode === "range" ? all.filter((n) => n >= AD.from && n <= AD.to) : all;
    const ow = AD.mode !== "missing" && AD.overwrite;
    const wanted = ow ? inRange : inRange.filter((n) => !done(n));
    const run = wanted.filter(hasSource);
    const noSrc = wanted.filter((n) => !hasSource(n));
    return { run, noSrc, skip: inRange.filter((n) => !wanted.includes(n)), over: run.filter(done), missing: all.filter((n) => !done(n)) };
  }

  function openAnalyze(preset = {}) {
    const all = N().chapters.map((c) => c.n);
    const miss = all.filter((n) => K().analyzed[n] !== "done");
    Object.assign(AD, { mode: miss.length ? "missing" : "range", from: miss[0] || 1, to: all[all.length - 1], overwrite: false, src: "src" }, preset);
    drawAnalyze();
  }

  function drawAnalyze() {
    const p = plan();
    const chOpts = (cur) => U.options(N().chapters.map((c) => [c.n, `Ch.${c.n} · ${c.title}`]), cur);
    const prov = U.provider(AD.provider);
    const est = p.run.length ? U.estimate(p.run, { outRatio: 0.9, guide: 700 }) : null;
    const mode = (id, title, sub, extra = "") => `<label class="opt ${AD.mode === id ? "is-on" : ""}"><input type="radio" name="an-mode" value="${id}" data-on="kb-an-mode" ${AD.mode === id ? "checked" : ""}>
      <span class="opt-b"><b>${title}</b><span class="t-sm t-mute">${sub}</span>${extra}</span></label>`;
    A.modal({
      title: "Analyze knowledge", eyebrow: window.DS.CAP["04"], cls: "modal-lg",
      body: `<div class="opts">
          ${mode("missing", "Missing chapters", `${p.missing.length ? `${p.missing.length} chapters not analyzed (Ch.${U.rangeText(p.missing)})` : "No chapters missing"}`)}
          ${mode("range", "Chapter range", "Choose the start and end chapters", AD.mode === "range" ? `<span class="opt-row"><select class="select" data-on="kb-an-from" aria-label="From chapter">${chOpts(AD.from)}</select><span class="t-mute">to</span><select class="select" data-on="kb-an-to" aria-label="To chapter">${chOpts(AD.to)}</select></span>` : "")}
          ${mode("full", "All", `${N().chapters.length} chapters`)}
        </div>
        ${AD.mode !== "missing" ? `<label class="check"><input type="checkbox" data-on="kb-an-ow" ${AD.overwrite ? "checked" : ""}><span><b>Overwrite existing results</b><br><span class="t-sm t-mute">Re-analyze chapters that already have results. Claims you confirmed or edited are kept.</span></span></label>` : ""}
        <div class="card side-card an-sum">
          ${U.kv([["Will analyze", p.run.length ? `<b class="t-ink">${p.run.length} chapters</b> · Ch.${U.rangeText(p.run)}` : `<span class="t-mute">No chapters</span>`], ["Source language", esc(srcLabel())], ["Keep as is", p.skip.length ? `${p.skip.length} chapters already have results · Ch.${U.rangeText(p.skip)}` : "—"],
      ...(est ? [["Words", fmt(est.words)], ["Token", `${fmt(est.tin)} in · ${fmt(est.tout)} out`], ["Cost", `${U.money(est.cost)} · ~${est.minutes} min`]] : [])])}
          ${p.noSrc.length ? `<div class="ld-warn">${ic("alert")}<span>${p.noSrc.length} chapters have no ${esc(srcLabel())} content and are skipped · Ch.${U.rangeText(p.noSrc)}.</span></div>` : ""}
          ${p.over.length ? `<div class="ld-warn">${ic("alert")}<span>${p.over.length} chapters that already have results will be overwritten.</span></div>` : ""}
        </div>
        <div class="form-2"><div class="field"><label for="kb-an-prov">Provider</label>${U.providerSelect("kb-an-prov", AD.provider)}</div>
          <div class="field"><label for="kb-an-lang">Source language</label><select id="kb-an-lang" class="select" data-on="kb-an-lang">${U.options(sourceLangs(), AD.src)}</select></div></div>
        <p class="t-sm t-mute an-src-hint">The analysis reads content in the chosen source language. Chapters with no content in that language are skipped.</p>
        <div class="an-onto">${ic("file-code")}<span>Analyze with <b>ontology.yml</b> v${O().version}: ${Object.keys(O().entityTypes).length} entity types, ${Object.keys(O().predicates).length} relations.</span><a data-act="kb-onto" tabindex="0">Xem ontology.yml</a></div>
        ${!prov.ok ? `<p class="field-err">The selected provider is not installed on this machine.</p>` : ""}`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="kb-an-run" ${p.run.length && prov.ok ? "" : "disabled"}>${ic("graph")}Start analysis${p.run.length ? ` (${p.run.length} chapters)` : ""}</button>`,
    });
  }

  function finishAnalysis(n) {
    K().analyzed[n] = "done";
    (K().srcLang ||= {})[n] = AD.src;
    if (n === 3 && !K().ch3Added) {
      K().ch3Added = true;
      K().ch3.forEach((x) => items().push(JSON.parse(JSON.stringify(x))));
    }
    items().forEach((i) => { if (i.stale && i.ev.some((e) => NV.chOf(e.p) === n)) i.stale = null; });
    K().log.unshift({ date: A.stamp(), text: `Analysis of Ch.${n} complete.` });
    A.renderExplorer();
  }

  function startAnalysis() {
    const p = plan();
    if (!p.run.length) return;
    A.closeModal();
    A.startPipeline({
      kind: "analyze", label: `Analyze ${p.run.length} chapters`, detail: `${U.nameOf(U.current())} · Ch.${U.rangeText(p.run)} · source ${srcLabel()}${p.over.length ? " · overwrite" : ""}`,
      tasks: p.run.map((n) => ({ key: `c${n}`, label: `Ch.${n}` })), onTask: (t) => finishAnalysis(+t.key.slice(1)),
    });
    A.rerender();
  }

  /* ---------------- Dialog: ontology.yml ---------------- */
  function yamlHtml(text) {
    return text.split("\n").map((line) => {
      let h = esc(line);
      if (/^\s*#/.test(line)) return `<span class="y-c">${h}</span>`;
      h = h.replace(/^(\s*)([A-Za-z_]+)(:)/, '$1<span class="y-k">$2</span>$3');
      h = h.replace(/([{,]\s)([a-z_]+)(:)/g, '$1<span class="y-k">$2</span>$3');
      return h;
    }).join("\n");
  }
  function openOntology() {
    const o = O();
    const text = C.yaml();
    A.modal({
      title: "ontology.yml", eyebrow: `${U.nameOf(U.current())} · v${o.version}`, cls: "modal-xl",
      body: `<div class="onto-sum">${[["Entity types", Object.keys(o.entityTypes).length], ["Attributes", Object.keys(o.attributes).length], ["Relation", Object.keys(o.predicates).length], ["Check rules", Object.keys(o.rules).length]].map(([l, n]) => `<div><b>${n}</b><span>${l}</span></div>`).join("")}</div>
        <p class="t-sm t-mute">Ontology tells the LLM what to extract, and tells the checker in the Review tab what counts as a contradiction. Path: <span class="path">novels\\${esc(U.current().id)}\\ontology.yml</span>. Edit the file with an external editor; changes apply to the next analysis and check.</p>
        <pre class="yaml" tabindex="0">${yamlHtml(text)}</pre>`,
      foot: `<button class="btn" data-act="kb-onto-open">${ic("file-code")}Open in the default editor</button><button class="btn" data-act="kb-onto-copy">Copy</button><span class="spacer"></span><button class="btn btn-primary" data-act="close-modal">Close</button>`,
    });
  }

  /* ---------------- actions ---------------- */
  const setStatus = (id, status) => {
    const it = byId(id);
    it.status = status;
    if (status === "confirmed") it.stale = null;
    A.rerender();
  };
  const fixed = (msg) => { A.rerender(); A.toast(msg); };

  Object.assign(A.ACT, {
    "kb-tab": (el) => { V().tab = el.dataset.v; A.rerender(); },
    "kb-tab-review": () => { V().tab = "review"; A.rerender(); },
    "kb-list": (el) => { Object.assign(V(), { list: el.dataset.v, fType: "all" }); A.rerender(); },
    "kb-sel": (el) => { V().sel = el.dataset.id; A.rerender(); },
    "kb-sel-id": (el) => { V().sel = el.dataset.id; A.renderInspector(); A.$$("#editor .is-selected").forEach((n) => n.classList.remove("is-selected")); },
    "kb-ok": (el, e) => { e?.stopPropagation(); setStatus(el.dataset.id, "confirmed"); },
    "kb-no": (el, e) => { e?.stopPropagation(); setStatus(el.dataset.id, "rejected"); },
    "kb-edit": (el, e) => { e?.stopPropagation(); KBE.open({ ids: [el.dataset.id] }); },
    "kb-fix": (el) => {
      const issue = issues().open.find((x) => x.id === el.dataset.k);
      if (issue) KBE.open({ ids: issue.ids, issue });
    },
    "kb-new": (el) => KBE.open({ add: el.dataset.v === "entity" ? "entity" : "relation" }),
    "kb-bulk": () => {
      const flagged = new Set(issues().open.flatMap((x) => x.ids));
      const list = items().filter((i) => i.status === "proposed" && i.cert === "text" && !i.stale && !flagged.has(i.id));
      list.forEach((i) => { i.status = "confirmed"; });
      A.rerender();
      A.toast(`Confirmed ${list.length} claims.`);
    },
    "kb-clear": () => { Object.assign(V(), { fType: "all", fCert: "all", fStatus: "all", q: "", onlyIssues: false }); A.rerender(); },
    "kb-rule": (el) => { V().rrule = V().rrule === el.dataset.v ? "all" : el.dataset.v; A.rerender(); },
    "kb-rf": (el) => { V().rf = el.dataset.v; A.rerender(); },
    "kb-dismiss": (el) => { C.dismiss(el.dataset.k); fixed("Issue ignored."); },
    "kb-restore": (el) => { C.restore(el.dataset.k); fixed("Undone."); },
    "kb-fx-ev": (el) => { C.removeEvidence(el.dataset.id, +el.dataset.i); fixed("Wrong evidence deleted."); },
    "kb-fx-rej": (el) => { C.reject(el.dataset.id); fixed("Item rejected."); },
    "kb-fx-attr": (el) => { C.keepAttr(el.dataset.id, el.dataset.k, el.dataset.v); fixed(`Kept “${el.dataset.v}”.`); },
    "kb-fx-merge": (el) => { const a = byId(el.dataset.a); const b = byId(el.dataset.b); C.merge(a.id, b.id); V().sel = a.id; fixed(`Merged “${b.name}” into “${a.name}”.`); },
    "kb-keep": (el) => {
      const it = byId(el.dataset.id);
      it.stale = null;
      K().log.unshift({ date: A.stamp(), text: `Kept “${nm(it)}” as is after the source changed.` });
      fixed("Marked as still correct.");
    },
    "kb-redo": (el) => {
      const chs = byId(el.dataset.id).ev.map((e) => NV.chOf(e.p));
      openAnalyze({ mode: "range", from: Math.min(...chs), to: Math.max(...chs), overwrite: true });
    },
    "kb-analyze": () => openAnalyze(),
    "kb-an-run": startAnalysis,
    "kb-onto": openOntology,
    "kb-onto-open": () => {
      // The prototype runs in a browser so it cannot call a shell. Download the file so the operating system opens it in the default editor; the desktop version opens the file in the workspace directly.
      const url = URL.createObjectURL(new Blob([C.yaml()], { type: "text/yaml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "ontology.yml";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      A.toast("Prototype: downloaded ontology.yml. The desktop version opens the file in the system’s default editor.", "info");
    },
    "kb-onto-copy": () => { try { navigator.clipboard.writeText(C.yaml()); A.toast("Copied ontology.yml."); } catch { A.toast("Could not copy.", "warning"); } },
  });

  Object.assign(A.ON, {
    "kb-q": (el) => { V().q = el.value; A.rerender(); },
    "kb-ft": (el) => { V().fType = el.value; A.rerender(); },
    "kb-fc": (el) => { V().fCert = el.value; A.rerender(); },
    "kb-fs": (el) => { V().fStatus = el.value; A.rerender(); },
    "kb-fi": (el) => { V().onlyIssues = el.checked; A.rerender(); },
    "kb-upto": (el) => { K().upTo = +el.value; A.rerender(); },
    "kb-an-mode": (el) => { AD.mode = el.value; drawAnalyze(); },
    "kb-an-from": (el) => { AD.from = +el.value; if (AD.to < AD.from) AD.to = AD.from; drawAnalyze(); },
    "kb-an-to": (el) => { AD.to = +el.value; if (AD.from > AD.to) AD.from = AD.to; drawAnalyze(); },
    "kb-an-ow": (el) => { AD.overwrite = el.checked; drawAnalyze(); },
    "kb-an-prov": (el) => { AD.provider = el.value; drawAnalyze(); },
    "kb-an-lang": (el) => { AD.src = el.value; drawAnalyze(); },
  });

  // Double-click a row in the List to edit.
  document.addEventListener("dblclick", (e) => {
    const tr = e.target.closest("tr[data-dbl]");
    if (!tr || e.target.closest("button")) return;
    KBE.open({ ids: [tr.dataset.id] });
  });
})();
