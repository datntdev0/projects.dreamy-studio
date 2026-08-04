(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const SC = window.SC;
  const U = window.NVU;
  const LB = window.LB;
  const { esc, ic } = A;
  const T = SC.TYPES;

  const byP = (id) => PJ.state.projects.find((p) => p.id === id);
  const ui = (pid) => (SC.ui[pid] ||= { unit: null, collapsed: {}, sel: null, drawer: false, focus: null, goto: null });
  const opts = (list, cur) => U.options(list.map((v) => (Array.isArray(v) ? v : [v, v])), cur);
  const fmt = U.fmt;
  const pad = (n) => String(n).padStart(2, "0");
  const find = (u, id) => (u.blocks || []).find((b) => b.id === id);
  const spk = (s, id) => s.cast.find((x) => x.id === id);
  const spkClass = (sp) => (sp ? (sp.kind === "narrator" ? "spk-n" : `spk-${sp.c % 6}`) : "spk-x");
  const dur = (secs) => LB.dur(Math.round(secs));
  const chLabel = (u) => { const cs = SC.chaptersOf(u); return cs.length ? `Ch.${cs[0]}${cs.length > 1 ? `–${cs[cs.length - 1]}` : ""}` : "Chưa chọn chương"; };

  function srcOf(p, u) {
    const list = u ? SC.sourceRange(p, u) : null;
    return list ? { list, map: Object.fromEntries(list.map((q) => [q.id, q.t])) } : null;
  }
  function ctx(p) {
    const s = SC.scriptOf(p);
    const x = ui(p.id);
    if (s.choose) return { p, s, x, cfg: s.cfg, choose: true };
    SC.syncCast(p, s);
    let u = s.units.find((q) => q.id === x.unit);
    if (!u) { u = s.units.find((q) => q.status !== "locked") || s.units[0]; x.unit = u.id; }
    return { p, s, x, u, cfg: s.cfg, locked: u.status === "locked", src: srcOf(p, u) };
  }
  const activeCtx = () => {
    const id = A.S.active;
    if (!/^pmod:[^:]+:scripting$/.test(id)) return null;
    const p = byP(String(id).split(":")[1]);
    return p ? ctx(p) : null;
  };

  const isStale = (c, b) => !!(b.ref && c.src && c.src.map[b.ref] !== undefined && b.snap != null && c.src.map[b.ref] !== b.snap);
  const staleRefs = (c, u = c.u) => {
    const src = u === c.u ? c.src : srcOf(c.p, u);
    if (!src || !u.blocks) return [];
    return [...new Set(u.blocks.filter((b) => b.ref && b.snap != null && src.map[b.ref] !== undefined && src.map[b.ref] !== b.snap).map((b) => b.ref))];
  };
  const uncovered = (c) => {
    if (!c.src || !c.u.blocks) return [];
    const have = new Set(c.u.blocks.map((b) => b.ref).filter(Boolean));
    return c.src.list.filter((q) => !have.has(q.id));
  };
  const taskKeys = (c, u = c.u) => A.PL.list.filter((pl) => pl.kind === "script" && pl.status === "running").flatMap((pl) => pl.tasks.filter((t) => t.status !== "done" && t.key.startsWith(`${c.p.id}|${u.id}|`)).map((t) => t.key));
  const generating = (c, u = c.u) => taskKeys(c, u).length > 0;
  const sceneBusy = (c, id) => taskKeys(c).includes(`${c.p.id}|${c.u.id}|${id}`);

  function scenes(c) {
    const bl = c.u.blocks || [];
    const out = [];
    bl.forEach((b, i) => { if (b.type === "scene") out.push({ b, i, n: out.length + 1 }); });
    out.forEach((x, k) => { x.to = k + 1 < out.length ? out[k + 1].i : bl.length; x.body = bl.slice(x.i + 1, x.to); });
    return out;
  }

  function metrics(s, u) {
    const out = { blocks: 0, words: 0, pause: 0, scenes: 0, lines: 0, byWho: {}, byType: {} };
    const narr = (s.cast.find((x) => x.kind === "narrator") || {}).id || "narr";
    (u.blocks || []).forEach((b) => {
      out.blocks++;
      out.byType[b.type] = (out.byType[b.type] || 0) + 1;
      if (b.type === "pause") out.pause += b.ms / 1000;
      if (b.type === "scene") out.scenes++;
      if (b.type === "dialogue") out.lines++;
      if (SC.SPOKEN.includes(b.type)) {
        const n = SC.words(b.text);
        out.words += n;
        const k = b.type === "dialogue" ? b.who || "?" : b.type === "narration" || b.type === "heading" ? narr : "";
        if (k) out.byWho[k] = (out.byWho[k] || 0) + n;
      }
    });
    out.secs = out.words / 2.5 + out.pause;
    return out;
  }

  function issues(c) {
    const { u, cfg } = c;
    const out = [];
    if (!u.blocks || !u.blocks.length) return [{ k: "none", lv: "error", text: `${cfg.unit} chưa có nội dung.` }];
    const seen = new Set();
    u.blocks.forEach((b) => {
      const t = T[b.type];
      if (t.text && b.type !== "note" && !b.text.trim()) out.push({ k: "empty", lv: "error", id: b.id, text: `Khối ${t.label.toLowerCase()} đang trống.` });
      if (b.type === "dialogue" && cfg.speakers && !b.who) out.push({ k: "who", lv: "error", id: b.id, text: "Hội thoại chưa gán nhân vật." });
      if (b.type === "scene" && !b.loc.trim()) out.push({ k: "scene", lv: "error", id: b.id, text: "Phân cảnh chưa có bối cảnh." });
      if (isStale(c, b) && !seen.has(b.ref)) { seen.add(b.ref); out.push({ k: "stale", lv: "warn", id: b.id, text: `Đoạn nguồn ¶${b.ref.split(".")[1]} đã đổi sau khi lập kịch bản.` }); }
    });
    if (cfg.source) uncovered(c).forEach((q) => out.push({ k: "uncovered", lv: "warn", ref: q.id, text: `Đoạn nguồn ¶${q.id.split(".")[1]} chưa có lời đọc.` }));
    if (cfg.types.includes("scene") && !scenes(c).length) out.push({ k: "noscene", lv: "warn", text: "Chưa có phân cảnh nào." });
    return out;
  }

  const touch = (c) => { c.u.updated = A.stamp(); c.p.updated = A.stamp(); };
  const refresh = () => A.rerender();

  function insert(c, after, type, extra = {}) {
    const prev = [...c.u.blocks].reverse().find((b) => b.type === "dialogue" && b.who);
    const sameRow = after && after.ref && !["heading", "pause"].includes(type);
    const b = SC.mk(c.s, type, { who: type === "dialogue" ? (prev ? prev.who : SC.firstChar(c.s)) : "", ref: sameRow ? after.ref : null, snap: sameRow ? after.snap : null, ...extra });
    const i = after ? c.u.blocks.indexOf(after) + 1 : c.u.blocks.length;
    c.u.blocks.splice(i, 0, b);
    touch(c);
    c.x.sel = b.id;
    c.x.focus = b.id;
    refresh();
    return b;
  }
  function remove(c, b) {
    const i = c.u.blocks.indexOf(b);
    c.u.blocks.splice(i, 1);
    const near = c.u.blocks[Math.max(0, i - 1)];
    c.x.sel = near ? near.id : null;
    c.x.focus = near && T[near.type].text ? near.id : null;
    touch(c);
    refresh();
  }
  function setType(c, b, type) {
    b.type = type;
    if (type === "dialogue" && !b.who) b.who = SC.firstChar(c.s);
    if (type === "pause" && !b.ms) b.ms = 800;
    touch(c);
    c.x.focus = T[type].text ? b.id : null;
    refresh();
  }

  const statusBadge = (c, u) => {
    if (generating(c, u)) return `<span class="badge badge-running" data-testid="sc-status-${u.id}">ĐANG TẠO</span>`;
    const [label, cls] = { locked: ["ĐÃ CHỐT", "badge-success"], review: ["CẦN RÀ SOÁT", "badge-warning"], draft: ["BẢN NHÁP", ""] }[u.status];
    return `<span class="badge ${cls}" data-testid="sc-status-${u.id}">${label}</span>`;
  };

  function railInner(c) {
    const { s, cfg, u: cur } = c;
    const done = s.units.filter((q) => q.status === "locked").length;
    const rows = s.units.map((q) => {
      const m = q.blocks ? metrics(s, q) : null;
      const meta = cfg.ranges
        ? `${chLabel(q)} · ${m ? `${m.scenes} cảnh` : q.meta ? `${q.meta.blocks} khối` : "chưa lập"}`
        : m ? `${m.blocks} khối · ${fmt(m.words)} từ` : q.meta ? `${q.meta.blocks} khối · ${fmt(q.meta.words)} từ` : "Chưa lập";
      const stale = staleRefs(c, q).length;
      const mark = q.status === "locked" ? `<span class="sc-mk is-ok" title="Đã chốt">${ic("lock")}</span>` : stale ? `<span class="sc-mk is-warn" title="Nguồn đã đổi">${ic("alert")}</span>` : q.status === "review" ? `<span class="dot dot-warning" title="Cần rà soát"></span>` : `<span class="dot-o" title="Bản nháp"></span>`;
      return `<div class="sc-unit ${q.id === cur.id ? "is-active" : ""}" data-testid="sc-unit-${q.id}" tabindex="0" role="treeitem" data-act="sc-unit" data-id="${q.id}">
          <span class="sc-un mono">${pad(q.no)}</span>
          <div class="sc-ub"><div class="t-ink ellip">${esc(q.title || `${cfg.unit} ${q.no}`)}</div><div class="t-sm t-mute ellip">${meta}</div></div>${mark}</div>`;
    }).join("");
    return `<div class="sc-rail-h"><span class="eyebrow">${esc(cfg.unit)}</span><span class="mono t-mute" data-testid="sc-rail-count">${done}/${s.units.length} đã chốt</span></div>
      <div class="progress is-done sc-rail-pg"><i style="width:${s.units.length ? Math.round((done / s.units.length) * 100) : 0}%"></i></div>
      <div class="sc-units" role="tree" data-keep="sc-units">${rows}</div>
      ${cfg.freeUnits ? `<button type="button" class="btn btn-sm btn-ghost sc-unit-add" data-testid="sc-unit-add-btn" data-act="sc-unit-add">${ic("plus")}Thêm ${esc(cfg.unit.toLowerCase())}</button>` : ""}`;
  }

  function statsHtml(c) {
    const m = metrics(c.s, c.u);
    const bits = [`${m.blocks} khối`, `${fmt(m.words)} từ`, `≈ ${dur(m.secs)}`];
    if (c.cfg.types.includes("scene")) bits.push(`${scenes(c).length} cảnh`);
    if (c.cfg.source && c.src) bits.push(`${c.src.list.length - uncovered(c).length}/${c.src.list.length} đoạn nguồn`);
    return bits.map((x) => `<span>${x}</span>`).join("");
  }

  const hasDefault = (c) => c.cfg.types.includes("narration") && !!c.src;

  function bar(c) {
    const { p, cfg } = c;
    const pr = SC.PRESETS[cfg.preset];
    return U.bar(
      `<button class="btn btn-sm" data-testid="sc-back-btn" data-act="pj-back" data-id="${p.id}">${ic("arrow-left")}${esc(p.name)}</button>
       <span class="nv-ttl">${ic("pen")}<span class="t-ink">Scripting</span><span class="badge badge-primary" data-testid="sc-preset-badge" title="${esc(pr.label)}">${pr.short}</span></span>`,
      `${c.locked ? "" : `<button class="btn btn-sm" data-testid="sc-draft-btn" data-act="sc-draft">${ic("spark")}Tạo bản nháp</button>`}
       ${c.locked ? `<button class="btn btn-sm" data-testid="sc-unlock-btn" data-act="sc-unlock">${ic("unlock")}Mở khóa</button>` : `<button class="btn btn-sm btn-primary" data-testid="sc-lock-btn" data-act="sc-check">${ic("shield")}Kiểm tra và chốt</button>`}`,
    );
  }

  function sub(c) {
    const { u, cfg, src, p } = c;
    const max = (U.novelById(p.novel) || {}).chapters || 99;
    const chs = cfg.ranges
      ? `<span class="sc-chs" data-testid="sc-chs">Chương<input class="input" type="number" min="1" max="${max}" data-testid="sc-chs-from" value="${u.chs ? u.chs[0] : ""}" data-change="sc-chs" data-f="0" ${c.locked || !p.novel ? "disabled" : ""} aria-label="Từ chương">–<input class="input" type="number" min="1" max="${max}" data-testid="sc-chs-to" value="${u.chs ? u.chs[1] : ""}" data-change="sc-chs" data-f="1" ${c.locked || !p.novel ? "disabled" : ""} aria-label="Đến chương"></span>`
      : "";
    const title = cfg.preset === "audiobook"
      ? `<span class="t-ink sc-title-ro" data-testid="sc-unit-title">${esc(u.title || `${cfg.unit} ${u.no}`)}</span>`
      : `<input class="input sc-title" data-testid="sc-unit-title" value="${esc(u.title)}" placeholder="Tên ${esc(cfg.unit.toLowerCase())}" data-change="sc-unit-title" ${c.locked ? "disabled" : ""} aria-label="Tên ${esc(cfg.unit.toLowerCase())}">`;
    const grouped = cfg.source && src && u.blocks;
    const anyOpen = grouped && src.list.some((q) => !c.x.collapsed[q.id]);
    return `<div class="tl-sub is-wrap sc-sub" id="sc-sub" data-testid="sc-sub">
      <span class="mono t-mute sc-sub-n">${esc(cfg.unit.toUpperCase())} ${pad(u.no)}</span>${title}
      <span id="sc-status">${statusBadge(c, u)}</span>${chs}
      <span class="sc-stats mono" id="sc-stats" data-testid="sc-stats">${u.blocks ? statsHtml(c) : ""}</span>
      <span class="spacer"></span>
      ${grouped ? `<button class="btn btn-sm" data-testid="sc-grp-all-btn" data-act="sc-grp-all">${ic(anyOpen ? "chev-r" : "chev-d")}${anyOpen ? "Thu gọn tất cả" : "Mở rộng tất cả"}</button>` : ""}
      ${cfg.ranges && src ? `<button class="btn btn-sm ${c.x.drawer ? "is-active" : ""}" data-testid="sc-drawer-btn" data-act="sc-drawer" aria-pressed="${c.x.drawer}">${ic("book")}Nguồn</button>` : ""}
      ${u.blocks && !c.locked ? addBar(c) : ""}
    </div>`;
  }

  function banners(c) {
    const { u, locked, src, p } = c;
    const out = [];
    if (generating(c)) out.push(`<div class="sc-ban is-run" data-testid="sc-ban-run"><span class="dot dot-running"></span><span>AI đang làm việc cho ${esc(c.cfg.unit.toLowerCase())} này. Xem tiến độ ở panel Pipelines.</span></div>`);
    if (locked) out.push(`<div class="sc-ban is-ok" data-testid="sc-ban-locked">${ic("lock")}<span>Đã chốt. Các module sản xuất dùng đúng bản này; muốn sửa, hãy mở khóa.</span></div>`);
    const n = u.blocks ? staleRefs(c).length : 0;
    if (n && (!c.cfg.source || !src)) out.push(`<div class="sc-ban is-warn" data-testid="sc-ban-stale">${ic("alert")}<span>${n} đoạn nguồn đã đổi sau khi lập kịch bản.</span></div>`);
    if (c.cfg.ranges && !u.meta && !locked) {
      const chs = SC.chaptersOf(u);
      const miss = SC.kbMissing(p, chs);
      if (!p.novel) out.push(`<div class="sc-ban is-info" data-testid="sc-ban-kb">${ic("info")}<span>Project không gắn novel nên chưa dùng được Knowledgebase. Bạn vẫn có thể viết tay.</span></div>`);
      else if (!SC.kbAvail(p)) out.push(`<div class="sc-ban is-info" data-testid="sc-ban-kb">${ic("info")}<span>Novel này chưa có Knowledgebase trong prototype nên nhân vật và địa điểm không có gợi ý.</span></div>`);
      else if (miss.length) out.push(`<div class="sc-ban is-warn" data-testid="sc-ban-kb">${ic("alert")}<span>Chương ${miss.join(", ")} chưa phân tích tri thức. Cần Knowledgebase để AI dựng danh sách cảnh.</span><button class="btn btn-sm" data-testid="sc-open-kb-btn" data-act="sc-open-kb">${ic("graph")}Mở Knowledgebase</button></div>`);
    }
    return out.join("");
  }

  const editable = (b, c, ph = "Nhập nội dung…") => `<div id="sc-t-${b.id}" class="sc-t" data-testid="sc-text-${b.id}" ${c.locked ? "" : `contenteditable="plaintext-only"`} data-on="sc-text" data-id="${b.id}" data-ph="${ph}" spellcheck="false" role="textbox" aria-multiline="true" aria-label="${esc(T[b.type].label)}">${esc(b.text)}</div>`;
  const whoBtn = (b, c) => {
    const sp = spk(c.s, b.who);
    return `<button type="button" class="sc-who ${spkClass(sp)}" data-testid="sc-who-btn-${b.id}" data-act="sc-who-menu" data-id="${b.id}" ${c.locked ? "disabled" : ""}><i></i><span>${esc(sp ? sp.name : "Chưa gán nhân vật")}</span>${ic("chev-d")}</button>`;
  };
  const parenIn = (b, c) => `<input class="sc-par" data-testid="sc-paren-${b.id}" value="${esc(b.paren)}" placeholder="sắc thái" data-change="sc-fld" data-id="${b.id}" data-f="paren" ${c.locked ? "disabled" : ""} aria-label="Sắc thái">`;
  const slug = (b, c) => `<div class="sc-slug" data-testid="sc-slug-${b.id}">
      <input class="sc-loc" list="sc-places" data-testid="sc-loc-${b.id}" value="${esc(b.loc)}" placeholder="BỐI CẢNH" data-change="sc-fld" data-id="${b.id}" data-f="loc" ${c.locked ? "disabled" : ""} aria-label="Bối cảnh">
      <span class="sc-dash">—</span>
      <select class="select sc-sel" data-testid="sc-time-${b.id}" data-change="sc-fld" data-id="${b.id}" data-f="time" ${c.locked ? "disabled" : ""} aria-label="Thời điểm">${opts(SC.TIMES, b.time)}</select></div>`;
  const pauseIn = (b, c) => `<div class="sc-pz" data-testid="sc-pause-${b.id}"><span>Nghỉ</span><input class="sc-num" type="number" min="0" max="30" step="0.1" value="${(b.ms / 1000).toFixed(1)}" data-change="sc-fld" data-id="${b.id}" data-f="ms" ${c.locked ? "disabled" : ""} aria-label="Số giây nghỉ"><span>giây</span></div>`;
  function tools(b, c) {
    if (c.locked) return "";
    const btn = (act, icon, tip) => `<button type="button" class="btn btn-icon btn-sm" data-testid="${act}-${b.id}" data-act="${act}" data-id="${b.id}" title="${tip}" aria-label="${tip}">${ic(icon)}</button>`;
    return `<div class="sc-tools" data-testid="sc-tools-${b.id}">${btn("sc-up", "arrow-up", "Lên")}${btn("sc-down", "arrow-down", "Xuống")}${btn("sc-dup", "copy", "Nhân bản")}${btn("sc-del", "trash", "Xóa")}</div>`;
  }

  function inner(b, c) {
    if (b.type === "dialogue" && c.cfg.speakers) return `<div class="sc-line">${whoBtn(b, c)}${parenIn(b, c)}</div>${editable(b, c, "Lời thoại…")}`;
    if (b.type === "pause") return pauseIn(b, c);
    if (b.type === "scene") return slug(b, c);
    return editable(b, c);
  }
  function blk(b, c) {
    const t = T[b.type];
    return `<div class="sc-blk is-${b.type} ${c.x.sel === b.id ? "is-sel" : ""} ${isStale(c, b) ? "is-stale" : ""}" data-testid="sc-blk-${b.id}" data-id="${b.id}">
      <button type="button" class="sc-gut" data-testid="sc-type-btn-${b.id}" data-act="sc-type-menu" data-id="${b.id}" ${c.locked ? "disabled" : ""} title="${esc(t.label)} · đổi loại" aria-label="Loại khối: ${esc(t.label)}">${ic(t.icon)}<span>${esc(t.label)}</span></button>
      <div class="sc-cell">${inner(b, c)}</div>${tools(b, c)}</div>`;
  }

  function addBar(c) {
    if (c.locked) return "";
    return `<div class="sc-add" data-testid="sc-add-bar"><span class="eyebrow" title="Enter: khối mới · Tab: đổi loại · Backspace: xóa khối trống">Thêm khối</span>${c.cfg.types.map((t) => `<button type="button" class="btn btn-sm" data-testid="sc-add-${t}" data-act="sc-add" data-t="${t}" data-tip="${esc(T[t].hint)}">${ic(T[t].icon)}${esc(T[t].label)}</button>`).join("")}</div>`;
  }

  const srcCell = (q, c, stale) => `<div class="sc-src ${stale ? "is-stale" : ""}" data-testid="sc-src-${q.id}"><span class="sc-pno mono">${c.cfg.ranges ? `${q.id.split(".")[0]}.` : ""}¶${q.id.split(".")[1]}</span><p>${esc(c.src.map[q.id])}</p></div>`;
  function staleBar(ref, snap, now, c) {
    return `<div class="sc-stale" data-testid="sc-stale-${ref}">${ic("alert")}<div class="sc-stale-b"><b>Đoạn nguồn đã đổi sau khi lập kịch bản.</b>
        <div class="t-sm t-mute"><span class="sc-was">Trước:</span> ${esc(snap)}</div><div class="t-sm"><span class="sc-was">Hiện tại:</span> ${esc(now)}</div></div>
      <div class="sc-stale-a"><button class="btn btn-sm" data-testid="sc-regen-${ref}" data-act="sc-regen" data-ref="${ref}" ${c.locked ? `disabled title="Mở khóa để cập nhật"` : ""}>${ic("refresh")}Tạo lại</button>
        <button class="btn btn-sm btn-ghost" data-testid="sc-keep-${ref}" data-act="sc-keep" data-ref="${ref}" ${c.locked ? "disabled" : ""}>Giữ nguyên</button></div></div>`;
  }
  const missCell = (q, c) => `<div class="sc-miss" data-testid="sc-miss-${q.id}">${ic("alert")}<span class="t-sm">Đoạn này chưa có lời đọc.</span>${c.locked ? "" : `<button class="btn btn-sm" data-testid="sc-cover-${q.id}" data-act="sc-cover" data-ref="${q.id}">${ic("plus")}Tạo từ đoạn</button>`}</div>`;

  function pairRows(c) {
    const { u, src } = c;
    const idx = Object.fromEntries(src.list.map((q, i) => [q.id, i]));
    const have = new Set(u.blocks.map((b) => b.ref).filter(Boolean));
    const done = new Set();
    const rows = [];
    const flush = (upto) => src.list.forEach((q, i) => { if (i < upto && !have.has(q.id) && !done.has(q.id)) { done.add(q.id); rows.push({ para: q }); } });
    let cur = null;
    u.blocks.forEach((b) => {
      if (b.ref && idx[b.ref] !== undefined) {
        if (cur && cur.ref === b.ref) cur.blocks.push(b);
        else { flush(idx[b.ref]); cur = { ref: b.ref, para: src.list[idx[b.ref]], blocks: [b] }; rows.push(cur); }
      } else { cur = null; rows.push({ blocks: [b] }); }
    });
    flush(Infinity);
    return rows;
  }

  function groupHtml(r, c) {
    const ref = r.para.id;
    const text = c.src.map[ref];
    const collapsed = !!c.x.collapsed[ref];
    const stale = r.blocks && r.blocks.some((b) => isStale(c, b));
    const head = `<header class="sc-grp-h" tabindex="0" role="button" aria-expanded="${!collapsed}" data-testid="sc-grp-h-${ref}" data-act="sc-grp-toggle" data-ref="${ref}">${ic(collapsed ? "chev-r" : "chev-d")}<span class="sc-pno mono">¶${ref.split(".")[1]}</span><span class="sc-grp-t">${collapsed ? esc(text) : "Đoạn nguồn"}</span>${stale ? `<span class="sc-mk is-warn" title="Nguồn đã đổi">${ic("alert")}</span>` : ""}<span class="badge">${r.blocks ? `${r.blocks.length} KHỐI` : "CHƯA CÓ LỜI ĐỌC"}</span></header>`;
    const body = collapsed ? "" : `<div class="sc-grp-b">${r.blocks
      ? `<p class="sc-grp-src t-sm" data-testid="sc-grp-src-${ref}">${esc(text)}</p>${stale ? staleBar(ref, r.blocks.find((b) => b.snap != null).snap, text, c) : ""}${r.blocks.map((b) => blk(b, c)).join("")}`
      : missCell(r.para, c)}</div>`;
    return `<section class="sc-grp ${collapsed ? "is-collapsed" : ""} ${stale ? "is-stale" : ""}" data-testid="sc-grp-${ref}" data-ref="${ref}">${head}${body}</section>`;
  }

  function sourcePage(c) {
    const { u, cfg } = c;
    const rows = pairRows(c).map((r) => (r.para ? groupHtml(r, c) : r.blocks.map((b) => blk(b, c)).join(""))).join("");
    return `<div class="sc-pagewrap"><div class="sc-page sc-page-ab" data-testid="sc-page">
      <header class="sc-ptitle" data-testid="sc-page-title"><span class="mono">${esc(cfg.unit.toUpperCase())} ${pad(u.no)}</span><h2>${esc(u.title || "Chưa đặt tên")}</h2></header>${rows}</div></div>`;
  }

  function emptyUnit(c) {
    const { u, cfg, locked } = c;
    if (u.meta) {
      return U.empty(`Prototype chưa có nội dung mẫu cho ${cfg.unit.toLowerCase()} này`, `Bản đã chốt gồm ${u.meta.blocks} khối, ${fmt(u.meta.words)} từ. Prototype chỉ có nội dung đầy đủ cho các chương 1–3 của “The Lantern Keeper of Harrowmere”.`,
        locked ? `<div class="empty-act"><button class="btn" data-testid="sc-empty-unlock-btn" data-act="sc-unlock">${ic("unlock")}Mở khóa để viết lại</button></div>` : `<div class="empty-act"><button class="btn" data-testid="sc-empty-start-btn" data-act="sc-start">Bắt đầu viết lại</button></div>`);
    }
    if (hasDefault(c)) {
      return U.empty(`${cfg.unit} này chưa có kịch bản`, "Tạo bản mặc định từ nội dung nguồn (tiêu đề, một khoảng nghỉ, mỗi đoạn nguồn một khối dẫn chuyện), hoặc để AI dựng bản nháp có tách hội thoại và nhân vật.",
        `<div class="empty-act"><button class="btn btn-primary" data-testid="sc-empty-draft-btn" data-act="sc-draft">${ic("spark")}Tạo bản nháp bằng AI</button><button class="btn" data-testid="sc-empty-default-btn" data-act="sc-default">${ic("refresh")}Tạo từ đoạn nguồn</button><button class="btn" data-testid="sc-empty-start-btn" data-act="sc-start">${ic("pen")}Bắt đầu viết</button></div>`);
    }
    if (cfg.ranges) return window.SCR.emptyFilm(c);
    return U.empty(`${cfg.unit} này chưa có kịch bản`, "Bắt đầu viết từ đầu.", `<div class="empty-act"><button class="btn" data-testid="sc-empty-start-btn" data-act="sc-start">${ic("pen")}Bắt đầu viết</button></div>`);
  }

  function body(c) {
    if (!c.u.blocks) return emptyUnit(c);
    return c.cfg.source && c.src ? sourcePage(c) : window.SCR.page(c);
  }

  function pick(c) {
    const cards = Object.entries(SC.PRESETS).map(([k, pr]) => `<button type="button" class="sc-preset" data-testid="sc-pick-${k}" data-act="sc-pick" data-v="${k}"><span class="sc-preset-h">${ic(pr.icon)}<b>${esc(pr.label)}</b></span><span class="t-sm t-mute">${esc(pr.blurb)}</span></button>`).join("");
    return `<div class="nv" data-testid="sc-root">${U.bar(`<button class="btn btn-sm" data-testid="sc-back-btn" data-act="pj-back" data-id="${c.p.id}">${ic("arrow-left")}${esc(c.p.name)}</button><span class="nv-ttl">${ic("pen")}<span class="t-ink">Scripting</span></span>`)}
      <div class="nv-body"><div class="sc-pick" data-testid="sc-pick"><h2 class="t-display-xs">Bạn viết kịch bản cho loại sản phẩm nào?</h2><p class="t-sm t-mute">Project trống chưa có loại sản phẩm. Chọn một loại để bắt đầu; lựa chọn này quyết định cách trình bày kịch bản.</p><div class="sc-presets">${cards}</div></div></div></div>`;
  }

  function render(p) {
    const c = ctx(p);
    if (c.choose) return pick(c);
    const places = c.cfg.ranges ? `<datalist id="sc-places">${SC.kbPlaces(p).map((n) => `<option value="${esc(n.toUpperCase())}"></option>`).join("")}</datalist>` : "";
    return `<div class="nv" data-testid="sc-root">
      ${bar(c)}
      <div class="nv-body">
        <aside class="sc-rail" id="sc-rail-in" data-testid="sc-rail" aria-label="Danh sách ${esc(c.cfg.unit.toLowerCase())}">${railInner(c)}</aside>
        <div class="sc-main" data-testid="sc-main">${sub(c)}${banners(c)}<div class="sc-scroll" data-keep="sc" data-testid="sc-scroll">${body(c)}</div></div>${places}
      </div></div>`;
  }

  function placeCaret(el) {
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  function mount(ed, p) {
    const x = ui(p.id);
    const id = x.focus || x.goto;
    const jump = x.goto;
    const ref = x.ref;
    x.focus = null;
    x.goto = null;
    x.ref = null;
    setTimeout(() => {
      if (id) {
        const b = A.$(`.sc-blk[data-id="${id}"]`, ed);
        if (!b) return;
        const t = A.$(".sc-t", b);
        if (t && !t.hasAttribute("disabled") && t.getAttribute("contenteditable")) placeCaret(t);
        else (A.$(".sc-loc", b) || A.$("input", b))?.focus();
        b.scrollIntoView({ block: jump ? "center" : "nearest" });
      } else if (ref) A.$(`.sc-row[data-ref="${ref}"]`, ed)?.scrollIntoView({ block: "center" });
    }, 0);
  }

  function paint() {
    const c = activeCtx();
    if (!c || !c.u) return;
    const st = A.$("#sc-stats");
    if (st && c.u.blocks) st.innerHTML = statsHtml(c);
    const rl = A.$("#sc-rail-in");
    if (rl) rl.innerHTML = railInner(c);
  }

  function markSel() {
    const c = activeCtx();
    if (!c) return;
    A.$$("#editor .sc-blk").forEach((el) => el.classList.toggle("is-sel", el.dataset.id === c.x.sel));
    A.$$("#editor .sc-scn").forEach((el) => el.classList.toggle("is-sel", el.dataset.id === c.x.sel));
  }

  const SCR = window.SCR = {
    ctx, activeCtx, ui, opts, fmt, pad, find, spk, spkClass, dur, srcOf, isStale, staleRefs, uncovered, generating, sceneBusy, taskKeys, metrics, issues, touch, refresh, insert, remove, setType, hasDefault,
    statusBadge, scenes, editable, whoBtn, parenIn, slug, pauseIn, tools, blk, addBar, srcCell, paint, markSel, railInner, chLabel, staleBar,
    page: null, emptyFilm: null, inspector: null,
  };

  PJ.modViews = PJ.modViews || {};
  PJ.modViews.scripting = { render, mount, inspector: (p) => { const c = ctx(p); return SCR.inspector && !c.choose ? SCR.inspector(c) : ""; } };

  const whoRow = (b, sp) => ({ label: sp.name, icon: "user", act: "sc-who", v: `${b.id}|${sp.id}`, disabled: sp.id === b.who });

  Object.assign(A.ACT, {
    "sc-unit": (el) => { const c = activeCtx(); if (!c || !c.u) return; c.x.unit = el.dataset.id; c.x.sel = null; refresh(); },
    "sc-grp-toggle": (el) => { const c = activeCtx(); if (!c) return; const r = el.dataset.ref; if (c.x.collapsed[r]) delete c.x.collapsed[r]; else c.x.collapsed[r] = true; refresh(); },
    "sc-grp-all": () => {
      const c = activeCtx();
      if (!c || !c.src) return;
      const open = c.src.list.some((q) => !c.x.collapsed[q.id]);
      c.x.collapsed = open ? Object.fromEntries(c.src.list.map((q) => [q.id, true])) : {};
      refresh();
    },
    "sc-sel": (el) => { const c = activeCtx(); if (!c) return; c.x.sel = el.dataset.id; markSel(); A.renderInspector(); },
    "sc-pick": (el) => {
      const c = activeCtx();
      if (!c) return;
      SC.pickPreset(c.s, el.dataset.v);
      refresh();
      A.renderExplorer();
    },
    "sc-open-kb": () => { const c = activeCtx(); if (c && c.p.novel) U.openNovelTab("knowledge", c.p.novel); },
    "sc-add": (el) => {
      const c = activeCtx();
      if (!c || c.locked) return;
      const sel = find(c.u, c.x.sel);
      insert(c, sel || c.u.blocks[c.u.blocks.length - 1] || null, el.dataset.t);
    },
    "sc-start": () => {
      const c = activeCtx();
      if (!c) return;
      c.u.blocks = [];
      c.u.meta = null;
      c.u.status = "draft";
      insert(c, null, c.cfg.types[0]);
    },
    "sc-type-menu": (el) => {
      const c = activeCtx();
      const b = c && find(c.u, el.dataset.id);
      if (!b) return;
      A.openMenu(el, c.cfg.types.map((t) => ({ label: T[t].label, icon: T[t].icon, act: "sc-type", v: `${b.id}|${t}`, disabled: t === b.type })));
    },
    "sc-type": (el) => { const c = activeCtx(); const [id, t] = el.dataset.v.split("|"); const b = c && find(c.u, id); if (b) setType(c, b, t); },
    "sc-who-menu": (el) => {
      const c = activeCtx();
      const b = c && find(c.u, el.dataset.id);
      if (!b) return;
      A.openMenu(el, [...c.s.cast.map((sp) => whoRow(b, sp)), "-", { label: "Quản lý nhân vật…", icon: "settings", act: "sc-manage-cast" }]);
    },
    "sc-who": (el) => { const c = activeCtx(); const [id, w] = el.dataset.v.split("|"); const b = c && find(c.u, id); if (b) { b.who = w; touch(c); refresh(); } },
    "sc-manage-cast": () => {
      A.S.rightTab = "inspector";
      if (A.S.inspectorOpen) A.renderInspector();
      else A.ACT["toggle-inspector"]();
    },
    "sc-del": (el) => { const c = activeCtx(); const b = c && find(c.u, el.dataset.id); if (b && !c.locked) remove(c, b); },
    "sc-dup": (el) => {
      const c = activeCtx();
      const b = c && find(c.u, el.dataset.id);
      if (!b || c.locked) return;
      const copy = { ...b, id: `B${++c.s.seq}` };
      c.u.blocks.splice(c.u.blocks.indexOf(b) + 1, 0, copy);
      touch(c);
      c.x.sel = copy.id;
      refresh();
    },
    "sc-up": (el) => { const c = activeCtx(); const b = c && find(c.u, el.dataset.id); const i = b ? c.u.blocks.indexOf(b) : -1; if (i > 0) { c.u.blocks.splice(i - 1, 0, c.u.blocks.splice(i, 1)[0]); touch(c); c.x.sel = b.id; refresh(); } },
    "sc-down": (el) => { const c = activeCtx(); const b = c && find(c.u, el.dataset.id); const i = b ? c.u.blocks.indexOf(b) : -1; if (i >= 0 && i < c.u.blocks.length - 1) { c.u.blocks.splice(i + 1, 0, c.u.blocks.splice(i, 1)[0]); touch(c); c.x.sel = b.id; refresh(); } },
    "sc-goto": (el) => { const c = activeCtx(); if (!c) return; const b = find(c.u, el.dataset.id); if (b && b.ref) delete c.x.collapsed[b.ref]; c.x.sel = el.dataset.id; c.x.goto = el.dataset.id; A.closeModal(); refresh(); },
    "sc-drawer": () => { const c = activeCtx(); if (!c) return; c.x.drawer = !c.x.drawer; refresh(); },
    "sc-keep": (el) => {
      const c = activeCtx();
      if (!c || c.locked) return;
      c.u.blocks.filter((b) => b.ref === el.dataset.ref).forEach((b) => { b.snap = c.src.map[b.ref]; });
      touch(c);
      refresh();
      A.toast("Đã giữ nguyên lời đọc, đoạn nguồn mới được ghi nhận.");
    },
    "sc-regen": (el) => {
      const c = activeCtx();
      if (!c || c.locked) return;
      const ref = el.dataset.ref;
      const old = c.u.blocks.filter((b) => b.ref === ref);
      const at = c.u.blocks.indexOf(old[0]);
      const para = { id: ref, t: c.src.map[ref] };
      const dl = old.find((b) => b.type === "dialogue");
      const fresh = old.length > 1 || dl ? SC.rowBlocks(c.s, para, dl ? dl.who : "", false) : [SC.mk(c.s, "narration", { text: para.t, ref, snap: para.t })];
      c.u.blocks = c.u.blocks.filter((b) => b.ref !== ref);
      c.u.blocks.splice(at, 0, ...fresh);
      touch(c);
      refresh();
      A.toast("Đã tạo lại lời đọc từ đoạn nguồn mới.");
    },
    "sc-cover": (el) => {
      const c = activeCtx();
      if (!c || c.locked) return;
      const ref = el.dataset.ref;
      const idx = c.src.list.findIndex((q) => q.id === ref);
      const nextRef = c.src.list.slice(idx + 1).find((q) => c.u.blocks.some((b) => b.ref === q.id));
      const at = nextRef ? c.u.blocks.indexOf(c.u.blocks.find((b) => b.ref === nextRef.id)) : c.u.blocks.length;
      c.u.blocks.splice(at, 0, SC.mk(c.s, "narration", { text: c.src.map[ref], ref, snap: c.src.map[ref] }));
      touch(c);
      refresh();
    },
    "sc-unit-add": () => {
      const c = activeCtx();
      if (!c) return;
      const last = c.s.units[c.s.units.length - 1];
      const max = (U.novelById(c.p.novel) || {}).chapters || 0;
      const from = last && last.chs ? Math.min(last.chs[1] + 1, max || last.chs[1] + 1) : null;
      const u = SC.newUnit(c.s, { chs: from ? [from, from] : null });
      c.s.units.push(u);
      c.x.unit = u.id;
      A.toast(`Đã thêm ${c.cfg.unit.toLowerCase()} ${u.no}.`);
      refresh();
    },
  });

  Object.assign(A.ON, {
    "sc-text": (el) => {
      const c = activeCtx();
      const b = c && find(c.u, el.dataset.id);
      if (!b) return;
      b.text = el.textContent;
      touch(c);
      paint();
    },
    "sc-fld": (el) => {
      const c = activeCtx();
      const b = c && find(c.u, el.dataset.id);
      if (!b) return;
      const f = el.dataset.f;
      if (f === "ms") b.ms = Math.max(0, Math.min(30000, Math.round(parseFloat(el.value || "0") * 1000)));
      else if (f === "loc") { b.loc = el.value.toUpperCase(); el.value = b.loc; }
      else b[f] = el.value;
      touch(c);
      paint();
      A.renderInspector();
    },
    "sc-who-sel": (el) => { const c = activeCtx(); const b = c && find(c.u, el.dataset.id); if (b) { b.who = el.value; touch(c); refresh(); } },
    "sc-unit-title": (el) => { const c = activeCtx(); if (!c) return; c.u.title = el.value.trim(); touch(c); paint(); },
    "sc-chs": (el) => {
      const c = activeCtx();
      if (!c) return;
      const max = (U.novelById(c.p.novel) || {}).chapters || 99;
      const cur = c.u.chs || [1, 1];
      const v = Math.max(1, Math.min(max, parseInt(el.value, 10) || cur[Number(el.dataset.f)]));
      const next = [...cur];
      next[Number(el.dataset.f)] = v;
      if (next[0] > next[1]) next[Number(el.dataset.f) === 0 ? 1 : 0] = v;
      c.u.chs = next;
      touch(c);
      refresh();
    },
  });

  document.addEventListener("focusin", (e) => {
    const el = e.target.closest && e.target.closest(".sc-blk[data-id]");
    if (!el || !A.$("#editor").contains(el)) return;
    const c = activeCtx();
    if (!c || !c.u || c.x.sel === el.dataset.id) return;
    c.x.sel = el.dataset.id;
    markSel();
    A.renderInspector();
  });

  document.addEventListener("keydown", (e) => {
    const el = e.target.closest && e.target.closest(".sc-t[data-id]");
    if (!el || e.isComposing) return;
    const c = activeCtx();
    const b = c && c.u && find(c.u, el.dataset.id);
    if (!b || c.locked) return;
    const all = A.$$("#editor .sc-t[data-id]");
    const i = all.indexOf(el);
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const t = SC.NEXT[b.type];
      const pickType = [t, "narration", "action", "dialogue"].find((x) => c.cfg.types.includes(x));
      insert(c, b, pickType || c.cfg.types.find((x) => T[x].text) || b.type);
    } else if (e.key === "Backspace" && !el.textContent) {
      e.preventDefault();
      remove(c, b);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const ts = c.cfg.types.filter((t) => T[t].text);
      const at = ts.indexOf(b.type);
      setType(c, b, ts[(at + (e.shiftKey ? -1 : 1) + ts.length) % ts.length]);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey) {
      const sel = getSelection();
      const atStart = sel.isCollapsed && sel.anchorOffset === 0;
      const atEnd = sel.isCollapsed && sel.anchorOffset >= el.textContent.length;
      const to = e.key === "ArrowUp" && atStart ? all[i - 1] : e.key === "ArrowDown" && atEnd ? all[i + 1] : null;
      if (to) { e.preventDefault(); placeCaret(to); }
    }
  });
})();
