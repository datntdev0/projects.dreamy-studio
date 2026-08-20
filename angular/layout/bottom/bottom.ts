import { Component, inject } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { PipelineLog } from "@app/features/pipeline/components/log.component";
import { PipelineList } from "@app/features/pipeline/components/list.component";
import { LayoutService } from "../layout.service";
import { BottomTabId } from "../layout.models";

interface BottomTab {
  id: BottomTabId;
  labelKey: LanguageKey;
}

const BOTTOM_TABS: BottomTab[] = [
  { id: "pipelines", labelKey: "main.bottom.tab.pipelines" },
  { id: "output", labelKey: "main.bottom.tab.output" },
];

@Component({
  selector: "app-bottom",
  standalone: true,
  imports: [Button, Icon, CoreModule, PipelineLog, PipelineList],
  templateUrl: "./bottom.html",
})
export class Bottom {
  readonly layout = inject(LayoutService);
  readonly tabs = BOTTOM_TABS;

  selectTab(id: BottomTabId): void {
    this.layout.bottomTab.set(id);
  }
}
