import { ChangeDetectionStrategy, Component, Input, input, output } from '@angular/core';

export type SegmentOption = { value: string; label: string; disabled?: boolean };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-segments',
  templateUrl: './segments.html',
})
export class Segments {
  readonly label = input('Options');
  readonly options = input<SegmentOption[]>([]);
  @Input() value = '';
  readonly valueChange = output<string>();

  select(value: string): void {
    this.value = value;
    this.valueChange.emit(value);
  }
}
