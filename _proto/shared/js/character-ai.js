(function () {
  const A = window.DSApp;
  const SC = window.SC;
  const CR = window.CR;
  const CRV = window.CRV;
  const U = window.NVU;
  const { esc, ic } = A;

  const GEN = { scope: "outfit", prov: "gemini", lock: true, ref: true };
  const SG = { sel: new Set(), prov: "claude" };
  const provOf = (id) => CR.PROVIDERS.find((q) => q.id === id);
  const words = (t) => SC.words(t);

  function itemsFor(c) {
    if (GEN.scope === "missing") return c.an.todo.filter((t) => t.sheet !== "draft").map((t) => ({ ch: t.row.ch, e: t.row.e, o: t.o }));
    return [{ ch: c.ch, e: c.e, o: c.o }];
  }

  function openGen(c, scope) {
    Object.assign(GEN, { scope, prov: c.st.prov, lock: c.st.lock, ref: true });
    drawGen(c);
  }

  function drawGen(c) {
    const items = itemsFor(c);
    const n = items.length;
    const prov = provOf(GEN.prov);
    const batch = GEN.scope === "missing";
    const hint = (it) => {
      const sh = CR.sheetOf(c.p, it.e, it.o);
      return sh === "none" ? "No sheet yet" : sh === "stale" ? "Needs review, will be replaced" : it.o.sheet.ok ? "Approved, the old version is saved to history" : "Draft, will be replaced";
    };
    const list = items.map((it) => `<div class="pj-chk-row cr-gen-row" data-testid="cr-gen-item-${it.ch.id}-${it.o.id}"><span>${esc(it.ch.name)} · ${esc(it.o.name)}</span><span class="t-sm t-mute">${hint(it)}</span></div>`).join("");
    const avg = n ? Math.round(items.reduce((a, it) => a + words(it.o.prompt.text), 0) / n) : 0;
    const outfits = items.filter((it) => !it.o.base);
    const refOk = outfits.filter((it) => it.e.base.sheet);
    const useRef = GEN.ref && refOk.length > 0;
    const sent = prov.id === "comfy"
      ? "No data leaves your machine, images are generated on your computer."
      : `Will be sent to <b>${esc(prov.name)}</b>: the prompt of each sheet (≈ ${avg} words, with an appearance description drawn from the work), negative prompt${useRef ? " and the original Character sheet as a reference image" : ""}.`;
    const est = n ? `${n} sheet · ${prov.per ? `≈ $${(n * prov.per).toFixed(2)}` : "free"} · about ${Math.max(1, Math.round(n * prov.mins))} minutes.` : "No sheets need to be generated.";
    A.modal({ title: batch ? "Generate the missing sheets" : c.o.base ? `Generate Character sheet · ${c.ch.name}` : `Generate sheet · ${c.ch.name} · ${c.o.name}`, eyebrow: "Character", cls: "modal-lg", testid: "cr-gen-modal",
      body: `<p class="t-sm t-mute">The AI generates each sheet as one long image containing 4 views: front, back, side and 3/4 half body. The original Character sheet wears a plain white short T-shirt and shorts; each outfit has its own sheet. You review, approve or regenerate.</p>
        <div class="field"><span class="eyebrow">${batch ? "Outfits to generate" : "Sheets to generate"}</span><div class="pj-chk-list" data-testid="cr-gen-list">${list || `<p class="t-sm t-mute">No sheets need to be generated.</p>`}</div></div>
        <div class="form-2"><div class="field"><label for="cr-gen-prov">Image generator</label><select id="cr-gen-prov" class="select" data-testid="cr-gen-prov-select" data-change="cr-gen-prov">${U.options(CR.PROVIDERS.map((q) => [q.id, q.ok ? q.name : `${q.name} (not installed)`, !q.ok]), GEN.prov)}</select>${prov.note ? `<span class="field-hint">${esc(prov.note)}</span>` : ""}</div>
          <div class="field"><span class="eyebrow">Optional</span>
            ${outfits.length ? `<label class="check" data-testid="cr-gen-ref"><input type="checkbox" data-testid="cr-gen-ref-input" data-change="cr-gen-ref" ${GEN.ref ? "checked" : ""} ${refOk.length ? "" : "disabled"}><span>Use the Character sheet as a reference image</span></label>` : ""}
            <label class="check" data-testid="cr-gen-lock"><input type="checkbox" data-testid="cr-gen-lock-input" data-change="cr-gen-lock" ${GEN.lock ? "checked" : ""}><span>Keep the seed of the old sheet when regenerating</span></label></div></div>
        <div class="sc-est" data-testid="cr-gen-estimate">${ic("info")}<div class="t-sm">${sent} Estimate: ${est}</div></div>`,
      foot: `<button class="btn" data-testid="cr-gen-cancel-btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="cr-gen-go-btn" data-act="cr-gen-go" ${n && prov.ok ? "" : "disabled"}>${ic("spark")}Generate ${n || ""} sheet</button>` });
  }

  function applyGen(p, x, opts) {
    const e = CR.of(p).chars[x.ch];
    const o = e && CR.all(e).find((q) => q.id === x.o);
    if (!o) return;
    const prev = o.sheet;
    o.sheet = {
      src: "gen", seed: opts.lock && prev && prev.seed ? prev.seed : Math.floor(Math.random() * 99999), prov: opts.prov, at: A.stamp(), rev: Date.now(), ok: false,
      sig: CR.sigOf(p, e, o), prompt: o.prompt.text, ...(opts.ref && !o.base && e.base.sheet ? { ref: true, refRev: e.base.sheet.rev } : {}), hist: prev ? [{ ...prev, hist: [] }, ...(prev.hist || [])].slice(0, 5) : [],
    };
    CRV.syncP(p);
  }

  function runGen(c) {
    const items = itemsFor(c);
    const { p, st } = c;
    const prov = provOf(GEN.prov);
    Object.assign(st, { prov: GEN.prov, lock: GEN.lock });
    const tasks = items.map((it) => ({ key: CRV.slotKey(p, it.ch, it.o), label: `${it.ch.name} · ${it.o.name}`, ch: it.ch.id, o: it.o.id }));
    const opts = { prov: GEN.prov, lock: GEN.lock, ref: GEN.ref };
    A.startPipeline({
      kind: "character", label: `Character · ${p.name}`, detail: `${tasks.length} sheet · ${prov.name}`,
      tasks,
      onTask: (t) => applyGen(p, t, opts),
      onDone: () => {
        p.activity.unshift([A.stamp(), `Generate ${tasks.length} design sheets with ${prov.name}`]);
        CRV.syncP(p);
        A.toast(`Generated ${tasks.length} design sheets. Please review and approve.`);
      },
    });
  }

  function suggestLoad(c, ids) {
    const rows = c.an.rows.filter((r) => ids.has(r.ch.id));
    const refs = rows.flatMap((r) => { const i = CR.kbItem(r.ch.id); return i ? [...new Set(i.ev.map((q) => q.p))] : []; });
    const w = refs.reduce((a, pid) => { const para = U.findPara(pid); return a + (para ? words(para.t) : 0); }, 0);
    return { rows, paras: refs.length, words: w };
  }
  function openSuggest(c) {
    const ids = c.an.rows.map((r) => r.ch.id);
    if (!SG.sel.size || ![...SG.sel].every((id) => ids.includes(id))) SG.sel = new Set([c.ch.id]);
    drawSuggest(c);
  }
  function drawSuggest(c) {
    const rows = c.an.rows.map((r) => {
      const kb = !!CR.kbItem(r.ch.id);
      const gaps = CR.gaps(r.e, r.e.outfits[0]).length;
      const changed = kb && CR.kbSig(r.ch.id) !== r.e.kbSnap;
      const hint = changed ? "Knowledgebase changed" : kb ? (gaps ? `${gaps} details missing` : "All details present") : "Not in the KB";
      return `<label class="check pj-chk-row" data-testid="cr-sg-row-${r.ch.id}"><input type="checkbox" data-testid="cr-sg-input-${r.ch.id}" data-change="cr-sg-char" data-id="${r.ch.id}" ${SG.sel.has(r.ch.id) ? "checked" : ""}><span><i class="sc-dot ${CRV.spkClass(r.ch)}"></i> ${esc(r.ch.name)}</span><span class="t-sm t-mute">${hint}</span></label>`;
    }).join("");
    const ld = suggestLoad(c, SG.sel);
    const n = ld.rows.length;
    const tin = ld.words * 1.35 + 450 * n;
    const tout = 320 * n;
    A.modal({ title: "Suggest profile and prompt with AI", eyebrow: "Character", cls: "modal-lg", testid: "cr-sg-modal",
      body: `<p class="t-sm t-mute">The AI reads the Knowledgebase to find appearance descriptions, then drafts an image-generation prompt. Details the text does not state are proposed by the AI and marked “AI inference” for you to confirm. Anything you entered or confirmed is not overwritten.</p>
        <div class="field"><span class="eyebrow">Characters</span><div class="pj-chk-list" data-testid="cr-sg-list">${rows}</div></div>
        <div class="field"><label for="cr-sg-prov">Provider</label>${U.providerSelect("cr-sg-prov", SG.prov)}</div>
        <div class="sc-est" data-testid="cr-sg-estimate">${ic("info")}<div class="t-sm">${n ? `Will be sent to <b>${esc(U.provider(SG.prov).name)}</b>: summaries, attributes and evidence of ${n} characters in the Knowledgebase, plus ${ld.paras} source paragraphs (${U.fmt(ld.words)} words) and the scenes using the characters in Scripting. Estimated ${U.fmt(Math.round(tin))} input tokens, ${U.fmt(tout)} output tokens, ${U.money((tin / 1e6) * 3 + (tout / 1e6) * 15)}.` : "Choose at least one character to see the estimate."}</div></div>`,
      foot: `<button class="btn" data-testid="cr-sg-cancel-btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="cr-sg-go-btn" data-act="cr-suggest-go" ${n ? "" : "disabled"}>${ic("spark")}Suggest for ${n || ""} characters</button>` });
  }
  function applySuggest(p, chId) {
    const e = CR.entry(p, chId);
    const n = CR.applyGuess(e, e.outfits[0], "ai");
    e.kbSnap = CR.kbSig(chId);
    e.outfits.forEach((q) => CR.recompose(p, e, q));
    CRV.syncP(p);
    const name = CR.nameOf(p, chId);
    A.toast(n ? `Suggested ${n} details for ${name}.` : `No further appearance description of ${name} was found in the Knowledgebase or the script.`, n ? "success" : "warning");
  }

  Object.assign(A.ACT, {
    "cr-gen-open": (el, ev) => {
      ev?.stopPropagation();
      const c = CRV.activeCtx();
      if (c) openGen(c, el.dataset.scope || "outfit");
    },
    "cr-gen-go": () => {
      const c = CRV.activeCtx();
      if (!c) return;
      A.closeModal();
      runGen(c);
      A.rerender();
    },
    "cr-suggest": () => { const c = CRV.activeCtx(); if (c) openSuggest(c); },
    "cr-suggest-go": () => {
      const c = CRV.activeCtx();
      if (!c) return;
      const rows = c.an.rows.filter((r) => SG.sel.has(r.ch.id));
      if (!rows.length) return;
      const { p } = c;
      A.closeModal();
      A.startPipeline({
        kind: "charprompt", label: `Character profile · ${p.name}`, detail: `${rows.length} characters · ${U.provider(SG.prov).name}`,
        tasks: rows.map((r) => ({ key: `${p.id}:${r.ch.id}:profile`, label: r.ch.name, ch: r.ch.id })),
        onTask: (t) => applySuggest(p, t.ch),
      });
      A.rerender();
    },
  });

  Object.assign(A.ON, {
    "cr-gen-prov": (el) => { const c = CRV.activeCtx(); if (!c) return; GEN.prov = el.value; drawGen(c); },
    "cr-gen-ref": (el) => { const c = CRV.activeCtx(); if (!c) return; GEN.ref = el.checked; drawGen(c); },
    "cr-gen-lock": (el) => { GEN.lock = el.checked; },
    "cr-sg-char": (el) => { const c = CRV.activeCtx(); if (!c) return; if (el.checked) SG.sel.add(el.dataset.id); else SG.sel.delete(el.dataset.id); drawSuggest(c); },
    "cr-sg-prov": (el) => { SG.prov = el.value; const c = CRV.activeCtx(); if (c) drawSuggest(c); },
  });
})();
