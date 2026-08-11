window.AB = (function () {
  const PJ = window.PJ;
  const SC = window.SC;
  const LB = window.LB;
  const VOICED = ["heading", "narration", "dialogue"];
  const NARR = "VOC-08";

  const symbols = () => [
    { id: "S1", sym: "* * *", rule: "Nghỉ 1,2 giây, đổi cảnh", on: true },
    { id: "S2", sym: "…", rule: "Nghỉ ngắn 0,4 giây", on: true },
    { id: "S3", sym: "—", rule: "Nghỉ 0,3 giây", on: true },
    { id: "S4", sym: "“ ”", rule: "Hội thoại, đổi sang giọng của người nói", on: true },
  ];
  const lexAll = () => [
    { id: "L01", term: "Harrowmere", say: "Hê-rô-mia", kind: "Tên riêng" },
    { id: "L02", term: "Wren", say: "Ren", kind: "Tên riêng" },
    { id: "L03", term: "Quill", say: "Quin", kind: "Tên riêng" },
    { id: "L04", term: "Sevrin", say: "Sê-vrin", kind: "Tên riêng" },
    { id: "L05", term: "312", say: "ba trăm mười hai", kind: "Số" },
  ];

  const voices = () => LB.state.voices;
  const voiceById = (id) => voices().find((v) => v.id === id);
  const usable = (v) => !!v && v.status === "ready" && (v.engine === "cloud" ? LB.speech.ready(v.provider) : LB.tts.localOk(v));
  const whyNot = (v) => (!v ? "Chưa chọn giọng" : v.status === "failed" ? "Clone lỗi" : v.status === "processing" ? "Đang xử lý" : v.engine === "local" && !LB.tts.localOk(v) ? (LB.tts.backendOk() ? `Cần cài mô hình ${LB.tts.familyName(v.family)}` : "Python backend đang tắt") : v.engine === "cloud" && !LB.speech.ready(v.provider) ? `Cần kết nối ${LB.speech.name(v.provider)}` : "");
  const engineName = (v) => (v.engine === "cloud" ? LB.speech.name(v.provider) : "Local TTS");

  const narrator = (s) => s.cast.find((x) => x.kind === "narrator");
  const speakerOf = (s, b) => (b.type === "dialogue" ? s.cast.find((x) => x.id === b.who) : narrator(s));
  const voiced = (u) => (u.blocks || []).filter((b) => VOICED.includes(b.type) && b.text.trim());
  const newBook = () => ({ voices: {}, lex: [], symbols: symbols(), units: {} });

  const state = { books: {} };
  const book = (p) => (state.books[p.id] ||= newBook());
  const rec = (bk, u) => (bk.units[u.id] ||= { audio: {}, mix: { gap: 0.6, intro: 0.8, outro: 1.5, vol: 0 }, meta: null });

  const voiceFor = (bk, s, b) => {
    const sp = speakerOf(s, b);
    const cfg = sp ? bk.voices[sp.id] : null;
    return { sp, v: cfg && cfg.voice ? voiceById(cfg.voice) : null, speed: cfg ? cfg.speed : 1 };
  };
  const hitsIn = (lex, text) => lex.filter((l) => l.term && text.includes(l.term));
  const hits = (bk, text) => hitsIn(bk.lex, text);
  const readText = (bk, text) => hits(bk, text).reduce((t, l) => t.split(l.term).join(l.say), text);
  const sigOf = (lex, text) => hitsIn(lex, text).map((l) => `${l.term}>${l.say}`).sort().join("|");
  const estDur = (text, speed) => Math.max(0.8, SC.words(text) / 2.6 / (speed || 1) + 0.25);

  function reasons(bk, s, b, a) {
    const { v, speed } = voiceFor(bk, s, b);
    const why = [];
    if (a.text !== b.text) why.push("Kịch bản đã đổi");
    if (a.voice !== (v ? v.id : "") || a.speed !== speed) why.push("Giọng hoặc tốc độ đã đổi");
    if (a.rules !== sigOf(bk.lex, b.text)) why.push("Quy tắc đọc đã đổi");
    if ((a.paren || "") !== (b.paren || "")) why.push("Sắc thái đã đổi");
    return why;
  }
  function segState(bk, s, u, b) {
    const a = rec(bk, u).audio[b.id];
    if (!a) return { st: "none" };
    const why = reasons(bk, s, b, a);
    if (a.flag) return { st: "flag", a, why };
    return why.length ? { st: "stale", a, why } : { st: "done", a, why };
  }

  function unitStat(s, bk, u) {
    if (!u.blocks) {
      const m = rec(bk, u).meta || "none";
      return { total: 0, done: 0, stale: 0, none: 0, dur: 0, st: m, meta: true };
    }
    const out = { total: 0, done: 0, stale: 0, none: 0, dur: 0 };
    voiced(u).forEach((b) => {
      const x = segState(bk, s, u, b);
      out.total++;
      if (x.st === "done") out.done++;
      else if (x.st === "none") out.none++;
      else out.stale++;
      if (x.a) out.dur += x.a.dur;
    });
    out.st = !out.total || (!out.done && !out.stale) ? "none" : out.done === out.total ? "done" : out.stale ? "stale" : "doing";
    return out;
  }

  function sync(p) {
    if (!p.modules.includes("audiobook")) return;
    const s = SC.scriptOf(p);
    const bk = book(p);
    const st = s.units.map((u) => unitStat(s, bk, u));
    const done = st.filter((x) => x.st === "done").length;
    const stale = st.filter((x) => x.st === "stale").length;
    const any = st.some((x) => x.st !== "none");
    p.prog.audiobook = { state: stale ? "stale" : done === st.length && st.length ? "done" : any ? "doing" : "idle", done, total: st.length, note: `${done}/${st.length} ${s.cfg.unit.toLowerCase()}${stale ? ` · ${stale} cần xem lại` : ""}` };
  }

  function blockers(s, bk, u) {
    const out = [];
    if (u.status !== "locked") out.push({ k: "lock", text: `${s.cfg.unit} này chưa chốt kịch bản.` });
    const segs = voiced(u);
    const lost = segs.filter((b) => b.type === "dialogue" && !s.cast.some((x) => x.id === b.who));
    if (lost.length) out.push({ k: "who", text: `${lost.length} hội thoại chưa gán người nói.`, id: lost[0].id });
    const seen = new Set();
    segs.forEach((b) => {
      const sp = speakerOf(s, b);
      if (!sp || seen.has(sp.id)) return;
      seen.add(sp.id);
      const v = bk.voices[sp.id] && bk.voices[sp.id].voice ? voiceById(bk.voices[sp.id].voice) : null;
      if (!v) out.push({ k: "voice", sp: sp.id, text: `${sp.name} chưa có giọng đọc.` });
      else if (!usable(v)) out.push({ k: "engine", sp: sp.id, text: `${sp.name}: giọng “${v.name}” chưa dùng được (${whyNot(v)}).` });
    });
    return out;
  }

  function seed() {
    const books = {};
    const by = (id) => PJ.state.projects.find((p) => p.id === id);
    const fill = (bk, s, u, o = {}) => {
      const r = rec(bk, u);
      voiced(u).forEach((b) => {
        if (o.skip && o.skip(b)) return;
        const vf = voiceFor(bk, s, b);
        const text = o.text ? o.text(b) : b.text;
        r.audio[b.id] = { text, voice: vf.v ? vf.v.id : "", speed: vf.speed, rules: sigOf(o.lex || bk.lex, b.text), paren: b.paren, dur: estDur(text, vf.speed), at: o.at || "2026-11-07 22:05", flag: "" };
      });
    };
    const metas = (s, bk, map) => s.units.forEach((u) => { if (!u.blocks) rec(bk, u).meta = map[u.no] || "none"; });

    const p1 = by("PRJ-0001");
    if (p1) {
      const s = SC.scriptOf(p1);
      const bk = (books[p1.id] = { ...newBook(), lex: lexAll() });
      bk.voices = { narr: { voice: NARR, speed: 0.95 }, E01: { voice: NARR, speed: 1 }, E02: { voice: NARR, speed: 1.05 }, E03: { voice: NARR, speed: 0.9 } };
      fill(bk, s, s.units[0]);
      fill(bk, s, s.units[1], { skip: (b) => b.who === "E04" || b.ref === "2.5", lex: lexAll().filter((l) => l.id !== "L04"), at: "2026-11-08 21:30" });
      fill(bk, s, s.units[2], { text: (b) => (b.ref === "3.2" || b.ref === "3.3" ? b.snap : b.text), at: "2026-11-06 20:12" });
      metas(s, bk, { 4: "done", 5: "stale", 6: "done", 7: "done", 8: "done", 9: "done" });
    }
    const p4 = by("PRJ-0004");
    if (p4) {
      const s = SC.scriptOf(p4);
      const bk = (books[p4.id] = newBook());
      bk.voices = { narr: { voice: NARR, speed: 1 } };
      metas(s, bk, { 1: "done", 2: "done", 3: "done" });
    }
    const p5 = by("PRJ-0005");
    if (p5) {
      const s = SC.scriptOf(p5);
      const bk = (books[p5.id] = { ...newBook(), lex: lexAll() });
      bk.voices = { narr: { voice: NARR, speed: 0.95 } };
      s.units.forEach((u) => fill(bk, s, u, { at: "2026-11-04 19:40" }));
    }
    state.books = books;
    [p1, p4, p5].forEach((p) => { if (p) sync(p); });
  }

  return {
    state, ui: {}, VOICED, symbols, voices, voiceById, usable, whyNot, engineName, narrator, speakerOf, voiced, book, rec, voiceFor, hits, readText, sigOf, estDur,
    reasons, segState, unitStat, sync, blockers,
    reseed() { this.ui = {}; seed(); },
  };
})();
