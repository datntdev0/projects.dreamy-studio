import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from "@angular/core";
import { provideRouter } from "@angular/router";

import { provideI18n } from "./core/i18n/i18n.provider";
import { provideTheme } from "./core/theme/theme.provider";
import { provideSettings } from "./features/settings/settings.provider";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideI18n(),
    provideTheme(),
    provideSettings(),
    provideRouter(routes),
  ],
};
