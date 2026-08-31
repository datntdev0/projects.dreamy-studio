import { LanguageKey } from '@shared/language/language.models';

export type RailId = 'projects' | 'novels' | 'library' | 'distribution';

export type PanelId = 'explorer' | 'inspector' | 'bottom';

export type BottomTabId = 'pipelines' | 'output' | 'omniscient';

export type RightTabId = 'inspector' | 'assistant';

export type EditorTabKind =
  | 'home'
  | 'novels'
  | 'novel'
  | 'translation'
  | 'knowledge'
  | 'projects'
  | 'project'
  | 'images'
  | 'sounds'
  | 'videos'
  | 'prompts'
  | 'collections'
  | 'collection'
  | 'pipelines';

export interface RailItem {
  id: RailId;
  icon: string;
  labelKey: LanguageKey;
}

export interface RightTab {
  id: RightTabId;
  labelKey: LanguageKey;
}

export interface EditorTab {
  id: string;
  kind: EditorTabKind;
  icon: string | null;
  labelKey: LanguageKey | null;
  title: string;
  novelId: number | null;
  projectId: number | null;
  collectionId: number | null;
  rail: RailId | null;
  closable: boolean;
}

export const HOME_TAB_ID = 'home';

export const NOVELS_TAB_ID = 'novels';

export const PROJECTS_TAB_ID = 'projects';

export const IMAGES_TAB_ID = 'images';

export const SOUNDS_TAB_ID = 'sounds';

export const VIDEOS_TAB_ID = 'videos';
export const PROMPTS_TAB_ID = 'prompts';

export const COLLECTIONS_TAB_ID = 'collections';

export const PIPELINES_TAB_ID = 'pipelines';

export const HOME_TAB: EditorTab = {
  id: HOME_TAB_ID,
  kind: 'home',
  icon: null,
  labelKey: 'main.editor.home',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: null,
  closable: false,
};

export const NOVELS_TAB: EditorTab = {
  id: NOVELS_TAB_ID,
  kind: 'novels',
  icon: 'frames',
  labelKey: 'tabs.novels.title',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: 'novels',
  closable: true,
};

export const PROJECTS_TAB: EditorTab = {
  id: PROJECTS_TAB_ID,
  kind: 'projects',
  icon: 'folder',
  labelKey: 'tabs.projects.title',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: 'projects',
  closable: true,
};

export const IMAGES_TAB: EditorTab = {
  id: IMAGES_TAB_ID,
  kind: 'images',
  icon: 'image',
  labelKey: 'tabs.images.title',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: 'library',
  closable: true,
};

export const SOUNDS_TAB: EditorTab = {
  id: SOUNDS_TAB_ID,
  kind: 'sounds',
  icon: 'music',
  labelKey: 'tabs.sounds.title',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: 'library',
  closable: true,
};

export const VIDEOS_TAB: EditorTab = {
  id: VIDEOS_TAB_ID,
  kind: 'videos',
  icon: 'film',
  labelKey: 'tabs.videos.title',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: 'library',
  closable: true,
};

export const PROMPTS_TAB: EditorTab = {
  id: PROMPTS_TAB_ID,
  kind: 'prompts',
  icon: 'prompt',
  labelKey: 'tabs.prompts.title',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: 'library',
  closable: true,
};

export const PIPELINES_TAB: EditorTab = {
  id: PIPELINES_TAB_ID,
  kind: 'pipelines',
  icon: 'activity',
  labelKey: 'tabs.pipelines.title',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: null,
  closable: true,
};

export const RAIL_ITEMS: RailItem[] = [
  { id: 'projects', icon: 'folder', labelKey: 'main.rail.projects' },
  { id: 'novels', icon: 'book', labelKey: 'main.rail.novels' },
  { id: 'library', icon: 'library', labelKey: 'main.rail.library' },
  { id: 'distribution', icon: 'send', labelKey: 'main.rail.distribution' },
];

export const RIGHT_TABS: RightTab[] = [
  { id: 'inspector', labelKey: 'main.inspector.tab.inspector' },
  { id: 'assistant', labelKey: 'main.inspector.tab.assistant' },
];

export function novelTabId(novelId: number): string {
  return `novel:${novelId}`;
}

export function novelTab(novelId: number, title: string): EditorTab {
  return {
    id: novelTabId(novelId),
    kind: 'novel',
    icon: 'book',
    labelKey: null,
    title,
    novelId,
    projectId: null,
    collectionId: null,
    rail: 'novels',
    closable: true,
  };
}

export type NovelToolKind = 'translation' | 'knowledge';

export function novelToolTabId(kind: NovelToolKind, novelId: number): string {
  return `${kind}:${novelId}`;
}

export function novelToolTab(kind: NovelToolKind, novelId: number, title: string): EditorTab {
  return {
    id: novelToolTabId(kind, novelId),
    kind,
    icon: kind === 'translation' ? 'lang' : 'graph',
    labelKey: null,
    title,
    novelId,
    projectId: null,
    collectionId: null,
    rail: 'novels',
    closable: true,
  };
}

export function projectTabId(id: number): string {
  return `project:${id}`;
}

export function projectTab(id: number, title: string, icon = 'folder'): EditorTab {
  return {
    id: projectTabId(id),
    kind: 'project',
    icon,
    labelKey: null,
    title,
    novelId: null,
    projectId: id,
    collectionId: null,
    rail: 'projects',
    closable: true,
  };
}

export const COLLECTIONS_TAB: EditorTab = {
  id: COLLECTIONS_TAB_ID,
  kind: 'collections',
  icon: 'tag',
  labelKey: 'tabs.collections.title',
  title: '',
  novelId: null,
  projectId: null,
  collectionId: null,
  rail: 'library',
  closable: true,
};

export function collectionTabId(id: number): string {
  return `collection:${id}`;
}

export function collectionTab(id: number, title: string): EditorTab {
  return {
    id: collectionTabId(id),
    kind: 'collection',
    icon: 'folder',
    labelKey: null,
    title,
    novelId: null,
    projectId: null,
    collectionId: id,
    rail: 'library',
    closable: true,
  };
}
