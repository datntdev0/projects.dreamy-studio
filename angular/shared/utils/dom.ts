type TextField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function fieldValue(event: Event): string {
  return (event.target as TextField).value;
}

export function setFieldValue(event: Event, value: string): void {
  (event.target as TextField).value = value;
}

export function fieldChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}

const FIELD_SELECTOR = 'input,textarea,select';
const MODAL_SELECTOR = '.modal';

export function isFieldTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIELD_SELECTOR) !== null;
}

export function isDeleteShortcut(event: KeyboardEvent): boolean {
  return event.key === 'Delete' && !isFieldTarget(event.target);
}

export function isModalOpen(): boolean {
  return document.querySelector(MODAL_SELECTOR) !== null;
}
