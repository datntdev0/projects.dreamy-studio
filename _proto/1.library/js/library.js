(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const T = LB.TYPES;
  const CAP = window.DS.CAP["05"];
  const MAX_TAGS = 12;

  const st = () => LB.state;
  const ui = (key) => (LB.ui[key] ||= { q: "", sel: [], anchor: null, sort: "new" });
  const filt = () => {
    const f = LB.filt;
    if (f.col && f.col !== "none" && !st().collections.some((c) => c.id === f.col)) f.col = "";
    const here = tagsInScope(scope(A.S.active));
    f.tags = f.tags.filter((t) => st().tagList.includes(t) && here.has(t));
    return f;
  };
  /* Tags are listed per kind of library: a type tab only offers the tags its assets use, a collection
     tab the tags of what is in that collection; elsewhere (Collections & tags) all of them. */
  const poolOf = (sc) => st().assets.filter((x) => (sc.type ? x.type === sc.type : sc.col ? x.collectionId === sc.col : true));
  const tagsInScope = (sc) => new Set(poolOf(sc).flatMap((x) => x.tags));
  const filtActive = () => !!(filt().col || filt().tags.length);
  const byId = (id) => st().assets.find((x) => x.id === id);
  const colById = (id) => st().collections.find((c) => c.id === id);
  const scope = (id) => (String(id).startsWith("collection:") ? { id, col: id.split(":")[1], type: null } : { id, type: LB.TAB[id], col: null });
  const view = () => A.store.get("lb.view", "grid");
  const RATIOS = [["1/1", "1:1"], ["16/9", "16:9"], ["9/16", "9:16"]];
  const gridPref = (type) => ({ size: 176, ratio: "16/9", ...A.store.get(`lb.grid.${type}`, {}) });
  const hasRatio = (type) => type === "image" || type === "video";
  const bgOf = (x) => (x.img ? `url(${x.img}) center / cover no-repeat` : x.bg);
  const ext = (x) => (x.type === "prompt" ? "" : LB.extOf(x.name).toUpperCase());
  const collectionOf = (x) => (x.collectionId ? colById(x.collectionId) : null);
  const count = (list, n) => `${list.length} ${n}`;
  const nextId = (type) => `${T[type].id}-${String(++st().seq[type]).padStart(4, "0")}`;
  const touch = (x) => { x.edited = A.stamp(); };
  const typeCounts = (list) => Object.keys(T).map((k) => [k, list.filter((x) => x.type === k).length]);

  const metaText = (x) => ({
    image: `${x.meta?.w}×${x.meta?.h}`,
    sound: LB.dur(x.meta?.dur || 0),
    video: `${LB.dur(x.meta?.dur || 0)} · ${x.meta?.w}×${x.meta?.h}`,
    prompt: `${(x.text || "").length} characters`,
  })[x.type];

  const PL = { id: null, playing: false, pos: 0, dur: 0, url: "", srcUrl: "", audio: null, ctx: null, an: null, freq: null, anFail: false, bands: null, timer: null, raf: 0, t: 0 };
  const curPos = () => (PL.playing ? Math.min(PL.dur, PL.pos + (performance.now() - PL.t) / 1000) : PL.pos);

  /* Real waveform: the file is decoded once and reduced to one peak (0-255) per 1/12 s, the same
     PEAK_RATE the app stores. Real spectrum: the playing <audio> goes through an AnalyserNode.
     Both need http(s) or blob: (fetch + CORS); on file:// or for assets without a file they fall
     back to the seeded synthetic data. */
  const PEAK_RATE = 12;
  const BANDS = 32;
  const CORS_OK = /^https?:$/.test(location.protocol);
  const PK = new Map();
  async function decodePeaks(url) {
    const raw = await (await fetch(url)).arrayBuffer();
    const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(raw);
    const win = buf.sampleRate / PEAK_RATE;
    const out = new Uint8Array(Math.max(1, Math.ceil(buf.duration * PEAK_RATE)));
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const a = Math.round(Math.abs(d[i]) * 255);
        const w = Math.floor(i / win);
        if (a > out[w]) out[w] = Math.min(255, a);
      }
    }
    return out;
  }
  const overviewOf = (p) => Array.from({ length: BANDS }, (_, k) => {
    const a = Math.floor((k * p.length) / BANDS);
    const b = Math.max(a + 1, Math.floor(((k + 1) * p.length) / BANDS));
    let s = 0;
    for (let i = a; i < b; i++) s += p[i];
    return s / (b - a) / 255;
  });
  const peakAt = (p, t) => {
    const x = Math.max(0, Math.min(p.length - 1, t * PEAK_RATE - 0.5));
    const i = Math.floor(x);
    return (p[i] * (1 - (x - i)) + p[Math.min(p.length - 1, i + 1)] * (x - i)) / 255;
  };
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const PRE = new Map();
  function preOf(id) {
    const name = byId(id)?.name;
    const raw = name && window.LB_AUDIO?.[name];
    if (!raw) return null;
    if (!PRE.has(name)) {
      const p = b64(raw.peaks);
      PRE.set(name, { p, ov: overviewOf(p), gain: 255 / Math.max(64, ...p), err: false, bands: b64(raw.bands), rate: raw.rate, nb: raw.nb });
    }
    return PRE.get(name);
  }
  function preBands(t) {
    const e = preOf(PL.id);
    if (!e) return null;
    const frames = e.bands.length / e.nb;
    const x = Math.max(0, Math.min(frames - 1, t * e.rate));
    const i = Math.floor(x);
    const f = x - i;
    const j = Math.min(frames - 1, i + 1);
    return Array.from({ length: e.nb }, (_, k) => (e.bands[i * e.nb + k] * (1 - f) + e.bands[j * e.nb + k] * f) / 255);
  }
  function peaksOf(id) {
    const pre = preOf(id);
    if (pre) return pre;
    const url = player.track(id)?.url;
    if (!url || !CORS_OK && !url.startsWith("blob:")) return null;
    let e = PK.get(id);
    if (!e || e.url !== url) {
      e = { url, p: null, ov: null, gain: 1, err: false };
      PK.set(id, e);
      decodePeaks(url)
        .then((p) => { e.p = p; e.ov = overviewOf(p); e.gain = 255 / Math.max(64, ...p); })
        .catch(() => { e.err = true; })
        .finally(() => { if (PK.get(id) === e) paint(); });
    }
    return e;
  }
  function ensureGraph() {
    if (PL.an || PL.anFail || !PL.audio || !(CORS_OK || PL.url.startsWith("blob:"))) return;
    try {
      PL.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const an = PL.ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.8;
      PL.ctx.createMediaElementSource(PL.audio).connect(an);
      an.connect(PL.ctx.destination);
      PL.an = an;
      PL.freq = new Uint8Array(an.frequencyBinCount);
    } catch { PL.anFail = true; }
  }
  function spectrumBands(count = BANDS) {
    PL.an.getByteFrequencyData(PL.freq);
    const f = PL.freq;
    const per = PL.ctx.sampleRate / 2 / f.length;
    const lo = 60;
    const hi = Math.min(16000, PL.ctx.sampleRate / 2);
    return Array.from({ length: count }, (_, k) => {
      const a = lo * (hi / lo) ** (k / count);
      const b = lo * (hi / lo) ** ((k + 1) / count);
      const i0 = Math.min(f.length - 1, Math.floor(a / per));
      const i1 = Math.min(f.length, Math.max(i0 + 1, Math.ceil(b / per)));
      if (i1 - i0 > 1) { let s = 0; for (let i = i0; i < i1; i++) s += f[i]; return s / (i1 - i0) / 255; }
      const x = Math.max(0, Math.min(f.length - 1, Math.sqrt(a * b) / per - 0.5));
      const j = Math.floor(x);
      return (f[j] * (1 - (x - j)) + f[Math.min(f.length - 1, j + 1)] * (x - j)) / 255;
    });
  }

  const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
  /* One canvas, three layouts (class on the canvas):
       default      sliding window, playhead centered
       is-paged     fixed sections of data-win seconds, jumps to the next one when the playhead leaves it
       is-overview  the whole file compressed into the width (sound card cover): static, ignores playback */
  function drawScroller(c) {
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    const dur = +c.dataset.d || 1;
    const ov = c.classList.contains("is-overview");
    const paged = c.classList.contains("is-paged");
    const win = ov ? dur : Math.min(+c.dataset.win || 5, dur);
    const active = !ov && c.dataset.lbs === PL.id;
    const pos = active ? curPos() : 0;
    const start = ov ? 0 : paged ? Math.floor(Math.min(pos, dur - 0.001) / win) * win : Math.max(0, Math.min(dur - win, pos - win / 2));
    const pk = peaksOf(c.dataset.lbs);
    const played = css(c, "--primary-text");
    const rest = css(c, "--hairline-strong");
    const key = active ? null : [w, h, start, pk ? (pk.p ? 1 : pk.err ? 2 : 0) : 3, rest].join("|");
    if (key && c._key === key) return;
    c._key = key;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext("2d");
    /* clear the whole bitmap in device pixels: at a fractional dpr (125%, 150%) the last row is only
       partly covered by a scaled clearRect(0, 0, w, h), so whatever was drawn there piles up into a line */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const step = ov ? 4 : 5;
    const bw = ov ? 2 : 3;
    const pad = ov ? 0 : 6;
    const uw = w - pad * 2;
    const n = Math.max(1, Math.floor(uw / step));
    const slice = win / n;
    const seed = c.dataset.seed;
    const levelAt = (t) => {
      if (!pk || pk.err) return LB.level(seed, t);
      if (!pk.p) return 0;
      const last = pk.p.length - 1;
      if (slice <= 1.5 / PEAK_RATE) return Math.min(1, peakAt(pk.p, t) * pk.gain);
      let m = 0;
      for (let i = Math.max(0, Math.floor((t - slice / 2) * PEAK_RATE)); i <= Math.min(last, Math.floor((t + slice / 2) * PEAK_RATE)); i++) if (pk.p[i] > m) m = pk.p[i];
      return Math.min(1, (m / 255) * pk.gain);
    };
    for (let i = 0; i < n; i++) {
      const t = start + ((i + 0.5) / n) * win;
      if (t > dur) break;
      const bh = Math.max(2, levelAt(t) * (h - 6));
      ctx.fillStyle = active && t <= pos ? played : rest;
      ctx.fillRect(pad + i * step + (uw - n * step) / 2, (h - bh) / 2, bw, bh);
    }
    if (active) {
      const x = pad + ((pos - start) / win) * uw;
      ctx.fillStyle = css(c, "--ink");
      ctx.fillRect(Math.round(x * dpr - 0.75 * dpr) / dpr, 0, 1.5, h);
    }
    c._win = { start, len: win, pad, uw };
  }
  function drawEq(el) {
    const live = el.dataset.eq === PL.id && PL.playing;
    el.classList.toggle("is-live", live);
    const bars = el.querySelectorAll("i");
    const pk = peaksOf(el.dataset.eq);
    if (pk?.ov && el._ov !== pk) {
      el._ov = pk;
      const m = Math.max(...pk.ov) || 1;
      bars.forEach((i, k) => i.style.setProperty("--h", `${Math.max(14, Math.round((pk.ov[Math.floor((k * BANDS) / bars.length)] / m) * 100))}%`));
    }
    if (!live) { if (el._was) { el._was = false; bars.forEach((i) => i.style.removeProperty("--l")); } return; }
    el._was = true;
    const t = curPos();
    const seed = el.dataset.seed;
    const b = PL.bands;
    bars.forEach((i, k) => {
      const v = b ? b[Math.floor((k * b.length) / bars.length)] : LB.band(seed, k, t);
      i.style.setProperty("--l", `${Math.max(8, Math.round(v * 100))}%`);
    });
  }
  function drawLive() {
    const live = PL.an && PL.url && PL.ctx.state === "running";
    PL.bands = !PL.playing ? null : live ? spectrumBands() : PL.url ? preBands(curPos()) : null;
    A.$$("canvas[data-lbs]").forEach(drawScroller);
    A.$$(".lb-eq").forEach(drawEq);
  }
  function frame() {
    drawLive();
    PL.raf = PL.playing ? requestAnimationFrame(frame) : 0;
  }

  function paint() {
    A.$$("[data-lbp]").forEach((el) => {
      const on = el.dataset.lbp === PL.id && PL.dur;
      el.style.setProperty("--p", on ? Math.min(100, (PL.pos / PL.dur) * 100) : 0);
    });
    A.$$("[data-lb-time]").forEach((el) => {
      const d = +el.dataset.d;
      el.textContent = el.dataset.lbTime === PL.id ? `${LB.dur(PL.pos)} / ${LB.dur(d)}` : LB.dur(d);
    });
    A.$$("[data-lb-play]").forEach((el) => {
      const on = el.dataset.lbPlay === PL.id && PL.playing;
      if (el.classList.contains("is-playing") !== on) {
        el.querySelector("use")?.setAttribute("href", `#i-${on ? "pause" : "play"}`);
        el.setAttribute("aria-label", on ? "Pause" : "Play");
        el.classList.toggle("is-playing", on);
      }
    });
    drawLive();
  }
  function halt() {
    PL.pos = curPos();
    clearInterval(PL.timer);
    PL.timer = null;
    PL.playing = false;
    PL.audio?.pause();
  }
  function tick() {
    const now = performance.now();
    const dt = (now - PL.t) / 1000;
    PL.t = now;
    if (PL.url && PL.audio) PL.pos = PL.audio.currentTime; else PL.pos += dt;
    if (PL.pos >= PL.dur - 0.05 || (PL.url && PL.audio?.ended)) { halt(); PL.pos = 0; }
    paint();
  }
  function start() {
    PL.playing = true;
    PL.t = performance.now();
    if (PL.url) {
      if (!PL.audio) {
        PL.audio = new Audio();
        if (CORS_OK) PL.audio.crossOrigin = "anonymous";
      }
      ensureGraph();
      PL.ctx?.resume?.();
      if (PL.srcUrl !== PL.url) { PL.audio.src = PL.url; PL.srcUrl = PL.url; }
      PL.audio.currentTime = PL.pos;
      PL.audio.play().catch(() => { PL.url = ""; PL.t = performance.now(); });
    }
    PL.timer = setInterval(tick, 100);
    if (!PL.raf) PL.raf = requestAnimationFrame(frame);
    paint();
  }
  const player = {
    toggle(id, tr) {
      if (PL.id === id && PL.playing) { halt(); paint(); return; }
      if (PL.id !== id) { halt(); Object.assign(PL, { id, pos: 0, dur: Math.max(1, tr.dur || 1), url: tr.url || "" }); }
      start();
    },
    seek(id, tr, frac) {
      if (PL.id !== id) { halt(); Object.assign(PL, { id, dur: Math.max(1, tr.dur || 1), url: tr.url || "" }); }
      PL.pos = Math.max(0, Math.min(PL.dur, frac * PL.dur));
      if (PL.url && PL.audio) PL.audio.currentTime = PL.pos;
      if (!PL.playing) start(); else paint();
    },
    stop() { halt(); Object.assign(PL, { id: null, pos: 0 }); paint(); },
    paint,
    resolvers: [],
    track(id) {
      const x = byId(id);
      if (x) return { dur: x.meta?.dur, url: x.url };
      for (const r of this.resolvers) { const t = r(id); if (t) return t; }
      return null;
    },
  };
  LB.player = player;
  const reseed = LB.reseed;
  LB.reseed = function () {
    reseed.call(this);
    player.stop();
    PK.clear();
    const tts = window.DS.STARTUP_STEPS.find((x) => x.id === "tts");
    if (tts) tts.result = "warn";
  };
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (PV.open && !A.$(".lbp-modal")) { PV.open = false; if (PL.playing && PV.ids.includes(PL.id)) player.stop(); }
      if (A.$("canvas[data-lbs], .lb-eq, [data-lb-play]")) paint();
    });
  }).observe(document.body, { childList: true, subtree: true });

  const eqBars = (x, n = 32) => LB.bars(x.seed || x.id, n).map((v) => `<i style="--h:${Math.max(14, v)}%"></i>`).join("");
  const eq = (x, n = 32, cls = "") => `<div class="lb-eq ${cls}" data-eq="${esc(x.id)}" data-seed="${esc(x.seed || x.id)}" aria-hidden="true">${eqBars(x, n)}</div>`;
  const scroller = (x, win = 5, cls = "") => `<canvas class="lb-scroll ${cls}" data-lbs="${esc(x.id)}" data-seed="${esc(x.seed || x.id)}" data-d="${x.meta?.dur || 1}" data-win="${win}" data-act="lb-seek" data-id="${esc(x.id)}" aria-label="Waveform, click to seek"></canvas>`;
  const overview = (x) => `<canvas class="lb-scroll is-overview" data-lbs="${esc(x.id)}" data-seed="${esc(x.seed || x.id)}" data-d="${x.meta?.dur || 1}" aria-hidden="true"></canvas>`;
  const playBtn = (x, cls = "") => `<button type="button" class="lb-pbtn ${cls}" data-act="lb-play" data-lb-play="${esc(x.id)}" data-id="${esc(x.id)}" aria-label="Play">${ic("play")}</button>`;
  const timeLabel = (x, cls = "") => `<span class="mono lb-dur ${cls}" data-lb-time="${esc(x.id)}" data-d="${x.meta?.dur || 0}">${LB.dur(x.meta?.dur || 0)}</span>`;
  const vbar = (x, cls = "") => `<div class="lb-vbar ${cls}" data-lbp="${esc(x.id)}" data-d="${x.meta?.dur || 1}" data-act="lb-seek" data-id="${esc(x.id)}" style="--p:0"><i></i></div>`;
  const typeBadge = (x) => `<span class="type-tag">${ic(T[x.type].icon)}${esc(T[x.type].label)}</span>`;

  function media(x) {
    if (x.type === "image") return `<div class="lb-media" style="background:${esc(bgOf(x))}"><span class="badge lb-ext">${esc(ext(x))}</span></div>`;
    if (x.type === "video") return `<div class="lb-media" style="background:${esc(bgOf(x))}"><span class="badge lb-ext">${timeLabel(x)}</span></div>`;
    if (x.type === "sound") return `<div class="lb-media is-sound">${overview(x)}${timeLabel(x)}</div>`;
    return `<div class="lb-media is-prompt"><p>${esc(x.text.length > 180 ? `${x.text.slice(0, 180).trimEnd()}…` : x.text)}</p><span class="badge lb-ext">${esc(LB.PROMPT_KINDS[x.kind])}</span></div>`;
  }
  function thumb(x, cls = "") {
    if (x.type === "image" || x.type === "video") return `<span class="lb-th ${cls}" style="background:${esc(bgOf(x))}"></span>`;
    return `<span class="lb-th is-ic ${cls}">${ic(T[x.type].icon)}</span>`;
  }

  function baseList(sc) {
    const u = ui(sc.id);
    let l = st().assets.filter((x) => (sc.type ? x.type === sc.type : x.collectionId === sc.col));
    const f = filt();
    if (sc.type && f.col) l = l.filter((x) => (f.col === "none" ? !x.collectionId : x.collectionId === f.col));
    return l;
  }
  function items(sc) {
    const u = ui(sc.id);
    const needle = u.q.trim().toLowerCase();
    let l = baseList(sc);
    const tg = filt().tags;
    if (tg.length) l = l.filter((x) => tg.every((t) => x.tags.includes(t)));
    if (needle) l = l.filter((x) => `${x.name} ${x.tags.join(" ")} ${x.type === "prompt" ? x.text : ""}`.toLowerCase().includes(needle));
    const sorters = {
      new: (a, b) => (b.added || "").localeCompare(a.added || "") || b.id.localeCompare(a.id),
      name: (a, b) => a.name.localeCompare(b.name, "en"),
      size: (a, b) => b.size - a.size,
    };
    return [...l].sort(sorters[u.sort] || sorters.new);
  }
  const selectedId = (id) => {
    const value = ui(id).sel;
    return typeof value === "string" && byId(value) ? value : null;
  };
  const emptyBox = (title, text, cta = "") => `<div class="empty"><div class="empty-inner"><div class="illus"></div><h3 class="t-display-xs">${title}</h3><p class="t-sm t-mute">${text}</p>${cta}</div></div>`;
  const seg = (act, list, cur) => `<div class="seg" role="group">${list.map(([v, label, tip]) => `<button type="button" class="${String(v) === String(cur) ? "is-active" : ""}" data-act="${act}" data-v="${esc(v)}" ${tip ? `data-tip="${esc(tip)}" aria-label="${esc(tip)}"` : ""} aria-pressed="${String(v) === String(cur)}">${label}</button>`).join("")}</div>`;
  const opts = (list, cur) => list.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(label)}</option>`).join("");
  const bar = (left, right = "") => `<div class="nv-bar"><div class="nv-bar-l">${left}</div><span class="spacer"></span><div class="nv-bar-r">${right}</div></div>`;
  const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const insSec = (title, body) => `<section class="ins-sec"><span class="eyebrow">${esc(title)}</span>${body}</section>`;

  function browseView(id) {
    const sc = scope(id);
    const u = ui(id);
    if (sc.col && !colById(sc.col)) return emptyBox("The collection no longer exists", "This collection was deleted. Its resources are still in the library.");
    const list = items(sc);
    const base = baseList(sc);
    const selected = selectedId(id);
    const type = sc.type ? T[sc.type] : null;

    const f = filt();
    const chip = (act, v, label) => `<span class="tag">${label}<button type="button" class="tag-x" data-act="${act}" data-v="${esc(v)}" aria-label="Remove ${esc(label)} filter">${ic("x")}</button></span>`;
    const chips = filtActive()
      ? `<span class="nm-chips">${f.col && sc.type ? chip("lb-fcol", f.col, `${ic("folder")}${esc(f.col === "none" ? "Uncategorized" : colById(f.col).name)}`) : ""}${f.tags.map((t) => chip("lb-ftag", t, esc(t))).join("")}<button type="button" class="btn btn-sm btn-ghost" data-act="lb-ftag-clear">Clear filters</button></span>`
      : "";

    let body;
    if (!list.length) {
      const filtered = u.q || filtActive();
      body = filtered
        ? emptyBox("No resources match", "Try another keyword or remove the filters.", `<button class="btn" data-act="lb-clear-filter">Clear filters</button>`)
        : sc.col
          ? emptyBox("This collection has no resources yet", "Choose resources in the Images, Sounds, Videos, Prompts screens and move them into this collection, or upload directly here.", `<div class="empty-act"><button class="btn btn-primary" data-act="lb-upload-menu">${ic("upload")}Upload…</button></div>`)
          : emptyBox(`No ${type.noun} yet`, `Upload ${type.noun} to the shared library to reuse them in every project. ${esc(type.hint)}.`, `<div class="empty-act"><button class="btn btn-primary" data-act="lb-upload" data-v="${type.key}">${ic("upload")}Upload ${type.noun}</button>${sc.type === "prompt" ? `<button class="btn" data-act="lb-upload" data-v="prompt" data-w="write">${ic("pen")}Write prompt</button>` : ""}</div>`);
    } else if (view() === "grid") {
      const gp = hasRatio(sc.type) ? gridPref(sc.type) : null;
      body = `<div class="lb-grid ${sc.type === "prompt" ? "is-wide" : ""}" ${gp ? `style="--lb-min:${gp.size}px;--lb-ar:${gp.ratio}"` : ""}>${list.map((x) => `<div class="lb-card ${selected === x.id ? "is-selected" : ""}" tabindex="0" data-act="lb-sel" data-id="${x.id}" ${openAttr(x)} title="${esc(x.name)}">
          ${media(x)}
          <div class="lb-card-b"><div class="lb-name t-ink">${sc.col ? `<span class="lb-tic">${ic(T[x.type].icon)}</span>` : ""}<span class="lb-name-t">${esc(x.name)}</span></div>
          <div class="t-sm t-mute lb-sub">${esc(metaText(x))} · ${LB.bytes(x.size)}</div></div></div>`).join("")}</div>`;
    } else {
      const rows = list.map((x) => `<tr class="${selected === x.id ? "is-selected" : ""}" tabindex="0" data-act="lb-sel" data-id="${x.id}" ${openAttr(x)}>
        <td><div class="nm-title">${thumb(x)}<div class="lb-rname"><div class="t-ink">${esc(x.name)}</div>${sc.col ? `<div class="t-sm t-mute">${typeBadge(x)}</div>` : ""}</div></div></td>
        <td class="mono t-mute">${esc(metaText(x))}</td><td class="num">${LB.bytes(x.size)}</td>
        <td class="t-sm t-mute lb-cols">${collectionOf(x) ? esc(collectionOf(x).name) : "—"}</td>
        <td class="mono t-mute">${esc((x.added || "").slice(0, 10))}</td></tr>`).join("");
      body = `<table class="table"><thead><tr><th>Name</th><th>${sc.type === "image" ? "Size" : sc.type === "prompt" ? "Length" : "Specs"}</th><th class="num">File size</th><th>Collection</th><th>Added at</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const title = sc.col ? `<span class="nv-ttl">${ic("folder")}<span class="t-ink">${esc(colById(sc.col).name)}</span></span>` : "";
    return `<div class="nv lb">
      ${bar(
        `${title}<label class="search"><span class="sr-only">Search resources</span><input id="lb-q" class="input" type="search" value="${esc(u.q)}" placeholder="${sc.type === "prompt" ? "Search by name, tag or content…" : "Search by name or tag…"}" data-on="lb-q"></label>
         <span class="t-sm t-mute" id="lb-count">${count(list, type ? type.noun : "resources")}${base.length !== list.length ? ` / ${base.length}` : ""}</span>${chips}`,
        `${hasRatio(sc.type) && view() === "grid" ? `<span class="lb-size" data-tip="Preview size">${ic("image")}<input type="range" class="range" min="110" max="360" step="10" value="${gridPref(sc.type).size}" data-on="lb-size" aria-label="Preview size"></span>${seg("lb-ratio", RATIOS.map(([v, label]) => [v, ic(`ratio-${v.replace("/", "-")}`), `${label} ratio`]), gridPref(sc.type).ratio)}` : ""}<select class="select" data-change="lb-sort" aria-label="Sort">${opts([["new", "Newest"], ["name", "Name A–Z"], ["size", "File size"]], u.sort)}</select>
         ${seg("lb-view", [["grid", ic("frames"), "Grid view"], ["list", ic("list"), "List view"]], view())}
         ${sc.type === "prompt" ? `<button class="btn btn-sm" data-act="lb-upload" data-v="prompt" data-w="write">${ic("pen")}Write prompt</button>` : ""}
         ${type ? `<button class="btn btn-sm btn-primary" data-act="lb-upload" data-v="${type.key}">${ic("upload")}Upload</button>` : `<button class="btn btn-sm btn-primary" data-act="lb-upload-menu">${ic("upload")}Upload…</button>`}`,
      )}
      <div class="nv-body lb-body"><div class="nv-scroll ${selected ? "has-sel" : ""}" data-keep="lb">${body}</div></div>
    </div>`;
  }

  function applySel() { A.rerender(); }

  const field = (label, id, control) => `<div class="field"><label for="${id}">${label}</label>${control}</div>`;

  function tagEditor(ids, tags, bulk = false) {
    const sug = st().tagList.filter((t) => !tags.includes(t));
    const one = ids.length === 1;
    return `<div class="field"><label for="lb-tag-in">Tags${one ? ` <span class="t-mute mono">${tags.length}/${MAX_TAGS}</span>` : ""}</label>
      ${one ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}<button type="button" class="tag-x" data-act="lb-tag-del" data-id="${ids[0]}" data-t="${esc(t)}" aria-label="Remove tag ${esc(t)}">${ic("x")}</button></span>`).join("") || `<span class="t-sm t-mute">No tags yet.</span>`}</div>` : ""}
      <input id="lb-tag-in" class="input tag-in" list="lb-tag-sug" placeholder="${bulk ? "Add a tag to all, press Enter…" : "Add a tag, press Enter…"}" data-enter="lb-tag-add" autocomplete="off" ${one && tags.length >= MAX_TAGS ? "disabled" : ""}>
      <datalist id="lb-tag-sug">${sug.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist></div>`;
  }
  function colEditor(x) {
    return `<div class="field"><label for="lb-col-add">Collection</label>
      <select id="lb-col-add" class="select" data-change="lb-col-add"><option value="" ${x.collectionId ? "" : "selected"}>Not in any collection</option>${st().collections.map((c) => `<option value="${c.id}" ${x.collectionId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="__new">＋ New collection…</option></select></div>`;
  }
  function assetPanel(x) {
    const t = T[x.type];
    const rows = [["ID", `<span class="mono">${esc(x.id)}</span>`]];
    if (x.type !== "prompt") rows.push(["Format", esc(ext(x) || "—")]);
    if (x.type === "image") rows.push(["Size", `${x.meta.w} × ${x.meta.h} px`]);
    if (x.type === "sound") rows.push(["Duration", LB.dur(x.meta.dur)], ["Audio", `${esc(x.meta.rate)} · ${esc(x.meta.ch)}`]);
    if (x.type === "video") rows.push(["Duration", LB.dur(x.meta.dur)], ["Frame rate", `${x.meta.w} × ${x.meta.h}${x.meta.fps ? ` · ${x.meta.fps} fps` : ""}`]);
    if (x.type === "prompt") rows.push(["Length", `${x.text.length} characters`], ["Variables", LB.varsOf(x.text).map((v) => `<span class="chip is-static">${esc(`{{${v}}}`)}</span>`).join("") || "—"]);
    rows.push(["File size", LB.bytes(x.size)], ["Added at", `<span class="mono">${esc(x.added || "—")}</span>`], ["Source", esc(x.origin)]);
    return `<section class="ins-sec lb-ins-top">
        <div class="lb-ins-name"><span class="type-tag">${ic(t.icon)}${esc(t.label)}</span></div>
        ${field("Name", "lb-f-name", `<input id="lb-f-name" class="input" value="${esc(x.name)}" data-change="lb-edit" data-id="${x.id}" data-f="name" autocomplete="off">`)}
        ${x.type === "prompt" ? field("Prompt type", "lb-f-kind", `<select id="lb-f-kind" class="select" data-change="lb-edit" data-id="${x.id}" data-f="kind">${opts(Object.entries(LB.PROMPT_KINDS), x.kind)}</select>`)
          + field("Content", "lb-f-text", `<textarea id="lb-f-text" class="textarea" rows="8" data-change="lb-edit" data-id="${x.id}" data-f="text">${esc(x.text)}</textarea><span class="field-hint">Use {{variable_name}} for the parts to replace when applying the prompt.</span>`) : ""}
      </section>
      <section class="ins-sec ins-form">${tagEditor([x.id], x.tags)}${colEditor(x)}
        ${field("Usage rights", "lb-f-rights", `<select id="lb-f-rights" class="select" data-change="lb-edit" data-id="${x.id}" data-f="rights">${opts(Object.entries(LB.RIGHTS), x.rights)}</select><span class="field-hint">You are responsible for ensuring you have the right to use this resource for its intended purpose.</span>`)}</section>
      ${insSec("Information", kv(rows))}
      <section class="ins-sec ins-actions">${x.type === "prompt" ? `<button class="btn" data-act="lb-copy" data-id="${x.id}">${ic("copy")}Copy</button>` : ""}<button class="btn btn-danger" data-act="lb-del" data-id="${x.id}">${ic("trash")}Delete</button></section>`;
  }
  function browseInspector(id) {
    const selected = selectedId(id);
    if (selected) return assetPanel(byId(selected));
    return `<div class="ins-empty"><p>Choose a resource to see its properties.</p></div>`;
  }

  const uniqueName = (type, name, exceptId) => {
    const taken = new Set(st().assets.filter((x) => x.type === type && x.id !== exceptId).map((x) => x.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    const dot = name.lastIndexOf(".");
    const [base, tail] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let i = 2; ; i++) if (!taken.has(`${base} (${i})${tail}`.toLowerCase())) return `${base} (${i})${tail}`;
  };
  function addTagTo(x, raw) {
    const t = LB.normTag(raw);
    if (!t) return "";
    if (x.tags.includes(t)) return "dup";
    if (x.tags.length >= MAX_TAGS) return "max";
    x.tags.push(t);
    if (!st().tagList.includes(t)) { st().tagList.push(t); st().tagList.sort(); }
    return "ok";
  }
  const refresh = () => { A.renderExplorer(); A.rerender(); };

  let pendingDel = [];
  function openDelete(ids) {
    pendingDel = ids.filter(byId);
    if (!pendingDel.length) return;
    const list = pendingDel.map(byId);
    const one = list.length === 1;
    A.modal({
      title: one ? "Delete resource" : `Delete ${list.length} resources`, eyebrow: CAP,
      body: `<div class="del-list">${list.slice(0, 8).map((x) => `<div class="del-row">${thumb(x, "is-md")}<div><div class="t-ink">${esc(x.name)}</div><div class="t-sm t-mute">${esc(T[x.type].label)} · ${LB.bytes(x.size)}</div></div></div>`).join("")}${list.length > 8 ? `<span class="t-sm t-mute">and ${list.length - 8} more</span>` : ""}</div>
        <div class="ld-warn">${ic("alert")}<span>The files will be deleted from the folder <span class="path">library\\</span> of the workspace. This cannot be undone.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-danger" data-act="lb-del-confirm">${ic("trash")}Delete${one ? "" : ` ${list.length}`}</button>`,
    });
  }

  /* Prompts have no preview dialog: they are read and copied from the inspector. */
  const previewable = (x) => !!x && x.type !== "prompt";
  const openAttr = (x) => (previewable(x) ? `data-lb-open="${x.id}"` : "");
  let PV = { ids: [], i: 0, open: false };
  function openPreview(id) {
    if (!previewable(byId(id))) return;
    const ids = items(scope(A.S.active)).filter(previewable).map((x) => x.id);
    PV = { ids: ids.includes(id) ? ids : [id], i: 0, open: false };
    PV.i = Math.max(0, PV.ids.indexOf(id));
    drawPreview();
  }
  function stage(x) {
    if (x.type === "image") return x.img ? `<img class="lbp-img" src="${esc(x.img)}" alt="${esc(x.name)}">` : `<div class="lbp-img is-art" style="background:${esc(bgOf(x))}" role="img" aria-label="${esc(x.name)}"></div>`;
    if (x.type === "video") {
      if (x.url) return `<video class="lbp-img" src="${esc(x.url)}" controls ${x.img ? `poster="${esc(x.img)}"` : ""}></video>`;
      return `<div class="lbp-img is-art is-video" style="background:${esc(bgOf(x))}" role="img" aria-label="${esc(x.name)}"><button type="button" class="lb-pbtn is-lg" data-act="lb-play" data-lb-play="${x.id}" data-id="${x.id}" aria-label="Play">${ic("play")}</button>
        ${vbar(x)}</div><div class="lbp-bar">${timeLabel(x)}<span class="t-sm t-mute">Prototype: video is simulated, no real picture.</span></div>`;
    }
    return `<div class="lbp-sound"><div class="lbp-part"><span class="eyebrow">Spectrum</span>${eq(x, BANDS, "is-big")}</div><div class="lbp-part"><span class="eyebrow">Waveform</span>${scroller(x, 10, "is-big is-paged")}</div><div class="lbp-bar">${playBtn(x, "is-lg")}${timeLabel(x)}<span class="t-sm t-mute">${esc(x.meta.rate)} · ${esc(x.meta.ch)}</span></div></div>`;
  }
  function drawPreview() {
    const x = byId(PV.ids[PV.i]);
    if (!x) { A.closeModal(); return; }
    const n = PV.ids.length;
    PV.open = true;
    A.modal({
      title: x.name, eyebrow: `${T[x.type].label} · ${PV.i + 1} / ${n}`, cls: "modal-xl lbp-modal",
      body: `<div class="lbp"><div class="lbp-stage">${stage(x)}<button type="button" class="btn btn-icon lbp-nav is-prev" data-act="lb-pv-prev" aria-label="Previous" ${PV.i <= 0 ? "disabled" : ""}>${ic("chev-l")}</button><button type="button" class="btn btn-icon lbp-nav is-next" data-act="lb-pv-next" aria-label="Next" ${PV.i >= n - 1 ? "disabled" : ""}>${ic("chev-r")}</button></div>
        <aside class="lbp-side">${kv([["ID", `<span class="mono">${esc(x.id)}</span>`], ["Specs", esc(metaText(x))], ["File size", LB.bytes(x.size)], ["Added at", `<span class="mono">${esc(x.added || "—")}</span>`], ["Usage rights", esc(LB.RIGHTS[x.rights])]])}
          ${x.tags.length ? `<div><span class="eyebrow">Tags</span><div class="tags lb-pt">${x.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>` : ""}
          ${collectionOf(x) ? `<div><span class="eyebrow">Collection</span><div class="tags lb-pt"><span class="tag lb-ctag">${ic("folder")}${esc(collectionOf(x).name)}</span></div></div>` : ""}</aside></div>`,
    });
    player.paint();
  }
  const pvGo = (d) => { const i = PV.i + d; if (i >= 0 && i < PV.ids.length) { PV.i = i; drawPreview(); } };

  const CT = () => ui("ct");
  const counts = (pred) => Object.fromEntries(typeCounts(st().assets.filter(pred)));
  const cntRow = (c) => `<span class="lb-cnts">${Object.keys(T).map((k) => `<span class="lb-cnt ${c[k] ? "" : "is-zero"}" title="${esc(T[k].label)}">${ic(T[k].icon)}<b>${c[k]}</b></span>`).join("")}</span>`;
  const tagStats = () => st().tagList.map((t) => ({ t, c: counts((x) => x.tags.includes(t)) })).map((r) => ({ ...r, n: Object.values(r.c).reduce((a, b) => a + b, 0) }));

  function ctView() {
    const u = CT();
    const sel = u.sel || null;
    const cols = st().collections;
    const needle = (u.q || "").trim().toLowerCase();
    const tags = tagStats().filter((r) => !needle || r.t.includes(needle)).sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));
    const unfiled = st().assets.filter((x) => !x.collectionId).length;
    const colRows = cols.map((c) => `<tr tabindex="0" data-act="ct-sel" data-k="col" data-id="${c.id}" class="${sel?.k === "col" && sel.id === c.id ? "is-selected" : ""}">
        <td><div class="nm-title">${ic("folder")}<div><div class="t-ink">${esc(c.name)}</div><div class="t-sm t-mute lb-desc">${esc(c.desc || "No description")}</div></div></div></td>
        <td>${cntRow(counts((x) => x.collectionId === c.id))}</td></tr>`).join("");
    const tagRows = tags.map((r) => `<tr tabindex="0" data-act="ct-sel" data-k="tag" data-id="${esc(r.t)}" class="${sel?.k === "tag" && sel.id === r.t ? "is-selected" : ""}">
        <td><span class="tag">${esc(r.t)}</span></td><td>${cntRow(r.c)}</td><td class="num mono t-mute">${r.n}</td></tr>`).join("");
    return `<div class="nv lb">
      ${bar(`<span class="nv-ttl">${ic("tag")}<span class="t-ink">Collections &amp; tags</span></span><span class="t-sm t-mute">${cols.length} collections · ${st().tagList.length} tags · ${unfiled} uncategorized resources</span>`,
        `<button class="btn btn-sm" data-act="ct-new-tag">${ic("plus")}Tag</button><button class="btn btn-sm btn-primary" data-act="ct-new-col">${ic("plus")}Collection</button>`)}
      <div class="nv-body lb-ct">
        <section class="lb-ct-pane"><header class="lb-ct-h"><span class="eyebrow">Collections</span><span class="t-sm t-mute">Each resource belongs to at most one collection; a collection can hold every type.</span></header>
          <div class="nv-scroll" data-keep="ct-col">${cols.length ? `<table class="table"><thead><tr><th>Collection</th><th>Resources</th></tr></thead><tbody>${colRows}</tbody></table>`
            : emptyBox("No collections yet", "A collection groups resources of the same theme, for example the setting of a work or a channel’s branding set.", `<button class="btn btn-primary" data-act="ct-new-col">${ic("plus")}Create collection</button>`)}</div></section>
        <section class="lb-ct-pane"><header class="lb-ct-h"><span class="eyebrow">Tags</span><label class="search"><span class="sr-only">Search tags</span><input id="ct-q" class="input" type="search" value="${esc(u.q || "")}" placeholder="Search tags…" data-on="ct-q"></label></header>
          <div class="nv-scroll" data-keep="ct-tag">${tags.length ? `<table class="table"><thead><tr><th>Tag</th><th>Resources</th><th class="num">Total</th></tr></thead><tbody>${tagRows}</tbody></table>`
            : emptyBox(st().tagList.length ? "No tags match" : "No tags yet", "Tags are free labels attached to resources for quick filtering. Add tags when uploading or in the Inspector.")}</div></section>
      </div></div>`;
  }

  function colPanel(c, withOpen) {
    const cn = counts((x) => x.collectionId === c.id);
    const total = Object.values(cn).reduce((a, b) => a + b, 0);
    return `<section class="ins-sec ins-form"><span class="eyebrow">Collection</span>
        ${field("Name", "ct-f-name", `<input id="ct-f-name" class="input" value="${esc(c.name)}" data-change="ct-col-edit" data-id="${c.id}" data-f="name" autocomplete="off">`)}
        ${field("Description", "ct-f-desc", `<textarea id="ct-f-desc" class="textarea" rows="3" data-change="ct-col-edit" data-id="${c.id}" data-f="desc">${esc(c.desc || "")}</textarea>`)}</section>
      ${insSec("Content", kv([...Object.keys(T).map((k) => [T[k].label, cn[k]]), ["Total", total], ["Created at", `<span class="mono">${esc(c.created)}</span>`]]))}
      <section class="ins-sec ins-actions">${withOpen ? `<button class="btn btn-primary" data-act="lb-open-col" data-id="${c.id}">${ic("folder-open")}Open</button>` : ""}<button class="btn btn-danger" data-act="ct-col-del" data-id="${c.id}">${ic("trash")}Delete collection</button></section>
      <section class="ins-sec"><span class="field-hint">Deleting a collection does not delete the resources inside, it only removes them from the collection.</span></section>`;
  }
  function tagPanel(t) {
    const cn = counts((x) => x.tags.includes(t));
    const total = Object.values(cn).reduce((a, b) => a + b, 0);
    const others = st().tagList.filter((g) => g !== t);
    return `<section class="ins-sec ins-form"><span class="eyebrow">Tag</span>
        ${field("Tag name", "ct-f-tag", `<input id="ct-f-tag" class="input" value="${esc(t)}" data-change="ct-tag-rename" data-t="${esc(t)}" autocomplete="off"><span class="field-hint">Renaming applies to ${total} resources using this tag.</span>`)}
        ${others.length ? field("Merge into another tag", "ct-f-merge", `<select id="ct-f-merge" class="select" data-change="ct-tag-merge" data-t="${esc(t)}"><option value="">Choose a tag…</option>${others.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("")}</select>`) : ""}</section>
      <section class="ins-sec"><span class="eyebrow">View resources</span>${Object.keys(T).map((k) => `<button type="button" class="nm-recent" data-act="ct-tag-view" data-k="${k}" data-t="${esc(t)}" ${cn[k] ? "" : "disabled"}>${ic(T[k].icon)}<span class="tree-label">${esc(T[k].label)}</span><span class="mono t-mute">${cn[k]}</span></button>`).join("")}</section>
      <section class="ins-sec ins-actions"><button class="btn btn-danger" data-act="ct-tag-del" data-t="${esc(t)}">${ic("trash")}Delete tag</button></section>`;
  }
  function ctInspector() {
    const sel = CT().sel;
    if (sel?.k === "col" && colById(sel.id)) return colPanel(colById(sel.id), true);
    if (sel?.k === "tag" && st().tagList.includes(sel.id)) return tagPanel(sel.id);
    const unf = counts((x) => !x.collectionId);
    return `${insSec("Classify resources", kv([["Collection", st().collections.length], ["Tag", st().tagList.length], ["Resources", st().assets.length], ["Uncategorized", Object.values(unf).reduce((a, b) => a + b, 0)]]))}
      <section class="ins-sec"><span class="eyebrow">Not in any collection</span>${cntRow(unf)}</section>
      <section class="ins-sec"><span class="eyebrow">How to classify</span><p class="t-sm t-mute">Collections group resources by theme and can hold every type. Tags are free labels shared by all four types, for quick filtering in each screen.</p></section>`;
  }

  function openNewCollection(assign = []) {
    A.modal({
      title: "Create collection", eyebrow: CAP,
      body: `<div class="field"><label for="nc-name">Collection name</label><input id="nc-name" class="input" placeholder="Example: Setting for chapters 1–5" autocomplete="off"><p class="field-err" id="nc-err" hidden></p></div>
        <div class="field"><label for="nc-desc">Description</label><textarea id="nc-desc" class="textarea" rows="3" placeholder="Optional"></textarea></div>
        ${assign.length ? `<p class="t-sm t-mute">${assign.length} selected resources will be moved into this collection.</p>` : ""}`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="ct-new-col-submit" data-ids="${esc(assign.join(","))}">Create collection</button>`,
    });
  }
  function openNewTag() {
    A.modal({
      title: "Create tag", eyebrow: CAP,
      body: `<div class="field"><label for="nt-name">Tag name</label><input id="nt-name" class="input" placeholder="Example: ambience" autocomplete="off"><span class="field-hint">Lowercase, no spaces (converted to hyphens automatically), up to 24 characters.</span><p class="field-err" id="nt-err" hidden></p></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="ct-new-tag-submit">Create tag</button>`,
    });
  }
  let pendingCol = null;
  function openDeleteCollection(id) {
    const c = colById(id);
    if (!c) return;
    pendingCol = id;
    const n = st().assets.filter((x) => x.collectionId === id).length;
    A.modal({
      title: "Delete collection", eyebrow: CAP,
      body: `<p>Delete collection <b class="t-ink">${esc(c.name)}</b>?</p><div class="ld-warn">${ic("alert")}<span>${n ? `${n} resources inside will stay in the library, they are only removed from this collection.` : "This collection is empty."}</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-danger" data-act="ct-col-del-confirm">${ic("trash")}Delete collection</button>`,
    });
  }
  let pendingTag = null;
  function openTagConfirm(kind, t, target = "") {
    pendingTag = { kind, t, target };
    const n = st().assets.filter((x) => x.tags.includes(t)).length;
    A.modal({
      title: kind === "merge" ? "Merge tags" : "Delete tag", eyebrow: CAP,
      body: kind === "merge"
        ? `<p>Merge <span class="tag">${esc(t)}</span> into <span class="tag">${esc(target)}</span>?</p><div class="ld-warn">${ic("alert")}<span>${n} resources using “${esc(t)}” will move to “${esc(target)}”. The tag “${esc(t)}” will disappear.</span></div>`
        : `<p>Delete tag <span class="tag">${esc(t)}</span>?</p><div class="ld-warn">${ic("alert")}<span>The tag will be removed from ${n} resources. The resources themselves are not deleted.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn ${kind === "merge" ? "btn-primary" : "btn-danger"}" data-act="ct-tag-confirm">${kind === "merge" ? "Merge tags" : `${ic("trash")}Delete tag`}</button>`,
    });
  }

  Object.keys(LB.TAB).forEach((tab) => { A.VIEWS[tab] = { fill: true, render: browseView, inspector: browseInspector, mount: () => player.paint() }; });
  A.VIEWS.collection = { fill: true, render: browseView, inspector: browseInspector, mount: () => player.paint() };
  A.VIEWS.collections = { fill: true, render: ctView, inspector: ctInspector };

  function openCollection(id) {
    const c = colById(id);
    if (c) A.openTab(`collection:${id}`, { title: c.name, tab: c.name, icon: "folder", section: "Collections", cap: CAP, rail: "library", blurb: "", reqs: [] });
  }
  LB.openCollection = openCollection;

  Object.entries(LB.TAB).forEach(([tab, type]) => { A.NAV_COUNT[tab] = () => st().assets.filter((x) => x.type === type).length; });

  A.EXPLORER_EXTRA.libfilters = () => {
    const f = filt();
    const cnt = (pred) => st().assets.filter(pred).length;
    const pill = (act, v, label, n, on) => `<button type="button" class="nf-pill ${on ? "is-on" : ""}" data-act="${act}" data-v="${esc(v)}" aria-pressed="${on}" title="${esc(label)} · ${n}"><span class="nf-t">${esc(label)}</span><span class="nf-n mono">${n}</span></button>`;
    const colOpts = [["", `All collections (${st().assets.length})`], ["none", `Uncategorized (${cnt((x) => !x.collectionId)})`], ...st().collections.map((c) => [c.id, `${c.name} (${cnt((x) => x.collectionId === c.id)})`])];
    const pool = poolOf(scope(A.S.active));
    const tags = st().tagList.map((t) => [t, pool.filter((x) => x.tags.includes(t)).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return `<div class="nf-label">Collection</div><div class="nf-sel"><select class="select" data-change="lb-fcol-sel" aria-label="Filter by collection">${opts(colOpts, f.col)}</select></div>
      <div class="nf-label">Tags</div><div class="nf-pills">${tags.map(([t, n]) => pill("lb-ftag", t, t, n, f.tags.includes(t))).join("") || `<span class="nx-empty">No tags yet</span>`}</div>
      ${filtActive() ? `<div class="tree-row nf-clear" tabindex="0" data-act="lb-ftag-clear">${ic("x")}<span class="tree-label">Clear filters</span></div>` : ""}`;
  };

  A.EXPLORER_EXTRA.organize = () => {
    const active = A.S.active;
    const rows = st().collections.map((c) => {
      const n = st().assets.filter((x) => x.collectionId === c.id).length;
      return `<div class="tree-row nx-child lb-xcol ${active === `collection:${c.id}` ? "is-selected" : ""}" tabindex="0" role="treeitem" data-act="lb-open-col" data-id="${c.id}">${ic("folder")}<span class="tree-label">${esc(c.name)}</span><span class="nx-n mono">${n}</span></div>`;
    }).join("");
    return `<div class="nx-sep"></div>${rows || `<div class="nx-empty">No collections yet</div>`}`;
  };

  const stopEvt = (e) => e?.stopPropagation();
  const assign = (ids, fn) => { ids.map(byId).filter(Boolean).forEach((x) => { fn(x); touch(x); }); };

  Object.assign(A.ACT, {
    "lb-sel": (el, e) => {
      const id = A.S.active;
      const u = ui(id);
      const dbl = e?.detail >= 2;
      u.sel = !dbl && u.sel === el.dataset.id ? null : el.dataset.id;
      applySel();
      if (e?.detail >= 2 && !e.target.closest("input,button,select")) openPreview(el.dataset.id);
    },
    "lb-ratio": (el) => {
      const t = scope(A.S.active).type;
      A.store.set(`lb.grid.${t}`, { ...gridPref(t), ratio: el.dataset.v });
      A.rerender();
    },
    "lb-view": (el) => { A.store.set("lb.view", el.dataset.v); A.rerender(); },
    "lb-ftag": (el) => {
      const tg = filt().tags;
      const i = tg.indexOf(el.dataset.v);
      if (i < 0) tg.push(el.dataset.v); else tg.splice(i, 1);
      refresh();
    },
    "lb-fcol": (el) => { const f = filt(); f.col = f.col === el.dataset.v ? "" : el.dataset.v; refresh(); },
    "lb-ftag-clear": () => { const f = filt(); f.col = ""; f.tags = []; refresh(); },
    "lb-clear-filter": () => { ui(A.S.active).q = ""; const f = filt(); f.col = ""; f.tags = []; refresh(); },
    "lb-play": (el, e) => {
      stopEvt(e);
      const x = byId(el.dataset.id);
      if (x?.type === "video" && x.url) { openPreview(x.id); return; }
      const tr = player.track(el.dataset.id);
      if (tr) player.toggle(el.dataset.id, tr);
    },
    "lb-seek": (el, e) => {
      stopEvt(e);
      const r = el.getBoundingClientRect();
      const w = el._win;
      const x01 = Math.max(0, Math.min(1, w ? (e.clientX - r.left - w.pad) / w.uw : (e.clientX - r.left) / r.width));
      const tr = player.track(el.dataset.id) || { dur: +el.dataset.d };
      player.seek(el.dataset.id, tr, w ? (w.start + x01 * w.len) / Math.max(1, tr.dur) : x01);
    },
    "lb-pv-prev": () => pvGo(-1),
    "lb-pv-next": () => pvGo(1),
    "lb-copy": (el) => {
      const x = byId(el.dataset.id);
      if (!x) return;
      (navigator.clipboard?.writeText(x.text) || Promise.reject()).then(() => A.toast("Prompt copied."), () => A.toast("Could not copy. Please select and copy manually.", "warning"));
    },
    "lb-del": (el) => openDelete(el.dataset.id ? [el.dataset.id] : [selectedId(A.S.active)].filter(Boolean)),
    "lb-del-confirm": () => {
      const ids = new Set(pendingDel);
      const n = ids.size;
      const first = byId(pendingDel[0])?.name;
      if (PL.id && ids.has(PL.id)) player.stop();
      st().assets = st().assets.filter((x) => !ids.has(x.id));
      Object.values(LB.ui).forEach((u) => { if (typeof u.sel === "string" && ids.has(u.sel)) u.sel = null; });
      pendingDel = [];
      A.closeModal();
      refresh();
      A.toast(n === 1 ? `Deleted “${first}”.` : `Deleted ${n} resources.`);
    },
    "lb-tag-del": (el) => { const x = byId(el.dataset.id); x.tags = x.tags.filter((t) => t !== el.dataset.t); touch(x); refresh(); },
    "lb-col-del": (el) => { const x = byId(el.dataset.id); x.collectionId = null; touch(x); refresh(); },
    "lb-tag-add": (el) => {
      const ids = [selectedId(A.S.active)].filter(Boolean);
      const raw = el.value;
      el.value = "";
      if (!ids.length) return;
      const res = ids.map((i) => addTagTo(byId(i), raw));
      if (res[0] === "dup") A.toast(`Tag “${LB.normTag(raw)}” already exists.`, "warning");
      else if (res[0] === "max") A.toast(`At most ${MAX_TAGS} tags per resource.`, "warning");
      else if (res[0] === "ok") A.toast(`Added tag “${LB.normTag(raw)}”.`);
      ids.forEach((i) => touch(byId(i)));
      refresh();
      A.$("#lb-tag-in")?.focus();
    },
    "lb-open-col": (el) => openCollection(el.dataset.id),
    "lb-upload-menu": (el) => {
      A.openMenu(el, Object.values(T).map((t) => ({ label: `Upload ${t.noun}…`, icon: t.icon, act: "lb-upload", v: t.key })));
    },
    "ct-sel": (el, e) => {
      if (el.dataset.k === "col" && e?.detail >= 2) { openCollection(el.dataset.id); return; }
      CT().sel = { k: el.dataset.k, id: el.dataset.id };
      A.rerender();
    },
    "ct-new-col": () => openNewCollection(),
    "ct-new-col-submit": (el) => {
      const name = A.$("#nc-name").value.trim();
      const err = A.$("#nc-err");
      const dup = st().collections.some((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!name || dup) { err.textContent = name ? "A collection with this name already exists." : "Enter a collection name."; err.hidden = false; A.$("#nc-name").classList.add("is-invalid"); return; }
      const id = `COL-${String(++st().seq.col).padStart(2, "0")}`;
      st().collections.push({ id, name, desc: A.$("#nc-desc").value.trim(), created: A.stamp() });
      const ids = (el.dataset.ids || "").split(",").filter(Boolean);
      assign(ids, (x) => { x.collectionId = id; });
      A.closeModal();
      refresh();
      A.toast(ids.length ? `Created “${name}” and moved ${ids.length} resources into it.` : `Created collection “${name}”.`);
    },
    "ct-col-del": (el) => openDeleteCollection(el.dataset.id),
    "ct-col-del-confirm": () => {
      const id = pendingCol;
      const c = colById(id);
      st().assets.forEach((x) => { if (x.collectionId === id) x.collectionId = null; });
      st().collections = st().collections.filter((k) => k.id !== id);
      if (A.S.tabs.includes(`collection:${id}`)) A.closeTab(`collection:${id}`);
      delete A.ITEMS[`collection:${id}`];
      Object.values(LB.ui).forEach((u) => { if (u.sel?.k === "col" && u.sel.id === id) u.sel = null; });
      pendingCol = null;
      A.closeModal();
      refresh();
      A.toast(`Deleted collection “${c?.name}”.`);
    },
    "ct-new-tag": openNewTag,
    "ct-new-tag-submit": () => {
      const raw = A.$("#nt-name").value;
      const t = LB.normTag(raw);
      const err = A.$("#nt-err");
      if (!t || st().tagList.includes(t)) { err.textContent = t ? `Tag “${t}” already exists.` : "Enter a tag name."; err.hidden = false; A.$("#nt-name").classList.add("is-invalid"); return; }
      st().tagList.push(t);
      st().tagList.sort();
      CT().sel = { k: "tag", id: t };
      A.closeModal();
      refresh();
      A.toast(`Created tag “${t}”.`);
    },
    "ct-tag-confirm": () => {
      const { kind, t, target } = pendingTag;
      if (kind === "merge") {
        st().assets.forEach((x) => { if (x.tags.includes(t)) x.tags = [...new Set(x.tags.map((g) => (g === t ? target : g)))]; });
        CT().sel = { k: "tag", id: target };
      } else {
        st().assets.forEach((x) => { x.tags = x.tags.filter((g) => g !== t); });
        CT().sel = null;
      }
      st().tagList = st().tagList.filter((g) => g !== t);

      pendingTag = null;
      A.closeModal();
      refresh();
      A.toast(kind === "merge" ? `Merged “${t}” into “${target}”.` : `Deleted tag “${t}”.`);
    },
    "ct-tag-del": (el) => openTagConfirm("delete", el.dataset.t),
    "ct-tag-view": (el) => {
      const type = el.dataset.k;
      ui(T[type].tab).q = "";
      Object.assign(LB.filt, { tags: [el.dataset.t], col: "" });
      A.renderExplorer();
      A.openTab(T[type].tab);
    },
  });

  Object.assign(A.ON, {
    "lb-size": (el) => {
      const t = scope(A.S.active).type;
      A.store.set(`lb.grid.${t}`, { ...gridPref(t), size: +el.value });
      A.$("#editor .lb-grid")?.style.setProperty("--lb-min", `${el.value}px`);
    },
    "lb-q": (el) => { ui(A.S.active).q = el.value; A.rerender(); },
    "lb-sort": (el) => { ui(A.S.active).sort = el.value; A.rerender(); },
    "lb-edit": (el) => {
      const x = byId(el.dataset.id);
      if (!x) return;
      const f = el.dataset.f;
      const v = f === "text" ? el.value : el.value.trim();
      if (f === "name") {
        if (!v) { el.value = x.name; A.toast("The name cannot be empty.", "warning"); return; }
        x.name = uniqueName(x.type, v, x.id);
        if (x.name !== v) A.toast(`A resource with the same name already exists, renamed to “${x.name}”.`, "warning");
      } else if (f === "text") {
        if (!v.trim()) { el.value = x.text; A.toast("The prompt content cannot be empty.", "warning"); return; }
        x.text = v;
        x.size = new Blob([v]).size;
      } else x[f] = v;
      touch(x);
      refresh();
    },
    "lb-col-add": (el) => {
      const v = el.value;
      const id = selectedId(A.S.active);
      if (!id) return;
      if (!v) { const x = byId(id); x.collectionId = null; touch(x); refresh(); return; }
      if (v === "__new") { openNewCollection([id]); return; }
      const x = byId(id);
      x.collectionId = v;
      touch(x);
      refresh();
      A.toast(`Moved the resource to “${colById(v).name}”.`);
    },
    "lb-fcol-sel": (el) => { filt().col = el.value; refresh(); },
    "ct-q": (el) => { CT().q = el.value; A.rerender(); },
    "ct-col-edit": (el) => {
      const c = colById(el.dataset.id);
      const v = el.value.trim();
      if (el.dataset.f === "name") {
        if (!v) { el.value = c.name; A.toast("The collection name cannot be empty.", "warning"); return; }
        if (st().collections.some((k) => k.id !== c.id && k.name.toLowerCase() === v.toLowerCase())) { el.value = c.name; A.toast("A collection with this name already exists.", "warning"); return; }
        c.name = v;
        const it = A.ITEMS[`collection:${c.id}`];
        if (it) { it.title = v; it.tab = v; }
      } else c.desc = v;
      refresh();
    },
    "ct-tag-rename": (el) => {
      const old = el.dataset.t;
      const t = LB.normTag(el.value);
      if (!t) { el.value = old; A.toast("The tag name cannot be empty.", "warning"); return; }
      if (t === old) { el.value = old; return; }
      if (st().tagList.includes(t)) { el.value = old; openTagConfirm("merge", old, t); return; }
      st().assets.forEach((x) => { x.tags = x.tags.map((g) => (g === old ? t : g)); });
      st().tagList = st().tagList.map((g) => (g === old ? t : g)).sort();
      LB.filt.tags = LB.filt.tags.map((g) => (g === old ? t : g));
      Object.values(LB.ui).forEach((u) => { if (u.sel?.k === "tag" && u.sel.id === old) u.sel.id = t; });
      refresh();
      A.toast(`Renamed tag “${old}” to “${t}”.`);
    },
    "ct-tag-merge": (el) => { const v = el.value; el.value = ""; if (v) openTagConfirm("merge", el.dataset.t, v); },
  });

  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest("[data-lb-open]");
    if (el && !el.dataset.act && !e.target.closest("input,button,select")) openPreview(el.dataset.lbOpen);
  });
  document.addEventListener("keydown", (e) => {
    if ($modal() && /lbp-modal/.test($modal().className)) {
      if (e.key === "ArrowLeft") pvGo(-1);
      else if (e.key === "ArrowRight") pvGo(1);
      return;
    }
    if (e.key === "Enter" && e.target.matches?.("tr[data-k=col]")) { openCollection(e.target.dataset.id); return; }
    if (e.key === "Enter" && e.target.matches?.("[data-lb-open]")) { openPreview(e.target.dataset.lbOpen); return; }
    const sc = A.S.active in LB.TAB || String(A.S.active).startsWith("collection:");
    const selected = selectedId(A.S.active);
    if (e.key === "Delete" && sc && !e.target.matches?.("input,textarea,select") && !$modal() && selected) openDelete([selected]);
  });
  const $modal = () => A.$("#layer .modal");

  LB.api = { byId, colById, ui, items, scope, nextId, uniqueName, addTagTo, refresh, thumb, bgOf, scroller, eq, opts, field, kv, insSec, bar, emptyBox, seg, openNewCollection, assign };
})();
