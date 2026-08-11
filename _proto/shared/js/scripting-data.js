window.SC = (function () {
  const NVS = () => window.NV.state;
  const PJ = window.PJ;
  const pad = (n) => String(n).padStart(2, "0");
  const num = (n) => ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười", "mười một", "mười hai"][n] || String(n);
  const words = (t) => (String(t || "").trim() ? String(t).trim().split(/\s+/).length : 0);

  const TYPES = {
    heading: { label: "Tiêu đề", icon: "list", hint: "Cách đọc tiêu đề chương.", text: true },
    narration: { label: "Dẫn chuyện", icon: "book", hint: "Lời người dẫn chuyện đọc.", text: true },
    dialogue: { label: "Hội thoại", icon: "users", hint: "Lời thoại của một người nói.", text: true, who: true },
    pause: { label: "Khoảng nghỉ", icon: "pause", hint: "Dừng im lặng trong một khoảng thời gian.", text: false },
    note: { label: "Ghi chú", icon: "info", hint: "Ghi chú nội bộ, không đưa vào bản chốt.", text: true },
    scene: { label: "Phân cảnh", icon: "frames", hint: "Tiêu đề cảnh: nội hay ngoại, bối cảnh, thời điểm.", text: false },
    action: { label: "Hành động", icon: "film", hint: "Mô tả hình ảnh và hành động trong cảnh.", text: true },
  };
  const NEXT = { heading: "narration", narration: "narration", dialogue: "action", pause: "narration", note: "action", scene: "action", action: "action" };
  const SPOKEN = ["heading", "narration", "dialogue", "action"];
  const TIMES = ["BÌNH MINH", "SÁNG", "TRƯA", "CHIỀU", "HOÀNG HÔN", "ĐÊM", "LIÊN TỤC"];

  const PRESETS = {
    audiobook: { label: "Lời đọc audiobook", short: "AUDIOBOOK", icon: "mic", unit: "Chương", types: ["heading", "narration", "dialogue", "pause", "note"], layout: "page", source: true, speakers: true, ranges: false, freeUnits: false, blurb: "Lời đọc theo từng chương, mỗi đoạn nguồn là một nhóm các khối. Giọng đọc chọn ở module Audiobook." },
    film: { label: "Kịch bản phim", short: "FILMSERIES", icon: "film", unit: "Tập", types: ["scene", "action", "dialogue", "note"], layout: "page", source: false, speakers: true, ranges: true, freeUnits: true, blurb: "Mỗi tập gồm vài chương. AI dựng kịch bản từ Knowledgebase, bạn chỉnh sửa và chốt." },
  };
  const PRESET_OF = { audiobook: "audiobook", "audiobook-video": "audiobook", filmseries: "film", blank: null };
  const cfgOf = (preset) => { const { label, short, icon, blurb, ...rest } = PRESETS[preset]; return { preset, ...rest, types: [...rest.types] }; };

  const VI_TITLES = { 1: "Ngọn đèn cuối cùng", 2: "Thư lại từ bến cảng", 3: "Điều thủy triều trả lại" };
  const SPEAK = { "1.3": "E02", "1.4": "E01", "2.2": "E03", "2.4": "E04" };

  const mk = (s, type, o = {}) => ({ id: `B${++s.seq}`, type, text: "", who: "", paren: "", ms: 0, loc: "", time: "SÁNG", ref: null, snap: null, beat: "", refs: [], chars: [], ...o });

  const split = (text) => {
    const out = [];
    const re = /“([^”]*)”|"([^"]*)"/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ q: false, t: text.slice(last, m.index) });
      out.push({ q: true, t: m[1] ?? m[2] });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ q: false, t: text.slice(last) });
    return out.map((x) => ({ q: x.q, t: x.t.trim().replace(/^[\s,;:.]+/, "") })).filter((x) => /[\p{L}\p{N}]/u.test(x.t));
  };
  const firstChar = (s) => (s.cast.find((c) => c.kind !== "narrator") || {}).id || "";
  const rowBlocks = (s, para, who, guess = true) => split(para.t).map((seg) => (seg.q
    ? mk(s, "dialogue", { who: who || (guess ? SPEAK[para.id] || firstChar(s) : ""), text: seg.t.replace(/[,;]$/, "."), ref: para.id, snap: para.t })
    : mk(s, "narration", { text: seg.t, ref: para.id, snap: para.t })));
  const draftAudio = (s, unit, paras, o = {}) => [
    mk(s, "heading", { text: `Chương ${num(unit.no)}.${unit.title ? ` ${unit.title}.` : ""}` }),
    mk(s, "pause", { ms: 800 }),
    ...paras.flatMap((p) => (o.split ? rowBlocks(s, p, "", o.guess !== false) : [mk(s, "narration", { text: p.t, ref: p.id, snap: p.t })])),
  ];

  const sourceParas = (p, n) => {
    if (p.novel !== "NOV-0001") return null;
    const ch = NVS().chapters[n - 1];
    if (!ch || !ch.paras) return null;
    if (!p.src || p.src.kind !== "translation") return ch.paras.map((x) => ({ id: x.id, t: x.t }));
    const tr = NVS().tr.chapters[n];
    return ch.paras.map((x) => ({ id: x.id, t: (tr && tr.paras[x.id] && tr.paras[x.id].t) || window.NV.vi[x.id] || x.t }));
  };
  const chaptersOf = (u) => (u.chs ? Array.from({ length: u.chs[1] - u.chs[0] + 1 }, (_, i) => u.chs[0] + i) : u.ch ? [u.ch] : []);
  const sourceRange = (p, u) => {
    const parts = chaptersOf(u).map((n) => sourceParas(p, n));
    return parts.length && parts.every(Boolean) ? parts.flat() : null;
  };
  const chapterTitle = (p, n) => {
    if (p.novel === "NOV-0001") return p.src && p.src.kind === "translation" && VI_TITLES[n] ? VI_TITLES[n] : NVS().chapters[n - 1].title;
    return `Chương ${n}`;
  };

  const kbAvail = (p) => p.novel === "NOV-0001";
  const kbAll = () => NVS().kb.items.filter((i) => i.status !== "rejected");
  const kbItems = () => {
    const all = kbAll();
    const dup = (i) => i.kind === "entity" && all.some((o) => o !== i && o.kind === "entity" && o.type === i.type && o.name.length > i.name.length && o.name.includes(i.name));
    return all.filter((i) => !dup(i));
  };
  const chNo = (pid) => window.NV.chOf(pid);
  const paraNo = (pid) => parseInt(String(pid).split(".")[1], 10);
  const kbReady = (p, chs) => kbAvail(p) && chs.length > 0 && chs.every((n) => NVS().kb.analyzed[n] === "done");
  const kbMissing = (p, chs) => (kbAvail(p) ? chs.filter((n) => NVS().kb.analyzed[n] !== "done") : []);
  const kbCast = (p) => (kbAvail(p) ? kbItems().filter((i) => i.kind === "entity" && i.type === "character").map((i, k) => ({ id: i.id, name: i.name, c: k, kb: true })) : []);
  const kbPlaces = (p) => (kbAvail(p) ? kbItems().filter((i) => i.kind === "entity" && (i.type === "place" || i.type === "org")).map((i) => i.name) : []);
  function kbBeats(p, chs) {
    if (!kbReady(p, chs)) return null;
    const items = kbItems();
    const inCh = (pid) => chs.includes(chNo(pid));
    const inner = new Set(items.filter((i) => i.kind === "relation" && i.pred === "located_in").map((i) => i.to));
    const places = items.filter((i) => i.kind === "entity" && i.type === "place" && !inner.has(i.id));
    const chars = items.filter((i) => i.kind === "entity" && i.type === "character");
    return items.filter((i) => i.kind === "event" && i.ev.some((e) => inCh(e.p))).sort((a, b) => a.order - b.order).map((ev) => {
      const refs = [...new Set(ev.ev.map((e) => e.p).filter(inCh))];
      const dist = (pl) => Math.min(99, ...pl.ev.filter((x) => chNo(x.p) === chNo(refs[0])).map((x) => Math.abs(paraNo(x.p) - paraNo(refs[0]))));
      const near = places.map((pl) => [pl, dist(pl)]).sort((a, b) => a[1] - b[1])[0];
      const loc = near && near[1] < 99 ? near[0].name.toUpperCase() : "";
      return { ev: ev.id, text: ev.summary, refs, chars: chars.filter((c) => c.ev.some((x) => refs.includes(x.p))).map((c) => c.id), loc, time: "NGÀY" };
    });
  }
  const beatBlocks = (s, beats) => beats.map((b) => mk(s, "scene", { loc: b.loc, time: b.time, beat: b.text, refs: b.refs, chars: b.chars }));
  const sceneBody = (s, scene, map) => {
    const out = [];
    let qi = 0;
    scene.refs.forEach((ref) => {
      if (!map[ref]) return;
      split(map[ref]).forEach((seg) => {
        if (seg.q) out.push(mk(s, "dialogue", { who: scene.chars.length ? scene.chars[qi++ % scene.chars.length] : "", text: seg.t.replace(/[,;]$/, ".") }));
        else out.push(mk(s, "action", { text: seg.t }));
      });
    });
    return out;
  };
  const narrOnly = () => [{ id: "narr", name: "Người dẫn chuyện", kind: "narrator", c: -1 }];
  function syncCast(p, s) {
    s.cast = [...(s.cfg.preset === "audiobook" ? narrOnly() : []), ...kbCast(p), ...(s.extraCast || [])];
  }
  const aiAudio = (s, unit, paras) => draftAudio(s, unit, paras, { split: true });
  const aiFilm = (s, p, u) => {
    const beats = kbBeats(p, chaptersOf(u));
    const src = sourceRange(p, u);
    const map = src ? Object.fromEntries(src.map((q) => [q.id, q.t])) : {};
    return (beats || []).flatMap((b) => {
      const scene = beatBlocks(s, [b])[0];
      const body = sceneBody(s, scene, map);
      return [scene, ...(body.length ? body : [mk(s, "action", { text: b.text })])];
    });
  };

  const newScript = (preset, o = {}) => ({ cfg: cfgOf(preset), cast: [], extraCast: [], units: [], seq: 0, useq: 0, ...o });
  const newUnit = (s, o) => ({ id: `U${pad(++s.useq)}`, no: s.useq, ch: null, chs: null, title: "", status: "draft", blocks: null, meta: null, updated: "", ...o });
  const placeholder = (w) => ({ blocks: Math.max(8, Math.round(w / 38)), words: w });

  function lazyScript(p) {
    const preset = PRESET_OF[p.template];
    const s = newScript(preset || "audiobook");
    if (!preset) s.choose = true;
    syncCast(p, s);
    if (preset === "film") {
      s.units.push(newUnit(s, { chs: p.range ? [p.range[0], p.range[1]] : null }));
      return s;
    }
    const from = p.range ? p.range[0] : 1;
    const to = p.range ? p.range[1] : 1;
    for (let n = from; n <= to; n++) s.units.push(newUnit(s, p.range ? { no: n, ch: n, title: chapterTitle(p, n) } : {}));
    return s;
  }
  function pickPreset(s, preset) {
    delete s.choose;
    s.cfg = cfgOf(preset);
    s.units.forEach((u) => { u.blocks = null; });
  }

  function seedAudio(p, status, split) {
    const s = newScript("audiobook");
    syncCast(p, s);
    const [from, to] = p.range;
    for (let n = from; n <= to; n++) {
      const u = newUnit(s, { no: n, ch: n, title: chapterTitle(p, n), status: status[n] || "locked" });
      const paras = sourceParas(p, n);
      if (paras) u.blocks = draftAudio(s, u, paras, { split });
      else u.meta = placeholder(p.novel === "NOV-0001" ? NVS().chapters[n - 1].words : 2200);
      s.units.push(u);
    }
    return s;
  }
  function tuneAudio(s) {
    const at = (u, ref, type, i = 0) => u.blocks.filter((b) => b.ref === ref && b.type === type)[i];
    const u1 = s.units[0];
    const u2 = s.units[1];
    const u3 = s.units[2];
    at(u1, "1.3", "dialogue").paren = "khô khốc";
    at(u1, "1.4", "dialogue").paren = "lạnh, không quay lại";
    at(u2, "2.2", "dialogue").paren = "đọc thư, trang trọng";
    u2.blocks.splice(u2.blocks.indexOf(at(u2, "2.3", "narration")), 0, mk(s, "note", { text: "Giữ nhịp chậm, hơi thở dài khi Maro đi dọc phố vắng." }));
    at(u3, "3.2", "narration").snap = at(u3, "3.2", "narration").snap.replace("xanh rêu", "xanh xám");
    at(u3, "3.3", "narration").snap = at(u3, "3.3", "narration").snap.replace("treo nó cạnh ngọn đèn", "treo nó cạnh đèn");
  }

  function seedFilm(p) {
    const s = newScript("film");
    syncCast(p, s);
    const scene = (loc, ie, time, beat, refs, chars, body) => [mk(s, "scene", { loc, time, beat, refs, chars }), ...body.map((x) => mk(s, x.type, x))];
    const ac = (text) => ({ type: "action", text });
    const dl = (who, text, paren = "") => ({ type: "dialogue", who, text, paren });
    const u1 = newUnit(s, { no: 1, chs: [1, 2], title: "Ngọn đèn cuối cùng" });
    u1.blocks = [
      ...scene("THÁP ĐÈN", "NGOẠI", "HOÀNG HÔN", "Wren thắp ngọn đèn cuối cùng của Harrowmere.", ["1.1", "1.2"], ["E01"], [
        ac("Chạng vạng. Sương mù phủ dày lên bến cảng Harrowmere. WREN ALDOUS leo hết ba trăm mười hai bậc thang của Tháp Đèn và thắp ngọn đèn cuối cùng. Những ngọn đèn khác trong thị trấn đã tắt từ nhiều năm trước."),
      ]),
      ...scene("THÁP ĐÈN", "NGOẠI", "HOÀNG HÔN", "Maro Quill, thư lại bến cảng, đến để kiểm kê Harrowmere.", ["1.3", "1.4", "1.5"], ["E01", "E02"], [
        ac("MARO QUILL, thư lại bến cảng, đã leo lên cầu thang mà không phát ra một tiếng động. Anh ôm chặt cuốn sổ cái trước ngực."),
        dl("E02", "Cô đang phí dầu đấy. Hội đồng đã sáu mùa đông không trả tiền cho nó.", "khô khốc"),
        dl("E01", "Hội đồng đâu có thắp đèn. Tôi thắp.", "không quay lại"),
        ac("Anh tự giới thiệu là Maro Quill, được cử đến để kiểm kê những gì còn lại của Harrowmere. Anh không nói ai đã cử mình."),
      ]),
      ...scene("BẾN CHÌM", "NGOẠI", "HOÀNG HÔN", "Từ đỉnh tháp, ánh đèn dường như vươn xuống tận mặt nước.", ["1.6"], [], []),
      ...scene("PHÒNG TRỌ", "NỘI", "SÁNG", "Maro tìm thấy thư của Phu nhân Sevrin trong cuốn sổ cái.", ["2.1", "2.2"], ["E02", "E03"], []),
      ...scene("BẾN CHÌM", "NGOẠI", "NGÀY", "Bà lão bán trà cảnh báo Maro về ngọn đèn.", ["2.4"], ["E02", "E04"], []),
    ];
    s.units.push(u1);
    s.units.push(newUnit(s, { no: 2, chs: [3, 3], title: "Điều thủy triều trả lại" }));
    return s;
  }

  function seedLocked(p, units, label, wordsEach) {
    const preset = PRESET_OF[p.template] || "audiobook";
    const s = newScript(preset);
    syncCast(p, s);
    for (let n = 1; n <= units; n++) s.units.push(newUnit(s, { no: n, ch: preset === "film" ? null : n, chs: preset === "film" ? [n, n] : null, title: `${label} ${n}`, status: "locked", meta: placeholder(wordsEach) }));
    return s;
  }

  function seed() {
    const scripts = {};
    const byId = (id) => PJ.state.projects.find((x) => x.id === id);
    const p1 = byId("PRJ-0001");
    const p3 = byId("PRJ-0003");
    const p4 = byId("PRJ-0004");
    const p5 = byId("PRJ-0005");
    const p6 = byId("PRJ-0006");
    if (p1) { scripts[p1.id] = seedAudio(p1, { 3: "review" }, true); tuneAudio(scripts[p1.id]); }
    if (p3) scripts[p3.id] = seedFilm(p3);
    if (p4) scripts[p4.id] = seedLocked(p4, 8, "Chương", 2230);
    if (p5) scripts[p5.id] = seedAudio(p5, {}, false);
    if (p6) scripts[p6.id] = seedLocked(p6, 2, "Tập", 2400);
    return { scripts };
  }

  return {
    TYPES, PRESETS, NEXT, SPOKEN, TIMES, PRESET_OF,
    state: { scripts: {} },
    ui: {},
    seeded: false,
    reseed() { this.state = seed(); this.ui = {}; this.seeded = true; },
    scriptOf(p) {
      if (!this.seeded) this.reseed();
      return (this.state.scripts[p.id] ||= lazyScript(p));
    },
    words, mk, split, rowBlocks, draftAudio, sourceParas, sourceRange, chaptersOf, firstChar, cfgOf, newUnit, num, pickPreset, narrOnly,
    kbAvail, kbReady, kbMissing, kbCast, kbPlaces, kbBeats, beatBlocks, sceneBody, syncCast, aiAudio, aiFilm,
  };
})();
