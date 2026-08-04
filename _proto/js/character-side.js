(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const SC = window.SC;
  const CR = window.CR;
  const CRV = window.CRV;
  const U = window.NVU;
  const LB = window.LB;
  const { esc, ic } = A;
  const provOf = (id) => CR.PROVIDERS.find((q) => q.id === id);

  function outfitList(c) {
    const { e, o, row } = c;
    const rows = CR.all(e).map((q) => {
      const sh = CR.sheetOf(c.p, e, q);
      const use = row.req.find((x) => x.o.id === q.id);
      return `<button type="button" class="cr-orow ${q.id === o.id ? "is-active" : ""}" data-testid="cr-orow-${q.id}" data-act="cr-outfit-goto" data-v="${q.id}">${ic(q.base ? "user" : "shirt")}<span class="ellip">${esc(q.base ? "Character sheet" : q.name)}</span><span class="t-sm t-mute">${q.base ? "gốc" : use ? `${use.cols.length} ${CRV.unitWord(c.an)}` : "chưa dùng"}</span>${CRV.badge(CR.SHEET[sh])}</button>`;
    }).join("");
    return `<section class="ins-sec" data-testid="cr-ins-outfits"><span class="eyebrow">Sheet · ${e.outfits.length + 1}</span><div class="cr-olist">${rows}</div>
      <button class="btn btn-sm" data-testid="cr-ins-outfit-add-btn" data-act="cr-outfit-add">${ic("plus")}Thêm trang phục</button></section>`;
  }

  function usageList(c) {
    const { row, an, e } = c;
    const cols = an.cols.filter((q) => row.cells[q.key]);
    const rows = cols.slice(0, 12).map((q) => {
      const x = row.cells[q.key];
      const at = `data-col="${esc(q.key)}"`;
      const ctrl = x.mode === "mention"
        ? `<span class="t-sm t-mute ellip" title="${esc(x.why)}">Chỉ nhắc đến, không cần sheet</span><button type="button" class="btn btn-sm" data-testid="cr-use-on-${q.key}" data-act="cr-use-mode" ${at} data-v="on">Có mặt</button>`
        : `<select class="select" data-testid="cr-use-outfit-${q.key}" data-change="cr-use-outfit" ${at} aria-label="Trang phục trong ${esc(q.label)}">${U.options([...e.outfits.map((t) => [t.id, t.name]), ["__new", "+ Trang phục mới…"]], x.outfit.id)}</select>
           <button type="button" class="btn btn-icon btn-sm" data-testid="cr-use-off-${q.key}" data-act="cr-use-mode" ${at} data-v="mention" data-tip="Chỉ nhắc đến, không cần sheet" aria-label="Chỉ nhắc đến">${ic("info")}</button>`;
      return `<div class="cr-use" data-testid="cr-use-${q.key}"><div class="cr-use-h" title="${esc(`${x.how}${x.refs.length ? ` · ${x.refs.join(", ")}` : ""}`)}"><span class="mono">${esc(q.group ? `${q.group} · ${q.label}` : q.label)}</span>${q.sub ? `<span class="t-sm t-mute ellip">${esc(q.sub)}</span>` : ""}${x.over ? `<span class="badge badge-primary">BẠN ĐẶT</span>` : ""}</div><div class="cr-use-c">${ctrl}</div></div>`;
    }).join("");
    return `<section class="ins-sec" data-testid="cr-ins-usage"><span class="eyebrow">Xuất hiện trong kịch bản · ${cols.length}</span>
      ${rows || `<p class="t-sm t-mute">${an.known ? "Chưa có cảnh nào trong kịch bản đã có nhắc tới nhân vật này." : "Chưa có kịch bản."}</p>`}${cols.length > 12 ? `<span class="t-sm t-mute">và ${cols.length - 12} mục khác.</span>` : ""}
      <span class="field-hint">AI đọc Scripting để biết nhân vật có mặt hay chỉ được nhắc đến. Chọn trang phục cho từng ${CRV.unitWord(an)}; chỉ trang phục có mặt mới cần sheet.</span></section>`;
  }

  function sheetPanel(c) {
    const { o } = c;
    const s = o.sheet;
    const stt = CRV.sheetState(c);
    const lib = s && s.src === "lib" ? LB.state.assets.find((a) => a.id === s.libId) : null;
    const rows = [["Sheet", esc(o.base ? "Character sheet" : o.name)], ["Trạng thái", CRV.badge(CRV.STATE_BADGE[stt])]];
    if (s) {
      rows.push(["Nguồn", s.src === "gen" ? `AI · ${esc((provOf(s.prov) || { name: s.prov }).name)}` : s.src === "lib" ? `Thư viện · ${esc(lib ? lib.name : s.libId)}` : `Tải lên · ${esc(s.name || "")}`]);
      rows.push(["Cập nhật", `<span class="mono">${esc(s.at)}</span>`]);
      if (s.src === "gen") rows.push(["Seed", `<span class="mono">${s.seed}</span>`]);
      if (s.ref) rows.push(["Tham chiếu", "Character sheet"]);
    }
    const act = s
      ? `<section class="ins-sec ins-actions" data-testid="cr-ins-sheet-actions">
          <button class="btn ${s.ok ? "" : "btn-primary"}" data-testid="cr-ins-approve" data-act="cr-approve">${ic(s.ok ? "unlock" : "check")}${s.ok ? "Bỏ duyệt" : "Duyệt sheet"}</button>
          <button class="btn" data-testid="cr-ins-regen" data-act="cr-gen-open" data-scope="outfit">${ic("refresh")}Tạo lại</button>
          <button class="btn" data-testid="cr-ins-replace" data-act="cr-up-open">${ic("upload")}Thay ảnh</button>
          <button class="btn" data-testid="cr-ins-zoom" data-act="cr-zoom">${ic("eye")}Xem lớn</button>
          <button class="btn btn-danger" data-testid="cr-ins-del" data-act="cr-sheet-del">${ic("trash")}Xóa</button></section>`
      : `<section class="ins-sec ins-actions" data-testid="cr-ins-sheet-actions"><button class="btn btn-primary" data-testid="cr-ins-gen" data-act="cr-gen-open" data-scope="outfit">${ic("spark")}Tạo bằng AI</button>
          <button class="btn" data-testid="cr-ins-up" data-act="cr-up-open">${ic("upload")}Tải lên</button><button class="btn" data-testid="cr-ins-lib" data-act="cr-up-open" data-tab="lib">${ic("library")}Chọn từ thư viện</button></section>`;
    const prompt = s && s.src === "gen" ? `<section class="ins-sec" data-testid="cr-ins-prompt"><span class="eyebrow">Prompt đã dùng</span><textarea class="textarea cr-ins-ta" rows="6" readonly data-testid="cr-ins-prompt-text" aria-label="Prompt đã dùng">${esc(s.prompt)}</textarea></section>` : "";
    const hist = s && s.hist && s.hist.length ? `<section class="ins-sec" data-testid="cr-ins-hist"><span class="eyebrow">Phiên bản trước · ${s.hist.length}</span>${s.hist.map((h, i) => `<div class="cr-hist" data-testid="cr-hist-${i}"><span class="mono t-mute">${esc(h.at)}</span><span class="t-sm">${h.src === "gen" ? `AI · seed ${h.seed}` : h.src === "lib" ? "Thư viện" : "Tải lên"}${h.ok ? " · đã duyệt" : ""}</span><button class="btn btn-sm" data-testid="cr-hist-restore-${i}" data-act="cr-hist-restore" data-i="${i}">${ic("undo")}Khôi phục</button></div>`).join("")}</section>` : "";
    return `${U.insSec("Design sheet", U.kv(rows))}${act}${prompt}${hist}`;
  }

  function charPanel(c) {
    const { e, o, ch, p, row } = c;
    const kb = !!CR.kbItem(ch.id);
    const s = SC.scriptOf(p);
    const used = s.units.some((u) => (u.blocks || []).some((b) => b.who === ch.id));
    const rows = [["Nguồn", kb ? `<span class="badge badge-info">KNOWLEDGEBASE</span>` : `<span class="badge">THỦ CÔNG</span>`], ["Trang phục", e.outfits.length], ["Cần cho kịch bản", `${row.on.length} ${CRV.unitWord(c.an)}`], ["Chỉ nhắc đến", row.mention.length]];
    return `<section class="ins-sec cr-ins-top" data-testid="cr-ins-summary"><div class="cr-ins-thumb ${o.sheet ? "" : "is-ghost"}" data-testid="cr-ins-thumb">${CR.slotThumb(e, o, o.sheet)}</div>
        <div class="ins-hero-t">${esc(ch.name)}</div>${U.kv(rows)}</section>
      ${outfitList(c)}${sheetPanel(c)}${usageList(c)}
      <section class="ins-sec ins-actions" data-testid="cr-ins-actions">
        ${kb ? `<button class="btn" data-testid="cr-ins-kb-btn" data-act="cr-open-kb">${ic("graph")}Mở Knowledgebase</button>` : `<button class="btn btn-danger" data-testid="cr-ins-del-btn" data-act="cr-char-del" ${used ? `disabled title="Đang có hội thoại trong Scripting"` : ""}>${ic("trash")}Xóa nhân vật</button>`}</section>`;
  }

  function inspector(c) {
    if (!c.ch) return "";
    return charPanel(c);
  }
  CRV.inspector = inspector;

  function openOutfitAdd(c) {
    A.modal({ title: "Thêm trang phục", eyebrow: `Character · ${c.ch.name}`, testid: "cr-outfit-modal",
      body: `<div class="field"><label for="cr-oa-name">Tên trang phục</label><input id="cr-oa-name" class="input" data-testid="cr-oa-name" value="Trang phục ${c.e.outfits.length + 1}" autocomplete="off"></div>
        ${c.o.base ? "" : `<label class="check"><input type="checkbox" id="cr-oa-copy" data-testid="cr-oa-copy" checked><span>Sao chép trang phục và vật dụng từ “${esc(c.o.name)}” để chỉnh lại</span></label>`}
        <p class="t-sm t-mute">Trang phục mới là một card riêng ở cuối trang, có design sheet và prompt riêng. Ngoại hình (khuôn mặt, tóc, dáng người) lấy từ Character sheet.</p>`,
      foot: `<button class="btn" data-testid="cr-oa-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="cr-oa-ok-btn" data-act="cr-outfit-add-ok">${ic("plus")}Thêm</button>` });
  }
  function openCharAdd(c) {
    A.modal({ title: "Thêm nhân vật", eyebrow: "Character", testid: "cr-char-modal",
      body: `<div class="field"><label for="cr-ca-name">Tên nhân vật</label><input id="cr-ca-name" class="input" data-testid="cr-ca-name" placeholder="vd. Thuyền trưởng Hale" autocomplete="off"><span class="field-hint">${SC.kbAvail(c.p) ? "Nhân vật trong Knowledgebase đã có sẵn. Chỉ thêm ở đây nếu nhân vật chưa có trong KB." : "Novel chưa có Knowledgebase nên bạn thêm nhân vật thủ công."} Nhân vật cũng xuất hiện trong danh sách người nói của Scripting.</span></div><p class="field-err" id="cr-ca-err" hidden></p>`,
      foot: `<button class="btn" data-testid="cr-ca-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="cr-ca-ok-btn" data-act="cr-char-add-ok">${ic("plus")}Thêm</button>` });
  }

  const UP = { tab: "file", files: [], pick: "", ack: false, save: true };
  const IMG = LB.TYPES.image;
  function checkFile(f) {
    const ext = LB.extOf(f.name);
    if (!f.size) return "File rỗng.";
    if (!IMG.exts.includes(ext)) return `Định dạng .${ext || "?"} không được hỗ trợ cho ảnh.`;
    if (f.size > IMG.max) return `Lớn hơn giới hạn ${LB.bytes(IMG.max)}.`;
    return "";
  }
  function drawUp(c) {
    const tabs = U.seg("cr-up-tab", [["file", "Từ máy"], ["lib", "Từ thư viện"]], UP.tab, "", "cr-up-tabs");
    let body;
    if (UP.tab === "file") {
      const rows = UP.files.map((f, i) => `<div class="cr-upf" data-testid="cr-upf-${i}"><img class="cr-upf-th" src="${esc(f.url)}" alt="" data-testid="cr-upf-th-${i}"><div class="cr-upf-b"><div class="t-ink ellip">${esc(f.name)}</div><div class="t-sm ${f.err ? "lbu-err" : "t-mute"}">${f.err ? esc(f.err) : LB.bytes(f.size)}</div></div>
          <button class="btn btn-icon btn-sm" data-testid="cr-upf-del-${i}" data-act="cr-up-remove" data-i="${i}" aria-label="Bỏ ảnh">${ic("x")}</button></div>`).join("");
      body = `<div class="lb-drop is-compact" data-testid="cr-up-drop"><div class="lb-drop-act"><label class="btn" data-testid="cr-up-pick-btn">${UP.files.length ? "Chọn ảnh khác…" : "Chọn ảnh…"}<input type="file" hidden accept="${IMG.exts.map((e) => `.${e}`).join(",")}" data-change="cr-up-file" data-testid="cr-up-input"></label></div><div class="t-sm t-mute">${esc(IMG.hint)}. Nên là một ảnh dài chứa đủ 4 góc: front, back, side, 3/4 nửa người.</div></div>
        <div class="cr-upl" data-testid="cr-up-list">${rows}</div>
        <label class="check" data-testid="cr-up-save"><input type="checkbox" data-testid="cr-up-save-input" data-change="cr-up-save" ${UP.save ? "checked" : ""}><span>Lưu cả vào thư viện Images (collection “Nhân vật”)</span></label>
        <label class="check" data-testid="cr-up-ack"><input type="checkbox" data-testid="cr-up-ack-input" data-change="cr-up-ack" ${UP.ack ? "checked" : ""}><span>Tôi có quyền sử dụng ảnh này cho mục đích dự kiến. Dreamy Studio không xác minh quyền sử dụng của ảnh bạn tải lên.</span></label>`;
    } else {
      const list = LB.state.assets.filter((a) => a.type === "image").sort((a, b) => Number(b.tags.includes("character")) - Number(a.tags.includes("character")));
      body = `<p class="t-sm t-mute">Chọn một ảnh trong thư viện làm design sheet. Ảnh có tag “character” được xếp lên đầu.</p>
        <div class="cr-lib" data-testid="cr-lib-grid">${list.map((a) => `<button type="button" class="cr-lib-i ${UP.pick === a.id ? "is-on" : ""}" data-testid="cr-lib-${a.id}" data-act="cr-up-pick" data-id="${a.id}" aria-pressed="${UP.pick === a.id}"><span class="cr-lib-th" style="background:${esc(a.bg)}"></span><span class="t-sm ellip">${esc(a.name)}</span></button>`).join("")}</div>`;
    }
    const ready = UP.tab === "file" ? UP.ack && UP.files.some((f) => !f.err) : !!UP.pick;
    A.modal({ title: "Design sheet từ ảnh có sẵn", eyebrow: `Character · ${c.ch.name} · ${c.o.name}`, cls: "modal-lg", testid: "cr-up-modal",
      body: `${tabs}${body}`,
      foot: `<button class="btn" data-testid="cr-up-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="cr-up-ok-btn" data-act="cr-up-ok" ${ready ? "" : "disabled"}>${ic("check")}Dùng ảnh này</button>` });
  }
  function openUp(c, tab) {
    UP.files.forEach((f) => URL.revokeObjectURL(f.url));
    Object.assign(UP, { tab: tab || "file", files: [], pick: "", ack: A.store.get("cr.ack", false), save: true });
    drawUp(c);
  }

  const readSize = (url) => new Promise((res) => { const im = new Image(); const done = (v) => { clearTimeout(t); res(v); }; const t = setTimeout(() => res([1024, 1536]), 1500); im.onload = () => done([im.naturalWidth, im.naturalHeight]); im.onerror = () => done([1024, 1536]); im.src = url; });
  const putSheet = (o, slot) => {
    const prev = o.sheet;
    slot.hist = prev ? [{ ...prev, hist: [] }, ...(prev.hist || [])].slice(0, 5) : [];
    o.sheet = slot;
  };
  const addTags = () => {
    ["character", "reference"].forEach((t) => { if (!LB.state.tagList.includes(t)) LB.state.tagList.push(t); });
    LB.state.tagList.sort();
  };
  const charCol = () => (LB.state.collections.some((q) => q.id === "COL-04") ? ["COL-04"] : []);
  function addLibImage(name, meta, used) {
    const x = { id: LB.api.nextId("image"), type: "image", name: LB.api.uniqueName("image", name), size: meta.size, tags: ["character", "reference"], cols: charCol(), rights: "own", origin: "Tạo trong Character", used: [{ name: used }], added: A.stamp(), seed: name, meta: { w: meta.w, h: meta.h }, bg: LB.bgFor(name) };
    LB.state.assets.push(x);
    addTags();
    return x;
  }

  Object.assign(A.ACT, {
    "cr-use-mode": (el) => {
      const c = CRV.activeCtx();
      if (!c) return;
      const x = c.row.cells[el.dataset.col];
      if (!x) return;
      const over = c.st.over[c.ch.id] = c.st.over[c.ch.id] || {};
      if (el.dataset.v === x.auto) delete over[el.dataset.col]; else over[el.dataset.col] = el.dataset.v;
      CRV.sync(c);
      CRV.refresh();
    },
    "cr-outfit-add": () => { const c = CRV.activeCtx(); CRV.pendingCell = null; if (c) openOutfitAdd(c); },
    "cr-outfit-add-ok": () => {
      const c = CRV.activeCtx();
      if (!c) return;
      const name = A.$("#cr-oa-name").value.trim() || `Trang phục ${c.e.outfits.length + 1}`;
      if (c.e.outfits.some((q) => q.name.toLowerCase() === name.toLowerCase())) { A.toast("Đã có trang phục trùng tên này.", "warning"); return; }
      const copy = !c.o.base && A.$("#cr-oa-copy").checked;
      const o = CR.newOutfit(c.st, name, copy ? { garment: { ...c.o.garment, src: c.o.garment.v ? "user" : "" }, props: { ...c.o.props }, palette: c.o.palette.map((x) => ({ ...x })), palOk: c.o.palOk } : {});
      c.e.outfits.push(o);
      c.e.sel = o.id;
      CR.recompose(c.p, c.e, o);
      const pend = CRV.pendingCell;
      CRV.pendingCell = null;
      if (pend && pend.char === c.ch.id) {
        c.st.assign[c.ch.id] = c.st.assign[c.ch.id] || {};
        c.st.assign[c.ch.id][pend.col] = o.id;
      }
      c.x.scrollTo = o.id;
      CRV.log(c, `Thêm trang phục “${name}” cho ${c.ch.name}`);
      CRV.sync(c);
      A.closeModal();
      CRV.refresh();
      A.toast(`Đã thêm trang phục “${name}”.`);
    },
    "cr-outfit-del": (el) => {
      const c = CRV.activeCtx();
      const o = c && c.e.outfits.find((q) => q.id === el.dataset.v);
      if (!o || c.e.outfits.length < 2) return;
      c.e.outfits = c.e.outfits.filter((q) => q.id !== o.id);
      Object.entries(c.st.assign[c.ch.id] || {}).forEach(([k, id]) => { if (id === o.id) delete c.st.assign[c.ch.id][k]; });
      if (c.e.sel === o.id) c.e.sel = c.e.outfits[0].id;
      CRV.sync(c);
      CRV.refresh();
      A.toast(`Đã xóa trang phục “${o.name}”.`, "warning");
    },
    "cr-char-add": () => { const c = CRV.activeCtx(); if (c) openCharAdd(c); },
    "cr-char-add-ok": () => {
      const c = CRV.activeCtx();
      if (!c) return;
      const name = A.$("#cr-ca-name").value.trim();
      const err = A.$("#cr-ca-err");
      const bad = !name ? "Nhập tên nhân vật." : CR.castOf(c.p).some((x) => x.name.toLowerCase() === name.toLowerCase()) ? "Đã có nhân vật trùng tên này." : "";
      err.textContent = bad;
      err.hidden = !bad;
      if (bad) return;
      const s = SC.scriptOf(c.p);
      const id = `spk${Date.now().toString(36)}`;
      s.extraCast.push({ id, name, c: s.cast.length });
      SC.syncCast(c.p, s);
      c.x.char = id;
      c.x.view = "sheets";
      CRV.log(c, `Thêm nhân vật ${name}`);
      CRV.sync(c);
      A.closeModal();
      CRV.refresh();
      A.toast(`Đã thêm nhân vật “${name}”.`);
    },
    "cr-char-del": () => {
      const c = CRV.activeCtx();
      if (!c || CR.kbItem(c.ch.id)) return;
      const s = SC.scriptOf(c.p);
      if (s.units.some((u) => (u.blocks || []).some((b) => b.who === c.ch.id))) return;
      s.extraCast = s.extraCast.filter((x) => x.id !== c.ch.id);
      delete c.st.chars[c.ch.id];
      SC.syncCast(c.p, s);
      c.x.char = null;
      CRV.sync(c);
      CRV.refresh();
      A.toast(`Đã xóa nhân vật “${c.ch.name}”.`, "warning");
    },
    "cr-zoom": (el, ev) => {
      ev?.stopPropagation();
      const c = CRV.activeCtx();
      const s = c && c.o.sheet;
      if (!s) return;
      A.modal({ title: `${c.ch.name} · ${c.o.name}`, eyebrow: "Design sheet", cls: "modal-lg", testid: "cr-zoom-modal",
        body: `<div class="cr-zoom" data-testid="cr-zoom">${CR.slotThumb(c.e, c.o, s)}</div>${s.prompt ? `<details class="cr-views"><summary>Prompt đã dùng</summary><p class="t-sm">${esc(s.prompt)}</p></details>` : ""}`,
        foot: `<button class="btn btn-primary" data-testid="cr-zoom-close-btn" data-act="close-modal">Đóng</button>` });
    },
    "cr-hist-restore": (el) => {
      const c = CRV.activeCtx();
      const cur = c && c.o.sheet;
      const i = Number(el.dataset.i);
      const h = cur && cur.hist[i];
      if (!h) return;
      c.o.sheet = { ...h, hist: [{ ...cur, hist: [] }, ...cur.hist.filter((_, k) => k !== i)].slice(0, 5) };
      CRV.sync(c);
      CRV.refresh();
      A.toast("Đã khôi phục phiên bản trước.");
    },
    "cr-save-prompt": () => {
      const c = CRV.activeCtx();
      if (!c) return;
      const name = LB.api.uniqueName("prompt", `${c.ch.name} — ${c.o.name}`);
      const text = c.o.prompt.text;
      LB.state.assets.push({ id: LB.api.nextId("prompt"), type: "prompt", name, kind: "image", text, size: new Blob([text]).size, tags: ["character", "reference"], cols: charCol(), rights: "own", origin: "Tạo trong app", used: [{ name: c.p.name }], added: A.stamp(), seed: name });
      addTags();
      A.toast(`Đã lưu prompt “${name}” vào thư viện.`);
    },
    "cr-save-lib": () => {
      const c = CRV.activeCtx();
      const s = c && c.o.sheet;
      if (!s) return;
      if (s.src === "lib" || s.saved) { A.toast("Sheet này đã có trong thư viện.", "warning"); return; }
      const x = addLibImage(`${PJ.slug(c.ch.name)}-${c.o.base ? "character" : PJ.slug(c.o.name)}-sheet.png`, { size: Math.round(2.4 * LB.MB), w: 2560, h: 840 }, c.p.name);
      s.saved = x.id;
      A.toast("Đã lưu design sheet vào thư viện Images.");
    },
    "cr-up-open": (el, ev) => {
      ev?.stopPropagation();
      const c = CRV.activeCtx();
      if (c) openUp(c, el.dataset.tab);
    },
    "cr-up-tab": (el) => { const c = CRV.activeCtx(); if (!c) return; UP.tab = el.dataset.v; drawUp(c); },
    "cr-up-remove": (el) => { const c = CRV.activeCtx(); if (!c) return; const [f] = UP.files.splice(Number(el.dataset.i), 1); if (f) URL.revokeObjectURL(f.url); drawUp(c); },
    "cr-up-pick": (el) => { const c = CRV.activeCtx(); if (!c) return; UP.pick = el.dataset.id; drawUp(c); },
    "cr-up-ok": async () => {
      const c = CRV.activeCtx();
      if (!c) return;
      const { p, ch, o } = c;
      if (UP.tab === "lib") {
        if (!UP.pick) return;
        putSheet(o, { src: "lib", libId: UP.pick, at: A.stamp(), rev: Date.now(), ok: false });
        const a = LB.state.assets.find((q) => q.id === UP.pick);
        if (a && !a.used.some((u) => u.name === p.name)) a.used.push({ name: p.name });
      } else {
        const f = UP.files.find((q) => !q.err);
        if (!UP.ack || !f) return;
        A.store.set("cr.ack", true);
        const slot = { src: "upload", url: f.url, name: f.name, size: f.size, at: A.stamp(), rev: Date.now(), ok: false };
        if (UP.save) {
          const [w, h] = await readSize(f.url);
          slot.saved = addLibImage(f.name, { size: f.size, w, h }, p.name).id;
        }
        putSheet(o, slot);
        UP.files = [];
      }
      CRV.log(c, `Cập nhật sheet ${ch.name} · ${o.name} bằng ảnh có sẵn`);
      CRV.sync(c);
      A.closeModal();
      CRV.refresh();
      A.toast("Đã cập nhật design sheet. Hãy xem lại và duyệt.");
    },
  });

  Object.assign(A.ON, {
    "cr-oname": (el) => {
      const c = CRV.activeCtx();
      if (!c) return;
      const v = el.value.trim();
      if (!v) { el.value = c.o.name; return; }
      if (c.e.outfits.some((q) => q.id !== c.o.id && q.name.toLowerCase() === v.toLowerCase())) { el.value = c.o.name; A.toast("Đã có trang phục trùng tên này.", "warning"); return; }
      c.o.name = v;
      CRV.refresh();
    },
    "cr-use-outfit": (el) => {
      const c = CRV.activeCtx();
      if (!c) return;
      const sel = { char: c.ch.id, col: el.dataset.col };
      if (el.value === "__new") {
        CRV.pendingCell = sel;
        openOutfitAdd(c);
        return;
      }
      c.st.assign[sel.char] = c.st.assign[sel.char] || {};
      c.st.assign[sel.char][sel.col] = el.value;
      CRV.sync(c);
      CRV.refresh();
    },
    "cr-up-file": (el) => {
      const c = CRV.activeCtx();
      const f = el.files && el.files[0];
      if (!c || !f) return;
      UP.files.forEach((q) => URL.revokeObjectURL(q.url));
      UP.files = [{ name: f.name, size: f.size, url: URL.createObjectURL(f), err: checkFile(f) }];
      drawUp(c);
    },
    "cr-up-save": (el) => { UP.save = el.checked; },
    "cr-up-ack": (el) => { const c = CRV.activeCtx(); if (!c) return; UP.ack = el.checked; drawUp(c); },
  });
})();
