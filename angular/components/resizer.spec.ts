import { TestBed } from '@angular/core/testing';
import { byId, rootOf } from '@testing/dom';
import { describe, expect, it } from 'vitest';

import { Resizer } from './resizer';

function make(size = 236) {
  const fixture = TestBed.createComponent(Resizer);
  fixture.componentRef.setInput('size', size);
  fixture.componentRef.setInput('min', 180);
  fixture.componentRef.setInput('max', 420);
  fixture.componentRef.setInput('initial', 236);
  fixture.componentRef.setInput('label', 'Resize chapter list');
  fixture.detectChanges();
  const handle = byId(rootOf(fixture), 'resizer') as HTMLElement;
  return { fixture, handle, instance: fixture.componentInstance };
}

function pointer(handle: HTMLElement, type: string, clientX: number): void {
  handle.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true, cancelable: true }));
}

function press(handle: HTMLElement, key: string, shiftKey = false): void {
  handle.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, cancelable: true }));
}

describe('Resizer', () => {
  it('resizes by dragging within its limits', () => {
    const { fixture, handle, instance } = make();
    expect(handle.getAttribute('aria-label')).toBe('Resize chapter list');
    pointer(handle, 'pointerdown', 100);
    fixture.detectChanges();
    expect(handle.classList).toContain('is-active');
    pointer(handle, 'pointermove', 150);
    expect(instance.size()).toBe(286);
    pointer(handle, 'pointermove', 900);
    expect(instance.size()).toBe(420);
    pointer(handle, 'pointerup', 900);
    pointer(handle, 'pointermove', 0);
    expect(instance.size()).toBe(420);
    expect(instance.dragging()).toBe(false);
  });

  it('resizes with the keyboard and resets to the initial size', () => {
    const { handle, instance } = make();
    press(handle, 'ArrowRight');
    expect(instance.size()).toBe(246);
    press(handle, 'ArrowLeft', true);
    expect(instance.size()).toBe(206);
    press(handle, 'Enter');
    expect(instance.size()).toBe(206);
    press(handle, 'Home');
    expect(instance.size()).toBe(236);
    instance.size.set(300);
    handle.dispatchEvent(new MouseEvent('dblclick'));
    expect(instance.size()).toBe(236);
    pointer(handle, 'pointerdown', 0);
    pointer(handle, 'pointermove', -500);
    expect(instance.size()).toBe(180);
  });
});
