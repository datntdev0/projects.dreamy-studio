import { Component, computed, inject } from "@angular/core";
import { Button } from "../../components/button";
import { Icon } from "../../components/icon";
import { I18nKey } from "../../app/core/i18n/i18n.models";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { LayoutService } from "../layout.service";
import { RAIL_ITEMS, RailItem } from "../layout.models";

@Component({
  selector: "app-explorer",
  standalone: true,
  imports: [Button, Icon, I18nPipe],
  templateUrl: "./explorer.html",
})
export class Explorer {
  readonly layout = inject(LayoutService);
  readonly titleKey = computed(this.activeTitleKey.bind(this));

  private activeTitleKey(): I18nKey {
    return RAIL_ITEMS.find(this.isActiveItem.bind(this))?.labelKey ?? "main.explorer.label";
  }

  private isActiveItem(item: RailItem): boolean {
    return item.id === this.layout.rail();
  }
}
