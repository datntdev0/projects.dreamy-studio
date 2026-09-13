import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { provideSettings } from './features/settings/settings.provider';
import { provideTabsRefresh } from './layout/tabs.refresh';
import { routes } from './root.routes';
import { provideLanguage } from './shared/language/language.provider';
import { provideTheme } from './shared/theme/theme.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideLanguage(),
    provideTheme(),
    provideSettings(),
    provideTabsRefresh(),
    provideRouter(routes),
  ],
};
