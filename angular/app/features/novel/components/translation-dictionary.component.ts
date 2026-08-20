import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from "@angular/core";
import { Datatable, DatatableAction, DatatableCell, DatatableCellEdit, DatatableColumn, DatatableEmpty } from "@components/datatable";
import { FormOption } from "@components/form";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { toNovelError } from "../novel.rules";
import { DictChange, DictDraft, DictEntry, DictEntryType } from "../novel.translation.models";
import { DICT_TYPES, DICT_TYPE_KEYS, emptyDraft, filterDict } from "../novel.translation.rules";
import { NovelTranslationService } from "../novel.translation.service";

const DRAFT_ID = 0;

type DraftField = "src" | "dst" | "note";

@Component({
  selector: "app-novel-translation-dictionary",
  standalone: true,
  imports: [Datatable, DatatableCell, DatatableEmpty, Icon, I18nPipe],
  templateUrl: "./translation-dictionary.component.html",
})
export class NovelTranslationDictionary {
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  private readonly translation = inject(NovelTranslationService);

  readonly novelId = input.required<number>();
  readonly types = DICT_TYPES;
  readonly query = signal("");
  readonly draft = signal<DictDraft | null>(null);
  readonly draftSource = viewChild<ElementRef<HTMLInputElement>>("draftSource");

  readonly all = computed(this.buildAll.bind(this));
  readonly rows = computed(this.buildRows.bind(this));
  readonly tableRows = computed(this.buildTableRows.bind(this));

  readonly tableActions = (row: object): DatatableAction[] => {
    if (this.isDraft(row)) {
      return [];
    }
    return [{ key: "delete", label: this.i18n.translate("novel.translation.dict.delete"), icon: "trash", danger: true, handler: this.removeRow.bind(this) }];
  };

  readonly canEditCell = (row: object): boolean => !this.isDraft(row);

  get tableColumns(): DatatableColumn[] {
    return [
      { key: "src", label: this.i18n.translate("novel.translation.dict.col.src"), editable: true, width: "24%" },
      { key: "dst", label: this.i18n.translate("novel.translation.dict.col.dst"), editable: true, width: "24%" },
      { key: "type", label: this.i18n.translate("novel.translation.dict.col.type"), editable: true, editor: "select", options: this.typeOptions(), width: "160px" },
      { key: "note", label: this.i18n.translate("novel.translation.dict.col.note"), editable: true, ellipsis: true },
    ];
  }

  constructor() {
    effect(this.syncDraftFocus.bind(this));
    effect(this.syncNewEntry.bind(this));
  }

  entryOf(row: object): DictEntry {
    return row as DictEntry;
  }

  isDraft(row: object): boolean {
    return this.entryOf(row).id === DRAFT_ID;
  }

  typeKey(type: DictEntryType): I18nKey {
    return DICT_TYPE_KEYS[type];
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  startDraft(): void {
    this.query.set("");
    this.draft.set(emptyDraft());
  }

  cancelDraft(): void {
    this.draft.set(null);
  }

  onDraft(field: DraftField, event: Event): void {
    const draft = this.draft();
    if (draft) {
      this.draft.set({ ...draft, [field]: (event.target as HTMLInputElement).value });
    }
  }

  onDraftType(event: Event): void {
    const draft = this.draft();
    if (draft) {
      this.draft.set({ ...draft, type: (event.target as HTMLSelectElement).value as DictEntryType });
    }
  }

  async addDraft(): Promise<void> {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    if (!draft.src.trim() || !draft.dst.trim()) {
      this.toasts.show(this.i18n.translate("novel.translation.dict.required"), "warning");
      return;
    }
    try {
      const change = await this.translation.addEntry(this.novelId(), draft);
      this.draft.set(null);
      this.announce(change, "novel.translation.dict.added", "novel.translation.dict.addedFlagged");
    } catch (cause) {
      this.fail(cause);
    }
  }

  onDraftKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Enter") {
      void this.addDraft();
    } else if (event.key === "Escape") {
      this.cancelDraft();
    }
  }

  async onCellEdit(edit: DatatableCellEdit): Promise<void> {
    const entry = this.entryOf(edit.row);
    const value = edit.value.trim();
    if (edit.key === "type") {
      await this.update(entry, { type: value as DictEntryType });
      return;
    }
    const field = edit.key as DraftField;
    if ((field === "src" || field === "dst") && !value) {
      this.toasts.show(this.i18n.translate("novel.translation.dict.emptyField"), "warning");
      return;
    }
    if (value !== entry[field]) {
      await this.update(entry, { [field]: value });
    }
  }

  removeRow(row: object): void {
    void this.remove(this.entryOf(row));
  }

  async remove(entry: DictEntry): Promise<void> {
    try {
      await this.translation.removeEntry(this.novelId(), entry.id);
      this.toasts.show(this.i18n.translate("novel.translation.dict.deleted"), "success");
    } catch (cause) {
      this.fail(cause);
    }
  }

  private async update(entry: DictEntry, patch: Partial<DictDraft>): Promise<void> {
    try {
      const change = await this.translation.updateEntry(this.novelId(), entry.id, patch);
      if (change) {
        this.announce(change, "novel.translation.dict.saved", "novel.translation.dict.savedFlagged");
      }
    } catch (cause) {
      this.fail(cause);
    }
  }

  private announce(change: DictChange, plain: I18nKey, flagged: I18nKey): void {
    const message = change.flagged > 0 ? this.i18n.translate(flagged, { count: change.flagged }) : this.i18n.translate(plain);
    this.toasts.show(message, change.flagged > 0 ? "warning" : "success");
  }

  private fail(cause: unknown): void {
    const error = toNovelError(cause);
    if (error.code === "dictionary_duplicate") {
      this.toasts.show(this.i18n.translate("novel.error.dictionaryDuplicate"), "warning");
      return;
    }
    const detail = error.detail;
    this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
  }

  private buildAll(): DictEntry[] {
    return this.translation.of(this.novelId()).dict;
  }

  private buildRows(): DictEntry[] {
    return filterDict(this.all(), this.query());
  }

  private buildTableRows(): DictEntry[] {
    const draft = this.draft();
    return draft ? [{ id: DRAFT_ID, ...draft }, ...this.rows()] : this.rows();
  }

  private typeOptions(): FormOption[] {
    const options: FormOption[] = [];
    for (const type of this.types) {
      options.push({ value: type, label: this.i18n.translate(DICT_TYPE_KEYS[type]) });
    }
    return options;
  }

  private syncNewEntry(): void {
    if (this.translation.viewOf(this.novelId()).newEntry) {
      untracked(this.openDraft.bind(this));
    }
  }

  private openDraft(): void {
    this.translation.consumeEntry(this.novelId());
    this.startDraft();
  }

  private syncDraftFocus(): void {
    this.draftSource()?.nativeElement.focus();
  }
}
