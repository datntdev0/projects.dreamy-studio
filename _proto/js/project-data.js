window.PJ = (function () {
  const MB = 1048576;
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  const MODULES = {
    scripting: { stage: "pre", label: "Scripting", icon: "pen", blurb: "Kịch bản lời đọc và kịch bản phân cảnh." },
    character: { stage: "pre", label: "Character", icon: "user", blurb: "Tham chiếu hình ảnh cho nhân vật." },
    world: { stage: "pre", label: "World", icon: "cube", blurb: "Thế giới ba chiều bằng mô hình clays." },
    storyboard: { stage: "pre", label: "Storyboard", icon: "frames", blurb: "Chia phân cảnh và vẽ các khung hình." },
    audiobook: { stage: "prod", label: "Audiobook", icon: "mic", blurb: "Tạo audio từ kịch bản đã chốt." },
    canvas: { stage: "prod", label: "Canvas", icon: "nodes", blurb: "Workflow canvas tạo tài nguyên chất lượng cao." },
    video: { stage: "post", label: "Video editor", icon: "film", blurb: "Dựng và kết xuất video hậu kỳ." },
  };
  const STAGES = [["pre", "Pre-Production"], ["prod", "Production"], ["post", "Post-Production"]];
  const TEMPLATES = {
    audiobook: { label: "Audiobook", icon: "mic", blurb: "Chuyển các chương thành audio có người dẫn chuyện.", modules: ["scripting", "audiobook"] },
    "audiobook-video": { label: "Audiobook minh họa", icon: "film", blurb: "Audiobook kèm tranh minh họa đồng bộ, dựng thành video.", modules: ["scripting", "character", "storyboard", "audiobook", "canvas", "video"] },
    filmseries: { label: "Filmseries", icon: "frames", blurb: "Dựng phim nhiều tập từ kịch bản, nhân vật và thế giới.", modules: ["scripting", "character", "world", "storyboard", "canvas", "video"] },
    blank: { label: "Dự án trống", icon: "folder", blurb: "Tự chọn các module cần dùng.", modules: [] },
  };
  const MOD_STATE = { idle: ["Chưa bắt đầu", ""], doing: ["Đang làm", "badge-running"], done: ["Hoàn tất", "badge-success"], stale: ["Cần xem lại", "badge-warning"] };
  const STATUS = { new: ["MỚI TẠO", ""], active: ["ĐANG LÀM", "badge-running"], done: ["HOÀN TẤT", "badge-success"], archived: ["LƯU TRỮ", ""] };
  const KIND = { script: ["Kịch bản", "pen"], audio: ["Audio", "music"], image: ["Ảnh", "image"], video: ["Video", "film"] };
  const RES_STATE = { approved: ["Đã duyệt", "badge-success"], draft: ["Bản nháp", ""], stale: ["Cần xem lại", "badge-warning"] };

  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const hasVideo = (p) => p.modules.includes("video");
  const prog = (state, done, total, note) => ({ state, done, total, note });

  const fraction = (p, m) => {
    const g = p.prog[m];
    if (!g || g.state === "idle") return 0;
    if (g.state === "done") return 1;
    return g.total ? Math.min(0.99, g.done / g.total) : 0.5;
  };
  const percent = (p) => (p.modules.length ? Math.round((p.modules.reduce((a, m) => a + fraction(p, m), 0) / p.modules.length) * 100) : 0);
  const statusOf = (p) => {
    if (p.archived) return "archived";
    if (p.modules.length && p.modules.every((m) => p.prog[m]?.state === "done")) return "done";
    return p.modules.some((m) => p.prog[m] && p.prog[m].state !== "idle") ? "active" : "new";
  };
  const staleCount = (p) => p.modules.filter((m) => p.prog[m]?.state === "stale").length;

  function resourcesOf(p) {
    const list = [];
    const from = p.range ? p.range[0] : 1;
    const ch = (n) => pad(n);
    const sz = (i, base, span) => base + ((i * 7919) % span);
    const add = (kind, name, size, state, at, dur) => list.push({ id: `${p.id}-R${pad(list.length + 1, 3)}`, kind, name, size, state, at, dur });
    const g = p.prog;
    if (g.scripting) for (let i = 0; i < g.scripting.done; i++) add("script", `ch${ch(from + i)}-script.md`, sz(i, 14000, 9000), "approved", "2026-11-01 19:20");
    if (g.character) for (let i = 0; i < g.character.done; i++) add("image", `character-ref-${pad(i + 1)}.png`, sz(i, 900 * 1024, 700000), "approved", "2026-11-02 18:25");
    if (g.storyboard) for (let i = 0; i < g.storyboard.done * 3; i++) add("image", `frame-ch${ch(from + Math.floor(i / 3))}-${pad((i % 3) + 1)}.png`, sz(i, 1.4 * MB, 900000), i % 7 === 6 ? "draft" : "approved", "2026-11-06 21:10");
    if (g.audiobook) for (let i = 0; i < g.audiobook.done; i++) add("audio", `ch${ch(from + i)}-narration.wav`, sz(i, 38 * MB, 6 * MB), p.staleCh?.includes(from + i) ? "stale" : "approved", "2026-11-07 22:05", 780 + ((i * 53) % 400));
    p.outputs.forEach((o) => add("video", o.name, o.size, "approved", o.at, o.dur));
    return list;
  }
  const sizeOf = (p) => resourcesOf(p).reduce((a, r) => a + r.size, 0);

  function seed() {
    const day = (n, hm = "20:12") => {
      const d = new Date(2026, 10, 10 - n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
    };
    const out = (n, name, dur, w, h, size, at) => ({ id: `OUT-${pad(n, 4)}`, name, dur, w, h, size, at });
    const P = (id, name, o) => ({
      id, name, folder: `projects\\${slug(name)}`, desc: "", novel: null, src: null, range: null, modules: [], prog: {}, outputs: [], attention: [], activity: [], archived: false, ...o,
    });

    const projects = [
      P("PRJ-0001", "Harrowmere — Audiobook", {
        template: "audiobook-video", desc: "Audiobook có minh họa cho 12 chương đầu của The Lantern Keeper of Harrowmere, đăng lên kênh chính.",
        novel: "NOV-0001", src: { kind: "translation", lang: "VI" }, range: [1, 12], staleCh: [3, 5],
        modules: ["scripting", "character", "storyboard", "audiobook", "canvas", "video"],
        prog: {
          scripting: prog("doing", 11, 12, "11/12 chương đã chốt · chương 3 cần rà soát"), character: prog("done", 4, 4, "4 nhân vật"), storyboard: prog("doing", 5, 12, "5/12 chương"),
          audiobook: prog("stale", 8, 12, "8/12 chương · 2 cần xem lại"), canvas: prog("idle", 0, 0, ""), video: prog("doing", 0, 1, "1 timeline · 2 bản xuất"),
        },
        outputs: [out(1, "harrowmere-ch01-lantern-keeper.mp4", 1243, 1920, 1080, 412 * MB, day(3, "22:40")), out(2, "harrowmere-teaser-30s.mp4", 30, 1920, 1080, 38 * MB, day(2, "10:15"))],
        attention: [
          { level: "warn", module: "audiobook", text: "Bản dịch chương 3 và chương 5 đã đổi sau khi tạo audio. 2 đoạn audio cần xem lại và tạo lại." },
          { level: "info", module: "storyboard", text: "7 chương chưa có storyboard, chưa thể minh họa." },
        ],
        activity: [[day(0, "08:40"), "Đánh dấu 2 đoạn audio cần xem lại vì bản dịch thay đổi"], [day(2, "10:15"), "Kết xuất harrowmere-teaser-30s.mp4"], [day(3, "22:40"), "Kết xuất harrowmere-ch01-lantern-keeper.mp4"], [day(6, "21:10"), "Hoàn tất storyboard chương 5"], [day(20, "19:02"), "Tạo project từ template Audiobook minh họa"]],
        created: day(20, "19:02"), updated: day(0, "08:40"), opened: day(0, "09:12"),
      }),
      P("PRJ-0002", "Kênh — Intro", {
        template: "blank", desc: "Đoạn mở đầu dùng chung cho các video của kênh.", modules: ["video"],
        prog: { video: prog("done", 1, 1, "1 timeline · 1 bản xuất") },
        outputs: [out(3, "channel-intro-final.mp4", 8, 1920, 1080, 18 * MB, day(12, "10:42"))],
        activity: [[day(12, "10:42"), "Kết xuất channel-intro-final.mp4"], [day(13, "09:30"), "Tạo project trống"]],
        created: day(13, "09:30"), updated: day(12, "10:42"), opened: day(5, "20:00"),
      }),
      P("PRJ-0003", "Harrowmere — Phim", {
        template: "filmseries", desc: "Mùa 1: tập 1 dựng từ chương 1–2, tập 2 từ chương 3.", novel: "NOV-0001", src: { kind: "translation", lang: "VI" }, range: [1, 3],
        modules: ["scripting", "character", "world", "storyboard", "canvas", "video"],
        prog: { scripting: prog("doing", 0, 2, "0/2 tập đã chốt · tập 1 đang viết"), character: prog("doing", 1, 4, "1/4 nhân vật"), world: prog("idle", 0, 0, ""), storyboard: prog("idle", 0, 0, ""), canvas: prog("idle", 0, 0, ""), video: prog("idle", 0, 0, "") },
        attention: [{ level: "info", module: "world", text: "Chưa có mô hình thế giới. Cần thiết lập trước khi lập storyboard." }],
        activity: [[day(4, "17:20"), "Dựng danh sách cảnh tập 1 từ Knowledgebase"], [day(8, "21:00"), "Tạo project từ template Filmseries"]],
        created: day(8, "21:00"), updated: day(4, "17:20"), opened: day(4, "17:25"),
      }),
      P("PRJ-0004", "Gió Muộn — Audiobook thử", {
        template: "audiobook", desc: "Bản thử giọng đọc cho bản thảo đang viết.", novel: "NOV-0003", src: { kind: "original", lang: "VI" }, range: [1, 8],
        modules: ["scripting", "audiobook"],
        prog: { scripting: prog("done", 8, 8, "8/8 chương"), audiobook: prog("doing", 3, 8, "3/8 chương") },
        activity: [[day(5, "20:40"), "Tạo audio chương 3"], [day(7, "08:20"), "Tạo project từ template Audiobook"]],
        created: day(7, "08:20"), updated: day(5, "20:40"), opened: day(5, "20:41"),
      }),
      P("PRJ-0005", "Harrowmere — Shorts", {
        template: "audiobook-video", desc: "Ba video ngắn dọc giới thiệu những cảnh mở đầu.", novel: "NOV-0001", src: { kind: "translation", lang: "VI" }, range: [1, 3],
        modules: ["scripting", "storyboard", "audiobook", "canvas", "video"],
        prog: { scripting: prog("done", 3, 3, "3/3 chương"), storyboard: prog("done", 3, 3, "3/3 chương"), audiobook: prog("done", 3, 3, "3/3 chương"), canvas: prog("done", 1, 1, "1 workflow"), video: prog("done", 3, 3, "3 bản xuất") },
        outputs: [out(4, "harrowmere-short-01-last-lantern.mp4", 48, 1080, 1920, 54 * MB, day(6, "20:10")), out(5, "harrowmere-short-02-tide-bell.mp4", 52, 1080, 1920, 58 * MB, day(6, "20:30")), out(6, "harrowmere-short-03-keeper.mp4", 44, 1080, 1920, 49 * MB, day(6, "20:50"))],
        activity: [[day(6, "20:50"), "Kết xuất harrowmere-short-03-keeper.mp4"], [day(10, "19:00"), "Tạo project từ template Audiobook minh họa"]],
        created: day(10, "19:00"), updated: day(6, "20:50"), opened: day(1, "21:30"),
      }),
      P("PRJ-0006", "Tro Dưới Biển — Bản cũ", {
        template: "filmseries", desc: "Bản dựng đầu tiên, giữ lại để tham khảo.", novel: "NOV-0002", src: { kind: "original", lang: "EN" }, range: [1, 2], archived: true,
        modules: ["scripting", "character"],
        prog: { scripting: prog("done", 2, 2, "2/2 chương"), character: prog("doing", 2, 5, "2/5 nhân vật") },
        activity: [[day(40, "10:00"), "Lưu trữ project"]],
        created: day(60, "12:00"), updated: day(40, "10:00"), opened: day(40, "10:00"),
      }),
    ];
    return { projects, seq: projects.length };
  }

  const state = seed();
  const empty = () => ({ types: [], status: [] });

  return {
    MODULES, STAGES, TEMPLATES, MOD_STATE, STATUS, KIND, RES_STATE, MB,
    state, ui: {}, filt: empty(),
    reseed() { this.state = seed(); this.ui = {}; this.filt = empty(); this.exp = null; },
    slug, hasVideo, percent, statusOf, staleCount, fraction, resourcesOf, sizeOf,
    outputRef(id) {
      for (const p of this.state.projects) { const o = p.outputs.find((x) => x.id === id); if (o) return { p, o }; }
      return null;
    },
  };
})();
