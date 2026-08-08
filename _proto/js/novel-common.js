window.NVU = (function () {
  const A = window.DSApp;
  const NV = window.NV;
  const { esc, ic } = A;

  const SAMPLE = "NOV-0001";
  const N = () => NV.state;
  const ui = (key, defaults) => {
    const s = N();
    s.ui = s.ui || {};
    if (!s.ui[key]) s.ui[key] = JSON.parse(JSON.stringify(defaults));
    return s.ui[key];
  };
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const chapter = (n) => N().chapters[n - 1];
  const novelById = (id) => N().novels.find((x) => x.id === id);
  const current = () => novelById(N().reader.novel);
  /** Tên hiển thị (dùng khắp app); để trống thì dùng tên gốc. Tên gốc chỉ hiện trên bìa ở dạng lưới và trong form sửa. */
  const nameOf = (n) => (n.display && n.display.trim()) || n.title;
  const hasText = () => N().reader.novel === SAMPLE;
  /** Màn hình theo từng novel có id dạng `kind:NOV-xxxx`; gắn novel đó làm novel hiện tại trước khi vẽ. */
  const bind = (tabId) => { const id = String(tabId).split(":")[1]; if (id && novelById(id)) N().reader.novel = id; return current(); };
  const findPara = (pid) => chapter(NV.chOf(pid))?.paras?.find((p) => p.id === pid);
  const paraNo = (pid) => pid.split(".")[1];
  const refLabel = (pid) => `Ch.${NV.chOf(pid)} ¶${paraNo(pid)}`;
  const ref = (pid, view = "src") => `<button type="button" class="chip" data-act="jump-src" data-p="${pid}" data-view="${view}">${refLabel(pid)}</button>`;

  /** Danh sách chương của novel: novel mẫu có nội dung thật, novel khác chỉ có siêu dữ liệu. */
  const chaptersFor = (n) => (n.id === SAMPLE ? N().chapters
    : Array.from({ length: n.chapters }, (_, i) => ({ n: i + 1, title: `Chương ${i + 1}`, words: Math.round(n.words / Math.max(1, n.chapters)), paras: null })));
  const analyzedCount = () => Object.values(N().kb.analyzed).filter((v) => v === "done").length;
  const progress = (n) => (n.id === SAMPLE
    ? { tr: Object.keys(N().tr.chapters).length, kb: analyzedCount(), total: n.chapters }
    : { tr: 0, kb: 0, total: n.chapters });
  /** Nền bìa: ảnh người dùng chọn (`coverImg`) hoặc gradient sinh sẵn. */
  const coverBg = (n) => (n.coverImg ? `url(${n.coverImg}) center / cover no-repeat` : `linear-gradient(160deg,${n.cover[0]},${n.cover[1]} 55%,${n.cover[2]})`);
  const cover = (n, cls = "", actions = "") => `<span class="cover ${cls}" style="background:${esc(coverBg(n))}">${actions}</span>`;
  /** `2/12` kèm icon, dùng thay cho chữ dài ở danh sách, lưới và bảng chương. */
  const frac = (icon, a, b, title) => `<span class="frac ${a >= b && b ? "is-full" : a ? "is-part" : ""}" title="${esc(title)}">${ic(icon)}<b>${a}</b>/${b}</span>`;

  const seg = (act, list, currentValue, extra = "", testid = "") => `<div class="seg" role="group" ${testid ? `data-testid="${testid}"` : ""}>${list.map(([v, label, tip]) => {
    const on = String(v) === String(currentValue);
    return `<button type="button" ${testid ? `data-testid="${testid}-${esc(v)}"` : ""} class="${on ? "is-active" : ""}" data-act="${act}" data-v="${esc(v)}" ${extra} ${tip ? `data-tip="${esc(tip)}" aria-label="${esc(tip)}"` : ""} aria-pressed="${on}">${label}</button>`;
  }).join("")}</div>`;
  const options = (list, currentValue) => list.map(([v, label, disabled]) =>
    `<option value="${esc(v)}" ${String(v) === String(currentValue) ? "selected" : ""} ${disabled ? "disabled" : ""}>${esc(label)}</option>`).join("");
  const bar = (left, right = "") => `<div class="nv-bar"><div class="nv-bar-l">${left}</div><span class="spacer"></span><div class="nv-bar-r">${right}</div></div>`;
  const datatable = (options) => {
    const columns = options.columns || [];
    const rows = options.rows || [];
    let colgroup = "<colgroup>";
    let headerCells = "";
    for (const column of columns) {
      colgroup += `<col${column.width ? ` style="width:${esc(column.width)}"` : ""}>`;
      const align = column.align === "right" ? "num" : column.align === "center" ? "cen" : "";
      headerCells += `<th scope="col" class="${align}">${esc(column.label)}</th>`;
    }
    colgroup += "</colgroup>";
    const minWidth = ` style="min-width:${esc(options.minWidth || "0")}"`;
    const head = `<div class="table-head ds-datatable-head" data-testid="datatable-head"><div class="ds-datatable-head-inner"><table class="table ds-datatable-table"${minWidth}>${colgroup}<thead><tr>${headerCells}</tr></thead></table></div></div>`;
    let bodyRows = "";
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowClasses = options.rowClass ? options.rowClass(row) : {};
      let classes = "";
      for (const key of Object.keys(rowClasses)) {
        if (rowClasses[key]) classes += `${classes ? " " : ""}${key}`;
      }
      const attrs = options.rowAttrs ? options.rowAttrs(row) : "";
      let cells = "";
      for (const column of columns) {
        const value = column.render ? column.render(row) : esc(row[column.key] ?? "");
        let cellClasses = column.align === "right" ? "num" : column.align === "center" ? "cen" : "";
        if (column.ellipsis) cellClasses += `${cellClasses ? " " : ""}cell-ellipsis`;
        cells += `<td${cellClasses ? ` class="${cellClasses}"` : ""}>${value}</td>`;
      }
      bodyRows += `<tr tabindex="0" data-testid="${esc(options.rowTestId || "datatable-row")}" data-datatable-index="${index}" class="${classes}" ${attrs}>${cells}</tr>`;
    }
    if (!rows.length) bodyRows = `<tr><td class="empty-cell" colspan="${columns.length}">${options.emptyHTML || esc(options.emptyMessage || "No data")}</td></tr>`;
    const body = `<div class="table-body ds-datatable-body" data-testid="datatable-body" data-datatable-scroll data-keep="${esc(options.keep || "")}"><table class="table ds-datatable-table"${minWidth}>${colgroup}<tbody>${bodyRows}</tbody></table></div>`;
    const hostTestId = esc(options.testId || "datatable-host");
    const variant = options.variant || "card";
    return `<div class="ds-datatable-host ${variant === "fill" ? "is-fill" : ""}" data-testid="${hostTestId}"><div class="table-wrap ds-datatable ${variant}" data-testid="datatable">${head}${body}</div></div>`;
  };

  document.addEventListener("scroll", (event) => {
    const body = event.target;
    if (body instanceof HTMLElement && body.matches("[data-datatable-scroll]")) {
      const header = body.parentElement?.querySelector(".ds-datatable-head");
      if (header instanceof HTMLElement) header.scrollLeft = body.scrollLeft;
    }
  }, true);
  const empty = (title, text, cta = "") => `<div class="empty"><div class="empty-inner"><div class="illus"></div><h3 class="t-display-xs">${title}</h3><p class="t-sm t-mute">${text}</p>${cta}</div></div>`;
  const noSample = () => empty("Chưa có nội dung mẫu", "Prototype chỉ có nội dung chương, bản dịch và tri thức cho “The Lantern Keeper of Harrowmere”.", novelById(SAMPLE) ? `<button class="btn btn-primary" data-act="nv-sample">Mở novel mẫu</button>` : "");
  const insSec = (title, body) => `<section class="ins-sec"><span class="eyebrow">${esc(title)}</span>${body}</section>`;
  const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const novelTitle = () => `<span class="nv-ttl">${cover(current(), "cover-xs")}<span class="t-ink">${esc(nameOf(current()))}</span><span class="badge">${esc(current().lang)}</span></span>`;

  /* ---- chương: dropdown chọn chương (`suffix(n)` thêm ghi chú sau tên chương) ---- */
  const chapterJump = (id, cur, total, title, suffix) => `<select id="${id}" class="select ch-select" data-change="${id}" aria-label="Chương">${options(chaptersFor(current()).map((c) => [c.n, `Ch.${c.n} · ${c.title}${suffix ? suffix(c.n) : ""}`]), cur)}</select>`;

  /* ---- tags + bộ lọc novel (dùng chung cho explorer Filters và màn Novel management) ---- */
  const tagsOf = (n) => n.tags || [];
  const allTags = () => {
    const m = new Map();
    N().novels.forEach((n) => tagsOf(n).forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const normTag = (s) => String(s).toLowerCase().replace(/[,#]/g, " ").trim().replace(/\s+/g, "-").slice(0, 24);
  const filters = () => {
    const f = ui("nf", { tags: [], langs: [] });
    const known = new Set(allTags().map(([t]) => t));
    f.tags = f.tags.filter((t) => known.has(t)); // tag không còn novel nào dùng thì bỏ khỏi bộ lọc
    f.langs = f.langs.filter((l) => N().novels.some((n) => n.lang === l));
    return f;
  };
  const nextNovelId = () => `NOV-${String(Math.max(0, ...N().novels.map((n) => parseInt(n.id.slice(4), 10) || 0)) + 1).padStart(4, "0")}`;
  const filterActive = () => filters().tags.length + filters().langs.length > 0;
  /** Khớp mọi tag đã chọn (AND) và một trong các ngôn ngữ đã chọn (OR). */
  const passes = (n) => filters().tags.every((t) => tagsOf(n).includes(t)) && (!filters().langs.length || filters().langs.includes(n.lang));
  const tagChips = (n, max = 99) => {
    const tags = tagsOf(n);
    return tags.slice(0, max).map((t) => `<span class="tag">${esc(t)}</span>`).join("") + (tags.length > max ? `<span class="tag is-more">+${tags.length - max}</span>` : "");
  };
  /** Tên novel / ngôn ngữ đổi thì nhãn tab của các màn hình thuộc novel đó cũng đổi. */
  const refreshTabs = (novelId) => {
    const n = novelById(novelId);
    Object.entries(TABS).forEach(([kind, t]) => {
      const it = A.ITEMS[`${kind}:${novelId}`];
      if (it) { it.tab = t.tab(n); it.section = nameOf(n); }
    });
  };

  const CERT = { text: ["badge-success", "Văn bản", "Văn bản xác nhận"], claim: ["badge-info", "Lời nhân vật", "Lời kể của nhân vật"], inferred: ["badge-warning", "AI suy luận", "Suy luận của AI, văn bản không nói trực tiếp"] };
  const certBadge = (c) => `<span class="badge ${CERT[c][0]}" title="${CERT[c][2]}">${CERT[c][1]}</span>`;

  const estimate = (nums, { outRatio = 1.8, guide = 420 } = {}) => {
    const words = nums.reduce((a, n) => a + chapter(n).words, 0);
    const tin = Math.round(words * 1.35 + guide * nums.length);
    const tout = Math.round(words * outRatio);
    return { words, tin, tout, cost: (tin / 1e6) * 3 + (tout / 1e6) * 15, minutes: Math.max(1, Math.round(words / 900)) };
  };
  const money = (v) => `≈ $${v.toFixed(2)}`;
  const provider = (id) => NV.providers.find((p) => p.id === id);
  const providerSelect = (id, value) => `<select id="${id}" class="select" data-on="${id}">${options(NV.providers.map((p) => [p.id, p.ok ? p.name : `${p.name} (chưa cài)`, !p.ok]), value)}</select>`;
  /** `[3,4,5,9]` → `3–5, 9` */
  const rangeText = (nums) => {
    const out = [];
    [...nums].sort((a, b) => a - b).forEach((n) => {
      const last = out[out.length - 1];
      if (last && n === last[1] + 1) last[1] = n; else out.push([n, n]);
    });
    return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
  };

  const runningTask = (kind, key) => A.PL.list.find((p) => p.kind === kind && p.status === "running" && p.tasks.some((t) => t.key === key && t.status !== "done"));
  const taskRef = (pl, key) => `${pl.id}|${key}`;

  const trChapter = (n) => N().tr.chapters[n];
  const trParaList = (n) => Object.values(trChapter(n)?.paras || {});
  const trStatus = (n) => {
    if (runningTask("translate", `c${n}`)) return "running";
    const t = trChapter(n);
    if (!t) return "none";
    return trParaList(n).some((p) => p.st === "review") ? "review" : "draft";
  };
  const openWarnings = () => N().tr.warnings.filter((w) => w.state === "open");
  const staleItems = () => N().kb.items.filter((i) => i.stale);

  const addWarning = (w) => {
    const tr = N().tr;
    const dup = tr.warnings.find((x) => x.state === "open" && x.kind === w.kind && x.p === w.p && x.ch === w.ch);
    if (dup) { Object.assign(dup, w, { date: A.stamp() }); return dup; }
    tr.wseq = (tr.wseq || tr.warnings.length) + 1;
    const full = { id: `W${String(tr.wseq).padStart(2, "0")}`, state: "open", date: A.stamp(), ...w };
    tr.warnings.push(full);
    return full;
  };

  const applySourceEdit = (pid, text) => {
    const para = findPara(pid);
    const before = para.t;
    if (before === text) return null;
    para.t = text;
    para.edited = true;
    const s = N();
    const tp = s.tr.chapters[NV.chOf(pid)]?.paras[pid];
    let warned = 0;
    let stale = 0;
    if (tp) {
      if (tp.st !== "review") tp.prev = tp.st;
      tp.st = "review";
      addWarning({ kind: "source", ch: NV.chOf(pid), p: pid, reason: "Đoạn nguồn đã được sửa sau khi dịch.", before, after: text });
      warned = 1;
    }
    s.kb.items.forEach((it) => {
      if (it.ev.some((e) => e.p === pid)) { it.stale = `Đoạn nguồn ${refLabel(pid)} đã sửa ngày ${A.stamp()}.`; stale++; }
    });
    s.kb.log.unshift({ date: A.stamp(), text: `Nguồn ${refLabel(pid)} được sửa.` });
    return { warned, stale };
  };

  const inspectorNovel = () => {
    const n = current();
    const pg = progress(n);
    return insSec("Tác phẩm", `<div class="ins-novel">${cover(n, "cover-md")}<div class="ins-novel-t"><div class="t-ink">${esc(nameOf(n))}</div><div class="t-sm t-mute">${esc(n.author)}</div></div></div>`
      + kv([["Ngôn ngữ", esc(n.langName)], ["Chương", fmt(n.chapters)], ["Số từ", fmt(n.words)], ["Dịch", frac("lang", pg.tr, pg.total, "Chương đã dịch")], ["Tri thức", frac("graph", pg.kb, pg.total, "Chương đã phân tích")], ...(tagsOf(n).length ? [["Tags", `<span class="tags">${tagChips(n)}</span>`]] : [])]));
  };

  /** Mở một màn hình của novel: `novel` (chapters / reading), `translation`, `knowledge`. */
  const TABS = {
    novel: { icon: "book", title: "Chapters", tab: (n) => nameOf(n) },
    translation: { icon: "lang", title: "Translation", tab: (n) => `Dịch · ${nameOf(n)}` },
    knowledge: { icon: "graph", title: "Knowledgebase", tab: (n) => `Tri thức · ${nameOf(n)}` },
  };
  const openNovelTab = (kind, novelId) => {
    const n = novelById(novelId);
    const t = TABS[kind];
    N().reader.novel = novelId;
    A.openTab(`${kind}:${novelId}`, { title: t.title, tab: t.tab(n), icon: t.icon, section: nameOf(n), cap: "", rail: "novels", blurb: "", reqs: [] });
  };

  A.ACT["nv-sample"] = () => openNovelTab(A.S.active.split(":")[0], SAMPLE);
  A.ACT["jump-src"] = (el) => {
    const pid = el.dataset.p;
    if (el.dataset.view === "tl") NVU.openTranslation("result", NV.chOf(pid), pid);
    else NVU.openReader(N().reader.novel, NV.chOf(pid), pid);
  };

  const NVU = {
    SAMPLE, N, ui, fmt, chapter, novelById, current, bind, hasText, findPara, paraNo, refLabel, ref, seg, options, bar, datatable, empty, noSample, insSec, kv, novelTitle,
    nameOf, chaptersFor, progress, analyzedCount, cover, coverBg, frac, rangeText, chapterJump, nextNovelId, tagsOf, allTags, normTag, filters, filterActive, passes, tagChips, refreshTabs,
    certBadge, CERT, estimate, money, provider, providerSelect, runningTask, taskRef, trChapter, trParaList, trStatus, openWarnings, staleItems,
    addWarning, applySourceEdit, inspectorNovel, openNovelTab,
    openReader: null,
    openTranslation: null,
    openKnowledge: null,
  };
  return NVU;
})();
