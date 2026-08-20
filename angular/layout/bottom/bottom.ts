import { Component, inject } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { PipelineLog } from "@app/features/pipeline/components/log.component";
import { PipelineList } from "@app/features/pipeline/components/list.component";
import { LayoutService } from "../layout.service";
import { BottomTabId } from "../layout.models";

interface BottomTab {
  id: BottomTabId;
  labelKey: I18nKey;
}

const BOTTOM_TABS: BottomTab[] = [
  { id: "pipelines", labelKey: "main.bottom.tab.pipelines" },
  { id: "output", labelKey: "main.bottom.tab.output" },
];

@Component({
  selector: "app-bottom",
  standalone: true,
  imports: [Button, Icon, I18nPipe, PipelineLog, PipelineList],
  templateUrl: "./bottom.html",
})
export class Bottom {
  readonly layout = inject(LayoutService);
  readonly tabs = BOTTOM_TABS;

  selectTab(id: BottomTabId): void {
    this.layout.bottomTab.set(id);
  }
}
