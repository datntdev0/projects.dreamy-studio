import { TestBed } from '@angular/core/testing';
import { FakeIpc } from '@testing/fake-ipc';
import { libraryVideo } from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceService } from '../workspace/workspace.service';
import { LibraryService } from './library.service';
import { LibraryVideoService } from './library.videos.service';

const counts = { image: 0, sound: 0, video: 0, prompt: 0 };

describe('LibraryVideoService', () => {
  let ipc: FakeIpc;
  let videos: LibraryVideoService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on('library_collection_list', []);
    ipc.on('library_tag_list', []);
    ipc.on('library_summary', { assets: counts, unfiled: counts });
    ipc.on('library_video_list', [
      libraryVideo({ id: 1, name: 'a' }),
      libraryVideo({ id: 2, name: 'b', hasPoster: false }),
    ]);
    videos = TestBed.inject(LibraryVideoService);
    flushEffects();
    await videos.ensureLoaded();
  });

  it('loads, filters and selects', async () => {
    await videos.ensureLoaded();
    expect(ipc.called('library_video_list')).toBe(1);
    videos.query.set('b');
    expect(videos.visible().map((item) => item.id)).toEqual([2]);
    videos.select(2);
    expect(videos.selected()?.id).toBe(2);
    videos.select(null);
    expect(videos.selected()).toBeNull();
    expect(videos.source(2)).toContain('dreamy-video');
  });

  it('proxies commands and uploads', async () => {
    ipc.on('library_video_pick', ['/a.mp4']);
    ipc.on('library_video_inspect', []);
    expect(await videos.pick()).toEqual(['/a.mp4']);
    expect(await videos.inspect(['/a.mp4'])).toEqual([]);
    ipc.fail('library_video_upload', 'x');
    await expect(videos.upload('/a', { tags: [], rights: 'own' })).rejects.toBe('x');
    ipc.on('library_video_upload', libraryVideo({ id: 7 }));
    await videos.upload('/b', { tags: [], rights: 'own' });
    expect(videos.items()[0].id).toBe(7);
  });

  it('updates and removes', async () => {
    ipc.on('library_video_update', libraryVideo({ id: 1, name: 'z' }));
    await videos.update(1, { name: 'z' });
    expect(videos.items().find((item) => item.id === 1)?.name).toBe('z');
    videos.select(1);
    ipc.on('library_video_delete', 1);
    await videos.remove([1]);
    expect(videos.selectedId()).toBeNull();
    await videos.remove([2]);
  });

  it('caches posters when available', async () => {
    ipc.on('library_video_poster', 'data:poster');
    expect(videos.poster(1)).toBeNull();
    expect(videos.poster(1)).toBeNull();
    await vi.waitFor(() => expect(videos.poster(1)).toBe('data:poster'));
    expect(ipc.called('library_video_poster')).toBe(1);
    expect(videos.poster(2)).toBeNull();
    expect(videos.poster(99)).toBeNull();
    expect(ipc.called('library_video_poster')).toBe(1);
    ipc.fail('library_video_poster', 'x');
    videos.items.set([libraryVideo({ id: 5, hasPoster: true })]);
    videos.poster(5);
    await vi.waitFor(() => expect(ipc.called('library_video_poster')).toBe(2));
  });

  it('stores grid preferences and reacts to library changes', async () => {
    videos.setGridSize(222);
    videos.setGridRatio('9/16');
    expect(localStorage.getItem('ds.lb.videos.grid-size')).toBe('222');
    expect(localStorage.getItem('ds.lb.videos.grid-ratio')).toBe('9/16');
    TestBed.inject(LibraryService).revision.update((value) => value + 1);
    flushEffects();
    await vi.waitFor(() => expect(ipc.called('library_video_list')).toBeGreaterThan(1));
    ipc.fail('library_video_list', { code: 'io', detail: 'x' });
    ipc.on('workspace_current', { name: 'w', path: '/w' });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    await vi.waitFor(() => expect(videos.error()).toEqual({ code: 'io', detail: 'x' }));
  });
});
