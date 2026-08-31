import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { DialogService } from './dialog.service';

function service(): DialogService {
  return TestBed.inject(DialogService);
}

describe('DialogService', () => {
  it('resolves true on accept', async () => {
    const dialogs = service();
    const answer = dialogs.ask({ title: 't', confirmLabel: 'ok' });
    expect(dialogs.current()?.options.title).toBe('t');
    await dialogs.accept();
    expect(await answer).toBe(true);
    expect(dialogs.current()).toBeNull();
  });

  it('resolves false on cancel and when replaced', async () => {
    const dialogs = service();
    const first = dialogs.ask({ title: 'a', confirmLabel: 'ok' });
    const second = dialogs.ask({ title: 'b', confirmLabel: 'ok' });
    expect(await first).toBe(false);
    dialogs.cancel();
    expect(await second).toBe(false);
  });

  it('ignores accept without a request and while busy', async () => {
    const dialogs = service();
    await dialogs.accept();
    dialogs.ask({ title: 'a', confirmLabel: 'ok' });
    dialogs.busy.set(true);
    await dialogs.accept();
    dialogs.cancel();
    expect(dialogs.current()).not.toBeNull();
  });

  it('requires acknowledgement before accepting', async () => {
    const dialogs = service();
    const answer = dialogs.ask({ title: 'a', confirmLabel: 'ok', acknowledge: 'sure' });
    await dialogs.accept();
    expect(dialogs.current()).not.toBeNull();
    dialogs.acknowledge(true);
    await dialogs.accept();
    expect(await answer).toBe(true);
  });

  it('runs onConfirm and keeps the dialog open with the error when it fails', async () => {
    const dialogs = service();
    dialogs.ask({
      title: 'a',
      confirmLabel: 'ok',
      onConfirm: () => Promise.reject(new Error('boom')),
    });
    await dialogs.accept();
    expect(dialogs.error()).toBe('boom');
    expect(dialogs.busy()).toBe(false);
    expect(dialogs.current()).not.toBeNull();
  });

  it('describes string failures and unknown failures', async () => {
    const dialogs = service();
    dialogs.ask({ title: 'a', confirmLabel: 'ok', onConfirm: () => Promise.reject('text') });
    await dialogs.accept();
    expect(dialogs.error()).toBe('text');
    dialogs.ask({ title: 'a', confirmLabel: 'ok', onConfirm: () => Promise.reject(42) });
    await dialogs.accept();
    expect(dialogs.error()).toBe('');
  });

  it('does not report a failure after the dialog was replaced', async () => {
    const dialogs = service();
    let fail: (cause: unknown) => void = () => undefined;
    dialogs.ask({
      title: 'a',
      confirmLabel: 'ok',
      onConfirm: () => new Promise<void>((_, reject) => (fail = reject)),
    });
    const pending = dialogs.accept();
    dialogs.busy.set(false);
    dialogs.ask({ title: 'b', confirmLabel: 'ok' });
    fail(new Error('late'));
    await pending;
    expect(dialogs.error()).toBeNull();
  });

  it('does not settle a replaced dialog after onConfirm resolves', async () => {
    const dialogs = service();
    let done: () => void = () => undefined;
    const first = dialogs.ask({
      title: 'a',
      confirmLabel: 'ok',
      onConfirm: () => new Promise<void>((resolve) => (done = resolve)),
    });
    const pending = dialogs.accept();
    dialogs.busy.set(false);
    dialogs.ask({ title: 'b', confirmLabel: 'ok' });
    done();
    await pending;
    expect(await first).toBe(false);
    expect(dialogs.current()?.options.title).toBe('b');
  });
});
