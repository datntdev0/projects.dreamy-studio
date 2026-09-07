import { NovelSummary } from '@features/novel/novel.models';
import {
  ProjectModuleId,
  ProjectModuleState,
  ProjectModuleStatus,
  ProjectSummary,
  ProjectTemplateId,
} from '@features/project/project.models';
import { templateModules } from '@features/project/project.rules';

const WORKSPACE_ROOT = 'D:/Dreamy/Harrowmere/projects';

interface ProjectSeed {
  id: number;
  name: string;
  slug: string;
  template: ProjectTemplateId;
  description: string;
  novelId: number | null;
  srcKind: ProjectSummary['srcKind'];
  srcLang: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  openedAt: string;
}

type ModuleSeed = [ProjectModuleId, ProjectModuleStatus, number, number, string];

function stamp(day: number, time: string): string {
  return `2026-11-${String(day).padStart(2, '0')}T${time}:00Z`;
}

function projectOf(seed: ProjectSeed): ProjectSummary {
  return {
    id: seed.id,
    name: seed.name,
    folder: `${WORKSPACE_ROOT}/${seed.slug}`,
    template: seed.template,
    description: seed.description,
    novelId: seed.novelId,
    novelMissing: false,
    srcKind: seed.srcKind,
    srcLang: seed.srcLang,
    archived: seed.archived,
    modules: templateModules(seed.template),
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt,
    openedAt: seed.openedAt,
  };
}

function stateOf([id, state, done, total, note]: ModuleSeed): ProjectModuleState {
  return { id, state, done, total, note };
}

function statesOf(seeds: ModuleSeed[]): ProjectModuleState[] {
  return seeds.map(stateOf);
}

function novelOf(
  id: number,
  title: string,
  author: string,
  lang: NovelSummary['lang'],
  chapterCount: number,
): NovelSummary {
  return {
    id,
    title,
    name: '',
    author,
    lang,
    description: '',
    origin: 'imported',
    createdAt: stamp(1, '09:00'),
    updatedAt: stamp(9, '09:15'),
    chapterCount,
    wordCount: chapterCount * 2400,
    translatedCount: 0,
    analyzedCount: 0,
    tags: [],
  };
}

const SEEDS: ProjectSeed[] = [
  {
    id: 1,
    name: 'Harrowmere — Audiobook',
    slug: 'harrowmere-audiobook',
    template: 'audiobook',
    description:
      'Illustrated audiobook for the first 12 chapters of The Lantern Keeper of Harrowmere, published to the main channel.',
    novelId: 1,
    srcKind: 'translation',
    srcLang: 'VI',
    archived: false,
    createdAt: stamp(1, '19:02'),
    updatedAt: stamp(10, '08:40'),
    openedAt: stamp(10, '09:12'),
  },
  {
    id: 2,
    name: 'Channel — Intro',
    slug: 'channel-intro',
    template: 'blank',
    description: 'Shared intro for the channel’s videos.',
    novelId: null,
    srcKind: null,
    srcLang: null,
    archived: false,
    createdAt: stamp(28, '09:30'),
    updatedAt: stamp(29, '10:42'),
    openedAt: stamp(5, '20:00'),
  },
  {
    id: 3,
    name: 'Harrowmere — Phim',
    slug: 'harrowmere-phim',
    template: 'filmseries',
    description: 'Season 1: episode 1 built from chapters 1–2, episode 2 from chapter 3.',
    novelId: 1,
    srcKind: 'translation',
    srcLang: 'VI',
    archived: false,
    createdAt: stamp(2, '21:00'),
    updatedAt: stamp(6, '17:20'),
    openedAt: stamp(6, '17:25'),
  },
  {
    id: 4,
    name: 'Late Wind — Audiobook trial',
    slug: 'late-wind-audiobook-trial',
    template: 'audiobook',
    description: 'A voice trial for the draft in progress.',
    novelId: 3,
    srcKind: 'original',
    srcLang: 'VI',
    archived: false,
    createdAt: stamp(3, '08:20'),
    updatedAt: stamp(5, '20:40'),
    openedAt: stamp(5, '20:41'),
  },
  {
    id: 5,
    name: 'Harrowmere — Shorts',
    slug: 'harrowmere-shorts',
    template: 'audiobook',
    description: 'Three short vertical videos introducing the opening scenes.',
    novelId: 1,
    srcKind: 'translation',
    srcLang: 'VI',
    archived: false,
    createdAt: stamp(1, '19:00'),
    updatedAt: stamp(4, '20:50'),
    openedAt: stamp(9, '21:30'),
  },
  {
    id: 6,
    name: 'Ash Under the Sea — Old version',
    slug: 'ash-under-the-sea-old-version',
    template: 'filmseries',
    description: 'The first cut, kept for reference.',
    novelId: 2,
    srcKind: 'original',
    srcLang: 'EN',
    archived: true,
    createdAt: stamp(1, '12:00'),
    updatedAt: stamp(2, '10:00'),
    openedAt: stamp(2, '10:00'),
  },
];

const MODULE_SEEDS: Record<number, ModuleSeed[]> = {
  1: [
    ['scripting', 'done', 12, 12, '12/12 chapters'],
    ['character', 'done', 4, 4, '4 characters'],
    ['world', 'idle', 0, 0, ''],
    ['storyboard', 'doing', 5, 12, '5/12 chapters'],
    ['audiobook', 'stale', 8, 12, '8/12 chapters · 2 need review'],
    ['canvas', 'idle', 0, 0, ''],
    ['video', 'doing', 0, 1, '1 timeline · 2 exports'],
  ],
  2: [['video', 'done', 1, 1, '1 timeline · 1 export']],
  3: [
    ['scripting', 'doing', 1, 2, '1/2 episodes'],
    ['character', 'doing', 1, 3, '1/3 characters'],
  ],
  4: [
    ['scripting', 'done', 5, 5, '5/5 chapters'],
    ['audiobook', 'doing', 3, 5, '3/5 chapters'],
  ],
  5: [
    ['scripting', 'done', 3, 3, '3/3 chapters'],
    ['storyboard', 'done', 3, 3, '3/3 chapters'],
    ['audiobook', 'done', 3, 3, '3/3 chapters'],
    ['canvas', 'done', 1, 1, '1 workflow'],
    ['video', 'done', 3, 3, '3 exports'],
  ],
  6: [
    ['scripting', 'done', 2, 2, '2/2 chapters'],
    ['character', 'doing', 2, 5, '2/5 characters'],
  ],
};

export const PROJECT_FIXTURES: ProjectSummary[] = SEEDS.map(projectOf);

export const PROJECT_NOVELS: NovelSummary[] = [
  novelOf(2, 'Ash Under the Glass Sea', 'Tomas Hale', 'EN', 8),
  novelOf(3, 'Gió Muộn Trên Đồi Thông', 'Nguyễn Hạ', 'VI', 5),
];

export function projectModuleStatesFor(projectId: number): ProjectModuleState[] {
  return statesOf(MODULE_SEEDS[projectId] ?? []);
}

export function projectCoverFor(projectId: number): string {
  const hue = (projectId * 57) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},45%,22%)'/><stop offset='1' stop-color='hsl(${hue + 60},65%,58%)'/></linearGradient></defs><rect width='160' height='100' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
