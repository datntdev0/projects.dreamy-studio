import { Component, HostListener, computed, inject, signal } from "@angular/core";
import { Button } from "../../components/button";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { I18nService } from "../../app/core/i18n/i18n.service";
import { Language } from "../../app/core/i18n/i18n.models";
import { ThemeService } from "../../app/core/theme/theme.service";
import { SettingsService } from "../../app/features/settings/settings.service";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";
import { LayoutService } from "../layout.service";

const LANGUAGE_NAMES: Record<Language, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

@Component({
  selector: "app-titlebar",
  standalone: true,
  imports: [Button, Icon, I18nPipe],
  templateUrl: "./titlebar.html",
})
export class Titlebar {
  private readonly i18n = inject(I18nService);
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
    this.settings.setLanguage(this.i18n.language() === "vi" ? "en" : "vi");
  }

  private currentLanguageName(): string {
    return LANGUAGE_NAMES[this.i18n.language()];
  }

  private currentThemeIcon(): string {
    return this.themes.theme() === "dark" ? "sun" : "moon";
  }
}
