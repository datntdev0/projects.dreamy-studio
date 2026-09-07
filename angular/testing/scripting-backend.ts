import { FakeIpc } from '@testing/fake-ipc';
import { ONTOLOGY_VIEW } from '@testing/knowledge';

// prettier-ignore
import { KNOWLEDGE_ANALYZED, KNOWLEDGE_ITEMS } from '../stories/screens/novel-knowledge.fixtures';
// prettier-ignore
import { LANTERN_CHAPTERS, LANTERN_VI, LANTERN_VI_TITLES } from '../stories/screens/novel-translation.fixtures';
// prettier-ignore
import { PROJECT_FIXTURES, projectModuleStatesFor } from '../stories/screens/project-management.fixtures';
import { scriptingHandlers, ScriptingState } from '../stories/screens/scripting.mocks';

const STAMP = '2026-11-09T09:15:00Z';
const SAMPLE_CHAPTERS = 3;

function chapterRows() {
  return LANTERN_CHAPTERS.map((chapter, index) => ({
    id: `ch-${index + 1}`,
    novelId: 1,
    seq: index + 1,
    title: chapter.title,
    wordCount: chapter.words,
    translationStatus: 'none',
    analysisStatus: 'none',
    createdAt: STAMP,
    updatedAt: STAMP,
  }));
}

function originalRows(chapterId: string) {
  const seq = Number(chapterId.slice(3));
  const chapter = seq <= SAMPLE_CHAPTERS ? LANTERN_CHAPTERS[seq - 1] : undefined;
  return (chapter?.paragraphs ?? []).map((text, index) => ({
    n: index + 1,
    text,
    hashcheck: `h-${seq}-${index + 1}`,
  }));
}

function translatedParagraphs(seq: number) {
  return originalRows(`ch-${seq}`).map((row) => ({
    n: row.n,
    originalHashcheck: row.hashcheck,
    text: LANTERN_VI[`${seq}.${row.n}`],
    note: '',
  }));
}

function translationWire() {
  const chapters: Record<string, unknown> = {};
  for (let seq = 1; seq <= LANTERN_VI_TITLES.length; seq += 1) {
    chapters[`ch-${seq}`] = {
      title: LANTERN_VI_TITLES[seq - 1],
      paragraphs: translatedParagraphs(seq),
    };
  }
  return { guidelines: '', dict: [], chapters, warnings: [] };
}

function knowledgeWire() {
  return {
    lang: 'VI',
    ontology: ONTOLOGY_VIEW,
    items: KNOWLEDGE_ITEMS,
    analyzed: KNOWLEDGE_ANALYZED,
  };
}

export function installScriptingBackend(ipc: FakeIpc, state?: ScriptingState): void {
  const backend = scriptingHandlers(
    {
      translation_get: () => translationWire(),
      knowledge_get: knowledgeWire,
    },
    state,
  );
  ipc.on('project_list', PROJECT_FIXTURES);
  ipc.on('novel_chapters', chapterRows());
  ipc.on('novel_chapter_read', (args) => originalRows(String(args?.['chapterId'])));
  ipc.on('translation_get', translationWire());
  for (const [command, handler] of Object.entries(backend)) {
    ipc.on(command, (args) => handler(args ?? {}));
  }
  ipc.on('project_modules', (args) => projectModuleStatesFor(Number(args?.['projectId'])));
}
