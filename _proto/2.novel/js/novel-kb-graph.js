/*
 * Obsidian-style knowledge graph: force-directed, drag nodes, drag the background to pan, scroll to zoom, hover to highlight neighbors,
 * Filters / Display / Forces panel floating in the corner. Self-contained: the screen only supplies data and receives select / open events.
 * Position and viewport are kept in `state` so re-rendering the screen does not make the graph "jump".
 */
window.KBG = (function () {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  const rnd = (seed) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs = {}) => { const n = document.createElementNS(NS, name); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };

  const fresh = () => ({
    pos: {}, view: null,
    f: { types: { character: true, place: true, org: true, object: true, event: false }, labels: true, edgeLabels: false, orphans: true, q: "" },
    set: { center: 0.02, repel: 4200, dist: 120 },
    open: { filters: true, display: false, forces: false },
  });

  const range = (key, label, min, max, step, value) => `<label class="kbg-rng"><span>${label}</span><input type="range" class="range" data-g="set" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;

  /** HTML of the control panel and the zoom buttons; `types` = [[key, label]]. */
  function markup(S, types) {
    const f = S.f;
    return `<svg class="kbg-svg" role="img" aria-label="Knowledge graph"></svg>
      <aside class="kbg-panel" aria-label="Graph controls">
        <details data-sec="filters" ${S.open.filters ? "open" : ""}><summary>Filters</summary><div class="kbg-sec">
          <input class="input" type="search" data-g="q" value="${esc(f.q)}" placeholder="Search nodes…" aria-label="Search nodes">
          ${types.map(([k, l]) => `<label class="check"><input type="checkbox" data-g="type" data-k="${k}" ${f.types[k] ? "checked" : ""}><span class="gt gt-${k}"></span><span>${esc(l)}</span></label>`).join("")}
          <label class="check"><input type="checkbox" data-g="orphans" ${f.orphans ? "checked" : ""}><span>Show nodes without links</span></label></div></details>
        <details data-sec="display" ${S.open.display ? "open" : ""}><summary>Display</summary><div class="kbg-sec">
          <label class="check"><input type="checkbox" data-g="labels" ${f.labels ? "checked" : ""}><span>Node labels</span></label>
          <label class="check"><input type="checkbox" data-g="edgeLabels" ${f.edgeLabels ? "checked" : ""}><span>Relation labels</span></label></div></details>
        <details data-sec="forces" ${S.open.forces ? "open" : ""}><summary>Forces</summary><div class="kbg-sec">
          ${range("center", "Pull to center", 0, 0.2, 0.01, S.set.center)}${range("repel", "Repulsion", 200, 6000, 100, S.set.repel)}${range("dist", "Link distance", 30, 200, 5, S.set.dist)}
          <button type="button" class="btn btn-sm" data-g-act="relayout">Rearrange</button></div></details>
      </aside>
      <div class="kbg-legend">${types.map(([k, l]) => `<span><i class="gt gt-${k}"></i>${esc(l)}</span>`).join("")}<span><i class="gt gt-issue"></i>Has conflict</span></div>
      <div class="kbg-zoom"><button type="button" class="btn btn-icon btn-sm" data-g-act="zin" aria-label="Zoom in">+</button><button type="button" class="btn btn-icon btn-sm" data-g-act="zout" aria-label="Zoom out">−</button><button type="button" class="btn btn-icon btn-sm" data-g-act="fit" aria-label="Fit to view" data-tip-l="Fit to view">◎</button></div>`;
  }

  /**
   * ctx: { state, getData(filters) → {nodes:[{id,label,type}], links:[{id,a,b,label,cert,kind}]},
   *        selId(), issueIds() → Set, onSelect(id), onOpen(id) }
   */
  function mount(root, ctx) {
    const svg = root.querySelector(".kbg-svg");
    const S = ctx.state;
    const vp = el("g", { class: "kbg-vp" });
    const gl = el("g", { class: "kbg-links" });
    const gn = el("g", { class: "kbg-nodes" });
    vp.append(gl, gn);
    svg.append(vp);

    let nodes = [];
    let links = [];
    let byId = new Map();
    let alpha = 0;
    let raf = 0;
    let hover = null;
    const size = () => { const r = svg.getBoundingClientRect(); return { w: r.width || 640, h: r.height || 400 }; };
    const view = () => (S.view ||= (() => { const { w, h } = size(); return { tx: w / 2, ty: h / 2, k: 1 }; })());

    const applyView = () => {
      const v = view();
      vp.setAttribute("transform", `translate(${v.tx},${v.ty}) scale(${v.k})`);
      svg.classList.toggle("is-far", v.k < 0.6);
    };

    function build() {
      const f = S.f;
      const data = ctx.getData(f);
      const q = f.q.trim().toLowerCase();
      let ns = data.nodes.filter((n) => f.types[n.type] && (!q || n.label.toLowerCase().includes(q)));
      const ids = new Set(ns.map((n) => n.id));
      let ls = data.links.filter((l) => ids.has(l.a) && ids.has(l.b));
      const deg = {};
      ls.forEach((l) => { deg[l.a] = (deg[l.a] || 0) + 1; deg[l.b] = (deg[l.b] || 0) + 1; });
      if (!f.orphans) ns = ns.filter((n) => deg[n.id]);
      const keep = new Set(ns.map((n) => n.id));
      ls = ls.filter((l) => keep.has(l.a) && keep.has(l.b));

      const prev = byId;
      nodes = ns.map((n, i) => {
        const p = S.pos[n.id];
        const x = p ? p[0] : null;
        return { ...n, deg: deg[n.id] || 0, x, y: p ? p[1] : null, vx: 0, vy: 0, fixed: false, i };
      });
      byId = new Map(nodes.map((n) => [n.id, n]));
      // new nodes: place near a neighbor that already has a position, otherwise spread around a circle
      nodes.forEach((n) => {
        if (n.x != null) return;
        const nb = ls.map((l) => (l.a === n.id ? byId.get(l.b) : l.b === n.id ? byId.get(l.a) : null)).find((m) => m && m.x != null);
        const ang = rnd(hash(n.id)) * Math.PI * 2;
        if (nb) { n.x = nb.x + Math.cos(ang) * 50; n.y = nb.y + Math.sin(ang) * 50; }
        else { const r = 70 + rnd(hash(n.id) + 3) * 90; n.x = Math.cos(ang) * r; n.y = Math.sin(ang) * r; }
      });
      links = ls.map((l) => ({ ...l, s: byId.get(l.a), t: byId.get(l.b) }));

      gl.replaceChildren();
      gn.replaceChildren();
      links.forEach((l) => {
        const g = el("g", { class: `kbg-l is-${l.cert || "text"} is-${l.kind}` });
        l.line = el("line");
        l.txt = el("text", { class: "kbg-lt", "text-anchor": "middle" });
        l.txt.textContent = l.label || "";
        g.append(l.line, l.txt);
        l.g = g;
        gl.append(g);
      });
      const issues = ctx.issueIds();
      nodes.forEach((n) => {
        n.r = n.type === "event" ? 5 : clamp(5 + Math.sqrt(n.deg) * 2.6, 5, 15);
        const g = el("g", { class: `kbg-n gt-${n.type} ${issues.has(n.id) ? "has-issue" : ""}`, "data-id": n.id, tabindex: "0" });
        const c = el("circle", { r: n.r });
        const t = el("text", { y: n.r + 12, "text-anchor": "middle" });
        t.textContent = n.label;
        g.append(c, t);
        n.g = g;
        gn.append(g);
      });
      svg.classList.toggle("no-labels", !f.labels);
      svg.classList.toggle("edge-labels", !!f.edgeLabels);
      paint();
      applySel();
    }

    const paint = () => {
      nodes.forEach((n) => n.g.setAttribute("transform", `translate(${n.x},${n.y})`));
      links.forEach((l) => {
        l.line.setAttribute("x1", l.s.x); l.line.setAttribute("y1", l.s.y); l.line.setAttribute("x2", l.t.x); l.line.setAttribute("y2", l.t.y);
        l.txt.setAttribute("x", (l.s.x + l.t.x) / 2); l.txt.setAttribute("y", (l.s.y + l.t.y) / 2 - 3);
      });
    };
    const save = () => nodes.forEach((n) => { S.pos[n.id] = [n.x, n.y]; });

    function step() {
      const { center, repel, dist } = S.set;
      const a = alpha;
      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const q = nodes[j];
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = rnd(i * 7 + j) - 0.5; dy = rnd(i * 3 + j) - 0.5; d2 = 1; }
          const d0 = Math.sqrt(d2);
          const ux = dx / d0;
          const uy = dy / d0;
          d2 = Math.max(d2, 400);
          const f = (repel * a) / d2;
          // repulsion by alpha + node anti-overlap force (independent of alpha so the final layout does not clump)
          const sep = d0 < 70 ? (70 - d0) * 0.12 : 0;
          dx = ux * (f + sep); dy = uy * (f + sep);
          p.vx -= dx; p.vy -= dy; q.vx += dx; q.vy += dy;
        }
      }
      links.forEach((l) => {
        const dx = l.t.x - l.s.x;
        const dy = l.t.y - l.s.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = ((d - dist) / d) * 0.08 * a;
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
      });
      nodes.forEach((n) => {
        n.vx -= n.x * center * a;
        n.vy -= n.y * center * a;
        n.vx *= 0.8; n.vy *= 0.8;
        if (!n.fixed) { n.x += clamp(n.vx, -40, 40); n.y += clamp(n.vy, -40, 40); }
      });
      alpha = Math.max(alpha * 0.985, 0);
    }

    function loop() {
      raf = 0;
      if (!svg.isConnected) return;
      step();
      paint();
      if (alpha > 0.015) raf = requestAnimationFrame(loop);
      else save();
    }
    const heat = (a = 0.5) => { alpha = Math.max(alpha, a); if (!raf) raf = requestAnimationFrame(loop); };

    function fit() {
      if (!nodes.length) return;
      const { w, h } = size();
      const xs = nodes.map((n) => n.x);
      const ys = nodes.map((n) => n.y);
      const x0 = Math.min(...xs) - 40; const x1 = Math.max(...xs) + 40;
      const y0 = Math.min(...ys) - 40; const y1 = Math.max(...ys) + 50;
      const k = clamp(Math.min(w / (x1 - x0), h / (y1 - y0)), 0.3, 1.15);
      S.view = { k, tx: w / 2 - ((x0 + x1) / 2) * k, ty: h / 2 - ((y0 + y1) / 2) * k };
      applyView();
    }

    /* ---- highlight / selection ---- */
    function highlight(id) {
      if (!id) { svg.classList.remove("has-hl"); nodes.forEach((n) => n.g.classList.remove("is-hl")); links.forEach((l) => l.g.classList.remove("is-hl")); return; }
      const nb = new Set([id]);
      links.forEach((l) => { if (l.a === id) nb.add(l.b); if (l.b === id) nb.add(l.a); });
      svg.classList.add("has-hl");
      nodes.forEach((n) => n.g.classList.toggle("is-hl", nb.has(n.id)));
      links.forEach((l) => l.g.classList.toggle("is-hl", l.a === id || l.b === id));
    }
    function applySel() {
      const sel = ctx.selId();
      nodes.forEach((n) => n.g.classList.toggle("is-sel", n.id === sel));
    }

    /* ---- pointer: pan / drag / click ---- */
    const toWorld = (e) => { const r = svg.getBoundingClientRect(); const v = view(); return [(e.clientX - r.left - v.tx) / v.k, (e.clientY - r.top - v.ty) / v.k]; };
    let drag = null;
    let last = {};
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const g = e.target.closest(".kbg-n");
      drag = { g, id: g?.dataset.id, x: e.clientX, y: e.clientY, moved: false, v: { ...view() } };
      if (g) { const n = byId.get(g.dataset.id); n.fixed = true; }
      svg.setPointerCapture(e.pointerId);
      svg.classList.add("is-drag");
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) {
        const g = e.target.closest?.(".kbg-n");
        const id = g?.dataset.id || null;
        if (id !== hover) { hover = id; highlight(id); }
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      if (drag.id) {
        const n = byId.get(drag.id);
        [n.x, n.y] = toWorld(e);
        n.vx = n.vy = 0;
        paint();
        heat(0.3);
      } else {
        S.view = { ...drag.v, tx: drag.v.tx + dx, ty: drag.v.ty + dy };
        applyView();
      }
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      svg.classList.remove("is-drag");
      try { svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (d.id) {
        byId.get(d.id).fixed = false;
        save();
        if (!d.moved) {
          const now = Date.now();
          if (last.id === d.id && now - last.t < 380) { last = {}; ctx.onOpen(d.id); } else { last = { id: d.id, t: now }; ctx.onSelect(d.id); }
        }
      } else if (!d.moved) {
        ctx.onSelect(null);
      }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("pointerleave", () => { if (!drag && hover) { hover = null; highlight(null); } });
    svg.addEventListener("keydown", (e) => {
      const g = e.target.closest?.(".kbg-n");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.shiftKey ? ctx.onOpen(g.dataset.id) : ctx.onSelect(g.dataset.id); }
    });
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY);
    }, { passive: false });

    function zoomAt(factor, cx, cy) {
      const r = svg.getBoundingClientRect();
      const v = view();
      const k = clamp(v.k * factor, 0.25, 3);
      const mx = cx == null ? r.width / 2 : cx - r.left;
      const my = cy == null ? r.height / 2 : cy - r.top;
      S.view = { k, tx: mx - ((mx - v.tx) * k) / v.k, ty: my - ((my - v.ty) * k) / v.k };
      applyView();
    }

    /* ---- panel ---- */
    const panel = root.querySelector(".kbg-panel");
    panel.addEventListener("input", (e) => {
      const t = e.target;
      const g = t.dataset.g;
      if (!g) return;
      if (g === "q") S.f.q = t.value;
      else if (g === "type") S.f.types[t.dataset.k] = t.checked;
      else if (g === "orphans") S.f.orphans = t.checked;
      else if (g === "labels") S.f.labels = t.checked;
      else if (g === "edgeLabels") S.f.edgeLabels = t.checked;
      else if (g === "set") { S.set[t.dataset.k] = +t.value; heat(0.6); return; }
      save();
      build();
      heat(0.5);
    });
    panel.addEventListener("toggle", (e) => { const sec = e.target.dataset?.sec; if (sec) S.open[sec] = e.target.open; }, true);
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-g-act]");
      if (!b) return;
      const act = b.dataset.gAct;
      if (act === "zin") zoomAt(1.3);
      else if (act === "zout") zoomAt(1 / 1.3);
      else if (act === "fit") fit();
      else if (act === "relayout") { S.pos = {}; nodes.forEach((n) => { const a = rnd(hash(n.id) + Date.now() % 97) * Math.PI * 2; n.x = Math.cos(a) * 120; n.y = Math.sin(a) * 120; }); heat(1); }
    });

    /* ---- first paint ---- */
    applyView();
    build();
    const cold = !nodes.some((n) => S.pos[n.id]);
    if (cold) { alpha = 1; for (let i = 0; i < 260; i++) step(); paint(); save(); alpha = 0; if (!S.fitted) { fit(); S.fitted = true; } } else heat(0.25);
    if (!S.view || !S.fitted) { fit(); S.fitted = true; }

    return { applySel, rebuild: () => { build(); heat(0.4); } };
  }

  return { fresh, markup, mount };
})();
