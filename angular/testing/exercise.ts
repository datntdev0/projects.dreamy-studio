import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

export interface Mounted<T> {
  fixture: ComponentFixture<T>;
  root: HTMLElement;
  instance: T;
}

export async function settle(fixture: ComponentFixture<unknown>, rounds = 3): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
}

export async function mount<T>(
  type: Type<T>,
  inputs: Record<string, unknown> = {},
  configure: () => void | Promise<void> = () => undefined,
): Promise<Mounted<T>> {
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
  await configure();
  const fixture = TestBed.createComponent(type);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  await settle(fixture);
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    instance: fixture.componentInstance,
  };
}

const CLICKABLE =
  "button:not([disabled]), a[href], [role='button'], [role='tab'], [role='menuitem'], [role='option'], summary, label:has(input)";
const FIELDS = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
const KEYS = [
  'Enter',
  ' ',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Escape',
];

function fill(
  field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  step: number,
): void {
  if (field instanceof HTMLSelectElement) {
    const options = Array.from(field.options);
    if (options.length > 0) {
      field.value = options[step % options.length].value;
    }
  } else if (
    field instanceof HTMLInputElement &&
    (field.type === 'checkbox' || field.type === 'radio')
  ) {
    field.checked = !field.checked;
  } else if (
    field instanceof HTMLInputElement &&
    (field.type === 'range' || field.type === 'number')
  ) {
    field.value = String(5 + step);
  } else if (field instanceof HTMLInputElement && field.type === 'file') {
    return;
  } else {
    field.value = step % 2 === 0 ? 'sample text' : '';
  }
  for (const name of ['input', 'change', 'blur']) {
    field.dispatchEvent(new Event(name, { bubbles: true }));
  }
}

export async function exercise(mounted: Mounted<unknown>, rounds = 2): Promise<void> {
  const { fixture, root } = mounted;
  for (let round = 0; round < rounds; round++) {
    const fields = Array.from(root.querySelectorAll<HTMLInputElement>(FIELDS));
    for (const [index, field] of fields.entries()) {
      if (field.isConnected) {
        fill(field, index + round);
        fixture.detectChanges();
      }
    }
    await settle(fixture, 1);
    const targets = Array.from(root.querySelectorAll<HTMLElement>(`${CLICKABLE}, [data-testid]`));
    for (const target of targets) {
      if (!target.isConnected) {
        continue;
      }
      target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, view: window }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
      );
      for (const key of KEYS) {
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        );
      }
      target.dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();
    }
    await settle(fixture, 1);
  }
}

export interface ComponentCase {
  name: string;
  type: Type<unknown>;
  inputs?: Record<string, unknown>;
  before?: () => void | Promise<void>;
  after?: (mounted: Mounted<unknown>) => void | Promise<void>;
}

export function describeComponents(
  title: string,
  cases: ComponentCase[],
  world: () => void | Promise<void>,
): void {
  describe(title, () => {
    for (const entry of cases) {
      it(`${entry.name} renders and responds to interaction`, async () => {
        await world();
        const mounted = await mount(entry.type, entry.inputs ?? {}, entry.before);
        expect(
          mounted.root.getAttribute('data-testid') ??
            mounted.root.querySelector('[data-testid]')?.getAttribute('data-testid'),
        ).toBeTruthy();
        await exercise(mounted);
        if (entry.after) {
          await entry.after(mounted);
        }
        mounted.fixture.destroy();
      });
    }
  });
}
