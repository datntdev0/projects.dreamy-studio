import { Component, inject } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { SettingsService } from "@app/features/settings/settings.service";
import { LayoutService } from "../layout.service";
import { PIPELINES_TAB_ID, RAIL_ITEMS } from "../layout.models";
import { TabsService } from "../tabs.service";

@Component({
  selector: "app-railbar",
  standalone: true,
  imports: [Icon, LanguagePipe],
  templateUrl: "./railbar.html",
})
export class Railbar {
  readonly layout = inject(LayoutService);
  readonly settings = inject(SettingsService);
  readonly tabs = inject(TabsService);
  readonly pipelinesTabId = PIPELINES_TAB_ID;
  readonly items = RAIL_ITEMS;
}
