/*
 * Bộ kiểm tra xung đột của Knowledgebase: code tất định, không gọi LLM.
 * Đầu vào là kết quả phân tích (entity, fact, dẫn chứng) + ontology.yml; đầu ra là danh sách vấn đề có khóa ổn định
 * để "Bỏ qua" nhớ được và để vấn đề tự biến mất khi dữ liệu đã được sửa.
 */
window.KBC = (function () {
  const NV = window.NV;
  const U = window.NVU;

  const O = () => NV.ontology;
  const K = () => U.N().kb;
  let override = null; // danh sách giả định (draft) khi xem trước kết quả sửa
  const items = () => override || K().items;
  const byId = (id) => items().find((i) => i.id === id);
  const live = (i) => i && i.status !== "rejected";
  const typeLabel = (t) => O().entityTypes[t]?.label || t;
  const attrLabel = (k) => O().attributes[k]?.label || k;

  const plain = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const flat = (s) => String(s).replace(/[“”"]/g, "").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  const nameOf = (it) => (it.kind === "relation" ? `${byId(it.from)?.name ?? "?"} —${it.label}→ ${byId(it.to)?.name ?? "?"}` : it.name);

  /* ---------- các quy tắc ---------- */
  const RULES = {
    evidence_quote() {
      const out = [];
      items().filter(live).forEach((it) => {
        if (!it.ev.length) out.push({ ids: [it.id], key: "none", msg: "Chưa có dẫn chứng nào gắn với nhận định này.", data: { none: true } });
        it.ev.forEach((e, idx) => {
          const para = U.findPara(e.p);
          const chapter = U.chapter(NV.chOf(e.p));
          if (!chapter?.paras) return; // prototype không có nội dung chương này nên không kiểm được
          if (!para) { out.push({ ids: [it.id], key: `${e.p}|${flat(e.q).slice(0, 40)}`, msg: `Đoạn nguồn ${U.refLabel(e.p)} không tồn tại.`, data: { idx, p: e.p, q: e.q } }); return; }
          const text = flat(para.t);
          const frags = e.q.split(/…|\.{3}/).map((f) => flat(f)).filter((f) => f.length >= 3);
          if (frags.some((f) => !text.includes(f))) out.push({ ids: [it.id], key: `${e.p}|${flat(e.q).slice(0, 40)}`, msg: `Dẫn chứng không có trong ${U.refLabel(e.p)}.`, data: { idx, p: e.p, q: e.q, source: para.t } });
        });
      });
      return out;
    },

    relation_signature() {
      const out = [];
      items().filter((i) => i.kind === "relation" && live(i)).forEach((r) => {
        const pred = O().predicates[r.pred];
        const a = byId(r.from);
        const b = byId(r.to);
        if (!live(a) || !live(b)) return; // thuộc quy tắc dangling_ref
        if (!pred) { out.push({ ids: [r.id], key: r.pred || "none", msg: `Predicate “${r.pred || "—"}” không có trong ontology.`, data: {} }); return; }
        if (!pred.domain.includes(a.type) || !pred.range.includes(b.type)) {
          const want = `${pred.domain.map(typeLabel).join("/")} → ${pred.range.map(typeLabel).join("/")}`;
          out.push({ ids: [r.id], key: `${r.pred}|${a.type}|${b.type}`, msg: `“${pred.label}” (${r.pred}) yêu cầu ${want}, nhưng đang là ${typeLabel(a.type)} → ${typeLabel(b.type)}.`, data: { pred: r.pred } });
        }
      });
      return out;
    },

    attribute_single() {
      const out = [];
      items().filter((i) => i.kind === "entity" && live(i)).forEach((e) => {
        const groups = {};
        (e.attrs || []).forEach((a) => { (groups[a.k] ||= []).push(a); });
        Object.entries(groups).forEach(([k, list]) => {
          if (!O().attributes[k]?.single) return;
          const vals = [...new Set(list.map((a) => a.v))];
          if (vals.length > 1) out.push({ ids: [e.id], key: k, msg: `“${attrLabel(k)}” chỉ được có một giá trị nhưng có ${vals.length}: ${vals.map((v) => `“${v}”`).join(", ")}.`, data: { k, list } });
        });
      });
      return out;
    },

    relation_unique() {
      const out = [];
      const groups = {};
      items().filter((i) => i.kind === "relation" && live(i) && O().predicates[i.pred]?.uniqueRange && live(byId(i.from)) && live(byId(i.to))).forEach((r) => { (groups[`${r.pred}|${r.to}`] ||= []).push(r); });
      Object.entries(groups).forEach(([key, list]) => {
        if (new Set(list.map((r) => r.from)).size < 2) return;
        const [pred, to] = key.split("|");
        out.push({ ids: list.map((r) => r.id), key, msg: `${list.map((r) => byId(r.from).name).join(" và ")} cùng là “${O().predicates[pred].label}” của ${byId(to).name}, trong khi chỉ được một.`, data: {} });
      });
      return out;
    },

    entity_duplicate() {
      const out = [];
      const ents = items().filter((i) => i.kind === "entity" && live(i));
      for (let i = 0; i < ents.length; i++) {
        for (let j = i + 1; j < ents.length; j++) {
          const a = ents[i];
          const b = ents[j];
          if (a.type !== b.type) continue;
          const ta = plain(a.name).split(" ").filter(Boolean);
          const tb = plain(b.name).split(" ").filter(Boolean);
          const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
          if (small.length && small.every((t) => big.includes(t))) out.push({ ids: [a.id, b.id], key: `${a.id},${b.id}`, msg: `“${a.name}” và “${b.name}” (cùng là ${typeLabel(a.type).toLowerCase()}) có thể là một.`, data: {} });
        }
      }
      return out;
    },

    dangling_ref() {
      const out = [];
      items().filter((i) => i.kind === "relation" && live(i)).forEach((r) => {
        const miss = [["from", byId(r.from)], ["to", byId(r.to)]].filter(([, e]) => !live(e));
        if (miss.length) out.push({ ids: [r.id], key: r.id, msg: `Quan hệ trỏ tới entity đã bị từ chối hoặc không còn: ${miss.map(([side]) => (side === "from" ? byId(r.from)?.name || r.from : byId(r.to)?.name || r.to)).join(", ")}.`, data: {} });
      });
      return out;
    },

    source_stale() {
      return items().filter((i) => live(i) && i.stale).map((i) => ({ ids: [i.id], key: i.id, msg: i.stale, data: {} }));
    },
  };

  /** Chạy toàn bộ quy tắc. `open` = chưa bị bỏ qua; `ignored` = đã bỏ qua. */
  function run() {
    const ignored = (K().ignored ||= {});
    const all = [];
    Object.entries(RULES).forEach(([rule, fn]) => {
      fn().forEach((x) => all.push({ ...x, rule, sev: O().rules[rule].severity, id: `${rule}|${x.key}|${x.ids.join(",")}` }));
    });
    all.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "error" ? -1 : 1));
    return { open: all.filter((x) => !ignored[x.id]), ignored: all.filter((x) => ignored[x.id]) };
  }

  /** Chạy bộ kiểm tra trên một danh sách giả định mà không đụng dữ liệu thật. */
  function runOn(list) {
    override = list;
    try { return run(); } finally { override = null; }
  }

  /** Số vấn đề đang mở theo quy tắc, kể cả quy tắc không có vấn đề (= 0). */
  const perRule = (open) => Object.keys(O().rules).map((rule) => ({ rule, ...O().rules[rule], n: open.filter((x) => x.rule === rule).length }));
  const forItem = (id, open) => open.filter((x) => x.ids.includes(id));

  /* ---------- sửa nhanh ---------- */
  const reject = (id) => { byId(id).status = "rejected"; };
  const dismiss = (issueId) => { (K().ignored ||= {})[issueId] = true; };
  const restore = (issueId) => { delete (K().ignored ||= {})[issueId]; };
  const removeEvidence = (id, idx) => { byId(id).ev.splice(idx, 1); };
  const keepAttr = (id, k, v) => { const e = byId(id); e.attrs = e.attrs.filter((a) => a.k !== k || a.v === v); };

  /** Gộp `drop` vào `keep`: chuyển quan hệ, hợp nhất dẫn chứng / thuộc tính, rồi bỏ `drop`. */
  function merge(keepId, dropId) {
    const keep = byId(keepId);
    const drop = byId(dropId);
    items().forEach((i) => { if (i.kind === "relation") { if (i.from === dropId) i.from = keepId; if (i.to === dropId) i.to = keepId; } });
    drop.ev.forEach((e) => { if (!keep.ev.some((x) => x.p === e.p && x.q === e.q)) keep.ev.push(e); });
    (drop.attrs || []).forEach((a) => { if (!keep.attrs.some((x) => x.k === a.k && x.v === a.v)) keep.attrs.push(a); });
    if (!keep.summary && drop.summary) keep.summary = drop.summary;
    K().items = items().filter((i) => i.id !== dropId);
    // quan hệ tự trỏ vào chính nó sau khi gộp thì bỏ
    K().items = items().filter((i) => !(i.kind === "relation" && i.from === i.to));
    K().log.unshift({ date: window.DSApp.stamp(), text: `Gộp “${drop.name}” vào “${keep.name}”.` });
  }

  /* ---------- ontology.yml ---------- */
  const q = (v) => (typeof v === "string" && !/^(true|false|null|~|[\d.]+)$/i.test(v) && /^[\w\sÀ-ỹ./()\-]+$/.test(v) ? v : JSON.stringify(v));
  const flow = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map(q).join(", ")}]` : typeof v === "boolean" ? v : q(v)}`).join(", ")} }`;
  function yaml() {
    const o = O();
    const L = [];
    L.push("# ontology.yml — định nghĩa tri thức của novel", "# Dùng cho (1) prompt phân tích gửi tới LLM và (2) bộ kiểm tra xung đột tất định ở tab Review.", "");
    L.push(`version: ${o.version}`, `language: ${o.language}`, "");
    L.push("# Loại entity", "entity_types:");
    Object.entries(o.entityTypes).forEach(([k, v]) => L.push(`  ${k}: ${flow(v)}`));
    L.push("", "# Thuộc tính của entity. single: true = mỗi entity chỉ được một giá trị", "attributes:");
    Object.entries(o.attributes).forEach(([k, v]) => L.push(`  ${k}: ${flow(v)}`));
    L.push("", "# Quan hệ (fact nối hai entity). domain / range = loại entity được phép ở hai đầu", "predicates:");
    Object.entries(o.predicates).forEach(([k, v]) => L.push(`  ${k}: ${flow({ label: v.label, domain: v.domain, range: v.range, ...(v.uniqueRange ? { unique_range: true } : {}) })}`));
    L.push("", "# Sự kiện (fact có thời điểm)", "event:", `  fields: [${o.event.fields.join(", ")}]`);
    L.push("", "# Nguồn gốc của nhận định: văn bản xác nhận / lời nhân vật / AI suy luận", `certainty: [${o.certainty.join(", ")}]`);
    L.push("", "# Quy tắc kiểm tra xung đột (chạy bằng code, không dùng LLM)", "rules:");
    Object.entries(o.rules).forEach(([k, v]) => L.push(`  ${k}:`, `    severity: ${v.severity}`, `    label: ${q(v.label)}`, `    check: ${q(v.desc)}`));
    return L.join("\n");
  }

  return { RULES, run, runOn, perRule, forItem, byId, nameOf, typeLabel, attrLabel, reject, dismiss, restore, removeEvidence, keepAttr, merge, yaml };
})();
