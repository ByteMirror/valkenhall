import { useRef, useEffect, useState, useCallback } from 'preact/hooks';

/**
 * StoreTorchFX — simulates off-screen torch illumination on the store background.
 * Uses CSS radial gradients with JS-driven opacity animation for organic firelight.
 * No canvas — pure DOM elements with mix-blend-mode: screen.
 */

// Organic fire noise: layered oscillation for non-repeating flicker
function fireFlicker(t, speed, phase) {
  const s = t * speed;
  const base = 0.55 + 0.22 * Math.sin(s * 2.17 + phase)
    + 0.08 * Math.sin(s * 1.31 + phase * 1.7);
  const spike = 0.18 * Math.max(0,
    Math.sin(s * 7.43 + phase * 2.1) * Math.sin(s * 11.17 + phase * 0.6)
  );
  const flutter = 0.06 * Math.sin(s * 19.7 + phase * 3.3)
    + 0.04 * Math.sin(s * 31.3 + phase * 1.4);
  return base + spike + flutter;
}

const LIGHTS = [
  // Left torches
  { side: 'left', top: '10%',  intensity: 0.22, speed: 1.0, phase: 0.0, size: '55%', color: '255, 147, 41' },
  { side: 'left', top: '35%',  intensity: 0.20, speed: 0.85, phase: 2.3, size: '60%', color: '255, 130, 35' },
  { side: 'left', top: '65%',  intensity: 0.16, speed: 1.15, phase: 4.7, size: '50%', color: '255, 160, 50' },
  // Right torches
  { side: 'right', top: '12%', intensity: 0.22, speed: 0.95, phase: 1.1, size: '55%', color: '255, 140, 38' },
  { side: 'right', top: '38%', intensity: 0.20, speed: 1.1,  phase: 3.6, size: '60%', color: '255, 125, 30' },
  { side: 'right', top: '62%', intensity: 0.16, speed: 0.9,  phase: 5.2, size: '50%', color: '255, 155, 45' },
];

export default function StoreTorchFX() {
  const refsMap = useRef(new Map());
  const rafRef = useRef(null);
  const startRef = useRef(performance.now());

  const tick = useCallback(() => {
    const t = (performance.now() - startRef.current) / 1000;

    for (let i = 0; i < LIGHTS.length; i++) {
      const light = LIGHTS[i];
      const el = refsMap.current.get(i);
      if (!el) continue;

      const flicker = fireFlicker(t, light.speed, light.phase);
      const alpha = light.intensity * flicker;

      // Subtle position sway
      const swayX = Math.sin(t * light.speed * 1.3 + light.phase) * 1.5;
      const swayY = Math.cos(t * light.speed * 0.9 + light.phase * 1.5) * 1;

      el.style.opacity = String(alpha);
      el.style.transform = `translate(${swayX}%, ${swayY}%)`;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      refsMap.current.clear();
    };
  }, [tick]);

  return (
    <>
      {LIGHTS.map((light, i) => (
        <div
          key={i}
          ref={(el) => { if (el) refsMap.current.set(i, el); }}
          className="absolute pointer-events-none"
          style={{
            [light.side]: '-5%',
            top: light.top,
            width: light.size,
            height: light.size,
            background: `radial-gradient(ellipse 100% 100% at ${light.side === 'left' ? '0%' : '100%'} 50%, rgba(${light.color}, 1) 0%, rgba(${light.color}, 0.5) 20%, rgba(${light.color}, 0.12) 50%, transparent 80%)`,
            mixBlendMode: 'screen',
            zIndex: 2,
            opacity: 0,
            willChange: 'opacity, transform',
          }}
        />
      ))}
    </>
  );
}
