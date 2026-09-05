import { Audiobook, AudioRecord, MixField, MixSettings, UnitAudio } from './audiobook.models';
import { clampMix, clampSpeed, speakerVoiceOf, unitAudioOf } from './audiobook.rules';

export function putUnit(book: Audiobook, unitId: string, unit: UnitAudio): Audiobook {
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

export function setMix(book: Audiobook, unitId: string, field: MixField, value: number): Audiobook {
  const unit = unitAudioOf(book, unitId);
  const mix = { ...unit.mix, [field]: clampMix(field, value) };
  return putUnit(book, unitId, { ...unit, mix });
}

export function putRecord(
  book: Audiobook,
  unitId: string,
  blockId: string,
  record: AudioRecord,
): Audiobook {
  const unit = unitAudioOf(book, unitId);
  return putUnit(book, unitId, { ...unit, audio: { ...unit.audio, [blockId]: record } });
}

export function setRecordFlag(
  book: Audiobook,
  unitId: string,
  blockId: string,
  flag: string,
): Audiobook {
  const record = unitAudioOf(book, unitId).audio[blockId];
  if (!record || record.flag === flag) {
    return book;
  }
  return putRecord(book, unitId, blockId, { ...record, flag });
}

export function putMix(book: Audiobook, unitId: string, mix: MixSettings): Audiobook {
  return putUnit(book, unitId, { ...unitAudioOf(book, unitId), mix });
}
