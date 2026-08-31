import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';

import { ThemeService } from './theme.service';

export function provideTheme(): EnvironmentProviders {
  return provideAppInitializer(initTheme);
}

function initTheme(): void {
  inject(ThemeService).init();
}
