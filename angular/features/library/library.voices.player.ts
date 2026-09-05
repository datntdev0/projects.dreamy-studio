import { Injectable } from '@angular/core';
import { WavPlayer } from '@shared/audio/wav-player';

@Injectable({ providedIn: 'root' })
export class LibraryVoicePlayer extends WavPlayer {}
