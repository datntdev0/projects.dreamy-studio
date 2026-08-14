/*
 * Knowledgebase conflict checker: deterministic code, no LLM calls.
 * Input is the analysis result (entities, facts, evidence) + ontology.yml; output is a list of issues with a stable key
 * so that "Ignore" can be remembered and issues disappear on their own once the data is fixed.
 */
window.KBC = (function () {
  const NV = window.NV;
  const U = window.NVU;

  const O = () => NV.ontology;
  const K = () => U.N().kb;
  let override = null; // list of draft assumptions when previewing fix results
  const items = () => override || K().items;
  const byId = (id) => items().find((i) => i.id === id);
  const live = (i) => i && i.status !== "rejected";
  const typeLabel = (t) => O().entityTypes[t]?.label || t;
  const attrLabel = (k) => O().attributes[k]?.label || k;

  const plain = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const flat = (s) => String(s).replace(/[“”"]/g, "").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  const nameOf = (it) => (it.kind === "relation" ? `${byId(it.from)?.name ?? "?"} —${it.label}→ ${byId(it.to)?.name ?? "?"}` : it.name);

  /* ---------- rules ---------- */
  const RULES = {
    evidence_quote() {
      const out = [];
      items().filter(live).forEach((it) => {
        if (!it.ev.length) out.push({ ids: [it.id], key: "none", msg: "No evidence is attached to this claim yet.", data: { none: true } });
        it.ev.forEach((e, idx) => {
          const para = U.findPara(e.p);
          const chapter = U.chapter(NV.chOf(e.p));
          if (!chapter?.paras) return; // the prototype has no content for this chapter so it cannot be checked
          if (!para) { out.push({ ids: [it.id], key: `${e.p}|${flat(e.q).slice(0, 40)}`, msg: `Source paragraph ${U.refLabel(e.p)} does not exist.`, data: { idx, p: e.p, q: e.q } }); return; }
          const text = flat(para.t);
          const frags = e.q.split(/…|\.{3}/).map((f) => flat(f)).filter((f) => f.length >= 3);
          if (frags.some((f) => !text.includes(f))) out.push({ ids: [it.id], key: `${e.p}|${flat(e.q).slice(0, 40)}`, msg: `The evidence is not in ${U.refLabel(e.p)}.`, data: { idx, p: e.p, q: e.q, source: para.t } });
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
        if (!live(a) || !live(b)) return; // covered by the dangling_ref rule
        if (!pred) { out.push({ ids: [r.id], key: r.pred || "none", msg: `Predicate “${r.pred || "—"}” is not in the ontology.`, data: {} }); return; }
        if (!pred.domain.includes(a.type) || !pred.range.includes(b.type)) {
          const want = `${pred.domain.map(typeLabel).join("/")} → ${pred.range.map(typeLabel).join("/")}`;
          out.push({ ids: [r.id], key: `${r.pred}|${a.type}|${b.type}`, msg: `“${pred.label}” (${r.pred}) requires ${want}, but is ${typeLabel(a.type)} → ${typeLabel(b.type)}.`, data: { pred: r.pred } });
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
          if (vals.length > 1) out.push({ ids: [e.id], key: k, msg: `“${attrLabel(k)}” may only have one value but has ${vals.length}: ${vals.map((v) => `“${v}”`).join(", ")}.`, data: { k, list } });
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
        out.push({ ids: list.map((r) => r.id), key, msg: `${list.map((r) => byId(r.from).name).join(" and ")} are both “${O().predicates[pred].label}” of ${byId(to).name}, while only one is allowed.`, data: {} });
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
          if (small.length && small.every((t) => big.includes(t))) out.push({ ids: [a.id, b.id], key: `${a.id},${b.id}`, msg: `“${a.name}” and “${b.name}” (both ${typeLabel(a.type).toLowerCase()}) may be the same.`, data: {} });
        }
      }
      return out;
    },

    dangling_ref() {
      const out = [];
      items().filter((i) => i.kind === "relation" && live(i)).forEach((r) => {
        const miss = [["from", byId(r.from)], ["to", byId(r.to)]].filter(([, e]) => !live(e));
        if (miss.length) out.push({ ids: [r.id], key: r.id, msg: `The relation points to an entity that was rejected or no longer exists: ${miss.map(([side]) => (side === "from" ? byId(r.from)?.name || r.from : byId(r.to)?.name || r.to)).join(", ")}.`, data: {} });
      });
      return out;
    },

    source_stale() {
      return items().filter((i) => live(i) && i.stale).map((i) => ({ ids: [i.id], key: i.id, msg: i.stale, data: {} }));
    },
  };

  /** Runs all rules. `open` = not ignored; `ignored` = ignored. */
  function run() {
    const ignored = (K().ignored ||= {});
    const all = [];
    Object.entries(RULES).forEach(([rule, fn]) => {
      fn().forEach((x) => all.push({ ...x, rule, sev: O().rules[rule].severity, id: `${rule}|${x.key}|${x.ids.join(",")}` }));
    });
    all.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "error" ? -1 : 1));
    return { open: all.filter((x) => !ignored[x.id]), ignored: all.filter((x) => ignored[x.id]) };
  }

  /** Runs the checker on a list of draft assumptions without touching the real data. */
  function runOn(list) {
    override = list;
    try { return run(); } finally { override = null; }
  }

  /** Number of open issues per rule, including rules with no issues (= 0). */
  const perRule = (open) => Object.keys(O().rules).map((rule) => ({ rule, ...O().rules[rule], n: open.filter((x) => x.rule === rule).length }));
  const forItem = (id, open) => open.filter((x) => x.ids.includes(id));

  /* ---------- quick fixes ---------- */
  const reject = (id) => { byId(id).status = "rejected"; };
  const dismiss = (issueId) => { (K().ignored ||= {})[issueId] = true; };
  const restore = (issueId) => { delete (K().ignored ||= {})[issueId]; };
  const removeEvidence = (id, idx) => { byId(id).ev.splice(idx, 1); };
  const keepAttr = (id, k, v) => { const e = byId(id); e.attrs = e.attrs.filter((a) => a.k !== k || a.v === v); };

  /** Merge `drop` into `keep`: move relations, merge evidence / attributes, then drop `drop`. */
  function merge(keepId, dropId) {
    const keep = byId(keepId);
    const drop = byId(dropId);
    items().forEach((i) => { if (i.kind === "relation") { if (i.from === dropId) i.from = keepId; if (i.to === dropId) i.to = keepId; } });
    drop.ev.forEach((e) => { if (!keep.ev.some((x) => x.p === e.p && x.q === e.q)) keep.ev.push(e); });
    (drop.attrs || []).forEach((a) => { if (!keep.attrs.some((x) => x.k === a.k && x.v === a.v)) keep.attrs.push(a); });
    if (!keep.summary && drop.summary) keep.summary = drop.summary;
    K().items = items().filter((i) => i.id !== dropId);
    // a relation pointing to itself after the merge is dropped
    K().items = items().filter((i) => !(i.kind === "relation" && i.from === i.to));
    K().log.unshift({ date: window.DSApp.stamp(), text: `Merged “${drop.name}” into “${keep.name}”.` });
  }

  /* ---------- ontology.yml ---------- */
  const q = (v) => (typeof v === "string" && !/^(true|false|null|~|[\d.]+)$/i.test(v) && /^[\w\sÀ-ỹ./()\-]+$/.test(v) ? v : JSON.stringify(v));
  const flow = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map(q).join(", ")}]` : typeof v === "boolean" ? v : q(v)}`).join(", ")} }`;
  function yaml() {
    const o = O();
    const L = [];
    L.push("# ontology.yml — knowledge definition of the novel", "# Used for (1) the analysis prompt sent to the LLM and (2) the deterministic conflict checker in the Review tab.", "");
    L.push(`version: ${o.version}`, `language: ${o.language}`, "");
    L.push("# Entity types", "entity_types:");
    Object.entries(o.entityTypes).forEach(([k, v]) => L.push(`  ${k}: ${flow(v)}`));
    L.push("", "# Entity attributes. single: true = each entity may have only one value", "attributes:");
    Object.entries(o.attributes).forEach(([k, v]) => L.push(`  ${k}: ${flow(v)}`));
    L.push("", "# Relations (facts linking two entities). domain / range = entity types allowed at the two ends", "predicates:");
    Object.entries(o.predicates).forEach(([k, v]) => L.push(`  ${k}: ${flow({ label: v.label, domain: v.domain, range: v.range, ...(v.uniqueRange ? { unique_range: true } : {}) })}`));
    L.push("", "# Events (facts with a point in time)", "event:", `  fields: [${o.event.fields.join(", ")}]`);
    L.push("", "# Origin of a claim: stated in the text / character’s words / AI inference", `certainty: [${o.certainty.join(", ")}]`);
    L.push("", "# Conflict check rules (run by code, no LLM)", "rules:");
    Object.entries(o.rules).forEach(([k, v]) => L.push(`  ${k}:`, `    severity: ${v.severity}`, `    label: ${q(v.label)}`, `    check: ${q(v.desc)}`));
    return L.join("\n");
  }

  return { RULES, run, runOn, perRule, forItem, byId, nameOf, typeLabel, attrLabel, reject, dismiss, restore, removeEvidence, keepAttr, merge, yaml };
})();
