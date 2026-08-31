import { ChangeDetectionStrategy, Component, effect, HostListener, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { LibraryCollectionDialog } from '@features/library/components/collection.dialog';
import { LibraryImagePreviewDialog } from '@features/library/components/image-preview.dialog';
import { LibraryPromptPreviewDialog } from '@features/library/components/prompt-preview.dialog';
import { LibrarySoundPreviewDialog } from '@features/library/components/sound-preview.dialog';
import { LibraryUploadDialog } from '@features/library/components/upload.dialog';
import { LibraryVideoPreviewDialog } from '@features/library/components/video-preview.dialog';
import { NovelChapterAddDialog } from '@features/novel/components/chapter-add.dialog';
import { NovelCreateDialog } from '@features/novel/components/create.dialog';
import { NovelImportDialog } from '@features/novel/components/import.dialog';
import { NovelKnowledgeAnalyzeDialog } from '@features/novel/components/knowledge-analyze.dialog';
import { NovelKnowledgeEditDialog } from '@features/novel/components/knowledge-edit.dialog';
import { NovelTranslationRunDialog } from '@features/novel/components/translation-run.dialog';
import { ProjectCreateDialog } from '@features/project/components/create.dialog';
import { SettingsDialog } from '@features/settings/components/settings.dialog';
import { SettingsService } from '@features/settings/settings.service';
import { SwitchWorkspaceDialog } from '@features/workspace/components/switch.dialog';
import { CurrentWorkspace } from '@features/workspace/workspace.models';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { LayoutModule } from '@layout/layout.module';
import { LayoutService } from '@layout/layout.service';
import { CoreModule } from '@shared/core.module';

const APP_TITLE = 'Dreamy Studio';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-main-page',
  imports: [
    CoreModule,
    LayoutModule,
    SettingsDialog,
    SwitchWorkspaceDialog,
    NovelCreateDialog,
    NovelChapterAddDialog,
    NovelImportDialog,
    NovelKnowledgeAnalyzeDialog,
    NovelTranslationRunDialog,
    NovelKnowledgeEditDialog,
    ProjectCreateDialog,
    LibraryCollectionDialog,
    LibraryImagePreviewDialog,
    LibrarySoundPreviewDialog,
    LibraryVideoPreviewDialog,
    LibraryPromptPreviewDialog,
    LibraryUploadDialog,
  ],
  templateUrl: './main.page.html',
})
export class MainPage {
  private readonly title = inject(Title);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly settings = inject(SettingsService);

  readonly layout = inject(LayoutService);
  readonly workspace = this.workspaceService.current;
  readonly switchNotice = this.workspaceService.switchNotice;

  constructor() {
    effect(this.syncTitle.bind(this));
  }

  dismissSwitchNotice(): void {
    this.workspaceService.switchNotice.set(null);
  }

  @HostListener('window:keydown.control.,', ['$event'])
  openSettings(event: Event): void {
    event.preventDefault();
    this.settings.openDialog();
  }

  @HostListener('window:pointermove', ['$event'])
  resizePanels(event: PointerEvent): void {
    this.layout.resizeTo(event);
  }

  @HostListener('window:pointerup')
  finishPanelResize(): void {
    this.layout.endResize();
  }

  @HostListener('window:pointercancel')
  cancelPanelResize(): void {
    this.layout.endResize();
  }

  private syncTitle(): void {
    this.title.setTitle(this.titleFor(this.workspace()));
  }

  private titleFor(current: CurrentWorkspace | null): string {
    return current ? `${current.name} — ${APP_TITLE}` : APP_TITLE;
  }
}
