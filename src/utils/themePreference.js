export const THEME_PREFERENCE_STORAGE_KEY = 'fab-builder-theme-preference';

export const THEME_PREFERENCES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

function isThemePreference(value) {
  return THEME_PREFERENCES.some((option) => option.id === value);
}

export function getStoredThemePreference() {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const storage = window.localStorage;

  if (!storage || typeof storage.getItem !== 'function') {
    return 'system';
  }

  const storedPreference = storage.getItem(THEME_PREFERENCE_STORAGE_KEY);
  return isThemePreference(storedPreference) ? storedPreference : 'system';
}

export function getSystemThemePreference() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveThemePreference(themePreference) {
  return themePreference === 'system' ? getSystemThemePreference() : themePreference;
}

export function persistThemePreference(themePreference) {
  if (typeof window === 'undefined') {
    return;
  }

  const storage = window.localStorage;

  if (!storage || typeof storage.setItem !== 'function') {
    return;
  }

  storage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);
}

export function applyThemePreference(themePreference) {
  const resolvedThemePreference = resolveThemePreference(themePreference);

  if (typeof document === 'undefined') {
    return resolvedThemePreference;
  }

  const rootElement = document.documentElement;

  rootElement.classList.toggle('dark', resolvedThemePreference === 'dark');
  rootElement.style.colorScheme = resolvedThemePreference;
  rootElement.dataset.themePreference = themePreference;

  return resolvedThemePreference;
}
