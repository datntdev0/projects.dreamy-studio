// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { ProjectService } from '@features/project/project.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { GenerateChapter, GenerateGroup, GeneratePlan } from '../audiobook.models';
import { AudiobookDialogBase } from './audiobook.dialog.base';
import { AudiobookInspectorLabels } from './inspector.labels';

type ChapterStatus = 'blocked' | 'empty' | 'complete' | 'todo';

const STATUS_KEYS: Record<ChapterStatus, LanguageKey> = {
  blocked: 'audiobook.dialog.generate.blocked',
  empty: 'audiobook.dialog.generate.empty',
  complete: 'audiobook.dialog.generate.complete',
  todo: 'audiobook.dialog.generate.todo',
};

function isSelectable(chapter: GenerateChapter): boolean {
  return !chapter.blocked && chapter.total > 0;
}

function unitIdOf(chapter: GenerateChapter): string {
  return chapter.unit.id;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-generate-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './generate.dialog.html',
  host: { 'data-testid': 'audiobook-generate-dialog' },
})
export class AudiobookGenerateDialog extends AudiobookDialogBase {
  private readonly projects = inject(ProjectService);
  readonly labels = inject(AudiobookInspectorLabels);

  readonly selected = signal<string[]>([]);
  readonly exportAfter = signal(false);
  readonly chapters = computed(this.buildChapters.bind(this));
  readonly selectable = computed(this.buildSelectable.bind(this));
  readonly allSelected = computed(this.buildAllSelected.bind(this));
  readonly plan = computed(this.buildPlan.bind(this));
  readonly canRun = computed(this.buildCanRun.bind(this));
  readonly introHtml = computed(this.buildIntroHtml.bind(this));
  readonly estimateHtml = computed(this.buildEstimateHtml.bind(this));

  constructor() {
    super('generate');
    effect(this.resetSelection.bind(this));
  }

  groupKey(group: GenerateGroup): LanguageKey {
    return group.billing === 'paid'
      ? 'audiobook.dialog.generate.cloudPaid'
      : 'audiobook.dialog.generate.cloudFree';
  }

  isSelected(chapter: GenerateChapter): boolean {
    return this.selected().includes(chapter.unit.id);
  }

  chapterTitle(chapter: GenerateChapter): string {
    const ctx = this.ctx();
    return ctx ? this.labels.unitTitle(ctx.config, chapter.unit) : chapter.unit.title;
  }

  statusOf(chapter: GenerateChapter): ChapterStatus {
    if (chapter.blocked) return 'blocked';
    if (chapter.total === 0) return 'empty';
    return chapter.complete ? 'complete' : 'todo';
  }

  statusText(chapter: GenerateChapter): string {
    return this.languageService.translate(STATUS_KEYS[this.statusOf(chapter)], {
      count: chapter.todo,
    });
  }

  toggle(chapter: GenerateChapter, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const others = this.selected().filter((id) => id !== chapter.unit.id);
    this.selected.set(checked ? [...others, chapter.unit.id] : others);
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.set(checked ? this.selectable().map(unitIdOf) : []);
  }

  setExport(event: Event): void {
    this.exportAfter.set((event.target as HTMLInputElement).checked);
  }

  async generate(): Promise<void> {
    const projectId = this.projectId();
    const plan = this.plan();
    if (projectId === null || plan === null || !this.canRun()) {
      return;
    }
    const name = this.projects.projectById(projectId)?.name ?? '';
    const exportAfter = this.exportAfter();
    this.close();
    if (plan.segments > 0) {
      this.toasts.show(
        this.languageService.translate('audiobook.dialog.generate.started', { name }),
        'info',
      );
    }
    await this.audiobook.generate(projectId, plan.unitIds, exportAfter);
  }

  private resetSelection(): void {
    if (this.projectId() !== null) {
      untracked(this.selectCurrent.bind(this));
    }
  }

  private selectCurrent(): void {
    const unit = this.ctx()?.unit;
    const current = this.selectable().find((chapter) => chapter.unit.id === unit?.id);
    this.selected.set(current ? [current.unit.id] : []);
    this.exportAfter.set(false);
  }

  private buildChapters(): GenerateChapter[] {
    const projectId = this.projectId();
    return projectId === null ? [] : this.audiobook.generateChaptersOf(projectId);
  }

  private buildSelectable(): GenerateChapter[] {
    return this.chapters().filter(isSelectable);
  }

  private buildAllSelected(): boolean {
    const selectable = this.selectable();
    return selectable.length > 0 && selectable.every((chapter) => this.isSelected(chapter));
  }

  private buildPlan(): GeneratePlan | null {
    const projectId = this.projectId();
    const ids = this.selectable()
      .map(unitIdOf)
      .filter((id) => this.selected().includes(id));
    return projectId === null ? null : this.audiobook.generatePlanOf(projectId, ids);
  }

  private buildCanRun(): boolean {
    const plan = this.plan();
    if (!plan || plan.unitIds.length === 0) {
      return false;
    }
    return plan.segments > 0 || this.exportAfter();
  }

  private buildIntroHtml(): string {
    const plan = this.plan();
    if (!plan) {
      return '';
    }
    const count = this.languageService.translate('audiobook.dialog.generate.count', {
      count: plan.segments,
    });
    const key =
      plan.regenerated > 0
        ? 'audiobook.dialog.generate.introRegen'
        : 'audiobook.dialog.generate.intro';
    return this.boldHtml(key, { regen: plan.regenerated }, 'count', count);
  }

  private buildEstimateHtml(): string {
    const plan = this.plan();
    if (!plan) {
      return '';
    }
    const cost =
      plan.cost > 0
        ? this.labels.money(plan.cost)
        : this.languageService.translate('audiobook.dialog.generate.noCost');
    return this.boldHtml('audiobook.dialog.generate.estimate', {}, 'cost', cost);
  }
}
