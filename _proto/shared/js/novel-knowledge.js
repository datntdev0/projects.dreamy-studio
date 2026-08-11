/*
 * Novel knowledgebase: một màn hình `knowledge:<id>` gồm ba tab Graph · List · Review.
 *  - Phân tích mở bằng dialog (chọn khoảng chương: thiếu / khoảng / toàn bộ; khoảng và toàn bộ có tùy chọn ghi đè).
 *  - ontology.yml xem được trong dialog.
 *  - Review chạy bộ kiểm tra tất định (novel-kb-check.js) trên kết quả của LLM.
 *  - Sửa entity / fact bằng dialog draft (novel-kb-edit.js), xem trước kết quả kiểm tra xung đột trước khi xác nhận.
 *  - Chi tiết của mục đang chọn nằm ở Inspector.
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
  const typeName = (t) => (O().entityTypes[t]?.label) || ({ event: "Sự kiện", relation: "Quan hệ" }[t]);
  const TYPES_ALL = [...Object.entries(O().entityTypes).map(([k, v]) => [k, v.label]), ["event", "Sự kiện"]];
  const STATUS = { proposed: ["badge-info", "Đề xuất"], confirmed: ["badge-success", "Đã xác nhận"], edited: ["badge-primary", "Đã sửa"], rejected: ["", "Từ chối"] };
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
        `<label class="bar-field" data-tip="Ẩn mọi nhận định ở chương sau mốc này"><span>${ic("lock")}Đọc đến</span><select id="kb-upto" class="select" data-on="kb-upto">${U.options(N().chapters.map((c) => [c.n, `Ch.${c.n} · ${c.title}`]), upTo())}</select></label>
         <button class="btn btn-sm" data-act="kb-onto">${ic("file-code")}ontology.yml</button>
         <button class="btn btn-sm btn-primary" data-act="kb-analyze">${ic("graph")}Phân tích…</button>`)}
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
      const warn = n.length ? `<span class="iss-dot ${n.some((x) => x.sev === "error") ? "is-err" : "is-warn"}" title="${n.length} vấn đề cần xem ở Review">${ic("alert")}${n.length}</span>` : "";
      return `<tr class="${v.sel === i.id ? "is-selected" : ""} ${i.status === "rejected" ? "is-muted" : ""}" tabindex="0" data-act="kb-sel" data-id="${i.id}" data-dbl="kb-edit">
        <td>${typeTag(i)}</td>
        <td><div class="t-ink">${esc(nm(i))}</div>${ent && i.summary ? `<div class="t-sm t-mute ellip">${esc(i.summary)}</div>` : ""}${!ent && i.kind === "event" ? `<div class="t-sm t-mute">${esc(i.when)}</div>` : ""}</td>
        ${ent ? `<td class="num mono t-mute">${factCount(i)}</td>` : ""}
        <td>${U.certBadge(i.cert)}</td><td><span class="badge ${STATUS[i.status][0]}">${STATUS[i.status][1]}</span></td><td class="cen">${warn}</td>
        <td class="row-actions"><button class="btn btn-icon btn-sm" data-act="kb-ok" data-id="${i.id}" aria-label="Xác nhận" data-tip="Xác nhận" ${i.status === "confirmed" ? "disabled" : ""}>${ic("check")}</button>
          <button class="btn btn-icon btn-sm" data-act="kb-edit" data-id="${i.id}" aria-label="Sửa" data-tip="Sửa">${ic("pen")}</button>
          <button class="btn btn-icon btn-sm" data-act="kb-no" data-id="${i.id}" aria-label="Từ chối" data-tip="Từ chối" ${i.status === "rejected" ? "disabled" : ""}>${ic("x")}</button></td></tr>`;
    }).join("");
    const nEnt = items().filter((i) => i.kind === "entity" && itemCh(i) <= upTo()).length;
    const nFact = items().filter((i) => i.kind !== "entity" && itemCh(i) <= upTo()).length;
    const bulk = items().filter((i) => i.status === "proposed" && i.cert === "text" && !i.stale && !flagged.has(i.id));
    const typeOpts = ent ? Object.entries(O().entityTypes).map(([k, x]) => [k, x.label]) : [["relation", "Quan hệ"], ["event", "Sự kiện"]];
    return `<div class="tl-sub is-wrap">${U.seg("kb-list", [["entity", `Entity ${nEnt}`], ["fact", `Fact ${nFact}`]], v.list)}
        <label class="search"><span class="sr-only">Tìm</span><input id="kb-q" class="input" type="search" value="${esc(v.q)}" placeholder="${ent ? "Tìm entity…" : "Tìm fact…"}" data-on="kb-q"></label>
        <select class="select" data-on="kb-ft" aria-label="Loại">${U.options([["all", "Mọi loại"], ...typeOpts], v.fType)}</select>
        <select class="select" data-on="kb-fc" aria-label="Nguồn gốc">${U.options([["all", "Mọi nguồn gốc"], ["text", "Văn bản xác nhận"], ["claim", "Lời nhân vật"], ["inferred", "AI suy luận"]], v.fCert)}</select>
        <select class="select" data-on="kb-fs" aria-label="Trạng thái">${U.options([["all", "Mọi trạng thái"], ["proposed", "Đề xuất"], ["confirmed", "Đã xác nhận"], ["edited", "Đã sửa"], ["rejected", "Từ chối"]], v.fStatus)}</select>
        <label class="check"><input type="checkbox" data-on="kb-fi" ${v.onlyIssues ? "checked" : ""}><span>Chỉ mục có xung đột</span></label>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-act="kb-bulk" ${bulk.length ? "" : "disabled"} data-tip="Mục ở trạng thái đề xuất, có chứng cứ văn bản, không có xung đột">${ic("check")}Xác nhận mục an toàn (${bulk.length})</button>
        <button class="btn btn-sm" data-act="kb-new" data-v="${ent ? "entity" : "fact"}">${ic("plus")}Thêm ${ent ? "entity" : "fact"}</button></div>
      <div class="kb-table" data-keep="kb-list">${list.length
    ? `<table class="table"><thead><tr><th>Loại</th><th>${ent ? "Entity" : "Fact"}</th>${ent ? `<th class="num" title="Số fact liên quan">Fact</th>` : ""}<th>Nguồn gốc</th><th>Trạng thái</th><th class="cen">${ic("alert")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : U.empty("Không có mục nào khớp", "Thử bỏ bớt bộ lọc.", `<button class="btn" data-act="kb-clear">Xóa bộ lọc</button>`)}</div>`;
  }

  /* ---------------- Review (kiểm tra tất định) ---------------- */
  function reviewTab() {
    const v = V();
    const { open, ignored } = issues();
    const rules = C.perRule(open);
    const shown = (v.rf === "open" ? open : ignored).filter((x) => v.rrule === "all" || x.rule === v.rrule);
    const chip = (r) => `<button type="button" class="rule ${r.n ? (r.severity === "error" ? "is-err" : "is-warn") : "is-ok"} ${v.rrule === r.rule ? "is-active" : ""}" data-act="kb-rule" data-v="${r.rule}" title="${esc(r.desc)}">
        ${r.n ? `<b>${r.n}</b>` : ic("check")}<span>${esc(r.label)}</span></button>`;
    return `<div class="rv-rules">${rules.map(chip).join("")}</div>
      <div class="tl-sub">${U.seg("kb-rf", [["open", `Đang mở ${open.length}`], ["ignored", `Đã bỏ qua ${ignored.length}`]], v.rf)}
        ${v.rrule !== "all" ? `<button class="btn btn-sm btn-ghost" data-act="kb-rule" data-v="all">${ic("x")}Bỏ lọc quy tắc</button>` : ""}
        <span class="spacer"></span><span class="t-sm t-mute">${ic("check")} Bộ kiểm tra chạy bằng code, không dùng LLM. ${Object.keys(O().rules).length} quy tắc theo ontology.yml.</span></div>
      <div class="tl-list rv-list" data-keep="kb-rv">${shown.length ? shown.map(issueCard).join("")
    : U.empty(v.rf === "open" ? "Không có xung đột nào" : "Chưa bỏ qua vấn đề nào", v.rf === "open" ? "Kết quả phân tích khớp ontology và văn bản nguồn. Chạy phân tích hoặc sửa nội dung sẽ kiểm tra lại tự động." : "Vấn đề đã bỏ qua sẽ nằm ở đây và có thể hoàn tác.")}</div>`;
  }

  function issueCard(x) {
    const r = O().rules[x.rule];
    const its = x.ids.map(byId).filter(Boolean);
    const chips = its.map((i) => `<button type="button" class="chip" data-act="kb-sel-id" data-id="${i.id}">${esc(typeName(typeOf(i)))} · ${esc(nm(i))}</button>`).join("");
    let extra = "";
    const d = x.data || {};
    if (x.rule === "evidence_quote" && d.q) {
      extra = `<div class="iss-ev"><span class="eyebrow">Dẫn chứng LLM đưa ra</span><blockquote class="quote is-bad">${esc(d.q)}</blockquote>${d.source ? `<span class="eyebrow">Đoạn nguồn ${U.ref(d.p)}</span><blockquote class="quote">${esc(d.source)}</blockquote>` : ""}</div>`;
    } else if (x.rule === "attribute_single") {
      extra = `<div class="iss-ev">${d.list.map((a) => `<div class="kb-relrow"><span class="t-ink">${esc(C.attrLabel(a.k))}: “${esc(a.v)}”</span>${a.p ? U.ref(a.p) : ""}</div>`).join("")}</div>`;
    } else if (x.rule === "relation_unique") {
      extra = "";
    }
    const btn = (act, label, data = "", cls = "") => `<button class="btn btn-sm ${cls}" data-act="${act}" ${data}>${label}</button>`;
    const first = x.ids[0];
    const acts = [];
    if (x.rule === "evidence_quote") {
      if (d.q !== undefined) acts.push(btn("kb-fx-ev", `${ic("x")}Xóa dẫn chứng sai`, `data-id="${first}" data-i="${d.idx}"`));
      acts.push(btn("kb-fix", `${ic("pen")}Sửa…`, `data-k="${esc(x.id)}"`), btn("kb-fx-rej", "Từ chối mục", `data-id="${first}"`));
    } else if (x.rule === "attribute_single") {
      [...new Set(d.list.map((a) => a.v))].forEach((v) => acts.push(btn("kb-fx-attr", `Giữ “${esc(v)}”`, `data-id="${first}" data-k="${d.k}" data-v="${esc(v)}"`)));
      acts.push(btn("kb-fix", `${ic("pen")}Sửa…`, `data-k="${esc(x.id)}"`));
    } else if (x.rule === "entity_duplicate") {
      const [a, b] = its;
      acts.push(btn("kb-fx-merge", `${ic("swap")}Gộp “${esc(b.name)}” vào “${esc(a.name)}”`, `data-a="${a.id}" data-b="${b.id}"`), btn("kb-fx-merge", `Gộp “${esc(a.name)}” vào “${esc(b.name)}”`, `data-a="${b.id}" data-b="${a.id}"`), btn("kb-fix", `${ic("pen")}Sửa…`, `data-k="${esc(x.id)}"`));
    } else if (x.rule === "relation_unique") {
      acts.push(btn("kb-fix", `${ic("pen")}Sửa…`, `data-k="${esc(x.id)}"`));
    } else if (x.rule === "source_stale") {
      acts.push(btn("kb-keep", "Giữ nguyên", `data-id="${first}"`), btn("kb-redo", `${ic("refresh")}Phân tích lại…`, `data-id="${first}"`));
    } else {
      acts.push(btn("kb-fix", `${ic("pen")}Sửa…`, `data-k="${esc(x.id)}"`), btn("kb-fx-rej", "Từ chối mục", `data-id="${first}"`));
    }
    const dismissBtn = V().rf === "ignored" ? btn("kb-restore", "Hoàn tác", `data-k="${esc(x.id)}"`)
      : x.rule === "source_stale" ? "" : btn("kb-dismiss", x.rule === "entity_duplicate" ? "Giữ cả hai" : "Bỏ qua", `data-k="${esc(x.id)}"`, "btn-ghost");
    return `<div class="card iss is-${x.sev}" data-act="kb-sel-id" data-id="${first}">
      <div class="iss-top"><span class="badge ${x.sev === "error" ? "badge-danger" : "badge-warning"}">${x.sev === "error" ? "LỖI" : "CẢNH BÁO"}</span><b>${esc(r.label)}</b><span class="spacer"></span><span class="mono t-mute">${x.rule}</span></div>
      <p>${esc(x.msg)}</p><div class="iss-items">${chips}</div>${extra}
      <div class="w-act">${acts.join("")}${dismissBtn}</div></div>`;
  }

  /* ---------------- Inspector ---------------- */
  const evidenceHtml = (it) => it.ev.map((e) => `<div class="kb-ev"><blockquote class="quote">${esc(e.q)}</blockquote>${U.ref(e.p)}</div>`).join("") || `<p class="t-sm t-mute">Chưa có dẫn chứng.</p>`;

  function detail(it, open) {
    const attrs = it.kind === "entity" && it.attrs.length
      ? `<dl class="kv">${it.attrs.map((a) => `<dt>${esc(C.attrLabel(a.k))}</dt><dd>${esc(a.v)} ${a.p ? U.ref(a.p) : ""}</dd>`).join("")}</dl>` : "";
    const ends = it.kind === "relation"
      ? `<div class="kb-rel">${byId(it.from) ? `<button class="chip" data-act="kb-sel-id" data-id="${it.from}">${esc(byId(it.from).name)}</button>` : "?"}<span>—${esc(it.label)}→</span>${byId(it.to) ? `<button class="chip" data-act="kb-sel-id" data-id="${it.to}">${esc(byId(it.to).name)}</button>` : "?"}</div>` : "";
    const rel = it.kind === "entity" ? items().filter((r) => r.kind === "relation" && r.status !== "rejected" && (r.from === it.id || r.to === it.id)) : [];
    const relHtml = rel.length ? `<span class="eyebrow">Quan hệ</span>${rel.map((r) => { const out = r.from === it.id; const o = byId(out ? r.to : r.from); return `<div class="kb-relrow"><span class="t-mute">${out ? "→" : "←"}</span><span>${esc(r.label)}</span>${o ? `<button class="chip" data-act="kb-sel-id" data-id="${o.id}">${esc(o.name)}</button>` : ""}</div>`; }).join("")}` : "";
    const mine = open.filter((x) => x.ids.includes(it.id) || (it.kind === "entity" && x.ids.some((id) => { const r = byId(id); return r && r.kind === "relation" && (r.from === it.id || r.to === it.id); })));
    const conflicts = mine.length ? `<section class="ins-sec"><span class="eyebrow">Xung đột (${mine.length})</span>${mine.map((x) => `<div class="iss-mini is-${x.sev}">${ic("alert")}<span>${esc(x.msg)}</span></div>`).join("")}
        <button class="btn btn-sm" data-act="kb-tab-review">Xem ở Review</button></section>` : "";
    return `<section class="ins-sec">${typeTag(it)}<h3 class="t-display-xs">${esc(nm(it))}</h3>
        <div class="row-badges">${U.certBadge(it.cert)}<span class="badge ${STATUS[it.status][0]}">${STATUS[it.status][1]}</span></div>
        <div class="row-badges"><button class="btn btn-sm btn-primary" data-act="kb-edit" data-id="${it.id}">${ic("pen")}Chỉnh sửa…</button>
          <button class="btn btn-sm" data-act="kb-ok" data-id="${it.id}" ${it.status === "confirmed" ? "disabled" : ""}>${ic("check")}Xác nhận</button>
          <button class="btn btn-sm" data-act="kb-no" data-id="${it.id}" ${it.status === "rejected" ? "disabled" : ""}>Từ chối</button></div>
        ${it.stale ? `<div class="ld-warn">${ic("alert")}<span>${esc(it.stale)}</span></div>` : ""}
        ${it.summary ? `<p class="t-sm">${esc(it.summary)}</p>` : ""}${ends}${attrs}${it.when ? U.kv([["Thời điểm", esc(it.when)]]) : ""}${relHtml}</section>
      ${conflicts}<section class="ins-sec"><span class="eyebrow">Dẫn chứng trong văn bản</span>${evidenceHtml(it)}</section>`;
  }

  function inspector(id) {
    U.bind(id);
    if (!U.hasText()) return U.inspectorNovel();
    const { open } = issues();
    const sel = byId(V().sel);
    const by = (s) => items().filter((i) => i.status === s).length;
    const summary = U.insSec("Tri thức", U.kv([
      ["Đã phân tích", U.frac("graph", U.analyzedCount(), N().chapters.length, "Chương đã phân tích")],
      ["Entity", items().filter((i) => i.kind === "entity" && i.status !== "rejected").length],
      ["Fact", items().filter((i) => i.kind !== "entity" && i.status !== "rejected").length],
      ["Đề xuất", by("proposed")], ["Đã xác nhận", by("confirmed")],
      ["Xung đột", open.length ? `<span class="badge ${open.some((x) => x.sev === "error") ? "badge-danger" : "badge-warning"}">${open.length}</span>` : "0"],
      ["Ontology", `v${O().version} <a data-act="kb-onto" tabindex="0">Xem</a>`],
    ]));
    return `${sel ? detail(sel, open) : `<div class="ins-empty"><p>Chọn một nút trên Graph hoặc một dòng ở List để xem chi tiết.</p></div>`}${summary}`;
  }

  A.VIEWS.knowledge = { fill: true, render: view, mount, inspector };

  U.openKnowledge = (tab, id) => {
    const v = V();
    if (tab && tab !== "analyze") v.tab = tab;
    if (id) v.sel = id;
    U.openNovelTab("knowledge", N().reader.novel);
    if (tab === "analyze") openAnalyze();
  };

  /* ---------------- Dialog: phân tích ---------------- */
  const AD = { mode: "missing", from: 1, to: 1, overwrite: false, provider: "claude", src: "src" };

  /** Các ngôn ngữ đang có nội dung để phân tích: bản gốc và (nếu có) bản dịch. */
  function sourceLangs() {
    const novel = U.current();
    const nTr = Object.values(N().tr.chapters).filter((t) => !t.noSample).length;
    return [["src", `${novel.langName} (bản gốc)`], ...(nTr ? [["tr", `${N().tr.lang} (bản dịch · ${nTr}/${N().chapters.length} chương)`]] : [])];
  }
  const srcLabel = () => (AD.src === "tr" ? N().tr.lang : U.current().langName);
  /** Chương có nội dung ở ngôn ngữ nguồn đã chọn. */
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
      title: "Phân tích tri thức", eyebrow: window.DS.CAP["04"], cls: "modal-lg",
      body: `<div class="opts">
          ${mode("missing", "Chương còn thiếu", `${p.missing.length ? `${p.missing.length} chương chưa phân tích (Ch.${U.rangeText(p.missing)})` : "Không còn chương nào thiếu"}`)}
          ${mode("range", "Khoảng chương", "Chọn chương bắt đầu và kết thúc", AD.mode === "range" ? `<span class="opt-row"><select class="select" data-on="kb-an-from" aria-label="Từ chương">${chOpts(AD.from)}</select><span class="t-mute">đến</span><select class="select" data-on="kb-an-to" aria-label="Đến chương">${chOpts(AD.to)}</select></span>` : "")}
          ${mode("full", "Toàn bộ", `${N().chapters.length} chương`)}
        </div>
        ${AD.mode !== "missing" ? `<label class="check"><input type="checkbox" data-on="kb-an-ow" ${AD.overwrite ? "checked" : ""}><span><b>Ghi đè kết quả đã có</b><br><span class="t-sm t-mute">Phân tích lại cả chương đã có kết quả. Nhận định bạn đã xác nhận hoặc sửa được giữ nguyên.</span></span></label>` : ""}
        <div class="card side-card an-sum">
          ${U.kv([["Sẽ phân tích", p.run.length ? `<b class="t-ink">${p.run.length} chương</b> · Ch.${U.rangeText(p.run)}` : `<span class="t-mute">Không có chương nào</span>`], ["Ngôn ngữ nguồn", esc(srcLabel())], ["Giữ nguyên", p.skip.length ? `${p.skip.length} chương đã có kết quả · Ch.${U.rangeText(p.skip)}` : "—"],
      ...(est ? [["Số từ", fmt(est.words)], ["Token", `${fmt(est.tin)} vào · ${fmt(est.tout)} ra`], ["Chi phí", `${U.money(est.cost)} · ~${est.minutes} phút`]] : [])])}
          ${p.noSrc.length ? `<div class="ld-warn">${ic("alert")}<span>${p.noSrc.length} chương chưa có nội dung ${esc(srcLabel())} nên bị bỏ qua · Ch.${U.rangeText(p.noSrc)}.</span></div>` : ""}
          ${p.over.length ? `<div class="ld-warn">${ic("alert")}<span>${p.over.length} chương đã có kết quả sẽ được ghi đè.</span></div>` : ""}
        </div>
        <div class="form-2"><div class="field"><label for="kb-an-prov">Provider</label>${U.providerSelect("kb-an-prov", AD.provider)}</div>
          <div class="field"><label for="kb-an-lang">Ngôn ngữ nguồn</label><select id="kb-an-lang" class="select" data-on="kb-an-lang">${U.options(sourceLangs(), AD.src)}</select></div></div>
        <p class="t-sm t-mute an-src-hint">Phân tích đọc nội dung ở ngôn ngữ nguồn đã chọn. Chương chưa có nội dung ở ngôn ngữ đó sẽ bị bỏ qua.</p>
        <div class="an-onto">${ic("file-code")}<span>Phân tích theo <b>ontology.yml</b> v${O().version}: ${Object.keys(O().entityTypes).length} loại entity, ${Object.keys(O().predicates).length} quan hệ.</span><a data-act="kb-onto" tabindex="0">Xem ontology.yml</a></div>
        ${!prov.ok ? `<p class="field-err">Provider đang chọn chưa được cài trên máy này.</p>` : ""}`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-act="kb-an-run" ${p.run.length && prov.ok ? "" : "disabled"}>${ic("graph")}Bắt đầu phân tích${p.run.length ? ` (${p.run.length} chương)` : ""}</button>`,
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
    K().log.unshift({ date: A.stamp(), text: `Phân tích Ch.${n} hoàn tất.` });
    A.renderExplorer();
  }

  function startAnalysis() {
    const p = plan();
    if (!p.run.length) return;
    A.closeModal();
    A.startPipeline({
      kind: "analyze", label: `Phân tích ${p.run.length} chương`, detail: `${U.nameOf(U.current())} · Ch.${U.rangeText(p.run)} · nguồn ${srcLabel()}${p.over.length ? " · ghi đè" : ""}`,
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
      body: `<div class="onto-sum">${[["Loại entity", Object.keys(o.entityTypes).length], ["Thuộc tính", Object.keys(o.attributes).length], ["Quan hệ", Object.keys(o.predicates).length], ["Quy tắc kiểm tra", Object.keys(o.rules).length]].map(([l, n]) => `<div><b>${n}</b><span>${l}</span></div>`).join("")}</div>
        <p class="t-sm t-mute">Ontology cho LLM biết cần trích xuất những gì, và cho bộ kiểm tra ở tab Review biết thế nào là mâu thuẫn. Đường dẫn: <span class="path">novels\\${esc(U.current().id)}\\ontology.yml</span>. Chỉnh sửa file bằng trình soạn thảo bên ngoài; thay đổi áp dụng cho lần phân tích và kiểm tra kế tiếp.</p>
        <pre class="yaml" tabindex="0">${yamlHtml(text)}</pre>`,
      foot: `<button class="btn" data-act="kb-onto-open">${ic("file-code")}Mở bằng trình soạn thảo mặc định</button><button class="btn" data-act="kb-onto-copy">Sao chép</button><span class="spacer"></span><button class="btn btn-primary" data-act="close-modal">Đóng</button>`,
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
      A.toast(`Đã xác nhận ${list.length} nhận định.`);
    },
    "kb-clear": () => { Object.assign(V(), { fType: "all", fCert: "all", fStatus: "all", q: "", onlyIssues: false }); A.rerender(); },
    "kb-rule": (el) => { V().rrule = V().rrule === el.dataset.v ? "all" : el.dataset.v; A.rerender(); },
    "kb-rf": (el) => { V().rf = el.dataset.v; A.rerender(); },
    "kb-dismiss": (el) => { C.dismiss(el.dataset.k); fixed("Đã bỏ qua vấn đề."); },
    "kb-restore": (el) => { C.restore(el.dataset.k); fixed("Đã hoàn tác."); },
    "kb-fx-ev": (el) => { C.removeEvidence(el.dataset.id, +el.dataset.i); fixed("Đã xóa dẫn chứng sai."); },
    "kb-fx-rej": (el) => { C.reject(el.dataset.id); fixed("Đã từ chối mục."); },
    "kb-fx-attr": (el) => { C.keepAttr(el.dataset.id, el.dataset.k, el.dataset.v); fixed(`Đã giữ “${el.dataset.v}”.`); },
    "kb-fx-merge": (el) => { const a = byId(el.dataset.a); const b = byId(el.dataset.b); C.merge(a.id, b.id); V().sel = a.id; fixed(`Đã gộp “${b.name}” vào “${a.name}”.`); },
    "kb-keep": (el) => {
      const it = byId(el.dataset.id);
      it.stale = null;
      K().log.unshift({ date: A.stamp(), text: `Giữ nguyên “${nm(it)}” sau khi nguồn thay đổi.` });
      fixed("Đã đánh dấu là còn đúng.");
    },
    "kb-redo": (el) => {
      const chs = byId(el.dataset.id).ev.map((e) => NV.chOf(e.p));
      openAnalyze({ mode: "range", from: Math.min(...chs), to: Math.max(...chs), overwrite: true });
    },
    "kb-analyze": () => openAnalyze(),
    "kb-an-run": startAnalysis,
    "kb-onto": openOntology,
    "kb-onto-open": () => {
      // Prototype chạy trong trình duyệt nên không gọi được shell. Tải file xuống để hệ điều hành mở bằng trình soạn thảo mặc định; bản desktop sẽ mở thẳng file trong workspace.
      const url = URL.createObjectURL(new Blob([C.yaml()], { type: "text/yaml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "ontology.yml";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      A.toast("Prototype: đã tải ontology.yml xuống. Bản desktop sẽ mở file bằng trình soạn thảo mặc định của hệ thống.", "info");
    },
    "kb-onto-copy": () => { try { navigator.clipboard.writeText(C.yaml()); A.toast("Đã sao chép ontology.yml."); } catch { A.toast("Không sao chép được.", "warning"); } },
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

  // Bấm đúp một dòng trong List để sửa.
  document.addEventListener("dblclick", (e) => {
    const tr = e.target.closest("tr[data-dbl]");
    if (!tr || e.target.closest("button")) return;
    KBE.open({ ids: [tr.dataset.id] });
  });
})();
