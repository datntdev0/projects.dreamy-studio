window.NV = (function () {
  const chOf = (p) => parseInt(String(p).split(".")[0], 10);

  const titles = [
    "The Last Lamp", "A Clerk from the Quay", "What the Tide Returned", "The Ledger of Names", "Salt and Glass", "The Bell That Wasn't Rung",
    "Nine Windows, One Shutter", "The Salt Merchant's Debt", "A Light Under the Water", "The Council Counts Back", "Low Tide Arithmetic", "The Keeper's Answer",
  ];
  const words = [2140, 1980, 2310, 2450, 2020, 2760, 2190, 2600, 2330, 2880, 2410, 3050];

  const SRC = {
    1: [
      "Every evening at dusk, Wren Aldous climbed the three hundred and twelve steps of the Lantern Tower and lit the last lamp of Harrowmere.",
      "The other lamps had gone dark years ago, when the fog took the harbor and the ships stopped coming. Only Wren remembered what the lamps had been for.",
      "\"You are wasting oil,\" said a voice behind her. The harbor clerk had climbed the stairs without a sound, a thin man in a grey coat with a ledger pressed to his chest. \"The Council has not paid for it in six winters.\"",
      "Wren did not turn around. \"The Council does not light the lamp,\" she said. \"I do.\"",
      "The clerk introduced himself as Maro Quill, and said he had been sent to count what remained of Harrowmere. He did not say who had sent him.",
      "Below them the fog lay thick over the Drowned Quay, and for a moment the lamp's light seemed to reach all the way down to the water.",
    ],
    2: [
      "Maro Quill slept badly in the room above the salt merchant's shop. In the morning he found Lady Sevrin's letter folded inside his ledger, though he had not put it there.",
      "\"Count the lamps,\" the letter said. \"Count the keeper. Tell me whether the light still answers.\" It was signed with a single sunburst, the mark of the Council's chair.",
      "He walked the empty streets until noon. Every window was shuttered, yet he felt watched from behind each one, as if the town were holding its breath.",
      "At the Drowned Quay an old woman sold him tea and a warning. \"The keeper does not light the lamp for the ships,\" she said. \"She lights it for what is still under the water.\"",
      "Maro wrote nothing in his ledger that day. For the first time in his career, he did not know what to count.",
    ],
    3: [
      "On the seventh night the tide went out farther than anyone alive had seen, and the Drowned Quay lay bare under the moon.",
      "Among the black stones lay a ship's bell, green with age, its rope still tied in a knot Wren recognised. It was her father's knot.",
      "She carried the bell up the three hundred and twelve steps and hung it beside the lamp. It did not ring, but the flame bent toward it.",
      "Below, Maro Quill stood at the foot of the tower with his ledger open, and for once he was not counting.",
    ],
  };

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
    { id: "E09", kind: "entity", type: "character", name: "Cha của Wren", summary: "Người từng buộc chiếc chuông tàu bằng một nút thắt mà Wren nhận ra. Văn bản không nêu tên.", attrs: [["Quan hệ", "Cha của Wren"]], cert: "inferred", ev: [["3.2", "It was her father's knot."]], pos: { x: 70, y: 70 } },
    { id: "E10", kind: "entity", type: "object", name: "Chiếc chuông tàu", summary: "Chiếc chuông xanh rêu được thủy triều trả lại, sau đó được treo cạnh ngọn đèn. Không kêu, nhưng ngọn lửa nghiêng về phía nó.", attrs: [["Tình trạng", "Xanh rêu, không kêu"], ["Vị trí hiện tại", "Cạnh ngọn đèn, Tháp Đèn"]], cert: "text", ev: [["3.2", "a ship's bell, green with age"], ["3.3", "hung it beside the lamp"]], pos: { x: 230, y: 40 } },
    { id: "V05", kind: "event", name: "Thủy triều rút xa nhất", summary: "Vào đêm thứ bảy, thủy triều rút xa hơn bất kỳ ai còn sống từng thấy; Bến Chìm lộ ra dưới trăng.", when: "Đêm thứ bảy (Ch.3)", order: 5, cert: "text", ev: [["3.1", "On the seventh night the tide went out farther than anyone alive had seen"]] },
    { id: "V06", kind: "event", name: "Wren tìm thấy chiếc chuông tàu", summary: "Wren nhận ra nút thắt của cha trên sợi dây chuông.", when: "Đêm thứ bảy (Ch.3)", order: 6, cert: "text", ev: [["3.2", "a knot Wren recognised"]] },
    { id: "V07", kind: "event", name: "Wren treo chuông cạnh ngọn đèn", summary: "Chuông không kêu nhưng ngọn lửa nghiêng về phía nó.", when: "Đêm thứ bảy (Ch.3)", order: 7, cert: "text", ev: [["3.3", "the flame bent toward it"]] },
    { id: "R09", kind: "relation", from: "E10", to: "E09", label: "do cha của Wren buộc", cert: "inferred", ev: [["3.2", "It was her father's knot."]] },
    { id: "R10", kind: "relation", from: "E01", to: "E10", label: "tìm thấy và treo", cert: "text", ev: [["3.2", "a ship's bell"], ["3.3", "She carried the bell up"]] },
  ];

  /* ontology.yml của novel: nguồn duy nhất cho phân tích (LLM) và bộ kiểm tra xung đột (code tất định). */
  const ontology = {
    version: 1,
    language: "vi",
    entityTypes: {
      character: { label: "Nhân vật", hint: "Người, sinh vật có ý chí" },
      place: { label: "Địa điểm", hint: "Nơi chốn, công trình, vùng đất" },
      org: { label: "Tổ chức", hint: "Hội đồng, gia tộc, phe phái" },
      object: { label: "Vật phẩm", hint: "Đồ vật có vai trò trong cốt truyện" },
    },
    attributes: {
      role: { label: "Vai trò", single: true },
      workplace: { label: "Nơi làm việc", single: true },
      occupation: { label: "Nghề", single: true },
      purpose: { label: "Mục đích", single: false },
      title: { label: "Chức vụ", single: true },
      seen_at: { label: "Nơi gặp", single: false },
      steps: { label: "Số bậc", single: true },
      state: { label: "Tình trạng", single: true },
      chair: { label: "Chủ tịch", single: true },
      relation_to: { label: "Quan hệ", single: false },
      location: { label: "Vị trí hiện tại", single: true },
    },
    predicates: {
      keeps_at: { label: "giữ đèn tại", domain: ["character"], range: ["place"] },
      works_for: { label: "làm việc cho", domain: ["character"], range: ["org"] },
      chair_of: { label: "chủ tịch", domain: ["character"], range: ["org"], uniqueRange: true },
      sent_by: { label: "được cử bởi", domain: ["character"], range: ["character"] },
      distrusts: { label: "không tin tưởng", domain: ["character"], range: ["character", "org"] },
      located_in: { label: "nằm trong", domain: ["place"], range: ["place"] },
      present_at: { label: "có mặt tại", domain: ["character"], range: ["place"] },
      made_by: { label: "do ai làm ra", domain: ["object"], range: ["character"] },
      handles: { label: "tìm thấy / sử dụng", domain: ["character"], range: ["object"] },
    },
    event: { fields: ["name", "when", "order", "summary"] },
    certainty: ["text", "claim", "inferred"],
    rules: {
      evidence_quote: { severity: "error", label: "Dẫn chứng khớp văn bản", desc: "Mỗi dẫn chứng phải là đoạn trích có thật trong đoạn nguồn được gắn." },
      relation_signature: { severity: "error", label: "Quan hệ đúng kiểu", desc: "Loại của hai đầu quan hệ phải nằm trong domain và range của predicate." },
      attribute_single: { severity: "error", label: "Thuộc tính một giá trị", desc: "Thuộc tính đánh dấu single chỉ được có một giá trị cho mỗi entity." },
      relation_unique: { severity: "error", label: "Quan hệ duy nhất", desc: "Predicate có unique_range chỉ cho phép một chủ thể trên mỗi đối tượng." },
      entity_duplicate: { severity: "warning", label: "Entity trùng lặp", desc: "Hai entity cùng loại có tên trùng hoặc tên này nằm trong tên kia." },
      dangling_ref: { severity: "error", label: "Quan hệ trỏ đúng entity", desc: "Hai đầu quan hệ phải là entity còn hiệu lực (chưa bị từ chối)." },
      source_stale: { severity: "warning", label: "Nguồn chưa bị sửa", desc: "Đoạn nguồn gắn với nhận định đã được sửa sau lần phân tích." },
    },
  };
  const attrByLabel = Object.fromEntries(Object.entries(ontology.attributes).map(([k, a]) => [a.label, k]));
  const PRED = { R01: "keeps_at", R02: "works_for", R03: "chair_of", R04: "sent_by", R05: "distrusts", R06: "located_in", R07: "located_in", R08: "present_at", R09: "made_by", R10: "handles" };

  function seed() {
    const chapters = titles.map((t, i) => ({ n: i + 1, title: t, words: words[i], paras: SRC[i + 1] ? SRC[i + 1].map((tx, j) => ({ id: `${i + 1}.${j + 1}`, t: tx })) : null }));

    const trParas = (ch) => Object.fromEntries(SRC[ch].map((_, j) => {
      const id = `${ch}.${j + 1}`;
      return [id, { t: VI[id], st: "draft", notes: [] }];
    }));
    const tr = {
      lang: "Tiếng Việt",
      provider: "claude",
      guidelines: {
        purpose: "release", // research | release
        audience: "Độc giả trưởng thành yêu thích fantasy u tối",
        tone: "Trang trọng, nhịp câu chậm, hơi cổ",
        pronouns: "Ngôi thứ ba dùng “cô” / “anh”. Không dùng “hắn”, “nàng”.",
        conventions: "Giữ nguyên tên riêng. Địa danh có nghĩa thì dịch nghĩa (Tháp Đèn, Bến Chìm). Dùng dấu “ ” cho lời thoại.",
        version: 3,
      },
      dict: [
        { id: "D01", src: "Wren Aldous", dst: "Wren Aldous", type: "name", note: "Giữ nguyên" },
        { id: "D02", src: "Maro Quill", dst: "Maro Quill", type: "name", note: "Giữ nguyên" },
        { id: "D03", src: "Lady Sevrin", dst: "Phu nhân Sevrin", type: "title", note: "" },
        { id: "D04", src: "Lantern Tower", dst: "Tháp Đèn", type: "place", note: "" },
        { id: "D05", src: "Drowned Quay", dst: "Bến Chìm", type: "place", note: "Dịch nghĩa" },
        { id: "D06", src: "Harrowmere", dst: "Harrowmere", type: "place", note: "Giữ nguyên" },
        { id: "D07", src: "Council", dst: "Hội đồng", type: "org", note: "" },
        { id: "D08", src: "harbor clerk", dst: "thư lại bến cảng", type: "title", note: "" },
        { id: "D09", src: "keeper", dst: "người giữ đèn", type: "term", note: "Đổi từ “người coi đèn” ở v3 để nhất quán" },
        { id: "D10", src: "ledger", dst: "sổ cái", type: "term", note: "" },
      ],
      chapters: {
        1: { status: "draft", paras: trParas(1) },
        2: { status: "draft", paras: trParas(2) },
      },
      warnings: [
        { id: "W01", kind: "source", ch: 1, p: "1.3", reason: "Đoạn nguồn đã được sửa sau khi dịch.", before: "…has not paid for it in five winters.", after: "…has not paid for it in six winters.", date: "2026-11-08 20:41", state: "open" },
        { id: "W02", kind: "dict", ch: 2, p: "2.4", reason: "Từ điển v3: “keeper” → “người giữ đèn”, nhưng đoạn dịch còn dùng “người coi đèn”.", before: "người coi đèn", after: "người giữ đèn", date: "2026-11-09 09:15", state: "open" },
      ],
      suggestions: [
        { id: "S01", ch: 2, p: "2.4", kind: "Nhất quán thuật ngữ", text: "Đoạn dùng “người coi đèn”, trong khi từ điển và chương 2 ¶2 dùng “người giữ đèn”.", quote: "“The keeper does not light the lamp for the ships,” she said.", revise: "“Người giữ đèn không thắp đèn cho tàu thuyền,” bà nói. “Cô ấy thắp cho những thứ còn nằm dưới nước.”", state: "open" },
        { id: "S02", ch: 1, p: "1.5", kind: "Mô-típ lặp lại", text: "Cả truyện lặp lại động từ “count” (đếm). Bản dịch dùng “kiểm kê”, làm mất liên kết với thư ở chương 2.", quote: "…he had been sent to count what remained of Harrowmere.", revise: "Viên thư lại tự giới thiệu tên là Maro Quill, và nói anh được cử đến để đếm những gì còn lại của Harrowmere. Anh không nói ai đã cử mình.", state: "open" },
        { id: "S03", ch: 1, p: "1.3", kind: "Đúng nghĩa", text: "Bản gốc đã sửa thành “six winters” nhưng bản dịch còn ghi “năm mùa đông”.", quote: "“The Council has not paid for it in six winters.”", revise: "“Hội đồng đã sáu mùa đông không trả tiền cho nó.”", state: "open" },
      ],
    };
    tr.chapters[1].paras["1.4"].notes.push({ text: "Giọng Wren cần cộc và lạnh. Cân nhắc bỏ “đâu có”.", date: "2026-11-07 22:10" });
    tr.chapters[1].paras["1.4"].st = "edited";
    tr.chapters[1].paras["1.3"].st = "review";
    tr.chapters[2].paras["2.4"].st = "review";

    const ev = (a) => a.map(([p, q]) => ({ p, q }));
    const kb = {
      upTo: 3,
      analyzed: { 1: "done", 2: "done" },
      lang: "Tiếng Việt",
      types: { character: true, place: true, org: true, event: true, relation: true, object: true },
      items: [
        { id: "E01", kind: "entity", type: "character", name: "Wren Aldous", summary: "Người giữ đèn cuối cùng của Harrowmere. Mỗi chiều chạng vạng, cô leo lên Tháp Đèn để thắp ngọn đèn duy nhất còn lại.", attrs: [["Vai trò", "Người giữ đèn"], ["Nơi làm việc", "Tháp Đèn"]], cert: "text", status: "confirmed", ev: ev([["1.1", "Wren Aldous climbed the three hundred and twelve steps of the Lantern Tower and lit the last lamp of Harrowmere."], ["1.4", "“The Council does not light the lamp,” she said. “I do.”"]]), pos: { x: 120, y: 120 } },
        { id: "E02", kind: "entity", type: "character", name: "Maro Quill", summary: "Thư lại bến cảng, được cử đến để đếm những gì còn lại của Harrowmere. Không nói ai đã cử mình.", attrs: [["Nghề", "Thư lại bến cảng"], ["Mục đích", "Kiểm kê Harrowmere"]], cert: "text", status: "confirmed", ev: ev([["1.3", "The harbor clerk had climbed the stairs without a sound"], ["1.5", "The clerk introduced himself as Maro Quill"]]), pos: { x: 110, y: 250 } },
        { id: "E03", kind: "entity", type: "character", name: "Phu nhân Sevrin", summary: "Người viết thư cho Maro. Dấu mặt trời tỏa tia ở cuối thư là dấu của chủ tịch Hội đồng.", attrs: [["Chức vụ", "Chủ tịch Hội đồng (theo dấu thư)"]], cert: "text", status: "proposed", ev: ev([["2.1", "Lady Sevrin's letter folded inside his ledger"], ["2.2", "the mark of the Council's chair"]]), pos: { x: 310, y: 190 } },
        { id: "E04", kind: "entity", type: "character", name: "Bà lão bán trà", summary: "Bà lão ở Bến Chìm, cảnh báo Maro rằng người giữ đèn thắp đèn cho những thứ dưới nước.", attrs: [["Nơi gặp", "Bến Chìm"]], cert: "text", status: "proposed", ev: ev([["2.4", "an old woman sold him tea and a warning"]]), pos: { x: 190, y: 330 } },
        { id: "E05", kind: "entity", type: "place", name: "Tháp Đèn", summary: "Tòa tháp 312 bậc, nơi ngọn đèn cuối cùng của Harrowmere được thắp.", attrs: [["Số bậc", "312"]], cert: "text", status: "confirmed", ev: ev([["1.1", "the three hundred and twelve steps of the Lantern Tower"]]), pos: { x: 320, y: 70 } },
        { id: "E06", kind: "entity", type: "place", name: "Bến Chìm", summary: "Bến cảng phủ sương mù. Nhìn từ Tháp Đèn, ánh đèn dường như vươn xuống tận mặt nước ở đây.", attrs: [], cert: "text", status: "proposed", ev: ev([["1.6", "the fog lay thick over the Drowned Quay"], ["2.4", "At the Drowned Quay an old woman sold him tea"]]), pos: { x: 360, y: 305 } },
        { id: "E07", kind: "entity", type: "place", name: "Harrowmere", summary: "Thị trấn cảng bị sương mù nuốt từ nhiều năm trước; tàu thuyền ngừng ghé và hầu hết đèn đã tắt.", attrs: [["Tình trạng", "Vắng, bị sương mù bao phủ"]], cert: "text", status: "confirmed", ev: ev([["1.1", "the last lamp of Harrowmere"], ["1.2", "the fog took the harbor and the ships stopped coming"]]), pos: { x: 520, y: 170 } },
        { id: "E08", kind: "entity", type: "org", name: "Hội đồng Harrowmere", summary: "Cơ quan quản lý thị trấn. Theo lời Maro, đã sáu mùa đông không trả tiền dầu đèn.", attrs: [["Chủ tịch", "Phu nhân Sevrin (suy ra)"]], cert: "claim", status: "proposed", ev: ev([["1.3", "“The Council has not paid for it in six winters.”"], ["1.4", "“The Council does not light the lamp,” she said."]]), pos: { x: 520, y: 300 }, stale: "Đoạn nguồn 1.3 đã sửa ngày 08/11/2026: “five winters” → “six winters”." },
        { id: "V01", kind: "event", name: "Sương mù nuốt bến cảng", summary: "Sương mù phủ bến cảng; tàu thuyền ngừng ghé và các ngọn đèn lần lượt tắt.", when: "Nhiều năm trước", order: 1, cert: "text", status: "confirmed", ev: ev([["1.2", "when the fog took the harbor and the ships stopped coming"]]) },
        { id: "V02", kind: "event", name: "Hội đồng ngừng trả tiền dầu", summary: "Hội đồng không còn trả tiền dầu đèn.", when: "Sáu mùa đông trước", order: 2, cert: "claim", status: "proposed", ev: ev([["1.3", "“The Council has not paid for it in six winters.”"]]), stale: "Đoạn nguồn 1.3 đã sửa ngày 08/11/2026: “five winters” → “six winters”." },
        { id: "V03", kind: "event", name: "Maro leo Tháp Đèn gặp Wren", summary: "Maro đến Tháp Đèn lúc chạng vạng và tự giới thiệu.", when: "Chạng vạng (Ch.1)", order: 3, cert: "text", status: "confirmed", ev: ev([["1.3", "a voice behind her"], ["1.5", "The clerk introduced himself as Maro Quill"]]) },
        { id: "V04", kind: "event", name: "Maro tìm thấy thư của Sevrin", summary: "Lá thư ra lệnh: đếm đèn, đếm người giữ đèn, báo xem ánh sáng còn đáp lại hay không.", when: "Sáng hôm sau (Ch.2)", order: 4, cert: "text", status: "proposed", ev: ev([["2.1", "he found Lady Sevrin's letter folded inside his ledger"], ["2.2", "“Count the lamps,” the letter said."]]) },
        { id: "R01", kind: "relation", from: "E01", to: "E05", label: "giữ đèn tại", cert: "text", status: "confirmed", ev: ev([["1.1", "climbed … the Lantern Tower and lit the last lamp"]]) },
        { id: "R02", kind: "relation", from: "E02", to: "E08", label: "làm việc cho", cert: "inferred", status: "proposed", ev: ev([["1.3", "“The Council has not paid for it in six winters.”"]]) },
        { id: "R03", kind: "relation", from: "E03", to: "E08", label: "chủ tịch", cert: "text", status: "proposed", ev: ev([["2.2", "the mark of the Council's chair"]]) },
        { id: "R04", kind: "relation", from: "E02", to: "E03", label: "được cử bởi", cert: "inferred", status: "proposed", ev: ev([["1.5", "He did not say who had sent him."], ["2.1", "Lady Sevrin's letter folded inside his ledger"]]) },
        { id: "R05", kind: "relation", from: "E01", to: "E08", label: "không tin tưởng", cert: "claim", status: "proposed", ev: ev([["1.4", "“The Council does not light the lamp,” she said. “I do.”"]]) },
        { id: "R06", kind: "relation", from: "E05", to: "E07", label: "nằm trong", cert: "text", status: "confirmed", ev: ev([["1.1", "the Lantern Tower and lit the last lamp of Harrowmere"]]) },
        { id: "R07", kind: "relation", from: "E06", to: "E07", label: "nằm trong", cert: "inferred", status: "proposed", ev: ev([["1.6", "Below them the fog lay thick over the Drowned Quay"]]) },
        { id: "R08", kind: "relation", from: "E04", to: "E06", label: "bán trà ở", cert: "text", status: "proposed", ev: ev([["2.4", "At the Drowned Quay an old woman sold him tea"]]) },
      ],
      ch3: KB_CH3.map((x) => ({ ...x, status: "proposed", ev: ev(x.ev) })),
      log: [
        { date: "2026-11-08 20:41", text: "Nguồn ch.1 ¶3 được sửa (“five winters” → “six winters”)." },
      ],
    };
    const fixItem = (i) => {
      if (i.kind === "relation") i.pred = PRED[i.id] || i.pred;
      if (i.attrs) i.attrs = i.attrs.map((a) => (Array.isArray(a) ? { k: attrByLabel[a[0]], v: a[1], p: i.ev[0]?.p } : a));
    };
    kb.items.forEach(fixItem);
    kb.ch3.forEach(fixItem);
    // Kết quả "LLM" có sẵn lỗi để Review có việc làm: trùng entity, sai kiểu quan hệ, dẫn chứng bịa, thuộc tính mâu thuẫn.
    kb.items.find((i) => i.id === "E05").attrs.push({ k: "steps", v: "321", p: "3.3" });
    kb.items.push(
      { id: "E11", kind: "entity", type: "character", name: "Maro", summary: "Viên thư lại không biết phải đếm gì ở Bến Chìm.", attrs: [], cert: "text", status: "proposed", ev: ev([["2.5", "Maro wrote nothing in his ledger that day."]]) },
      { id: "R11", kind: "relation", pred: "located_in", from: "E04", to: "E06", label: "nằm trong", cert: "inferred", status: "proposed", ev: ev([["2.4", "At the Drowned Quay an old woman sold him tea"]]) },
      { id: "V08", kind: "event", name: "Wren thắp đèn mỗi đêm", summary: "Wren thắp ngọn đèn cuối cùng vào mỗi đêm.", when: "Mỗi đêm", order: 8, cert: "text", status: "proposed", ev: ev([["1.1", "Wren lit the lamp every night."]]) },
    );
    const novels = [
      { id: "NOV-0001", title: "The Lantern Keeper of Harrowmere", display: "Người Giữ Đèn Harrowmere", author: "Isolde Verran", lang: "EN", langName: "Tiếng Anh", chapters: 12, words: words.reduce((a, b) => a + b, 0), updated: "2026-11-09 09:15", origin: "Nhập từ package", desc: "Người giữ đèn cuối cùng của một thị trấn cảng bị sương mù bao phủ, và viên thư lại được cử đến để đếm những gì còn lại.", cover: ["var(--acc-midnight)", "var(--primary)", "var(--acc-sunset)"], tags: ["fantasy", "dark", "harbor"] },
      { id: "NOV-0002", title: "Ash Under the Glass Sea", display: "Tro Dưới Biển Thủy Tinh", author: "Tomas Hale", lang: "EN", langName: "Tiếng Anh", chapters: 24, words: 61400, updated: "2026-10-30 18:02", origin: "Nhập từ package", desc: "Một thành phố xây trên đáy biển đã hóa thủy tinh.", cover: ["var(--acc-midnight)", "var(--acc-breeze)", "var(--acc-twilight)"], tags: ["sci-fi", "dystopia"] },
      { id: "NOV-0003", title: "Gió Muộn Trên Đồi Thông", author: "Nguyễn Hạ", lang: "VI", langName: "Tiếng Việt", chapters: 8, words: 17850, updated: "2026-11-04 21:30", origin: "Tạo mới", desc: "Bản thảo đang viết dở.", cover: ["var(--acc-sunset)", "var(--secondary)", "var(--acc-midnight)"], tags: ["drama", "draft"] },
    ];

    return { novels, chapters, tr, kb, reader: { novel: "NOV-0001", ch: 1, mode: "read", size: 15, edit: null } };
  }

  const viFresh = {
    "1.3": VI["1.3"].replace("năm mùa đông", "sáu mùa đông"),
    "2.4": VI["2.4"].replace("Người coi đèn", "Người giữ đèn"),
  };

  return { state: seed(), reseed() { this.state = seed(); }, chOf, vi: VI, viFresh, ontology, providers: [
    { id: "claude", name: "Claude Code CLI", ok: true },
    { id: "gemini", name: "Gemini CLI", ok: true },
    { id: "codex", name: "Codex CLI", ok: false, note: "Chưa cài trên máy này" },
  ] };
})();
