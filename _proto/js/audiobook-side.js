(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const SC = window.SC;
  const AB = window.AB;
  const U = window.NVU;
  const LB = window.LB;
  const X = window.ABU;
  const { esc, ic } = A;
  const T = SC.TYPES;

  const RATE = 6;
  const P = { q: [], i: -1, t: 0, on: false, timer: null };
  let flagId = null;
  const money = (n) => `≈ $${n.toFixed(3)}`;
  const mmss = (sec) => LB.dur(Math.round(sec));

  function paintPlayer() {
    const el = A.$("#ab-player");
    const cur = P.q[P.i];
    A.$$("#editor .ab-seg").forEach((r) => {
      const on = !!cur && r.dataset.id === cur.id;
      r.classList.toggle("is-playing", on);
      if (!on) r.style.removeProperty("--pg");
    });
    if (!el) return;
    el.hidden = !cur;
    if (!cur) { el.innerHTML = ""; return; }
    const total = P.q.reduce((a, x) => a + x.dur, 0);
    const done = P.q.slice(0, P.i).reduce((a, x) => a + x.dur, 0) + P.t;
    el.innerHTML = `<button class="btn btn-icon btn-sm" data-testid="ab-pl-toggle" data-act="ab-pp" aria-label="${P.on ? "Tạm dừng" : "Phát"}">${ic(P.on ? "pause" : "play")}</button>
      <div class="ab-pl-b"><div class="t-sm t-ink ellip" data-testid="ab-pl-title">${esc(cur.title)}</div><div class="progress"><i id="ab-pl-bar" style="width:${Math.min(100, (done / total) * 100)}%"></i></div></div>
      <span class="mono t-mute" id="ab-pl-time">${mmss(done)} / ${mmss(total)}</span>
      <button class="btn btn-icon btn-sm" data-testid="ab-pl-stop" data-act="ab-stop" title="Dừng" aria-label="Dừng">${ic("stop")}</button>`;
    const row = cur.id && A.$(`#editor .ab-seg[data-id="${cur.id}"]`);
    if (row) row.style.setProperty("--pg", `${Math.min(100, (P.t / cur.dur) * 100)}%`);
  }
  function paintLight() {
    const cur = P.q[P.i];
    if (!cur) return;
    const total = P.q.reduce((a, x) => a + x.dur, 0);
    const done = P.q.slice(0, P.i).reduce((a, x) => a + x.dur, 0) + P.t;
    const bar = A.$("#ab-pl-bar");
    if (bar) bar.style.width = `${Math.min(100, (done / total) * 100)}%`;
    const tm = A.$("#ab-pl-time");
    if (tm) tm.textContent = `${mmss(done)} / ${mmss(total)}`;
    const row = A.$(`#editor .ab-seg[data-id="${cur.id}"]`);
    if (row) row.style.setProperty("--pg", `${Math.min(100, (P.t / cur.dur) * 100)}%`);
  }
  function stop() {
    clearInterval(P.timer);
    Object.assign(P, { q: [], i: -1, t: 0, on: false, timer: null });
    paintPlayer();
  }
  function tick() {
    if (!P.on) return;
    const it = P.q[P.i];
    P.t += 0.15 * RATE;
    if (P.t >= it.dur) {
      P.i++;
      P.t = 0;
      if (P.i >= P.q.length) { stop(); return; }
      paintPlayer();
      return;
    }
    paintLight();
  }
  function play(items) {
    clearInterval(P.timer);
    Object.assign(P, { q: items, i: 0, t: 0, on: true });
    P.timer = setInterval(tick, 150);
    paintPlayer();
  }

  const segItem = (c, b) => {
    const a = AB.rec(c.bk, c.u).audio[b.id];
    return a ? { id: b.id, dur: a.dur, title: `${c.u.title || c.s.cfg.unit} · ${b.text.slice(0, 48)}${b.text.length > 48 ? "…" : ""}` } : null;
  };

  function commit(p, uid, bid) {
    const s = SC.scriptOf(p);
    const bk = AB.book(p);
    const u = s.units.find((x) => x.id === uid);
    const b = u && (u.blocks || []).find((x) => x.id === bid);
    if (!b) return;
    const vf = AB.voiceFor(bk, s, b);
    AB.rec(bk, u).audio[bid] = { text: b.text, voice: vf.v ? vf.v.id : "", speed: vf.speed, rules: AB.sigOf(bk.lex, b.text), paren: b.paren, dur: AB.estDur(b.text, vf.speed), at: A.stamp(), flag: "" };
    AB.sync(p);
  }
  function startGen(c, ids) {
    const { p, u, s } = c;
    A.startPipeline({
      kind: "audio", label: `Audiobook · ${p.name}`, detail: `${s.cfg.unit} ${u.no} · ${ids.length} đoạn`,
      tasks: ids.map((id) => ({ key: `${p.id}|${u.id}|${id}`, label: id })),
      onTask: (t) => commit(p, u.id, t.key.split("|")[2]),
      onDone: () => { AB.sync(p); p.activity.unshift([A.stamp(), `Tạo audio ${s.cfg.unit.toLowerCase()} ${u.no}: ${ids.length} đoạn`]); A.renderExplorer(); },
    });
    A.rerender();
  }

  function openGenerate(c) {
    const list = X.todo(c);
    const groups = new Map();
    list.forEach((b) => {
      const { v } = AB.voiceFor(c.bk, c.s, b);
      const key = v && v.engine === "cloud" ? v.provider : "local";
      groups.set(key, (groups.get(key) || 0) + b.text.length);
    });
    let cost = 0;
    const rows = [...groups.entries()].map(([k, chars]) => {
      if (k === "local") return `<div class="sc-chk is-ok">${ic("hdd")}<span class="sc-chk-t">Local TTS · chạy trên máy này, không gửi dữ liệu ra ngoài</span><span class="mono">${U.fmt(chars)} ký tự</span></div>`;
      const credit = LB.speech.billing(k) === "credit";
      if (!credit) cost += chars * 0.000016;
      return `<div class="sc-chk is-warn">${ic("cloud")}<span class="sc-chk-t">${esc(LB.speech.name(k))} · văn bản sẽ được gửi tới provider, ${credit ? "tính theo credit của tài khoản" : money(chars * 0.000016)}</span><span class="mono">${U.fmt(chars)} ký tự</span></div>`;
    }).join("");
    const stale = list.filter((b) => AB.segState(c.bk, c.s, c.u, b).st !== "none").length;
    A.modal({ title: `Tạo audio ${c.s.cfg.unit.toLowerCase()} ${c.u.no}`, eyebrow: "Audiobook", testid: "ab-gen-modal",
      body: `<p class="t-sm">Sẽ tạo <b>${list.length} đoạn</b>${stale ? `, trong đó ${stale} đoạn tạo lại vì kịch bản, giọng hoặc quy tắc đọc đã đổi` : ""}. Đoạn đã đạt và không đổi được giữ nguyên.</p>
        <div class="sc-chks" data-testid="ab-gen-groups">${rows}</div>
        <div class="sc-est" data-testid="ab-gen-estimate">${ic("info")}<div class="t-sm">Chi phí ước tính: <b>${cost ? money(cost) : "không phát sinh phí trực tiếp"}</b>. Tiến độ xem ở panel Pipelines.</div></div>`,
      foot: `<button class="btn" data-testid="ab-gen-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="ab-gen-go-btn" data-act="ab-gen-go">${ic("spark")}Tạo ${list.length} đoạn</button>` });
  }

  const kvRows = (c) => {
    const st = AB.unitStat(c.s, c.bk, c.u);
    return [["Chương", `${esc(c.s.cfg.unit)} ${c.u.no}${c.u.title ? ` · ${esc(c.u.title)}` : ""}`], ["Kịch bản", c.locked ? `<span class="badge badge-success">ĐÃ CHỐT</span>` : `<span class="badge badge-warning">CHƯA CHỐT</span>`],
      ["Đoạn", st.total || "—"], ["Đã tạo", st.total ? `${st.done}/${st.total}` : "—"], ["Cần xử lý", st.total ? st.stale + st.none : "—"], ["Audio", st.dur ? `≈ ${mmss(st.dur)}` : "—"]];
  };
  const mixField = (label, id, f, val, min, max, step, unit) => `<div class="field"><label for="${id}">${label}</label><div class="ab-mix"><input id="${id}" class="input" type="number" min="${min}" max="${max}" step="${step}" value="${val}" data-testid="ab-mix-${f}" data-change="ab-mix" data-f="${f}"><span class="t-sm t-mute">${unit}</span></div></div>`;

  function chapterPanel(c) {
    const m = AB.rec(c.bk, c.u).mix;
    const bl = c.u.blocks ? AB.blockers(c.s, c.bk, c.u) : [];
    return `${U.insSec("Chương", U.kv(kvRows(c)))}
      ${c.u.blocks ? `<section class="ins-sec" data-testid="ab-ins-mix"><span class="eyebrow">Ghép chương</span><div class="ins-form">
        ${mixField("Khoảng nghỉ giữa các đoạn", "ab-m-gap", "gap", m.gap, 0, 5, 0.1, "giây")}${mixField("Im lặng đầu chương", "ab-m-intro", "intro", m.intro, 0, 10, 0.1, "giây")}
        ${mixField("Im lặng cuối chương", "ab-m-outro", "outro", m.outro, 0, 10, 0.1, "giây")}${mixField("Âm lượng", "ab-m-vol", "vol", m.vol, -12, 6, 1, "dB")}</div>
        <span class="field-hint">Khoảng nghỉ trong kịch bản được cộng thêm vào khoảng nghỉ này.</span></section>` : ""}
      ${bl.length ? `<section class="ins-sec" data-testid="ab-ins-blockers"><span class="eyebrow">Cần xử lý · ${bl.length}</span>${bl.map((b) => `<div class="sc-iss is-warn">${ic("alert")}<span>${esc(b.text)}</span></div>`).join("")}</section>` : ""}
      <section class="ins-sec ins-actions" data-testid="ab-ins-actions"><button class="btn" data-testid="ab-ins-script-btn" data-act="ab-open-script">${ic("pen")}Mở Scripting</button></section>`;
  }

  function segPanel(c, b) {
    const { sp, v, speed } = AB.voiceFor(c.bk, c.s, b);
    const info = AB.segState(c.bk, c.s, c.u, b);
    const a = info.a;
    const t = T[b.type];
    const rd = AB.readText(c.bk, b.text);
    const fields = "";
    const status = info.st === "none" ? "Chưa tạo" : info.st === "flag" ? "Chưa đạt" : info.st === "stale" ? "Cần tạo lại" : "Đã tạo";
    return `<section class="ins-sec" data-testid="ab-ins-seg"><span class="eyebrow">Đoạn đã chọn</span><div class="ins-h">${ic(t.icon)}<span class="t-ink">${esc(t.label)}</span>${X.stBadge(info.st)}</div>
        <div class="ab-ro" data-testid="ab-ins-text">${esc(b.text)}</div>${rd !== b.text ? `<span class="eyebrow">Đọc là</span><div class="ab-ro is-read" data-testid="ab-ins-read">${esc(rd)}</div>` : ""}
        <span class="field-hint">Chữ chỉ sửa được trong Scripting.</span></section>
      ${fields ? `<section class="ins-sec">${fields}</section>` : ""}
      ${U.insSec("Audio", U.kv([["Trạng thái", status], ["Nhân vật", sp ? esc(sp.name) : "—"], ...(b.paren ? [["Sắc thái", esc(b.paren)]] : []), ["Giọng", v ? `${esc(v.name)}<div class="t-sm t-mute">${esc(AB.engineName(v))}${AB.usable(v) ? "" : ` · ${esc(AB.whyNot(v))}`}</div>` : "Chưa chọn"], ["Tốc độ", `${speed}×`], ["Thời lượng", a ? mmss(a.dur) : "—"], ["Tạo lúc", a ? `<span class="mono">${esc(a.at)}</span>` : "—"]]))}
      ${info.why && info.why.length ? `<section class="ins-sec"><span class="eyebrow">Vì sao cần tạo lại</span>${info.why.map((w) => `<div class="sc-iss is-warn">${ic("alert")}<span>${esc(w)}</span></div>`).join("")}</section>` : ""}
      ${a && a.flag ? `<section class="ins-sec"><span class="eyebrow">Ghi chú đánh dấu</span><p class="t-sm">${esc(a.flag)}</p></section>` : ""}
      <section class="ins-sec ins-actions" data-testid="ab-ins-seg-actions">
        <button class="btn" data-testid="ab-ins-play" data-act="ab-play" data-id="${b.id}" ${a ? "" : "disabled"}>${ic("play")}Nghe</button>
        <button class="btn" data-testid="ab-ins-regen" data-act="ab-regen" data-id="${b.id}">${ic("refresh")}Tạo lại</button>
        ${a ? (a.flag ? `<button class="btn" data-testid="ab-ins-unflag" data-act="ab-unflag" data-id="${b.id}">${ic("check")}Bỏ đánh dấu</button>` : `<button class="btn" data-testid="ab-ins-flag" data-act="ab-flag" data-id="${b.id}">${ic("flag")}Chưa đạt</button>`) : ""}
        <button class="btn" data-testid="ab-ins-edit" data-act="ab-edit" data-id="${b.id}">${ic("pen")}Sửa trong Scripting</button></section>`;
  }

  function voicesPanel() {
    return `${U.insSec("Engine", U.kv([["Local TTS", LB.tts.count() ? `<span class="badge badge-success">${LB.tts.count()} MÔ HÌNH</span>` : `<span class="badge badge-warning">CHƯA CÀI</span>`], ["Cloud speech", LB.speech.count() ? `<span class="badge badge-success">${LB.speech.count()} PROVIDER</span>` : `<span class="badge badge-warning">CHƯA KẾT NỐI</span>`]]))}
      <section class="ins-sec ins-actions" data-testid="ab-ins-engine"><button class="btn" data-testid="ab-ins-tts-btn" data-act="settings" data-v="tts">${ic("cpu")}Local TTS</button><button class="btn" data-testid="ab-ins-speech-btn" data-act="settings" data-v="speech">${ic("cloud")}Cloud speech</button>
        <button class="btn" data-testid="ab-ins-library-btn" data-act="open" data-id="voices">${ic("voice")}Thư viện giọng</button></section>
      <section class="ins-sec"><span class="eyebrow">Lưu ý</span><p class="t-sm t-mute">Giọng cloud gửi văn bản tới provider khi tạo audio. Giọng local chạy trên máy này và cần mô hình đã cài. Đổi giọng hoặc tốc độ sẽ đánh dấu các đoạn đã tạo bằng giọng đó là cần tạo lại.</p></section>`;
  }
  function rulesPanel(c) {
    return `${U.insSec("Quy tắc đọc", U.kv([["Phát âm", c.bk.lex.length], ["Ký hiệu đang bật", c.bk.symbols.filter((x) => x.on).length], ["Đoạn bị ảnh hưởng", X.affected(c)]]))}
      <section class="ins-sec"><span class="eyebrow">Cách hoạt động</span><p class="t-sm t-mute">Quy tắc thay cách đọc, không thay chữ trong kịch bản. Thêm hoặc đổi quy tắc sẽ đánh dấu các đoạn chứa từ đó là cần tạo lại; đoạn không chứa từ đó không bị ảnh hưởng.</p></section>`;
  }

  window.ABX = {
    paintPlayer,
    inspector(c) {
      if (c.x.view === "voices") return voicesPanel();
      if (c.x.view === "rules") return rulesPanel(c);
      const b = c.u.blocks ? c.u.blocks.find((x) => x.id === c.x.sel) : null;
      return b && AB.VOICED.includes(b.type) ? segPanel(c, b) : chapterPanel(c);
    },
  };

  Object.assign(A.ACT, {
    "ab-play": (el, e) => {
      if (e) e.stopPropagation();
      const c = X.activeCtx();
      const b = c && c.u.blocks.find((x) => x.id === el.dataset.id);
      const it = b && segItem(c, b);
      if (!it) return;
      if (P.q.length === 1 && P.q[0].id === it.id) { P.on = !P.on; paintPlayer(); return; }
      play([it]);
    },
    "ab-play-all": () => {
      const c = X.activeCtx();
      if (!c || !c.u.blocks) return;
      const items = c.u.blocks.map((b) => (b.type === "pause" ? { id: "", dur: b.ms / 1000, title: "Khoảng nghỉ" } : AB.VOICED.includes(b.type) ? segItem(c, b) : null)).filter(Boolean);
      if (!items.some((x) => x.id)) { A.toast("Chương này chưa có audio để nghe.", "warning"); return; }
      play(items.map((x) => (x.id ? x : { ...x, title: "Khoảng nghỉ" })));
    },
    "ab-pp": () => { if (P.q.length) { P.on = !P.on; paintPlayer(); } },
    "ab-stop": stop,
    "ab-preview": (el) => {
      const c = X.activeCtx();
      const sp = c && c.s.cast.find((x) => x.id === el.dataset.id);
      if (!sp) return;
      const cfg = c.bk.voices[sp.id];
      const v = cfg && AB.voiceById(cfg.voice);
      play([{ id: "", dur: 6, title: `Nghe thử · ${sp.name} · ${v ? v.name : ""}` }]);
      if (v && v.engine === "cloud") A.toast(`Nghe thử gửi một câu mẫu tới ${LB.speech.name(v.provider)}.`, "warning");
    },
    "ab-generate": () => { const c = X.activeCtx(); if (c && X.todo(c).length && !AB.blockers(c.s, c.bk, c.u).length) openGenerate(c); },
    "ab-gen-go": () => {
      const c = X.activeCtx();
      if (!c) return;
      const ids = X.todo(c).map((b) => b.id);
      A.closeModal();
      if (ids.length) startGen(c, ids);
    },
    "ab-regen": (el, e) => {
      if (e) e.stopPropagation();
      const c = X.activeCtx();
      if (!c) return;
      const bl = AB.blockers(c.s, c.bk, c.u);
      if (bl.length) { A.toast(bl[0].text, "warning"); return; }
      if (X.running(c).has(el.dataset.id)) return;
      startGen(c, [el.dataset.id]);
    },
    "ab-flag": (el) => {
      const c = X.activeCtx();
      if (!c) return;
      flagId = el.dataset.id;
      A.modal({ title: "Đánh dấu đọc chưa đạt", eyebrow: "Audiobook", testid: "ab-flag-modal",
        body: `<p class="t-sm t-mute">Ghi lại điều chưa ổn. Sửa kịch bản hoặc đổi giọng, rồi tạo lại đoạn này.</p><div class="field"><label for="ab-flag-note">Ghi chú</label><textarea id="ab-flag-note" class="textarea" rows="3" data-testid="ab-flag-note" placeholder="vd. Đọc sai trọng âm ở tên riêng, ngắt câu quá nhanh"></textarea></div>`,
        foot: `<button class="btn" data-testid="ab-flag-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="ab-flag-save-btn" data-act="ab-flag-save">${ic("flag")}Đánh dấu</button>` });
    },
    "ab-flag-save": () => {
      const c = X.activeCtx();
      const a = c && flagId && AB.rec(c.bk, c.u).audio[flagId];
      if (!a) return;
      a.flag = ((A.$("#ab-flag-note") || {}).value || "").trim() || "Cần nghe lại";
      AB.sync(c.p);
      A.closeModal();
      A.renderExplorer();
      X.refresh();
      A.toast("Đã đánh dấu đoạn chưa đạt.", "warning");
    },
    "ab-unflag": (el) => {
      const c = X.activeCtx();
      const a = c && AB.rec(c.bk, c.u).audio[el.dataset.id];
      if (!a) return;
      a.flag = "";
      AB.sync(c.p);
      A.renderExplorer();
      X.refresh();
    },
  });

  Object.assign(A.ON, {
    "ab-mix": (el) => {
      const c = X.activeCtx();
      if (!c) return;
      const f = el.dataset.f;
      const n = parseFloat(el.value);
      const lim = { gap: [0, 5], intro: [0, 10], outro: [0, 10], vol: [-12, 6] }[f];
      AB.rec(c.bk, c.u).mix[f] = Math.max(lim[0], Math.min(lim[1], Number.isFinite(n) ? n : 0));
      X.refresh();
    },
  });
})();
