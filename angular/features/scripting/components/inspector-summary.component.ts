import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { formatCount } from '@features/novel/novel.rules';
import { CoreModule } from '@shared/core.module';

import { ScriptContext, ScriptIssue, ScriptMetrics, ScriptUnit } from '../scripting.models';
import { BLOCK_TYPES, metricsOf, speakerClass, speakerOf } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';
import { ScriptingInspectorLabels } from './inspector.labels';
// prettier-ignore
import { StatusBadge, statusBadgeOf, TypeRow, typeRowsOf, visibleIssues, WhoRow, whoRowsOf } from './inspector.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-inspector-summary',
  host: { 'data-testid': 'scripting-inspector-summary' },
  imports: [Icon, CoreModule],
  templateUrl: './inspector-summary.component.html',
})
export class ScriptingInspectorSummary {
  private readonly scripting = inject(ScriptingService);
  readonly labels = inject(ScriptingInspectorLabels);
  readonly count = formatCount;
  readonly types = BLOCK_TYPES;

  readonly ctx = input.required<ScriptContext>();
  readonly unit = computed(this.buildUnit.bind(this));
  readonly metrics = computed(this.buildMetrics.bind(this));
  readonly badge = computed(this.buildBadge.bind(this));
  readonly who = computed(this.buildWho.bind(this));
  readonly typeRows = computed(this.buildTypeRows.bind(this));
  readonly issues = computed(this.buildIssues.bind(this));
  readonly hasBlocks = computed(this.buildHasBlocks.bind(this));

  speakerClassOf(id: string): string {
    return speakerClass(speakerOf(this.ctx().cast, id));
  }

  speakerNameOf(id: string): string {
    return this.labels.speakerName(speakerOf(this.ctx().cast, id));
  }

  message(issue: ScriptIssue): string {
    return this.scripting.issueMessage(issue);
  }

  go(issue: ScriptIssue): void {
    const projectId = this.ctx().projectId;
    if (issue.blockId) {
      this.scripting.gotoBlock(projectId, issue.blockId);
    } else if (issue.ref) {
      this.scripting.gotoRef(projectId, issue.ref);
    }
  }

  private buildUnit(): ScriptUnit {
    return this.ctx().unit as ScriptUnit;
  }

  private buildMetrics(): ScriptMetrics {
    const ctx = this.ctx();
    return ctx.metrics ?? metricsOf(ctx.cast, null);
  }

  private buildBadge(): StatusBadge {
    return statusBadgeOf(this.unit().status, this.ctx().generating);
  }

  private buildWho(): WhoRow[] {
    return whoRowsOf(this.metrics());
  }

  private buildTypeRows(): TypeRow[] {
    return typeRowsOf(this.metrics());
  }

  private buildIssues(): ScriptIssue[] {
    return visibleIssues(this.ctx().issues);
  }

  private buildHasBlocks(): boolean {
    return (this.unit().blocks?.length ?? 0) > 0;
  }
}
