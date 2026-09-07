import { TestBed } from '@angular/core/testing';
import { LayoutService } from '@layout/layout.service';
import { LanguageService } from '@shared/language/language.service';
import { allById, byId, click } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { installScriptingBackend } from '@testing/scripting-backend';
import { setupApp } from '@testing/service';
import { describe, expect, it } from 'vitest';

import { ScriptingDialogsService } from '../scripting.dialogs.service';
import { ScriptBlock } from '../scripting.models';
import { ScriptingService } from '../scripting.service';
import { Scripting } from './scripting.component';

const AUDIOBOOK = 1;
const BLANK = 2;
const FILM = 3;

const INITIAL_UNITS: Record<number, string> = { [AUDIOBOOK]: 'ch-3' };

async function loadScripting(projectId: number, unitId: string | null): Promise<void> {
  TestBed.inject(LanguageService).setLanguage('en');
  const scripting = TestBed.inject(ScriptingService);
  TestBed.tick();
  await scripting.load(projectId);
  await scripting.flush(projectId);
  if (unitId) {
    scripting.selectUnit(projectId, unitId);
  }
}

async function open(
  projectId: number,
  blank = false,
  unitId: string | null = INITIAL_UNITS[projectId] ?? null,
): Promise<Mounted<Scripting>> {
  const ipc = setupApp();
  ipc.on('workspace_current', null);
  installScriptingBackend(ipc);
  if (blank) {
    ipc.on('scripting_get', null);
  }
  return mount(Scripting, { projectId }, loadScripting.bind(null, projectId, unitId));
}

function service(): ScriptingService {
  return TestBed.inject(ScriptingService);
}

function blocksOf(projectId: number): ScriptBlock[] {
  return service().contextOf(projectId)?.unit?.blocks ?? [];
}

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function press(
  mounted: Mounted<unknown>,
  id: string,
  key: string,
  shiftKey = false,
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  byId(mounted.root, id)?.dispatchEvent(event);
  await settle(mounted.fixture);
  return event;
}

function caretAt(mounted: Mounted<unknown>, id: string, atStart: boolean): void {
  const element = byId(mounted.root, id) as HTMLElement;
  const range = document.createRange();
  const node = element.firstChild as Text;
  range.setStart(node, atStart ? 0 : node.length);
  range.collapse(true);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

async function clickAndSettle(mounted: Mounted<unknown>, id: string): Promise<void> {
  click(mounted.root, id);
  await settle(mounted.fixture);
}

async function writeText(mounted: Mounted<unknown>, id: string, text: string): Promise<void> {
  const element = byId(mounted.root, id) as HTMLElement;
  element.textContent = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(mounted.fixture);
}

async function addBlock(mounted: Mounted<unknown>, label: string): Promise<void> {
  await clickAndSettle(mounted, 'sc-add-btn');
  const item = allById(mounted.root, 'scripting-menu-item').find(
    (row) => row.textContent?.trim() === label,
  );
  item?.click();
  await settle(mounted.fixture);
}

function change(mounted: Mounted<unknown>, id: string, value: string): Promise<void> {
  const element = byId(mounted.root, id) as HTMLInputElement | HTMLSelectElement;
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return settle(mounted.fixture);
}

describe('Scripting audiobook editor', () => {
  it('opens on the first chapter without any status marks', async () => {
    const mounted = await open(AUDIOBOOK, false, null);
    expect(byId(mounted.root, 'sc-unit-ch-1')?.classList.contains('is-active')).toBe(true);
    expect(textOf(mounted, 'sc-unit-title')).toBe('Ngọn đèn cuối cùng');
    expect(textOf(mounted, 'sc-rail-count')).toBe('12/12 done');
    expect(mounted.root.querySelectorAll('[data-testid="scripting-rail-mark"]')).toHaveLength(0);
    expect(byId(mounted.root, 'sc-status-ch-1')).toBeNull();
  });

  it('renders the bar, the rail, the sub bar and the flat source page', async () => {
    const mounted = await open(AUDIOBOOK);
    expect(textOf(mounted, 'sc-preset-badge')).toBe('AUDIOBOOK');
    expect(textOf(mounted, 'sc-back-btn')).toBe('Harrowmere — Audiobook');
    expect(byId(mounted.root, 'sc-draft-btn')).toBeNull();
    expect(byId(mounted.root, 'sc-lock-btn')).toBeNull();
    expect(byId(mounted.root, 'sc-unlock-btn')).toBeNull();
    expect(textOf(mounted, 'sc-rail-count')).toBe('12/12 done');
    expect(allById(mounted.root, 'sc-units')).toHaveLength(1);
    expect(mounted.root.querySelectorAll('.sc-unit')).toHaveLength(12);
    expect(byId(mounted.root, 'sc-unit-ch-3')?.classList.contains('is-active')).toBe(true);
    expect(textOf(mounted, 'sc-unit-ch-1')).toContain('13 blocks · 192 words');
    expect(byId(mounted.root, 'sc-unit-add-btn')).toBeNull();
    expect(textOf(mounted, 'sc-unit-title')).toBe('Điều con nước trả lại');
    expect(byId(mounted.root, 'sc-status-ch-3')).toBeNull();
    expect(byId(mounted.root, 'sc-stats')).toBeNull();
    expect(textOf(mounted, 'scripting-subbar-number')).toBe('CHAPTERS 03');
    expect(byId(mounted.root, 'sc-chs')).toBeNull();
    expect(byId(mounted.root, 'sc-drawer-btn')).toBeNull();
    expect(allById(mounted.root, 'sc-add-btn')).toHaveLength(1);
    expect(byId(mounted.root, 'sc-add-bar')).toBeNull();
    expect(byId(mounted.root, 'sc-reset-btn')).not.toBeNull();
    expect(byId(mounted.root, 'sc-grp-all-btn')).toBeNull();
    expect(allById(mounted.root, 'sc-page-title')).toHaveLength(1);
    expect(mounted.root.querySelectorAll('.sc-grp')).toHaveLength(0);
    expect(mounted.root.querySelectorAll('.sc-blk')).toHaveLength(6);
    expect(byId(mounted.root, 'sc-ban-stale')).toBeNull();
    expect(byId(mounted.root, 'sc-stale-3.2')).toBeNull();
    expect(byId(mounted.root, 'sc-regen-3.2')).toBeNull();
    expect(byId(mounted.root, 'sc-keep-3.2')).toBeNull();
    expect(byId(mounted.root, 'sc-grp-src-3.2')).toBeNull();
    expect(mounted.root.querySelectorAll('.is-stale')).toHaveLength(0);
  });

  it('selects a block when it receives focus', async () => {
    const mounted = await open(AUDIOBOOK);
    expect(mounted.root.querySelector('.sc-blk.is-sel')).toBeNull();
    byId(mounted.root, 'sc-text-B29')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(mounted.fixture);
    expect(service().contextOf(AUDIOBOOK)?.view.sel).toBe('B29');
    expect(byId(mounted.root, 'sc-blk-B29')?.classList.contains('is-sel')).toBe(true);
  });

  it('writes typed text into the block without re-rendering the field', async () => {
    const mounted = await open(AUDIOBOOK);
    await writeText(mounted, 'sc-text-B29', 'A brand new line.');
    expect(blocksOf(AUDIOBOOK).find((block) => block.id === 'B29')?.text).toBe('A brand new line.');
    expect(byId(mounted.root, 'sc-text-B29')?.textContent).toBe('A brand new line.');
  });

  it('adds a block of the chosen type after the selection and focuses it', async () => {
    const mounted = await open(AUDIOBOOK);
    byId(mounted.root, 'sc-text-B29')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await addBlock(mounted, 'Dialogue');
    const blocks = blocksOf(AUDIOBOOK);
    const added = blocks[blocks.findIndex((block) => block.id === 'B29') + 1];
    expect(added.type).toBe('dialogue');
    expect(added.id).toBe('B34');
    expect(added.who).not.toBe('');
    expect(byId(mounted.root, 'sc-who-btn-B34')).not.toBeNull();
    expect(byId(mounted.root, 'sc-blk-B34')?.classList.contains('is-sel')).toBe(true);
    expect(byId(mounted.root, 'sc-text-B34')?.getAttribute('data-ph')).toBe('Dialogue…');
    expect(document.activeElement).toBe(byId(mounted.root, 'sc-text-B34'));
  });

  it('handles Enter, Tab, Shift-Tab and Backspace in the text field', async () => {
    const mounted = await open(AUDIOBOOK);
    const enter = await press(mounted, 'sc-text-B29', 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(blocksOf(AUDIOBOOK).map((block) => block.id)).toContain('B34');
    expect(blocksOf(AUDIOBOOK).find((block) => block.id === 'B34')?.type).toBe('narration');
    const shiftEnter = await press(mounted, 'sc-text-B34', 'Enter', true);
    expect(shiftEnter.defaultPrevented).toBe(false);
    expect(blocksOf(AUDIOBOOK)).toHaveLength(7);
    await press(mounted, 'sc-text-B34', 'Tab');
    expect(blocksOf(AUDIOBOOK).find((block) => block.id === 'B34')?.type).toBe('dialogue');
    await press(mounted, 'sc-text-B34', 'Tab', true);
    expect(blocksOf(AUDIOBOOK).find((block) => block.id === 'B34')?.type).toBe('narration');
    const backspaceFilled = await press(mounted, 'sc-text-B29', 'Backspace');
    expect(backspaceFilled.defaultPrevented).toBe(false);
    const backspace = await press(mounted, 'sc-text-B34', 'Backspace');
    expect(backspace.defaultPrevented).toBe(true);
    expect(blocksOf(AUDIOBOOK).map((block) => block.id)).not.toContain('B34');
    expect(service().contextOf(AUDIOBOOK)?.view.sel).toBe('B29');
  });

  it('moves the caret between blocks with the arrow keys at the field edges', async () => {
    const mounted = await open(AUDIOBOOK);
    caretAt(mounted, 'sc-text-B30', true);
    const up = await press(mounted, 'sc-text-B30', 'ArrowUp');
    expect(up.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId(mounted.root, 'sc-text-B29'));
    caretAt(mounted, 'sc-text-B29', false);
    const down = await press(mounted, 'sc-text-B29', 'ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId(mounted.root, 'sc-text-B30'));
    caretAt(mounted, 'sc-text-B30', false);
    const middle = await press(mounted, 'sc-text-B30', 'ArrowUp');
    expect(middle.defaultPrevented).toBe(false);
    caretAt(mounted, 'sc-text-B27', true);
    const first = await press(mounted, 'sc-text-B27', 'ArrowUp');
    expect(first.defaultPrevented).toBe(false);
    caretAt(mounted, 'sc-text-B30', true);
    const shifted = await press(mounted, 'sc-text-B30', 'ArrowUp', true);
    expect(shifted.defaultPrevented).toBe(false);
  });

  it('opens the type menu and changes the type', async () => {
    const mounted = await open(AUDIOBOOK);
    await clickAndSettle(mounted, 'sc-type-btn-B29');
    const items = allById(mounted.root, 'scripting-menu-item');
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'Title',
      'Narration',
      'Dialogue',
      'Pauses',
      'Note',
    ]);
    expect(items[1].hasAttribute('disabled')).toBe(true);
    items[2].click();
    await settle(mounted.fixture);
    expect(blocksOf(AUDIOBOOK).find((block) => block.id === 'B29')?.type).toBe('dialogue');
    expect(byId(mounted.root, 'scripting-menu')).toBeNull();
  });

  it('closes the menu on an outside click and on Escape', async () => {
    const mounted = await open(AUDIOBOOK);
    await clickAndSettle(mounted, 'sc-type-btn-B29');
    expect(byId(mounted.root, 'scripting-menu')).not.toBeNull();
    document.body.click();
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'scripting-menu')).toBeNull();
    await clickAndSettle(mounted, 'sc-type-btn-B29');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'scripting-menu')).toBeNull();
  });

  it('opens the speaker menu, assigns a character and offers the cast manager', async () => {
    const mounted = await open(AUDIOBOOK);
    await addBlock(mounted, 'Dialogue');
    const added = blocksOf(AUDIOBOOK).find((block) => block.type === 'dialogue') as ScriptBlock;
    await clickAndSettle(mounted, `sc-who-btn-${added.id}`);
    const items = allById(mounted.root, 'scripting-menu-item');
    const cast = service().contextOf(AUDIOBOOK)?.cast ?? [];
    expect(items).toHaveLength(cast.length + 1);
    expect(items[0].textContent?.trim()).toBe('Narrator');
    expect(items[items.length - 1].textContent?.trim()).toBe('Manage characters…');
    expect(allById(mounted.root, 'scripting-menu-divider')).toHaveLength(1);
    const target = cast.find((member) => member.id !== added.who) as (typeof cast)[number];
    items[cast.indexOf(target)].click();
    await settle(mounted.fixture);
    expect(blocksOf(AUDIOBOOK).find((block) => block.id === added.id)?.who).toBe(target.id);
    expect(byId(mounted.root, `sc-who-btn-${added.id}`)?.textContent).toContain(target.name);
    const layout = TestBed.inject(LayoutService);
    layout.selectRightTab('assistant');
    layout.inspectorOpen.set(false);
    await clickAndSettle(mounted, `sc-who-btn-${added.id}`);
    allById(mounted.root, 'scripting-menu-item')[cast.length].click();
    expect(layout.rightTab()).toBe('inspector');
    expect(layout.inspectorOpen()).toBe(true);
  });

  it('edits the tone and the pause length and normalises the pause value', async () => {
    const mounted = await open(AUDIOBOOK);
    await addBlock(mounted, 'Dialogue');
    const added = blocksOf(AUDIOBOOK).find((block) => block.type === 'dialogue') as ScriptBlock;
    await change(mounted, `sc-paren-${added.id}`, 'softly');
    expect(blocksOf(AUDIOBOOK).find((block) => block.id === added.id)?.paren).toBe('softly');
    await change(mounted, 'sc-pause-input-B28', '99');
    expect(blocksOf(AUDIOBOOK).find((block) => block.id === 'B28')?.ms).toBe(30000);
    expect((byId(mounted.root, 'sc-pause-input-B28') as HTMLInputElement).value).toBe('30.0');
  });

  it('moves, duplicates and deletes a block with the tools', async () => {
    const mounted = await open(AUDIOBOOK);
    await clickAndSettle(mounted, 'sc-dup-B29');
    expect(blocksOf(AUDIOBOOK).filter((block) => block.ref === '3.1')).toHaveLength(2);
    await clickAndSettle(mounted, 'sc-up-B28');
    expect(blocksOf(AUDIOBOOK)[0].id).toBe('B28');
    await clickAndSettle(mounted, 'sc-down-B28');
    expect(blocksOf(AUDIOBOOK)[1].id).toBe('B28');
    await clickAndSettle(mounted, 'sc-del-B28');
    expect(blocksOf(AUDIOBOOK).map((block) => block.id)).not.toContain('B28');
  });

  it('lists the block types in the add menu', async () => {
    const mounted = await open(AUDIOBOOK);
    await clickAndSettle(mounted, 'sc-add-btn');
    const items = allById(mounted.root, 'scripting-menu-item');
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'Title',
      'Narration',
      'Dialogue',
      'Pauses',
      'Note',
    ]);
    expect(items.some((item) => item.hasAttribute('disabled'))).toBe(false);
    items[3].click();
    await settle(mounted.fixture);
    expect(blocksOf(AUDIOBOOK).filter((block) => block.type === 'pause')).toHaveLength(2);
    expect(byId(mounted.root, 'scripting-menu')).toBeNull();
  });

  it('opens the reset dialog from the sub bar', async () => {
    const mounted = await open(AUDIOBOOK);
    await clickAndSettle(mounted, 'sc-reset-btn');
    expect(TestBed.inject(ScriptingDialogsService).request()).toEqual({
      kind: 'reset',
      projectId: AUDIOBOOK,
    });
  });

  it('switches the unit and keeps it editable', async () => {
    const mounted = await open(AUDIOBOOK);
    await clickAndSettle(mounted, 'sc-unit-ch-1');
    expect(byId(mounted.root, 'sc-unit-ch-1')?.classList.contains('is-active')).toBe(true);
    expect(byId(mounted.root, 'sc-add-btn')).not.toBeNull();
    expect(mounted.root.querySelector('.sc-tools')).not.toBeNull();
    const field = mounted.root.querySelector('.sc-t') as HTMLElement;
    expect(field.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(mounted.root.querySelector<HTMLButtonElement>('.sc-gut')?.disabled).toBe(false);
    const entered = await press(mounted, field.dataset['testid'] ?? 'sc-text-B1', 'Enter');
    expect(entered.defaultPrevented).toBe(true);
  });

  it('shows the placeholder state of a unit without loaded content and starts rewriting', async () => {
    const mounted = await open(AUDIOBOOK);
    await clickAndSettle(mounted, 'sc-unit-ch-4');
    expect(textOf(mounted, 'scripting-empty')).toContain('8 blocks, 128 words');
    expect(byId(mounted.root, 'sc-empty-unlock-btn')).toBeNull();
    expect(byId(mounted.root, 'sc-empty-draft-btn')).toBeNull();
    await clickAndSettle(mounted, 'sc-empty-start-btn');
    expect(blocksOf(AUDIOBOOK)).toHaveLength(1);
    expect(blocksOf(AUDIOBOOK)[0].type).toBe('heading');
  });

  it('offers the default and scratch actions for an empty chapter', async () => {
    const mounted = await open(5, true);
    await clickAndSettle(mounted, 'sc-unit-ch-2');
    expect(byId(mounted.root, 'sc-empty-draft-btn')).toBeNull();
    expect(byId(mounted.root, 'sc-empty-start-btn')).not.toBeNull();
    const dialogs = TestBed.inject(ScriptingDialogsService);
    await clickAndSettle(mounted, 'sc-empty-default-btn');
    expect(dialogs.request()).toEqual({ kind: 'default', projectId: 5 });
  });
});

describe('Scripting film editor', () => {
  it('renders the film bar, the chapter range and the scene blocks in one column', async () => {
    const mounted = await open(FILM);
    expect(textOf(mounted, 'sc-preset-badge')).toBe('FILMSERIES');
    expect(textOf(mounted, 'sc-rail-count')).toBe('1/2 done');
    expect(byId(mounted.root, 'sc-unit-add-btn')).not.toBeNull();
    expect(textOf(mounted, 'sc-unit-add-btn')).toBe('Add episode');
    expect(byId(mounted.root, 'sc-chs')).not.toBeNull();
    expect((byId(mounted.root, 'sc-chs-from') as HTMLInputElement).value).toBe('1');
    expect((byId(mounted.root, 'sc-chs-to') as HTMLInputElement).value).toBe('2');
    expect(byId(mounted.root, 'sc-unit-title')?.tagName).toBe('INPUT');
    expect(textOf(mounted, 'scripting-subbar-number')).toBe('EPISODE 01');
    expect(textOf(mounted, 'sc-page-title')).toContain('EPISODE 01 · Ch.1–2');
    expect(byId(mounted.root, 'sc-reset-btn')).toBeNull();
    expect(byId(mounted.root, 'sc-drawer')).toBeNull();
    expect(byId(mounted.root, 'sc-drawer-btn')).toBeNull();
    expect(byId(mounted.root, 'scripting-split')).toBeNull();
    expect(allById(mounted.root, 'sc-page')).toHaveLength(1);
    expect(byId(mounted.root, 'sc-places')).not.toBeNull();
  });

  it('edits the setting, the time and the chapter range of the episode', async () => {
    const mounted = await open(FILM);
    const scene = blocksOf(FILM).find((block) => block.type === 'scene') as ScriptBlock;
    await change(mounted, `sc-loc-${scene.id}`, 'harbour steps');
    expect(blocksOf(FILM).find((block) => block.id === scene.id)?.loc).toBe('HARBOUR STEPS');
    expect((byId(mounted.root, `sc-loc-${scene.id}`) as HTMLInputElement).value).toBe(
      'HARBOUR STEPS',
    );
    await change(mounted, `sc-time-${scene.id}`, 'NIGHT');
    expect(blocksOf(FILM).find((block) => block.id === scene.id)?.time).toBe('NIGHT');
    expect(
      mounted.root.querySelectorAll(`[data-testid="sc-time-${scene.id}"] option`),
    ).toHaveLength(7);
    await change(mounted, 'sc-chs-to', '3');
    expect(service().contextOf(FILM)?.unit?.chs).toEqual([1, 3]);
    await change(mounted, 'sc-chs-from', '500');
    expect(service().contextOf(FILM)?.unit?.chs).toEqual([12, 12]);
    expect((byId(mounted.root, 'sc-chs-from') as HTMLInputElement).value).toBe('12');
    expect((byId(mounted.root, 'sc-chs-to') as HTMLInputElement).value).toBe('12');
    await change(mounted, 'sc-unit-title', '  Renamed  ');
    expect(service().contextOf(FILM)?.unit?.title).toBe('Renamed');
    expect(textOf(mounted, 'sc-unit-U01')).toContain('Renamed');
  });

  it('warns when the chosen chapters have no knowledge analysis', async () => {
    const mounted = await open(FILM);
    await clickAndSettle(mounted, 'sc-unit-U02');
    expect(byId(mounted.root, 'sc-ban-kb')).toBeNull();
    await change(mounted, 'sc-chs-from', '7');
    expect(textOf(mounted, 'sc-ban-kb')).toContain('Chapter 7 have no knowledge analysis yet');
    expect(byId(mounted.root, 'sc-open-kb-btn')).not.toBeNull();
    expect(textOf(mounted, 'sc-empty-start-btn')).toBe('Start writing');
  });

  it('adds an episode from the rail and starts writing in an empty one', async () => {
    const mounted = await open(FILM);
    await clickAndSettle(mounted, 'sc-unit-U02');
    expect(textOf(mounted, 'scripting-empty')).toContain('This Episode has no script yet');
    expect(byId(mounted.root, 'sc-empty-start-btn')).not.toBeNull();
    await clickAndSettle(mounted, 'sc-empty-start-btn');
    expect(blocksOf(FILM)).toHaveLength(1);
    expect(blocksOf(FILM)[0].type).toBe('scene');
    expect(byId(mounted.root, 'scripting-empty')).toBeNull();
    expect(textOf(mounted, 'sc-page-title')).toContain('EPISODE 02');
    await clickAndSettle(mounted, 'sc-unit-add-btn');
    expect(mounted.root.querySelectorAll('.sc-unit')).toHaveLength(3);
    expect(byId(mounted.root, 'sc-unit-U03')?.classList.contains('is-active')).toBe(true);
  });
});

describe('Scripting preset chooser', () => {
  it('asks a blank project for the product type and applies the choice', async () => {
    const mounted = await open(BLANK, true);
    expect(byId(mounted.root, 'sc-pick')).not.toBeNull();
    expect(byId(mounted.root, 'sc-preset-badge')).toBeNull();
    expect(allById(mounted.root, 'scripting-presets')).toHaveLength(1);
    expect(textOf(mounted, 'sc-pick-film')).toContain('Film script');
    await clickAndSettle(mounted, 'sc-pick-film');
    expect(byId(mounted.root, 'sc-pick')).toBeNull();
    expect(textOf(mounted, 'sc-preset-badge')).toBe('FILMSERIES');
    expect(byId(mounted.root, 'sc-rail')).not.toBeNull();
  });
});
