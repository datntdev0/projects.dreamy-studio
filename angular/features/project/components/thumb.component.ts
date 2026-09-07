import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { coverBackground } from '@components/cover';
import { leadingMonogram, nameTone } from '@shared/utils/monogram';

import { ProjectSummary } from '../project.models';
import { ProjectService } from '../project.service';

export type ProjectThumbKind = 'th' | 'card' | 'hero';
export type ProjectThumbSize = '' | 'xs' | 'md';

const PROJECT_MONOGRAM_LETTERS = 3;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-thumb',
  templateUrl: './thumb.component.html',
})
export class ProjectThumb {
  private readonly projects = inject(ProjectService);
  readonly project = input.required<ProjectSummary>();
  readonly kind = input<ProjectThumbKind>('th');
  readonly size = input<ProjectThumbSize>('');
  readonly image = computed(this.buildImage.bind(this));
  readonly background = computed(this.buildBackground.bind(this));
  readonly monogram = computed(this.buildMonogram.bind(this));
  readonly tone = computed(this.buildTone.bind(this));

  constructor() {
    effect(this.syncCover.bind(this));
  }

  private buildImage(): string {
    return this.projects.coverUrl(this.project().id) ?? '';
  }

  private buildBackground(): string {
    return coverBackground(this.image());
  }

  private buildMonogram(): string {
    return leadingMonogram(this.project().name, PROJECT_MONOGRAM_LETTERS);
  }

  private buildTone(): string {
    return this.image() ? '' : `tone-${nameTone(this.project().name)}`;
  }

  private syncCover(): void {
    this.projects.ensureCover(this.project().id);
  }
}
