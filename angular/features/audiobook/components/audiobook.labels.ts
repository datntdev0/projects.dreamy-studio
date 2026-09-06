import { inject, Injectable } from '@angular/core';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { ScriptingLabels } from '../../scripting/components/scripting.labels';
// prettier-ignore
import { AudiobookContext, Blocker, RailRow, SegmentDisplayState, SegmentRow, UnitSummary } from '../audiobook.models';
import { AudiobookService } from '../audiobook.service';

export const STATE_BADGES: Record<SegmentDisplayState, string> = {
  none: 'badge',
  queued: 'badge',
  generating: 'badge badge-running',
  done: 'badge badge-success',
  stale: 'badge badge-warning',
  flag: 'badge badge-danger',
};

export function stateKey(state: SegmentDisplayState): LanguageKey {
  return `audiobook.state.${state}`;
}

@Injectable({ providedIn: 'root' })
export class AudiobookLabels {
  private readonly languageService = inject(LanguageService);
  private readonly scripting = inject(ScriptingLabels);
  private readonly audiobook = inject(AudiobookService);

  readonly pad = this.scripting.pad.bind(this.scripting);
  readonly duration = this.scripting.duration.bind(this.scripting);

  unit(ctx: AudiobookContext): string {
    return this.scripting.unit(ctx.config);
  }

  unitLower(ctx: AudiobookContext): string {
    return this.scripting.unitLower(ctx.config);
  }

  unitNumber(ctx: AudiobookContext, no: number): string {
    return this.scripting.unitNumber(ctx.config, no);
  }

  unitTitle(ctx: AudiobookContext, no: number, title: string): string {
    return this.scripting.unitTitle(ctx.config, no, title);
  }

  speakerName(row: SegmentRow): string {
    if (row.speaker) {
      return this.scripting.speakerName(row.speaker);
    }
    return this.languageService.translate(
      row.block.type === 'dialogue'
        ? 'scripting.editor.block.who.none'
        : 'audiobook.editor.seg.noNarrator',
    );
  }

  voiceName(row: SegmentRow): string {
    if (!row.voice) {
      return this.languageService.translate('audiobook.editor.seg.noVoice');
    }
    return row.speed === 1 ? row.voice.name : `${row.voice.name} · ${row.speed}×`;
  }

  blocker(blocker: Blocker): string {
    return this.audiobook.messageText(blocker.message);
  }

  railMeta(row: RailRow): string {
    const translate = this.languageService.translate.bind(this.languageService);
    if (row.stat.meta) {
      return translate(`audiobook.unit.${row.stat.state}`);
    }
    return row.stat.total
      ? translate('audiobook.editor.rail.meta', {
          done: row.stat.done,
          total: row.stat.total,
          time: this.duration(row.stat.dur),
        })
      : translate('audiobook.editor.rail.none');
  }

  listenMeta(summary: UnitSummary): string {
    return this.languageService.translate('audiobook.editor.listen.meta', {
      generated: summary.generated,
      segments: summary.segments,
      time: this.duration(summary.duration),
    });
  }
}
