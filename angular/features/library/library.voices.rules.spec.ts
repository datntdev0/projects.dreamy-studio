import { TtsModel } from '@features/settings/backend.models';
import { CloudAccount } from '@features/settings/cloud.models';
import { nameTone } from '@shared/utils/monogram';
import { librarySound, libraryVoice } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

import { LibraryVoice, VoiceEngine } from './library.voices.models';
// prettier-ignore
import { buildVoiceEngines, buildVoiceReference, engineGroupKey, engineIcon, engineName, engineOptionText, engineReady, engineSection, engineSources, engineSupportsSource, filterPresets, filterVoices, findEngine, firstReadyEngine, groupVoiceEngines, hasReadyEngine, isVoiceDraftValid, presetFilterOptions, presetMetaText, presetName, presetSampleSlug, presetSampleUrl, sortVoices, soundOptionText, supportedPreset, supportedVoiceSource, toVoiceInput, voiceById, voiceGenderKey, voiceGenderOptions, voiceLanguageCodes, voiceLanguageKey, voiceLanguageText, voiceMonogram, voiceReferenceName, voiceSourceDetail, voiceSourceKey, voiceSourceNameKey } from './library.voices.rules';

function translate(key: string, params?: Record<string, string | number>): string {
  return params ? `${key}:${JSON.stringify(params)}` : key;
}

const PRESETS: TtsModel['presets'] = [
  { id: 'Hải Đăng', name: 'Hải Đăng', gender: 'male', region: 'north', style: 'natural' },
  { id: 'Mai Anh', name: 'Mai Anh', gender: 'female', region: 'north', style: 'news' },
  { id: 'Odd', name: 'Odd', gender: 'robot', region: 'mars', style: 'beeps' },
];

const model = (
  id: string,
  state: TtsModel['state'],
  overrides: Partial<TtsModel> = {},
): TtsModel => ({
  id,
  name: id.toUpperCase(),
  state,
  receivedBytes: 0,
  totalBytes: 0,
  error: '',
  source: '',
  languages: [],
  cloning: false,
  gpuRecommended: false,
  sources: ['preset', 'clone', 'unknown'],
  presets: PRESETS,
  license: 'Apache-2.0',
  commercialUse: true,
  ...overrides,
});

const account = (
  id: string,
  services: CloudAccount['services'],
  connected: boolean,
): CloudAccount => ({
  id,
  name: id,
  site: '',
  services,
  requiresKey: true,
  connected,
  keyHint: '',
  status: 'none',
  error: '',
  checkedAt: '',
});

describe('library.voices.rules', () => {
  const engines: VoiceEngine[] = buildVoiceEngines(
    [model('a', 'installed'), model('b', 'none', { sources: [], presets: [] })],
    [
      account('c', ['speech'], true),
      account('d', ['image'], true),
      account('e', ['speech'], false),
      account('edge-read-aloud', ['speech'], true),
    ],
  );

  it('builds engines from models and speech accounts', () => {
    expect(engines.map((engine) => [engine.id, engine.kind, engine.ready])).toEqual([
      ['a', 'local', true],
      ['b', 'local', false],
      ['c', 'cloud', true],
      ['e', 'cloud', false],
      ['edge-read-aloud', 'cloud', true],
    ]);
    expect(engines[0].sources).toEqual(['preset', 'clone']);
    expect(engines[0].presets.map((preset) => preset.gender)).toEqual([
      'male',
      'female',
      'neutral',
    ]);
    expect(engines[2].presets).toEqual([]);
    expect(findEngine(engines, 'edge-read-aloud')?.presets.map((preset) => preset.id)).toEqual([
      'vi-VN-HoaiMyNeural',
      'vi-VN-NamMinhNeural',
    ]);
    expect(findEngine(engines, 'c')?.name).toBe('c');
    expect(findEngine(engines, 'zz')).toBeNull();
    expect(engineName(engines, 'a')).toBe('A');
    expect(engineName(engines, 'zz')).toBe('zz');
    expect(engineReady(engines, 'a')).toBe(true);
    expect(engineReady(engines, 'b')).toBe(false);
    expect(engineReady(engines, 'zz')).toBe(false);
    expect(hasReadyEngine(engines)).toBe(true);
    expect(hasReadyEngine([])).toBe(false);
    expect(firstReadyEngine(engines)?.id).toBe('a');
    expect(firstReadyEngine([])).toBeNull();
    expect(engineSection('local')).toBe('backend');
    expect(engineSection('cloud')).toBe('cloud');
    expect(engineIcon('local')).toBe('cpu');
    expect(engineIcon('cloud')).toBe('cloud');
  });

  it('groups engines and labels options', () => {
    const groups = groupVoiceEngines(engines);
    expect(groups.map((group) => [group.kind, group.engines.length])).toEqual([
      ['local', 2],
      ['cloud', 3],
    ]);
    expect(groupVoiceEngines(engines.slice(0, 2)).map((group) => group.kind)).toEqual(['local']);
    expect(engineGroupKey('cloud')).toBe('library.voice.engine.cloud');
    expect(engineGroupKey('local')).toBe('library.voice.engine.local');
    expect(engineOptionText(engines[0], translate)).toBe('A');
    expect(engineOptionText(engines[1], translate)).toContain('notInstalled');
    expect(engineOptionText(engines[3], translate)).toContain('notConnected');
  });

  it('derives the monogram from the first character of the name', () => {
    expect(voiceMonogram('Narrator An')).toBe('NA');
    expect(voiceMonogram('Nguyễn Văn  Bình')).toBe('NB');
    expect(voiceMonogram('  mira ')).toBe('MI');
    expect(voiceMonogram('đức')).toBe('ĐỨ');
    expect(voiceMonogram('A')).toBe('A');
    expect(voiceMonogram('  ')).toBe('?');
    expect(voiceMonogram('')).toBe('?');
  });

  it('derives a stable avatar tone from the name', () => {
    expect(['A', 'B', 'C', 'D'].map(nameTone)).toEqual([0, 1, 2, 3]);
    expect(nameTone('Narrator')).toBe(0);
    expect(nameTone('Mira')).toBe(2);
    expect(nameTone('Wren')).toBe(nameTone('Wren'));
    expect(nameTone('')).toBe(1);
    for (const name of ['Alpha', 'Beta', 'Hải Đăng', 'x'.repeat(200)]) {
      expect(nameTone(name)).toBeGreaterThanOrEqual(0);
      expect(nameTone(name)).toBeLessThan(4);
      expect(Number.isInteger(nameTone(name))).toBe(true);
    }
  });

  it('derives labels', () => {
    expect(voiceLanguageKey('vi')).toBe('library.voice.language.vi');
    expect(voiceLanguageKey('xx')).toBeNull();
    expect(voiceLanguageText('xx', translate)).toBe('xx');
    expect(voiceLanguageText('en', translate)).toBe('library.voice.language.en');
    expect(voiceLanguageCodes('vi')).toHaveLength(6);
    expect(voiceLanguageCodes('xx')).toContain('xx');
    expect(voiceLanguageCodes(null)).toHaveLength(6);
    expect(voiceGenderKey('male')).toBe('library.voice.gender.male');
    expect(voiceSourceKey('clone')).toBe('library.voice.source.clone');
    expect(voiceSourceNameKey('clone')).toBe('library.voice.sourceName.clone');
    expect(voiceGenderOptions(translate).map((option) => option.value)).toEqual([
      'female',
      'male',
      'neutral',
    ]);
    expect(presetName(engines, libraryVoice({ engine: 'a', preset: 'Mai Anh' }))).toBe('Mai Anh');
    expect(presetName(engines, libraryVoice({ engine: 'a', preset: 'custom' }))).toBe('custom');
    expect(presetName(engines, libraryVoice({ engine: 'z', preset: null }))).toBe('—');
    expect(voiceReferenceName(libraryVoice({ referenceName: 'a.mp3' }), translate)).toBe('a.mp3');
    expect(voiceReferenceName(libraryVoice({ referenceName: '' }), translate)).toBe(
      'library.voice.reference.recording',
    );
    const detail = (voice: Partial<LibraryVoice>): string =>
      voiceSourceDetail(libraryVoice(voice), translate, engines);
    expect(detail({ engine: 'a', preset: 'Hải Đăng' })).toBe('Hải Đăng');
    expect(detail({ source: 'design', prompt: 'calm' })).toBe('calm');
    expect(detail({ source: 'design', prompt: '' })).toBe('—');
    expect(detail({ source: 'clone', referenceName: 'a.mp3' })).toBe('a.mp3');
    expect(soundOptionText(librarySound({ name: 'a.mp3', durationMs: 65_000 }))).toBe(
      'a.mp3 · 1:05',
    );
  });

  it('searches, filters and orders newest first', () => {
    const items = [
      libraryVoice({ id: 1, name: 'Beta', createdAt: '2026-01-01', engineKind: 'local' }),
      libraryVoice({
        id: 2,
        name: 'Alpha',
        description: 'Deep tone',
        createdAt: '2026-02-01',
        collectionId: 4,
        tags: ['calm'],
      }),
    ];
    const ids = (filters: Partial<Parameters<typeof filterVoices>[1]>): number[] =>
      filterVoices(items, { query: '', collection: null, tags: [], ...filters }).map(
        (item) => item.id,
      );
    expect(ids({})).toEqual([2, 1]);
    expect(ids({ query: 'DEEP' })).toEqual([2]);
    expect(ids({ query: 'calm' })).toEqual([2]);
    expect(ids({ collection: 4 })).toEqual([2]);
    expect(ids({ collection: 'none' })).toEqual([1]);
    expect(ids({ tags: ['calm'] })).toEqual([2]);
    const tied = [
      libraryVoice({ id: 3, name: 'Zed', createdAt: '2026-01-01' }),
      libraryVoice({ id: 5, name: 'Ann', createdAt: '2026-01-01' }),
      ...items,
    ];
    expect(sortVoices(tied).map((item) => item.id)).toEqual([2, 5, 3, 1]);
    expect(tied.map((item) => item.id)).toEqual([3, 5, 1, 2]);
    expect(voiceById(items, 1)?.name).toBe('Beta');
    expect(voiceById(items, 9)).toBeNull();
  });

  it('validates drafts and builds inputs', () => {
    const ready = engines[0];
    const base = {
      name: ' Mira ',
      engine: ready,
      source: 'preset' as const,
      preset: 'narrator-warm',
      reference: null,
      consent: false,
      prompt: '',
      description: ' Soft ',
    };
    expect(isVoiceDraftValid(base)).toBe(true);
    expect(isVoiceDraftValid({ ...base, name: ' ' })).toBe(false);
    expect(isVoiceDraftValid({ ...base, engine: null })).toBe(false);
    expect(isVoiceDraftValid({ ...base, engine: engines[1] })).toBe(false);
    expect(isVoiceDraftValid({ ...base, preset: '' })).toBe(false);
    const clone = {
      ...base,
      source: 'clone' as const,
      reference: { kind: 'sound' as const, soundId: 3 },
    };
    expect(isVoiceDraftValid(clone)).toBe(false);
    expect(isVoiceDraftValid({ ...clone, consent: true })).toBe(true);
    expect(isVoiceDraftValid({ ...clone, consent: true, reference: null })).toBe(false);
    const design = { ...base, source: 'design' as const, engine: engines[2] };
    expect(isVoiceDraftValid(design)).toBe(false);
    expect(isVoiceDraftValid({ ...design, prompt: 'calm' })).toBe(true);
    expect(isVoiceDraftValid({ ...design, prompt: 'calm', engine: ready })).toBe(false);
    const options = { language: 'vi', gender: 'male' as const };
    expect(toVoiceInput(base, options)).toMatchObject({
      name: 'Mira',
      engine: 'a',
      engineKind: 'local',
      preset: 'narrator-warm',
      reference: null,
      prompt: '',
      description: 'Soft',
    });
    expect(toVoiceInput({ ...clone, consent: true }, options)).toMatchObject({
      preset: null,
      reference: { kind: 'sound', soundId: 3 },
    });
    expect(toVoiceInput({ ...design, prompt: ' calm ', engine: null }, options)).toMatchObject({
      engine: '',
      engineKind: 'local',
      prompt: 'calm',
    });
  });

  it('restricts sources per engine', () => {
    const [local, empty, , , edge] = engines;
    expect(engineSources(edge)).toEqual(['preset']);
    expect(engineSources(local)).toEqual(['preset', 'clone']);
    expect(engineSources(empty)).toEqual(['preset', 'clone', 'design']);
    expect(engineSources(engines[2])).toEqual(['preset', 'clone', 'design']);
    expect(engineSources(null)).toHaveLength(3);
    expect(engineSupportsSource(edge, 'clone')).toBe(false);
    expect(engineSupportsSource(edge, 'preset')).toBe(true);
    expect(supportedVoiceSource(edge, 'design')).toBe('preset');
    expect(supportedVoiceSource(local, 'design')).toBe('preset');
    expect(supportedVoiceSource(local, 'clone')).toBe('clone');
    const draft = {
      name: 'Mira',
      engine: edge,
      source: 'design' as const,
      preset: 'narrator-warm',
      reference: null,
      consent: true,
      prompt: 'calm',
      description: '',
    };
    expect(isVoiceDraftValid(draft)).toBe(false);
    expect(isVoiceDraftValid({ ...draft, source: 'preset' })).toBe(true);
  });

  it('picks presets per engine and describes them', () => {
    const [local, empty] = engines;
    expect(supportedPreset(local, 'Hải Đăng')?.id).toBe('Hải Đăng');
    expect(supportedPreset(local, 'missing')?.id).toBe('Mai Anh');
    expect(supportedPreset(local, '')?.gender).toBe('female');
    expect(supportedPreset({ ...local, presets: [local.presets[0]] }, '')?.id).toBe('Hải Đăng');
    expect(supportedPreset(empty, 'Mai Anh')).toBeNull();
    expect(supportedPreset(null, '')).toBeNull();
    expect(presetMetaText(local.presets[1], translate)).toBe(
      'library.voice.gender.female · library.voice.region.north · library.voice.style.news',
    );
    expect(presetMetaText(local.presets[2], translate)).toBe('library.voice.gender.neutral');
  });

  it('points preset samples at bundled assets named by a plain slug', () => {
    expect(presetSampleSlug('Hải Đăng')).toBe('hai-dang');
    expect(presetSampleSlug('Thiền Tâm Đức')).toBe('thien-tam-duc');
    expect(presetSampleSlug('Ái Hân')).toBe('ai-han');
    expect(presetSampleSlug('young-woman')).toBe('young-woman');
    expect(presetSampleUrl('vieneu-turbo', 'Mỹ Duyên')).toBe(
      'assets/voices/vieneu-turbo/my-duyen.mp3',
    );
  });

  it('filters presets by gender and offers only the genders present', () => {
    const [local] = engines;
    const presets = local.presets.slice(0, 2);
    expect(filterPresets(presets, 'all')).toHaveLength(2);
    expect(filterPresets(presets, 'male').map((preset) => preset.id)).toEqual(['Hải Đăng']);
    expect(presetFilterOptions(presets, translate).map((option) => option.value)).toEqual([
      'all',
      'female',
      'male',
    ]);
  });

  it('builds references from the selected way of providing audio', () => {
    const file = { path: 'C:/a.wav', name: 'a.wav', size: 10 };
    const recording = { data: 'AAAA', mime: 'audio/webm', durationMs: 7000 };
    const sources = { mode: 'library' as const, soundId: 3, file, recording };
    expect(buildVoiceReference(sources)).toEqual({ kind: 'sound', soundId: 3 });
    expect(buildVoiceReference({ ...sources, soundId: null })).toBeNull();
    expect(buildVoiceReference({ ...sources, mode: 'upload' })).toEqual({
      kind: 'file',
      path: 'C:/a.wav',
      name: 'a.wav',
    });
    expect(buildVoiceReference({ ...sources, mode: 'upload', file: null })).toBeNull();
    expect(buildVoiceReference({ ...sources, mode: 'record' })).toEqual({
      kind: 'recording',
      ...recording,
    });
    expect(buildVoiceReference({ ...sources, mode: 'record', recording: null })).toBeNull();
  });
});
