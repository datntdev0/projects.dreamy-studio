import { TestBed } from '@angular/core/testing';
import { LanguageService } from '@shared/language/language.service';
import { FakeIpc } from '@testing/fake-ipc';
import { ONTOLOGY_VIEW } from '@testing/knowledge';
import { setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// prettier-ignore
import { KNOWLEDGE_ANALYZED, KNOWLEDGE_ITEMS } from '../../stories/screens/novel-knowledge.fixtures';
// prettier-ignore
import { LANTERN_CHAPTERS, LANTERN_VI, LANTERN_VI_TITLES } from '../../stories/screens/novel-translation.fixtures';
// prettier-ignore
import { PROJECT_FIXTURES, projectModuleStatesFor } from '../../stories/screens/project-management.fixtures';
import { SPEAKER_HINTS, TEA_WOMAN } from '../../stories/screens/scripting.fixtures';
import { scriptingHandlers } from '../../stories/screens/scripting.mocks';
import { draftBlocksFor } from './scripting.draft';
import { DraftRequest } from './scripting.models';
import { ScriptingService } from './scripting.service';

const STAMP = '2026-11-09T09:15:00Z';
const SAMPLE_CHAPTERS = 3;

function chapterRows() {
  return LANTERN_CHAPTERS.map((chapter, index) => ({
    id: `ch-${index + 1}`,
    novelId: 1,
    seq: index + 1,
    title: chapter.title,
    wordCount: chapter.words,
    translationStatus: 'none',
    analysisStatus: 'none',
    createdAt: STAMP,
    updatedAt: STAMP,
  }));
}

function originalRows(chapterId: string) {
  const seq = Number(chapterId.slice(3));
  const chapter = seq <= SAMPLE_CHAPTERS ? LANTERN_CHAPTERS[seq - 1] : undefined;
  return (chapter?.paragraphs ?? []).map((text, index) => ({
    n: index + 1,
    text,
    hashcheck: `h-${seq}-${index + 1}`,
  }));
}

function translationWire() {
  const chapters: Record<string, unknown> = {};
  for (let seq = 1; seq <= SAMPLE_CHAPTERS; seq += 1) {
    chapters[`ch-${seq}`] = {
      title: LANTERN_VI_TITLES[seq - 1],
      paragraphs: originalRows(`ch-${seq}`).map((row) => ({
        n: row.n,
        originalHashcheck: row.hashcheck,
        text: LANTERN_VI[`${seq}.${row.n}`],
        note: '',
      })),
    };
  }
  return { guidelines: '', dict: [], chapters, warnings: [] };
}

function knowledgeWire() {
  return {
    lang: 'VI',
    ontology: ONTOLOGY_VIEW,
    items: KNOWLEDGE_ITEMS,
    analyzed: KNOWLEDGE_ANALYZED,
  };
}

function installBackend(ipc: FakeIpc): void {
  const backend = scriptingHandlers({
    translation_get: () => translationWire(),
    knowledge_get: knowledgeWire,
  });
  ipc.on('project_list', PROJECT_FIXTURES);
  ipc.on('novel_chapters', chapterRows());
  ipc.on('novel_chapter_read', (args) => originalRows(String(args?.['chapterId'])));
  ipc.on('translation_get', translationWire());
  for (const [command, handler] of Object.entries(backend)) {
    ipc.on(command, (args) => handler(args ?? {}));
  }
  ipc.on('scripting_draft_generate', draftHandler);
  ipc.on('project_modules', (args) => projectModuleStatesFor(Number(args?.['projectId'])));
}

function draftHandler(args: Record<string, unknown> | undefined): unknown {
  const request = args?.['request'] as DraftRequest;
  const ids = { seq: 100 };
  const blocks = draftBlocksFor(ids, request, SPEAKER_HINTS);
  if (!blocks) {
    throw { code: 'no_source', detail: 'none' };
  }
  const unit = {
    id: request.unit.id,
    no: request.unit.no,
    ch: request.unit.ch,
    chs: request.unit.chs,
    title: request.unit.title,
    status: 'draft',
    blocks,
    meta: null,
    updated: STAMP,
  };
  return { unit, seq: ids.seq };
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
    installBackend(ipc);
    scripting = TestBed.inject(ScriptingService);
    TestBed.tick();
  });

  describe('loading', () => {
    it('loads the seeded audiobook script with derived context', async () => {
      expect(scripting.contextOf(1)).toBeNull();
      await open(1);
      expect(scripting.isLoaded(1)).toBe(true);
      const ctx = scripting.contextOf(1);
      expect(ctx?.unit?.id).toBe('U03');
      expect(ctx?.unit?.status).toBe('review');
      expect(ctx?.cast.map((member) => member.id)).toEqual(['narr', 'E1', 'E3', 'E5', 'E16']);
      expect(ctx?.railSummary).toEqual({ locked: 11, total: 12, percent: 92 });
      expect(ctx?.rail[2]).toMatchObject({ mark: 'stale', stale: 2, active: true });
      expect(ctx?.rail[0]).toMatchObject({ mark: 'locked', stale: 0 });
      expect(ctx?.staleRefs).toEqual(['3.2', '3.3']);
      expect(ctx?.issues.map((issue) => issue.kind)).toEqual(['stale', 'stale']);
      expect(ctx?.canLock).toBe(true);
      expect(ctx?.hasDefault).toBe(true);
      expect(ctx?.rows?.some((row) => row.blocks === null)).toBe(false);
      expect(ctx?.stats).toMatchObject({ paragraphs: 4, covered: 4 });
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

    it('creates the first script of a project without one', async () => {
      ipc.on('scripting_get', null);
      await open(5);
      expect(ipc.called('scripting_save')).toBe(1);
      const created = scripting.scriptOf(5);
      expect(created?.units).toHaveLength(3);
      expect(created?.units[1].title).toBe(LANTERN_VI_TITLES[1]);
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
      expect(scripting.lockUnit(1)).toBe('noop');
      expect(scripting.unlockUnit(1)).toBe(false);
      expect(scripting.removeCastMember(1, 'x')).toBe(false);
      expect(scripting.resetUnits(1, 'all')).toBe(0);
      expect(scripting.addUnit(1)).toBeNull();
      expect(scripting.startWriting(1)).toBeNull();
      scripting.setPreset(1, 'film');
      scripting.renameCastMember(1, 'x', 'y');
      scripting.keepStale(1, '1.1');
      scripting.toggleAllGroups(1);
      expect(scripting.anyGroupOpen(1)).toBe(false);
      expect(await scripting.generateDrafts(1, ['U01'], 'claude')).toBe(0);
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
      scripting.selectUnit(1, 'U01');
      await scripting.ensureSources(1);
      const ctx = scripting.contextOf(1);
      expect(ctx?.unit?.id).toBe('U01');
      expect(ctx?.locked).toBe(true);
      scripting.selectBlock(1, 'B3');
      expect(scripting.contextOf(1)?.selected?.id).toBe('B3');
      scripting.selectUnit(1, 'zz');
      expect(scripting.viewOf(1).unit).toBe('U01');
      expect(scripting.viewOf(1).sel).toBe('B3');
      scripting.selectUnit(1, 'U02');
      expect(scripting.viewOf(1).sel).toBeNull();
    });

    it('toggles source groups and the drawer', () => {
      scripting.toggleGroup(1, '3.1');
      expect(scripting.viewOf(1).collapsed).toEqual({ '3.1': true });
      expect(scripting.anyGroupOpen(1)).toBe(true);
      scripting.toggleAllGroups(1);
      expect(Object.keys(scripting.viewOf(1).collapsed)).toHaveLength(4);
      expect(scripting.anyGroupOpen(1)).toBe(false);
      scripting.toggleAllGroups(1);
      expect(scripting.viewOf(1).collapsed).toEqual({});
      scripting.toggleDrawer(1);
      expect(scripting.viewOf(1).drawer).toBe(true);
    });

    it('jumps to blocks and references', () => {
      scripting.toggleGroup(1, '3.2');
      scripting.gotoBlock(1, 'B30');
      expect(scripting.viewOf(1)).toMatchObject({ sel: 'B30', goto: 'B30', collapsed: {} });
      scripting.gotoRef(1, '3.4');
      expect(scripting.consumeFocus(1)).toEqual({ focus: null, goto: 'B30', ref: '3.4' });
      expect(scripting.consumeFocus(1)).toEqual({ focus: null, goto: null, ref: null });
    });
  });

  describe('editing blocks', () => {
    beforeEach(async () => {
      await open(1);
      scripting.selectUnit(1, 'U03');
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
      expect((args?.['unit'] as { id: string }).id).toBe('U03');
      expect(ipc.called('project_modules')).toBe(0);
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

    it('ignores edits of a locked unit or a missing unit', async () => {
      scripting.selectUnit(1, 'U01');
      scripting.patchBlock(1, 'B3', { text: 'x' });
      scripting.removeBlock(1, 'B3');
      expect(scripting.addBlock(1, 'note')).toBeNull();
      expect(scripting.duplicateBlock(1, 'B3')).toBeNull();
      expect(scripting.startWriting(1)).toBeNull();
      expect(scripting.insertAfter(1, 'B3')).toBeNull();
      await scripting.flush(1);
      expect(ipc.called('scripting_unit_save')).toBe(0);
      scripting.patchBlock(9, 'B3', { text: 'x' });
      expect(scripting.addBlock(9, 'note')).toBeNull();
    });

    it('starts writing from scratch and refreshes the progress', async () => {
      const first = scripting.startWriting(1);
      expect(first).toBe('B34');
      expect(scripting.contextOf(1)?.unit?.blocks).toHaveLength(1);
      expect(scripting.contextOf(1)?.unit?.status).toBe('draft');
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

  describe('locking', () => {
    beforeEach(async () => {
      await open(1);
    });

    it('locks a clean unit and refreshes the module progress', async () => {
      expect(scripting.lockUnit(1)).toBe('locked');
      expect(scripting.contextOf(1)?.locked).toBe(true);
      expect(scripting.lockUnit(1)).toBe('noop');
      await scripting.flush(1);
      expect(ipc.called('project_modules')).toBe(1);
      expect(scripting.contextOf(1)?.railSummary.locked).toBe(12);
    });

    it('keeps the unit open after locking the only unlocked one', () => {
      expect(scripting.contextOf(1)?.unit?.id).toBe('U03');
      scripting.lockUnit(1);
      expect(scripting.contextOf(1)?.unit?.id).toBe('U03');
    });

    it('refuses to lock a unit with errors', () => {
      scripting.selectUnit(1, 'U03');
      scripting.patchBlock(1, 'B29', { text: ' ' });
      expect(scripting.lockUnit(1)).toBe('errors');
      expect(scripting.contextOf(1)?.canLock).toBe(false);
      expect(scripting.contextOf(1)?.checkSummary.errors).toBe(1);
    });

    it('unlocks into review when the source changed', async () => {
      scripting.selectUnit(1, 'U03');
      expect(scripting.unlockUnit(1)).toBe(false);
      scripting.lockUnit(1);
      expect(scripting.unlockUnit(1)).toBe(true);
      expect(scripting.contextOf(1)?.unit?.status).toBe('review');
      scripting.keepStale(1, '3.2');
      scripting.keepStale(1, '3.3');
      expect(scripting.contextOf(1)?.staleRefs).toEqual([]);
      scripting.lockUnit(1);
      scripting.unlockUnit(1);
      expect(scripting.contextOf(1)?.unit?.status).toBe('draft');
      await scripting.flush(1);
    });
  });

  describe('source repair', () => {
    beforeEach(async () => {
      await open(1);
      scripting.selectUnit(1, 'U03');
    });

    it('regenerates a changed paragraph', async () => {
      scripting.regenerate(1, '3.2');
      expect(scripting.contextOf(1)?.staleRefs).toEqual(['3.3']);
      await scripting.flush(1);
      expect(ipc.called('project_modules')).toBe(1);
    });

    it('covers a missing paragraph', () => {
      scripting.removeBlock(1, 'B31');
      expect(scripting.contextOf(1)?.uncovered.map((item) => item.id)).toEqual(['3.3']);
      expect(scripting.contextOf(1)?.issues.map((issue) => issue.kind)).toContain('uncovered');
      scripting.coverParagraph(1, '3.3');
      expect(scripting.contextOf(1)?.uncovered).toEqual([]);
    });

    it('resets to the default for the unit or all units', async () => {
      expect(scripting.applyDefault(1)).toBe(true);
      expect(scripting.contextOf(1)?.unit?.status).toBe('draft');
      expect(scripting.contextOf(1)?.unit?.blocks?.length).toBe(6);
      expect(scripting.resettableUnitsOf(1).map((unit) => unit.id)).toEqual(['U03']);
      expect(scripting.resetUnits(1, 'all')).toBe(1);
      expect(scripting.resetUnits(1, 'unit')).toBe(1);
      scripting.selectUnit(1, 'U01');
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
      scripting.selectUnit(1, 'U03');
      scripting.setUnitTitle(1, 'x');
      scripting.setUnitChapter(1, 0, 2);
      expect(scripting.addUnit(1)).toBeNull();
      expect(scripting.contextOf(1)?.unit?.title).toBe('Điều thủy triều trả lại');
    });

    it('describes the drafting options and the estimate', () => {
      const options = scripting.draftOptionsOf(3);
      expect(options.map((option) => option.reason)).toEqual([null, null]);
      const estimate = scripting.draftEstimateOf(3, ['U01', 'U02']);
      expect(estimate.tin).toBeGreaterThan(700);
      expect(scripting.draftEstimateOf(3, []).tin).toBe(0);
      expect(scripting.draftOptionsOf(99)).toEqual([]);
      expect(scripting.draftEstimateOf(99, ['U01']).tin).toBe(0);
    });
  });

  describe('AI drafts', () => {
    it('generates drafts sequentially and applies them', async () => {
      await open(1);
      expect(scripting.isGenerating(1)).toBe(false);
      const count = await scripting.generateDrafts(1, ['U03', 'U01'], 'claude');
      expect(count).toBe(1);
      expect(scripting.isGenerating(1)).toBe(false);
      const drafted = scripting.scriptOf(1)?.units[2];
      expect(drafted?.status).toBe('draft');
      expect(drafted?.blocks?.[0].text).toBe('Chapter three. Điều thủy triều trả lại.');
      expect(scripting.scriptOf(1)?.seq).toBeGreaterThanOrEqual(100);
      expect(ipc.lastArgs('scripting_draft_generate')).toMatchObject({
        projectId: 1,
        unitId: 'U03',
        provider: 'claude',
      });
      expect(ipc.called('project_modules')).toBe(1);
    });

    it('marks the unit as generating while waiting', async () => {
      await open(1);
      let release: () => void = () => undefined;
      ipc.on('scripting_draft_generate', async (args) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return draftHandler(args);
      });
      const pending = scripting.generateDrafts(1, ['U03'], 'claude');
      await vi.waitFor(() => expect(scripting.isGenerating(1, 'U03')).toBe(true));
      expect(scripting.isGenerating(1, 'U01')).toBe(false);
      expect(scripting.contextOf(1)?.generating).toBe(true);
      release();
      await pending;
      expect(scripting.isGenerating(1)).toBe(false);
    });

    it('reports a failed draft', async () => {
      await open(1);
      ipc.fail('scripting_draft_generate', { code: 'llm', detail: 'down' });
      expect(await scripting.generateDrafts(1, ['U03'], 'claude')).toBe(0);
      expect(scripting.error()).toEqual({ code: 'llm', detail: 'down' });
      expect(scripting.isGenerating(1)).toBe(false);
    });

    it('skips locked and unknown units', async () => {
      await open(1);
      expect(await scripting.generateDrafts(1, ['U01', 'zz'], 'claude')).toBe(0);
      expect(ipc.called('scripting_draft_generate')).toBe(0);
    });

    it('drafts an episode from the Knowledgebase', async () => {
      await open(3);
      scripting.selectUnit(3, 'U02');
      expect(await scripting.generateDrafts(3, ['U02'], 'claude')).toBe(1);
      const blocks = scripting.scriptOf(3)?.units[1].blocks ?? [];
      expect(blocks[0].type).toBe('scene');
      expect(blocks[0].loc).not.toBe('');
      const request = ipc.lastArgs('scripting_draft_generate')?.['request'] as DraftRequest;
      expect(request.preset).toBe('film');
      expect(request.beats.length).toBeGreaterThan(0);
      expect(request.source?.length).toBe(4);
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

  describe('messages', () => {
    beforeEach(() => {
      TestBed.inject(LanguageService).setLanguage('en');
    });

    it('renders issue messages with their parameters', async () => {
      await open(1);
      scripting.selectUnit(1, 'U03');
      const [stale] = scripting.contextOf(1)?.issues ?? [];
      expect(scripting.issueMessage(stale)).toBe(
        'Source paragraph ¶2 changed after the script was made.',
      );
      scripting.patchBlock(1, 'B29', { text: '' });
      const empty = scripting.contextOf(1)?.issues.find((item) => item.kind === 'empty');
      expect(scripting.issueMessage(empty as never)).toBe('The narration block is empty.');
      scripting.selectUnit(1, 'U04');
      const none = {
        kind: 'none',
        params: { unit: 'chapter' },
        messageKey: 'scripting.issue.none',
      };
      expect(scripting.issueMessage(none as never)).toBe('Chapter has no content.');
    });
  });
});
