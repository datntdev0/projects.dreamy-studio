import { SegmentOption } from '@components/segments';
import { TtsModel } from '@features/settings/backend.models';
import { CloudAccount } from '@features/settings/cloud.models';
import { SettingsSectionId } from '@features/settings/settings.models';
import { LanguageKey, LanguageParams } from '@shared/language/language.models';

import { durationText } from './library.rules';
import { LibrarySound } from './library.sounds.models';
import {
  LibraryVoice,
  VOICE_ENGINE_KINDS,
  VOICE_GENDERS,
  VOICE_LANGUAGES,
  VOICE_PRESETS,
  VOICE_SOURCES,
  VoiceEngine,
  VoiceEngineFilter,
  VoiceEngineGroup,
  VoiceEngineKind,
  VoiceGender,
  VoiceInput,
  VoicePreset,
  VoiceReference,
  VoiceReferenceFile,
  VoiceReferenceMode,
  VoiceSort,
  VoiceSource,
} from './library.voices.models';
import { VoiceRecording } from './library.voices.recorder';

export interface VoiceFilters {
  query: string;
  sort: VoiceSort;
  engine: VoiceEngineFilter;
}

export interface VoiceReferenceSources {
  mode: VoiceReferenceMode;
  soundId: number | null;
  file: VoiceReferenceFile | null;
  recording: VoiceRecording | null;
}

export interface VoiceDraft {
  name: string;
  engine: VoiceEngine | null;
  source: VoiceSource;
  preset: string;
  reference: VoiceReference | null;
  consent: boolean;
  prompt: string;
  description: string;
}

const ENGINE_SOURCES = new Map<string, VoiceSource[]>([['edge-read-aloud', ['preset']]]);

const HUE_STEP = 137;
const MONOGRAM_LENGTH = 2;

const LANGUAGE_KEYS: Record<(typeof VOICE_LANGUAGES)[number], LanguageKey> = {
  vi: 'library.voice.language.vi',
  en: 'library.voice.language.en',
  ja: 'library.voice.language.ja',
  zh: 'library.voice.language.zh',
  ko: 'library.voice.language.ko',
  multi: 'library.voice.language.multi',
};

const GENDER_KEYS: Record<VoiceGender, LanguageKey> = {
  female: 'library.voice.gender.female',
  male: 'library.voice.gender.male',
  neutral: 'library.voice.gender.neutral',
};

const SOURCE_KEYS: Record<VoiceSource, LanguageKey> = {
  preset: 'library.voice.source.preset',
  clone: 'library.voice.source.clone',
  design: 'library.voice.source.design',
};

const SOURCE_NAME_KEYS: Record<VoiceSource, LanguageKey> = {
  preset: 'library.voice.sourceName.preset',
  clone: 'library.voice.sourceName.clone',
  design: 'library.voice.sourceName.design',
};

const ENGINE_SECTIONS: Record<VoiceEngineKind, SettingsSectionId> = {
  local: 'backend',
  cloud: 'cloud',
};

function firstLetter(word: string): string {
  return word.charAt(0);
}

function compareNew(a: LibraryVoice, b: LibraryVoice): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
}

function compareName(a: LibraryVoice, b: LibraryVoice): number {
  return a.name.localeCompare(b.name) || a.id - b.id;
}

function hasVoiceId(id: number, voice: LibraryVoice): boolean {
  return voice.id === id;
}

function matchesQuery(needle: string, voice: LibraryVoice): boolean {
  return (
    voice.name.toLocaleLowerCase().includes(needle) ||
    voice.description.toLocaleLowerCase().includes(needle)
  );
}

function matchesEngine(filter: VoiceEngineFilter, voice: LibraryVoice): boolean {
  return filter === 'all' || voice.engineKind === filter;
}

function isLocalReady(model: TtsModel): boolean {
  return model.state === 'installed';
}

function toLocalEngine(model: TtsModel): VoiceEngine {
  return { id: model.id, name: model.name, kind: 'local', ready: isLocalReady(model) };
}

function hasSpeech(account: CloudAccount): boolean {
  return account.services.includes('speech');
}

function toCloudEngine(account: CloudAccount): VoiceEngine {
  return { id: account.id, name: account.name, kind: 'cloud', ready: account.connected };
}

function hasEngineId(id: string, engine: VoiceEngine): boolean {
  return engine.id === id;
}

function isReady(engine: VoiceEngine): boolean {
  return engine.ready;
}

function toEngineGroup(engines: VoiceEngine[], kind: VoiceEngineKind): VoiceEngineGroup {
  return { kind, engines: enginesOfKind(engines, kind) };
}

function hasPresetId(id: string | null, preset: VoicePreset): boolean {
  return preset.id === id;
}

function toGenderOption(translate: VoiceTranslate, gender: VoiceGender): SegmentOption {
  return { value: gender, label: translate(voiceGenderKey(gender)) };
}

function hasEngines(group: VoiceEngineGroup): boolean {
  return group.engines.length > 0;
}

function isKind(kind: VoiceEngineKind, engine: VoiceEngine): boolean {
  return engine.kind === kind;
}

export function voiceById(items: LibraryVoice[], id: number): LibraryVoice | null {
  return items.find(hasVoiceId.bind(null, id)) ?? null;
}

export function voiceMonogram(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).map(firstLetter);
  return letters.slice(0, MONOGRAM_LENGTH).join('').toLocaleUpperCase() || '?';
}

export function voiceHue(id: number): number {
  return Math.abs(id * HUE_STEP) % 360;
}

export function voiceLanguageKey(language: string): LanguageKey | null {
  return LANGUAGE_KEYS[language as keyof typeof LANGUAGE_KEYS] ?? null;
}

export function voiceGenderKey(gender: VoiceGender): LanguageKey {
  return GENDER_KEYS[gender];
}

export function voiceSourceKey(source: VoiceSource): LanguageKey {
  return SOURCE_KEYS[source];
}

export function voiceSourceNameKey(source: VoiceSource): LanguageKey {
  return SOURCE_NAME_KEYS[source];
}

export function voiceDateText(value: string): string {
  return value.slice(0, 10);
}

export function voiceDurationText(voice: LibraryVoice): string {
  return voice.sampleDurationMs === null ? '' : durationText(voice.sampleDurationMs);
}

export function buildVoiceEngines(models: TtsModel[], accounts: CloudAccount[]): VoiceEngine[] {
  return [...models.map(toLocalEngine), ...accounts.filter(hasSpeech).map(toCloudEngine)];
}

export function findEngine(engines: VoiceEngine[], id: string): VoiceEngine | null {
  return engines.find(hasEngineId.bind(null, id)) ?? null;
}

export function engineName(engines: VoiceEngine[], id: string): string {
  return findEngine(engines, id)?.name ?? id;
}

export function engineReady(engines: VoiceEngine[], id: string): boolean {
  return findEngine(engines, id)?.ready ?? false;
}

export function hasReadyEngine(engines: VoiceEngine[]): boolean {
  return engines.some(isReady);
}

export function enginesOfKind(engines: VoiceEngine[], kind: VoiceEngineKind): VoiceEngine[] {
  return engines.filter(isKind.bind(null, kind));
}

export function engineSection(kind: VoiceEngineKind): SettingsSectionId {
  return ENGINE_SECTIONS[kind];
}

export function engineIcon(kind: VoiceEngineKind): 'cpu' | 'cloud' {
  return kind === 'cloud' ? 'cloud' : 'cpu';
}

export function searchVoices(items: LibraryVoice[], query: string): LibraryVoice[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(matchesQuery.bind(null, needle));
}

export function sortVoices(items: LibraryVoice[], sort: VoiceSort): LibraryVoice[] {
  return [...items].sort(sort === 'name' ? compareName : compareNew);
}

export function filterVoices(items: LibraryVoice[], filters: VoiceFilters): LibraryVoice[] {
  return sortVoices(
    searchVoices(items, filters.query).filter(matchesEngine.bind(null, filters.engine)),
    filters.sort,
  );
}

export function buildVoiceReference(sources: VoiceReferenceSources): VoiceReference | null {
  const { file, mode, recording, soundId } = sources;
  if (mode === 'library') return soundId === null ? null : { kind: 'sound', soundId };
  if (mode === 'upload') return file && { kind: 'file', path: file.path, name: file.name };
  return recording && { kind: 'recording', ...recording };
}

export function engineSources(engineId: string | null): VoiceSource[] {
  return ENGINE_SOURCES.get(engineId ?? '') ?? VOICE_SOURCES;
}

export function engineSupportsSource(engineId: string | null, source: VoiceSource): boolean {
  return engineSources(engineId).includes(source);
}

export function supportedVoiceSource(engineId: string | null, source: VoiceSource): VoiceSource {
  return engineSupportsSource(engineId, source) ? source : engineSources(engineId)[0];
}

export function isVoiceDraftValid(draft: VoiceDraft): boolean {
  if (!draft.name.trim() || !draft.engine?.ready) return false;
  if (!engineSupportsSource(draft.engine.id, draft.source)) return false;
  if (draft.source === 'preset') return draft.preset !== '';
  if (draft.source === 'clone') return draft.reference !== null && draft.consent;
  return draft.prompt.trim() !== '';
}

export function toVoiceInput(
  draft: VoiceDraft,
  options: Pick<VoiceInput, 'language' | 'gender'>,
): VoiceInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    engine: draft.engine?.id ?? '',
    engineKind: draft.engine?.kind ?? 'local',
    source: draft.source,
    language: options.language,
    gender: options.gender,
    preset: draft.source === 'preset' ? draft.preset : null,
    reference: draft.source === 'clone' ? draft.reference : null,
    prompt: draft.source === 'design' ? draft.prompt.trim() : '',
  };
}

export type VoiceTranslate = (key: LanguageKey, params?: LanguageParams) => string;

export function voiceLanguageText(language: string, translate: VoiceTranslate): string {
  const key = voiceLanguageKey(language);
  return key ? translate(key) : language;
}

export function voiceReferenceName(voice: LibraryVoice, translate: VoiceTranslate): string {
  return voice.referenceName || translate('library.voice.reference.recording');
}

export function voiceSourceDetail(voice: LibraryVoice, translate: VoiceTranslate): string {
  if (voice.source === 'preset') return presetName(voice.preset);
  if (voice.source === 'design') return voice.prompt || '—';
  return voiceReferenceName(voice, translate);
}

export function groupVoiceEngines(engines: VoiceEngine[]): VoiceEngineGroup[] {
  return VOICE_ENGINE_KINDS.map(toEngineGroup.bind(null, engines)).filter(hasEngines);
}

export function engineGroupKey(kind: VoiceEngineKind): LanguageKey {
  return kind === 'cloud' ? 'library.voice.engine.cloud' : 'library.voice.engine.local';
}

export function engineOptionText(engine: VoiceEngine, translate: VoiceTranslate): string {
  if (engine.ready) return engine.name;
  const key =
    engine.kind === 'cloud'
      ? 'library.voice.engine.notConnected'
      : 'library.voice.engine.notInstalled';
  return translate(key, { name: engine.name });
}

export function voiceLanguageCodes(current: string | null): string[] {
  const codes: string[] = [...VOICE_LANGUAGES];
  return current === null || codes.includes(current) ? codes : [...codes, current];
}

export function presetName(id: string | null): string {
  return VOICE_PRESETS.find(hasPresetId.bind(null, id))?.name ?? id ?? '—';
}

export function voiceGenderOptions(translate: VoiceTranslate): SegmentOption[] {
  return VOICE_GENDERS.map(toGenderOption.bind(null, translate));
}

export function firstReadyEngine(engines: VoiceEngine[]): VoiceEngine | null {
  return engines.find(isReady) ?? null;
}

export function soundOptionText(sound: LibrarySound): string {
  return `${sound.name} · ${durationText(sound.durationMs)}`;
}
