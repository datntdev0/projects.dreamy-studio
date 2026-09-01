import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { SettingsService } from '@features/settings/settings.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { formatIsoMinute } from '../library.rules';
import { LibraryVoice, VoicePatch } from '../library.voices.models';
// prettier-ignore
import { engineSection, voiceById, voiceDurationText, voiceGenderKey, voiceLanguageText, voiceSourceDetail, voiceSourceNameKey } from '../library.voices.rules';
import { LibraryVoiceService } from '../library.voices.service';
import { LibraryVoiceAvatar } from './voice-avatar.component';
import { LibraryVoiceEngine } from './voice-engine.component';
import { LibraryVoicePlay } from './voice-play.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-voice-panel',
  imports: [Icon, CoreModule, LibraryVoiceAvatar, LibraryVoiceEngine, LibraryVoicePlay],
  templateUrl: './voice.panel.html',
  host: { 'data-testid': 'library-voice-panel' },
})
export class LibraryVoicePanel {
  readonly voiceId = input<number | undefined>();
  readonly voices = inject(LibraryVoiceService);
  private readonly settings = inject(SettingsService);
  private readonly confirms = inject(LibraryConfirmService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly translate = this.languageService.translate.bind(this.languageService);
  readonly voice = computed(this.resolveVoice.bind(this));

  ready(voice: LibraryVoice): boolean {
    return this.voices.isReady(voice);
  }

  engineName(voice: LibraryVoice): string {
    return this.voices.engineName(voice);
  }

  duration(voice: LibraryVoice): string {
    return voiceDurationText(voice) || '—';
  }

  notReadyHint(): string {
    return this.translate('library.voice.engine.notReady');
  }

  languageText(voice: LibraryVoice): string {
    return voiceLanguageText(voice.language, this.translate);
  }

  genderKey(voice: LibraryVoice): LanguageKey {
    return voiceGenderKey(voice.gender);
  }

  sourceName(voice: LibraryVoice): LanguageKey {
    return voiceSourceNameKey(voice.source);
  }

  sourceDetail(voice: LibraryVoice): string {
    return voiceSourceDetail(voice, this.translate);
  }

  createdAt(voice: LibraryVoice): string {
    return formatIsoMinute(voice.createdAt);
  }

  updatedAt(voice: LibraryVoice): string {
    return formatIsoMinute(voice.updatedAt);
  }

  sampleChange(voice: LibraryVoice, event: Event): void {
    void this.save(voice, { sampleText: fieldValue(event) });
  }

  descriptionChange(voice: LibraryVoice, event: Event): void {
    void this.save(voice, { description: fieldValue(event) });
  }

  openSettings(voice: LibraryVoice): void {
    this.settings.openDialog(engineSection(voice.engineKind));
  }

  async duplicate(voice: LibraryVoice): Promise<void> {
    try {
      await this.voices.duplicate(voice.id);
      this.toasts.show(this.translate('library.voice.toast.duplicated'));
    } catch {
      this.notifyFailure();
    }
  }

  remove(voice: LibraryVoice): void {
    this.confirms.deleteVoices([voice.id]);
  }

  private async save(voice: LibraryVoice, patch: VoicePatch): Promise<void> {
    try {
      await this.voices.update(voice.id, patch);
      this.toasts.show(this.translate('library.voice.toast.updated'));
    } catch {
      this.notifyFailure();
    }
  }

  private notifyFailure(): void {
    this.toasts.show(this.translate('library.voice.toast.failed'), 'danger');
  }

  private resolveVoice(): LibraryVoice | null {
    const id = this.voiceId();
    return id === undefined ? this.voices.selected() : voiceById(this.voices.items(), id);
  }
}
