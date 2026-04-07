import {
  TEXT_PRIMARY, TEXT_BODY, ACCENT_GOLD,
  BEVELED_BTN, GOLD_BTN,
  POPOVER_STYLE, FourCorners,
} from '../../lib/medievalTheme';

/**
 * Floating prompt that appears at the top of the screen when an opposing
 * unit arrives at (or walks through) a cell where the viewing player has
 * untapped units. Lets the defender assign interceptors or pass.
 *
 * Positioned at `top-20` with high z-index so the hand card zone never
 * covers the buttons — this used to be a bottom-anchored strip that was
 * un-clickable through the hand.
 */
export default function InterceptPrompt({
  prompt,
  getCardName,
  onToggleInterceptor,
  onPass,
  onSubmit,
}) {
  if (!prompt) return null;
  const selectedCount = prompt.selectedInterceptors.size;

  return (
    <div
      className="fixed left-1/2 top-20 -translate-x-1/2 z-[1200] w-[min(640px,calc(100vw-48px))] px-6 py-5"
      style={{
        ...POPOVER_STYLE,
        borderRadius: '12px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 32px rgba(196,150,60,0.15)',
      }}
    >
      <FourCorners radius={12} />
      <div className="flex items-center gap-2 mb-3">
        <div className="size-2.5 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-sm font-bold" style={{ color: ACCENT_GOLD }}>ENEMY ARRIVED</span>
      </div>
      <p className="text-sm mb-3" style={{ color: TEXT_BODY }}>
        <span style={{ color: TEXT_PRIMARY }}>{prompt.arrivedCardName}</span> has moved into your territory! Click units on the board to intercept, or pass.
      </p>
      {selectedCount > 0 ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {[...prompt.selectedInterceptors].map((icId) => (
            <span
              key={icId}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer"
              style={{
                background: 'rgba(34,204,68,0.15)',
                border: '1px solid rgba(34,204,68,0.3)',
                color: '#6fd87a',
              }}
              onClick={() => onToggleInterceptor(icId)}
            >
              {getCardName(icId)} &times;
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <button
          type="button"
          className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer"
          style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
          onClick={onPass}
        >
          Pass
        </button>
        <button
          type="button"
          className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer disabled:opacity-40"
          style={{ ...GOLD_BTN, borderRadius: '6px' }}
          disabled={selectedCount === 0}
          onClick={onSubmit}
        >
          Intercept ({selectedCount})
        </button>
      </div>
    </div>
  );
}
