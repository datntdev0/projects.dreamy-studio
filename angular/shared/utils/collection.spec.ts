import { describe, expect, it } from 'vitest';

import { replaceById, withoutIds, withoutKeys } from './collection';

describe('collection', () => {
  const items = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ];

  it('replaces only the item with the same id', () => {
    const next = { id: 2, name: 'changed' };
    expect(replaceById(items, next)).toEqual([items[0], next, items[2]]);
  });

  it('returns an equal list when no id matches', () => {
    expect(replaceById(items, { id: 9, name: 'x' })).toEqual(items);
  });

  it('removes every item whose id is in the set', () => {
    expect(withoutIds(items, new Set([1, 3]))).toEqual([items[1]]);
  });

  it('removes record entries whose key is in the set', () => {
    expect(withoutKeys({ 1: 'a', 2: 'b', 3: 'c' }, new Set([2]))).toEqual({ 1: 'a', 3: 'c' });
  });
});
