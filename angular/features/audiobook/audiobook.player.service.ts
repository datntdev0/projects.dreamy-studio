import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { silenceWav } from '@shared/audio/wav';
import { WavPlayer } from '@shared/audio/wav-player';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { LanguageService } from '@shared/language/language.service';

import { previewRequestOf } from './audiobook.generate';
import { AudiobookContext, PlayerState, PlayItem, PreviewResult } from './audiobook.models';
// prettier-ignore
import { advancedPlayer, chapterQueue, currentItem, elapsedSeconds, idlePlayer, isSingleItem, itemPercent, measuredPlayer, overallPercent, previewItem, segmentItem, startPlayer, timedPlayer, toggledPlayer, totalSeconds } from './audiobook.playback';
import { unitAudioOf } from './audiobook.rules';
import { AudiobookService } from './audiobook.service';

const MILLISECONDS = 1000;

export type AudiobookAudioOutput = Pick<WavPlayer, 'play' | 'pause' | 'resume' | 'stop'>;

export const AUDIOBOOK_AUDIO = new InjectionToken<AudiobookAudioOutput>('AUDIOBOOK_AUDIO', {
  providedIn: 'root',
  factory: (): AudiobookAudioOutput => new WavPlayer(),
});

function unitTitleOf(ctx: AudiobookContext): string {
  const unit = ctx.unit;
  return unit ? unit.title || `${ctx.unitKind} ${unit.no}` : '';
}

@Injectable({ providedIn: 'root' })
export class AudiobookPlayerService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly audiobook = inject(AudiobookService);
  private readonly output = inject(AUDIOBOOK_AUDIO);
  private readonly languageService = inject(LanguageService);
  private token = 0;

  readonly state = signal<PlayerState>(idlePlayer());
  readonly preparingSpeaker = signal<string | null>(null);
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
      void this.playCurrent(this.begin([item]));
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
    void this.playCurrent(this.begin(queue));
    return true;
  }

  async preview(projectId: number, speakerId: string): Promise<PreviewResult> {
    const ctx = this.audiobook.contextOf(projectId);
    const row = ctx?.speakers.find((item) => item.member.id === speakerId);
    if (!ctx || !row || !row.voice || !row.canPreview) {
      return 'unavailable';
    }
    const unitId = ctx.unit ? ctx.unit.id : '';
    const token = this.begin([previewItem(projectId, unitId, row.member.name, row.voice.name, 0)]);
    this.preparingSpeaker.set(speakerId);
    try {
      const data = await this.ipc.invoke<ArrayBuffer>('audiobook_voice_preview', {
        projectId,
        ...previewRequestOf(row.voice, row.speed),
      });
      this.clearPreparing(token);
      if (token === this.token) {
        await this.playData(token, data);
      }
      return 'started';
    } catch {
      this.clearPreparing(token);
      this.halt(token);
      return 'failed';
    }
  }

  isPreparing(speakerId: string): boolean {
    return this.preparingSpeaker() === speakerId;
  }

  toggle(): void {
    const state = this.state();
    if (state.queue.length === 0) {
      return;
    }
    if (state.on) {
      this.output.pause();
    } else {
      void this.output.resume().catch(this.halt.bind(this, this.token));
    }
    this.state.set(toggledPlayer(state));
  }

  stop(): void {
    this.token += 1;
    this.preparingSpeaker.set(null);
    this.output.stop();
    this.state.set(idlePlayer());
  }

  private clearPreparing(token: number): void {
    if (token === this.token) {
      this.preparingSpeaker.set(null);
    }
  }

  private begin(queue: PlayItem[]): number {
    this.stop();
    this.state.set(startPlayer(queue));
    return this.token;
  }

  private async playCurrent(token: number): Promise<void> {
    const item = this.current();
    if (!item) {
      return;
    }
    try {
      const data = await this.dataOf(item);
      if (token === this.token) {
        await this.playData(token, data);
      }
    } catch {
      this.halt(token);
    }
  }

  private dataOf(item: PlayItem): Promise<ArrayBuffer> {
    if (item.kind === 'segment') {
      return this.ipc.invoke<ArrayBuffer>('audiobook_segment_audio', {
        projectId: item.projectId,
        unitId: item.unitId,
        blockId: item.id,
      });
    }
    return Promise.resolve(silenceWav(item.dur));
  }

  private async playData(token: number, data: ArrayBuffer): Promise<void> {
    const ended = this.next.bind(this, token);
    const progress = this.track.bind(this, token);
    const ms = await this.output.play(data, ended, progress);
    if (token !== this.token) {
      return;
    }
    this.state.set(measuredPlayer(this.state(), ms / MILLISECONDS));
    if (!this.state().on) {
      this.output.pause();
    }
  }

  private track(token: number, seconds: number): void {
    if (token === this.token) {
      this.state.set(timedPlayer(this.state(), seconds));
    }
  }

  private next(token: number): void {
    if (token !== this.token) {
      return;
    }
    const next = advancedPlayer(this.state());
    this.state.set(next);
    if (next.queue.length === 0) {
      this.stop();
    } else {
      void this.playCurrent(token);
    }
  }

  private halt(token: number): void {
    if (token === this.token) {
      this.stop();
    }
  }
}
