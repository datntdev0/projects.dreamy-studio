import { computed, effect, inject, untracked } from '@angular/core';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { capitalize } from '../scripting.dialogs.rules';
import { ScriptingDialogKind, ScriptingDialogsService } from '../scripting.dialogs.service';
import { ScriptContext, ScriptUnitKind } from '../scripting.models';
import { ScriptingService } from '../scripting.service';

export abstract class ScriptingDialogBase {
  protected readonly scripting = inject(ScriptingService);
  protected readonly dialogs = inject(ScriptingDialogsService);
  protected readonly toasts = inject(ToastService);
  protected readonly languageService = inject(LanguageService);

  readonly projectId = computed(this.buildProjectId.bind(this));
  readonly ctx = computed(this.buildContext.bind(this));
  readonly open = computed(this.buildOpen.bind(this));
  readonly unitName = computed(this.buildUnitName.bind(this));
  readonly unitTitle = computed(this.buildUnitTitle.bind(this));
  readonly unitNo = computed(this.buildUnitNo.bind(this));

  protected constructor(private readonly kind: ScriptingDialogKind) {
    effect(this.guard.bind(this));
  }

  close(): void {
    this.dialogs.close();
  }

  protected admits(ctx: ScriptContext): boolean {
    return ctx.unit !== null && !ctx.locked;
  }

  protected pending(): boolean {
    return false;
  }

  protected unitWord(kind: ScriptUnitKind, plural = false): string {
    const key = plural ? `scripting.dialog.plural.${kind}` : `scripting.unit.${kind}`;
    return this.languageService.translate(key as LanguageKey);
  }

  protected countOf(kind: ScriptUnitKind, count: number): string {
    return this.languageService.translate('scripting.dialog.count', {
      count,
      noun: this.unitWord(kind, count !== 1),
    });
  }

  private buildProjectId(): number | null {
    return this.dialogs.projectIdOf(this.kind);
  }

  private buildContext(): ScriptContext | null {
    const projectId = this.projectId();
    return projectId === null ? null : this.scripting.contextOf(projectId);
  }

  private buildOpen(): boolean {
    const ctx = this.ctx();
    return ctx !== null && this.admits(ctx) && !this.pending();
  }

  private buildUnitName(): string {
    const ctx = this.ctx();
    return ctx ? this.unitWord(ctx.config.unit) : '';
  }

  private buildUnitNo(): number {
    return this.ctx()?.unit?.no ?? 0;
  }

  private buildUnitTitle(): string {
    return capitalize(this.unitName());
  }

  private guard(): void {
    if (this.projectId() === null) {
      return;
    }
    const ctx = this.ctx();
    if (ctx !== null && this.admits(ctx)) {
      return;
    }
    untracked(this.reject.bind(this, ctx));
  }

  protected reject(ctx: ScriptContext | null): void {
    void ctx;
    this.close();
  }
}
