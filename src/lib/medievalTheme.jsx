/**
 * Shared medieval theme constants and components used across the Valkenhall UI.
 * Single source of truth for the dark-gold medieval aesthetic.
 */

/* ── Color tokens ──────────────────────────────────────── */
export const GOLD = 'rgba(180, 140, 60,';
export const GOLD_TEXT = 'rgba(201, 168, 76,';
export const PARCHMENT = 'rgba(228, 213, 160,';
export const PANEL_BG = 'rgba(12, 10, 8, 0.92)';
export const PANEL_BORDER = `${GOLD} 0.25)`;
export const TEXT_PRIMARY = '#e8d5a0';
export const TEXT_BODY = '#A6A09B';
export const TEXT_MUTED = 'rgba(166, 160, 155, 0.5)';
export const COIN_COLOR = '#f0d060';
export const ACCENT_GOLD = '#d4a843';
export const DARK_BASE = '#08080a';

/* ── Atmospheric background ────────────────────────────── */
export const BG_ATMOSPHERE = [
  'radial-gradient(ellipse 80% 50% at 50% 30%, rgba(180,140,60,0.05) 0%, transparent 70%)',
  'radial-gradient(ellipse 60% 40% at 50% 80%, rgba(120,80,30,0.06) 0%, transparent 60%)',
  'radial-gradient(ellipse 100% 100% at 50% 50%, rgba(30,20,8,0.4) 0%, transparent 80%)',
  'radial-gradient(circle at 20% 20%, rgba(100,60,20,0.03) 0%, transparent 40%)',
  'radial-gradient(circle at 80% 70%, rgba(100,60,20,0.03) 0%, transparent 40%)',
  DARK_BASE,
].join(', ');

export const VIGNETTE = 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.5) 100%)';

/* ── Beveled button base ───────────────────────────────── */
export const BEVELED_BTN = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.12) 100%)',
  border: `1px solid ${GOLD} 0.3)`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.4)',
  borderRadius: '8px',
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
};

/* ── Content background gradients ──────────────────────── */
export const CONTENT_BG_DEFAULT = 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.08) 100%)';
export const CONTENT_BG_HOVER = 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.04) 100%)';
export const CONTENT_BG_ACTIVE = 'linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(255,255,255,0.02) 100%)';

/* ── Corner plating tokens ─────────────────────────────── */
export const CORNER_SIZE = 10;
export const CORNER_THICKNESS = 2;
export const BTN_BORDER = 'rgba(166,160,155,0.3)';
export const BTN_BORDER_HOVER = 'rgba(166,160,155,0.55)';
export const BTN_CORNER = 'rgba(166,160,155,0.5)';
export const BTN_CORNER_HOVER = 'rgba(166,160,155,0.85)';
export const GOLD_CORNER = `${GOLD} 0.45)`;

/* ── Panel / Dialog styles ─────────────────────────────── */
export const DIALOG_BG = 'linear-gradient(180deg, rgba(25,20,10,0.98) 0%, rgba(15,12,6,0.98) 100%)';
export const DIALOG_BORDER = `${GOLD} 0.3)`;
export const DIALOG_SHADOW = '0 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(180,140,60,0.05)';

export const PANEL_STYLE = {
  background: PANEL_BG,
  border: `1px solid ${PANEL_BORDER}`,
  borderRadius: '8px',
};

export const DIALOG_STYLE = {
  background: DIALOG_BG,
  border: `1px solid ${DIALOG_BORDER}`,
  borderRadius: '12px',
  boxShadow: DIALOG_SHADOW,
};

/* ── Gold primary button ───────────────────────────────── */
export const GOLD_BTN = {
  background: 'linear-gradient(180deg, rgba(212,168,67,0.9) 0%, rgba(160,120,40,0.9) 100%)',
  border: '1px solid rgba(228,200,100,0.6)',
  borderRadius: '6px',
  color: '#1a1408',
  boxShadow: '0 0 20px rgba(212,168,67,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
  textShadow: '0 1px 0 rgba(255,255,255,0.2)',
};

/* ── Danger / destructive button ───────────────────────── */
export const DANGER_BTN = {
  background: 'linear-gradient(180deg, rgba(180,60,60,0.15) 0%, rgba(120,30,30,0.1) 100%)',
  border: `1px solid rgba(180,60,60,0.35)`,
  borderRadius: '6px',
  color: '#c45050',
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
};

/* ── Input field ───────────────────────────────────────── */
export const INPUT_STYLE = {
  background: 'rgba(0,0,0,0.25)',
  border: `1px solid ${GOLD} 0.12)`,
  borderRadius: '4px',
  color: TEXT_BODY,
  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
};

/* ── Tab styling helpers ───────────────────────────────── */
export const TAB_ACTIVE = {
  color: TEXT_PRIMARY,
  background: `${GOLD} 0.12)`,
  border: `1px solid ${GOLD} 0.3)`,
  borderRadius: '4px',
};

export const TAB_INACTIVE = {
  color: TEXT_MUTED,
  background: 'transparent',
  border: '1px solid rgba(166,160,155,0.1)',
  borderRadius: '4px',
};

/* ── Divider gradient ──────────────────────────────────── */
export const DIVIDER_GRADIENT = `linear-gradient(90deg, transparent 0%, ${GOLD} 0.25) 50%, transparent 100%)`;

/* ── Popover / context menu (in-game) ──────────────────── */
export const POPOVER_STYLE = {
  background: PANEL_BG,
  border: `1px solid ${GOLD} 0.2)`,
  borderRadius: '8px',
  boxShadow: '0 24px 80px rgba(0,0,0,0.4), 0 0 30px rgba(180,140,60,0.04)',
};

/* ── Scrollbar accent (css class) ──────────────────────── */
export const SECTION_HEADER_STYLE = {
  color: `${GOLD} 0.55)`,
  textShadow: `0 0 12px ${GOLD} 0.15)`,
};

/* ── Viewport scale factor (for large-screen scaling) ──── */
const HUB_DESIGN_WIDTH = 1600;

export function getViewportScale() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : HUB_DESIGN_WIDTH;
  return Math.max(1, vw / HUB_DESIGN_WIDTH);
}

/* ── Shared debounced viewport scale listener ─────────── */
const scaleListeners = new Set();
let scaleRafId = null;

function handleScaleResize() {
  if (scaleRafId) return;
  scaleRafId = requestAnimationFrame(() => {
    scaleRafId = null;
    const scale = getViewportScale();
    for (const fn of scaleListeners) fn(scale);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', handleScaleResize);
}

export function onViewportScaleChange(callback) {
  scaleListeners.add(callback);
  return () => scaleListeners.delete(callback);
}

/* ── Helper: alpha-adjust an rgba( prefix string ───────── */
export function adjustAlpha(rgba, alpha) {
  return rgba.replace(/[\d.]+\)$/, `${alpha})`);
}

/* ── SVG filter defs — mount once at app root ──────────── */
export function MedievalSvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <filter id="gold-emboss" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="blur" />
          <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.6" specularExponent="20" lightingColor="#d4a843" result="spec">
            <fePointLight x="-50" y="-80" z="120" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
          <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="0.7" k4="0" />
        </filter>
      </defs>
    </svg>
  );
}

/* ── SVG corner flourish ornament ──────────────────────── */
export function CornerPlating({ position, color = GOLD_CORNER, radius = 6 }) {
  // Ornamental L-bracket with a small flourish curl
  const size = 18;
  const posStyle = {
    'top-left': { top: -2, left: -2 },
    'top-right': { top: -2, right: -2, transform: 'scaleX(-1)' },
    'bottom-left': { bottom: -2, left: -2, transform: 'scaleY(-1)' },
    'bottom-right': { bottom: -2, right: -2, transform: 'scale(-1, -1)' },
  };
  return (
    <svg
      className="absolute pointer-events-none"
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      style={{ ...posStyle[position], transition: 'opacity 0.2s ease' }}
      data-corner=""
    >
      {/* Main L-bracket with subtle curve */}
      <path
        d={`M1 ${radius > 8 ? 12 : 10} V${Math.min(radius, 5)} Q1 1 ${Math.min(radius, 5)} 1 H${radius > 8 ? 12 : 10}`}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#gold-emboss)"
      />
      {/* Small decorative dot at corner intersection */}
      <circle cx={Math.min(radius, 5)} cy={Math.min(radius, 5)} r="1.2" fill={color} filter="url(#gold-emboss)" />
    </svg>
  );
}

/* ── Four corners shorthand ────────────────────────────── */
export function FourCorners({ color = GOLD_CORNER, radius = 6 }) {
  return (
    <>
      <CornerPlating position="top-left" color={color} radius={radius} />
      <CornerPlating position="top-right" color={color} radius={radius} />
      <CornerPlating position="bottom-left" color={color} radius={radius} />
      <CornerPlating position="bottom-right" color={color} radius={radius} />
    </>
  );
}

/* ── Ornamental divider with scrollwork ────────────────── */
export function OrnamentalDivider({ className }) {
  return (
    <div className={`flex items-center gap-0 select-none ${className || ''}`}>
      <div className="flex-1 h-px" style={{ background: DIVIDER_GRADIENT }} />
      <svg width="40" height="12" viewBox="0 0 40 12" fill="none" className="shrink-0">
        {/* Left scrollwork curl */}
        <path d="M2 6 Q6 2 10 6 Q14 10 18 6" stroke={`${GOLD} 0.3)`} strokeWidth="1" strokeLinecap="round" fill="none" filter="url(#gold-emboss)" />
        {/* Center diamond */}
        <path d="M18 3 L20 1 L22 3 L20 5 Z" fill={`${GOLD} 0.35)`} filter="url(#gold-emboss)" />
        <path d="M18 9 L20 7 L22 9 L20 11 Z" fill={`${GOLD} 0.2)`} filter="url(#gold-emboss)" />
        {/* Right scrollwork curl */}
        <path d="M22 6 Q26 2 30 6 Q34 10 38 6" stroke={`${GOLD} 0.3)`} strokeWidth="1" strokeLinecap="round" fill="none" filter="url(#gold-emboss)" />
      </svg>
      <div className="flex-1 h-px" style={{ background: DIVIDER_GRADIENT }} />
    </div>
  );
}

/* ── Ornate menu button (used in hub, game menu, etc.) ── */
export function MenuButton({ title, onClick, style: extraStyle }) {
  return (
    <button
      type="button"
      className="relative group w-full text-left cursor-pointer transition-all duration-200 mb-2"
      style={{ transform: 'scale(1)', ...extraStyle }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'scale(1.02)';
        el.style.boxShadow = '0 0 20px rgba(166,160,155,0.08)';
        el.querySelector('[data-frame]').style.borderColor = BTN_BORDER_HOVER;
        el.querySelectorAll('[data-corner]').forEach((c) => { c.style.opacity = '1'; });
        el.querySelector('[data-content]').style.background = `${CONTENT_BG_HOVER}, rgba(12, 10, 8, 0.92)`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'scale(1)';
        el.style.boxShadow = 'none';
        el.querySelector('[data-frame]').style.borderColor = BTN_BORDER;
        el.querySelectorAll('[data-corner]').forEach((c) => { c.style.opacity = '0.7'; });
        el.querySelector('[data-content]').style.background = `${CONTENT_BG_DEFAULT}, rgba(12, 10, 8, 0.92)`;
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.98)';
        e.currentTarget.querySelector('[data-content]').style.background = `${CONTENT_BG_ACTIVE}, rgba(12, 10, 8, 0.92)`;
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.querySelector('[data-content]').style.background = `${CONTENT_BG_HOVER}, rgba(12, 10, 8, 0.92)`;
      }}
      onClick={onClick}
    >
      <div data-frame="" className="absolute inset-0 pointer-events-none" style={{ border: `1px solid ${BTN_BORDER}`, borderRadius: '6px', transition: 'border-color 0.2s ease' }} />
      <CornerPlating position="top-left" color={BTN_CORNER} />
      <CornerPlating position="top-right" color={BTN_CORNER} />
      <CornerPlating position="bottom-left" color={BTN_CORNER} />
      <CornerPlating position="bottom-right" color={BTN_CORNER} />
      <div data-content="" className="relative px-5 py-3.5 flex items-center" style={{ background: `${CONTENT_BG_DEFAULT}, rgba(12, 10, 8, 0.92)`, textShadow: '0 1px 3px rgba(0,0,0,0.6)', borderRadius: '6px', transition: 'background 0.2s ease' }}>
        <span className="text-lg font-bold arena-heading" style={{ color: TEXT_BODY }}>{title}</span>
      </div>
    </button>
  );
}
