import { ChangeDetectionStrategy, Component, Input, input, output } from '@angular/core';
import { fieldValue } from '@shared/utils/dom';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-slider',
  templateUrl: './slider.html',
})
export class Slider {
  readonly label = input('Value');
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  @Input() value = 0;
  readonly valueChange = output<number>();

  onInput(event: Event): void {
    this.value = Number(fieldValue(event));
    this.valueChange.emit(this.value);
  }
}
