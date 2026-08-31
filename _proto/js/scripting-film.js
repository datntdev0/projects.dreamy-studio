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
      return `<div class="sc-drawer-g"><span class="eyebrow">Chapter ${n}</span></div>${items.map((q) => R.srcCell(q, c, false)).join("")}`;
    }).join("");
    return `<aside class="sc-drawer" data-testid="sc-drawer" aria-label="Source reference"><div class="sc-drawer-h"><span class="eyebrow">Source reference</span><span class="mono t-mute">${esc(R.chLabel(c.u))}</span></div>${groups}</aside>`;
  }

  function page(c) {
    const { u, cfg } = c;
    const sheet = `<div class="sc-pagewrap"><div class="sc-page" data-testid="sc-page">
        <header class="sc-ptitle" data-testid="sc-page-title"><span class="mono">${esc(cfg.unit.toUpperCase())} ${R.pad(u.no)}${cfg.ranges ? ` · ${esc(R.chLabel(u))}` : ""}</span><h2>${esc(u.title || "Unnamed")}</h2></header>
        ${u.blocks.length ? u.blocks.map((b) => R.blk(b, c)).join("") : `<p class="sc-pempty t-sm t-mute">Blank page. Choose a block type in the bar above to begin.</p>`}
      </div></div>`;
    const d = drawer(c);
    return d ? `<div class="sc-split">${sheet}${d}</div>` : sheet;
  }

  function emptyFilm(c) {
    const ready = SC.kbReady(c.p, SC.chaptersOf(c.u));
    return U.empty(`This ${c.cfg.unit} has no script yet`, ready
      ? "The AI builds the script from the events, characters and places in the Knowledgebase of the selected chapters, with evidence from the source paragraphs. You edit it, then lock it."
      : "Choose the source chapters in the bar above. Once the chapters have knowledge analysis, the AI can build a draft from the Knowledgebase. You can also write from scratch.",
    `<div class="empty-act">${ready ? `<button class="btn btn-primary" data-testid="sc-empty-draft-btn" data-act="sc-draft">${ic("spark")}Generate a draft with AI</button>` : ""}<button class="btn" data-testid="sc-empty-start-btn" data-act="sc-start">${ic("pen")}Start writing</button></div>`);
  }

  R.page = page;
  R.emptyFilm = emptyFilm;
})();
