(function () {
  const A = window.DSApp;
  const SC = window.SC;
  const R = window.SCR;
  const U = window.NVU;
  const { esc, ic } = A;

  const ai = { provider: "claude", sel: new Set() };
  const estimate = (tin, tout) => ({ tin: Math.round(tin), tout: Math.round(tout), cost: (tin / 1e6) * 3 + (tout / 1e6) * 15 });
  const words = (list) => list.reduce((a, t) => a + SC.words(t), 0);

  function reason(c, u) {
    if (u.status === "locked") return "Đã chốt, mở khóa để tạo lại";
    if (u.meta) return "Prototype chưa có nội dung mẫu";
    if (c.cfg.preset === "audiobook") return R.srcOf(c.p, u) ? "" : "Không có nội dung nguồn";
    if (!c.p.novel) return "Project chưa gắn novel";
    if (!SC.kbAvail(c.p)) return "Novel chưa có Knowledgebase";
    const chs = SC.chaptersOf(u);
    if (!chs.length) return "Chưa chọn chương nguồn";
    const miss = SC.kbMissing(c.p, chs);
    return miss.length ? `Chương ${miss.join(", ")} chưa phân tích tri thức` : "";
  }

  function load(c, u) {
    const src = R.srcOf(c.p, u);
    const map = src ? src.map : {};
    if (c.cfg.preset === "audiobook") return { words: src ? words(src.list.map((q) => q.t)) : 0, extra: 0 };
    const beats = SC.kbBeats(c.p, SC.chaptersOf(u)) || [];
    const refs = [...new Set(beats.flatMap((b) => b.refs))];
    return { words: words(refs.map((r) => map[r]).filter(Boolean)), extra: words(beats.map((b) => b.text)), beats: beats.length };
  }

  function openDraft(c) {
    const ok = c.s.units.filter((u) => !reason(c, u));
    if (![...ai.sel].every((id) => ok.some((u) => u.id === id)) || !ai.sel.size) {
      const first = ok.find((u) => u.id === c.u.id) || ok.find((u) => !(u.blocks && u.blocks.length)) || ok[0];
      ai.sel = new Set(first ? [first.id] : []);
    }
    drawDraft(c);
  }

  function drawDraft(c) {
    const unit = c.cfg.unit.toLowerCase();
    const film = c.cfg.preset === "film";
    const rows = c.s.units.map((u) => {
      const why = reason(c, u);
      const has = u.blocks && u.blocks.length;
      return `<label class="check pj-chk-row ${why ? "is-off" : ""}" data-testid="sc-ai-unit-${u.id}"><input type="checkbox" data-testid="sc-ai-input-${u.id}" data-change="sc-ai-unit" data-id="${u.id}" ${ai.sel.has(u.id) ? "checked" : ""} ${why ? "disabled" : ""}>
        <span>${esc(c.cfg.unit)} ${u.no}${u.title ? ` · ${esc(u.title)}` : ""}${film ? ` <span class="t-mute">${esc(R.chLabel(u))}</span>` : ""}</span>
        <span class="t-sm t-mute">${why ? esc(why) : has ? "Sẽ ghi đè nội dung hiện có" : "Chưa có nội dung"}</span></label>`;
    }).join("");
    const picked = c.s.units.filter((u) => ai.sel.has(u.id));
    const loads = picked.map((u) => load(c, u));
    const w = loads.reduce((a, x) => a + x.words, 0);
    const extra = loads.reduce((a, x) => a + x.extra, 0);
    const e = estimate(w * 1.35 + extra * 1.5 + 350 * picked.length, w * 1.5 + 120 * picked.length);
    const overwrite = picked.filter((u) => u.blocks && u.blocks.length).length;
    const sent = film
      ? `Sự kiện, nhân vật, địa điểm từ Knowledgebase và các đoạn gốc làm dẫn chứng của từng cảnh (${U.fmt(w)} từ)`
      : `Toàn bộ nội dung các ${unit} đã chọn (${U.fmt(w)} từ) và danh sách nhân vật từ Knowledgebase`;
    A.modal({ title: "Tạo bản nháp bằng AI", eyebrow: "Scripting", cls: "modal-lg", testid: "sc-draft-modal",
      body: `<p class="t-sm t-mute">${film ? "AI dựng danh sách cảnh từ Knowledgebase rồi viết từng cảnh, gắn nhân vật cho hội thoại." : "AI tách đoạn nguồn thành khối dẫn chuyện và hội thoại, gắn nhân vật cho từng câu thoại."} Bạn luôn là người chỉnh sửa và chốt kịch bản.</p>
        <div class="field"><span class="eyebrow">${esc(c.cfg.unit)} cần tạo</span><div class="pj-chk-list" data-testid="sc-ai-units">${rows}</div></div>
        <div class="field"><label for="sc-ai-prov">Provider</label>${U.providerSelect("sc-ai-prov", ai.provider)}</div>
        <div class="sc-est" data-testid="sc-ai-estimate">${ic("info")}<div class="t-sm">${picked.length ? `Sẽ gửi tới <b>${esc(U.provider(ai.provider).name)}</b>: ${sent}. Ước tính ${U.fmt(e.tin)} token vào, ${U.fmt(e.tout)} token ra, ${U.money(e.cost)}.` : `Chọn ít nhất một ${unit} để xem ước tính.`}</div></div>
        ${overwrite ? `<div class="sc-ban is-warn">${ic("alert")}<span>${overwrite} ${unit} đã có nội dung sẽ bị thay thế.</span></div>` : ""}`,
      foot: `<button class="btn" data-testid="sc-draft-cancel-btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="sc-draft-go-btn" data-act="sc-draft-go" ${picked.length ? "" : "disabled"}>${ic("spark")}Tạo ${picked.length || ""} bản nháp</button>` });
  }

  function apply(p, uid) {
    const s = SC.scriptOf(p);
    const u = s.units.find((x) => x.id === uid);
    if (!u || u.status === "locked") return;
    SC.syncCast(p, s);
    if (s.cfg.preset === "audiobook") {
      const src = SC.sourceRange(p, u);
      if (!src) return;
      u.blocks = SC.aiAudio(s, u, src);
    } else u.blocks = SC.aiFilm(s, p, u);
    u.meta = null;
    u.status = "draft";
    u.updated = A.stamp();
  }

  Object.assign(A.ACT, {
    "sc-draft": () => { const c = R.activeCtx(); if (c && c.u && !c.locked) openDraft(c); },
    "sc-draft-go": () => {
      const c = R.activeCtx();
      if (!c) return;
      const { p } = c;
      const picked = c.s.units.filter((u) => ai.sel.has(u.id));
      if (!picked.length) return;
      A.closeModal();
      A.startPipeline({
        kind: "script", label: `Kịch bản · ${p.name}`, detail: `${picked.length} ${c.cfg.unit.toLowerCase()} · ${U.provider(ai.provider).name}`,
        tasks: picked.map((u) => ({ key: `${p.id}|${u.id}|draft`, label: `${c.cfg.unit} ${u.no}` })),
        onTask: (t) => { apply(p, t.key.split("|")[1]); A.toast(`Đã có bản nháp ${t.label.toLowerCase()}.`); },
      });
      A.rerender();
    },
  });

  Object.assign(A.ON, {
    "sc-ai-prov": (el) => { ai.provider = el.value; const c = R.activeCtx(); if (c) drawDraft(c); },
    "sc-ai-unit": (el) => {
      const c = R.activeCtx();
      if (!c) return;
      if (el.checked) ai.sel.add(el.dataset.id); else ai.sel.delete(el.dataset.id);
      drawDraft(c);
    },
  });
})();
