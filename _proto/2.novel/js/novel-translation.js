(function () {
  const A = window.DSApp;
  const U = window.NVU;
  const NV = window.NV;
  const { esc, ic } = A;
  const { N, ui, fmt } = U;

  const CAP = window.DS.CAP["03"];
  const T = () => N().tr;
  const V = () => ui("tl", { step: "dict", picks: {}, ch: 1, onlyReview: false, panel: false, wfilter: "open", dq: "", cq: "", cf: "all", nd: null, edit: null, noteFor: null, reviewed: {}, reviewNote: "", focus: null });
  /* Luồng lặp lại: từ điển → hướng dẫn → dịch → kết quả → cảnh báo → (quay lại từ điển). */
  const STEPS = [
    { id: "dict", label: "Từ điển", icon: "book", hint: "Chốt cách dịch cho tên riêng, địa danh, thuật ngữ trước khi dịch." },
    { id: "guide", label: "Hướng dẫn", icon: "pen", hint: "Mục đích, độc giả, giọng văn, xưng hô và quy ước chung cho AI." },
    { id: "trans", label: "Dịch", icon: "lang", hint: "Chọn chương, xem ước tính rồi chạy pipeline dịch." },
    { id: "result", label: "Kết quả", icon: "frames", hint: "Đọc song song, sửa trực tiếp, ghi chú theo đoạn." },
    { id: "warn", label: "Cảnh báo", icon: "alert", hint: "Nguồn, hướng dẫn hoặc từ điển đổi sau lúc dịch. Xử lý xong có thể bắt đầu vòng mới." },
  ];
  const LIMIT = 300; // số dòng tối đa vẽ cùng lúc ở bảng chương
  const LEGACY = { pipeline: "trans", read: "result" };
  const fresh = (id) => NV.viFresh[id] || NV.vi[id] || "";
  const PURPOSE = [["research", "Hiểu và nghiên cứu nội bộ"], ["release", "Phát hành một ấn bản dịch"]];
  const TYPES = [["name", "Tên riêng"], ["place", "Địa danh"], ["org", "Tổ chức"], ["title", "Chức danh"], ["term", "Thuật ngữ"]];
  const STATUS = {
    none: ["", "Chưa dịch"], draft: ["badge-info", "Bản nháp"], review: ["badge-warning", "Cần xem lại"], running: ["badge-running", "Đang dịch"],
  };
  const PARA_ST = { draft: ["", "Nháp"], edited: ["badge-primary", "Đã sửa"], review: ["badge-warning", "Cần xem lại"] };
  const KIND = { source: ["badge-warning", "Nguồn thay đổi"], dict: ["badge-info", "Từ điển"], guideline: ["badge-info", "Hướng dẫn"] };
  const purposeLabel = () => PURPOSE.find((p) => p[0] === T().guidelines.purpose)[1];

  function chapterStatusCell(n) {
    const st = U.trStatus(n);
    const pl = U.runningTask("translate", `c${n}`);
    if (st === "running") {
      return `<div class="tl-prog"><div class="progress" data-prog="${U.taskRef(pl, `c${n}`)}"><i style="width:${Math.round(pl.tasks.find((t) => t.key === `c${n}`).progress)}%"></i></div><span class="mono" data-prog-text="${U.taskRef(pl, `c${n}`)}">0%</span></div>`;
    }
    return `<span class="badge ${STATUS[st][0]}">${STATUS[st][1]}</span>`;
  }

  function pipelineTab() {
    const v = V();
    const picks = N().chapters.filter((c) => v.picks[c.n]).map((c) => c.n);
    const needle = v.cq.trim().toLowerCase();
    const shownAll = N().chapters.filter((c) => (!needle || `${c.n} ${c.title}`.toLowerCase().includes(needle)) && (v.cf === "all" || U.trStatus(c.n) === v.cf));
    const shown = shownAll.slice(0, LIMIT);
    const all = shownAll.length > 0 && shownAll.every((c) => v.picks[c.n]);
    const rows = shown.map((c) => {
      const st = U.trStatus(c.n);
      const busy = st === "running";
      return `<tr class="${v.picks[c.n] ? "is-selected" : ""}">
        <td class="chk"><input type="checkbox" data-on="tl-pick" data-n="${c.n}" ${v.picks[c.n] ? "checked" : ""} ${busy ? "disabled" : ""} aria-label="Chọn chương ${c.n}"></td>
        <td class="mono t-mute">${String(c.n).padStart(2, "0")}</td>
        <td class="t-ink">${esc(c.title)}</td>
        <td class="num">${fmt(c.words)}</td>
        <td class="tl-st">${chapterStatusCell(c.n)}</td>
        <td class="row-actions">${N().tr.chapters[c.n] ? `<button class="btn btn-sm" data-act="tl-open-read" data-n="${c.n}">Đọc</button>` : ""}</td>
      </tr>`;
    }).join("");
    const more = shownAll.length > shown.length ? `<tr><td colspan="6" class="t-sm t-mute pad">Đang hiện ${LIMIT}/${fmt(shownAll.length)} chương. Dùng ô tìm hoặc bộ lọc để thu hẹp.</td></tr>` : "";
    const est = picks.length ? U.estimate(picks) : null;
    const prov = U.provider(T().provider);
    const overwrite = picks.filter((n) => N().tr.chapters[n]);
    const ready = picks.length && prov.ok;
    const trial = picks[0];
    const trialEst = trial ? U.estimate([trial]) : null;
    const dictCount = T().dict.length;
    return `<div class="tl-split">
      <div class="tl-main" data-keep="tl-pipe">
        <div class="tl-sub is-inner is-wrap"><label class="search"><span class="sr-only">Tìm chương</span><input id="tl-cq" class="input" type="search" value="${esc(v.cq)}" placeholder="Tìm chương…" data-on="tl-cq"></label>
          <select class="select" data-on="tl-cf" aria-label="Trạng thái">${U.options([["all", "Mọi trạng thái"], ["none", "Chưa dịch"], ["draft", "Bản nháp"], ["review", "Cần xem lại"]], v.cf)}</select>
          <span class="t-sm t-mute">${fmt(shownAll.length)} chương</span><span class="spacer"></span><button class="btn btn-sm" data-act="tl-pick-missing">Chưa dịch</button><button class="btn btn-sm" data-act="tl-pick-review">Cần xem lại</button><button class="btn btn-sm btn-ghost" data-act="tl-pick-none" ${picks.length ? "" : "disabled"}>Bỏ chọn</button></div>
        <table class="table"><thead><tr>
          <th class="chk"><input type="checkbox" data-on="tl-pick-all" ${all ? "checked" : ""} aria-label="Chọn tất cả"></th><th>#</th><th>Chương</th><th class="num">Số từ</th><th>Trạng thái</th><th></th>
        </tr></thead><tbody>${rows}${more}</tbody></table>
      </div>
      <aside class="tl-side" data-keep="tl-side">
        <div class="card side-card"><span class="eyebrow">Phạm vi dịch</span>
          ${U.kv([["Hướng dịch", `${esc(U.current().langName)} → ${esc(T().lang)}`], ["Hướng dẫn", `v${T().guidelines.version} · ${esc(purposeLabel())} <a data-act="tl-step" data-v="guide" tabindex="0">Đổi</a>`], ["Từ điển", `${dictCount} mục <a data-act="tl-step" data-v="dict" tabindex="0">Xem</a>`], ["Đã chọn", `${picks.length}/${N().chapters.length} chương${est ? ` · ${fmt(est.words)} từ` : ""}`]])}
          <div class="field"><label for="tl-provider">Provider</label>${U.providerSelect("tl-provider", T().provider)}</div>
        </div>
        <div class="card side-card"><span class="eyebrow">Ước tính</span>
          ${est ? U.kv([["Token vào", fmt(est.tin)], ["Token ra", fmt(est.tout)], ["Chi phí", U.money(est.cost)], ["Thời gian", `~${est.minutes} phút`]]) : `<p class="t-sm t-mute">Chọn ít nhất một chương để xem ước tính.</p>`}
          ${est ? `<p class="t-sm t-mute">Ước tính tham khảo, chưa gồm lần thử lại.</p>` : ""}
          ${overwrite.length ? `<div class="ld-warn">${ic("alert")}<span>${overwrite.length} chương đã có bản dịch sẽ bị ghi đè, kể cả chỉnh sửa tay. Ghi chú theo đoạn được giữ lại.</span></div>` : ""}
          <div class="side-btns">
            <button class="btn" data-act="tl-start" data-v="trial" ${ready ? "" : "disabled"}>Dịch thử 1 chương${trialEst ? ` · ${U.money(trialEst.cost)}` : ""}</button>
            <button class="btn btn-primary" data-act="tl-start" data-v="all" ${ready ? "" : "disabled"}>Bắt đầu dịch${picks.length ? ` (${picks.length} chương)` : ""}</button>
          </div>
          ${!prov.ok ? `<p class="field-err">Provider đang chọn chưa được cài trên máy này.</p>` : ""}
        </div>
      </aside>
    </div>`;
  }

  function startTranslate(trial) {
    const v = V();
    const picks = N().chapters.filter((c) => v.picks[c.n]).map((c) => c.n);
    const list = trial ? [picks[0]] : picks;
    A.startPipeline({
      kind: "translate",
      label: trial ? `Dịch thử Ch.${list[0]}` : `Dịch ${list.length} chương`,
      detail: `${U.nameOf(U.current())} → ${T().lang}`,
      tasks: list.map((n) => ({ key: `c${n}`, label: `Ch.${n}` })),
      onTask: (t) => finishChapter(+t.key.slice(1)),
      onDone: () => { v.ch = list[0]; },
    });
    v.picks = {};
    A.rerender();
  }

  function finishChapter(n) {
    const old = T().chapters[n];
    const src = U.chapter(n).paras;
    const paras = {};
    if (src) src.forEach((p) => { paras[p.id] = { t: fresh(p.id), st: "draft", notes: old?.paras?.[p.id]?.notes || [] }; });
    T().chapters[n] = { status: "draft", paras, noSample: !src };
    A.renderExplorer();
    T().warnings.forEach((w) => { if (w.ch === n && w.state === "open") { w.state = "resolved"; w.by = "Dịch lại cả chương"; } });
  }

  function readTab() {
    const v = V();
    const n = v.ch;
    const t = T().chapters[n];
    const sub = `<div class="tl-sub">
      <button class="btn btn-icon btn-sm" data-act="tl-prev" ${n <= 1 ? "disabled" : ""} aria-label="Chương trước">${ic("chev-l")}</button>
${U.chapterJump("tl-ch", n, N().chapters.length, "", (k) => (T().chapters[k] ? "" : " (chưa dịch)"))}
      <button class="btn btn-icon btn-sm" data-act="tl-next" ${n >= N().chapters.length ? "disabled" : ""} aria-label="Chương sau">${ic("chev-r")}</button>
      <label class="check"><input type="checkbox" data-on="tl-only" ${v.onlyReview ? "checked" : ""}><span>Chỉ đoạn cần xem lại</span></label>
      <span class="spacer"></span>
      <button class="btn btn-sm ${v.panel ? "is-on" : ""}" data-act="tl-ai" ${t && !t.noSample ? "" : "disabled"}>${ic("spark")}Nhờ Assistant rà soát</button>
    </div>`;
    if (!t) {
      return `${sub}<div class="tl-fill">${U.empty(`Ch.${n} chưa có bản dịch`, "Chọn chương này ở bước Dịch để tạo bản nháp.", `<button class="btn btn-primary" data-act="tl-pick-go" data-n="${n}">Dịch chương này</button>`)}</div>`;
    }
    if (t.noSample) {
      return `${sub}<div class="tl-fill">${U.empty("Không có bản dịch mẫu", "Chương này đã chạy pipeline nhưng prototype chỉ có đoạn văn mẫu cho chương 1–3.")}</div>`;
    }
    const src = U.chapter(n).paras;
    const show = src.filter((p) => !v.onlyReview || t.paras[p.id]?.st === "review");
    const pairs = show.map((p) => {
      const tp = t.paras[p.id];
      const idx = src.indexOf(p) + 1;
      const warns = U.openWarnings().filter((w) => w.p === p.id);
      const flash = v.focus === p.id ? "is-flash" : "";
      const editing = v.edit === p.id;
      const text = editing
        ? `<textarea id="tl-ta" class="textarea" rows="4">${esc(tp.t)}</textarea>
           <div class="tl-edit-foot"><span class="spacer"></span><button class="btn btn-sm" data-act="tl-cancel">Hủy</button><button class="btn btn-sm btn-primary" data-act="tl-save" data-p="${p.id}">Lưu</button></div>`
        : `<div class="tl-text" tabindex="0" data-act="tl-edit" data-p="${p.id}" title="Bấm để sửa">${esc(tp.t)}</div>`;
      const notes = tp.notes.map((nt, i) => `<div class="tl-note">${ic("pen")}<span>${esc(nt.text)}</span><span class="mono t-mute">${esc(nt.date)}</span><button class="btn btn-icon btn-xs" data-act="tl-note-del" data-p="${p.id}" data-i="${i}" aria-label="Xóa ghi chú">${ic("x")}</button></div>`).join("");
      const noteIn = v.noteFor === p.id
        ? `<div class="tl-note-in"><input id="tl-note-in" class="input" placeholder="Ghi chú cho đoạn này…" data-enter="tl-note-add" data-p="${p.id}"><button class="btn btn-sm btn-primary" data-act="tl-note-add" data-p="${p.id}">Thêm</button><button class="btn btn-sm" data-act="tl-note-close">Hủy</button></div>`
        : "";
      const wl = warns.map((w) => `<div class="tl-warn">${ic("alert")}<span>${esc(w.reason)}</span><button class="btn btn-sm" data-act="tl-w-ok" data-id="${w.id}">Đã xem xét</button></div>`).join("");
      return `<div class="tl-pair is-${tp.st} ${flash}" id="tp-${p.id}">
        <div class="tl-src"><span class="rd-no">${idx}</span><span>${esc(p.t)}</span></div>
        <div class="tl-dst">${wl}${text}${notes}${noteIn}
          <div class="tl-tools"><span class="badge ${PARA_ST[tp.st][0]}">${PARA_ST[tp.st][1]}</span><span class="spacer"></span>
            <button class="btn btn-sm btn-ghost" data-act="tl-note-open" data-p="${p.id}">${ic("pen")}Ghi chú</button>
            <button class="btn btn-sm btn-ghost" data-act="tl-dict" data-p="${p.id}">${ic("book")}Thêm vào từ điển</button></div>
        </div></div>`;
    }).join("");
    const ai = v.panel ? aiPanel(n) : "";
    return `${sub}<div class="tl-readwrap">
      <div class="tl-pairs" data-keep="tl-read"><div class="tl-head"><span>Bản gốc · ${esc(U.current().lang)}</span><span>Bản dịch · ${esc(T().lang)}</span></div>
      ${pairs || `<div class="tl-fill">${U.empty("Không có đoạn cần xem lại", "Tất cả đoạn trong chương này đã được xem xét.")}</div>`}</div>${ai}</div>`;
  }

  function aiPanel(n) {
    const v = V();
    const running = U.runningTask("review", "r1");
    const list = T().suggestions.filter((s) => s.ch === n);
    let body;
    if (running) {
      body = `<div class="ai-wait"><span class="dot dot-running"></span><span>Assistant đang rà soát Ch.${n}…</span><div class="progress" data-prog="${U.taskRef(running, "r1")}"><i style="width:0%"></i></div></div>`;
    } else if (!v.reviewed[n]) {
      body = `<p class="t-sm t-mute">Chưa rà soát chương này. Bấm “Nhờ Assistant rà soát” để bắt đầu.</p>`;
    } else if (!list.length) {
      body = `<p class="t-sm t-mute">Không phát hiện vấn đề cần xử lý ở Ch.${n}.</p>`;
    } else {
      body = list.map((s) => `<div class="card ai-card ${s.state !== "open" ? "is-done" : ""}">
        <div class="ai-top"><span class="badge badge-primary">${esc(s.kind)}</span>${U.ref(s.p, "tl")}${s.state === "applied" ? `<span class="badge badge-success">ĐÃ ÁP DỤNG</span>` : s.state === "dismissed" ? `<span class="badge">ĐÃ BỎ QUA</span>` : ""}</div>
        <p class="t-sm">${esc(s.text)}</p>
        <blockquote class="quote">${esc(s.quote)}</blockquote>
        <div class="field"><span class="eyebrow">Đề xuất</span><p class="t-sm t-ink">${esc(s.revise)}</p></div>
        ${s.state === "open" ? `<div class="ai-act"><button class="btn btn-sm btn-primary" data-act="tl-ai-apply" data-id="${s.id}">Áp dụng</button><button class="btn btn-sm" data-act="tl-ai-skip" data-id="${s.id}">Bỏ qua</button></div>` : ""}
      </div>`).join("");
    }
    return `<aside class="tl-ai" data-keep="tl-ai"><header class="tl-ai-head"><span class="eyebrow">Gợi ý của Assistant · Ch.${n}</span><span class="spacer"></span><button class="btn btn-icon btn-sm" data-act="tl-ai-close" aria-label="Đóng">${ic("x")}</button></header>
      <p class="t-sm t-mute">${esc(v.reviewNote || "Rà soát mặc định: đúng nghĩa, đủ ý, nhất quán thuật ngữ, giọng văn theo hướng dẫn.")} Nhận định của AI chỉ là gợi ý có dẫn chứng, bạn là người quyết định.</p>${body}</aside>`;
  }

  function dictStep() {
    const q = V().dq.trim().toLowerCase();
    const occ = (term) => N().chapters.reduce((a, c) => a + (c.paras || []).filter((p) => p.t.toLowerCase().includes(term.toLowerCase())).length, 0);
    const dict = T().dict.filter((d) => !q || `${d.src} ${d.dst} ${d.note}`.toLowerCase().includes(q));
    const typeOpts = (v) => U.options(TYPES, v);
    const cell = (d, f, label) => `<input class="input is-inline" value="${esc(d[f])}" data-change="tl-dict-f" data-id="${d.id}" data-f="${f}" aria-label="${label}" autocomplete="off">`;
    const rows = dict.map((d) => `<tr><td>${cell(d, "src", "Từ gốc")}</td><td>${cell(d, "dst", "Bản dịch")}</td>
      <td><select class="select is-inline" data-change="tl-dict-f" data-id="${d.id}" data-f="type" aria-label="Loại">${typeOpts(d.type)}</select></td>
      <td>${cell(d, "note", "Ghi chú")}</td><td class="num mono t-mute">${occ(d.src)}</td>
      <td class="row-actions"><button class="btn btn-icon btn-sm" data-act="tl-dict-del" data-id="${d.id}" aria-label="Xóa" data-tip="Xóa">${ic("x")}</button></td></tr>`).join("");
    const nd = V().nd;
    const draftRow = nd ? `<tr class="is-draft"><td><input id="tl-nd-src" class="input is-inline" value="${esc(nd.src)}" placeholder="Từ gốc" data-on="tl-nd" data-f="src" data-enter="tl-dict-add" aria-label="Từ gốc" autocomplete="off"></td>
      <td><input id="tl-nd-dst" class="input is-inline" value="${esc(nd.dst)}" placeholder="Bản dịch" data-on="tl-nd" data-f="dst" data-enter="tl-dict-add" aria-label="Bản dịch" autocomplete="off"></td>
      <td><select class="select is-inline" data-on="tl-nd" data-f="type" aria-label="Loại">${typeOpts(nd.type)}</select></td>
      <td><input class="input is-inline" value="${esc(nd.note)}" placeholder="Ghi chú" data-on="tl-nd" data-f="note" data-enter="tl-dict-add" aria-label="Ghi chú" autocomplete="off"></td><td></td>
      <td class="row-actions"><button class="btn btn-icon btn-sm" data-act="tl-dict-add" aria-label="Thêm" data-tip="Thêm (Enter)">${ic("check")}</button><button class="btn btn-icon btn-sm" data-act="tl-dict-cancel" aria-label="Hủy" data-tip="Hủy">${ic("x")}</button></td></tr>` : "";
    return `<div class="tl-sub"><label class="search"><span class="sr-only">Tìm trong từ điển</span><input id="tl-dq" class="input" type="search" value="${esc(V().dq)}" placeholder="Tìm trong từ điển…" data-on="tl-dq"></label>
        <span class="t-sm t-mute">${dict.length}/${T().dict.length} mục · v${T().guidelines.version}</span><span class="spacer"></span><button class="btn btn-sm btn-primary" data-act="tl-dict-new">${ic("plus")}Thêm mục</button></div>
      <div class="tl-main is-flat" data-keep="tl-dict"><table class="table"><thead><tr><th>Từ gốc</th><th>Bản dịch</th><th>Loại</th><th>Ghi chú</th><th class="num">Số đoạn</th><th></th></tr></thead><tbody>${draftRow}${rows || (nd ? "" : `<tr><td colspan="6">${U.empty("Không có mục nào", "Thử từ khóa khác.")}</td></tr>`)}</tbody></table></div>`;
  }

  function guideStep() {
    const g = T().guidelines;
    return `<div class="tl-center" data-keep="tl-guide"><div class="card side-card tl-form"><div class="ins-h"><span class="eyebrow">Hướng dẫn dịch · v${g.version}</span></div>
        <div class="field"><label for="g-purpose">Mục đích</label><select id="g-purpose" class="select">${U.options(PURPOSE, g.purpose)}</select></div>
        <div class="field"><label for="g-audience">Độc giả</label><input id="g-audience" class="input" value="${esc(g.audience)}"></div>
        <div class="field"><label for="g-tone">Giọng văn</label><input id="g-tone" class="input" value="${esc(g.tone)}"></div>
        <div class="field"><label for="g-pronouns">Xưng hô</label><textarea id="g-pronouns" class="textarea" rows="2">${esc(g.pronouns)}</textarea></div>
        <div class="field"><label for="g-conv">Quy ước khác</label><textarea id="g-conv" class="textarea" rows="3">${esc(g.conventions)}</textarea></div>
        <p class="t-sm t-mute">Lưu thay đổi sẽ tạo cảnh báo cho các chương đã dịch.</p>
        <div><button class="btn btn-primary" data-act="tl-guide-save">Lưu hướng dẫn</button></div></div></div>`;
  }

  const wCount = () => U.openWarnings().length;

  function warnTab() {
    const v = V();
    const all = T().warnings;
    const list = all.filter((w) => v.wfilter === "all" || (v.wfilter === "open" ? w.state === "open" : w.state !== "open"));
    const cards = list.map((w) => {
      const loc = w.p ? U.ref(w.p, "tl") : `<span class="chip is-static">Ch.${w.ch} · cả chương</span>`;
      const diff = w.before ? `<div class="w-diff"><div><span class="eyebrow">Trước</span><p class="t-sm">${esc(w.before)}</p></div><div><span class="eyebrow">Sau</span><p class="t-sm t-ink">${esc(w.after)}</p></div></div>` : "";
      const state = w.state === "open" ? "" : `<span class="badge ${w.state === "resolved" ? "badge-success" : ""}">${w.state === "resolved" ? "ĐÃ XỬ LÝ" : "ĐÃ BỎ QUA"}</span>${w.by ? `<span class="t-sm t-mute">${esc(w.by)}</span>` : ""}`;
      const act = w.state === "open"
        ? `${w.kind === "dict" ? `<button class="btn btn-sm" data-act="tl-step" data-v="dict">${ic("book")}Mở từ điển</button>` : ""}${w.kind === "guideline" ? `<button class="btn btn-sm" data-act="tl-step" data-v="guide">${ic("pen")}Mở hướng dẫn</button>` : ""}
           ${w.p ? `<button class="btn btn-sm" data-act="tl-w-view" data-id="${w.id}">Xem đoạn</button>` : ""}
           <button class="btn btn-sm" data-act="tl-w-retr" data-id="${w.id}" ${U.runningTask("translate", w.p ? `p${w.p}` : `c${w.ch}`) ? "disabled" : ""}>${ic("refresh")}Dịch lại ${w.p ? "đoạn" : "chương"}</button>
           <button class="btn btn-sm" data-act="tl-w-ok" data-id="${w.id}">Đã xem xét</button>
           <button class="btn btn-sm btn-ghost" data-act="tl-w-skip" data-id="${w.id}">Bỏ qua</button>`
        : `<button class="btn btn-sm btn-ghost" data-act="tl-w-reopen" data-id="${w.id}">Mở lại</button>`;
      return `<div class="card w-card"><div class="w-top"><span class="badge ${KIND[w.kind][0]}">${KIND[w.kind][1]}</span>${loc}<span class="spacer"></span>${state}<span class="mono t-mute">${esc(w.date)}</span></div>
        <p>${esc(w.reason)}</p>${diff}<div class="w-act">${act}</div></div>`;
    }).join("");
    const count = (s) => all.filter((w) => s === "all" || (s === "open" ? w.state === "open" : w.state !== "open")).length;
    return `<div class="tl-sub">${U.seg("tl-wf", [["open", `Đang mở ${count("open")}`], ["done", `Đã xử lý ${count("done")}`], ["all", `Tất cả ${count("all")}`]], v.wfilter)}</div>
      <div class="tl-list" data-keep="tl-warn">${cards || U.empty("Không có cảnh báo", "Khi bản gốc, hướng dẫn hoặc từ điển thay đổi sau lúc dịch, các đoạn bị ảnh hưởng sẽ hiện ở đây.")}</div>`;
  }

  const reviewParas = () => Object.keys(T().chapters).reduce((a, n) => a + U.trParaList(+n).filter((p) => p.st === "review").length, 0);
  const translating = () => A.PL.list.some((p) => p.kind === "translate" && p.status === "running");
  const stepSummary = (id) => {
    const total = N().chapters.length;
    if (id === "dict") return `${T().dict.length} mục`;
    if (id === "guide") return `v${T().guidelines.version}`;
    if (id === "trans") return translating() ? "Đang dịch…" : `${Object.keys(T().chapters).length}/${total} chương`;
    if (id === "result") return reviewParas() ? `${reviewParas()} đoạn cần xem` : "Đã xem hết";
    return wCount() ? `${wCount()} đang mở` : "Không có";
  };
  const stepTone = (id) => (id === "warn" && wCount() ? "is-warn" : id === "result" && reviewParas() ? "is-warn" : id === "trans" && translating() ? "is-run" : "");

  function flowBar(step) {
    const idx = STEPS.findIndex((x) => x.id === step);
    return `<nav class="flow" aria-label="Quy trình dịch">${STEPS.map((x, i) => `<button type="button" class="fs ${x.id === step ? "is-active" : ""} ${i < idx ? "is-past" : ""} ${stepTone(x.id)}" data-act="tl-step" data-v="${x.id}" aria-current="${x.id === step}">
        <span class="fs-n">${i < idx ? ic("check") : i + 1}</span><span class="fs-t"><b>${x.label}</b><small>${esc(stepSummary(x.id))}</small></span></button>${i < STEPS.length - 1 ? `<span class="fs-sep">${ic("chev-r")}</span>` : ""}`).join("")}
</nav>`;
  }

  function flowFoot(step) {
    const i = STEPS.findIndex((x) => x.id === step);
    const prev = STEPS[i - 1];
    const next = STEPS[i + 1];
    return `<footer class="flow-foot">
      ${prev ? `<button class="btn btn-sm" data-act="tl-step" data-v="${prev.id}">${ic("chev-l")}${prev.label}</button>` : `<span></span>`}
      <span class="t-sm t-mute flow-hint">${esc(STEPS[i].hint)}</span>
      ${next ? `<button class="btn btn-sm btn-primary" data-act="tl-step" data-v="${next.id}">${next.label}${ic("chev-r")}</button>`
    : `<span></span>`}</footer>`;
  }

  function view(id) {
    U.bind(id);
    const v = V();
    const body = !U.hasText() ? U.noSample()
      : v.step === "dict" ? dictStep() : v.step === "guide" ? guideStep() : v.step === "trans" ? pipelineTab() : v.step === "result" ? readTab() : warnTab();
    return `<div class="nv">
      ${U.bar(`${U.novelTitle()}<span class="bar-sep"></span><label class="bar-field"><span>Dịch sang</span><select class="select" aria-label="Ngôn ngữ đích">${U.options([["vi", "Tiếng Việt"], ["en", "Tiếng Anh (sắp có)", true], ["zh", "Tiếng Trung (sắp có)", true]], "vi")}</select></label>`)}
      ${U.hasText() ? flowBar(v.step) : ""}
      <div class="nv-body is-col">${body}</div>
      ${U.hasText() ? flowFoot(v.step) : ""}
    </div>`;
  }

  function mount(root) {
    const v = V();
    const ta = A.$("#tl-ta", root);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    A.$("#tl-note-in", root)?.focus();
    if (v.focus) {
      const id = v.focus;
      setTimeout(() => A.$(`#tp-${id.replace(".", "\\.")}`)?.scrollIntoView({ block: "center" }), 0);
      v.focus = null;
    }
  }

  function inspector(id) {
    U.bind(id);
    const done = Object.keys(T().chapters).length;
    const warns = wCount();
    return `${U.inspectorNovel()}
      ${U.insSec("Tiến độ dịch", U.kv([["Đã có bản nháp", `${done}/${N().chapters.length} chương`], ["Cảnh báo mở", warns ? `<span class="badge badge-warning">${warns}</span>` : "0"], ["Hướng dẫn", `v${T().guidelines.version}`], ["Từ điển", `${T().dict.length} mục`], ["Mục đích", esc(purposeLabel())]]))}`;
  }

  A.VIEWS.translation = { fill: true, render: view, mount, inspector };

  function openTranslation(step, ch, pid) {
    const v = V();
    if (step) v.step = LEGACY[step] || step;
    if (ch) { v.ch = ch; if (v.step === "trans") v.picks[ch] = true; }
    if (pid) { v.focus = pid; v.edit = null; }
    U.openNovelTab("translation", N().reader.novel);
  }
  U.openTranslation = openTranslation;

  function settle(w, state, by) {
    w.state = state;
    w.by = by;
    if (w.p) {
      const tp = T().chapters[w.ch]?.paras[w.p];
      if (tp && tp.st === "review" && !U.openWarnings().some((x) => x.p === w.p)) tp.st = tp.prev || "draft";
    }
  }
  const warnById = (id) => T().warnings.find((w) => w.id === id);

  function startNewEntry() {
    const v = V();
    v.nd = { src: "", dst: "", type: "term", note: "" };
    v.step = "dict";
    v.dq = "";
    A.rerender();
    setTimeout(() => A.$("#tl-nd-src")?.focus(), 0);
  }

  function flagDictionary(entry) {
    let n = 0;
    Object.entries(T().chapters).forEach(([ch, t]) => {
      (U.chapter(+ch).paras || []).forEach((p) => {
        const tp = t.paras[p.id];
        if (!tp) return;
        if (p.t.toLowerCase().includes(entry.src.toLowerCase()) && !tp.t.toLowerCase().includes(entry.dst.toLowerCase())) {
          if (tp.st !== "review") tp.prev = tp.st;
          tp.st = "review";
          U.addWarning({ kind: "dict", ch: +ch, p: p.id, reason: `Từ điển v${T().guidelines.version}: “${entry.src}” → “${entry.dst}”, nhưng đoạn dịch chưa dùng cách dịch này.`, before: tp.t, after: entry.dst });
          n++;
        }
      });
    });
    return n;
  }

  function reviewDialog() {
    const v = V();
    const n = v.ch;
    const est = U.estimate([n], { outRatio: 0.6, guide: 420 });
    const doubled = Math.round(est.tin * 1.9);
    A.modal({
      title: `Rà soát Ch.${n} bằng Assistant`, eyebrow: window.DS.CAP["11"],
      body: `<div class="field"><label for="rv-text">Yêu cầu cụ thể (tùy chọn)</label>
          <textarea id="rv-text" class="textarea" rows="3" placeholder="Để trống để rà soát mặc định: đúng nghĩa, đủ ý, nhất quán thuật ngữ, giọng văn theo hướng dẫn."></textarea></div>
        <div class="card side-card"><span class="eyebrow">Nội dung sẽ gửi</span>
          <ul class="disc"><li class="is-yes">${ic("check")}<span>Nguồn và bản dịch Ch.${n} (${fmt(U.chapter(n).words)} từ)</span></li>
          <li class="is-yes">${ic("check")}<span>Hướng dẫn dịch và từ điển v${T().guidelines.version}</span></li>
          <li class="is-no">${ic("x")}<span>Không gửi: các chương khác, ghi chú của bạn</span></li></ul>
          <p class="t-sm t-mute">Bên nhận: ${esc(U.provider(T().provider).name)} · ước tính ${fmt(doubled)} token vào, ${U.money(est.cost * 1.4)}.</p></div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-act="tl-ai-run">${ic("spark")}Bắt đầu rà soát</button>`,
    });
  }

  Object.assign(A.ACT, {
    "tl-step": (el) => { const v = V(); v.step = el.dataset.v; v.edit = null; v.noteFor = null; A.rerender(); },
    "tl-start": (el) => startTranslate(el.dataset.v === "trial"),
    "tl-open-read": (el) => openTranslation("result", +el.dataset.n),
    "tl-pick-go": (el) => { V().ch = +el.dataset.n; V().picks[+el.dataset.n] = true; V().step = "trans"; A.rerender(); },
    "tl-pick-missing": () => { const v = V(); N().chapters.forEach((c) => { v.picks[c.n] = !N().tr.chapters[c.n] && !U.runningTask("translate", `c${c.n}`); }); A.rerender(); },
    "tl-pick-review": () => { const v = V(); N().chapters.forEach((c) => { v.picks[c.n] = U.trStatus(c.n) === "review"; }); A.rerender(); },
    "tl-pick-none": () => { V().picks = {}; A.rerender(); },
    "tl-prev": () => { V().ch = Math.max(1, V().ch - 1); V().edit = null; A.rerender(); },
    "tl-next": () => { V().ch = Math.min(N().chapters.length, V().ch + 1); V().edit = null; A.rerender(); },
    "tl-edit": (el) => { V().edit = el.dataset.p; A.rerender(); },
    "tl-cancel": () => { V().edit = null; A.rerender(); },
    "tl-save": (el) => {
      const v = V();
      const text = A.$("#tl-ta").value.trim();
      const pid = el.dataset.p;
      const tp = T().chapters[v.ch].paras[pid];
      v.edit = null;
      if (text && text !== tp.t) {
        tp.t = text;
        tp.st = "edited";
        U.openWarnings().filter((w) => w.p === pid).forEach((w) => settle(w, "resolved", "Sửa trực tiếp"));
        A.toast("Đã lưu bản dịch.");
      }
      A.rerender();
    },
    "tl-note-open": (el) => { V().noteFor = el.dataset.p; A.rerender(); },
    "tl-note-close": () => { V().noteFor = null; A.rerender(); },
    "tl-note-add": (el) => {
      const text = A.$("#tl-note-in").value.trim();
      if (text) T().chapters[V().ch].paras[el.dataset.p].notes.push({ text, date: A.stamp() });
      V().noteFor = null;
      A.rerender();
    },
    "tl-note-del": (el) => { T().chapters[V().ch].paras[el.dataset.p].notes.splice(+el.dataset.i, 1); A.rerender(); },
    "tl-dict": () => startNewEntry(),
    "tl-dict-new": () => startNewEntry(),
    "tl-dict-cancel": () => { V().nd = null; A.rerender(); },
    "tl-dict-add": () => {
      const nd = V().nd;
      const src = nd.src.trim();
      const dst = nd.dst.trim();
      if (!src || !dst) { A.toast("Nhập cả từ gốc và bản dịch.", "warning"); A.$(src ? "#tl-nd-dst" : "#tl-nd-src")?.focus(); return; }
      const entry = { id: `D${String(T().dict.length + 11).padStart(2, "0")}`, src, dst, type: nd.type, note: nd.note.trim() };
      T().dict.push(entry);
      T().guidelines.version++;
      V().nd = null;
      const n = flagDictionary(entry);
      A.rerender();
      A.toast(`Đã thêm vào từ điển v${T().guidelines.version}${n ? `. ${n} đoạn cần xem lại.` : "."}`, n ? "warning" : "success");
    },
    "tl-dict-del": (el) => {
      T().dict = T().dict.filter((d) => d.id !== el.dataset.id);
      T().guidelines.version++;
      A.toast("Đã xóa mục từ điển.");
      A.rerender();
    },
    "tl-guide-save": () => {
      const g = T().guidelines;
      const next = { purpose: A.$("#g-purpose").value, audience: A.$("#g-audience").value.trim(), tone: A.$("#g-tone").value.trim(), pronouns: A.$("#g-pronouns").value.trim(), conventions: A.$("#g-conv").value.trim() };
      const names = { purpose: "Mục đích", audience: "Độc giả", tone: "Giọng văn", pronouns: "Xưng hô", conventions: "Quy ước" };
      const changed = Object.keys(next).filter((k) => next[k] !== g[k]).map((k) => names[k]);
      if (!changed.length) { A.toast("Không có thay đổi.", "warning"); return; }
      Object.assign(g, next);
      g.version++;
      Object.keys(T().chapters).forEach((ch) => U.addWarning({ kind: "guideline", ch: +ch, p: null, reason: `Hướng dẫn dịch đã đổi (v${g.version - 1} → v${g.version}): ${changed.join(", ")}. Bản dịch chương này có thể cần điều chỉnh.` }));
      A.rerender();
      A.toast(`Đã lưu hướng dẫn v${g.version}. ${Object.keys(T().chapters).length} chương có cảnh báo mới.`, "warning");
    },
    "tl-wf": (el) => { V().wfilter = el.dataset.v; A.rerender(); },
    "tl-w-view": (el) => { const w = warnById(el.dataset.id); openTranslation("result", w.ch, w.p); },
    "tl-w-ok": (el) => { settle(warnById(el.dataset.id), "resolved", "Đã xem xét"); A.rerender(); },
    "tl-w-skip": (el) => { settle(warnById(el.dataset.id), "dismissed", "Bỏ qua"); A.rerender(); },
    "tl-w-reopen": (el) => { const w = warnById(el.dataset.id); w.state = "open"; w.by = ""; A.rerender(); },
    "tl-w-retr": (el) => {
      const w = warnById(el.dataset.id);
      const key = w.p ? `p${w.p}` : `c${w.ch}`;
      A.startPipeline({
        kind: "translate", label: w.p ? `Dịch lại ${U.refLabel(w.p)}` : `Dịch lại Ch.${w.ch}`, detail: `${U.nameOf(U.current())} → ${T().lang}`,
        tasks: [{ key, label: key }],
        onDone: () => {
          if (w.p) {
            const tp = T().chapters[w.ch].paras[w.p];
            tp.t = fresh(w.p);
            tp.st = "draft";
            settle(w, "resolved", "Dịch lại đoạn");
          } else {
            finishChapter(w.ch);
          }
        },
      });
      A.rerender();
    },
    "tl-ai": () => { const v = V(); if (v.panel && v.reviewed[v.ch]) { v.panel = false; A.rerender(); } else reviewDialog(); },
    "tl-ai-close": () => { V().panel = false; A.rerender(); },
    "tl-ai-run": () => {
      const v = V();
      const text = A.$("#rv-text").value.trim();
      const ch = v.ch;
      A.closeModal();
      v.panel = true;
      v.reviewNote = text ? `Theo yêu cầu: “${text}”.` : "";
      A.startPipeline({
        kind: "review", label: `Rà soát Ch.${ch}`, detail: text ? `Yêu cầu: ${text.slice(0, 48)}` : "Rà soát mặc định", tasks: [{ key: "r1", label: "review" }],
        onDone: () => { v.reviewed[ch] = true; },
      });
      A.rerender();
    },
    "tl-ai-apply": (el) => {
      const s = T().suggestions.find((x) => x.id === el.dataset.id);
      const tp = T().chapters[s.ch].paras[s.p];
      tp.t = s.revise;
      tp.st = "edited";
      s.state = "applied";
      U.openWarnings().filter((w) => w.p === s.p).forEach((w) => settle(w, "resolved", "Áp dụng gợi ý của Assistant"));
      A.rerender();
      A.toast(`Đã áp dụng gợi ý cho ${U.refLabel(s.p)}.`);
    },
    "tl-ai-skip": (el) => { T().suggestions.find((x) => x.id === el.dataset.id).state = "dismissed"; A.rerender(); },
  });

  Object.assign(A.ON, {
    "tl-pick": (el) => { V().picks[el.dataset.n] = el.checked; A.rerender(); },
    "tl-pick-all": (el) => {
      const v = V();
      const needle = v.cq.trim().toLowerCase();
      N().chapters.filter((c) => (!needle || `${c.n} ${c.title}`.toLowerCase().includes(needle)) && (v.cf === "all" || U.trStatus(c.n) === v.cf))
        .forEach((c) => { if (!U.runningTask("translate", `c${c.n}`)) v.picks[c.n] = el.checked; });
      A.rerender();
    },
    "tl-nd": (el) => { V().nd[el.dataset.f] = el.value; },
    "tl-dict-f": (el) => {
      const d = T().dict.find((x) => x.id === el.dataset.id);
      const f = el.dataset.f;
      const v = el.value.trim();
      if ((f === "src" || f === "dst") && !v) { el.value = d[f]; A.toast("Từ gốc và bản dịch không được để trống.", "warning"); return; }
      if (v === d[f]) return;
      d[f] = v;
      T().guidelines.version++;
      const n = flagDictionary(d);
      A.rerender();
      A.toast(`Đã lưu từ điển v${T().guidelines.version}${n ? `. ${n} đoạn cần xem lại.` : "."}`, n ? "warning" : "success");
    },
    "tl-cq": (el) => { V().cq = el.value; A.rerender(); },
    "tl-cf": (el) => { V().cf = el.value; A.rerender(); },
    "tl-provider": (el) => { T().provider = el.value; A.rerender(); },
    "tl-ch": (el) => { V().ch = Math.max(1, Math.min(N().chapters.length, Math.floor(+el.value) || 1)); V().edit = null; A.rerender(); },
    "tl-only": (el) => { V().onlyReview = el.checked; A.rerender(); },
    "tl-dq": (el) => { V().dq = el.value; A.rerender(); },
  });
})();
