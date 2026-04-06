import { getLocalApiOrigin } from '../localApi';
import { getEffectiveMusicVolume } from './soundSettings';

let currentAudio = null;
let currentTrack = null;
let fadeInTimer = null;
let fadeOutTimer = null;
// Track all audio objects ever created so we can kill orphans
const allAudios = new Set();

function getTrackUrl(track) {
  const base = getLocalApiOrigin();
  const tracks = {
    'arena-hub': `${base}/game-assets/snd-arena-hub-music.mp3`,
    'arena-store': `${base}/game-assets/snd-arena-store-music.mp3`,
    'arena-deckbuilder': `${base}/game-assets/snd-arena-deckbuilder-music.mp3`,
    'arena-match': `${base}/game-assets/snd-arena-match-music.mp3`,
  };
  return tracks[track] || null;
}

function easeFade(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function killAllExcept(keepAudio) {
  for (const audio of allAudios) {
    if (audio !== keepAudio) {
      try { audio.pause(); } catch {}
      allAudios.delete(audio);
    }
  }
}

function fadeAudio(audio, fromVol, toVol, duration, onDone) {
  const steps = 40;
  const stepTime = duration / steps;
  let step = 0;
  return setInterval(() => {
    step++;
    if (step >= steps) {
      audio.volume = toVol;
      if (onDone) onDone();
      return;
    }
    const progress = easeFade(step / steps);
    audio.volume = fromVol + (toVol - fromVol) * progress;
  }, stepTime);
}

export function playMusic(track, { fadeInDuration = 3000 } = {}) {
  const targetVolume = getEffectiveMusicVolume();
  if (targetVolume <= 0) return;

  // Already playing this exact track — do nothing
  if (currentTrack === track && currentAudio && !currentAudio.paused) return;

  // Clear any pending fades
  clearInterval(fadeInTimer);
  clearInterval(fadeOutTimer);
  fadeInTimer = null;
  fadeOutTimer = null;

  // Fade out the current track
  const oldAudio = currentAudio;
  if (oldAudio) {
    const oldVol = oldAudio.volume;
    fadeOutTimer = fadeAudio(oldAudio, oldVol, 0, 2000, () => {
      clearInterval(fadeOutTimer);
      fadeOutTimer = null;
      oldAudio.pause();
      allAudios.delete(oldAudio);
    });
  }

  // Kill any orphaned audio objects from previous rapid transitions
  const url = getTrackUrl(track);
  if (!url) return;

  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = 0;

  // Set as current BEFORE play to prevent race conditions
  currentAudio = audio;
  currentTrack = track;
  // Kill orphans but spare the old audio that's fading out
  for (const a of allAudios) {
    if (a !== audio && a !== oldAudio) {
      try { a.pause(); } catch {}
      allAudios.delete(a);
    }
  }
  allAudios.add(audio);

  audio.play().catch(() => {
    // Autoplay blocked — retry on user gesture AND periodically.
    // Desktop CEF sometimes allows play after a short delay even
    // without a visible click (e.g. after initial page load settles).
    let retryTimer = null;
    const resume = () => {
      if (currentAudio !== audio) {
        cleanup();
        return;
      }
      if (audio.paused) {
        audio.play().then(cleanup).catch(() => {});
      } else {
        cleanup();
      }
    };
    const cleanup = () => {
      clearInterval(retryTimer);
      retryTimer = null;
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('mousemove', resume);
    };
    retryTimer = setInterval(resume, 500);
    document.addEventListener('click', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
    document.addEventListener('pointerdown', resume, { once: true });
    document.addEventListener('mousemove', resume, { once: true });
  });

  // Fade in
  fadeInTimer = fadeAudio(audio, 0, targetVolume, fadeInDuration, () => {
    clearInterval(fadeInTimer);
    fadeInTimer = null;
  });
}

export function stopMusic(fadeOutDuration = 2000) {
  clearInterval(fadeInTimer);
  fadeInTimer = null;

  if (!currentAudio) {
    // Kill any orphans that might still be playing
    killAllExcept(null);
    return;
  }

  const audio = currentAudio;
  currentAudio = null;
  currentTrack = null;

  if (fadeOutDuration <= 0) {
    audio.pause();
    allAudios.delete(audio);
    killAllExcept(null);
    return;
  }

  clearInterval(fadeOutTimer);
  const startVol = audio.volume;
  fadeOutTimer = fadeAudio(audio, startVol, 0, fadeOutDuration, () => {
    clearInterval(fadeOutTimer);
    fadeOutTimer = null;
    audio.pause();
    allAudios.delete(audio);
    killAllExcept(null);
  });
}

export function updateMusicVolume() {
  if (!currentAudio || currentAudio.paused) return;
  currentAudio.volume = getEffectiveMusicVolume();
}

export function getCurrentTrack() {
  return currentTrack;
}
