window.DT = (function () {
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  const PLATFORMS = {
    youtube: {
      key: "youtube", label: "YouTube", icon: "play-box", live: true, unit: "kênh",
      blurb: "Tải video lên kênh YouTube của bạn qua YouTube Data API.",
      scopes: [["youtube.upload", "Tải video lên kênh của bạn"], ["youtube.readonly", "Xem tên và ảnh đại diện của kênh"]],
      vis: [["private", "Riêng tư"], ["unlisted", "Không công khai"], ["public", "Công khai"]],
      titleMax: 100, descMax: 5000, tagsMax: 500, ratio: "16:9",
    },
    tiktok: {
      key: "tiktok", label: "TikTok", icon: "music", live: true, unit: "tài khoản",
      blurb: "Gửi video dọc lên tài khoản TikTok của bạn qua Content Posting API.",
      scopes: [["user.info.basic", "Xem tên hiển thị và ảnh đại diện"], ["video.upload", "Gửi video vào hộp thư nháp trên TikTok"], ["video.publish", "Đăng video trực tiếp lên tài khoản"]],
      vis: [["private", "Chỉ mình tôi"], ["friends", "Bạn bè"], ["public", "Mọi người"]],
      titleMax: 2200, descMax: 2200, tagsMax: 0, ratio: "9:16",
    },
    facebook: { key: "facebook", label: "Facebook Page", icon: "users", live: false, unit: "trang", blurb: "Đăng video lên Trang Facebook của bạn.", scopes: [], vis: [] },
    podcast: { key: "podcast", label: "Podcast (RSS)", icon: "rss", live: false, unit: "feed", blurb: "Xuất audiobook thành feed podcast cho các ứng dụng nghe.", scopes: [], vis: [] },
  };
  const CH_STATUS = { ok: ["ĐÃ KẾT NỐI", "badge-success"], expired: ["CẦN KẾT NỐI LẠI", "badge-danger"] };
  const PKG_STATUS = { draft: ["NHÁP", ""], ready: ["SẴN SÀNG", "badge-info"], publishing: ["ĐANG ĐĂNG", "badge-running"], published: ["ĐÃ ĐĂNG", "badge-success"], partial: ["MỘT PHẦN", "badge-warning"], failed: ["LỖI", "badge-danger"] };
  const CATEGORIES = [["22", "Con người & blog"], ["24", "Giải trí"], ["27", "Giáo dục"], ["1", "Phim & hoạt hình"], ["10", "Âm nhạc"]];
  const LANGS = [["vi", "Tiếng Việt"], ["en", "Tiếng Anh"]];
  const KIDS = [["", "Chọn…"], ["no", "Không, video không dành cho trẻ em"], ["yes", "Có, video dành cho trẻ em"]];

  const tgt = (ch, o) => ({ ch, vis: "private", sched: "", cat: "22", kids: "", ai: true, comments: false, commercial: false, ...o });

  function seed() {
    const day = (n, hm = "20:12") => {
      const d = new Date(2026, 10, 10 - n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
    };
    const channels = [
      {
        id: "CH-01", platform: "youtube", name: "Dreamy Tales", handle: "@dreamytales", account: "dreamy•••@gmail.com", status: "ok", tone: 0,
        connected: day(69, "20:15"), lastUsed: day(5, "20:31"), checked: day(0, "08:02"), scopes: ["youtube.upload", "youtube.readonly"],
        defaults: { vis: "private", lang: "vi", cat: "22", ai: true },
      },
      {
        id: "CH-02", platform: "youtube", name: "Dreamy Tales EN", handle: "@dreamytales-en", account: "dreamy•••@gmail.com", status: "expired", tone: 1,
        connected: day(69, "20:16"), lastUsed: day(31, "19:05"), checked: day(0, "08:02"), scopes: ["youtube.upload", "youtube.readonly"],
        error: "invalid_grant: Token đã hết hạn hoặc quyền đã bị thu hồi trong tài khoản Google.", defaults: { vis: "private", lang: "en", cat: "24", ai: true },
      },
      {
        id: "CH-03", platform: "tiktok", name: "dreamy.tales", handle: "@dreamy.tales", account: "TikTok", status: "ok", tone: 2,
        connected: day(21, "21:40"), lastUsed: day(5, "20:31"), checked: day(0, "08:02"), scopes: ["user.info.basic", "video.upload", "video.publish"],
        defaults: { vis: "private", lang: "vi", cat: "", ai: true },
      },
    ];
    const packages = [
      {
        id: "PKG-0001", projectId: "PRJ-0001", outId: "OUT-0001", status: "draft", rights: false, thumb: "IMG-0001", lang: "vi",
        title: "Chiếc đèn cuối cùng — Chương 1 | The Lantern Keeper of Harrowmere (Audiobook tiếng Việt)",
        desc: "Chương 1 của The Lantern Keeper of Harrowmere, bản dịch tiếng Việt, đọc bởi giọng dẫn chuyện của kênh.\n\nĐêm xuống Harrowmere, và ngọn đèn cuối cùng trên bến tàu vẫn còn cháy.",
        tags: ["audiobook", "harrowmere", "truyện audio", "tiểu thuyết"],
        chapters: "00:00 Mở đầu\n01:42 Bến tàu lúc chạng vạng\n06:15 Người giữ đèn\n12:30 Chuông chìm\n18:05 Kết chương",
        targets: [tgt("CH-01", { vis: "private" })], results: {}, created: day(3, "23:10"), updated: day(0, "08:45"),
      },
      {
        id: "PKG-0002", projectId: "PRJ-0005", outId: "OUT-0004", status: "partial", rights: true, reviewed: "2026-11-05 20:10", thumb: "IMG-0002", lang: "vi",
        title: "Ngọn đèn cuối cùng #audiobook #harrowmere",
        desc: "Phần mở đầu của Harrowmere trong 48 giây.",
        tags: ["audiobook", "shorts", "harrowmere"], chapters: "",
        targets: [tgt("CH-01", { vis: "public", kids: "no" }), tgt("CH-03", { vis: "public", comments: true })],
        results: {
          "CH-01": { state: "ok", name: "Dreamy Tales", url: "https://youtu.be/dT3x9KqL2mA", at: day(5, "20:31") },
          "CH-03": { state: "error", name: "dreamy.tales", error: "upload_interrupted: Kết nối bị ngắt khi đang tải video lên", at: day(5, "20:31") },
        },
        created: day(6, "21:10"), updated: day(5, "20:31"),
      },
      {
        id: "PKG-0003", projectId: "PRJ-0002", outId: "OUT-0003", status: "published", rights: true, reviewed: "2026-11-11 09:00", thumb: "IMG-0007", lang: "vi",
        title: "Dreamy Tales — Intro", desc: "Đoạn mở đầu dùng chung cho các video của kênh.",
        tags: ["intro", "dreamy tales"], chapters: "",
        targets: [tgt("CH-01", { vis: "public", kids: "no" })],
        results: { "CH-01": { state: "ok", name: "Dreamy Tales", url: "https://youtu.be/Qm7aVd0cK1s", at: day(11, "09:20") } },
        created: day(12, "10:50"), updated: day(11, "09:20"),
      },
      {
        id: "PKG-0004", projectId: "PRJ-0001", outId: "OUT-0002", status: "draft", rights: false, thumb: null, lang: "vi",
        title: "Harrowmere — Teaser 30 giây", desc: "Giới thiệu nhanh audiobook The Lantern Keeper of Harrowmere.",
        tags: ["audiobook", "teaser"], chapters: "",
        targets: [tgt("CH-01", { vis: "unlisted", kids: "no" }), tgt("CH-03", { vis: "private" })],
        results: {}, created: day(2, "10:30"), updated: day(2, "10:40"),
      },
    ];
    return { channels, packages, seq: { ch: channels.length, pkg: packages.length } };
  }

  const state = seed();

  return {
    PLATFORMS, CH_STATUS, PKG_STATUS, CATEGORIES, LANGS, KIDS, tgt,
    state, ui: {},
    reseed() { this.state = seed(); this.ui = {}; },
    check: () => [],
    chById(id) { return this.state.channels.find((c) => c.id === id); },
    pkgById(id) { return this.state.packages.find((k) => k.id === id); },
    pkgStatus(k) {
      if (["publishing", "published", "partial", "failed"].includes(k.status)) return k.status;
      return this.check(k).some((c) => c.level === "error") ? "draft" : "ready";
    },
    dropProjects(ids) { this.state.packages = this.state.packages.filter((k) => !ids.includes(k.projectId)); },
  };
})();
