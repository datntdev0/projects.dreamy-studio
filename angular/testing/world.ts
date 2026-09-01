import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssistantMessage, AssistantSession } from '@features/assistant/assistant.models';
import { AssistantService } from '@features/assistant/assistant.service';
import { LibraryImageService } from '@features/library/library.images.service';
import { LibraryPromptService } from '@features/library/library.prompts.service';
import { LibraryService } from '@features/library/library.service';
import { LibrarySoundService } from '@features/library/library.sounds.service';
import { LibraryVideoService } from '@features/library/library.videos.service';
import { LibraryVoiceService } from '@features/library/library.voices.service';
import { WireKnowledge } from '@features/novel/novel.knowledge.models';
import { NovelKnowledgeService } from '@features/novel/novel.knowledge.service';
import { ChapterRow, ParagraphRow } from '@features/novel/novel.models';
import { NovelReaderService } from '@features/novel/novel.reader.service';
import { NovelService } from '@features/novel/novel.service';
import { WireTranslation } from '@features/novel/novel.translation.models';
import { NovelTranslationService } from '@features/novel/novel.translation.service';
import { PipelineService } from '@features/pipeline/pipeline.service';
import { ProjectService } from '@features/project/project.service';
import { SettingsService } from '@features/settings/settings.service';
import { LayoutService } from '@layout/layout.service';
import { DialogService } from '@shared/dialog/dialog.service';

import { FakeIpc, provideFakeIpc } from './fake-ipc';
// prettier-ignore
import { chapter, libraryCollection, libraryImage, libraryPrompt, librarySound, libraryVideo, libraryVoice, novel, pipeline, project, projectModuleState, session, task } from './fixtures';
import { entity, fact, ONTOLOGY_VIEW } from './knowledge';

const COUNTS = { image: 2, sound: 1, video: 1, prompt: 1 };

export function worldChapters(novelId = 1): ChapterRow[] {
  return [
    chapter({
      id: 'c1',
      novelId,
      seq: 1,
      title: 'Opening',
      wordCount: 120,
      translationStatus: 'done',
      analysisStatus: 'done',
    }),
    chapter({ id: 'c2', novelId, seq: 2, title: 'Journey', wordCount: 90 }),
    chapter({ id: 'c3', novelId, seq: 3, title: 'Finale', wordCount: 0, analysisStatus: 'stale' }),
  ];
}

export function worldParagraphs(): ParagraphRow[] {
  return [
    { n: 1, text: 'First paragraph of the story.', hashcheck: 'h1' },
    { n: 2, text: 'Second paragraph with a quote.', hashcheck: 'h2' },
    { n: 3, text: 'Third paragraph closes the scene.', hashcheck: 'h3' },
  ];
}

export function worldTranslation(): WireTranslation {
  return {
    guidelines: 'Keep the tone formal.',
    dict: [
      { id: 1, src: 'Hero', dst: 'Anh hung', type: 'name', note: 'main' },
      { id: 2, src: 'Town', dst: 'Thi tran', type: 'place', note: '' },
    ],
    chapters: {
      c1: {
        title: 'Mo dau',
        paragraphs: [
          { n: 1, originalHashcheck: 'h1', text: 'Doan mot.', note: 'n1' },
          { n: 2, originalHashcheck: 'h2', text: 'Doan hai.', note: '' },
        ],
      },
    },
    warnings: [
      { kind: 'source', chapterId: 'c1', n: 2, entryId: null },
      { kind: 'dict', chapterId: 'c1', n: 1, entryId: 1 },
    ],
  };
}

export function worldKnowledge(lang: WireKnowledge['lang'] = 'src'): WireKnowledge {
  return {
    lang,
    ontology: ONTOLOGY_VIEW,
    items: [
      entity('e1', 'character', 'Hero', { aliases: ['Champion'] }),
      entity('e2', 'persona', 'Mask', { titles: ['The Mask'] }),
      entity('e3', 'location', 'Town'),
      entity('e4', 'organization', 'Guild', {
        ev: [{ chapter: 2, p: 1, q: 'quote', verified: false }],
      }),
      fact('f1', 'persona_of', 'e2', 'e1'),
      fact('f2', 'located_in', 'e4', 'e3'),
      fact('f3', 'trait', 'e2', null, { ev: [{ chapter: 1, p: 2, q: 'quote', verified: true }] }),
    ],
    analyzed: {
      1: { at: '2026-01-02T03:04:00Z', entities: 3, facts: 2, stale: false },
      3: { at: '2026-01-02T03:04:00Z', entities: 1, facts: 0, stale: true },
    },
  };
}

export function worldSession(
  id = 's1',
  overrides: Partial<AssistantSession> = {},
): AssistantSession {
  const messages: AssistantMessage[] = [
    {
      id: 'm1',
      role: 'user',
      text: 'Check chapter 1',
      createdAt: '2026-01-02T03:04:00Z',
      activities: [],
      citations: [],
    },
    {
      id: 'm2',
      role: 'assistant',
      text: 'Here is the **review**.',
      createdAt: '2026-01-02T03:05:00Z',
      activities: ['Reading chapter'],
      citations: [{ novelId: 1, chapter: 1, p: 1, quote: 'First' }],
      attachments: [
        {
          kind: 'translation_review',
          chapter: 1,
          chapterTitle: 'Opening',
          target: 'VI',
          checked: 2,
          findings: [
            {
              id: 'tf1',
              n: 1,
              severity: 'error',
              category: 'name',
              source: 'Hero',
              current: 'Anh',
              suggested: 'Anh hung',
              from: 'Anh',
              to: 'Anh hung',
              reason: 'name',
              status: 'pending',
            },
            {
              id: 'tf2',
              n: 2,
              severity: 'info',
              category: 'style',
              source: 'x',
              current: 'y',
              suggested: 'z',
              from: 'y',
              to: 'z',
              reason: '',
              status: 'applied',
            },
          ],
          dictionary: [
            {
              id: 'dp1',
              src: 'Guild',
              dst: 'Hoi',
              type: 'org',
              note: '',
              occurrences: 2,
              status: 'pending',
            },
          ],
        },
        {
          kind: 'knowledge_changes',
          id: 'kc1',
          title: 'Merge duplicates',
          edits: 2,
          validation: { ok: true, resolves: 1, introduces: ['warn'] },
          changes: [
            {
              id: 'ch1',
              op: 'merge',
              target: 'Hero',
              before: 'Hero',
              after: 'Champion',
              reason: 'dup',
              ev: [{ novelId: 1, chapter: 1, p: 1, quote: 'q' }],
            },
            {
              id: 'ch2',
              op: 'add_fact',
              target: 'x',
              before: null,
              after: 'y',
              reason: '',
              ev: [],
            },
          ],
          status: 'pending',
          lang: 'src',
          novelId: 1,
        },
      ],
    },
  ];
  return session({
    id,
    title: 'Review chapter',
    messageCount: 2,
    preview: 'Here is',
    editGranted: true,
    messages,
    scope: { kind: 'novel', novelId: 1 },
    ...overrides,
  });
}

export function installWorld(ipc: FakeIpc): FakeIpc {
  const novels = [
    novel({
      id: 1,
      title: 'Alpha',
      author: 'Ann',
      lang: 'EN',
      tags: ['epic', 'long'],
      chapterCount: 3,
      wordCount: 210,
      translatedCount: 1,
      analyzedCount: 1,
      description: 'A tale.',
    }),
    novel({
      id: 2,
      title: 'Beta',
      name: 'Beta VI',
      lang: 'VI',
      tags: ['epic'],
      chapterCount: 3,
      updatedAt: '2026-02-01T00:00:00Z',
    }),
  ];
  const projects = [
    project({
      id: 1,
      name: 'Audiobook One',
      template: 'audiobook',
      novelId: 1,
      srcKind: 'original',
      srcLang: 'EN',
      rangeFrom: 1,
      rangeTo: 3,
    }),
    project({
      id: 2,
      name: 'Film Two',
      template: 'filmseries',
      archived: true,
      novelId: 9,
      novelMissing: true,
    }),
    project({
      id: 3,
      name: 'Blank',
      template: 'blank',
      srcKind: 'translation',
      novelId: 2,
      srcLang: 'VI',
    }),
  ];
  ipc.fallback = () => null;
  ipc.on('app_info', { name: 'Dreamy Studio', version: '1.2.3' });
  ipc.on('recent_list', [
    {
      path: 'C:/ws/alpha',
      name: 'alpha',
      lastOpenedAt: '2026-01-02T03:04:00Z',
      status: 'ok',
      projectCount: 3,
      isCurrent: true,
    },
    {
      path: 'C:/ws/missing',
      name: 'missing',
      lastOpenedAt: '2026-01-01T03:04:00Z',
      status: 'not_found',
      reason: 'missing',
    },
  ]);
  ipc.on('workspace_current', { name: 'alpha', path: 'C:/ws/alpha' });
  ipc.on('workspace_is_current', false);
  ipc.on('workspace_measure', 2048);
  ipc.on('folder_pick', 'C:/ws/picked');
  ipc.on('workspace_load', { result: 'ready', name: 'alpha', path: 'C:/ws/alpha', mode: 'open' });
  ipc.on('workspace_enter', { result: 'entered', name: 'alpha', path: 'C:/ws/alpha' });
  ipc.on('workspace_cancel', { result: 'cancelled' });
  ipc.on('settings_get', {
    general: { language: 'en', theme: 'dark', pipelines: { maxPipelines: 2, maxTasks: 4 } },
    layout: {},
    dataDir: 'C:/data',
    file: 'C:/data/settings.json',
  });
  ipc.on('settings_general_save', {});
  ipc.on('settings_layout_save', {});
  ipc.on('llm_get', {
    providers: [
      {
        id: 'claude',
        name: 'Claude',
        command: 'claude',
        caps: ['translation', 'knowledge', 'assistant'],
        profileEnv: null,
        profileDir: 'C:/p',
        loginCommand: 'claude login',
        canLogout: true,
        canDetectLogin: true,
        path: '',
        probe: {
          id: 'claude',
          found: true,
          path: 'C:/bin/claude',
          version: '1.0',
          ok: true,
          signedIn: true,
          account: 'me@x',
          error: '',
          latencyMs: 10,
          checkedAtMs: 1_700_000_000_000,
        },
      },
      {
        id: 'codex',
        name: 'Codex',
        command: 'codex',
        caps: ['translation'],
        profileEnv: null,
        profileDir: null,
        loginCommand: 'codex login',
        canLogout: false,
        canDetectLogin: false,
        path: 'C:/custom',
        probe: null,
      },
    ],
    features: [
      { id: 'translation', provider: 'claude', model: 'opus', effort: 'high', args: '' },
      { id: 'knowledge', provider: 'claude', model: 'sonnet', effort: null, args: '' },
      { id: 'assistant', provider: null, model: '', effort: null, args: '' },
    ],
  });
  ipc.on('llm_probe', {
    id: 'claude',
    found: true,
    path: 'C:/bin/claude',
    version: '1.0',
    ok: true,
    signedIn: true,
    account: 'me@x',
    error: '',
    latencyMs: 10,
    checkedAtMs: 1_700_000_000_000,
  });
  ipc.on('backend_status', {
    server: {
      status: 'running',
      port: 52814,
      version: '0.1.0',
      pythonVersion: '3.12',
      startedAt: '2026-01-01T00:00:00Z',
      latencyMs: 12,
      checkedAt: '2026-01-01T01:00:00Z',
      error: '',
    },
    gpu: { found: true, name: 'RTX 4070', vramMb: 12282, driver: '566.14' },
    cuda: {
      state: 'none',
      receivedBytes: 0,
      totalBytes: 2_576_980_378,
      error: '',
      version: '12.4',
    },
    device: 'cpu',
    modelsDir: 'C:/data/models',
  });
  ipc.on('backend_model_list', [
    {
      id: 'vieneu-turbo',
      name: 'VieNeu Turbo',
      source: 'hf/vieneu-turbo',
      languages: ['vi'],
      cloning: true,
      gpuRecommended: false,
      isDefault: true,
      state: 'installed',
      receivedBytes: 100,
      totalBytes: 100,
      error: '',
    },
    {
      id: 'omnivoice',
      name: 'OmniVoice',
      source: 'hf/omnivoice',
      languages: ['vi', 'en'],
      cloning: true,
      gpuRecommended: true,
      isDefault: false,
      state: 'none',
      receivedBytes: 0,
      totalBytes: 300,
      error: '',
    },
  ]);
  ipc.on('project_list', projects);
  ipc.on('project_create', project({ id: 9, name: 'Created' }));
  ipc.on('project_update', projects[0]);
  ipc.on('project_open', projects[0]);
  ipc.on('project_delete', 1);
  ipc.on('project_cover_get', 'data:image/png;base64,AA');
  ipc.on('project_cover_set', projects[0]);
  ipc.on('project_cover_clear', projects[0]);
  ipc.on('project_modules', [
    projectModuleState({ id: 'scripting', state: 'doing', done: 2, total: 3, note: '2/3' }),
    projectModuleState({ id: 'audiobook', state: 'stale', done: 1, total: 3 }),
    projectModuleState({ id: 'character', state: 'done', done: 4, total: 4 }),
  ]);
  ipc.on('project_dir_list', [
    { name: 'audio', kind: 'dir', size: 0 },
    { name: 'notes.txt', kind: 'file', size: 12 },
  ]);
  ipc.on('novel_list', novels);
  ipc.on('novel_create', novel({ id: 7, title: 'Created' }));
  ipc.on('novel_update', novels[0]);
  ipc.on('novel_delete', 1);
  ipc.on('novel_cover_get', 'data:image/png;base64,AA');
  ipc.on('novel_cover_set', novels[0]);
  ipc.on('novel_cover_clear', novels[0]);
  ipc.on('novel_chapters', (args) => worldChapters(Number(args?.['novelId'] ?? 1)));
  ipc.on('novel_chapter_read', worldParagraphs());
  ipc.on('novel_chapter_add', chapter({ id: 'c4', seq: 4, title: 'Added' }));
  ipc.on('novel_chapter_delete', worldChapters().slice(1));
  ipc.on('novel_chapter_move', worldChapters());
  ipc.on('novel_chapter_rename', chapter({ id: 'c1', title: 'Renamed' }));
  ipc.on('novel_chapter_write', chapter({ id: 'c1' }));
  ipc.on('novel_paragraph_add', chapter({ id: 'c1' }));
  ipc.on('novel_paragraph_update', chapter({ id: 'c1' }));
  ipc.on('novel_package_pick', 'C:/in/book.dsnovel');
  ipc.on('novel_package_save_pick', 'C:/out/book.dsnovel');
  ipc.on('novel_package_export', { path: 'C:/out/book.dsnovel', chapterCount: 3 });
  ipc.on('novel_package_import', novel({ id: 8, title: 'Imported' }));
  ipc.on('novel_package_inspect', (args) => {
    const sink = args?.['onEvent'] as { onmessage: (event: unknown) => void } | undefined;
    sink?.onmessage({ step: 'format', status: 'ok' });
    sink?.onmessage({ step: 'open', status: 'warn', detail: 'd' });
    return {
      title: 'Imported',
      name: '',
      author: 'Au',
      lang: 'EN',
      chapterCount: 3,
      wordCount: 100,
      hasCover: true,
      cover: 'data:image/png;base64,AA',
    };
  });
  ipc.on('translation_get', worldTranslation());
  ipc.on('translation_warnings', worldTranslation().warnings);
  ipc.on('translation_guidelines_save', true);
  ipc.on('translation_dict_add', {
    entry: { id: 3, src: 'New', dst: 'Moi', type: 'term', note: '' },
    flagged: 1,
  });
  ipc.on('translation_dict_update', {
    entry: { id: 1, src: 'Hero', dst: 'Anh hung', type: 'name', note: 'main' },
    flagged: 0,
  });
  ipc.on('translation_passage_save', {
    title: 'Mo dau',
    paragraphs: [
      { n: 1, originalHashcheck: 'h1', text: 'Moi.', note: 'n1' },
      { n: 2, originalHashcheck: 'h2', text: 'Doan hai.', note: '' },
    ],
  });
  ipc.on('translation_note_save', {
    title: 'Mo dau',
    paragraphs: [
      { n: 1, originalHashcheck: 'h1', text: 'Doan mot.', note: 'x' },
      { n: 2, originalHashcheck: 'h2', text: 'Doan hai.', note: '' },
    ],
  });
  ipc.on('knowledge_get', (args) =>
    worldKnowledge((args?.['lang'] as WireKnowledge['lang']) ?? 'src'),
  );
  ipc.on('knowledge_stale_accept', worldKnowledge());
  ipc.on('knowledge_edit', { knowledge: worldKnowledge(), remap: {} });
  ipc.on('pipeline_history_list', [
    pipeline({
      id: 1,
      status: 'completed',
      finishedAt: '2026-01-02T03:05:00Z',
      tasks: [
        task({
          status: 'completed',
          startedAt: '2026-01-02T03:04:20Z',
          finishedAt: '2026-01-02T03:04:40Z',
        }),
      ],
      done: 2,
    }),
    pipeline({
      id: 2,
      status: 'failed',
      failed: 1,
      finishedAt: '2026-01-02T03:05:00Z',
      tasks: [task({ id: 2, status: 'failed', error: 'boom' })],
    }),
    pipeline({
      id: 3,
      status: 'running',
      tasks: [
        task({ id: 3, status: 'running', progress: 40, startedAt: '2026-01-02T03:04:20Z' }),
        task({ id: 4, chapterId: 'c2', status: 'queued' }),
      ],
    }),
  ]);
  ipc.on('pipeline_start', pipeline({ id: 5 }));
  ipc.on('pipeline_cancel', true);
  ipc.on('library_collection_list', [
    libraryCollection({ id: 1, name: 'Covers', counts: COUNTS }),
    libraryCollection({
      id: 2,
      name: 'Music',
      counts: { image: 0, sound: 3, video: 0, prompt: 0 },
    }),
  ]);
  ipc.on('library_tag_list', [
    { tag: 'hero', counts: { image: 2, sound: 0, video: 1, prompt: 0 } },
    { tag: 'calm', counts: { image: 0, sound: 1, video: 0, prompt: 1 } },
  ]);
  ipc.on('library_summary', {
    assets: COUNTS,
    unfiled: { image: 1, sound: 0, video: 0, prompt: 1 },
  });
  ipc.on('library_collection_create', libraryCollection({ id: 3, name: 'New' }));
  ipc.on('library_collection_update', libraryCollection({ id: 1, name: 'Covers' }));
  ipc.on('library_collection_delete', 4);
  ipc.on('library_tag_rename', { tag: 'renamed', counts: COUNTS });
  ipc.on('library_tag_merge', { tag: 'calm', counts: COUNTS });
  ipc.on('library_tag_delete', 2);
  const images = [
    libraryImage({
      id: 1,
      name: 'cover.png',
      tags: ['hero'],
      collectionId: 1,
      width: 800,
      height: 600,
    }),
    libraryImage({
      id: 2,
      name: 'map.jpg',
      ext: 'jpg',
      tags: [],
      rights: 'licensed',
      size: 4_000_000,
    }),
  ];
  ipc.on('library_image_list', images);
  ipc.on('library_image_pick', ['C:/in/a.png', 'C:/in/b.png']);
  ipc.on('library_image_inspect', [
    { path: 'C:/in/a.png', name: 'a.png', size: 100, status: 'ok' },
    { path: 'C:/in/b.png', name: 'b.png', size: 0, status: 'error', code: 'empty' },
  ]);
  ipc.on('library_image_upload', images[0]);
  ipc.on('library_image_update', images[0]);
  ipc.on('library_image_delete', 1);
  ipc.on('library_image_read', 'data:image/png;base64,AA');
  ipc.on('library_image_thumb', 'data:image/png;base64,AA');
  const sounds = [librarySound({ id: 1, name: 'theme.mp3', tags: ['calm'], collectionId: 2 })];
  ipc.on('library_sound_list', sounds);
  ipc.on('library_sound_pick', ['C:/in/a.mp3']);
  ipc.on('library_sound_inspect', [
    { path: 'C:/in/a.mp3', name: 'a.mp3', size: 100, status: 'ok' },
  ]);
  ipc.on('library_sound_upload', sounds[0]);
  ipc.on('library_sound_update', sounds[0]);
  ipc.on('library_sound_delete', 1);
  ipc.on(
    'library_sound_peaks',
    btoa(String.fromCharCode(...Array.from({ length: 64 }, (_, index) => (index * 7) % 255))),
  );
  const videos = [
    libraryVideo({ id: 1, name: 'clip.mp4', tags: ['hero'] }),
    libraryVideo({ id: 2, name: 'raw.mov', hasPoster: false, fps: null }),
  ];
  ipc.on('library_video_list', videos);
  ipc.on('library_video_pick', ['C:/in/a.mp4']);
  ipc.on('library_video_inspect', [
    { path: 'C:/in/a.mp4', name: 'a.mp4', size: 100, status: 'warn', code: 'duplicate_name' },
  ]);
  ipc.on('library_video_upload', videos[0]);
  ipc.on('library_video_update', videos[0]);
  ipc.on('library_video_delete', 1);
  ipc.on('library_video_poster', 'data:image/png;base64,AA');
  const prompts = [
    libraryPrompt({
      id: 1,
      name: 'Scene prompt',
      tags: ['calm'],
      text: 'Draw {{subject}} at dawn',
    }),
  ];
  ipc.on('library_prompt_list', prompts);
  ipc.on('library_prompt_pick', ['C:/in/a.txt']);
  ipc.on('library_prompt_inspect', [
    { path: 'C:/in/a.txt', name: 'a.txt', size: 10, status: 'ok' },
  ]);
  ipc.on('library_prompt_upload', prompts[0]);
  ipc.on('library_prompt_create', prompts[0]);
  ipc.on('library_prompt_update', prompts[0]);
  ipc.on('library_prompt_delete', 1);
  const voices = [
    libraryVoice({ id: 1, name: 'Narrator An' }),
    libraryVoice({
      id: 2,
      name: 'Old Captain',
      engine: 'ghost-engine',
      engineKind: 'cloud',
      source: 'clone',
      gender: 'male',
      preset: null,
      referenceSoundId: 1,
      referenceName: 'harbor-ambience.wav',
      sampleDurationMs: null,
    }),
    libraryVoice({
      id: 3,
      name: 'Lantern Keeper',
      engine: 'omnivoice',
      source: 'design',
      language: 'en',
      gender: 'neutral',
      preset: null,
      prompt: 'A quiet voice',
    }),
  ];
  ipc.on('library_voice_list', voices);
  ipc.on('library_voice_create', voices[0]);
  ipc.on('library_voice_update', voices[0]);
  ipc.on('library_voice_delete', 1);
  ipc.on('library_voice_preview', null);
  ipc.on('assistant_session_list', [
    worldSession('s1'),
    worldSession('s2', {
      title: 'Second',
      scope: { kind: 'workspace', novelId: null },
      editGranted: false,
    }),
  ]);
  ipc.on('assistant_session_get', worldSession('s1'));
  ipc.on('assistant_session_create', worldSession('s3', { messages: [] }));
  ipc.on('assistant_session_permit', worldSession('s1'));
  ipc.on('assistant_session_delete', null);
  ipc.on('assistant_message_send', worldSession('s1'));
  ipc.on('assistant_proposal_resolve', worldSession('s1'));
  return ipc;
}

export async function warmWorld(novelId = 1): Promise<void> {
  for (const token of [
    NovelService,
    NovelTranslationService,
    NovelKnowledgeService,
    ProjectService,
    LibraryService,
    LibraryImageService,
    LibrarySoundService,
    LibraryVideoService,
    LibraryPromptService,
    LibraryVoiceService,
    AssistantService,
    PipelineService,
    SettingsService,
    LayoutService,
    NovelReaderService,
  ]) {
    TestBed.inject(token as Type<unknown>);
  }
  TestBed.tick();
  await TestBed.inject(NovelService).load();
  await TestBed.inject(NovelService).loadChapters(novelId);
  await TestBed.inject(NovelTranslationService).ensure(novelId, 'VI');
  await TestBed.inject(NovelKnowledgeService).ensureAll(novelId);
  await TestBed.inject(ProjectService).load();
  await TestBed.inject(LibraryService).load();
  await Promise.all([
    TestBed.inject(LibraryImageService).ensureLoaded(),
    TestBed.inject(LibrarySoundService).ensureLoaded(),
    TestBed.inject(LibraryVideoService).ensureLoaded(),
    TestBed.inject(LibraryPromptService).ensureLoaded(),
    TestBed.inject(LibraryVoiceService).ensureLoaded(),
  ]);
  await TestBed.inject(AssistantService).load();
  await TestBed.inject(PipelineService).load();
  await TestBed.inject(SettingsService).load();
}

export function setupWorld(): FakeIpc {
  localStorage.clear();
  const ipc = installWorld(new FakeIpc());
  TestBed.configureTestingModule({ providers: [provideFakeIpc(ipc)] });
  return ipc;
}

export async function prepareConfirms<T>(service: Type<T>): Promise<{
  ipc: FakeIpc;
  confirms: T;
  dialogs: DialogService;
}> {
  const ipc = setupWorld();
  await warmWorld();
  return { ipc, confirms: TestBed.inject(service), dialogs: TestBed.inject(DialogService) };
}

export async function acceptDialog(
  dialogs: DialogService,
  asking: Promise<boolean>,
): Promise<boolean> {
  await dialogs.accept();
  return asking;
}
