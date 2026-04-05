const STORAGE_KEY = 'fab-arena-sound-settings';

const defaults = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  musicEnabled: true,
  sfxEnabled: true,
};

let cached = null;

export function getSoundSettings() {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    cached = { ...defaults };
  }
  return cached;
}

export function saveSoundSettings(settings) {
  cached = { ...cached, ...settings };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {}
}

export function getEffectiveMusicVolume() {
  const s = getSoundSettings();
  return s.musicEnabled ? s.masterVolume * s.musicVolume : 0;
}

export function getEffectiveSfxVolume() {
  const s = getSoundSettings();
  return s.sfxEnabled ? s.masterVolume * s.sfxVolume : 0;
}
