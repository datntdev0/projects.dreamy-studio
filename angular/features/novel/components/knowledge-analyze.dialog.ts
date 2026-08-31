// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { TabOption, Tabs } from '@components/tabs';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldChecked, fieldValue } from '@shared/utils/dom';

import { LlmService } from '../../settings/llm.service';
import { SettingsService } from '../../settings/settings.service';
import { NovelDialogsService } from '../novel.dialogs.service';
import { AnalyzeMode, AnalyzeSummary, KnowledgeLang } from '../novel.knowledge.models';
import { BATCH_SIZE } from '../novel.knowledge.ontology';
import { planAnalysis } from '../novel.knowledge.rules';
import { NovelKnowledgeService } from '../novel.knowledge.service';
import { ChapterRow, NovelLang, NovelSummary, TargetLang } from '../novel.models';
import { buildFeatureProvider } from '../novel.provider';
import { displayName, formatCount, NOVEL_LANG_KEYS, toNovelError } from '../novel.rules';
import { NovelService } from '../novel.service';
import { rangeText, targetsOf } from '../novel.translation.rules';
import { NovelTranslationService } from '../novel.translation.service';
import { NovelModeOption } from './mode-option.component';
import { AnalyzeProvider, NovelProviderStatus } from './provider-status.component';
import { NovelRangeFields } from './range-fields.component';

export interface AnalyzeLang {
  value: KnowledgeLang;
  label: string;
  seqs: number[];
}

export interface YamlLine {
  text: string;
  comment: boolean;
}

export interface OntologySummary {
  types: number;
  scalars: number;
  relationships: number;
  rules: number;
}

type AnalyzeTab = 'analyze' | 'ontology';

const MODES: AnalyzeMode[] = ['missing', 'range', 'all'];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-knowledge-analyze-dialog',
  imports: [Button, Icon, Tabs, CoreModule, NovelModeOption, NovelProviderStatus, NovelRangeFields],
  templateUrl: './knowledge-analyze.dialog.html',
  host: { 'data-testid': 'novel-knowledge-analyze-dialog' },
})
export class NovelKnowledgeAnalyzeDialog {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly translation = inject(NovelTranslationService);
  private readonly llm = inject(LlmService);
  private readonly settings = inject(SettingsService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly tab = signal<AnalyzeTab>('analyze');
  readonly modes = MODES;
  readonly batchSize = BATCH_SIZE;
  readonly count = formatCount;
  readonly mode = signal<AnalyzeMode>('missing');
  readonly from = signal(1);
  readonly to = signal(1);
  readonly overwrite = signal(false);
  readonly picked = signal<KnowledgeLang>('src');
  readonly busy = signal(false);

  readonly request = this.dialogs.analyze;
  readonly open = computed(this.buildOpen.bind(this));
  readonly novel = computed(this.findNovel.bind(this));
  readonly chapters = computed(this.buildChapters.bind(this));
  readonly firstSeq = computed(this.buildFirstSeq.bind(this));
  readonly lastSeq = computed(this.buildLastSeq.bind(this));
  readonly langs = computed(this.buildLangs.bind(this));
  readonly lang = computed(this.buildLang.bind(this));
  readonly summary = computed(this.buildSummary.bind(this));
  readonly words = computed(this.buildWords.bind(this));
  readonly provider = computed(this.buildProvider.bind(this));
  readonly canStart = computed(this.buildCanStart.bind(this));
  readonly tabs = computed(this.buildTabs.bind(this));
  readonly ontology = computed(this.buildOntology.bind(this));
  readonly lines = computed(this.buildLines.bind(this));
  readonly effectiveOverwrite = computed(this.buildOverwrite.bind(this));

  constructor() {
    effect(this.resetOnOpen.bind(this));
    effect(this.loadTranslations.bind(this));
    effect(this.loadAnalyzed.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  modeKey(mode: AnalyzeMode): LanguageKey {
    return `novel.knowledge.analyze.mode.${mode}`;
  }

  rangeOf(seqs: number[]): string {
    return rangeText(seqs);
  }

  close(): void {
    this.dialogs.closeAnalyze();
  }

  onMode(mode: AnalyzeMode): void {
    this.mode.set(mode);
  }

  onFrom(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.clampSeq(input.value, this.from());
    input.value = String(value);
    this.mode.set('range');
    this.from.set(value);
    this.to.set(Math.max(this.to(), value));
  }

  onTo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.clampSeq(input.value, this.to());
    input.value = String(value);
    this.mode.set('range');
    this.to.set(value);
    this.from.set(Math.min(this.from(), value));
  }

  onOverwrite(event: Event): void {
    this.overwrite.set(fieldChecked(event));
  }

  onLang(event: Event): void {
    this.picked.set(fieldValue(event) as KnowledgeLang);
  }

  onTab(value: string): void {
    this.tab.set(value === 'ontology' ? 'ontology' : 'analyze');
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.knowledge.ontology().yaml);
      this.toasts.show(this.languageService.translate('novel.knowledge.ontology.copied'));
    } catch {
      this.toasts.show(
        this.languageService.translate('novel.knowledge.ontology.copyFailed'),
        'warning',
      );
    }
  }

  openSettings(): void {
    this.close();
    this.settings.openDialog('llm');
  }

  async start(): Promise<void> {
    const request = this.request();
    if (!request || this.busy() || !this.canStart()) {
      return;
    }
    this.busy.set(true);
    const run = this.summary().run;
    try {
      await this.knowledge.analyze(request.novelId, run, this.lang(), this.effectiveOverwrite());
      this.close();
      this.toasts.show(
        this.languageService.translate('novel.knowledge.analyze.started', { count: run.length }),
      );
    } catch (cause) {
      this.toasts.show(
        this.languageService.translate('novel.error.generic', {
          detail: toNovelError(cause).detail,
        }),
        'danger',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private buildTabs(): TabOption[] {
    return [
      {
        value: 'analyze',
        label: this.languageService.translate('novel.knowledge.analyze.tab.run'),
        icon: 'graph',
      },
      { value: 'ontology', label: 'ontology.yml', icon: 'file-code' },
    ];
  }

  private buildOntology(): OntologySummary {
    const ontology = this.knowledge.ontology();
    return {
      types: ontology.types.length,
      scalars: ontology.scalars.length,
      relationships: ontology.relationships.length,
      rules: ontology.rules.length,
    };
  }

  private buildLines(): YamlLine[] {
    return this.knowledge
      .ontology()
      .yaml.split('\n')
      .map((text) => ({ text, comment: text.trimStart().startsWith('#') }));
  }

  private buildOpen(): boolean {
    return this.request() !== null;
  }

  private findNovel(): NovelSummary | null {
    const request = this.request();
    return request ? (this.novels.novelById(request.novelId) ?? null) : null;
  }

  private buildChapters(): ChapterRow[] {
    const request = this.request();
    return request ? this.novels.chaptersOf(request.novelId) : [];
  }

  private buildLangs(): AnalyzeLang[] {
    const request = this.request();
    const novel = this.novel();
    if (!request || !novel) {
      return [];
    }
    const rows = this.chapters();
    const source = rows.filter((row) => row.wordCount > 0).map((row) => row.seq);
    const out: AnalyzeLang[] = [
      {
        value: 'src',
        label: this.langLabel(
          'novel.knowledge.analyze.lang.src',
          novel.lang,
          source.length,
          rows.length,
        ),
        seqs: source,
      },
    ];
    for (const target of targetsOf(novel.lang)) {
      const done = this.translation.of(request.novelId, target).chapters;
      const seqs = rows.filter((row) => done[row.id] !== undefined).map((row) => row.seq);
      if (seqs.length > 0) {
        out.push({
          value: target,
          label: this.langLabel(
            'novel.knowledge.analyze.lang.tr',
            target,
            seqs.length,
            rows.length,
          ),
          seqs,
        });
      }
    }
    return out;
  }

  private langLabel(key: LanguageKey, lang: NovelLang, count: number, total: number): string {
    return this.languageService.translate(key, {
      lang: this.languageService.translate(NOVEL_LANG_KEYS[lang]),
      count,
      total,
    });
  }

  private buildLang(): KnowledgeLang {
    const wanted = this.picked();
    return this.langs().some((item) => item.value === wanted) ? wanted : 'src';
  }

  private buildFirstSeq(): number {
    const rows = this.chapters();
    return rows.length > 0 ? rows[0].seq : 1;
  }

  private buildLastSeq(): number {
    const rows = this.chapters();
    return rows.length > 0 ? rows[rows.length - 1].seq : 1;
  }

  private clampSeq(raw: string, fallback: number): number {
    const value = Math.round(Number(raw));
    if (raw.trim() === '' || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(Math.max(value, this.firstSeq()), this.lastSeq());
  }

  private buildOverwrite(): boolean {
    return this.mode() !== 'missing' && this.overwrite();
  }

  private buildSummary(): AnalyzeSummary {
    const request = this.request();
    const analyzed = request ? this.knowledge.of(request.novelId, this.lang()).analyzed : {};
    const available = new Set(this.langs().find((item) => item.value === this.lang())?.seqs ?? []);
    return planAnalysis(
      this.chapters(),
      analyzed,
      {
        mode: this.mode(),
        from: this.from(),
        to: this.to(),
        overwrite: this.overwrite(),
        lang: this.lang(),
      },
      available,
    );
  }

  private buildWords(): number {
    const run = new Set(this.summary().run);
    return this.chapters()
      .filter((row) => run.has(row.seq))
      .reduce((sum, row) => sum + row.wordCount, 0);
  }

  private buildProvider(): AnalyzeProvider {
    return buildFeatureProvider(this.llm, 'knowledge');
  }

  private buildCanStart(): boolean {
    return this.summary().run.length > 0 && this.provider().state === 'ready';
  }

  private resetOnOpen(): void {
    const request = this.request();
    if (request) {
      untracked(this.applyPreset.bind(this));
    }
  }

  private applyPreset(): void {
    const request = this.request();
    if (!request) {
      return;
    }
    const rows = this.novels.chaptersOf(request.novelId);
    const preset = request.preset;
    const lang = preset.lang ?? this.knowledge.viewOf(request.novelId).lang;
    const analyzed = this.knowledge.of(request.novelId, lang).analyzed;
    const missing = rows.filter((row) => analyzed[row.seq] === undefined).map((row) => row.seq);
    const last = rows.length > 0 ? rows[rows.length - 1].seq : 1;
    this.mode.set(preset.mode ?? (missing.length > 0 ? 'missing' : 'range'));
    this.from.set(preset.from ?? missing[0] ?? 1);
    this.to.set(preset.to ?? last);
    this.overwrite.set(preset.overwrite ?? false);
    this.picked.set(lang);
    this.tab.set('analyze');
    this.busy.set(false);
  }

  private loadTranslations(): void {
    const request = this.request();
    const novel = this.novel();
    if (request && novel) {
      untracked(this.ensureTranslations.bind(this, request.novelId, targetsOf(novel.lang)));
    }
  }

  private loadAnalyzed(): void {
    const request = this.request();
    const lang = this.lang();
    if (request) {
      untracked(this.ensureAnalyzed.bind(this, request.novelId, lang));
    }
  }

  private ensureAnalyzed(novelId: number, lang: KnowledgeLang): void {
    void this.knowledge.ensure(novelId, lang);
  }

  private ensureTranslations(novelId: number, targets: TargetLang[]): void {
    for (const target of targets) {
      void this.translation.ensure(novelId, target);
    }
  }
}
