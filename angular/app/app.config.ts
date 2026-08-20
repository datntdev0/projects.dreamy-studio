import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from "@angular/core";
import { provideRouter } from "@angular/router";

import { provideLanguage } from "./core/language/language.provider";
import { provideTheme } from "./core/theme/theme.provider";
import { provideSettings } from "./features/settings/settings.provider";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideLanguage(),
    provideTheme(),
    provideSettings(),
    provideRouter(routes),
  ],
};
