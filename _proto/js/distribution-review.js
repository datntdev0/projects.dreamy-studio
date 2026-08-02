(function () {
  const A = window.DSApp;
  const DT = window.DT;
  const PJ = window.PJ;
  const LB = window.LB;
  const U = window.NVU;
  const { esc, ic } = A;
  const PK = DT.pkApi;

  const RV = { key: null, dur: 1, pos: 0, playing: false, speed: 1, timer: null, t: 0, k: null };
  const SPEEDS = [[1, "1×"], [4, "4×"], [16, "16×"]];
  const chaptersOf = () => (RV.k ? [...PK.parseChapters(RV.k.chapters).items].sort((a, b) => a.t - b.t) : []);

  function curChapter() {
    const list = chaptersOf();
    let cur = -1;
    list.forEach((c, i) => { if (c.t <= RV.pos) cur = i; });
    return { list, cur };
  }

  function paint() {
    const stage = A.$("#rv-stage");
    if (!stage) { halt(); return; }
    A.$("#rv-fill").style.width = `${Math.min(100, (RV.pos / RV.dur) * 100)}%`;
    A.$("#rv-time").textContent = `${LB.dur(RV.pos)} / ${LB.dur(RV.dur)}`;
    A.$("#rv-code").textContent = LB.dur(RV.pos);
    const { list, cur } = curChapter();
    A.$("#rv-cap").textContent = cur >= 0 ? list[cur].title : "";
    A.$$("[data-rv-chap]").forEach((el) => el.classList.toggle("is-current", +el.dataset.rvChap === cur));
    A.$$("#rv-stage-btn use, #rv-play-btn use").forEach((u) => u.setAttribute("href", `#i-${RV.playing ? "pause" : "play"}`));
    stage.classList.toggle("is-playing", RV.playing);
    stage.style.background = RV.pos > 0 || RV.playing ? stage.dataset.art : stage.dataset.poster;
  }
  function halt() {
    clearInterval(RV.timer);
    RV.timer = null;
    RV.playing = false;
  }
  function tick() {
    if (!A.$("#rv-stage")) { halt(); return; }
    const now = performance.now();
    RV.pos = Math.min(RV.dur, RV.pos + ((now - RV.t) / 1000) * RV.speed);
    RV.t = now;
    if (RV.pos >= RV.dur) halt();
    paint();
  }
  function play() {
    if (RV.pos >= RV.dur) RV.pos = 0;
    RV.playing = true;
    RV.t = performance.now();
    clearInterval(RV.timer);
    RV.timer = setInterval(tick, 100);
    paint();
  }
  const toggle = () => { if (RV.playing) { halt(); paint(); } else play(); };
  const seek = (t) => { RV.pos = Math.max(0, Math.min(RV.dur, t)); RV.t = performance.now(); paint(); };

  function open({ pkgId, outId }) {
    const k = pkgId ? PK.byId(pkgId) : null;
    const ref = k ? PK.outOf(k) : PJ.outputRef(outId);
    if (!ref) { A.toast("Không tìm thấy tệp thành phẩm để xem.", "warning"); return; }
    halt();
    Object.assign(RV, { k, key: pkgId || outId, dur: Math.max(1, ref.o.dur), pos: 0, speed: 1 });
    const o = ref.o;
    const check = !!k;
    const tp = check ? "pk-review" : "out-preview";
    const chaps = chaptersOf();
    const art = LB.bgFor(ref.p.name);
    const poster = (k && PK.thumbBg(k.thumb)) || art;
    const locked = check && PK.locked(k);
    const kv = [["Tệp", `<span class="path">${esc(o.name)}</span>`], ["Thời lượng", LB.dur(o.dur)], ["Độ phân giải", `${o.w}×${o.h} (${PK.ratioOf(o)})`], ["Dung lượng", LB.bytes(o.size)], ["Kết xuất lúc", `<span class="mono">${esc(o.at)}</span>`], ["Project", esc(ref.p.name)]];
    const side = check
      ? `${U.kv(kv)}
          <div class="rv-chaps" data-testid="${tp}-chapters"><span class="eyebrow">Mốc thời gian</span>
            ${chaps.length ? chaps.map((c, i) => `<button type="button" class="rv-chap" data-testid="${tp}-chapter-${i}" data-rv-chap="${i}" data-act="pk-rv-chap" data-t="${c.t}"><span class="mono">${LB.dur(c.t)}</span><span class="tree-label">${esc(c.title)}</span></button>`).join("") : `<span class="t-sm t-mute">Package chưa có mốc thời gian. Thêm ở phần Nội dung của package.</span>`}</div>
          <div class="rv-state">${k.reviewed ? `<span class="badge badge-success" data-testid="${tp}-state">ĐÃ XEM LẠI · ${esc(k.reviewed)}</span>` : `<span class="badge badge-warning" data-testid="${tp}-state">CHƯA XEM LẠI</span>`}</div>`
      : U.kv(kv);
    A.modal({
      title: check ? "Xem lại thành phẩm" : "Xem trước thành phẩm", eyebrow: window.DS.CAP[check ? "10" : "06"], cls: "modal-xl", testid: `${tp}-dialog`,
      body: `<div class="rv ${o.h > o.w ? "is-vertical" : ""}">
        <div class="rv-main">
          <div class="rv-stage-wrap"><div id="rv-stage" class="rv-stage" data-testid="${tp}-stage" data-act="pk-rv-toggle" data-art="${esc(art)}" data-poster="${esc(poster)}" style="aspect-ratio:${o.w} / ${o.h};background:${esc(poster)}">
            <span class="badge rv-note">MÔ PHỎNG</span><span id="rv-code" class="mono rv-code">0:00</span>
            <button id="rv-stage-btn" type="button" class="lb-pbtn is-lg rv-play" data-testid="${tp}-stage-btn" data-act="pk-rv-toggle" aria-label="Phát hoặc tạm dừng">${ic("play")}</button>
            <div id="rv-cap" class="rv-cap" data-testid="${tp}-caption"></div></div></div>
          <div class="rv-bar">
            <button id="rv-play-btn" type="button" class="lb-pbtn" data-testid="${tp}-play-btn" data-act="pk-rv-toggle" aria-label="Phát hoặc tạm dừng">${ic("play")}</button>
            <div class="rv-seek" data-testid="${tp}-seek" data-act="pk-rv-seek" role="slider" aria-label="Tua video">${chaps.map((c) => `<i class="rv-tick" style="left:${Math.min(100, (c.t / RV.dur) * 100)}%" title="${esc(c.title)}"></i>`).join("")}<span id="rv-fill" class="rv-fill"></span></div>
            <span id="rv-time" class="mono rv-time" data-testid="${tp}-time">0:00 / ${LB.dur(RV.dur)}</span>
            ${U.seg("pk-rv-speed", SPEEDS, 1, "", `${tp}-speed`)}
          </div>
          <p class="t-sm t-mute">Prototype: video được mô phỏng, không có hình thật. Space để phát hoặc dừng, mũi tên để tua 10 giây.</p>
        </div>
        <aside class="rv-side">${side}</aside></div>`,
      foot: `<button class="btn" data-testid="${tp}-close-btn" data-act="close-modal">Đóng</button><span class="spacer"></span>${check ? (k.reviewed
        ? `<button class="btn" data-testid="${tp}-unmark-btn" data-act="pk-rv-mark" data-id="${k.id}" data-v="off" ${locked ? "disabled" : ""}>${ic("undo")}Bỏ đánh dấu</button>`
        : `<button class="btn btn-primary" data-testid="${tp}-mark-btn" data-act="pk-rv-mark" data-id="${k.id}" data-v="on" ${locked ? "disabled" : ""}>${ic("check")}Đánh dấu đã xem lại</button>`) : ""}`,
    });
    paint();
  }

  Object.assign(A.ACT, {
    "pk-review": (el, e) => { e?.stopPropagation(); open({ pkgId: el.dataset.id }); },
    "out-preview": (el, e) => { e?.stopPropagation(); open({ outId: el.dataset.id }); },
    "pk-rv-toggle": (el, e) => { e?.stopPropagation(); toggle(); },
    "pk-rv-seek": (el, e) => {
      const r = el.getBoundingClientRect();
      seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * RV.dur);
    },
    "pk-rv-chap": (el) => { seek(+el.dataset.t); if (!RV.playing) play(); },
    "pk-rv-speed": (el) => {
      RV.speed = +el.dataset.v;
      A.$$('#layer [data-testid$="-speed-1"], #layer [data-testid$="-speed-4"], #layer [data-testid$="-speed-16"]').forEach((b) => { const on = b.dataset.v === el.dataset.v; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", on); });
    },
    "pk-rv-mark": (el) => {
      const k = PK.byId(el.dataset.id);
      if (!k) return;
      halt();
      k.reviewed = el.dataset.v === "on" ? A.stamp() : null;
      PK.touch(k);
      A.closeModal();
      PK.refresh();
      A.toast(k.reviewed ? "Đã đánh dấu đã xem lại thành phẩm." : "Đã bỏ dấu xem lại.");
    },
  });

  document.addEventListener("keydown", (e) => {
    if (!A.$("#layer #rv-stage")) return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); seek(RV.pos + 10); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); seek(RV.pos - 10); }
  });
})();
