import { inject, Injectable } from '@angular/core';
import { durationText } from '@features/library/library.rules';
import { formatCount, formatStamp } from '@features/novel/novel.rules';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { capitalize } from '../../scripting/scripting.dialogs.rules';
import { CastMember, ScriptConfig, ScriptUnit } from '../../scripting/scripting.models';

export const EMPTY_VALUE = '—';

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

  speakerName(member: CastMember | null): string {
    if (!member) {
      return EMPTY_VALUE;
    }
    return member.kind === 'narrator'
      ? this.language.translate('scripting.inspector.narrator')
      : member.name;
  }

  duration(seconds: number): string {
    return durationText(Math.round(seconds) * 1000);
  }

  stamp(value: string): string {
    return formatStamp(value);
  }

  count(value: number): string {
    return formatCount(value);
  }

  money(value: number): string {
    return `≈ $${value.toFixed(3)}`;
  }
}
