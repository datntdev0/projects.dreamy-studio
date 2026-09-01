import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { ScriptingDialogsService } from '../scripting.dialogs.service';
import { ScriptingService } from '../scripting.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-default-dialog',
  template: '',
  host: { 'data-testid': 'scripting-default-dialog' },
})
export class ScriptingDefaultDialog {
  private readonly scripting = inject(ScriptingService);
  private readonly dialogs = inject(ScriptingDialogsService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  constructor() {
    effect(this.run.bind(this));
  }

  private run(): void {
    const projectId = this.dialogs.projectIdOf('default');
    if (projectId !== null) {
      untracked(this.apply.bind(this, projectId));
    }
  }

  private apply(projectId: number): void {
    const created = this.scripting.applyDefault(projectId);
    this.dialogs.close();
    if (created) {
      this.toasts.show(this.languageService.translate('scripting.dialog.default.toast'));
    }
  }
}
