// Procedural game sound effects via Web Audio API — zero noise, instant playback

let ctx = null;
let volume = 0.5;
let muted = false;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

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

function cardPlace() {
  const ac = getCtx();
  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume * 0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  gain.connect(ac.destination);

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.5;
  filter.connect(gain);

  const noise = whiteNoise(ac, 0.09);
  noise.connect(filter);
  noise.start(now);
  noise.stop(now + 0.09);
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

function cardShuffle() {
  const ac = getCtx();
  const now = ac.currentTime;

  for (let i = 0; i < 6; i++) {
    const t = now + i * 0.045 + Math.random() * 0.015;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume * (0.12 + Math.random() * 0.08), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    gain.connect(ac.destination);

    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000 + Math.random() * 2000;
    filter.Q.value = 0.6;
    filter.connect(gain);

    const noise = whiteNoise(ac, 0.04);
    noise.connect(filter);
    noise.start(t);
    noise.stop(t + 0.04);
  }
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

function cardDraw() {
  const ac = getCtx();
  const now = ac.currentTime;

  // Quick slide sound (card being pulled from pile)
  const slideGain = ac.createGain();
  slideGain.gain.setValueAtTime(0.0001, now);
  slideGain.gain.exponentialRampToValueAtTime(volume * 0.25, now + 0.02);
  slideGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  slideGain.connect(ac.destination);

  const slideFilter = ac.createBiquadFilter();
  slideFilter.type = 'bandpass';
  slideFilter.frequency.setValueAtTime(2000, now);
  slideFilter.frequency.exponentialRampToValueAtTime(4500, now + 0.12);
  slideFilter.Q.value = 0.6;
  slideFilter.connect(slideGain);

  const slideNoise = whiteNoise(ac, 0.12);
  slideNoise.connect(slideFilter);
  slideNoise.start(now);
  slideNoise.stop(now + 0.12);

  // Subtle rising tone (satisfying "whoosh" feeling)
  const toneGain = ac.createGain();
  toneGain.gain.setValueAtTime(volume * 0.06, now + 0.02);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  toneGain.connect(ac.destination);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, now + 0.02);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
  osc.connect(toneGain);
  osc.start(now + 0.02);
  osc.stop(now + 0.15);
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

const SOUNDS = { cardPickup, cardPlace, cardFlip, cardDraw, cardShuffle, diceRoll, uiClick };

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
  // AudioContext is created lazily on first playSound — nothing to preload
}
