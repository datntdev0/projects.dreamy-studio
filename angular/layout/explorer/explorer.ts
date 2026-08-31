import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { LibraryExplorer } from '@features/library/components/explorer.component';
import { NovelExplorer } from '@features/novel/components/explorer.component';
import { ProjectExplorer } from '@features/project/components/explorer.component';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { RAIL_ITEMS, RailItem } from '../layout.models';
import { LayoutService } from '../layout.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-explorer',
  imports: [Button, Icon, CoreModule, NovelExplorer, ProjectExplorer, LibraryExplorer],
  templateUrl: './explorer.html',
})
export class Explorer {
  readonly layout = inject(LayoutService);
  readonly titleKey = computed(this.activeTitleKey.bind(this));

  private activeTitleKey(): LanguageKey {
    return RAIL_ITEMS.find(this.isActiveItem.bind(this))?.labelKey ?? 'main.explorer.label';
  }

  private isActiveItem(item: RailItem): boolean {
    return item.id === this.layout.rail();
  }
}
