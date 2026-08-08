import { Component, HostListener, computed, inject } from "@angular/core";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { I18nService } from "../../app/core/i18n/i18n.service";
import { NovelView } from "../../app/features/novel/components/novel-view.component";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";
import { NovelList } from "../../app/features/novel/components/list.component";
import { Bottom } from "../bottom/bottom";
import { LayoutService } from "../layout.service";
import { EditorTab } from "../layout.models";
import { TabsService } from "../tabs.service";

@Component({
  selector: "app-editor",
  standalone: true,
  imports: [Icon, I18nPipe, Bottom, NovelView, NovelList],
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
    return tab.kind === "novel" ? tab.title : null;
  }

  private currentOf(): string {
    const tab = this.tabs.active();
    return tab.kind === "novel" ? this.i18n.translate("tabs.novel.title") : this.tabLabel(tab);
  }
}
