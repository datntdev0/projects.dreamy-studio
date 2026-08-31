import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let tooltipId = 0;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-tooltip',
  templateUrl: './tooltip.html',
})
export class Tooltip {
  readonly text = input('');
  readonly position = input<'top' | 'bottom' | 'right'>('bottom');
  readonly id = `ds-tooltip-${++tooltipId}`;
}
