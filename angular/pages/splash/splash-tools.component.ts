import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { SegmentOption, Segments } from '@components/segments';
import { SettingsService } from '@features/settings/settings.service';
import { CoreModule } from '@shared/core.module';
import { isLanguage, LanguageService } from '@shared/language/language.service';
import { ThemeService } from '@shared/theme/theme.service';

const LANGUAGE_OPTIONS: SegmentOption[] = [
  { value: 'vi', label: 'VI' },
  { value: 'en', label: 'EN' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-splash-tools',
  imports: [Button, Icon, Segments, CoreModule],
  templateUrl: './splash-tools.component.html',
  host: { 'data-testid': 'splash-tools-host' },
})
export class SplashTools {
  private readonly languageService = inject(LanguageService);
  private readonly themes = inject(ThemeService);
  private readonly settings = inject(SettingsService);

  readonly language = this.languageService.language;
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly themeIcon = computed(() => (this.themes.theme() === 'dark' ? 'sun' : 'moon'));
  readonly themeToggleKey = computed(() =>
    this.themes.theme() === 'dark' ? 'theme.toLight' : 'theme.toDark',
  );

  changeLanguage(value: string): void {
    if (isLanguage(value)) {
      this.settings.setLanguage(value);
    }
  }

  toggleTheme(): void {
    this.settings.setTheme(this.themes.theme() === 'dark' ? 'light' : 'dark');
  }
}
