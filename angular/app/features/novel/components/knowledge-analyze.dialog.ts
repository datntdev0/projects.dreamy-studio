import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { TabOption, Tabs } from "@components/tabs";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { LlmService, isReady } from "../../settings/llm.service";
import { LlmFeature, LlmProvider } from "../../settings/settings.models";
import { SettingsService } from "../../settings/settings.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { AnalyzeMode, AnalyzeSummary, KnowledgeLang } from "../novel.knowledge.models";
import { BATCH_SIZE, ENTITY_TYPES, PREDICATES, RULES, ontologyYaml } from "../novel.knowledge.ontology";
import { NovelKnowledgeService } from "../novel.knowledge.service";
import { planAnalysis } from "../novel.knowledge.rules";
import { ChapterRow, NovelLang, NovelSummary, TargetLang } from "../novel.models";
import { NovelService } from "../novel.service";
import { NOVEL_LANG_KEYS, displayName, formatCount, toNovelError } from "../novel.rules";
import { NovelTranslationService } from "../novel.translation.service";
import { rangeText, targetsOf } from "../novel.translation.rules";

export interface AnalyzeLang {
  value: KnowledgeLang;
  label: string;
  seqs: number[];
}

export interface AnalyzeProvider {
  name: string;
  detail: string;
  state: "ready" | "unset" | "unready";
}

export interface YamlLine {
  text: string;
  comment: boolean;
}

type AnalyzeTab = "analyze" | "ontology";

const MODES: AnalyzeMode[] = ["missing", "range", "all"];

@Component({
  selector: "app-novel-knowledge-analyze-dialog",
  standalone: true,
  imports: [Button, Icon, Tabs, CoreModule],
  templateUrl: "./knowledge-analyze.dialog.html",
  host: { "data-testid": "novel-knowledge-analyze-dialog" },
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

  readonly ontology = {
    types: ENTITY_TYPES.length,
    scalars: PREDICATES.filter((item) => item.kind === "scalar").length,
    relationships: PREDICATES.filter((item) => item.kind === "relationship").length,
    rules: RULES.length,
  };
  readonly tab = signal<AnalyzeTab>("analyze");
  readonly modes = MODES;
  readonly batchSize = BATCH_SIZE;
  readonly count = formatCount;
  readonly mode = signal<AnalyzeMode>("missing");
  readonly from = signal(1);
  readonly to = signal(1);
  readonly overwrite = signal(false);
  readonly picked = signal<KnowledgeLang>("src");
  readonly busy = signal(false);

  readonly request = this.dialogs.analyze;
  readonly open = computed(this.buildOpen.bind(this));
  readonly novel = computed(this.findNovel.bind(this));
  readonly chapters = computed(this.buildChapters.bind(this));
  readonly langs = computed(this.buildLangs.bind(this));
  readonly lang = computed(this.buildLang.bind(this));
  readonly summary = computed(this.buildSummary.bind(this));
  readonly words = computed(this.buildWords.bind(this));
  readonly provider = computed(this.buildProvider.bind(this));
  readonly canStart = computed(this.buildCanStart.bind(this));
  readonly tabs = computed(this.buildTabs.bind(this));
  readonly lines = computed(this.buildLines.bind(this));
  readonly effectiveOverwrite = computed(this.buildOverwrite.bind(this));

  constructor() {
    effect(this.resetOnOpen.bind(this));
    effect(this.loadTranslations.bind(this));
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

  titleOf(row: ChapterRow): string {
    const request = this.request();
    const lang = this.lang();
    const translated = request && lang !== "src" ? this.translation.titleOf(request.novelId, row.id, lang) : null;
    return `${row.seq} · ${translated || row.title}`;
  }

  close(): void {
    this.dialogs.closeAnalyze();
  }

  onMode(mode: AnalyzeMode): void {
    this.mode.set(mode);
  }

  onFrom(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.mode.set("range");
    this.from.set(value);
    this.to.set(Math.max(this.to(), value));
  }

  onTo(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.mode.set("range");
    this.to.set(value);
    this.from.set(Math.min(this.from(), value));
  }

  onOverwrite(event: Event): void {
    this.overwrite.set((event.target as HTMLInputElement).checked);
  }

  onLang(event: Event): void {
    this.picked.set((event.target as HTMLSelectElement).value as KnowledgeLang);
  }

  onTab(value: string): void {
    this.tab.set(value === "ontology" ? "ontology" : "analyze");
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(ontologyYaml());
      this.toasts.show(this.languageService.translate("novel.knowledge.ontology.copied"));
    } catch {
      this.toasts.show(this.languageService.translate("novel.knowledge.ontology.copyFailed"), "warning");
    }
  }

  openSettings(): void {
    this.close();
    this.settings.openDialog("llm");
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
      this.toasts.show(this.languageService.translate("novel.knowledge.analyze.started", { count: run.length }));
    } catch (cause) {
      this.toasts.show(this.languageService.translate("novel.error.generic", { detail: toNovelError(cause).detail }), "danger");
    } finally {
      this.busy.set(false);
    }
  }

  private buildTabs(): TabOption[] {
    return [
      { value: "analyze", label: this.languageService.translate("novel.knowledge.analyze.tab.run"), icon: "graph" },
      { value: "ontology", label: "ontology.yml", icon: "file-code" },
    ];
  }

  private buildLines(): YamlLine[] {
    return ontologyYaml().split("\n").map((text) => ({ text, comment: text.trimStart().startsWith("#") }));
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
    const out: AnalyzeLang[] = [{ value: "src", label: this.langLabel("novel.knowledge.analyze.lang.src", novel.lang, source.length, rows.length), seqs: source }];
    for (const target of targetsOf(novel.lang)) {
      const done = this.translation.of(request.novelId, target).chapters;
      const seqs = rows.filter((row) => done[row.id] !== undefined).map((row) => row.seq);
      if (seqs.length > 0) {
        out.push({ value: target, label: this.langLabel("novel.knowledge.analyze.lang.tr", target, seqs.length, rows.length), seqs });
      }
    }
    return out;
  }

  private langLabel(key: LanguageKey, lang: NovelLang, count: number, total: number): string {
    return this.languageService.translate(key, { lang: this.languageService.translate(NOVEL_LANG_KEYS[lang]), count, total });
  }

  private buildLang(): KnowledgeLang {
    const wanted = this.picked();
    return this.langs().some((item) => item.value === wanted) ? wanted : "src";
  }

  private buildOverwrite(): boolean {
    return this.mode() !== "missing" && this.overwrite();
  }

  private buildSummary(): AnalyzeSummary {
    const request = this.request();
    const analyzed = request ? this.knowledge.of(request.novelId).analyzed : {};
    const available = new Set(this.langs().find((item) => item.value === this.lang())?.seqs ?? []);
    return planAnalysis(this.chapters(), analyzed, { mode: this.mode(), from: this.from(), to: this.to(), overwrite: this.overwrite(), lang: this.lang() }, available);
  }

  private buildWords(): number {
    const run = new Set(this.summary().run);
    return this.chapters().filter((row) => run.has(row.seq)).reduce((sum, row) => sum + row.wordCount, 0);
  }

  private buildProvider(): AnalyzeProvider {
    const feature: LlmFeature | undefined = this.llm.features().find((item) => item.id === "knowledge");
    const provider: LlmProvider | undefined = this.llm.providers().find((item) => item.id === feature?.provider);
    if (!feature || !provider) {
      return { name: "", detail: "", state: "unset" };
    }
    const effort = feature.effort ?? "—";
    return { name: provider.name, detail: `${feature.model || "—"} · ${effort}`, state: isReady(provider) ? "ready" : "unready" };
  }

  private buildCanStart(): boolean {
    return this.summary().run.length > 0 && this.provider().state === "ready";
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
    const analyzed = this.knowledge.of(request.novelId).analyzed;
    const missing = rows.filter((row) => analyzed[row.seq] === undefined).map((row) => row.seq);
    const last = rows.length > 0 ? rows[rows.length - 1].seq : 1;
    const preset = request.preset;
    this.mode.set(preset.mode ?? (missing.length > 0 ? "missing" : "range"));
    this.from.set(preset.from ?? missing[0] ?? 1);
    this.to.set(preset.to ?? last);
    this.overwrite.set(preset.overwrite ?? false);
    this.picked.set(preset.lang ?? "src");
    this.tab.set("analyze");
    this.busy.set(false);
  }

  private loadTranslations(): void {
    const request = this.request();
    const novel = this.novel();
    if (request && novel) {
      untracked(this.ensureTranslations.bind(this, request.novelId, targetsOf(novel.lang)));
    }
  }

  private ensureTranslations(novelId: number, targets: TargetLang[]): void {
    for (const target of targets) {
      void this.translation.ensure(novelId, target);
    }
  }
}
