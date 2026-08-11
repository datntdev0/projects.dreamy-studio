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
    c.p.prog.scripting = { state, done, total, note: `${done}/${total} ${c.cfg.unit.toLowerCase()}${stale ? ` · ${stale} cần xem lại` : ""}` };
    c.p.activity.unshift([A.stamp(), `Cập nhật kịch bản: ${done}/${total} ${c.cfg.unit.toLowerCase()} đã chốt`]);
    A.renderExplorer();
  }

  function blockPanel(c, b) {
    const t = T[b.type];
    const rows = [field("Loại khối", "ib-type", `<select id="ib-type" class="select" data-testid="sc-ins-type" data-change="sc-ins-type" data-id="${b.id}" ${dis(c)}>${R.opts(c.cfg.types.map((x) => [x, T[x].label]), b.type)}</select>`)];
    if (b.type === "dialogue" && c.cfg.speakers) {
      rows.push(field("Nhân vật", "ib-who", `<select id="ib-who" class="select" data-testid="sc-ins-who" data-change="sc-who-sel" data-id="${b.id}" ${dis(c)}><option value="">Chưa gán</option>${U.options(c.s.cast.map((sp) => [sp.id, sp.name]), b.who)}</select>`));
      rows.push(field("Sắc thái", "ib-par", `<input id="ib-par" class="input" data-testid="sc-ins-paren" value="${esc(b.paren)}" placeholder="vd. thì thầm, giận dữ" data-change="sc-fld" data-id="${b.id}" data-f="paren" ${dis(c)}>`));
    }
    if (b.type === "scene") {
      rows.push(field("Bối cảnh (từ Knowledgebase hoặc tự nhập)", "ib-loc", `<input id="ib-loc" class="input" list="sc-places" data-testid="sc-ins-loc" value="${esc(b.loc)}" data-change="sc-fld" data-id="${b.id}" data-f="loc" ${dis(c)}>`));
      rows.push(field("Thời điểm", "ib-time", `<select id="ib-time" class="select" data-testid="sc-ins-time" data-change="sc-fld" data-id="${b.id}" data-f="time" ${dis(c)}>${R.opts(SC.TIMES, b.time)}</select>`));
      rows.push(field("Tóm tắt cảnh", "ib-beat", `<textarea id="ib-beat" class="textarea" rows="3" data-testid="sc-ins-beat" data-change="sc-fld" data-id="${b.id}" data-f="beat" ${dis(c)}>${esc(b.beat)}</textarea>`));
    }
    if (b.type === "pause") rows.push(field("Số giây nghỉ", "ib-ms", `<input id="ib-ms" class="input" type="number" min="0" max="30" step="0.1" data-testid="sc-ins-ms" value="${(b.ms / 1000).toFixed(1)}" data-change="sc-fld" data-id="${b.id}" data-f="ms" ${dis(c)}>`));
    const stale = R.isStale(c, b);
    const refsRow = b.type === "scene" && b.refs.length ? U.kv([["Dẫn chứng", b.refs.map((r) => `<span class="sc-ref">Ch.${r.split(".")[0]} ¶${r.split(".")[1]}</span>`).join(" ")]]) : "";
    const src = b.ref ? U.kv([["Đoạn nguồn", `<span class="mono">¶${b.ref.split(".")[1]}</span>`], ["Khớp nguồn", stale ? `<span class="badge badge-warning">ĐÃ ĐỔI</span>` : `<span class="badge badge-success">KHỚP</span>`]]) : "";
    const act = c.locked ? "" : `<section class="ins-sec ins-actions" data-testid="sc-ins-actions">
        <button class="btn" data-testid="sc-ins-up" data-act="sc-up" data-id="${b.id}">${ic("arrow-up")}Lên</button><button class="btn" data-testid="sc-ins-down" data-act="sc-down" data-id="${b.id}">${ic("arrow-down")}Xuống</button>
        <button class="btn" data-testid="sc-ins-dup" data-act="sc-dup" data-id="${b.id}">${ic("copy")}Nhân bản</button><button class="btn btn-danger" data-testid="sc-ins-del" data-act="sc-del" data-id="${b.id}">${ic("trash")}Xóa</button></section>`;
    return `<section class="ins-sec" data-testid="sc-ins-block"><span class="eyebrow">Khối đã chọn</span><div class="ins-h">${ic(t.icon)}<span class="t-ink">${esc(t.label)}</span></div><p class="t-sm t-mute">${esc(t.hint)}</p><div class="ins-form">${rows.join("")}</div>${b.type === "dialogue" && !c.cfg.speakers ? `<span class="field-hint">Người nói và giọng đọc được chọn ở module Audiobook.</span>` : ""}</section>
      ${b.ref ? U.insSec("Nguồn", src) : ""}${refsRow ? `<section class="ins-sec">${refsRow}</section>` : ""}${act}`;
  }

  function summaryPanel(c) {
    const { s, u, cfg } = c;
    const m = R.metrics(s, u);
    const total = Object.values(m.byWho).reduce((a, n) => a + n, 0) || 1;
    const who = Object.entries(m.byWho).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
      const sp = R.spk(s, id);
      return `<div class="sc-bar" data-testid="sc-dist-${id}"><span class="sc-bar-n ellip"><i class="sc-dot ${R.spkClass(sp)}"></i>${esc(sp ? sp.name : "Chưa gán")}</span><div class="progress"><i style="width:${Math.round((n / total) * 100)}%"></i></div><span class="mono t-mute">${U.fmt(n)}</span></div>`;
    }).join("");
    const typeRows = Object.entries(m.byType).map(([t, n]) => `<div class="sc-bar" data-testid="sc-type-${t}"><span class="sc-bar-n ellip">${ic(T[t].icon)}${esc(T[t].label)}</span><div class="progress"><i style="width:${Math.round((n / (m.blocks || 1)) * 100)}%"></i></div><span class="mono t-mute">${n}</span></div>`).join("");
    const dist = cfg.speakers
      ? (who ? `<section class="ins-sec" data-testid="sc-ins-dist"><span class="eyebrow">Lời thoại theo nhân vật · số từ</span>${who}</section>` : "")
      : (typeRows ? `<section class="ins-sec" data-testid="sc-ins-types"><span class="eyebrow">Phân bổ theo loại khối</span>${typeRows}</section>` : "");
    const list = R.issues(c);
    const rows = list.slice(0, 8).map((i) => `<button type="button" class="sc-iss is-${i.lv}" data-testid="sc-issue" ${i.id ? `data-act="sc-goto" data-id="${i.id}"` : i.ref ? `data-act="sc-goto-ref" data-ref="${i.ref}"` : "disabled"}>${ic(i.lv === "error" ? "x-circle" : "alert")}<span>${esc(i.text)}</span></button>`).join("");
    const kv = [["Tên", esc(u.title || "Chưa đặt tên")], ["Trạng thái", R.statusBadge(c, u)]];
    if (cfg.ranges) kv.push(["Chương nguồn", esc(R.chLabel(u))], ["Phân cảnh", m.scenes]);
    kv.push(["Hội thoại", m.lines]);
    kv.push(["Khối", m.blocks], ["Số từ", U.fmt(m.words)], ["Ước tính", `≈ ${R.dur(m.secs)}`]);
    if (u.updated) kv.push(["Sửa lúc", `<span class="mono">${esc(u.updated)}</span>`]);
    return `${U.insSec(`${cfg.unit} ${u.no}`, U.kv(kv))}
      ${dist}
      <section class="ins-sec" data-testid="sc-ins-issues"><span class="eyebrow">Kiểm tra${list.length ? ` · ${list.length}` : ""}</span>${rows || `<p class="t-sm t-mute">${u.blocks && u.blocks.length ? "Không có vấn đề nào." : "Chưa có nội dung để kiểm tra."}</p>`}${list.length > 8 ? `<span class="t-sm t-mute">và ${list.length - 8} vấn đề khác.</span>` : ""}</section>`;
  }

  function castPanel(c) {
    const { s, p } = c;
    const used = (id) => s.units.reduce((a, u) => a + (u.blocks || []).filter((b) => b.who === id).length, 0);
    const rows = s.cast.map((sp) => {
      const n = used(sp.id);
      return `<div class="sc-cast-r" data-testid="sc-cast-${sp.id}"><i class="sc-dot ${R.spkClass(sp)}"></i>
        <input class="input" data-testid="sc-cast-name-${sp.id}" value="${esc(sp.name)}" data-change="sc-spk-name" data-id="${sp.id}" aria-label="Tên" ${sp.kb || sp.kind === "narrator" ? "disabled" : ""}>
        ${sp.kb ? `<span class="badge badge-info" title="Lấy từ Knowledgebase">KB</span>` : sp.kind === "narrator" ? `<span class="badge badge-primary">DẪN</span>` : `<span class="mono t-mute" title="Số khối">${n}</span>`}
        <button class="btn btn-icon btn-sm" data-testid="sc-cast-del-${sp.id}" data-act="sc-spk-del" data-id="${sp.id}" ${sp.kb || sp.kind === "narrator" || n ? "disabled" : ""} title="${sp.kb ? "Nhân vật từ Knowledgebase" : sp.kind === "narrator" ? "Không thể xóa" : n ? "Đang được dùng" : "Xóa"}" aria-label="Xóa">${ic("trash")}</button></div>`;
    }).join("");
    return `<section class="ins-sec" data-testid="sc-ins-cast"><span class="eyebrow">Nhân vật · ${s.cast.length}</span><div class="sc-cast">${rows || `<p class="t-sm t-mute">Chưa có nhân vật nào.</p>`}</div>
        <div class="sc-cast-add"><input id="sc-new-spk" class="input" data-testid="sc-cast-new-input" placeholder="Nhân vật chưa có trong KB…" data-enter="sc-spk-add" autocomplete="off" aria-label="Tên nhân vật mới"><button class="btn btn-sm" data-testid="sc-cast-add-btn" data-act="sc-spk-add">${ic("plus")}Thêm</button></div>
        <span class="field-hint">${SC.kbAvail(p) ? "Nhân vật lấy từ Knowledgebase của novel, sửa ở đó." : "Novel chưa có Knowledgebase nên bạn thêm nhân vật thủ công."}</span></section>`;
  }

  function scriptPanel(c) {
    const { p, cfg } = c;
    const next = p.modules.includes("audiobook") && cfg.types.includes("narration") ? "audiobook" : p.modules.includes("storyboard") ? "storyboard" : "";
    if (!next && !R.hasDefault(c)) return "";
    return `<section class="ins-sec sc-ins-script" data-testid="sc-ins-script"><span class="eyebrow">Kịch bản</span>
      ${R.hasDefault(c) ? `<button class="btn btn-block" data-testid="sc-reset-btn" data-act="sc-reset">${ic("refresh")}Đặt lại về mặc định</button>` : ""}
      ${next ? `<button class="btn btn-block ${c.locked ? "btn-primary" : ""}" data-testid="sc-next-btn" data-act="pj-mod" data-id="${p.id}" data-m="${next}">${ic(PJ.MODULES[next].icon)}Tiếp tục ở ${esc(PJ.MODULES[next].label)}</button>${c.locked ? "" : `<span class="field-hint">Chốt ${esc(cfg.unit.toLowerCase())} này trước khi sản xuất.</span>`}` : ""}</section>`;
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
    const defs = [["none", "Có nội dung", "error", true], ["empty", "Mọi khối đều có nội dung", "error", true], ["who", "Mọi hội thoại đã gán nhân vật", "error", c.cfg.speakers],
      ["scene", "Mọi phân cảnh có bối cảnh", "error", f], ["noscene", "Có ít nhất một phân cảnh", "warn", f],
      ["stale", "Lời đọc khớp với nguồn hiện tại", "warn", c.cfg.source && !!c.src], ["uncovered", "Mọi đoạn nguồn đã có lời đọc", "warn", c.cfg.source && !!c.src]];
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
    A.modal({ title: `Chốt ${c.cfg.unit.toLowerCase()} ${c.u.no}`, eyebrow: "Kiểm tra trước khi chốt", testid: "sc-check-modal",
      body: `<p class="t-sm t-mute">Bản chốt là bản mà các module sản xuất sẽ dùng. Sau khi chốt, ${esc(c.cfg.unit.toLowerCase())} này chỉ đọc cho đến khi bạn mở khóa.</p>
        <div class="sc-chks" data-testid="sc-checks">${rows.map(row).join("")}</div>
        ${errors ? `<div class="sc-ban is-err">${ic("x-circle")}<span>Còn ${errors} mục lỗi cần sửa trước khi chốt.</span></div>` : warns ? `<div class="sc-ban is-warn">${ic("alert")}<span>Có ${warns} cảnh báo. Bạn vẫn có thể chốt.</span></div>` : `<div class="sc-ban is-ok">${ic("check-circle")}<span>Mọi kiểm tra đều đạt.</span></div>`}`,
      foot: `<button class="btn" data-testid="sc-check-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="sc-check-lock-btn" data-act="sc-lock" ${errors ? "disabled" : ""}>${ic("lock")}Chốt ${esc(c.cfg.unit.toLowerCase())}</button>` });
  }

  function openUnlock(c) {
    const down = c.p.prog.audiobook && c.p.prog.audiobook.state !== "idle";
    A.modal({ title: `Mở khóa ${c.cfg.unit.toLowerCase()} ${c.u.no}?`, eyebrow: "Scripting", testid: "sc-unlock-modal",
      body: `<p class="t-sm">${esc(c.cfg.unit)} sẽ trở lại trạng thái bản nháp để chỉnh sửa.</p>${down ? `<div class="sc-ban is-warn">${ic("alert")}<span>Audio đã tạo từ bản chốt cũ sẽ được đánh dấu cần xem lại khi kịch bản thay đổi.</span></div>` : ""}`,
      foot: `<button class="btn" data-testid="sc-unlock-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="sc-unlock-ok-btn" data-act="sc-unlock-ok">${ic("unlock")}Mở khóa</button>` });
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
    if (c.locked) { A.toast(`Mở khóa ${c.cfg.unit.toLowerCase()} trước khi đặt lại.`, "warning"); return; }
    const all = resettable(c);
    if (all.length < 2) rs.scope = "unit";
    const n = c.u.blocks ? c.u.blocks.length : 0;
    const radio = (v, label, hint, off) => `<label class="check pj-chk-row ${off ? "is-off" : ""}" data-testid="sc-reset-scope-${v}"><input type="radio" name="sc-rs" data-testid="sc-reset-scope-input-${v}" data-change="sc-rs-scope" value="${v}" ${rs.scope === v ? "checked" : ""} ${off ? "disabled" : ""}><span>${label}</span><span class="t-sm t-mute">${hint}</span></label>`;
    A.modal({ title: "Đặt lại về mặc định", eyebrow: "Scripting", testid: "sc-reset-modal",
      body: `<p class="t-sm">Bản mặc định gồm một <b>tiêu đề</b>, một <b>khoảng nghỉ</b>, rồi <b>mỗi đoạn nguồn là đúng một khối dẫn chuyện</b>, giữ nguyên chữ của đoạn nguồn hiện tại.</p>
        <div class="field"><span class="eyebrow">Phạm vi</span><div class="pj-chk-list">
          ${radio("unit", `${esc(c.cfg.unit)} ${c.u.no} đang mở`, `${n} khối hiện có`, false)}
          ${radio("all", `Mọi ${esc(c.cfg.unit.toLowerCase())} chưa chốt có nguồn`, `${all.length} ${esc(c.cfg.unit.toLowerCase())}`, all.length < 2)}</div></div>
        <div class="sc-ban is-warn">${ic("alert")}<span>Mọi chỉnh sửa trong phạm vi này sẽ mất. Audio đã tạo cho khối có chữ không đổi vẫn được giữ.</span></div>`,
      foot: `<button class="btn" data-testid="sc-reset-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="sc-reset-go-btn" data-act="sc-reset-go">${ic("refresh")}Đặt lại</button>` });
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
      A.toast(n ? `Đã đặt lại ${n} ${c.cfg.unit.toLowerCase()} về mặc định.` : "Không có nguồn để đặt lại.", n ? "success" : "warning");
    },
    "sc-default": () => {
      const c = R.activeCtx();
      if (!c) return;
      applyDefault(c, c.u);
      c.x.sel = null;
      R.refresh();
      A.toast("Đã tạo kịch bản mặc định từ các đoạn nguồn.");
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
      A.toast(`Đã chốt ${c.cfg.unit.toLowerCase()} ${c.u.no}.`);
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
      A.toast(`Đã mở khóa ${c.cfg.unit.toLowerCase()} ${c.u.no}.`, "warning");
    },
    "sc-goto-ref": (el) => { const c = R.activeCtx(); if (!c) return; c.x.view = "edit"; c.x.ref = el.dataset.ref; A.closeModal(); R.refresh(); },
    "sc-spk-add": () => {
      const c = R.activeCtx();
      const el = A.$("#sc-new-spk");
      const name = el ? el.value.trim() : "";
      if (!c || !name) { if (el) el.focus(); return; }
      if (c.s.cast.some((x) => x.name.toLowerCase() === name.toLowerCase())) { A.toast("Đã có nhân vật trùng tên này.", "warning"); return; }
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
