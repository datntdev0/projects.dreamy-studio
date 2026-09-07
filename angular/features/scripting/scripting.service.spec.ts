import { TestBed } from '@angular/core/testing';
import { FakeIpc } from '@testing/fake-ipc';
import { installScriptingBackend } from '@testing/scripting-backend';
import { setupApp } from '@testing/service';
import { beforeEach, describe, expect, it } from 'vitest';

// prettier-ignore
import { LANTERN_VI_TITLES } from '../../stories/screens/novel-translation.fixtures';
import { TEA_WOMAN } from '../../stories/screens/scripting.fixtures';
import { NovelTranslationService } from '../novel/novel.translation.service';
import { ScriptingService } from './scripting.service';

function titleOnlyWire(seqs: number[]) {
  const chapters: Record<string, unknown> = {};
  for (const seq of seqs) {
    chapters[`ch-${seq}`] = { title: `Translated ${seq}`, paragraphs: [] };
  }
  return { guidelines: '', dict: [], chapters, warnings: [] };
}

describe('ScriptingService', () => {
  let ipc: FakeIpc;
  let scripting: ScriptingService;

  async function open(projectId: number): Promise<void> {
    await scripting.load(projectId);
    await scripting.flush(projectId);
  }

  beforeEach(() => {
    ipc = setupApp();
    ipc.on('workspace_current', null);
    installScriptingBackend(ipc);
    scripting = TestBed.inject(ScriptingService);
    TestBed.tick();
  });

  describe('loading', () => {
    it('loads the seeded audiobook script with derived context', async () => {
      expect(scripting.contextOf(1)).toBeNull();
      await open(1);
      expect(scripting.isLoaded(1)).toBe(true);
      const ctx = scripting.contextOf(1);
      expect(ctx?.unit?.id).toBe('ch-1');
      expect(ctx?.cast.map((member) => member.id)).toEqual(['narr', 'E1', 'E3', 'E5', 'E16']);
      expect(ctx?.railSummary).toEqual({ done: 12, total: 12, percent: 100 });
      expect(ctx?.rail[0].active).toBe(true);
      expect(ctx?.rail[2].active).toBe(false);
      expect(ctx?.hasDefault).toBe(true);
      expect(ctx?.chapterMax).toBe(12);
      expect(ctx?.kb.available).toBe(true);
      expect(ctx?.places).toContain('Tháp Đèn');
    });

    it('reports a missing project and load failures', async () => {
      await scripting.load(99);
      expect(scripting.error()).toEqual({ code: 'not_found', detail: 'Project 99 not found' });
      ipc.fail('scripting_get', { code: 'x', detail: 'y' });
      await scripting.load(1);
      expect(scripting.error()).toEqual({ code: 'x', detail: 'y' });
      expect(scripting.loading()).toBe(false);
      expect(scripting.isLoaded(1)).toBe(false);
    });

    it('creates the first script of a project without storing any chapter', async () => {
      ipc.on('scripting_get', null);
      await open(5);
      expect(ipc.called('scripting_save')).toBe(1);
      expect(ipc.lastArgs('scripting_save')?.['script']).toMatchObject({ units: [] });
      const created = scripting.scriptOf(5);
      expect(created?.units).toHaveLength(12);
      expect(created?.units[1]).toMatchObject({
        id: 'ch-2',
        chapterId: 'ch-2',
        no: 2,
        title: LANTERN_VI_TITLES[1],
      });
    });

    it('lists the translated chapters in order and grows as more get translated', async () => {
      ipc.on('translation_get', titleOnlyWire([9, 2, 7, 4, 11]));
      await open(5);
      expect(scripting.scriptOf(5)?.units.map((unit) => unit.no)).toEqual([2, 4, 7, 9, 11]);
      expect(scripting.contextOf(5)?.railSummary.total).toBe(5);
      ipc.on('translation_get', titleOnlyWire([9, 2, 7, 4, 11, 1, 12, 5]));
      await TestBed.inject(NovelTranslationService).load(1, 'VI');
      expect(scripting.scriptOf(5)?.units.map((unit) => unit.no)).toEqual([
        1, 2, 4, 5, 7, 9, 11, 12,
      ]);
      expect(scripting.contextOf(5)?.railSummary.total).toBe(8);
    });

    it('keeps the stored content linked to its chapter when the list changes', async () => {
      ipc.on('translation_get', titleOnlyWire([9, 4]));
      await open(5);
      scripting.selectUnit(5, 'ch-9');
      scripting.startWriting(5);
      await scripting.flush(5);
      ipc.on('translation_get', titleOnlyWire([9, 4, 1]));
      await TestBed.inject(NovelTranslationService).load(1, 'VI');
      const units = scripting.scriptOf(5)?.units ?? [];
      expect(units.map((unit) => [unit.id, unit.blocks !== null])).toEqual([
        ['ch-1', true],
        ['ch-4', false],
        ['ch-9', true],
      ]);
    });

    it('saves the first edit of a derived chapter with only its content fields', async () => {
      ipc.on('scripting_get', null);
      await open(5);
      scripting.selectUnit(5, 'ch-4');
      scripting.startWriting(5);
      await scripting.flush(5);
      const saved = ipc.lastArgs('scripting_unit_save')?.['unit'] as Record<string, unknown>;
      expect(Object.keys(saved).sort()).toEqual(['blocks', 'chapterId', 'id', 'meta', 'updated']);
      expect(saved).toMatchObject({ id: 'ch-4', chapterId: 'ch-4' });
    });

    it('does not store derived chapters without content when saving the script', async () => {
      ipc.on('translation_get', titleOnlyWire([1, 2, 3, 4, 5]));
      await open(5);
      scripting.selectUnit(5, 'ch-1');
      expect(scripting.resetUnits(5, 'unit')).toBe(1);
      await scripting.flush(5);
      const stored = ipc.lastArgs('scripting_save')?.['script'] as { units: { id: string }[] };
      expect(stored.units.map((unit) => unit.id)).toEqual(['ch-1', 'ch-2', 'ch-3']);
    });

    it('asks for the preset of a blank project', async () => {
      ipc.on('scripting_get', null);
      await open(2);
      expect(scripting.contextOf(2)?.choose).toBe(true);
      expect(scripting.contextOf(2)?.unit).toBeNull();
      scripting.setPreset(2, 'film');
      await scripting.flush(2);
      expect(scripting.contextOf(2)?.choose).toBe(false);
      expect(scripting.scriptOf(2)?.cfg.preset).toBe('film');
      expect(ipc.lastArgs('scripting_save')?.['script']).toMatchObject({ choose: false });
      expect(ipc.called('project_modules')).toBeGreaterThan(0);
    });

    it('does not reload a loaded project and reloads the sources on demand', async () => {
      await open(1);
      await scripting.ensureLoaded(1);
      expect(ipc.called('scripting_get')).toBe(1);
      const reads = ipc.called('novel_chapter_read');
      await scripting.ensureSources(1);
      expect(ipc.called('novel_chapter_read')).toBe(reads);
      await scripting.reloadSources(1);
      expect(ipc.called('novel_chapter_read')).toBeGreaterThan(reads);
      await scripting.reloadSources(2);
    });

    it('clears everything when reset', async () => {
      await open(1);
      scripting.reset();
      expect(scripting.scriptOf(1)).toBeNull();
      expect(scripting.isLoaded(1)).toBe(false);
    });
  });

  describe('unknown projects', () => {
    it('ignores operations before a script is loaded', async () => {
      expect(scripting.resettableUnitsOf(1)).toEqual([]);
      expect(scripting.removeCastMember(1, 'x')).toBe(false);
      expect(scripting.resetUnits(1, 'all')).toBe(0);
      expect(scripting.addUnit(1)).toBeNull();
      expect(scripting.startWriting(1)).toBeNull();
      scripting.setPreset(1, 'film');
      scripting.renameCastMember(1, 'x', 'y');
      expect(scripting.applyDefault(1)).toBe(false);
      await scripting.ensureSources(1);
      expect(ipc.called('scripting_save')).toBe(0);
    });

    it('loads on demand', async () => {
      await scripting.ensureLoaded(1);
      expect(scripting.isLoaded(1)).toBe(true);
    });
  });

  describe('view state', () => {
    beforeEach(async () => {
      await open(1);
    });

    it('selects units and blocks', async () => {
      scripting.selectUnit(1, 'ch-1');
      await scripting.ensureSources(1);
      const ctx = scripting.contextOf(1);
      expect(ctx?.unit?.id).toBe('ch-1');
      scripting.selectBlock(1, 'B3');
      expect(scripting.viewOf(1).sel).toBe('B3');
      scripting.selectUnit(1, 'zz');
      expect(scripting.viewOf(1).unit).toBe('ch-1');
      expect(scripting.viewOf(1).sel).toBe('B3');
      scripting.selectUnit(1, 'ch-2');
      expect(scripting.viewOf(1).sel).toBeNull();
    });

    it('jumps to a block', () => {
      scripting.selectUnit(1, 'ch-3');
      scripting.gotoBlock(1, 'B30');
      expect(scripting.viewOf(1)).toMatchObject({ sel: 'B30', goto: 'B30' });
      expect(scripting.consumeFocus(1)).toEqual({ focus: null, goto: 'B30' });
      expect(scripting.consumeFocus(1)).toEqual({ focus: null, goto: null });
    });
  });

  describe('editing blocks', () => {
    beforeEach(async () => {
      await open(1);
      scripting.selectUnit(1, 'ch-3');
    });

    it('adds a block after the selection and persists the unit', async () => {
      scripting.selectBlock(1, 'B29');
      const id = scripting.addBlock(1, 'note');
      expect(id).toBe('B34');
      const blocks = scripting.contextOf(1)?.unit?.blocks ?? [];
      expect(blocks.map((block) => block.id).slice(2, 5)).toEqual(['B29', 'B34', 'B30']);
      expect(scripting.viewOf(1)).toMatchObject({ sel: 'B34', focus: 'B34' });
      await scripting.flush(1);
      const args = ipc.lastArgs('scripting_unit_save');
      expect(args).toMatchObject({ projectId: 1, seq: 34 });
      expect((args?.['unit'] as { id: string }).id).toBe('ch-3');
      expect(ipc.called('project_modules')).toBe(1);
      expect(scripting.addBlock(1, 'scene')).toBeNull();
    });

    it('adds at the end without a selection and inserts after Enter', () => {
      const id = scripting.addBlock(1, 'narration');
      expect(scripting.contextOf(1)?.unit?.blocks?.at(-1)?.id).toBe(id);
      const next = scripting.insertAfter(1, 'B29');
      expect(next).not.toBeNull();
      expect(scripting.contextOf(1)?.unit?.blocks?.[3].type).toBe('narration');
      expect(scripting.insertAfter(1, 'zz')).toBeNull();
    });

    it('edits, retypes, moves, duplicates and removes', async () => {
      scripting.patchBlock(1, 'B29', { text: 'New text.' });
      expect(scripting.contextOf(1)?.unit?.blocks?.[2].text).toBe('New text.');
      scripting.setBlockType(1, 'B29', 'dialogue');
      expect(scripting.contextOf(1)?.unit?.blocks?.[2]).toMatchObject({
        type: 'dialogue',
        who: 'E1',
      });
      scripting.setBlockType(1, 'B29', 'scene');
      expect(scripting.contextOf(1)?.unit?.blocks?.[2].type).toBe('dialogue');
      scripting.cycleBlockType(1, 'B29', false);
      expect(scripting.contextOf(1)?.unit?.blocks?.[2].type).toBe('note');
      scripting.cycleBlockType(1, 'B29', true);
      expect(scripting.contextOf(1)?.unit?.blocks?.[2].type).toBe('dialogue');
      scripting.moveBlock(1, 'B29', 'down');
      expect(scripting.contextOf(1)?.unit?.blocks?.[3].id).toBe('B29');
      const copy = scripting.duplicateBlock(1, 'B29');
      expect(copy).toBe('B34');
      scripting.removeBlock(1, 'B34');
      expect(scripting.contextOf(1)?.unit?.blocks?.some((block) => block.id === 'B34')).toBe(false);
      await scripting.flush(1);
      expect(ipc.called('scripting_unit_save')).toBe(7);
    });

    it('edits any unit without a lock', async () => {
      scripting.selectUnit(1, 'ch-1');
      scripting.patchBlock(1, 'B3', { text: 'x' });
      expect(scripting.contextOf(1)?.unit?.blocks?.[2].text).toBe('x');
      expect(scripting.addBlock(1, 'note')).not.toBeNull();
      expect(scripting.duplicateBlock(1, 'B3')).not.toBeNull();
      expect(scripting.insertAfter(1, 'B3')).not.toBeNull();
      scripting.removeBlock(1, 'B3');
      await scripting.flush(1);
      expect(ipc.called('scripting_unit_save')).toBe(5);
    });

    it('ignores edits of a missing project', () => {
      scripting.patchBlock(9, 'B3', { text: 'x' });
      expect(scripting.addBlock(9, 'note')).toBeNull();
      expect(scripting.duplicateBlock(9, 'B3')).toBeNull();
    });

    it('starts writing from scratch and refreshes the progress', async () => {
      const first = scripting.startWriting(1);
      expect(first).toBe('B34');
      expect(scripting.contextOf(1)?.unit?.blocks).toHaveLength(1);
      await scripting.flush(1);
      expect(ipc.called('project_modules')).toBe(1);
    });

    it('persists failures as an error', async () => {
      ipc.fail('scripting_unit_save', { code: 'disk', detail: 'full' });
      scripting.patchBlock(1, 'B29', { text: 'x' });
      await scripting.flush(1);
      expect(scripting.error()).toEqual({ code: 'disk', detail: 'full' });
    });
  });

  describe('progress', () => {
    beforeEach(async () => {
      await open(1);
    });

    it('counts a unit as done while it has content', async () => {
      expect(scripting.contextOf(1)?.railSummary).toEqual({ done: 12, total: 12, percent: 100 });
      scripting.selectUnit(1, 'ch-3');
      for (const block of scripting.contextOf(1)?.unit?.blocks ?? []) {
        scripting.removeBlock(1, block.id);
      }
      expect(scripting.contextOf(1)?.railSummary).toEqual({ done: 11, total: 12, percent: 92 });
      scripting.startWriting(1);
      expect(scripting.contextOf(1)?.railSummary).toEqual({ done: 12, total: 12, percent: 100 });
      await scripting.flush(1);
      expect(ipc.called('project_modules')).toBe(7);
    });

    it('opens the first unit and keeps every unit editable', () => {
      expect(scripting.contextOf(1)?.unit?.id).toBe('ch-1');
      scripting.selectUnit(1, 'ch-1');
      scripting.patchBlock(1, 'B1', { text: 'Edited title.' });
      expect(scripting.contextOf(1)?.unit?.blocks?.[0].text).toBe('Edited title.');
    });
  });

  describe('defaults', () => {
    beforeEach(async () => {
      await open(1);
      scripting.selectUnit(1, 'ch-3');
    });

    it('resets to the default for the unit or all units', async () => {
      expect(scripting.applyDefault(1)).toBe(true);
      expect(scripting.contextOf(1)?.unit?.blocks?.map((block) => block.type)).toEqual([
        'narration',
        'narration',
        'narration',
        'narration',
      ]);
      expect(scripting.resettableUnitsOf(1).map((unit) => unit.id)).toEqual([
        'ch-1',
        'ch-2',
        'ch-3',
      ]);
      expect(scripting.resetUnits(1, 'all')).toBe(3);
      expect(scripting.resetUnits(1, 'unit')).toBe(1);
      scripting.selectUnit(1, 'ch-4');
      expect(scripting.resetUnits(1, 'unit')).toBe(0);
      expect(scripting.applyDefault(1)).toBe(false);
      await scripting.flush(1);
      expect(ipc.called('scripting_save')).toBe(2);
    });
  });

  describe('units of a film script', () => {
    beforeEach(async () => {
      await open(3);
    });

    it('edits episodes', async () => {
      expect(scripting.contextOf(3)?.unit?.id).toBe('U01');
      expect(scripting.contextOf(3)?.scenes).toHaveLength(5);
      expect(scripting.contextOf(3)?.config.ranges).toBe(true);
      scripting.setUnitTitle(3, '  Pilot ');
      expect(scripting.contextOf(3)?.unit?.title).toBe('Pilot');
      scripting.setUnitChapter(3, 1, 3);
      expect(scripting.contextOf(3)?.unit?.chs).toEqual([1, 3]);
      scripting.setUnitChapter(3, 0, 99);
      expect(scripting.contextOf(3)?.unit?.chs).toEqual([12, 12]);
      const added = scripting.addUnit(3);
      expect(added?.chs).toEqual([4, 4]);
      expect(scripting.viewOf(3).unit).toBe(added?.id);
      await scripting.flush(3);
      expect(ipc.called('scripting_save')).toBe(1);
      expect(ipc.called('scripting_unit_save')).toBe(3);
    });

    it('does not edit audiobook titles or add free units', async () => {
      await open(1);
      scripting.selectUnit(1, 'ch-3');
      scripting.setUnitTitle(1, 'x');
      scripting.setUnitChapter(1, 0, 2);
      expect(scripting.addUnit(1)).toBeNull();
      expect(scripting.contextOf(1)?.unit?.title).toBe('Điều con nước trả lại');
    });
  });

  describe('cast', () => {
    beforeEach(async () => {
      await open(1);
    });

    it('manages manual characters', async () => {
      expect(scripting.addCastMember(1, ' ')).toBe('empty');
      expect(scripting.addCastMember(1, 'wren aldous')).toBe('duplicate');
      expect(scripting.addCastMember(1, 'Ferryman')).toBe('added');
      const added = scripting.contextOf(1)?.cast.at(-1);
      expect(added).toMatchObject({ name: 'Ferryman', kind: 'extra', c: 5 });
      scripting.renameCastMember(1, added?.id ?? '', 'Boatman');
      expect(scripting.contextOf(1)?.cast.at(-1)?.name).toBe('Boatman');
      expect(scripting.removeCastMember(1, added?.id ?? '')).toBe(true);
      expect(scripting.removeCastMember(1, 'zz')).toBe(false);
      expect(scripting.removeCastMember(1, TEA_WOMAN.id)).toBe(false);
      expect(scripting.addCastMember(9, 'x')).toBe('empty');
      await scripting.flush(1);
      expect(ipc.called('scripting_cast_save')).toBe(3);
      expect(ipc.lastArgs('scripting_cast_save')?.['extraCast']).toHaveLength(0);
    });
  });
});
