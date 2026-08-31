import { ChangeDetectionStrategy, Component, Input, input, output } from '@angular/core';
import { fieldChecked, fieldValue } from '@shared/utils/dom';

export type FormOption = { value: string; label: string; disabled?: boolean };

let formId = 0;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-form',
  templateUrl: './form.html',
})
export class Form {
  readonly kind = input<'input' | 'select' | 'textarea' | 'checkbox'>('input');
  readonly inputType = input<'text' | 'email' | 'password' | 'number'>('text');
  readonly label = input('');
  @Input() value = '';
  @Input() checked = false;
  readonly placeholder = input('');
  @Input() hint = '';
  @Input() error = '';
  readonly options = input<FormOption[]>([]);
  readonly required = input(false);
  readonly disabled = input(false);
  readonly valueChange = output<string>();
  readonly checkedChange = output<boolean>();
  readonly controlId = `ds-form-${++formId}`;
  readonly descriptionId = `${this.controlId}-description`;

  onValue(event: Event): void {
    this.value = fieldValue(event);
    this.valueChange.emit(this.value);
  }

  onChecked(event: Event): void {
    this.checked = fieldChecked(event);
    this.checkedChange.emit(this.checked);
  }
}
