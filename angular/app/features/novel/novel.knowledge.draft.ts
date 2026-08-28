import { LanguageKey } from "@app/core/language/language.models";
import { DraftPreview, EntityType, EvidenceRef, ItemState, KnowledgeEdit, KnowledgeEntity, KnowledgeEvidence, KnowledgeFact, KnowledgeIssue, KnowledgeItem } from "./novel.knowledge.models";
import { Ontology, PERSONA_PREDICATE } from "./novel.knowledge.ontology";
import { Translate, checkKnowledge, entitiesOf, factText, factsOf, isEntity, isFact, mapOf } from "./novel.knowledge.rules";

type EntityEdit = Extract<KnowledgeEdit, { k: "add_entity" }>;
type FactEdit = Extract<KnowledgeEdit, { k: "add_fact" }>;
type CreateEdit = EntityEdit | FactEdit;
type ItemEdit = Exclude<KnowledgeEdit, { k: "add_entity" | "add_fact" | "merge" | "character" | "del" }>;

export interface ItemDraftPatch {
  name?: string;
  type?: EntityType;
  pred?: string;
  subject?: string;
  object?: string | null;
  titles?: string[];
  aliases?: string[];
  evidenceAdd?: EvidenceRef[];
  evidenceRemove?: EvidenceRef[];
}

const REF_PREFIX = "new";
const ITEM_KINDS: KnowledgeEdit["k"][] = ["rename", "retype", "props", "fact", "evidence"];

const FIELD_KEYS: Record<string, LanguageKey> = {
  name: "novel.knowledge.edit.field.name",
  type: "novel.knowledge.edit.field.type",
  titles: "novel.knowledge.edit.field.titles",
  aliases: "novel.knowledge.edit.field.aliases",
  ev: "novel.knowledge.edit.field.ev",
  subject: "novel.knowledge.edit.field.subject",
  object: "novel.knowledge.edit.field.object",
  pred: "novel.knowledge.edit.field.pred",
};

export function cloneItem<T extends KnowledgeItem>(item: T): T {
  return structuredClone(item);
}

function cloneAll(items: KnowledgeItem[]): KnowledgeItem[] {
  return items.map(cloneItem);
}

export function scopeOf(base: KnowledgeItem[], ids: string[]): Set<string> {
  const map = mapOf(base);
  const out = new Set(ids);
  for (const id of ids) {
    const item = map.get(id);
    if (item && isFact(item)) {
      out.add(item.subject);
      if (item.object !== null) {
        out.add(item.object);
      }
    }
    if (item && isEntity(item)) {
      for (const fact of factsOf(base)) {
        if (fact.subject === id || fact.object === id) {
          out.add(fact.id);
        }
      }
    }
  }
  return out;
}

function sameRef(a: EvidenceRef, b: EvidenceRef): boolean {
  return a.chapter === b.chapter && a.p === b.p && a.q === b.q;
}

function hasRef(list: EvidenceRef[], ref: EvidenceRef): boolean {
  return list.some((item) => sameRef(item, ref));
}

function withoutRef(list: EvidenceRef[], ref: EvidenceRef): EvidenceRef[] {
  return list.filter((item) => !sameRef(item, ref));
}

function refOf(ref: EvidenceRef): EvidenceRef {
  return { chapter: ref.chapter, p: ref.p, q: ref.q };
}

function evidenceOf(ref: EvidenceRef): KnowledgeEvidence {
  return { ...refOf(ref), verified: true };
}

function refsOf(ev: KnowledgeEvidence[]): EvidenceRef[] {
  return ev.map(refOf);
}

function mergeEvidence(target: KnowledgeItem, source: KnowledgeItem): void {
  for (const evidence of source.ev) {
    if (!hasRef(target.ev, evidence)) {
      target.ev.push(evidence);
    }
  }
}

function mergeNames(target: string[], source: string[]): string[] {
  const out = [...target];
  for (const name of source) {
    if (!out.some((item) => item.trim().toLowerCase() === name.trim().toLowerCase())) {
      out.push(name);
    }
  }
  return out;
}

function sameFact(a: KnowledgeFact, b: KnowledgeFact): boolean {
  return a.pred === b.pred && a.subject === b.subject && a.object === b.object;
}

function tidyFacts(list: KnowledgeItem[]): KnowledgeItem[] {
  const out: KnowledgeItem[] = [];
  const facts: KnowledgeFact[] = [];
  for (const item of list) {
    if (!isFact(item)) {
      out.push(item);
      continue;
    }
    if (item.object !== null && item.object === item.subject) {
      continue;
    }
    const twin = facts.find((fact) => sameFact(fact, item));
    if (twin) {
      mergeEvidence(twin, item);
      continue;
    }
    facts.push(item);
    out.push(item);
  }
  return out;
}

function retarget(list: KnowledgeItem[], from: string, to: string): void {
  for (const item of list) {
    if (isFact(item)) {
      item.subject = item.subject === from ? to : item.subject;
      item.object = item.object === from ? to : item.object;
    }
  }
}

function foldEntity(target: KnowledgeEntity, source: KnowledgeEntity): void {
  target.titles = mergeNames(target.titles, source.titles);
  target.aliases = mergeNames(target.aliases, source.aliases);
}

function applyMerge(list: KnowledgeItem[], edit: Extract<KnowledgeEdit, { k: "merge" }>): KnowledgeItem[] {
  const target = list.find((item) => item.id === edit.target);
  let next = list;
  for (const sourceId of edit.sources) {
    const source = next.find((item) => item.id === sourceId);
    if (!source || !target || sourceId === edit.target) {
      continue;
    }
    mergeEvidence(target, source);
    if (isEntity(source) && isEntity(target)) {
      foldEntity(target, source);
    }
    retarget(next, sourceId, edit.target);
    next = next.filter((item) => item.id !== sourceId);
  }
  return tidyFacts(next);
}

function applyDelete(list: KnowledgeItem[], id: string): KnowledgeItem[] {
  return list.filter((item) => item.id !== id && !(isFact(item) && (item.subject === id || item.object === id)));
}

function applyEntityFields(list: KnowledgeItem[], id: string, fields: Partial<Pick<KnowledgeEntity, "name" | "type" | "titles" | "aliases">>): KnowledgeItem[] {
  const entity = list.find((item) => item.id === id);
  if (entity && isEntity(entity)) {
    Object.assign(entity, structuredClone(fields));
  }
  return list;
}

function applyFact(list: KnowledgeItem[], edit: Extract<KnowledgeEdit, { k: "fact" }>): KnowledgeItem[] {
  const fact = list.find((item) => item.id === edit.id);
  if (!fact || !isFact(fact)) {
    return list;
  }
  fact.pred = edit.pred ?? fact.pred;
  fact.subject = edit.subject ?? fact.subject;
  fact.object = edit.object ?? fact.object;
  return tidyFacts(list);
}

function applyEvidence(list: KnowledgeItem[], edit: Extract<KnowledgeEdit, { k: "evidence" }>): KnowledgeItem[] {
  const item = list.find((entry) => entry.id === edit.id);
  if (!item) {
    return list;
  }
  item.ev = item.ev.filter((evidence) => !hasRef(edit.remove ?? [], evidence));
  for (const ref of edit.add ?? []) {
    if (!hasRef(item.ev, ref)) {
      item.ev.push(evidenceOf(ref));
    }
  }
  return list;
}

function createdEntity(edit: EntityEdit): KnowledgeEntity {
  return { id: edit.ref, kind: "entity", type: edit.type, name: edit.name, titles: [...(edit.titles ?? [])], aliases: [...(edit.aliases ?? [])], ev: edit.ev.map(evidenceOf), stale: [] };
}

function createdFact(edit: FactEdit): KnowledgeFact {
  return { id: edit.ref, kind: "fact", pred: edit.pred, subject: edit.subject, object: edit.object ?? null, ev: edit.ev.map(evidenceOf), stale: [] };
}

function createdItem(edit: CreateEdit): KnowledgeItem {
  return edit.k === "add_entity" ? createdEntity(edit) : createdFact(edit);
}

function hasPersonaLink(list: KnowledgeItem[], id: string): boolean {
  return factsOf(list).some((fact) => fact.pred === PERSONA_PREDICATE && fact.subject === id);
}

function applyCharacter(list: KnowledgeItem[], persona: string): KnowledgeItem[] {
  const source = list.find((item) => item.id === persona);
  if (!source || !isEntity(source) || hasPersonaLink(list, persona)) {
    return list;
  }
  const character: KnowledgeEntity = { id: `${persona}.character`, kind: "entity", type: "character", name: source.name, titles: [], aliases: [], ev: structuredClone(source.ev), stale: [] };
  const link: KnowledgeFact = { id: `${persona}.link`, kind: "fact", pred: PERSONA_PREDICATE, subject: persona, object: character.id, ev: structuredClone(source.ev), stale: [] };
  return [...list, character, link];
}

function applyOne(list: KnowledgeItem[], edit: KnowledgeEdit): KnowledgeItem[] {
  switch (edit.k) {
    case "rename":
      return applyEntityFields(list, edit.id, { name: edit.name });
    case "retype":
      return applyEntityFields(list, edit.id, { type: edit.type });
    case "del":
      return applyDelete(list, edit.id);
    case "merge":
      return applyMerge(list, edit);
    case "fact":
      return applyFact(list, edit);
    case "props":
      return applyEntityFields(list, edit.id, { ...(edit.titles ? { titles: edit.titles } : {}), ...(edit.aliases ? { aliases: edit.aliases } : {}) });
    case "evidence":
      return applyEvidence(list, edit);
    case "add_entity":
      return [...list, createdEntity(edit)];
    case "add_fact":
      return [...list, createdFact(edit)];
    case "character":
      return applyCharacter(list, edit.persona);
  }
}

export function applyEdits(base: KnowledgeItem[], edits: KnowledgeEdit[]): KnowledgeItem[] {
  let list = cloneAll(base);
  for (const edit of edits) {
    list = applyOne(list, edit);
  }
  return list;
}

export function createdOf(edits: KnowledgeEdit[], id: string): CreateEdit | undefined {
  for (const edit of edits) {
    if ((edit.k === "add_entity" || edit.k === "add_fact") && edit.ref === id) {
      return edit;
    }
  }
  return undefined;
}

export function createdItems(edits: KnowledgeEdit[]): KnowledgeItem[] {
  const out: KnowledgeItem[] = [];
  for (const edit of edits) {
    if (edit.k === "add_entity" || edit.k === "add_fact") {
      out.push(createdItem(edit));
    }
  }
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function listOrNone(list: string[] | undefined): string[] | undefined {
  return list && list.length > 0 ? [...list] : undefined;
}

function evidenceAfter(ev: EvidenceRef[], patch: ItemDraftPatch): EvidenceRef[] {
  let out = ev;
  for (const ref of patch.evidenceRemove ?? []) {
    out = withoutRef(out, ref);
  }
  for (const ref of patch.evidenceAdd ?? []) {
    out = hasRef(out, ref) ? out : [...out, refOf(ref)];
  }
  return out;
}

function patchCreatedEntity(made: EntityEdit, patch: ItemDraftPatch): EntityEdit {
  return {
    k: "add_entity",
    ref: made.ref,
    type: patch.type ?? made.type,
    name: patch.name ?? made.name,
    titles: listOrNone(patch.titles ?? made.titles),
    aliases: listOrNone(patch.aliases ?? made.aliases),
    ev: evidenceAfter(made.ev, patch),
  };
}

function patchCreatedFact(made: FactEdit, patch: ItemDraftPatch): FactEdit {
  const object = patch.object === undefined ? made.object : (patch.object ?? undefined);
  return { k: "add_fact", ref: made.ref, pred: patch.pred ?? made.pred, subject: patch.subject ?? made.subject, object, ev: evidenceAfter(made.ev, patch) };
}

function patchCreated(edits: KnowledgeEdit[], made: CreateEdit, patch: ItemDraftPatch): KnowledgeEdit[] {
  const next = made.k === "add_entity" ? patchCreatedEntity(made, patch) : patchCreatedFact(made, patch);
  return edits.map((edit) => (edit === made ? next : edit));
}

function itemEditOf<K extends ItemEdit["k"]>(edits: KnowledgeEdit[], k: K, id: string): Extract<ItemEdit, { k: K }> | undefined {
  return edits.find((edit) => edit.k === k && "id" in edit && edit.id === id) as Extract<ItemEdit, { k: K }> | undefined;
}

function withoutItemEdits(edits: KnowledgeEdit[], id: string): KnowledgeEdit[] {
  return edits.filter((edit) => !(ITEM_KINDS.includes(edit.k) && "id" in edit && edit.id === id));
}

function entityEdits(edits: KnowledgeEdit[], original: KnowledgeEntity, patch: ItemDraftPatch): KnowledgeEdit[] {
  const id = original.id;
  const name = patch.name ?? itemEditOf(edits, "rename", id)?.name ?? original.name;
  const type = patch.type ?? itemEditOf(edits, "retype", id)?.type ?? original.type;
  const props = itemEditOf(edits, "props", id);
  const titles = patch.titles ?? props?.titles ?? original.titles;
  const aliases = patch.aliases ?? props?.aliases ?? original.aliases;
  const out: KnowledgeEdit[] = [];
  if (name !== original.name) {
    out.push({ k: "rename", id, name });
  }
  if (type !== original.type) {
    out.push({ k: "retype", id, type });
  }
  const changedTitles = !sameValue(titles, original.titles);
  const changedAliases = !sameValue(aliases, original.aliases);
  if (changedTitles || changedAliases) {
    out.push({ k: "props", id, ...(changedTitles ? { titles } : {}), ...(changedAliases ? { aliases } : {}) });
  }
  return out;
}

function factEdits(edits: KnowledgeEdit[], original: KnowledgeFact, patch: ItemDraftPatch): KnowledgeEdit[] {
  const id = original.id;
  const prior = itemEditOf(edits, "fact", id);
  const pred = patch.pred ?? prior?.pred ?? original.pred;
  const subject = patch.subject ?? prior?.subject ?? original.subject;
  const object = original.object === null ? null : (patch.object ?? prior?.object ?? original.object);
  const edit: Extract<KnowledgeEdit, { k: "fact" }> = { k: "fact", id };
  if (pred !== original.pred) {
    edit.pred = pred;
  }
  if (subject !== original.subject) {
    edit.subject = subject;
  }
  if (object !== null && object !== original.object) {
    edit.object = object;
  }
  return Object.keys(edit).length > 2 ? [edit] : [];
}

function evidenceEdits(edits: KnowledgeEdit[], original: KnowledgeItem, patch: ItemDraftPatch): KnowledgeEdit[] {
  const prior = itemEditOf(edits, "evidence", original.id);
  let add = prior?.add ?? [];
  let remove = prior?.remove ?? [];
  for (const ref of patch.evidenceRemove ?? []) {
    if (hasRef(add, ref)) {
      add = withoutRef(add, ref);
    } else if (hasRef(original.ev, ref) && !hasRef(remove, ref)) {
      remove = [...remove, refOf(ref)];
    }
  }
  for (const ref of patch.evidenceAdd ?? []) {
    if (hasRef(remove, ref)) {
      remove = withoutRef(remove, ref);
    } else if (!hasRef(original.ev, ref) && !hasRef(add, ref)) {
      add = [...add, refOf(ref)];
    }
  }
  return add.length > 0 || remove.length > 0 ? [{ k: "evidence", id: original.id, ...(add.length > 0 ? { add } : {}), ...(remove.length > 0 ? { remove } : {}) }] : [];
}

export function withPatch(base: KnowledgeItem[], edits: KnowledgeEdit[], id: string, patch: ItemDraftPatch): KnowledgeEdit[] {
  const made = createdOf(edits, id);
  if (made) {
    return patchCreated(edits, made, patch);
  }
  const original = base.find((item) => item.id === id);
  if (!original) {
    return edits;
  }
  const own = isEntity(original) ? entityEdits(edits, original, patch) : factEdits(edits, original, patch);
  return [...withoutItemEdits(edits, id), ...own, ...evidenceEdits(edits, original, patch)];
}

export function withCreated(edits: KnowledgeEdit[], item: KnowledgeItem): KnowledgeEdit[] {
  const ev = refsOf(item.ev);
  if (isEntity(item)) {
    return [...edits, { k: "add_entity", ref: item.id, type: item.type, name: item.name, titles: listOrNone(item.titles), aliases: listOrNone(item.aliases), ev }];
  }
  return [...edits, { k: "add_fact", ref: item.id, pred: item.pred, subject: item.subject, object: item.object ?? undefined, ev }];
}

export function withDelete(edits: KnowledgeEdit[], id: string): KnowledgeEdit[] {
  const made = createdOf(edits, id);
  return made ? edits.filter((edit) => edit !== made) : [...withoutItemEdits(edits, id), { k: "del", id }];
}

export function withoutDelete(edits: KnowledgeEdit[], id: string): KnowledgeEdit[] {
  return edits.filter((edit) => !(edit.k === "del" && edit.id === id));
}

export function itemState(base: KnowledgeItem[], edits: KnowledgeEdit[], current: KnowledgeItem[], id: string): ItemState {
  if (createdOf(edits, id)) {
    return "new";
  }
  const original = base.find((item) => item.id === id);
  const now = current.find((item) => item.id === id);
  if (now && original) {
    return sameValue(now, original) ? "same" : "edited";
  }
  if (now) {
    return "new";
  }
  if (edits.some((edit) => edit.k === "merge" && edit.sources.includes(id) && edit.target !== id)) {
    return "merged";
  }
  return edits.some((edit) => edit.k === "del" && edit.id === id) ? "deleted" : "removed";
}

export function isPresent(state: ItemState): boolean {
  return state !== "deleted" && state !== "merged" && state !== "removed";
}

function factComplete(ontology: Ontology, fact: KnowledgeFact, entities: Set<string>): boolean {
  const kind = ontology.predicateDef(fact.pred)?.kind ?? (fact.object === null ? "scalar" : "relationship");
  const subject = entities.has(fact.subject);
  return kind === "relationship" ? subject && fact.object !== null && entities.has(fact.object) : subject;
}

export function typeRefused(entity: KnowledgeEntity): boolean {
  return entity.type !== "persona" && (entity.titles.length > 0 || entity.aliases.length > 0);
}

function entityComplete(entity: KnowledgeEntity): boolean {
  return entity.name.trim().length > 0 && !typeRefused(entity);
}

export function isIncomplete(ontology: Ontology, current: KnowledgeItem[], scope: Set<string>, edits: KnowledgeEdit[]): boolean {
  const entities = new Set(entitiesOf(current).map((entity) => entity.id));
  const created = new Set(createdItems(edits).map((item) => item.id));
  for (const item of current) {
    if (!scope.has(item.id) && !created.has(item.id)) {
      continue;
    }
    if (created.has(item.id) && item.ev.length === 0) {
      return true;
    }
    if (isEntity(item) ? !entityComplete(item) : !factComplete(ontology, item, entities)) {
      return true;
    }
  }
  return false;
}

export function previewOf(ontology: Ontology, current: KnowledgeItem[], scope: Set<string>, edits: KnowledgeEdit[], issue: KnowledgeIssue | null, baseOpen: KnowledgeIssue[], t: Translate): DraftPreview {
  if (edits.length === 0) {
    return { state: "idle", added: [], fixed: [] };
  }
  if (isIncomplete(ontology, current, scope, edits)) {
    return { state: "invalid", added: [], fixed: [] };
  }
  const after = checkKnowledge(ontology, current, t);
  const afterIds = new Set(after.map((item) => item.id));
  const baseIds = new Set(baseOpen.map((item) => item.id));
  const added = after.filter((item) => !baseIds.has(item.id));
  const fixed = baseOpen.filter((item) => !afterIds.has(item.id) && item.id !== issue?.id);
  const state = issue ? (afterIds.has(issue.id) ? "open" : "resolved") : added.length > 0 ? "warn" : "clean";
  return { state, added, fixed };
}

function nextRef(base: KnowledgeItem[], edits: KnowledgeEdit[]): string {
  const taken = new Set([...base.map((item) => item.id), ...createdItems(edits).map((item) => item.id)]);
  let n = 1;
  while (taken.has(`${REF_PREFIX}${n}`)) {
    n += 1;
  }
  return `${REF_PREFIX}${n}`;
}

function defaultPredicate(ontology: Ontology, scalar: boolean): string {
  const found = ontology.predicates.find((item) => (item.kind === "scalar") === scalar && item.key !== PERSONA_PREDICATE);
  return found?.key ?? "";
}

export function blankEntity(base: KnowledgeItem[], edits: KnowledgeEdit[], type: EntityType): KnowledgeEntity {
  return { id: nextRef(base, edits), kind: "entity", type, name: "", titles: [], aliases: [], ev: [], stale: [] };
}

export function blankFact(ontology: Ontology, base: KnowledgeItem[], edits: KnowledgeEdit[], subject: string, object: string | null): KnowledgeFact {
  return { id: nextRef(base, edits), kind: "fact", pred: defaultPredicate(ontology, object === null), subject, object, ev: [], stale: [] };
}

function nameIn(ontology: Ontology, current: KnowledgeItem[], base: KnowledgeItem[], id: string, t: Translate): string {
  const map = mapOf([...base, ...current]);
  const item = map.get(id);
  return item ? (isEntity(item) ? item.name || "—" : factText(ontology, map, item, t)) : id;
}

function fieldsOf(edit: KnowledgeEdit, t: Translate): string {
  const keys: string[] = [];
  switch (edit.k) {
    case "rename":
      keys.push("name");
      break;
    case "retype":
      keys.push("type");
      break;
    case "fact":
      keys.push(...(["pred", "subject", "object"] as const).filter((key) => edit[key] !== undefined));
      break;
    case "props":
      keys.push(...(["titles", "aliases"] as const).filter((key) => edit[key] !== undefined));
      break;
    case "evidence":
      keys.push("ev");
      break;
  }
  return keys.map((key) => t(FIELD_KEYS[key])).join(", ");
}

function describeEdited(ontology: Ontology, edit: ItemEdit, current: KnowledgeItem[], base: KnowledgeItem[], t: Translate): string {
  return t("novel.knowledge.edit.change.edit", { name: nameIn(ontology, current, base, edit.id, t), fields: fieldsOf(edit, t) });
}

function describeMerge(ontology: Ontology, edit: Extract<KnowledgeEdit, { k: "merge" }>, current: KnowledgeItem[], base: KnowledgeItem[], t: Translate): string {
  const names = edit.sources.filter((id) => id !== edit.target).map((id) => nameIn(ontology, current, base, id, t)).join(", ");
  return t("novel.knowledge.edit.change.merge", { names, target: nameIn(ontology, current, base, edit.target, t) });
}

export function describeEdit(ontology: Ontology, edit: KnowledgeEdit, current: KnowledgeItem[], base: KnowledgeItem[], t: Translate): string {
  switch (edit.k) {
    case "add_entity":
    case "add_fact":
      return t("novel.knowledge.edit.change.add", { name: nameIn(ontology, [createdItem(edit), ...current], base, edit.ref, t) });
    case "del":
      return t("novel.knowledge.edit.change.del", { name: nameIn(ontology, current, base, edit.id, t) });
    case "merge":
      return describeMerge(ontology, edit, current, base, t);
    case "character":
      return t("novel.knowledge.edit.change.add", { name: nameIn(ontology, current, base, `${edit.persona}.character`, t) });
    default:
      return describeEdited(ontology, edit, current, base, t);
  }
}
