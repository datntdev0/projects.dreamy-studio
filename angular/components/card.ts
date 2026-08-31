import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-card',
  templateUrl: './card.html',
})
export class Card {
  readonly selected = input(false);
  readonly spacious = input(false);
}
