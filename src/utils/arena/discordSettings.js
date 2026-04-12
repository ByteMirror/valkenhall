// Discord integration preferences — persisted to localStorage.
// Follows the same pattern as soundSettings.js.

const STORAGE_KEY = 'fab-arena-discord-settings';

const defaults = {
  showActivity: true,       // Send Rich Presence to Discord at all
  allowSpectators: true,    // Default for new game sessions — show Join button
};

let cached = null;

export function getDiscordSettings() {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    cached = { ...defaults };
  }
  return cached;
}

export function saveDiscordSettings(settings) {
  cached = { ...cached, ...settings };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {}
}
