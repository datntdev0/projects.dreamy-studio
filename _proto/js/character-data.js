window.CR = (function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const SC = window.SC;
  const LB = window.LB;
  const NV = window.NV;

  const VIEWS = [
    { id: "front", label: "Front", tag: "FRONT" },
    { id: "back", label: "Back", tag: "BACK" },
    { id: "side", label: "Side", tag: "SIDE" },
    { id: "tq", label: "3/4 half body", tag: "3/4 UPPER" },
  ];
  const LAYOUT = "Single wide character design sheet with four views of the same character side by side in one row: front view full body, back view full body, side profile view full body, and three-quarter view upper body. Identical face, outfit and proportions in every view, plain neutral grey background, even soft lighting, no text or labels.";

  const FIELDS = [
    { k: "gender", label: "Gender", scope: "char", ph: "e.g. female" },
    { k: "age", label: "Age", scope: "char", ph: "e.g. about 30 years old" },
    { k: "build", label: "Build", scope: "char", ph: "e.g. thin, tall" },
    { k: "face", label: "Face", scope: "char", ph: "e.g. long face, grey eyes" },
    { k: "hair", label: "Hair", scope: "char", ph: "e.g. grey hair in a high bun" },
    { k: "skin", label: "Skin tone", scope: "char", ph: "e.g. skin weathered by the sea wind" },
    { k: "marks", label: "Distinguishing marks", scope: "char", ph: "e.g. a scar, an emblem" },
    { k: "garment", label: "Outfit", scope: "outfit", ph: "e.g. long grey coat" },
    { k: "props", label: "Props", scope: "outfit", ph: "e.g. a ledger, an oil lamp" },
  ];
  const CHAR_FIELDS = FIELDS.filter((f) => f.scope === "char");
  const OUTFIT_FIELDS = FIELDS.filter((f) => f.scope === "outfit");

  const SRC = {
    text: ["badge-success", "Text", "Stated directly in the text"],
    claim: ["badge-info", "Character’s words", "Told by another character"],
    ai: ["badge-warning", "AI inference", "AI inference, not stated in the text. Please confirm or edit"],
    user: ["badge-primary", "You entered", "Entered or confirmed by you"],
  };
  const SHEET = {
    none: ["NO SHEET", ""],
    draft: ["AWAITING APPROVAL", "badge-info"],
    ok: ["APPROVED", "badge-success"],
    stale: ["NEEDS REVIEW", "badge-warning"],
  };
  const STYLES = [
    { id: "oil", name: "Dark oil painting", lib: "Dark oil-painting style", text: "oil painting, heavy impasto, chiaroscuro, desaturated blues, warm lamplight accents" },
    { id: "concept", name: "Semi-realistic concept art", text: "semi-realistic character concept art, clean line, soft painterly shading, muted palette" },
    { id: "anime", name: "Anime cel-shaded", text: "anime character design, cel shading, clean line art, flat colors" },
    { id: "storybook", name: "Watercolor illustration", text: "watercolor storybook illustration, soft edges, paper texture, gentle colors" },
  ];
  const PROVIDERS = [
    { id: "gemini", name: "Gemini CLI (Imagen)", ok: true, per: 0.04, mins: 0.4 },
    { id: "comfy", name: "ComfyUI (runs on this machine)", ok: true, per: 0, mins: 1.6, note: "No cost, slower" },
    { id: "codex", name: "Codex CLI", ok: false, per: 0.05, mins: 0.5, note: "Not installed on this machine" },
  ];
  const BASE_VI = "Plain white short T-shirt and shorts";
  const BASE_EN = "a plain short-sleeved white t-shirt and plain white shorts, barefoot, no accessories";
  const NEG = "text, watermark, extra limbs, deformed hands, cropped, multiple characters, busy background";

  const fld = (v = "", src = "", ev = [], en = "", why = "") => ({ v, en, src, ev, why });
  const R = (v, en, ev) => fld(v, "text", ev, en);
  const G = (v, en, why) => ({ v, en, why });
  const pal = (a, b, c) => [a, b, c].map(([n, en, hex]) => ({ n, en, c: hex }));
  const NEUTRAL = () => pal(["Grey", "grey", "#8a8f98"], ["Dark grey", "charcoal", "#3a3f47"], ["Be", "beige", "#b9a98a"]);

  const READ = {
    E01: { gender: R("Female", "woman", ["1.4"]) },
    E02: {
      gender: R("Nam", "man", ["1.3"]), build: R("Thin", "thin, slender build", ["1.3"]),
      garment: R("Grey coat", "a long grey coat", ["1.3"]), props: R("A ledger held to the chest", "a ledger pressed to his chest", ["1.3"]),
    },
    E03: { gender: R("Female", "woman", ["2.1"]), marks: R("A radiating sun emblem, the mark of the council chair", "a sunburst emblem, the mark of the Council's chair", ["2.2"]) },
    E04: { gender: R("Female", "woman", ["2.4"]), age: R("Old (an elderly woman)", "elderly", ["2.4"]), props: R("A teapot and teacups", "a teapot and cups of tea", ["2.4"]) },
  };
  const GUESS = {
    E01: {
      age: G("About 30 years old", "around 30 years old", "Has kept the lamp for many years; the text does not state her age."),
      build: G("Slender, wiry", "lean, wiry build", "Climbs 312 steps each way (¶1.1)."),
      face: G("Angular face, weathered by wind, steady gaze", "angular weathered face, steady resolute gaze", "Does not turn back when questioned (¶1.4)."),
      hair: G("Long black hair, tied back neatly", "long dark hair tied back", "Suits tower climbing and sea wind."),
      skin: G("Skin weathered by the sea wind", "sun- and wind-weathered skin", "Lives and works at the harbor."),
      garment: G("Thick dark-blue wool cloak, leather boots", "a heavy dark sea-teal wool coat and leather boots", "Outfit of the lamp keeper of the foggy harbor."),
      props: G("Hand-held brass oil lamp", "carrying a brass oil lantern", "Tied to lighting the lamp every evening (¶1.1)."),
      palette: pal(["Dark sea blue", "dark sea-teal", "#2f5d62"], ["Leather brown", "leather brown", "#6b4f3a"], ["Brass", "brass", "#d9a441"]),
    },
    E02: {
      age: G("About 40 years old", "in his forties", "Has had a long career as a clerk (¶2.5)."),
      face: G("Long, pale face, guarded eyes", "long pale face, wary eyes", "Climbs up without making a sound (¶1.3)."),
      hair: G("Neatly combed grey hair", "neatly combed grey-streaked hair", "Tidy, suits a clerk."),
      skin: G("Pale from little sun", "pale skin", "Works indoors with ledgers."),
      palette: pal(["Grey", "grey", "#8a8f98"], ["Than", "charcoal", "#33373e"], ["Beige ledger", "parchment beige", "#c2b08a"]),
    },
    E03: {
      age: G("About 55 years old", "in her mid fifties", "She is the Council chair (¶2.2)."),
      build: G("Tall, upright posture", "tall, upright posture", "A commanding build."),
      face: G("Stern, sharp", "stern, sharp-featured face", "Gives orders by letter, never shows herself (¶2.2)."),
      hair: G("Silver hair in a high bun", "silver hair in a high bun", "Formal, suits her office."),
      skin: G("Pale, bluish-white skin", "pale skin", "Rarely goes outdoors."),
      garment: G("Black high-collared velvet gown", "a black high-collared velvet gown", "Outfit of the Council chair."),
      props: G("Brooch in the shape of a radiating sun", "a sunburst brooch", "Repeats the sun mark on the letter (¶2.2)."),
      palette: pal(["Jet black", "black", "#1d1b24"], ["Wine red", "wine red", "#7d2a3a"], ["Sunny yellow", "sun gold", "#d9a441"]),
    },
    E04: {
      build: G("Small, stooped", "small, stooped frame", "Advanced age (¶2.4)."),
      face: G("Many wrinkles, sharp eyes", "deeply lined face, sharp eyes", "Knows what others do not (¶2.4)."),
      hair: G("Grey hair, covered with a scarf", "grey hair under a headscarf", "Sells goods on the windy wharf."),
      skin: G("Tanned brown skin", "weathered brown skin", "Lives on the wharf."),
      garment: G("Patched sweater, shawl", "a patched wool dress and shawl", "A street vendor at Sunken Wharf."),
      palette: pal(["Earth brown", "earth brown", "#7a5a40"], ["Smoke grey", "smoke grey", "#6b6f75"], ["Kem", "cream", "#d8c9a8"]),
    },
  };
  const NIGHT = {
    E01: {
      garment: G("Long fog-proof cloak, hood", "a long hooded cloak against the sea fog", "Outdoor night scene, the text does not mention other outfits."),
      palette: pal(["Night blue", "midnight blue", "#1f3b4d"], ["Leather brown", "leather brown", "#6b4f3a"], ["Brass", "brass", "#d9a441"]),
    },
    E02: {
      garment: G("Thick grey coat, collar turned up", "a heavier grey coat with the collar turned up", "Cold night on the wharf, the text does not mention other outfits."),
      palette: pal(["Dark grey", "dark grey", "#5f646c"], ["Than", "charcoal", "#33373e"], ["Beige ledger", "parchment beige", "#c2b08a"]),
    },
  };
  const NIGHT_DEFAULT = { garment: G("A thicker coat for cold nights", "a heavier coat for the cold night", "Outdoor night scene, the text does not mention other outfits."), palette: null };

  const MENTION = { E03: { refs: ["2.1", "2.2"], why: "Only present through the letter Maro finds (¶2.1–2.2): Lady Severin’s words are read as a letter, she is not present in the scene." } };
  const ALIAS = { E01: ["Wren"], E02: ["Maro", "Quill"], E03: ["Sevrin"], E04: ["old woman"] };
  const MANUAL = [
    ["spk6a", "Ilya Brandt", "Nam", "man", "About 35 years old", "in his mid thirties", "Blue engineer’s coat", "a blue engineer's jacket"],
    ["spk6b", "Mara Kest", "Female", "woman", "About 28 years old", "in her late twenties", "Lab coat, safety goggles", "a lab coat with protective goggles"],
    ["spk6c", "Odel Voss"],
    ["spk6d", "Sister Ione"],
    ["spk6e", "Captain Hale"],
  ];
  const SEED = {
    "PRJ-0001": { E01: "full:IMG-0003", E02: "full:IMG-0004", E03: "full", E04: "full" },
    "PRJ-0003": { E01: "full", E02: "draft" },
    "PRJ-0006": { spk6a: "full", spk6b: "full" },
  };

  const state = { projects: {} };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const val = (f) => (f && f.v ? f.en || f.v : "");
  const castOf = (p) => { const s = SC.scriptOf(p); SC.syncCast(p, s); return s.cast.filter((x) => x.kind !== "narrator"); };
  const nameOf = (p, id) => (castOf(p).find((x) => x.id === id) || { name: id }).name;
  const kbItem = (id) => NV.state.kb.items.find((i) => i.id === id);
  const kbSig = (id) => { const i = kbItem(id); return i ? String(LB.hash(JSON.stringify([i.summary, i.attrs]))) : ""; };
  const of = (p) => state.projects[p.id] || seedProject(p);

  function styleText(st) {
    const s = STYLES.find((x) => x.id === st.style) || STYLES[0];
    const a = s.lib ? LB.state.assets.find((x) => x.type === "prompt" && x.name === s.lib) : null;
    return a ? a.text : s.text;
  }
  function compose(p, e, o) {
    const st = of(p);
    const P = e.profile;
    const subject = [val(P.gender) && `a ${val(P.gender)}`, val(P.age)].filter(Boolean).join(", ");
    const look = ["build", "face", "hair", "skin", "marks"].map((k) => val(P[k])).filter(Boolean).join(", ");
    const colors = o.palette.map((x) => x.en || x.n).filter(Boolean).join(", ");
    const wear = o.base ? ` Wearing ${BASE_EN}.` : `${val(o.garment) ? ` Wearing ${val(o.garment)}.` : ""}${val(o.props) ? ` Props: ${val(o.props)}.` : ""}${o.palOk && colors ? ` Colour palette: ${colors}.` : ""}`;
    return `${styleText(st)}. Character design sheet of ${nameOf(p, e.id)}${subject ? `, ${subject}` : ""}.${look ? ` ${cap(look)}.` : ""}${wear} ${LAYOUT}`;
  }
  function recompose(p, e, o) {
    const next = compose(p, e, o);
    o.prompt.auto = next;
    if (!o.prompt.edited) { o.prompt.text = next; o.prompt.seen = next; }
  }
  const promptStale = (o) => o.prompt.edited && o.prompt.auto !== o.prompt.seen;
  const sigOf = (p, e, o) => String(LB.hash(JSON.stringify([CHAR_FIELDS.map((f) => val(e.profile[f.k])), val(o.garment), val(o.props), o.palette.map((x) => x.c), of(p).style, styleText(of(p))])));

  const filled = (o) => (o.sheet ? 1 : 0);
  const staleSheet = (p, e, o) => !!o.sheet && o.sheet.src === "gen" && (o.sheet.sig !== sigOf(p, e, o) || (!!o.sheet.refRev && (!e.base.sheet || e.base.sheet.rev !== o.sheet.refRev)));
  function sheetOf(p, e, o) {
    if (!o.sheet) return "none";
    if (staleSheet(p, e, o)) return "stale";
    return o.sheet.ok ? "ok" : "draft";
  }
  const hasContent = (e) => e.outfits.some((o) => filled(o) > 0);
  const fieldsOf = (e, o) => [...CHAR_FIELDS.map((f) => [f, e.profile[f.k]]), ...(o.base ? [] : OUTFIT_FIELDS.map((f) => [f, o[f.k]]))];
  const usedFields = (e, o) => fieldsOf(e, o).filter(([, v]) => v.v);
  const gaps = (e, o) => fieldsOf(e, o).filter(([, v]) => !v.v).map(([f]) => f);
  const all = (e) => [e.base, ...e.outfits];
  const aiUsed = (e, o) => usedFields(e, o).filter(([, v]) => v.src === "ai").length;

  function newOutfit(st, name, o = {}) {
    return { id: `O${++st.seq}`, name, garment: fld(), props: fld(), palette: NEUTRAL(), palOk: false, prompt: { text: "", edited: false, auto: "", seen: "" }, sheet: null, ...o };
  }
  function entry(p, id) {
    const st = of(p);
    if (st.chars[id]) return st.chars[id];
    const base = READ[id] || {};
    const profile = {};
    CHAR_FIELDS.forEach((f) => { profile[f.k] = base[f.k] ? { ...base[f.k] } : fld(); });
    const o = newOutfit(st, "Main outfit", { garment: base.garment ? { ...base.garment } : fld(), props: base.props ? { ...base.props } : fld() });
    const root = newOutfit(st, "Character sheet", { base: true, garment: fld(BASE_VI, "user", [], BASE_EN), palette: pal(["White", "white", "#f2f2ee"], ["White", "white", "#f2f2ee"], ["White", "white", "#f2f2ee"]), palOk: true });
    const e = { id, profile, base: root, outfits: [o], sel: o.id, kbSnap: kbSig(id) };
    st.chars[id] = e;
    all(e).forEach((q) => recompose(p, e, q));
    return e;
  }
  function applyGuess(e, o, src) {
    const g = GUESS[e.id];
    if (!g) return 0;
    let n = 0;
    CHAR_FIELDS.forEach((f) => { if (!e.profile[f.k].v && g[f.k]) { e.profile[f.k] = fld(g[f.k].v, src, [], g[f.k].en, g[f.k].why); n++; } });
    if (o === e.outfits[0]) {
      ["garment", "props"].forEach((k) => { if (!o[k].v && g[k]) { o[k] = fld(g[k].v, src, [], g[k].en, g[k].why); n++; } });
      if (g.palette && !o.palOk) { o.palette = g.palette.map((x) => ({ ...x })); o.palOk = true; n++; }
    }
    return n;
  }

  function seedChar(p, id, how) {
    const e = entry(p, id);
    const o = e.outfits[0];
    const m = MANUAL.find((x) => x[0] === id);
    if (m) {
      if (m[2]) e.profile.gender = fld(m[2], "user", [], m[3]);
      if (m[4]) e.profile.age = fld(m[4], "user", [], m[5]);
      if (m[6]) o.garment = fld(m[6], "user", [], m[7]);
    } else applyGuess(e, o, how.startsWith("draft") ? "ai" : "user");
    all(e).forEach((q) => recompose(p, e, q));
    const lib = how.split(":")[1];
    const draft = how.startsWith("draft");
    if (!draft) e.base.sheet = { src: "gen", seed: LB.hash(`${id}base`) % 99999, prov: "gemini", at: "2026-11-04 17:40", rev: 1, ok: true, sig: sigOf(p, e, e.base), prompt: e.base.prompt.text, hist: [] };
    const slot = { src: "gen", seed: LB.hash(id) % 99999, prov: "gemini", at: "2026-11-05 18:24", rev: 2, ok: !draft, sig: sigOf(p, e, o), prompt: o.prompt.text, hist: [], ...(e.base.sheet ? { ref: true, refRev: e.base.sheet.rev } : {}) };
    if (lib) { slot.src = "lib"; slot.libId = lib; delete slot.ref; delete slot.refRev; }
    o.sheet = slot;
  }
  function seedProject(p) {
    const st = { style: "oil", prov: "gemini", lock: true, neg: NEG, seq: 0, chars: {}, assign: {}, over: {}, dismissed: [] };
    state.projects[p.id] = st;
    if (p.id === "PRJ-0006") {
      const s = SC.scriptOf(p);
      if (!s.extraCast.length) MANUAL.forEach(([id, name], i) => s.extraCast.push({ id, name, c: i }));
    }
    Object.entries(SEED[p.id] || {}).forEach(([id, how]) => seedChar(p, id, how));
    return st;
  }

  const scenesOf = (u) => {
    const out = [];
    (u.blocks || []).forEach((b) => {
      if (b.type === "scene") out.push({ b, body: [] });
      else if (out.length) out[out.length - 1].body.push(b);
    });
    return out;
  };
  const TEXT_TYPES = ["narration", "action", "dialogue", "heading"];
  const textOf = (blocks) => blocks.filter((b) => TEXT_TYPES.includes(b.type)).map((b) => b.text || "").join(" ");
  const nightOf = (u) => /đêm|trăng|night|moon/i.test(textOf(u.blocks || []));
  const aliasesOf = (ch) => ALIAS[ch.id] || ch.name.split(/\s+/).filter((w) => /^\p{Lu}/u.test(w) && w.length > 2);
  const named = (ch, text) => aliasesOf(ch).some((a) => text.toLowerCase().includes(a.toLowerCase()));
  const uniq = (list) => [...new Set(list)];

  function appear(st, ch, col) {
    const item = kbItem(ch.id);
    const evRefs = item ? item.ev.map((x) => x.p) : [];
    const colRefs = col.scene ? col.scene.refs : col.blocks.map((b) => b.ref).filter(Boolean);
    const speakBlocks = col.blocks.filter((b) => b.type === "dialogue" && b.who === ch.id);
    const inScene = !!col.scene && col.scene.chars.includes(ch.id);
    const nameBlocks = col.blocks.filter((b) => b.text && named(ch, b.text));
    const kbHit = evRefs.filter((r) => colRefs.includes(r));
    const nameHit = nameBlocks.length > 0 || (!!col.scene && named(ch, col.scene.beat || ""));
    if (!speakBlocks.length && !inScene && !nameHit && !kbHit.length) return null;
    const refs = uniq([...kbHit, ...speakBlocks.map((b) => b.ref).filter(Boolean), ...nameBlocks.map((b) => b.ref).filter(Boolean), ...(nameHit && col.scene ? col.scene.refs.filter((r) => !evRefs.length || evRefs.includes(r)) : [])]);
    const M = MENTION[ch.id];
    const mention = !!M && refs.length > 0 && refs.every((r) => M.refs.includes(r));
    const how = speakBlocks.length ? "Has dialogue in this part" : inScene ? "Attached to a scene in the script" : nameHit ? "The character’s name appears in the content" : "The Knowledgebase records them as present";
    const auto = mention ? "mention" : "on";
    const ov = st.over[ch.id] && st.over[ch.id][col.key];
    return { mode: ov || auto, auto, refs, how, why: mention ? M.why : "", over: !!ov };
  }
  function outfitFor(st, e, ch, col) {
    const id = st.assign[ch.id] && st.assign[ch.id][col.key];
    return e.outfits.find((o) => o.id === id) || e.outfits[0];
  }

  function analyze(p) {
    const st = of(p);
    const s = SC.scriptOf(p);
    const chars = castOf(p);
    const film = s.cfg.preset === "film";
    const cols = [];
    const miss = [];
    s.units.forEach((u) => {
      const sc = film ? scenesOf(u) : null;
      if (!u.blocks || !u.blocks.length || (film && !sc.length)) { miss.push(u); return; }
      if (film) {
        sc.forEach((x, i) => cols.push({ key: `${u.id}:${x.b.id}`, unit: u, label: `Scene ${i + 1}`, sub: [x.b.loc, x.b.time].filter(Boolean).join(" · "), time: x.b.time, group: `${s.cfg.unit} ${u.no}`, blocks: x.body, scene: x.b }));
      } else cols.push({ key: u.id, unit: u, label: `Ch.${u.ch || u.no}`, sub: u.title, time: nightOf(u) ? "NIGHT" : "", group: "", blocks: u.blocks, scene: null });
    });
    const known = cols.length > 0;
    const rows = chars.map((ch) => {
      const e = entry(p, ch.id);
      const cells = {};
      cols.forEach((col) => { const a = appear(st, ch, col); if (a) cells[col.key] = { ...a, outfit: outfitFor(st, e, ch, col) }; });
      const on = cols.filter((c) => cells[c.key] && cells[c.key].mode === "on");
      const mention = cols.filter((c) => cells[c.key] && cells[c.key].mode === "mention");
      const req = [];
      on.forEach((c) => {
        const o = cells[c.key].outfit;
        const hit = req.find((x) => x.o.id === o.id);
        if (hit) hit.cols.push(c); else req.push({ o, cols: [c] });
      });
      const counted = !known || on.length > 0 || hasContent(e);
      return { ch, e, cells, on, mention, req, needed: on.length > 0, counted };
    });
    const todo = [];
    const spare = [];
    rows.forEach((r) => {
      r.req.forEach((x) => { const sh = sheetOf(p, r.e, x.o); if (sh !== "ok") todo.push({ row: r, o: x.o, cols: x.cols, sheet: sh }); });
      if (known) r.e.outfits.forEach((o) => { if (filled(o) && !r.req.some((x) => x.o.id === o.id)) spare.push({ row: r, o, sheet: sheetOf(p, r.e, o) }); });
    });
    const an = { s, film, chars, cols, miss, rows, known, todo, spare };
    an.sugg = suggest(p, an);
    return an;
  }

  function suggest(p, an) {
    const st = of(p);
    const out = [];
    an.rows.forEach((r) => {
      if (r.e.outfits.length > 1 || !r.on.length) return;
      const night = r.on.filter((c) => c.time === "NIGHT");
      const day = r.on.filter((c) => c.time !== "NIGHT");
      const id = `${r.ch.id}:night`;
      if (!night.length || !day.length || st.dismissed.includes(id)) return;
      const g = NIGHT[r.ch.id] || NIGHT_DEFAULT;
      out.push({ id, row: r, name: "Night outfit", cols: night, garment: g.garment, palette: g.palette, why: `${night.map((c) => c.label).join(", ")} take place at night, while ${day.map((c) => c.label).join(", ")} during the day. ${g.garment.why}` });
    });
    return out;
  }
  function accept(p, sg) {
    const st = of(p);
    const e = sg.row.e;
    const base = e.outfits[0];
    const o = newOutfit(st, sg.name, { garment: fld(sg.garment.v, "ai", [], sg.garment.en, sg.garment.why), props: { ...base.props }, palette: (sg.palette || base.palette).map((x) => ({ ...x })), palOk: true });
    e.outfits.push(o);
    st.assign[sg.row.ch.id] = st.assign[sg.row.ch.id] || {};
    sg.cols.forEach((c) => { st.assign[sg.row.ch.id][c.key] = o.id; });
    recompose(p, e, o);
    return o;
  }

  function progOf(p) {
    const an = analyze(p);
    const rows = an.rows.filter((r) => r.counted);
    const doneOf = (r) => {
      const outs = r.req.length ? r.req.map((x) => x.o) : r.e.outfits.filter((o) => filled(o));
      return outs.length > 0 && outs.every((o) => sheetOf(p, r.e, o) === "ok");
    };
    const done = rows.filter(doneOf).length;
    const stale = rows.filter((r) => r.e.outfits.some((o) => sheetOf(p, r.e, o) === "stale")).length;
    const any = rows.some((r) => hasContent(r.e));
    const state = stale ? "stale" : rows.length && done === rows.length ? "done" : any ? "doing" : "idle";
    return { state, done, total: rows.length, note: `${done}/${rows.length} characters${stale ? ` · ${stale} need review` : ""}` };
  }

  return {
    VIEWS, LAYOUT, FIELDS, CHAR_FIELDS, OUTFIT_FIELDS, SRC, SHEET, STYLES, PROVIDERS, NEG, GUESS, READ, MENTION,
    state, ui: {},
    reseed() { this.state.projects = {}; this.ui = {}; },
    of, castOf, nameOf, entry, analyze, accept, progOf, compose, recompose, promptStale, styleText, sigOf, applyGuess, newOutfit,
    all, BASE_VI, BASE_EN, filled, staleSheet, sheetOf, hasContent, usedFields, gaps, aiUsed, kbItem, kbSig, fld, NEUTRAL, val, cap,
    stamp: () => A.stamp(),
  };
})();
