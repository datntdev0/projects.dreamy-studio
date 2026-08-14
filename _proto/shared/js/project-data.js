window.PJ = (function () {
  const MB = 1048576;
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  const MODULES = {
    scripting: { stage: "pre", label: "Scripting", icon: "pen", blurb: "Narration script and scene script." },
    character: { stage: "pre", label: "Character", icon: "user", blurb: "Image references for characters." },
    world: { stage: "pre", label: "World", icon: "cube", blurb: "Three-dimensional world with clays models." },
    storyboard: { stage: "pre", label: "Storyboard", icon: "frames", blurb: "Split scenes and draw frames." },
    audiobook: { stage: "prod", label: "Audiobook", icon: "mic", blurb: "Generate audio from the locked script." },
    canvas: { stage: "prod", label: "Canvas", icon: "nodes", blurb: "Canvas workflow for producing high-quality resources." },
    video: { stage: "post", label: "Video editor", icon: "film", blurb: "Assemble and render post-production video." },
  };
  const STAGES = [["pre", "Pre-Production"], ["prod", "Production"], ["post", "Post-Production"]];
  const TEMPLATES = {
    audiobook: { label: "Audiobook", icon: "mic", blurb: "Turn chapters into audio with a narrator.", modules: ["scripting", "audiobook"] },
    "audiobook-video": { label: "Illustrated audiobook", icon: "film", blurb: "Audiobook with synchronized illustrations, assembled into a video.", modules: ["scripting", "character", "storyboard", "audiobook", "canvas", "video"] },
    filmseries: { label: "Filmseries", icon: "frames", blurb: "Assemble a multi-episode film from the script, characters and world.", modules: ["scripting", "character", "world", "storyboard", "canvas", "video"] },
    blank: { label: "Empty project", icon: "folder", blurb: "Choose the modules you need yourself.", modules: [] },
  };
  const MOD_STATE = { idle: ["Not started", ""], doing: ["In progress", "badge-running"], done: ["Done", "badge-success"], stale: ["Needs review", "badge-warning"] };
  const STATUS = { new: ["NEWLY CREATED", ""], active: ["IN PROGRESS", "badge-running"], done: ["DONE", "badge-success"], archived: ["ARCHIVED", ""] };
  const KIND = { script: ["Script", "pen"], audio: ["Audio", "music"], image: ["Image", "image"], video: ["Video", "film"] };
  const RES_STATE = { approved: ["Approved", "badge-success"], draft: ["Draft", ""], stale: ["Needs review", "badge-warning"] };

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
        template: "audiobook-video", desc: "Illustrated audiobook for the first 12 chapters of The Lantern Keeper of Harrowmere, published to the main channel.",
        novel: "NOV-0001", src: { kind: "translation", lang: "VI" }, range: [1, 12], staleCh: [3, 5],
        modules: ["scripting", "character", "storyboard", "audiobook", "canvas", "video"],
        prog: {
          scripting: prog("doing", 11, 12, "11/12 chapters locked · chapter 3 needs review"), character: prog("done", 4, 4, "4 characters"), storyboard: prog("doing", 5, 12, "5/12 chapters"),
          audiobook: prog("stale", 8, 12, "8/12 chapters · 2 need review"), canvas: prog("idle", 0, 0, ""), video: prog("doing", 0, 1, "1 timeline · 2 exports"),
        },
        outputs: [out(1, "harrowmere-ch01-lantern-keeper.mp4", 1243, 1920, 1080, 412 * MB, day(3, "22:40")), out(2, "harrowmere-teaser-30s.mp4", 30, 1920, 1080, 38 * MB, day(2, "10:15"))],
        attention: [
          { level: "warn", module: "audiobook", text: "The translations of chapter 3 and chapter 5 changed after the audio was generated. 2 audio segments need review and regeneration." },
          { level: "info", module: "storyboard", text: "7 chapters have no storyboard yet, so they cannot be illustrated." },
        ],
        activity: [[day(0, "08:40"), "Flagged 2 audio segments for review because the translation changed"], [day(2, "10:15"), "Rendered harrowmere-teaser-30s.mp4"], [day(3, "22:40"), "Rendered harrowmere-ch01-lantern-keeper.mp4"], [day(6, "21:10"), "Finished the storyboard for chapter 5"], [day(20, "19:02"), "Created the project from the Illustrated audiobook template"]],
        created: day(20, "19:02"), updated: day(0, "08:40"), opened: day(0, "09:12"),
      }),
      P("PRJ-0002", "Channel — Intro", {
        template: "blank", desc: "Shared intro for the channel’s videos.", modules: ["video"],
        prog: { video: prog("done", 1, 1, "1 timeline · 1 export") },
        outputs: [out(3, "channel-intro-final.mp4", 8, 1920, 1080, 18 * MB, day(12, "10:42"))],
        activity: [[day(12, "10:42"), "Rendered channel-intro-final.mp4"], [day(13, "09:30"), "Created an empty project"]],
        created: day(13, "09:30"), updated: day(12, "10:42"), opened: day(5, "20:00"),
      }),
      P("PRJ-0003", "Harrowmere — Phim", {
        template: "filmseries", desc: "Season 1: episode 1 built from chapters 1–2, episode 2 from chapter 3.", novel: "NOV-0001", src: { kind: "translation", lang: "VI" }, range: [1, 3],
        modules: ["scripting", "character", "world", "storyboard", "canvas", "video"],
        prog: { scripting: prog("doing", 0, 2, "0/2 episodes locked · episode 1 in writing"), character: prog("doing", 1, 3, "1/3 characters"), world: prog("idle", 0, 0, ""), storyboard: prog("idle", 0, 0, ""), canvas: prog("idle", 0, 0, ""), video: prog("idle", 0, 0, "") },
        attention: [{ level: "info", module: "world", text: "No world model yet. It must be set up before storyboarding." }],
        activity: [[day(4, "17:20"), "Built the episode 1 scene list from the Knowledgebase"], [day(8, "21:00"), "Created the project from the Filmseries template"]],
        created: day(8, "21:00"), updated: day(4, "17:20"), opened: day(4, "17:25"),
      }),
      P("PRJ-0004", "Late Wind — Audiobook trial", {
        template: "audiobook", desc: "A voice trial for the draft in progress.", novel: "NOV-0003", src: { kind: "original", lang: "VI" }, range: [1, 5],
        modules: ["scripting", "audiobook"],
        prog: { scripting: prog("done", 5, 5, "5/5 chapters"), audiobook: prog("doing", 3, 5, "3/5 chapters") },
        activity: [[day(5, "20:40"), "Generated audio for chapter 3"], [day(7, "08:20"), "Created the project from the Audiobook template"]],
        created: day(7, "08:20"), updated: day(5, "20:40"), opened: day(5, "20:41"),
      }),
      P("PRJ-0005", "Harrowmere — Shorts", {
        template: "audiobook-video", desc: "Three short vertical videos introducing the opening scenes.", novel: "NOV-0001", src: { kind: "translation", lang: "VI" }, range: [1, 3],
        modules: ["scripting", "storyboard", "audiobook", "canvas", "video"],
        prog: { scripting: prog("done", 3, 3, "3/3 chapters"), storyboard: prog("done", 3, 3, "3/3 chapters"), audiobook: prog("done", 3, 3, "3/3 chapters"), canvas: prog("done", 1, 1, "1 workflow"), video: prog("done", 3, 3, "3 exports") },
        outputs: [out(4, "harrowmere-short-01-last-lantern.mp4", 48, 1080, 1920, 54 * MB, day(6, "20:10")), out(5, "harrowmere-short-02-tide-bell.mp4", 52, 1080, 1920, 58 * MB, day(6, "20:30")), out(6, "harrowmere-short-03-keeper.mp4", 44, 1080, 1920, 49 * MB, day(6, "20:50"))],
        activity: [[day(6, "20:50"), "Rendered harrowmere-short-03-keeper.mp4"], [day(10, "19:00"), "Created the project from the Illustrated audiobook template"]],
        created: day(10, "19:00"), updated: day(6, "20:50"), opened: day(1, "21:30"),
      }),
      P("PRJ-0006", "Ash Under the Sea — Old version", {
        template: "filmseries", desc: "The first cut, kept for reference.", novel: "NOV-0002", src: { kind: "original", lang: "EN" }, range: [1, 2], archived: true,
        modules: ["scripting", "character"],
        prog: { scripting: prog("done", 2, 2, "2/2 chapters"), character: prog("doing", 2, 5, "2/5 characters") },
        activity: [[day(40, "10:00"), "Archived the project"]],
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
