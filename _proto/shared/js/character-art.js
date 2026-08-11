(function () {
  const CR = window.CR;
  const LB = window.LB;
  const { esc } = window.DSApp;

  const test = (re, s) => re.test(String(s || ""));
  const skinOf = (v) => (test(/nhợt|trắng|tái|pale/i, v) ? "#e8d3c4" : test(/sạm|ngăm|rám|nâu|weather|tan/i, v) ? "#b98a68" : "#d6b399");
  const hairOf = (v) => (test(/bạc|xám|grey|gray|silver/i, v) ? "#b9bcc4" : test(/đen|black|dark/i, v) ? "#1f1c20" : test(/nâu|brown/i, v) ? "#5a3c2b" : test(/vàng|blond/i, v) ? "#c9a24b" : test(/đỏ|red/i, v) ? "#8c3b2a" : "#3b2f2a");
  const hairKind = (v) => (test(/trùm|khăn|hood|scarf/i, v) ? "cover" : test(/búi|bun/i, v) ? "bun" : test(/dài|long/i, v) ? "long" : "short");
  const buildOf = (v) => (test(/gầy|mảnh|thin|slim|lean|wiry/i, v) ? 0.82 : test(/đậm|khỏe|vạm|broad|stocky/i, v) ? 1.18 : 1);
  const heightOf = (v) => (test(/nhỏ|còng|small|stooped/i, v) ? 0.92 : test(/cao|tall/i, v) ? 1.04 : 1);

  function inner(e, o, view, seed) {
    const P = e.profile;
    const skin = skinOf(P.skin.v);
    const hair = hairOf(P.hair.v);
    const hk = hairKind(P.hair.v);
    const w = buildOf(P.build.v);
    const hs = heightOf(P.build.v);
    const [c0, c1, c2] = o.palette.map((x) => x.c);
    const g = `${o.garment.v} ${o.garment.en}`;
    const long = !o.base && test(/choàng|khoác|coat|cloak|robe|áo dài|gown/i, g);
    const hood = test(/mũ trùm|hood/i, g);
    const props = o.base ? "" : `${o.props.v} ${o.props.en}`;
    const t = view === "side" ? 1 : view === "tq" ? 0.5 : 0;
    const back = view === "back";
    const cx = 60 + (seed % 3) - 1;
    const half = 15 * w * (1 - 0.45 * t);
    const hip = 13 * w * (1 - 0.4 * t);
    const hem = long ? 18 * w * (1 - 0.35 * t) : hip;
    const yEnd = long ? 158 : 122;
    const top = 188 - 174 * hs;
    const hy = top + 16;
    const hx = cx - 4 * t;
    const leg = (x, d) => `<rect x="${x}" y="${yEnd - 10}" width="${9 * w}" height="${188 - yEnd + 10}" rx="2" fill="${c1}"/><rect x="${x - 1 + d}" y="184" width="${11 * w}" height="5" rx="2" fill="#1a1719"/>`;
    const shorts = (x) => `<rect x="${x}" y="${yEnd - 10}" width="${9 * w}" height="26" rx="2" fill="${c0}"/>`;
    const legs = o.base
      ? (t > 0.9 ? [[cx - 5 * w, 2], [cx - 3 * w, -1]] : [[cx - 11 * w, 0], [cx + 2 * w, 0]]).map(([x, d]) => `<rect x="${x}" y="${yEnd - 10}" width="${9 * w}" height="${188 - yEnd + 10}" rx="2" fill="${skin}"/>${shorts(x)}<ellipse cx="${x + 4.5 * w + d}" cy="186" rx="${6 * w}" ry="2.5" fill="${skin}"/>`).join("")
      : t > 0.9 ? leg(cx - 5 * w, 2) + leg(cx - 3 * w, -1) : leg(cx - 11 * w, 0) + leg(cx + 2 * w, 0);
    const torso = `<path d="M${cx - half} ${top + 36} Q${cx} ${top + 30} ${cx + half} ${top + 36} L${cx + hem} ${yEnd} L${cx - hem} ${yEnd} Z" fill="${c0}"/>`;
    const seam = back ? `<path d="M${cx} ${top + 34} L${cx} ${yEnd}" stroke="${c1}" stroke-width="1.2" opacity=".6"/>` : "";
    const belt = o.base ? "" : `<rect x="${cx - hip}" y="${top + 66}" width="${hip * 2}" height="4" fill="${c2}" opacity=".85"/>`;
    const arm = (x, d) => (o.base
      ? `<path d="M${x} ${top + 38} L${x + d} ${top + 92}" stroke="${skin}" stroke-width="${6 * w}" stroke-linecap="round"/><path d="M${x} ${top + 38} L${x + d * 0.3} ${top + 54}" stroke="${c0}" stroke-width="${8 * w}" stroke-linecap="round"/><circle cx="${x + d}" cy="${top + 94}" r="3.2" fill="${skin}"/>`
      : `<path d="M${x} ${top + 38} L${x + d} ${top + 92}" stroke="${c0}" stroke-width="${7 * w}" stroke-linecap="round"/><circle cx="${x + d}" cy="${top + 94}" r="3.2" fill="${skin}"/>`);
    const arms = t > 0.9 ? arm(cx, 3) : arm(cx - half + 1, -4) + arm(cx + half - 1, 4);
    const neck = `<rect x="${hx - 4}" y="${hy + 10}" width="8" height="12" fill="${skin}"/>`;
    const headRx = t > 0.9 ? 10 : 11;
    const head = `<ellipse cx="${hx}" cy="${hy}" rx="${headRx}" ry="13" fill="${skin}"/>`;
    const hairCap = back
      ? `<ellipse cx="${hx}" cy="${hy - 1}" rx="${headRx + 1}" ry="14" fill="${hair}"/>`
      : `<path d="M${hx - headRx - 1} ${hy + 2} A${headRx + 1} 15 0 0 1 ${hx + headRx + 1} ${hy + 2} Q${hx} ${hy - 9} ${hx - headRx - 1} ${hy + 2}Z" fill="${hair}"/>`;
    const tail = hk === "long" ? `<rect x="${hx - headRx - 1}" y="${hy}" width="${(headRx + 1) * 2}" height="${back ? 34 : 24}" rx="5" fill="${hair}" opacity="${back ? 1 : 0.9}"/>` : "";
    const bun = hk === "bun" ? `<circle cx="${hx}" cy="${hy - 15}" r="6" fill="${hair}"/>` : "";
    const cover = hk === "cover" || hood ? `<path d="M${hx - headRx - 3} ${hy + 18} Q${hx - headRx - 4} ${hy - 16} ${hx} ${hy - 16} Q${hx + headRx + 4} ${hy - 16} ${hx + headRx + 3} ${hy + 18} Q${hx} ${hy + 8} ${hx - headRx - 3} ${hy + 18}Z" fill="${hood ? c0 : c2}" opacity=".95"/>` : "";
    const face = back ? "" : t > 0.9
      ? `<circle cx="${hx - 6}" cy="${hy + 1}" r="1.3" fill="#2a2226"/><path d="M${hx - 10} ${hy + 4} L${hx - 13} ${hy + 8} L${hx - 10} ${hy + 8}" fill="${skin}" stroke="#2a2226" stroke-width=".6"/>`
      : t > 0.2
        ? `<circle cx="${hx - 7}" cy="${hy + 1}" r="1.3" fill="#2a2226"/><circle cx="${hx + 2}" cy="${hy + 1}" r="1.3" fill="#2a2226"/><path d="M${hx - 5} ${hy + 8} L${hx + 1} ${hy + 8}" stroke="#2a2226" stroke-width="1"/>`
        : `<circle cx="${hx - 4.5}" cy="${hy + 1}" r="1.3" fill="#2a2226"/><circle cx="${hx + 4.5}" cy="${hy + 1}" r="1.3" fill="#2a2226"/><path d="M${hx - 3} ${hy + 8} L${hx + 3} ${hy + 8}" stroke="#2a2226" stroke-width="1"/>`;
    let prop = "";
    if (!back) {
      if (test(/sổ|ledger|book/i, props)) prop = `<rect x="${cx - 8 + t * 6}" y="${top + 50}" width="16" height="13" rx="1.5" fill="${c2}" stroke="#1a1719" stroke-width=".8"/><path d="M${cx - 8 + t * 6} ${top + 56} h16" stroke="#1a1719" stroke-width=".6"/>`;
      else if (test(/đèn|lantern|lamp/i, props)) prop = `<path d="M${cx + half + 3 - t * 8} ${top + 90} v-6" stroke="${c2}" stroke-width="1.2"/><rect x="${cx + half - 1 - t * 8}" y="${top + 94}" width="9" height="13" rx="2" fill="${c2}"/><rect x="${cx + half + 1 - t * 8}" y="${top + 97}" width="5" height="7" rx="1" fill="#fff6d6" opacity=".9"/>`;
      else if (test(/trà|tea|ấm/i, props)) prop = `<rect x="${cx + half - 2 - t * 8}" y="${top + 94}" width="10" height="8" rx="3" fill="${c2}"/><path d="M${cx + half + 8 - t * 8} ${top + 96} q4 1 0 4" stroke="${c2}" fill="none"/>`;
      else if (test(/trâm|brooch|sun/i, props)) prop = `<circle cx="${cx - 6}" cy="${top + 46}" r="3" fill="${c2}"/>`;
    }
    const shadow = `<ellipse cx="${cx}" cy="190" rx="${26 * w}" ry="3.5" fill="#000" opacity=".16"/>`;
    return `${shadow}${legs}${arms}${torso}${seam}${belt}${prop}${neck}${tail}${head}${hairCap}${bun}${cover}${face}`;
  }

  function sheet(e, o, seed) {
    const labels = ["FRONT", "BACK", "SIDE", "3/4 UPPER"];
    const full = ["front", "back", "side"].map((v, i) => `<g transform="translate(${i * 160 + 22},2) scale(0.95)">${inner(e, o, v, seed + i)}</g>`).join("");
    const upper = `<svg x="480" y="2" width="160" height="190" viewBox="26 8 68 80" preserveAspectRatio="xMidYMid meet">${inner(e, o, "tq", seed + 3)}</svg>`;
    const lines = [160, 320, 480].map((x) => `<path d="M${x} 10 V196" class="cr-sheet-ln"/>`).join("");
    const text = labels.map((t, i) => `<text x="${i * 160 + 80}" y="207" text-anchor="middle" class="cr-sheet-lb">${t}</text>`).join("");
    return `<svg class="cr-sheetsvg" viewBox="0 0 640 212" preserveAspectRatio="xMidYMid meet" data-testid="cr-sheet-art" role="img" aria-label="Design sheet gồm 4 góc nhìn">${lines}${full}${upper}${text}</svg>`;
  }

  CR.sheetArt = (e, o, seed = 0) => sheet(e, o, seed);
  CR.slotThumb = (e, o, slot) => {
    if (slot && slot.src === "upload") return `<img class="cr-img" data-testid="cr-img" src="${esc(slot.url)}" alt="${esc(slot.name || "")}">`;
    if (slot && slot.src === "lib") {
      const a = LB.state.assets.find((x) => x.id === slot.libId);
      return `<div class="cr-img is-lib" data-testid="cr-img" style="background:${esc(a ? a.bg : "var(--canvas-soft)")}"><span class="cr-lib-n">${esc(a ? a.name : "Ảnh thư viện")}</span></div>`;
    }
    return sheet(e, o, slot ? slot.seed % 7 : 0);
  };
})();
