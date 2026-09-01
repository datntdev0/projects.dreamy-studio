import { Injectable, signal } from '@angular/core';

import { AudiobookDialogRequestFlag, AudiobookDialogRequestGenerate } from './audiobook.models';

export type AudiobookDialogRequest = AudiobookDialogRequestGenerate | AudiobookDialogRequestFlag;

export type AudiobookDialogKind = AudiobookDialogRequest['kind'];

@Injectable({ providedIn: 'root' })
export class AudiobookDialogsService {
  readonly request = signal<AudiobookDialogRequest | null>(null);

  openGenerate(projectId: number): void {
    this.request.set({ kind: 'generate', projectId });
  }

  openFlag(projectId: number, blockId: string): void {
    this.request.set({ kind: 'flag', projectId, blockId });
  }

  close(): void {
    this.request.set(null);
  }

  projectIdOf(kind: AudiobookDialogKind): number | null {
    const request = this.request();
    return request?.kind === kind ? request.projectId : null;
  }

  flagTarget(): AudiobookDialogRequestFlag | null {
    const request = this.request();
    return request?.kind === 'flag' ? request : null;
  }
}
