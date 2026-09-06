import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { fieldValue } from '@shared/utils/dom';

import { LibraryDialogsService } from '../library.dialogs.service';
import { ASSET_RIGHTS, AssetRights } from '../library.models';
import { clearTagField, enteredTag, rightsKey } from '../library.rules';
import { LibraryService } from '../library.service';

const MAX_TAGS = 12;
const NEW_COLLECTION = '__new';

function isOtherTag(removed: string, tag: string): boolean {
  return tag !== removed;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-asset-fields',
  imports: [Icon, CoreModule],
  templateUrl: './asset-fields.component.html',
  host: { 'data-testid': 'library-asset-fields' },
})
export class LibraryAssetFields {
  readonly fieldId = input.required<string>();
  readonly tags = input.required<string[]>();
  readonly collectionId = input.required<number | null>();
  readonly rights = input.required<AssetRights>();
  readonly tagsChange = output<string[]>();
  readonly collectionChange = output<number | null>();
  readonly rightsChange = output<AssetRights>();
  readonly library = inject(LibraryService);
  private readonly dialogs = inject(LibraryDialogsService);
  readonly rightOptions = ASSET_RIGHTS;
  readonly maxTags = MAX_TAGS;

  rightKey(right: AssetRights): LanguageKey {
    return rightsKey(right);
  }

  isFull(): boolean {
    return this.tags().length >= MAX_TAGS;
  }

  removeTag(tag: string): void {
    this.tagsChange.emit(this.tags().filter(isOtherTag.bind(null, tag)));
  }

  addTag(event: KeyboardEvent): void {
    const tag = enteredTag(event);
    if (!tag || this.tags().includes(tag) || this.isFull()) return;
    clearTagField(event);
    this.tagsChange.emit([...this.tags(), tag]);
  }

  setCollection(event: Event): void {
    const value = fieldValue(event);
    if (value === NEW_COLLECTION) {
      this.dialogs.openCreateCollection();
      return;
    }
    this.collectionChange.emit(value ? Number(value) : null);
  }

  setRights(event: Event): void {
    this.rightsChange.emit(fieldValue(event) as AssetRights);
  }
}
