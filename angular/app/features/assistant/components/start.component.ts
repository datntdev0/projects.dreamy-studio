import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { NovelSummary } from "@app/features/novel/novel.models";
import { displayName, formatCount } from "@app/features/novel/novel.rules";
import { NovelService } from "@app/features/novel/novel.service";
import { AssistantScope, AssistantSessionSummary } from "../assistant.models";
import { NOVEL_SCOPES, WORKSPACE_SCOPE, novelScope, sameScope, scopeNovels, shortStamp } from "../assistant.rules";
import { AssistantService } from "../assistant.service";
import { AssistantComposer } from "./composer.component";

@Component({
  selector: "app-assistant-start",
  standalone: true,
  imports: [Button, Icon, CoreModule, AssistantComposer],
  templateUrl: "./start.component.html",
})
export class AssistantStart {
  private readonly languageService = inject(LanguageService);
  private readonly injector = inject(Injector);
  private readonly composer = viewChild(AssistantComposer);
  private readonly toggleButton = viewChild<ElementRef<HTMLButtonElement>>("toggleButton");
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>("searchField");
  private readonly panel = viewChild<ElementRef<HTMLElement>>("panel");

  readonly assistant = inject(AssistantService);
  readonly novels = inject(NovelService);
  readonly workspaceScope = WORKSPACE_SCOPE;
  readonly novelScopes = NOVEL_SCOPES;
  readonly expanded = signal(false);
  readonly query = signal("");
  readonly options = computed(this.buildOptions.bind(this));

  isChosen(scope: AssistantScope): boolean {
    return sameScope(this.assistant.draftScope(), scope);
  }

  isNovelChosen(novel: NovelSummary): boolean {
    return this.isChosen(novelScope(novel.id));
  }

  toggle(): void {
    if (this.expanded()) {
      this.collapse(false);
      return;
    }
    this.expanded.set(true);
    afterNextRender(this.focusSearch.bind(this), { injector: this.injector });
  }

  chooseWorkspace(): void {
    this.choose(WORKSPACE_SCOPE);
  }

  chooseNovel(novel: NovelSummary): void {
    this.choose(novelScope(novel.id));
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.expanded()) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.collapse(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.moveFocus(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  currentLabel(): string {
    return this.assistant.scopeLabel(this.assistant.draftScope());
  }

  currentIcon(): string {
    return this.assistant.scopeIcon(this.assistant.draftScope());
  }

  currentMeta(): string {
    const scope = this.assistant.draftScope();
    const novel = scope.novelId === null ? null : this.novels.novelById(scope.novelId);
    return novel ? this.novelMeta(novel) : this.workspaceMeta();
  }

  novelMeta(novel: NovelSummary): string {
    return this.languageService.translate("assistant.scope.novelMeta", { chapters: formatCount(novel.chapterCount), translated: novel.translatedCount, analyzed: novel.analyzedCount });
  }

  novelShort(novel: NovelSummary): string {
    return this.languageService.translate("assistant.scope.novelShort", { count: formatCount(novel.chapterCount) });
  }

  workspaceMeta(): string {
    return this.languageService.translate("assistant.scope.workspaceMeta", { count: this.novels.novels().length });
  }

  stampOf(session: AssistantSessionSummary): string {
    return shortStamp(session.updatedAt, new Date());
  }

  private choose(scope: AssistantScope): void {
    this.assistant.chooseScope(scope);
    this.collapse(false);
    this.composer()?.focus();
  }

  private collapse(refocus: boolean): void {
    this.expanded.set(false);
    this.query.set("");
    if (refocus) {
      afterNextRender(this.focusToggle.bind(this), { injector: this.injector });
    }
  }

  private focusSearch(): void {
    const target = this.searchField()?.nativeElement ?? this.panel()?.nativeElement.querySelector<HTMLElement>("[data-nav]");
    target?.focus();
  }

  private focusToggle(): void {
    this.toggleButton()?.nativeElement.focus();
  }

  private moveFocus(step: number): void {
    const items = Array.from(this.panel()?.nativeElement.querySelectorAll<HTMLElement>("[data-nav]") ?? []);
    const next = items.indexOf(document.activeElement as HTMLElement) + step;
    items[Math.min(Math.max(next, 0), items.length - 1)]?.focus();
  }

  private buildOptions(): NovelSummary[] {
    return scopeNovels(this.novels.novels(), this.query(), this.assistant.contextScope().novelId);
  }
}
