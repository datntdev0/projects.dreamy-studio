import { TestBed } from '@angular/core/testing';
import { Inspector } from '@layout/inspector/inspector';
import { TabsService } from '@layout/tabs.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { allById, byId, click, type } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { installScriptingBackend } from '@testing/scripting-backend';
import { setupApp } from '@testing/service';
import { describe, expect, it } from 'vitest';

import { ScriptingDialogsService } from '../scripting.dialogs.service';
import { CastMember, ScriptBlock } from '../scripting.models';
import { ScriptingService } from '../scripting.service';
import { ScriptingInspector } from './inspector.component';

async function loadScripting(projectId: number): Promise<void> {
  TestBed.inject(LanguageService).setLanguage('en');
  const scripting = TestBed.inject(ScriptingService);
  TestBed.tick();
  await scripting.load(projectId);
  await scripting.flush(projectId);
}

function prepareBackend(): void {
  const ipc = setupApp();
  ipc.on('workspace_current', null);
  installScriptingBackend(ipc);
}

async function openInspector(projectId: number): Promise<Mounted<ScriptingInspector>> {
  prepareBackend();
  return mount(ScriptingInspector, { projectId }, loadScripting.bind(null, projectId));
}

function scripting(): ScriptingService {
  return TestBed.inject(ScriptingService);
}

function extraOf(name: string): CastMember | undefined {
  return scripting()
    .scriptOf(1)
    ?.extraCast.find((member) => member.name === name);
}

function blocksOf(projectId: number): ScriptBlock[] {
  return scripting().contextOf(projectId)?.unit?.blocks ?? [];
}

function firstOfType(projectId: number, type: ScriptBlock['type']): ScriptBlock {
  return blocksOf(projectId).find((block) => block.type === type) as ScriptBlock;
}

async function select(mounted: Mounted<ScriptingInspector>, blockId: string): Promise<void> {
  scripting().selectBlock(1, blockId);
  await settle(mounted.fixture);
}

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function pick(mounted: Mounted<unknown>, id: string, value: string): void {
  type(mounted.root, id, value);
}

describe('ScriptingInspector (audiobook summary)', () => {
  it('shows the script panel, the unit summary, the issues and the cast', async () => {
    const mounted = await openInspector(1);
    expect(byId(mounted.root, 'sc-ins-block')).toBeNull();
    expect(byId(mounted.root, 'sc-reset-btn')).not.toBeNull();
    expect(textOf(mounted, 'sc-next-btn')).toBe('Continue in Audiobook');
    expect(byId(mounted.root, 'sc-next-btn')?.classList.contains('btn-primary')).toBe(false);
    expect(textOf(mounted, 'scripting-inspector-script-hint')).toBe(
      'Lock this chapter before production.',
    );
    expect(textOf(mounted, 'scripting-inspector-summary-name')).toBe('Điều thủy triều trả lại');
    expect(textOf(mounted, 'sc-status-U03')).toBe('NEEDS REVIEW');
    expect(byId(mounted.root, 'sc-status-U03')?.classList.contains('badge-warning')).toBe(true);
    expect(byId(mounted.root, 'scripting-inspector-summary-chapters')).toBeNull();
    expect(textOf(mounted, 'scripting-inspector-summary-blocks')).toBe('6');
    expect(textOf(mounted, 'scripting-inspector-summary-estimate')).toMatch(/^≈ \d+:\d{2}$/);
    expect(byId(mounted.root, 'sc-dist-narr')).not.toBeNull();
    expect(byId(mounted.root, 'sc-ins-types')).toBeNull();
    expect(allById(mounted.root, 'sc-issue')).toHaveLength(2);
    expect(allById(mounted.root, 'sc-issue')[0].textContent).toContain('¶2');
    expect(allById(mounted.root, 'sc-issue')[0].classList.contains('is-warn')).toBe(true);
    expect(textOf(mounted, 'sc-ins-issues')).toContain('2');
    expect(textOf(mounted, 'sc-ins-cast')).toContain('5');
    expect(allById(mounted.root, 'scripting-inspector-cast-kb')).toHaveLength(4);
    expect(allById(mounted.root, 'scripting-inspector-cast-used')).toHaveLength(0);
    expect(textOf(mounted, 'scripting-inspector-cast-narrator')).toBe('NARR');
    expect(textOf(mounted, 'scripting-inspector-cast-hint')).toContain('Knowledgebase');
  });

  it('keeps the narrator and knowledgebase characters read only', async () => {
    const mounted = await openInspector(1);
    const narrator = byId(mounted.root, 'sc-cast-name-narr') as HTMLInputElement;
    expect(narrator.value).toBe('Narrator');
    expect(narrator.disabled).toBe(true);
    expect((byId(mounted.root, 'sc-cast-del-narr') as HTMLButtonElement).disabled).toBe(true);
    expect((byId(mounted.root, 'sc-cast-del-narr') as HTMLButtonElement).title).toBe(
      'Cannot delete',
    );
    expect((byId(mounted.root, 'sc-cast-del-E1') as HTMLButtonElement).disabled).toBe(true);
    expect((byId(mounted.root, 'sc-cast-name-E1') as HTMLInputElement).disabled).toBe(true);
  });

  it('jumps to the block or paragraph of an issue', async () => {
    const mounted = await openInspector(1);
    click(mounted.root, 'sc-issue');
    await settle(mounted.fixture);
    expect(scripting().viewOf(1).sel).toBe(scripting().viewOf(1).goto);
    expect(byId(mounted.root, 'sc-ins-block')).not.toBeNull();
    expect(byId(mounted.root, 'sc-ins-issues')).toBeNull();
  });

  it('lists at most eight issues and counts the rest', async () => {
    const mounted = await openInspector(1);
    for (let index = 0; index < 9; index += 1) {
      scripting().addBlock(1, 'narration');
      scripting().patchBlock(1, scripting().viewOf(1).sel as string, { text: '' });
    }
    scripting().selectBlock(1, null);
    await settle(mounted.fixture);
    expect(allById(mounted.root, 'sc-issue')).toHaveLength(8);
    expect(textOf(mounted, 'scripting-inspector-summary-more')).toBe('and 3 more issues.');
  });

  it('explains an empty unit', async () => {
    const mounted = await openInspector(1);
    scripting().selectUnit(1, 'U04');
    await settle(mounted.fixture);
    expect(textOf(mounted, 'sc-status-U04')).toBe('LOCKED');
    expect(textOf(mounted, 'scripting-inspector-summary-blocks')).toBe('0');
    expect(textOf(mounted, 'sc-issue')).toBe('Chapter has no content.');
    expect(byId(mounted.root, 'sc-next-btn')?.classList.contains('btn-primary')).toBe(true);
    expect(byId(mounted.root, 'scripting-inspector-script-hint')).toBeNull();
    expect(byId(mounted.root, 'sc-reset-btn')).toBeNull();
    expect(byId(mounted.root, 'sc-ins-dist')).toBeNull();
  });
});

describe('ScriptingInspector (block panel)', () => {
  it('edits and moves the selected narration block', async () => {
    const mounted = await openInspector(1);
    const block = firstOfType(1, 'narration');
    await select(mounted, block.id);
    expect(byId(mounted.root, 'scripting-inspector-summary-details')).toBeNull();
    expect(textOf(mounted, 'scripting-inspector-block-head')).toBe('Narration');
    expect((byId(mounted.root, 'sc-ins-type') as HTMLSelectElement).value).toBe('narration');
    expect(textOf(mounted, 'scripting-inspector-block-paragraph')).toMatch(/^¶\d+$/);
    expect(byId(mounted.root, 'scripting-inspector-block-matches')).not.toBeNull();
    expect(byId(mounted.root, 'sc-ins-who')).toBeNull();
    const index = blocksOf(1).indexOf(block);
    click(mounted.root, 'sc-ins-down');
    expect(blocksOf(1).indexOf(blocksOf(1).find((item) => item.id === block.id)!)).toBe(index + 1);
    click(mounted.root, 'sc-ins-up');
    expect(blocksOf(1)[index].id).toBe(block.id);
    const count = blocksOf(1).length;
    click(mounted.root, 'sc-ins-dup');
    await settle(mounted.fixture);
    expect(blocksOf(1)).toHaveLength(count + 1);
    expect(scripting().viewOf(1).sel).not.toBe(block.id);
    click(mounted.root, 'sc-ins-del');
    await settle(mounted.fixture);
    expect(blocksOf(1)).toHaveLength(count);
    expect(blocksOf(1).some((item) => item.id === block.id)).toBe(true);
  });

  it('changes the block type through the select', async () => {
    const mounted = await openInspector(1);
    const block = firstOfType(1, 'narration');
    await select(mounted, block.id);
    const options = Array.from((byId(mounted.root, 'sc-ins-type') as HTMLSelectElement).options);
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Title',
      'Narration',
      'Dialogue',
      'Pauses',
      'Note',
    ]);
    pick(mounted, 'sc-ins-type', 'dialogue');
    await settle(mounted.fixture);
    expect(blocksOf(1).find((item) => item.id === block.id)?.type).toBe('dialogue');
    expect(byId(mounted.root, 'sc-ins-who')).not.toBeNull();
    expect(byId(mounted.root, 'sc-ins-paren')).not.toBeNull();
    pick(mounted, 'sc-ins-who', 'E1');
    pick(mounted, 'sc-ins-paren', 'whispering');
    await settle(mounted.fixture);
    const edited = blocksOf(1).find((item) => item.id === block.id);
    expect(edited).toMatchObject({ who: 'E1', paren: 'whispering' });
    expect((byId(mounted.root, 'sc-ins-who') as HTMLSelectElement).value).toBe('E1');
    expect(textOf(mounted, 'sc-ins-who')).toContain('Unassigned');
    expect(textOf(mounted, 'sc-ins-who')).toContain('Narrator');
  });

  it('edits the seconds of a pause', async () => {
    const mounted = await openInspector(1);
    const pause = firstOfType(1, 'pause');
    await select(mounted, pause.id);
    const input = byId(mounted.root, 'sc-ins-ms') as HTMLInputElement;
    expect(input.value).toBe((pause.ms / 1000).toFixed(1));
    pick(mounted, 'sc-ins-ms', '2.5');
    expect(blocksOf(1).find((item) => item.id === pause.id)?.ms).toBe(2500);
    pick(mounted, 'sc-ins-ms', '99');
    expect(blocksOf(1).find((item) => item.id === pause.id)?.ms).toBe(30000);
  });

  it('marks a source paragraph that changed', async () => {
    const mounted = await openInspector(1);
    const stale = blocksOf(1).find((block) => block.ref === '3.2') as ScriptBlock;
    await select(mounted, stale.id);
    expect(byId(mounted.root, 'scripting-inspector-block-changed')).not.toBeNull();
    expect(byId(mounted.root, 'scripting-inspector-block-matches')).toBeNull();
  });

  it('is read only for a locked unit', async () => {
    const mounted = await openInspector(1);
    scripting().selectUnit(1, 'U01');
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'sc-next-btn')?.classList.contains('btn-primary')).toBe(true);
    expect(byId(mounted.root, 'scripting-inspector-script-hint')).toBeNull();
    const block = firstOfType(1, 'narration');
    await select(mounted, block.id);
    expect((byId(mounted.root, 'sc-ins-type') as HTMLSelectElement).disabled).toBe(true);
    expect(byId(mounted.root, 'sc-ins-actions')).toBeNull();
  });
});

describe('ScriptingInspector (film script)', () => {
  it('describes the episode and its scenes', async () => {
    const mounted = await openInspector(3);
    expect(byId(mounted.root, 'sc-reset-btn')).toBeNull();
    expect(textOf(mounted, 'sc-next-btn')).toBe('Continue in Storyboard');
    expect(textOf(mounted, 'scripting-inspector-summary-chapters')).toBe('Ch.1–2');
    expect(textOf(mounted, 'scripting-inspector-summary-scenes')).toBe('5');
    expect(textOf(mounted, 'scripting-inspector-cast-list')).not.toContain('Narrator');
    expect(allById(mounted.root, 'scripting-inspector-cast-kb')).toHaveLength(4);
    expect(allById(mounted.root, 'scripting-inspector-cast-used')).toHaveLength(0);
  });

  it('edits the setting, time and summary of a scene', async () => {
    const mounted = await openInspector(3);
    const scene = firstOfType(3, 'scene');
    scripting().selectBlock(3, scene.id);
    await settle(mounted.fixture);
    expect((byId(mounted.root, 'sc-ins-loc') as HTMLInputElement).value).toBe(scene.loc);
    expect((byId(mounted.root, 'sc-ins-time') as HTMLSelectElement).value).toBe(scene.time);
    expect((byId(mounted.root, 'sc-ins-beat') as HTMLTextAreaElement).value).toBe(scene.beat);
    expect(allById(mounted.root, 'scripting-inspector-block-ref')).toHaveLength(scene.refs.length);
    expect(textOf(mounted, 'scripting-inspector-block-evidence')).toContain('Ch.1 ¶1');
    type(mounted.root, 'sc-ins-loc', 'harbour');
    type(mounted.root, 'sc-ins-time', 'NIGHT');
    type(mounted.root, 'sc-ins-beat', 'A quiet dusk.');
    const edited = blocksOf(3).find((block) => block.id === scene.id);
    expect(edited).toMatchObject({ loc: 'HARBOUR', time: 'NIGHT', beat: 'A quiet dusk.' });
    await settle(mounted.fixture);
    expect((byId(mounted.root, 'sc-ins-loc') as HTMLInputElement).value).toBe('HARBOUR');
    expect(byId(mounted.root, 'scripting-inspector-block-source')).toBeNull();
  });
});

describe('ScriptingInspector (script panel and cast)', () => {
  it('opens the reset dialog or explains why it cannot', async () => {
    const mounted = await openInspector(1);
    const dialogs = TestBed.inject(ScriptingDialogsService);
    click(mounted.root, 'sc-reset-btn');
    expect(dialogs.request()).toEqual({ kind: 'reset', projectId: 1 });
    dialogs.close();
    scripting().selectUnit(1, 'U01');
    await settle(mounted.fixture);
    click(mounted.root, 'sc-reset-btn');
    expect(dialogs.request()).toBeNull();
    expect(TestBed.inject(ToastService).items()[0]).toMatchObject({
      message: 'Unlock the chapter before resetting.',
      tone: 'warning',
    });
  });

  it('opens the next module in a tab', async () => {
    const mounted = await openInspector(1);
    click(mounted.root, 'sc-next-btn');
    expect(TestBed.inject(TabsService).activeId()).toBe('pmod:1:audiobook');
  });

  it('adds, renames and removes a manual character', async () => {
    const mounted = await openInspector(1);
    const input = byId(mounted.root, 'sc-cast-new-input') as HTMLInputElement;
    click(mounted.root, 'sc-cast-add-btn');
    input.value = 'Old Fisher';
    click(mounted.root, 'sc-cast-add-btn');
    await settle(mounted.fixture);
    expect(input.value).toBe('');
    const added = scripting()
      .scriptOf(1)
      ?.extraCast.find((member) => member.name === 'Old Fisher');
    expect(added).toBeDefined();
    const id = added?.id as string;
    expect(byId(mounted.root, `sc-cast-${id}`)).not.toBeNull();
    expect(textOf(mounted, `sc-cast-${id}`)).toBe('0');
    expect(textOf(mounted, 'sc-ins-cast')).toContain('6');
    input.value = 'old fisher';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(mounted.fixture);
    expect(TestBed.inject(ToastService).items()[0].message).toBe(
      'A character with this name already exists.',
    );
    pick(mounted, `sc-cast-name-${id}`, 'Young Fisher');
    expect(extraOf('Young Fisher')?.id).toBe(id);
    await settle(mounted.fixture);
    const name = byId(mounted.root, `sc-cast-name-${id}`) as HTMLInputElement;
    pick(mounted, `sc-cast-name-${id}`, '   ');
    expect(name.value).toBe('Young Fisher');
    click(mounted.root, `sc-cast-del-${id}`);
    await settle(mounted.fixture);
    expect(byId(mounted.root, `sc-cast-${id}`)).toBeNull();
  });

  it('shows the block count and blocks removal of a character in use', async () => {
    const mounted = await openInspector(1);
    scripting().addCastMember(1, 'Old Fisher');
    const id = extraOf('Old Fisher')?.id as string;
    const narration = firstOfType(1, 'narration');
    scripting().setBlockType(1, narration.id, 'dialogue');
    scripting().patchBlock(1, narration.id, { who: id });
    await settle(mounted.fixture);
    expect(textOf(mounted, `sc-cast-${id}`)).toBe('1');
    const remove = byId(mounted.root, `sc-cast-del-${id}`) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    expect(remove.title).toBe('In use');
  });
});

describe('Inspector wiring', () => {
  it('renders the scripting inspector for a scripting module tab only', async () => {
    prepareBackend();
    const mounted = await mount(Inspector, {}, loadScripting.bind(null, 1));
    TestBed.inject(TabsService).openModule(1, 'Harrowmere', 'scripting');
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'scripting-inspector')).not.toBeNull();
    expect(byId(mounted.root, 'sc-ins-script')).not.toBeNull();
    expect(byId(mounted.root, 'project-panel')).toBeNull();
    TestBed.inject(TabsService).openModule(1, 'Harrowmere', 'character');
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'scripting-inspector')).toBeNull();
    expect(byId(mounted.root, 'project-panel')).not.toBeNull();
  });
});
