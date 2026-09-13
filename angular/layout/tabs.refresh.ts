// prettier-ignore
import { EnvironmentProviders, inject, Injectable, provideAppInitializer, Signal } from '@angular/core';
import { AudiobookService } from '@features/audiobook/audiobook.service';
import { LibraryImageService } from '@features/library/library.images.service';
import { LibraryPromptService } from '@features/library/library.prompts.service';
import { LibraryService } from '@features/library/library.service';
import { LibrarySoundService } from '@features/library/library.sounds.service';
import { LibraryVideoService } from '@features/library/library.videos.service';
import { LibraryVoiceService } from '@features/library/library.voices.service';
import { NovelKnowledgeService } from '@features/novel/novel.knowledge.service';
import { NovelReaderService } from '@features/novel/novel.reader.service';
import { NovelService } from '@features/novel/novel.service';
import { NovelTranslationService } from '@features/novel/novel.translation.service';
import { ProjectService } from '@features/project/project.service';
import { ScriptingService } from '@features/scripting/scripting.service';

import { EditorTab, EditorTabKind } from './layout.models';
import { TabsService } from './tabs.service';

interface ListSource {
  readonly loaded: Signal<boolean>;
  load(): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class TabsRefreshService {
  private readonly tabs = inject(TabsService);
  private readonly novels = inject(NovelService);
  private readonly reader = inject(NovelReaderService);
  private readonly translation = inject(NovelTranslationService);
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly projects = inject(ProjectService);
  private readonly scripting = inject(ScriptingService);
  private readonly audiobook = inject(AudiobookService);
  private readonly library = inject(LibraryService);
  private readonly images = inject(LibraryImageService);
  private readonly sounds = inject(LibrarySoundService);
  private readonly videos = inject(LibraryVideoService);
  private readonly prompts = inject(LibraryPromptService);
  private readonly voices = inject(LibraryVoiceService);

  private readonly lists: Partial<Record<EditorTabKind, ListSource[]>> = {
    novels: [this.novels],
    projects: [this.projects],
    images: [this.images],
    sounds: [this.sounds],
    videos: [this.videos],
    prompts: [this.prompts],
    voices: [this.voices],
    collections: [this.library],
    collection: [this.library, this.images, this.sounds, this.videos, this.prompts, this.voices],
  };

  constructor() {
    this.tabs.onReopen(this.refresh.bind(this));
  }

  private refresh(tab: EditorTab): void {
    if (tab.novelId !== null) {
      this.refreshNovel(tab.novelId);
      return;
    }
    if (tab.projectId !== null) {
      void this.refreshProject(tab.projectId);
      return;
    }
    this.refreshLists(this.lists[tab.kind] ?? []);
  }

  private refreshNovel(novelId: number): void {
    this.reader.release(novelId);
    void this.translation.reload(novelId);
    void this.knowledge.reload(novelId);
  }

  private async refreshProject(projectId: number): Promise<void> {
    void this.projects.load();
    void this.projects.refreshModules(projectId);
    await this.scripting.reload(projectId);
    await this.audiobook.reload(projectId);
  }

  private refreshLists(sources: ListSource[]): void {
    for (const source of sources) {
      if (source.loaded()) {
        void source.load();
      }
    }
  }
}

export function provideTabsRefresh(): EnvironmentProviders {
  return provideAppInitializer(initTabsRefresh);
}

function initTabsRefresh(): void {
  inject(TabsRefreshService);
}
