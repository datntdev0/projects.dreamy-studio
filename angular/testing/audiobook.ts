import { TestBed } from '@angular/core/testing';
// prettier-ignore
import { Audiobook, AudioEnv, AudioRecord, VoiceAvailability } from '@features/audiobook/audiobook.models';
// prettier-ignore
import { AUDIOBOOK_AUDIO, AudiobookAudioOutput } from '@features/audiobook/audiobook.player.service';
import { emptyBook } from '@features/audiobook/audiobook.rules';
import { CastMember } from '@features/scripting/scripting.models';
import { BackendService } from '@features/settings/backend.service';
import { CloudService } from '@features/settings/cloud.service';
import { FakeIpc } from '@testing/fake-ipc';
import { libraryVoice } from '@testing/fixtures';
import { installScriptingBackend } from '@testing/scripting-backend';

import { BACKEND_MODELS } from '../stories/features/settings-backend.mocks';
import { AUDIOBOOK_CLOUD_ACCOUNTS } from '../stories/screens/audiobook.fixtures';
import { audiobookHandlers } from '../stories/screens/audiobook.mocks';
import { projectModuleStatesFor } from '../stories/screens/project-management.fixtures';
import { createScriptingState, ScriptingState } from '../stories/screens/scripting.mocks';

export const NARRATOR_CAST: CastMember = { id: 'narr', name: 'Narrator', kind: 'narrator', c: -1 };

export const HERO_CAST: CastMember = { id: 'E1', name: 'Wren', kind: 'kb', c: 0 };

export const EXTRA_CAST: CastMember = { id: 'spk1', name: 'Crier', kind: 'extra', c: 1 };

export function cast(...members: CastMember[]): CastMember[] {
  return members.length > 0 ? members : [NARRATOR_CAST, HERO_CAST];
}

export function audioRecord(overrides: Partial<AudioRecord> = {}): AudioRecord {
  return {
    text: 'Hello world.',
    speaker: 'narr',
    voice: 1,
    speed: 1,
    paren: '',
    dur: 2,
    at: '2026-11-07T22:05:00Z',
    flag: '',
    ...overrides,
  };
}

export function audiobook(overrides: Partial<Audiobook> = {}): Audiobook {
  return { ...emptyBook(), ...overrides };
}

export function availability(overrides: Partial<VoiceAvailability> = {}): VoiceAvailability {
  return {
    engines: [
      {
        id: 'vieneu-turbo',
        name: 'VieNeu Turbo',
        kind: 'local',
        ready: true,
        sources: ['preset', 'clone', 'design'],
        presets: [],
      },
      {
        id: 'vieneu-nano',
        name: 'VieNeu Nano',
        kind: 'local',
        ready: false,
        sources: ['preset', 'clone', 'design'],
        presets: [],
      },
      {
        id: 'edge-read-aloud',
        name: 'Edge Read Aloud',
        kind: 'cloud',
        ready: true,
        sources: ['preset', 'clone', 'design'],
        presets: [],
      },
      {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        kind: 'cloud',
        ready: false,
        sources: ['preset', 'clone', 'design'],
        presets: [],
      },
    ],
    ...overrides,
  };
}

export function envOf(overrides: Partial<AudioEnv> = {}): AudioEnv {
  return {
    book: audiobook({ voices: { narr: { voice: 1, speed: 1 }, E1: { voice: 1, speed: 1 } } }),
    cast: cast(),
    voices: [libraryVoice({ id: 1 })],
    ...overrides,
  };
}

export class FakeAudioOutput implements AudiobookAudioOutput {
  readonly played: ArrayBuffer[] = [];
  ended: (() => void) | null = null;
  progress: ((seconds: number) => void) | null = null;
  paused = false;
  stops = 0;
  durationMs = 2000;
  failure: unknown = null;

  async play(
    data: ArrayBuffer,
    ended: () => void,
    progress?: (seconds: number) => void,
  ): Promise<number> {
    if (this.failure !== null) {
      throw this.failure;
    }
    this.played.push(data);
    this.ended = ended;
    this.progress = progress ?? null;
    this.paused = false;
    return this.durationMs;
  }

  pause(): void {
    this.paused = true;
  }

  async resume(): Promise<void> {
    this.paused = false;
  }

  stop(): void {
    this.stops += 1;
    this.ended = null;
    this.progress = null;
  }

  finish(): void {
    const ended = this.ended;
    this.ended = null;
    ended?.();
  }
}

export interface AudiobookBackend {
  scripting: ScriptingState;
  output: FakeAudioOutput;
}

export function installAudiobookBackend(ipc: FakeIpc): AudiobookBackend {
  const output = new FakeAudioOutput();
  TestBed.configureTestingModule({ providers: [{ provide: AUDIOBOOK_AUDIO, useValue: output }] });
  const scripting = createScriptingState();
  installScriptingBackend(ipc, scripting);
  const handlers = audiobookHandlers(scripting, (args) =>
    projectModuleStatesFor(Number(args['projectId'])),
  );
  for (const [command, handler] of Object.entries(handlers)) {
    ipc.on(command, (args) => handler(args ?? {}));
  }
  return { scripting, output };
}

export function prepareEngines(running = true): BackendService {
  const backend = TestBed.inject(BackendService);
  backend.models.set(BACKEND_MODELS);
  backend.server.update((server) => ({ ...server, status: running ? 'running' : 'stopped' }));
  TestBed.inject(CloudService).accounts.set(AUDIOBOOK_CLOUD_ACCOUNTS);
  return backend;
}
