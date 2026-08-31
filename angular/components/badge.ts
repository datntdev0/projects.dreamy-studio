import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-badge',
  templateUrl: './badge.html',
})
export class Badge {
  readonly tone = input<
    'default' | 'primary' | 'running' | 'success' | 'warning' | 'danger' | 'info'
  >('default');
}
