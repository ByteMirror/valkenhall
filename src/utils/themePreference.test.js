import { afterEach, describe, expect, it, vi } from 'bun:test';

import {
  THEME_PREFERENCE_STORAGE_KEY,
  getStoredThemePreference,
  persistThemePreference,
} from './themePreference';

const originalLocalStorage = window.localStorage;

describe('themePreference', () => {
  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('falls back to system when localStorage does not expose getItem', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {},
    });

    expect(getStoredThemePreference()).toBe('system');
  });

  it('does not throw when persisting without a usable setItem method', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {},
    });

    expect(() => persistThemePreference('dark')).not.toThrow();
  });

  it('reads and persists valid theme preferences with a storage implementation', () => {
    const getItem = vi.fn(() => 'light');
    const setItem = vi.fn();

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem, setItem },
    });

    expect(getStoredThemePreference()).toBe('light');

    persistThemePreference('dark');

    expect(getItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY);
    expect(setItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, 'dark');
  });
});
