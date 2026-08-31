import { ComponentFixture, TestBed } from '@angular/core/testing';
import { allById, byId, click, rootOf, type } from '@testing/dom';
import { describe, expect, it, vi } from 'vitest';

import { Badge } from './badge';
import { Breadcrumbs } from './breadcrumbs';
import { Button } from './button';
import { Card } from './card';
import { Chip } from './chip';
import { Cover, coverBackground } from './cover';
import { Form } from './form';
import { Icon } from './icon';
import { Segments } from './segments';
import { Slider } from './slider';
import { Tabs } from './tabs';
import { Tooltip } from './tooltip';

function press(fixture: ComponentFixture<unknown>, list: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  list.dispatchEvent(event);
  fixture.detectChanges();
  return event;
}

function make<T>(type: new () => T, inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(type);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return { fixture, root: rootOf(fixture), instance: fixture.componentInstance };
}

describe('Badge, Card, Icon and Tooltip', () => {
  it('render their host elements', () => {
    expect(make(Badge, { tone: 'success' }).instance.tone()).toBe('success');
    expect(byId(make(Card, { selected: true, spacious: true }).root, 'card')?.className).toContain(
      'is-selected',
    );
    expect(
      make(Icon, { name: 'x', size: 20, label: 'close' }).root.querySelector('svg'),
    ).not.toBeNull();
    const tooltip = make(Tooltip, { text: 'Hello', position: 'right' });
    expect(byId(tooltip.root, 'tooltip')?.classList.contains('is-right')).toBe(true);
    expect(tooltip.root.querySelector("[role='tooltip']")?.textContent).toBe('Hello');
    expect(make(Tooltip, { position: 'top' }).instance.id).toMatch(/^ds-tooltip-/);
  });
});

describe('Button', () => {
  it('emits pressed and reflects variants', () => {
    const { fixture, root, instance } = make(Button, {
      variant: 'danger',
      size: 'small',
      iconOnly: true,
      block: true,
      active: true,
      label: 'Go',
    });
    const pressed = vi.fn();
    instance.pressed.subscribe(pressed);
    click(root, 'button');
    expect(pressed).toHaveBeenCalledTimes(1);
    const classes = (byId(root, 'button') as HTMLElement).className;
    expect(classes).toContain('btn-danger');
    expect(classes).toContain('btn-sm');
    expect(classes).toContain('btn-icon');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect((byId(root, 'button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Chip', () => {
  it('toggles and removes', () => {
    const { fixture, root, instance } = make(Chip, { label: 'tag', removable: true });
    const changed = vi.fn();
    const removed = vi.fn();
    instance.selectedChange.subscribe(changed);
    instance.removed.subscribe(removed);
    (root.querySelector('.chip-label') as HTMLElement).click();
    expect(changed).toHaveBeenCalledWith(true);
    (root.querySelector('.chip-remove') as HTMLElement).click();
    expect(removed).toHaveBeenCalled();
    fixture.componentRef.setInput('removable', false);
    fixture.detectChanges();
    expect(root.querySelector('.chip-remove')).toBeNull();
  });
});

describe('Cover', () => {
  it('builds backgrounds and placeholder sizes', () => {
    expect(coverBackground('')).toBe('');
    expect(coverBackground('a.png')).toContain('url("a.png")');
    const empty = make(Cover, { size: 'lg' });
    expect(empty.instance.placeholderSize).toBe(32);
    expect(empty.root.querySelector('.cover-ph')).not.toBeNull();
    expect(make(Cover, { size: 'xs' }).root.querySelector('.cover-ph')).toBeNull();
    expect(make(Cover, { image: 'a.png', size: 'md' }).root.querySelector('.cover-ph')).toBeNull();
    expect(make(Cover).instance.placeholderSize).toBe(12);
  });
});

describe('Breadcrumbs', () => {
  it('emits the index of earlier crumbs', () => {
    const { root, instance } = make(Breadcrumbs, {
      items: [{ label: 'Home', icon: 'home' }, { label: 'Mid' }, { label: 'Now', icon: 'x' }],
    });
    const navigated = vi.fn();
    instance.navigate.subscribe(navigated);
    const buttons = root.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    buttons[1].click();
    expect(navigated).toHaveBeenCalledWith(1);
    expect(root.querySelector("[aria-current='page']")?.textContent).toContain('Now');
  });
});

describe('Form', () => {
  it('handles text, select, textarea and checkbox', () => {
    const text = make(Form, { label: 'Name', required: true, error: 'bad', hint: 'ignored' });
    const values: string[] = [];
    text.instance.valueChange.subscribe((value) => values.push(value));
    type(text.root, 'form', 'x');
    (text.root.querySelector('input') as HTMLInputElement).value = 'typed';
    (text.root.querySelector('input') as HTMLInputElement).dispatchEvent(new Event('input'));
    expect(values).toContain('typed');
    expect(text.root.querySelector('.field-err')?.textContent).toBe('bad');
    const hinted = make(Form, { label: 'Name', hint: 'help' });
    expect(hinted.root.querySelector('.field-hint')?.textContent).toBe('help');
    const select = make(Form, {
      kind: 'select',
      label: 'S',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
      ],
    });
    const picked: string[] = [];
    select.instance.valueChange.subscribe((value) => picked.push(value));
    const element = select.root.querySelector('select') as HTMLSelectElement;
    element.value = 'b';
    element.dispatchEvent(new Event('change'));
    expect(picked).toEqual(['b']);
    const area = make(Form, { kind: 'textarea', label: 'T' });
    (area.root.querySelector('textarea') as HTMLTextAreaElement).dispatchEvent(new Event('input'));
    const check = make(Form, { kind: 'checkbox', label: 'C' });
    const flags: boolean[] = [];
    check.instance.checkedChange.subscribe((value) => flags.push(value));
    const box = check.root.querySelector('input') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(flags).toEqual([true]);
    expect(text.instance.controlId).not.toBe(check.instance.controlId);
  });
});

describe('Segments, Slider and Tabs', () => {
  it('segments select options', () => {
    const { root, instance } = make(Segments, {
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      value: 'a',
    });
    const changed = vi.fn();
    instance.valueChange.subscribe(changed);
    root.querySelectorAll('button')[1].click();
    expect(changed).toHaveBeenCalledWith('b');
    expect(instance.value).toBe('b');
  });

  it('slider emits numeric values', () => {
    const { root, instance } = make(Slider, { min: 0, max: 10, value: 3 });
    const changed = vi.fn();
    instance.valueChange.subscribe(changed);
    type(root, 'slider', '7');
    expect(changed).toHaveBeenCalledWith(7);
  });

  it('tabs select and support keyboard navigation', () => {
    const options = [
      { value: 'a', label: 'A', icon: 'x' },
      { value: 'b', label: 'B', disabled: true },
      { value: 'c', label: 'C' },
    ];
    const { fixture, root, instance } = make(Tabs, { options, value: 'a', idPrefix: 't' });
    const changed = vi.fn();
    instance.valueChange.subscribe(changed);
    expect(allById(root, 'tab-a')).toHaveLength(1);
    expect(instance.tabId('a')).toBe('t-tab-a');
    expect(instance.panelId('a')).toBe('t-panel-a');
    const list = byId(root, 'tabs') as HTMLElement;
    press(fixture, list, 'ArrowRight');
    expect(changed).toHaveBeenLastCalledWith('c');
    press(fixture, list, 'ArrowRight');
    expect(changed).toHaveBeenLastCalledWith('a');
    press(fixture, list, 'ArrowLeft');
    expect(changed).toHaveBeenLastCalledWith('c');
    press(fixture, list, 'Home');
    expect(changed).toHaveBeenLastCalledWith('a');
    press(fixture, list, 'End');
    expect(changed).toHaveBeenLastCalledWith('c');
    const ignored = press(fixture, list, 'x');
    expect(ignored.defaultPrevented).toBe(false);
    click(root, 'tab-c');
    expect(changed).toHaveBeenLastCalledWith('c');
  });
});
