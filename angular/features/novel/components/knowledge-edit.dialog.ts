import { NgTemplateOutlet } from '@angular/common';
// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey, LanguageParams } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldChecked, fieldValue, setFieldValue } from '@shared/utils/dom';

import { NovelDialogsService } from '../novel.dialogs.service';
// prettier-ignore
import { applyEdits, blankEntity, blankFact, cloneItem, createdItems, describeEdit, isIncomplete, isPresent, ItemDraftPatch, itemState, previewOf, scopeOf, typeRefused, withCreated, withDelete, withoutDelete, withPatch } from '../novel.knowledge.draft';
// prettier-ignore
import { DraftPreview, EntityType, EntityTypeDef, EvidenceRef, ItemState, KnowledgeEdit, KnowledgeEntity, KnowledgeFact, KnowledgeIssue, KnowledgeItem, KnowledgeLang, KnowledgeListKind, PredicateDef } from '../novel.knowledge.models';
// prettier-ignore
import { chaptersOfItem, entitiesOf, factText, isEntity, isFact, mapOf } from '../novel.knowledge.rules';
import { NovelKnowledgeService } from '../novel.knowledge.service';
import { toNovelError } from '../novel.rules';
import { NovelService } from '../novel.service';
import { rangeText } from '../novel.translation.rules';
import { NovelTranslationService } from '../novel.translation.service';
import { NovelKnowledgeType } from './knowledge-type.component';

export type ListField = 'titles' | 'aliases';

export interface EditList {
  field: ListField;
  labelKey: LanguageKey;
  values: string[];
  draft: string;
}

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
  locked: boolean;
  title: string;
  chapters: string;
  scalar: boolean;
  created: boolean;
  needsEvidence: boolean;
  lists: EditList[];
  preds: PredicateDef[];
  subjects: EditOption[];
  objects: EditOption[];
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

const STATE_KEYS: Record<ItemState, LanguageKey> = {
  same: 'novel.knowledge.edit.state.same',
  edited: 'novel.knowledge.edit.state.edited',
  new: 'novel.knowledge.edit.state.new',
  deleted: 'novel.knowledge.edit.state.deleted',
  merged: 'novel.knowledge.edit.state.merged',
  removed: 'novel.knowledge.edit.state.removed',
};
const STATE_BADGES: Record<ItemState, string> = {
  same: '',
  edited: 'badge-warning',
  new: 'badge-info',
  deleted: '',
  merged: '',
  removed: '',
};
const PREVIEW_ICONS: Record<DraftPreview['state'], string> = {
  idle: 'info',
  invalid: 'alert',
  resolved: 'check',
  open: 'alert',
  clean: 'check',
  warn: 'alert',
};
const LIST_LABELS: Record<ListField, LanguageKey> = {
  titles: 'novel.knowledge.edit.field.titles',
  aliases: 'novel.knowledge.edit.field.aliases',
};
const LIST_FIELDS: ListField[] = ['titles', 'aliases'];
const EMPTY_EVIDENCE: EvidenceDraft = { chapter: '', p: '', q: '' };
const PERSONA_TYPE: EntityType = 'persona';
const OPEN_LIMIT = 2;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-knowledge-edit-dialog',
  imports: [NgTemplateOutlet, Button, Icon, CoreModule, NovelKnowledgeType],
  templateUrl: './knowledge-edit.dialog.html',
  host: { class: 'ed-dialog', 'data-testid': 'novel-knowledge-edit-dialog' },
})
export class NovelKnowledgeEditDialog {
  private readonly dialogs = inject(NovelDialogsService);
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly novels = inject(NovelService);
  private readonly translation = inject(NovelTranslationService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);

  readonly request = this.dialogs.edit;

  readonly base = signal<KnowledgeItem[]>([]);
  readonly baseOpen = signal<KnowledgeIssue[]>([]);
  readonly scope = signal<Set<string>>(new Set());
  readonly issue = signal<KnowledgeIssue | null>(null);
  readonly edits = signal<KnowledgeEdit[]>([]);
  readonly expanded = signal<string[]>([]);
  readonly selected = signal<string[]>([]);
  readonly mergeTarget = signal<string | null>(null);
  readonly changesOpen = signal(false);
  readonly drafts = signal<Record<string, EvidenceDraft>>({});
  readonly listDrafts = signal<Record<string, string>>({});
  readonly chapterOptions = signal<EditOption[]>([]);
  readonly busy = signal(false);

  readonly types = computed(this.buildTypes.bind(this));
  readonly scalars = computed(this.buildScalars.bind(this));
  readonly relationships = computed(this.buildRelationships.bind(this));
  readonly open = computed(this.buildOpen.bind(this));
  readonly current = computed(this.buildCurrent.bind(this));
  readonly preview = computed(this.buildPreview.bind(this));
  readonly entityCards = computed(this.buildEntityCards.bind(this));
  readonly factCards = computed(this.buildFactCards.bind(this));
  readonly options = computed(this.buildOptions.bind(this));
  readonly picked = computed(this.buildPicked.bind(this));
  readonly mergeable = computed(this.buildMergeable.bind(this));
  readonly changes = computed(this.buildChanges.bind(this));
  readonly ready = computed(this.buildReady.bind(this));
  readonly rule = computed(this.buildRule.bind(this));
  readonly canAddFact = computed(this.buildCanAddFact.bind(this));

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

  typeRefused(entity: KnowledgeEntity): boolean {
    return typeRefused(entity);
  }

  previewKey(): LanguageKey {
    return `novel.knowledge.edit.preview.${this.preview().state}`;
  }

  ruleLabel(issue: KnowledgeIssue): LanguageKey {
    return this.knowledge.ontology().ruleDef(issue.rule).labelKey;
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
    this.addItem('entity');
  }

  addFact(): void {
    this.addItem('fact');
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

  onName(key: string, event: Event): void {
    this.patch(key, { name: fieldValue(event) });
  }

  onNameEnd(key: string, event: Event): void {
    const name = fieldValue(event).trim();
    setFieldValue(event, name);
    this.patch(key, { name });
  }

  onType(key: string, event: Event): void {
    const type = fieldValue(event) as EntityType;
    const entity = this.entityOf(key);
    if (!entity || entity.type === type) {
      return;
    }
    this.patch(key, { type });
  }

  onEnd(key: string, field: 'subject' | 'object', event: Event): void {
    this.patch(key, { [field]: fieldValue(event) });
  }

  onPred(key: string, event: Event): void {
    const pred = fieldValue(event);
    const fact = this.factOf(key);
    const kind = this.knowledge.ontology().predicateDef(pred)?.kind;
    if (!fact || !kind) {
      return;
    }
    const wasScalar = fact.object === null;
    if (kind === 'scalar' && !wasScalar) {
      this.patch(key, { pred, object: null });
    } else if (kind === 'relationship' && wasScalar) {
      this.patch(key, { pred, object: this.firstEntity(fact.subject) });
    } else {
      this.patch(key, { pred });
    }
  }

  onSelect(key: string, event: Event): void {
    const on = fieldChecked(event);
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
    if (!this.mergeable()) {
      return;
    }
    const picked = [...this.picked()].sort((a, b) => b.item.ev.length - a.item.ev.length);
    this.mergeTarget.set(picked[0]?.key ?? null);
  }

  cancelMerge(): void {
    this.mergeTarget.set(null);
  }

  onMergeTarget(event: Event): void {
    this.mergeTarget.set(fieldValue(event));
  }

  applyMerge(): void {
    const target = this.mergeTarget();
    if (target === null || !this.mergeable()) {
      return;
    }
    this.edits.set([
      ...this.edits(),
      { k: 'merge', sources: this.picked().map((card) => card.key), target },
    ]);
    this.expanded.set([...this.expanded(), target]);
    this.clearSelection();
  }

  onListDraft(key: string, field: ListField, event: Event): void {
    this.listDrafts.set({
      ...this.listDrafts(),
      [`${key}|${field}`]: fieldValue(event),
    });
  }

  onListEnter(key: string, field: ListField, event: Event): void {
    event.preventDefault();
    this.addValue(key, field);
  }

  addValue(key: string, field: ListField): void {
    const entity = this.entityOf(key);
    const slot = `${key}|${field}`;
    const value = (this.listDrafts()[slot] ?? '').trim();
    if (!entity || value.length === 0) {
      return;
    }
    const values = entity[field];
    if (!values.some((item) => item.trim().toLowerCase() === value.toLowerCase())) {
      this.patch(key, { [field]: [...values, value] });
    }
    this.listDrafts.set({ ...this.listDrafts(), [slot]: '' });
  }

  removeValue(key: string, field: ListField, index: number): void {
    const entity = this.entityOf(key);
    if (entity) {
      this.patch(key, { [field]: entity[field].filter((_, position) => position !== index) });
    }
  }

  onDraft(key: string, field: keyof EvidenceDraft, event: Event): void {
    const draft = this.drafts()[key] ?? EMPTY_EVIDENCE;
    this.drafts.set({
      ...this.drafts(),
      [key]: {
        ...draft,
        [field]: fieldValue(event),
      },
    });
  }

  addEvidence(key: string): void {
    const draft = this.drafts()[key] ?? EMPTY_EVIDENCE;
    const chapter = Number(draft.chapter);
    const p = Number(draft.p);
    const q = draft.q.trim();
    if (
      !this.itemOf(key) ||
      draft.chapter === '' ||
      !Number.isInteger(chapter) ||
      !Number.isInteger(p) ||
      chapter < 1 ||
      p < 1 ||
      q.length === 0
    ) {
      this.toasts.show(
        this.languageService.translate('novel.knowledge.edit.evidence.invalid'),
        'warning',
      );
      return;
    }
    this.patch(key, { evidenceAdd: [{ chapter, p, q }] });
    this.drafts.set({ ...this.drafts(), [key]: { ...EMPTY_EVIDENCE, chapter: draft.chapter } });
  }

  removeEvidence(key: string, ref: EvidenceRef): void {
    this.patch(key, { evidenceRemove: [{ chapter: ref.chapter, p: ref.p, q: ref.q }] });
  }

  async confirm(): Promise<void> {
    const request = this.request();
    if (!request || !this.ready() || this.busy()) {
      return;
    }
    this.busy.set(true);
    const count = this.edits().length;
    try {
      await this.knowledge.apply(request.novelId, this.sendable());
      this.close();
      const left = this.knowledge.issuesOf(request.novelId).length;
      this.toasts.show(
        this.languageService.translate(
          left > 0 ? 'novel.knowledge.edit.applied.left' : 'novel.knowledge.edit.applied',
          { count, left },
        ),
        left > 0 ? 'warning' : 'success',
      );
    } catch (cause) {
      this.toasts.show(
        this.languageService.translate('novel.error.generic', {
          detail: toNovelError(cause).detail,
        }),
        'danger',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private text(key: LanguageKey, params?: LanguageParams): string {
    return this.languageService.translate(key, params);
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
    return entitiesOf(this.current()).find((entity) => entity.id !== except)?.id ?? '';
  }

  private patch(key: string, patch: ItemDraftPatch): void {
    this.edits.set(withPatch(this.base(), this.edits(), key, patch));
  }

  private trimmed(edit: KnowledgeEdit): KnowledgeEdit {
    switch (edit.k) {
      case 'rename':
      case 'add_entity':
        return { ...edit, name: edit.name.trim() };
      default:
        return edit;
    }
  }

  private baseTypeOf(id: string): string | undefined {
    const item = this.base().find((entry) => entry.id === id);
    return item && isEntity(item) ? item.type : undefined;
  }

  private leavesPersona(edit: KnowledgeEdit): edit is Extract<KnowledgeEdit, { k: 'retype' }> {
    return (
      edit.k === 'retype' && edit.type !== PERSONA_TYPE && this.baseTypeOf(edit.id) === PERSONA_TYPE
    );
  }

  private propsOf(edits: KnowledgeEdit[], id: string): KnowledgeEdit[] {
    return edits.filter((edit) => edit.k === 'props' && edit.id === id);
  }

  private propsBeforeRetype(edits: KnowledgeEdit[]): KnowledgeEdit[] {
    const leaving = new Set(edits.filter(this.leavesPersona.bind(this)).map((edit) => edit.id));
    const out: KnowledgeEdit[] = [];
    for (const edit of edits) {
      if (edit.k === 'props' && leaving.has(edit.id)) {
        continue;
      }
      if (this.leavesPersona(edit)) {
        out.push(...this.propsOf(edits, edit.id));
      }
      out.push(edit);
    }
    return out;
  }

  private sendable(): KnowledgeEdit[] {
    return this.propsBeforeRetype(this.edits().map(this.trimmed.bind(this)));
  }

  private addItem(kind: KnowledgeListKind): void {
    const base = this.base();
    const edits = this.edits();
    const entities = entitiesOf(this.current());
    if (entities.length === 0 && kind === 'fact') {
      return;
    }
    const item =
      kind === 'entity'
        ? blankEntity(base, edits, PERSONA_TYPE)
        : blankFact(this.knowledge.ontology(), base, edits, this.anchorOf(entities), null);
    this.edits.set(withCreated(edits, item));
    this.expanded.set([...this.expanded(), item.id]);
  }

  private anchorOf(entities: KnowledgeEntity[]): string {
    const ids = this.request()?.ids ?? [];
    const entity = entities.find((item) => ids.includes(item.id));
    if (entity) {
      return entity.id;
    }
    const fact = this.current().find((item) => ids.includes(item.id) && isFact(item));
    return fact && isFact(fact) && entities.some((item) => item.id === fact.subject)
      ? fact.subject
      : (entities[0]?.id ?? '');
  }

  private buildOpen(): boolean {
    return this.request() !== null;
  }

  private buildCurrent(): KnowledgeItem[] {
    return applyEdits(this.base(), this.edits());
  }

  private buildPreview(): DraftPreview {
    return previewOf(
      this.knowledge.ontology(),
      this.current(),
      this.scope(),
      this.edits(),
      this.issue(),
      this.baseOpen(),
      this.text.bind(this),
    );
  }

  private pickedType(): EntityType | null {
    for (const id of this.selected()) {
      const entity = this.entityOf(id);
      if (entity) {
        return entity.type;
      }
    }
    return null;
  }

  private listsOf(entity: KnowledgeEntity, key: string): EditList[] {
    if (entity.type !== PERSONA_TYPE) {
      return [];
    }
    return LIST_FIELDS.map((field) => ({
      field,
      labelKey: LIST_LABELS[field],
      values: entity[field],
      draft: this.listDrafts()[`${key}|${field}`] ?? '',
    }));
  }

  private predsOf(fact: KnowledgeFact, scalar: boolean): PredicateDef[] {
    const list = scalar ? this.scalars() : this.relationships();
    const def = this.knowledge.ontology().predicateDef(fact.pred);
    return def && !list.includes(def) ? [def, ...list] : list;
  }

  private endOptions(except: string): EditOption[] {
    return this.options().filter((option) => option.value !== except);
  }

  private card(item: KnowledgeItem, lock: EntityType | null): EditCard {
    const current = this.current();
    const base = this.base();
    const state = itemState(base, this.edits(), current, item.id);
    const chapters = chaptersOfItem(item);
    const entity = isEntity(item) ? item : null;
    const fact = isFact(item) ? item : null;
    const created = state === 'new';
    const scalar =
      fact !== null &&
      (this.knowledge.ontology().predicateDef(fact.pred)?.kind ??
        (fact.object === null ? 'scalar' : 'relationship')) === 'scalar';
    return {
      key: item.id,
      item,
      entity,
      fact,
      state,
      present: isPresent(state),
      involved: this.issue()?.ids.includes(item.id) ?? false,
      open: this.expanded().includes(item.id),
      selected: this.selected().includes(item.id),
      locked:
        entity !== null &&
        lock !== null &&
        entity.type !== lock &&
        !this.selected().includes(item.id),
      title: fact
        ? factText(
            this.knowledge.ontology(),
            mapOf([...base, ...current]),
            fact,
            this.text.bind(this),
          )
        : (entity?.name ?? ''),
      chapters: chapters.length > 0 ? rangeText(chapters) : '',
      scalar,
      created,
      needsEvidence: created && item.ev.length === 0,
      lists: entity ? this.listsOf(entity, item.id) : [],
      preds: fact ? this.predsOf(fact, scalar) : [],
      subjects: fact ? this.endOptions(fact.object ?? '') : [],
      objects: fact ? this.endOptions(fact.subject) : [],
      evidence: this.drafts()[item.id] ?? EMPTY_EVIDENCE,
    };
  }

  private cards(kind: 'entity' | 'fact', lock: EntityType | null): EditCard[] {
    const current = this.current();
    const base = this.base();
    const originals = base.filter((item) => this.scope().has(item.id));
    const out: EditCard[] = [];
    for (const original of [...originals, ...createdItems(this.edits())]) {
      if (original.kind === kind) {
        out.push(this.card(current.find((entry) => entry.id === original.id) ?? original, lock));
      }
    }
    return out;
  }

  private buildEntityCards(): EditCard[] {
    return this.cards('entity', this.pickedType());
  }

  private buildFactCards(): EditCard[] {
    return this.cards('fact', null);
  }

  private buildOptions(): EditOption[] {
    const out: EditOption[] = [];
    for (const entity of entitiesOf(this.current())) {
      const def = this.knowledge.ontology().typeDef(entity.type);
      out.push({
        value: entity.id,
        label: `${entity.name || '—'} · ${def ? this.text(def.labelKey) : entity.type}`,
      });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  private buildPicked(): EditCard[] {
    return this.entityCards().filter((card) => card.selected && card.present);
  }

  private buildMergeable(): boolean {
    const picked = this.picked();
    return (
      picked.length >= 2 && picked.every((card) => card.entity?.type === picked[0].entity?.type)
    );
  }

  private buildChanges(): string[] {
    const current = this.current();
    return this.edits().map((edit) =>
      describeEdit(this.knowledge.ontology(), edit, current, this.base(), this.text.bind(this)),
    );
  }

  private buildReady(): boolean {
    if (
      this.edits().length === 0 ||
      isIncomplete(this.knowledge.ontology(), this.current(), this.scope(), this.edits())
    ) {
      return false;
    }
    const state = this.preview().state;
    return this.issue() ? state === 'resolved' : state === 'clean' || state === 'warn';
  }

  private buildRule(): LanguageKey | null {
    const issue = this.issue();
    return issue ? this.knowledge.ontology().ruleDef(issue.rule).labelKey : null;
  }

  private buildTypes(): readonly EntityTypeDef[] {
    return this.knowledge.ontology().types;
  }

  private buildScalars(): PredicateDef[] {
    return this.knowledge.ontology().scalars;
  }

  private buildRelationships(): PredicateDef[] {
    return this.knowledge.ontology().relationships;
  }

  private buildCanAddFact(): boolean {
    return entitiesOf(this.current()).length > 0;
  }

  private chapterLabel(novelId: number, seq: number, lang: KnowledgeLang): string {
    const row = this.novels.chaptersOf(novelId).find((entry) => entry.seq === seq);
    const translated =
      row && lang !== 'src' ? this.translation.titleOf(novelId, row.id, lang) : null;
    return row ? `${seq} · ${translated || row.title}` : `${seq}`;
  }

  private chapterOptionsOf(novelId: number): EditOption[] {
    const knowledge = this.knowledge.of(novelId);
    return Object.keys(knowledge.analyzed)
      .map(Number)
      .sort((a, b) => a - b)
      .map((seq) => ({
        value: String(seq),
        label: this.chapterLabel(novelId, seq, knowledge.lang),
      }));
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
    this.changesOpen.set(false);
    this.drafts.set({});
    this.listDrafts.set({});
    this.chapterOptions.set(this.chapterOptionsOf(request.novelId));
    this.busy.set(false);
    if (request.add) {
      this.addItem(request.add);
    }
  }
}
