import { BlockIds, ScriptBlock, ScriptUnit, SourceParagraph } from './scripting.models';
import { DEFAULT_PAUSE_MS, headingText, makeBlock } from './scripting.rules';

export function narrationBlock(ids: BlockIds, paragraph: SourceParagraph): ScriptBlock {
  return makeBlock(ids, 'narration', {
    text: paragraph.text,
    ref: paragraph.id,
  });
}

export function titleBlocks(ids: BlockIds, unit: Pick<ScriptUnit, 'no' | 'title'>): ScriptBlock[] {
  return [
    makeBlock(ids, 'heading', { text: headingText(unit.no, unit.title) }),
    makeBlock(ids, 'pause', { ms: DEFAULT_PAUSE_MS }),
  ];
}

export function defaultAudioBlocks(ids: BlockIds, paragraphs: SourceParagraph[]): ScriptBlock[] {
  return paragraphs.map((item) => narrationBlock(ids, item));
}
