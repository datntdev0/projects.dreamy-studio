import { LibraryImage } from '@features/library/library.images.models';
// prettier-ignore
import { AssetRights, KindCounts, LibraryCollection, LibraryKind, LibrarySummary, LibraryTag } from '@features/library/library.models';
import { LibraryPrompt, PromptKind } from '@features/library/library.prompts.models';
import { LibrarySound } from '@features/library/library.sounds.models';
import { LibraryVideo } from '@features/library/library.videos.models';
import { LibraryVoice, VoiceInput, VoiceReference } from '@features/library/library.voices.models';
import type { Decorator } from '@storybook/angular-vite';

import { baseHandlers, IpcHandlers, withScreen } from './screen.mocks';

const PEAK_RATE = 12;
const OVERVIEW_BARS = 48;
const KIB = 1024;
const MIB = 1024 * KIB;

export interface LibraryScenario {
  empty?: boolean;
}

interface LibraryData {
  collections: LibraryCollection[];
  images: LibraryImage[];
  sounds: LibrarySound[];
  videos: LibraryVideo[];
  prompts: LibraryPrompt[];
  voices: LibraryVoice[];
}

interface AssetBase {
  rights: AssetRights;
  origin: string;
  collectionId: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function stamp(day: number): string {
  return `2026-11-${String(day).padStart(2, '0')}T09:00:00Z`;
}

function base(
  day: number,
  collectionId: number | null,
  tags: string[],
  rights: AssetRights = 'own',
): AssetBase {
  return {
    rights,
    origin: 'upload',
    collectionId,
    tags,
    createdAt: stamp(day),
    updatedAt: stamp(day),
  };
}

function emptyCounts(): KindCounts {
  return { image: 0, sound: 0, video: 0, prompt: 0 };
}

function gradient(hue: number, width: number, height: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},45%,22%)'/><stop offset='0.6' stop-color='hsl(${hue + 40},60%,48%)'/><stop offset='1' stop-color='hsl(${hue + 80},70%,68%)'/></linearGradient></defs><rect width='${width}' height='${height}' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function wave(id: number, count: number, scale: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const level =
      0.5 + 0.35 * Math.sin(index / (3 + id)) + 0.15 * Math.sin(index * (0.7 + id / 10));
    values.push(Math.max(8, Math.min(255, Math.round(level * scale))));
  }
  return values;
}

function encodePeaks(id: number, durationMs: number): string {
  const count = Math.round((durationMs / 1000) * PEAK_RATE);
  return btoa(String.fromCharCode(...wave(id, count, 255)));
}

function image(
  id: number,
  name: string,
  width: number,
  height: number,
  collectionId: number | null,
  tags: string[],
  size: number,
): LibraryImage {
  return { id, name, ext: 'png', size, width, height, ...base(id, collectionId, tags) };
}

function sound(
  id: number,
  name: string,
  durationMs: number,
  collectionId: number | null,
  tags: string[],
  size: number,
): LibrarySound {
  return {
    id,
    name,
    ext: 'wav',
    size,
    durationMs,
    sampleRate: 44100,
    channels: 2,
    overview: wave(id, OVERVIEW_BARS, 255),
    ...base(id, collectionId, tags, 'licensed'),
  };
}

function video(
  id: number,
  name: string,
  durationMs: number,
  collectionId: number | null,
  tags: string[],
  size: number,
): LibraryVideo {
  return {
    id,
    name,
    ext: 'mp4',
    size,
    durationMs,
    width: 1920,
    height: 1080,
    fps: 30,
    hasPoster: true,
    ...base(id, collectionId, tags, 'free'),
  };
}

function prompt(
  id: number,
  name: string,
  kind: PromptKind,
  text: string,
  collectionId: number | null,
  tags: string[],
): LibraryPrompt {
  return { id, name, kind, text, size: text.length, ...base(id, collectionId, tags) };
}

const SAMPLE_TEXT = 'The lamp keeper climbed the stairs as the tide rolled in beneath the harbor.';
const SAMPLE_DURATION_MS = 4_200;

function voice(id: number, fields: Partial<LibraryVoice>): LibraryVoice {
  return {
    id,
    name: '',
    description: '',
    engine: 'vieneu-turbo',
    engineKind: 'local',
    source: 'preset',
    language: 'vi',
    gender: 'female',
    preset: 'narrator-warm',
    referenceSoundId: null,
    referenceName: '',
    prompt: '',
    sampleText: SAMPLE_TEXT,
    sampleDurationMs: SAMPLE_DURATION_MS,
    createdAt: stamp(id),
    updatedAt: stamp(id),
    ...fields,
  };
}

export function libraryVoiceFixtures(): LibraryVoice[] {
  return [
    voice(1, { name: 'Narrator An', description: 'Warm default narration voice.' }),
    voice(2, {
      name: 'Old Captain',
      description: 'Gruff harbor captain cloned from the harbor ambience recording.',
      gender: 'male',
      source: 'clone',
      preset: null,
      referenceSoundId: 1,
      referenceName: 'harbor-ambience.wav',
    }),
    voice(3, {
      name: 'Lantern Keeper',
      engine: 'omnivoice',
      language: 'en',
      gender: 'neutral',
      source: 'design',
      preset: null,
      prompt: 'A quiet, weathered voice that sounds like it has told the same story for decades.',
      sampleDurationMs: 5_600,
    }),
    voice(4, {
      name: 'Mira',
      engine: 'edge-read-aloud',
      engineKind: 'cloud',
      language: 'en',
      preset: 'narrator-bright',
      sampleDurationMs: 3_100,
    }),
    voice(5, {
      name: 'Storyteller Bao',
      description: 'Deep storyteller for fireside chapters.',
      engine: 'vieneu-nano',
      gender: 'male',
      source: 'clone',
      preset: null,
      referenceName: 'storyteller-reference.wav',
      sampleDurationMs: 6_400,
    }),
    voice(6, {
      name: 'Harbor Chorus',
      engine: 'elevenlabs',
      engineKind: 'cloud',
      language: 'multi',
      gender: 'neutral',
      source: 'design',
      preset: null,
      prompt: 'A layered crowd of dockworkers murmuring in several languages.',
      sampleDurationMs: null,
    }),
  ];
}

function libraryData(): LibraryData {
  return {
    collections: [],
    images: [
      image(1, 'lantern-tower.png', 1600, 2000, 1, ['lantern', 'harbor'], 3 * MIB),
      image(2, 'foggy-quay.png', 2400, 1350, 1, ['fog', 'harbor'], 2 * MIB),
      image(3, 'clerk-portrait.png', 1200, 1200, 1, ['portrait'], 1 * MIB),
      image(4, 'sunken-pier.png', 2400, 1350, 3, ['harbor', 'dark'], 4 * MIB),
      image(5, 'tide-ledger.png', 1200, 1800, null, ['tide'], 900 * KIB),
      image(6, 'storm-sky.png', 2400, 1350, null, ['dark', 'fog'], 2 * MIB),
    ],
    sounds: [
      sound(1, 'harbor-ambience.wav', 62_000, 2, ['harbor', 'fog'], 11 * MIB),
      sound(2, 'lantern-hum.wav', 28_000, 2, ['lantern'], 5 * MIB),
      sound(3, 'bell-toll.wav', 9_000, null, ['dark'], 2 * MIB),
      sound(4, 'tide-loop.wav', 45_000, null, ['tide'], 8 * MIB),
    ],
    videos: [
      video(1, 'lantern-opening.mp4', 18_000, 3, ['lantern'], 48 * MIB),
      video(2, 'quay-timelapse.mp4', 32_000, 3, ['harbor', 'fog'], 96 * MIB),
      video(3, 'tide-rising.mp4', 12_000, null, ['tide'], 30 * MIB),
    ],
    voices: libraryVoiceFixtures(),
    prompts: [
      prompt(
        1,
        'Lantern keeper portrait',
        'image',
        'A weathered lamp keeper in a long coat, standing in a stone tower at dusk, warm lantern light, volumetric fog, painterly, muted palette.',
        1,
        ['lantern', 'portrait'],
      ),
      prompt(
        2,
        'Harbor at low tide',
        'image',
        'Wide shot of a drowned quay at low tide, rusted chains, pale morning mist, cinematic composition.',
        3,
        ['harbor', 'tide'],
      ),
      prompt(
        3,
        'Opening narration',
        'voice',
        'Slow, formal narration. Low register, slight breath before each sentence. Archaic rhythm.',
        null,
        ['dark'],
      ),
      prompt(
        4,
        'Lantern flicker',
        'video',
        'Close-up of a lantern flame guttering in the wind, shallow depth of field, 24 fps.',
        null,
        ['lantern'],
      ),
    ],
  };
}

function tallyKinds(counts: KindCounts, kind: LibraryKind): KindCounts {
  return { ...counts, [kind]: counts[kind] + 1 };
}

function assetsOf(
  data: LibraryData,
): Array<{ kind: LibraryKind; collectionId: number | null; tags: string[] }> {
  const rows: Array<{ kind: LibraryKind; collectionId: number | null; tags: string[] }> = [];
  for (const item of data.images) {
    rows.push({ kind: 'image', collectionId: item.collectionId, tags: item.tags });
  }
  for (const item of data.sounds) {
    rows.push({ kind: 'sound', collectionId: item.collectionId, tags: item.tags });
  }
  for (const item of data.videos) {
    rows.push({ kind: 'video', collectionId: item.collectionId, tags: item.tags });
  }
  for (const item of data.prompts) {
    rows.push({ kind: 'prompt', collectionId: item.collectionId, tags: item.tags });
  }
  return rows;
}

function collectionsOf(data: LibraryData): LibraryCollection[] {
  const names: Array<[number, string, string]> = [
    [1, 'Harrowmere Covers', 'Key art and portraits for the Harrowmere novel.'],
    [2, 'Harbor Ambience', 'Looping audio beds for harbor scenes.'],
    [3, 'Lantern Scenes', 'Stills, clips and prompts for the lantern tower sequence.'],
  ];
  return names.map(([id, name, description]) => {
    let counts = emptyCounts();
    for (const asset of assetsOf(data)) {
      counts = asset.collectionId === id ? tallyKinds(counts, asset.kind) : counts;
    }
    return { id, name, description, createdAt: stamp(id), updatedAt: stamp(id), counts };
  });
}

function tagsOf(data: LibraryData): LibraryTag[] {
  const tags = new Map<string, LibraryTag>();
  for (const asset of assetsOf(data)) {
    for (const name of asset.tags) {
      const entry = tags.get(name) ?? { tag: name, counts: emptyCounts() };
      entry.counts = tallyKinds(entry.counts, asset.kind);
      tags.set(name, entry);
    }
  }
  return [...tags.values()];
}

function summaryOf(data: LibraryData): LibrarySummary {
  let assets = emptyCounts();
  let unfiled = emptyCounts();
  for (const asset of assetsOf(data)) {
    assets = tallyKinds(assets, asset.kind);
    unfiled = asset.collectionId === null ? tallyKinds(unfiled, asset.kind) : unfiled;
  }
  return { assets, unfiled };
}

function seed(scenario: LibraryScenario): LibraryData {
  if (scenario.empty) {
    return { collections: [], images: [], sounds: [], videos: [], prompts: [], voices: [] };
  }
  const data = libraryData();
  data.collections = collectionsOf(data);
  return data;
}

function hasSoundId(id: number, item: LibrarySound): boolean {
  return item.id === id;
}

function referenceNameOf(data: LibraryData, reference: VoiceReference | null): string {
  if (reference?.kind === 'sound') {
    return data.sounds.find(hasSoundId.bind(null, reference.soundId))?.name ?? '';
  }
  return reference?.kind === 'file' ? reference.name : '';
}

function createVoice(data: LibraryData, input: VoiceInput): LibraryVoice {
  const id = data.voices.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
  const { reference, ...fields } = input;
  const created = voice(id, {
    ...fields,
    referenceSoundId: reference?.kind === 'sound' ? reference.soundId : null,
    referenceName: referenceNameOf(data, reference),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  data.voices = [created, ...data.voices];
  return created;
}

function updateVoice(data: LibraryData, id: number, patch: Partial<LibraryVoice>): LibraryVoice {
  const current = data.voices.find((item) => item.id === id) as LibraryVoice;
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  data.voices = data.voices.map((item) => (item.id === id ? updated : item));
  return updated;
}

function deleteVoices(data: LibraryData, ids: number[]): number {
  const before = data.voices.length;
  data.voices = data.voices.filter((item) => !ids.includes(item.id));
  return before - data.voices.length;
}

function libraryHandlers(scenario: LibraryScenario): IpcHandlers {
  const data = seed(scenario);
  return {
    ...baseHandlers(),
    library_collection_list: () => data.collections,
    library_tag_list: () => tagsOf(data),
    library_summary: () => summaryOf(data),
    library_image_list: () => data.images,
    library_image_thumb: (args) => thumbOf(data, Number(args['id'])),
    library_sound_list: () => data.sounds,
    library_sound_peaks: (args) =>
      encodePeaks(
        Number(args['id']),
        data.sounds.find((item) => item.id === Number(args['id']))?.durationMs ?? 0,
      ),
    library_video_list: () => data.videos,
    library_video_poster: (args) => gradient(Number(args['id']) * 70, 320, 180),
    library_prompt_list: () => data.prompts,
    library_voice_list: () => data.voices,
    library_voice_create: (args) => createVoice(data, args['input'] as VoiceInput),
    library_voice_update: (args) =>
      updateVoice(data, Number(args['id']), args['patch'] as Partial<LibraryVoice>),
    library_voice_delete: (args) => deleteVoices(data, args['ids'] as number[]),
    library_voice_preview: () => null,
  };
}

function thumbOf(data: LibraryData, id: number): string {
  const item = data.images.find((entry) => entry.id === id);
  return gradient(
    id * 55,
    Math.round((item?.width ?? 400) / 5),
    Math.round((item?.height ?? 400) / 5),
  );
}

export function withLibrary(scenario: LibraryScenario = {}): { decorators: Decorator[] } {
  return withScreen(libraryHandlers(scenario));
}
