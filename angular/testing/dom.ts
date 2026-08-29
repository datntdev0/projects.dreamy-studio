import { ComponentFixture } from "@angular/core/testing";

export function byId(root: HTMLElement, id: string): HTMLElement | null {
  const selector = `[data-testid="${id}"]`;
  return root.matches(selector) ? root : root.querySelector(selector);
}

export function allById(root: HTMLElement, id: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
}

export function click(root: HTMLElement, id: string): void {
  const target = byId(root, id);
  if (target === null) {
    throw new Error(`No element with data-testid="${id}"`);
  }
  const inner = target.tagName === "DS-BUTTON" ? target.querySelector("button") : null;
  (inner ?? target).click();
}

export function type(root: HTMLElement, id: string, value: string): void {
  const target = byId(root, id) as HTMLInputElement | null;
  if (target === null) {
    throw new Error(`No element with data-testid="${id}"`);
  }
  target.value = value;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

export function rootOf(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}
