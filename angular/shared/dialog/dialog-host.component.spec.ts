import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { click } from '@testing/dom';
import { describe, expect, it } from 'vitest';

import { DialogItem } from './dialog.models';
import { DialogService } from './dialog.service';
import { DialogHost } from './dialog-host.component';

@Component({
  selector: 'app-thumb-probe',
  template: "<i data-testid='probe-thumb'>{{ item().name }}</i>",
})
class ThumbProbe {
  readonly item = input.required<DialogItem>();
}

function mount() {
  const fixture = TestBed.createComponent(DialogHost);
  fixture.detectChanges();
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    dialogs: TestBed.inject(DialogService),
  };
}

function query(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector(`[data-testid="${id}"]`);
}

describe('DialogHost', () => {
  it('renders nothing without a request', () => {
    const { root } = mount();
    expect(query(root, 'dialog-host-panel')).toBeNull();
  });

  it('renders the full request and resolves on accept', async () => {
    const { fixture, root, dialogs } = mount();
    const answer = dialogs.ask({
      title: 'Delete',
      eyebrow: 'Danger',
      message: 'Sure?',
      items: [{ name: 'a', meta: 'm', icon: 'x' }, { name: 'b' }, { name: 'c' }],
      itemLimit: 2,
      moreLabel: 'and more',
      warning: 'careful',
      note: 'note',
      confirmLabel: 'Yes',
      confirmIcon: 'check',
    });
    fixture.detectChanges();
    expect(query(root, 'dialog-host-message')?.textContent).toBe('Sure?');
    expect(root.querySelectorAll("[data-testid='dialog-host-row']")).toHaveLength(2);
    expect(query(root, 'dialog-host-more')?.textContent?.trim()).toBe('and more');
    expect(query(root, 'dialog-host-warning')).not.toBeNull();
    expect(query(root, 'dialog-host-note')).not.toBeNull();
    click(root, 'dialog-host-accept');
    expect(await answer).toBe(true);
  });

  it('renders custom thumbs and cancels', async () => {
    const { fixture, root, dialogs } = mount();
    const answer = dialogs.ask({
      title: 't',
      items: [{ name: 'a' }],
      thumb: ThumbProbe,
      confirmLabel: 'ok',
    });
    fixture.detectChanges();
    expect(query(root, 'probe-thumb')?.textContent).toBe('a');
    click(root, 'dialog-host-cancel');
    expect(await answer).toBe(false);
  });

  it('renders item images as covers', () => {
    const { fixture, root, dialogs } = mount();
    dialogs.ask({
      title: 't',
      items: [
        { name: 'a', image: () => 'data:image/png;base64,AAAA' },
        { name: 'b', image: () => null },
      ],
      confirmLabel: 'ok',
    });
    fixture.detectChanges();
    const covers = root.querySelectorAll("[data-testid='dialog-host-cover']");
    expect(covers).toHaveLength(2);
    expect(covers[0].querySelector("[data-testid='cover']")?.classList).not.toContain('is-empty');
    expect(covers[1].querySelector("[data-testid='cover']")?.classList).toContain('is-empty');
  });

  it('gates the confirm button behind the acknowledgement', () => {
    const { fixture, root, dialogs } = mount();
    dialogs.ask({ title: 't', acknowledge: 'I know', confirmLabel: 'ok' });
    fixture.detectChanges();
    expect(fixture.componentInstance.blocked()).toBe(true);
    const box = query(root, 'dialog-host-acknowledge') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.blocked()).toBe(false);
  });

  it('shows the error and closes on escape', async () => {
    const { fixture, root, dialogs } = mount();
    const answer = dialogs.ask({
      title: 't',
      confirmLabel: 'ok',
      onConfirm: () => Promise.reject(new Error('bad')),
    });
    await dialogs.accept();
    fixture.detectChanges();
    expect(query(root, 'dialog-host-error')?.textContent).toContain('bad');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await answer).toBe(false);
  });

  it('reports hidden counts only with a limit', () => {
    const { fixture, dialogs } = mount();
    expect(fixture.componentInstance.hidden()).toBe(0);
    dialogs.ask({ title: 't', items: [{ name: 'a' }, { name: 'b' }], confirmLabel: 'ok' });
    expect(fixture.componentInstance.hidden()).toBe(0);
    expect(fixture.componentInstance.shown()).toHaveLength(2);
    expect(fixture.componentInstance.thumb()).toBeNull();
  });
});
