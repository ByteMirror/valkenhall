export function getStoredThemePreference() {
  return 'dark';
}

export function persistThemePreference() {}

export function applyThemePreference() {
  if (typeof document === 'undefined') return 'dark';
  document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = 'dark';
  return 'dark';
}
