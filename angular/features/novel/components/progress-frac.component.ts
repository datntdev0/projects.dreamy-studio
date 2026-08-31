import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '@components/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-progress-frac',
  imports: [Icon],
  templateUrl: './progress-frac.component.html',
})
export class NovelProgressFrac {
  readonly icon = input('lang');
  readonly done = input(0);
  readonly total = input(0);
  readonly label = input('');

  get isFull(): boolean {
    return this.total() > 0 && this.done() >= this.total();
  }

  get isPart(): boolean {
    return !this.isFull && this.done() > 0;
  }
}
