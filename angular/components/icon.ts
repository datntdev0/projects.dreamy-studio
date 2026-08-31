import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-icon',
  templateUrl: './icon.html',
})
export class Icon {
  readonly name = input('plus');
  readonly size = input(18);
  readonly label = input('');
}
