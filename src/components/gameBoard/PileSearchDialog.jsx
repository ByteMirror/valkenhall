import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG,
  BEVELED_BTN, INPUT_STYLE, FourCorners,
} from '../../lib/medievalTheme';
import { cn } from '../../lib/utils';

/**
 * Full-screen overlay that lets a player browse, search, and take cards
 * out of a pile (to hand or directly to the field). Pure presentational —
 * all mutation callbacks are provided by the parent.
 */
export default function PileSearchDialog({
  pile,
  query,
  resolveImageUrl,
  onQueryChange,
  onClose,
  onTakeToHand,
  onTakeToField,
}) {
  if (!pile) return null;

  const lowerQuery = query.toLowerCase();
  const filtered = lowerQuery
    ? pile.cards.filter((c) => c.name.toLowerCase().includes(lowerQuery))
    : pile.cards;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-[600px] max-h-[80vh] flex flex-col"
        style={{
          background: PANEL_BG,
          border: `1px solid ${GOLD} 0.25)`,
          borderRadius: '12px',
          boxShadow: '0 0 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <FourCorners radius={12} />
        <div
          className="flex items-center gap-3 p-4"
          style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}
        >
          <h2 className="text-lg font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>
            {pile.name}
          </h2>
          <span className="text-sm" style={{ color: TEXT_MUTED }}>
            {pile.cards.length} cards
          </span>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="search"
              placeholder="Search cards..."
              value={query}
              onInput={(e) => onQueryChange(e.target.value)}
              className="px-3 py-1.5 text-sm outline-none"
              style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
              autoFocus
            />
            <button
              type="button"
              className="px-3 py-1.5 text-sm cursor-pointer transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: TEXT_MUTED }}>
              {lowerQuery ? 'No cards match your search' : 'Pile is empty'}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {filtered.map((card) => (
                <div
                  key={card.id}
                  className="group relative cursor-pointer rounded-lg overflow-hidden transition-colors"
                  style={{ border: `1px solid ${GOLD} 0.12)` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.4)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.12)`; }}
                >
                  <img
                    src={resolveImageUrl(card.imageUrl)}
                    alt={card.name}
                    className={cn('w-full object-cover', card.isSite ? 'aspect-[88.9/63.5]' : 'aspect-[63.5/88.9]')}
                  />
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-full p-2 flex gap-1">
                      <button
                        type="button"
                        className="flex-1 rounded px-2 py-1 text-[10px] font-medium cursor-pointer transition-colors"
                        style={{ background: `${GOLD} 0.2)`, color: TEXT_PRIMARY }}
                        onClick={() => onTakeToHand(card)}
                      >
                        To hand
                      </button>
                      <button
                        type="button"
                        className="flex-1 rounded px-2 py-1 text-[10px] font-medium cursor-pointer transition-colors"
                        style={{ background: `${GOLD} 0.2)`, color: TEXT_PRIMARY }}
                        onClick={() => onTakeToField(card)}
                      >
                        To field
                      </button>
                    </div>
                  </div>
                  <div
                    className="absolute top-1 left-1 right-1 truncate text-[9px] font-medium drop-shadow-md"
                    style={{ color: TEXT_PRIMARY }}
                  >
                    {card.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
