import { describe, expect, it } from 'vitest';

import { silenceWav } from './wav';

describe('silenceWav', () => {
  it('builds a mono 16-bit PCM wav of the requested length', () => {
    const data = silenceWav(0.5);
    const view = new DataView(data);
    expect(data.byteLength).toBe(44 + 8000);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2))).toBe('RIF');
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(40, true)).toBe(8000);
    expect(new Uint8Array(data, 44).every((byte) => byte === 0)).toBe(true);
  });

  it('keeps at least one sample', () => {
    expect(silenceWav(-1).byteLength).toBe(46);
  });
});
