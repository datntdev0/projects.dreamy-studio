(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const T = LB.TYPES;

  const st = () => LB.state;
  const ui = (key) => (LB.ui[key] ||= { q: "", sel: [], anchor: null, sort: "new" });
  const byId = (id) => st().assets.find((x) => x.id === id);
  const nextId = (type) => `${T[type].id}-${String(++st().seq[type]).padStart(4, "0")}`;

  const uniqueName = (type, name, exceptId) => {
    const taken = new Set(st().assets.filter((x) => x.type === type && x.id !== exceptId).map((x) => x.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    const dot = name.lastIndexOf(".");
    const [base, tail] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let i = 2; ; i++) if (!taken.has(`${base} (${i})${tail}`.toLowerCase())) return `${base} (${i})${tail}`;
  };

  const PL = { id: null, playing: false, pos: 0, dur: 0, url: "", srcUrl: "", audio: null, ctx: null, an: null, freq: null, anFail: false, bands: null, timer: null, raf: 0, t: 0 };
  const curPos = () => (PL.playing ? Math.min(PL.dur, PL.pos + (performance.now() - PL.t) / 1000) : PL.pos);

  /* Real waveform: the file is decoded once and reduced to one peak (0-255) per 1/12 s, the same
     PEAK_RATE the app stores. Real spectrum: the playing <audio> goes through an AnalyserNode.
     Both need http(s) or blob: (fetch + CORS); on file:// or for assets without a file they fall
     back to the seeded synthetic data. */
  const PEAK_RATE = 12;
  const BARS = 64;
  /* Same tuning as the app (library.sounds.audio.ts): loud masters keep waveform peaks near full scale and
     analyser bytes high, so both are stretched to widen the swing. */
  const WAVE_LOW = 0.05;
  const WAVE_HIGH = 0.98;
  const WAVE_GAMMA = 1.25;
  const WAVE_MIN = 0.06;
  const SPEC_FLOOR = 0.35;
  const SPEC_GAMMA = 1.7;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const peakScale = (p) => {
    const sorted = Uint8Array.from(p).sort();
    const at = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1)))] || 0;
    const lo = at(WAVE_LOW);
    return { lo, hi: Math.max(lo + 24, at(WAVE_HIGH)) };
  };
  const waveShape = (v, sc) => WAVE_MIN + (1 - WAVE_MIN) * clamp01((v - sc.lo) / (sc.hi - sc.lo)) ** WAVE_GAMMA;
  const specContrast = (v) => clamp01((v - SPEC_FLOOR) / (1 - SPEC_FLOOR)) ** SPEC_GAMMA;
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
  const overviewOf = (p) => Array.from({ length: BARS }, (_, k) => {
    const a = Math.floor((k * p.length) / BARS);
    const b = Math.max(a + 1, Math.floor(((k + 1) * p.length) / BARS));
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
      PRE.set(name, { p, ov: overviewOf(p), sc: peakScale(p), err: false, bands: b64(raw.bands), rate: raw.rate, nb: raw.nb });
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
    return Array.from({ length: e.nb }, (_, k) => specContrast((e.bands[i * e.nb + k] * (1 - f) + e.bands[j * e.nb + k] * f) / 255));
  }
  function peaksOf(id) {
    const pre = preOf(id);
    if (pre) return pre;
    const url = player.track(id)?.url;
    if (!url || !CORS_OK && !url.startsWith("blob:")) return null;
    let e = PK.get(id);
    if (!e || e.url !== url) {
      e = { url, p: null, ov: null, sc: { lo: 0, hi: 255 }, err: false };
      PK.set(id, e);
      decodePeaks(url)
        .then((p) => { e.p = p; e.ov = overviewOf(p); e.sc = peakScale(p); })
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
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.55;
      PL.ctx.createMediaElementSource(PL.audio).connect(an);
      an.connect(PL.ctx.destination);
      PL.an = an;
      PL.freq = new Uint8Array(an.frequencyBinCount);
    } catch { PL.anFail = true; }
  }
  function spectrumBands(count = BARS) {
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
      if (i1 - i0 > 1) { let s = 0; let m = 0; for (let i = i0; i < i1; i++) { s += f[i]; if (f[i] > m) m = f[i]; } return specContrast(((s / (i1 - i0)) * 0.4 + m * 0.6) / 255); }
      const x = Math.max(0, Math.min(f.length - 1, Math.sqrt(a * b) / per - 0.5));
      const j = Math.floor(x);
      return specContrast((f[j] * (1 - (x - j)) + f[Math.min(f.length - 1, j + 1)] * (x - j)) / 255);
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
      if (slice <= 1.5 / PEAK_RATE) return waveShape(peakAt(pk.p, t) * 255, pk.sc);
      let m = 0;
      let sum = 0;
      let cnt = 0;
      for (let i = Math.max(0, Math.floor((t - slice / 2) * PEAK_RATE)); i <= Math.min(last, Math.floor((t + slice / 2) * PEAK_RATE)); i++) { sum += pk.p[i]; cnt++; if (pk.p[i] > m) m = pk.p[i]; }
      return waveShape((cnt ? sum / cnt : 0) * 0.5 + m * 0.5, pk.sc);
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
      bars.forEach((i, k) => i.style.setProperty("--h", `${Math.max(14, Math.round((pk.ov[Math.floor((k * pk.ov.length) / bars.length)] / m) * 100))}%`));
    }
    if (!live) { if (el._was) { el._was = false; bars.forEach((i) => i.style.removeProperty("--l")); } return; }
    el._was = true;
    const t = curPos();
    const seed = el.dataset.seed;
    const b = PL.bands;
    bars.forEach((i, k) => {
      let v;
      if (b) { const x = Math.max(0, Math.min(b.length - 1, ((k + 0.5) * b.length) / bars.length - 0.5)); const j = Math.floor(x); v = b[j] * (1 - (x - j)) + b[Math.min(b.length - 1, j + 1)] * (x - j); } else v = LB.band(seed, k, t);
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
      if (A.$("canvas[data-lbs], .lb-eq, [data-lb-play]")) paint();
    });
  }).observe(document.body, { childList: true, subtree: true });

  const eqBars = (x, n = 32) => LB.bars(x.seed || x.id, n).map((v) => `<i style="--h:${Math.max(14, v)}%"></i>`).join("");
  const eq = (x, n = 32, cls = "") => `<div class="lb-eq ${cls}" data-eq="${esc(x.id)}" data-seed="${esc(x.seed || x.id)}" aria-hidden="true">${eqBars(x, n)}</div>`;
  const scroller = (x, win = 5, cls = "") => `<canvas class="lb-scroll ${cls}" data-lbs="${esc(x.id)}" data-seed="${esc(x.seed || x.id)}" data-d="${x.meta?.dur || 1}" data-win="${win}" data-act="lb-seek" data-id="${esc(x.id)}" aria-label="Waveform, click to seek"></canvas>`;
  const emptyBox = (title, text, cta = "") => `<div class="empty"><div class="empty-inner"><div class="illus"></div><h3 class="t-display-xs">${title}</h3><p class="t-sm t-mute">${text}</p>${cta}</div></div>`;
  const seg = (act, list, cur, groupLabel = "") => `<div class="seg" role="group"${groupLabel ? ` aria-label="${esc(groupLabel)}"` : ""}>${list.map(([v, label, tip]) => `<button type="button" class="${String(v) === String(cur) ? "is-active" : ""}" data-act="${act}" data-v="${esc(v)}" ${tip ? `data-tip="${esc(tip)}" aria-label="${esc(tip)}"` : ""} aria-pressed="${String(v) === String(cur)}">${label}</button>`).join("")}</div>`;
  const opts = (list, cur) => list.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(label)}</option>`).join("");
  const bar = (left, right = "") => `<div class="nv-bar"><div class="nv-bar-l">${left}</div><span class="spacer"></span><div class="nv-bar-r">${right}</div></div>`;
  const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const insSec = (title, body) => `<section class="ins-sec"><span class="eyebrow">${esc(title)}</span>${body}</section>`;
  const field = (label, id, control) => `<div class="field"><label for="${id}">${label}</label>${control}</div>`;

  const stopEvt = (e) => e?.stopPropagation();

  Object.assign(A.ACT, {
    "lb-play": (el, e) => {
      stopEvt(e);
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
  });

  LB.api = { byId, ui, nextId, uniqueName, scroller, opts, field, kv, insSec, bar, emptyBox, seg };
})();
