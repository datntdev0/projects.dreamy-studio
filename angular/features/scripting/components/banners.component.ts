import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { displayName } from '@features/novel/novel.rules';
import { NovelService } from '@features/novel/novel.service';
import { ProjectService } from '@features/project/project.service';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';

import { ScriptContext } from '../scripting.models';
import { ScriptingLabels } from './scripting.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-banners',
  imports: [Icon, CoreModule],
  templateUrl: './banners.component.html',
})
export class ScriptingBanners {
  protected readonly labels = inject(ScriptingLabels);
  private readonly projects = inject(ProjectService);
  private readonly novels = inject(NovelService);
  private readonly tabs = inject(TabsService);

  readonly ctx = input.required<ScriptContext>();
  readonly unitLower = computed(this.buildUnitLower.bind(this));
  readonly staleCount = computed(this.buildStaleCount.bind(this));
  readonly showKb = computed(this.buildShowKb.bind(this));
  readonly missing = computed(this.buildMissing.bind(this));

  openKnowledge(): void {
    const novelId = this.projects.projectById(this.ctx().projectId)?.novelId ?? null;
    const novel = novelId === null ? undefined : this.novels.novelById(novelId);
    if (novel) {
      this.tabs.openNovelTool('knowledge', novel.id, displayName(novel));
    }
  }

  private buildUnitLower(): string {
    return this.labels.unitLower(this.ctx().config);
  }

  private buildStaleCount(): number {
    const ctx = this.ctx();
    return !ctx.config.source || !ctx.source ? ctx.staleRefs.length : 0;
  }

  private buildShowKb(): boolean {
    const ctx = this.ctx();
    return ctx.config.ranges && !!ctx.unit && !ctx.unit.meta && !ctx.locked;
  }

  private buildMissing(): string {
    return this.ctx().kb.missing.join(', ');
  }
}
