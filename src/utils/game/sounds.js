// Game sound effects. Most are procedural Web Audio API for instant
// playback with zero noise; the card shuffle / draw / place sounds use
// real recorded samples loaded from /game-assets/ for a higher-quality
// tactile feel — those are routed through playSampleRandom().

import { getEffectiveSfxVolume } from '../arena/soundSettings';
import { getLocalApiOrigin } from '../localApi';

let ctx = null;
let volume = 0.5;
let muted = false;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// --- Recorded sample playback -------------------------------------

const sampleCache = new Map();

function getSampleUrl(filename) {
  return `${getLocalApiOrigin()}/game-assets/${filename}`;
}

function preloadSample(filename) {
  if (sampleCache.has(filename)) return;
  const audio = new Audio(getSampleUrl(filename));
  audio.preload = 'auto';
  sampleCache.set(filename, audio);
}

/**
 * Play one randomly chosen filename from `filenames` at the given gain.
 * Each invocation clones the cached Audio so overlapping plays don't
 * truncate one another (useful for staggered multi-card draws).
 */
function playSampleRandom(filenames, gain = 1) {
  if (muted) return;
  const sfxVol = getEffectiveSfxVolume();
  if (sfxVol <= 0) return;
  const filename = filenames[Math.floor(Math.random() * filenames.length)];
  try {
    const cached = sampleCache.get(filename);
    const audio = cached ? cached.cloneNode() : new Audio(getSampleUrl(filename));
    audio.volume = Math.min(1, gain * sfxVol);
    audio.play().catch(() => {});
  } catch {}
}

const SHUFFLE_LIGHT_FILES = [
  'snd-card-shuffle-light-1.mp3',
  'snd-card-shuffle-light-2.mp3',
  'snd-card-shuffle-light-3.mp3',
];
const SHUFFLE_FILES = [
  'snd-card-shuffle-1.mp3',
  'snd-card-shuffle-3.mp3',
];
const DEAL_FILES = [
  'snd-card-deal-1.mp3',
  'snd-card-deal-2.mp3',
  'snd-card-deal-3.mp3',
];
const DEAL_SMALL_FILES = ['snd-card-deal-small-1.mp3'];

function cardShuffleAtlas() { playSampleRandom(SHUFFLE_LIGHT_FILES); }
function cardShuffleSpellbook() { playSampleRandom(SHUFFLE_FILES); }
function cardPlaceSample() { playSampleRandom(DEAL_SMALL_FILES); }
function cardDrawSample() { playSampleRandom(DEAL_FILES); }

function makeGain(ac, vol) {
  const g = ac.createGain();
  g.gain.value = vol * volume;
  g.connect(ac.destination);
  return g;
}

function whiteNoise(ac, duration) {
  const samples = ac.sampleRate * duration;
  const buffer = ac.createBuffer(1, samples, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  return src;
}

// ─── Sound definitions ───

function cardPickup() {
  const ac = getCtx();
  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume * 0.3, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  gain.connect(ac.destination);

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3500;
  filter.Q.value = 0.8;
  filter.connect(gain);

  const noise = whiteNoise(ac, 0.06);
  noise.connect(filter);
  noise.start(now);
  noise.stop(now + 0.06);
}

function cardFlip() {
  const ac = getCtx();
  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume * 0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  gain.connect(ac.destination);

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 1.2;
  filter.connect(gain);

  const noise = whiteNoise(ac, 0.05);
  noise.connect(filter);
  noise.start(now);
  noise.stop(now + 0.05);
}

function diceRoll() {
  const ac = getCtx();
  const now = ac.currentTime;

  // Series of short impacts with decreasing energy
  for (let i = 0; i < 5; i++) {
    const t = now + i * 0.07 + Math.random() * 0.03;
    const energy = 1 - i * 0.18;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume * 0.25 * energy, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    gain.connect(ac.destination);

    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200 + Math.random() * 1500;
    filter.Q.value = 1.0;
    filter.connect(gain);

    const noise = whiteNoise(ac, 0.06);
    noise.connect(filter);
    noise.start(t);
    noise.stop(t + 0.06);
  }
}

function uiClick() {
  const ac = getCtx();
  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume * 0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  gain.connect(ac.destination);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.04);
}

// ─── Public API ───

const SOUNDS = {
  cardPickup,
  cardFlip,
  diceRoll,
  uiClick,
  // Recorded samples — see playSampleRandom() above
  cardPlace: cardPlaceSample,
  cardDraw: cardDrawSample,
  cardShuffleSpellbook,
  cardShuffleAtlas,
};

export function playSound(name) {
  if (muted) return;
  const fn = SOUNDS[name];
  if (fn) fn();
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
}

export function setMuted(m) {
  muted = m;
}

export function isMuted() {
  return muted;
}

export function preloadSounds() {
  // AudioContext is created lazily on first procedural playSound. The
  // recorded samples DO benefit from preloading so the first shuffle /
  // draw / place doesn't have a network/decode hitch.
  for (const f of [
    ...SHUFFLE_LIGHT_FILES,
    ...SHUFFLE_FILES,
    ...DEAL_FILES,
    ...DEAL_SMALL_FILES,
  ]) {
    preloadSample(f);
  }
}
