import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-range-fields',
  imports: [CoreModule],
  templateUrl: './range-fields.component.html',
})
export class NovelRangeFields {
  readonly from = input.required<number>();
  readonly to = input.required<number>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly testidPrefix = input.required<string>();
  readonly fromKey = input.required<LanguageKey>();
  readonly joinKey = input.required<LanguageKey>();
  readonly toKey = input.required<LanguageKey>();

  readonly fromChanged = output<Event>();
  readonly toChanged = output<Event>();

  changeFrom(event: Event): void {
    this.fromChanged.emit(event);
  }

  changeTo(event: Event): void {
    this.toChanged.emit(event);
  }
}
