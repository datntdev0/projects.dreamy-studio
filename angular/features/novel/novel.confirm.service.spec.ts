import { TestBed } from '@angular/core/testing';
import { ToastService } from '@shared/toast/toast.service';
import { prepareConfirms } from '@testing/world';
import { describe, expect, it, vi } from 'vitest';

import { NovelConfirmService } from './novel.confirm.service';
import { NovelDialogsService } from './novel.dialogs.service';
import { NovelService } from './novel.service';

describe('NovelConfirmService', () => {
  it('refuses empty or unknown selections', async () => {
    const { confirms } = await prepareConfirms(NovelConfirmService);
    expect(await confirms.deleteNovels([])).toBe(false);
    expect(await confirms.deleteNovels([99])).toBe(false);
  });

  it('deletes novels after confirmation', async () => {
    const { ipc, confirms, dialogs } = await prepareConfirms(NovelConfirmService);
    const asking = confirms.deleteNovels([1, 2]);
    expect(dialogs.current()?.options.items).toHaveLength(2);
    await dialogs.accept();
    expect(await asking).toBe(true);
    expect(ipc.called('novel_delete')).toBe(1);
    expect(TestBed.inject(ToastService).items()).toHaveLength(1);
  });

  it('deletes a single novel and reports failures', async () => {
    const { ipc, confirms, dialogs } = await prepareConfirms(NovelConfirmService);
    const single = confirms.deleteNovels([1]);
    dialogs.cancel();
    expect(await single).toBe(false);
    ipc.fail('novel_delete', { code: 'x', detail: 'locked' });
    const failing = confirms.deleteNovels([1]);
    await dialogs.accept();
    expect(dialogs.error()).not.toBeNull();
    dialogs.cancel();
    await failing;
  });

  it('confirms chapter deletion', async () => {
    const { ipc, confirms, dialogs } = await prepareConfirms(NovelConfirmService);
    const novels = TestBed.inject(NovelService);
    await novels.loadChapters(1);
    expect(await confirms.deleteChapter(1, 'missing')).toBe(false);
    expect(await confirms.deleteChapter(99, 'c1')).toBe(false);
    const asking = confirms.deleteChapter(1, 'c1');
    await vi.waitFor(() => expect(dialogs.current()).not.toBeNull());
    await dialogs.accept();
    expect(await asking).toBe(true);
    expect(ipc.called('novel_chapter_delete')).toBe(1);
    const failing = confirms.deleteChapter(1, 'c2');
    ipc.fail('novel_chapter_delete', { code: 'x', detail: 'no' });
    await vi.waitFor(() => expect(dialogs.current()).not.toBeNull());
    await dialogs.accept();
    expect(dialogs.error()).not.toBeNull();
    dialogs.cancel();
    await failing;
  });
});

describe('NovelDialogsService', () => {
  it('tracks every dialog request', () => {
    const dialogs = TestBed.inject(NovelDialogsService);
    dialogs.openCreate();
    dialogs.openImport();
    dialogs.openAddChapter(2);
    dialogs.openAnalyze(1, { mode: 'all' });
    dialogs.openTranslate(1, { mode: 'range' });
    dialogs.openEdit(1, ['a'], 'i');
    expect([
      dialogs.createOpen(),
      dialogs.importOpen(),
      dialogs.addChapterNovelId(),
      dialogs.analyze()?.preset.mode,
      dialogs.translate()?.preset.mode,
      dialogs.edit()?.issueId,
    ]).toEqual([true, true, 2, 'all', 'range', 'i']);
    dialogs.openAdd(1, 'fact', ['x']);
    expect(dialogs.edit()).toMatchObject({ add: 'fact', ids: ['x'], issueId: null });
    dialogs.closeCreate();
    dialogs.closeImport();
    dialogs.closeAddChapter();
    dialogs.closeAnalyze();
    dialogs.closeTranslate();
    dialogs.closeEdit();
    expect([
      dialogs.createOpen(),
      dialogs.importOpen(),
      dialogs.addChapterNovelId(),
      dialogs.analyze(),
      dialogs.translate(),
      dialogs.edit(),
    ]).toEqual([false, false, null, null, null, null]);
  });
});
