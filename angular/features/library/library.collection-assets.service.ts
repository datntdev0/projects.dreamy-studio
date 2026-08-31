import { computed, inject, Injectable, Signal, signal, WritableSignal } from '@angular/core';

import { AssetRow, toAssetRows } from './library.assets.models';
import { collectionTags, filterAssetRows } from './library.assets.rules';
import { LibraryImageService } from './library.images.service';
import { AssetRef, LibrarySort, LibraryTag } from './library.models';
import { LibraryPromptService } from './library.prompts.service';
import { LibraryService } from './library.service';
import { LibrarySoundService } from './library.sounds.service';
import { LibraryVideoService } from './library.videos.service';

function sameRef(left: AssetRef, right: AssetRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}
function containsRef(rows: AssetRow[], ref: AssetRef): boolean {
  return rows.some(sameRowRef.bind(null, ref));
}
function sameRowRef(ref: AssetRef, row: AssetRow): boolean {
  return sameRef(row.ref, ref);
}

@Injectable({ providedIn: 'root' })
export class LibraryCollectionAssetsService {
  private readonly images = inject(LibraryImageService);
  private readonly sounds = inject(LibrarySoundService);
  private readonly videos = inject(LibraryVideoService);
  private readonly prompts = inject(LibraryPromptService);
  private readonly library = inject(LibraryService);
  private readonly rowsByCollection = new Map<number, Signal<AssetRow[]>>();
  private readonly selections = new Map<number, WritableSignal<AssetRef | null>>();

  readonly query = signal('');
  readonly sort = signal<LibrarySort>('new');

  rows(collectionId: number): Signal<AssetRow[]> {
    const existing = this.rowsByCollection.get(collectionId);
    if (existing) return existing;
    const rows = computed(this.filterRows.bind(this, collectionId));
    this.rowsByCollection.set(collectionId, rows);
    return rows;
  }

  allRows(): AssetRow[] {
    return toAssetRows(
      this.images.items(),
      this.sounds.items(),
      this.videos.items(),
      this.prompts.items(),
    );
  }

  tags(collectionId: number): LibraryTag[] {
    return collectionTags(this.allRows(), collectionId);
  }

  selectedRef(collectionId: number): AssetRef | null {
    const ref = this.selection(collectionId)();
    return ref !== null && containsRef(this.rows(collectionId)(), ref) ? ref : null;
  }

  select(collectionId: number, ref: AssetRef | null): void {
    this.selection(collectionId).set(ref);
  }

  private filterRows(collectionId: number): AssetRow[] {
    return filterAssetRows(this.allRows(), {
      query: this.query(),
      sort: this.sort(),
      collection: collectionId,
      tags: this.library.filterTags(),
    });
  }

  private selection(collectionId: number): WritableSignal<AssetRef | null> {
    const existing = this.selections.get(collectionId);
    if (existing) return existing;
    const selected = signal<AssetRef | null>(null);
    this.selections.set(collectionId, selected);
    return selected;
  }
}
