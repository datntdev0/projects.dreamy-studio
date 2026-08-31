import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast } from '@shared/toast/toast.component';

import { ToastService } from './toast.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-toast-host',
  imports: [Toast],
  templateUrl: './toast-host.component.html',
  host: { 'data-testid': 'toast-host' },
})
export class ToastHost {
  private readonly toasts = inject(ToastService);

  readonly items = this.toasts.items;

  dismiss(id: number): void {
    this.toasts.dismiss(id);
  }
}
