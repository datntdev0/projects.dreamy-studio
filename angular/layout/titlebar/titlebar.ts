import { Component, HostListener, computed, inject, signal } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { Language } from "@app/core/language/language.models";
import { ThemeService } from "@app/core/theme/theme.service";
import { SettingsService } from "@app/features/settings/settings.service";
import { WorkspaceService } from "@app/features/workspace/workspace.service";
import { LayoutService } from "../layout.service";

const LANGUAGE_NAMES: Record<Language, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

@Component({
  selector: "app-titlebar",
  standalone: true,
  imports: [Button, Icon, CoreModule],
  templateUrl: "./titlebar.html",
})
export class Titlebar {
  private readonly languageService = inject(LanguageService);
  private readonly themes = inject(ThemeService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly settings = inject(SettingsService);

  readonly layout = inject(LayoutService);
  readonly workspace = this.workspaceService.current;
  readonly viewOpen = signal(false);
  readonly languageName = computed(this.currentLanguageName.bind(this));
  readonly themeIcon = computed(this.currentThemeIcon.bind(this));

  @HostListener("document:click")
  @HostListener("document:keydown.escape")
  closeMenus(): void {
    this.viewOpen.set(false);
  }

  toggleViewMenu(event: Event): void {
    event.stopPropagation();
    this.viewOpen.set(!this.viewOpen());
  }

  openSwitchDialog(): void {
    this.workspaceService.openSwitchDialog();
  }

  toggleTheme(): void {
    this.settings.setTheme(this.themes.theme() === "dark" ? "light" : "dark");
  }

  toggleLanguage(): void {
    this.settings.setLanguage(this.languageService.language() === "vi" ? "en" : "vi");
  }

  private currentLanguageName(): string {
    return LANGUAGE_NAMES[this.languageService.language()];
  }

  private currentThemeIcon(): string {
    return this.themes.theme() === "dark" ? "sun" : "moon";
  }
}
