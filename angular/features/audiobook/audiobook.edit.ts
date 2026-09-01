import {
  Audiobook,
  AudioRecord,
  LexAddResult,
  LexField,
  LexKind,
  MixField,
  UnitAudio,
} from './audiobook.models';
import { clampMix, clampSpeed, nextLexId, speakerVoiceOf, unitAudioOf } from './audiobook.rules';

export const DEFAULT_FLAG_NOTE = 'Needs re-listening';

function withUnit(book: Audiobook, unitId: string, unit: UnitAudio): Audiobook {
  return { ...book, units: { ...book.units, [unitId]: unit } };
}

export function setSpeakerVoice(
  book: Audiobook,
  speakerId: string,
  voice: number | null,
): Audiobook {
  const current = speakerVoiceOf(book, speakerId);
  return { ...book, voices: { ...book.voices, [speakerId]: { ...current, voice } } };
}

export function setSpeakerSpeed(book: Audiobook, speakerId: string, speed: number): Audiobook {
  const current = speakerVoiceOf(book, speakerId);
  return {
    ...book,
    voices: { ...book.voices, [speakerId]: { ...current, speed: clampSpeed(speed) } },
  };
}

export function removeSpeakerVoice(book: Audiobook, speakerId: string): Audiobook {
  if (!(speakerId in book.voices)) {
    return book;
  }
  const voices = { ...book.voices };
  delete voices[speakerId];
  return { ...book, voices };
}

export function addLexRule(
  book: Audiobook,
  term: string,
  say: string,
  kind: LexKind,
): { book: Audiobook; result: LexAddResult } {
  const cleanTerm = term.trim();
  const cleanSay = say.trim();
  if (!cleanTerm || !cleanSay) {
    return { book, result: 'empty' };
  }
  const rule = { id: nextLexId(book.lex), term: cleanTerm, say: cleanSay, kind };
  return { book: { ...book, lex: [...book.lex, rule] }, result: 'added' };
}

export function editLexRule(
  book: Audiobook,
  id: string,
  field: LexField,
  value: string,
): Audiobook {
  const clean = value.trim();
  const target = book.lex.find((rule) => rule.id === id);
  if (!target || !clean || target[field] === clean) {
    return book;
  }
  const lex = book.lex.map((rule) => (rule.id === id ? { ...rule, [field]: clean } : rule));
  return { ...book, lex };
}

export function removeLexRule(book: Audiobook, id: string): Audiobook {
  if (!book.lex.some((rule) => rule.id === id)) {
    return book;
  }
  return { ...book, lex: book.lex.filter((rule) => rule.id !== id) };
}

export function setSymbol(book: Audiobook, id: string, on: boolean): Audiobook {
  const target = book.symbols.find((symbol) => symbol.id === id);
  if (!target || target.on === on) {
    return book;
  }
  return {
    ...book,
    symbols: book.symbols.map((item) => (item.id === id ? { ...item, on } : item)),
  };
}

export function setMix(book: Audiobook, unitId: string, field: MixField, value: number): Audiobook {
  const unit = unitAudioOf(book, unitId);
  const mix = { ...unit.mix, [field]: clampMix(field, value) };
  return withUnit(book, unitId, { ...unit, mix });
}

export function putRecord(
  book: Audiobook,
  unitId: string,
  blockId: string,
  record: AudioRecord,
): Audiobook {
  const unit = unitAudioOf(book, unitId);
  return withUnit(book, unitId, { ...unit, audio: { ...unit.audio, [blockId]: record } });
}

export function flagRecord(
  book: Audiobook,
  unitId: string,
  blockId: string,
  note: string,
): Audiobook {
  const record = unitAudioOf(book, unitId).audio[blockId];
  if (!record) {
    return book;
  }
  return putRecord(book, unitId, blockId, { ...record, flag: note.trim() || DEFAULT_FLAG_NOTE });
}

export function clearRecordFlag(book: Audiobook, unitId: string, blockId: string): Audiobook {
  const record = unitAudioOf(book, unitId).audio[blockId];
  if (!record || !record.flag) {
    return book;
  }
  return putRecord(book, unitId, blockId, { ...record, flag: '' });
}
