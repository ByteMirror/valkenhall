import { describe, expect, it, vi } from 'bun:test';
import { registerDesktopCleanup } from './lifecycle.js';

describe('registerDesktopCleanup', () => {
  it('does not bind cleanup to beforeExit', () => {
    const on = vi.fn();
    const cleanup = vi.fn();

    registerDesktopCleanup({ on }, cleanup);

    expect(on).not.toHaveBeenCalledWith('beforeExit', cleanup);
    expect(on).toHaveBeenCalledWith('exit', cleanup);
    expect(on).toHaveBeenCalledWith('SIGINT', cleanup);
    expect(on).toHaveBeenCalledWith('SIGTERM', cleanup);
  });
});
