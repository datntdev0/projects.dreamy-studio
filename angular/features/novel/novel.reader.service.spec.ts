import { TestBed } from '@angular/core/testing';
import { FakeIpc, setupIpc } from '@testing/fake-ipc';
import { chapter, novel } from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceService } from '../workspace/workspace.service';
import { NovelReaderService } from './novel.reader.service';
import { NovelService } from './novel.service';

const rows = () => [
  chapter({ id: 'c1', seq: 1, title: 'One' }),
  chapter({ id: 'c2', seq: 2, title: 'Two' }),
  chapter({ id: 'c3', seq: 3, title: 'Three' }),
];
const paragraphs = [
  { n: 1, text: 'first', hashcheck: 'h' },
  { n: 2, text: 'second', hashcheck: 'h' },
];

describe('NovelReaderService', () => {
  let ipc: FakeIpc;
  let reader: NovelReaderService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on('novel_list', [novel({ id: 1, lang: 'EN' })]);
    ipc.on('novel_chapters', rows());
    ipc.on('novel_chapter_read', paragraphs);
    ipc.on('translation_get', {
      guidelines: '',
      dict: [],
      chapters: { c1: { title: 'Mot', paragraphs: [] } },
      warnings: [],
    });
    reader = TestBed.inject(NovelReaderService);
    flushEffects();
    await TestBed.inject(NovelService).load();
  });

  it('opens the chapter list', async () => {
    await reader.openNovel(1);
    expect(reader.screenOf(1)).toBe('chapters');
    expect(reader.chapters()).toHaveLength(3);
    expect(reader.total()).toBe(3);
    expect(reader.screenOf(9)).toBe('chapters');
  });

  it('opens the reader and navigates', async () => {
    await reader.openReader(1, 2, 5);
    expect(reader.screenOf(1)).toBe('reading');
    expect(reader.seq()).toBe(2);
    expect(reader.current()?.id).toBe('c2');
    expect(reader.paragraphs()).toEqual(paragraphs);
    expect(reader.hasPrev()).toBe(true);
    expect(reader.hasNext()).toBe(true);
    expect(reader.nextChapter()?.id).toBe('c3');
    expect(reader.consumeFocus()).toBe(5);
    expect(reader.consumeFocus()).toBeNull();
    await reader.next();
    await reader.next();
    expect(reader.seq()).toBe(3);
    await reader.prev();
    expect(reader.seq()).toBe(2);
    expect(reader.resumeSeq(1)).toBe(2);
    expect(reader.resumeSeq(9)).toBe(1);
    reader.backToChapters(1);
    expect(reader.screenOf(1)).toBe('chapters');
    await reader.openReader(1);
    expect(reader.seq()).toBe(2);
  });

  it('ignores navigation without an open novel', async () => {
    await reader.gotoChapter(2);
    expect(ipc.called('novel_chapter_read')).toBe(0);
  });

  it('records read failures', async () => {
    ipc.fail('novel_chapter_read', { code: 'x', detail: 'y' });
    await reader.openReader(1, 1);
    expect(reader.error()).toEqual({ code: 'x', detail: 'y' });
    expect(reader.paragraphs()).toEqual([]);
    expect(reader.loading()).toBe(false);
  });

  it('clears paragraphs when the chapter is missing', async () => {
    ipc.on('novel_chapters', []);
    await reader.openReader(1);
    expect(reader.paragraphs()).toEqual([]);
  });

  it('switches views and languages', async () => {
    await reader.openReader(1, 1);
    expect(reader.view()).toEqual({ lang: 'src', layout: 'single' });
    expect(reader.showSource()).toBe(true);
    expect(reader.readerTarget(1)).toBe('VI');
    expect(reader.titleOf(1, rows()[0])).toBe('One');
    reader.setLang(1, 'VI');
    await vi.waitFor(() => expect(reader.titleOf(1, rows()[0])).toBe('Mot'));
    expect(reader.titleOf(1, rows()[1])).toBe('Two');
    expect(reader.showSource()).toBe(false);
    reader.setLayout(1, 'parallel');
    expect(reader.view().layout).toBe('parallel');
    reader.setLang(1, 'src');
    expect(reader.view().layout).toBe('single');
    reader.setLayout(1, 'parallel');
    reader.setMode('edit');
    reader.startEdit(1);
    expect(reader.editing()).toBe(1);
    reader.setLang(1, 'EN');
    expect(reader.editing()).toBeNull();
    expect(reader.viewOf(9)).toEqual({ lang: 'src', layout: 'single' });
  });

  it('edits paragraphs', async () => {
    await reader.openReader(1, 1);
    reader.startEdit(1);
    expect(reader.editing()).toBeNull();
    reader.setMode('edit');
    reader.startEdit(1);
    expect(reader.canEdit()).toBe(true);
    expect(await reader.saveParagraph('   ')).toBe('empty');
    expect(await reader.saveParagraph('first')).toBe('unchanged');
    reader.startEdit(1);
    ipc.on('novel_paragraph_update', chapter({ id: 'c1', seq: 1 }));
    expect(await reader.saveParagraph('changed\ntext')).toBe('saved');
    expect(ipc.lastArgs('novel_paragraph_update')).toMatchObject({ n: 1, text: 'changed text' });
    expect(reader.editing()).toBeNull();
    expect(await reader.saveParagraph('x')).toBe('idle');
    reader.startEdit(1);
    reader.cancelEdit();
    expect(reader.editing()).toBeNull();
  });

  it('adds passages', async () => {
    await reader.openReader(1, 1);
    reader.setMode('edit');
    expect(reader.canAdd()).toBe(true);
    reader.startAddPassage();
    expect(reader.adding()).toBe(true);
    ipc.on('novel_paragraph_add', chapter({ id: 'c1', seq: 1 }));
    expect(await reader.saveParagraph('third')).toBe('saved');
    expect(ipc.called('novel_paragraph_add')).toBe(1);
  });

  it('renames chapters', async () => {
    expect(await reader.renameChapter('x')).toBe('idle');
    await reader.openReader(1, 1);
    expect(await reader.renameChapter(' ')).toBe('empty');
    expect(await reader.renameChapter('One')).toBe('unchanged');
    ipc.on('novel_chapter_rename', chapter({ id: 'c1', seq: 1, title: 'Uno' }));
    expect(await reader.renameChapter('Uno')).toBe('saved');
  });

  it('writes whole chapters', async () => {
    await reader.openReader(1, 1);
    expect(await reader.saveChapter('x')).toBe('idle');
    reader.setMode('write');
    expect(reader.writing()).toBe(true);
    expect(reader.fullText()).toBe('first\n\nsecond');
    expect(await reader.saveChapter(' ')).toBe('empty');
    expect(await reader.saveChapter('first\n\nsecond')).toBe('unchanged');
    ipc.on('novel_chapter_write', chapter({ id: 'c1', seq: 1 }));
    expect(await reader.saveChapter('new text')).toBe('saved');
    expect(reader.saving()).toBe(false);
  });

  it('moves and deletes chapters while following the resume position', async () => {
    await reader.openReader(1, 2);
    ipc.on(
      'novel_chapter_move',
      [rows()[1], rows()[0], rows()[2]].map((row, index) => ({ ...row, seq: index + 1 })),
    );
    await reader.moveChapter(1, 'c2', 1);
    expect(reader.resumeSeq(1)).toBe(1);
    ipc.on(
      'novel_chapter_delete',
      [rows()[0], rows()[2]].map((row, index) => ({ ...row, seq: index + 1 })),
    );
    await reader.deleteChapter(1, 'c2');
    expect(reader.screenOf(1)).toBe('reading');
    ipc.on('novel_chapter_delete', []);
    await reader.deleteChapter(1, 'c1');
    expect(reader.screenOf(1)).toBe('chapters');
    expect(reader.paragraphs()).toEqual([]);
  });

  it('invalidates the open chapter only', async () => {
    await reader.openReader(1, 1);
    ipc.calls.length = 0;
    await reader.invalidate(1, 'c2');
    expect(ipc.called('novel_chapter_read')).toBe(0);
    await reader.invalidate(1, 'c1');
    expect(ipc.called('novel_chapter_read')).toBe(1);
  });

  it('stores reader preferences', () => {
    reader.setPref('size', 20);
    expect(JSON.parse(localStorage.getItem('ds.rd.prefs') as string).size).toBe(20);
    expect(reader.pageStyle()).toContain('20px');
    reader.resetPrefs();
    expect(reader.prefs().size).toBe(17);
    TestBed.resetTestingModule();
    setupIpc();
    localStorage.setItem('ds.rd.prefs', '{bad');
    expect(TestBed.inject(NovelReaderService).prefs().size).toBe(17);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    TestBed.inject(NovelReaderService).setPref('size', 18);
    vi.restoreAllMocks();
  });

  it('closes novels and resets', async () => {
    await reader.openReader(1, 2);
    reader.closeNovels([5]);
    expect(reader.novelId()).toBe(1);
    reader.closeNovels([1]);
    expect(reader.novelId()).toBeNull();
    expect(reader.screenOf(1)).toBe('chapters');
    await reader.openReader(1, 2);
    reader.setMode('edit');
    ipc.on('workspace_current', { name: 'w', path: '/w' });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    expect(reader.novelId()).toBeNull();
    expect(reader.mode()).toBe('read');
  });

  it('drops stale chapter reads', async () => {
    let release: (value: unknown) => void = () => undefined;
    ipc.on('novel_chapter_read', () => new Promise((resolve) => (release = resolve)));
    const first = reader.openReader(1, 1);
    await vi.waitFor(() => expect(ipc.called('novel_chapter_read')).toBe(1));
    ipc.on('novel_chapter_read', paragraphs);
    await reader.openReader(1, 2);
    release([{ n: 9, text: 'stale', hashcheck: 'h' }]);
    await first;
    expect(reader.paragraphs()).toEqual(paragraphs);
  });
});
