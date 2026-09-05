import { inject, Injectable } from '@angular/core';
import { durationText } from '@features/library/library.rules';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { CastMember, RailRow, ScriptConfig } from '../scripting.models';
import { pad2 } from '../scripting.rules';

const MILLISECONDS = 1000;

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

@Injectable({ providedIn: 'root' })
export class ScriptingLabels {
  private readonly languageService = inject(LanguageService);

  unit(config: ScriptConfig): string {
    return this.languageService.translate(`scripting.editor.unit.${config.unit}` as LanguageKey);
  }

  unitLower(config: ScriptConfig): string {
    return this.unit(config).toLowerCase();
  }

  unitUpper(config: ScriptConfig): string {
    return this.unit(config).toUpperCase();
  }

  pad(no: number): string {
    return pad2(no);
  }

  unitNumber(config: ScriptConfig, no: number): string {
    return `${this.unitUpper(config)} ${pad2(no)}`;
  }

  unitTitle(config: ScriptConfig, no: number, title: string): string {
    return title || `${this.unit(config)} ${no}`;
  }

  speakerName(member: CastMember | undefined): string {
    if (!member) {
      return this.languageService.translate('scripting.editor.block.who.none');
    }
    return member.kind === 'narrator'
      ? this.languageService.translate('scripting.editor.narrator')
      : member.name;
  }

  chapterLabel(chapters: number[]): string {
    if (chapters.length === 0) {
      return this.languageService.translate('scripting.editor.chapters.none');
    }
    const from = chapters[0];
    const to = chapters[chapters.length - 1];
    return chapters.length > 1
      ? this.languageService.translate('scripting.editor.chapters.range', { from, to })
      : this.languageService.translate('scripting.editor.chapters.one', { from });
  }

  duration(seconds: number): string {
    return durationText(Math.round(seconds) * MILLISECONDS);
  }

  railMeta(row: RailRow, config: ScriptConfig): string {
    const translate = this.languageService.translate.bind(this.languageService);
    if (config.ranges) {
      const chapters = this.chapterLabel(row.chapters);
      if (row.metrics) {
        return translate('scripting.editor.rail.meta.scenes', {
          chapters,
          count: row.metrics.scenes,
        });
      }
      return row.meta
        ? translate('scripting.editor.rail.meta.blocks', { chapters, count: row.meta.blocks })
        : translate('scripting.editor.rail.meta.none', { chapters });
    }
    const counted = row.metrics ?? row.meta;
    return counted
      ? translate('scripting.editor.rail.words', {
          blocks: counted.blocks,
          words: formatCount(counted.words),
        })
      : translate('scripting.editor.rail.words.none');
  }
}
