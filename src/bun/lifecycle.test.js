import { describe, expect, it, vi } from 'bun:test';
import { registerDesktopCleanup } from './lifecycle.js';

describe('registerDesktopCleanup', () => {
  it('binds cleanup to all shutdown signals', () => {
    const on = vi.fn();
    const cleanup = vi.fn();

    registerDesktopCleanup({ on }, cleanup);

    expect(on).toHaveBeenCalledWith('beforeExit', cleanup);
    expect(on).toHaveBeenCalledWith('exit', cleanup);
    expect(on).toHaveBeenCalledWith('SIGINT', cleanup);
    expect(on).toHaveBeenCalledWith('SIGTERM', cleanup);
    expect(on).toHaveBeenCalledWith('SIGHUP', cleanup);
  });
});
