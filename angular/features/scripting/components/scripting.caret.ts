const TEXT_SELECTOR = '.sc-t[data-id]';

export function placeCaret(element: HTMLElement): void {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function textFieldsIn(scope: Element | null): HTMLElement[] {
  return Array.from(scope?.querySelectorAll<HTMLElement>(TEXT_SELECTOR) ?? []);
}

function atStart(selection: Selection | null): boolean {
  return !!selection && selection.isCollapsed && selection.anchorOffset === 0;
}

function atEnd(selection: Selection | null, element: HTMLElement): boolean {
  return (
    !!selection && selection.isCollapsed && selection.anchorOffset >= element.textContent.length
  );
}

export function arrowTarget(
  key: string,
  element: HTMLElement,
  fields: HTMLElement[],
): HTMLElement | null {
  const selection = getSelection();
  const index = fields.indexOf(element);
  if (key === 'ArrowUp' && atStart(selection)) {
    return fields[index - 1] ?? null;
  }
  if (key === 'ArrowDown' && atEnd(selection, element)) {
    return fields[index + 1] ?? null;
  }
  return null;
}
