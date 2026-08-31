window.NV = (function () {
  const chOf = (p) => parseInt(String(p).split(".")[0], 10);

  const CORPUS = window.NVC;
  const PACK = { lantern: "the-lantern-keeper-of-harrowmere", glass: "ash-under-the-glass-sea", pine: "gio-muon-tren-doi-thong" };
  const ART = { waves: "nhung-con-song-khong-ten" }; // cover-only folder of a novel created in the app (no package)
  const NOVEL_ASSETS = "assets/novel/";
  const corpusOf = (pack) => (CORPUS[pack] ? CORPUS[pack].chapters : []);
  const lantern = corpusOf(PACK.lantern);
  const titles = lantern.map((c) => c.title);
  const words = lantern.map((c) => c.words);
  const SAMPLE_CHAPTERS = 3; // only the first three chapters have a sample translation and knowledge

  const SRC = Object.fromEntries(lantern.slice(0, SAMPLE_CHAPTERS).map((c, i) => [i + 1, c.paras]));

  const VI = {
    "1.1": "Mỗi buổi chiều chạng vạng, Wren Aldous leo ba trăm mười hai bậc thang của Tháp Đèn và thắp ngọn đèn cuối cùng của Harrowmere.",
    "1.2": "Những ngọn đèn khác đã tắt từ nhiều năm trước, khi sương mù nuốt lấy bến cảng và tàu thuyền thôi không còn ghé. Chỉ mình Wren còn nhớ những ngọn đèn ấy từng để làm gì.",
    "1.3": "“Cô đang phí dầu đấy,” một giọng nói vang lên sau lưng. Viên thư lại bến cảng đã leo lên cầu thang mà không phát ra một tiếng động, một người gầy trong chiếc áo khoác xám, ôm chặt cuốn sổ cái trước ngực. “Hội đồng đã năm mùa đông không trả tiền cho nó.”",
    "1.4": "Wren không quay lại. “Hội đồng đâu có thắp đèn,” cô nói. “Tôi thắp.”",
    "1.5": "Viên thư lại tự giới thiệu tên là Maro Quill, và nói anh được cử đến để kiểm kê những gì còn lại của Harrowmere. Anh không nói ai đã cử mình.",
    "1.6": "Bên dưới họ, sương mù phủ dày lên Bến Chìm, và trong thoáng chốc, ánh đèn dường như vươn xuống tận mặt nước.",
    "2.1": "Maro Quill ngủ không yên trong căn phòng phía trên cửa hàng của người buôn muối. Sáng ra, anh thấy lá thư của Phu nhân Sevrin gấp gọn trong cuốn sổ cái, dù anh không hề để nó ở đó.",
    "2.2": "“Hãy đếm những ngọn đèn,” lá thư viết. “Hãy đếm người giữ đèn. Hãy báo cho ta biết ánh sáng ấy có còn đáp lại hay không.” Cuối thư là một biểu tượng mặt trời tỏa tia, dấu hiệu của chủ tịch Hội đồng.",
    "2.3": "Anh đi dọc những con phố vắng đến tận trưa. Cửa sổ nhà nào cũng đóng then, vậy mà sau mỗi ô cửa anh đều cảm thấy có ánh mắt dõi theo, như thể cả thị trấn đang nín thở.",
    "2.4": "Ở Bến Chìm, một bà lão bán cho anh một tách trà và một lời cảnh báo. “Người coi đèn không thắp đèn cho tàu thuyền,” bà nói. “Cô ấy thắp cho những thứ còn nằm dưới nước.”",
    "2.5": "Hôm đó Maro không ghi gì vào cuốn sổ cái. Lần đầu tiên trong sự nghiệp, anh không biết phải đếm cái gì.",
    "3.1": "Vào đêm thứ bảy, thủy triều rút ra xa hơn bất kỳ ai còn sống từng thấy, và Bến Chìm phơi trần dưới ánh trăng.",
    "3.2": "Giữa những tảng đá đen nằm một chiếc chuông tàu, xanh rêu vì năm tháng, sợi dây vẫn buộc bằng một nút thắt mà Wren nhận ra. Đó là nút thắt của cha cô.",
    "3.3": "Cô mang chiếc chuông lên ba trăm mười hai bậc thang và treo nó cạnh ngọn đèn. Nó không kêu, nhưng ngọn lửa nghiêng về phía nó.",
    "3.4": "Bên dưới, Maro Quill đứng dưới chân tháp, cuốn sổ cái mở ra, và lần này anh không đếm gì cả.",
  };

  const KB_CH3 = [
    { id: "E09", kind: "entity", type: "character", name: "Wren’s father", summary: "The one who tied the ship’s bell with a knot Wren recognizes. The text does not give his name.", attrs: [["Relation", "Wren’s father"]], cert: "inferred", ev: [["3.2", "It was her father's knot."]], pos: { x: 70, y: 70 } },
    { id: "E10", kind: "entity", type: "object", name: "The ship’s bell", summary: "The moss-green bell returned by the tide, later hung beside the lamp. It does not ring, but the flame leans toward it.", attrs: [["Condition", "Moss-green, does not ring"], ["Current location", "Beside the lamp, Lantern Tower"]], cert: "text", ev: [["3.2", "a ship's bell, green with age"], ["3.3", "hung it beside the lamp"]], pos: { x: 230, y: 40 } },
    { id: "V05", kind: "event", name: "Lowest tide", summary: "On the seventh night, the tide drew out farther than anyone alive had seen; Sunken Wharf was exposed under the moon.", when: "Seventh night (Ch.3)", order: 5, cert: "text", ev: [["3.1", "On the seventh night the tide went out farther than anyone alive had seen"]] },
    { id: "V06", kind: "event", name: "Wren finds the ship’s bell", summary: "Wren recognizes her father’s knot on the bell’s rope.", when: "Seventh night (Ch.3)", order: 6, cert: "text", ev: [["3.2", "a knot Wren recognised"]] },
    { id: "V07", kind: "event", name: "Wren hangs the bell beside the lamp", summary: "The bell does not ring but the flame leans toward it.", when: "Seventh night (Ch.3)", order: 7, cert: "text", ev: [["3.3", "the flame bent toward it"]] },
    { id: "R09", kind: "relation", from: "E10", to: "E09", label: "tied by Wren’s father", cert: "inferred", ev: [["3.2", "It was her father's knot."]] },
    { id: "R10", kind: "relation", from: "E01", to: "E10", label: "found and hung", cert: "text", ev: [["3.2", "a ship's bell"], ["3.3", "She carried the bell up"]] },
  ];

  /* the novel’s ontology.yml: the single source for analysis (LLM) and the conflict checker (deterministic code). */
  const ontology = {
    version: 1,
    language: "vi",
    entityTypes: {
      character: { label: "Characters", hint: "People, beings with a will" },
      place: { label: "Location", hint: "Places, structures, lands" },
      org: { label: "Organizations", hint: "Councils, families, factions" },
      object: { label: "Object", hint: "Objects that play a role in the plot" },
    },
    attributes: {
      role: { label: "Role", single: true },
      workplace: { label: "Workplace", single: true },
      occupation: { label: "Occupation", single: true },
      purpose: { label: "Purpose", single: false },
      title: { label: "Position", single: true },
      seen_at: { label: "Meeting place", single: false },
      steps: { label: "Step count", single: true },
      state: { label: "Condition", single: true },
      chair: { label: "Chair", single: true },
      relation_to: { label: "Relation", single: false },
      location: { label: "Current location", single: true },
    },
    predicates: {
      keeps_at: { label: "keeps the lamp at", domain: ["character"], range: ["place"] },
      works_for: { label: "works for", domain: ["character"], range: ["org"] },
      chair_of: { label: "chair of", domain: ["character"], range: ["org"], uniqueRange: true },
      sent_by: { label: "sent by", domain: ["character"], range: ["character"] },
      distrusts: { label: "distrusts", domain: ["character"], range: ["character", "org"] },
      located_in: { label: "located in", domain: ["place"], range: ["place"] },
      present_at: { label: "present at", domain: ["character"], range: ["place"] },
      made_by: { label: "made by", domain: ["object"], range: ["character"] },
      handles: { label: "found / used", domain: ["character"], range: ["object"] },
    },
    event: { fields: ["name", "when", "order", "summary"] },
    certainty: ["text", "claim", "inferred"],
    rules: {
      evidence_quote: { severity: "error", label: "Evidence matches the text", desc: "Each piece of evidence must be a real excerpt from the attached source paragraph." },
      relation_signature: { severity: "error", label: "Correct relation types", desc: "The types at both ends of a relation must be within the predicate’s domain and range." },
      attribute_single: { severity: "error", label: "Single-valued attributes", desc: "An attribute marked single may only have one value per entity." },
      relation_unique: { severity: "error", label: "Unique relation", desc: "A predicate with unique_range allows only one subject per object." },
      entity_duplicate: { severity: "warning", label: "Duplicate entities", desc: "Two entities of the same type have the same name or one name is contained in the other." },
      dangling_ref: { severity: "error", label: "Relations point to valid entities", desc: "Both ends of a relation must be valid entities (not rejected)." },
      source_stale: { severity: "warning", label: "Source not edited", desc: "The source paragraph attached to the claim was edited after the analysis." },
    },
  };
  const attrByLabel = Object.fromEntries(Object.entries(ontology.attributes).map(([k, a]) => [a.label, k]));
  const PRED = { R01: "keeps_at", R02: "works_for", R03: "chair_of", R04: "sent_by", R05: "distrusts", R06: "located_in", R07: "located_in", R08: "present_at", R09: "made_by", R10: "handles" };

  function seed() {
    const chapters = titles.map((t, i) => ({ n: i + 1, title: t, words: words[i], paras: SRC[i + 1] ? SRC[i + 1].map((tx, j) => ({ id: `${i + 1}.${j + 1}`, t: tx })) : null,
      // Chapters beyond the sample translation/knowledge keep their text here so the reader can still show and edit them without the other modules treating them as analysed.
      body: SRC[i + 1] ? undefined : (lantern[i].paras || []).map((tx, j) => ({ id: `${i + 1}.${j + 1}`, t: tx })) }));

    const trParas = (ch) => Object.fromEntries(SRC[ch].map((_, j) => {
      const id = `${ch}.${j + 1}`;
      return [id, { t: VI[id], st: "draft", notes: [] }];
    }));
    const tr = {
      lang: "Vietnamese",
      provider: "claude",
      guidelines: {
        purpose: "release", // research | release
        audience: "Adult readers who love dark fantasy",
        tone: "Formal, slow sentence rhythm, slightly archaic",
        pronouns: "Third person uses “cô” / “anh”. Do not use “hắn”, “nàng”.",
        conventions: "Keep proper names. Place names with a meaning are translated by meaning (Tháp Đèn, Bến Chìm). Use “ ” marks for dialogue.",
        version: 3,
      },
      dict: [
        { id: "D01", src: "Wren Aldous", dst: "Wren Aldous", type: "name", note: "Keep as is" },
        { id: "D02", src: "Maro Quill", dst: "Maro Quill", type: "name", note: "Keep as is" },
        { id: "D03", src: "Lady Sevrin", dst: "Phu nhân Sevrin", type: "title", note: "" },
        { id: "D04", src: "Lantern Tower", dst: "Tháp Đèn", type: "place", note: "" },
        { id: "D05", src: "Drowned Quay", dst: "Bến Chìm", type: "place", note: "Translate by meaning" },
        { id: "D06", src: "Harrowmere", dst: "Harrowmere", type: "place", note: "Keep as is" },
        { id: "D07", src: "Council", dst: "Hội đồng", type: "org", note: "" },
        { id: "D08", src: "harbor clerk", dst: "thư lại bến cảng", type: "title", note: "" },
        { id: "D09", src: "keeper", dst: "người giữ đèn", type: "term", note: "Changed from “người coi đèn” in v3 for consistency" },
        { id: "D10", src: "ledger", dst: "sổ cái", type: "term", note: "" },
      ],
      chapters: {
        1: { status: "draft", paras: trParas(1) },
        2: { status: "draft", paras: trParas(2) },
      },
      warnings: [
        { id: "W01", kind: "source", ch: 1, p: "1.3", reason: "The source passage was edited after translation.", before: "…has not paid for it in five winters.", after: "…has not paid for it in six winters.", date: "2026-11-08 20:41", state: "open" },
        { id: "W02", kind: "dict", ch: 2, p: "2.4", reason: "Dictionary v3: “keeper” → “người giữ đèn”, but the translated passage still uses “người coi đèn”.", before: "người coi đèn", after: "người giữ đèn", date: "2026-11-09 09:15", state: "open" },
      ],
      suggestions: [
        { id: "S01", ch: 2, p: "2.4", kind: "Terminology consistency", text: "The passage uses “người coi đèn”, while the dictionary and chapter 2 ¶2 use “người giữ đèn”.", quote: "“The keeper does not light the lamp for the ships,” she said.", revise: "“Người giữ đèn không thắp đèn cho tàu thuyền,” bà nói. “Cô ấy thắp cho những thứ còn nằm dưới nước.”", state: "open" },
        { id: "S02", ch: 1, p: "1.5", kind: "Recurring motif", text: "The whole story repeats the verb “count” (đếm). The translation uses “kiểm kê”, losing the link to the letter in chapter 2.", quote: "…he had been sent to count what remained of Harrowmere.", revise: "Viên thư lại tự giới thiệu tên là Maro Quill, và nói anh được cử đến để đếm những gì còn lại của Harrowmere. Anh không nói ai đã cử mình.", state: "open" },
        { id: "S03", ch: 1, p: "1.3", kind: "Accurate meaning", text: "The source was edited to “six winters” but the translation still says “năm mùa đông”.", quote: "“The Council has not paid for it in six winters.”", revise: "“Hội đồng đã sáu mùa đông không trả tiền cho nó.”", state: "open" },
      ],
    };
    tr.chapters[1].paras["1.4"].notes.push({ text: "Wren’s voice should be curt and cold. Consider dropping “đâu có”.", date: "2026-11-07 22:10" });
    tr.chapters[1].paras["1.4"].st = "edited";
    tr.chapters[1].paras["1.3"].st = "review";
    tr.chapters[2].paras["2.4"].st = "review";

    const ev = (a) => a.map(([p, q]) => ({ p, q }));
    const kb = {
      upTo: 3,
      analyzed: { 1: "done", 2: "done" },
      lang: "Vietnamese",
      types: { character: true, place: true, org: true, event: true, relation: true, object: true },
      items: [
        { id: "E01", kind: "entity", type: "character", name: "Wren Aldous", summary: "The last lamp keeper of Harrowmere. Every dusk she climbs the Lantern Tower to light the only lamp left.", attrs: [["Role", "Lamp keeper"], ["Workplace", "Tháp Đèn"]], cert: "text", status: "confirmed", ev: ev([["1.1", "Wren Aldous climbed the three hundred and twelve steps of the Lantern Tower and lit the last lamp of Harrowmere."], ["1.4", "“The Council does not light the lamp,” she said. “I do.”"]]), pos: { x: 120, y: 120 } },
        { id: "E02", kind: "entity", type: "character", name: "Maro Quill", summary: "Harbor clerk, sent to count what is left of Harrowmere. Does not say who sent him.", attrs: [["Occupation", "Harbor clerk"], ["Purpose", "Harrowmere inventory"]], cert: "text", status: "confirmed", ev: ev([["1.3", "The harbor clerk had climbed the stairs without a sound"], ["1.5", "The clerk introduced himself as Maro Quill"]]), pos: { x: 110, y: 250 } },
        { id: "E03", kind: "entity", type: "character", name: "Phu nhân Sevrin", summary: "The writer of the letter to Maro. The radiating sun mark at the end of the letter is the mark of the Council chair.", attrs: [["Position", "Council chair (by the letter’s mark)"]], cert: "text", status: "proposed", ev: ev([["2.1", "Lady Sevrin's letter folded inside his ledger"], ["2.2", "the mark of the Council's chair"]]), pos: { x: 310, y: 190 } },
        { id: "E04", kind: "entity", type: "character", name: "Tea-selling old woman", summary: "An old woman at Sunken Wharf, warns Maro that the lamp keeper lights the lamp for things under the water.", attrs: [["Meeting place", "Bến Chìm"]], cert: "text", status: "proposed", ev: ev([["2.4", "an old woman sold him tea and a warning"]]), pos: { x: 190, y: 330 } },
        { id: "E05", kind: "entity", type: "place", name: "Tháp Đèn", summary: "A 312-step tower, where the last lamp of Harrowmere is lit.", attrs: [["Step count", "312"]], cert: "text", status: "confirmed", ev: ev([["1.1", "the three hundred and twelve steps of the Lantern Tower"]]), pos: { x: 320, y: 70 } },
        { id: "E06", kind: "entity", type: "place", name: "Bến Chìm", summary: "The fog-covered harbor. Seen from the Lantern Tower, the lamplight seems to reach down to the water here.", attrs: [], cert: "text", status: "proposed", ev: ev([["1.6", "the fog lay thick over the Drowned Quay"], ["2.4", "At the Drowned Quay an old woman sold him tea"]]), pos: { x: 360, y: 305 } },
        { id: "E07", kind: "entity", type: "place", name: "Harrowmere", summary: "A harbor town swallowed by fog years ago; ships stopped calling and most lamps went out.", attrs: [["Condition", "Deserted, covered in fog"]], cert: "text", status: "confirmed", ev: ev([["1.1", "the last lamp of Harrowmere"], ["1.2", "the fog took the harbor and the ships stopped coming"]]), pos: { x: 520, y: 170 } },
        { id: "E08", kind: "entity", type: "org", name: "Harrowmere Council", summary: "The town’s governing body. According to Maro, it has not paid for lamp oil for six winters.", attrs: [["Chair", "Lady Severin (inferred)"]], cert: "claim", status: "proposed", ev: ev([["1.3", "“The Council has not paid for it in six winters.”"], ["1.4", "“The Council does not light the lamp,” she said."]]), pos: { x: 520, y: 300 }, stale: "Source paragraph 1.3 edited on 08/11/2026: “five winters” → “six winters”." },
        { id: "V01", kind: "event", name: "Fog swallows the harbor", summary: "Fog covers the harbor; ships stop calling and the lamps go out one by one.", when: "Years ago", order: 1, cert: "text", status: "confirmed", ev: ev([["1.2", "when the fog took the harbor and the ships stopped coming"]]) },
        { id: "V02", kind: "event", name: "The Council stops paying for oil", summary: "The Council no longer pays for lamp oil.", when: "Six winters ago", order: 2, cert: "claim", status: "proposed", ev: ev([["1.3", "“The Council has not paid for it in six winters.”"]]), stale: "Source paragraph 1.3 edited on 08/11/2026: “five winters” → “six winters”." },
        { id: "V03", kind: "event", name: "Maro climbs the Lantern Tower to meet Wren", summary: "Maro arrives at the Lantern Tower at dusk and introduces himself.", when: "Dusk (Ch.1)", order: 3, cert: "text", status: "confirmed", ev: ev([["1.3", "a voice behind her"], ["1.5", "The clerk introduced himself as Maro Quill"]]) },
        { id: "V04", kind: "event", name: "Maro finds Severin’s letter", summary: "The letter orders: count the lamps, count the lamp keepers, report whether the light still answers.", when: "The next morning (Ch.2)", order: 4, cert: "text", status: "proposed", ev: ev([["2.1", "he found Lady Sevrin's letter folded inside his ledger"], ["2.2", "“Count the lamps,” the letter said."]]) },
        { id: "R01", kind: "relation", from: "E01", to: "E05", label: "keeps the lamp at", cert: "text", status: "confirmed", ev: ev([["1.1", "climbed … the Lantern Tower and lit the last lamp"]]) },
        { id: "R02", kind: "relation", from: "E02", to: "E08", label: "works for", cert: "inferred", status: "proposed", ev: ev([["1.3", "“The Council has not paid for it in six winters.”"]]) },
        { id: "R03", kind: "relation", from: "E03", to: "E08", label: "chair of", cert: "text", status: "proposed", ev: ev([["2.2", "the mark of the Council's chair"]]) },
        { id: "R04", kind: "relation", from: "E02", to: "E03", label: "sent by", cert: "inferred", status: "proposed", ev: ev([["1.5", "He did not say who had sent him."], ["2.1", "Lady Sevrin's letter folded inside his ledger"]]) },
        { id: "R05", kind: "relation", from: "E01", to: "E08", label: "distrusts", cert: "claim", status: "proposed", ev: ev([["1.4", "“The Council does not light the lamp,” she said. “I do.”"]]) },
        { id: "R06", kind: "relation", from: "E05", to: "E07", label: "located in", cert: "text", status: "confirmed", ev: ev([["1.1", "the Lantern Tower and lit the last lamp of Harrowmere"]]) },
        { id: "R07", kind: "relation", from: "E06", to: "E07", label: "located in", cert: "inferred", status: "proposed", ev: ev([["1.6", "Below them the fog lay thick over the Drowned Quay"]]) },
        { id: "R08", kind: "relation", from: "E04", to: "E06", label: "sells tea at", cert: "text", status: "proposed", ev: ev([["2.4", "At the Drowned Quay an old woman sold him tea"]]) },
      ],
      ch3: KB_CH3.map((x) => ({ ...x, status: "proposed", ev: ev(x.ev) })),
      log: [
        { date: "2026-11-08 20:41", text: "Source ch.1 ¶3 was edited (“five winters” → “six winters”)." },
      ],
    };
    const fixItem = (i) => {
      if (i.kind === "relation") i.pred = PRED[i.id] || i.pred;
      if (i.attrs) i.attrs = i.attrs.map((a) => (Array.isArray(a) ? { k: attrByLabel[a[0]], v: a[1], p: i.ev[0]?.p } : a));
    };
    kb.items.forEach(fixItem);
    kb.ch3.forEach(fixItem);
    // Results "LLM" have built-in errors so Review has work to do: duplicate entities, wrong relation types, fabricated evidence, contradictory attributes.
    kb.items.find((i) => i.id === "E05").attrs.push({ k: "steps", v: "321", p: "3.3" });
    kb.items.push(
      { id: "E11", kind: "entity", type: "character", name: "Maro", summary: "The clerk does not know what to count at Sunken Wharf.", attrs: [], cert: "text", status: "proposed", ev: ev([["2.5", "Maro wrote nothing in his ledger that day."]]) },
      { id: "R11", kind: "relation", pred: "located_in", from: "E04", to: "E06", label: "located in", cert: "inferred", status: "proposed", ev: ev([["2.4", "At the Drowned Quay an old woman sold him tea"]]) },
      { id: "V08", kind: "event", name: "Wren lights the lamp every night", summary: "Wren lights the last lamp every night.", when: "Every night", order: 8, cert: "text", status: "proposed", ev: ev([["1.1", "Wren lit the lamp every night."]]) },
    );
    // Newest first, as the app lists them (and as the prototype adds new ones). Seeding runs in reverse so ids ascend in creation order.
    const sumWords = (pack) => corpusOf(pack).reduce((a, c) => a + c.words, 0);
    const novels = [
      { id: "NOV-0004", pack: null, title: "Những Con Sóng Không Tên", author: "Nguyễn Hạ", lang: "VI", langName: "Vietnamese", chapters: 0, words: 0, updated: "2026-11-12 08:20", origin: "Create new", desc: "New idea, no chapters yet.", cover: ["var(--acc-breeze)", "var(--primary)", "var(--acc-midnight)"], coverImg: `${NOVEL_ASSETS}${ART.waves}/cover.png`, coverFile: `${ART.waves}/cover.png`, tags: ["idea"] },
      { id: "NOV-0003", pack: PACK.pine, title: "Gió Muộn Trên Đồi Thông", author: "Nguyễn Hạ", lang: "VI", langName: "Vietnamese", chapters: corpusOf(PACK.pine).length, words: sumWords(PACK.pine), updated: "2026-11-04 21:30", origin: "Imported from package", desc: "Work-in-progress draft.", cover: ["var(--acc-sunset)", "var(--secondary)", "var(--acc-midnight)"], coverImg: `${NOVEL_ASSETS}${PACK.pine}/cover.png`, tags: ["drama", "draft"] },
      { id: "NOV-0002", pack: PACK.glass, title: "Ash Under the Glass Sea", display: "Ash Under the Glass Sea", author: "Tomas Hale", lang: "EN", langName: "English", chapters: corpusOf(PACK.glass).length, words: sumWords(PACK.glass), updated: "2026-10-30 18:02", origin: "Imported from package", desc: "A city built on a seabed that has turned to glass.", cover: ["var(--acc-midnight)", "var(--acc-breeze)", "var(--acc-twilight)"], coverImg: `${NOVEL_ASSETS}${PACK.glass}/cover.png`, tags: ["sci-fi", "dystopia"] },
      { id: "NOV-0001", pack: PACK.lantern, title: "The Lantern Keeper of Harrowmere", display: "The Lantern Keeper of Harrowmere", author: "Isolde Verran", lang: "EN", langName: "English", chapters: lantern.length, words: sumWords(PACK.lantern), updated: "2026-11-09 09:15", origin: "Imported from package", desc: "The last lamp keeper of a fog-covered harbor town, and the clerk sent to count what is left.", cover: ["var(--acc-midnight)", "var(--primary)", "var(--acc-sunset)"], coverImg: `${NOVEL_ASSETS}${PACK.lantern}/cover.png`, tags: ["fantasy", "dark", "harbor"] },
    ];

    return { novels, chapters, tr, kb, reader: { novel: "NOV-0001", ch: 1, mode: "read", size: 15, edit: null } };
  }

  const viFresh = {
    "1.3": VI["1.3"].replace("năm mùa đông", "sáu mùa đông"),
    "2.4": VI["2.4"].replace("Người coi đèn", "Lamp keeper"),
  };

  return { state: seed(), reseed() { this.state = seed(); }, chOf, vi: VI, viFresh, ontology, providers: [
    { id: "claude", name: "Claude Code CLI", ok: true },
    { id: "gemini", name: "Gemini CLI", ok: true },
    { id: "codex", name: "Codex CLI", ok: false, note: "Not installed on this machine" },
  ] };
})();
