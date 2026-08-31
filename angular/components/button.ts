import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-button',
  templateUrl: './button.html',
})
export class Button {
  readonly variant = input<'primary' | 'outline' | 'ghost' | 'danger'>('outline');
  readonly size = input<'medium' | 'small'>('medium');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly label = input('');
  readonly iconOnly = input(false);
  readonly block = input(false);
  readonly active = input(false);
  readonly disabled = input(false);
  readonly pressed = output<void>();
}
