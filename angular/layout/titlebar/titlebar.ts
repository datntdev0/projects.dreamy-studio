// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { SettingsService } from '@features/settings/settings.service';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { CoreModule } from '@shared/core.module';
import { Language } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ThemeService } from '@shared/theme/theme.service';

import { LayoutService } from '../layout.service';

const LANGUAGE_NAMES: Record<Language, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-titlebar',
  imports: [Button, Icon, CoreModule],
  templateUrl: './titlebar.html',
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

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
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
    this.settings.setTheme(this.themes.theme() === 'dark' ? 'light' : 'dark');
  }

  toggleLanguage(): void {
    this.settings.setLanguage(this.languageService.language() === 'vi' ? 'en' : 'vi');
  }

  private currentLanguageName(): string {
    return LANGUAGE_NAMES[this.languageService.language()];
  }

  private currentThemeIcon(): string {
    return this.themes.theme() === 'dark' ? 'sun' : 'moon';
  }
}
