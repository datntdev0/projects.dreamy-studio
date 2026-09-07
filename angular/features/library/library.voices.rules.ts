import { SegmentOption } from '@components/segments';
import { TtsModel, TtsVoicePreset } from '@features/settings/backend.models';
import { CloudAccount } from '@features/settings/cloud.models';
import { SettingsSectionId } from '@features/settings/settings.models';
import { LanguageKey, LanguageParams } from '@shared/language/language.models';
import { nameWords } from '@shared/utils/monogram';

import { CollectionFilter } from './library.models';
import { durationText, hasAllTags, matchesCollection, matchesNameOrTags } from './library.rules';
import { LibrarySound } from './library.sounds.models';
import {
  LibraryVoice,
  VOICE_ENGINE_KINDS,
  VOICE_GENDERS,
  VOICE_LANGUAGES,
  VOICE_SOURCES,
  VoiceEngine,
  VoiceEngineGroup,
  VoiceEngineKind,
  VoiceGender,
  VoiceInput,
  VoicePreset,
  VoicePresetFilter,
  VoiceReference,
  VoiceReferenceFile,
  VoiceReferenceMode,
  VoiceSource,
} from './library.voices.models';
import { VoiceRecording } from './library.voices.recorder';

export interface VoiceFilters {
  query: string;
  collection: CollectionFilter;
  tags: string[];
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

const CLOUD_ENGINE_SOURCES = new Map<string, VoiceSource[]>([['edge-read-aloud', ['preset']]]);
const CLOUD_ENGINE_PRESETS = new Map<string, VoicePreset[]>([
  [
    'edge-read-aloud',
    [
      {
        id: 'vi-VN-HoaiMyNeural',
        name: 'Hoài My',
        gender: 'female',
        region: 'north',
        style: 'natural',
      },
      {
        id: 'vi-VN-NamMinhNeural',
        name: 'Nam Minh',
        gender: 'male',
        region: 'north',
        style: 'natural',
      },
    ],
  ],
]);
const DEFAULT_GENDER: VoiceGender = 'female';
const PRESET_SAMPLES_DIR = 'assets/voices';

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

const REGION_KEYS: Record<string, LanguageKey> = {
  north: 'library.voice.region.north',
  central: 'library.voice.region.central',
  south: 'library.voice.region.south',
};

const STYLE_KEYS: Record<string, LanguageKey> = {
  natural: 'library.voice.style.natural',
  storytelling: 'library.voice.style.storytelling',
  news: 'library.voice.style.news',
  reading: 'library.voice.style.reading',
};

const ENGINE_SECTIONS: Record<VoiceEngineKind, SettingsSectionId> = {
  local: 'backend',
  cloud: 'cloud',
};

function compareNew(a: LibraryVoice, b: LibraryVoice): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
}

function hasVoiceId(id: number, voice: LibraryVoice): boolean {
  return voice.id === id;
}

function matchesQuery(needle: string, voice: LibraryVoice): boolean {
  return matchesNameOrTags(needle, voice) || voice.description.toLocaleLowerCase().includes(needle);
}

function isLocalReady(model: TtsModel): boolean {
  return model.state === 'installed';
}

function isVoiceSource(value: string): value is VoiceSource {
  return (VOICE_SOURCES as string[]).includes(value);
}

function isVoiceGender(value: string): value is VoiceGender {
  return (VOICE_GENDERS as string[]).includes(value);
}

function toVoicePreset(preset: TtsVoicePreset): VoicePreset {
  return {
    id: preset.id,
    name: preset.name,
    gender: isVoiceGender(preset.gender) ? preset.gender : 'neutral',
    region: preset.region,
    style: preset.style,
  };
}

function toLocalEngine(model: TtsModel): VoiceEngine {
  return {
    id: model.id,
    name: model.name,
    kind: 'local',
    ready: isLocalReady(model),
    sources: (model.sources ?? []).filter(isVoiceSource),
    presets: (model.presets ?? []).map(toVoicePreset),
  };
}

function hasSpeech(account: CloudAccount): boolean {
  return account.services.includes('speech');
}

function toCloudEngine(account: CloudAccount): VoiceEngine {
  return {
    id: account.id,
    name: account.name,
    kind: 'cloud',
    ready: account.connected,
    sources: CLOUD_ENGINE_SOURCES.get(account.id) ?? VOICE_SOURCES,
    presets: CLOUD_ENGINE_PRESETS.get(account.id) ?? [],
  };
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

function hasGender(gender: VoiceGender, preset: VoicePreset): boolean {
  return preset.gender === gender;
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
  const words = nameWords(name);
  if (words.length === 0) return '?';
  const first = words[0];
  const last = words[words.length - 1];
  const letters = words.length > 1 ? [first[0], last[0]] : first.slice(0, 2);
  return letters.join('').toLocaleUpperCase();
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

export function sortVoices(items: LibraryVoice[]): LibraryVoice[] {
  return [...items].sort(compareNew);
}

export function filterVoices(items: LibraryVoice[], filters: VoiceFilters): LibraryVoice[] {
  return sortVoices(
    searchVoices(items, filters.query)
      .filter(matchesCollection.bind(null, filters.collection))
      .filter(hasAllTags.bind(null, filters.tags)),
  );
}

export function buildVoiceReference(sources: VoiceReferenceSources): VoiceReference | null {
  const { file, mode, recording, soundId } = sources;
  if (mode === 'library') return soundId === null ? null : { kind: 'sound', soundId };
  if (mode === 'upload') return file && { kind: 'file', path: file.path, name: file.name };
  return recording && { kind: 'recording', ...recording };
}

export function engineSources(engine: VoiceEngine | null): VoiceSource[] {
  return engine?.sources.length ? engine.sources : VOICE_SOURCES;
}

export function engineSupportsSource(engine: VoiceEngine | null, source: VoiceSource): boolean {
  return engineSources(engine).includes(source);
}

export function supportedVoiceSource(engine: VoiceEngine | null, source: VoiceSource): VoiceSource {
  return engineSupportsSource(engine, source) ? source : engineSources(engine)[0];
}

export function supportedPreset(engine: VoiceEngine | null, presetId: string): VoicePreset | null {
  const presets = engine?.presets ?? [];
  return (
    presets.find(hasPresetId.bind(null, presetId)) ??
    presets.find(hasGender.bind(null, DEFAULT_GENDER)) ??
    presets[0] ??
    null
  );
}

export function voiceRegionKey(region: string): LanguageKey | null {
  return REGION_KEYS[region] ?? null;
}

export function voiceStyleKey(style: string): LanguageKey | null {
  return STYLE_KEYS[style] ?? null;
}

export function presetMetaText(preset: VoicePreset, translate: VoiceTranslate): string {
  const region = voiceRegionKey(preset.region);
  const style = voiceStyleKey(preset.style);
  const parts = [translate(voiceGenderKey(preset.gender))];
  if (region) parts.push(translate(region));
  if (style) parts.push(translate(style));
  return parts.join(' · ');
}

export function presetSampleSlug(presetId: string): string {
  return presetId
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function presetSampleUrl(engineId: string, presetId: string): string {
  return `${PRESET_SAMPLES_DIR}/${engineId}/${presetSampleSlug(presetId)}.mp3`;
}

export function filterPresets(presets: VoicePreset[], filter: VoicePresetFilter): VoicePreset[] {
  return filter === 'all' ? presets : presets.filter(hasGender.bind(null, filter));
}

export function presetFilterOptions(
  presets: VoicePreset[],
  translate: VoiceTranslate,
): SegmentOption[] {
  const genders = VOICE_GENDERS.filter(presetsHaveGender.bind(null, presets));
  return [
    { value: 'all', label: translate('library.voice.dialog.presetFilter.all') },
    ...genders.map(toGenderOption.bind(null, translate)),
  ];
}

function presetsHaveGender(presets: VoicePreset[], gender: VoiceGender): boolean {
  return presets.some(hasGender.bind(null, gender));
}

export function isVoiceDraftValid(draft: VoiceDraft): boolean {
  if (!draft.name.trim() || !draft.engine?.ready) return false;
  if (!engineSupportsSource(draft.engine, draft.source)) return false;
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

export function voiceSourceDetail(
  voice: LibraryVoice,
  translate: VoiceTranslate,
  engines: VoiceEngine[],
): string {
  if (voice.source === 'preset') return presetName(engines, voice);
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

export function presetName(engines: VoiceEngine[], voice: LibraryVoice): string {
  const presets = findEngine(engines, voice.engine)?.presets ?? [];
  return presets.find(hasPresetId.bind(null, voice.preset))?.name ?? voice.preset ?? '—';
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
