// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { Cover } from '@components/cover';
import { Icon } from '@components/icon';
import { LibraryService } from '@features/library/library.service';
import { NovelSummary } from '@features/novel/novel.models';
import { NovelReaderService } from '@features/novel/novel.reader.service';
import { displayName } from '@features/novel/novel.rules';
import { NovelService } from '@features/novel/novel.service';
import { PipelineSnapshot } from '@features/novel/novel.translation.models';
import { formatClock, kindIcon, kindKey } from '@features/pipeline/pipeline.rules';
import { PipelineService } from '@features/pipeline/pipeline.service';
import { ProjectDialogsService } from '@features/project/project.dialogs.service';
import { ProjectLabels } from '@features/project/project.labels';
// prettier-ignore
import { ProjectModuleId, ProjectModuleState, ProjectSummary, ProjectTemplate, ProjectTemplateId } from '@features/project/project.models';
import { moduleStateKey, PROJECT_TEMPLATES, projectModule } from '@features/project/project.rules';
import { ProjectService } from '@features/project/project.service';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { HomeActivity, HomeAttention, HomeProjectCard, HomeStat } from '../home.models';
// prettier-ignore
import { failedCount, greetingKey, libraryTotal, moduleAttention, pipelineAttention, projectCard, recentActivity, recentLiveProjects } from '../home.rules';

const RECENT_PROJECTS = 3;
const RECENT_NOVELS = 4;
const RECENT_ACTIVITY = 6;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-home',
  imports: [Cover, Icon, CoreModule],
  templateUrl: './home.component.html',
  host: { 'data-testid': 'home' },
})
export class Home {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly projects = inject(ProjectService);
  private readonly novels = inject(NovelService);
  private readonly reader = inject(NovelReaderService);
  private readonly library = inject(LibraryService);
  private readonly pipelines = inject(PipelineService);
  private readonly tabs = inject(TabsService);
  private readonly dialogs = inject(ProjectDialogsService);
  private readonly labels = inject(ProjectLabels);
  private readonly languageService = inject(LanguageService);
  private readonly ownerOf = this.pipelines.ownerName.bind(this.pipelines);

  readonly workspace = this.workspaceService.current;
  readonly greeting = greetingKey(new Date().getHours());
  readonly templates = PROJECT_TEMPLATES;
  readonly recentProjects = computed(this.buildRecentProjects.bind(this));
  readonly cards = computed(this.buildCards.bind(this));
  readonly recentNovels = computed(this.buildRecentNovels.bind(this));
  readonly stats = computed(this.buildStats.bind(this));
  readonly attention = computed(this.buildAttention.bind(this));
  readonly activity = computed(this.buildActivity.bind(this));

  constructor() {
    effect(this.loadSources.bind(this));
    effect(this.loadModules.bind(this));
    effect(this.loadCovers.bind(this));
  }

  switchWorkspace(): void {
    this.workspaceService.openSwitchDialog();
  }

  newProject(template?: ProjectTemplateId): void {
    this.dialogs.openCreate(template);
  }

  openProjects(): void {
    this.tabs.openProjects();
  }

  openNovels(): void {
    this.tabs.openNovels();
  }

  openLibrary(): void {
    this.tabs.openCollections();
  }

  openPipelines(): void {
    this.tabs.openPipelines();
  }

  openStat(stat: HomeStat): void {
    if (stat.id === 'projects') this.openProjects();
    if (stat.id === 'novels') this.openNovels();
    if (stat.id === 'library') this.openLibrary();
    if (stat.id === 'pipelines') this.openPipelines();
  }

  async openProject(project: ProjectSummary): Promise<void> {
    const opened = await this.projects.open(project.id);
    this.tabs.openProject(opened.id, opened.name, this.labels.iconOf(opened.template));
  }

  openNovel(novel: NovelSummary): void {
    this.tabs.openNovel(novel.id, displayName(novel));
    void this.reader.openNovel(novel.id);
  }

  openAttention(item: HomeAttention): void {
    if (item.kind === 'module' && item.projectId !== null && item.moduleId !== null) {
      this.tabs.openModule(item.projectId, item.owner, item.moduleId);
      return;
    }
    this.openPipeline(item.pipelineId);
  }

  openPipeline(id: number | null): void {
    this.tabs.openPipelines();
    this.pipelines.select(id);
  }

  novelName(novel: NovelSummary): string {
    return displayName(novel);
  }

  coverOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? '';
  }

  templateIcon(template: ProjectTemplate): string {
    return this.labels.iconOf(template.id);
  }

  projectIcon(project: ProjectSummary): string {
    return this.labels.iconOf(project.template);
  }

  templateKey(project: ProjectSummary): LanguageKey {
    return this.labels.templateKey(project.template);
  }

  templateBlurb(project: ProjectSummary): LanguageKey {
    return `project.template.${project.template}.blurb`;
  }

  dateOf(value: string): string {
    return this.labels.stampOf(value);
  }

  moduleIcon(id: ProjectModuleId): string {
    return projectModule(id).icon;
  }

  moduleTitle(state: ProjectModuleState): string {
    const label = this.languageService.translate(projectModule(state.id).labelKey);
    return `${label} · ${this.languageService.translate(moduleStateKey(state.state))}`;
  }

  templateModules(template: ProjectTemplate): string {
    if (template.modules.length === 0) {
      return this.languageService.translate('home.templates.pickModules');
    }
    return template.modules.map(this.moduleLabel.bind(this)).join(' · ');
  }

  attentionTitle(item: HomeAttention): string {
    if (item.kind === 'module' && item.moduleId !== null) {
      const module = this.languageService.translate(projectModule(item.moduleId).labelKey);
      return this.languageService.translate('home.attention.module', { module });
    }
    return this.languageService.translate('home.attention.pipeline', {
      kind: this.kindLabel(item.pipelineKind ?? ''),
    });
  }

  activityTitle(activity: HomeActivity): string {
    const kind = this.kindLabel(activity.pipeline.kind);
    const status = this.languageService.translate(`pipeline.status.${activity.pipeline.status}`);
    return `${kind} · ${status}`;
  }

  activityIcon(pipeline: PipelineSnapshot): string {
    return kindIcon(pipeline.kind);
  }

  clockOf(value: string): string {
    return formatClock(value);
  }

  private moduleLabel(id: ProjectModuleId): string {
    return this.languageService.translate(projectModule(id).labelKey);
  }

  private kindLabel(kind: string): string {
    const key = kindKey(kind);
    return key ? this.languageService.translate(key) : kind;
  }

  private buildRecentProjects(): ProjectSummary[] {
    return recentLiveProjects(this.projects.projects(), RECENT_PROJECTS);
  }

  private buildCards(): HomeProjectCard[] {
    return this.recentProjects().map(this.cardOf.bind(this));
  }

  private cardOf(project: ProjectSummary): HomeProjectCard {
    return projectCard(project, this.projects.moduleStates(project.id));
  }

  private buildRecentNovels(): NovelSummary[] {
    return this.novels.recent().slice(0, RECENT_NOVELS);
  }

  private buildStats(): HomeStat[] {
    const totals = this.projects.totals();
    const novels = this.novels.totals();
    const assets = this.library.summary().assets;
    const failed = failedCount(this.pipelines.history());
    const t = this.languageService.translate.bind(this.languageService);
    return [
      {
        id: 'projects',
        icon: 'folder',
        labelKey: 'home.stat.projects',
        value: totals.active,
        note: t('home.stat.projects.note', { count: totals.archived }),
        warn: false,
      },
      {
        id: 'novels',
        icon: 'book',
        labelKey: 'home.stat.novels',
        value: novels.novels,
        note: t('home.stat.novels.note', { count: novels.chapters }),
        warn: false,
      },
      {
        id: 'library',
        icon: 'library',
        labelKey: 'home.stat.library',
        value: libraryTotal(this.library.summary()),
        note: t('home.stat.library.note', { count: assets.voice }),
        warn: false,
      },
      {
        id: 'pipelines',
        icon: 'activity',
        labelKey: 'home.stat.pipelines',
        value: this.pipelines.running().length,
        note:
          failed > 0
            ? t('home.stat.pipelines.failed', { count: failed })
            : t('home.stat.pipelines.note'),
        warn: failed > 0,
      },
    ];
  }

  private buildAttention(): HomeAttention[] {
    return [
      ...pipelineAttention(this.pipelines.history(), this.ownerOf),
      ...moduleAttention(this.cards()),
    ];
  }

  private buildActivity(): HomeActivity[] {
    return recentActivity(this.pipelines.history(), this.ownerOf, RECENT_ACTIVITY);
  }

  private loadSources(): void {
    if (!this.workspace()) {
      return;
    }
    untracked(this.requestSources.bind(this));
  }

  private requestSources(): void {
    void this.projects.ensureLoaded();
    void this.novels.ensureLoaded();
    void this.library.ensureLoaded();
    if (!this.pipelines.loaded() && !this.pipelines.loading()) {
      void this.pipelines.load();
    }
  }

  private loadModules(): void {
    for (const project of this.recentProjects()) {
      void this.projects.ensureModules(project.id);
    }
  }

  private loadCovers(): void {
    for (const novel of this.recentNovels()) {
      this.novels.ensureCover(novel);
    }
  }
}
