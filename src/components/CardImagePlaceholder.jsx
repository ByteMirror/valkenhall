import RuneSpinner from './RuneSpinner';
import { GOLD } from '../lib/medievalTheme';

/**
 * Medieval-styled placeholder shown behind a card image while the network
 * fetch is in flight. Fills its positioned parent and centers a slowly
 * rotating RuneSpinner, plus a soft gold gradient and subtle edge
 * ornamentation so it reads as an empty card frame rather than a void.
 *
 * Usage: position relatively in the card container and overlay the actual
 * <img> on top with `opacity: imgLoaded ? 1 : 0` so the placeholder
 * fades out as the image fades in.
 */
export default function CardImagePlaceholder({ spinnerSize = 36, className = '', style = {} }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 flex items-center justify-center rounded-[14px] overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(ellipse at center, ${GOLD} 0.05) 0%, rgba(18,14,8,0.9) 70%, rgba(10,8,6,0.95) 100%)`,
        border: `1px solid ${GOLD} 0.12)`,
        boxShadow: `inset 0 0 24px rgba(0,0,0,0.6), inset 0 0 1px ${GOLD} 0.18)`,
        ...style,
      }}
    >
      {/* Faint diagonal sheen so the panel doesn't read as flat black */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, transparent 40%, ${GOLD} 0.03) 50%, transparent 60%)`,
        }}
      />
      {/* Centered spinning rune */}
      <RuneSpinner size={spinnerSize} />
    </div>
  );
}
