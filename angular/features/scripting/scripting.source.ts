import { ParagraphRow } from '../novel/novel.models';
import { PassageTranslation } from '../novel/novel.translation.models';
import { ProjectSummary } from '../project/project.models';
// prettier-ignore
import { ChapterRange, Script, ScriptSource, ScriptUnit, SourceParagraph } from './scripting.models';
import { appendUnit, chaptersOf, makeSource, newScript, presetOfTemplate } from './scripting.rules';

export interface ChapterSourceInput {
  seq: number;
  originals: ParagraphRow[] | null | undefined;
  passages: Record<number, PassageTranslation> | null | undefined;
  translated: boolean;
}

export interface ChapterTitleInput {
  seq: number;
  hasNovel: boolean;
  translated: boolean;
  translatedTitle: string | null;
  originalTitle: string | null;
}

export function usesTranslation(project: ProjectSummary): boolean {
  return project.srcKind === 'translation';
}

export function paragraphRef(seq: number, n: number): string {
  return `${seq}.${n}`;
}

export function chapterParagraphs(input: ChapterSourceInput): SourceParagraph[] | null {
  if (!input.originals || input.originals.length === 0) {
    return null;
  }
  return input.originals.map((row) => ({
    id: paragraphRef(input.seq, row.n),
    text: (input.translated ? input.passages?.[row.n]?.text : '') || row.text,
  }));
}

export function rangeSource(parts: (SourceParagraph[] | null)[]): ScriptSource | null {
  if (parts.length === 0 || parts.some((part) => part === null)) {
    return null;
  }
  return makeSource(parts.flatMap((part) => part ?? []));
}

export function unitSource(
  unit: Pick<ScriptUnit, 'ch' | 'chs'>,
  chapters: Record<number, SourceParagraph[] | null>,
): ScriptSource | null {
  return rangeSource(chaptersOf(unit).map((seq) => chapters[seq] ?? null));
}

export function chapterTitleOf(input: ChapterTitleInput): string {
  if (!input.hasNovel) {
    return `Chapter ${input.seq}`;
  }
  const translated = input.translated ? input.translatedTitle : null;
  return translated || input.originalTitle || `Chapter ${input.seq}`;
}

function chapterBounds(project: ProjectSummary): ChapterRange | null {
  return project.rangeFrom !== null && project.rangeTo !== null
    ? [project.rangeFrom, project.rangeTo]
    : null;
}

export function initialScript(project: ProjectSummary, titles: Record<number, string>): Script {
  const preset = presetOfTemplate(project.template);
  const base = newScript(preset ?? 'audiobook', { choose: preset === null });
  const range = chapterBounds(project);
  if (preset === 'film') {
    return appendUnit(base, { chs: range });
  }
  if (!range) {
    return appendUnit(base);
  }
  let script = base;
  for (let seq = range[0]; seq <= range[1]; seq += 1) {
    script = appendUnit(script, { no: seq, ch: seq, title: titles[seq] ?? `Chapter ${seq}` });
  }
  return script;
}
