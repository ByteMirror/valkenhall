import { describe, expect, it } from 'bun:test';
import { getDesktopHost, shouldStartEmbeddedProxy } from './devServerConfig.js';

describe('desktop dev server config', () => {
  it('uses the ipv4 loopback host for the desktop shell and local proxy', () => {
    expect(getDesktopHost()).toBe('127.0.0.1');
  });

  it('does not start a second embedded proxy when using an external renderer url', () => {
    expect(shouldStartEmbeddedProxy({ ELECTROBUN_RENDERER_URL: 'http://127.0.0.1:4173/flesh-and-blood-proxies' })).toBe(
      false
    );
    expect(shouldStartEmbeddedProxy({})).toBe(true);
  });
});
