import { isBackendUrl } from './backend.rules';

describe('isBackendUrl', () => {
  it('accepts http and https addresses', () => {
    expect(isBackendUrl('https://quiet-river-sample.trycloudflare.com')).toBe(true);
    expect(isBackendUrl(' http://192.168.1.20:8765 ')).toBe(true);
  });

  it('rejects other schemes and plain text', () => {
    expect(isBackendUrl('')).toBe(false);
    expect(isBackendUrl('quiet-river-sample.trycloudflare.com')).toBe(false);
    expect(isBackendUrl('ftp://example.com')).toBe(false);
  });
});
