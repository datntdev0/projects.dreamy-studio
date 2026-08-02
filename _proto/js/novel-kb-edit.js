/*
 * Dialog sửa tri thức (entity + fact), theo mô hình draft của dreamer-studio `world-edit-dialog`:
 *  - mở trong phạm vi của một mục hoặc một vấn đề (issue) ở Review;
 *  - mọi thao tác (sửa, thêm, xóa, gộp, tách) là một "edit" trong danh sách, có thể hoàn tác từng cái;
 *  - xem trước kết quả kiểm tra xung đột trên bản nháp trước khi cho xác nhận;
 *  - chỉ khi xác nhận mới ghi vào dữ liệu thật.
 */
window.KBE = (function () {
  const A = window.DSApp;
  const U = window.NVU;
  const NV = window.NV;
  const C = window.KBC;
  const { esc, ic } = A;

  const K = () => U.N().kb;
  const O = () => NV.ontology;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ICON = { character: "user", place: "globe", org: "library", object: "package", event: "activity", relation: "swap" };
  const typeName = (t) => O().entityTypes[t]?.label || t;
  const CERTS = [["text", "Văn bản xác nhận"], ["claim", "Lời nhân vật"], ["inferred", "AI suy luận"]];
  const STATE = { new: ["badge-info", "Mới"], edited: ["badge-warning", "Đã sửa"], deleted: ["", "Đã xóa"], merged: ["", "Đã gộp"], removed: ["", "Bị loại"] };

  const D = { base: [], baseIds: new Set(), baseOpen: [], scope: new Set(), issue: null, edits: [], open: new Set(), sel: [], merge: null, split: null, changes: false, evd: {}, seq: 0 };

  /* ---------------- phạm vi + áp dụng edit ---------------- */
  function scopeIds(ids) {
    const all = D.base;
    const out = new Set(ids);
    ids.forEach((id) => {
      const it = all.find((i) => i.id === id);
      if (!it) return;
      if (it.kind === "relation") { out.add(it.from); out.add(it.to); }
      if (it.kind === "entity") all.filter((r) => r.kind === "relation" && (r.from === id || r.to === id)).forEach((r) => out.add(r.id));
    });
    return out;
  }

  /** Áp dụng danh sách edit lên toàn bộ tri thức (nên xóa / gộp / tách lan sang cả quan hệ ngoài phạm vi). */
  function apply(edits) {
    let list = clone(D.base);
    const get = (id) => list.find((i) => i.id === id);
    edits.forEach((e) => {
      if (e.k === "add") list.push(clone(e.item));
      else if (e.k === "edit") { const it = get(e.id); if (it) Object.assign(it, clone(e.patch)); }
      else if (e.k === "del") list = list.filter((i) => i.id !== e.id && !(i.kind === "relation" && (i.from === e.id || i.to === e.id)));
      else if (e.k === "merge") {
        const t = get(e.target);
        e.sources.filter((s) => s !== e.target).forEach((sid) => {
          const s = get(sid);
          if (!s || !t) return;
          s.ev.forEach((v) => { if (!t.ev.some((x) => x.p === v.p && x.q === v.q)) t.ev.push(v); });
          (s.attrs || []).forEach((a) => { if (!t.attrs.some((x) => x.k === a.k && x.v === a.v)) t.attrs.push(a); });
          if (!t.summary && s.summary) t.summary = s.summary;
          list.forEach((i) => { if (i.kind === "relation") { if (i.from === sid) i.from = e.target; if (i.to === sid) i.to = e.target; } });
          list = list.filter((i) => i.id !== sid);
        });
        list = list.filter((i) => !(i.kind === "relation" && i.from === i.to));
      } else if (e.k === "split") {
        list.push(clone(e.item));
        e.facts.forEach((fid) => { const f = get(fid); if (f?.kind === "relation") { if (f.from === e.id) f.from = e.item.id; if (f.to === e.id) f.to = e.item.id; } });
      }
    });
    return list;
  }

  const createdOp = (id) => D.edits.find((e) => (e.k === "add" || e.k === "split") && e.item.id === id);

  /** Sửa một trường: gộp vào edit sẵn có, bỏ trường trùng giá trị gốc. */
  function patch(id, p) {
    const made = createdOp(id);
    if (made) { Object.assign(made.item, clone(p)); return; }
    const base = D.base.find((i) => i.id === id);
    let op = D.edits.find((e) => e.k === "edit" && e.id === id);
    if (!op) { op = { k: "edit", id, patch: {} }; D.edits.push(op); }
    Object.assign(op.patch, clone(p));
    Object.keys(op.patch).forEach((f) => { if (same(op.patch[f], base[f])) delete op.patch[f]; });
    if (!Object.keys(op.patch).length) D.edits = D.edits.filter((e) => e !== op);
  }

  const itemState = (orig, cur) => {
    if (createdOp(orig.id)) return "new";
    const now = cur.find((i) => i.id === orig.id);
    if (now) return same(now, orig) ? "same" : "edited";
    if (D.edits.some((e) => e.k === "merge" && e.sources.includes(orig.id) && e.target !== orig.id)) return "merged";
    return D.edits.some((e) => e.k === "del" && e.id === orig.id) ? "deleted" : "removed";
  };

  function cards(cur, kinds) {
    const created = D.edits.flatMap((e) => (e.k === "add" || e.k === "split" ? [e.item] : []));
    const origs = D.base.filter((i) => D.scope.has(i.id));
    return [...origs, ...created].filter((i) => kinds.includes(i.kind)).map((orig) => {
      const state = itemState(orig, cur);
      return { key: orig.id, item: cur.find((i) => i.id === orig.id) || orig, state, involved: !!D.issue && D.issue.ids.includes(orig.id) };
    });
  }
  const present = (c) => !["deleted", "merged", "removed"].includes(c.state);

  /* ---------------- xem trước kết quả kiểm tra ---------------- */
  const incomplete = (cur) => cur.filter((i) => D.scope.has(i.id) || createdOp(i.id)).some((i) =>
    (i.kind !== "relation" && !String(i.name).trim()) || (i.kind === "relation" && (!cur.some((e) => e.id === i.from) || !cur.some((e) => e.id === i.to))));

  function preview(cur) {
    if (!D.edits.length) return { state: "idle", added: [], fixed: [] };
    if (incomplete(cur)) return { state: "invalid", added: [], fixed: [] };
    const after = C.runOn(cur).open;
    const ids = new Set(after.map((x) => x.id));
    const added = after.filter((x) => !D.baseIds.has(x.id));
    const fixed = D.baseOpen.filter((x) => !ids.has(x.id) && (!D.issue || x.id !== D.issue.id));
    const state = D.issue ? (ids.has(D.issue.id) ? "open" : "resolved") : added.length ? "warn" : "clean";
    return { state, added, fixed };
  }
  const PV = {
    idle: ["info", "Chưa có thay đổi nào. Sửa xong, kết quả kiểm tra xung đột sẽ hiện ở đây."],
    invalid: ["alert", "Còn mục chưa hợp lệ: tên đang trống hoặc quan hệ thiếu đầu mút."],
    resolved: ["check", "Xung đột này sẽ được giải quyết."],
    open: ["alert", "Xung đột này vẫn còn sau khi sửa."],
    clean: ["check", "Không phát hiện xung đột mới."],
    warn: ["alert", "Thay đổi sẽ tạo xung đột mới:"],
  };

  /* ---------------- mở / đóng ---------------- */
  function open({ ids = [], issue = null, add = null } = {}) {
    D.base = clone(K().items);
    D.baseIds = new Set(C.run().open.map((x) => x.id));
    D.baseOpen = C.run().open;
    D.issue = issue ? { id: issue.id, rule: issue.rule, sev: issue.sev, msg: issue.msg, ids: issue.ids } : null;
    D.edits = []; D.sel = []; D.merge = null; D.split = null; D.changes = false; D.evd = {};
    D.scope = scopeIds(ids);
    D.open = new Set(ids.length ? ids.filter((id) => D.base.some((i) => i.id === id)).slice(0, 2) : []);
    if (add) addItem(add);
    draw();
  }

  function newId(prefix) {
    let id;
    do { D.seq++; id = `${prefix}${100 + D.seq}`; } while (D.base.some((i) => i.id === id) || createdOp(id));
    return id;
  }
  function addItem(kind) {
    const ents = apply(D.edits).filter((i) => i.kind === "entity");
    const item = kind === "entity" ? { id: newId("E"), kind: "entity", type: "character", name: "", summary: "", attrs: [], cert: "text", ev: [] }
      : kind === "event" ? { id: newId("V"), kind: "event", name: "", when: "", order: 99, summary: "", cert: "text", ev: [] }
        : { id: newId("R"), kind: "relation", pred: "keeps_at", from: ents[0]?.id || "", to: ents[1]?.id || ents[0]?.id || "", label: O().predicates.keeps_at.label, cert: "text", ev: [] };
    item.status = "edited";
    D.edits.push({ k: "add", item });
    D.open.add(item.id);
  }

  const itemName = (cur, id, fallback = "?") => { const e = cur.find((i) => i.id === id) || D.base.find((i) => i.id === id); return e ? e.name || "(chưa đặt tên)" : fallback; };
  const entLabel = (e) => `${e.name || "(chưa đặt tên)"} · ${typeName(e.type)}`;
  const chap = (it) => (it.ev.length ? `Ch.${U.rangeText(it.ev.map((e) => NV.chOf(e.p)))}` : "");

  /* ---------------- vẽ ---------------- */
  const selectHtml = (id, on, data, list, value, cls = "") => `<select id="${id}" class="select ${cls}" data-on="${on}" ${data}>${U.options(list, value)}</select>`;
  const field = (label, control, id, span = "") => `<div class="field ${span}"><label ${id ? `for="${id}"` : ""}>${label}</label>${control}</div>`;

  function evidenceBlock(it) {
    const d = D.evd[it.id] || { p: "", q: "" };
    return `<div class="field span-full"><span class="eyebrow">Dẫn chứng (${it.ev.length})</span>
      ${it.ev.map((e, i) => `<div class="ed-ev"><blockquote class="quote">${esc(e.q)}</blockquote>${U.ref(e.p)}<button class="btn btn-icon btn-sm" data-act="ed-ev-del" data-k="${it.id}" data-i="${i}" aria-label="Xóa dẫn chứng">${ic("x")}</button></div>`).join("") || `<p class="t-sm t-mute">Chưa có dẫn chứng. Nhận định không có dẫn chứng sẽ bị bắt ở bước kiểm tra.</p>`}
      <div class="ed-ev-add"><input id="ed-${it.id}-evp" class="input" placeholder="Đoạn, ví dụ 1.3" value="${esc(d.p)}" data-on="ed-evd" data-k="${it.id}" data-f="p" aria-label="Đoạn nguồn">
        <input id="ed-${it.id}-evq" class="input" placeholder="Trích nguyên văn từ đoạn nguồn" value="${esc(d.q)}" data-on="ed-evd" data-k="${it.id}" data-f="q" aria-label="Trích dẫn">
        <button class="btn btn-sm" data-act="ed-ev-add" data-k="${it.id}">${ic("plus")}Thêm</button></div></div>`;
  }

  function entityBody(it) {
    const attrs = it.attrs.map((a, i) => `<div class="ke-attr">${selectHtml(`ed-${it.id}-ak${i}`, "ed-attr", `data-k="${it.id}" data-i="${i}" data-f="k"`, Object.entries(O().attributes).map(([k, x]) => [k, x.label]), a.k)}
        <input id="ed-${it.id}-av${i}" class="input" value="${esc(a.v)}" data-on="ed-attr" data-k="${it.id}" data-i="${i}" data-f="v" aria-label="Giá trị">${a.p ? U.ref(a.p) : "<span></span>"}
        <button class="btn btn-icon btn-sm" data-act="ed-attr-del" data-k="${it.id}" data-i="${i}" aria-label="Xóa thuộc tính">${ic("x")}</button></div>`).join("");
    return `<div class="ed-body">
      ${field("Tên", `<input id="ed-${it.id}-name" class="input" value="${esc(it.name)}" data-on="ed-f" data-k="${it.id}" data-f="name" autocomplete="off">${it.name.trim() ? "" : `<span class="field-err">Nhập tên.</span>`}`, `ed-${it.id}-name`)}
      ${field("Loại", selectHtml(`ed-${it.id}-type`, "ed-f", `data-k="${it.id}" data-f="type"`, Object.entries(O().entityTypes).map(([k, x]) => [k, x.label]), it.type), `ed-${it.id}-type`)}
      ${field("Tóm tắt", `<textarea id="ed-${it.id}-sum" class="textarea" rows="2" data-on="ed-f" data-k="${it.id}" data-f="summary">${esc(it.summary || "")}</textarea>`, `ed-${it.id}-sum`, "span-full")}
      <div class="field span-full"><span class="eyebrow">Thuộc tính</span>${attrs || `<p class="t-sm t-mute">Chưa có thuộc tính.</p>`}<div><button class="btn btn-sm" data-act="ed-attr-add" data-k="${it.id}">${ic("plus")}Thêm thuộc tính</button></div></div>
      ${field("Nguồn gốc nhận định", selectHtml(`ed-${it.id}-cert`, "ed-f", `data-k="${it.id}" data-f="cert"`, CERTS, it.cert), `ed-${it.id}-cert`)}
      ${evidenceBlock(it)}</div>`;
  }

  function factBody(it, cur) {
    const ents = cur.filter((i) => i.kind === "entity").sort((a, b) => a.name.localeCompare(b.name)).map((e) => [e.id, entLabel(e)]);
    let main;
    if (it.kind === "relation") {
      const miss = (id) => (cur.some((e) => e.id === id) ? [] : [["", "— chọn entity —", true]]);
      main = `<div class="form-3">
        ${field("Chủ thể", selectHtml(`ed-${it.id}-from`, "ed-f", `data-k="${it.id}" data-f="from"`, [...miss(it.from), ...ents], it.from), `ed-${it.id}-from`)}
        ${field("Quan hệ", selectHtml(`ed-${it.id}-pred`, "ed-f", `data-k="${it.id}" data-f="pred"`, Object.entries(O().predicates).map(([k, x]) => [k, `${x.label} (${k})`]), it.pred), `ed-${it.id}-pred`)}
        ${field("Đối tượng", selectHtml(`ed-${it.id}-to`, "ed-f", `data-k="${it.id}" data-f="to"`, [...miss(it.to), ...ents], it.to), `ed-${it.id}-to`)}</div>`;
    } else {
      main = `${field("Tên sự kiện", `<input id="ed-${it.id}-name" class="input" value="${esc(it.name)}" data-on="ed-f" data-k="${it.id}" data-f="name" autocomplete="off">${it.name.trim() ? "" : `<span class="field-err">Nhập tên.</span>`}`, `ed-${it.id}-name`)}
        <div class="form-2">${field("Thời điểm", `<input id="ed-${it.id}-when" class="input" value="${esc(it.when || "")}" data-on="ed-f" data-k="${it.id}" data-f="when">`, `ed-${it.id}-when`)}
        ${field("Thứ tự trên dòng thời gian", `<input id="ed-${it.id}-order" class="input" type="number" value="${esc(it.order ?? 0)}" data-on="ed-f" data-k="${it.id}" data-f="order">`, `ed-${it.id}-order`)}</div>
        ${field("Tóm tắt", `<textarea id="ed-${it.id}-sum" class="textarea" rows="2" data-on="ed-f" data-k="${it.id}" data-f="summary">${esc(it.summary || "")}</textarea>`, `ed-${it.id}-sum`)}`;
    }
    return `<div class="ed-body">${main}
      ${field("Nguồn gốc nhận định", selectHtml(`ed-${it.id}-cert`, "ed-f", `data-k="${it.id}" data-f="cert"`, CERTS, it.cert), `ed-${it.id}-cert`)}${evidenceBlock(it)}</div>`;
  }

  function cardHead(c, cur, selectable) {
    const it = c.item;
    const isRel = it.kind === "relation";
    const title = isRel
      ? `<span class="${cur.some((e) => e.id === it.from) ? "" : "ed-missing"}">${esc(itemName(cur, it.from))}</span> <span class="ed-pred">${esc(it.label)}</span> <span class="${cur.some((e) => e.id === it.to) ? "" : "ed-missing"}">${esc(itemName(cur, it.to))}</span>`
      : esc(it.name || "(chưa đặt tên)");
    const kind = it.kind === "entity" ? it.type : it.kind;
    const open = D.open.has(c.key);
    return `<div class="ed-head">
      ${selectable ? `<input type="checkbox" data-on="ed-sel" data-k="${c.key}" ${D.sel.includes(c.key) ? "checked" : ""} ${present(c) ? "" : "disabled"} aria-label="Chọn ${esc(it.name || "")}">` : ""}
      <button type="button" class="ed-toggle" data-act="ed-toggle" data-k="${c.key}" aria-expanded="${open}" ${present(c) ? "" : "disabled"}>${ic(open ? "chev-d" : "chev-r")}<span class="ed-ico">${ic(ICON[kind])}</span><span class="ed-title">${title}</span><span class="t-sm t-mute mono">${esc(chap(it))}</span></button>
      ${c.involved ? `<span class="badge badge-danger">${ic("flag")}LIÊN QUAN</span>` : ""}
      ${c.state !== "same" ? `<span class="badge ${STATE[c.state][0]}">${STATE[c.state][1].toUpperCase()}</span>` : ""}
      ${c.state === "deleted" ? `<button class="btn btn-sm btn-ghost" data-act="ed-restore" data-k="${c.key}">${ic("undo")}Hoàn lại</button>`
    : present(c) ? `${it.kind === "entity" ? `<button class="btn btn-icon btn-sm" data-act="ed-split-start" data-k="${c.key}" aria-label="Tách entity" data-tip="Tách entity">${ic("scissors")}</button>` : ""}<button class="btn btn-icon btn-sm" data-act="ed-del" data-k="${c.key}" aria-label="Xóa" data-tip="Xóa">${ic("trash")}</button>` : ""}
    </div>`;
  }

  function splitForm(c, cur) {
    const f = D.split;
    const rels = cur.filter((i) => i.kind === "relation" && (i.from === c.key || i.to === c.key));
    return `<div class="ed-body">
      <div class="form-2">${field("Tên entity mới", `<input id="ed-split-name" class="input" value="${esc(f.name)}" data-on="ed-split" data-f="name" autocomplete="off">`, "ed-split-name")}
      ${field("Loại", selectHtml("ed-split-type", "ed-split", 'data-f="type"', Object.entries(O().entityTypes).map(([k, x]) => [k, x.label]), f.type), "ed-split-type")}</div>
      <div class="field"><span class="eyebrow">Chuyển các quan hệ sang entity mới</span>${rels.map((r) => `<label class="check"><input type="checkbox" data-on="ed-split-fact" data-k="${r.id}" ${f.facts.includes(r.id) ? "checked" : ""}><span>${esc(itemName(cur, r.from))} <b>${esc(r.label)}</b> ${esc(itemName(cur, r.to))}</span></label>`).join("") || `<p class="t-sm t-mute">Entity này chưa có quan hệ nào.</p>`}</div>
      <div class="ed-actions"><button class="btn btn-sm" data-act="ed-split-cancel">Hủy</button><button class="btn btn-sm btn-primary" data-act="ed-split-apply" ${f.name.trim() ? "" : "disabled"}>${ic("scissors")}Tách</button></div></div>`;
  }

  function describe(e, cur) {
    const nm = (id) => itemName(cur, id, id);
    const label = (id) => { const i = D.base.find((x) => x.id === id) || createdOp(id)?.item; return i ? (i.kind === "relation" ? `${nm(i.from)} ${i.label} ${nm(i.to)}` : i.name) : id; };
    if (e.k === "add") return `Thêm ${e.item.kind === "entity" ? "entity" : "fact"} “${e.item.kind === "relation" ? `${nm(e.item.from)} ${e.item.label} ${nm(e.item.to)}` : e.item.name || "(chưa đặt tên)"}”`;
    if (e.k === "edit") return `Sửa “${label(e.id)}”: ${Object.keys(e.patch).map((f) => ({ name: "tên", type: "loại", summary: "tóm tắt", attrs: "thuộc tính", cert: "nguồn gốc", ev: "dẫn chứng", from: "chủ thể", to: "đối tượng", pred: "quan hệ", label: "nhãn", when: "thời điểm", order: "thứ tự" }[f] || f)).join(", ")}`;
    if (e.k === "del") return `Xóa “${label(e.id)}”`;
    if (e.k === "merge") return `Gộp ${e.sources.filter((s) => s !== e.target).map(label).join(", ")} vào “${label(e.target)}”`;
    return `Tách “${label(e.id)}” → “${e.item.name}” (${e.facts.length} quan hệ)`;
  }

  function draw() {
    const cur = apply(D.edits);
    const pv = preview(cur);
    D.pv = pv;
    const ents = cards(cur, ["entity"]);
    const facts = cards(cur, ["relation", "event"]);
    const sel = ents.filter((c) => D.sel.includes(c.key) && present(c));
    const entCard = (c) => `<article class="ed-card" data-state="${c.state}" data-involved="${c.involved || ""}">${cardHead(c, cur, true)}${D.open.has(c.key) && present(c) ? (D.split?.id === c.key ? splitForm(c, cur) : entityBody(c.item)) : ""}</article>`;
    const factCard = (c) => `<article class="ed-card" data-state="${c.state}" data-involved="${c.involved || ""}">${cardHead(c, cur, false)}${D.open.has(c.key) && present(c) ? factBody(c.item, cur) : ""}</article>`;
    const rule = D.issue ? O().rules[D.issue.rule] : null;
    const ok = D.edits.length && !incomplete(cur) && (D.issue ? pv.state === "resolved" : pv.state === "clean" || pv.state === "warn");

    const mergeForm = D.merge ? `<div class="ed-merge"><div class="field"><label for="ed-merge-t">Giữ lại entity</label>${selectHtml("ed-merge-t", "ed-merge", "", sel.map((c) => [c.key, entLabel(c.item)]), D.merge)}</div>
        <p class="t-sm t-mute">Quan hệ, dẫn chứng và thuộc tính của các entity còn lại được chuyển sang entity giữ lại.</p>
        <div class="ed-actions"><button class="btn btn-sm" data-act="ed-merge-cancel">Hủy</button><button class="btn btn-sm btn-primary" data-act="ed-merge-apply">${ic("merge")}Gộp</button></div></div>` : "";
    const selBar = sel.length ? `<div class="ed-sel"><div class="ed-sel-bar"><span class="mono">Đã chọn ${sel.length}</span><span class="spacer"></span>
        <button class="btn btn-sm" data-act="ed-merge-start" ${sel.length < 2 || D.merge ? "disabled" : ""}>${ic("merge")}Gộp</button>
        <button class="btn btn-sm btn-danger" data-act="ed-del-sel">${ic("trash")}Xóa</button><button class="btn btn-sm btn-ghost" data-act="ed-clear">Bỏ chọn</button></div>${mergeForm}</div>` : "";

    const body = `<div class="ed-layout">
      ${D.issue ? `<section class="ed-issue is-${D.issue.sev}">${ic("alert")}<div><b>${esc(rule.label)}</b><p>${esc(D.issue.msg)}</p></div></section>` : ""}
      <section class="ed-group"><div class="ed-ghead"><h4>Entity (${ents.length})</h4><span class="spacer"></span><button class="btn btn-sm btn-ghost" data-act="ed-add" data-v="entity">${ic("plus")}Thêm entity</button></div>
        ${selBar}${ents.map(entCard).join("") || `<p class="t-sm t-mute">Không có entity nào trong phạm vi này.</p>`}</section>
      <section class="ed-group"><div class="ed-ghead"><h4>Fact (${facts.length})</h4><span class="spacer"></span>
        <button class="btn btn-sm btn-ghost" data-act="ed-add" data-v="relation">${ic("plus")}Thêm quan hệ</button><button class="btn btn-sm btn-ghost" data-act="ed-add" data-v="event">${ic("plus")}Thêm sự kiện</button></div>
        ${facts.map(factCard).join("") || `<p class="t-sm t-mute">Không có fact nào trong phạm vi này.</p>`}</section>
      <section class="ed-changes"><button type="button" class="ed-toggle" data-act="ed-changes" aria-expanded="${D.changes}">${ic(D.changes ? "chev-d" : "chev-r")}<b>Thay đổi (${D.edits.length})</b></button>
        ${D.changes ? (D.edits.length ? `<ol>${D.edits.map((e, i) => `<li><span>${esc(describe(e, cur))}</span><button class="btn btn-icon btn-sm" data-act="ed-undo" data-i="${i}" aria-label="Hoàn tác" data-tip="Hoàn tác">${ic("undo")}</button></li>`).join("")}</ol>` : `<p class="t-sm t-mute">Chưa có thay đổi.</p>`) : ""}</section>
      <section class="ed-preview is-${pv.state}" role="status"><p>${ic(PV[pv.state][0])}<span>${PV[pv.state][1]}</span></p>
        ${pv.added.length ? `<ul>${pv.added.map((x) => `<li class="is-${x.sev}">${esc(O().rules[x.rule].label)} · ${esc(x.msg)}</li>`).join("")}</ul>` : ""}
        ${pv.fixed.length ? `<p class="t-sm t-mute">${ic("check")}<span>Cũng giải quyết ${pv.fixed.length} vấn đề khác đang mở.</span></p>` : ""}</section></div>`;

    A.modal({
      title: D.issue ? "Xử lý xung đột" : "Sửa tri thức", eyebrow: "Knowledgebase", cls: "modal-xl ed-dialog", body,
      foot: `<span class="t-sm t-mute">${D.edits.length} thay đổi</span><span class="spacer"></span><button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-act="ed-confirm" ${ok ? "" : "disabled"}>${ic("check")}${D.issue ? "Xác nhận xử lý" : "Xác nhận thay đổi"}</button>`,
    });
  }

  /** Vẽ lại nhưng giữ vị trí cuộn và ô đang gõ. */
  function redraw() {
    const mb = A.$("#layer .modal-body");
    const top = mb ? mb.scrollTop : 0;
    const f = document.activeElement;
    const fid = f && f.id && mb && mb.contains(f) ? f.id : null;
    const sel = fid && typeof f.selectionStart === "number" ? [f.selectionStart, f.selectionEnd] : null;
    draw();
    const nb = A.$("#layer .modal-body");
    if (nb) nb.scrollTop = top;
    if (fid) { const n = document.getElementById(fid); if (n) { n.focus(); if (sel && n.setSelectionRange) { try { n.setSelectionRange(sel[0], sel[1]); } catch { /* ignore */ } } } }
  }

  function confirm() {
    const cur = apply(D.edits);
    if (incomplete(cur) || !D.edits.length) return;
    const was = new Map(D.base.map((i) => [i.id, JSON.stringify(i)]));
    cur.forEach((i) => {
      const w = was.get(i.id);
      if (w === undefined) i.status = "edited";
      else if (w !== JSON.stringify(i)) { i.status = "edited"; i.stale = null; }
    });
    K().items = cur;
    K().log.unshift({ date: A.stamp(), text: `Sửa tri thức: ${D.edits.length} thay đổi.` });
    const left = C.run().open.length;
    A.closeModal();
    A.rerender();
    A.toast(`Đã áp dụng ${D.edits.length} thay đổi. ${left ? `Còn ${left} vấn đề cần xem.` : "Không còn xung đột."}`, left ? "warning" : "success");
  }

  /* ---------------- sự kiện ---------------- */
  const cur = () => apply(D.edits);
  const itemOf = (id) => cur().find((i) => i.id === id);

  Object.assign(A.ACT, {
    "ed-toggle": (el) => { const k = el.dataset.k; D.open.has(k) ? D.open.delete(k) : D.open.add(k); redraw(); },
    "ed-add": (el) => { addItem(el.dataset.v); redraw(); },
    "ed-del": (el) => {
      const id = el.dataset.k;
      const made = createdOp(id);
      D.edits = made ? D.edits.filter((e) => e !== made) : [...D.edits, { k: "del", id }];
      D.sel = D.sel.filter((x) => x !== id);
      redraw();
    },
    "ed-restore": (el) => { D.edits = D.edits.filter((e) => !(e.k === "del" && e.id === el.dataset.k)); redraw(); },
    "ed-undo": (el) => { D.edits.splice(+el.dataset.i, 1); redraw(); },
    "ed-changes": () => { D.changes = !D.changes; redraw(); },
    "ed-attr-add": (el) => { const it = itemOf(el.dataset.k); patch(it.id, { attrs: [...it.attrs, { k: Object.keys(O().attributes)[0], v: "" }] }); redraw(); },
    "ed-attr-del": (el) => { const it = itemOf(el.dataset.k); patch(it.id, { attrs: it.attrs.filter((_, i) => i !== +el.dataset.i) }); redraw(); },
    "ed-ev-del": (el) => { const it = itemOf(el.dataset.k); patch(it.id, { ev: it.ev.filter((_, i) => i !== +el.dataset.i) }); redraw(); },
    "ed-ev-add": (el) => {
      const id = el.dataset.k;
      const d = D.evd[id] || { p: "", q: "" };
      if (!d.p.trim() || !d.q.trim()) { A.toast("Nhập cả đoạn nguồn và trích dẫn.", "warning"); return; }
      const it = itemOf(id);
      patch(id, { ev: [...it.ev, { p: d.p.trim(), q: d.q.trim() }] });
      D.evd[id] = { p: "", q: "" };
      redraw();
    },
    "ed-merge-start": () => {
      const sel = cards(cur(), ["entity"]).filter((c) => D.sel.includes(c.key) && present(c)).sort((a, b) => b.item.ev.length - a.item.ev.length);
      D.merge = sel[0]?.key || null;
      redraw();
    },
    "ed-merge-cancel": () => { D.merge = null; redraw(); },
    "ed-merge-apply": () => {
      const sources = D.sel.filter((id) => itemOf(id));
      D.edits.push({ k: "merge", sources, target: D.merge });
      D.open.add(D.merge);
      D.sel = []; D.merge = null;
      redraw();
    },
    "ed-del-sel": () => { D.sel.forEach((id) => { const made = createdOp(id); D.edits = made ? D.edits.filter((e) => e !== made) : [...D.edits, { k: "del", id }]; }); D.sel = []; D.merge = null; redraw(); },
    "ed-clear": () => { D.sel = []; D.merge = null; redraw(); },
    "ed-split-start": (el) => { const it = itemOf(el.dataset.k); D.split = { id: it.id, name: "", type: it.type, facts: [] }; D.open.add(it.id); redraw(); },
    "ed-split-cancel": () => { D.split = null; redraw(); },
    "ed-split-apply": () => {
      const f = D.split;
      if (!f.name.trim()) return;
      const item = { id: newId("E"), kind: "entity", type: f.type, name: f.name.trim(), summary: "", attrs: [], cert: "text", status: "edited", ev: [] };
      D.edits.push({ k: "split", id: f.id, item, facts: f.facts });
      D.open.add(item.id);
      D.split = null;
      redraw();
    },
    "ed-confirm": confirm,
  });

  Object.assign(A.ON, {
    "ed-f": (el) => {
      const { k, f } = el.dataset;
      const v = f === "order" ? +el.value || 0 : el.value;
      const p = { [f]: v };
      if (f === "pred") p.label = O().predicates[v].label;
      patch(k, p);
      redraw();
    },
    "ed-attr": (el) => {
      const it = itemOf(el.dataset.k);
      const attrs = it.attrs.map((a, i) => (i === +el.dataset.i ? { ...a, [el.dataset.f]: el.value } : a));
      patch(it.id, { attrs });
      redraw();
    },
    "ed-sel": (el) => { const k = el.dataset.k; D.sel = el.checked ? [...D.sel, k] : D.sel.filter((x) => x !== k); D.merge = null; redraw(); },
    "ed-merge": (el) => { D.merge = el.value; },
    "ed-split": (el) => { D.split[el.dataset.f] = el.value; if (el.dataset.f === "type") redraw(); else { const b = A.$('[data-act="ed-split-apply"]'); if (b) b.disabled = !D.split.name.trim(); } },
    "ed-split-fact": (el) => { const k = el.dataset.k; D.split.facts = el.checked ? [...D.split.facts, k] : D.split.facts.filter((x) => x !== k); },
    "ed-evd": (el) => { (D.evd[el.dataset.k] ||= { p: "", q: "" })[el.dataset.f] = el.value; },
  });

  return { open };
})();
