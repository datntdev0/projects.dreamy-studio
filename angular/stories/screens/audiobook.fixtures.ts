import { Audiobook, AudioEnv, LexRule, MetaState } from '@features/audiobook/audiobook.models';
import {
  emptyBook,
  emptyUnitAudio,
  estimateDuration,
  rulesSignature,
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

export const AUDIOBOOK_LEXICON: LexRule[] = [
  { id: 'L01', term: 'Harrowmere', say: 'HAIR-oh-meer', kind: 'names' },
  { id: 'L02', term: 'Wren', say: 'Ren', kind: 'names' },
  { id: 'L03', term: 'Quill', say: 'Quin', kind: 'names' },
  { id: 'L04', term: 'Sevrin', say: 'SEV-er-in', kind: 'names' },
  { id: 'L05', term: '312', say: 'three hundred twelve', kind: 'number' },
];

const WREN = 'E1';
const MARO = 'E3';
const SEVRIN = 'E5';
const TEA_WOMAN_ID = 'E16';
const NARRATOR = 'narr';
const FIRST_AT = '2026-11-07T22:05:00Z';
const SECOND_AT = '2026-11-08T21:30:00Z';
const THIRD_AT = '2026-11-06T20:12:00Z';
const SHORTS_AT = '2026-11-04T19:40:00Z';

interface FillOptions {
  skip?: (block: ScriptBlock) => boolean;
  lex?: LexRule[];
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
    const { voice, speed } = voicingOf(env, block);
    const text = block.text;
    audio.audio[block.id] = {
      text,
      voice: voice ? voice.id : null,
      speed,
      rules: rulesSignature(options.lex ?? book.lex, block.text),
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

function isTeaWoman(block: ScriptBlock): boolean {
  return block.who === TEA_WOMAN_ID;
}

function without(lex: LexRule[], id: string): LexRule[] {
  return lex.filter((rule) => rule.id !== id);
}

function harrowmereBook(script: Script): Audiobook {
  const book: Audiobook = { ...emptyBook(), lex: AUDIOBOOK_LEXICON.map((rule) => ({ ...rule })) };
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
    lex: without(AUDIOBOOK_LEXICON, 'L04'),
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
  const book: Audiobook = { ...emptyBook(), lex: AUDIOBOOK_LEXICON.map((rule) => ({ ...rule })) };
  book.voices = { [NARRATOR]: { voice: AUDIOBOOK_NARRATOR_VOICE, speed: 0.95 } };
  const env = audiobookEnvOf(script, book);
  for (const unit of script.units) {
    fillUnit(book, env, unit, { at: SHORTS_AT });
  }
  return book;
}

export function seedAudiobooks(
  scripts: Record<number, Script> = seedScripts(false),
): Record<number, Audiobook> {
  return {
    1: harrowmereBook(scripts[1]),
    4: trialBook(scripts[4]),
    5: shortsBook(scripts[5]),
  };
}
