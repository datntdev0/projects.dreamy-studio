(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const U = window.NVU;
  const LB = window.LB;
  const { esc, ic } = A;
  const CAP = window.DS.CAP["06"];

  const fmtB = (b) => (b ? LB.bytes(b) : "0 B");
  const st = () => PJ.state;
  const byId = (id) => st().projects.find((p) => p.id === id);
  const ui = (key) => (PJ.ui[key] ||= { q: "", sel: [], sort: "updated", tab: "overview", res: "all" });
  const catalog = () => ui("catalog");
  const view = () => A.store.get("pj.view", "grid");
  const tpl = (p) => PJ.TEMPLATES[p.template];
  const novelOf = (p) => (p.novel ? U.novelById(p.novel) : null);
  const bgOf = (p) => LB.bgFor(p.name);
  const selIds = () => catalog().sel.filter(byId).slice(-1);
  const wsId = (tabId) => String(tabId).split(":")[1];
  const refresh = () => { A.renderExplorer(); A.rerender(); };
  const opts = U.options;

  const statusBadge = (p) => { const [label, cls] = PJ.STATUS[PJ.statusOf(p)]; return `<span class="badge ${cls}">${label}</span>`; };
  const stateBadge = (s) => `<span class="badge ${PJ.MOD_STATE[s][1]}">${esc(PJ.MOD_STATE[s][0].toUpperCase())}</span>`;
  const rangeLabel = (p) => (p.range ? `Ch.${p.range[0]}–${p.range[1]}` : "");
  const srcLabel = (p) => {
    if (!p.novel) return "Không gắn novel";
    const n = novelOf(p);
    if (!n) return "Novel đã bị xóa";
    return `${U.nameOf(n)} · ${p.src.kind === "translation" ? "Bản dịch" : "Bản gốc"} ${p.src.lang}`;
  };

  const modDots = (p) => `<span class="pj-mods">${p.modules.map((m) => {
    const s = p.prog[m]?.state || "idle";
    return `<span class="pj-mod is-${s}" title="${esc(PJ.MODULES[m].label)} · ${esc(PJ.MOD_STATE[s][0])}">${ic(PJ.MODULES[m].icon)}</span>`;
  }).join("")}</span>`;
  const progress = (p) => {
    const pct = PJ.percent(p);
    return `<div class="pj-pg"><div class="progress ${PJ.statusOf(p) === "done" ? "is-done" : ""}"><i style="width:${pct}%"></i></div><span class="mono">${pct}%</span>${PJ.staleCount(p) ? `<span class="pj-warn" title="Có kết quả cần xem lại">${ic("alert")}</span>` : ""}</div>`;
  };

  function items() {
    const u = catalog();
    const f = PJ.filt;
    const needle = u.q.trim().toLowerCase();
    let l = st().projects.filter((p) => (!f.types.length || f.types.includes(p.template)) && (!f.status.length || f.status.includes(PJ.statusOf(p))));
    if (needle) l = l.filter((p) => `${p.name} ${p.desc} ${srcLabel(p)}`.toLowerCase().includes(needle));
    const sorters = {
      updated: (a, b) => b.updated.localeCompare(a.updated),
      name: (a, b) => a.name.localeCompare(b.name, "vi"),
      progress: (a, b) => PJ.percent(b) - PJ.percent(a),
    };
    return [...l].sort((a, b) => Number(a.archived) - Number(b.archived) || (sorters[u.sort] || sorters.updated)(a, b));
  }
  const filtActive = () => PJ.filt.types.length > 0 || PJ.filt.status.length > 0;

  function chips() {
    if (!filtActive()) return "";
    const f = PJ.filt;
    const chip = (act, v, label) => `<span class="tag">${esc(label)}<button type="button" class="tag-x" data-act="${act}" data-v="${esc(v)}" aria-label="Bỏ lọc ${esc(label)}">${ic("x")}</button></span>`;
    return `<span class="nm-chips" data-testid="pj-filter-chips">${f.types.map((t) => chip("pj-ftype", t, PJ.TEMPLATES[t].label)).join("")}${f.status.map((s) => chip("pj-fstatus", s, PJ.STATUS[s][0].toLowerCase().replace(/^./, (c) => c.toUpperCase()))).join("")}<button type="button" class="btn btn-sm btn-ghost" data-act="pj-fclear">Xóa bộ lọc</button></span>`;
  }

  function catalogView() {
    const u = catalog();
    const list = items();
    const sel = new Set(selIds());
    let body;
    if (!list.length) {
      body = st().projects.length
        ? U.empty("Không có project nào khớp", "Thử từ khóa khác hoặc bỏ bộ lọc.", `<button class="btn" data-act="pj-clear-all">Xóa bộ lọc</button>`)
        : U.empty("Chưa có project nào", "Project là nơi bạn sản xuất một sản phẩm từ tác phẩm: kịch bản, audio, hình ảnh và video. Bắt đầu từ một template.", `<div class="empty-act"><button class="btn btn-primary" data-act="pj-new">${ic("plus")}Tạo project</button></div>`);
    } else if (view() === "grid") {
      body = `<div class="pj-grid" data-testid="pj-grid">${list.map((p) => `<div data-testid="pj-card-${p.id}" class="pj-card ${sel.has(p.id) ? "is-selected" : ""} ${p.archived ? "is-archived" : ""}" tabindex="0" data-act="pj-sel" data-id="${p.id}" data-pj-open="${p.id}" title="${esc(p.name)}">
          <div class="pj-thumb" style="background:${esc(bgOf(p))}"><span class="badge pj-tpl">${ic(tpl(p).icon)}${esc(tpl(p).label)}</span>${modDots(p)}
            ${p.outputs.length ? `<span class="badge pj-outs" title="Video thành phẩm">${ic("film")}${p.outputs.length}</span>` : ""}</div>
          <div class="pj-card-b"><div class="pj-card-t"><span class="t-ink pj-card-n">${esc(p.name)}</span>${statusBadge(p)}</div>
            <div class="t-sm t-mute ellip">${esc(srcLabel(p))}${p.range ? ` · ${rangeLabel(p)}` : ""}</div>${progress(p)}</div></div>`).join("")}</div>`;
    } else {
      const rows = list.map((p) => `<tr data-testid="pj-row-${p.id}" class="${sel.has(p.id) ? "is-selected" : ""} ${p.archived ? "is-muted" : ""}" tabindex="0" data-act="pj-sel" data-id="${p.id}" data-pj-open="${p.id}">
        <td><div class="nm-title"><span class="pj-th" style="background:${esc(bgOf(p))}"></span><div><div class="t-ink">${esc(p.name)}</div><div class="t-sm t-mute ellip">${esc(srcLabel(p))}${p.range ? ` · ${rangeLabel(p)}` : ""}</div></div></div></td>
        <td><span class="type-tag">${ic(tpl(p).icon)}${esc(tpl(p).label)}</span></td>
        <td>${modDots(p)}</td><td class="pj-pgc">${progress(p)}</td><td>${statusBadge(p)}</td>
        <td class="mono t-mute">${esc(p.updated.slice(0, 10))}</td></tr>`).join("");
      body = `<table class="table" data-testid="pj-table"><thead><tr><th>Project</th><th>Loại</th><th>Modules</th><th>Tiến độ</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    return `<div class="nv">
      ${U.bar(
        `<label class="search"><span class="sr-only">Tìm project</span><input id="pj-q" data-testid="pj-search" class="input" type="search" value="${esc(u.q)}" placeholder="Tìm theo tên hoặc nguồn…" data-on="pj-q"></label>
         <span class="t-sm t-mute">${list.length} project</span>${chips()}`,
        `<select class="select" data-testid="pj-sort" data-change="pj-sort" aria-label="Sắp xếp">${opts([["updated", "Cập nhật gần nhất"], ["name", "Tên A–Z"], ["progress", "Tiến độ"]], u.sort)}</select>
         ${U.seg("pj-view", [["grid", ic("frames"), "Dạng lưới"], ["list", ic("list"), "Dạng danh sách"]], view(), "", "pj-view")}
         <button class="btn btn-sm btn-primary" data-testid="pj-create-btn" data-act="pj-new">${ic("plus")}Tạo project</button>`,
      )}
      <div class="nv-body"><div class="nv-scroll" data-keep="pj">${body}</div></div>
    </div>`;
  }

  function applySel() {
    const ids = new Set(selIds());
    A.$$("#editor [data-pj-open]").forEach((el) => {
      const on = ids.has(el.dataset.pjOpen);
      el.classList.toggle("is-selected", on);
    });
    A.renderInspector();
  }

  const modList = (p) => `<div class="pj-modlist" data-testid="pj-inspector-modules">${p.modules.length ? p.modules.map((m) => {
    const g = p.prog[m] || { state: "idle" };
    return `<div class="pj-modrow">${ic(PJ.MODULES[m].icon)}<span class="tree-label">${esc(PJ.MODULES[m].label)}</span>${stateBadge(g.state)}</div>`;
  }).join("") : `<span class="t-sm t-mute">Chưa bật module nào.</span>`}</div>`;

  function projectPanel(p, inWs) {
    const rows = [
      ["Mã", `<span class="mono">${esc(p.id)}</span>`], ["Loại", esc(tpl(p).label)],
      ["Nguồn", p.novel ? `${esc(srcLabel(p))}${p.range ? `<div class="t-sm t-mute">${rangeLabel(p)}</div>` : ""}` : `<span class="t-mute">Không gắn novel</span>`],
      ["Thư mục", `<span class="path">${esc(p.folder)}\\</span>`], ["Dung lượng", fmtB(PJ.sizeOf(p))],
      ["Tạo lúc", `<span class="mono">${esc(p.created)}</span>`], ["Cập nhật", `<span class="mono">${esc(p.updated)}</span>`],
    ];
    const act = inWs
      ? `<button class="btn btn-primary" data-testid="pj-inspector-create-package-btn" data-act="pk-new" data-p="${p.id}" ${p.outputs.length ? "" : "disabled"}>${ic("package")}Tạo package</button>`
      : `<button class="btn btn-primary" data-testid="pj-open-btn" data-act="pj-open" data-id="${p.id}">${ic("folder-open")}Mở</button>`;
    return `<section class="ins-sec pj-ins-top" data-testid="pj-inspector-summary"><div class="pj-ins-thumb" style="background:${esc(bgOf(p))}">${modDots(p)}</div>
        <div class="ins-hero-t">${esc(p.name)}</div><div class="ins-hero-m">${statusBadge(p)}<span class="type-tag">${ic(tpl(p).icon)}${esc(tpl(p).label)}</span></div>
        ${p.desc ? `<p class="t-sm t-mute">${esc(p.desc)}</p>` : ""}${progress(p)}</section>
      ${U.insSec("Thông tin", U.kv(rows))}
      ${U.insSec("Modules", modList(p))}
      <section class="ins-sec ins-actions" data-testid="pj-inspector-actions">${act}<button class="btn" data-testid="pj-dup-btn" data-act="pj-dup" data-id="${p.id}">${ic("copy")}Nhân bản</button>
        <button class="btn" data-testid="pj-archive-btn" data-act="pj-archive" data-id="${p.id}">${ic("archive")}${p.archived ? "Khôi phục" : "Lưu trữ"}</button><button class="btn btn-danger" data-testid="pj-delete-btn" data-act="pj-del" data-id="${p.id}">${ic("trash")}Xóa</button></section>`;
  }

  function catalogPanel() {
    const all = st().projects;
    const by = (s) => all.filter((p) => PJ.statusOf(p) === s).length;
    const recent = [...all].filter((p) => !p.archived).sort((a, b) => b.opened.localeCompare(a.opened)).slice(0, 4);
    return `${U.insSec("Danh mục project", U.kv([["Project", all.length], ["Đang làm", by("active")], ["Hoàn tất", by("done")], ["Mới tạo", by("new")], ["Lưu trữ", by("archived")], ["Dung lượng", fmtB(all.reduce((a, p) => a + PJ.sizeOf(p), 0))]]))}
      ${recent.length ? `<section class="ins-sec"><span class="eyebrow">Mở gần đây</span>${recent.map((p) => `<button type="button" class="nm-recent" data-act="pj-open" data-id="${p.id}"><span class="pj-th is-xs" style="background:${esc(bgOf(p))}"></span><span class="tree-label">${esc(p.name)}</span><span class="mono t-mute">${esc(p.opened.slice(5, 10))}</span></button>`).join("")}</section>` : ""}`;
  }
  function catalogInspector() {
    const list = selIds().map(byId);
    if (list.length === 1) return projectPanel(list[0], false);
    return catalogPanel();
  }

  const wsTabs = [["overview", "Tổng quan"], ["resources", "Tài nguyên"], ["settings", "Cài đặt"]];
  const hasDT = () => !!window.DT;
  const pkgsOf = (p) => (hasDT() ? window.DT.state.packages.filter((k) => k.projectId === p.id) : []);

  function modCard(p, m) {
    const g = p.prog[m] || { state: "idle", done: 0, total: 0, note: "" };
    const pct = Math.round(PJ.fraction(p, m) * 100);
    return `<div class="pw-mod is-${g.state}" data-testid="pw-mod-${m}" tabindex="0" data-act="pj-mod" data-id="${p.id}" data-m="${m}">
      <div class="pw-mod-h">${ic(PJ.MODULES[m].icon)}<b>${esc(PJ.MODULES[m].label)}</b><span class="spacer"></span>${stateBadge(g.state)}</div>
      <div class="t-sm t-mute pw-mod-n">${esc(g.note || PJ.MODULES[m].blurb)}</div>
      <div class="progress ${g.state === "done" ? "is-done" : ""}"><i style="width:${pct}%"></i></div></div>`;
  }
  const addCard = (p, m) => `<button type="button" class="pw-mod is-off" data-testid="pw-mod-add-${m}" data-act="pj-mod-add" data-id="${p.id}" data-m="${m}">${ic("plus")}<span>Thêm ${esc(PJ.MODULES[m].label)}</span></button>`;

  function distColumn(p) {
    const pk = pkgsOf(p);
    const outs = p.outputs.map((o) => `<div class="pw-out" data-testid="pw-output-${o.id}"><span class="pw-out-i">${ic("film")}</span><div class="pw-out-b"><div class="t-ink ellip" title="${esc(o.name)}">${esc(o.name)}</div><div class="t-sm t-mute">${LB.dur(o.dur)} · ${o.w}×${o.h} · ${fmtB(o.size)}</div></div>
        <span class="pw-out-act"><button class="btn btn-sm" data-testid="pw-output-preview-btn-${o.id}" data-act="out-preview" data-id="${o.id}" data-tip="Xem trước" aria-label="Xem trước">${ic("play")}</button>
        <button class="btn btn-sm" data-testid="pw-output-package-btn-${o.id}" data-act="pk-new" data-p="${p.id}" data-o="${o.id}" data-tip="Tạo package" aria-label="Tạo package">${ic("package")}</button></span></div>`).join("");
    const pks = pk.map((k) => `<button type="button" class="nm-recent" data-testid="pw-package-${k.id}" data-act="pk-open" data-id="${k.id}">${ic("package")}<span class="tree-label">${esc(k.title)}</span>${window.DT.statusBadge(k)}</button>`).join("");
    return `<section class="pw-dist" data-testid="pw-dist"><header class="pw-col-h"><span class="eyebrow">Distribution</span><button class="btn btn-sm btn-ghost" data-act="open" data-id="packages">Tất cả package${ic("chev-r")}</button></header>
      <div class="pw-dist-g"><div class="pw-box" data-testid="pw-dist-outputs"><span class="eyebrow">Thành phẩm</span>${outs || `<p class="t-sm t-mute">Chưa có video thành phẩm. Kết xuất ở Video editor để đóng gói và phân phối.</p>`}</div>
      <div class="pw-box" data-testid="pw-dist-packages"><span class="eyebrow">Package</span>${pks || `<p class="t-sm t-mute">Chưa có package nào cho project này.</p>`}</div></div></section>`;
  }

  function overview(p) {
    const res = PJ.resourcesOf(p);
    const n = (k) => res.filter((r) => r.kind === k);
    const tile = (label, value, sub) => `<div class="pw-tile" data-testid="pw-tile-${PJ.slug(label)}"><span class="eyebrow">${label}</span><b>${value}</b><span class="t-sm t-mute">${sub}</span></div>`;
    const pct = PJ.percent(p);
    const attn = p.attention.length ? `<section class="pw-attn" data-testid="pw-attn"><span class="eyebrow">Cần chú ý</span>${p.attention.map((a) => `<div class="pw-attn-row is-${a.level}" data-testid="pw-attn-${a.module}">${ic(a.level === "warn" ? "alert" : "info")}<span>${esc(a.text)}</span>
        ${p.modules.includes(a.module) ? `<button class="btn btn-sm" data-act="pj-mod" data-id="${p.id}" data-m="${a.module}">Mở ${esc(PJ.MODULES[a.module].label)}</button>` : ""}</div>`).join("")}</section>` : "";
    const cols = PJ.STAGES.map(([sid, label]) => {
      const all = Object.keys(PJ.MODULES).filter((m) => PJ.MODULES[m].stage === sid);
      const on = all.filter((m) => p.modules.includes(m));
      const off = all.filter((m) => !p.modules.includes(m));
      return `<div class="pw-col" data-testid="pw-stage-${sid}"><header class="pw-col-h"><span class="eyebrow">${label}</span><span class="mono t-mute">${on.length}/${all.length}</span></header>${on.map((m) => modCard(p, m)).join("")}${off.map((m) => addCard(p, m)).join("")}</div>`;
    }).join("");
    const nv = novelOf(p);
    return `<div class="pw" data-testid="pw-root">
      <section class="pw-hero" data-testid="pw-hero"><div class="pw-hero-b"><h1 class="t-display-sm">${esc(p.name)}</h1>
        <div class="pw-src" data-testid="pw-src">${nv ? U.cover(nv, "cover-md") : `<span class="pw-src-i">${ic("book")}</span>`}<div class="pw-src-b"><div class="t-ink">${esc(srcLabel(p))}</div><div class="t-sm t-mute">${p.novel ? `${p.src.kind === "translation" ? "Project dùng đúng phiên bản bản dịch đã chọn" : "Project dùng bản gốc"}${p.range ? ` · ${rangeLabel(p)}` : ""}` : "Project không dùng nội dung từ novel"}</div></div></div>${p.desc ? `<p class="t-sm pw-desc" data-testid="pw-desc">${esc(p.desc)}</p>` : ""}</div>
        <div class="pw-stats" data-testid="pw-stats">${tile("Tiến độ", `${pct}%`, `${p.modules.filter((m) => p.prog[m]?.state === "done").length}/${p.modules.length} module hoàn tất`)}${tile("Audio", n("audio").length, `${fmtB(n("audio").reduce((a, r) => a + r.size, 0))}`)}${tile("Hình ảnh", n("image").length, `${n("image").filter((r) => r.state === "approved").length} đã duyệt`)}${tile("Thành phẩm", p.outputs.length, "video đã kết xuất")}</div></section>
      ${attn}
      <section class="pw-flow" data-testid="pw-flow">${cols}</section>
      ${distColumn(p)}
      <section class="pw-act" data-testid="pw-activity"><span class="eyebrow">Hoạt động gần đây</span>${p.activity.length ? p.activity.map(([t, text]) => `<div class="pw-act-row"><span class="mono t-mute">${esc(t)}</span><span>${esc(text)}</span></div>`).join("") : `<span class="t-sm t-mute">Chưa có hoạt động nào.</span>`}</section>
    </div>`;
  }

  function resourcesTab(p) {
    const u = ui(p.id);
    const all = PJ.resourcesOf(p);
    const kinds = [["all", "Tất cả"], ...Object.entries(PJ.KIND).map(([k, [label]]) => [k, label])];
    const list = u.res === "all" ? all : all.filter((r) => r.kind === u.res);
    const used = LB.state.assets.filter((x) => x.used.some((o) => o.name === p.name));
    const rows = list.map((r) => `<tr data-testid="pj-res-${r.id}"><td><div class="nm-title"><span class="lb-th is-ic">${ic(PJ.KIND[r.kind][1])}</span><span class="t-ink">${esc(r.name)}</span></div></td>
        <td class="t-mute">${esc(PJ.KIND[r.kind][0])}</td><td><span class="badge ${PJ.RES_STATE[r.state][1]}">${esc(PJ.RES_STATE[r.state][0].toUpperCase())}</span></td>
        <td class="mono t-mute">${r.dur ? LB.dur(r.dur) : "—"}</td><td class="num">${fmtB(r.size)}</td><td class="mono t-mute">${esc(r.at.slice(0, 10))}</td>
        <td class="row-actions">${r.kind === "video" ? `<button class="btn btn-sm" data-act="pk-new" data-p="${p.id}" data-o="${esc(p.outputs.find((o) => o.name === r.name)?.id || "")}">${ic("package")}Tạo package</button>` : ""}</td></tr>`).join("");
    const body = all.length
      ? (list.length ? `<table class="table is-nw" data-testid="pj-res-table"><thead><tr><th>Tên</th><th>Loại</th><th>Trạng thái</th><th>Thời lượng</th><th class="num">Dung lượng</th><th>Cập nhật</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : U.empty("Không có tài nguyên loại này", "Chọn loại khác để xem."))
      : U.empty("Project chưa có tài nguyên nào", "Kịch bản, audio, hình ảnh và video do các module tạo ra sẽ nằm trong thư mục project và hiện ở đây.", `<div class="empty-act"><button class="btn" data-act="pj-ws-tab" data-v="overview">Về tổng quan</button></div>`);
    return `<div class="tl-sub" data-testid="pj-res-filter">${U.seg("pj-res-kind", kinds.map(([k, l]) => [k, `${l} <span class="count">${k === "all" ? all.length : all.filter((r) => r.kind === k).length}</span>`]), u.res)}<span class="t-sm t-mute">${fmtB(all.reduce((a, r) => a + r.size, 0))}</span></div>
      ${used.length ? `<div class="pj-used" data-testid="pj-res-library-used"><span class="eyebrow">Tài nguyên thư viện đang dùng</span><span class="tags">${used.map((x) => `<span class="tag lb-ctag">${ic(LB.TYPES[x.type].icon)}${esc(x.name)}</span>`).join("")}</span></div>` : ""}
      <div class="nv-body"><div class="nv-scroll" data-keep="pj-res">${body}</div></div>`;
  }

  function settingsTab(p) {
    const f = (label, id, control, hint = "") => `<div class="field"><label for="${id}">${label}</label>${control}${hint ? `<span class="field-hint">${hint}</span>` : ""}</div>`;
    const mods = Object.keys(PJ.MODULES).map((m) => {
      const on = p.modules.includes(m);
      const busy = on && p.prog[m] && p.prog[m].state !== "idle";
      return `<label class="check pj-chk-row"><input type="checkbox" data-testid="pw-set-module-${m}" data-change="pj-mod-toggle" data-id="${p.id}" data-m="${m}" ${on ? "checked" : ""} ${busy ? "disabled" : ""}>${ic(PJ.MODULES[m].icon)}<span>${esc(PJ.MODULES[m].label)}</span><span class="t-sm t-mute">${busy ? "Đã có tiến độ, không thể tắt" : esc(PJ.MODULES[m].blurb)}</span></label>`;
    }).join("");
    return `<div class="nv-scroll pw-set" data-testid="pw-settings" data-keep="pj-set"><div class="pw-set-in">
      <section class="pw-card" data-testid="pw-set-info"><h3 class="t-display-xs">Thông tin</h3>
        ${f("Tên project", "ps-name", `<input id="ps-name" data-testid="pw-set-name" class="input" value="${esc(p.name)}" data-change="pj-edit" data-id="${p.id}" data-f="name" autocomplete="off">`)}
        ${f("Mô tả", "ps-desc", `<textarea id="ps-desc" data-testid="pw-set-desc" class="textarea" rows="3" data-change="pj-edit" data-id="${p.id}" data-f="desc">${esc(p.desc)}</textarea>`)}
        ${f("Thư mục", "ps-folder", `<div class="preview-path path">${esc(p.folder)}\\</div>`, "Tên thư mục được đặt khi tạo project và không đổi khi đổi tên project.")}</section>
      <section class="pw-card" data-testid="pw-set-source"><h3 class="t-display-xs">Nguồn nội dung</h3>
        ${U.kv([["Novel", esc(novelOf(p) ? U.nameOf(novelOf(p)) : p.novel ? "Novel đã bị xóa" : "Không gắn novel")], ["Phiên bản", p.novel ? `${p.src.kind === "translation" ? "Bản dịch" : "Bản gốc"} ${esc(p.src.lang)}` : "—"], ["Phạm vi", esc(rangeLabel(p) || "—")]])}
        <p class="t-sm t-mute">Project gắn với đúng phiên bản văn bản đã chọn khi tạo. Khi văn bản đó thay đổi, các kết quả liên quan được đánh dấu cần xem lại. Muốn dùng phiên bản khác, hãy nhân bản project và chọn nguồn mới.</p></section>
      <section class="pw-card" data-testid="pw-set-modules"><h3 class="t-display-xs">Modules</h3><div class="pj-chk-list">${mods}</div></section>
      <section class="pw-card pw-danger" data-testid="pw-set-danger"><h3 class="t-display-xs">Lưu trữ và xóa</h3>
        <div class="pw-danger-r"><div><div class="t-ink">${p.archived ? "Khôi phục project" : "Lưu trữ project"}</div><div class="t-sm t-mute">${p.archived ? "Đưa project trở lại danh mục đang làm việc." : "Ẩn khỏi các bộ lọc thường dùng, vẫn giữ nguyên toàn bộ tệp."}</div></div><button class="btn" data-testid="pw-set-archive-btn" data-act="pj-archive" data-id="${p.id}">${ic("archive")}${p.archived ? "Khôi phục" : "Lưu trữ"}</button></div>
        <div class="pw-danger-r"><div><div class="t-ink">Xóa project</div><div class="t-sm t-mute">Xóa thư mục project cùng mọi tài nguyên bên trong. Tài nguyên trong thư viện chung và novel không bị ảnh hưởng.</div></div><button class="btn btn-danger" data-testid="pw-set-delete-btn" data-act="pj-del" data-id="${p.id}">${ic("trash")}Xóa…</button></div></section>
    </div></div>`;
  }

  function wsView(tabId) {
    const p = byId(wsId(tabId));
    if (!p) return U.empty("Project không còn tồn tại", "Project này đã bị xóa khỏi workspace.", `<button class="btn" data-act="open" data-id="projects">Về danh mục project</button>`);
    const u = ui(p.id);
    const body = u.tab === "resources" ? resourcesTab(p) : u.tab === "settings" ? settingsTab(p) : `<div class="nv-body"><div class="nv-scroll" data-keep="pj-ov">${overview(p)}</div></div>`;
    return `<div class="nv">
      ${U.bar(
        `<span class="nv-ttl">${ic(tpl(p).icon)}<span class="t-ink">${esc(p.name)}</span>${statusBadge(p)}</span>${U.seg("pj-ws-tab", wsTabs, u.tab, "", "pw-tabs")}`,
        `<button class="btn btn-sm" data-testid="pw-open-folder-btn" data-act="pj-open-folder" data-id="${p.id}">${ic("folder-open")}Mở thư mục</button>
         <button class="btn btn-sm btn-primary" data-testid="pw-create-package-btn" data-act="pk-new" data-p="${p.id}" ${p.outputs.length ? "" : `disabled data-tip="Cần có video thành phẩm"`}>${ic("package")}Tạo package</button>`,
      )}
      ${body}</div>`;
  }
  const wsInspector = (tabId) => { const p = byId(wsId(tabId)); return p ? projectPanel(p, true) : ""; };

  function modView(tabId) {
    const [, pid, m] = String(tabId).split(":");
    const p = byId(pid);
    const mod = PJ.MODULES[m];
    if (!p || !mod) return U.empty("Module không khả dụng", "Project hoặc module này không còn tồn tại.");
    if (PJ.modViews && PJ.modViews[m]) return PJ.modViews[m].render(p, tabId);
    const g = p.prog[m] || { state: "idle", note: "" };
    const item = A.ITEMS[m];
    return `<div class="nv">${U.bar(`<button class="btn btn-sm" data-testid="pmod-back-btn" data-act="pj-back" data-id="${p.id}">${ic("arrow-left")}${esc(p.name)}</button><span class="nv-ttl">${ic(mod.icon)}<span class="t-ink">${esc(mod.label)}</span>${stateBadge(g.state)}</span>`)}
      <div class="nv-body"><div class="nv-scroll"><div class="cs" data-testid="pmod-root"><div class="cs-ico">${ic(mod.icon)}</div>
        <div><span class="eyebrow">${esc(item?.cap || CAP)}</span><div class="cs-title"><h1 class="t-display-md">${esc(mod.label)}</h1><span class="badge badge-info">COMING SOON</span></div></div>
        <p>${esc(item?.blurb || mod.blurb)}</p>
        <div class="pj-ctx"><span class="eyebrow">Trong project</span><div class="t-ink">${esc(p.name)}</div><div class="t-sm t-mute">${esc(g.note || "Chưa bắt đầu")}</div></div>
        ${item?.reqs?.length ? `<div><span class="eyebrow">Sẽ bao gồm</span></div><div class="req-list">${item.reqs.map(([id, text]) => `<div class="req-row"><span class="mono">${esc(id)}</span><span>${esc(text)}</span></div>`).join("")}</div>` : ""}
      </div></div></div></div>`;
  }
  const modInspector = (tabId) => {
    const [, pid, m] = String(tabId).split(":");
    const p = byId(pid);
    if (p && PJ.modViews && PJ.modViews[m] && PJ.modViews[m].inspector) return PJ.modViews[m].inspector(p, tabId);
    return p ? projectPanel(p, true) : "";
  };
  const modMount = (ed, tabId) => {
    const [, pid, m] = String(tabId).split(":");
    const p = byId(pid);
    if (p && PJ.modViews && PJ.modViews[m] && PJ.modViews[m].mount) PJ.modViews[m].mount(ed, p);
  };

  A.VIEWS.projects = { fill: true, render: catalogView, inspector: catalogInspector };
  A.VIEWS.project = { fill: true, render: wsView, inspector: wsInspector };
  A.VIEWS.pmod = { fill: true, render: modView, inspector: modInspector, mount: modMount };

  function openProject(id, tab) {
    const p = byId(id);
    if (!p) return;
    if (tab) ui(id).tab = tab;
    p.opened = A.stamp();
    expanded().add(id);
    A.openTab(`project:${id}`, { title: p.name, tab: p.name, icon: tpl(p).icon, section: "Projects", cap: CAP, rail: "projects", blurb: "", reqs: [] });
  }
  function openModule(id, m) {
    const p = byId(id);
    if (!p) return;
    expanded().add(id);
    A.openTab(`pmod:${id}:${m}`, { title: PJ.MODULES[m].label, tab: `${PJ.MODULES[m].label} · ${p.name}`, icon: PJ.MODULES[m].icon, section: p.name, cap: CAP, rail: "projects", blurb: "", reqs: [] });
  }

  const expanded = () => (PJ.exp ||= new Set([...st().projects].filter((p) => !p.archived).sort((x, y) => y.opened.localeCompare(x.opened)).slice(0, 1).map((p) => p.id)));
  const dotOf = (s) => (s === "idle" ? `<span class="dot-o"></span>` : `<span class="dot dot-${{ done: "success", doing: "doing", stale: "warning" }[s]}"></span>`);

  A.EXPLORER_EXTRA.projects = () => {
    const list = [...st().projects].sort((a, b) => Number(a.archived) - Number(b.archived));
    if (!list.length) return `<div class="nx-sep"></div><div class="nx-empty">Chưa có project nào</div>`;
    return `<div class="nx-sep"></div>${list.map((p) => {
      const open = expanded().has(p.id);
      const child = (tid, testid, icon, label, right, act, m = "") => `<div class="tree-row nx-child ${A.S.active === tid ? "is-selected" : ""}" data-testid="${testid}" tabindex="0" role="treeitem" data-act="${act}" data-id="${p.id}" ${m ? `data-m="${m}"` : ""}>${ic(icon)}<span class="tree-label">${label}</span><span class="nx-n mono">${right}</span></div>`;
      const mods = p.modules.map((m) => child(`pmod:${p.id}:${m}`, `pj-xmod-${p.id}-${m}`, PJ.MODULES[m].icon, esc(PJ.MODULES[m].label), dotOf(p.prog[m]?.state || "idle"), "pj-mod", m)).join("");
      return `<div class="nx-group ${p.archived ? "is-archived" : ""}">
        <div class="tree-row nx-novel pj-xrow" data-testid="pj-xrow-${p.id}" tabindex="0" role="treeitem" aria-expanded="${open}" data-act="pj-toggle" data-id="${p.id}">${ic(open ? "chev-d" : "chev-r")}<span class="pj-th is-xs" style="background:${esc(bgOf(p))}"></span><span class="tree-label">${esc(p.name)}</span></div>
        ${open ? `${child(`project:${p.id}`, `pj-xover-${p.id}`, "layers", "Tổng quan", `${PJ.percent(p)}%`, "pj-open")}${mods}` : ""}</div>`;
    }).join("")}`;
  };

  A.EXPLORER_EXTRA.pfilters = () => {
    const f = PJ.filt;
    const pill = (act, v, label, n, on) => `<button type="button" data-testid="${act}-${v}" class="nf-pill ${on ? "is-on" : ""}" data-act="${act}" data-v="${esc(v)}" aria-pressed="${on}" title="${esc(label)} · ${n}"><span class="nf-t">${esc(label)}</span><span class="nf-n mono">${n}</span></button>`;
    const types = Object.entries(PJ.TEMPLATES).map(([k, t]) => pill("pj-ftype", k, t.label, st().projects.filter((p) => p.template === k).length, f.types.includes(k)));
    const stats = Object.keys(PJ.STATUS).map((s) => pill("pj-fstatus", s, PJ.STATUS[s][0].charAt(0) + PJ.STATUS[s][0].slice(1).toLowerCase(), st().projects.filter((p) => PJ.statusOf(p) === s).length, f.status.includes(s)));
    return `<div class="nf-label">Loại</div><div class="nf-pills">${types.join("")}</div><div class="nf-label">Trạng thái</div><div class="nf-pills">${stats.join("")}</div>
      ${filtActive() ? `<div class="tree-row nf-clear" tabindex="0" data-act="pj-fclear">${ic("x")}<span class="tree-label">Xóa bộ lọc</span></div>` : ""}`;
  };

  const toggle = (arr, v) => { const i = arr.indexOf(v); if (i < 0) arr.push(v); else arr.splice(i, 1); };
  const targets = (el) => (el?.dataset?.id ? [el.dataset.id] : selIds());

  Object.assign(A.ACT, {
    "pj-open": (el) => openProject(el.dataset.id),
    "pj-toggle": (el) => { const e = expanded(); if (e.has(el.dataset.id)) e.delete(el.dataset.id); else e.add(el.dataset.id); A.renderExplorer(); },
    "pj-back": (el) => openProject(el.dataset.id),
    "pj-mod": (el) => openModule(el.dataset.id, el.dataset.m),
    "pj-ws-tab": (el) => { const id = wsId(A.S.active); ui(id).tab = el.dataset.v; A.rerender(); },
    "pj-res-kind": (el) => { ui(wsId(A.S.active)).res = el.dataset.v; A.rerender(); },
    "pj-view": (el) => { A.store.set("pj.view", el.dataset.v); A.rerender(); },
    "pj-sel": (el) => {
      catalog().sel = [el.dataset.id];
      applySel();
    },
    "pj-ftype": (el) => { toggle(PJ.filt.types, el.dataset.v); refresh(); },
    "pj-fstatus": (el) => { toggle(PJ.filt.status, el.dataset.v); refresh(); },
    "pj-fclear": () => { PJ.filt.types = []; PJ.filt.status = []; refresh(); },
    "pj-clear-all": () => { catalog().q = ""; PJ.filt.types = []; PJ.filt.status = []; refresh(); },
    "pj-archive": (el) => {
      const list = targets(el).map(byId).filter(Boolean);
      if (!list.length) return;
      const next = !list.every((p) => p.archived);
      list.forEach((p) => { p.archived = next; p.updated = A.stamp(); p.activity.unshift([A.stamp(), next ? "Lưu trữ project" : "Khôi phục project"]); });
      refresh();
      A.toast(next ? `Đã lưu trữ ${list.length === 1 ? `“${list[0].name}”` : `${list.length} project`}.` : `Đã khôi phục ${list.length === 1 ? `“${list[0].name}”` : `${list.length} project`}.`);
    },
    "pj-open-folder": (el) => { const p = byId(el.dataset.id); if (p) A.toast(`Đã mở ${p.folder}\\ trong File Explorer (mô phỏng).`); },
    "pj-mod-add": (el) => {
      const p = byId(el.dataset.id);
      const m = el.dataset.m;
      if (!p || p.modules.includes(m)) return;
      p.modules.push(m);
      p.prog[m] = { state: "idle", done: 0, total: 0, note: "" };
      p.activity.unshift([A.stamp(), `Thêm module ${PJ.MODULES[m].label}`]);
      refresh();
      A.toast(`Đã thêm module ${PJ.MODULES[m].label}.`);
    },
  });

  Object.assign(A.ON, {
    "pj-q": (el) => { catalog().q = el.value; A.rerender(); },
    "pj-sort": (el) => { catalog().sort = el.value; A.rerender(); },
    "pj-edit": (el) => {
      const p = byId(el.dataset.id);
      if (!p) return;
      const f = el.dataset.f;
      const v = el.value.trim();
      if (f === "name") {
        if (!v) { el.value = p.name; A.toast("Tên project không được để trống.", "warning"); return; }
        if (/[<>:"/\\|?*]/.test(v)) { el.value = p.name; A.toast("Tên project không được chứa các ký tự < > : \" / \\ | ? *", "warning"); return; }
        if (st().projects.some((x) => x.id !== p.id && x.name.toLowerCase() === v.toLowerCase())) { el.value = p.name; A.toast("Đã có project trùng tên này.", "warning"); return; }
        p.name = v;
        const it = A.ITEMS[`project:${p.id}`];
        if (it) { it.title = v; it.tab = v; }
      } else p.desc = el.value;
      p.updated = A.stamp();
      refresh();
    },
    "pj-mod-toggle": (el) => {
      const p = byId(el.dataset.id);
      const m = el.dataset.m;
      if (!p) return;
      if (el.checked) { if (!p.modules.includes(m)) { p.modules.push(m); p.prog[m] = { state: "idle", done: 0, total: 0, note: "" }; } }
      else { p.modules = p.modules.filter((x) => x !== m); delete p.prog[m]; }
      p.modules.sort((a, b) => Object.keys(PJ.MODULES).indexOf(a) - Object.keys(PJ.MODULES).indexOf(b));
      p.updated = A.stamp();
      refresh();
    },
  });

  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest("[data-pj-open]");
    if (el && !e.target.closest("input,button,select")) openProject(el.dataset.pjOpen);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("[data-pj-open]")) { openProject(e.target.dataset.pjOpen); return; }
    if (e.key === "Delete" && A.S.active === "projects" && !e.target.matches?.("input,textarea,select") && !A.$("#layer .modal") && selIds().length) A.ACT["pj-del"]({ dataset: {} });
  });

  PJ.api = { byId, ui, refresh, openProject, srcLabel, rangeLabel, tpl, bgOf, statusBadge, stateBadge, selIds, novelOf, catalog };
})();
