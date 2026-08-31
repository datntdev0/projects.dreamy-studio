import { ChangeDetectionStrategy, Component, Input, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-chip',
  templateUrl: './chip.html',
})
export class Chip {
  readonly label = input('');
  @Input() selected = false;
  readonly removable = input(false);
  readonly disabled = input(false);
  readonly selectedChange = output<boolean>();
  readonly removed = output<void>();

  toggle(): void {
    this.selected = !this.selected;
    this.selectedChange.emit(this.selected);
  }
}
