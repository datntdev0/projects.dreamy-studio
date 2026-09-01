import { LanguageKey } from '@shared/language/language.models';

const MODEL_NOTES: Record<string, LanguageKey> = {
  'vieneu-turbo': 'settings.backend.model.note.vieneuTurbo',
  'vieneu-nano': 'settings.backend.model.note.vieneuNano',
  omnivoice: 'settings.backend.model.note.omnivoice',
};

export function modelNoteKey(id: string): LanguageKey | null {
  return MODEL_NOTES[id] ?? null;
}
