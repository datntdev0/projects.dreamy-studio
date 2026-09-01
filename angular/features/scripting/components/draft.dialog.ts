// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { formatCount } from '@features/novel/novel.rules';
import { ProjectService } from '@features/project/project.service';
import { isReady, LlmService } from '@features/settings/llm.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { fieldChecked, fieldValue } from '@shared/utils/dom';

// prettier-ignore
import { capitalize, chapterSpan, defaultProviderId, DialogProvider, escapeHtml, formatMoney, overwriteCount } from '../scripting.dialogs.rules';
import { defaultDraftSelection, toggleDraftUnit } from '../scripting.draft';
import { DraftOption, ScriptUnit } from '../scripting.models';
import { ScriptingDialogBase } from './scripting.dialog.base';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-draft-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './draft.dialog.html',
  host: { 'data-testid': 'scripting-draft-dialog' },
})
export class ScriptingDraftDialog extends ScriptingDialogBase {
  private readonly projects = inject(ProjectService);
  private readonly llm = inject(LlmService);

  readonly ready = signal(false);
  readonly selected = signal<string[]>([]);
  readonly provider = signal('');
  readonly film = computed(this.buildFilm.bind(this));
  readonly options = computed(this.buildOptions.bind(this));
  readonly providers = computed(this.buildProviders.bind(this));
  readonly providerName = computed(this.buildProviderName.bind(this));
  readonly overwrite = computed(this.buildOverwrite.bind(this));
  readonly estimateHtml = computed(this.buildEstimateHtml.bind(this));
  readonly overwriteText = computed(this.buildOverwriteText.bind(this));
  readonly unitsHeading = computed(this.buildUnitsHeading.bind(this));

  constructor() {
    super('draft');
    effect(this.sync.bind(this));
  }

  isChecked(option: DraftOption): boolean {
    return this.selected().includes(option.unit.id);
  }

  rowLabel(unit: ScriptUnit): string {
    const title = unit.title ? ` · ${unit.title}` : '';
    return `${this.unitTitle()} ${unit.no}${title}`;
  }

  spanLabel(unit: ScriptUnit): string {
    const range = chapterSpan(unit);
    return range === null
      ? this.languageService.translate('scripting.dialog.span.none')
      : this.languageService.translate('scripting.dialog.span', { range });
  }

  rowHint(option: DraftOption): LanguageKey {
    return option.hasContent
      ? 'scripting.dialog.draft.row.overwrite'
      : 'scripting.dialog.draft.row.empty';
  }

  providerLabel(provider: DialogProvider): string {
    return provider.ready
      ? provider.name
      : this.languageService.translate('scripting.dialog.draft.provider.missing', {
          name: provider.name,
        });
  }

  onUnit(option: DraftOption, event: Event): void {
    this.selected.set(toggleDraftUnit(this.selected(), option.unit.id, fieldChecked(event)));
  }

  onProvider(event: Event): void {
    this.provider.set(fieldValue(event));
  }

  async generate(): Promise<void> {
    const projectId = this.projectId();
    const unitIds = this.selected();
    if (projectId === null || unitIds.length === 0) {
      return;
    }
    const name = this.projects.projectById(projectId)?.name ?? '';
    const provider = this.provider();
    this.close();
    this.toasts.show(
      this.languageService.translate('scripting.dialog.draft.started', { name }),
      'info',
    );
    const generated = await this.scripting.generateDrafts(projectId, unitIds, provider);
    const complete = generated === unitIds.length;
    this.toasts.show(
      this.languageService.translate(
        complete ? 'scripting.dialog.draft.done' : 'scripting.dialog.draft.failed',
        { name },
      ),
      complete ? 'success' : 'warning',
    );
  }

  protected override pending(): boolean {
    return !this.ready();
  }

  private sync(): void {
    const projectId = this.projectId();
    untracked(this.begin.bind(this, projectId));
  }

  private begin(projectId: number | null): void {
    this.ready.set(false);
    if (projectId !== null) {
      void this.prepare(projectId);
    }
  }

  private async prepare(projectId: number): Promise<void> {
    await this.scripting.ensureSources(projectId, true);
    if (this.llm.providers().length === 0) {
      await this.llm.load();
    }
    if (this.projectId() === projectId) {
      this.seed(projectId);
      this.ready.set(true);
    }
  }

  private seed(projectId: number): void {
    const unitId = this.ctx()?.unit?.id ?? null;
    const options = this.scripting.draftOptionsOf(projectId);
    this.selected.set(defaultDraftSelection(options, unitId, this.selected()));
    this.provider.set(defaultProviderId(this.providers(), this.provider()));
  }

  private buildFilm(): boolean {
    return this.ctx()?.config.preset === 'film';
  }

  private buildOptions(): DraftOption[] {
    const projectId = this.projectId();
    return projectId === null ? [] : this.scripting.draftOptionsOf(projectId);
  }

  private buildProviders(): DialogProvider[] {
    return this.llm
      .providers()
      .map((item) => ({ id: item.id, name: item.name, ready: isReady(item) }));
  }

  private buildProviderName(): string {
    const current = this.provider();
    return this.providers().find((item) => item.id === current)?.name ?? current;
  }

  private buildOverwrite(): number {
    return overwriteCount(this.options(), this.selected());
  }

  private buildUnitsHeading(): string {
    const ctx = this.ctx();
    return ctx
      ? this.languageService.translate('scripting.dialog.draft.units', {
          units: capitalize(this.unitWord(ctx.config.unit, true)),
        })
      : '';
  }

  private buildOverwriteText(): string {
    const ctx = this.ctx();
    const count = this.overwrite();
    if (!ctx || count === 0) {
      return '';
    }
    const key =
      count === 1
        ? 'scripting.dialog.draft.overwrite.one'
        : 'scripting.dialog.draft.overwrite.other';
    return this.languageService.translate(key, { what: this.countOf(ctx.config.unit, count) });
  }

  private buildEstimateHtml(): string {
    if (this.selected().length === 0) {
      return escapeHtml(
        this.languageService.translate('scripting.dialog.draft.estimate.none', {
          unit: this.unitName(),
        }),
      );
    }
    const to = escapeHtml(this.languageService.translate('scripting.dialog.draft.estimate.to'));
    const name = escapeHtml(this.providerName());
    return `${to}<b>${name}</b>${escapeHtml(this.estimateRest())}`;
  }

  private estimateRest(): string {
    const ctx = this.ctx();
    const projectId = this.projectId();
    if (!ctx || projectId === null) {
      return '';
    }
    const unitIds = this.selected();
    const estimate = this.scripting.draftEstimateOf(projectId, unitIds);
    const words = formatCount(this.scripting.draftWordsOf(projectId, unitIds));
    const sentKey = this.film()
      ? 'scripting.dialog.draft.sent.film'
      : 'scripting.dialog.draft.sent.audiobook';
    const sent = this.languageService.translate(sentKey, {
      units: this.unitWord(ctx.config.unit, true),
      words,
    });
    return this.languageService.translate('scripting.dialog.draft.estimate.rest', {
      sent,
      tin: formatCount(estimate.tin),
      tout: formatCount(estimate.tout),
      cost: formatMoney(estimate.cost),
    });
  }
}
