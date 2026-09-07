import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Cover } from '@components/cover';
import { Icon } from '@components/icon';
import { bookAudioStats, formatSeconds } from '@features/audiobook/audiobook.rules';
import { AudiobookService } from '@features/audiobook/audiobook.service';
import { NovelSummary } from '@features/novel/novel.models';
import { NovelService } from '@features/novel/novel.service';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { ProjectLabels } from '../project.labels';
// prettier-ignore
import { ProjectModule, ProjectModuleRow, ProjectModuleStage, ProjectModuleState, ProjectSummary } from '../project.models';
// prettier-ignore
import { doneModuleCount, enabledModuleRows, enabledModuleStates, isModuleEnabled, moduleBadgeClass, moduleFraction, moduleRows, moduleStateKey, PROJECT_MODULE_STAGES, projectPercent, stageModuleRows, toProjectError } from '../project.rules';
import { ProjectService } from '../project.service';

export interface ProjectOverviewMetric {
  id: string;
  labelKey: LanguageKey;
  value: string;
  note: string;
}

export interface ProjectOverviewStage {
  id: ProjectModuleStage;
  labelKey: LanguageKey;
  total: number;
  rows: ProjectModuleRow[];
  available: ProjectModule[];
}

const UNMEASURED = '--';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-overview',
  imports: [Cover, Icon, CoreModule],
  templateUrl: './overview.component.html',
  host: { 'data-testid': 'project-overview' },
})
export class ProjectOverview {
  private readonly projects = inject(ProjectService);
  private readonly novels = inject(NovelService);
  private readonly audiobooks = inject(AudiobookService);
  private readonly tabs = inject(TabsService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  readonly labels = inject(ProjectLabels);

  readonly project = input.required<ProjectSummary>();
  readonly novel = computed(this.findNovel.bind(this));
  readonly novelCover = computed(this.buildNovelCover.bind(this));
  readonly sourceNote = computed(this.buildSourceNote.bind(this));
  readonly rows = computed(this.buildRows.bind(this));
  readonly metrics = computed(this.buildMetrics.bind(this));
  readonly stages = computed(this.buildStages.bind(this));

  constructor() {
    effect(this.ensureData.bind(this));
  }

  open(row: ProjectModuleRow): void {
    this.tabs.openModule(this.project().id, this.project().name, row.module.id);
  }

  async enable(module: ProjectModule): Promise<void> {
    try {
      await this.projects.setModuleEnabled(this.project(), module.id, true);
    } catch (cause) {
      const detail = toProjectError(cause).detail;
      this.toasts.show(
        this.languageService.translate('project.error.generic', { detail }),
        'danger',
      );
    }
  }

  onKeydown(row: ProjectModuleRow, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open(row);
    }
  }

  stateKey(row: ProjectModuleRow): LanguageKey {
    return moduleStateKey(row.state.state);
  }

  badgeClass(row: ProjectModuleRow): string {
    return moduleBadgeClass(row.state.state);
  }

  percentOf(row: ProjectModuleRow): number {
    return Math.round(moduleFraction(row.state) * 100);
  }

  private findNovel(): NovelSummary | undefined {
    const project = this.project();
    if (project.novelId === null || project.novelMissing) return undefined;
    return this.novels.novelById(project.novelId);
  }

  private buildNovelCover(): string {
    const novel = this.novel();
    return novel ? (this.novels.coverUrl(novel) ?? '') : '';
  }

  private buildSourceNote(): string {
    const project = this.project();
    if (project.novelId === null) {
      return this.languageService.translate('project.overview.sourceNone');
    }
    return this.languageService.translate(
      project.srcKind === 'translation'
        ? 'project.overview.sourceTranslation'
        : 'project.overview.sourceOriginal',
    );
  }

  private buildRows(): ProjectModuleRow[] {
    return moduleRows(this.projects.moduleStates(this.project().id));
  }

  private enabledStates(): ProjectModuleState[] {
    return enabledModuleStates(this.project(), this.projects.moduleStates(this.project().id));
  }

  private buildMetrics(): ProjectOverviewMetric[] {
    const states = this.enabledStates();
    const translate = this.languageService.translate.bind(this.languageService);
    return [
      {
        id: 'progress',
        labelKey: 'project.overview.progress',
        value: `${projectPercent(states)}%`,
        note: translate('project.overview.modulesDone', {
          done: doneModuleCount(states),
          total: states.length,
        }),
      },
      this.audioMetric(),
      this.unmeasured('images', 'project.overview.images', 'project.overview.imagesNote'),
      this.unmeasured('video', 'project.overview.video', 'project.overview.videoNote'),
    ];
  }

  private audioMetric(): ProjectOverviewMetric {
    const book = this.audiobooks.bookOf(this.project().id);
    if (!book) {
      return this.unmeasured('audio', 'project.overview.audio', 'project.overview.audioPending');
    }
    const stats = bookAudioStats(book);
    return {
      id: 'audio',
      labelKey: 'project.overview.audio',
      value: String(stats.clips),
      note: this.languageService.translate('project.overview.audioNote', {
        duration: formatSeconds(stats.seconds),
      }),
    };
  }

  private unmeasured(
    id: string,
    labelKey: LanguageKey,
    noteKey: LanguageKey,
  ): ProjectOverviewMetric {
    return { id, labelKey, value: UNMEASURED, note: this.languageService.translate(noteKey) };
  }

  private buildStages(): ProjectOverviewStage[] {
    const project = this.project();
    const stages: ProjectOverviewStage[] = [];
    for (const stage of PROJECT_MODULE_STAGES) {
      const stageRows = stageModuleRows(this.rows(), stage);
      stages.push({
        id: stage,
        labelKey: `project.module.stage.${stage}`,
        total: stageRows.length,
        rows: enabledModuleRows(project, stageRows),
        available: stageRows.filter(isRowDisabled.bind(null, project)).map(toModule),
      });
    }
    return stages;
  }

  private ensureData(): void {
    void this.projects.ensureModules(this.project().id);
    void this.audiobooks.ensureLoaded(this.project().id);
    const novel = this.novel();
    if (novel) {
      this.novels.ensureCover(novel);
    }
  }
}

function isRowDisabled(project: ProjectSummary, row: ProjectModuleRow): boolean {
  return !isModuleEnabled(project, row.module.id);
}

function toModule(row: ProjectModuleRow): ProjectModule {
  return row.module;
}
