(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const CR = window.CR;
  const SCR = window.SCR;
  const U = window.NVU;
  const LB = window.LB;
  const { esc, ic } = A;

  const byP = (id) => PJ.state.projects.find((p) => p.id === id);
  const ui = (pid) => (CR.ui[pid] ||= { char: null, scrollTo: null });
  const pad = (n) => String(n).padStart(2, "0");
  const spkClass = (sp) => SCR.spkClass(sp);
  const badge = ([label, cls], testid = "") => `<span class="badge ${cls}" ${testid ? `data-testid="${testid}"` : ""}>${label}</span>`;
  const unitWord = (an) => (an.film ? "cảnh" : "chương");
  const SRC_LABEL = { gen: "AI", upload: "TẢI LÊN", lib: "THƯ VIỆN" };

  function ctx(p) {
    const x = ui(p.id);
    const st = CR.of(p);
    const an = CR.analyze(p);
    let row = an.rows.find((r) => r.ch.id === x.char);
    if (!row) {
      row = an.rows.find((r) => r.needed) || an.rows[0] || null;
      x.char = row ? row.ch.id : null;
    }
    const e = row ? row.e : null;
    const o = e ? CR.all(e).find((q) => q.id === e.sel) || e.outfits[0] : null;
    if (e && o) e.sel = o.id;
    return { p, x, st, an, row, e, o, ch: row ? row.ch : null };
  }
  const activeCtx = () => {
    const id = A.S.active;
    if (!/^pmod:[^:]+:character$/.test(id)) return null;
    const p = byP(String(id).split(":")[1]);
    return p ? ctx(p) : null;
  };

  const slotKey = (p, ch, o) => `${p.id}:${ch.id}:${o.id}:sheet`;
  const taskOf = (key) => A.PL.list.find((pl) => pl.kind === "character" && pl.status === "running" && pl.tasks.some((t) => t.key === key && t.status !== "done"));
  const isGen = (c, ch, o) => !!taskOf(slotKey(c.p, ch, o));
  const anyGen = (c) => CR.all(c.e).some((q) => isGen(c, c.ch, q));
  const sheetState = (c) => (isGen(c, c.ch, c.o) ? "run" : CR.sheetOf(c.p, c.e, c.o));
  const STATE_BADGE = { run: ["ĐANG TẠO", "badge-running"], ...CR.SHEET };

  function syncP(p) {
    if (p.modules.includes("character")) p.prog.character = CR.progOf(p);
    p.updated = A.stamp();
    A.renderExplorer();
  }
  const sync = (c) => syncP(c.p);
  const refresh = () => A.rerender();
  const log = (c, text) => c.p.activity.unshift([A.stamp(), text]);

  function charMark(c, r) {
    const outs = r.req.length ? r.req.map((x) => x.o) : r.e.outfits.filter((o) => CR.filled(o));
    const sts = outs.map((o) => CR.sheetOf(c.p, r.e, o));
    if (sts.includes("stale")) return `<span class="sc-mk is-warn" title="Cần xem lại">${ic("alert")}</span>`;
    if (outs.length && sts.every((s) => s === "ok")) return `<span class="sc-mk is-ok" title="Đủ sheet đã duyệt">${ic("check-circle")}</span>`;
    if (r.needed || !c.an.known) return `<span class="dot dot-warning" title="Còn thiếu sheet"></span>`;
    return `<span class="dot-o" title="Chưa cần sheet"></span>`;
  }
  function railRow(c, r, i) {
    const okN = r.req.filter((x) => CR.sheetOf(c.p, r.e, x.o) === "ok").length;
    const meta = r.needed ? `${r.e.outfits.length} trang phục · ${okN}/${r.req.length} sheet đủ` : c.an.known ? (r.mention.length ? "Chỉ được nhắc đến" : "Chưa có cảnh nào dùng") : `${r.e.outfits.length} trang phục · chưa có kịch bản`;
    return `<div class="sc-unit ${r.ch.id === c.ch.id ? "is-active" : ""}" data-testid="cr-char-${r.ch.id}" tabindex="0" role="treeitem" data-act="cr-char" data-id="${r.ch.id}">
      <span class="sc-un mono">${pad(i + 1)}</span>
      <div class="sc-ub"><div class="t-ink ellip"><i class="sc-dot ${spkClass(r.ch)}"></i> ${esc(r.ch.name)}</div><div class="t-sm t-mute ellip">${esc(meta)}</div></div>${charMark(c, r)}</div>`;
  }
  function railInner(c) {
    const { an } = c;
    const g = CR.progOf(c.p);
    const idx = new Map(an.rows.map((r, i) => [r.ch.id, i]));
    const need = an.known ? an.rows.filter((r) => r.needed) : an.rows;
    const rest = an.known ? an.rows.filter((r) => !r.needed) : [];
    const group = (title, list, testid, hint) => (list.length ? `<div class="cr-rail-g" data-testid="${testid}"><span class="eyebrow">${title}</span>${hint ? `<span class="t-sm t-mute">${hint}</span>` : ""}</div>${list.map((r) => railRow(c, r, idx.get(r.ch.id))).join("")}` : "");
    return `<div class="sc-rail-h"><span class="eyebrow">Nhân vật</span><span class="mono t-mute" data-testid="cr-rail-count">${g.done}/${g.total} đủ sheet</span></div>
      <div class="progress is-done sc-rail-pg"><i style="width:${g.total ? Math.round((g.done / g.total) * 100) : 0}%"></i></div>
      <div class="sc-units" role="tree" data-keep="cr-units" data-testid="cr-chars">
        ${an.known ? group("Cần cho kịch bản", need, "cr-grp-need") : `<div class="cr-rail-note t-sm t-mute" data-testid="cr-rail-note">Chưa có kịch bản nên chưa xác định được nhân vật cần thiết.</div>${need.map((r) => railRow(c, r, idx.get(r.ch.id))).join("")}`}
        ${group("Chưa thấy trong kịch bản", rest, "cr-grp-rest", "Có thể xuất hiện ở phần chưa có kịch bản")}
      </div>
      <button type="button" class="btn btn-sm btn-ghost sc-unit-add" data-testid="cr-char-add-btn" data-act="cr-char-add">${ic("plus")}Thêm nhân vật</button>`;
  }

  function bar(c) {
    const { p, an } = c;
    const todo = an.todo.filter((t) => t.sheet !== "draft").length;
    return U.bar(
      `<button class="btn btn-sm" data-testid="cr-back-btn" data-act="pj-back" data-id="${p.id}">${ic("arrow-left")}${esc(p.name)}</button>
       <span class="nv-ttl">${ic("user")}<span class="t-ink">Character</span></span>`,
      `<button class="btn btn-sm" data-testid="cr-suggest-btn" data-act="cr-suggest">${ic("spark")}Gợi ý prompt bằng AI</button>
       <button class="btn btn-sm btn-primary" data-testid="cr-gen-missing-btn" data-act="cr-gen-open" data-scope="missing" ${todo ? "" : "disabled"}>${ic("image")}${todo ? `Tạo ${todo} sheet còn thiếu` : "Đã đủ sheet"}</button>`,
    );
  }

  function sub(c) {
    const { e, ch, row, an } = c;
    const kb = !!CR.kbItem(ch.id);
    const i = an.rows.indexOf(row);
    return `<div class="tl-sub is-wrap cr-sub" data-testid="cr-sub">
      <span class="mono t-mute sc-sub-n">NHÂN VẬT ${pad(i + 1)}</span>
      <span class="t-ink cr-sub-t" data-testid="cr-sub-name"><i class="sc-dot ${spkClass(ch)}"></i> ${esc(ch.name)}</span>
      ${kb ? `<span class="badge badge-info" title="Lấy từ Knowledgebase">KB</span>` : `<span class="badge" title="Nhập thủ công">THỦ CÔNG</span>`}
      <span class="badge" data-testid="cr-outfit-count">${e.outfits.length} TRANG PHỤC</span>
      <span class="spacer"></span>
      <span class="t-sm t-mute" data-testid="cr-usage-note">${row.on.length ? `Cần cho ${row.on.length} ${unitWord(an)} trong kịch bản` : "Chưa có cảnh nào dùng"}</span></div>`;
  }

  function usedChips(c) {
    if (c.o.base) return "";
    const req = c.row.req.find((x) => x.o.id === c.o.id);
    if (!req) return `<span class="t-sm t-mute">Chưa có ${unitWord(c.an)} nào dùng trang phục này</span>`;
    return `<span class="eyebrow">Dùng ở</span>${req.cols.slice(0, 6).map((q) => `<span class="sc-ref" title="${esc(q.sub)}">${esc(q.label)}</span>`).join("")}${req.cols.length > 6 ? `<span class="sc-ref">+${req.cols.length - 6}</span>` : ""}`;
  }

  function sheetFrame(c) {
    const { o } = c;
    const s = o.sheet;
    const stt = sheetState(c);
    if (stt === "run") {
      const key = slotKey(c.p, c.ch, o);
      const pl = taskOf(key);
      const t = pl && pl.tasks.find((q) => q.key === key);
      return `<div class="cr-ph is-run" data-testid="cr-run-${o.id}"><span class="dot dot-running"></span><span class="t-sm">Đang tạo design sheet…</span>${pl ? `<div class="progress cr-run-pg" data-prog="${pl.id}|${key}"><i style="width:${Math.round(t ? t.progress : 0)}%"></i></div>` : ""}</div>`;
    }
    if (!s) {
      return `<div class="cr-ph" data-testid="cr-empty-${o.id}"><div class="cr-ghost" aria-hidden="true">${CR.VIEWS.map((v) => `<span class="mono">${v.tag}</span>`).join("")}</div>
        <span class="t-sm t-mute">${o.base ? "Chưa có Character sheet: nhân vật mặc áo thun ngắn và quần short trắng trơn." : "Chưa có design sheet của trang phục này."} Một ảnh dài gồm 4 góc: front, back, side, 3/4 nửa người.</span>
        <div class="cr-ph-act"><button type="button" class="btn btn-primary" data-testid="cr-gen-${o.id}" data-act="cr-gen-open" data-scope="outfit">${ic("spark")}Tạo bằng AI</button>
          <button type="button" class="btn" data-testid="cr-up-${o.id}" data-act="cr-up-open">${ic("upload")}Tải lên</button>
          <button type="button" class="btn" data-testid="cr-pick-${o.id}" data-act="cr-up-open" data-tab="lib">${ic("library")}Thư viện</button></div></div>`;
    }
    const btn = (act, icon, tip, extra = "") => `<button type="button" class="btn btn-icon btn-sm" data-testid="${act}-${o.id}" data-act="${act}" data-tip="${tip}" aria-label="${tip}" ${extra}>${ic(icon)}</button>`;
    return `${CR.slotThumb(c.e, o, s)}<div class="cr-sheet-tools" data-testid="cr-tools-${o.id}">${btn("cr-gen-open", s.src === "gen" ? "refresh" : "spark", "Tạo lại", `data-scope="outfit"`)}${btn("cr-up-open", "upload", "Thay bằng ảnh khác")}${btn("cr-approve", s.ok ? "unlock" : "check", s.ok ? "Bỏ duyệt" : "Duyệt")}${btn("cr-zoom", "eye", "Xem lớn")}${btn("cr-sheet-del", "trash", "Xóa sheet")}</div>`;
  }
  function sheetCard(c) {
    const { o } = c;
    const s = o.sheet;
    const stt = sheetState(c);
    return `<section class="cr-card cr-sheet" data-testid="cr-sheet-${o.id}">
      <header class="cr-card-h"><span class="eyebrow">${o.base ? "Character sheet" : "Design sheet · trang phục"}</span>${s ? `<span class="badge cr-src" title="Nguồn ảnh">${SRC_LABEL[s.src]}</span>` : ""}<span class="spacer"></span><span id="cr-sst-${o.id}">${badge(STATE_BADGE[stt], `cr-sheet-badge-${o.id}`)}</span></header>
      <div class="cr-sheetfr is-${stt}" data-testid="cr-sheetfr-${o.id}">${sheetFrame(c)}</div>
      <footer class="cr-sheet-f" data-testid="cr-sheet-foot-${o.id}">
        <button class="btn btn-primary" data-testid="cr-gen-btn-${o.id}" data-act="cr-gen-open" data-scope="outfit" ${stt === "run" ? "disabled" : ""}>${ic("spark")}${s ? "Tạo lại sheet" : o.base ? "Tạo Character sheet bằng AI" : "Tạo sheet bằng AI"}</button>
        <button class="btn" data-testid="cr-up-btn-${o.id}" data-act="cr-up-open">${ic("upload")}Tải lên</button>
        <button class="btn" data-testid="cr-approve-btn-${o.id}" data-act="cr-approve" ${s && !s.ok ? "" : "disabled"}>${ic("check")}Duyệt sheet</button>
        <button class="btn" data-testid="cr-save-lib-btn-${o.id}" data-act="cr-save-lib" ${s ? "" : "disabled"}>${ic("library")}Lưu vào thư viện</button></footer></section>`;
  }

  const fid = (f, o) => (f.scope === "char" ? f.k : `${o.id}-${f.k}`);
  function metaHtml(f, v) {
    if (!v.v) return `<span class="t-sm t-mute">Văn bản chưa mô tả. Nhập tay hoặc để AI đề xuất.</span>`;
    const s = CR.SRC[v.src];
    const act = v.src === "ai" ? `<button type="button" class="btn btn-sm" data-testid="cr-confirm-${f.k}" data-act="cr-confirm" data-k="${f.k}">${ic("check")}Xác nhận</button>` : "";
    return `<span class="badge ${s[0]}" title="${esc(s[2])}">${s[1]}</span>${v.ev.map((q) => U.ref(q)).join("")}${v.why ? `<span class="t-sm t-mute cr-why">${esc(v.why)}</span>` : ""}${act}`;
  }
  const rowCls = (v) => `cr-row ${v.src ? `is-${v.src}` : "is-missing"}`;
  const valueOf = (c, k) => (CR.CHAR_FIELDS.some((f) => f.k === k) ? c.e.profile[k] : c.o[k]);
  const fieldRow = (f, v, o) => `<div class="${rowCls(v)}" id="cr-row-${fid(f, o)}" data-testid="cr-row-${fid(f, o)}">
      <label for="cr-f-${fid(f, o)}">${esc(f.label)}</label>
      <input id="cr-f-${fid(f, o)}" class="input" data-testid="cr-input-${fid(f, o)}" value="${esc(v.v)}" placeholder="${esc(f.ph)}" data-change="cr-fld" data-k="${f.k}" autocomplete="off">
      <div class="cr-meta" id="cr-meta-${fid(f, o)}" data-testid="cr-meta-${fid(f, o)}">${metaHtml(f, v)}</div></div>`;
  const paletteRow = (c) => `<div class="cr-row ${c.o.palOk ? "is-user" : "is-missing"}" id="cr-row-${c.o.id}-palette" data-testid="cr-row-${c.o.id}-palette"><label>Bảng màu</label>
      <div class="cr-pal" data-testid="cr-pal-${c.o.id}">${c.o.palette.map((x, i) => `<label class="cr-sw" data-testid="cr-sw-${c.o.id}-${i}" title="${esc(x.n)}"><input type="color" data-testid="cr-sw-input-${c.o.id}-${i}" data-change="cr-pal" data-i="${i}" value="${esc(x.c)}"><span class="ellip">${esc(x.n)}</span></label>`).join("")}</div>
      <div class="cr-meta" id="cr-meta-${c.o.id}-palette" data-testid="cr-meta-${c.o.id}-palette"><span class="t-sm t-mute">${c.o.palOk ? "Bảng màu của trang phục này." : "Chưa chọn màu, đang dùng bảng màu trung tính."}</span></div></div>`;

  const profCount = (c) => `${CR.usedFields(c.e, c.o).length}/${CR.FIELDS.length} chi tiết`;
  function profileCard(c) {
    const { e, o, ch } = c;
    const item = CR.kbItem(ch.id);
    const body = o.base
      ? `<p class="t-sm t-mute" data-testid="cr-prof-intro">${item ? `AI đọc tóm tắt, thuộc tính và ${item.ev.length} dẫn chứng của “${esc(ch.name)}” trong Knowledgebase. Chỉ chi tiết văn bản nêu trực tiếp mới là “Văn bản”; phần còn lại là AI suy luận hoặc để trống.` : "Nhân vật này không có trong Knowledgebase. Hãy nhập những chi tiết bạn biết, AI sẽ soạn prompt từ đó."}</p>
         <div class="cr-sec-h" data-testid="cr-shared-h"><span class="eyebrow">Ngoại hình nhân vật</span><span class="t-sm t-mute">Dùng chung cho Character sheet và mọi trang phục</span></div>
         <div class="cr-rows" data-testid="cr-rows-char">${CR.CHAR_FIELDS.map((f) => fieldRow(f, e.profile[f.k], o)).join("")}</div>
         ${item ? `<details class="cr-kb" data-testid="cr-kb"><summary>Tóm tắt trong Knowledgebase</summary><p class="t-sm">${esc(item.summary)}</p><div class="cr-kb-act"><button class="btn btn-sm" data-testid="cr-open-kb-btn" data-act="cr-open-kb">${ic("graph")}Mở Knowledgebase</button></div></details>` : ""}`
      : `<p class="t-sm t-mute" data-testid="cr-shared-note-${o.id}">Ngoại hình lấy từ Character sheet. Ở đây chỉ mô tả phần trang phục.</p>
         <div class="cr-rows" data-testid="cr-rows-outfit-${o.id}">${CR.OUTFIT_FIELDS.map((f) => fieldRow(f, o[f.k], o)).join("")}${paletteRow(c)}</div>`;
    return `<section class="cr-card cr-profile" data-testid="cr-profile-${o.id}">
      <header class="cr-card-h"><span class="eyebrow">${o.base ? "Hồ sơ ngoại hình trích từ KB" : "Hồ sơ trang phục"}</span><span class="mono t-mute" id="cr-pn-${o.id}" data-testid="cr-prof-count-${o.id}">${profCount(c)}</span><span class="spacer"></span>
        <button class="btn btn-sm" data-testid="cr-read-kb-btn-${o.id}" data-act="cr-suggest">${ic("spark")}Đọc KB và gợi ý</button></header>
      ${body}</section>`;
  }

  const promptHead = (c) => `<div class="cr-prompt-h" id="cr-prompt-h-${c.o.id}" data-testid="cr-prompt-h-${c.o.id}"><span class="badge ${c.o.prompt.edited ? "badge-warning" : "badge-success"}" data-testid="cr-prompt-mode-${c.o.id}">${c.o.prompt.edited ? "ĐÃ SỬA TAY" : "TỰ ĐỘNG TỪ HỒ SƠ"}</span><span class="spacer"></span>
      <button class="btn btn-sm" data-testid="cr-recompose-btn-${c.o.id}" data-act="cr-recompose" ${c.o.prompt.edited ? "" : "disabled"}>${ic("refresh")}Soạn lại từ hồ sơ</button></div>`;
  function promptFoot(c) {
    const { e, o } = c;
    const used = CR.usedFields(e, o);
    const count = (k) => used.filter(([, v]) => v.src === k).length;
    const bits = ["text", "claim", "ai", "user"].filter(count).map((k) => `<span class="badge ${CR.SRC[k][0]}">${count(k)} ${CR.SRC[k][1].toLowerCase()}</span>`).join("");
    const gaps = CR.gaps(e, o);
    return `<div id="cr-prompt-foot-${o.id}" data-testid="cr-prompt-foot-${o.id}">
      <div class="cr-legend" data-testid="cr-legend-${o.id}"><span class="eyebrow">Chi tiết trong prompt</span>${bits || `<span class="t-sm t-mute">Chưa có chi tiết nào</span>`}${gaps.length ? `<span class="t-sm t-mute" title="${esc(gaps.map((g) => g.label).join(", "))}">Thiếu ${gaps.length}</span>` : ""}</div></div>`;
  }
  function promptCard(c) {
    const { o } = c;
    return `<section class="cr-card cr-prompt" data-testid="cr-prompt-${o.id}">
      <header class="cr-card-h"><span class="eyebrow">${o.base ? "Prompt Character sheet" : "Prompt tạo sheet"}</span><span class="cr-layout" data-testid="cr-layout-${o.id}" title="Sheet là một ảnh dài gồm 4 góc">${CR.VIEWS.map((v) => `<span class="sc-ref" title="${esc(v.label)}">${v.tag}</span>`).join("")}</span><span class="spacer"></span>
        <button class="btn btn-sm" data-testid="cr-copy-btn-${o.id}" data-act="cr-copy">${ic("copy")}Sao chép</button>
        <button class="btn btn-sm" data-testid="cr-save-prompt-btn-${o.id}" data-act="cr-save-prompt">${ic("prompt")}Lưu vào thư viện</button></header>
      <div class="cr-box" data-testid="cr-prompt-box-${o.id}">${promptHead(c)}
        <textarea id="cr-prompt-${o.id}" class="textarea cr-ta" data-testid="cr-prompt-input-${o.id}" rows="7" data-change="cr-prompt" aria-label="Prompt">${esc(o.prompt.text)}</textarea>${promptFoot(c)}</div></section>`;
  }

  const styleName = (s) => (s.lib && LB.state.assets.some((x) => x.type === "prompt" && x.name === s.lib) ? `${s.name} · từ Prompts` : s.name);
  function commonCard(c) {
    const { st } = c;
    return `<section class="cr-card cr-common" data-testid="cr-common"><header class="cr-card-h"><span class="eyebrow">Thiết lập chung của project</span><span class="t-sm t-mute">Áp dụng cho mọi nhân vật để các sheet cùng một phong cách</span></header>
      <div class="cr-common-g">
        <div class="field"><label for="cr-style">Phong cách</label><select id="cr-style" class="select" data-testid="cr-style-select" data-change="cr-style">${U.options(CR.STYLES.map((s) => [s.id, styleName(s)]), st.style)}</select></div>
        <div class="field"><label for="cr-prov">Công cụ tạo ảnh</label><select id="cr-prov" class="select" data-testid="cr-prov-select" data-change="cr-prov">${U.options(CR.PROVIDERS.map((q) => [q.id, q.ok ? q.name : `${q.name} (chưa cài)`, !q.ok]), st.prov)}</select></div>
        <div class="field cr-common-neg"><label for="cr-neg">Negative prompt</label><input id="cr-neg" class="input" data-testid="cr-neg-input" value="${esc(st.neg)}" data-change="cr-neg" autocomplete="off"></div></div>
      <label class="check" data-testid="cr-lock"><input type="checkbox" data-testid="cr-lock-input" data-change="cr-lock" ${st.lock ? "checked" : ""}><span>Giữ seed của sheet cũ khi tạo lại để hình dáng nhân vật ổn định</span></label></section>`;
  }

  function osecHead(c, o) {
    const cq = { ...c, o };
    const stt = sheetState(cq);
    const st = `<span id="cr-ost-${o.id}">${badge(STATE_BADGE[stt], `cr-status-${o.id}`)}</span>`;
    if (o.base) {
      return `<header class="cr-osec-h" data-testid="cr-osec-h-${o.id}"><span class="cr-osec-i">${ic("user")}</span><div class="cr-osec-t"><div class="t-ink">Character sheet</div><div class="t-sm t-mute">Nhân vật mặc áo thun ngắn và quần short trắng trơn, làm gốc ngoại hình cho mọi trang phục</div></div>${st}</header>`;
    }
    const can = c.e.outfits.length > 1 && !c.row.req.some((x) => x.o.id === o.id);
    return `<header class="cr-osec-h" data-testid="cr-osec-h-${o.id}"><span class="cr-osec-i">${ic("shirt")}</span>
        <input class="input cr-oname" id="cr-oname-${o.id}" data-testid="cr-oname-input-${o.id}" value="${esc(o.name)}" data-change="cr-oname" autocomplete="off" aria-label="Tên trang phục">
        ${st}<span class="cr-used" data-testid="cr-used-${o.id}">${usedChips(cq)}</span><span class="spacer"></span>
        <button type="button" class="btn btn-icon btn-sm" data-testid="cr-odel-${o.id}" data-act="cr-outfit-del" data-v="${o.id}" ${can ? "" : "disabled"} data-tip="${can ? "Xóa trang phục" : c.e.outfits.length < 2 ? "Phải còn ít nhất một trang phục" : "Đang được kịch bản dùng"}" aria-label="Xóa trang phục">${ic("trash")}</button></header>`;
  }
  function outfitSection(c, o) {
    const cq = { ...c, o };
    return `<section class="cr-osec ${o.base ? "is-base" : ""} ${c.e.sel === o.id ? "is-sel" : ""}" id="cr-osec-${o.id}" data-outfit-sec="${o.id}" data-testid="cr-osec-${o.id}">
      ${osecHead(c, o)}
      ${sheetCard(cq)}${promptCard(cq)}${profileCard(cq)}</section>`;
  }
  function suggCard(c) {
    const list = c.an.sugg.filter((g) => g.row.ch.id === c.ch.id);
    if (!list.length) return "";
    return `<section class="cr-card" data-testid="cr-sugg"><header class="cr-card-h"><span class="eyebrow">AI gợi ý trang phục từ kịch bản</span><span class="mono t-mute">${list.length}</span></header>
      ${list.map((g) => `<div class="cr-sugg" data-testid="cr-sugg-${g.id}"><span class="cr-sugg-i">${ic("spark")}</span>
        <div class="cr-sugg-b"><div class="t-ink">Thêm “${esc(g.name)}” cho ${esc(g.cols.map((q) => q.label).join(", "))}</div><div class="t-sm t-mute">${esc(g.why)}</div><div class="t-sm">${esc(g.garment.v)} <span class="badge badge-warning">AI suy luận</span></div></div>
        <button class="btn btn-sm btn-primary" data-testid="cr-sugg-accept-${g.id}" data-act="cr-sugg-accept" data-id="${g.id}">${ic("check")}Chấp nhận</button><button class="btn btn-sm btn-ghost" data-testid="cr-sugg-skip-${g.id}" data-act="cr-sugg-skip" data-id="${g.id}">Bỏ qua</button></div>`).join("")}</section>`;
  }
  function sheetsBody(c) {
    return `<div class="cr-page" data-testid="cr-sheets">${commonCard(c)}${outfitSection(c, c.e.base)}${suggCard(c)}
      <div class="cr-sec-title" data-testid="cr-outfits-h"><span class="eyebrow">Trang phục</span><span class="mono t-mute">${c.e.outfits.length}</span><span class="t-sm t-mute">Mỗi trang phục là một card riêng, có design sheet và prompt riêng</span></div>
      ${c.e.outfits.map((o) => outfitSection(c, o)).join("")}
      <button type="button" class="cr-add-o" data-testid="cr-outfit-add-btn" data-act="cr-outfit-add">${ic("plus")}<span>Thêm trang phục cho ${esc(c.ch.name)}</span></button></div>`;
  }

  function render(p) {
    const c = ctx(p);
    if (!c.ch) {
      return `<div class="nv" data-testid="cr-root">${U.bar(`<button class="btn btn-sm" data-testid="cr-back-btn" data-act="pj-back" data-id="${p.id}">${ic("arrow-left")}${esc(p.name)}</button><span class="nv-ttl">${ic("user")}<span class="t-ink">Character</span></span>`)}
        <div class="nv-body">${U.empty("Project chưa có nhân vật", "Nhân vật được lấy từ Knowledgebase của novel và danh sách nhân vật trong Scripting. Bạn cũng có thể thêm thủ công.", `<div class="empty-act"><button class="btn btn-primary" data-testid="cr-empty-add-btn" data-act="cr-char-add">${ic("plus")}Thêm nhân vật</button>${p.novel ? `<button class="btn" data-testid="cr-empty-kb-btn" data-act="cr-open-kb">${ic("graph")}Mở Knowledgebase</button>` : ""}</div>`)}</div></div>`;
    }
    return `<div class="nv" data-testid="cr-root">${bar(c)}
      <div class="nv-body">
        <aside class="sc-rail" id="cr-rail-in" data-testid="cr-rail" aria-label="Danh sách nhân vật">${railInner(c)}</aside>
        <div class="sc-main" data-testid="cr-main">${sub(c)}
          <div class="sc-scroll cr-scroll" data-keep="cr-sheets" data-testid="cr-scroll">${sheetsBody(c)}</div></div>
      </div></div>`;
  }

  function paintOutfit(c, o) {
    const cq = { ...c, o };
    const rep = (sel, html) => { const el = A.$(sel); if (el) el.outerHTML = html; };
    rep(`#cr-prompt-h-${o.id}`, promptHead(cq));
    rep(`#cr-prompt-foot-${o.id}`, promptFoot(cq));
    const ta = A.$(`#cr-prompt-${o.id}`);
    if (ta && document.activeElement !== ta) ta.value = o.prompt.text;
    const set = (sel, html) => { const el = A.$(sel); if (el) el.innerHTML = html; };
    set(`#cr-pn-${o.id}`, profCount(cq));
    set(`#cr-ost-${o.id}`, badge(STATE_BADGE[sheetState(cq)], `cr-status-${o.id}`));
    set(`#cr-sst-${o.id}`, badge(STATE_BADGE[sheetState(cq)], `cr-sheet-badge-${o.id}`));
  }
  function paint(c, k) {
    if (k) {
      const f = CR.FIELDS.find((q) => q.k === k);
      const id = f ? fid(f, c.o) : `${c.o.id}-${k}`;
      const v = f ? valueOf(c, k) : null;
      const m = A.$(`#cr-meta-${id}`);
      if (m && f) m.innerHTML = metaHtml(f, v);
      const row = A.$(`#cr-row-${id}`);
      if (row && f) row.className = rowCls(v);
    }
    CR.all(c.e).forEach((q) => paintOutfit(c, q));
    const set = (sel, html) => { const el = A.$(sel); if (el) el.innerHTML = html; };
    set("#cr-rail-in", railInner(c));
    A.renderInspector();
  }

  function goto(id) {
    const el = A.$(`#cr-osec-${id}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function mount() {
    const c = activeCtx();
    if (!c || !c.x.scrollTo) return;
    const id = c.x.scrollTo;
    c.x.scrollTo = null;
    setTimeout(() => goto(id), 0);
  }

  const CRV = window.CRV = {
    ctx, activeCtx, ui, sync, syncP, refresh, paint, log, sheetState, slotKey, isGen, taskOf, anyGen, badge, spkClass, unitWord, STATE_BADGE, SRC_LABEL, valueOf, metaHtml, railInner, byP, goto,
  };

  PJ.modViews = PJ.modViews || {};
  PJ.modViews.character = { render, mount, inspector: (p) => (CRV.inspector ? CRV.inspector(ctx(p)) : "") };

  function profileChanged(c, k) {
    CR.all(c.e).forEach((q) => CR.recompose(c.p, c.e, q));
    sync(c);
    paint(c, k);
  }
  CRV.profileChanged = profileChanged;

  const focusOutfit = (ev) => {
    const sec = ev.target.closest && ev.target.closest("[data-outfit-sec]");
    const id = A.S.active;
    if (!sec || !/^pmod:[^:]+:character$/.test(id)) return;
    const p = byP(id.split(":")[1]);
    const e = p && CR.of(p).chars[ui(p.id).char];
    if (!e || e.sel === sec.dataset.outfitSec || !CR.all(e).some((q) => q.id === sec.dataset.outfitSec)) return;
    e.sel = sec.dataset.outfitSec;
    A.$$("#editor .cr-osec").forEach((el) => el.classList.toggle("is-sel", el.dataset.outfitSec === e.sel));
    A.renderInspector();
  };
  ["click", "focusin", "change"].forEach((t) => document.addEventListener(t, focusOutfit, true));

  Object.assign(A.ACT, {
    "cr-char": (el) => { const c = activeCtx(); if (!c) return; c.x.char = el.dataset.id; refresh(); },
    "cr-outfit-goto": (el) => {
      const c = activeCtx();
      if (!c) return;
      c.e.sel = el.dataset.v;
      A.$$("#editor .cr-osec").forEach((q) => q.classList.toggle("is-sel", q.dataset.outfitSec === c.e.sel));
      A.renderInspector();
      goto(el.dataset.v);
    },
    "cr-approve": (el, ev) => {
      ev?.stopPropagation();
      const c = activeCtx();
      if (!c || !c.o.sheet) return;
      c.o.sheet.ok = !c.o.sheet.ok;
      if (c.o.sheet.ok) log(c, `Duyệt sheet ${c.ch.name} · ${c.o.name}`);
      sync(c);
      refresh();
      if (c.o.sheet.ok) A.toast(`Đã duyệt sheet “${c.ch.name} · ${c.o.name}”.`);
    },
    "cr-sheet-del": (el, ev) => {
      ev?.stopPropagation();
      const c = activeCtx();
      if (!c || !c.o.sheet) return;
      c.o.sheet = null;
      sync(c);
      refresh();
      A.toast("Đã xóa design sheet.", "warning");
    },
    "cr-confirm": (el) => {
      const c = activeCtx();
      const v = c && valueOf(c, el.dataset.k);
      if (!v || v.src !== "ai") return;
      v.src = "user";
      profileChanged(c, el.dataset.k);
    },
    "cr-recompose": () => {
      const c = activeCtx();
      if (!c) return;
      c.o.prompt.edited = false;
      CR.recompose(c.p, c.e, c.o);
      paint(c);
    },
    "cr-open-kb": () => { const c = activeCtx(); if (c && c.p.novel) U.openNovelTab("knowledge", c.p.novel); },
    "cr-copy": () => {
      const c = activeCtx();
      if (!c) return;
      const fail = () => A.toast("Không sao chép được vào clipboard.", "warning");
      if (!navigator.clipboard) { fail(); return; }
      navigator.clipboard.writeText(c.o.prompt.text).then(() => A.toast("Đã sao chép prompt."), fail);
    },
    "cr-sugg-accept": (el) => {
      const c = activeCtx();
      const g = c && c.an.sugg.find((q) => q.id === el.dataset.id);
      if (!g) return;
      const o = CR.accept(c.p, g);
      log(c, `Thêm trang phục “${o.name}” cho ${g.row.ch.name}`);
      sync(c);
      refresh();
      A.toast(`Đã thêm trang phục “${o.name}” cho ${g.row.ch.name}.`);
    },
    "cr-sugg-skip": (el) => { const c = activeCtx(); if (!c) return; c.st.dismissed.push(el.dataset.id); refresh(); },
  });

  Object.assign(A.ON, {
    "cr-fld": (el) => {
      const c = activeCtx();
      const k = el.dataset.k;
      const v = c && valueOf(c, k);
      if (!v) return;
      const text = el.value.trim();
      if (text === v.v) return;
      Object.assign(v, text ? { v: text, en: "", src: "user", ev: [], why: "" } : { v: "", en: "", src: "", ev: [], why: "" });
      profileChanged(c, k);
    },
    "cr-pal": (el) => {
      const c = activeCtx();
      if (!c) return;
      c.o.palette[Number(el.dataset.i)] = { n: el.value, en: el.value, c: el.value };
      c.o.palOk = true;
      const row = A.$(`#cr-row-${c.o.id}-palette`);
      if (row) row.className = "cr-row is-user";
      profileChanged(c, "palette");
    },
    "cr-prompt": (el) => {
      const c = activeCtx();
      if (!c || el.value === c.o.prompt.text) return;
      c.o.prompt.text = el.value;
      c.o.prompt.edited = el.value !== c.o.prompt.auto;
      c.o.prompt.seen = c.o.prompt.auto;
      paint(c);
    },
    "cr-neg": (el) => { const c = activeCtx(); if (c) c.st.neg = el.value.trim(); },
    "cr-style": (el) => {
      const c = activeCtx();
      if (!c) return;
      c.st.style = el.value;
      Object.values(c.st.chars).forEach((e) => CR.all(e).forEach((o) => CR.recompose(c.p, e, o)));
      sync(c);
      refresh();
    },
    "cr-prov": (el) => { const c = activeCtx(); if (c) c.st.prov = el.value; },
    "cr-lock": (el) => { const c = activeCtx(); if (c) c.st.lock = el.checked; },
  });
})();
