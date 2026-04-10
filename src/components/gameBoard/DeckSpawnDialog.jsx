import { Component } from 'preact';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  BEVELED_BTN, GOLD_BTN, INPUT_STYLE,
  FourCorners,
  getViewportScale, onViewportScaleChange,
} from '../../lib/medievalTheme';
import { UI } from '../../utils/arena/uiSounds';

/**
 * Deck spawn dialog for solo play — styled like PileSearchDialog
 * (Cemetery / Spellbook / Atlas search). Shows the player's saved
 * decks as visual tiles and lets them spawn a deck as Player 1 or
 * Player 2 on the virtual tabletop.
 */
export default class DeckSpawnDialog extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchQuery: '',
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    window.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    this.unsubScale?.();
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.props.onClose();
    }
  };

  getFilteredDecks() {
    const decks = this.props.savedDecks || [];
    const q = this.state.searchQuery.toLowerCase().trim();
    if (q.length < 2) return decks;
    return decks.filter((d) => d.name?.toLowerCase().includes(q));
  }

  render() {
    const { onClose, onSpawn, sorceryCards } = this.props;
    const { searchQuery, viewScale } = this.state;
    const decks = this.getFilteredDecks();

    return (
      <div
        className="responsive-dialog-overlay"
        onClick={onClose}
      >
        <div
          className="responsive-dialog-panel"
          style={{
            background: `url("/tex-noise-panel.webp"), ${PANEL_BG}`,
            border: `1px solid ${GOLD} 0.22)`,
            borderRadius: '14px',
            boxShadow: `0 0 80px rgba(0,0,0,0.6), 0 0 30px ${GOLD} 0.04)`,
            width: 720,
            height: 520,
            zoom: viewScale,
            maxWidth: `${92 / viewScale}vw`,
            maxHeight: `${88 / viewScale}vh`,
            isolation: 'isolate',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <FourCorners radius={14} />

          {/* Header */}
          <div
            className="flex items-center gap-3 px-5 py-3.5 shrink-0"
            style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}
          >
            <h2
              className="text-base font-bold arena-heading"
              style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
            >
              Spawn Deck
            </h2>
            <span
              className="text-[11px] px-2 py-0.5 rounded-md tabular-nums"
              style={{ background: `${GOLD} 0.08)`, color: TEXT_MUTED }}
            >
              {(this.props.savedDecks || []).length}
            </span>
            <div className="flex-1" />
            <input
              type="text"
              placeholder="Search decks..."
              value={searchQuery}
              onInput={(e) => this.setState({ searchQuery: e.target.value })}
              className="px-3 py-1.5 text-xs"
              style={{ ...INPUT_STYLE, width: 200 }}
            />
            <button
              type="button"
              className="px-3 py-1.5 text-xs cursor-pointer transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              data-sound={UI.CANCEL}
              onClick={onClose}
            >
              Close
            </button>
          </div>

          {/* Deck grid */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            {decks.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm" style={{ color: TEXT_MUTED }}>
                    {searchQuery.length >= 2 ? 'No decks match your search' : 'No saved decks'}
                  </div>
                  <div className="text-xs mt-1" style={{ color: `${GOLD} 0.2)` }}>
                    {searchQuery.length >= 2 ? 'Try a different name' : 'Build and save a deck first'}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}
              >
                {decks.map((deck) => (
                  <DeckTile
                    key={deck.id}
                    deck={deck}
                    sorceryCards={sorceryCards}
                    onSpawn={onSpawn}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

function DeckTile({ deck, sorceryCards, onSpawn }) {
  // Find the avatar card for a preview image
  const avatarEntry = deck.cards?.find((c) => {
    const card = sorceryCards?.find((sc) => sc.unique_id === c.cardId);
    return card?.type === 'Avatar';
  });
  const avatarCard = avatarEntry
    ? sorceryCards?.find((sc) => sc.unique_id === avatarEntry.cardId)
    : null;
  const previewUrl = deck.previewUrl
    || avatarCard?.printings?.[0]?.image_url
    || null;

  return (
    <div
      className="group relative flex flex-col overflow-hidden transition-all duration-200 hover:scale-[1.02]"
      style={{
        background: '#0c0a08',
        border: `1px solid ${GOLD} 0.15)`,
        borderRadius: '10px',
      }}
    >
      {/* Preview image area */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '5 / 3' }}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            draggable={false}
            className="w-full h-full object-cover object-top"
            style={{ opacity: 0.7 }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-3xl"
            style={{ background: `${GOLD} 0.04)`, color: `${GOLD} 0.15)` }}
          >
            &#x2726;
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, #0c0a08 0%, transparent 60%)' }}
        />
        {/* Card count badge */}
        <div
          className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded tabular-nums"
          style={{ background: 'rgba(0,0,0,0.6)', color: TEXT_MUTED }}
        >
          {deck.cardCount || deck.cards?.length || 0}
        </div>
      </div>

      {/* Info + buttons */}
      <div className="px-3 pt-1.5 pb-3">
        <div
          className="arena-heading text-[12px] font-bold truncate mb-2"
          style={{ color: TEXT_PRIMARY }}
        >
          {deck.name || 'Untitled'}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-all rounded-md"
            style={{
              ...BEVELED_BTN,
              color: TEXT_BODY,
              textAlign: 'center',
            }}
            data-sound={UI.CONFIRM}
            onClick={() => onSpawn(deck.id, 1)}
          >
            Player 1
          </button>
          <button
            type="button"
            className="flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-all rounded-md"
            style={{
              ...BEVELED_BTN,
              color: TEXT_BODY,
              textAlign: 'center',
            }}
            data-sound={UI.CONFIRM}
            onClick={() => onSpawn(deck.id, 2)}
          >
            Player 2
          </button>
        </div>
      </div>
    </div>
  );
}
