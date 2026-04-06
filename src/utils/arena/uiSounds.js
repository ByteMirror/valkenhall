import { getLocalApiOrigin } from '../localApi';
import { getEffectiveSfxVolume } from './soundSettings';

const audioCache = new Map();
const lastPlayTime = new Map();
const MIN_INTERVAL_MS = 50;

function getAudioUrl(filename) {
  return `${getLocalApiOrigin()}/game-assets/${filename}`;
}

function preload(filename) {
  if (audioCache.has(filename)) return;
  const audio = new Audio(getAudioUrl(filename));
  audio.preload = 'auto';
  audioCache.set(filename, audio);
}

// Track whether a sound was explicitly played during the current event cycle
let soundPlayedThisFrame = false;

export function playUI(filename, { volume: volOverride, debounce = MIN_INTERVAL_MS } = {}) {
  const sfxVol = getEffectiveSfxVolume();
  if (sfxVol <= 0) return;

  const now = Date.now();
  const last = lastPlayTime.get(filename) || 0;
  if (now - last < debounce) return;
  lastPlayTime.set(filename, now);

  soundPlayedThisFrame = true;
  // Reset flag next microtask so global listener can check it
  Promise.resolve().then(() => { soundPlayedThisFrame = false; });

  try {
    const vol = (volOverride ?? 1) * sfxVol;
    const cached = audioCache.get(filename);
    const audio = cached ? cached.cloneNode() : new Audio(getAudioUrl(filename));
    audio.volume = Math.min(1, vol);
    audio.play().catch(() => {});
  } catch {}
}

// Sound constants
export const UI = {
  CLICK:          'snd-ui-click.mp3',
  CLICK_ALT:      'snd-ui-click-2.mp3',
  CLICK_SOFT:     'snd-ui-click-soft.mp3',
  CONFIRM:        'snd-ui-confirm.mp3',
  CANCEL:         'snd-ui-cancel.mp3',
  ERROR:          'snd-ui-error.mp3',
  OPEN:           'snd-ui-open.mp3',
  CLOSE:          'snd-ui-close.mp3',
  TRANSITION:     'snd-ui-transition.mp3',
  SCROLL:         'snd-ui-scroll.mp3',
  SWIPE:          'snd-ui-swipe.mp3',
  WHOOSH:         'snd-ui-whoosh.mp3',
  NOTIFICATION:   'snd-ui-notification.mp3',
  EQUIP:          'snd-ui-equip.mp3',
  UNEQUIP:        'snd-ui-unequip.mp3',
  DELETE:          'snd-ui-delete.mp3',
  PURCHASE:       'snd-ui-purchase.mp3',
  GOLD:           'snd-ui-gold.mp3',
  CHEST_OPEN:     'snd-ui-chest-open.mp3',
  LEVEL_UP:       'snd-ui-levelup.mp3',
  ACHIEVEMENT:    'snd-ui-achievement.mp3',
  FOIL_REVEAL:    'snd-ui-foil-reveal.mp3',
  UPGRADE:        'snd-ui-upgrade.mp3',
  MAIL_SEND:      'snd-ui-mail-send.mp3',
  MAIL_RECEIVE:   'snd-ui-mail-receive.mp3',
  MAIL_DELETE:    'snd-ui-mail-delete.mp3',
  MAIL_COLLECT:  'snd-ui-mail-collect.mp3',
  INTERACT:       'snd-ui-interact.mp3',
  ITEM:           'snd-ui-item.mp3',
  MATCH_START:    'snd-ui-match-start.mp3',
  SLIDER:         'snd-ui-slider.mp3',
  HOVER:          'snd-ui-hover.mp3',
  DRAG_START:     'snd-ui-drag-start.mp3',
  DRAG_DROP:      'snd-ui-drag-drop.mp3',
  INSPECTOR_OPEN: 'snd-ui-inspector-open.mp3',
  INSPECTOR_CLOSE:'snd-ui-inspector-close.mp3',
};

// ── Global listeners ────────────────────────────────

let installed = false;

function handleGlobalClick(e) {
  const btn = e.target.closest?.('button, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="tab"], summary, a[href]');
  if (!btn) return;
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

  const sound = btn.getAttribute('data-sound');
  if (sound === 'none') return;

  // Defer to next microtask so component onClick handlers run first
  // and can set soundPlayedThisFrame via playUI()
  Promise.resolve().then(() => {
    if (!soundPlayedThisFrame) {
      playUI(sound || UI.CLICK, { volume: 0.7 });
    }
  });
}

// Scroll sound
let scrollAudio = null;
let scrollStopTimer = null;

function handleGlobalScroll(e) {
  const el = e.target;
  if (!(el instanceof HTMLElement) || el === document.documentElement) return;

  if (!scrollAudio || scrollAudio.paused) {
    const sfxVol = getEffectiveSfxVolume();
    if (sfxVol <= 0) return;
    try {
      scrollAudio = new Audio(getAudioUrl(UI.SCROLL));
      scrollAudio.loop = true;
      scrollAudio.volume = sfxVol * 0.25;
      scrollAudio.play().catch(() => {});
    } catch {}
  }

  clearTimeout(scrollStopTimer);
  scrollStopTimer = setTimeout(() => {
    if (scrollAudio) {
      scrollAudio.pause();
      scrollAudio.currentTime = 0;
      scrollAudio = null;
    }
  }, 150);
}

// Slider sound
let sliderAudio = null;
let sliderStopTimer = null;

function handleGlobalInput(e) {
  if (e.target?.type !== 'range') return;

  if (!sliderAudio || sliderAudio.paused) {
    const sfxVol = getEffectiveSfxVolume();
    if (sfxVol <= 0) return;
    try {
      sliderAudio = new Audio(getAudioUrl(UI.SLIDER));
      sliderAudio.loop = true;
      sliderAudio.volume = sfxVol * 0.3;
      sliderAudio.play().catch(() => {});
    } catch {}
  }

  clearTimeout(sliderStopTimer);
  sliderStopTimer = setTimeout(() => {
    if (sliderAudio) {
      sliderAudio.pause();
      sliderAudio.currentTime = 0;
      sliderAudio = null;
    }
  }, 120);
}

function installGlobalListeners() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', handleGlobalClick, true);
  document.addEventListener('scroll', handleGlobalScroll, { capture: true, passive: true });
  document.addEventListener('input', handleGlobalInput, { capture: true, passive: true });
}

export function preloadUISounds() {
  for (const filename of Object.values(UI)) {
    preload(filename);
  }
  installGlobalListeners();
}
