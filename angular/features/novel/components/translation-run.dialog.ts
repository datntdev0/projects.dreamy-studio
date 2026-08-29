import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { LanguageKey } from "@core/language/language.models";
import { CoreModule } from "@core/core.module";
import { LanguageService } from "@core/language/language.service";
import { ToastService } from "@core/toast/toast.service";
import { LlmService, isReady } from "../../settings/llm.service";
import { LlmFeature, LlmProvider } from "../../settings/settings.models";
import { SettingsService } from "../../settings/settings.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { ChapterRow, NovelSummary, TargetLang } from "../novel.models";
import { NovelService } from "../novel.service";
import { NOVEL_LANG_KEYS, displayName, formatCount, toNovelError } from "../novel.rules";
import { TranslateMode, TranslateSummary } from "../novel.translation.models";
import { planTranslation, rangeText, targetsOf } from "../novel.translation.rules";
import { NovelTranslationService } from "../novel.translation.service";
import { AnalyzeProvider } from "./knowledge-analyze.dialog";

const MODES: TranslateMode[] = ["missing", "range", "all"];

@Component({
  selector: "app-novel-translation-run-dialog",
  standalone: true,
  imports: [Button, Icon, CoreModule],
  templateUrl: "./translation-run.dialog.html",
  host: { "data-testid": "novel-translation-run-dialog" },
})
export class NovelTranslationRunDialog {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly translation = inject(NovelTranslationService);
  private readonly llm = inject(LlmService);
  private readonly settings = inject(SettingsService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly modes = MODES;
  readonly count = formatCount;
  readonly mode = signal<TranslateMode>("missing");
  readonly from = signal(1);
  readonly to = signal(1);
  readonly overwrite = signal(false);
  readonly picked = signal<TargetLang | null>(null);
  readonly busy = signal(false);

  readonly request = this.dialogs.translate;
  readonly open = computed(this.buildOpen.bind(this));
  readonly novel = computed(this.findNovel.bind(this));
  readonly chapters = computed(this.buildChapters.bind(this));
  readonly firstSeq = computed(this.buildFirstSeq.bind(this));
  readonly lastSeq = computed(this.buildLastSeq.bind(this));
  readonly targets = computed(this.buildTargets.bind(this));
  readonly target = computed(this.buildTarget.bind(this));
  readonly summary = computed(this.buildSummary.bind(this));
  readonly words = computed(this.buildWords.bind(this));
  readonly provider = computed(this.buildProvider.bind(this));
  readonly canStart = computed(this.buildCanStart.bind(this));
  readonly effectiveOverwrite = computed(this.buildOverwrite.bind(this));

  constructor() {
    effect(this.resetOnOpen.bind(this));
    effect(this.loadTranslation.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  modeKey(mode: TranslateMode): LanguageKey {
    return `novel.translation.run.mode.${mode}`;
  }

  langKey(lang: TargetLang): LanguageKey {
    return NOVEL_LANG_KEYS[lang];
  }

  rangeOf(seqs: number[]): string {
    return rangeText(seqs);
  }

  close(): void {
    this.dialogs.closeTranslate();
  }

  onMode(mode: TranslateMode): void {
    this.mode.set(mode);
  }

  onFrom(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.clampSeq(input.value, this.from());
    input.value = String(value);
    this.mode.set("range");
    this.from.set(value);
    this.to.set(Math.max(this.to(), value));
  }

  onTo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.clampSeq(input.value, this.to());
    input.value = String(value);
    this.mode.set("range");
    this.to.set(value);
    this.from.set(Math.min(this.from(), value));
  }

  onOverwrite(event: Event): void {
    this.overwrite.set((event.target as HTMLInputElement).checked);
  }

  onTarget(event: Event): void {
    this.picked.set((event.target as HTMLSelectElement).value as TargetLang);
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
    const summary = this.summary();
    try {
      await this.translation.translate(request.novelId, summary.runIds, this.target());
      this.close();
      this.toasts.show(this.languageService.translate("novel.translation.run.started", { count: summary.run.length }));
    } catch (cause) {
      this.toasts.show(this.languageService.translate("novel.error.generic", { detail: toNovelError(cause).detail }), "danger");
    } finally {
      this.busy.set(false);
    }
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

  private buildTargets(): TargetLang[] {
    return targetsOf(this.novel()?.lang);
  }

  private buildTarget(): TargetLang {
    const wanted = this.picked();
    return wanted !== null && this.targets().includes(wanted) ? wanted : (this.targets()[0] ?? "VI");
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
    if (raw.trim() === "" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(Math.max(value, this.firstSeq()), this.lastSeq());
  }

  private buildOverwrite(): boolean {
    return this.mode() !== "missing" && this.overwrite();
  }

  private buildSummary(): TranslateSummary {
    const request = this.request();
    if (!request) {
      return planTranslation([], {}, [], { mode: "missing", from: 1, to: 1, overwrite: false });
    }
    const target = this.target();
    const translated = this.translation.of(request.novelId, target).chapters;
    const busy = [...this.translation.queuedOf(request.novelId, target), ...Object.keys(this.translation.progressOf(request.novelId, target))];
    return planTranslation(this.chapters(), translated, busy, { mode: this.mode(), from: this.from(), to: this.to(), overwrite: this.overwrite() });
  }

  private buildWords(): number {
    const run = new Set(this.summary().run);
    return this.chapters().filter((row) => run.has(row.seq)).reduce((sum, row) => sum + row.wordCount, 0);
  }

  private buildProvider(): AnalyzeProvider {
    const feature: LlmFeature | undefined = this.llm.features().find((item) => item.id === "translation");
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
    const preset = request.preset;
    const target = this.translation.targetOf(request.novelId);
    const translated = this.translation.of(request.novelId, target).chapters;
    const missing = rows.filter((row) => translated[row.id] === undefined).map((row) => row.seq);
    const last = rows.length > 0 ? rows[rows.length - 1].seq : 1;
    this.mode.set(preset.mode ?? (missing.length > 0 ? "missing" : "range"));
    this.from.set(preset.from ?? missing[0] ?? 1);
    this.to.set(preset.to ?? last);
    this.overwrite.set(preset.overwrite ?? false);
    this.picked.set(target);
    this.busy.set(false);
  }

  private loadTranslation(): void {
    const request = this.request();
    const target = this.target();
    if (request) {
      untracked(this.ensureTranslation.bind(this, request.novelId, target));
    }
  }

  private ensureTranslation(novelId: number, target: TargetLang): void {
    void this.translation.ensure(novelId, target);
  }
}
