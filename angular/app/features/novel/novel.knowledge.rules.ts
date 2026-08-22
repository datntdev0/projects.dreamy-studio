import { LanguageKey, LanguageParams } from "@app/core/language/language.models";
import { ChapterRow } from "./novel.models";
import { AnalyzeRequest, AnalyzeSummary, AnalyzedChapter, GraphLink, KnowledgeEntity, KnowledgeFact, KnowledgeIssue, KnowledgeItem, KnowledgeLang, KnowledgeVisibility, KnowledgeView, NovelKnowledge, RuleCount, RuleId } from "./novel.knowledge.models";
import { BATCH_SIZE, Ontology, PERSONA_PREDICATE } from "./novel.knowledge.ontology";

export type Translate = (key: LanguageKey, params?: LanguageParams) => string;

interface RawIssue {
  ids: string[];
  key: string;
  message: string;
  values?: string[];
}

interface CheckContext {
  ontology: Ontology;
  items: KnowledgeItem[];
  map: Map<string, KnowledgeItem>;
  t: Translate;
}

export const EMPTY_KNOWLEDGE: NovelKnowledge = { lang: "src", items: [], analyzed: {} };

export function emptyView(lang: KnowledgeLang): KnowledgeView {
  return { lang, tab: "graph", q: "", type: "all", chapter: 0, onlyIssues: false, sel: null, rule: "all", spoiler: false, upTo: 1 };
}

export function isEntity(item: KnowledgeItem): item is KnowledgeEntity {
  return item.kind === "entity";
}

export function isFact(item: KnowledgeItem): item is KnowledgeFact {
  return item.kind === "fact";
}

export function entitiesOf(items: KnowledgeItem[]): KnowledgeEntity[] {
  const out: KnowledgeEntity[] = [];
  for (const item of items) {
    if (isEntity(item)) {
      out.push(item);
    }
  }
  return out;
}

export function factsOf(items: KnowledgeItem[]): KnowledgeFact[] {
  const out: KnowledgeFact[] = [];
  for (const item of items) {
    if (isFact(item)) {
      out.push(item);
    }
  }
  return out;
}

export function mapOf(items: KnowledgeItem[]): Map<string, KnowledgeItem> {
  const map = new Map<string, KnowledgeItem>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

export function entityIn(map: Map<string, KnowledgeItem>, id: string | null): KnowledgeEntity | undefined {
  const item = id === null ? undefined : map.get(id);
  return item && isEntity(item) ? item : undefined;
}

const liveEntity = entityIn;

export function chapterOf(item: KnowledgeItem): number {
  let first = 0;
  for (const evidence of item.ev) {
    if (first === 0 || evidence.chapter < first) {
      first = evidence.chapter;
    }
  }
  return first;
}

export function chaptersOfItem(item: KnowledgeItem): number[] {
  const seen = new Set<number>();
  for (const evidence of item.ev) {
    seen.add(evidence.chapter);
  }
  return [...seen].sort((a, b) => a - b);
}

export function predicateLabel(ontology: Ontology, pred: string, t: Translate): string {
  const def = ontology.predicateDef(pred);
  return def ? t(def.labelKey) : pred;
}

export function typeLabel(ontology: Ontology, type: string, t: Translate): string {
  const def = ontology.typeDef(type);
  return def ? t(def.labelKey) : type;
}

export function nameOf(map: Map<string, KnowledgeItem>, id: string | null): string {
  const entity = entityIn(map, id);
  return entity ? entity.name || "—" : "?";
}

export function factText(ontology: Ontology, map: Map<string, KnowledgeItem>, fact: KnowledgeFact, t: Translate): string {
  const tail = fact.object === null ? `: ${fact.ev[0]?.q ?? ""}` : ` → ${nameOf(map, fact.object)}`;
  return `${nameOf(map, fact.subject)} — ${predicateLabel(ontology, fact.pred, t)}${tail}`;
}

export function itemText(ontology: Ontology, map: Map<string, KnowledgeItem>, item: KnowledgeItem, t: Translate): string {
  return isEntity(item) ? item.name : factText(ontology, map, item, t);
}

export function factsAbout(items: KnowledgeItem[], entityId: string): KnowledgeFact[] {
  const out: KnowledgeFact[] = [];
  for (const fact of factsOf(items)) {
    if (fact.subject === entityId || fact.object === entityId) {
      out.push(fact);
    }
  }
  return out;
}

export function personasOf(items: KnowledgeItem[], characterId: string): KnowledgeEntity[] {
  const map = mapOf(items);
  const out: KnowledgeEntity[] = [];
  for (const fact of factsOf(items)) {
    const persona = liveEntity(map, fact.subject);
    if (fact.pred === PERSONA_PREDICATE && fact.object === characterId && persona) {
      out.push(persona);
    }
  }
  return out;
}

export function characterOf(items: KnowledgeItem[], personaId: string): KnowledgeEntity | undefined {
  const map = mapOf(items);
  for (const fact of factsOf(items)) {
    if (fact.pred === PERSONA_PREDICATE && fact.subject === personaId) {
      return liveEntity(map, fact.object);
    }
  }
  return undefined;
}

function liveFacts(ctx: CheckContext): KnowledgeFact[] {
  return factsOf(ctx.items);
}

function liveEntities(ctx: CheckContext): KnowledgeEntity[] {
  return entitiesOf(ctx.items);
}

function checkCharacterPredicate(ctx: CheckContext): RawIssue[] {
  const out: RawIssue[] = [];
  for (const fact of liveFacts(ctx)) {
    const subject = liveEntity(ctx.map, fact.subject);
    const object = liveEntity(ctx.map, fact.object);
    const character = subject?.type === "character" ? subject : object?.type === "character" ? object : undefined;
    if (fact.pred === PERSONA_PREDICATE || !character) {
      continue;
    }
    const personas = personasOf(ctx.items, character.id).map((persona) => persona.id);
    out.push({ ids: [fact.id], key: fact.id, message: ctx.t("novel.knowledge.check.character_predicate", { character: character.name, pred: predicateLabel(ctx.ontology, fact.pred, ctx.t) }), values: personas });
  }
  return out;
}

function checkPersonaLink(ctx: CheckContext): RawIssue[] {
  const out: RawIssue[] = [];
  for (const persona of liveEntities(ctx)) {
    if (persona.type !== "persona") {
      continue;
    }
    const links: KnowledgeFact[] = [];
    for (const fact of liveFacts(ctx)) {
      if (fact.pred === PERSONA_PREDICATE && fact.subject === persona.id && liveEntity(ctx.map, fact.object)?.type === "character") {
        links.push(fact);
      }
    }
    if (links.length === 0) {
      out.push({ ids: [persona.id], key: `none|${persona.id}`, message: ctx.t("novel.knowledge.check.persona_none", { persona: persona.name }) });
    }
    if (links.length > 1) {
      const names = links.map((link) => nameOf(ctx.map, link.object)).join(", ");
      out.push({ ids: [persona.id, ...links.map((link) => link.id)], key: `many|${persona.id}`, message: ctx.t("novel.knowledge.check.persona_many", { persona: persona.name, characters: names }) });
    }
  }
  return out;
}

function typesText(ontology: Ontology, types: string[], t: Translate): string {
  return types.map((type) => typeLabel(ontology, type, t)).join(" / ");
}

function checkSignature(ctx: CheckContext): RawIssue[] {
  const out: RawIssue[] = [];
  for (const fact of liveFacts(ctx)) {
    const def = ctx.ontology.predicateDef(fact.pred);
    const subject = liveEntity(ctx.map, fact.subject);
    const object = liveEntity(ctx.map, fact.object);
    if (!subject || (fact.object !== null && !object)) {
      continue;
    }
    if (!def) {
      out.push({ ids: [fact.id], key: `unknown|${fact.pred}|${fact.id}`, message: ctx.t("novel.knowledge.check.unknown_predicate", { pred: fact.pred }) });
      continue;
    }
    const involvesCharacter = subject.type === "character" || object?.type === "character";
    if (involvesCharacter && fact.pred !== PERSONA_PREDICATE) {
      continue;
    }
    const badDomain = !def.domain.includes(subject.type);
    const badRange = def.kind === "relationship" && (!object || !def.range.includes(object.type));
    if (badDomain || badRange) {
      const want = def.kind === "relationship" ? `${typesText(ctx.ontology, def.domain, ctx.t)} → ${typesText(ctx.ontology, def.range, ctx.t)}` : typesText(ctx.ontology, def.domain, ctx.t);
      const have = def.kind === "relationship" ? `${typeLabel(ctx.ontology, subject.type, ctx.t)} → ${object ? typeLabel(ctx.ontology, object.type, ctx.t) : "?"}` : typeLabel(ctx.ontology, subject.type, ctx.t);
      out.push({ ids: [fact.id], key: `${fact.pred}|${subject.type}|${object?.type ?? ""}`, message: ctx.t("novel.knowledge.check.signature", { pred: predicateLabel(ctx.ontology, fact.pred, ctx.t), want, have }) });
    }
  }
  return out;
}

function checkDangling(ctx: CheckContext): RawIssue[] {
  const out: RawIssue[] = [];
  for (const fact of liveFacts(ctx)) {
    const missing: string[] = [];
    if (!liveEntity(ctx.map, fact.subject)) {
      missing.push(nameOf(ctx.map, fact.subject));
    }
    if (fact.object !== null && !liveEntity(ctx.map, fact.object)) {
      missing.push(nameOf(ctx.map, fact.object));
    }
    if (missing.length > 0) {
      out.push({ ids: [fact.id], key: fact.id, message: ctx.t("novel.knowledge.check.dangling", { names: missing.join(", ") }) });
    }
  }
  return out;
}

function groupBy(facts: KnowledgeFact[], keyOf: (fact: KnowledgeFact) => string): Map<string, KnowledgeFact[]> {
  const groups = new Map<string, KnowledgeFact[]>();
  for (const fact of facts) {
    const key = keyOf(fact);
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return groups;
}

function predObjectKey(fact: KnowledgeFact): string {
  return `${fact.pred}|${fact.object}`;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

function checkRelationUnique(ctx: CheckContext): RawIssue[] {
  const out: RawIssue[] = [];
  const relations = liveFacts(ctx).filter((fact) => fact.object !== null && ctx.ontology.predicateDef(fact.pred)?.limit && liveEntity(ctx.map, fact.subject) && liveEntity(ctx.map, fact.object));
  for (const [key, group] of groupBy(relations, predObjectKey)) {
    const subjects = distinct(group.map((fact) => fact.subject));
    if (subjects.length > 1) {
      const names = subjects.map((id) => nameOf(ctx.map, id)).join(", ");
      out.push({ ids: group.map((fact) => fact.id), key, message: ctx.t("novel.knowledge.check.relation_unique", { names, pred: predicateLabel(ctx.ontology, group[0].pred, ctx.t), object: nameOf(ctx.map, group[0].object) }) });
    }
  }
  return out;
}

export function tokensOf(name: string): string[] {
  const plain = name.normalize("NFD").replace(/\p{M}/gu, "").replaceAll("đ", "d").replaceAll("Đ", "D").toLowerCase();
  return plain.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function isSubset(a: string[], b: string[]): boolean {
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  return small.length > 0 && small.every((token) => big.includes(token));
}

function checkDuplicate(ctx: CheckContext): RawIssue[] {
  const out: RawIssue[] = [];
  const entities = liveEntities(ctx);
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      const a = entities[i];
      const b = entities[j];
      if (a.type === b.type && isSubset(tokensOf(a.name), tokensOf(b.name))) {
        out.push({ ids: [a.id, b.id], key: `${a.id},${b.id}`, message: ctx.t("novel.knowledge.check.duplicate", { a: a.name, b: b.name, type: typeLabel(ctx.ontology, a.type, ctx.t).toLowerCase() }) });
      }
    }
  }
  return out;
}

function checkEvidence(ctx: CheckContext): RawIssue[] {
  const out: RawIssue[] = [];
  for (const item of ctx.items) {
    const label = itemText(ctx.ontology, ctx.map, item, ctx.t);
    if (item.ev.length === 0) {
      out.push({ ids: [item.id], key: `${item.id}|none`, message: ctx.t("novel.knowledge.check.evidence_none", { item: label }) });
    } else if (item.ev.some((evidence) => !evidence.verified)) {
      out.push({ ids: [item.id], key: `${item.id}|quote`, message: ctx.t("novel.knowledge.check.evidence_quote", { item: label }) });
    }
  }
  return out;
}

function checkStale(ctx: CheckContext): RawIssue[] {
  const out: RawIssue[] = [];
  for (const item of ctx.items) {
    if (item.stale.length > 0) {
      out.push({ ids: [item.id], key: item.id, message: ctx.t("novel.knowledge.check.stale", { chapters: item.stale.join(", ") }) });
    }
  }
  return out;
}

const CHECKS: Record<RuleId, (ctx: CheckContext) => RawIssue[]> = {
  character_predicate: checkCharacterPredicate,
  persona_link: checkPersonaLink,
  relation_signature: checkSignature,
  dangling_ref: checkDangling,
  relation_unique: checkRelationUnique,
  entity_duplicate: checkDuplicate,
  evidence: checkEvidence,
  source_stale: checkStale,
};

export function checkKnowledge(ontology: Ontology, items: KnowledgeItem[], t: Translate): KnowledgeIssue[] {
  const ctx: CheckContext = { ontology, items, map: mapOf(items), t };
  const out: KnowledgeIssue[] = [];
  for (const rule of ontology.rules) {
    for (const raw of CHECKS[rule.id](ctx)) {
      out.push({ id: `${rule.id}|${raw.key}|${raw.ids.join(",")}`, rule: rule.id, sev: rule.severity, ids: raw.ids, message: raw.message, values: raw.values ?? [] });
    }
  }
  return out;
}

export function ruleCounts(ontology: Ontology, open: KnowledgeIssue[]): RuleCount[] {
  return ontology.rules.map((rule) => ({ rule, count: open.filter((issue) => issue.rule === rule.id).length }));
}

export function issuesOfItem(open: KnowledgeIssue[], id: string): KnowledgeIssue[] {
  return open.filter((issue) => issue.ids.includes(id));
}

export function errorCount(open: KnowledgeIssue[]): number {
  return open.filter((issue) => issue.sev === "error").length;
}

export function flaggedIds(items: KnowledgeItem[], open: KnowledgeIssue[]): Set<string> {
  const map = mapOf(items);
  const out = new Set<string>();
  for (const issue of open) {
    for (const id of issue.ids) {
      out.add(id);
      const item = map.get(id);
      if (item && isFact(item)) {
        out.add(item.subject);
        if (item.object !== null) {
          out.add(item.object);
        }
      }
    }
  }
  return out;
}

export function matchesList(entity: KnowledgeEntity, view: KnowledgeView, flagged: Set<string>): boolean {
  const needle = view.q.trim().toLowerCase();
  return (view.type === "all" || entity.type === view.type)
    && (view.chapter === 0 || chaptersOfItem(entity).includes(view.chapter))
    && (!view.onlyIssues || flagged.has(entity.id))
    && (!needle || [entity.name, ...entity.titles, ...entity.aliases].some((text) => text.toLowerCase().includes(needle)));
}

export function graphLinks(items: KnowledgeItem[], label: (pred: string) => string): GraphLink[] {
  const map = mapOf(items);
  const out: GraphLink[] = [];
  for (const fact of factsOf(items)) {
    if (fact.object !== null && liveEntity(map, fact.subject) && liveEntity(map, fact.object) && fact.subject !== fact.object) {
      out.push({ source: fact.subject, target: fact.object, label: label(fact.pred) });
    }
  }
  return out;
}

export function visibilityOf(items: KnowledgeItem[], upTo: number | null): KnowledgeVisibility {
  const shown = (item: KnowledgeItem): boolean => upTo === null || chapterOf(item) <= upTo;
  const entities = entitiesOf(items).filter(shown);
  const ids = new Set(entities.map((entity) => entity.id));
  const facts = factsOf(items).filter((fact) => shown(fact) && ids.has(fact.subject) && (fact.object === null || ids.has(fact.object)));
  const visible = [...entities, ...facts];
  return { items: visible, entities: entities.length, facts: facts.length, hiddenEntities: entitiesOf(items).length - entities.length, hiddenFacts: factsOf(items).length - facts.length };
}

export function batchesOf(seqs: number[], size: number = BATCH_SIZE): number[][] {
  const sorted = [...seqs].sort((a, b) => a - b);
  const out: number[][] = [];
  for (let start = 0; start < sorted.length; start += size) {
    out.push(sorted.slice(start, start + size));
  }
  return out;
}

export function planAnalysis(chapters: ChapterRow[], analyzed: Record<number, AnalyzedChapter>, request: AnalyzeRequest, available: Set<number>): AnalyzeSummary {
  const all = chapters.map((chapter) => chapter.seq);
  const inRange = request.mode === "range" ? all.filter((seq) => seq >= request.from && seq <= request.to) : all;
  const overwrite = request.mode !== "missing" && request.overwrite;
  const wanted = overwrite ? inRange : inRange.filter((seq) => analyzed[seq] === undefined);
  const run = wanted.filter((seq) => available.has(seq));
  return {
    run,
    keep: inRange.filter((seq) => !wanted.includes(seq)),
    overwrite: run.filter((seq) => analyzed[seq] !== undefined),
    noSource: wanted.filter((seq) => !available.has(seq)),
    missing: all.filter((seq) => analyzed[seq] === undefined),
    batches: batchesOf(run),
  };
}

