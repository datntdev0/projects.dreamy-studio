import { EnvironmentProviders, inject, provideAppInitializer } from "@angular/core";
import { I18nService } from "./i18n.service";

export function provideI18n(): EnvironmentProviders {
  return provideAppInitializer(initI18n);
}

function initI18n(): void {
  inject(I18nService).init();
}
