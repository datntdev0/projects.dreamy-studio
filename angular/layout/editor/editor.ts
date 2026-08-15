import { Component, HostListener, computed, inject } from "@angular/core";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { I18nService } from "../../app/core/i18n/i18n.service";
import { NovelView } from "../../app/features/novel/components/novel-view.component";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";
import { NovelToolPlaceholder } from "../../app/features/novel/components/tool-placeholder.component";
import { NovelList } from "../../app/features/novel/components/list.component";
import { ProjectList } from "../../app/features/project/components/list.component";
import { ProjectView } from "../../app/features/project/components/project-view.component";
import { LibraryCollections } from "../../app/features/library/components/collections.component";
import { LibraryCollectionView } from "../../app/features/library/components/collection.component";
import { LibraryImages } from "../../app/features/library/components/images.component";
import { LibrarySounds } from "../../app/features/library/components/sounds.component";
import { LibraryVideos } from "../../app/features/library/components/videos.component";
import { LibraryPrompts } from "../../app/features/library/components/prompts.component";
import { Bottom } from "../bottom/bottom";
import { LayoutService } from "../layout.service";
import { EditorTab } from "../layout.models";
import { TabsService } from "../tabs.service";

@Component({
  selector: "app-editor",
  standalone: true,
  imports: [Icon, I18nPipe, Bottom, NovelView, NovelToolPlaceholder, NovelList, ProjectList, ProjectView, LibraryCollections, LibraryCollectionView, LibraryImages, LibrarySounds, LibraryVideos, LibraryPrompts],
  templateUrl: "./editor.html",
})
export class Editor {
  private readonly i18n = inject(I18nService);

  readonly layout = inject(LayoutService);
  readonly tabs = inject(TabsService);
  readonly workspace = inject(WorkspaceService).current;
  readonly crumbSection = computed(this.sectionOf.bind(this));
  readonly crumbCurrent = computed(this.currentOf.bind(this));

  tabLabel(tab: EditorTab): string {
    if (tab.kind === "translation") {
      return this.i18n.translate("tabs.novel.translation", { name: tab.title });
    }
    if (tab.kind === "knowledge") {
      return this.i18n.translate("tabs.novel.knowledge", { name: tab.title });
    }
    return tab.labelKey ? this.i18n.translate(tab.labelKey) : tab.title;
  }

  activate(id: string): void {
    this.tabs.activate(id);
  }

  closeTab(event: Event, id: string): void {
    event.stopPropagation();
    this.tabs.close(id);
  }

  @HostListener("document:keydown", ["$event"])
  onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "w") {
      event.preventDefault();
      this.tabs.close(this.tabs.activeId());
    }
  }

  private sectionOf(): string | null {
    const tab = this.tabs.active();
    if (tab.kind === "novels") {
      return this.i18n.translate("main.rail.novels");
    }
    if (tab.kind === "projects" || tab.kind === "project") {
      return this.i18n.translate("main.rail.projects");
    }
    if (tab.kind === "collections") {
      return this.i18n.translate("library.explorer.organize");
    }
    if (tab.kind === "collection") {
      return this.i18n.translate("library.collections");
    }
    if (tab.kind === "images" || tab.kind === "sounds" || tab.kind === "videos" || tab.kind === "prompts") {
      return this.i18n.translate("library.crumb");
    }
    return tab.kind === "novel" || tab.kind === "translation" || tab.kind === "knowledge" ? tab.title : null;
  }

  private currentOf(): string {
    const tab = this.tabs.active();
    if (tab.kind === "project" || tab.kind === "collection") {
      return tab.title;
    }
    if (tab.kind === "translation") {
      return this.i18n.translate("novel.tool.translation.title");
    }
    if (tab.kind === "knowledge") {
      return this.i18n.translate("novel.tool.knowledge.title");
    }
    return tab.kind === "novel" ? this.i18n.translate("tabs.novel.title") : this.tabLabel(tab);
  }
}
