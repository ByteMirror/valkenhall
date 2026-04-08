import { getLocalApiOrigin } from '../localApi';

/**
 * Local-only ambient sound layer for the game board.
 * One track plays at a time, loops seamlessly, and is completely separate
 * from the music/SFX channels. Never synced to the other player — purely
 * local atmosphere for this client.
 *
 * Volume uses a sqrt curve so the lower half of the slider feels louder:
 * slider 0.5 → gain 0.707, slider 1.0 → gain 1.0. That matches the intent
 * that "70% is the new 50%" compared to a linear mapping.
 */

export const AMBIENCE_TRACKS = [
  { id: 'forest',         label: 'Forest',         file: 'snd-ambience-forest.mp3' },
  { id: 'pasture',        label: 'Pasture',        file: 'snd-ambience-pasture.mp3' },
  { id: 'beach',          label: 'Beach',          file: 'snd-ambience-beach.mp3' },
  { id: 'underwater',     label: 'Underwater',     file: 'snd-ambience-underwater.mp3' },
  { id: 'swamp',          label: 'Swamp',          file: 'snd-ambience-swamp.mp3' },
  { id: 'cave',           label: 'Cave',           file: 'snd-ambience-cave.mp3' },
  { id: 'dungeon',        label: 'Dungeon',        file: 'snd-ambience-dungeon.mp3' },
  { id: 'snowy-mountain', label: 'Snowy Mountain', file: 'snd-ambience-snowy-mountain.mp3' },
];

const STORAGE_KEY = 'valkenhall-ambience-settings';
const DEFAULT_TRACK_ID = 'forest';
const DEFAULT_VOLUME = 0.5;

let state = null;
let audio = null;
let isPlaying = false;
const listeners = new Set();

function loadState() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    state = {
      trackId: AMBIENCE_TRACKS.some((t) => t.id === parsed.trackId) ? parsed.trackId : DEFAULT_TRACK_ID,
      volume: typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_VOLUME,
    };
  } catch {
    state = { trackId: DEFAULT_TRACK_ID, volume: DEFAULT_VOLUME };
  }
  return state;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function notify() {
  for (const fn of listeners) fn();
}

function effectiveVolume() {
  const v = Math.max(0, Math.min(1, loadState().volume));
  return Math.sqrt(v);
}

function trackUrl(file) {
  return `${getLocalApiOrigin()}/game-assets/${file}`;
}

function getCurrentTrack() {
  const s = loadState();
  return AMBIENCE_TRACKS.find((t) => t.id === s.trackId) || AMBIENCE_TRACKS[0];
}

function destroyAudio() {
  if (audio) {
    try { audio.pause(); } catch {}
    audio.src = '';
    audio = null;
  }
}

export function getAmbienceState() {
  const s = loadState();
  return {
    trackId: s.trackId,
    volume: s.volume,
    isPlaying,
  };
}

export function subscribeAmbience(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function playAmbience() {
  const track = getCurrentTrack();
  if (!audio || audio.dataset.trackId !== track.id) {
    destroyAudio();
    audio = new Audio(trackUrl(track.file));
    audio.loop = true;
    audio.dataset.trackId = track.id;
  }
  audio.volume = effectiveVolume();

  const playingAudio = audio;
  audio.play().catch(() => {
    // Autoplay blocked — retry on next user gesture.
    const resume = () => {
      if (audio === playingAudio && audio.paused) {
        audio.play().catch(() => {});
      }
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
    };
    document.addEventListener('pointerdown', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
  });

  isPlaying = true;
  notify();
}

export function pauseAmbience() {
  if (audio) {
    try { audio.pause(); } catch {}
  }
  isPlaying = false;
  notify();
}

export function toggleAmbience() {
  if (isPlaying) pauseAmbience();
  else playAmbience();
}

/** Teardown used when leaving the game board. */
export function stopAmbience({ silent = false } = {}) {
  destroyAudio();
  isPlaying = false;
  if (!silent) notify();
}

export function setAmbienceTrack(trackId) {
  const s = loadState();
  if (!AMBIENCE_TRACKS.some((t) => t.id === trackId) || s.trackId === trackId) return;
  s.trackId = trackId;
  persist();
  if (isPlaying) {
    destroyAudio();
    playAmbience();
  } else {
    notify();
  }
}

export function setAmbienceVolume(volume) {
  const s = loadState();
  s.volume = Math.max(0, Math.min(1, volume));
  persist();
  if (audio) audio.volume = effectiveVolume();
  notify();
}
