(function () {
  const A = window.DSApp;
  const SC = window.SC;
  const R = window.SCR;
  const U = window.NVU;
  const { esc, ic } = A;

  function drawer(c) {
    if (!c.x.drawer || !c.src) return "";
    const groups = SC.chaptersOf(c.u).map((n) => {
      const items = c.src.list.filter((q) => q.id.startsWith(`${n}.`));
      return `<div class="sc-drawer-g"><span class="eyebrow">Chương ${n}</span></div>${items.map((q) => R.srcCell(q, c, false)).join("")}`;
    }).join("");
    return `<aside class="sc-drawer" data-testid="sc-drawer" aria-label="Nguồn tham chiếu"><div class="sc-drawer-h"><span class="eyebrow">Nguồn tham chiếu</span><span class="mono t-mute">${esc(R.chLabel(c.u))}</span></div>${groups}</aside>`;
  }

  function page(c) {
    const { u, cfg } = c;
    const sheet = `<div class="sc-pagewrap"><div class="sc-page" data-testid="sc-page">
        <header class="sc-ptitle" data-testid="sc-page-title"><span class="mono">${esc(cfg.unit.toUpperCase())} ${R.pad(u.no)}${cfg.ranges ? ` · ${esc(R.chLabel(u))}` : ""}</span><h2>${esc(u.title || "Chưa đặt tên")}</h2></header>
        ${u.blocks.length ? u.blocks.map((b) => R.blk(b, c)).join("") : `<p class="sc-pempty t-sm t-mute">Trang trống. Chọn một loại khối ở thanh phía trên để bắt đầu.</p>`}
      </div></div>`;
    const d = drawer(c);
    return d ? `<div class="sc-split">${sheet}${d}</div>` : sheet;
  }

  function emptyFilm(c) {
    const ready = SC.kbReady(c.p, SC.chaptersOf(c.u));
    return U.empty(`${c.cfg.unit} này chưa có kịch bản`, ready
      ? "AI dựng kịch bản từ sự kiện, nhân vật và địa điểm trong Knowledgebase của các chương đã chọn, kèm dẫn chứng từ đoạn gốc. Bạn chỉnh sửa rồi chốt."
      : "Chọn chương nguồn ở thanh phía trên. Khi các chương đã phân tích tri thức, AI có thể dựng bản nháp từ Knowledgebase. Bạn cũng có thể tự viết từ đầu.",
    `<div class="empty-act">${ready ? `<button class="btn btn-primary" data-testid="sc-empty-draft-btn" data-act="sc-draft">${ic("spark")}Tạo bản nháp bằng AI</button>` : ""}<button class="btn" data-testid="sc-empty-start-btn" data-act="sc-start">${ic("pen")}Bắt đầu viết</button></div>`);
  }

  R.page = page;
  R.emptyFilm = emptyFilm;
})();
