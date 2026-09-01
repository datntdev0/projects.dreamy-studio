import { computed, effect, inject, untracked } from '@angular/core';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { escapeHtml } from '../../scripting/scripting.dialogs.rules';
import { AudiobookDialogKind, AudiobookDialogsService } from '../audiobook.dialogs.service';
import { AudiobookContext } from '../audiobook.models';
import { AudiobookService } from '../audiobook.service';

const BOLD_MARK = '%%bold%%';

export abstract class AudiobookDialogBase {
  protected readonly audiobook = inject(AudiobookService);
  protected readonly dialogs = inject(AudiobookDialogsService);
  protected readonly toasts = inject(ToastService);
  protected readonly languageService = inject(LanguageService);

  readonly projectId = computed(this.buildProjectId.bind(this));
  readonly ctx = computed(this.buildContext.bind(this));
  readonly open = computed(this.buildOpen.bind(this));
  readonly unitName = computed(this.buildUnitName.bind(this));
  readonly unitNo = computed(this.buildUnitNo.bind(this));

  protected constructor(private readonly kind: AudiobookDialogKind) {
    effect(this.guard.bind(this));
  }

  close(): void {
    this.dialogs.close();
  }

  protected admits(ctx: AudiobookContext): boolean {
    return ctx.unit !== null;
  }

  protected boldHtml(
    key: LanguageKey,
    params: Record<string, string | number>,
    name: string,
    value: string,
  ): string {
    const text = this.languageService.translate(key, { ...params, [name]: BOLD_MARK });
    return escapeHtml(text).replace(BOLD_MARK, `<b>${escapeHtml(value)}</b>`);
  }

  private buildProjectId(): number | null {
    return this.dialogs.projectIdOf(this.kind);
  }

  private buildContext(): AudiobookContext | null {
    const projectId = this.projectId();
    return projectId === null ? null : this.audiobook.contextOf(projectId);
  }

  private buildOpen(): boolean {
    const ctx = this.ctx();
    return ctx !== null && this.admits(ctx);
  }

  private buildUnitName(): string {
    const ctx = this.ctx();
    return ctx
      ? this.languageService.translate(`scripting.unit.${ctx.unitKind}` as LanguageKey)
      : '';
  }

  private buildUnitNo(): number {
    return this.ctx()?.unit?.no ?? 0;
  }

  private guard(): void {
    if (this.projectId() === null) {
      return;
    }
    const ctx = this.ctx();
    if (ctx !== null && this.admits(ctx)) {
      return;
    }
    untracked(this.close.bind(this));
  }
}
