import { ChangeDetectionStrategy, Component, computed, HostListener, inject } from '@angular/core';
import { Icon } from '@components/icon';
import { LibraryCollectionView } from '@features/library/components/collection.component';
import { LibraryCollections } from '@features/library/components/collections.component';
import { LibraryImages } from '@features/library/components/images.component';
import { LibraryPrompts } from '@features/library/components/prompts.component';
import { LibrarySounds } from '@features/library/components/sounds.component';
import { LibraryVideos } from '@features/library/components/videos.component';
import { LibraryVoices } from '@features/library/components/voices.component';
import { NovelKnowledge } from '@features/novel/components/knowledge.component';
import { NovelList } from '@features/novel/components/list.component';
import { NovelView } from '@features/novel/components/novel-view.component';
import { NovelTranslation } from '@features/novel/components/translation.component';
import { PipelineHistory } from '@features/pipeline/components/history.component';
import { ProjectList } from '@features/project/components/list.component';
import { ProjectModuleHost } from '@features/project/components/module-host.component';
import { ProjectView } from '@features/project/components/project-view.component';
import { projectModule } from '@features/project/project.rules';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';

import { Bottom } from '../bottom/bottom';
import { EditorTab } from '../layout.models';
import { LayoutService } from '../layout.service';
import { TabsService } from '../tabs.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-editor',
  imports: [
    Icon,
    CoreModule,
    Bottom,
    NovelView,
    NovelKnowledge,
    NovelTranslation,
    NovelList,
    ProjectList,
    ProjectView,
    ProjectModuleHost,
    LibraryCollections,
    LibraryCollectionView,
    LibraryImages,
    LibrarySounds,
    LibraryVideos,
    LibraryPrompts,
    LibraryVoices,
    PipelineHistory,
  ],
  templateUrl: './editor.html',
})
export class Editor {
  private readonly languageService = inject(LanguageService);

  readonly layout = inject(LayoutService);
  readonly tabs = inject(TabsService);
  readonly workspace = inject(WorkspaceService).current;
  readonly crumbSection = computed(this.sectionOf.bind(this));
  readonly crumbCurrent = computed(this.currentOf.bind(this));

  tabLabel(tab: EditorTab): string {
    if (tab.kind === 'translation') {
      return this.languageService.translate('tabs.novel.translation', { name: tab.title });
    }
    if (tab.kind === 'knowledge') {
      return this.languageService.translate('tabs.novel.knowledge', { name: tab.title });
    }
    if (tab.kind === 'module' && tab.moduleId) {
      return this.languageService.translate('tabs.project.module', {
        module: this.languageService.translate(projectModule(tab.moduleId).labelKey),
        name: tab.title,
      });
    }
    return tab.labelKey ? this.languageService.translate(tab.labelKey) : tab.title;
  }

  activate(id: string): void {
    this.tabs.activate(id);
  }

  closeTab(event: Event, id: string): void {
    event.stopPropagation();
    this.tabs.close(id);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'w') {
      event.preventDefault();
      this.tabs.close(this.tabs.activeId());
    }
  }

  private sectionOf(): string | null {
    const tab = this.tabs.active();
    if (tab.kind === 'novels') {
      return this.languageService.translate('main.rail.novels');
    }
    if (tab.kind === 'projects' || tab.kind === 'project') {
      return this.languageService.translate('main.rail.projects');
    }
    if (tab.kind === 'collections') {
      return this.languageService.translate('library.explorer.organize');
    }
    if (tab.kind === 'collection') {
      return this.languageService.translate('library.collections');
    }
    if (
      tab.kind === 'images' ||
      tab.kind === 'sounds' ||
      tab.kind === 'videos' ||
      tab.kind === 'prompts' ||
      tab.kind === 'voices'
    ) {
      return this.languageService.translate('library.crumb');
    }
    return tab.kind === 'novel' ||
      tab.kind === 'translation' ||
      tab.kind === 'knowledge' ||
      tab.kind === 'module'
      ? tab.title
      : null;
  }

  private currentOf(): string {
    const tab = this.tabs.active();
    if (tab.kind === 'project' || tab.kind === 'collection') {
      return tab.title;
    }
    if (tab.kind === 'module' && tab.moduleId) {
      return this.languageService.translate(projectModule(tab.moduleId).labelKey);
    }
    if (tab.kind === 'translation') {
      return this.languageService.translate('novel.tool.translation.title');
    }
    if (tab.kind === 'knowledge') {
      return this.languageService.translate('novel.tool.knowledge.title');
    }
    return tab.kind === 'novel'
      ? this.languageService.translate('tabs.novel.title')
      : this.tabLabel(tab);
  }
}
