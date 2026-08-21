import { NgTemplateOutlet } from "@angular/common";
import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { applyEdits, blankEntity, blankFact, cloneItem, createdItems, describeEdit, isPresent, isIncomplete, itemState, previewOf, scopeOf, splitEntity, withDelete, withPatch, withoutDelete } from "../novel.knowledge.draft";
import { DraftPreview, EntityType, ItemPatch, ItemState, KnowledgeEdit, KnowledgeEntity, KnowledgeFact, KnowledgeIssue, KnowledgeItem, KnowledgeListKind } from "../novel.knowledge.models";
import { ENTITY_TYPES, PREDICATES, predicateDef, ruleDef } from "../novel.knowledge.ontology";
import { NovelKnowledgeService } from "../novel.knowledge.service";
import { chaptersOfItem, entitiesOf, factText, isEntity, isFact, mapOf } from "../novel.knowledge.rules";
import { toNovelError } from "../novel.rules";
import { rangeText } from "../novel.translation.rules";
import { NovelKnowledgeType } from "./knowledge-type.component";

export interface EditCard {
  key: string;
  item: KnowledgeItem;
  entity: KnowledgeEntity | null;
  fact: KnowledgeFact | null;
  state: ItemState;
  present: boolean;
  involved: boolean;
  open: boolean;
  selected: boolean;
  title: string;
  chapters: string;
  scalar: boolean;
  evidence: EvidenceDraft;
}

export interface EditOption {
  value: string;
  label: string;
}

export interface EvidenceDraft {
  chapter: string;
  p: string;
  q: string;
}

export interface SplitForm {
  id: string;
  name: string;
  type: EntityType;
  facts: string[];
}

export interface SplitFact {
  id: string;
  text: string;
}

const STATE_KEYS: Record<ItemState, LanguageKey> = {
  same: "novel.knowledge.edit.state.same",
  edited: "novel.knowledge.edit.state.edited",
  new: "novel.knowledge.edit.state.new",
  deleted: "novel.knowledge.edit.state.deleted",
  merged: "novel.knowledge.edit.state.merged",
  removed: "novel.knowledge.edit.state.removed",
};
const STATE_BADGES: Record<ItemState, string> = { same: "", edited: "badge-warning", new: "badge-info", deleted: "", merged: "", removed: "" };
const PREVIEW_ICONS: Record<DraftPreview["state"], string> = { idle: "info", invalid: "alert", resolved: "check", open: "alert", clean: "check", warn: "alert" };
const EMPTY_EVIDENCE: EvidenceDraft = { chapter: "", p: "", q: "" };
const OPEN_LIMIT = 2;

@Component({
  selector: "app-novel-knowledge-edit-dialog",
  standalone: true,
  imports: [NgTemplateOutlet, Button, Icon, CoreModule, NovelKnowledgeType],
  templateUrl: "./knowledge-edit.dialog.html",
  host: { class: "ed-dialog", "data-testid": "novel-knowledge-edit-dialog" },
})
export class NovelKnowledgeEditDialog {
  private readonly dialogs = inject(NovelDialogsService);
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);

  readonly types = ENTITY_TYPES;
  readonly scalars = PREDICATES.filter((item) => item.kind === "scalar");
  readonly relationships = PREDICATES.filter((item) => item.kind === "relationship");
  readonly request = this.dialogs.edit;

  readonly base = signal<KnowledgeItem[]>([]);
  readonly baseOpen = signal<KnowledgeIssue[]>([]);
  readonly scope = signal<Set<string>>(new Set());
  readonly issue = signal<KnowledgeIssue | null>(null);
  readonly edits = signal<KnowledgeEdit[]>([]);
  readonly expanded = signal<string[]>([]);
  readonly selected = signal<string[]>([]);
  readonly mergeTarget = signal<string | null>(null);
  readonly split = signal<SplitForm | null>(null);
  readonly changesOpen = signal(false);
  readonly drafts = signal<Record<string, EvidenceDraft>>({});
  readonly busy = signal(false);

  readonly open = computed(this.buildOpen.bind(this));
  readonly current = computed(this.buildCurrent.bind(this));
  readonly preview = computed(this.buildPreview.bind(this));
  readonly entityCards = computed(this.buildEntityCards.bind(this));
  readonly factCards = computed(this.buildFactCards.bind(this));
  readonly options = computed(this.buildOptions.bind(this));
  readonly picked = computed(this.buildPicked.bind(this));
  readonly changes = computed(this.buildChanges.bind(this));
  readonly ready = computed(this.buildReady.bind(this));
  readonly splitFacts = computed(this.buildSplitFacts.bind(this));
  readonly rule = computed(this.buildRule.bind(this));

  constructor() {
    effect(this.resetOnOpen.bind(this));
  }

  stateKey(state: ItemState): LanguageKey {
    return STATE_KEYS[state];
  }

  stateBadge(state: ItemState): string {
    return STATE_BADGES[state];
  }

  previewIcon(): string {
    return PREVIEW_ICONS[this.preview().state];
  }

  previewKey(): LanguageKey {
    return `novel.knowledge.edit.preview.${this.preview().state}`;
  }

  ruleLabel(issue: KnowledgeIssue): LanguageKey {
    return ruleDef(issue.rule).labelKey;
  }

  severityOf(issue: KnowledgeIssue): string {
    return issue.sev;
  }

  close(): void {
    this.dialogs.closeEdit();
  }

  toggle(key: string): void {
    const list = this.expanded();
    this.expanded.set(list.includes(key) ? list.filter((id) => id !== key) : [...list, key]);
  }

  toggleChanges(): void {
    this.changesOpen.set(!this.changesOpen());
  }

  addEntity(): void {
    this.addItem("entity");
  }

  addFact(): void {
    this.addItem("fact");
  }

  remove(key: string): void {
    this.edits.set(withDelete(this.edits(), key));
    this.selected.set(this.selected().filter((id) => id !== key));
  }

  restore(key: string): void {
    this.edits.set(withoutDelete(this.edits(), key));
  }

  undo(index: number): void {
    this.edits.set(this.edits().filter((_, position) => position !== index));
  }

  onText(key: string, field: "name" | "summary" | "value", event: Event): void {
    this.patch(key, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }

  onType(key: string, event: Event): void {
    this.patch(key, { type: (event.target as HTMLSelectElement).value as EntityType });
  }

  onEnd(key: string, field: "subject" | "object", event: Event): void {
    this.patch(key, { [field]: (event.target as HTMLSelectElement).value });
  }

  onPred(key: string, event: Event): void {
    const pred = (event.target as HTMLSelectElement).value;
    const fact = this.factOf(key);
    const kind = predicateDef(pred)?.kind;
    if (!fact || !kind) {
      return;
    }
    const wasScalar = fact.object === null;
    if (kind === "scalar" && !wasScalar) {
      this.patch(key, { pred, object: null, value: "" });
    } else if (kind === "relationship" && wasScalar) {
      this.patch(key, { pred, object: this.firstEntity(fact.subject), value: null });
    } else {
      this.patch(key, { pred });
    }
  }

  onSelect(key: string, event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    const rest = this.selected().filter((id) => id !== key);
    this.selected.set(on ? [...rest, key] : rest);
    this.mergeTarget.set(null);
  }

  clearSelection(): void {
    this.selected.set([]);
    this.mergeTarget.set(null);
  }

  deleteSelected(): void {
    let next = this.edits();
    for (const id of this.selected()) {
      next = withDelete(next, id);
    }
    this.edits.set(next);
    this.clearSelection();
  }

  startMerge(): void {
    const picked = [...this.picked()].sort((a, b) => b.item.ev.length - a.item.ev.length);
    this.mergeTarget.set(picked[0]?.key ?? null);
  }

  cancelMerge(): void {
    this.mergeTarget.set(null);
  }

  onMergeTarget(event: Event): void {
    this.mergeTarget.set((event.target as HTMLSelectElement).value);
  }

  applyMerge(): void {
    const target = this.mergeTarget();
    if (target === null) {
      return;
    }
    this.edits.set([...this.edits(), { k: "merge", sources: this.picked().map((card) => card.key), target }]);
    this.expanded.set([...this.expanded(), target]);
    this.clearSelection();
  }

  startSplit(key: string): void {
    const entity = this.entityOf(key);
    if (entity) {
      this.split.set({ id: key, name: "", type: entity.type, facts: [] });
      this.expanded.set([...this.expanded(), key]);
    }
  }

  cancelSplit(): void {
    this.split.set(null);
  }

  onSplitName(event: Event): void {
    const form = this.split();
    if (form) {
      this.split.set({ ...form, name: (event.target as HTMLInputElement).value });
    }
  }

  onSplitType(event: Event): void {
    const form = this.split();
    if (form) {
      this.split.set({ ...form, type: (event.target as HTMLSelectElement).value as EntityType });
    }
  }

  onSplitFact(id: string, event: Event): void {
    const form = this.split();
    if (form) {
      const rest = form.facts.filter((item) => item !== id);
      this.split.set({ ...form, facts: (event.target as HTMLInputElement).checked ? [...rest, id] : rest });
    }
  }

  applySplit(): void {
    const form = this.split();
    const source = form ? this.entityOf(form.id) : undefined;
    if (!form || !source || form.name.trim().length === 0) {
      return;
    }
    const created = splitEntity(this.base(), this.edits(), form.name, form.type);
    this.edits.set([...this.edits(), { k: "split", id: form.id, item: created, facts: form.facts }]);
    this.expanded.set([...this.expanded(), created.id]);
    this.split.set(null);
  }

  onDraft(key: string, field: keyof EvidenceDraft, event: Event): void {
    const draft = this.drafts()[key] ?? EMPTY_EVIDENCE;
    this.drafts.set({ ...this.drafts(), [key]: { ...draft, [field]: (event.target as HTMLInputElement).value } });
  }

  addEvidence(key: string): void {
    const draft = this.drafts()[key] ?? EMPTY_EVIDENCE;
    const chapter = Number(draft.chapter);
    const p = Number(draft.p);
    const item = this.itemOf(key);
    if (!item || !Number.isInteger(chapter) || !Number.isInteger(p) || chapter < 1 || p < 1 || draft.q.trim().length === 0) {
      this.toasts.show(this.languageService.translate("novel.knowledge.edit.evidence.invalid"), "warning");
      return;
    }
    this.patch(key, { ev: [...item.ev, { chapter, p, q: draft.q.trim(), verified: true }] });
    this.drafts.set({ ...this.drafts(), [key]: EMPTY_EVIDENCE });
  }

  removeEvidence(key: string, index: number): void {
    const item = this.itemOf(key);
    if (item) {
      this.patch(key, { ev: item.ev.filter((_, position) => position !== index) });
    }
  }

  async confirm(): Promise<void> {
    const request = this.request();
    if (!request || !this.ready() || this.busy()) {
      return;
    }
    this.busy.set(true);
    const count = this.edits().length;
    try {
      await this.knowledge.commit(request.novelId, this.current());
      this.close();
      const left = this.knowledge.issuesOf(request.novelId).length;
      this.toasts.show(this.languageService.translate(left > 0 ? "novel.knowledge.edit.applied.left" : "novel.knowledge.edit.applied", { count, left }), left > 0 ? "warning" : "success");
    } catch (cause) {
      this.toasts.show(this.languageService.translate("novel.error.generic", { detail: toNovelError(cause).detail }), "danger");
    } finally {
      this.busy.set(false);
    }
  }

  private text(key: LanguageKey): string {
    return this.languageService.translate(key);
  }

  private itemOf(key: string): KnowledgeItem | undefined {
    return this.current().find((item) => item.id === key);
  }

  private entityOf(key: string): KnowledgeEntity | undefined {
    const item = this.itemOf(key);
    return item && isEntity(item) ? item : undefined;
  }

  private factOf(key: string): KnowledgeFact | undefined {
    const item = this.itemOf(key);
    return item && isFact(item) ? item : undefined;
  }

  private firstEntity(except: string): string {
    return entitiesOf(this.current()).find((entity) => entity.id !== except)?.id ?? "";
  }

  private patch(key: string, patch: ItemPatch): void {
    this.edits.set(withPatch(this.base(), this.edits(), key, patch));
  }

  private addItem(kind: KnowledgeListKind): void {
    const base = this.base();
    const edits = this.edits();
    const entities = entitiesOf(this.current());
    const anchor = this.request()?.ids.find((id) => entities.some((entity) => entity.id === id)) ?? entities[0]?.id ?? "";
    const other = entities.find((entity) => entity.id !== anchor)?.id ?? anchor;
    const item = kind === "entity" ? blankEntity(base, edits, "persona") : blankFact(base, edits, anchor, other);
    this.edits.set([...edits, { k: "add", item }]);
    this.expanded.set([...this.expanded(), item.id]);
  }

  private buildOpen(): boolean {
    return this.request() !== null;
  }

  private buildCurrent(): KnowledgeItem[] {
    return applyEdits(this.base(), this.edits());
  }

  private buildPreview(): DraftPreview {
    return previewOf(this.current(), this.scope(), this.edits(), this.issue(), this.baseOpen(), this.text.bind(this));
  }

  private buildCards(kind: "entity" | "fact"): EditCard[] {
    const current = this.current();
    const edits = this.edits();
    const base = this.base();
    const created = createdItems(edits);
    const originals = base.filter((item) => this.scope().has(item.id));
    const out: EditCard[] = [];
    for (const original of [...originals, ...created]) {
      if (original.kind !== kind) {
        continue;
      }
      const item = current.find((entry) => entry.id === original.id) ?? original;
      const state = itemState(base, edits, current, original.id);
      const chapters = chaptersOfItem(item);
      out.push({
        key: item.id,
        item,
        entity: isEntity(item) ? item : null,
        fact: isFact(item) ? item : null,
        state,
        present: isPresent(state),
        involved: this.issue()?.ids.includes(item.id) ?? false,
        open: this.expanded().includes(item.id),
        selected: this.selected().includes(item.id),
        title: isEntity(item) ? item.name : factText(mapOf([...base, ...current]), item, this.text.bind(this)),
        chapters: chapters.length > 0 ? rangeText(chapters) : "",
        scalar: isFact(item) && (predicateDef(item.pred)?.kind ?? (item.object === null ? "scalar" : "relationship")) === "scalar",
        evidence: this.drafts()[item.id] ?? EMPTY_EVIDENCE,
      });
    }
    return out;
  }

  private buildEntityCards(): EditCard[] {
    return this.buildCards("entity");
  }

  private buildFactCards(): EditCard[] {
    return this.buildCards("fact");
  }

  private buildOptions(): EditOption[] {
    const out: EditOption[] = [];
    for (const entity of entitiesOf(this.current())) {
      const def = ENTITY_TYPES.find((item) => item.key === entity.type);
      out.push({ value: entity.id, label: `${entity.name || "—"} · ${def ? this.text(def.labelKey) : entity.type}` });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  private buildPicked(): EditCard[] {
    return this.entityCards().filter((card) => card.selected && card.present);
  }

  private buildChanges(): string[] {
    const current = this.current();
    return this.edits().map((edit) => describeEdit(edit, current, this.base(), this.text.bind(this)));
  }

  private buildReady(): boolean {
    if (this.edits().length === 0 || isIncomplete(this.current(), this.scope(), this.edits())) {
      return false;
    }
    const state = this.preview().state;
    return this.issue() ? state === "resolved" : state === "clean" || state === "warn";
  }

  private buildSplitFacts(): SplitFact[] {
    const form = this.split();
    const current = this.current();
    const map = mapOf(current);
    const out: SplitFact[] = [];
    for (const item of current) {
      if (form && isFact(item) && (item.subject === form.id || item.object === form.id)) {
        out.push({ id: item.id, text: factText(map, item, this.text.bind(this)) });
      }
    }
    return out;
  }

  private buildRule(): LanguageKey | null {
    const issue = this.issue();
    return issue ? ruleDef(issue.rule).labelKey : null;
  }

  private resetOnOpen(): void {
    const request = this.request();
    if (request) {
      untracked(this.initialize.bind(this));
    }
  }

  private initialize(): void {
    const request = this.request();
    if (!request) {
      return;
    }
    const knowledge = this.knowledge.of(request.novelId);
    const open = this.knowledge.issuesOf(request.novelId);
    const items = knowledge.items.map((item) => cloneItem(item));
    const present = request.ids.filter((id) => items.some((item) => item.id === id));
    this.base.set(items);
    this.baseOpen.set(open);
    this.issue.set(open.find((item) => item.id === request.issueId) ?? null);
    this.scope.set(scopeOf(items, request.ids));
    this.edits.set([]);
    this.expanded.set(present.slice(0, OPEN_LIMIT));
    this.selected.set([]);
    this.mergeTarget.set(null);
    this.split.set(null);
    this.changesOpen.set(false);
    this.drafts.set({});
    this.busy.set(false);
    if (request.add) {
      this.addItem(request.add);
    }
  }
}
