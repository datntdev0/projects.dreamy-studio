import { TtsModel } from '@features/settings/backend.models';
import { CloudAccount } from '@features/settings/cloud.models';
import { librarySound, libraryVoice } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

import { VoiceEngine } from './library.voices.models';
// prettier-ignore
import { buildVoiceEngines, buildVoiceReference, engineGroupKey, engineIcon, engineName, engineOptionText, engineReady, engineSection, engineSources, engineSupportsSource, filterVoices, findEngine, firstReadyEngine, groupVoiceEngines, hasReadyEngine, isVoiceDraftValid, presetName, soundOptionText, supportedVoiceSource, toVoiceInput, voiceById, voiceDateText, voiceDurationText, voiceGenderKey, voiceGenderOptions, voiceHue, voiceLanguageCodes, voiceLanguageKey, voiceLanguageText, voiceMonogram, voiceReferenceName, voiceSourceDetail, voiceSourceKey, voiceSourceNameKey } from './library.voices.rules';

function translate(key: string, params?: Record<string, string | number>): string {
  return params ? `${key}:${JSON.stringify(params)}` : key;
}

const model = (id: string, state: TtsModel['state']): TtsModel => ({
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
    [model('a', 'installed'), model('b', 'none')],
    [
      account('c', ['speech'], true),
      account('d', ['image'], true),
      account('e', ['speech'], false),
    ],
  );

  it('builds engines from models and speech accounts', () => {
    expect(engines.map((engine) => [engine.id, engine.kind, engine.ready])).toEqual([
      ['a', 'local', true],
      ['b', 'local', false],
      ['c', 'cloud', true],
      ['e', 'cloud', false],
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
      ['cloud', 2],
    ]);
    expect(groupVoiceEngines(engines.slice(0, 2)).map((group) => group.kind)).toEqual(['local']);
    expect(engineGroupKey('cloud')).toBe('library.voice.engine.cloud');
    expect(engineGroupKey('local')).toBe('library.voice.engine.local');
    expect(engineOptionText(engines[0], translate)).toBe('A');
    expect(engineOptionText(engines[1], translate)).toContain('notInstalled');
    expect(engineOptionText(engines[3], translate)).toContain('notConnected');
  });

  it('derives labels, monogram and hue', () => {
    expect(voiceMonogram('Narrator An')).toBe('NA');
    expect(voiceMonogram('mira')).toBe('M');
    expect(voiceMonogram('  ')).toBe('?');
    expect(voiceHue(1)).toBe(voiceHue(1));
    expect(voiceHue(1)).not.toBe(voiceHue(2));
    expect(voiceHue(7)).toBeLessThan(360);
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
    expect(voiceDateText('2026-01-02T03:04:00Z')).toBe('2026-01-02');
    expect(voiceDurationText(libraryVoice({ sampleDurationMs: 65_000 }))).toBe('1:05');
    expect(voiceDurationText(libraryVoice({ sampleDurationMs: null }))).toBe('');
    expect(presetName('narrator-warm')).toBe('Narrator — warm');
    expect(presetName('custom')).toBe('custom');
    expect(presetName(null)).toBe('—');
    expect(voiceReferenceName(libraryVoice({ referenceName: 'a.mp3' }), translate)).toBe('a.mp3');
    expect(voiceReferenceName(libraryVoice({ referenceName: '' }), translate)).toBe(
      'library.voice.reference.recording',
    );
    expect(voiceSourceDetail(libraryVoice({ preset: 'narrator-warm' }), translate)).toBe(
      'Narrator — warm',
    );
    expect(voiceSourceDetail(libraryVoice({ source: 'design', prompt: 'calm' }), translate)).toBe(
      'calm',
    );
    expect(voiceSourceDetail(libraryVoice({ source: 'design', prompt: '' }), translate)).toBe('—');
    expect(
      voiceSourceDetail(libraryVoice({ source: 'clone', referenceName: 'a.mp3' }), translate),
    ).toBe('a.mp3');
    expect(soundOptionText(librarySound({ name: 'a.mp3', durationMs: 65_000 }))).toBe(
      'a.mp3 · 1:05',
    );
  });

  it('searches, filters and sorts', () => {
    const items = [
      libraryVoice({ id: 1, name: 'Beta', createdAt: '2026-01-01', engineKind: 'local' }),
      libraryVoice({
        id: 2,
        name: 'Alpha',
        description: 'Deep tone',
        createdAt: '2026-02-01',
        engineKind: 'cloud',
      }),
    ];
    const ids = (filters: Parameters<typeof filterVoices>[1]): number[] =>
      filterVoices(items, filters).map((item) => item.id);
    expect(ids({ query: '', sort: 'new', engine: 'all' })).toEqual([2, 1]);
    expect(ids({ query: '', sort: 'name', engine: 'all' })).toEqual([2, 1]);
    expect(ids({ query: 'DEEP', sort: 'new', engine: 'all' })).toEqual([2]);
    expect(ids({ query: 'beta', sort: 'new', engine: 'local' })).toEqual([1]);
    expect(ids({ query: '', sort: 'new', engine: 'cloud' })).toEqual([2]);
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
    const design = { ...base, source: 'design' as const };
    expect(isVoiceDraftValid(design)).toBe(false);
    expect(isVoiceDraftValid({ ...design, prompt: 'calm' })).toBe(true);
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
    const edge = { ...engines[2], id: 'edge-read-aloud' };
    expect(engineSources('edge-read-aloud')).toEqual(['preset']);
    expect(engineSources('a')).toEqual(['preset', 'clone', 'design']);
    expect(engineSources(null)).toHaveLength(3);
    expect(engineSupportsSource('edge-read-aloud', 'clone')).toBe(false);
    expect(engineSupportsSource('edge-read-aloud', 'preset')).toBe(true);
    expect(supportedVoiceSource('edge-read-aloud', 'design')).toBe('preset');
    expect(supportedVoiceSource('a', 'design')).toBe('design');
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
