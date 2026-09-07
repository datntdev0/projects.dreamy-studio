import { KnowledgeEntity, KnowledgeItem } from '@features/novel/novel.knowledge.models';
import { ProjectSummary } from '@features/project/project.models';
import { castFor } from '@features/scripting/scripting.context';
import { defaultAudioBlocks, titleBlocks } from '@features/scripting/scripting.default';
import { kbSnapshotOf } from '@features/scripting/scripting.knowledge';
// prettier-ignore
import { BlockIds, CastMember, Script, ScriptBlock, ScriptUnit, SourceParagraph } from '@features/scripting/scripting.models';
// prettier-ignore
import { appendUnit, chaptersOf, firstSpeaker, makeBlock, makeUnit, newScript, placeholderMeta, presetOfTemplate } from '@features/scripting/scripting.rules';
import { unitSource } from '@features/scripting/scripting.source';

import { evidence, KNOWLEDGE_ANALYZED, KNOWLEDGE_ITEMS } from './novel-knowledge.fixtures';
import { LANTERN_CHAPTERS, LANTERN_VI, LANTERN_VI_TITLES } from './novel-translation.fixtures';
import { PROJECT_FIXTURES } from './project-management.fixtures';

export const SCRIPTING_NOVEL_ID = 1;

export const SAMPLE_CHAPTERS = 3;

export const TEA_WOMAN: KnowledgeEntity = {
  id: 'E16',
  kind: 'entity',
  type: 'character',
  name: 'Tea-selling old woman',
  titles: [],
  aliases: [],
  stale: [],
  ev: [evidence(2, 4, 'một bà lão bán cho anh một tách trà và một lời cảnh báo')],
};

export const SCRIPTING_KNOWLEDGE_ITEMS: KnowledgeItem[] = [...KNOWLEDGE_ITEMS, TEA_WOMAN];

export const SPEAKER_HINTS: Record<string, string> = {
  '1.3': 'E3',
  '1.4': 'E1',
  '2.2': 'E5',
  '2.4': TEA_WOMAN.id,
};

const ENGLISH_TITLES = [
  'The Last Lamp',
  'A Clerk from the Quay',
  'What the Tide Returned',
  'The Ledger of Names',
  'Salt and Glass',
  "The Bell That Wasn't Rung",
  'Nine Windows, One Shutter',
  "The Salt Merchant's Debt",
  'A Light Under the Water',
  'The Council Counts Back',
  'Low Tide Arithmetic',
  "The Keeper's Answer",
];

const ENGLISH_WORDS = [165, 144, 96, 128, 123, 123, 115, 108, 124, 116, 116, 117];

const FALLBACK_WORDS = 2200;

export const MOCK_KB = kbSnapshotOf({
  lang: 'VI',
  items: SCRIPTING_KNOWLEDGE_ITEMS,
  analyzed: KNOWLEDGE_ANALYZED,
});

const QUOTE_PATTERN = /“([^”]*)”|"([^"]*)"/g;

function paragraphsOf(chapter: number, translated: boolean): SourceParagraph[] | null {
  const original = LANTERN_CHAPTERS[chapter - 1];
  if (chapter > SAMPLE_CHAPTERS || !original) {
    return null;
  }
  return original.paragraphs.map((text, index) => {
    const id = `${chapter}.${index + 1}`;
    return { id, text: translated ? (LANTERN_VI[id] ?? text) : text };
  });
}

export function mockSourceOf(project: ProjectSummary, chapter: number): SourceParagraph[] | null {
  return project.novelId === SCRIPTING_NOVEL_ID
    ? paragraphsOf(chapter, project.srcKind === 'translation')
    : null;
}

export function mockUnitSource(
  project: ProjectSummary,
  unit: ScriptUnit,
): ReturnType<typeof unitSource> {
  const chapters: Record<number, SourceParagraph[] | null> = {};
  for (const chapter of chaptersOf(unit)) {
    chapters[chapter] = mockSourceOf(project, chapter);
  }
  return unitSource(unit, chapters);
}

function projectOf(id: number): ProjectSummary {
  const project = PROJECT_FIXTURES.find((item) => item.id === id);
  if (!project) {
    throw new Error(`Unknown project fixture: ${id}`);
  }
  return project;
}

function chapterIdOf(chapter: number): string {
  return `ch-${chapter}`;
}

function chapterTitle(project: ProjectSummary, chapter: number): string {
  const translated = project.srcKind === 'translation' ? LANTERN_VI_TITLES[chapter - 1] : undefined;
  return translated ?? ENGLISH_TITLES[chapter - 1] ?? `Chapter ${chapter}`;
}

interface QuoteSegment {
  quoted: boolean;
  text: string;
}

function trimSegment(segment: QuoteSegment): QuoteSegment {
  return { quoted: segment.quoted, text: segment.text.trim().replace(/^[\s,;:.]+/, '') };
}

function hasLetters(segment: QuoteSegment): boolean {
  return /[\p{L}\p{N}]/u.test(segment.text);
}

function splitQuotes(text: string): QuoteSegment[] {
  const raw: QuoteSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(QUOTE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      raw.push({ quoted: false, text: text.slice(last, index) });
    }
    raw.push({ quoted: true, text: match[1] ?? match[2] ?? '' });
    last = index + match[0].length;
  }
  if (last < text.length) {
    raw.push({ quoted: false, text: text.slice(last) });
  }
  return raw.map(trimSegment).filter(hasLetters);
}

function segmentBlock(
  ids: BlockIds,
  paragraph: SourceParagraph,
  segment: QuoteSegment,
  cast: CastMember[],
): ScriptBlock {
  if (!segment.quoted) {
    return makeBlock(ids, 'narration', { text: segment.text, ref: paragraph.id });
  }
  return makeBlock(ids, 'dialogue', {
    who: SPEAKER_HINTS[paragraph.id] || firstSpeaker(cast),
    text: segment.text.replace(/[,;]$/, '.'),
    ref: paragraph.id,
  });
}

function splitAudioBlocks(
  ids: BlockIds,
  unit: ScriptUnit,
  paragraphs: SourceParagraph[],
  cast: CastMember[],
): ScriptBlock[] {
  return [
    ...titleBlocks(ids, unit),
    ...paragraphs.flatMap((paragraph) =>
      splitQuotes(paragraph.text).map((segment) => segmentBlock(ids, paragraph, segment, cast)),
    ),
  ];
}

function audioBlocks(
  ids: BlockIds,
  unit: ScriptUnit,
  paragraphs: SourceParagraph[],
  split: boolean,
  cast: CastMember[],
): ScriptBlock[] {
  return split
    ? splitAudioBlocks(ids, unit, paragraphs, cast)
    : defaultAudioBlocks(ids, paragraphs);
}

function seedAudio(project: ProjectSummary, split: boolean, chapters: number): Script {
  const base = newScript('audiobook');
  const cast = castFor(base, MOCK_KB);
  const ids: BlockIds = { seq: 0 };
  let script = base;
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    const unit = makeUnit(script, {
      id: chapterIdOf(chapter),
      chapterId: chapterIdOf(chapter),
      no: chapter,
      ch: chapter,
      title: chapterTitle(project, chapter),
    });
    const paragraphs = mockSourceOf(project, chapter);
    if (paragraphs) {
      unit.blocks = audioBlocks(ids, unit, paragraphs, split, cast);
    } else {
      unit.meta = placeholderMeta(
        project.novelId === SCRIPTING_NOVEL_ID ? ENGLISH_WORDS[chapter - 1] : FALLBACK_WORDS,
      );
    }
    script = { ...script, units: [...script.units, unit], useq: script.useq + 1 };
  }
  return { ...script, seq: ids.seq };
}

type BlockType = ScriptBlock['type'];

function blockAt(unit: ScriptUnit, ref: string, type: BlockType): ScriptBlock {
  const found = (unit.blocks ?? []).find((block) => block.ref === ref && block.type === type);
  if (!found) {
    throw new Error(`Missing seed block ${type} ${ref}`);
  }
  return found;
}

function withParen(unit: ScriptUnit, ref: string, paren: string): void {
  blockAt(unit, ref, 'dialogue').paren = paren;
}

function tuneAudio(script: Script): Script {
  const [first, second] = script.units;
  const ids: BlockIds = { seq: script.seq };
  withParen(first, '1.3', 'dry, curt');
  withParen(first, '1.4', 'cold, does not turn back');
  withParen(second, '2.2', 'reading the letter, formal');
  const blocks = second.blocks ?? [];
  const at = blocks.indexOf(blockAt(second, '2.3', 'narration'));
  blocks.splice(
    at,
    0,
    makeBlock(ids, 'note', {
      text: 'Keep a slow pace, with a long breath as Maro walks down the empty street.',
    }),
  );
  return { ...script, seq: ids.seq };
}

interface FilmBody {
  type: BlockType;
  text: string;
  who?: string;
  paren?: string;
}

function action(text: string): FilmBody {
  return { type: 'action', text };
}

function line(who: string, text: string, paren = ''): FilmBody {
  return { type: 'dialogue', who, text, paren };
}

function filmScene(
  ids: BlockIds,
  head: Pick<ScriptBlock, 'loc' | 'time' | 'beat' | 'refs' | 'chars'>,
  body: FilmBody[],
): ScriptBlock[] {
  return [
    makeBlock(ids, 'scene', head),
    ...body.map((item) => makeBlock(ids, item.type, { ...item })),
  ];
}

function seedFilm(): Script {
  const ids: BlockIds = { seq: 0 };
  const [wren, maro, severin, tea] = ['E1', 'E3', 'E5', TEA_WOMAN.id];
  const blocks = [
    ...filmScene(
      ids,
      {
        loc: 'LANTERN TOWER',
        time: 'SUNSET',
        beat: 'Wren lights the last lamp of Harrowmere.',
        refs: ['1.1', '1.2'],
        chars: [wren],
      },
      [
        action(
          'Chạng vạng. Sương mù phủ dày lên bến cảng Harrowmere. WREN ALDOUS leo hết ba trăm mười hai bậc thang của Tháp Đèn và thắp ngọn đèn cuối cùng. Những ngọn đèn khác trong thị trấn đã tắt từ nhiều năm trước.',
        ),
      ],
    ),
    ...filmScene(
      ids,
      {
        loc: 'LANTERN TOWER',
        time: 'SUNSET',
        beat: 'Maro Quill, the harbor clerk, arrives to take an inventory of Harrowmere.',
        refs: ['1.3', '1.4', '1.5'],
        chars: [wren, maro],
      },
      [
        action(
          'MARO QUILL, thư lại bến cảng, đã leo lên cầu thang mà không phát ra một tiếng động. Anh ôm chặt cuốn sổ cái trước ngực.',
        ),
        line(
          maro,
          'Cô đang phí dầu đấy. Hội đồng đã sáu mùa đông không trả tiền cho nó.',
          'dry, curt',
        ),
        line(wren, 'Hội đồng đâu có thắp đèn. Tôi thắp.', 'does not turn back'),
        action(
          'Anh tự giới thiệu là Maro Quill, được cử đến để kiểm kê những gì còn lại của Harrowmere. Anh không nói ai đã cử mình.',
        ),
      ],
    ),
    ...filmScene(
      ids,
      {
        loc: 'SUNKEN WHARF',
        time: 'SUNSET',
        beat: 'Từ đỉnh tháp, ánh đèn dường như vươn xuống tận mặt nước.',
        refs: ['1.6'],
        chars: [],
      },
      [],
    ),
    ...filmScene(
      ids,
      {
        loc: 'BOARDING HOUSE',
        time: 'MORNING',
        beat: 'Maro finds Lady Severin’s letter in the ledger.',
        refs: ['2.1', '2.2'],
        chars: [maro, severin],
      },
      [],
    ),
    ...filmScene(
      ids,
      {
        loc: 'SUNKEN WHARF',
        time: 'DAY',
        beat: 'The tea-selling old woman warns Maro about the lamp.',
        refs: ['2.4'],
        chars: [maro, tea],
      },
      [],
    ),
  ];
  const base = newScript('film');
  const first = makeUnit(base, { no: 1, chs: [1, 2], title: LANTERN_VI_TITLES[0], blocks });
  const withFirst: Script = { ...base, units: [first], useq: 1, seq: ids.seq };
  return appendUnit(withFirst, { no: 2, chs: [3, 3], title: LANTERN_VI_TITLES[2] });
}

function seedPlaceholders(
  project: ProjectSummary,
  units: number,
  label: string,
  words: number,
): Script {
  const preset = presetOfTemplate(project.template) ?? 'audiobook';
  let script = newScript(preset);
  for (let no = 1; no <= units; no += 1) {
    script = appendUnit(script, {
      ...(preset === 'film' ? {} : { id: chapterIdOf(no), chapterId: chapterIdOf(no) }),
      no,
      ch: preset === 'film' ? null : no,
      chs: preset === 'film' ? [no, no] : null,
      title: `${label} ${no}`,
      meta: placeholderMeta(words),
    });
  }
  return script;
}

export function seedScripts(): Record<number, Script> {
  return {
    1: tuneAudio(seedAudio(projectOf(1), true, 12)),
    3: seedFilm(),
    4: seedPlaceholders(projectOf(4), 8, 'Chapters', 2230),
    5: seedAudio(projectOf(5), false, SAMPLE_CHAPTERS),
    6: seedPlaceholders(projectOf(6), 2, 'Episode', 2400),
  };
}
