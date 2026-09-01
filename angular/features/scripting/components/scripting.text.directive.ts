import { Directive, effect, ElementRef, inject, input, output } from '@angular/core';

@Directive({
  selector: '[appScriptingText]',
  host: {
    contenteditable: 'plaintext-only',
    '(input)': 'emitText()',
  },
})
export class ScriptingText {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly value = input.required<string>({ alias: 'appScriptingText' });
  readonly edited = output<string>();

  constructor() {
    effect(this.syncText.bind(this));
  }

  emitText(): void {
    this.edited.emit(this.element.textContent);
  }

  private syncText(): void {
    const text = this.value();
    if (this.element.textContent !== text) {
      this.element.textContent = text;
    }
  }
}
