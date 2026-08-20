import { EnvironmentProviders, inject, provideAppInitializer } from "@angular/core";
import { LanguageService } from "./language.service";

export function provideLanguage(): EnvironmentProviders {
  return provideAppInitializer(initLanguage);
}

function initLanguage(): void {
  inject(LanguageService).init();
}
