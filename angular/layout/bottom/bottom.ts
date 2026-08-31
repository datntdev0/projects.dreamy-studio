import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { NovelOmniscient } from '@features/novel/components/knowledge-omniscient.component';
import { PipelineList } from '@features/pipeline/components/list.component';
import { PipelineLog } from '@features/pipeline/components/log.component';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { BottomTabId } from '../layout.models';
import { LayoutService } from '../layout.service';

interface BottomTab {
  id: BottomTabId;
  labelKey: LanguageKey;
}

const BOTTOM_TABS: BottomTab[] = [
  { id: 'pipelines', labelKey: 'main.bottom.tab.pipelines' },
  { id: 'output', labelKey: 'main.bottom.tab.output' },
  { id: 'omniscient', labelKey: 'main.bottom.tab.omniscient' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-bottom',
  imports: [Button, Icon, CoreModule, NovelOmniscient, PipelineLog, PipelineList],
  templateUrl: './bottom.html',
})
export class Bottom {
  readonly layout = inject(LayoutService);
  readonly tabs = BOTTOM_TABS;

  selectTab(id: BottomTabId): void {
    this.layout.bottomTab.set(id);
  }
}
