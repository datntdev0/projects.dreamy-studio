import { describe, expect, it } from 'vitest';

import { leadingMonogram, nameTone, nameWords } from './monogram';

describe('monogram', () => {
  it('takes the leading letters of up to the given number of words', () => {
    expect(leadingMonogram('Dreamy Night Tales Vol 2', 3)).toBe('DNT');
    expect(leadingMonogram('Harbor Audio', 3)).toBe('HA');
    expect(leadingMonogram('  đêm   trăng  sáng ', 3)).toBe('ĐTS');
    expect(leadingMonogram('Harbor', 3)).toBe('HA');
    expect(leadingMonogram('   ', 3)).toBe('?');
  });

  it('splits names into character arrays per word', () => {
    expect(nameWords(' a  bc ')).toEqual([['a'], ['b', 'c']]);
  });

  it('maps names to a stable tone', () => {
    expect(nameTone('Mira')).toBe(nameTone('Mira'));
    expect(nameTone('Narrator')).toBe(0);
  });
});
