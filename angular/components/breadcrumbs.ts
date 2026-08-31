import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Icon } from './icon';

export type BreadcrumbItem = { label: string; icon?: string };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-breadcrumbs',
  imports: [Icon],
  templateUrl: './breadcrumbs.html',
})
export class Breadcrumbs {
  readonly items = input<BreadcrumbItem[]>([]);
  readonly navigate = output<number>();
}
