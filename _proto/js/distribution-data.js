window.DT = (function () {
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  const PLATFORMS = {
    youtube: {
      key: "youtube", label: "YouTube", icon: "play-box", live: true, unit: "channel",
      blurb: "Upload videos to your YouTube channel via the YouTube Data API.",
      scopes: [["youtube.upload", "Upload videos to your channel"], ["youtube.readonly", "View the channel name and avatar"]],
      vis: [["private", "Private"], ["unlisted", "Unlisted"], ["public", "Public"]],
      titleMax: 100, descMax: 5000, tagsMax: 500, ratio: "16:9",
    },
    tiktok: {
      key: "tiktok", label: "TikTok", icon: "music", live: true, unit: "account",
      blurb: "Send vertical videos to your TikTok account via the Content Posting API.",
      scopes: [["user.info.basic", "View the display name and avatar"], ["video.upload", "Send videos to the drafts inbox on TikTok"], ["video.publish", "Post videos directly to the account"]],
      vis: [["private", "Only me"], ["friends", "Friends"], ["public", "Everyone"]],
      titleMax: 2200, descMax: 2200, tagsMax: 0, ratio: "9:16",
    },
    facebook: { key: "facebook", label: "Facebook Page", icon: "users", live: false, unit: "trang", blurb: "Publish videos to your Facebook Page.", scopes: [], vis: [] },
    podcast: { key: "podcast", label: "Podcast (RSS)", icon: "rss", live: false, unit: "feed", blurb: "Export the audiobook as a podcast feed for listening apps.", scopes: [], vis: [] },
  };
  const CH_STATUS = { ok: ["CONNECTED", "badge-success"], expired: ["NEEDS RECONNECTING", "badge-danger"] };
  const PKG_STATUS = { draft: ["DRAFT", ""], ready: ["READY", "badge-info"], publishing: ["PUBLISHING", "badge-running"], published: ["PUBLISHED", "badge-success"], partial: ["PARTIAL", "badge-warning"], failed: ["ERROR", "badge-danger"] };
  const CATEGORIES = [["22", "People & blogs"], ["24", "Entertainment"], ["27", "Education"], ["1", "Film & animation"], ["10", "Music"]];
  const LANGS = [["vi", "Vietnamese"], ["en", "English"]];
  const KIDS = [["", "Choose…"], ["no", "No, the video is not made for kids"], ["yes", "Yes, the video is made for kids"]];

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
        error: "invalid_grant: The token has expired or the permission was revoked in the Google account.", defaults: { vis: "private", lang: "en", cat: "24", ai: true },
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
        title: "The Last Lamp — Chapter 1 | The Lantern Keeper of Harrowmere (Vietnamese audiobook)",
        desc: "Chapter 1 of The Lantern Keeper of Harrowmere, Vietnamese translation, read by the channel’s narrator voice.\n\nNight falls over Harrowmere, and the last lamp on the pier is still burning.",
        tags: ["audiobook", "harrowmere", "audio story", "fiction"],
        chapters: "00:00 Opening\n01:42 The pier at dusk\n06:15 The lamp keeper\n12:30 The sunken bell\n18:05 End of chapter",
        targets: [tgt("CH-01", { vis: "private" })], results: {}, created: day(3, "23:10"), updated: day(0, "08:45"),
      },
      {
        id: "PKG-0002", projectId: "PRJ-0005", outId: "OUT-0004", status: "partial", rights: true, reviewed: "2026-11-05 20:10", thumb: "IMG-0002", lang: "vi",
        title: "The Last Lamp #audiobook #harrowmere",
        desc: "The opening of Harrowmere in 48 seconds.",
        tags: ["audiobook", "shorts", "harrowmere"], chapters: "",
        targets: [tgt("CH-01", { vis: "public", kids: "no" }), tgt("CH-03", { vis: "public", comments: true })],
        results: {
          "CH-01": { state: "ok", name: "Dreamy Tales", url: "https://youtu.be/dT3x9KqL2mA", at: day(5, "20:31") },
          "CH-03": { state: "error", name: "dreamy.tales", error: "upload_interrupted: The connection was lost while uploading the video", at: day(5, "20:31") },
        },
        created: day(6, "21:10"), updated: day(5, "20:31"),
      },
      {
        id: "PKG-0003", projectId: "PRJ-0002", outId: "OUT-0003", status: "published", rights: true, reviewed: "2026-11-11 09:00", thumb: "IMG-0007", lang: "vi",
        title: "Dreamy Tales — Intro", desc: "Shared intro for the channel’s videos.",
        tags: ["intro", "dreamy tales"], chapters: "",
        targets: [tgt("CH-01", { vis: "public", kids: "no" })],
        results: { "CH-01": { state: "ok", name: "Dreamy Tales", url: "https://youtu.be/Qm7aVd0cK1s", at: day(11, "09:20") } },
        created: day(12, "10:50"), updated: day(11, "09:20"),
      },
      {
        id: "PKG-0004", projectId: "PRJ-0001", outId: "OUT-0002", status: "draft", rights: false, thumb: null, lang: "vi",
        title: "Harrowmere — 30-second teaser", desc: "Quick introduction to the audiobook The Lantern Keeper of Harrowmere.",
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
