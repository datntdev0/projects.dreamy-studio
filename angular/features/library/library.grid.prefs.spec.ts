import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readGridRatio, readGridSize, writeStored } from './library.grid.prefs';

describe('library.grid.prefs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('reads sizes within range', () => {
    expect(readGridSize('k')).toBe(176);
    localStorage.setItem('k', '200');
    expect(readGridSize('k')).toBe(200);
    localStorage.setItem('k', '50');
    expect(readGridSize('k', 150)).toBe(150);
    localStorage.setItem('k', 'abc');
    expect(readGridSize('k', 150)).toBe(150);
  });

  it('reads known ratios only', () => {
    expect(readGridRatio('r')).toBe('16/9');
    localStorage.setItem('r', '1/1');
    expect(readGridRatio('r')).toBe('1/1');
    localStorage.setItem('r', '9/16');
    expect(readGridRatio('r')).toBe('9/16');
    localStorage.setItem('r', 'bad');
    expect(readGridRatio('r', '1/1')).toBe('1/1');
  });

  it('survives storage failures', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readGridSize('k', 120)).toBe(120);
    expect(readGridRatio('r')).toBe('16/9');
    expect(() => writeStored('k', '1')).not.toThrow();
  });

  it('writes values', () => {
    writeStored('w', '5');
    expect(localStorage.getItem('w')).toBe('5');
  });
});
