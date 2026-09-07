import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '@components/icon';
import { nameTone } from '@shared/utils/monogram';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-asset-avatar',
  imports: [Icon],
  templateUrl: './asset-avatar.component.html',
  host: { 'data-testid': 'library-asset-avatar' },
})
export class LibraryAssetAvatar {
  readonly name = input.required<string>();
  readonly icon = input.required<string>();
  tone(): number {
    return nameTone(this.name());
  }
}
