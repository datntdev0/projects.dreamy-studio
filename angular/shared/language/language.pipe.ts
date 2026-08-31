import { inject, Pipe, PipeTransform } from '@angular/core';

import { LanguageKey, LanguageParams } from './language.models';
import { LanguageService } from './language.service';

@Pipe({ name: 't', pure: false })
export class LanguagePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(key: LanguageKey, params?: LanguageParams): string {
    return this.languageService.translate(key, params);
  }
}
