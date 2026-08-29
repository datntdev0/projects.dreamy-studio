import { Component, computed, inject } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { LanguageKey } from "@core/language/language.models";
import { CoreModule } from "@core/core.module";
import { NovelExplorer } from "@features/novel/components/explorer.component";
import { ProjectExplorer } from "@features/project/components/explorer.component";
import { LibraryExplorer } from "@features/library/components/explorer.component";
import { LayoutService } from "../layout.service";
import { RAIL_ITEMS, RailItem } from "../layout.models";

@Component({
  selector: "app-explorer",
  standalone: true,
  imports: [Button, Icon, CoreModule, NovelExplorer, ProjectExplorer, LibraryExplorer],
  templateUrl: "./explorer.html",
})
export class Explorer {
  readonly layout = inject(LayoutService);
  readonly titleKey = computed(this.activeTitleKey.bind(this));

  private activeTitleKey(): LanguageKey {
    return RAIL_ITEMS.find(this.isActiveItem.bind(this))?.labelKey ?? "main.explorer.label";
  }

  private isActiveItem(item: RailItem): boolean {
    return item.id === this.layout.rail();
  }
}
