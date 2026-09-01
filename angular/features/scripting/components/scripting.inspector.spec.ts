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

import { CastMember, ScriptBlock } from '../scripting.models';
import { ScriptingService } from '../scripting.service';
import { ScriptingInspector } from './inspector.component';

async function loadScripting(projectId: number): Promise<void> {
  TestBed.inject(LanguageService).setLanguage('en');
  const scripting = TestBed.inject(ScriptingService);
  TestBed.tick();
  await scripting.load(projectId);
  await scripting.flush(projectId);
  if (projectId === 1) {
    scripting.selectUnit(projectId, 'U03');
  }
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

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function pick(mounted: Mounted<unknown>, id: string, value: string): void {
  type(mounted.root, id, value);
}

describe('ScriptingInspector (audiobook cast)', () => {
  it('shows only the character list', async () => {
    const mounted = await openInspector(1);
    expect(byId(mounted.root, 'sc-ins-block')).toBeNull();
    expect(byId(mounted.root, 'sc-ins-issues')).toBeNull();
    expect(byId(mounted.root, 'sc-reset-btn')).toBeNull();
    expect(byId(mounted.root, 'sc-next-btn')).toBeNull();
    expect(textOf(mounted, 'sc-ins-cast')).toContain('5');
    expect(allById(mounted.root, 'scripting-inspector-cast-kb')).toHaveLength(4);
    expect(allById(mounted.root, 'scripting-inspector-cast-used')).toHaveLength(0);
    expect(textOf(mounted, 'scripting-inspector-cast-narrator')).toBe('NARR');
    expect(textOf(mounted, 'scripting-inspector-cast-hint')).toContain('Knowledgebase');
  });

  it('keeps the cast while a block is selected', async () => {
    const mounted = await openInspector(1);
    scripting().selectBlock(1, firstOfType(1, 'narration').id);
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'sc-ins-cast')).not.toBeNull();
    expect(byId(mounted.root, 'sc-ins-block')).toBeNull();
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

describe('ScriptingInspector (film script)', () => {
  it('lists the knowledgebase characters without the narrator', async () => {
    const mounted = await openInspector(3);
    expect(textOf(mounted, 'scripting-inspector-cast-list')).not.toContain('Narrator');
    expect(allById(mounted.root, 'scripting-inspector-cast-kb')).toHaveLength(4);
    expect(allById(mounted.root, 'scripting-inspector-cast-used')).toHaveLength(0);
  });
});

describe('Inspector wiring', () => {
  it('renders the scripting inspector for a scripting module tab only', async () => {
    prepareBackend();
    const mounted = await mount(Inspector, {}, loadScripting.bind(null, 1));
    TestBed.inject(TabsService).openModule(1, 'Harrowmere', 'scripting');
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'scripting-inspector')).not.toBeNull();
    expect(byId(mounted.root, 'sc-ins-cast')).not.toBeNull();
    expect(byId(mounted.root, 'sc-ins-script')).toBeNull();
    expect(byId(mounted.root, 'project-panel')).toBeNull();
    TestBed.inject(TabsService).openModule(1, 'Harrowmere', 'character');
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'scripting-inspector')).toBeNull();
    expect(byId(mounted.root, 'project-panel')).not.toBeNull();
  });
});
