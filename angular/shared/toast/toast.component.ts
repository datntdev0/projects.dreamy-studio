import { ChangeDetectionStrategy, Component, Input, input, output } from '@angular/core';
import { Icon } from '@components/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-toast',
  imports: [Icon],
  templateUrl: './toast.component.html',
})
export class Toast {
  readonly message = input('');
  readonly tone = input<'success' | 'warning' | 'danger' | 'info'>('success');
  readonly dismissible = input(true);
  @Input() visible = true;
  readonly dismissed = output<void>();

  dismiss(): void {
    this.visible = false;
    this.dismissed.emit();
  }
}
