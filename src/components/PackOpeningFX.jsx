import { useRef, useEffect, useCallback } from 'preact/hooks';

function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

function spawnBurst(cx, cy, particles) {
  // Sparks — fast radial explosion
  for (let i = 0; i < 35; i++) {
    const angle = (Math.PI * 2 * i) / 35 + (Math.random() - 0.5) * 0.4;
    const speed = lerp(350, 700, Math.random());
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: lerp(0.2, 0.6, Math.random()),
      maxLife: 0,
      radius: lerp(1, 3.5, Math.random()),
      color: ['#FFFFFF', '#FFF5CC', '#FFD700', '#FFEC80'][Math.floor(Math.random() * 4)],
      alpha: lerp(0.8, 1, Math.random()),
      type: 'spark',
      gravity: 0,
      drift: 0,
      driftOffset: 0,
    });
  }
  // Embers — slower, float upward
  for (let i = 0; i < 25; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = lerp(60, 180, Math.random());
    particles.push({
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: lerp(1.2, 3.0, Math.random()),
      maxLife: 0,
      radius: lerp(2, 5, Math.random()),
      color: ['#FF8C00', '#FF6600', '#FFB347', '#FFA500'][Math.floor(Math.random() * 4)],
      alpha: lerp(0.5, 0.9, Math.random()),
      type: 'ember',
      gravity: -40,
      drift: lerp(0.3, 0.8, Math.random()),
      driftOffset: Math.random() * Math.PI * 2,
    });
  }
  // Dust motes — linger and float
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = lerp(15, 50, Math.random());
    particles.push({
      x: cx + (Math.random() - 0.5) * 100,
      y: cy + (Math.random() - 0.5) * 100,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: lerp(2.5, 5.0, Math.random()),
      maxLife: 0,
      radius: lerp(1, 2.5, Math.random()),
      color: ['#FFD700', '#FFC107', '#FFE082'][Math.floor(Math.random() * 3)],
      alpha: lerp(0.15, 0.4, Math.random()),
      type: 'dust',
      gravity: -12,
      drift: lerp(0.2, 0.5, Math.random()),
      driftOffset: Math.random() * Math.PI * 2,
    });
  }
  particles.forEach((p) => { if (!p.maxLife) p.maxLife = p.life; });
}

function spawnAmbientEmbers(cx, cy, w, h, particles, count = 8) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: cx + (Math.random() - 0.5) * w * 0.8,
      y: cy + Math.random() * h * 0.3,
      vx: (Math.random() - 0.5) * 15,
      vy: lerp(-20, -50, Math.random()),
      life: lerp(2, 4, Math.random()),
      maxLife: 0,
      radius: lerp(1, 3, Math.random()),
      color: ['#FF8C00', '#FFB347', '#FFD700'][Math.floor(Math.random() * 3)],
      alpha: lerp(0.2, 0.5, Math.random()),
      type: 'ember',
      gravity: -8,
      drift: lerp(0.2, 0.6, Math.random()),
      driftOffset: Math.random() * Math.PI * 2,
    });
  }
  particles.forEach((p) => { if (!p.maxLife) p.maxLife = p.life; });
}

function updateParticles(particles, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    const damping = p.type === 'spark' ? 0.94 : 0.995;
    p.vx *= damping;
    p.vy *= damping;
    p.vy += p.gravity * dt;

    const elapsed = p.maxLife - p.life;
    const driftX = Math.sin(elapsed * 2.5 + p.driftOffset) * p.drift * 60;

    p.x += (p.vx + driftX * dt) * dt;
    p.y += p.vy * dt;
  }
}

function renderParticles(ctx, particles) {
  ctx.globalCompositeOperation = 'lighter';

  for (const p of particles) {
    const lifeRatio = p.life / p.maxLife;
    const alpha = p.alpha * lifeRatio;
    // Use radial gradient instead of solid circle — smooth falloff, no hard edge
    const r = p.type === 'spark' ? p.radius * 3 : p.type === 'ember' ? p.radius * 4 : p.radius * 3;
    const hex = p.color;
    const cr = parseInt(hex.slice(1, 3), 16) || 255;
    const cg = parseInt(hex.slice(3, 5), 16) || 210;
    const cb = parseInt(hex.slice(5, 7), 16) || 80;
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
    grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${alpha * 0.5})`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// Light rays — drawn as rotated triangular gradients from bottom center
const RAYS = [
  { baseAngle: -70, width: 0.18, speed: 0.15, phase: 0, alpha: 0.12 },
  { baseAngle: -55, width: 0.25, speed: -0.1, phase: 1.2, alpha: 0.15 },
  { baseAngle: -40, width: 0.2, speed: 0.2, phase: 2.5, alpha: 0.14 },
  { baseAngle: -25, width: 0.28, speed: -0.08, phase: 0.8, alpha: 0.16 },
  { baseAngle: -10, width: 0.3, speed: 0.12, phase: 3.1, alpha: 0.18 },
  { baseAngle: 5, width: 0.32, speed: -0.06, phase: 1.5, alpha: 0.2 },
  { baseAngle: 20, width: 0.28, speed: 0.15, phase: 1.9, alpha: 0.16 },
  { baseAngle: 35, width: 0.2, speed: -0.18, phase: 0.3, alpha: 0.14 },
  { baseAngle: 50, width: 0.25, speed: 0.1, phase: 2.1, alpha: 0.15 },
  { baseAngle: 65, width: 0.18, speed: -0.12, phase: 4.0, alpha: 0.12 },
  { baseAngle: -48, width: 0.15, speed: 0.22, phase: 3.5, alpha: 0.1 },
  { baseAngle: 42, width: 0.15, speed: -0.2, phase: 0.7, alpha: 0.1 },
];

function renderLightRays(ctx, w, h, elapsed) {
  const cx = w / 2;
  const cy = h + h * 0.3; // origin pushed below the screen
  const rayLen = Math.max(w, h) * 1.8;

  ctx.save();
  // Blur is applied via CSS filter on the <canvas> element (GPU-composited)
  // rather than ctx.filter (CPU gaussian convolution per frame). CSS blur
  // is free on the GPU compositor; ctx.filter murders perf on Linux/CEF.
  ctx.globalCompositeOperation = 'lighter';

  for (const ray of RAYS) {
    const angleOsc = Math.sin(elapsed * ray.speed * 2 + ray.phase) * 4;
    const alphaOsc = 0.6 + 0.4 * Math.sin(elapsed * ray.speed * 1.5 + ray.phase + 1);
    const angle = (ray.baseAngle + angleOsc) * Math.PI / 180;
    const alpha = ray.alpha * alphaOsc;

    const halfWidth = ray.width * 0.5;
    const leftAngle = angle - halfWidth;
    const rightAngle = angle + halfWidth;

    const x1 = cx + Math.sin(leftAngle) * rayLen;
    const y1 = cy - Math.cos(leftAngle) * rayLen;
    const x2 = cx + Math.sin(rightAngle) * rayLen;
    const y2 = cy - Math.cos(rightAngle) * rayLen;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rayLen * 0.7);
    grad.addColorStop(0, `rgba(255, 210, 80, ${alpha})`);
    grad.addColorStop(0.25, `rgba(255, 195, 65, ${alpha * 0.7})`);
    grad.addColorStop(0.5, `rgba(255, 175, 45, ${alpha * 0.3})`);
    grad.addColorStop(1, 'rgba(255, 150, 20, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();

    // Smoke/dust motes along the ray
    const midAngle = angle;
    for (let m = 0; m < 5; m++) {
      const seed = ray.phase * 100 + m * 13.7;
      const distFrac = 0.08 + ((seed * 7.31) % 1) * 0.5;
      const dist = rayLen * distFrac;
      const lateralFrac = (((seed * 3.17) % 1) - 0.5) * ray.width * dist * 0.5;
      const mx = cx + Math.sin(midAngle) * dist + Math.cos(midAngle) * lateralFrac;
      const my = cy - Math.cos(midAngle) * dist + Math.sin(midAngle) * lateralFrac;
      const driftX = Math.sin(elapsed * 0.15 + seed) * 3;
      const driftY = Math.cos(elapsed * 0.12 + seed * 0.7) * 2;
      const moteAlpha = alpha * (0.2 + 0.15 * Math.sin(elapsed * 0.3 + seed * 0.5));
      const moteRadius = 12 + Math.sin(elapsed * 0.2 + seed) * 3;

      ctx.globalAlpha = moteAlpha;
      ctx.fillStyle = 'rgba(255, 210, 100, 1)';
      ctx.beginPath();
      ctx.arc(mx + driftX, my + driftY, moteRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Warm pool of light at the base
  const baseGrad = ctx.createRadialGradient(cx, h, 0, cx, h, w * 0.6);
  const baseAlpha = 0.14 + 0.05 * Math.sin(elapsed * 0.5);
  baseGrad.addColorStop(0, `rgba(255, 200, 80, ${baseAlpha})`);
  baseGrad.addColorStop(0.4, `rgba(255, 180, 50, ${baseAlpha * 0.5})`);
  baseGrad.addColorStop(1, 'rgba(255, 150, 20, 0)');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, h * 0.3, w, h * 0.7);

  ctx.restore();
}

function renderFlash(ctx, cx, cy, progress) {
  if (progress > 1) return;

  const radius = 400 * easeOut(progress);
  const alpha = 1 - easeOut(progress);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.9})`);
  grad.addColorStop(0.2, `rgba(255, 230, 150, ${alpha * 0.6})`);
  grad.addColorStop(0.5, `rgba(255, 180, 50, ${alpha * 0.3})`);
  grad.addColorStop(1, 'rgba(255, 150, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Shockwave ring
  const ringRadius = 500 * easeOut(progress);
  const ringAlpha = 0.5 * (1 - progress);
  ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`;
  ctx.lineWidth = 4 * (1 - progress) + 1;
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Second inner ring
  const ring2Radius = 300 * easeOut(Math.min(progress * 1.3, 1));
  const ring2Alpha = 0.3 * (1 - progress);
  ctx.strokeStyle = `rgba(255, 240, 200, ${ring2Alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, ring2Radius, 0, Math.PI * 2);
  ctx.stroke();
}

export default function PackOpeningFX({ active }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ particles: [], flash: -1, running: false, lastTime: 0, burstDone: false, emberTimer: 0, elapsed: 0 });

  const tick = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;

    const now = performance.now();
    const dt = Math.min((now - s.lastTime) / 1000, 0.05);
    s.lastTime = now;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);
    s.elapsed += dt;

    // Light rays — always rendering when active
    renderLightRays(ctx, w, h, s.elapsed);

    // Flash
    if (s.flash >= 0 && s.flash < 1.2) {
      s.flash += dt / 0.5;
      renderFlash(ctx, cx, cy, s.flash);
    }

    // Ambient embers after burst
    if (s.burstDone) {
      s.emberTimer += dt;
      if (s.emberTimer > 0.3) {
        s.emberTimer = 0;
        spawnAmbientEmbers(cx, cy, w, h, s.particles, 3);
      }
    }

    updateParticles(s.particles, dt);
    renderParticles(ctx, s.particles);

    if (s.running) {
      requestAnimationFrame(tick);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent?.clientWidth || window.innerWidth;
      canvas.height = parent?.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    if (active) {
      const s = stateRef.current;
      s.particles = [];
      s.flash = 0;
      s.burstDone = false;
      s.emberTimer = 0;
      s.elapsed = 0;
      s.lastTime = performance.now();
      s.running = true;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      spawnBurst(cx, cy, s.particles);

      setTimeout(() => { s.burstDone = true; }, 800);

      requestAnimationFrame(tick);
    } else {
      stateRef.current.running = false;
    }

    return () => {
      stateRef.current.running = false;
      window.removeEventListener('resize', resize);
    };
  }, [active, tick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, filter: 'blur(20px)' }}
    />
  );
}
