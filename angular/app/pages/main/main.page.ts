import { Component, HostListener, effect, inject } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { Toast } from "../../../components/toast";
import { Editor } from "../../../layout/editor/editor";
import { Explorer } from "../../../layout/explorer/explorer";
import { Inspector } from "../../../layout/inspector/inspector";
import { LayoutService } from "../../../layout/layout.service";
import { Railbar } from "../../../layout/railbar/railbar";
import { Statusbar } from "../../../layout/statusbar/statusbar";
import { Titlebar } from "../../../layout/titlebar/titlebar";
import { ToastHost } from "../../core/toast/toast-host.component";
import { NovelCreateDialog } from "../../features/novel/components/create.dialog";
import { NovelDeleteDialog } from "../../features/novel/components/delete.dialog";
import { NovelImportDialog } from "../../features/novel/components/import.dialog";
import { ProjectCreateDialog } from "../../features/project/components/create.dialog";
import { ProjectDeleteDialog } from "../../features/project/components/delete.dialog";
import { LibraryCollectionDialog } from "../../features/library/components/collection.dialog";
import { LibraryCollectionDeleteDialog } from "../../features/library/components/collection-delete.dialog";
import { LibraryImageDeleteDialog } from "../../features/library/components/image-delete.dialog";
import { LibraryImagePreviewDialog } from "../../features/library/components/image-preview.dialog";
import { LibrarySoundDeleteDialog } from "../../features/library/components/sound-delete.dialog";
import { LibrarySoundPreviewDialog } from "../../features/library/components/sound-preview.dialog";
import { LibraryVideoDeleteDialog } from "../../features/library/components/video-delete.dialog";
import { LibraryVideoPreviewDialog } from "../../features/library/components/video-preview.dialog";
import { LibraryPromptDeleteDialog } from "../../features/library/components/prompt-delete.dialog";
import { LibraryPromptPreviewDialog } from "../../features/library/components/prompt-preview.dialog";
import { LibraryTagConfirmDialog } from "../../features/library/components/tag-confirm.dialog";
import { LibraryUploadDialog } from "../../features/library/components/upload.dialog";
import { SwitchWorkspaceDialog } from "../../features/workspace/components/switch.dialog";
import { WorkspaceService } from "../../features/workspace/workspace.service";
import { CurrentWorkspace } from "../../features/workspace/workspace.models";

const APP_TITLE = "Dreamy Studio";

@Component({
  selector: "app-main-page",
  standalone: true,
  imports: [Titlebar, Railbar, Explorer, Editor, Inspector, Statusbar, Toast, ToastHost, SwitchWorkspaceDialog, NovelCreateDialog, NovelDeleteDialog, NovelImportDialog, ProjectCreateDialog, ProjectDeleteDialog, LibraryCollectionDialog, LibraryCollectionDeleteDialog, LibraryImageDeleteDialog, LibraryImagePreviewDialog, LibrarySoundDeleteDialog, LibrarySoundPreviewDialog, LibraryVideoDeleteDialog, LibraryVideoPreviewDialog, LibraryPromptDeleteDialog, LibraryPromptPreviewDialog, LibraryTagConfirmDialog, LibraryUploadDialog],
  templateUrl: "./main.page.html",
})
export class MainPage {
  private readonly title = inject(Title);
  private readonly workspaceService = inject(WorkspaceService);

  readonly layout = inject(LayoutService);
  readonly workspace = this.workspaceService.current;
  readonly switchNotice = this.workspaceService.switchNotice;

  constructor() {
    effect(this.syncTitle.bind(this));
  }

  dismissSwitchNotice(): void {
    this.workspaceService.switchNotice.set(null);
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
