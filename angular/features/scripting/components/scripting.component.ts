// prettier-ignore
import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, Injector, input, untracked } from '@angular/core';
import { Icon } from '@components/icon';
import { ProjectLabels } from '@features/project/project.labels';
import { ProjectSummary } from '@features/project/project.models';
import { projectModule } from '@features/project/project.rules';
import { ProjectService } from '@features/project/project.service';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';

import { ScriptContext, ScriptPresetDef, ViewFocus } from '../scripting.models';
import { presetDef } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';
import { ScriptingBanners } from './banners.component';
import { ScriptingBody } from './body.component';
import { ScriptingMenu } from './menu.component';
import { ScriptingPresets } from './presets.component';
import { ScriptingRail } from './rail.component';
import { placeCaret } from './scripting.caret';
import { ScriptingSubbar } from './subbar.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting',
  imports: [
    Icon,
    CoreModule,
    ScriptingRail,
    ScriptingSubbar,
    ScriptingBanners,
    ScriptingBody,
    ScriptingPresets,
    ScriptingMenu,
  ],
  templateUrl: './scripting.component.html',
})
export class Scripting {
  private readonly scripting = inject(ScriptingService);
  private readonly projects = inject(ProjectService);
  private readonly projectLabels = inject(ProjectLabels);
  private readonly tabs = inject(TabsService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly projectId = input.required<number>();
  readonly ctx = computed(this.buildContext.bind(this));
  readonly project = computed(this.findProject.bind(this));
  readonly preset = computed(this.findPreset.bind(this));
  readonly moduleLabel = projectModule('scripting').labelKey;

  constructor() {
    effect(this.ensureData.bind(this));
    effect(this.watchFocus.bind(this));
  }

  back(): void {
    const project = this.project();
    if (project) {
      this.projects.selectOnly(project.id);
      this.tabs.openProject(project.id, project.name, this.projectLabels.iconOf(project.template));
    }
  }

  private buildContext(): ScriptContext | null {
    return this.scripting.contextOf(this.projectId());
  }

  private findProject(): ProjectSummary | undefined {
    return this.projects.projectById(this.projectId());
  }

  private findPreset(): ScriptPresetDef | null {
    const ctx = this.ctx();
    return ctx && !ctx.choose ? presetDef(ctx.config.preset) : null;
  }

  private ensureData(): void {
    const projectId = this.projectId();
    untracked(() => {
      void this.projects.ensureLoaded();
      void this.scripting.ensureLoaded(projectId);
    });
  }

  private watchFocus(): void {
    const view = this.ctx()?.view;
    if (view && (view.focus || view.goto)) {
      untracked(this.scheduleFocus.bind(this));
    }
  }

  private scheduleFocus(): void {
    const pending = this.scripting.consumeFocus(this.projectId());
    afterNextRender(this.applyFocus.bind(this, pending), { injector: this.injector });
  }

  private applyFocus(pending: ViewFocus): void {
    const root = this.host.nativeElement;
    const id = pending.focus ?? pending.goto;
    if (id) {
      this.focusBlock(root, id, pending.goto !== null);
    }
  }

  private focusBlock(root: HTMLElement, id: string, center: boolean): void {
    const row = root.querySelector<HTMLElement>(`.sc-blk[data-id="${id}"]`);
    if (!row) {
      return;
    }
    const text = row.querySelector<HTMLElement>('.sc-t');
    if (text?.getAttribute('contenteditable')) {
      placeCaret(text);
    } else {
      row.querySelector<HTMLElement>('.sc-loc, input')?.focus();
    }
    row.scrollIntoView({ block: center ? 'center' : 'nearest' });
  }
}
