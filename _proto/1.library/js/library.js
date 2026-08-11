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
    f.tags = f.tags.filter((t) => st().tagList.includes(t));
    return f;
  };
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
    prompt: `${(x.text || "").length} ký tự`,
  })[x.type];

  const PL = { id: null, playing: false, pos: 0, dur: 0, url: "", audio: null, timer: null, raf: 0, t: 0 };
  const curPos = () => (PL.playing ? Math.min(PL.dur, PL.pos + (performance.now() - PL.t) / 1000) : PL.pos);

  const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
  function drawScroller(c) {
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const dur = +c.dataset.d || 1;
    const win = Math.min(+c.dataset.win || 5, dur);
    const active = c.dataset.lbs === PL.id;
    const pos = active ? curPos() : 0;
    const start = Math.max(0, Math.min(dur - win, pos - win / 2));
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const step = 5;
    const n = Math.max(1, Math.floor(w / step));
    const played = css(c, "--primary-text");
    const rest = css(c, "--hairline-strong");
    const seed = c.dataset.seed;
    for (let i = 0; i < n; i++) {
      const t = start + ((i + 0.5) / n) * win;
      const bh = Math.max(2, LB.level(seed, t) * (h - 6));
      ctx.fillStyle = active && t <= pos ? played : rest;
      ctx.fillRect(i * step + (w - n * step) / 2, (h - bh) / 2, 3, bh);
    }
    const x = ((pos - start) / win) * w;
    ctx.fillStyle = css(c, "--ink");
    ctx.fillRect(Math.max(0, Math.min(w - 1.5, x - 0.75)), 0, 1.5, h);
    c._win = { start, len: win };
  }
  function drawEq(el) {
    const live = el.dataset.eq === PL.id && PL.playing;
    el.classList.toggle("is-live", live);
    if (!live) { if (el._was) { el._was = false; el.querySelectorAll("i").forEach((i) => i.style.removeProperty("--l")); } return; }
    el._was = true;
    const t = curPos();
    const seed = el.dataset.seed;
    el.querySelectorAll("i").forEach((i, k) => i.style.setProperty("--l", `${Math.round(LB.band(seed, k, t) * 100)}%`));
  }
  function drawLive() {
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
        el.setAttribute("aria-label", on ? "Tạm dừng" : "Phát");
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
      PL.audio ||= new Audio();
      if (PL.audio.src !== PL.url) PL.audio.src = PL.url;
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
    const tts = window.DS.STARTUP_STEPS.find((x) => x.id === "tts");
    if (tts) tts.result = "warn";
  };
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; if (A.$("canvas[data-lbs], .lb-eq, [data-lb-play]")) paint(); });
  }).observe(document.body, { childList: true, subtree: true });

  const eqBars = (x, n = 32) => LB.bars(x.seed || x.id, n).map((v) => `<i style="--h:${Math.max(14, v)}%"></i>`).join("");
  const eq = (x, n = 32) => `<div class="lb-eq" data-eq="${esc(x.id)}" data-seed="${esc(x.seed || x.id)}" aria-hidden="true">${eqBars(x, n)}</div>`;
  const scroller = (x, win = 5, cls = "") => `<canvas class="lb-scroll ${cls}" data-lbs="${esc(x.id)}" data-seed="${esc(x.seed || x.id)}" data-d="${x.meta?.dur || 1}" data-win="${win}" data-act="lb-seek" data-id="${esc(x.id)}" aria-label="Waveform, bấm để tua"></canvas>`;
  const playBtn = (x, cls = "") => `<button type="button" class="lb-pbtn ${cls}" data-act="lb-play" data-lb-play="${esc(x.id)}" data-id="${esc(x.id)}" aria-label="Phát">${ic("play")}</button>`;
  const timeLabel = (x, cls = "") => `<span class="mono lb-dur ${cls}" data-lb-time="${esc(x.id)}" data-d="${x.meta?.dur || 0}">${LB.dur(x.meta?.dur || 0)}</span>`;
  const vbar = (x, cls = "") => `<div class="lb-vbar ${cls}" data-lbp="${esc(x.id)}" data-d="${x.meta?.dur || 1}" data-act="lb-seek" data-id="${esc(x.id)}" style="--p:0"><i></i></div>`;
  const tagsHtml = (x, max = 3) => `<span class="tags">${x.tags.slice(0, max).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${x.tags.length > max ? `<span class="tag is-more">+${x.tags.length - max}</span>` : ""}</span>`;
  const typeBadge = (x) => `<span class="type-tag">${ic(T[x.type].icon)}${esc(T[x.type].label)}</span>`;

  function media(x) {
    if (x.type === "image") return `<div class="lb-media" style="background:${esc(bgOf(x))}"><span class="badge lb-ext">${esc(ext(x))}</span></div>`;
    if (x.type === "video") return `<div class="lb-media" style="background:${esc(bgOf(x))}">${playBtn(x)}<span class="badge lb-ext">${timeLabel(x)}</span>${vbar(x, "is-card")}</div>`;
    if (x.type === "sound") return `<div class="lb-media is-sound">${eq(x)}${playBtn(x)}${timeLabel(x)}</div>`;
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
      name: (a, b) => a.name.localeCompare(b.name, "vi"),
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
    if (sc.col && !colById(sc.col)) return emptyBox("Collection không còn tồn tại", "Collection này đã bị xóa. Tài nguyên bên trong vẫn còn trong thư viện.");
    const list = items(sc);
    const base = baseList(sc);
    const selected = selectedId(id);
    const type = sc.type ? T[sc.type] : null;

    const f = filt();
    const chip = (act, v, label) => `<span class="tag">${label}<button type="button" class="tag-x" data-act="${act}" data-v="${esc(v)}" aria-label="Bỏ lọc ${esc(label)}">${ic("x")}</button></span>`;
    const chips = filtActive()
      ? `<span class="nm-chips">${f.col && sc.type ? chip("lb-fcol", f.col, `${ic("folder")}${esc(f.col === "none" ? "Chưa phân loại" : colById(f.col).name)}`) : ""}${f.tags.map((t) => chip("lb-ftag", t, esc(t))).join("")}<button type="button" class="btn btn-sm btn-ghost" data-act="lb-ftag-clear">Xóa bộ lọc</button></span>`
      : "";

    let body;
    if (!list.length) {
      const filtered = u.q || filtActive();
      body = filtered
        ? emptyBox("Không có tài nguyên nào khớp", "Thử từ khóa khác hoặc bỏ bộ lọc.", `<button class="btn" data-act="lb-clear-filter">Xóa bộ lọc</button>`)
        : sc.col
          ? emptyBox("Collection này chưa có tài nguyên", "Chọn tài nguyên ở các màn hình Images, Sounds, Videos, Prompts rồi chuyển chúng vào collection này, hoặc upload thẳng vào đây.", `<div class="empty-act"><button class="btn btn-primary" data-act="lb-upload-menu">${ic("upload")}Upload…</button></div>`)
          : emptyBox(`Chưa có ${type.noun} nào`, `Upload ${type.noun} vào thư viện chung để dùng lại trong mọi project. ${esc(type.hint)}.`, `<div class="empty-act"><button class="btn btn-primary" data-act="lb-upload" data-v="${type.key}">${ic("upload")}Upload ${type.noun}</button>${sc.type === "prompt" ? `<button class="btn" data-act="lb-upload" data-v="prompt" data-w="write">${ic("pen")}Viết prompt</button>` : ""}</div>`);
    } else if (view() === "grid") {
      const gp = hasRatio(sc.type) ? gridPref(sc.type) : null;
      body = `<div class="lb-grid ${sc.type === "prompt" ? "is-wide" : ""}" ${gp ? `style="--lb-min:${gp.size}px;--lb-ar:${gp.ratio}"` : ""}>${list.map((x) => `<div class="lb-card ${selected === x.id ? "is-selected" : ""}" tabindex="0" data-act="lb-sel" data-id="${x.id}" data-lb-open="${x.id}" title="${esc(x.name)}">
          ${media(x)}
          <div class="lb-card-b"><div class="lb-name t-ink">${sc.col ? `<span class="lb-tic">${ic(T[x.type].icon)}</span>` : ""}<span class="lb-name-t">${esc(x.name)}</span></div>
          <div class="t-sm t-mute lb-sub">${esc(metaText(x))} · ${LB.bytes(x.size)}</div></div></div>`).join("")}</div>`;
    } else {
      const rows = list.map((x) => `<tr class="${selected === x.id ? "is-selected" : ""}" tabindex="0" data-act="lb-sel" data-id="${x.id}" data-lb-open="${x.id}">
        <td><div class="nm-title">${x.type === "sound" ? playBtn(x, "is-sm") : x.type === "video" ? `<span class="lb-thv">${thumb(x)}${playBtn(x, "is-sm")}</span>` : thumb(x)}<div class="lb-rname"><div class="t-ink">${esc(x.name)}</div>${sc.col ? `<div class="t-sm t-mute">${typeBadge(x)}</div>` : ""}</div></div></td>
        <td class="mono t-mute">${esc(metaText(x))}</td><td class="num">${LB.bytes(x.size)}</td>
        <td>${tagsHtml(x, 2)}</td>
        <td class="t-sm t-mute lb-cols">${collectionOf(x) ? esc(collectionOf(x).name) : "—"}</td>
        <td class="mono t-mute">${esc((x.added || "").slice(0, 10))}</td></tr>`).join("");
      body = `<table class="table"><thead><tr><th>Tên</th><th>${sc.type === "image" ? "Kích thước" : sc.type === "prompt" ? "Độ dài" : "Thông số"}</th><th class="num">Dung lượng</th><th>Tags</th><th>Collection</th><th>Thêm lúc</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const title = sc.col ? `<span class="nv-ttl">${ic("folder")}<span class="t-ink">${esc(colById(sc.col).name)}</span></span>` : "";
    return `<div class="nv lb">
      ${bar(
        `${title}<label class="search"><span class="sr-only">Tìm tài nguyên</span><input id="lb-q" class="input" type="search" value="${esc(u.q)}" placeholder="${sc.type === "prompt" ? "Tìm theo tên, tag hoặc nội dung…" : "Tìm theo tên hoặc tag…"}" data-on="lb-q"></label>
         <span class="t-sm t-mute" id="lb-count">${count(list, type ? type.noun : "tài nguyên")}${base.length !== list.length ? ` / ${base.length}` : ""}</span>${chips}`,
        `${hasRatio(sc.type) && view() === "grid" ? `<span class="lb-size" data-tip="Kích thước xem trước">${ic("image")}<input type="range" class="range" min="110" max="360" step="10" value="${gridPref(sc.type).size}" data-on="lb-size" aria-label="Kích thước xem trước"></span>${seg("lb-ratio", RATIOS.map(([v, label]) => [v, ic(`ratio-${v.replace("/", "-")}`), `Tỉ lệ ${label}`]), gridPref(sc.type).ratio)}` : ""}<select class="select" data-change="lb-sort" aria-label="Sắp xếp">${opts([["new", "Mới nhất"], ["name", "Tên A–Z"], ["size", "Dung lượng"]], u.sort)}</select>
         ${seg("lb-view", [["grid", ic("frames"), "Dạng lưới"], ["list", ic("list"), "Dạng danh sách"]], view())}
         ${sc.type === "prompt" ? `<button class="btn btn-sm" data-act="lb-upload" data-v="prompt" data-w="write">${ic("pen")}Viết prompt</button>` : ""}
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
      ${one ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}<button type="button" class="tag-x" data-act="lb-tag-del" data-id="${ids[0]}" data-t="${esc(t)}" aria-label="Xóa tag ${esc(t)}">${ic("x")}</button></span>`).join("") || `<span class="t-sm t-mute">Chưa có tag.</span>`}</div>` : ""}
      <input id="lb-tag-in" class="input tag-in" list="lb-tag-sug" placeholder="${bulk ? "Thêm tag cho tất cả, nhấn Enter…" : "Thêm tag, nhấn Enter…"}" data-enter="lb-tag-add" autocomplete="off" ${one && tags.length >= MAX_TAGS ? "disabled" : ""}>
      <datalist id="lb-tag-sug">${sug.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist></div>`;
  }
  function colEditor(x) {
    return `<div class="field"><label for="lb-col-add">Collection</label>
      <select id="lb-col-add" class="select" data-change="lb-col-add"><option value="" ${x.collectionId ? "" : "selected"}>Chưa thuộc collection nào</option>${st().collections.map((c) => `<option value="${c.id}" ${x.collectionId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="__new">＋ Collection mới…</option></select></div>`;
  }
  function inspectorStage(x) {
    if (x.type === "sound") return `<div class="lb-ins-wave">${playBtn(x)}${scroller(x, 5)}${timeLabel(x)}</div>`;
    if (x.type === "prompt") return "";
    return `<div class="lb-ins-img" style="background:${esc(bgOf(x))}" data-lb-open="${x.id}">${x.type === "video" ? `${playBtn(x, "is-lg")}<span class="badge lb-ext">${timeLabel(x)}</span>${vbar(x, "is-card")}` : ""}</div>`;
  }
  function assetPanel(x) {
    const t = T[x.type];
    const rows = [["Mã", `<span class="mono">${esc(x.id)}</span>`]];
    if (x.type !== "prompt") rows.push(["Định dạng", esc(ext(x) || "—")]);
    if (x.type === "image") rows.push(["Kích thước", `${x.meta.w} × ${x.meta.h} px`]);
    if (x.type === "sound") rows.push(["Thời lượng", LB.dur(x.meta.dur)], ["Âm thanh", `${esc(x.meta.rate)} · ${esc(x.meta.ch)}`]);
    if (x.type === "video") rows.push(["Thời lượng", LB.dur(x.meta.dur)], ["Khung hình", `${x.meta.w} × ${x.meta.h}${x.meta.fps ? ` · ${x.meta.fps} fps` : ""}`]);
    if (x.type === "prompt") rows.push(["Độ dài", `${x.text.length} ký tự`], ["Biến", LB.varsOf(x.text).map((v) => `<span class="chip is-static">${esc(`{{${v}}}`)}</span>`).join("") || "—"]);
    rows.push(["Dung lượng", LB.bytes(x.size)], ["Thêm lúc", `<span class="mono">${esc(x.added || "—")}</span>`], ["Nguồn", esc(x.origin)]);
    return `<section class="ins-sec lb-ins-top">${inspectorStage(x)}
        <div class="lb-ins-name"><span class="type-tag">${ic(t.icon)}${esc(t.label)}</span></div>
        ${field("Tên", "lb-f-name", `<input id="lb-f-name" class="input" value="${esc(x.name)}" data-change="lb-edit" data-id="${x.id}" data-f="name" autocomplete="off">`)}
        ${x.type === "prompt" ? field("Loại prompt", "lb-f-kind", `<select id="lb-f-kind" class="select" data-change="lb-edit" data-id="${x.id}" data-f="kind">${opts(Object.entries(LB.PROMPT_KINDS), x.kind)}</select>`)
          + field("Nội dung", "lb-f-text", `<textarea id="lb-f-text" class="textarea" rows="8" data-change="lb-edit" data-id="${x.id}" data-f="text">${esc(x.text)}</textarea><span class="field-hint">Dùng {{tên_biến}} cho phần cần thay khi áp dụng prompt.</span>`) : ""}
      </section>
      <section class="ins-sec ins-form">${tagEditor([x.id], x.tags)}${colEditor(x)}
        ${field("Quyền sử dụng", "lb-f-rights", `<select id="lb-f-rights" class="select" data-change="lb-edit" data-id="${x.id}" data-f="rights">${opts(Object.entries(LB.RIGHTS), x.rights)}</select><span class="field-hint">Bạn chịu trách nhiệm bảo đảm có quyền dùng tài nguyên này cho mục đích dự kiến.</span>`)}</section>
      ${insSec("Thông tin", kv(rows))}
      <section class="ins-sec ins-actions">${x.type === "prompt" ? `<button class="btn" data-act="lb-copy" data-id="${x.id}">${ic("copy")}Sao chép</button>` : `<button class="btn" data-act="lb-open-preview" data-id="${x.id}">${ic(x.type === "image" ? "image" : "play")}Xem</button>`}<button class="btn btn-danger" data-act="lb-del" data-id="${x.id}">${ic("trash")}Xóa</button></section>`;
  }
  function typePanel(type) {
    const t = T[type];
    const all = st().assets.filter((x) => x.type === type);
    const tags = new Map();
    all.forEach((x) => x.tags.forEach((g) => tags.set(g, (tags.get(g) || 0) + 1)));
    const top = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const cols = st().collections.map((c) => [c, all.filter((x) => x.collectionId === c.id).length]).filter(([, n]) => n);
    return `${insSec(`Thư viện ${t.label.toLowerCase()}`, kv([[`Số ${t.noun}`, all.length], ["Dung lượng", LB.bytes(all.reduce((a, x) => a + x.size, 0))], ["Chưa phân loại", all.filter((x) => !x.collectionId).length], ["Định dạng", esc(t.exts.map((e) => `.${e}`).join(" "))], ["Giới hạn", LB.bytes(t.max)]]))}
      <section class="ins-sec"><span class="eyebrow">Thêm ${t.noun}</span><button class="btn btn-block" data-act="lb-upload" data-v="${type}">${ic("upload")}Upload ${t.noun}…</button>${type === "prompt" ? `<button class="btn btn-block" data-act="lb-upload" data-v="prompt" data-w="write">${ic("pen")}Viết prompt mới</button>` : ""}<span class="field-hint">Có thể kéo thả file vào vùng danh sách.</span></section>
      ${top.length ? `<section class="ins-sec"><span class="eyebrow">Tags phổ biến</span><span class="tags">${top.map(([g, n]) => `<button type="button" class="tag lb-tagbtn" data-act="lb-ftag" data-v="${esc(g)}">${esc(g)} <span class="mono t-mute">${n}</span></button>`).join("")}</span></section>` : ""}
      ${cols.length ? `<section class="ins-sec"><span class="eyebrow">Collection</span>${cols.map(([c, n]) => `<button type="button" class="nm-recent" data-act="lb-open-col" data-id="${c.id}">${ic("folder")}<span class="tree-label">${esc(c.name)}</span><span class="mono t-mute">${n}</span></button>`).join("")}</section>` : ""}`;
  }
  function browseInspector(id) {
    const sc = scope(id);
    const selected = selectedId(id);
    if (selected) return assetPanel(byId(selected));
    return sc.col ? colPanel(colById(sc.col), false) : typePanel(sc.type);
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
      title: one ? "Xóa tài nguyên" : `Xóa ${list.length} tài nguyên`, eyebrow: CAP,
      body: `<div class="del-list">${list.slice(0, 8).map((x) => `<div class="del-row">${thumb(x, "is-md")}<div><div class="t-ink">${esc(x.name)}</div><div class="t-sm t-mute">${esc(T[x.type].label)} · ${LB.bytes(x.size)}</div></div></div>`).join("")}${list.length > 8 ? `<span class="t-sm t-mute">và ${list.length - 8} mục khác</span>` : ""}</div>
        <div class="ld-warn">${ic("alert")}<span>File sẽ bị xóa khỏi thư mục <span class="path">library\\</span> của workspace. Không thể hoàn tác.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-danger" data-act="lb-del-confirm">${ic("trash")}Xóa${one ? "" : ` ${list.length}`}</button>`,
    });
  }

  let PV = { ids: [], i: 0 };
  function openPreview(id) {
    const ids = items(scope(A.S.active)).map((x) => x.id);
    PV = { ids: ids.includes(id) ? ids : [id], i: 0 };
    PV.i = Math.max(0, PV.ids.indexOf(id));
    drawPreview();
  }
  const promptHtml = (text) => esc(text).replace(/\{\{\s*([\w .-]+?)\s*\}\}/g, (_, v) => `<mark class="lb-var">{{${v}}}</mark>`);
  function stage(x) {
    if (x.type === "image") return x.img ? `<img class="lbp-img" src="${esc(x.img)}" alt="${esc(x.name)}">` : `<div class="lbp-img is-art" style="background:${esc(bgOf(x))}" role="img" aria-label="${esc(x.name)}"></div>`;
    if (x.type === "video") {
      if (x.url) return `<video class="lbp-img" src="${esc(x.url)}" controls ${x.img ? `poster="${esc(x.img)}"` : ""}></video>`;
      return `<div class="lbp-img is-art is-video" style="background:${esc(bgOf(x))}" role="img" aria-label="${esc(x.name)}"><button type="button" class="lb-pbtn is-lg" data-act="lb-play" data-lb-play="${x.id}" data-id="${x.id}" aria-label="Phát">${ic("play")}</button>
        ${vbar(x)}</div><div class="lbp-bar">${timeLabel(x)}<span class="t-sm t-mute">Prototype: video được mô phỏng, không có hình thật.</span></div>`;
    }
    if (x.type === "sound") return `<div class="lbp-sound">${scroller(x, 10, "is-big")}<div class="lbp-bar">${playBtn(x, "is-lg")}${timeLabel(x)}<span class="t-sm t-mute">${esc(x.meta.rate)} · ${esc(x.meta.ch)}</span></div></div>`;
    return `<div class="lbp-prompt"><div class="lbp-bar"><span class="badge">${esc(LB.PROMPT_KINDS[x.kind])}</span><span class="spacer"></span><button class="btn btn-sm" data-act="lb-copy" data-id="${x.id}">${ic("copy")}Sao chép</button></div><pre class="lb-prompt">${promptHtml(x.text)}</pre></div>`;
  }
  function drawPreview() {
    const x = byId(PV.ids[PV.i]);
    if (!x) { A.closeModal(); return; }
    const n = PV.ids.length;
    A.modal({
      title: x.name, eyebrow: `${T[x.type].label} · ${PV.i + 1} / ${n}`, cls: "modal-xl lbp-modal",
      body: `<div class="lbp"><div class="lbp-stage">${stage(x)}</div>
        <aside class="lbp-side">${kv([["Mã", `<span class="mono">${esc(x.id)}</span>`], ["Thông số", esc(metaText(x))], ["Dung lượng", LB.bytes(x.size)], ["Thêm lúc", `<span class="mono">${esc(x.added || "—")}</span>`], ["Quyền dùng", esc(LB.RIGHTS[x.rights])]])}
          ${x.tags.length ? `<div><span class="eyebrow">Tags</span><div class="tags lb-pt">${x.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>` : ""}
          ${collectionOf(x) ? `<div><span class="eyebrow">Collection</span><div class="tags lb-pt"><span class="tag lb-ctag">${ic("folder")}${esc(collectionOf(x).name)}</span></div></div>` : ""}</aside></div>`,
      foot: `<button class="btn" data-act="lb-pv-prev" ${PV.i <= 0 ? "disabled" : ""}>${ic("chev-l")}Trước</button><button class="btn" data-act="lb-pv-next" ${PV.i >= n - 1 ? "disabled" : ""}>Sau${ic("chev-r")}</button><span class="spacer"></span><button class="btn btn-primary" data-act="close-modal">Đóng</button>`,
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
        <td><div class="nm-title">${ic("folder")}<div><div class="t-ink">${esc(c.name)}</div><div class="t-sm t-mute lb-desc">${esc(c.desc || "Không có mô tả")}</div></div></div></td>
        <td>${cntRow(counts((x) => x.collectionId === c.id))}</td>
        <td class="row-actions"><button class="btn btn-sm btn-ghost" data-act="lb-open-col" data-id="${c.id}" data-tip="Mở collection">${ic("chev-r")}Mở</button></td></tr>`).join("");
    const tagRows = tags.map((r) => `<tr tabindex="0" data-act="ct-sel" data-k="tag" data-id="${esc(r.t)}" class="${sel?.k === "tag" && sel.id === r.t ? "is-selected" : ""}">
        <td><span class="tag">${esc(r.t)}</span></td><td>${cntRow(r.c)}</td><td class="num mono t-mute">${r.n}</td></tr>`).join("");
    return `<div class="nv lb">
      ${bar(`<span class="nv-ttl">${ic("tag")}<span class="t-ink">Collections &amp; tags</span></span><span class="t-sm t-mute">${cols.length} collection · ${st().tagList.length} tag · ${unfiled} tài nguyên chưa phân loại</span>`,
        `<button class="btn btn-sm" data-act="ct-new-tag">${ic("plus")}Tag</button><button class="btn btn-sm btn-primary" data-act="ct-new-col">${ic("plus")}Collection</button>`)}
      <div class="nv-body lb-ct">
        <section class="lb-ct-pane"><header class="lb-ct-h"><span class="eyebrow">Collections</span><span class="t-sm t-mute">Mỗi tài nguyên thuộc tối đa một collection; collection có thể chứa mọi loại.</span></header>
          <div class="nv-scroll" data-keep="ct-col">${cols.length ? `<table class="table"><thead><tr><th>Collection</th><th>Tài nguyên</th><th></th></tr></thead><tbody>${colRows}</tbody></table>`
            : emptyBox("Chưa có collection nào", "Collection gom các tài nguyên thuộc cùng một chủ đề, ví dụ bối cảnh của một tác phẩm hoặc bộ nhận diện kênh.", `<button class="btn btn-primary" data-act="ct-new-col">${ic("plus")}Tạo collection</button>`)}</div></section>
        <section class="lb-ct-pane"><header class="lb-ct-h"><span class="eyebrow">Tags</span><label class="search"><span class="sr-only">Tìm tag</span><input id="ct-q" class="input" type="search" value="${esc(u.q || "")}" placeholder="Tìm tag…" data-on="ct-q"></label></header>
          <div class="nv-scroll" data-keep="ct-tag">${tags.length ? `<table class="table"><thead><tr><th>Tag</th><th>Tài nguyên</th><th class="num">Tổng</th></tr></thead><tbody>${tagRows}</tbody></table>`
            : emptyBox(st().tagList.length ? "Không có tag nào khớp" : "Chưa có tag nào", "Tag là nhãn tự do gắn lên tài nguyên để lọc nhanh. Thêm tag khi upload hoặc ở Inspector.")}</div></section>
      </div></div>`;
  }

  function colPanel(c, withOpen) {
    const cn = counts((x) => x.collectionId === c.id);
    const total = Object.values(cn).reduce((a, b) => a + b, 0);
    return `<section class="ins-sec ins-form"><span class="eyebrow">Collection</span>
        ${field("Tên", "ct-f-name", `<input id="ct-f-name" class="input" value="${esc(c.name)}" data-change="ct-col-edit" data-id="${c.id}" data-f="name" autocomplete="off">`)}
        ${field("Mô tả", "ct-f-desc", `<textarea id="ct-f-desc" class="textarea" rows="3" data-change="ct-col-edit" data-id="${c.id}" data-f="desc">${esc(c.desc || "")}</textarea>`)}</section>
      ${insSec("Nội dung", kv([...Object.keys(T).map((k) => [T[k].label, cn[k]]), ["Tổng", total], ["Tạo lúc", `<span class="mono">${esc(c.created)}</span>`]]))}
      <section class="ins-sec ins-actions">${withOpen ? `<button class="btn btn-primary" data-act="lb-open-col" data-id="${c.id}">${ic("folder-open")}Mở</button>` : ""}<button class="btn btn-danger" data-act="ct-col-del" data-id="${c.id}">${ic("trash")}Xóa collection</button></section>
      <section class="ins-sec"><span class="field-hint">Xóa collection không xóa tài nguyên bên trong, chỉ gỡ chúng khỏi collection.</span></section>`;
  }
  function tagPanel(t) {
    const cn = counts((x) => x.tags.includes(t));
    const total = Object.values(cn).reduce((a, b) => a + b, 0);
    const others = st().tagList.filter((g) => g !== t);
    return `<section class="ins-sec ins-form"><span class="eyebrow">Tag</span>
        ${field("Tên tag", "ct-f-tag", `<input id="ct-f-tag" class="input" value="${esc(t)}" data-change="ct-tag-rename" data-t="${esc(t)}" autocomplete="off"><span class="field-hint">Đổi tên áp dụng cho ${total} tài nguyên đang dùng tag này.</span>`)}
        ${others.length ? field("Gộp vào tag khác", "ct-f-merge", `<select id="ct-f-merge" class="select" data-change="ct-tag-merge" data-t="${esc(t)}"><option value="">Chọn tag…</option>${others.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("")}</select>`) : ""}</section>
      <section class="ins-sec"><span class="eyebrow">Xem tài nguyên</span>${Object.keys(T).map((k) => `<button type="button" class="nm-recent" data-act="ct-tag-view" data-k="${k}" data-t="${esc(t)}" ${cn[k] ? "" : "disabled"}>${ic(T[k].icon)}<span class="tree-label">${esc(T[k].label)}</span><span class="mono t-mute">${cn[k]}</span></button>`).join("")}</section>
      <section class="ins-sec ins-actions"><button class="btn btn-danger" data-act="ct-tag-del" data-t="${esc(t)}">${ic("trash")}Xóa tag</button></section>`;
  }
  function ctInspector() {
    const sel = CT().sel;
    if (sel?.k === "col" && colById(sel.id)) return colPanel(colById(sel.id), true);
    if (sel?.k === "tag" && st().tagList.includes(sel.id)) return tagPanel(sel.id);
    const unf = counts((x) => !x.collectionId);
    return `${insSec("Phân loại tài nguyên", kv([["Collection", st().collections.length], ["Tag", st().tagList.length], ["Tài nguyên", st().assets.length], ["Chưa phân loại", Object.values(unf).reduce((a, b) => a + b, 0)]]))}
      <section class="ins-sec"><span class="eyebrow">Chưa thuộc collection nào</span>${cntRow(unf)}</section>
      <section class="ins-sec"><span class="eyebrow">Cách phân loại</span><p class="t-sm t-mute">Collection gom tài nguyên theo chủ đề và có thể chứa mọi loại. Tag là nhãn tự do, dùng chung cho cả bốn loại, để lọc nhanh trong từng màn hình.</p></section>`;
  }

  function openNewCollection(assign = []) {
    A.modal({
      title: "Tạo collection", eyebrow: CAP,
      body: `<div class="field"><label for="nc-name">Tên collection</label><input id="nc-name" class="input" placeholder="Ví dụ: Bối cảnh chương 1–5" autocomplete="off"><p class="field-err" id="nc-err" hidden></p></div>
        <div class="field"><label for="nc-desc">Mô tả</label><textarea id="nc-desc" class="textarea" rows="3" placeholder="Tùy chọn"></textarea></div>
        ${assign.length ? `<p class="t-sm t-mute">${assign.length} tài nguyên đang chọn sẽ được chuyển vào collection này.</p>` : ""}`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-act="ct-new-col-submit" data-ids="${esc(assign.join(","))}">Tạo collection</button>`,
    });
  }
  function openNewTag() {
    A.modal({
      title: "Tạo tag", eyebrow: CAP,
      body: `<div class="field"><label for="nt-name">Tên tag</label><input id="nt-name" class="input" placeholder="Ví dụ: ambience" autocomplete="off"><span class="field-hint">Chữ thường, không dấu cách (tự đổi thành gạch nối), tối đa 24 ký tự.</span><p class="field-err" id="nt-err" hidden></p></div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-act="ct-new-tag-submit">Tạo tag</button>`,
    });
  }
  let pendingCol = null;
  function openDeleteCollection(id) {
    const c = colById(id);
    if (!c) return;
    pendingCol = id;
    const n = st().assets.filter((x) => x.collectionId === id).length;
    A.modal({
      title: "Xóa collection", eyebrow: CAP,
      body: `<p>Xóa collection <b class="t-ink">${esc(c.name)}</b>?</p><div class="ld-warn">${ic("alert")}<span>${n ? `${n} tài nguyên bên trong sẽ được giữ lại trong thư viện, chỉ bị gỡ khỏi collection này.` : "Collection này đang trống."}</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-danger" data-act="ct-col-del-confirm">${ic("trash")}Xóa collection</button>`,
    });
  }
  let pendingTag = null;
  function openTagConfirm(kind, t, target = "") {
    pendingTag = { kind, t, target };
    const n = st().assets.filter((x) => x.tags.includes(t)).length;
    A.modal({
      title: kind === "merge" ? "Gộp tag" : "Xóa tag", eyebrow: CAP,
      body: kind === "merge"
        ? `<p>Gộp <span class="tag">${esc(t)}</span> vào <span class="tag">${esc(target)}</span>?</p><div class="ld-warn">${ic("alert")}<span>${n} tài nguyên đang dùng “${esc(t)}” sẽ chuyển sang “${esc(target)}”. Tag “${esc(t)}” sẽ biến mất.</span></div>`
        : `<p>Xóa tag <span class="tag">${esc(t)}</span>?</p><div class="ld-warn">${ic("alert")}<span>Tag sẽ được gỡ khỏi ${n} tài nguyên. Bản thân tài nguyên không bị xóa.</span></div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn ${kind === "merge" ? "btn-primary" : "btn-danger"}" data-act="ct-tag-confirm">${kind === "merge" ? "Gộp tag" : `${ic("trash")}Xóa tag`}</button>`,
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

  A.EXPLORER_EXTRA.libfilters = () => {
    const f = filt();
    const cnt = (pred) => st().assets.filter(pred).length;
    const pill = (act, v, label, n, on) => `<button type="button" class="nf-pill ${on ? "is-on" : ""}" data-act="${act}" data-v="${esc(v)}" aria-pressed="${on}" title="${esc(label)} · ${n}"><span class="nf-t">${esc(label)}</span><span class="nf-n mono">${n}</span></button>`;
    const colOpts = [["", `Tất cả collection (${st().assets.length})`], ["none", `Chưa phân loại (${cnt((x) => !x.collectionId)})`], ...st().collections.map((c) => [c.id, `${c.name} (${cnt((x) => x.collectionId === c.id)})`])];
    const tags = st().tagList.map((t) => [t, cnt((x) => x.tags.includes(t))]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return `<div class="nf-label">Collection</div><div class="nf-sel"><select class="select" data-change="lb-fcol-sel" aria-label="Lọc theo collection">${opts(colOpts, f.col)}</select></div>
      <div class="nf-label">Tags</div><div class="nf-pills">${tags.map(([t, n]) => pill("lb-ftag", t, t, n, f.tags.includes(t))).join("") || `<span class="nx-empty">Chưa có tag</span>`}</div>
      ${filtActive() ? `<div class="tree-row nf-clear" tabindex="0" data-act="lb-ftag-clear">${ic("x")}<span class="tree-label">Xóa bộ lọc</span></div>` : ""}`;
  };

  A.EXPLORER_EXTRA.organize = () => {
    const active = A.S.active;
    const rows = st().collections.map((c) => {
      const n = st().assets.filter((x) => x.collectionId === c.id).length;
      return `<div class="tree-row nx-child lb-xcol ${active === `collection:${c.id}` ? "is-selected" : ""}" tabindex="0" role="treeitem" data-act="lb-open-col" data-id="${c.id}">${ic("folder")}<span class="tree-label">${esc(c.name)}</span><span class="nx-n mono">${n}</span></div>`;
    }).join("");
    return `<div class="nx-sep"></div>${rows || `<div class="nx-empty">Chưa có collection nào</div>`}<div class="tree-row nx-child lb-xnew" tabindex="0" data-act="ct-new-col">${ic("plus")}<span class="tree-label">Tạo collection</span></div>`;
  };

  const stopEvt = (e) => e?.stopPropagation();
  const assign = (ids, fn) => { ids.map(byId).filter(Boolean).forEach((x) => { fn(x); touch(x); }); };

  Object.assign(A.ACT, {
    "lb-sel": (el) => {
      const id = A.S.active;
      const u = ui(id);
      u.sel = el.dataset.id;
      applySel();
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
      const x01 = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const tr = player.track(el.dataset.id) || { dur: +el.dataset.d };
      const w = el._win;
      player.seek(el.dataset.id, tr, w ? (w.start + x01 * w.len) / Math.max(1, tr.dur) : x01);
    },
    "lb-open-preview": (el) => openPreview(el.dataset.id),
    "lb-pv-prev": () => pvGo(-1),
    "lb-pv-next": () => pvGo(1),
    "lb-copy": (el) => {
      const x = byId(el.dataset.id);
      if (!x) return;
      (navigator.clipboard?.writeText(x.text) || Promise.reject()).then(() => A.toast("Đã sao chép prompt."), () => A.toast("Không sao chép được. Hãy chọn và sao chép thủ công.", "warning"));
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
      A.toast(n === 1 ? `Đã xóa “${first}”.` : `Đã xóa ${n} tài nguyên.`);
    },
    "lb-tag-del": (el) => { const x = byId(el.dataset.id); x.tags = x.tags.filter((t) => t !== el.dataset.t); touch(x); refresh(); },
    "lb-col-del": (el) => { const x = byId(el.dataset.id); x.collectionId = null; touch(x); refresh(); },
    "lb-tag-add": (el) => {
      const ids = [selectedId(A.S.active)].filter(Boolean);
      const raw = el.value;
      el.value = "";
      if (!ids.length) return;
      const res = ids.map((i) => addTagTo(byId(i), raw));
      if (res[0] === "dup") A.toast(`Tag “${LB.normTag(raw)}” đã có.`, "warning");
      else if (res[0] === "max") A.toast(`Tối đa ${MAX_TAGS} tag cho mỗi tài nguyên.`, "warning");
      else if (res[0] === "ok") A.toast(`Đã thêm tag “${LB.normTag(raw)}”.`);
      ids.forEach((i) => touch(byId(i)));
      refresh();
      A.$("#lb-tag-in")?.focus();
    },
    "lb-open-col": (el) => openCollection(el.dataset.id),
    "lb-upload-menu": (el) => {
      A.openMenu(el, Object.values(T).map((t) => ({ label: `Upload ${t.noun}…`, icon: t.icon, act: "lb-upload", v: t.key })));
    },
    "ct-sel": (el) => { CT().sel = { k: el.dataset.k, id: el.dataset.id }; A.rerender(); },
    "ct-new-col": () => openNewCollection(),
    "ct-new-col-submit": (el) => {
      const name = A.$("#nc-name").value.trim();
      const err = A.$("#nc-err");
      const dup = st().collections.some((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!name || dup) { err.textContent = name ? "Đã có collection trùng tên này." : "Nhập tên collection."; err.hidden = false; A.$("#nc-name").classList.add("is-invalid"); return; }
      const id = `COL-${String(++st().seq.col).padStart(2, "0")}`;
      st().collections.push({ id, name, desc: A.$("#nc-desc").value.trim(), created: A.stamp() });
      const ids = (el.dataset.ids || "").split(",").filter(Boolean);
      assign(ids, (x) => { x.collectionId = id; });
      A.closeModal();
      refresh();
      A.toast(ids.length ? `Đã tạo “${name}” và chuyển ${ids.length} tài nguyên vào đó.` : `Đã tạo collection “${name}”.`);
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
      A.toast(`Đã xóa collection “${c?.name}”.`);
    },
    "ct-new-tag": openNewTag,
    "ct-new-tag-submit": () => {
      const raw = A.$("#nt-name").value;
      const t = LB.normTag(raw);
      const err = A.$("#nt-err");
      if (!t || st().tagList.includes(t)) { err.textContent = t ? `Tag “${t}” đã có.` : "Nhập tên tag."; err.hidden = false; A.$("#nt-name").classList.add("is-invalid"); return; }
      st().tagList.push(t);
      st().tagList.sort();
      CT().sel = { k: "tag", id: t };
      A.closeModal();
      refresh();
      A.toast(`Đã tạo tag “${t}”.`);
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
      A.toast(kind === "merge" ? `Đã gộp “${t}” vào “${target}”.` : `Đã xóa tag “${t}”.`);
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
        if (!v) { el.value = x.name; A.toast("Tên không được để trống.", "warning"); return; }
        x.name = uniqueName(x.type, v, x.id);
        if (x.name !== v) A.toast(`Đã có tài nguyên cùng tên, đổi thành “${x.name}”.`, "warning");
      } else if (f === "text") {
        if (!v.trim()) { el.value = x.text; A.toast("Nội dung prompt không được để trống.", "warning"); return; }
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
      A.toast(`Đã chuyển tài nguyên vào “${colById(v).name}”.`);
    },
    "lb-fcol-sel": (el) => { filt().col = el.value; refresh(); },
    "ct-q": (el) => { CT().q = el.value; A.rerender(); },
    "ct-col-edit": (el) => {
      const c = colById(el.dataset.id);
      const v = el.value.trim();
      if (el.dataset.f === "name") {
        if (!v) { el.value = c.name; A.toast("Tên collection không được để trống.", "warning"); return; }
        if (st().collections.some((k) => k.id !== c.id && k.name.toLowerCase() === v.toLowerCase())) { el.value = c.name; A.toast("Đã có collection trùng tên này.", "warning"); return; }
        c.name = v;
        const it = A.ITEMS[`collection:${c.id}`];
        if (it) { it.title = v; it.tab = v; }
      } else c.desc = v;
      refresh();
    },
    "ct-tag-rename": (el) => {
      const old = el.dataset.t;
      const t = LB.normTag(el.value);
      if (!t) { el.value = old; A.toast("Tên tag không được để trống.", "warning"); return; }
      if (t === old) { el.value = old; return; }
      if (st().tagList.includes(t)) { el.value = old; openTagConfirm("merge", old, t); return; }
      st().assets.forEach((x) => { x.tags = x.tags.map((g) => (g === old ? t : g)); });
      st().tagList = st().tagList.map((g) => (g === old ? t : g)).sort();
      LB.filt.tags = LB.filt.tags.map((g) => (g === old ? t : g));
      Object.values(LB.ui).forEach((u) => { if (u.sel?.k === "tag" && u.sel.id === old) u.sel.id = t; });
      refresh();
      A.toast(`Đã đổi tag “${old}” thành “${t}”.`);
    },
    "ct-tag-merge": (el) => { const v = el.value; el.value = ""; if (v) openTagConfirm("merge", el.dataset.t, v); },
  });

  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest("[data-lb-open]");
    if (el && !e.target.closest("input,button,select")) openPreview(el.dataset.lbOpen);
  });
  document.addEventListener("keydown", (e) => {
    if ($modal() && /lbp-modal/.test($modal().className)) {
      if (e.key === "ArrowLeft") pvGo(-1);
      else if (e.key === "ArrowRight") pvGo(1);
      return;
    }
    if (e.key === "Enter" && e.target.matches?.("[data-lb-open]")) { openPreview(e.target.dataset.lbOpen); return; }
    const sc = A.S.active in LB.TAB || String(A.S.active).startsWith("collection:");
    const selected = selectedId(A.S.active);
    if (e.key === "Delete" && sc && !e.target.matches?.("input,textarea,select") && !$modal() && selected) openDelete([selected]);
  });
  const $modal = () => A.$("#layer .modal");

  LB.api = { byId, colById, ui, items, scope, nextId, uniqueName, addTagTo, refresh, thumb, bgOf, scroller, eq, opts, field, kv, insSec, bar, emptyBox, seg, openNewCollection, assign };
})();
