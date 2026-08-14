(function () {
  const A = window.DSApp;
  const U = window.NVU;
  const NV = window.NV;
  const { esc, ic } = A;
  const { N, ui, fmt } = U;

  const CAP = window.DS.CAP["03"];
  const T = () => N().tr;
  const V = () => ui("tl", { step: "dict", picks: {}, ch: 1, onlyReview: false, panel: false, wfilter: "open", dq: "", cq: "", cf: "all", nd: null, edit: null, noteFor: null, reviewed: {}, reviewNote: "", focus: null });
  /* Repeating flow: dictionary → guidelines → translate → results → warnings → (back to dictionary). */
  const STEPS = [
    { id: "dict", label: "Dictionary", icon: "book", hint: "Lock in how proper names, place names and terms are translated before translating." },
    { id: "guide", label: "Guidelines", icon: "pen", hint: "Purpose, readers, tone, forms of address and general conventions for the AI." },
    { id: "trans", label: "Translate", icon: "lang", hint: "Choose chapters, see the estimate, then run the translation pipeline." },
    { id: "result", label: "Results", icon: "frames", hint: "Read side by side, edit in place, take notes per passage." },
    { id: "warn", label: "Warnings", icon: "alert", hint: "The source, guidelines or dictionary changed after translating. Once handled you can start a new round." },
  ];
  const LIMIT = 300; // maximum rows rendered at once in the chapters table
  const LEGACY = { pipeline: "trans", read: "result" };
  const fresh = (id) => NV.viFresh[id] || NV.vi[id] || "";
  const PURPOSE = [["research", "Understand and research internally"], ["release", "Publish a translated edition"]];
  const TYPES = [["name", "Proper names"], ["place", "Place names"], ["org", "Organizations"], ["title", "Titles"], ["term", "Terms"]];
  const STATUS = {
    none: ["", "Not translated"], draft: ["badge-info", "Draft"], review: ["badge-warning", "Needs review"], running: ["badge-running", "Translating"],
  };
  const PARA_ST = { draft: ["", "Draft"], edited: ["badge-primary", "Edited"], review: ["badge-warning", "Needs review"] };
  const KIND = { source: ["badge-warning", "Source changed"], dict: ["badge-info", "Dictionary"], guideline: ["badge-info", "Guidelines"] };
  const purposeLabel = () => PURPOSE.find((p) => p[0] === T().guidelines.purpose)[1];

  function chapterStatusCell(n) {
    const st = U.trStatus(n);
    const pl = U.runningTask("translate", `c${n}`);
    if (st === "running") {
      return `<div class="tl-prog"><div class="progress" data-prog="${U.taskRef(pl, `c${n}`)}"><i style="width:${Math.round(pl.tasks.find((t) => t.key === `c${n}`).progress)}%"></i></div><span class="mono" data-prog-text="${U.taskRef(pl, `c${n}`)}">0%</span></div>`;
    }
    return `<span class="badge ${STATUS[st][0]}">${STATUS[st][1]}</span>`;
  }

  function pipelineTab() {
    const v = V();
    const picks = N().chapters.filter((c) => v.picks[c.n]).map((c) => c.n);
    const needle = v.cq.trim().toLowerCase();
    const shownAll = N().chapters.filter((c) => (!needle || `${c.n} ${c.title}`.toLowerCase().includes(needle)) && (v.cf === "all" || U.trStatus(c.n) === v.cf));
    const shown = shownAll.slice(0, LIMIT);
    const all = shownAll.length > 0 && shownAll.every((c) => v.picks[c.n]);
    const rows = shown.map((c) => {
      const st = U.trStatus(c.n);
      const busy = st === "running";
      return `<tr class="${v.picks[c.n] ? "is-selected" : ""}">
        <td class="chk"><input type="checkbox" data-on="tl-pick" data-n="${c.n}" ${v.picks[c.n] ? "checked" : ""} ${busy ? "disabled" : ""} aria-label="Select chapter ${c.n}"></td>
        <td class="mono t-mute">${String(c.n).padStart(2, "0")}</td>
        <td class="t-ink">${esc(c.title)}</td>
        <td class="num">${fmt(c.words)}</td>
        <td class="tl-st">${chapterStatusCell(c.n)}</td>
        <td class="row-actions">${N().tr.chapters[c.n] ? `<button class="btn btn-sm" data-act="tl-open-read" data-n="${c.n}">Read</button>` : ""}</td>
      </tr>`;
    }).join("");
    const more = shownAll.length > shown.length ? `<tr><td colspan="6" class="t-sm t-mute pad">Showing ${LIMIT}/${fmt(shownAll.length)} chapters. Use the search box or filters to narrow down.</td></tr>` : "";
    const est = picks.length ? U.estimate(picks) : null;
    const prov = U.provider(T().provider);
    const overwrite = picks.filter((n) => N().tr.chapters[n]);
    const ready = picks.length && prov.ok;
    const trial = picks[0];
    const trialEst = trial ? U.estimate([trial]) : null;
    const dictCount = T().dict.length;
    return `<div class="tl-split">
      <div class="tl-main" data-keep="tl-pipe">
        <div class="tl-sub is-inner is-wrap"><label class="search"><span class="sr-only">Search chapters</span><input id="tl-cq" class="input" type="search" value="${esc(v.cq)}" placeholder="Search chapters…" data-on="tl-cq"></label>
          <select class="select" data-on="tl-cf" aria-label="Status">${U.options([["all", "All statuses"], ["none", "Not translated"], ["draft", "Draft"], ["review", "Needs review"]], v.cf)}</select>
          <span class="t-sm t-mute">${fmt(shownAll.length)} chapters</span><span class="spacer"></span><button class="btn btn-sm" data-act="tl-pick-missing">Not translated</button><button class="btn btn-sm" data-act="tl-pick-review">Needs review</button><button class="btn btn-sm btn-ghost" data-act="tl-pick-none" ${picks.length ? "" : "disabled"}>Deselect</button></div>
        <table class="table"><thead><tr>
          <th class="chk"><input type="checkbox" data-on="tl-pick-all" ${all ? "checked" : ""} aria-label="Select all"></th><th>#</th><th>Chapters</th><th class="num">Words</th><th>Status</th><th></th>
        </tr></thead><tbody>${rows}${more}</tbody></table>
      </div>
      <aside class="tl-side" data-keep="tl-side">
        <div class="card side-card"><span class="eyebrow">Translation scope</span>
          ${U.kv([["Translation direction", `${esc(U.current().langName)} → ${esc(T().lang)}`], ["Guidelines", `v${T().guidelines.version} · ${esc(purposeLabel())} <a data-act="tl-step" data-v="guide" tabindex="0">Change</a>`], ["Dictionary", `${dictCount} entries <a data-act="tl-step" data-v="dict" tabindex="0">Xem</a>`], ["Selected", `${picks.length}/${N().chapters.length} chapters${est ? ` · ${fmt(est.words)} words` : ""}`]])}
          <div class="field"><label for="tl-provider">Provider</label>${U.providerSelect("tl-provider", T().provider)}</div>
        </div>
        <div class="card side-card"><span class="eyebrow">Estimate</span>
          ${est ? U.kv([["Input tokens", fmt(est.tin)], ["Token ra", fmt(est.tout)], ["Cost", U.money(est.cost)], ["Time", `~${est.minutes} min`]]) : `<p class="t-sm t-mute">Choose at least one chapter to see the estimate.</p>`}
          ${est ? `<p class="t-sm t-mute">Reference estimate, not including retries.</p>` : ""}
          ${overwrite.length ? `<div class="ld-warn">${ic("alert")}<span>${overwrite.length} chapters that already have a translation will be overwritten, including manual edits. Per-passage notes are kept.</span></div>` : ""}
          <div class="side-btns">
            <button class="btn" data-act="tl-start" data-v="trial" ${ready ? "" : "disabled"}>Trial-translate 1 chapter${trialEst ? ` · ${U.money(trialEst.cost)}` : ""}</button>
            <button class="btn btn-primary" data-act="tl-start" data-v="all" ${ready ? "" : "disabled"}>Start translating${picks.length ? ` (${picks.length} chapters)` : ""}</button>
          </div>
          ${!prov.ok ? `<p class="field-err">The selected provider is not installed on this machine.</p>` : ""}
        </div>
      </aside>
    </div>`;
  }

  function startTranslate(trial) {
    const v = V();
    const picks = N().chapters.filter((c) => v.picks[c.n]).map((c) => c.n);
    const list = trial ? [picks[0]] : picks;
    A.startPipeline({
      kind: "translate",
      label: trial ? `Trial-translate Ch.${list[0]}` : `Translate ${list.length} chapters`,
      detail: `${U.nameOf(U.current())} → ${T().lang}`,
      tasks: list.map((n) => ({ key: `c${n}`, label: `Ch.${n}` })),
      onTask: (t) => finishChapter(+t.key.slice(1)),
      onDone: () => { v.ch = list[0]; },
    });
    v.picks = {};
    A.rerender();
  }

  function finishChapter(n) {
    const old = T().chapters[n];
    const src = U.chapter(n).paras;
    const paras = {};
    if (src) src.forEach((p) => { paras[p.id] = { t: fresh(p.id), st: "draft", notes: old?.paras?.[p.id]?.notes || [] }; });
    T().chapters[n] = { status: "draft", paras, noSample: !src };
    A.renderExplorer();
    T().warnings.forEach((w) => { if (w.ch === n && w.state === "open") { w.state = "resolved"; w.by = "Re-translate the whole chapter"; } });
  }

  function readTab() {
    const v = V();
    const n = v.ch;
    const t = T().chapters[n];
    const sub = `<div class="tl-sub">
      <button class="btn btn-icon btn-sm" data-act="tl-prev" ${n <= 1 ? "disabled" : ""} aria-label="Previous chapter">${ic("chev-l")}</button>
${U.chapterJump("tl-ch", n, N().chapters.length, "", (k) => (T().chapters[k] ? "" : " (not translated)"))}
      <button class="btn btn-icon btn-sm" data-act="tl-next" ${n >= N().chapters.length ? "disabled" : ""} aria-label="Next chapter">${ic("chev-r")}</button>
      <label class="check"><input type="checkbox" data-on="tl-only" ${v.onlyReview ? "checked" : ""}><span>Only passages to review</span></label>
      <span class="spacer"></span>
      <button class="btn btn-sm ${v.panel ? "is-on" : ""}" data-act="tl-ai" ${t && !t.noSample ? "" : "disabled"}>${ic("spark")}Ask the Assistant to review</button>
    </div>`;
    if (!t) {
      return `${sub}<div class="tl-fill">${U.empty(`Ch.${n} has no translation yet`, "Select this chapter in the Translate step to create a draft.", `<button class="btn btn-primary" data-act="tl-pick-go" data-n="${n}">Translate this chapter</button>`)}</div>`;
    }
    if (t.noSample) {
      return `${sub}<div class="tl-fill">${U.empty("No sample translation", "This chapter ran the pipeline but the prototype only has sample passages for chapters 1–3.")}</div>`;
    }
    const src = U.chapter(n).paras;
    const show = src.filter((p) => !v.onlyReview || t.paras[p.id]?.st === "review");
    const pairs = show.map((p) => {
      const tp = t.paras[p.id];
      const idx = src.indexOf(p) + 1;
      const warns = U.openWarnings().filter((w) => w.p === p.id);
      const flash = v.focus === p.id ? "is-flash" : "";
      const editing = v.edit === p.id;
      const text = editing
        ? `<textarea id="tl-ta" class="textarea" rows="4">${esc(tp.t)}</textarea>
           <div class="tl-edit-foot"><span class="spacer"></span><button class="btn btn-sm" data-act="tl-cancel">Cancel</button><button class="btn btn-sm btn-primary" data-act="tl-save" data-p="${p.id}">Save</button></div>`
        : `<div class="tl-text" tabindex="0" data-act="tl-edit" data-p="${p.id}" title="Click to edit">${esc(tp.t)}</div>`;
      const notes = tp.notes.map((nt, i) => `<div class="tl-note">${ic("pen")}<span>${esc(nt.text)}</span><span class="mono t-mute">${esc(nt.date)}</span><button class="btn btn-icon btn-xs" data-act="tl-note-del" data-p="${p.id}" data-i="${i}" aria-label="Delete note">${ic("x")}</button></div>`).join("");
      const noteIn = v.noteFor === p.id
        ? `<div class="tl-note-in"><input id="tl-note-in" class="input" placeholder="Note for this passage…" data-enter="tl-note-add" data-p="${p.id}"><button class="btn btn-sm btn-primary" data-act="tl-note-add" data-p="${p.id}">Add</button><button class="btn btn-sm" data-act="tl-note-close">Cancel</button></div>`
        : "";
      const wl = warns.map((w) => `<div class="tl-warn">${ic("alert")}<span>${esc(w.reason)}</span><button class="btn btn-sm" data-act="tl-w-ok" data-id="${w.id}">Reviewed</button></div>`).join("");
      return `<div class="tl-pair is-${tp.st} ${flash}" id="tp-${p.id}">
        <div class="tl-src"><span class="rd-no">${idx}</span><span>${esc(p.t)}</span></div>
        <div class="tl-dst">${wl}${text}${notes}${noteIn}
          <div class="tl-tools"><span class="badge ${PARA_ST[tp.st][0]}">${PARA_ST[tp.st][1]}</span><span class="spacer"></span>
            <button class="btn btn-sm btn-ghost" data-act="tl-note-open" data-p="${p.id}">${ic("pen")}Note</button>
            <button class="btn btn-sm btn-ghost" data-act="tl-dict" data-p="${p.id}">${ic("book")}Add to dictionary</button></div>
        </div></div>`;
    }).join("");
    const ai = v.panel ? aiPanel(n) : "";
    return `${sub}<div class="tl-readwrap">
      <div class="tl-pairs" data-keep="tl-read"><div class="tl-head"><span>Original · ${esc(U.current().lang)}</span><span>Translation · ${esc(T().lang)}</span></div>
      ${pairs || `<div class="tl-fill">${U.empty("No passages to review", "All passages in this chapter have been reviewed.")}</div>`}</div>${ai}</div>`;
  }

  function aiPanel(n) {
    const v = V();
    const running = U.runningTask("review", "r1");
    const list = T().suggestions.filter((s) => s.ch === n);
    let body;
    if (running) {
      body = `<div class="ai-wait"><span class="dot dot-running"></span><span>The Assistant is reviewing Ch.${n}…</span><div class="progress" data-prog="${U.taskRef(running, "r1")}"><i style="width:0%"></i></div></div>`;
    } else if (!v.reviewed[n]) {
      body = `<p class="t-sm t-mute">This chapter has not been reviewed. Click “Ask the Assistant to review” to start.</p>`;
    } else if (!list.length) {
      body = `<p class="t-sm t-mute">No issues to handle found in Ch.${n}.</p>`;
    } else {
      body = list.map((s) => `<div class="card ai-card ${s.state !== "open" ? "is-done" : ""}">
        <div class="ai-top"><span class="badge badge-primary">${esc(s.kind)}</span>${U.ref(s.p, "tl")}${s.state === "applied" ? `<span class="badge badge-success">APPLIED</span>` : s.state === "dismissed" ? `<span class="badge">IGNORED</span>` : ""}</div>
        <p class="t-sm">${esc(s.text)}</p>
        <blockquote class="quote">${esc(s.quote)}</blockquote>
        <div class="field"><span class="eyebrow">Proposed</span><p class="t-sm t-ink">${esc(s.revise)}</p></div>
        ${s.state === "open" ? `<div class="ai-act"><button class="btn btn-sm btn-primary" data-act="tl-ai-apply" data-id="${s.id}">Apply</button><button class="btn btn-sm" data-act="tl-ai-skip" data-id="${s.id}">Ignore</button></div>` : ""}
      </div>`).join("");
    }
    return `<aside class="tl-ai" data-keep="tl-ai"><header class="tl-ai-head"><span class="eyebrow">Assistant suggestions · Ch.${n}</span><span class="spacer"></span><button class="btn btn-icon btn-sm" data-act="tl-ai-close" aria-label="Close">${ic("x")}</button></header>
      <p class="t-sm t-mute">${esc(v.reviewNote || "Default review: accurate meaning, complete content, consistent terminology, tone following the guidelines.")} The AI’s claims are only suggestions with evidence; you make the decision.</p>${body}</aside>`;
  }

  function dictStep() {
    const q = V().dq.trim().toLowerCase();
    const occ = (term) => N().chapters.reduce((a, c) => a + (c.paras || []).filter((p) => p.t.toLowerCase().includes(term.toLowerCase())).length, 0);
    const dict = T().dict.filter((d) => !q || `${d.src} ${d.dst} ${d.note}`.toLowerCase().includes(q));
    const typeOpts = (v) => U.options(TYPES, v);
    const cell = (d, f, label) => `<input class="input is-inline" value="${esc(d[f])}" data-change="tl-dict-f" data-id="${d.id}" data-f="${f}" aria-label="${label}" autocomplete="off">`;
    const rows = dict.map((d) => `<tr><td>${cell(d, "src", "Source term")}</td><td>${cell(d, "dst", "Translation")}</td>
      <td><select class="select is-inline" data-change="tl-dict-f" data-id="${d.id}" data-f="type" aria-label="Type">${typeOpts(d.type)}</select></td>
      <td>${cell(d, "note", "Note")}</td><td class="num mono t-mute">${occ(d.src)}</td>
      <td class="row-actions"><button class="btn btn-icon btn-sm" data-act="tl-dict-del" data-id="${d.id}" aria-label="Delete" data-tip="Delete">${ic("x")}</button></td></tr>`).join("");
    const nd = V().nd;
    const draftRow = nd ? `<tr class="is-draft"><td><input id="tl-nd-src" class="input is-inline" value="${esc(nd.src)}" placeholder="Source term" data-on="tl-nd" data-f="src" data-enter="tl-dict-add" aria-label="Source term" autocomplete="off"></td>
      <td><input id="tl-nd-dst" class="input is-inline" value="${esc(nd.dst)}" placeholder="Translation" data-on="tl-nd" data-f="dst" data-enter="tl-dict-add" aria-label="Translation" autocomplete="off"></td>
      <td><select class="select is-inline" data-on="tl-nd" data-f="type" aria-label="Type">${typeOpts(nd.type)}</select></td>
      <td><input class="input is-inline" value="${esc(nd.note)}" placeholder="Note" data-on="tl-nd" data-f="note" data-enter="tl-dict-add" aria-label="Note" autocomplete="off"></td><td></td>
      <td class="row-actions"><button class="btn btn-icon btn-sm" data-act="tl-dict-add" aria-label="Add" data-tip="Add (Enter)">${ic("check")}</button><button class="btn btn-icon btn-sm" data-act="tl-dict-cancel" aria-label="Cancel" data-tip="Cancel">${ic("x")}</button></td></tr>` : "";
    return `<div class="tl-sub"><label class="search"><span class="sr-only">Search the dictionary</span><input id="tl-dq" class="input" type="search" value="${esc(V().dq)}" placeholder="Search the dictionary…" data-on="tl-dq"></label>
        <span class="t-sm t-mute">${dict.length}/${T().dict.length} entries · v${T().guidelines.version}</span><span class="spacer"></span><button class="btn btn-sm btn-primary" data-act="tl-dict-new">${ic("plus")}Add entry</button></div>
      <div class="tl-main is-flat" data-keep="tl-dict"><table class="table"><thead><tr><th>Source term</th><th>Translation</th><th>Type</th><th>Note</th><th class="num">Passages</th><th></th></tr></thead><tbody>${draftRow}${rows || (nd ? "" : `<tr><td colspan="6">${U.empty("No entries", "Try another keyword.")}</td></tr>`)}</tbody></table></div>`;
  }

  function guideStep() {
    const g = T().guidelines;
    return `<div class="tl-center" data-keep="tl-guide"><div class="card side-card tl-form"><div class="ins-h"><span class="eyebrow">Translation guidelines · v${g.version}</span></div>
        <div class="field"><label for="g-purpose">Purpose</label><select id="g-purpose" class="select">${U.options(PURPOSE, g.purpose)}</select></div>
        <div class="field"><label for="g-audience">Readers</label><input id="g-audience" class="input" value="${esc(g.audience)}"></div>
        <div class="field"><label for="g-tone">Tone</label><input id="g-tone" class="input" value="${esc(g.tone)}"></div>
        <div class="field"><label for="g-pronouns">Forms of address</label><textarea id="g-pronouns" class="textarea" rows="2">${esc(g.pronouns)}</textarea></div>
        <div class="field"><label for="g-conv">Other conventions</label><textarea id="g-conv" class="textarea" rows="3">${esc(g.conventions)}</textarea></div>
        <p class="t-sm t-mute">Saving changes will raise warnings for translated chapters.</p>
        <div><button class="btn btn-primary" data-act="tl-guide-save">Save guidelines</button></div></div></div>`;
  }

  const wCount = () => U.openWarnings().length;

  function warnTab() {
    const v = V();
    const all = T().warnings;
    const list = all.filter((w) => v.wfilter === "all" || (v.wfilter === "open" ? w.state === "open" : w.state !== "open"));
    const cards = list.map((w) => {
      const loc = w.p ? U.ref(w.p, "tl") : `<span class="chip is-static">Ch.${w.ch} · whole chapter</span>`;
      const diff = w.before ? `<div class="w-diff"><div><span class="eyebrow">Before</span><p class="t-sm">${esc(w.before)}</p></div><div><span class="eyebrow">After</span><p class="t-sm t-ink">${esc(w.after)}</p></div></div>` : "";
      const state = w.state === "open" ? "" : `<span class="badge ${w.state === "resolved" ? "badge-success" : ""}">${w.state === "resolved" ? "HANDLED" : "IGNORED"}</span>${w.by ? `<span class="t-sm t-mute">${esc(w.by)}</span>` : ""}`;
      const act = w.state === "open"
        ? `${w.kind === "dict" ? `<button class="btn btn-sm" data-act="tl-step" data-v="dict">${ic("book")}Open dictionary</button>` : ""}${w.kind === "guideline" ? `<button class="btn btn-sm" data-act="tl-step" data-v="guide">${ic("pen")}Open guidelines</button>` : ""}
           ${w.p ? `<button class="btn btn-sm" data-act="tl-w-view" data-id="${w.id}">View passage</button>` : ""}
           <button class="btn btn-sm" data-act="tl-w-retr" data-id="${w.id}" ${U.runningTask("translate", w.p ? `p${w.p}` : `c${w.ch}`) ? "disabled" : ""}>${ic("refresh")}Re-translate ${w.p ? "passage" : "chapter"}</button>
           <button class="btn btn-sm" data-act="tl-w-ok" data-id="${w.id}">Reviewed</button>
           <button class="btn btn-sm btn-ghost" data-act="tl-w-skip" data-id="${w.id}">Ignore</button>`
        : `<button class="btn btn-sm btn-ghost" data-act="tl-w-reopen" data-id="${w.id}">Reopen</button>`;
      return `<div class="card w-card"><div class="w-top"><span class="badge ${KIND[w.kind][0]}">${KIND[w.kind][1]}</span>${loc}<span class="spacer"></span>${state}<span class="mono t-mute">${esc(w.date)}</span></div>
        <p>${esc(w.reason)}</p>${diff}<div class="w-act">${act}</div></div>`;
    }).join("");
    const count = (s) => all.filter((w) => s === "all" || (s === "open" ? w.state === "open" : w.state !== "open")).length;
    return `<div class="tl-sub">${U.seg("tl-wf", [["open", `Open ${count("open")}`], ["done", `Handled ${count("done")}`], ["all", `All ${count("all")}`]], v.wfilter)}</div>
      <div class="tl-list" data-keep="tl-warn">${cards || U.empty("No warnings", "When the source, guidelines or dictionary change after translating, the affected passages will appear here.")}</div>`;
  }

  const reviewParas = () => Object.keys(T().chapters).reduce((a, n) => a + U.trParaList(+n).filter((p) => p.st === "review").length, 0);
  const translating = () => A.PL.list.some((p) => p.kind === "translate" && p.status === "running");
  const stepSummary = (id) => {
    const total = N().chapters.length;
    if (id === "dict") return `${T().dict.length} entries`;
    if (id === "guide") return `v${T().guidelines.version}`;
    if (id === "trans") return translating() ? "Translating…" : `${Object.keys(T().chapters).length}/${total} chapters`;
    if (id === "result") return reviewParas() ? `${reviewParas()} passages to review` : "All reviewed";
    return wCount() ? `${wCount()} open` : "None";
  };
  const stepTone = (id) => (id === "warn" && wCount() ? "is-warn" : id === "result" && reviewParas() ? "is-warn" : id === "trans" && translating() ? "is-run" : "");

  function flowBar(step) {
    const idx = STEPS.findIndex((x) => x.id === step);
    return `<nav class="flow" aria-label="Translation workflow">${STEPS.map((x, i) => `<button type="button" class="fs ${x.id === step ? "is-active" : ""} ${i < idx ? "is-past" : ""} ${stepTone(x.id)}" data-act="tl-step" data-v="${x.id}" aria-current="${x.id === step}">
        <span class="fs-n">${i < idx ? ic("check") : i + 1}</span><span class="fs-t"><b>${x.label}</b><small>${esc(stepSummary(x.id))}</small></span></button>${i < STEPS.length - 1 ? `<span class="fs-sep">${ic("chev-r")}</span>` : ""}`).join("")}
</nav>`;
  }

  function flowFoot(step) {
    const i = STEPS.findIndex((x) => x.id === step);
    const prev = STEPS[i - 1];
    const next = STEPS[i + 1];
    return `<footer class="flow-foot">
      ${prev ? `<button class="btn btn-sm" data-act="tl-step" data-v="${prev.id}">${ic("chev-l")}${prev.label}</button>` : `<span></span>`}
      <span class="t-sm t-mute flow-hint">${esc(STEPS[i].hint)}</span>
      ${next ? `<button class="btn btn-sm btn-primary" data-act="tl-step" data-v="${next.id}">${next.label}${ic("chev-r")}</button>`
    : `<span></span>`}</footer>`;
  }

  function view(id) {
    U.bind(id);
    const v = V();
    const body = !U.hasText() ? U.noSample()
      : v.step === "dict" ? dictStep() : v.step === "guide" ? guideStep() : v.step === "trans" ? pipelineTab() : v.step === "result" ? readTab() : warnTab();
    return `<div class="nv">
      ${U.bar(`${U.novelTitle()}<span class="bar-sep"></span><label class="bar-field"><span>Translate to</span><select class="select" aria-label="Target language">${U.options([["vi", "Vietnamese"], ["en", "English (coming soon)", true], ["zh", "Chinese (coming soon)", true]], "vi")}</select></label>`)}
      ${U.hasText() ? flowBar(v.step) : ""}
      <div class="nv-body is-col">${body}</div>
      ${U.hasText() ? flowFoot(v.step) : ""}
    </div>`;
  }

  function mount(root) {
    const v = V();
    const ta = A.$("#tl-ta", root);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    A.$("#tl-note-in", root)?.focus();
    if (v.focus) {
      const id = v.focus;
      setTimeout(() => A.$(`#tp-${id.replace(".", "\\.")}`)?.scrollIntoView({ block: "center" }), 0);
      v.focus = null;
    }
  }

  function inspector(id) {
    U.bind(id);
    const done = Object.keys(T().chapters).length;
    const warns = wCount();
    return `${U.inspectorNovel()}
      ${U.insSec("Translation progress", U.kv([["Has draft", `${done}/${N().chapters.length} chapters`], ["Open warnings", warns ? `<span class="badge badge-warning">${warns}</span>` : "0"], ["Guidelines", `v${T().guidelines.version}`], ["Dictionary", `${T().dict.length} entries`], ["Purpose", esc(purposeLabel())]]))}`;
  }

  A.VIEWS.translation = { fill: true, render: view, mount, inspector };

  function openTranslation(step, ch, pid) {
    const v = V();
    if (step) v.step = LEGACY[step] || step;
    if (ch) { v.ch = ch; if (v.step === "trans") v.picks[ch] = true; }
    if (pid) { v.focus = pid; v.edit = null; }
    U.openNovelTab("translation", N().reader.novel);
  }
  U.openTranslation = openTranslation;

  function settle(w, state, by) {
    w.state = state;
    w.by = by;
    if (w.p) {
      const tp = T().chapters[w.ch]?.paras[w.p];
      if (tp && tp.st === "review" && !U.openWarnings().some((x) => x.p === w.p)) tp.st = tp.prev || "draft";
    }
  }
  const warnById = (id) => T().warnings.find((w) => w.id === id);

  function startNewEntry() {
    const v = V();
    v.nd = { src: "", dst: "", type: "term", note: "" };
    v.step = "dict";
    v.dq = "";
    A.rerender();
    setTimeout(() => A.$("#tl-nd-src")?.focus(), 0);
  }

  function flagDictionary(entry) {
    let n = 0;
    Object.entries(T().chapters).forEach(([ch, t]) => {
      (U.chapter(+ch).paras || []).forEach((p) => {
        const tp = t.paras[p.id];
        if (!tp) return;
        if (p.t.toLowerCase().includes(entry.src.toLowerCase()) && !tp.t.toLowerCase().includes(entry.dst.toLowerCase())) {
          if (tp.st !== "review") tp.prev = tp.st;
          tp.st = "review";
          U.addWarning({ kind: "dict", ch: +ch, p: p.id, reason: `Dictionary v${T().guidelines.version}: “${entry.src}” → “${entry.dst}”, but the translated passage does not use this translation.`, before: tp.t, after: entry.dst });
          n++;
        }
      });
    });
    return n;
  }

  function reviewDialog() {
    const v = V();
    const n = v.ch;
    const est = U.estimate([n], { outRatio: 0.6, guide: 420 });
    const doubled = Math.round(est.tin * 1.9);
    A.modal({
      title: `Review Ch.${n} with the Assistant`, eyebrow: window.DS.CAP["11"],
      body: `<div class="field"><label for="rv-text">Specific request (optional)</label>
          <textarea id="rv-text" class="textarea" rows="3" placeholder="Leave empty for the default review: accurate meaning, complete content, consistent terminology, tone following the guidelines."></textarea></div>
        <div class="card side-card"><span class="eyebrow">Content to be sent</span>
          <ul class="disc"><li class="is-yes">${ic("check")}<span>Source and translation of Ch.${n} (${fmt(U.chapter(n).words)} words)</span></li>
          <li class="is-yes">${ic("check")}<span>Translation guidelines and dictionary v${T().guidelines.version}</span></li>
          <li class="is-no">${ic("x")}<span>Not sent: other chapters, your notes</span></li></ul>
          <p class="t-sm t-mute">Recipient: ${esc(U.provider(T().provider).name)} · estimated ${fmt(doubled)} input tokens, ${U.money(est.cost * 1.4)}.</p></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="tl-ai-run">${ic("spark")}Start review</button>`,
    });
  }

  Object.assign(A.ACT, {
    "tl-step": (el) => { const v = V(); v.step = el.dataset.v; v.edit = null; v.noteFor = null; A.rerender(); },
    "tl-start": (el) => startTranslate(el.dataset.v === "trial"),
    "tl-open-read": (el) => openTranslation("result", +el.dataset.n),
    "tl-pick-go": (el) => { V().ch = +el.dataset.n; V().picks[+el.dataset.n] = true; V().step = "trans"; A.rerender(); },
    "tl-pick-missing": () => { const v = V(); N().chapters.forEach((c) => { v.picks[c.n] = !N().tr.chapters[c.n] && !U.runningTask("translate", `c${c.n}`); }); A.rerender(); },
    "tl-pick-review": () => { const v = V(); N().chapters.forEach((c) => { v.picks[c.n] = U.trStatus(c.n) === "review"; }); A.rerender(); },
    "tl-pick-none": () => { V().picks = {}; A.rerender(); },
    "tl-prev": () => { V().ch = Math.max(1, V().ch - 1); V().edit = null; A.rerender(); },
    "tl-next": () => { V().ch = Math.min(N().chapters.length, V().ch + 1); V().edit = null; A.rerender(); },
    "tl-edit": (el) => { V().edit = el.dataset.p; A.rerender(); },
    "tl-cancel": () => { V().edit = null; A.rerender(); },
    "tl-save": (el) => {
      const v = V();
      const text = A.$("#tl-ta").value.trim();
      const pid = el.dataset.p;
      const tp = T().chapters[v.ch].paras[pid];
      v.edit = null;
      if (text && text !== tp.t) {
        tp.t = text;
        tp.st = "edited";
        U.openWarnings().filter((w) => w.p === pid).forEach((w) => settle(w, "resolved", "Edit in place"));
        A.toast("Translation saved.");
      }
      A.rerender();
    },
    "tl-note-open": (el) => { V().noteFor = el.dataset.p; A.rerender(); },
    "tl-note-close": () => { V().noteFor = null; A.rerender(); },
    "tl-note-add": (el) => {
      const text = A.$("#tl-note-in").value.trim();
      if (text) T().chapters[V().ch].paras[el.dataset.p].notes.push({ text, date: A.stamp() });
      V().noteFor = null;
      A.rerender();
    },
    "tl-note-del": (el) => { T().chapters[V().ch].paras[el.dataset.p].notes.splice(+el.dataset.i, 1); A.rerender(); },
    "tl-dict": () => startNewEntry(),
    "tl-dict-new": () => startNewEntry(),
    "tl-dict-cancel": () => { V().nd = null; A.rerender(); },
    "tl-dict-add": () => {
      const nd = V().nd;
      const src = nd.src.trim();
      const dst = nd.dst.trim();
      if (!src || !dst) { A.toast("Enter both the source term and the translation.", "warning"); A.$(src ? "#tl-nd-dst" : "#tl-nd-src")?.focus(); return; }
      const entry = { id: `D${String(T().dict.length + 11).padStart(2, "0")}`, src, dst, type: nd.type, note: nd.note.trim() };
      T().dict.push(entry);
      T().guidelines.version++;
      V().nd = null;
      const n = flagDictionary(entry);
      A.rerender();
      A.toast(`Added to dictionary v${T().guidelines.version}${n ? `. ${n} passages need review.` : "."}`, n ? "warning" : "success");
    },
    "tl-dict-del": (el) => {
      T().dict = T().dict.filter((d) => d.id !== el.dataset.id);
      T().guidelines.version++;
      A.toast("Dictionary entry deleted.");
      A.rerender();
    },
    "tl-guide-save": () => {
      const g = T().guidelines;
      const next = { purpose: A.$("#g-purpose").value, audience: A.$("#g-audience").value.trim(), tone: A.$("#g-tone").value.trim(), pronouns: A.$("#g-pronouns").value.trim(), conventions: A.$("#g-conv").value.trim() };
      const names = { purpose: "Purpose", audience: "Readers", tone: "Tone", pronouns: "Forms of address", conventions: "Conventions" };
      const changed = Object.keys(next).filter((k) => next[k] !== g[k]).map((k) => names[k]);
      if (!changed.length) { A.toast("No changes.", "warning"); return; }
      Object.assign(g, next);
      g.version++;
      Object.keys(T().chapters).forEach((ch) => U.addWarning({ kind: "guideline", ch: +ch, p: null, reason: `Translation guidelines changed (v${g.version - 1} → v${g.version}): ${changed.join(", ")}. The translation of this chapter may need adjusting.` }));
      A.rerender();
      A.toast(`Saved guidelines v${g.version}. ${Object.keys(T().chapters).length} chapters have new warnings.`, "warning");
    },
    "tl-wf": (el) => { V().wfilter = el.dataset.v; A.rerender(); },
    "tl-w-view": (el) => { const w = warnById(el.dataset.id); openTranslation("result", w.ch, w.p); },
    "tl-w-ok": (el) => { settle(warnById(el.dataset.id), "resolved", "Reviewed"); A.rerender(); },
    "tl-w-skip": (el) => { settle(warnById(el.dataset.id), "dismissed", "Ignore"); A.rerender(); },
    "tl-w-reopen": (el) => { const w = warnById(el.dataset.id); w.state = "open"; w.by = ""; A.rerender(); },
    "tl-w-retr": (el) => {
      const w = warnById(el.dataset.id);
      const key = w.p ? `p${w.p}` : `c${w.ch}`;
      A.startPipeline({
        kind: "translate", label: w.p ? `Re-translate ${U.refLabel(w.p)}` : `Re-translate Ch.${w.ch}`, detail: `${U.nameOf(U.current())} → ${T().lang}`,
        tasks: [{ key, label: key }],
        onDone: () => {
          if (w.p) {
            const tp = T().chapters[w.ch].paras[w.p];
            tp.t = fresh(w.p);
            tp.st = "draft";
            settle(w, "resolved", "Re-translate the passage");
          } else {
            finishChapter(w.ch);
          }
        },
      });
      A.rerender();
    },
    "tl-ai": () => { const v = V(); if (v.panel && v.reviewed[v.ch]) { v.panel = false; A.rerender(); } else reviewDialog(); },
    "tl-ai-close": () => { V().panel = false; A.rerender(); },
    "tl-ai-run": () => {
      const v = V();
      const text = A.$("#rv-text").value.trim();
      const ch = v.ch;
      A.closeModal();
      v.panel = true;
      v.reviewNote = text ? `On request: “${text}”.` : "";
      A.startPipeline({
        kind: "review", label: `Review Ch.${ch}`, detail: text ? `Request: ${text.slice(0, 48)}` : "Default review", tasks: [{ key: "r1", label: "review" }],
        onDone: () => { v.reviewed[ch] = true; },
      });
      A.rerender();
    },
    "tl-ai-apply": (el) => {
      const s = T().suggestions.find((x) => x.id === el.dataset.id);
      const tp = T().chapters[s.ch].paras[s.p];
      tp.t = s.revise;
      tp.st = "edited";
      s.state = "applied";
      U.openWarnings().filter((w) => w.p === s.p).forEach((w) => settle(w, "resolved", "Apply the Assistant’s suggestion"));
      A.rerender();
      A.toast(`Applied the suggestion to ${U.refLabel(s.p)}.`);
    },
    "tl-ai-skip": (el) => { T().suggestions.find((x) => x.id === el.dataset.id).state = "dismissed"; A.rerender(); },
  });

  Object.assign(A.ON, {
    "tl-pick": (el) => { V().picks[el.dataset.n] = el.checked; A.rerender(); },
    "tl-pick-all": (el) => {
      const v = V();
      const needle = v.cq.trim().toLowerCase();
      N().chapters.filter((c) => (!needle || `${c.n} ${c.title}`.toLowerCase().includes(needle)) && (v.cf === "all" || U.trStatus(c.n) === v.cf))
        .forEach((c) => { if (!U.runningTask("translate", `c${c.n}`)) v.picks[c.n] = el.checked; });
      A.rerender();
    },
    "tl-nd": (el) => { V().nd[el.dataset.f] = el.value; },
    "tl-dict-f": (el) => {
      const d = T().dict.find((x) => x.id === el.dataset.id);
      const f = el.dataset.f;
      const v = el.value.trim();
      if ((f === "src" || f === "dst") && !v) { el.value = d[f]; A.toast("The source term and translation cannot be empty.", "warning"); return; }
      if (v === d[f]) return;
      d[f] = v;
      T().guidelines.version++;
      const n = flagDictionary(d);
      A.rerender();
      A.toast(`Saved dictionary v${T().guidelines.version}${n ? `. ${n} passages need review.` : "."}`, n ? "warning" : "success");
    },
    "tl-cq": (el) => { V().cq = el.value; A.rerender(); },
    "tl-cf": (el) => { V().cf = el.value; A.rerender(); },
    "tl-provider": (el) => { T().provider = el.value; A.rerender(); },
    "tl-ch": (el) => { V().ch = Math.max(1, Math.min(N().chapters.length, Math.floor(+el.value) || 1)); V().edit = null; A.rerender(); },
    "tl-only": (el) => { V().onlyReview = el.checked; A.rerender(); },
    "tl-dq": (el) => { V().dq = el.value; A.rerender(); },
  });
})();
