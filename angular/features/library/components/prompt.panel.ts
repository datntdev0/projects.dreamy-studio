import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { LibraryDialogsService } from '../library.dialogs.service';
import { ASSET_RIGHTS, AssetRights } from '../library.models';
import { LibraryPrompt, PromptKind } from '../library.prompts.models';
import { charCount, promptCode, promptVariables } from '../library.prompts.rules';
import { LibraryPromptService } from '../library.prompts.service';
// prettier-ignore
import { clearTagField, enteredTag, formatBytes, formatIsoMinute, libraryErrorKey, rightsKey } from '../library.rules';
import { LibraryService } from '../library.service';
const MAX_TAGS = 12;
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-prompt-panel',
  imports: [Icon, CoreModule],
  templateUrl: './prompt.panel.html',
  host: { 'data-testid': 'library-prompt-panel' },
})
export class LibraryPromptPanel {
  readonly promptId = input<number | undefined>();
  readonly prompts = inject(LibraryPromptService);
  readonly library = inject(LibraryService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  readonly rights = ASSET_RIGHTS;
  readonly kinds: PromptKind[] = ['image', 'video', 'voice', 'general'];
  readonly prompt = computed(() => {
    const id = this.promptId();
    return id === undefined
      ? this.prompts.selected()
      : (this.prompts.items().find((item) => item.id === id) ?? null);
  });
  code(item: LibraryPrompt): string {
    return promptCode(item.id);
  }
  length(item: LibraryPrompt): number {
    return charCount(item.text);
  }
  variables(item: LibraryPrompt): string[] {
    return promptVariables(item.text);
  }
  variableLabel(variable: string): string {
    return `{{${variable}}}`;
  }
  size(item: LibraryPrompt): string {
    return formatBytes(item.size);
  }
  addedAt(item: LibraryPrompt): string {
    return formatIsoMinute(item.createdAt);
  }
  originKey(item: LibraryPrompt): LanguageKey {
    return item.origin === 'app' ? 'library.origin.app' : 'library.origin.upload';
  }
  rightKey(right: AssetRights): LanguageKey {
    return rightsKey(right);
  }
  kindKey(kind: PromptKind): LanguageKey {
    return `library.prompt.kind.${kind}` as LanguageKey;
  }
  nameBlur(item: LibraryPrompt, event: Event): void {
    const field = event.target as HTMLInputElement;
    const name = field.value.trim();
    if (!name || name === item.name) {
      field.value = item.name;
      return;
    }
    void this.save(item, { name }, true);
  }
  setKind(item: LibraryPrompt, event: Event): void {
    void this.save(item, { kind: fieldValue(event) as PromptKind });
  }
  textChange(item: LibraryPrompt, event: Event): void {
    const field = event.target as HTMLTextAreaElement;
    if (!field.value.trim()) {
      field.value = item.text;
      this.toasts.show(this.languageService.translate('library.prompt.toast.emptyText'), 'warning');
      return;
    }
    void this.save(item, { text: field.value });
  }
  removeTag(item: LibraryPrompt, tag: string): void {
    void this.save(item, { tags: item.tags.filter((value) => value !== tag) });
  }
  addTag(item: LibraryPrompt, event: KeyboardEvent): void {
    const tag = enteredTag(event);
    if (!tag || item.tags.includes(tag) || item.tags.length >= MAX_TAGS) return;
    clearTagField(event);
    void this.save(item, { tags: [...item.tags, tag] });
  }
  setCollection(item: LibraryPrompt, event: Event): void {
    const value = fieldValue(event);
    if (value === '__new') {
      this.dialogs.openCreateCollection();
      return;
    }
    void this.save(item, { collectionId: value ? Number(value) : null });
  }
  setRights(item: LibraryPrompt, event: Event): void {
    void this.save(item, { rights: fieldValue(event) as AssetRights });
  }
  remove(item: LibraryPrompt): void {
    this.confirms.deletePrompts([item.id]);
  }
  private async save(
    item: LibraryPrompt,
    patch: {
      name?: string;
      kind?: PromptKind;
      text?: string;
      tags?: string[];
      collectionId?: number | null;
      rights?: AssetRights;
    },
    renamed = false,
  ): Promise<void> {
    try {
      const updated = await this.prompts.update(item.id, patch);
      if (renamed && updated.name !== patch.name)
        this.toasts.show(
          this.languageService.translate('library.prompt.toast.renamed', { name: updated.name }),
          'warning',
        );
    } catch (cause) {
      this.toasts.show(
        this.languageService.translate(libraryErrorKey(cause) as LanguageKey),
        'danger',
      );
    }
  }
}
