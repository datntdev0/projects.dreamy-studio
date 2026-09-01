import { FakeIpc } from '@testing/fake-ipc';
import { ONTOLOGY_VIEW } from '@testing/knowledge';

import { draftBlocksFor } from '../features/scripting/scripting.draft';
import { DraftRequest } from '../features/scripting/scripting.models';
// prettier-ignore
import { KNOWLEDGE_ANALYZED, KNOWLEDGE_ITEMS } from '../stories/screens/novel-knowledge.fixtures';
// prettier-ignore
import { LANTERN_CHAPTERS, LANTERN_VI, LANTERN_VI_TITLES } from '../stories/screens/novel-translation.fixtures';
// prettier-ignore
import { PROJECT_FIXTURES, projectModuleStatesFor } from '../stories/screens/project-management.fixtures';
import { SPEAKER_HINTS } from '../stories/screens/scripting.fixtures';
import { scriptingHandlers } from '../stories/screens/scripting.mocks';

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

function translationWire() {
  const chapters: Record<string, unknown> = {};
  for (let seq = 1; seq <= SAMPLE_CHAPTERS; seq += 1) {
    chapters[`ch-${seq}`] = {
      title: LANTERN_VI_TITLES[seq - 1],
      paragraphs: originalRows(`ch-${seq}`).map((row) => ({
        n: row.n,
        originalHashcheck: row.hashcheck,
        text: LANTERN_VI[`${seq}.${row.n}`],
        note: '',
      })),
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

export function installScriptingBackend(ipc: FakeIpc): void {
  const backend = scriptingHandlers({
    translation_get: () => translationWire(),
    knowledge_get: knowledgeWire,
  });
  ipc.on('project_list', PROJECT_FIXTURES);
  ipc.on('novel_chapters', chapterRows());
  ipc.on('novel_chapter_read', (args) => originalRows(String(args?.['chapterId'])));
  ipc.on('translation_get', translationWire());
  for (const [command, handler] of Object.entries(backend)) {
    ipc.on(command, (args) => handler(args ?? {}));
  }
  ipc.on('scripting_draft_generate', draftHandler);
  ipc.on('project_modules', (args) => projectModuleStatesFor(Number(args?.['projectId'])));
}

function draftHandler(args: Record<string, unknown> | undefined): unknown {
  const request = args?.['request'] as DraftRequest;
  const ids = { seq: 100 };
  const blocks = draftBlocksFor(ids, request, SPEAKER_HINTS);
  if (!blocks) {
    throw { code: 'no_source', detail: 'none' };
  }
  const unit = {
    id: request.unit.id,
    no: request.unit.no,
    ch: request.unit.ch,
    chs: request.unit.chs,
    title: request.unit.title,
    status: 'draft',
    blocks,
    meta: null,
    updated: STAMP,
  };
  return { unit, seq: ids.seq };
}
