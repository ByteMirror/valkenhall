import { describe, expect, it } from 'bun:test';
import { getDesktopHost } from './devServerConfig.js';

describe('desktop dev server config', () => {
  it('uses the ipv4 loopback host for the desktop shell', () => {
    expect(getDesktopHost()).toBe('127.0.0.1');
  });
});
