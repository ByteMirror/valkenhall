import RuneSpinner from './RuneSpinner';
import {
  GOLD, TEXT_PRIMARY, TEXT_MUTED,
  DIALOG_STYLE, VIGNETTE, BG_ATMOSPHERE,
  FourCorners,
} from '../lib/medievalTheme';

const LoadingIndicator = ({ message, detail, progress, showProgress = false }) => {
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center px-4"
      role="status"
      aria-live="polite"
      style={{ background: BG_ATMOSPHERE }}
    >
      <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
      <div
        className="relative p-8"
        style={{
          ...DIALOG_STYLE,
          width: 'min(90vw, 28vmin)',
          minWidth: '280px',
        }}
      >
        <FourCorners radius={12} />
        <div className="flex justify-center mb-5">
          <RuneSpinner size={80} useViewportUnits />
        </div>
        <h2
          className="leading-none arena-heading text-center"
          style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)', fontSize: 'clamp(1.25rem, 2vmin, 2rem)' }}
        >
          {message}
        </h2>
        {detail ? <p className="mt-3 text-center" style={{ color: TEXT_MUTED, fontSize: 'clamp(0.75rem, 1.2vmin, 1rem)' }}>{detail}</p> : null}
        {showProgress && progress !== undefined ? (
          <>
            <div
              className="mt-5 overflow-hidden rounded-full"
              style={{ height: 'clamp(6px, 0.5vmin, 10px)', background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.12)` }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #8b6914, #d4a843, #c49a38)' }}
              />
            </div>
            <div className="mt-2 text-center" style={{ color: TEXT_MUTED, fontSize: 'clamp(0.7rem, 1vmin, 0.9rem)' }}>{Math.round(progress)}%</div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default LoadingIndicator;
