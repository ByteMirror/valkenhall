import { useRef, useEffect, useCallback } from 'preact/hooks';

/*
 * Ambient particle overlay for the Arena Hub.
 * Three particle types layered for depth:
 *   - Embers:  warm gold/orange, rise slowly, medium opacity
 *   - Dust:    faint gold, drift lazily with noise, very low opacity
 *   - Sparks:  rare cool-blue flickers, bright and brief
 *
 * Uses a pre-rendered glow sprite for performance instead of
 * creating radial gradients per particle per frame.
 */

const PRESETS = {
  hub: {
    maxParticles: 400,
    emberRatio: 0.35, dustRatio: 0.55, sparkRatio: 0.10,
    emberColors: [[212,160,67],[200,140,50],[255,140,40],[220,170,80]],
    dustColors: [[180,140,60],[160,130,70],[140,120,80]],
    sparkColors: [[120,160,220],[100,180,240],[200,200,255],[212,168,67]],
  },
  store: {
    maxParticles: 600,
    emberRatio: 0.30, dustRatio: 0.45, sparkRatio: 0.25,
    emberColors: [[200,150,60],[180,120,40],[220,170,50],[160,100,200]],
    dustColors: [[140,100,180],[100,160,120],[160,140,60],[120,80,160]],
    sparkColors: [[160,80,220],[80,200,140],[220,180,60],[200,100,255],[100,220,160]],
    emberLifeScale: 1.6,
    dustLifeScale: 1.4,
    sparkLifeScale: 1.8,
    speedScale: 0.6,
  },
  deckbuilder: {
    maxParticles: 300,
    emberRatio: 0.10, dustRatio: 0.85, sparkRatio: 0.05,
    emberColors: [[200,160,80],[180,140,60],[160,120,50]],
    dustColors: [[180,155,100],[160,140,90],[140,120,80],[155,135,95]],
    sparkColors: [[220,190,100],[200,170,80]],
    emberLifeScale: 1.8,
    dustLifeScale: 2.0,
    sparkLifeScale: 1.5,
    speedScale: 0.35,
    dustAlphaMax: 0.15,
    emberAlphaMax: 0.20,
    sparkAlphaMax: 0.25,
    dustSizeMax: 3.5,
    emberSizeMax: 2.5,
  },
  auction: {
    maxParticles: 600,
    emberRatio: 0.10, dustRatio: 0.85, sparkRatio: 0.05,
    // Warm, earthy tones — thick dust caught in torchlight
    emberColors: [[200,160,80],[180,140,60],[160,120,50]],
    dustColors: [[180,155,100],[160,140,90],[140,120,80],[155,135,95],[170,150,105],[130,110,75]],
    sparkColors: [[220,190,100],[200,170,80]],
    emberLifeScale: 1.8,
    dustLifeScale: 2.0,
    sparkLifeScale: 1.5,
    speedScale: 0.4,
    dustAlphaMax: 0.22,
    emberAlphaMax: 0.30,
    sparkAlphaMax: 0.35,
    dustSizeMax: 4.5,
    emberSizeMax: 3.5,
  },
};

function getPreset(name) {
  return PRESETS[name] || PRESETS.hub;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function initParticle(p, w, h, type, preset) {
  p.type = type;
  p.age = 0;
  const spd = preset.speedScale || 1;

  if (type === 'ember') {
    p.x = Math.random() * w;
    p.y = h * 0.6 + Math.random() * h * 0.4;
    p.vx = (Math.random() - 0.5) * 8 * spd;
    p.vy = lerp(-15, -40, Math.random()) * spd;
    p.life = lerp(4, 9, Math.random()) * (preset.emberLifeScale || 1);
    p.size = lerp(1.5, preset.emberSizeMax || 4, Math.random());
    p.glowSize = p.size * lerp(4, 7, Math.random());
    const c = pick(preset.emberColors);
    p.r = c[0]; p.g = c[1]; p.b = c[2];
    p.maxAlpha = lerp(0.15 * (preset.emberAlphaMax ? preset.emberAlphaMax / 0.45 : 1), preset.emberAlphaMax || 0.45, Math.random());
    p.driftAmp = lerp(15, 40, Math.random());
    p.driftFreq = lerp(0.3, 0.8, Math.random());
    p.driftPhase = Math.random() * Math.PI * 2;
    p.flickerSpeed = lerp(2, 6, Math.random());
  } else if (type === 'dust') {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.vx = (Math.random() - 0.5) * 4 * spd;
    p.vy = (Math.random() - 0.5) * 3 * spd;
    p.life = lerp(8, 18, Math.random()) * (preset.dustLifeScale || 1);
    p.size = lerp(1, preset.dustSizeMax || 3, Math.random());
    p.glowSize = p.size * lerp(3, 5, Math.random());
    const c = pick(preset.dustColors);
    p.r = c[0]; p.g = c[1]; p.b = c[2];
    p.maxAlpha = lerp(0.03, preset.dustAlphaMax || 0.12, Math.random());
    p.driftAmp = lerp(20, 60, Math.random());
    p.driftFreq = lerp(0.1, 0.3, Math.random());
    p.driftPhase = Math.random() * Math.PI * 2;
    p.flickerSpeed = lerp(0.5, 1.5, Math.random());
  } else {
    // spark
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.vx = (Math.random() - 0.5) * 20 * spd;
    p.vy = lerp(-10, -30, Math.random()) * spd;
    p.life = lerp(0.4, 1.2, Math.random()) * (preset.sparkLifeScale || 1);
    p.size = lerp(0.8, 2, Math.random());
    p.glowSize = p.size * lerp(6, 10, Math.random());
    const c = pick(preset.sparkColors);
    p.r = c[0]; p.g = c[1]; p.b = c[2];
    p.maxAlpha = lerp(0.3 * (preset.sparkAlphaMax ? preset.sparkAlphaMax / 0.7 : 1), preset.sparkAlphaMax || 0.7, Math.random());
    p.driftAmp = lerp(5, 15, Math.random());
    p.driftFreq = lerp(1, 3, Math.random());
    p.driftPhase = Math.random() * Math.PI * 2;
    p.flickerSpeed = lerp(8, 15, Math.random());
  }
}

function createPool(w, h, preset) {
  const pool = new Array(preset.maxParticles);
  const emberCount = Math.floor(preset.maxParticles * preset.emberRatio);
  const dustCount = Math.floor(preset.maxParticles * preset.dustRatio);

  for (let i = 0; i < preset.maxParticles; i++) {
    const p = {};
    const type = i < emberCount ? 'ember' : i < emberCount + dustCount ? 'dust' : 'spark';
    initParticle(p, w, h, type, preset);
    // Stagger initial age so particles don't all spawn at once
    p.age = Math.random() * p.life * 0.8;
    pool[i] = p;
  }
  return pool;
}

// Pre-render a soft glow sprite on an offscreen canvas
function createGlowSprite(size) {
  const s = size * 2;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size, size, 0, size, size, size);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.6)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  return c;
}

export default function AmbientParticles({ preset: presetName = 'hub' }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const presetRef = useRef(getPreset(presetName));

  const tick = useCallback(() => {
    const s = stateRef.current;
    if (!s || !s.running) return;

    const now = performance.now();
    const dt = Math.min((now - s.lastTime) / 1000, 0.05);
    s.lastTime = now;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const pool = s.pool;
    const glow = s.glowSprite;
    const gs = glow.width;

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      p.age += dt;

      // Recycle dead particles
      if (p.age >= p.life) {
        initParticle(p, w, h, p.type, presetRef.current);
        continue;
      }

      const lifeRatio = p.age / p.life;

      // Bell-curve fade: ramp up first 15%, sustain, ramp down last 30%
      let alpha;
      if (lifeRatio < 0.15) {
        alpha = (lifeRatio / 0.15) * p.maxAlpha;
      } else if (lifeRatio > 0.7) {
        alpha = ((1 - lifeRatio) / 0.3) * p.maxAlpha;
      } else {
        alpha = p.maxAlpha;
      }

      // Flicker
      alpha *= 0.7 + 0.3 * Math.sin(p.age * p.flickerSpeed + p.driftPhase);

      // Movement
      const driftX = Math.sin(p.age * p.driftFreq + p.driftPhase) * p.driftAmp * dt;
      const driftY = Math.cos(p.age * p.driftFreq * 0.7 + p.driftPhase + 1) * p.driftAmp * 0.3 * dt;
      p.x += p.vx * dt + driftX;
      p.y += p.vy * dt + driftY;

      // Draw using pre-rendered glow sprite, tinted
      const drawSize = p.glowSize * 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(glow, p.x - drawSize / 2, p.y - drawSize / 2, drawSize, drawSize);

      // Tint: draw a tiny solid core for color
      ctx.globalAlpha = alpha * 1.2;
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Reinit pool on resize to spread particles across new dimensions
      if (stateRef.current) {
        stateRef.current.pool = createPool(canvas.width, canvas.height, presetRef.current);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    stateRef.current = {
      pool: createPool(canvas.width, canvas.height, presetRef.current),
      glowSprite: createGlowSprite(32),
      lastTime: performance.now(),
      running: true,
    };

    requestAnimationFrame(tick);

    return () => {
      if (stateRef.current) {
        stateRef.current.running = false;
        stateRef.current.pool = null;
        stateRef.current.glowSprite = null;
        stateRef.current = null;
      }
      window.removeEventListener('resize', resize);
    };
  }, [tick]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 2 }}
    />
  );
}
