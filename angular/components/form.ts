import { Component, EventEmitter, Input, Output } from "@angular/core";

export type FormOption = { value: string; label: string; disabled?: boolean };

let formId = 0;

@Component({
  selector: "ds-form",
  standalone: true,
  templateUrl: "./form.html",
})
export class Form {
  @Input() kind: "input" | "select" | "textarea" | "checkbox" = "input";
  @Input() inputType: "text" | "email" | "password" | "number" = "text";
  @Input() label = "";
  @Input() value = "";
  @Input() checked = false;
  @Input() placeholder = "";
  @Input() hint = "";
  @Input() error = "";
  @Input() options: FormOption[] = [];
  @Input() required = false;
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();
  @Output() checkedChange = new EventEmitter<boolean>();
  readonly controlId = `ds-form-${++formId}`;
  readonly descriptionId = `${this.controlId}-description`;

  onValue(event: Event): void {
    this.value = (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
    this.valueChange.emit(this.value);
  }

  onChecked(event: Event): void {
    this.checked = (event.target as HTMLInputElement).checked;
    this.checkedChange.emit(this.checked);
  }
}
