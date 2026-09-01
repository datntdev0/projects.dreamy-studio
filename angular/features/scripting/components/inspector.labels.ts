import { inject, Injectable } from '@angular/core';
import { durationText } from '@features/library/library.rules';
import { formatStamp } from '@features/novel/novel.rules';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { CastMember, ScriptConfig, ScriptUnit } from '../scripting.models';
import { chaptersOf } from '../scripting.rules';

@Injectable({ providedIn: 'root' })
export class ScriptingInspectorLabels {
  private readonly language = inject(LanguageService);

  speakerName(member: CastMember | undefined): string {
    if (!member) {
      return this.language.translate('scripting.inspector.unassigned');
    }
    return member.kind === 'narrator'
      ? this.language.translate('scripting.inspector.narrator')
      : member.name;
  }

  unit(config: ScriptConfig): string {
    return this.language.translate(`scripting.unit.${config.unit}` as LanguageKey);
  }

  chapterLabel(unit: ScriptUnit): string {
    const chapters = chaptersOf(unit);
    if (chapters.length === 0) {
      return this.language.translate('scripting.inspector.noChapters');
    }
    const from = chapters[0];
    const to = chapters[chapters.length - 1];
    return chapters.length > 1
      ? this.language.translate('scripting.inspector.chapterRange', { from, to })
      : this.language.translate('scripting.inspector.chapter', { from });
  }

  duration(seconds: number): string {
    return durationText(Math.round(seconds) * 1000);
  }

  stamp(value: string): string {
    return formatStamp(value);
  }
}
