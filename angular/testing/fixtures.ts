import { AssistantSession } from '@features/assistant/assistant.models';
import { LibraryImage } from '@features/library/library.images.models';
import { LibraryCollection } from '@features/library/library.models';
import { LibraryPrompt } from '@features/library/library.prompts.models';
import { LibrarySound } from '@features/library/library.sounds.models';
import { LibraryVideo } from '@features/library/library.videos.models';
import { LibraryVoice } from '@features/library/library.voices.models';
import { ChapterRow, NovelSummary } from '@features/novel/novel.models';
import { PipelineSnapshot, PipelineTask } from '@features/novel/novel.translation.models';
import { ProjectModuleState, ProjectSummary } from '@features/project/project.models';

export function novel(overrides: Partial<NovelSummary> = {}): NovelSummary {
  return {
    id: 1,
    title: 'Title',
    name: '',
    author: 'Author',
    lang: 'EN',
    description: '',
    origin: 'created',
    createdAt: '2026-01-02T03:04:00Z',
    updatedAt: '2026-01-02T03:04:00Z',
    chapterCount: 10,
    wordCount: 1000,
    translatedCount: 4,
    analyzedCount: 2,
    tags: [],
    ...overrides,
  };
}

export function chapter(overrides: Partial<ChapterRow> = {}): ChapterRow {
  return {
    id: 'c1',
    novelId: 1,
    seq: 1,
    title: 'Opening',
    wordCount: 100,
    translationStatus: 'none',
    analysisStatus: 'none',
    createdAt: '2026-01-02T03:04:00Z',
    updatedAt: '2026-01-02T03:04:00Z',
    ...overrides,
  };
}

export function task(overrides: Partial<PipelineTask> = {}): PipelineTask {
  return {
    id: 1,
    chapterId: 'c1',
    passage: null,
    status: 'queued',
    progress: 0,
    error: '',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

export function pipeline(overrides: Partial<PipelineSnapshot> = {}): PipelineSnapshot {
  return {
    id: 1,
    novelId: 1,
    kind: 'translation',
    target: 'VI',
    status: 'running',
    total: 2,
    done: 0,
    failed: 0,
    createdAt: '2026-01-02T03:04:00Z',
    startedAt: '2026-01-02T03:04:10Z',
    finishedAt: null,
    tasks: [],
    ...overrides,
  };
}

export function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 1,
    name: 'Project',
    folder: 'C:/ws/project',
    template: 'audiobook',
    description: '',
    novelId: null,
    novelMissing: false,
    srcKind: null,
    srcLang: null,
    rangeFrom: null,
    rangeTo: null,
    archived: false,
    createdAt: '2026-01-02T03:04:00Z',
    updatedAt: '2026-01-02T03:04:00Z',
    openedAt: '2026-01-02T03:04:00Z',
    ...overrides,
  };
}

export function projectModuleState(
  overrides: Partial<ProjectModuleState> = {},
): ProjectModuleState {
  return { id: 'scripting', state: 'idle', done: 0, total: 0, note: '', ...overrides };
}

export function libraryImage(overrides: Partial<LibraryImage> = {}): LibraryImage {
  return {
    id: 1,
    name: 'pic.png',
    ext: 'png',
    size: 1000,
    width: 100,
    height: 50,
    rights: 'own',
    origin: 'upload',
    collectionId: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function librarySound(overrides: Partial<LibrarySound> = {}): LibrarySound {
  return {
    id: 1,
    name: 'tune.mp3',
    ext: 'mp3',
    size: 2000,
    durationMs: 65_000,
    sampleRate: 44100,
    channels: 2,
    overview: [10, 200, 120],
    rights: 'own',
    origin: 'upload',
    collectionId: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function libraryVoice(overrides: Partial<LibraryVoice> = {}): LibraryVoice {
  return {
    id: 1,
    name: 'Narrator An',
    description: 'Warm narration voice',
    engine: 'vieneu-turbo',
    engineKind: 'local',
    source: 'preset',
    language: 'vi',
    gender: 'female',
    preset: 'Mai Anh',
    referenceKind: null,
    referenceSoundId: null,
    referenceName: '',
    prompt: '',
    sampleText: 'Once upon a time.',
    sampleDurationMs: 3000,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function libraryVideo(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    id: 1,
    name: 'clip.mp4',
    ext: 'mp4',
    size: 3000,
    durationMs: 5000,
    width: 1920,
    height: 1080,
    fps: 29.97,
    rights: 'own',
    origin: 'upload',
    collectionId: null,
    tags: [],
    hasPoster: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function libraryPrompt(overrides: Partial<LibraryPrompt> = {}): LibraryPrompt {
  return {
    id: 1,
    name: 'prompt',
    kind: 'image',
    text: 'Draw {{ subject }} in {{style}}',
    size: 30,
    rights: 'own',
    origin: 'write',
    collectionId: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function libraryCollection(overrides: Partial<LibraryCollection> = {}): LibraryCollection {
  return {
    id: 1,
    name: 'Collection',
    description: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    counts: { image: 1, sound: 0, video: 0, prompt: 0 },
    ...overrides,
  };
}

export function session(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    id: 's1',
    title: 'Session',
    scope: { kind: 'workspace', novelId: null },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    messageCount: 0,
    preview: '',
    editGranted: false,
    messages: [],
    ...overrides,
  };
}
