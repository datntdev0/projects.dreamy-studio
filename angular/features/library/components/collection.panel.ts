// prettier-ignore
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Icon } from '@components/icon';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { LibraryConfirmService } from '../library.confirm.service';
import { LIBRARY_KINDS, LibraryCollection, LibraryKind } from '../library.models';
import { formatIsoMinute, libraryErrorKey, sumCounts } from '../library.rules';
import { LibraryService } from '../library.service';

const COLLECTION_NAME_MAX = 80;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-collection-panel',
  imports: [Icon, CoreModule],
  templateUrl: './collection.panel.html',
  host: { 'data-testid': 'library-collection-panel' },
})
export class LibraryCollectionPanel {
  readonly collectionId = input.required<number>();
  readonly showOpen = input(false);
  readonly library = inject(LibraryService);
  readonly kinds = LIBRARY_KINDS;
  readonly nameError = signal<LanguageKey | null>(null);
  readonly descriptionError = signal<LanguageKey | null>(null);
  private readonly confirms = inject(LibraryConfirmService);
  private readonly tabs = inject(TabsService);
  constructor() {
    effect(this.syncCollection.bind(this));
  }

  collection() {
    return this.library.collectionById(this.collectionId());
  }
  created(item: LibraryCollection): string {
    return formatIsoMinute(item.createdAt);
  }
  total(item: LibraryCollection): number {
    return sumCounts(item.counts);
  }
  count(item: LibraryCollection, kind: LibraryKind): number {
    return item.counts[kind];
  }
  clearErrors(): void {
    this.nameError.set(null);
    this.descriptionError.set(null);
  }

  editName(event: Event): void {
    const item = this.collection();
    const field = event.target as HTMLInputElement;
    if (!item) {
      return;
    }
    const name = field.value.trim();
    const error = this.nameRejection(item, name);
    if (error) {
      field.value = item.name;
      this.nameError.set(error);
      return;
    }
    this.nameError.set(null);
    if (name !== item.name) {
      void this.save(item, { name }, field);
    }
  }

  editDescription(event: Event): void {
    const item = this.collection();
    const field = event.target as HTMLTextAreaElement;
    if (item) {
      this.descriptionError.set(null);
      void this.save(item, { description: field.value }, field);
    }
  }

  open(item: LibraryCollection): void {
    this.tabs.openCollection(item.id, item.name);
  }
  remove(item: LibraryCollection): void {
    this.confirms.deleteCollection(item.id);
  }
  private syncCollection(): void {
    this.collectionId();
    untracked(this.clearErrors.bind(this));
  }

  private nameRejection(item: LibraryCollection, name: string): LanguageKey | null {
    if (!name) {
      return 'library.error.nameRequired';
    }
    if ([...name].length > COLLECTION_NAME_MAX) {
      return 'library.error.invalidInput';
    }
    return this.library.isDuplicateCollection(name, item.id)
      ? 'library.error.collectionExists'
      : null;
  }

  private async save(
    item: LibraryCollection,
    patch: { name?: string; description?: string },
    field: HTMLInputElement | HTMLTextAreaElement,
  ): Promise<void> {
    try {
      const updated = await this.library.updateCollection(item.id, patch);
      this.tabs.renameCollection(item.id, updated.name);
    } catch (cause) {
      const error = libraryErrorKey(cause) as LanguageKey;
      if (patch.name === undefined) {
        field.value = item.description;
        this.descriptionError.set(error);
      } else {
        field.value = item.name;
        this.nameError.set(error);
      }
    }
  }
}
