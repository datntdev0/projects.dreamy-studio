import { ChangeDetectionStrategy, Component, computed, HostListener, inject } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { LibraryDialogsService } from '../library.dialogs.service';
import { AssetRef } from '../library.models';
import { LibraryPrompt } from '../library.prompts.models';
import { promptCode, promptMeta, promptSegments } from '../library.prompts.rules';
import { LibraryPromptService } from '../library.prompts.service';
import { formatBytes, rightsKey } from '../library.rules';
import { LibraryService } from '../library.service';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-prompt-preview-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './prompt-preview.dialog.html',
  host: { 'data-testid': 'library-prompt-preview-dialog' },
})
export class LibraryPromptPreviewDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  readonly prompts = inject(LibraryPromptService);
  readonly library = inject(LibraryService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  readonly prompt = computed(
    () => this.prompts.items().find((item) => item.id === this.dialogs.previewPromptId()) ?? null,
  );
  readonly open = computed(() => this.prompt() !== null);
  readonly sequence = computed(
    () =>
      this.dialogs.previewSequence() ??
      this.prompts.visible().map((item) => ({ kind: 'prompt' as const, id: item.id })),
  );
  readonly position = computed(() => {
    const item = this.prompt();
    const sequence = this.sequence();
    return {
      index: item ? sequence.findIndex((ref) => ref.kind === 'prompt' && ref.id === item.id) : -1,
      total: sequence.length,
    };
  });
  hasPrevious(): boolean {
    return this.position().index > 0;
  }
  hasNext(): boolean {
    const position = this.position();
    return position.index >= 0 && position.index + 1 < position.total;
  }
  code(item: LibraryPrompt): string {
    return promptCode(item.id);
  }
  meta(item: LibraryPrompt): number {
    return promptMeta(item);
  }
  size(item: LibraryPrompt): string {
    return formatBytes(item.size);
  }
  rights(item: LibraryPrompt): LanguageKey {
    return rightsKey(item.rights);
  }
  kind(item: LibraryPrompt): LanguageKey {
    return `library.prompt.kind.${item.kind}` as LanguageKey;
  }
  segments(item: LibraryPrompt) {
    return promptSegments(item.text);
  }
  collection(item: LibraryPrompt): string {
    return item.collectionId === null
      ? ''
      : (this.library.collectionById(item.collectionId)?.name ?? '—');
  }
  close(): void {
    this.dialogs.closePreview();
  }
  previous(): void {
    this.move(-1);
  }
  next(): void {
    this.move(1);
  }
  async copy(item: LibraryPrompt): Promise<void> {
    if (await this.prompts.copy(item.id))
      this.toasts.show(this.languageService.translate('library.prompt.toast.copied'));
    else
      this.toasts.show(
        this.languageService.translate('library.prompt.toast.copyFailed'),
        'warning',
      );
  }
  @HostListener('document:keydown', ['$event']) onKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previous();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    }
  }
  private move(offset: number): void {
    const ref = this.sequence()[this.position().index + offset];
    if (ref) this.dialogs.openPreviewRef(ref as AssetRef, this.sequence());
  }
}
