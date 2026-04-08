import { Toaster as Sonner } from 'sonner';
import { getViewportScale } from '../../lib/medievalTheme';
import { getLocalApiOrigin } from '../../utils/localApi';

// Inject the Urnes serpent ornament rule once on module load. We
// can't put this in app.css because Bun's CSS bundler tries to
// resolve url(...) at build time and the runtime asset path
// (/game-assets/...) doesn't exist on disk at build time. Going
// through document.head.appendChild lets us interpolate the URL as
// a JS string the bundler never touches.
//
// Each Sonner toast gets a ::after pseudo-element with the Urnes
// horizontal serpent band as a CSS mask. The band sits at the bottom
// of the toast as ambient ornamentation — no visible divider, no
// occupied layout space, just embossed decoration carved into the
// toast surface via mix-blend-mode: overlay.
if (typeof document !== 'undefined' && !document.getElementById('valkenhall-toast-ornament')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'valkenhall-toast-ornament';
  // Cache-bust per session — see VikingOrnament.jsx for the rationale.
  const ornamentUrl = `${getLocalApiOrigin()}/game-assets/ornaments/viking-urnes-009.svg?v=${Date.now()}`;
  styleEl.textContent = `
    [data-sonner-toast] {
      isolation: isolate;
      padding-bottom: 28px !important;
    }
    [data-sonner-toast]::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 6px;
      transform: translateX(-50%);
      width: 78%;
      max-width: 320px;
      height: 20px;
      pointer-events: none;
      mask-image: url("${ornamentUrl}");
      -webkit-mask-image: url("${ornamentUrl}");
      mask-size: contain;
      -webkit-mask-size: contain;
      mask-repeat: no-repeat;
      -webkit-mask-repeat: no-repeat;
      mask-position: center;
      -webkit-mask-position: center;
      background-color: rgba(232, 200, 130, 1);
      filter: drop-shadow(0 1px 0 rgba(255, 235, 195, 0.35)) drop-shadow(0 -1px 0 rgba(0, 0, 0, 0.85));
      mix-blend-mode: overlay;
      opacity: 0.45;
      z-index: -1;
    }
  `;
  document.head.appendChild(styleEl);
}

function Toaster(props) {
  const scale = getViewportScale();
  const width = Math.round(356 * scale);
  const fontSize = Math.round(14 * scale);
  const descFontSize = Math.round(12 * scale);
  const padding = Math.round(16 * scale);
  const btnPadX = Math.round(12 * scale);
  const btnPadY = Math.round(6 * scale);
  const btnFont = Math.round(12 * scale);
  const gap = Math.round(8 * scale);

  return (
    <Sonner
      theme="dark"
      position="top-center"
      className="toaster group"
      visibleToasts={5}
      gap={gap}
      style={{
        '--normal-bg': 'rgba(12, 10, 8, 0.95)',
        '--normal-text': '#e8d5a0',
        '--normal-border': 'rgba(180, 140, 60, 0.25)',
        '--border-radius': '8px',
        '--width': `${width}px`,
      }}
      toastOptions={{
        style: {
          background: 'rgba(12, 10, 8, 0.95)',
          border: '1px solid rgba(180, 140, 60, 0.25)',
          borderRadius: '8px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 20px rgba(180,140,60,0.04)',
          color: '#e8d5a0',
          fontSize: `${fontSize}px`,
          padding: `${padding}px`,
          width: `${width}px`,
        },
        descriptionStyle: {
          color: 'rgba(166, 160, 155, 0.5)',
          fontSize: `${descFontSize}px`,
        },
        actionButtonStyle: {
          background: 'linear-gradient(180deg, rgba(212,168,67,0.9) 0%, rgba(160,120,40,0.9) 100%)',
          border: '1px solid rgba(228,200,100,0.6)',
          color: '#1a1408',
          borderRadius: '6px',
          fontSize: `${btnFont}px`,
          padding: `${btnPadY}px ${btnPadX}px`,
        },
        cancelButtonStyle: {
          background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.12) 100%)',
          border: '1px solid rgba(180, 140, 60, 0.3)',
          color: '#A6A09B',
          borderRadius: '6px',
          fontSize: `${btnFont}px`,
          padding: `${btnPadY}px ${btnPadX}px`,
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
