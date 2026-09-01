import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { AudiobookContext } from '../audiobook.models';
import { AudiobookLabels } from './audiobook.labels';
import { AudiobookNavigation } from './audiobook.navigation';

export type AudiobookEmptyVariant = 'blank' | 'script' | 'meta';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-empty',
  imports: [Icon, CoreModule],
  templateUrl: './empty.component.html',
})
export class AudiobookEmpty {
  protected readonly labels = inject(AudiobookLabels);
  private readonly navigation = inject(AudiobookNavigation);

  readonly ctx = input.required<AudiobookContext>();
  readonly variant = computed(this.buildVariant.bind(this));
  readonly unit = computed(this.buildUnit.bind(this));
  readonly unitLower = computed(this.buildUnitLower.bind(this));
  readonly stateKey = computed(this.buildStateKey.bind(this));

  openScripting(): void {
    this.navigation.openScripting(this.ctx().projectId);
  }

  private buildVariant(): AudiobookEmptyVariant {
    const unit = this.ctx().unit;
    if (unit?.blocks) {
      return 'blank';
    }
    return unit?.meta ? 'meta' : 'script';
  }

  private buildUnit(): string {
    return this.labels.unit(this.ctx());
  }

  private buildUnitLower(): string {
    return this.labels.unitLower(this.ctx());
  }

  private buildStateKey(): LanguageKey {
    return `audiobook.editor.empty.meta.${this.ctx().stat?.state ?? 'none'}` as LanguageKey;
  }
}
