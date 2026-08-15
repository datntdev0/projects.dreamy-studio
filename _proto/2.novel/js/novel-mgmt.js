/*
 * Novel management.
 *  - `novels`      the novel list of the workspace (list / grid).
 *  - `novel:<id>`  one novel, two screens: Chapters → Reading. Reading display options are in the Inspector.
 */
(function () {
  const A = window.DSApp;
  const U = window.NVU;
  const NV = window.NV;
  const { esc, ic } = A;
  const { N, ui, fmt, frac, cover, datatable } = U;

  const CAP = window.DS.CAP["02"];
  const LANGS = [["EN", "English"], ["VI", "Vietnamese"], ["ZH", "Chinese"], ["JA", "Japanese"], ["KO", "Korean"]];
  const COVERS = [
    ["var(--acc-midnight)", "var(--primary)", "var(--acc-twilight)"],
    ["var(--acc-sunset)", "var(--secondary)", "var(--acc-midnight)"],
    ["var(--acc-midnight)", "var(--acc-breeze)", "var(--acc-sunset)"],
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R = () => N().reader;

  /* ---------------- reading preferences (Inspector) ---------------- */
  const FONTS = { serif: "var(--font-serif)", sans: "var(--font)", mono: "var(--font-mono)" };
  const PAPERS = { default: "", sepia: "--rd-bg:#f3ead7;--rd-fg:#3b3226;--rd-mute:#8a7d68;", night: "--rd-bg:#14161c;--rd-fg:#cfd3dc;--rd-mute:#7c8493;" };
  const PREF_DEFAULT = { font: "serif", size: 17, lh: 1.75, width: 680, paper: "default", nums: true, justify: false };
  const prefs = () => (R().prefs ||= { ...PREF_DEFAULT, ...A.store.get("rd.prefs", {}) });
  const savePrefs = () => A.store.set("rd.prefs", prefs());
  /** Reading language (`src` original / `tr` translation) and layout (`single` single language / `parallel` song song). */
  const viewOpts = () => (R().view ||= { lang: "src", layout: "single", ...A.store.get("rd.view", {}) });
  const saveView = () => A.store.set("rd.view", viewOpts());
  const trCode = () => ({ "Vietnamese": "VI", "English": "EN" }[N().tr.lang] || String(N().tr.lang).slice(0, 2).toUpperCase());
  const pageStyle = () => {
    const p = prefs();
    return `--rd-fs:${p.size}px;--rd-lh:${p.lh};--rd-w:${p.width}px;--rd-font:${FONTS[p.font]};${PAPERS[p.paper]}`;
  };
  const applyPrefs = () => {
    const el = A.$(".rd-page");
    if (!el) return;
    el.setAttribute("style", pageStyle());
    el.dataset.paper = prefs().paper;
    el.classList.toggle("no-nums", !prefs().nums);
    el.classList.toggle("is-justify", prefs().justify);
  };

  /* ---------------- Novel management: list / grid ---------------- */
  const view = () => A.store.get("nm.view", "grid");

  const NM = () => ui("nm", { q: "", selected: null });
  const selIds = () => NM().selected && U.novelById(NM().selected) ? [NM().selected] : [];

  function filtered() {
    const q = NM();
    const needle = q.q.trim().toLowerCase();
    return N().novels.filter((n) => U.passes(n) && (!needle || `${n.title} ${n.display || ""} ${n.author}`.toLowerCase().includes(needle)));
  }

  const fracOf = (n, k) => {
    const pg = U.progress(n);
    return k === "tr" ? frac("lang", pg.tr, pg.total, "Translated chapters") : frac("graph", pg.kb, pg.total, "Analyzed chapters");
  };
  const fracs = (n) => {
    const pg = U.progress(n);
    return `${frac("lang", pg.tr, pg.total, "Translated chapters")}${frac("graph", pg.kb, pg.total, "Analyzed chapters")}`;
  };

  /** Chips of the active filters (set in Filters in the explorer) shown right on the toolbar. */
  function activeChips() {
    if (!U.filterActive()) return "";
    const f = U.filters();
    const chip = (k, v, label) => `<span class="tag">${esc(label)}<button type="button" class="tag-x" data-act="nf-toggle" data-k="${k}" data-v="${esc(v)}" aria-label="Remove ${esc(label)} filter">${ic("x")}</button></span>`;
    return `<span class="nm-chips">${f.tags.map((t) => chip("tag", t, t)).join("")}${f.langs.map((l) => chip("lang", l, l)).join("")}<button type="button" class="btn btn-sm btn-ghost" data-act="nf-clear">Clear filters</button></span>`;
  }

  function mgmtView() {
    const q = NM();
    const list = filtered();
    const selected = q.selected;
    let body;
    if (!list.length) {
      body = N().novels.length
        ? U.empty("No novels match", "Try another keyword or remove the filters.", `<button class="btn" data-act="nm-clear">Clear filters</button>`)
        : U.empty("No novels yet", "Create a new novel or import one from a .dsnovel / .zip package.", `<div class="empty-act"><button class="btn btn-primary" data-act="nm-new">${ic("plus")}Create novel</button><button class="btn" data-act="nm-import">${ic("upload")}Import from package…</button></div>`);
    } else if (view() === "grid") {
      body = `<div class="nm-grid">${list.map((n) => `<div class="nm-card ${selected === n.id ? "is-selected" : ""}" tabindex="0" data-act="nm-sel" data-id="${n.id}" data-open="${n.id}" title="${esc(U.nameOf(n))}">
          <div class="nm-cover ${n.coverImg ? "has-img" : ""}" style="background:${esc(U.coverBg(n))}">
            <span class="badge nm-lang">${n.lang}</span>${n.coverImg ? "" : `<span class="nm-cover-t">${esc(n.title)}</span><span class="nm-cover-a">${esc(n.author)}</span>`}</div>
          <div class="nm-card-b"><div class="nm-card-t t-ink">${esc(U.nameOf(n))}</div><div class="nm-fr">${fracs(n)}</div></div></div>`).join("")}</div>`;
    } else {
      body = datatable({
        columns: [
          { key: "title", label: "Novel", ellipsis: true, render: (n) => `<div class="nm-title">${cover(n)}<div><div class="t-ink">${esc(U.nameOf(n))}</div><div class="t-sm t-mute">${U.nameOf(n) !== n.title ? `${esc(n.title)} · ` : ""}${esc(n.author)}</div></div></div>` },
          { key: "lang", label: "Source", width: "64px", render: (n) => `<span class="badge">${esc(n.lang)}</span>` },
          { key: "chapters", label: "Chapters", align: "right", width: "80px", render: (n) => fmt(n.chapters) },
          { key: "words", label: "Words", align: "right", width: "88px", render: (n) => fmt(n.words) },
          { key: "translation", label: "Translation", align: "center", width: "96px", render: (n) => fracOf(n, "tr") },
          { key: "knowledge", label: "Knowledge", align: "center", width: "96px", render: (n) => fracOf(n, "kb") },
          { key: "updated", label: "Updated", width: "152px", ellipsis: true, render: (n) => `<span class="mono t-mute">${esc(n.updated)}</span>` },
        ],
        rows: list,
        minWidth: "720px",
        variant: "fill",
        testId: "novel-list-table",
        keep: "nm",
        rowTestId: "novel-list-row",
        rowClass: (n) => ({ "is-selected": selected === n.id }),
        rowAttrs: (n) => `data-act="nm-sel" data-id="${esc(n.id)}" data-open="${esc(n.id)}"`,
      });
    }
    return `<div class="nv">
      ${U.bar(
        `<label class="search"><span class="sr-only">Search novels</span><input id="nm-q" class="input" type="search" value="${esc(q.q)}" placeholder="Search by name or author…" data-on="nm-q"></label>
         <span class="t-sm t-mute">${list.length} novel</span>${activeChips()}`,
        `${U.seg("nm-view", [["grid", ic("frames"), "Grid view"], ["list", ic("list"), "List view"]], view())}
         <button class="btn btn-sm" data-act="nm-import" data-tip="Import from a .dsnovel / .zip package">${ic("upload")}Import…</button><button class="btn btn-sm btn-primary" data-act="nm-new">${ic("plus")}New</button>`,
      )}
      <div class="nv-body">${list.length && view() !== "grid" ? body : `<div class="nv-scroll" data-keep="nm">${body}</div>`}</div>
    </div>`;
  }

  /** Updates the selection in place (does not re-render the list so a double click still hits the element). */
  function applySel() {
    const id = selIds()[0];
    A.$$("#editor [data-open]").forEach((el) => el.classList.toggle("is-selected", id === el.dataset.id));
    A.renderInspector();
  }

  function mgmtInspector() {
    const list = selIds().map(U.novelById);
    return list.length ? novelPanel(list[0], true) : `<div class="ins-empty"><p>Choose a novel to see its properties.</p></div>`;
  }

  /* ---------------- Novel: Chapters → Reading ---------------- */
  const screenOf = (id) => (R().scr ||= {})[id] || "chapters";
  const setScreen = (id, s) => { (R().scr ||= {})[id] = s; };

  function openNovel(novelId, screen) {
    if (screen) setScreen(novelId, screen);
    U.openNovelTab("novel", novelId);
  }
  function openReader(novelId, ch, pid) {
    if (ch) R().ch = ch;
    R().focus = pid || null;
    R().edit = null;
    openNovel(novelId, "reading");
  }
  U.openReader = openReader;

  const trCell = (n) => {
    const st = U.trStatus(n);
    const map = { none: ["", "Not translated"], draft: ["dot-success", "Has translation"], review: ["dot-warning", "Has passages to review"], running: ["dot-running", "Translating"] };
    return st === "none" ? `<span class="dot-o" title="${map.none[1]}"></span>` : `<span class="dot ${map[st][0]}" title="${map[st][1]}"></span>`;
  };
  const kbCell = (n) => {
    if (U.runningTask("analyze", `c${n}`)) return `<span class="dot dot-running" title="Analyzing"></span>`;
    if (N().kb.analyzed[n] !== "done") return `<span class="dot-o" title="Not analyzed"></span>`;
    const stale = U.staleItems().some((i) => i.ev.some((e) => NV.chOf(e.p) === n));
    return `<span class="dot ${stale ? "dot-warning" : "dot-info"}" title="${stale ? "Source changed after analysis" : "Analyzed"}"></span>`;
  };

  const isLocked = (novel, c) => novel.id === U.SAMPLE && !!c && (!!U.trChapter(c.n) || !!N().kb.analyzed[c.n]);
  const LOCK_TIP = "Has a translation or knowledge, so it cannot be moved or deleted";

  function chaptersScreen(novel) {
    const q = ui("ch", { q: "" });
    const needle = q.q.trim().toLowerCase();
    const all = U.chaptersFor(novel);
    const list = all.filter((c) => !needle || `${c.n} ${c.title}`.toLowerCase().includes(needle));
    const sample = novel.id === U.SAMPLE;
    const pg = U.progress(novel);
    const filtered = !!needle;
    const canMove = (c) => !filtered && !isLocked(novel, c);
    const rowBtn = (c, act, icon, label, off, tip) => `<button type="button" class="btn btn-icon btn-sm btn-ghost" data-testid="novel-chapter-${act}" data-act="${act}" data-n="${c.n}" title="${esc(label)}" aria-label="${esc(label)}" data-tip="${esc(off ? tip || label : label)}" ${off ? "disabled" : ""}>${ic(icon)}</button>`;
    const rowActions = (c) => {
      const locked = isLocked(novel, c);
      const why = locked ? LOCK_TIP : "Clear the search to reorder chapters";
      return `<span class="row-actions">${rowBtn(c, "ch-up", "arrow-up", "Move up", !canMove(c) || c.n === 1 || isLocked(novel, all[c.n - 2]), why)}${rowBtn(c, "ch-down", "arrow-down", "Move down", !canMove(c) || c.n === all.length, why)}${rowBtn(c, "ch-del", "trash", "Delete chapter", locked, LOCK_TIP)}</span>`;
    };
    const readFrom = sample ? Math.max(1, Math.min(all.length, R().ch || 1)) : 1;
    const tableMarkup = datatable({
      columns: [
        { key: "n", label: "#", width: "56px", render: (c) => `<span class="mono t-mute">${String(c.n).padStart(2, "0")}</span>` },
        { key: "title", label: "Chapter", ellipsis: true },
        { key: "words", label: "Words", align: "right", width: "80px", render: (c) => fmt(c.words) },
        { key: "translation", label: "Translation", align: "center", width: "104px", render: (c) => sample ? trCell(c.n) : `<span class="dot-o"></span>` },
        { key: "knowledge", label: "Knowledge", align: "center", width: "104px", render: (c) => sample ? kbCell(c.n) : `<span class="dot-o"></span>` },
        { key: "actions", label: "", align: "right", width: "112px", render: rowActions },
      ],
      rows: list,
      variant: "fill",
      testId: "novel-chapters-table",
      keep: "ch",
      rowTestId: "novel-chapter-row",
      rowClass: (c) => ({ "is-current": R().ch === c.n && sample }),
      rowAttrs: (c) => `data-act="ch-open" data-n="${c.n}" ${canMove(c) ? `draggable="true" data-drag="${c.n}"` : ""}`,
      emptyHTML: all.length ? U.empty("No chapters match", "Try another keyword.")
        : U.empty("No chapters yet", "Add the first chapter, then open it to write or paste the text.", `<button class="btn btn-primary" data-act="ch-add">${ic("plus")}Add chapter</button>`),
    });
    return `<div class="nv">
      ${U.bar(U.novelTitle(), `<button class="btn btn-sm" data-act="nx-open" data-k="translation" data-id="${novel.id}">${ic("lang")}Translation</button>
        <button class="btn btn-sm" data-act="nx-open" data-k="knowledge" data-id="${novel.id}">${ic("graph")}Knowledgebase</button>
        <button class="btn btn-sm" data-testid="novel-chapter-add" data-act="ch-add">${ic("plus")}Add chapter</button>
        <button class="btn btn-sm btn-primary" data-act="ch-open" data-n="${readFrom}" ${all.length ? "" : "disabled"}>${ic("book")}${sample ? "Continue reading" : "Read"}</button>`)}
      <div class="tl-sub"><label class="search"><span class="sr-only">Search chapters</span><input id="ch-q" class="input" type="search" value="${esc(q.q)}" placeholder="Search chapters…" data-on="ch-q"></label>
        <span class="t-sm t-mute">${list.length}/${all.length} chapters</span><span class="spacer"></span>
        <span class="legend-dots">${frac("lang", pg.tr, pg.total, "Translated chapters")}${frac("graph", pg.kb, pg.total, "Analyzed chapters")}</span></div>
      <div class="nv-body is-col" data-testid="novel-chapters-body">${tableMarkup}</div>
    </div>`;
  }

  function readingScreen(novel) {
    const back = `<button class="btn btn-sm" data-act="rd-back">${ic("arrow-left")}Chapters</button>`;
    const r = R();
    const p = prefs();
    const sample = novel.id === U.SAMPLE;
    const chapters = U.chaptersFor(novel);
    if (!chapters.length) return chaptersScreen(novel);
    r.ch = Math.max(1, Math.min(chapters.length, r.ch || 1));
    const c = chapters[r.ch - 1];
    const ps = U.parasOf(c);
    // Translation and the parallel layout only exist for the sample novel; other novels read and edit the original text.
    const vo = sample ? viewOpts() : { lang: "src", layout: "single" };
    const parallel = vo.layout === "parallel";
    const showSrc = parallel || vo.lang === "src";
    const showTr = parallel || vo.lang === "tr";
    const canEdit = showSrc;
    const tr = sample ? N().tr.chapters[c.n] : null;
    const hasTr = !!tr && !tr.noSample;
    const editMode = canEdit && r.mode === "edit";
    const srcPara = (x, i) => {
      const editing = r.edit === x.id;
      const flash = r.focus === x.id ? "is-flash" : "";
      if (editing) {
        return `<div class="rd-edit" id="rp-${x.id}"><textarea id="rd-ta" class="textarea" rows="5">${esc(x.t)}</textarea>
          <div class="rd-edit-foot"><span class="t-sm t-mute">Editing the source will mark the related translation and knowledge claims for review.</span><span class="spacer"></span>
          <button class="btn btn-sm" data-act="rd-cancel">Cancel</button><button class="btn btn-sm btn-primary" data-act="rd-save" data-p="${x.id}">Save passage</button></div></div>`;
      }
      const editable = canEdit && r.mode === "edit";
      const attr = editable ? `data-act="rd-edit" data-p="${x.id}" tabindex="0"` : "";
      return `<p class="rd-para ${editable ? "is-editable" : ""} ${flash}" id="rp-${x.id}" ${attr}><span class="rd-no">${i + 1}</span><span class="rd-tx">${esc(x.t)}</span></p>`;
    };
    const trPara = (x, i) => {
      const t = tr.paras[x.id];
      if (!t) return `<p class="rd-para is-tr is-empty"></p>`;
      const st = { review: ["badge-warning", "NEEDS REVIEW"] }[t.st];
      return `<p class="rd-para is-tr" id="rt-${x.id}">${parallel ? "" : `<span class="rd-no">${i + 1}</span>`}<span class="rd-tx">${esc(t.t)}${st ? `<span class="rd-bd"><span class="badge ${st[0]}">${st[1]}</span></span>` : ""}</span></p>`;
    };
    const note = showTr && !hasTr
      ? `<div class="rd-note">${ic("alert")}<span>Chapter ${c.n} has no ${esc(N().tr.lang)} translation yet.</span><button class="btn btn-sm" data-act="rd-tool">${ic("lang")}Translate chapter</button></div>` : "";
    let paras;
    if (!ps.length) paras = U.empty("This chapter has no text yet", canEdit ? "Switch to Edit, then add the first passage." : "There is no original text to show.");
    else if (parallel) {
      paras = `<div class="rd-pair rd-langhead"><span>${esc(novel.lang)} · Original</span><span>${esc(trCode())} · Translation</span></div>${note}`
        + ps.map((x, i) => `<div class="rd-pair">${srcPara(x, i)}${hasTr ? trPara(x, i) : `<p class="rd-para is-tr is-empty"></p>`}</div>`).join("");
    } else if (showTr) {
      paras = note + (hasTr ? ps.map(trPara).join("") : "");
    } else paras = ps.map(srcPara).join("");
    const addPassage = editMode && !isLocked(novel, c) ? `<div class="rd-add"><button class="btn btn-sm" data-testid="novel-reader-add-passage" data-act="rd-add-p">${ic("plus")}Add passage</button></div>` : "";
    const langLabel = parallel ? `${esc(novel.langName)} ⇄ ${esc(N().tr.lang)}` : showTr ? `${esc(N().tr.lang)} (translation)` : esc(novel.langName);
    return `<div class="nv">
      ${U.bar(
        `${back}<span class="bar-sep"></span>
         <button class="btn btn-icon btn-sm" data-act="rd-prev" ${r.ch <= 1 ? "disabled" : ""} aria-label="Previous chapter" data-tip="Previous chapter">${ic("chev-l")}</button>
         ${U.chapterJump("rd-ch", r.ch, chapters.length, c.title)}
         <button class="btn btn-icon btn-sm" data-act="rd-next" ${r.ch >= chapters.length ? "disabled" : ""} aria-label="Next chapter" data-tip="Next chapter">${ic("chev-r")}</button>`,
        `${sample ? `<span class="rd-seg-off-${parallel}">${U.seg("rd-lang", [["src", novel.lang, `Original · ${novel.langName}`], ["tr", trCode(), `Translation · ${N().tr.lang}`]], vo.lang)}</span>
         ${U.seg("rd-layout", [["single", "Single language"], ["parallel", "Song song"]], vo.layout)}` : ""}
         ${canEdit ? U.seg("rd-mode", [["read", "Read"], ["edit", "Edit"]], r.mode) : ""}
         ${sample ? `<button class="btn btn-sm" data-act="rd-tool" data-v="translation">${ic("lang")}Translate chapter</button>` : ""}`,
      )}
      <div class="nv-body">
        <article class="rd-page ${p.nums ? "" : "no-nums"} ${p.justify ? "is-justify" : ""} ${parallel ? "is-par" : ""}" data-paper="${p.paper}" style="${pageStyle()}" data-keep="rd-page"><div class="rd-col">
          <span class="eyebrow">Chapter ${c.n} / ${chapters.length}</span>
          <h1 class="rd-h">${editMode ? `<input id="rd-title" class="input rd-h-in" data-testid="novel-reader-title-input" value="${esc(c.title)}" data-change="rd-title" aria-label="Chapter title" autocomplete="off">` : esc(c.title)}</h1>
          <div class="t-sm rd-meta">${fmt(c.words)} words · ${langLabel}</div>
          ${paras}${addPassage}
          <div class="rd-end">${r.ch < chapters.length ? `<button class="btn btn-sm" data-act="rd-next">Next chapter: ${esc(chapters[r.ch].title)}${ic("chev-r")}</button>` : `<span class="t-sm">End of the last chapter.</span>`}</div>
        </div></article>
      </div>
    </div>`;
  }

  /* ---------------- Chapters: add / delete / reorder ---------------- */
  const refreshChapters = () => { A.renderExplorer(); A.renderInspector(); A.rerender(); };

  const remapRef = (p, oldToNew) => {
    const old = NV.chOf(p);
    const next = oldToNew[old];
    return next ? `${next}.${U.paraNo(p)}` : p;
  };

  function remapRefs(oldToNew) {
    const kb = N().kb;
    const remapItem = (item) => {
      (item.ev || []).forEach((e) => { e.p = remapRef(e.p, oldToNew); });
      (item.attrs || []).forEach((a) => { if (a.p) a.p = remapRef(a.p, oldToNew); });
    };
    kb.items.forEach(remapItem);
    kb.ch3.forEach(remapItem);
    N().tr.warnings.forEach((w) => { w.p = remapRef(w.p, oldToNew); w.ch = NV.chOf(w.p); });
    N().tr.suggestions.forEach((s) => { s.p = remapRef(s.p, oldToNew); s.ch = NV.chOf(s.p); });
  }

  /** Gives every chapter its position as number and rebuilds passage ids (`<chapter>.<passage>`). Locked sample chapters never move, so their ids stay. */
  function renumberChapters(list, novel) {
    const oldToNew = {};
    list.forEach((c, i) => {
      const n = i + 1;
      if (c.n !== n) oldToNew[c.n] = n;
    });
    list.forEach((c, i) => {
      const n = i + 1;
      if (c.n === n) return;
      c.n = n;
      U.parasOf(c).forEach((p, j) => { p.id = `${n}.${j + 1}`; });
    });
    if (novel.id === U.SAMPLE) remapRefs(oldToNew);
  }

  /** Moves chapter `from` so that it is inserted before position `at` of the original order (1-based; `at` = length + 1 means the end). */
  function reorderChapter(from, at) {
    const nv = U.bind(A.S.active);
    const list = U.chaptersFor(nv);
    const c = list[from - 1];
    if (!c || isLocked(nv, c) || at < 1 || at > list.length + 1) return;
    const target = list[at - 1];
    if (target && isLocked(nv, target)) return;
    const cur = list[R().ch - 1];
    list.splice(from - 1, 1);
    list.splice(at > from ? at - 2 : at - 1, 0, c);
    renumberChapters(list, nv);
    R().ch = Math.max(1, list.indexOf(cur) + 1);
    nv.updated = A.stamp();
    refreshChapters();
  }
  const moveChapter = (from, to) => reorderChapter(from, to > from ? to + 1 : to);

  function openAddChapter() {
    const nv = U.bind(A.S.active);
    A.modal({
      title: "Add chapter", eyebrow: CAP,
      body: `<div class="field"><label for="ch-new-title">Chapter title</label><input id="ch-new-title" class="input" data-testid="novel-chapter-new-title" data-enter="ch-add-submit" placeholder="Chapter ${U.chaptersFor(nv).length + 1}" autocomplete="off"><span class="field-hint">The chapter is added at the end. Open it to write the text, and reorder it from the chapter list.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="ch-add-submit">${ic("plus")}Add chapter</button>`,
    });
  }

  let pendingCh = 0;
  function openDeleteChapter(n) {
    const nv = U.bind(A.S.active);
    const c = U.chapterIn(nv, n);
    if (!c || isLocked(nv, c)) return;
    pendingCh = n;
    A.modal({
      title: "Delete chapter", eyebrow: CAP,
      body: `<div class="t-ink">Ch.${c.n} · ${esc(c.title)}</div><div class="t-sm t-mute">${fmt(c.words)} words · ${U.parasOf(c).length} passages</div>
        <div class="ld-warn">${ic("alert")}<span>The chapter and its text will be removed from this novel. The chapters after it move up by one. This cannot be undone.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-danger" data-testid="novel-chapter-del-confirm" data-act="ch-del-confirm">${ic("trash")}Delete chapter</button>`,
    });
  }

  // Drag a chapter row to a new place (only unlocked rows, only while the list is not filtered).
  let dragN = 0;
  const dropSide = (tr, e) => { const b = tr.getBoundingClientRect(); return e.clientY > b.top + b.height / 2 ? "after" : "before"; };
  const clearDrop = () => A.$$("#editor tr.is-drop-before, #editor tr.is-drop-after, #editor tr.is-dragging").forEach((t) => t.classList.remove("is-drop-before", "is-drop-after", "is-dragging"));
  document.addEventListener("dragstart", (e) => {
    const tr = e.target.closest?.("tr[data-drag]");
    if (!tr) return;
    dragN = +tr.dataset.drag;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragN));
    tr.classList.add("is-dragging");
  });
  document.addEventListener("dragover", (e) => {
    const tr = dragN && e.target.closest?.("tr[data-drag]");
    if (!tr) return;
    e.preventDefault();
    A.$$("#editor tr.is-drop-before, #editor tr.is-drop-after").forEach((t) => t.classList.remove("is-drop-before", "is-drop-after"));
    if (+tr.dataset.drag !== dragN) tr.classList.add(`is-drop-${dropSide(tr, e)}`);
  });
  document.addEventListener("drop", (e) => {
    const tr = dragN && e.target.closest?.("tr[data-drag]");
    if (!tr) return;
    e.preventDefault();
    const from = dragN;
    const to = +tr.dataset.drag;
    dragN = 0;
    clearDrop();
    if (to !== from) reorderChapter(from, dropSide(tr, e) === "after" ? to + 1 : to);
  });
  document.addEventListener("dragend", () => { dragN = 0; clearDrop(); });

  function novelView(id) {
    const novel = U.bind(id);
    return screenOf(novel.id) === "reading" ? readingScreen(novel) : chaptersScreen(novel);
  }

  function novelMount(root, id) {
    const ta = A.$("#rd-ta", root);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    const pid = R().focus;
    if (pid && screenOf(U.bind(id).id) === "reading") {
      setTimeout(() => A.$(`#rp-${pid.replace(".", "\\.")}`)?.scrollIntoView({ block: "center" }), 0);
      R().focus = null;
    }
  }

  const field = (label, control) => `<div class="field"><label>${label}</label>${control}</div>`;

  function displayPanel() {
    const p = prefs();
    return `<section class="ins-sec"><div class="ins-h"><span class="eyebrow">Display</span><span class="spacer"></span><button class="btn btn-sm btn-ghost" data-act="pf-reset">Reset</button></div>
      ${field("Font", U.seg("pf-font", [["serif", "Serif"], ["sans", "Sans"], ["mono", "Mono"]], p.font))}
      ${field(`Font size <span class="mono t-mute" id="pf-size-v">${p.size} px</span>`, `<input type="range" class="range" min="13" max="24" step="1" value="${p.size}" data-on="pf-size" aria-label="Font size">`)}
      ${field("Line spacing", U.seg("pf-lh", [[1.5, "Tight"], [1.75, "Normal"], [2, "Airy"]], p.lh))}
      ${field("Column width", U.seg("pf-width", [[560, "Narrow"], [680, "Normal"], [820, "Wide"]], p.width))}
      ${field("Background", U.seg("pf-paper", [["default", "Default"], ["sepia", "Paper"], ["night", "Night"]], p.paper))}
      <label class="check"><input type="checkbox" data-on="pf-nums" ${p.nums ? "checked" : ""}><span>Show paragraph numbers</span></label>
      <label class="check"><input type="checkbox" data-on="pf-justify" ${p.justify ? "checked" : ""}><span>Justify text</span></label></section>`;
  }

  const fieldIn = (label, id, control) => `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
  /** Novel information edited in place; each field commits on blur / Enter. */
  function infoForm(n) {
    const tags = U.tagsOf(n);
    const sug = U.allTags().map(([t]) => t).filter((t) => !tags.includes(t));
    return `<section class="ins-sec ins-form"><span class="eyebrow">Information</span>
      ${fieldIn("Display name", "nv-f-display", `<input id="nv-f-display" class="input" value="${esc(n.display || "")}" placeholder="${esc(n.title)}" data-change="nv-edit" data-id="${n.id}" data-f="display" autocomplete="off"><span class="field-hint">Used in the explorer, tabs and lists. Leave empty to use the original name.</span>`)}
      ${fieldIn("Original name", "nv-f-title", `<input id="nv-f-title" class="input" value="${esc(n.title)}" data-change="nv-edit" data-id="${n.id}" data-f="title" autocomplete="off">`)}
      ${fieldIn("Author", "nv-f-author", `<input id="nv-f-author" class="input" value="${esc(n.author)}" data-change="nv-edit" data-id="${n.id}" data-f="author" autocomplete="off">`)}
      ${fieldIn("Source language", "nv-f-lang", `<select id="nv-f-lang" class="select" data-change="nv-edit" data-id="${n.id}" data-f="lang">${U.options(LANGS.map(([c, l]) => [c, l]), n.lang)}</select>`)}
      ${fieldIn("Description", "nv-f-desc", `<textarea id="nv-f-desc" class="textarea" rows="4" data-change="nv-edit" data-id="${n.id}" data-f="desc">${esc(n.desc)}</textarea>`)}
      <div class="field"><label for="nv-tag-in">Tags <span class="t-mute mono">${tags.length}/${MAX_TAGS}</span></label>
        <div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}<button type="button" class="tag-x" data-act="nv-tag-del" data-id="${n.id}" data-t="${esc(t)}" aria-label="Remove tag ${esc(t)}">${ic("x")}</button></span>`).join("") || `<span class="t-sm t-mute">No tags yet.</span>`}</div>
        <input id="nv-tag-in" class="input tag-in" list="nv-tag-sug" placeholder="Add a tag, press Enter…" data-enter="nv-tag-add" data-id="${n.id}" ${tags.length >= MAX_TAGS ? "disabled" : ""} autocomplete="off">
        <datalist id="nv-tag-sug">${sug.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist></div>
      ${U.kv([["Source", esc(n.origin)], ["Update", `<span class="mono">${esc(n.updated)}</span>`]])}</section>`;
  }
  const MAX_TAGS = 12;

  function novelInspector(id) {
    const novel = U.bind(id);
    const pg = U.progress(novel);
    const cur = screenOf(novel.id) === "reading" ? U.chapterIn(novel, R().ch) : null;
    if (cur) {
      const c = cur;
      const sample = novel.id === U.SAMPLE;
      const tr = sample ? N().tr.chapters[c.n] : null;
      const warns = sample ? U.openWarnings().filter((w) => w.ch === c.n).length : 0;
      const stale = sample ? U.staleItems().filter((i) => i.ev.some((e) => NV.chOf(e.p) === c.n)).length : 0;
      return `${displayPanel()}
        ${U.insSec(`Ch.${c.n}`, U.kv([["Title", esc(c.title)], ["Words", fmt(c.words)], ["Passage", U.parasOf(c).length], ...(sample ? [["Translate", tr ? `<span class="badge badge-success">HAS DRAFT</span>` : `<span class="badge">NOT YET</span>`], ["Knowledge", N().kb.analyzed[c.n] === "done" ? `<span class="badge badge-success">ANALYZED</span>` : `<span class="badge">NOT YET</span>`]] : [])]))}
        ${warns || stale ? `<section class="ins-sec"><span class="eyebrow">Needs review</span>
          ${warns ? `<div class="t-sm warn-line">${ic("alert")} ${warns} translation warnings</div>` : ""}${stale ? `<div class="t-sm warn-line">${ic("alert")} ${stale} knowledge claims tied to a changed source</div>` : ""}</section>` : ""}`;
    }
    return novelPanel(novel, false);
  }

  function novelPanel(novel, withOpen) {
    const has = !!novel.coverImg;
    const coverActions = `<span class="cover-actions">
      <button type="button" class="cover-action" data-act="nv-cover-pick" data-tip="${has ? "Change cover" : "Choose cover image"}" aria-label="${has ? "Change cover" : "Choose cover image"}">${ic("image")}</button><input type="file" accept="image/*" hidden data-change="nv-cover" data-id="${novel.id}">
      <button class="cover-action" data-act="nv-cover-del" data-id="${novel.id}" data-tip="Remove cover image" aria-label="Remove cover image" ${has ? "" : "disabled"}>${ic("x")}</button>
    </span>`;
    return `<section class="ins-panel-actions">
        <button class="btn btn-sm btn-danger" data-act="nm-del" data-id="${novel.id}" data-tip="Delete novel" aria-label="Delete novel">${ic("trash")}Delete</button>
        ${withOpen ? `<button class="btn btn-sm btn-primary" data-act="nm-open" data-id="${novel.id}">${ic("book")}Open</button>` : ""}
      </section>
      <section class="ins-hero">
        <div class="ins-hero-cv">${cover(novel, "cover-lg", coverActions)}</div>
        <div class="ins-hero-b">
          <div class="ins-hero-t">${esc(U.nameOf(novel))}</div>
          ${U.nameOf(novel) !== novel.title ? `<div class="t-sm t-mute ins-orig" title="Original name">${esc(novel.title)}</div>` : ""}
          <div class="t-sm t-mute">${esc(novel.author)}</div>
          <div class="ins-hero-m"><span class="badge">${esc(novel.lang)}</span><span class="t-sm t-mute">${fmt(novel.chapters)} chapters · ${fmt(novel.words)} words</span></div>
          <div class="nm-fr">${fracs(novel)}</div>
        </div>
      </section>
      ${infoForm(novel)}`;
  }

  A.VIEWS.novels = { fill: true, render: mgmtView, inspector: mgmtInspector };
  A.VIEWS.novel = { fill: true, render: novelView, mount: novelMount, inspector: novelInspector };

  /* ---------------- Explorer: grouped by novel ---------------- */
  A.EXPLORER_EXTRA.novels = () => {
    const active = A.S.active;
    const shown = N().novels.filter(U.passes);
    if (!shown.length) return `<div class="nx-sep"></div><div class="nx-empty">${N().novels.length ? "No novels match the filters" : "No novels yet"}</div>`;
    return `<div class="nx-sep"></div>${shown.map((n) => {
      const key = `novel.${n.id}`;
      const open = !A.S.collapsed.has(key);
      const pg = U.progress(n);
      const child = (kind, icon, label, right) => `<div class="tree-row nx-child ${active === `${kind}:${n.id}` ? "is-selected" : ""}" tabindex="0" role="treeitem" data-act="nx-open" data-k="${kind}" data-id="${n.id}">${ic(icon)}<span class="tree-label">${label}</span><span class="nx-n mono">${right}</span></div>`;
      return `<div class="nx-group">
        <div class="tree-row nx-novel" tabindex="0" role="treeitem" aria-expanded="${open}" data-act="nx-toggle" data-id="${n.id}" data-k="${key}">${ic(open ? "chev-d" : "chev-r")}${cover(n, "cover-xs")}<span class="tree-label">${esc(U.nameOf(n))}</span></div>
        ${open ? `${child("novel", "book", "Chapters", pg.total)}${child("translation", "lang", "Translation", `${pg.tr}/${pg.total}`)}${child("knowledge", "graph", "Knowledgebase", `${pg.kb}/${pg.total}`)}` : ""}</div>`;
    }).join("")}`;
  };

  A.EXPLORER_EXTRA.filters = () => {
    const f = U.filters();
    const tags = U.allTags();
    const langs = LANGS.map(([c]) => [c, N().novels.filter((n) => n.lang === c).length]).filter(([, k]) => k);
    const pill = (k, v, n) => `<button type="button" class="nf-pill ${(k === "tag" ? f.tags : f.langs).includes(v) ? "is-on" : ""}" data-act="nf-toggle" data-k="${k}" data-v="${esc(v)}" aria-pressed="${(k === "tag" ? f.tags : f.langs).includes(v)}" title="${esc(v)} · ${n} novel"><span class="nf-t">${esc(v)}</span><span class="nf-n mono">${n}</span></button>`;
    return `<div class="nf-label">Tags</div><div class="nf-pills">${tags.map(([t, n]) => pill("tag", t, n)).join("") || `<span class="nx-empty">No tags yet</span>`}</div>
      <div class="nf-label">Language</div><div class="nf-pills">${langs.map(([c, n]) => pill("lang", c, n)).join("")}</div>
      ${U.filterActive() ? `<div class="tree-row nf-clear" tabindex="0" data-act="nf-clear">${ic("x")}<span class="tree-label">Clear filters</span></div>` : ""}`;
  };

  const novelOf = (el) => U.novelById(el?.dataset?.id || A.S.active.split(":")[1]);
  const touch = (n) => { n.updated = A.stamp(); U.refreshTabs(n.id); A.renderExplorer(); A.rerender(); };
  const addTag = (n, raw) => {
    const t = U.normTag(raw);
    if (!t) return false;
    const tags = U.tagsOf(n);
    if (tags.includes(t)) { A.toast(`Tag “${t}” already exists.`, "warning"); return false; }
    if (tags.length >= MAX_TAGS) { A.toast(`At most ${MAX_TAGS} tags per novel.`, "warning"); return false; }
    n.tags = [...tags, t];
    return true;
  };

  function gotoChapter(n) {
    const r = R();
    r.ch = Math.max(1, Math.min(U.chaptersFor(U.bind(A.S.active)).length, n));
    r.edit = null;
    A.rerender();
  }
  const novelId = () => A.S.active.split(":")[1];

  Object.assign(A.ACT, {
    "nx-toggle": (el) => {
      const k = el.dataset.k;
      A.S.collapsed.has(k) ? A.S.collapsed.delete(k) : A.S.collapsed.add(k);
      A.renderExplorer();
    },
    "nx-open": (el) => {
      const { k, id } = el.dataset;
      if (k === "novel") openNovel(id);
      else U.openNovelTab(k, id);
    },
    "nm-open": (el) => openNovel(el.dataset.id, "chapters"),
    // like the library: click selects, clicking the selected one again clears it (the 2nd click of a double click keeps it)
    "nm-sel": (el, e) => {
      const nm = NM();
      const dbl = e?.detail >= 2;
      nm.selected = !dbl && nm.selected === el.dataset.id ? null : el.dataset.id;
      applySel();
    },
    "nm-del": (el) => openDelete(el.dataset.id ? [el.dataset.id] : selIds()),
    "nm-del-confirm": () => {
      const ids = new Set(pendingDel);
      const titles = N().novels.filter((n) => ids.has(n.id)).map((n) => U.nameOf(n));
      N().novels = N().novels.filter((n) => !ids.has(n.id));
      ids.forEach((id) => {
        ["novel", "translation", "knowledge"].forEach((k) => {
          const t = `${k}:${id}`;
          if (A.S.tabs.includes(t)) A.closeTab(t);
          delete A.ITEMS[t];
        });
        A.S.collapsed.delete(`novel.${id}`);
        delete (R().scr || {})[id];
      });
      if (ids.has(NM().selected)) NM().selected = null;
      if (!U.novelById(N().reader.novel)) N().reader.novel = N().novels[0]?.id || "";
      pendingDel = [];
      A.closeModal();
      A.renderExplorer();
      A.rerender();
      A.toast(titles.length === 1 ? `Deleted “${titles[0]}”.` : `Deleted ${titles.length} novels.`);
    },
    "nm-view": (el) => { A.store.set("nm.view", el.dataset.v); A.rerender(); },
    "nm-clear": () => { ui("nm", {}).q = ""; A.ACT["nf-clear"](); },
    "nf-toggle": (el) => {
      const f = U.filters();
      const list = el.dataset.k === "tag" ? f.tags : f.langs;
      const i = list.indexOf(el.dataset.v);
      if (i < 0) list.push(el.dataset.v); else list.splice(i, 1);
      A.renderExplorer();
      A.rerender();
    },
    "nf-clear": () => { const f = U.filters(); f.tags = []; f.langs = []; A.renderExplorer(); A.rerender(); },
    "nv-cover-del": (el) => {
      const n = novelOf(el);
      delete n.coverImg;
      n.updated = A.stamp();
      A.rerender();
      A.renderExplorer();
      A.toast("Removed the cover image, using the default cover again.");
    },
    "nv-cover-pick": (el) => el.parentElement.querySelector('input[type="file"]')?.click(),
    "nv-tag-add": (el) => {
      const n = novelOf(el);
      const ok = addTag(n, el.value);
      el.value = "";
      if (ok) { touch(n); A.$("#nv-tag-in")?.focus(); }
    },
    "nv-tag-del": (el) => {
      const n = U.novelById(el.dataset.id);
      n.tags = U.tagsOf(n).filter((t) => t !== el.dataset.t);
      touch(n);
    },
    "ch-open": (el) => { R().ch = +el.dataset.n; R().edit = null; setScreen(novelId(), "reading"); A.rerender(); },
    "rd-back": () => { R().edit = null; setScreen(novelId(), "chapters"); A.rerender(); },
    "rd-tool": () => U.openTranslation("trans", R().ch),
    "rd-prev": () => gotoChapter(R().ch - 1),
    "rd-next": () => gotoChapter(R().ch + 1),
    "rd-lang": (el) => { viewOpts().lang = el.dataset.v; saveView(); R().edit = null; A.rerender(); },
    "rd-layout": (el) => { viewOpts().layout = el.dataset.v; saveView(); R().edit = null; A.rerender(); },
    "rd-mode": (el) => { R().mode = el.dataset.v; R().edit = null; A.rerender(); },
    "rd-edit": (el) => { R().edit = el.dataset.p; A.rerender(); },
    "rd-cancel": () => {
      // a passage that was just added and never filled in is discarded
      const nv = U.bind(A.S.active);
      const c = U.chapterIn(nv, R().ch);
      const ps = c ? U.parasOf(c) : [];
      const i = ps.findIndex((x) => x.id === R().edit && x.t === "");
      if (i >= 0) ps.splice(i, 1);
      R().edit = null;
      A.rerender();
    },
    "rd-add-p": () => {
      const nv = U.bind(A.S.active);
      const c = U.chapterIn(nv, R().ch);
      if (!c || isLocked(nv, c)) return;
      const ps = U.parasOf(c);
      const open = ps.find((x) => x.t === "");
      const p = open || { id: `${c.n}.${ps.length + 1}`, t: "" };
      if (!open) ps.push(p);
      R().edit = p.id;
      A.rerender();
    },
    "ch-add": () => openAddChapter(),
    "ch-add-submit": () => {
      const nv = U.bind(A.S.active);
      const list = U.chaptersFor(nv);
      const title = A.$("#ch-new-title").value.trim() || `Chapter ${list.length + 1}`;
      const sample = nv.id === U.SAMPLE;
      list.push({ n: list.length + 1, title, words: 0, paras: sample ? null : [], ...(sample ? { body: [] } : {}) });
      U.syncNovel(nv);
      A.closeModal();
      refreshChapters();
      A.toast(`Added chapter ${list.length}: “${title}”.`);
    },
    "ch-up": (el) => moveChapter(+el.dataset.n, +el.dataset.n - 1),
    "ch-down": (el) => moveChapter(+el.dataset.n, +el.dataset.n + 1),
    "ch-del": (el) => openDeleteChapter(+el.dataset.n),
    "ch-del-confirm": () => {
      const nv = U.bind(A.S.active);
      const list = U.chaptersFor(nv);
      const c = list[pendingCh - 1];
      if (!c || isLocked(nv, c)) { A.closeModal(); return; }
      const cur = list[R().ch - 1];
      list.splice(pendingCh - 1, 1);
      renumberChapters(list, nv);
      R().ch = Math.max(1, Math.min(list.length, cur === c ? pendingCh : list.indexOf(cur) + 1));
      U.syncNovel(nv);
      A.closeModal();
      refreshChapters();
      A.toast(`Deleted chapter “${c.title}”.`);
    },
    "rd-save": (el) => {
      const text = A.$("#rd-ta").value.trim();
      if (!text) { A.toast("The passage cannot be empty.", "warning"); return; }
      const res = U.applySourceEdit(el.dataset.p, text);
      R().edit = null;
      A.rerender();
      if (!res) { A.toast("No changes.", "warning"); return; }
      const extra = [res.warned ? "1 translation needs review" : "", res.stale ? `${res.stale} knowledge claims marked` : ""].filter(Boolean).join(", ");
      A.toast(`Saved the passage${extra ? `. ${extra}` : ""}.`);
    },
    "pf-font": (el) => { prefs().font = el.dataset.v; savePrefs(); applyPrefs(); A.renderInspector(); },
    "pf-lh": (el) => { prefs().lh = +el.dataset.v; savePrefs(); applyPrefs(); A.renderInspector(); },
    "pf-width": (el) => { prefs().width = +el.dataset.v; savePrefs(); applyPrefs(); A.renderInspector(); },
    "pf-paper": (el) => { prefs().paper = el.dataset.v; savePrefs(); applyPrefs(); A.renderInspector(); },
    "pf-reset": () => { R().prefs = { ...PREF_DEFAULT }; savePrefs(); applyPrefs(); A.renderInspector(); },
    "nm-new": openCreate,
    "nm-create-submit": () => {
      const title = A.$("#nn-title").value.trim();
      if (!title) { A.$("#nn-err").hidden = false; A.$("#nn-title").classList.add("is-invalid"); return; }
      const lang = A.$("#nn-lang").value;
      const n = N().novels;
      n.unshift({
        id: U.nextNovelId(), title, display: A.$("#nn-display").value.trim() === title ? "" : A.$("#nn-display").value.trim(), author: A.$("#nn-author").value.trim() || "Unknown", lang, langName: LANGS.find((l) => l[0] === lang)[1],
        chapters: 0, words: 0, updated: A.stamp(), origin: "Create new", desc: A.$("#nn-desc").value.trim() || "No description yet.", cover: COVERS[n.length % COVERS.length],
        tags: [...new Set(A.$("#nn-tags").value.split(",").map(U.normTag).filter(Boolean))].slice(0, MAX_TAGS),
      });
      A.closeModal();
      A.rerender();
      A.renderExplorer();
      A.toast(`Created novel “${title}”.`);
    },
  });

  Object.assign(A.ON, {
    "nm-q": (el) => { ui("nm", {}).q = el.value; A.rerender(); },
    "nv-cover": (el) => {
      const file = el.files[0];
      const owner = novelOf(el);
      el.value = "";
      if (!file) return;
      if (!/^image\//.test(file.type)) { A.toast("The file is not an image.", "warning"); return; }
      if (file.size > 8 * 1024 * 1024) { A.toast("The image is larger than 8 MB.", "warning"); return; }
      const id = owner.id;
      const reader = new FileReader();
      reader.onload = () => {
        // scale down to at most 640px height so the prototype does not keep the original image in memory
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 640 / img.height);
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          const n = U.novelById(id);
          n.coverImg = c.toDataURL("image/jpeg", 0.85);
          n.updated = A.stamp();
          A.rerender();
          A.renderExplorer();
          A.toast("Cover image changed.");
        };
        img.onerror = () => A.toast("Could not read the image.", "warning");
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    },
    "nv-edit": (el) => {
      const n = novelOf(el);
      const f = el.dataset.f;
      const v = el.value.trim();
      if (f === "title" && !v) { el.value = n.title; A.toast("The original name cannot be empty.", "warning"); return; }
      if (f === "display") { n.display = v === n.title ? "" : v; touch(n); return; }
      if (f === "lang") { n.lang = v; n.langName = LANGS.find((l) => l[0] === v)?.[1] || v; }
      else if (f === "desc") n.desc = v || "No description yet.";
      else if (f === "author") n.author = v || "Unknown";
      else n[f] = v;
      touch(n);
    },
    "ch-q": (el) => { ui("ch", {}).q = el.value; A.rerender(); },
    "rd-ch": (el) => gotoChapter(Math.floor(+el.value) || 1),
    "rd-title": (el) => {
      const nv = U.bind(A.S.active);
      const c = U.chapterIn(nv, R().ch);
      const title = el.value.trim();
      if (!c) return;
      if (!title) { A.toast("The chapter title cannot be empty.", "warning"); A.rerender(); return; }
      if (title === c.title) return;
      c.title = title;
      nv.updated = A.stamp();
      A.rerender();
      A.renderInspector();
      A.toast("Renamed the chapter.");
    },
    "pf-size": (el) => {
      prefs().size = +el.value;
      savePrefs();
      applyPrefs();
      const v = A.$("#pf-size-v");
      if (v) v.textContent = `${el.value} px`;
    },
    "pf-nums": (el) => { prefs().nums = el.checked; savePrefs(); applyPrefs(); },
    "pf-justify": (el) => { prefs().justify = el.checked; savePrefs(); applyPrefs(); },
  });

  /* ---------------- Dialogs: create new / import package (REQ-02-001) ---------------- */
  function openCreate() {
    A.modal({
      title: "Create a new novel", eyebrow: CAP,
      body: `<div class="field"><label for="nn-title">Original name</label><input id="nn-title" class="input" placeholder="Example: The Late Wind on Pine Hill" autocomplete="off"><p class="field-err" id="nn-err" hidden>Enter the original name of the work.</p></div>
        <div class="field"><label for="nn-display">Display name</label><input id="nn-display" class="input" placeholder="Leave empty to use the original name" autocomplete="off"></div>
        <div class="form-2"><div class="field"><label for="nn-author">Author</label><input id="nn-author" class="input" autocomplete="off"></div>
        <div class="field"><label for="nn-lang">Source language</label><select id="nn-lang" class="select">${U.options(LANGS, "VI")}</select></div></div>
        <div class="field"><label for="nn-tags">Tags</label><input id="nn-tags" class="input" placeholder="fantasy, dark, harbor" autocomplete="off"><span class="field-hint">Separated by commas. Can be edited later in the Inspector.</span></div>
        <div class="field"><label for="nn-desc">Description</label><textarea id="nn-desc" class="textarea" rows="3"></textarea><span class="field-hint">Chapters can be added after creation.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="nm-create-submit">Create novel</button>`,
    });
  }

  /* ---------------- Dialog: delete novel ---------------- */
  let pendingDel = [];
  function openDelete(ids) {
    pendingDel = ids.filter((id) => U.novelById(id));
    if (!pendingDel.length) return;
    const list = pendingDel.map(U.novelById);
    const one = list.length === 1;
    A.modal({
      title: one ? "Delete novel" : `Delete ${list.length} novels`, eyebrow: CAP,
      body: `<div class="del-list">${list.map((n) => `<div class="del-row">${cover(n, "cover-md")}<div><div class="t-ink">${esc(U.nameOf(n))}</div><div class="t-sm t-mute">${esc(n.author)} · ${fmt(n.chapters)} chapters</div><div class="nm-fr">${fracs(n)}</div></div></div>`).join("")}</div>
        <div class="ld-warn">${ic("alert")}<span>The chapters, translations, dictionary and knowledge of ${one ? "this novel" : "these novels"} will be deleted from the workspace. This cannot be undone.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-danger" data-act="nm-del-confirm">${ic("trash")}Delete${one ? "" : ` ${list.length} novel`}</button>`,
    });
  }

  // double click or Enter opens the novel; Delete removes the selected novels
  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest("[data-open]");
    if (el && !e.target.closest("input,button")) openNovel(el.dataset.open, "chapters");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("[data-open]")) { openNovel(e.target.dataset.open, "chapters"); return; }
    if (e.key === "Delete" && A.S.active === "novels" && !e.target.matches?.("input,textarea,select") && !A.$("#layer .modal") && selIds().length) openDelete(selIds());
  });
})();
