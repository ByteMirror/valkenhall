import {
  TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  BEVELED_BTN, GOLD_BTN,
  POPOVER_STYLE, FourCorners,
} from '../../lib/medievalTheme';

/**
 * Floating prompt that appears when the viewing player's unit is attacked
 * and they have eligible defenders nearby. Mirrors InterceptPrompt but also
 * exposes a "keep original target in fight" toggle.
 */
export default function DefendPrompt({
  prompt,
  getCardName,
  onToggleDefender,
  onToggleKeepOriginal,
  onPass,
  onSubmit,
}) {
  if (!prompt) return null;
  const selectedCount = prompt.selectedDefenders.size;

  return (
    <div
      className="fixed left-1/2 top-20 -translate-x-1/2 z-[1200] w-[min(640px,calc(100vw-48px))] px-6 py-5"
      style={{
        ...POPOVER_STYLE,
        borderRadius: '12px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 32px rgba(196,80,80,0.15)',
      }}
    >
      <FourCorners radius={12} />
      <div className="flex items-center gap-2 mb-3">
        <div className="size-2.5 rounded-full bg-red-400 animate-pulse" />
        <span className="text-sm font-bold" style={{ color: '#c45050' }}>ATTACK DECLARED</span>
      </div>
      <p className="text-sm mb-3" style={{ color: TEXT_BODY }}>
        <span style={{ color: TEXT_PRIMARY }}>{prompt.attackerName}</span> is attacking your <span style={{ color: TEXT_PRIMARY }}>{prompt.targetName}</span>! Click adjacent units on the board to assign defenders, or pass.
      </p>
      {selectedCount > 0 ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {[...prompt.selectedDefenders].map((defId) => (
            <span
              key={defId}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer"
              style={{
                background: 'rgba(34,204,68,0.15)',
                border: '1px solid rgba(34,204,68,0.3)',
                color: '#6fd87a',
              }}
              onClick={() => onToggleDefender(defId)}
            >
              {getCardName(defId)} &times;
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: TEXT_MUTED }}>
          <input
            type="checkbox"
            checked={prompt.keepOriginalTarget}
            onChange={(e) => onToggleKeepOriginal(e.target.checked)}
            className="accent-amber-500"
          />
          <span className="text-xs">Keep {prompt.targetName} in fight</span>
        </label>
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
          Defend ({selectedCount})
        </button>
      </div>
    </div>
  );
}
