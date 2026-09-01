import { describe, expect, it } from 'vitest';

import { defaultAudioBlocks, narrationBlock } from './scripting.default';

const QUOTED = { id: '1.1', text: '“Go,” she said. “Stay.” Then nothing.' };

describe('scripting default blocks', () => {
  it('builds one narration block for a source paragraph', () => {
    const block = narrationBlock({ seq: 9 }, QUOTED);
    expect(block).toMatchObject({
      id: 'B10',
      type: 'narration',
      text: QUOTED.text,
      ref: '1.1',
      who: '',
    });
  });

  it('builds exactly one narration block per paragraph', () => {
    const ids = { seq: 0 };
    const second = { id: '1.2', text: 'The tide came in.' };
    const blocks = defaultAudioBlocks(ids, [QUOTED, second]);
    expect(blocks.map((item) => [item.id, item.type, item.ref])).toEqual([
      ['B1', 'narration', '1.1'],
      ['B2', 'narration', '1.2'],
    ]);
    expect(blocks[0].text).toBe(QUOTED.text);
    expect(ids.seq).toBe(2);
  });

  it('builds nothing without paragraphs', () => {
    expect(defaultAudioBlocks({ seq: 0 }, [])).toEqual([]);
  });
});
