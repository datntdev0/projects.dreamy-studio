import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { StepsView } from '../setup.models';
import { stepsPercent } from '../setup.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-steps-card',
  imports: [Icon, CoreModule],
  templateUrl: './steps-card.component.html',
  host: { 'data-testid': 'steps-card' },
})
export class StepsCard {
  readonly view = input.required<StepsView>();

  readonly status = computed(() => this.view().status);
  readonly percent = computed(() => stepsPercent(this.view().steps));
}
