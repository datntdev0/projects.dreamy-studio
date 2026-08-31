import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a toast and dismisses it after its lifetime', () => {
    const toasts = TestBed.inject(ToastService);
    toasts.show('saved');
    toasts.show('oops', 'danger');
    expect(toasts.items().map((item) => item.tone)).toEqual(['success', 'danger']);
    vi.advanceTimersByTime(4000);
    expect(toasts.items()).toEqual([]);
  });

  it('dismisses a single toast', () => {
    const toasts = TestBed.inject(ToastService);
    toasts.show('a');
    toasts.show('b');
    toasts.dismiss(toasts.items()[0].id);
    expect(toasts.items().map((item) => item.message)).toEqual(['b']);
  });
});
