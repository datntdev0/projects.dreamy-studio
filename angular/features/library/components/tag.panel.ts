import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { fieldValue } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { LIBRARY_KINDS, LibraryKind, LibraryTag } from '../library.models';
import { normalizeTag, sumCounts } from '../library.rules';
import { LibraryService } from '../library.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-tag-panel',
  imports: [Icon, CoreModule],
  templateUrl: './tag.panel.html',
  host: { 'data-testid': 'library-tag-panel' },
})
export class LibraryTagPanel {
  readonly tag = input.required<string>();
  readonly library = inject(LibraryService);
  readonly kinds = LIBRARY_KINDS;
  private readonly confirms = inject(LibraryConfirmService);
  row() {
    return this.library.tags().find(this.matchesTag.bind(this));
  }
  total(item: LibraryTag): number {
    return sumCounts(item.counts);
  }
  count(item: LibraryTag, kind: LibraryKind): number {
    return item.counts[kind];
  }
  rename(event: Event): void {
    const old = this.tag();
    const next = normalizeTag(fieldValue(event));
    if (!next || next === old) return;
    if (this.library.tags().some(this.matchesOtherTag.bind(this, next, old))) {
      this.confirms.confirmTag('merge', old, next);
      return;
    }
    void this.library.renameTag(old, next);
  }
  merge(event: Event): void {
    const target = fieldValue(event);
    if (target) this.confirms.confirmTag('merge', this.tag(), target);
  }
  delete(): void {
    this.confirms.confirmTag('delete', this.tag(), '');
  }
  viewResources(kind: LibraryKind): void {
    this.library.viewTag(kind, this.tag());
  }
  private matchesTag(row: LibraryTag): boolean {
    return row.tag === this.tag();
  }
  private matchesOtherTag(next: string, old: string, row: LibraryTag): boolean {
    return row.tag === next && row.tag !== old;
  }
}
