/*
 * Novel management.
 *  - `novels`      danh sách novel của workspace (list / grid).
 *  - `novel:<id>`  một novel, hai màn hình: Chapters → Reading. Tùy chỉnh hiển thị của Reading nằm ở Inspector.
 */
(function () {
  const A = window.DSApp;
  const U = window.NVU;
  const NV = window.NV;
  const { esc, ic } = A;
  const { N, ui, fmt, frac, cover, datatable } = U;

  const CAP = window.DS.CAP["02"];
  const LANGS = [["EN", "Tiếng Anh"], ["VI", "Tiếng Việt"], ["ZH", "Tiếng Trung"], ["JA", "Tiếng Nhật"], ["KO", "Tiếng Hàn"]];
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
  /** Ngôn ngữ đọc (`src` gốc / `tr` bản dịch) và bố cục (`single` một ngôn ngữ / `parallel` song song). */
  const viewOpts = () => (R().view ||= { lang: "src", layout: "single", ...A.store.get("rd.view", {}) });
  const saveView = () => A.store.set("rd.view", viewOpts());
  const trCode = () => ({ "Tiếng Việt": "VI", "Tiếng Anh": "EN" }[N().tr.lang] || String(N().tr.lang).slice(0, 2).toUpperCase());
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
    return k === "tr" ? frac("lang", pg.tr, pg.total, "Chương đã dịch") : frac("graph", pg.kb, pg.total, "Chương đã phân tích");
  };
  const fracs = (n) => {
    const pg = U.progress(n);
    return `${frac("lang", pg.tr, pg.total, "Chương đã dịch")}${frac("graph", pg.kb, pg.total, "Chương đã phân tích")}`;
  };

  /** Chip các bộ lọc đang bật (đặt ở Filters trong explorer) hiện ngay trên thanh công cụ. */
  function activeChips() {
    if (!U.filterActive()) return "";
    const f = U.filters();
    const chip = (k, v, label) => `<span class="tag">${esc(label)}<button type="button" class="tag-x" data-act="nf-toggle" data-k="${k}" data-v="${esc(v)}" aria-label="Bỏ lọc ${esc(label)}">${ic("x")}</button></span>`;
    return `<span class="nm-chips">${f.tags.map((t) => chip("tag", t, t)).join("")}${f.langs.map((l) => chip("lang", l, l)).join("")}<button type="button" class="btn btn-sm btn-ghost" data-act="nf-clear">Xóa bộ lọc</button></span>`;
  }

  function mgmtView() {
    const q = NM();
    const list = filtered();
    const selected = q.selected;
    let body;
    if (!list.length) {
      body = N().novels.length
        ? U.empty("Không có novel nào khớp", "Thử từ khóa khác hoặc bỏ bộ lọc.", `<button class="btn" data-act="nm-clear">Xóa bộ lọc</button>`)
        : U.empty("Chưa có novel nào", "Tạo novel mới hoặc nhập từ một package .dsnovel / .zip.", `<div class="empty-act"><button class="btn btn-primary" data-act="nm-new">${ic("plus")}Tạo novel</button><button class="btn" data-act="nm-import">${ic("upload")}Nhập từ package…</button></div>`);
    } else if (view() === "grid") {
      body = `<div class="nm-grid">${list.map((n) => `<div class="nm-card ${selected === n.id ? "is-selected" : ""}" tabindex="0" data-act="nm-sel" data-id="${n.id}" data-open="${n.id}" title="${esc(U.nameOf(n))}">
          <div class="nm-cover ${n.coverImg ? "has-img" : ""}" style="background:${esc(U.coverBg(n))}">
            <span class="badge nm-lang">${n.lang}</span>${n.coverImg ? "" : `<span class="nm-cover-t">${esc(n.title)}</span><span class="nm-cover-a">${esc(n.author)}</span>`}</div>
          <div class="nm-card-b"><div class="nm-card-t t-ink">${esc(U.nameOf(n))}</div><div class="nm-fr">${fracs(n)}</div></div></div>`).join("")}</div>`;
    } else {
      body = datatable({
        columns: [
          { key: "title", label: "Novel", ellipsis: true, render: (n) => `<div class="nm-title">${cover(n)}<div><div class="t-ink">${esc(U.nameOf(n))}</div><div class="t-sm t-mute">${U.nameOf(n) !== n.title ? `${esc(n.title)} · ` : ""}${esc(n.author)}</div></div></div>` },
          { key: "lang", label: "G\u1ed1c", width: "64px", render: (n) => `<span class="badge">${esc(n.lang)}</span>` },
          { key: "chapters", label: "Ch\u01b0\u01a1ng", align: "right", width: "80px", render: (n) => fmt(n.chapters) },
          { key: "words", label: "S\u1ed1 t\u1eeb", align: "right", width: "88px", render: (n) => fmt(n.words) },
          { key: "translation", label: "D\u1ecbch", align: "center", width: "96px", render: (n) => fracOf(n, "tr") },
          { key: "knowledge", label: "Tri th\u1ee9c", align: "center", width: "96px", render: (n) => fracOf(n, "kb") },
          { key: "updated", label: "C\u1eadp nh\u1eadt", width: "152px", ellipsis: true, render: (n) => `<span class="mono t-mute">${esc(n.updated)}</span>` },
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
        `<label class="search"><span class="sr-only">Tìm novel</span><input id="nm-q" class="input" type="search" value="${esc(q.q)}" placeholder="Tìm theo tên hoặc tác giả…" data-on="nm-q"></label>
         <span class="t-sm t-mute">${list.length} novel</span>${activeChips()}`,
        `${U.seg("nm-view", [["grid", ic("frames"), "Dạng lưới"], ["list", ic("list"), "Dạng danh sách"]], view())}
         <button class="btn btn-sm" data-act="nm-import" data-tip="Nhập từ package .dsnovel / .zip">${ic("upload")}Nhập…</button><button class="btn btn-sm btn-primary" data-act="nm-new">${ic("plus")}Mới</button>`,
      )}
      <div class="nv-body">${list.length && view() !== "grid" ? body : `<div class="nv-scroll" data-keep="nm">${body}</div>`}</div>
    </div>`;
  }

  /** Cập nhật vùng chọn tại chỗ (không vẽ lại danh sách để nhấp đúp vẫn trúng phần tử). */
  function applySel() {
    const id = selIds()[0];
    A.$("#editor [data-open]").forEach((el) => el.classList.toggle("is-selected", id === el.dataset.id));
    A.renderInspector();
  }

  function libraryPanel() {
    const all = N().novels;
    const tot = all.reduce((a, n) => { const p = U.progress(n); return { ch: a.ch + n.chapters, tr: a.tr + p.tr, kb: a.kb + p.kb, w: a.w + n.words }; }, { ch: 0, tr: 0, kb: 0, w: 0 });
    return `${U.insSec("Thư viện novel", U.kv([["Novel", all.length], ["Chương", fmt(tot.ch)], ["Số từ", fmt(tot.w)], ["Đã dịch", frac("lang", tot.tr, tot.ch, "Chương đã dịch")], ["Đã phân tích", frac("graph", tot.kb, tot.ch, "Chương đã phân tích")]]))}
      ${U.allTags().length ? `<section class="ins-sec"><span class="eyebrow">Tags</span><span class="tags">${U.allTags().map(([t, n]) => `<span class="tag">${esc(t)} <span class="mono t-mute">${n}</span></span>`).join("")}</span></section>` : ""}
      ${all.length ? `<section class="ins-sec"><span class="eyebrow">Gần đây</span>${[...all].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 3).map((n) =>
        `<button type="button" class="nm-recent" data-act="nm-sel" data-id="${n.id}">${cover(n, "cover-xs")}<span class="tree-label">${esc(U.nameOf(n))}</span><span class="mono t-mute">${esc(n.updated.slice(5, 10))}</span></button>`).join("")}</section>` : ""}`;
  }

  function mgmtInspector() {
    const list = selIds().map(U.novelById);
    return list.length ? novelPanel(list[0], true) : libraryPanel();
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
    const map = { none: ["", "Chưa dịch"], draft: ["dot-success", "Đã có bản dịch"], review: ["dot-warning", "Có đoạn cần xem lại"], running: ["dot-running", "Đang dịch"] };
    return st === "none" ? `<span class="dot-o" title="${map.none[1]}"></span>` : `<span class="dot ${map[st][0]}" title="${map[st][1]}"></span>`;
  };
  const kbCell = (n) => {
    if (U.runningTask("analyze", `c${n}`)) return `<span class="dot dot-running" title="Đang phân tích"></span>`;
    if (N().kb.analyzed[n] !== "done") return `<span class="dot-o" title="Chưa phân tích"></span>`;
    const stale = U.staleItems().some((i) => i.ev.some((e) => NV.chOf(e.p) === n));
    return `<span class="dot ${stale ? "dot-warning" : "dot-info"}" title="${stale ? "Nguồn đã đổi sau khi phân tích" : "Đã phân tích"}"></span>`;
  };

  function chaptersScreen(novel) {
    const q = ui("ch", { q: "" });
    const needle = q.q.trim().toLowerCase();
    const all = U.chaptersFor(novel);
    const list = all.filter((c) => !needle || `${c.n} ${c.title}`.toLowerCase().includes(needle));
    const sample = novel.id === U.SAMPLE;
    const pg = U.progress(novel);
    const tableMarkup = datatable({
      columns: [
        { key: "n", label: "#", width: "56px", render: (c) => `<span class="mono t-mute">${String(c.n).padStart(2, "0")}</span>` },
        { key: "title", label: "Ch\u01b0\u01a1ng", ellipsis: true },
        { key: "words", label: "S\u1ed1 t\u1eeb", align: "right", width: "80px", render: (c) => fmt(c.words) },
        { key: "translation", label: "D\u1ecbch", align: "center", width: "104px", render: (c) => sample ? trCell(c.n) : `<span class="dot-o"></span>` },
        { key: "knowledge", label: "Tri th\u1ee9c", align: "center", width: "104px", render: (c) => sample ? kbCell(c.n) : `<span class="dot-o"></span>` },
      ],
      rows: list,
      variant: "fill",
      testId: "novel-chapters-table",
      keep: "ch",
      rowTestId: "novel-chapter-row",
      rowClass: (c) => ({ "is-current": R().ch === c.n && sample }),
      rowAttrs: (c) => `data-act="ch-open" data-n="${c.n}"`,
      emptyHTML: U.empty("Kh\u00f4ng c\u00f3 ch\u01b0\u01a1ng n\u00e0o kh\u1edbp", "Th\u1eed t\u1eeb kh\u00f3a kh\u00e1c."),
    });
    return `<div class="nv">
      ${U.bar(U.novelTitle(), `<button class="btn btn-sm" data-act="nx-open" data-k="translation" data-id="${novel.id}">${ic("lang")}Translation</button>
        <button class="btn btn-sm" data-act="nx-open" data-k="knowledge" data-id="${novel.id}">${ic("graph")}Knowledgebase</button>
        <button class="btn btn-sm btn-primary" data-act="ch-open" data-n="${R().ch || 1}">${ic("book")}${sample ? "Tiếp tục đọc" : "Đọc"}</button>`)}
      <div class="tl-sub"><label class="search"><span class="sr-only">Tìm chương</span><input id="ch-q" class="input" type="search" value="${esc(q.q)}" placeholder="Tìm chương…" data-on="ch-q"></label>
        <span class="t-sm t-mute">${list.length}/${all.length} chương</span><span class="spacer"></span>
        <span class="legend-dots">${frac("lang", pg.tr, pg.total, "Chương đã dịch")}${frac("graph", pg.kb, pg.total, "Chương đã phân tích")}</span></div>
      <div class="nv-body is-col" data-testid="novel-chapters-body">${tableMarkup}</div>
    </div>`;
  }

  function readingScreen(novel) {
    const back = `<button class="btn btn-sm" data-act="rd-back">${ic("arrow-left")}Chapters</button>`;
    if (!U.hasText()) return `<div class="nv">${U.bar(`${back}${U.novelTitle()}`)}<div class="nv-body">${U.empty("Chương này chưa có nội dung mẫu", "Prototype chỉ có nội dung chương cho “The Lantern Keeper of Harrowmere”.", `<button class="btn btn-primary" data-act="nv-sample">Mở novel mẫu</button>`)}</div></div>`;
    const r = R();
    const p = prefs();
    const chapters = N().chapters;
    const c = U.chapter(r.ch);
    const vo = viewOpts();
    const parallel = vo.layout === "parallel";
    const showSrc = parallel || vo.lang === "src";
    const showTr = parallel || vo.lang === "tr";
    const canEdit = showSrc;
    const tr = N().tr.chapters[c.n];
    const hasTr = !!tr && !tr.noSample;
    const srcPara = (x, i) => {
      const editing = r.edit === x.id;
      const flash = r.focus === x.id ? "is-flash" : "";
      if (editing) {
        return `<div class="rd-edit" id="rp-${x.id}"><textarea id="rd-ta" class="textarea" rows="5">${esc(x.t)}</textarea>
          <div class="rd-edit-foot"><span class="t-sm t-mute">Sửa nguồn sẽ đánh dấu bản dịch và nhận định tri thức liên quan cần xem lại.</span><span class="spacer"></span>
          <button class="btn btn-sm" data-act="rd-cancel">Hủy</button><button class="btn btn-sm btn-primary" data-act="rd-save" data-p="${x.id}">Lưu đoạn</button></div></div>`;
      }
      const editable = canEdit && r.mode === "edit";
      const attr = editable ? `data-act="rd-edit" data-p="${x.id}" tabindex="0"` : "";
      return `<p class="rd-para ${editable ? "is-editable" : ""} ${flash}" id="rp-${x.id}" ${attr}><span class="rd-no">${i + 1}</span><span class="rd-tx">${esc(x.t)}${x.edited ? `<span class="rd-bd"><span class="badge badge-warning">ĐÃ SỬA</span></span>` : ""}</span></p>`;
    };
    const trPara = (x, i) => {
      const t = tr.paras[x.id];
      if (!t) return `<p class="rd-para is-tr is-empty"></p>`;
      const st = { review: ["badge-warning", "CẦN XEM LẠI"], edited: ["badge-primary", "ĐÃ SỬA"] }[t.st];
      return `<p class="rd-para is-tr" id="rt-${x.id}">${parallel ? "" : `<span class="rd-no">${i + 1}</span>`}<span class="rd-tx">${esc(t.t)}${st ? `<span class="rd-bd"><span class="badge ${st[0]}">${st[1]}</span></span>` : ""}</span></p>`;
    };
    const note = showTr && !hasTr
      ? `<div class="rd-note">${ic("alert")}<span>Chương ${c.n} chưa có bản dịch ${esc(N().tr.lang)}.</span><button class="btn btn-sm" data-act="rd-tool">${ic("lang")}Dịch chương</button></div>` : "";
    let paras;
    if (!c.paras) paras = U.empty("Chương này chưa có nội dung mẫu", "Prototype chỉ có đoạn văn mẫu cho chương 1–3.");
    else if (parallel) {
      paras = `<div class="rd-pair rd-langhead"><span>${esc(novel.lang)} · Bản gốc</span><span>${esc(trCode())} · Bản dịch</span></div>${note}`
        + c.paras.map((x, i) => `<div class="rd-pair">${srcPara(x, i)}${hasTr ? trPara(x, i) : `<p class="rd-para is-tr is-empty"></p>`}</div>`).join("");
    } else if (showTr) {
      paras = note + (hasTr ? c.paras.map(trPara).join("") : "");
    } else paras = c.paras.map(srcPara).join("");
    const langLabel = parallel ? `${esc(novel.langName)} ⇄ ${esc(N().tr.lang)}` : showTr ? `${esc(N().tr.lang)} (bản dịch)` : esc(novel.langName);
    return `<div class="nv">
      ${U.bar(
        `${back}<span class="bar-sep"></span>
         <button class="btn btn-icon btn-sm" data-act="rd-prev" ${r.ch <= 1 ? "disabled" : ""} aria-label="Chương trước" data-tip="Chương trước">${ic("chev-l")}</button>
         ${U.chapterJump("rd-ch", r.ch, chapters.length, c.title)}
         <button class="btn btn-icon btn-sm" data-act="rd-next" ${r.ch >= chapters.length ? "disabled" : ""} aria-label="Chương sau" data-tip="Chương sau">${ic("chev-r")}</button>`,
        `<span class="rd-seg-off-${parallel}">${U.seg("rd-lang", [["src", novel.lang, `Bản gốc · ${novel.langName}`], ["tr", trCode(), `Bản dịch · ${N().tr.lang}`]], vo.lang)}</span>
         ${U.seg("rd-layout", [["single", "Một ngôn ngữ"], ["parallel", "Song song"]], vo.layout)}
         ${canEdit ? U.seg("rd-mode", [["read", "Đọc"], ["edit", "Sửa"]], r.mode) : ""}
         <button class="btn btn-sm" data-act="rd-tool" data-v="translation">${ic("lang")}Dịch chương</button>`,
      )}
      <div class="nv-body">
        <article class="rd-page ${p.nums ? "" : "no-nums"} ${p.justify ? "is-justify" : ""} ${parallel ? "is-par" : ""}" data-paper="${p.paper}" style="${pageStyle()}" data-keep="rd-page"><div class="rd-col">
          <span class="eyebrow">Chương ${c.n} / ${chapters.length}</span>
          <h1 class="rd-h">${esc(c.title)}</h1>
          <div class="t-sm rd-meta">${fmt(c.words)} từ · ${langLabel}</div>
          ${paras}
          <div class="rd-end">${r.ch < chapters.length ? `<button class="btn btn-sm" data-act="rd-next">Chương sau: ${esc(chapters[r.ch].title)}${ic("chev-r")}</button>` : `<span class="t-sm">Hết chương cuối.</span>`}</div>
        </div></article>
      </div>
    </div>`;
  }

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
    return `<section class="ins-sec"><div class="ins-h"><span class="eyebrow">Hiển thị</span><span class="spacer"></span><button class="btn btn-sm btn-ghost" data-act="pf-reset">Đặt lại</button></div>
      ${field("Phông chữ", U.seg("pf-font", [["serif", "Serif"], ["sans", "Sans"], ["mono", "Mono"]], p.font))}
      ${field(`Cỡ chữ <span class="mono t-mute" id="pf-size-v">${p.size} px</span>`, `<input type="range" class="range" min="13" max="24" step="1" value="${p.size}" data-on="pf-size" aria-label="Cỡ chữ">`)}
      ${field("Giãn dòng", U.seg("pf-lh", [[1.5, "Sát"], [1.75, "Vừa"], [2, "Thoáng"]], p.lh))}
      ${field("Độ rộng cột", U.seg("pf-width", [[560, "Hẹp"], [680, "Vừa"], [820, "Rộng"]], p.width))}
      ${field("Nền", U.seg("pf-paper", [["default", "Mặc định"], ["sepia", "Giấy"], ["night", "Đêm"]], p.paper))}
      <label class="check"><input type="checkbox" data-on="pf-nums" ${p.nums ? "checked" : ""}><span>Hiện số đoạn</span></label>
      <label class="check"><input type="checkbox" data-on="pf-justify" ${p.justify ? "checked" : ""}><span>Căn đều hai bên</span></label></section>`;
  }

  const fieldIn = (label, id, control) => `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
  /** Thông tin novel chỉnh sửa trực tiếp; mỗi ô chốt khi rời ô / Enter. */
  function infoForm(n) {
    const tags = U.tagsOf(n);
    const sug = U.allTags().map(([t]) => t).filter((t) => !tags.includes(t));
    return `<section class="ins-sec ins-form"><span class="eyebrow">Thông tin</span>
      ${fieldIn("Tên hiển thị", "nv-f-display", `<input id="nv-f-display" class="input" value="${esc(n.display || "")}" placeholder="${esc(n.title)}" data-change="nv-edit" data-id="${n.id}" data-f="display" autocomplete="off"><span class="field-hint">Dùng ở explorer, tab và danh sách. Để trống thì dùng tên gốc.</span>`)}
      ${fieldIn("Tên gốc", "nv-f-title", `<input id="nv-f-title" class="input" value="${esc(n.title)}" data-change="nv-edit" data-id="${n.id}" data-f="title" autocomplete="off">`)}
      ${fieldIn("Tác giả", "nv-f-author", `<input id="nv-f-author" class="input" value="${esc(n.author)}" data-change="nv-edit" data-id="${n.id}" data-f="author" autocomplete="off">`)}
      ${fieldIn("Ngôn ngữ gốc", "nv-f-lang", `<select id="nv-f-lang" class="select" data-change="nv-edit" data-id="${n.id}" data-f="lang">${U.options(LANGS.map(([c, l]) => [c, l]), n.lang)}</select>`)}
      ${fieldIn("Mô tả", "nv-f-desc", `<textarea id="nv-f-desc" class="textarea" rows="4" data-change="nv-edit" data-id="${n.id}" data-f="desc">${esc(n.desc)}</textarea>`)}
      <div class="field"><label for="nv-tag-in">Tags <span class="t-mute mono">${tags.length}/${MAX_TAGS}</span></label>
        <div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}<button type="button" class="tag-x" data-act="nv-tag-del" data-id="${n.id}" data-t="${esc(t)}" aria-label="Xóa tag ${esc(t)}">${ic("x")}</button></span>`).join("") || `<span class="t-sm t-mute">Chưa có tag.</span>`}</div>
        <input id="nv-tag-in" class="input tag-in" list="nv-tag-sug" placeholder="Thêm tag, nhấn Enter…" data-enter="nv-tag-add" data-id="${n.id}" ${tags.length >= MAX_TAGS ? "disabled" : ""} autocomplete="off">
        <datalist id="nv-tag-sug">${sug.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist></div>
      ${U.kv([["Nguồn", esc(n.origin)], ["Cập nhật", `<span class="mono">${esc(n.updated)}</span>`]])}</section>`;
  }
  const MAX_TAGS = 12;

  function novelInspector(id) {
    const novel = U.bind(id);
    const pg = U.progress(novel);
    if (screenOf(novel.id) === "reading" && U.hasText()) {
      const c = U.chapter(R().ch);
      const tr = N().tr.chapters[c.n];
      const warns = U.openWarnings().filter((w) => w.ch === c.n).length;
      const stale = U.staleItems().filter((i) => i.ev.some((e) => NV.chOf(e.p) === c.n)).length;
      return `${displayPanel()}
        ${U.insSec(`Ch.${c.n}`, U.kv([["Tiêu đề", esc(c.title)], ["Số từ", fmt(c.words)], ["Đoạn", c.paras ? c.paras.length : "—"], ["Dịch", tr ? `<span class="badge badge-success">CÓ BẢN NHÁP</span>` : `<span class="badge">CHƯA</span>`], ["Tri thức", N().kb.analyzed[c.n] === "done" ? `<span class="badge badge-success">ĐÃ PHÂN TÍCH</span>` : `<span class="badge">CHƯA</span>`]]))}
        ${warns || stale ? `<section class="ins-sec"><span class="eyebrow">Cần xem lại</span>
          ${warns ? `<div class="t-sm warn-line">${ic("alert")} ${warns} cảnh báo bản dịch</div>` : ""}${stale ? `<div class="t-sm warn-line">${ic("alert")} ${stale} nhận định tri thức gắn với nguồn đã đổi</div>` : ""}</section>` : ""}`;
    }
    return novelPanel(novel, false);
  }

  function novelPanel(novel, withOpen) {
    const has = !!novel.coverImg;
    const coverActions = `<span class="cover-actions">
      <button type="button" class="cover-action" data-act="nv-cover-pick" data-tip="${has ? "Đổi ảnh bìa" : "Chọn ảnh bìa"}" aria-label="${has ? "Đổi ảnh bìa" : "Chọn ảnh bìa"}">${ic("image")}</button><input type="file" accept="image/*" hidden data-change="nv-cover" data-id="${novel.id}">
      <button class="cover-action" data-act="nv-cover-del" data-id="${novel.id}" data-tip="Xóa ảnh bìa" aria-label="Xóa ảnh bìa" ${has ? "" : "disabled"}>${ic("x")}</button>
    </span>`;
    return `<section class="ins-panel-actions">
        <button class="btn btn-sm btn-danger" data-act="nm-del" data-id="${novel.id}" data-tip="Xóa novel" aria-label="Xóa novel">${ic("trash")}Xóa</button>
        ${withOpen ? `<button class="btn btn-sm btn-primary" data-act="nm-open" data-id="${novel.id}">${ic("book")}Mở</button>` : ""}
      </section>
      <section class="ins-hero">
        <div class="ins-hero-cv">${cover(novel, "cover-lg", coverActions)}</div>
        <div class="ins-hero-b">
          <div class="ins-hero-t">${esc(U.nameOf(novel))}</div>
          ${U.nameOf(novel) !== novel.title ? `<div class="t-sm t-mute ins-orig" title="Tên gốc">${esc(novel.title)}</div>` : ""}
          <div class="t-sm t-mute">${esc(novel.author)}</div>
          <div class="ins-hero-m"><span class="badge">${esc(novel.lang)}</span><span class="t-sm t-mute">${fmt(novel.chapters)} chương · ${fmt(novel.words)} từ</span></div>
          <div class="nm-fr">${fracs(novel)}</div>
        </div>
      </section>
      ${infoForm(novel)}`;
  }

  A.VIEWS.novels = { fill: true, render: mgmtView, inspector: mgmtInspector };
  A.VIEWS.novel = { fill: true, render: novelView, mount: novelMount, inspector: novelInspector };

  /* ---------------- Explorer: nhóm theo novel ---------------- */
  A.EXPLORER_EXTRA.novels = () => {
    const active = A.S.active;
    const shown = N().novels.filter(U.passes);
    if (!shown.length) return `<div class="nx-sep"></div><div class="nx-empty">${N().novels.length ? "Không có novel khớp bộ lọc" : "Chưa có novel nào"}</div>`;
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
    return `<div class="nf-label">Tags</div><div class="nf-pills">${tags.map(([t, n]) => pill("tag", t, n)).join("") || `<span class="nx-empty">Chưa có tag</span>`}</div>
      <div class="nf-label">Ngôn ngữ</div><div class="nf-pills">${langs.map(([c, n]) => pill("lang", c, n)).join("")}</div>
      ${U.filterActive() ? `<div class="tree-row nf-clear" tabindex="0" data-act="nf-clear">${ic("x")}<span class="tree-label">Xóa bộ lọc</span></div>` : ""}`;
  };

  const novelOf = (el) => U.novelById(el?.dataset?.id || A.S.active.split(":")[1]);
  const touch = (n) => { n.updated = A.stamp(); U.refreshTabs(n.id); A.renderExplorer(); A.rerender(); };
  const addTag = (n, raw) => {
    const t = U.normTag(raw);
    if (!t) return false;
    const tags = U.tagsOf(n);
    if (tags.includes(t)) { A.toast(`Tag “${t}” đã có.`, "warning"); return false; }
    if (tags.length >= MAX_TAGS) { A.toast(`Tối đa ${MAX_TAGS} tag cho mỗi novel.`, "warning"); return false; }
    n.tags = [...tags, t];
    return true;
  };

  function gotoChapter(n) {
    const r = R();
    r.ch = Math.max(1, Math.min(N().chapters.length, n));
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
    "nm-sel": (el) => { NM().selected = el.dataset.id; applySel(); },
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
      A.toast(titles.length === 1 ? `Đã xóa “${titles[0]}”.` : `Đã xóa ${titles.length} novel.`);
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
      A.toast("Đã xóa ảnh bìa, dùng lại bìa mặc định.");
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
    "rd-cancel": () => { R().edit = null; A.rerender(); },
    "rd-save": (el) => {
      const text = A.$("#rd-ta").value.trim();
      if (!text) { A.toast("Đoạn văn không được để trống.", "warning"); return; }
      const res = U.applySourceEdit(el.dataset.p, text);
      R().edit = null;
      A.rerender();
      if (!res) { A.toast("Không có thay đổi.", "warning"); return; }
      const extra = [res.warned ? "1 bản dịch cần xem lại" : "", res.stale ? `${res.stale} nhận định tri thức bị đánh dấu` : ""].filter(Boolean).join(", ");
      A.toast(`Đã lưu đoạn${extra ? `. ${extra}` : ""}.`);
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
        id: U.nextNovelId(), title, display: A.$("#nn-display").value.trim() === title ? "" : A.$("#nn-display").value.trim(), author: A.$("#nn-author").value.trim() || "Chưa rõ", lang, langName: LANGS.find((l) => l[0] === lang)[1],
        chapters: 0, words: 0, updated: A.stamp(), origin: "Tạo mới", desc: A.$("#nn-desc").value.trim() || "Chưa có mô tả.", cover: COVERS[n.length % COVERS.length],
        tags: [...new Set(A.$("#nn-tags").value.split(",").map(U.normTag).filter(Boolean))].slice(0, MAX_TAGS),
      });
      A.closeModal();
      A.rerender();
      A.renderExplorer();
      A.toast(`Đã tạo novel “${title}”.`);
    },
  });

  Object.assign(A.ON, {
    "nm-q": (el) => { ui("nm", {}).q = el.value; A.rerender(); },
    "nv-cover": (el) => {
      const file = el.files[0];
      const owner = novelOf(el);
      el.value = "";
      if (!file) return;
      if (!/^image\//.test(file.type)) { A.toast("File không phải ảnh.", "warning"); return; }
      if (file.size > 8 * 1024 * 1024) { A.toast("Ảnh lớn hơn 8 MB.", "warning"); return; }
      const id = owner.id;
      const reader = new FileReader();
      reader.onload = () => {
        // thu nhỏ về tối đa 640px chiều cao để prototype không giữ ảnh gốc trong bộ nhớ
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
          A.toast("Đã đổi ảnh bìa.");
        };
        img.onerror = () => A.toast("Không đọc được ảnh.", "warning");
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    },
    "nv-edit": (el) => {
      const n = novelOf(el);
      const f = el.dataset.f;
      const v = el.value.trim();
      if (f === "title" && !v) { el.value = n.title; A.toast("Tên gốc không được để trống.", "warning"); return; }
      if (f === "display") { n.display = v === n.title ? "" : v; touch(n); return; }
      if (f === "lang") { n.lang = v; n.langName = LANGS.find((l) => l[0] === v)?.[1] || v; }
      else if (f === "desc") n.desc = v || "Chưa có mô tả.";
      else if (f === "author") n.author = v || "Chưa rõ";
      else n[f] = v;
      touch(n);
    },
    "ch-q": (el) => { ui("ch", {}).q = el.value; A.rerender(); },
    "rd-ch": (el) => gotoChapter(Math.floor(+el.value) || 1),
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

  /* ---------------- Dialogs: tạo mới / nhập package (REQ-02-001) ---------------- */
  function openCreate() {
    A.modal({
      title: "Tạo novel mới", eyebrow: CAP,
      body: `<div class="field"><label for="nn-title">Tên gốc</label><input id="nn-title" class="input" placeholder="Ví dụ: Gió Muộn Trên Đồi Thông" autocomplete="off"><p class="field-err" id="nn-err" hidden>Nhập tên gốc của tác phẩm.</p></div>
        <div class="field"><label for="nn-display">Tên hiển thị</label><input id="nn-display" class="input" placeholder="Để trống thì dùng tên gốc" autocomplete="off"></div>
        <div class="form-2"><div class="field"><label for="nn-author">Tác giả</label><input id="nn-author" class="input" autocomplete="off"></div>
        <div class="field"><label for="nn-lang">Ngôn ngữ gốc</label><select id="nn-lang" class="select">${U.options(LANGS, "VI")}</select></div></div>
        <div class="field"><label for="nn-tags">Tags</label><input id="nn-tags" class="input" placeholder="fantasy, dark, harbor" autocomplete="off"><span class="field-hint">Cách nhau bằng dấu phẩy. Có thể sửa sau ở Inspector.</span></div>
        <div class="field"><label for="nn-desc">Mô tả</label><textarea id="nn-desc" class="textarea" rows="3"></textarea><span class="field-hint">Có thể thêm chương sau khi tạo.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-act="nm-create-submit">Tạo novel</button>`,
    });
  }

  /* ---------------- Dialog: xóa novel ---------------- */
  let pendingDel = [];
  function openDelete(ids) {
    pendingDel = ids.filter((id) => U.novelById(id));
    if (!pendingDel.length) return;
    const list = pendingDel.map(U.novelById);
    const one = list.length === 1;
    A.modal({
      title: one ? "Xóa novel" : `Xóa ${list.length} novel`, eyebrow: CAP,
      body: `<div class="del-list">${list.map((n) => `<div class="del-row">${cover(n, "cover-md")}<div><div class="t-ink">${esc(U.nameOf(n))}</div><div class="t-sm t-mute">${esc(n.author)} · ${fmt(n.chapters)} chương</div><div class="nm-fr">${fracs(n)}</div></div></div>`).join("")}</div>
        <div class="ld-warn">${ic("alert")}<span>Chương, bản dịch, từ điển và tri thức của ${one ? "novel này" : "các novel này"} sẽ bị xóa khỏi workspace. Không thể hoàn tác.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-danger" data-act="nm-del-confirm">${ic("trash")}Xóa${one ? "" : ` ${list.length} novel`}</button>`,
    });
  }

  // nhấp đúp hoặc Enter mở novel; Delete xóa các novel đang chọn
  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest("[data-open]");
    if (el && !e.target.closest("input,button")) openNovel(el.dataset.open, "chapters");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("[data-open]")) { openNovel(e.target.dataset.open, "chapters"); return; }
    if (e.key === "Delete" && A.S.active === "novels" && !e.target.matches?.("input,textarea,select") && !A.$("#layer .modal") && selIds().length) openDelete(selIds());
  });
})();
