import { TestBed } from '@angular/core/testing';
import { TabsService } from '@layout/tabs.service';
import { FakeIpc } from '@testing/fake-ipc';
import { libraryCollection } from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceService } from '../workspace/workspace.service';
import { LibraryService } from './library.service';

const counts = (image = 0) => ({ image, sound: 0, video: 0, prompt: 0, voice: 0 });

describe('LibraryService', () => {
  let ipc: FakeIpc;
  let library: LibraryService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on('library_collection_list', [
      libraryCollection({ id: 1, name: 'One' }),
      libraryCollection({ id: 2, name: 'Two' }),
    ]);
    ipc.on('library_tag_list', [
      { tag: 'a', counts: counts(1) },
      { tag: 'b', counts: counts(3) },
    ]);
    ipc.on('library_summary', { assets: counts(4), unfiled: counts(1) });
    library = TestBed.inject(LibraryService);
    flushEffects();
    await library.load();
  });

  it('loads taxonomy sorted by use', () => {
    expect(library.loaded()).toBe(true);
    expect(library.collections()).toHaveLength(2);
    expect(library.tags().map((tag) => tag.tag)).toEqual(['b', 'a']);
    expect(library.summary().assets.image).toBe(4);
    expect(library.collectionById(2)?.name).toBe('Two');
    expect(library.collectionById(9)).toBeUndefined();
  });

  it('handles load errors and skips redundant loads', async () => {
    await library.ensureLoaded();
    expect(ipc.called('library_summary')).toBe(1);
    ipc.fail('library_summary', { code: 'db', detail: 'x' });
    await library.load();
    expect(library.error()).toEqual({ code: 'db', detail: 'x' });
  });

  it('manages collections', async () => {
    ipc.on('library_collection_create', libraryCollection({ id: 3, name: 'Three' }));
    await library.createCollection({ name: 'Three' });
    expect(library.collections()).toHaveLength(3);
    ipc.on('library_collection_update', libraryCollection({ id: 3, name: 'Tres' }));
    await library.updateCollection(3, { name: 'Tres' });
    expect(library.collectionById(3)?.name).toBe('Tres');
    library.selectCollection(3);
    library.setFilterCollection(3);
    ipc.on('library_collection_delete', 2);
    ipc.on('library_collection_list', [libraryCollection({ id: 1 })]);
    expect(await library.deleteCollection(3)).toBe(2);
    expect(library.collectionById(3)).toBeUndefined();
    expect(library.taxonomySelection()).toBeNull();
    expect(library.filterCollection()).toBeNull();
    expect(library.revision()).toBe(1);
    expect(library.isDuplicateCollection('one')).toBe(true);
    expect(library.isDuplicateCollection('one', 1)).toBe(false);
  });

  it('manages tags', async () => {
    ipc.on('library_tag_rename', { tag: 'z', counts: counts(1) });
    ipc.on('library_tag_merge', { tag: 'b', counts: counts(1) });
    ipc.on('library_tag_delete', 3);
    await library.renameTag('a', 'z');
    expect(library.taxonomySelection()).toEqual({ kind: 'tag', id: 'z' });
    await library.mergeTag('a', 'b');
    expect(library.taxonomySelection()).toEqual({ kind: 'tag', id: 'b' });
    expect(await library.deleteTag('b')).toBe(3);
    expect(library.taxonomySelection()).toBeNull();
    expect(library.revision()).toBe(3);
  });

  it('searches tags and filters', () => {
    library.setTaxonomyQuery('a');
    expect(library.visibleTags().map((tag) => tag.tag)).toEqual(['a']);
    library.selectTag('a');
    expect(library.taxonomySelection()).toEqual({ kind: 'tag', id: 'a' });
    library.toggleFilterTag('a');
    library.toggleFilterTag('b');
    library.toggleFilterTag('a');
    expect(library.filterTags()).toEqual(['b']);
    expect(library.filtersActive()).toBe(true);
    library.clearFilters();
    expect(library.filtersActive()).toBe(false);
    library.select(null);
  });

  it('prunes selection and filters after reloading', async () => {
    library.selectTag('a');
    library.selectCollection(1);
    library.setFilterCollection(1);
    library.toggleFilterTag('a');
    ipc.on('library_collection_list', []);
    ipc.on('library_tag_list', []);
    await library.refreshTaxonomy();
    expect(library.taxonomySelection()).toBeNull();
    expect(library.filterCollection()).toBeNull();
    expect(library.filterTags()).toEqual([]);
    library.selectTag('gone');
    await library.refreshTaxonomy();
    expect(library.taxonomySelection()).toBeNull();
  });

  it('persists the view mode', () => {
    library.setViewMode('list');
    expect(localStorage.getItem('ds.lb.view')).toBe('list');
    expect(library.viewMode()).toBe('list');
  });

  it('opens the matching tab when viewing a tag', () => {
    const tabs = TestBed.inject(TabsService);
    library.viewTag('sound', 'x');
    expect(tabs.activeId()).toBe('sounds');
    library.viewTag('video', 'x');
    expect(tabs.activeId()).toBe('videos');
    library.viewTag('prompt', 'x');
    expect(tabs.activeId()).toBe('prompts');
    library.viewTag('image', 'x');
    expect(tabs.activeId()).toBe('images');
    expect(library.filterTags()).toEqual(['x']);
  });

  it('reloads on workspace change', async () => {
    ipc.on('workspace_current', { name: 'w', path: '/w' });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    await vi.waitFor(() => expect(ipc.called('library_summary')).toBeGreaterThan(1));
  });
});
