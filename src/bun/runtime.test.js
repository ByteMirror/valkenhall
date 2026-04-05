import { afterEach, describe, expect, it } from 'bun:test';
import { getRendererUrl } from './runtime.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('desktop runtime', () => {
  it('prefers an explicit renderer url in development', () => {
    process.env.ELECTROBUN_RENDERER_URL = 'http://127.0.0.1:5173/flesh-and-blood-proxies';

    expect(getRendererUrl({ staticServerPort: 4310 })).toBe('http://127.0.0.1:5173/flesh-and-blood-proxies');
  });

  it('falls back to the packaged local renderer server', () => {
    delete process.env.ELECTROBUN_RENDERER_URL;

    expect(getRendererUrl({ staticServerPort: 4310 })).toBe('http://127.0.0.1:4310/flesh-and-blood-proxies');
  });
});
