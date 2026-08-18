import { Component, HostListener, effect, inject } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { Toast } from "@components/toast";
import { Editor } from "@layout/editor/editor";
import { Explorer } from "@layout/explorer/explorer";
import { Inspector } from "@layout/inspector/inspector";
import { LayoutService } from "@layout/layout.service";
import { Railbar } from "@layout/railbar/railbar";
import { Statusbar } from "@layout/statusbar/statusbar";
import { Titlebar } from "@layout/titlebar/titlebar";
import { ToastHost } from "@app/core/toast/toast-host.component";
import { NovelCreateDialog } from "@app/features/novel/components/create.dialog";
import { NovelDeleteDialog } from "@app/features/novel/components/delete.dialog";
import { NovelChapterAddDialog } from "@app/features/novel/components/chapter-add.dialog";
import { NovelChapterDeleteDialog } from "@app/features/novel/components/chapter-delete.dialog";
import { NovelImportDialog } from "@app/features/novel/components/import.dialog";
import { ProjectCreateDialog } from "@app/features/project/components/create.dialog";
import { ProjectDeleteDialog } from "@app/features/project/components/delete.dialog";
import { LibraryCollectionDialog } from "@app/features/library/components/collection.dialog";
import { LibraryCollectionDeleteDialog } from "@app/features/library/components/collection-delete.dialog";
import { LibraryImageDeleteDialog } from "@app/features/library/components/image-delete.dialog";
import { LibraryImagePreviewDialog } from "@app/features/library/components/image-preview.dialog";
import { LibrarySoundDeleteDialog } from "@app/features/library/components/sound-delete.dialog";
import { LibrarySoundPreviewDialog } from "@app/features/library/components/sound-preview.dialog";
import { LibraryVideoDeleteDialog } from "@app/features/library/components/video-delete.dialog";
import { LibraryVideoPreviewDialog } from "@app/features/library/components/video-preview.dialog";
import { LibraryPromptDeleteDialog } from "@app/features/library/components/prompt-delete.dialog";
import { LibraryPromptPreviewDialog } from "@app/features/library/components/prompt-preview.dialog";
import { LibraryTagConfirmDialog } from "@app/features/library/components/tag-confirm.dialog";
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
  imports: [Titlebar, Railbar, Explorer, Editor, Inspector, Statusbar, Toast, ToastHost, SettingsDialog, SwitchWorkspaceDialog, NovelCreateDialog, NovelDeleteDialog, NovelChapterAddDialog, NovelChapterDeleteDialog, NovelImportDialog, ProjectCreateDialog, ProjectDeleteDialog, LibraryCollectionDialog, LibraryCollectionDeleteDialog, LibraryImageDeleteDialog, LibraryImagePreviewDialog, LibrarySoundDeleteDialog, LibrarySoundPreviewDialog, LibraryVideoDeleteDialog, LibraryVideoPreviewDialog, LibraryPromptDeleteDialog, LibraryPromptPreviewDialog, LibraryTagConfirmDialog, LibraryUploadDialog],
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
