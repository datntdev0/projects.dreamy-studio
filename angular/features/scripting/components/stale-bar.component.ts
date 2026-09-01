import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { ScriptContext } from '../scripting.models';
import { ScriptingService } from '../scripting.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-stale-bar',
  imports: [Icon, CoreModule],
  templateUrl: './stale-bar.component.html',
})
export class ScriptingStaleBar {
  private readonly scripting = inject(ScriptingService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly ctx = input.required<ScriptContext>();
  readonly reference = input.required<string>();
  readonly before = input.required<string>();
  readonly now = input.required<string>();

  regenerate(): void {
    if (!this.ctx().locked) {
      this.scripting.regenerate(this.ctx().projectId, this.reference());
      this.toasts.show(
        this.languageService.translate('scripting.editor.stale.regenerated'),
        'info',
      );
    }
  }

  keep(): void {
    if (!this.ctx().locked) {
      this.scripting.keepStale(this.ctx().projectId, this.reference());
      this.toasts.show(this.languageService.translate('scripting.editor.stale.kept'), 'info');
    }
  }
}
