import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Button } from '@components/button';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { fieldValue } from '@shared/utils/dom';

import { LibraryDialogsService } from '../library.dialogs.service';
import { libraryErrorKey } from '../library.rules';
import { LibraryService } from '../library.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-collection-dialog',
  imports: [Button, CoreModule],
  templateUrl: './collection.dialog.html',
  host: { 'data-testid': 'library-collection-dialog' },
})
export class LibraryCollectionDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly library = inject(LibraryService);
  readonly open = this.dialogs.createCollectionOpen;
  readonly name = signal('');
  readonly description = signal('');
  readonly errorKey = signal<LanguageKey | null>(null);
  readonly busy = signal(false);
  onName(event: Event): void {
    this.name.set(fieldValue(event));
    this.errorKey.set(null);
  }
  onDescription(event: Event): void {
    this.description.set(fieldValue(event));
  }
  close(): void {
    this.dialogs.closeCreateCollection();
  }
  async submit(): Promise<void> {
    const name = this.name().trim();
    if (!name) {
      this.errorKey.set('library.error.nameRequired');
      return;
    }
    if (this.library.isDuplicateCollection(name)) {
      this.errorKey.set('library.error.collectionExists');
      return;
    }
    this.busy.set(true);
    try {
      await this.library.createCollection({ name, description: this.description().trim() });
      this.name.set('');
      this.description.set('');
      this.close();
    } catch (error) {
      this.errorKey.set(libraryErrorKey(error) as LanguageKey);
    } finally {
      this.busy.set(false);
    }
  }
}
