import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';

import { SettingsService } from './settings.service';

export function provideSettings(): EnvironmentProviders {
  return provideAppInitializer(initSettings);
}

function initSettings(): Promise<void> {
  return inject(SettingsService).load();
}
