import { inject, Injectable } from '@angular/core';
import { durationText } from '@features/library/library.rules';
import { formatCount } from '@features/novel/novel.rules';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { capitalize } from '../../scripting/scripting.dialogs.rules';
import { ScriptConfig, ScriptUnit } from '../../scripting/scripting.models';

@Injectable({ providedIn: 'root' })
export class AudiobookInspectorLabels {
  private readonly language = inject(LanguageService);

  unit(config: ScriptConfig): string {
    return this.language.translate(`scripting.unit.${config.unit}` as LanguageKey);
  }

  unitTitle(config: ScriptConfig, unit: ScriptUnit): string {
    const title = unit.title ? ` · ${unit.title}` : '';
    return `${capitalize(this.unit(config))} ${unit.no}${title}`;
  }

  duration(seconds: number): string {
    return durationText(Math.round(seconds) * 1000);
  }

  count(value: number): string {
    return formatCount(value);
  }

  money(value: number): string {
    return `≈ $${value.toFixed(3)}`;
  }
}
