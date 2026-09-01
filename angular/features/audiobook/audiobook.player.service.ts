import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { LanguageService } from '@shared/language/language.service';

import { previewRequestOf } from './audiobook.generate';
import {
  AudiobookContext,
  PlayerState,
  PlayItem,
  PreviewReply,
  PreviewResult,
} from './audiobook.models';
import {
  chapterQueue,
  currentItem,
  elapsedSeconds,
  idlePlayer,
  isSingleItem,
  itemPercent,
  overallPercent,
  PLAYER_TICK_MS,
  previewItem,
  segmentItem,
  startPlayer,
  tickPlayer,
  toggledPlayer,
  totalSeconds,
} from './audiobook.playback';
import { PREVIEW_SECONDS, unitAudioOf } from './audiobook.rules';
import { AudiobookService } from './audiobook.service';

export interface AudiobookClock {
  start(callback: () => void, intervalMs: number): unknown;
  stop(handle: unknown): void;
}

export const AUDIOBOOK_CLOCK = new InjectionToken<AudiobookClock>('AUDIOBOOK_CLOCK', {
  providedIn: 'root',
  factory: (): AudiobookClock => ({
    start: (callback, intervalMs) => setInterval(callback, intervalMs),
    stop: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  }),
});

function unitTitleOf(ctx: AudiobookContext): string {
  const unit = ctx.unit;
  return unit ? unit.title || `${ctx.unitKind} ${unit.no}` : '';
}

@Injectable({ providedIn: 'root' })
export class AudiobookPlayerService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly audiobook = inject(AudiobookService);
  private readonly clock = inject(AUDIOBOOK_CLOCK);
  private readonly languageService = inject(LanguageService);
  private handle: unknown = null;

  readonly state = signal<PlayerState>(idlePlayer());
  readonly current = computed(() => currentItem(this.state()));
  readonly playing = computed(() => this.state().on);
  readonly elapsed = computed(() => elapsedSeconds(this.state()));
  readonly total = computed(() => totalSeconds(this.state().queue));
  readonly percent = computed(() => overallPercent(this.state()));
  readonly itemPercent = computed(() => itemPercent(this.state()));

  isActiveFor(projectId: number): boolean {
    return this.current()?.projectId === projectId;
  }

  isCurrentSegment(blockId: string): boolean {
    const item = this.current();
    return item !== null && item.kind === 'segment' && item.id === blockId;
  }

  titleOf(item: PlayItem): string {
    if (item.kind === 'pause') {
      return this.languageService.translate('audiobook.player.pauses');
    }
    if (item.kind === 'preview') {
      return this.languageService.translate('audiobook.player.preview', {
        speaker: item.title,
        voice: item.voice,
      });
    }
    return item.title;
  }

  playSegment(projectId: number, blockId: string): boolean {
    const ctx = this.audiobook.contextOf(projectId);
    const block = ctx?.unit?.blocks?.find((item) => item.id === blockId);
    if (!ctx || !ctx.unit || !ctx.audio || !block) {
      return false;
    }
    const item = segmentItem(projectId, ctx.unit, unitTitleOf(ctx), block, ctx.audio);
    if (!item) {
      return false;
    }
    if (isSingleItem(this.state(), item.id)) {
      this.toggle();
    } else {
      this.begin([item]);
    }
    return true;
  }

  playChapter(projectId: number): boolean {
    const ctx = this.audiobook.contextOf(projectId);
    if (!ctx || !ctx.unit) {
      return false;
    }
    const audio = unitAudioOf(ctx.book, ctx.unit.id);
    const queue = chapterQueue(projectId, ctx.unit, unitTitleOf(ctx), audio);
    if (queue.length === 0) {
      return false;
    }
    this.begin(queue);
    return true;
  }

  async preview(projectId: number, speakerId: string): Promise<PreviewResult> {
    const ctx = this.audiobook.contextOf(projectId);
    const row = ctx?.speakers.find((item) => item.member.id === speakerId);
    if (!ctx || !row || !row.voice || !row.canPreview) {
      return 'unavailable';
    }
    try {
      const reply = await this.ipc.invoke<PreviewReply | null>('audiobook_voice_preview', {
        projectId,
        ...previewRequestOf(row.voice, row.speed),
      });
      const dur = reply && reply.dur > 0 ? reply.dur : PREVIEW_SECONDS;
      const unitId = ctx.unit ? ctx.unit.id : '';
      this.begin([previewItem(projectId, unitId, row.member.name, row.voice.name, dur)]);
      return 'started';
    } catch {
      return 'failed';
    }
  }

  toggle(): void {
    this.state.set(toggledPlayer(this.state()));
  }

  stop(): void {
    this.release();
    this.state.set(idlePlayer());
  }

  tick(): void {
    const next = tickPlayer(this.state());
    this.state.set(next);
    if (next.queue.length === 0) {
      this.release();
    }
  }

  advance(ticks = 1): void {
    for (let count = 0; count < ticks; count += 1) {
      this.tick();
    }
  }

  private begin(queue: PlayItem[]): void {
    this.release();
    this.state.set(startPlayer(queue));
    this.handle = this.clock.start(this.tick.bind(this), PLAYER_TICK_MS);
  }

  private release(): void {
    if (this.handle !== null) {
      this.clock.stop(this.handle);
      this.handle = null;
    }
  }
}
