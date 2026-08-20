import { Component, HostListener, effect, inject } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { Toast } from "@components/toast";
import { LayoutModule } from "@layout/layout.module";
import { LayoutService } from "@layout/layout.service";
import { DialogHost } from "@app/core/dialog/dialog-host.component";
import { ToastHost } from "@app/core/toast/toast-host.component";
import { NovelCreateDialog } from "@app/features/novel/components/create.dialog";
import { NovelChapterAddDialog } from "@app/features/novel/components/chapter-add.dialog";
import { NovelImportDialog } from "@app/features/novel/components/import.dialog";
import { ProjectCreateDialog } from "@app/features/project/components/create.dialog";
import { LibraryCollectionDialog } from "@app/features/library/components/collection.dialog";
import { LibraryImagePreviewDialog } from "@app/features/library/components/image-preview.dialog";
import { LibrarySoundPreviewDialog } from "@app/features/library/components/sound-preview.dialog";
import { LibraryVideoPreviewDialog } from "@app/features/library/components/video-preview.dialog";
import { LibraryPromptPreviewDialog } from "@app/features/library/components/prompt-preview.dialog";
import { LibraryUploadDialog } from "@app/features/library/components/upload.dialog";
import { SettingsDialog } from "@app/features/settings/components/settings.dialog";
import { SettingsService } from "@app/features/settings/settings.service";
import { SwitchWorkspaceDialog } from "@app/features/workspace/components/switch.dialog";
import { WorkspaceService } from "@app/features/workspace/workspace.service";
import { CurrentWorkspace } from "@app/features/workspace/workspace.models";

const APP_TITLE = "Dreamy Studio";

@Component({
  selector: "app-main-page",
  standalone: true,
  imports: [LayoutModule, Toast, ToastHost, DialogHost, SettingsDialog, SwitchWorkspaceDialog, NovelCreateDialog, NovelChapterAddDialog, NovelImportDialog, ProjectCreateDialog, LibraryCollectionDialog, LibraryImagePreviewDialog, LibrarySoundPreviewDialog, LibraryVideoPreviewDialog, LibraryPromptPreviewDialog, LibraryUploadDialog],
  templateUrl: "./main.page.html",
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

  @HostListener("window:keydown.control.,", ["$event"])
  openSettings(event: Event): void {
    event.preventDefault();
    this.settings.openDialog();
  }

  @HostListener("window:pointermove", ["$event"])
  resizePanels(event: PointerEvent): void {
    this.layout.resizeTo(event);
  }

  @HostListener("window:pointerup")
  finishPanelResize(): void {
    this.layout.endResize();
  }

  @HostListener("window:pointercancel")
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
