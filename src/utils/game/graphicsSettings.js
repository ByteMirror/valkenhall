const STORAGE_KEY = 'fab-graphics-settings';

// Render scale presets. `factor` scales the baseline pixel ratio used by
// the WebGL renderer. `high` matches the legacy default — `low`/`medium`
// reduce GPU cost for weaker hardware; `ultra` super-samples for sharper
// visuals on capable machines.
export const RESOLUTION_PRESETS = {
  low: { label: 'Low (50%)', factor: 0.5 },
  medium: { label: 'Medium (75%)', factor: 0.75 },
  high: { label: 'High (100%)', factor: 1.0 },
  ultra: { label: 'Ultra (150%)', factor: 1.5 },
};

const defaults = {
  resolution: 'high',
};

let cached = null;
const listeners = new Set();

export function getGraphicsSettings() {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    cached = { ...defaults };
  }
  if (!RESOLUTION_PRESETS[cached.resolution]) cached.resolution = defaults.resolution;
  return cached;
}

export function saveGraphicsSettings(patch) {
  cached = { ...getGraphicsSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {}
  for (const fn of listeners) fn(cached);
}

export function onGraphicsChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// `high` returns the legacy `min(devicePixelRatio, 1.5)` baseline. Other
// presets scale that baseline so the relationship to the user's display
// is preserved across hardware (a retina screen on `low` still beats a
// non-retina screen on `high`).
export function getEffectivePixelRatio() {
  const preset = RESOLUTION_PRESETS[getGraphicsSettings().resolution] || RESOLUTION_PRESETS.high;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const baseline = Math.min(dpr, 1.5);
  return baseline * preset.factor;
}
