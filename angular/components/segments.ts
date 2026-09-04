import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type SegmentOption = { value: string; label: string; disabled?: boolean };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-segments',
  templateUrl: './segments.html',
})
export class Segments {
  readonly label = input('Options');
  readonly options = input<SegmentOption[]>([]);
  readonly value = input('');
  readonly valueChange = output<string>();

  select(value: string): void {
    this.valueChange.emit(value);
  }
}
