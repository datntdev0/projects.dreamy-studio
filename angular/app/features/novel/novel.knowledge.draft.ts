import { LanguageKey } from "@app/core/language/language.models";
import { DraftPreview, EntityType, ItemPatch, ItemState, KnowledgeEdit, KnowledgeEntity, KnowledgeEvidence, KnowledgeFact, KnowledgeIssue, KnowledgeItem } from "./novel.knowledge.models";
import { predicateDef } from "./novel.knowledge.ontology";
import { Translate, checkKnowledge, entitiesOf, factText, factsOf, isEntity, isFact, mapOf } from "./novel.knowledge.rules";

type CreateEdit = Extract<KnowledgeEdit, { k: "add" | "split" }>;

const FIELD_KEYS: Record<string, LanguageKey> = {
  name: "novel.knowledge.edit.field.name",
  type: "novel.knowledge.edit.field.type",
  summary: "novel.knowledge.edit.field.summary",
  ev: "novel.knowledge.edit.field.ev",
  subject: "novel.knowledge.edit.field.subject",
  object: "novel.knowledge.edit.field.object",
  pred: "novel.knowledge.edit.field.pred",
  value: "novel.knowledge.edit.field.value",
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

function sameEvidence(a: KnowledgeEvidence, b: KnowledgeEvidence): boolean {
  return a.chapter === b.chapter && a.p === b.p && a.q === b.q;
}

function mergeEvidence(target: KnowledgeItem, source: KnowledgeItem): void {
  for (const evidence of source.ev) {
    if (!target.ev.some((item) => sameEvidence(item, evidence))) {
      target.ev.push(evidence);
    }
  }
}

function sameFact(a: KnowledgeFact, b: KnowledgeFact): boolean {
  return a.pred === b.pred && a.subject === b.subject && a.object === b.object && a.value === b.value;
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

function applyMerge(list: KnowledgeItem[], edit: Extract<KnowledgeEdit, { k: "merge" }>): KnowledgeItem[] {
  const target = list.find((item) => item.id === edit.target);
  let next = list;
  for (const sourceId of edit.sources) {
    const source = next.find((item) => item.id === sourceId);
    if (!source || !target || sourceId === edit.target) {
      continue;
    }
    mergeEvidence(target, source);
    if (isEntity(source) && isEntity(target) && !target.summary) {
      target.summary = source.summary;
    }
    retarget(next, sourceId, edit.target);
    next = next.filter((item) => item.id !== sourceId);
  }
  return tidyFacts(next);
}

function applyOne(list: KnowledgeItem[], edit: KnowledgeEdit): KnowledgeItem[] {
  switch (edit.k) {
    case "add":
      return [...list, cloneItem(edit.item)];
    case "edit": {
      const item = list.find((entry) => entry.id === edit.id);
      if (item) {
        Object.assign(item, structuredClone(edit.patch));
      }
      return list;
    }
    case "del":
      return list.filter((item) => item.id !== edit.id && !(isFact(item) && (item.subject === edit.id || item.object === edit.id)));
    case "merge":
      return applyMerge(list, edit);
    case "split": {
      const next = [...list, cloneItem(edit.item)];
      for (const id of edit.facts) {
        const fact = next.find((item) => item.id === id);
        if (fact && isFact(fact)) {
          fact.subject = fact.subject === edit.id ? edit.item.id : fact.subject;
          fact.object = fact.object === edit.id ? edit.item.id : fact.object;
        }
      }
      return next;
    }
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
    if ((edit.k === "add" || edit.k === "split") && edit.item.id === id) {
      return edit;
    }
  }
  return undefined;
}

export function createdItems(edits: KnowledgeEdit[]): KnowledgeItem[] {
  const out: KnowledgeItem[] = [];
  for (const edit of edits) {
    if (edit.k === "add" || edit.k === "split") {
      out.push(edit.item);
    }
  }
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function patchCreated(edits: KnowledgeEdit[], made: CreateEdit, patch: ItemPatch): KnowledgeEdit[] {
  return edits.map((edit) => (edit === made ? { ...made, item: { ...made.item, ...structuredClone(patch) } as KnowledgeItem } as KnowledgeEdit : edit));
}

export function withPatch(base: KnowledgeItem[], edits: KnowledgeEdit[], id: string, patch: ItemPatch): KnowledgeEdit[] {
  const made = createdOf(edits, id);
  if (made) {
    return patchCreated(edits, made, patch);
  }
  const original = base.find((item) => item.id === id);
  const existing = edits.find((edit) => edit.k === "edit" && edit.id === id);
  const merged: ItemPatch = { ...(existing && existing.k === "edit" ? existing.patch : {}), ...structuredClone(patch) };
  const keys = Object.keys(merged) as Array<keyof ItemPatch>;
  const kept: ItemPatch = {};
  for (const key of keys) {
    if (!original || !sameValue(merged[key], Reflect.get(original, key))) {
      Object.assign(kept, { [key]: merged[key] });
    }
  }
  const rest = edits.filter((edit) => edit !== existing);
  return Object.keys(kept).length > 0 ? [...rest, { k: "edit", id, patch: kept }] : rest;
}

export function withDelete(edits: KnowledgeEdit[], id: string): KnowledgeEdit[] {
  const made = createdOf(edits, id);
  return made ? edits.filter((edit) => edit !== made) : [...edits, { k: "del", id }];
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
  if (edits.some((edit) => edit.k === "merge" && edit.sources.includes(id) && edit.target !== id)) {
    return "merged";
  }
  return edits.some((edit) => edit.k === "del" && edit.id === id) ? "deleted" : "removed";
}

export function isPresent(state: ItemState): boolean {
  return state !== "deleted" && state !== "merged" && state !== "removed";
}

function factComplete(fact: KnowledgeFact, entities: Set<string>): boolean {
  const kind = predicateDef(fact.pred)?.kind ?? (fact.object === null ? "scalar" : "relationship");
  const subject = entities.has(fact.subject);
  return kind === "relationship" ? subject && fact.object !== null && entities.has(fact.object) : subject && (fact.value ?? "").trim().length > 0;
}

export function isIncomplete(current: KnowledgeItem[], scope: Set<string>, edits: KnowledgeEdit[]): boolean {
  const entities = new Set(entitiesOf(current).map((entity) => entity.id));
  const created = new Set(createdItems(edits).map((item) => item.id));
  for (const item of current) {
    if (!scope.has(item.id) && !created.has(item.id)) {
      continue;
    }
    if (isEntity(item) ? item.name.trim().length === 0 : !factComplete(item, entities)) {
      return true;
    }
  }
  return false;
}

export function previewOf(current: KnowledgeItem[], scope: Set<string>, edits: KnowledgeEdit[], issue: KnowledgeIssue | null, baseOpen: KnowledgeIssue[], t: Translate): DraftPreview {
  if (edits.length === 0) {
    return { state: "idle", added: [], fixed: [] };
  }
  if (isIncomplete(current, scope, edits)) {
    return { state: "invalid", added: [], fixed: [] };
  }
  const after = checkKnowledge(current, t);
  const afterIds = new Set(after.map((item) => item.id));
  const baseIds = new Set(baseOpen.map((item) => item.id));
  const added = after.filter((item) => !baseIds.has(item.id));
  const fixed = baseOpen.filter((item) => !afterIds.has(item.id) && item.id !== issue?.id);
  const state = issue ? (afterIds.has(issue.id) ? "open" : "resolved") : added.length > 0 ? "warn" : "clean";
  return { state, added, fixed };
}

function nextId(base: KnowledgeItem[], edits: KnowledgeEdit[], prefix: string): string {
  const taken = new Set([...base.map((item) => item.id), ...createdItems(edits).map((item) => item.id)]);
  let n = 100;
  while (taken.has(`${prefix}${n}`)) {
    n += 1;
  }
  return `${prefix}${n}`;
}

export function blankEntity(base: KnowledgeItem[], edits: KnowledgeEdit[], type: EntityType): KnowledgeEntity {
  return { id: nextId(base, edits, "E"), kind: "entity", type, name: "", summary: "", ev: [], stale: null };
}

export function blankFact(base: KnowledgeItem[], edits: KnowledgeEdit[], subject: string, object: string | null): KnowledgeFact {
  const pred = object === null ? "alias" : "ally_of";
  return { id: nextId(base, edits, "F"), kind: "fact", pred, subject, object, value: object === null ? "" : null, ev: [], stale: null };
}

export function splitEntity(base: KnowledgeItem[], edits: KnowledgeEdit[], name: string, type: EntityType): KnowledgeEntity {
  return { id: nextId(base, edits, "E"), kind: "entity", type, name: name.trim(), summary: "", ev: [], stale: null };
}

function nameIn(current: KnowledgeItem[], base: KnowledgeItem[], id: string, t: Translate): string {
  const map = mapOf([...base, ...current]);
  const item = map.get(id);
  return item ? (isEntity(item) ? item.name || "—" : factText(map, item, t)) : id;
}

export function describeEdit(edit: KnowledgeEdit, current: KnowledgeItem[], base: KnowledgeItem[], t: Translate): string {
  switch (edit.k) {
    case "add":
      return t("novel.knowledge.edit.change.add", { name: nameIn([edit.item, ...current], base, edit.item.id, t) });
    case "edit": {
      const fields = Object.keys(edit.patch).map((field) => (FIELD_KEYS[field] ? t(FIELD_KEYS[field]) : field)).join(", ");
      return t("novel.knowledge.edit.change.edit", { name: nameIn(current, base, edit.id, t), fields });
    }
    case "del":
      return t("novel.knowledge.edit.change.del", { name: nameIn(current, base, edit.id, t) });
    case "merge": {
      const names = edit.sources.filter((id) => id !== edit.target).map((id) => nameIn(current, base, id, t)).join(", ");
      return t("novel.knowledge.edit.change.merge", { names, target: nameIn(current, base, edit.target, t) });
    }
    case "split":
      return t("novel.knowledge.edit.change.split", { name: nameIn(current, base, edit.id, t), created: edit.item.name, count: edit.facts.length });
  }
}
