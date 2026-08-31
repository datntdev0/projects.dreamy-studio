import { TestBed } from '@angular/core/testing';
import { libraryImage, libraryPrompt, librarySound, libraryVideo } from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it } from 'vitest';

import { LibraryCollectionAssetsService } from './library.collection-assets.service';
import { LibraryImageService } from './library.images.service';
import { LibraryPromptService } from './library.prompts.service';
import { LibrarySoundService } from './library.sounds.service';
import { LibraryVideoService } from './library.videos.service';

describe('LibraryCollectionAssetsService', () => {
  let assets: LibraryCollectionAssetsService;

  beforeEach(() => {
    setupApp();
    assets = TestBed.inject(LibraryCollectionAssetsService);
    flushEffects();
    TestBed.inject(LibraryImageService).items.set([
      libraryImage({ id: 1, collectionId: 5, tags: ['a'] }),
    ]);
    TestBed.inject(LibrarySoundService).items.set([librarySound({ id: 2, collectionId: 5 })]);
    TestBed.inject(LibraryVideoService).items.set([libraryVideo({ id: 3, collectionId: 6 })]);
    TestBed.inject(LibraryPromptService).items.set([libraryPrompt({ id: 4, collectionId: 5 })]);
  });

  it('lists rows of a collection, memoising the signal', () => {
    const rows = assets.rows(5);
    expect(rows()).toHaveLength(3);
    expect(assets.rows(5)).toBe(rows);
    assets.query.set('tune');
    expect(rows().map((row) => row.ref.kind)).toEqual(['sound']);
    assets.query.set('');
    assets.sort.set('name');
    expect(rows()).toHaveLength(3);
  });

  it('lists tags', () => {
    expect(assets.tags(5).map((tag) => tag.tag)).toEqual(['a']);
  });

  it('keeps selections per collection and drops stale refs', () => {
    expect(assets.selectedRef(5)).toBeNull();
    assets.select(5, { kind: 'image', id: 1 });
    expect(assets.selectedRef(5)).toEqual({ kind: 'image', id: 1 });
    expect(assets.selectedRef(6)).toBeNull();
    assets.select(5, { kind: 'image', id: 99 });
    expect(assets.selectedRef(5)).toBeNull();
    assets.select(5, null);
    expect(assets.selectedRef(5)).toBeNull();
  });
});
