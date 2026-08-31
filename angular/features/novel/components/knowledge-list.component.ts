import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
// prettier-ignore
import { Datatable, DatatableAction, DatatableCell, DatatableColumn, DatatableEmpty, DatatableRow, DatatableRowEvent } from '@components/datatable';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldChecked, fieldValue } from '@shared/utils/dom';

import { NovelDialogsService } from '../novel.dialogs.service';
// prettier-ignore
import { EntityTypeDef, KnowledgeEntity, KnowledgeIssue, KnowledgeView } from '../novel.knowledge.models';
import { chaptersOfItem, entitiesOf, issuesOfItem, matchesList } from '../novel.knowledge.rules';
import { NovelKnowledgeService } from '../novel.knowledge.service';
import { toNovelError } from '../novel.rules';
import { rangeText } from '../novel.translation.rules';
import { NovelKnowledgeType } from './knowledge-type.component';

export interface KnowledgeRow {
  id: string;
  entity: KnowledgeEntity;
  type: string;
  name: string;
  aliases: string;
  chapters: string;
  issues: number;
  errors: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-knowledge-list',
  imports: [Datatable, DatatableCell, DatatableEmpty, Icon, CoreModule, NovelKnowledgeType],
  templateUrl: './knowledge-list.component.html',
  host: { 'data-testid': 'novel-knowledge-list' },
})
export class NovelKnowledgeList {
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);

  readonly novelId = input.required<number>();
  readonly entityTypes = computed(this.buildEntityTypes.bind(this));

  readonly view = computed(this.buildView.bind(this));
  readonly issues = computed(this.buildIssues.bind(this));
  readonly rows = computed(this.buildRows.bind(this));
  readonly columns = computed(this.buildColumns.bind(this));
  readonly actions = computed(this.buildActions.bind(this));
  readonly chapterOptions = computed(this.buildChapterOptions.bind(this));
  readonly selectedIndex = computed(this.buildSelectedIndex.bind(this));
  readonly filtered = computed(this.buildFiltered.bind(this));

  onField(field: 'q' | 'type', event: Event): void {
    this.knowledge.patchView(this.novelId(), {
      [field]: fieldValue(event),
    });
  }

  onChapter(event: Event): void {
    this.knowledge.patchView(this.novelId(), {
      chapter: Number(fieldValue(event)),
    });
  }

  onOnlyIssues(event: Event): void {
    this.knowledge.patchView(this.novelId(), {
      onlyIssues: fieldChecked(event),
    });
  }

  clear(): void {
    this.knowledge.clearFilters(this.novelId());
  }

  add(): void {
    this.dialogs.openAdd(this.novelId(), 'entity');
  }

  onSelect(event: DatatableRowEvent): void {
    this.knowledge.select(this.novelId(), (event.row as KnowledgeRow).id);
  }

  onOpen(event: DatatableRowEvent): void {
    this.edit(event.row);
  }

  edit(row: DatatableRow): void {
    this.dialogs.openEdit(this.novelId(), [(row as KnowledgeRow).id]);
  }

  async remove(row: DatatableRow): Promise<void> {
    const target = row as KnowledgeRow;
    try {
      await this.knowledge.confirmRemove(this.novelId(), [target.id], target.name);
    } catch (cause) {
      this.toasts.show(
        this.languageService.translate('novel.error.generic', {
          detail: toNovelError(cause).detail,
        }),
        'danger',
      );
    }
  }

  private text(key: LanguageKey): string {
    return this.languageService.translate(key);
  }

  private buildEntityTypes(): readonly EntityTypeDef[] {
    return this.knowledge.ontology().types;
  }

  private buildView(): KnowledgeView {
    return this.knowledge.viewOf(this.novelId());
  }

  private buildIssues(): KnowledgeIssue[] {
    return this.knowledge.issuesOf(this.novelId());
  }

  private buildRows(): KnowledgeRow[] {
    const view = this.view();
    const visible = this.knowledge.visibleOf(this.novelId()).items;
    const flagged = new Set(this.issues().flatMap((issue) => issue.ids));
    const out: KnowledgeRow[] = [];
    for (const entity of entitiesOf(visible)) {
      if (!matchesList(entity, view, flagged)) {
        continue;
      }
      const issues = issuesOfItem(this.issues(), entity.id);
      const chapters = chaptersOfItem(entity);
      out.push({
        id: entity.id,
        entity,
        type: entity.type,
        name: entity.name,
        aliases: entity.aliases.join(', '),
        chapters: chapters.length > 0 ? rangeText(chapters) : '—',
        issues: issues.length,
        errors: issues.some((issue) => issue.sev === 'error'),
      });
    }
    return out;
  }

  private buildColumns(): DatatableColumn[] {
    return [
      { key: 'type', label: this.text('novel.knowledge.list.col.type'), width: '128px' },
      { key: 'name', label: this.text('novel.knowledge.list.col.entity') },
      { key: 'chapters', label: this.text('novel.knowledge.list.col.chapters'), width: '84px' },
    ];
  }

  private buildActions(): DatatableAction[] {
    return [
      {
        key: 'edit',
        label: this.text('novel.knowledge.action.edit'),
        icon: 'pen',
        handler: this.edit.bind(this),
      },
      {
        key: 'delete',
        label: this.text('novel.knowledge.action.delete'),
        icon: 'trash',
        danger: true,
        handler: this.remove.bind(this),
      },
    ];
  }

  private buildChapterOptions(): number[] {
    const seqs = new Set<number>();
    for (const item of this.knowledge.of(this.novelId()).items) {
      for (const seq of chaptersOfItem(item)) {
        seqs.add(seq);
      }
    }
    return [...seqs].sort((a, b) => a - b);
  }

  private buildSelectedIndex(): number {
    const sel = this.view().sel;
    return this.rows().findIndex((row) => row.id === sel);
  }

  private buildFiltered(): boolean {
    const view = this.view();
    return view.q !== '' || view.type !== 'all' || view.chapter !== 0 || view.onlyIssues;
  }
}
