window.LB = (function () {
  const MB = 1048576;
  const GB = 1024 * MB;

  const TYPES = {
    image: { key: "image", id: "IMG", tab: "images", label: "Images", noun: "ảnh", icon: "image", exts: ["png", "jpg", "jpeg", "webp", "gif"], max: 25 * MB, hint: "PNG, JPG, WEBP, GIF · tối đa 25 MB mỗi ảnh" },
    sound: { key: "sound", id: "SND", tab: "sounds", label: "Sounds", noun: "âm thanh", icon: "music", exts: ["mp3", "wav", "m4a", "flac", "ogg"], max: 200 * MB, hint: "MP3, WAV, M4A, FLAC, OGG · tối đa 200 MB mỗi file" },
    video: { key: "video", id: "VID", tab: "videos", label: "Videos", noun: "video", icon: "film", exts: ["mp4", "mov", "webm", "mkv"], max: 2 * GB, hint: "MP4, MOV, WEBM, MKV · tối đa 2 GB mỗi file" },
    prompt: { key: "prompt", id: "PRM", tab: "prompts", label: "Prompts", noun: "prompt", icon: "prompt", exts: ["txt", "md"], max: 256 * 1024, hint: "TXT, MD · tối đa 256 KB mỗi file, hoặc viết trực tiếp" },
  };
  const TAB = Object.fromEntries(Object.values(TYPES).map((t) => [t.tab, t.key]));
  const RIGHTS = { own: "Tôi tự tạo hoặc sở hữu", licensed: "Có giấy phép sử dụng", free: "Miễn phí bản quyền (CC0, public domain)", other: "Khác / chưa xác định" };
  const PROMPT_KINDS = { image: "Ảnh", video: "Video", voice: "Giọng đọc", general: "Chung" };

  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => {
    let a = typeof seed === "number" ? seed : hash(seed);
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  const PAL = [
    ["--acc-midnight", "--primary", "--acc-twilight"],
    ["--acc-midnight", "--acc-breeze", "--acc-sunset"],
    ["--acc-sunset", "--secondary", "--acc-midnight"],
    ["--acc-midnight", "--secondary", "--acc-sunset"],
    ["--acc-twilight", "--primary", "--acc-midnight"],
    ["--acc-breeze", "--acc-midnight", "--primary"],
  ];
  const bgFor = (seed) => {
    const r = rng(seed);
    const p = PAL[Math.floor(r() * PAL.length)];
    const angle = Math.floor(r() * 360);
    const x = 15 + Math.floor(r() * 70);
    const y = 15 + Math.floor(r() * 45);
    const s = 4 + Math.floor(r() * 7);
    const discs = ["--acc-twilight", "--acc-sunset", "--acc-breeze"].filter((d) => d !== p[2] && d !== p[0]);
    const disc = discs[Math.floor(r() * discs.length)];
    return `radial-gradient(circle at ${x}% ${y}%, color-mix(in srgb, var(${disc}) 90%, transparent) 0 ${s}%, transparent ${s + 1}%), linear-gradient(${angle}deg, var(${p[0]}), var(${p[1]}) 58%, var(${p[2]}))`;
  };
  const h01 = (a, k) => { let h = Math.imul(a ^ Math.imul(k | 0, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const seedInt = (seed) => (typeof seed === "number" ? seed : hash(seed));
  const level = (seed, t) => {
    const a = seedInt(seed);
    const k = Math.floor(t * 12);
    const phrase = h01(a, 1000003 + Math.floor(k / 7));
    const env = 0.62 + 0.38 * Math.sin(t * 0.55 + (a % 628) / 100);
    return Math.max(0.06, Math.min(1, (0.12 + 0.88 * (0.55 * h01(a, k) + 0.45 * phrase)) * env));
  };
  const band = (seed, i, t) => {
    const a = seedInt(seed);
    const k = Math.floor(t * 9);
    const f = (t * 9) - k;
    const v = h01(a + i * 7919, k) * (1 - f) + h01(a + i * 7919, k + 1) * f;
    return Math.max(0.08, Math.min(1, level(a, t) * (0.35 + 0.65 * v) * 1.15));
  };
  const bars = (seed, n) => {
    const r = rng(seed);
    let prev = 0.5;
    return Array.from({ length: n }, (_, i) => {
      prev = 0.45 * prev + 0.55 * r();
      const env = 0.5 + 0.5 * Math.sin((Math.PI * (i + 0.5)) / n);
      return Math.round(12 + 88 * prev * env);
    });
  };
  const bytes = (b) => (b >= GB ? `${(b / GB).toFixed(1)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const dur = (s) => {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  };
  const normTag = (s) => String(s).toLowerCase().replace(/[,#]/g, " ").trim().replace(/\s+/g, "-").slice(0, 24);
  const parseTags = (text) => [...new Set(String(text).split(",").map(normTag).filter(Boolean))].slice(0, 12);
  const varsOf = (text) => [...new Set([...String(text).matchAll(/\{\{\s*([\w .-]+?)\s*\}\}/g)].map((m) => m[1].trim()))];
  const extOf = (name) => (String(name).includes(".") ? String(name).split(".").pop().toLowerCase() : "");

  function seed() {
    const day = (n, hm = "20:12") => {
      const d = new Date(2026, 10, 9 - n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
    };
    const seq = { image: 0, sound: 0, video: 0, prompt: 0, col: 0, voice: 0 };
    const nid = (type) => `${TYPES[type].id}-${String(++seq[type]).padStart(4, "0")}`;
    const a = (type, name, o) => ({ id: nid(type), type, name, tags: [], collectionId: null, rights: "own", origin: "Tải lên từ máy", seed: name, ...o });
    const img = (name, w, h, size, o) => a("image", name, { size, meta: { w, h }, bg: bgFor(name), ...o });
    const snd = (name, d, size, o) => a("sound", name, { size, meta: { dur: d, rate: "44.1 kHz", ch: "Stereo" }, ...o });
    const vid = (name, d, w, h, fps, size, o) => a("video", name, { size, meta: { dur: d, w, h, fps }, bg: bgFor(name), ...o });
    const prm = (name, kind, text, o) => a("prompt", name, { size: new Blob([text]).size, text, kind, origin: "Tạo trong app", ...o });

    const collections = [
      { id: "COL-01", name: "Harrowmere · Bối cảnh", desc: "Ảnh, âm thanh và prompt dùng cho bối cảnh cảng Harrowmere.", created: day(20) },
      { id: "COL-02", name: "Ambience & nhạc nền", desc: "Âm thanh nền, hiệu ứng và nhạc chủ đề dùng chung cho các project.", created: day(18) },
      { id: "COL-03", name: "Nhận diện kênh", desc: "Logo, intro / outro, mẫu thumbnail.", created: day(12) },
      { id: "COL-04", name: "Nhân vật", desc: "Tham chiếu hình ảnh và giọng của nhân vật.", created: day(9) },
    ];
    seq.col = collections.length;

    const assets = [
      img("harrowmere-harbor-dusk.png", 1920, 1080, 3.4 * MB, { tags: ["harbor", "dusk", "background"], collectionId: "COL-01", added: day(1, "21:03") }),
      img("lantern-room-interior.jpg", 1536, 1024, 1.2 * MB, { tags: ["lantern", "interior"], collectionId: "COL-01", added: day(1, "20:41") }),
      img("keeper-portrait-ref.png", 1024, 1280, 2.1 * MB, { tags: ["character", "reference"], collectionId: "COL-04", added: day(2, "18:22") }),
      img("maro-quill-ref.webp", 1024, 1280, 640 * 1024, { tags: ["character", "reference"], collectionId: "COL-04", added: day(2, "18:25") }),
      img("drowned-bell-tower.png", 1792, 1024, 2.9 * MB, { tags: ["night", "ruins", "background"], collectionId: "COL-01", added: day(3, "22:10") }),
      img("sea-fog-texture.jpg", 2048, 2048, 4.8 * MB, { tags: ["texture", "fog"], added: day(4, "09:40"), rights: "free", origin: "Tải lên từ máy" }),
      img("channel-logo-square.png", 1024, 1024, 310 * 1024, { tags: ["logo", "brand"], collectionId: "COL-03", added: day(12, "10:00") }),
      img("thumbnail-template-01.png", 1280, 720, 880 * 1024, { tags: ["thumbnail", "template", "brand"], collectionId: "COL-03", added: day(12, "10:06") }),
      img("tide-chart-parchment.jpg", 1600, 1200, 1.7 * MB, { tags: ["prop", "map"], collectionId: "COL-01", added: day(5, "14:30"), rights: "licensed" }),
      img("council-hall.webp", 1920, 1080, 980 * 1024, { tags: ["interior", "council", "background"], collectionId: "COL-01", added: day(6, "19:48") }),
      img("moonlit-pier.png", 1920, 1080, 3.1 * MB, { tags: ["harbor", "night", "background"], collectionId: "COL-01", added: day(7, "23:15") }),
      img("lamp-closeup.jpg", 1200, 1200, 760 * 1024, { tags: ["lantern", "prop"], added: day(8, "16:02") }),
      img("sunrise-gradient-bg.png", 1920, 1080, 420 * 1024, { tags: ["background", "gradient"], collectionId: "COL-03", added: day(14, "11:20") }),
      img("gull-silhouette.png", 800, 600, 190 * 1024, { tags: ["prop", "bird"], added: day(15, "08:45") }),

      snd("harbor-ambience-loop.wav", 200, 35.3 * MB, { tags: ["ambience", "harbor", "loop"], collectionId: "COL-02", added: day(1, "19:30") }),
      snd("waves-lapping.mp3", 105, 2.4 * MB, { tags: ["ambience", "sea"], collectionId: "COL-02", added: day(3, "17:05"), rights: "free" }),
      snd("bell-toll-distant.wav", 12, 2.1 * MB, { tags: ["sfx", "bell"], collectionId: "COL-02", added: day(3, "17:12") }),
      snd("wind-howl-night.mp3", 150, 3.4 * MB, { tags: ["ambience", "night", "wind"], collectionId: "COL-02", added: day(5, "21:00") }),
      snd("theme-lantern-keeper.mp3", 185, 4.2 * MB, { tags: ["music", "theme"], collectionId: "COL-03", added: day(10, "13:10"), rights: "licensed" }),
      snd("narrator-sample-warm.wav", 42, 7.1 * MB, { tags: ["voice-ref"], collectionId: "COL-04", added: day(9, "20:20") }),
      snd("page-turn.wav", 2, 380 * 1024, { tags: ["sfx", "book"], collectionId: "COL-02", added: day(11, "12:00") }),
      snd("intro-sting.mp3", 6, 210 * 1024, { tags: ["sfx", "brand"], collectionId: "COL-03", added: day(12, "10:15") }),

      vid("channel-intro-v2.mp4", 8, 1920, 1080, 24, 18.4 * MB, { tags: ["intro", "brand"], collectionId: "COL-03", added: day(12, "10:30") }),
      vid("fog-loop-bg.mp4", 30, 1920, 1080, 30, 46 * MB, { tags: ["fog", "loop", "background"], collectionId: "COL-01", added: day(4, "15:40") }),
      vid("lighthouse-beam-overlay.webm", 12, 1920, 1080, 30, 9.6 * MB, { tags: ["overlay", "lantern"], collectionId: "COL-01", added: day(6, "10:11") }),
      vid("outro-endcard.mp4", 15, 1920, 1080, 24, 12.2 * MB, { tags: ["outro", "brand"], collectionId: "COL-03", added: day(12, "10:42") }),
      vid("waves-closeup.mov", 20, 3840, 2160, 60, 214 * MB, { tags: ["sea", "background"], added: day(13, "07:30"), rights: "licensed" }),

      prm("Harbor at dusk — cảnh rộng", "image", "Wide establishing shot of {{location}} at dusk, low fog over still water, a single lantern glowing on the pier, painterly {{style}}, muted teal and amber palette, cinematic composition, no text.", { tags: ["harbor", "background"], collectionId: "COL-01", added: day(2, "21:10") }),
      prm("Chân dung nhân vật (reference sheet)", "image", "Character reference sheet of {{character}}: front, side and three-quarter views, neutral expression, plain background, consistent costume details, {{style}}.", { tags: ["character", "reference"], collectionId: "COL-04", added: day(2, "18:10") }),
      prm("Tia sáng hải đăng (overlay)", "video", "Slow rotating lighthouse beam sweeping through thick fog, volumetric light, seamless loop, 10 seconds, {{mood}} mood.", { tags: ["lantern", "overlay"], collectionId: "COL-01", added: day(6, "10:00") }),
      prm("Mở đầu chương — giọng dẫn", "voice", "Giọng dẫn chuyện trầm ấm, nhịp chậm. Nghỉ 0,6 giây sau tiêu đề chương, nhấn nhẹ ở tên riêng, không đọc số đoạn.", { tags: ["narration"], collectionId: "COL-04", added: day(9, "20:30") }),
      prm("Sóng biển — loop", "video", "Close-up of slow waves lapping against stone, overcast light, {{mood}} mood, seamless 8 second loop.", { tags: ["sea", "loop"], added: day(13, "07:10") }),
      prm("Thumbnail kênh", "image", "YouTube thumbnail, {{subject}} in the foreground, dramatic rim light, large empty area on the left for title text, 16:9.", { tags: ["thumbnail", "brand"], collectionId: "COL-03", added: day(12, "10:50") }),
      prm("Tóm tắt chương (ngắn)", "general", "Tóm tắt chương {{chapter}} trong 3 câu, giữ nguyên tên riêng và không tiết lộ nội dung các chương sau.", { tags: ["summary"], added: day(8, "09:00") }),
      prm("Phong cách sơn dầu u tối", "image", "oil painting, heavy impasto, chiaroscuro, desaturated blues, warm lamplight accents", { tags: ["style"], added: day(16, "22:00") }),
    ];
    assets.forEach((x) => { if (x.type === "prompt") x.size = Math.max(x.size, 1); });
    seq.image = 14; seq.sound = 8; seq.video = 5; seq.prompt = 8;

    const voices = [
      { id: "VOC-01", family: "vieneu", name: "Minh Quân", kind: "default", lang: "VI", gender: "Nam", style: "Giọng mặc định của VieNeu, rõ chữ", engine: "local", status: "ready", created: "—" },
      { id: "VOC-02", family: "vieneu", name: "Xuân Vinh", kind: "default", lang: "VI", gender: "Nam", style: "Giọng miền Nam", engine: "local", status: "ready", created: "—" },
      { id: "VOC-03", family: "kokoro", name: "Aria", kind: "default", lang: "EN", gender: "Nữ", style: "Sáng, rõ chữ", engine: "local", status: "ready", created: "—" },
      { id: "VOC-04", family: "kokoro", name: "Daniel", kind: "default", lang: "EN", gender: "Nam", style: "Kể chuyện, chậm", engine: "local", status: "ready", created: "—" },
      { id: "VOC-05", provider: "everai", name: "Linh", kind: "default", lang: "VI", gender: "Nữ", style: "Tự nhiên, hội thoại", engine: "cloud", status: "ready", created: "—" },
      { id: "VOC-06", provider: "elevenlabs", name: "Oliver", kind: "default", lang: "EN", gender: "Nam", style: "Ấm, giàu cảm xúc", engine: "cloud", status: "ready", created: "—" },
      { id: "VOC-07", family: "vieneu", name: "Giọng của tôi", kind: "cloned", lang: "VI", gender: "Nữ", style: "Ghi âm trực tiếp", engine: "local", status: "ready", created: day(9, "20:40"), desc: "Giọng đọc chính cho audiobook Harrowmere.", src: { type: "record", name: "Bản ghi âm", dur: 38 } },
      { id: "VOC-08", provider: "elevenlabs", name: "Narrator ấm", kind: "cloned", lang: "VI", gender: "Nam", style: "Từ file audio", engine: "cloud", status: "ready", created: day(6, "11:05"), desc: "Giọng dẫn chuyện trầm cho các chương hồi tưởng.", src: { type: "file", name: "narrator-sample-warm.wav", dur: 42 } },
      { id: "VOC-09", family: "omnivoice", name: "Thử nghiệm giọng trầm", kind: "cloned", lang: "VI", gender: "Nam", style: "Từ file audio", engine: "local", status: "failed", created: day(4, "09:12"), error: "Mẫu có nhiều tạp âm nền nên không trích xuất được đặc trưng giọng. Hãy dùng bản thu sạch hơn, dài từ 10 giây.", src: { type: "file", name: "noisy-test.mp3", dur: 14 } },
    ];
    seq.voice = voices.length;

    return { assets, collections, voices, tagList: [], seq,
      backend: {
        status: "running", source: "bundle", port: 8721, pid: 18420, since: "2026-11-10 08:02", customPython: "C:\\Python311\\python.exe", device: "auto",
        log: ["INFO:     Started server process [18420]", "INFO:     Waiting for application startup.", "INFO:     Application startup complete.", "INFO:     Uvicorn running on http://127.0.0.1:8721 (Press CTRL+C to quit)", "INFO:     127.0.0.1 - \"GET /health HTTP/1.1\" 200 OK"],
      },
      tts: {
        models: { omnivoice: { status: "error", error: "Lần tải trước bị gián đoạn: tệp model.safetensors không khớp checksum (sha256)." } },
      },
      speech: { providers: { elevenlabs: { enabled: true, saved: true, fields: {}, status: "ok", latency: 184, at: "2026-11-09 21:14" } } } };
  }

  const state = seed();
  const syncTags = (s) => { s.tagList = [...new Set([...s.tagList, ...s.assets.flatMap((x) => x.tags)])].sort(); };
  syncTags(state);

  return {
    TYPES, TAB, RIGHTS, PROMPT_KINDS, MB, GB,
    state, ui: {}, filt: { col: "", tags: [] },
    reseed() { this.state = seed(); syncTags(this.state); this.ui = {}; this.filt = { col: "", tags: [] }; },
    hash, rng, bgFor, bars, level, band, bytes, dur, normTag, parseTags, varsOf, extOf,
    sample: { en: "Night fell over Harrowmere, and the last lantern on the pier was still burning.", vi: "Đêm xuống Harrowmere, và ngọn đèn cuối cùng trên bến tàu vẫn còn cháy." },
  };
})();
