import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { ProjectService } from '@features/project/project.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { AudiobookContext, GenerateGroup, GeneratePlan } from '../audiobook.models';
import { AudiobookDialogBase } from './audiobook.dialog.base';
import { AudiobookInspectorLabels } from './inspector.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-generate-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './generate.dialog.html',
  host: { 'data-testid': 'audiobook-generate-dialog' },
})
export class AudiobookGenerateDialog extends AudiobookDialogBase {
  private readonly projects = inject(ProjectService);
  readonly labels = inject(AudiobookInspectorLabels);

  readonly plan = computed(this.buildPlan.bind(this));
  readonly introHtml = computed(this.buildIntroHtml.bind(this));
  readonly estimateHtml = computed(this.buildEstimateHtml.bind(this));

  constructor() {
    super('generate');
  }

  groupKey(group: GenerateGroup): LanguageKey {
    return group.billing === 'paid'
      ? 'audiobook.dialog.generate.cloudPaid'
      : 'audiobook.dialog.generate.cloudFree';
  }

  async generate(): Promise<void> {
    const projectId = this.projectId();
    const plan = this.plan();
    if (projectId === null || plan === null) {
      return;
    }
    const name = this.projects.projectById(projectId)?.name ?? '';
    this.close();
    this.toasts.show(
      this.languageService.translate('audiobook.dialog.generate.started', { name }),
      'info',
    );
    const generated = await this.audiobook.generate(projectId);
    const complete = generated === plan.segments;
    this.toasts.show(
      this.languageService.translate(
        complete ? 'audiobook.dialog.generate.done' : 'audiobook.dialog.generate.failed',
        { name },
      ),
      complete ? 'success' : 'warning',
    );
  }

  protected override admits(ctx: AudiobookContext): boolean {
    return ctx.unit !== null && ctx.canGenerate;
  }

  private buildPlan(): GeneratePlan | null {
    const projectId = this.projectId();
    return projectId === null ? null : this.audiobook.generatePlanOf(projectId);
  }

  private buildIntroHtml(): string {
    const plan = this.plan();
    if (!plan) {
      return '';
    }
    const count = this.languageService.translate('audiobook.dialog.generate.count', {
      count: plan.segments,
    });
    const key =
      plan.regenerated > 0
        ? 'audiobook.dialog.generate.introRegen'
        : 'audiobook.dialog.generate.intro';
    return this.boldHtml(key, { regen: plan.regenerated }, 'count', count);
  }

  private buildEstimateHtml(): string {
    const plan = this.plan();
    if (!plan) {
      return '';
    }
    const cost =
      plan.cost > 0
        ? this.labels.money(plan.cost)
        : this.languageService.translate('audiobook.dialog.generate.noCost');
    return this.boldHtml('audiobook.dialog.generate.estimate', {}, 'cost', cost);
  }
}
