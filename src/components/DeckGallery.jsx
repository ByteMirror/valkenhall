import { Component } from 'preact';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, PANEL_BORDER,
  BEVELED_BTN, INPUT_STYLE, ACCENT_GOLD, BG_ATMOSPHERE, VIGNETTE,
  FourCorners, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

const DECK_CARD_STYLE = {
  background: PANEL_BG,
  border: `1px solid ${GOLD} 0.15)`,
  borderRadius: '10px',
  overflow: 'hidden',
  cursor: 'pointer',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
};

const DECK_CARD_HOVER_BORDER = `${GOLD} 0.4)`;
const DECK_CARD_HOVER_SHADOW = `0 0 24px rgba(180,140,60,0.3), 0 4px 20px rgba(0,0,0,0.5)`;

export default class DeckGallery extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchQuery: '',
      viewScale: getViewportScale(),
      confirmDeleteId: null,
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  handleSearch = (e) => {
    this.setState({ searchQuery: e.target.value });
  };

  handleDeleteClick = (e, deckId) => {
    e.stopPropagation();
    this.setState({ confirmDeleteId: deckId });
  };

  handleConfirmDelete = (e) => {
    e.stopPropagation();
    const { confirmDeleteId } = this.state;
    if (confirmDeleteId && this.props.onDeleteDeck) {
      this.props.onDeleteDeck(confirmDeleteId);
    }
    this.setState({ confirmDeleteId: null });
  };

  handleCancelDelete = (e) => {
    e.stopPropagation();
    this.setState({ confirmDeleteId: null });
  };

  getFilteredDecks() {
    const { savedDecks } = this.props;
    const { searchQuery } = this.state;
    if (!savedDecks) return [];
    if (!searchQuery.trim()) return savedDecks;
    const q = searchQuery.toLowerCase();
    return savedDecks.filter((d) => d.name.toLowerCase().includes(q));
  }

  renderNewDeckCard() {
    return (
      <button
        type="button"
        className="relative flex flex-col items-center justify-center cursor-pointer group"
        style={{
          aspectRatio: '3 / 4',
          background: 'rgba(12, 10, 8, 0.6)',
          border: `2px dashed ${GOLD} 0.3)`,
          borderRadius: '10px',
          transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.03)';
          e.currentTarget.style.borderColor = `${GOLD} 0.55)`;
          e.currentTarget.style.boxShadow = `0 0 20px rgba(180,140,60,0.15)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.borderColor = `${GOLD} 0.3)`;
          e.currentTarget.style.boxShadow = 'none';
        }}
        onClick={this.props.onCreateDeck}
      >
        <span
          className="text-5xl font-light mb-2"
          style={{ color: ACCENT_GOLD, textShadow: `0 0 20px rgba(180,140,60,0.3)` }}
        >
          +
        </span>
        <span className="text-sm arena-heading" style={{ color: `${GOLD} 0.6)` }}>
          New Deck
        </span>
      </button>
    );
  }

  renderDeckCard(deck) {
    const { confirmDeleteId } = this.state;
    const isConfirming = confirmDeleteId === deck.id;

    return (
      <div
        key={deck.id}
        className="relative group"
        style={{ ...DECK_CARD_STYLE, aspectRatio: '3 / 4' }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.transform = 'scale(1.03)';
          el.style.borderColor = DECK_CARD_HOVER_BORDER;
          el.style.boxShadow = DECK_CARD_HOVER_SHADOW;
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.transform = 'scale(1)';
          el.style.borderColor = `${GOLD} 0.15)`;
          el.style.boxShadow = 'none';
          if (!isConfirming) this.setState({ confirmDeleteId: null });
        }}
        onClick={() => this.props.onOpenDeck(deck.id)}
      >
        {/* Hero image area */}
        <div className="absolute inset-0" style={{
          backgroundImage: deck.previewUrl ? `url(${deck.previewUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: '10px',
        }}>
          {!deck.previewUrl && (
            <div className="flex items-center justify-center h-full">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={`${GOLD} 0.15)`} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="18" rx="2" />
                <path d="M2 8h20" />
                <path d="M8 3v5" />
                <path d="M16 3v5" />
                <path d="M7 13h.01" />
                <path d="M12 13h.01" />
                <path d="M17 13h.01" />
                <path d="M7 17h.01" />
                <path d="M12 17h.01" />
              </svg>
            </div>
          )}
        </div>

        {/* Bottom gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end p-3" style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)',
          borderRadius: '0 0 10px 10px',
          minHeight: '40%',
        }}>
          <span className="arena-heading text-sm font-bold truncate" style={{ color: TEXT_PRIMARY }}>
            {deck.name}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs" style={{ color: TEXT_MUTED }}>
              {deck.cardCount ?? 0} cards
            </span>
            {deck.format && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{
                color: `${GOLD} 0.7)`,
                background: `${GOLD} 0.08)`,
                fontSize: '10px',
              }}>
                {deck.format}
              </span>
            )}
          </div>
        </div>

        <FourCorners color={`${GOLD} 0.2)`} radius={10} />

        {/* Delete button (visible on hover) */}
        <button
          type="button"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(180,60,60,0.4)',
            color: '#c45050',
            fontSize: '13px',
            zIndex: 10,
          }}
          onClick={(e) => this.handleDeleteClick(e, deck.id)}
          title="Delete deck"
        >
          &#128465;
        </button>

        {/* Delete confirmation overlay */}
        {isConfirming && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3"
            style={{ background: 'rgba(0,0,0,0.85)', borderRadius: '10px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>Delete this deck?</span>
            <span className="text-xs px-4 text-center" style={{ color: TEXT_MUTED }}>"{deck.name}" will be permanently removed.</span>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-bold rounded cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  background: 'linear-gradient(180deg, rgba(180,60,60,0.7) 0%, rgba(120,30,30,0.7) 100%)',
                  border: '1px solid rgba(180,60,60,0.5)',
                  color: '#fdd',
                }}
                onClick={this.handleConfirmDelete}
              >
                Delete
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded cursor-pointer transition-opacity hover:opacity-80"
                style={{ ...BEVELED_BTN, color: TEXT_BODY }}
                onClick={this.handleCancelDelete}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  render() {
    const { onBack } = this.props;
    const { searchQuery, viewScale } = this.state;
    const filteredDecks = this.getFilteredDecks();

    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#08080a' }}>
        {/* Atmospheric background */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: BG_ATMOSPHERE }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        {/* Top bar */}
        <div
          className="relative z-10 flex items-center gap-4 px-6 py-3"
          style={{
            borderBottom: `1px solid ${GOLD} 0.15)`,
            background: 'rgba(12, 10, 8, 0.92)',
            zoom: viewScale,
          }}
        >
          {/* Back button */}
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-all duration-200 hover:opacity-80"
            style={{ ...BEVELED_BTN, color: TEXT_BODY, fontSize: '13px' }}
            onClick={onBack}
          >
            <span style={{ fontSize: '16px' }}>&larr;</span>
            Back
          </button>

          {/* Title */}
          <h1 className="arena-heading text-lg font-bold" style={{ color: TEXT_PRIMARY }}>
            Deck Collection
          </h1>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search decks..."
              value={searchQuery}
              onInput={this.handleSearch}
              className="pl-8 pr-3 py-1.5 text-sm w-56 outline-none"
              style={{ ...INPUT_STYLE, fontSize: '13px' }}
            />
            <span
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: TEXT_MUTED, fontSize: '13px' }}
            >
              &#128269;
            </span>
          </div>

          {/* Deck count */}
          <span className="text-sm" style={{ color: TEXT_MUTED }}>
            {filteredDecks.length} deck{filteredDecks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Grid area */}
        <div
          className="relative z-10 flex-1 overflow-y-auto px-8 py-6"
          style={{ zoom: viewScale }}
        >
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {this.renderNewDeckCard()}
            {filteredDecks.map((deck) => this.renderDeckCard(deck))}
          </div>

          {/* Empty state */}
          {filteredDecks.length === 0 && searchQuery.trim() && (
            <div className="flex flex-col items-center justify-center mt-16">
              <span className="text-lg" style={{ color: TEXT_MUTED }}>No decks match "{searchQuery}"</span>
            </div>
          )}
        </div>
      </div>
    );
  }
}
