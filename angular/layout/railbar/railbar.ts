import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icon } from '@components/icon';
import { SettingsService } from '@features/settings/settings.service';
import { CoreModule } from '@shared/core.module';

import { PIPELINES_TAB_ID, RAIL_ITEMS } from '../layout.models';
import { LayoutService } from '../layout.service';
import { TabsService } from '../tabs.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-railbar',
  imports: [Icon, CoreModule],
  templateUrl: './railbar.html',
})
export class Railbar {
  readonly layout = inject(LayoutService);
  readonly settings = inject(SettingsService);
  readonly tabs = inject(TabsService);
  readonly pipelinesTabId = PIPELINES_TAB_ID;
  readonly items = RAIL_ITEMS;
}
