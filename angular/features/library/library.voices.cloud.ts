import { inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { ipcErrorMessage } from '@shared/desktop/desktop-ipc-error';
import { LanguageService } from '@shared/language/language.service';

import { CloudVoice, VoicePreset } from './library.voices.models';
import { toCloudVoicePreset } from './library.voices.rules';

export type CloudVoiceSearchState = 'idle' | 'searching' | 'done' | 'error';

const SEARCH_DELAY_MS = 400;

@Injectable({ providedIn: 'root' })
export class LibraryVoiceCloudSearch {
  private readonly ipc = inject(DesktopIpcService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = this.languageService.translate.bind(this.languageService);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;

  readonly results = signal<VoicePreset[]>([]);
  readonly state = signal<CloudVoiceSearchState>('idle');
  readonly error = signal('');

  schedule(engineId: string, query: string): void {
    this.cancel();
    this.state.set('searching');
    this.timer = setTimeout(this.run.bind(this, ++this.token, engineId, query), SEARCH_DELAY_MS);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.token += 1;
  }

  reset(): void {
    this.cancel();
    this.results.set([]);
    this.state.set('idle');
    this.error.set('');
  }

  private async run(token: number, engineId: string, query: string): Promise<void> {
    this.timer = null;
    try {
      const voices = await this.ipc.invoke<CloudVoice[] | undefined>('cloud_voice_search', {
        id: engineId,
        query: query.trim(),
      });
      if (token !== this.token) return;
      this.results.set((voices ?? []).map(toCloudVoicePreset.bind(null, this.translate)));
      this.error.set('');
      this.state.set('done');
    } catch (error) {
      if (token !== this.token) return;
      this.results.set([]);
      this.error.set(
        ipcErrorMessage(error) ?? this.translate('library.voice.dialog.search.failed'),
      );
      this.state.set('error');
    }
  }
}
