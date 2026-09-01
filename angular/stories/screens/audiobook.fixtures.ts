import { Audiobook, AudioEnv, MetaState } from '@features/audiobook/audiobook.models';
import {
  emptyBook,
  emptyUnitAudio,
  estimateDuration,
  voicedBlocks,
  voicingOf,
} from '@features/audiobook/audiobook.rules';
import { LibraryVoice } from '@features/library/library.voices.models';
import { castFor } from '@features/scripting/scripting.context';
import { Script, ScriptBlock, ScriptUnit } from '@features/scripting/scripting.models';
import { CloudAccount } from '@features/settings/cloud.models';
import { DEFAULT_CLOUD_ACCOUNTS } from '@features/settings/cloud.providers';

import { libraryVoiceFixtures } from './library-management.mocks';
import { MOCK_KB, seedScripts } from './scripting.fixtures';

export const AUDIOBOOK_NARRATOR_VOICE = 1;

export const AUDIOBOOK_CLOUD_ACCOUNTS: CloudAccount[] = DEFAULT_CLOUD_ACCOUNTS.map((account) =>
  account.id === 'elevenlabs' ? { ...account, connected: true, status: 'ok' } : account,
);

export const AUDIOBOOK_PROJECTS = [1, 4, 5];

const WREN = 'E1';
const MARO = 'E3';
const SEVRIN = 'E5';
const TEA_WOMAN_ID = 'E16';
const NARRATOR = 'narr';
const FIRST_AT = '2026-11-07T22:05:00Z';
const SECOND_AT = '2026-11-08T21:30:00Z';
const THIRD_AT = '2026-11-06T20:12:00Z';
const SHORTS_AT = '2026-11-04T19:40:00Z';
const OUTDATED_SPEED_STEP = 0.05;
const OUTDATED_MARKER = 'Sevrin';

interface FillOptions {
  skip?: (block: ScriptBlock) => boolean;
  outdated?: (block: ScriptBlock) => boolean;
  at: string;
}

export function audiobookVoices(): LibraryVoice[] {
  return libraryVoiceFixtures().map((voice) =>
    voice.id === AUDIOBOOK_NARRATOR_VOICE ? narratorVoice(voice) : voice,
  );
}

function narratorVoice(voice: LibraryVoice): LibraryVoice {
  return { ...voice, name: 'Warm narrator', engine: 'elevenlabs', engineKind: 'cloud' };
}

export function audiobookEnvOf(script: Script, book: Audiobook): AudioEnv {
  return { book, cast: castFor(script, MOCK_KB), voices: audiobookVoices() };
}

function fillUnit(book: Audiobook, env: AudioEnv, unit: ScriptUnit, options: FillOptions): void {
  const audio = { ...emptyUnitAudio() };
  book.units[unit.id] = audio;
  for (const block of voicedBlocks(unit)) {
    if (options.skip?.(block)) {
      continue;
    }
    const { speaker, voice, speed } = voicingOf(env, block);
    const text = block.text;
    audio.audio[block.id] = {
      text,
      speaker: speaker ? speaker.id : null,
      voice: voice ? voice.id : null,
      speed: options.outdated?.(block) ? speed - OUTDATED_SPEED_STEP : speed,
      paren: block.paren,
      dur: estimateDuration(text, speed),
      at: options.at,
      flag: '',
    };
  }
}

function fillMetas(book: Audiobook, script: Script, states: Record<number, MetaState>): void {
  for (const unit of script.units) {
    if (!unit.blocks) {
      const audio = { ...emptyUnitAudio() };
      audio.meta = states[unit.no] ?? 'none';
      book.units[unit.id] = audio;
    }
  }
}

function mentionsSevrin(block: ScriptBlock): boolean {
  return block.text.includes(OUTDATED_MARKER);
}

function isTeaWoman(block: ScriptBlock): boolean {
  return block.who === TEA_WOMAN_ID;
}

function harrowmereBook(script: Script): Audiobook {
  const book = emptyBook();
  book.voices = {
    [NARRATOR]: { voice: AUDIOBOOK_NARRATOR_VOICE, speed: 0.95 },
    [WREN]: { voice: AUDIOBOOK_NARRATOR_VOICE, speed: 1 },
    [MARO]: { voice: AUDIOBOOK_NARRATOR_VOICE, speed: 1.05 },
    [SEVRIN]: { voice: AUDIOBOOK_NARRATOR_VOICE, speed: 0.9 },
  };
  const env = audiobookEnvOf(script, book);
  const [first, second, third] = script.units;
  fillUnit(book, env, first, { at: FIRST_AT });
  fillUnit(book, env, second, {
    skip: (block) => isTeaWoman(block) || block.ref === '2.5',
    outdated: mentionsSevrin,
    at: SECOND_AT,
  });
  fillUnit(book, env, third, { at: THIRD_AT });
  fillMetas(book, script, { 4: 'done', 5: 'stale', 6: 'done', 7: 'done', 8: 'done', 9: 'done' });
  return book;
}

function trialBook(script: Script): Audiobook {
  const book = emptyBook();
  book.voices = { [NARRATOR]: { voice: AUDIOBOOK_NARRATOR_VOICE, speed: 1 } };
  fillMetas(book, script, { 1: 'done', 2: 'done', 3: 'done' });
  return book;
}

function shortsBook(script: Script): Audiobook {
  const book = emptyBook();
  book.voices = { [NARRATOR]: { voice: AUDIOBOOK_NARRATOR_VOICE, speed: 0.95 } };
  const env = audiobookEnvOf(script, book);
  for (const unit of script.units) {
    fillUnit(book, env, unit, { at: SHORTS_AT });
  }
  return book;
}

export function seedAudiobooks(
  scripts: Record<number, Script> = seedScripts(),
): Record<number, Audiobook> {
  return {
    1: harrowmereBook(scripts[1]),
    4: trialBook(scripts[4]),
    5: shortsBook(scripts[5]),
  };
}
