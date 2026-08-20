import { Component, computed, effect, inject, input, untracked } from "@angular/core";
import { Cover } from "@components/cover";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { LanguageService } from "@app/core/language/language.service";
import { NovelLang, NovelSummary, TargetLang } from "../novel.models";
import { NovelService } from "../novel.service";
import { NOVEL_LANG_KEYS, displayName } from "../novel.rules";
import { NovelTranslationService } from "../novel.translation.service";
import { TranslationStep, TranslationView } from "../novel.translation.models";
import { STEP_ICONS, STEP_HINT_KEYS, STEP_LABEL_KEYS, TRANSLATION_STEPS, stepIndex, targetsOf } from "../novel.translation.rules";
import { NovelTranslationDictionary } from "./translation-dictionary.component";
import { NovelTranslationGuidelines } from "./translation-guidelines.component";
import { NovelTranslationPipeline } from "./translation-pipeline.component";
import { NovelTranslationResult } from "./translation-result.component";
import { NovelTranslationWarnings } from "./translation-warnings.component";

@Component({
  selector: "app-novel-translation",
  standalone: true,
  imports: [Cover, Icon, LanguagePipe, NovelTranslationDictionary, NovelTranslationGuidelines, NovelTranslationPipeline, NovelTranslationResult, NovelTranslationWarnings],
  templateUrl: "./translation.component.html",
})
export class NovelTranslation {
  private readonly novels = inject(NovelService);
  private readonly languageService = inject(LanguageService);

  readonly translation = inject(NovelTranslationService);
  readonly novelId = input.required<number>();
  readonly steps = TRANSLATION_STEPS;
  readonly icons = STEP_ICONS;

  readonly novel = computed(this.findNovel.bind(this));
  readonly cover = computed(this.buildCover.bind(this));
  readonly target = computed(this.buildTarget.bind(this));
  readonly targets = computed(this.buildTargets.bind(this));
  readonly view = computed(this.buildView.bind(this));
  readonly index = computed(this.buildIndex.bind(this));
  readonly hasChapters = computed(this.buildHasChapters.bind(this));

  constructor() {
    effect(this.syncNovel.bind(this));
    effect(this.syncCover.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  langKey(lang: NovelLang): LanguageKey {
    return NOVEL_LANG_KEYS[lang];
  }

  onTarget(event: Event): void {
    this.translation.setTarget(this.novelId(), (event.target as HTMLSelectElement).value as TargetLang);
  }

  labelKey(step: TranslationStep): LanguageKey {
    return STEP_LABEL_KEYS[step];
  }

  hintKey(step: TranslationStep): LanguageKey {
    return STEP_HINT_KEYS[step];
  }

  previous(): TranslationStep | null {
    return this.steps[this.index() - 1] ?? null;
  }

  following(): TranslationStep | null {
    return this.steps[this.index() + 1] ?? null;
  }

  go(step: TranslationStep): void {
    this.translation.setStep(this.novelId(), step);
  }

  summary(step: TranslationStep): string {
    const id = this.novelId();
    const total = this.novels.chaptersOf(id).length;
    const review = this.translation.reviewCountOf(id);
    const warnings = this.translation.warningsOf(id).length;
    switch (step) {
      case "dict":
        return this.languageService.translate("novel.translation.summary.dict", { count: this.translation.of(id).dict.length });
      case "guide":
        return this.languageService.translate(this.translation.of(id).guidelines ? "novel.translation.summary.guideSet" : "novel.translation.summary.guideEmpty");
      case "trans":
        return this.translation.isTranslating(id) ? this.languageService.translate("novel.translation.summary.running") : this.languageService.translate("novel.translation.summary.trans", { done: this.translation.translatedCountOf(id), total });
      case "result":
        return review ? this.languageService.translate("novel.translation.summary.review", { count: review }) : this.languageService.translate("novel.translation.summary.reviewed");
      case "warn":
        return warnings ? this.languageService.translate("novel.translation.summary.warn", { count: warnings }) : this.languageService.translate("novel.translation.summary.none");
    }
  }

  isWarn(step: TranslationStep): boolean {
    const id = this.novelId();
    return (step === "warn" && this.translation.warningsOf(id).length > 0) || (step === "result" && this.translation.reviewCountOf(id) > 0);
  }

  isRunning(step: TranslationStep): boolean {
    return step === "trans" && this.translation.isTranslating(this.novelId());
  }

  private findNovel(): NovelSummary | null {
    return this.novels.novelById(this.novelId()) ?? null;
  }

  private buildCover(): string {
    const novel = this.novel();
    return novel ? (this.novels.coverUrl(novel) ?? "") : "";
  }

  private buildTarget(): TargetLang {
    return this.translation.targetOf(this.novelId());
  }

  private buildTargets(): TargetLang[] {
    return targetsOf(this.novel()?.lang);
  }

  private buildView(): TranslationView {
    return this.translation.viewOf(this.novelId());
  }

  private buildIndex(): number {
    return stepIndex(this.view().step);
  }

  private buildHasChapters(): boolean {
    return this.novels.chaptersOf(this.novelId()).length > 0;
  }

  private syncNovel(): void {
    const id = this.novelId();
    const target = this.translation.targetOf(id);
    untracked(this.openNovel.bind(this, id, target));
  }

  private openNovel(id: number, target: TargetLang): void {
    void this.translation.ensure(id, target);
  }

  private syncCover(): void {
    const novel = this.novel();
    if (novel) {
      this.novels.ensureCover(novel);
    }
  }
}
