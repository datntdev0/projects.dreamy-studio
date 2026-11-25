import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { formatBytes } from '@features/library/library.rules';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import {
  SetupGroupId,
  SetupItem,
  SetupItemId,
  SetupItemState,
  SetupState,
  Translatable,
} from '../setup.models';
// prettier-ignore
import { durationText, errorKey, groupKey, groupsOf, isBusy, itemIcon, itemNameKey, itemPercent, itemRoleKey, receivedBytes, receivedOf, remainingSeconds, setupPercent, stateIcon, stateKey, titleKey, totalBytes } from '../setup.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-setup-card',
  imports: [Button, Icon, CoreModule],
  templateUrl: './setup-card.component.html',
  host: { 'data-testid': 'setup-card' },
})
export class SetupCard {
  readonly state = input.required<SetupState>();

  readonly retried = output<void>();
  readonly paused = output<void>();
  readonly resumed = output<void>();
  readonly continued = output<void>();
  readonly quit = output<void>();
  readonly offlineImported = output<void>();

  readonly status = computed(() => this.state().status);
  readonly busy = computed(() => isBusy(this.status()));
  readonly percent = computed(() => setupPercent(this.state()));
  readonly title = computed(() => titleKey(this.status()));
  readonly groups = computed(() => groupsOf(this.state().items));
  readonly totalText = computed(() => formatBytes(totalBytes(this.state().items)));
  readonly receivedText = computed(() => formatBytes(receivedBytes(this.state().items)));
  readonly speedText = computed(() => `${formatBytes(this.state().speed)}/s`);
  readonly eta = computed(() => this.etaOf(remainingSeconds(this.state())));
  readonly error = computed(() => this.errorOf(this.state()));

  groupKey(id: SetupGroupId): LanguageKey {
    return groupKey(id);
  }

  itemIcon(id: SetupItemId): string {
    return itemIcon(id);
  }

  itemNameKey(id: SetupItemId): LanguageKey {
    return itemNameKey(id);
  }

  itemRoleKey(id: SetupItemId): LanguageKey {
    return itemRoleKey(id);
  }

  stateIcon(state: SetupItemState): string {
    return stateIcon(state);
  }

  stateKey(state: SetupItemState): LanguageKey {
    return stateKey(state);
  }

  itemPercent(item: SetupItem): number {
    return itemPercent(item);
  }

  itemBytes(item: SetupItem): string {
    return `${formatBytes(receivedOf(item))} / ${formatBytes(item.total)}`;
  }

  private etaOf(seconds: number | null): Translatable | null {
    return seconds === null ? null : durationText(seconds);
  }

  private errorOf(state: SetupState): LanguageKey | null {
    return state.error ? errorKey(state.error) : null;
  }
}
