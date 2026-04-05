import { Component } from 'preact';
import DeckEditorCollection from './DeckEditorCollection';
import DeckEditorSidebar from './DeckEditorSidebar';
import SorceryDeckMetricsPanel from './SorceryDeckMetricsPanel';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, PANEL_BORDER,
  BEVELED_BTN, GOLD_BTN, INPUT_STYLE, ACCENT_GOLD,
  BG_ATMOSPHERE, VIGNETTE, DIALOG_STYLE,
  FourCorners, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import { buildOwnedMap, buildUsedMap, getAvailableQuantity } from '../utils/arena/collectionUtils';

export default class DeckEditor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      chosenCards: this.props.deck?.cards || [],
      deckName: this.props.deck?.name || '',
      deckId: this.props.deck?.id || '',
      hasUnsavedChanges: false,
      isSaving: false,
      showStats: false,
      showUnsavedPrompt: false,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  handleAddCard = (card) => {
    if (this.props.arenaProfile) {
      const { collection, decks } = this.props.arenaProfile;
      const ownedMap = buildOwnedMap(collection);
      const usedMap = buildUsedMap(decks, this.state.deckId);
      const available = getAvailableQuantity(card.unique_id, ownedMap, usedMap);
      const inDeck = this.state.chosenCards.filter(c => c.card.unique_id === card.unique_id).length;
      if (inDeck >= available) return;
    }

    const printing = card.printings?.[card.printings.length - 1] || card.printings?.[0];
    if (!printing) return;

    let zone = 'spellbook';
    if (card._sorceryCategory) {
      zone = card._sorceryCategory.toLowerCase();
      if (zone === 'spell') zone = 'spellbook';
    }

    this.setState(state => ({
      chosenCards: [...state.chosenCards, { card, printing, zone, isSideboard: false }],
      hasUnsavedChanges: true,
    }));
  };

  handleIncrement = (cardUniqueId) => {
    const existing = this.state.chosenCards.find(c => c.card.unique_id === cardUniqueId);
    if (!existing) return;
    this.handleAddCard(existing.card);
  };

  handleDecrement = (cardUniqueId) => {
    this.setState(state => {
      const idx = state.chosenCards.findLastIndex(c => c.card.unique_id === cardUniqueId);
      if (idx === -1) return null;
      const next = [...state.chosenCards];
      next.splice(idx, 1);
      return { chosenCards: next, hasUnsavedChanges: true };
    });
  };

  handleSave = async () => {
    if (this.state.isSaving || this.state.chosenCards.length === 0) return;
    this.setState({ isSaving: true });
    try {
      const cards = this.state.chosenCards.map(entry => {
        const cardId = entry.card?.unique_id;
        const printingId = entry.printing?._source_printing_id || entry.printing?.unique_id;
        if (!cardId || !printingId) return null;
        return { cardId, cardName: entry.card.name, printingId, isSideboard: entry.zone === 'collection' };
      }).filter(Boolean);

      const sorted = [...this.state.chosenCards].sort((a, b) => {
        const aAvatar = a.zone === 'avatar' || a.card?._sorceryCategory === 'Avatar' ? 0 : 1;
        const bAvatar = b.zone === 'avatar' || b.card?._sorceryCategory === 'Avatar' ? 0 : 1;
        return aAvatar - bAvatar;
      });
      const seen = new Set();
      const previewCards = [];
      for (const entry of sorted) {
        const id = entry.card?.unique_id;
        if (!id || seen.has(id)) continue;
        const url = entry.printing?.image_url || '';
        if (!url || url.startsWith('blob:')) continue;
        seen.add(id);
        previewCards.push({ name: entry.card.name, imageUrl: url });
        if (previewCards.length >= 10) break;
      }

      const payload = {
        ...(this.state.deckId ? { id: this.state.deckId } : {}),
        name: this.state.deckName.trim() || 'Untitled Deck',
        format: 'constructed',
        cards,
        previewCards,
      };

      await this.props.onSave(payload);
      this.setState({ isSaving: false, hasUnsavedChanges: false });
    } catch (err) {
      console.error('Failed to save deck:', err);
      this.setState({ isSaving: false });
    }
  };

  handleBack = () => {
    if (this.state.hasUnsavedChanges) {
      this.setState({ showUnsavedPrompt: true });
      return;
    }
    this.props.onBack();
  };

  handleSaveAndLeave = async () => {
    await this.handleSave();
    this.setState({ showUnsavedPrompt: false });
    this.props.onBack();
  };

  render() {
    const { sorceryCards, arenaProfile } = this.props;
    const { chosenCards, deckName, isSaving, showStats, showUnsavedPrompt, viewScale } = this.state;
    const isArenaMode = !!arenaProfile;
    const ownedMap = arenaProfile ? buildOwnedMap(arenaProfile.collection) : new Map();
    const canSave = chosenCards.length > 0 && !isSaving;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: BG_ATMOSPHERE }}>
        {/* Vignette overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        {/* ─── TOOLBAR ──────────────────────────────────────── */}
        <div
          className="relative z-10 flex items-center gap-3 px-5 py-2.5 shrink-0"
          style={{ borderBottom: `1px solid ${GOLD} 0.15)`, background: 'rgba(12, 10, 8, 0.92)', zoom: viewScale }}
        >
          {/* Back button */}
          <button
            type="button"
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ ...BEVELED_BTN, color: TEXT_BODY }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 15px ${GOLD} 0.1)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; e.currentTarget.style.boxShadow = BEVELED_BTN.boxShadow; }}
            onClick={this.handleBack}
          >
            &#8592; Back
          </button>

          {/* Deck name input */}
          <input
            type="text"
            value={deckName}
            placeholder="Untitled Deck"
            className="arena-heading text-lg font-bold px-3 py-1.5 flex-shrink-0 w-64 outline-none transition-colors duration-200 focus:border-[rgba(180,140,60,0.35)]"
            style={{ ...INPUT_STYLE, color: TEXT_PRIMARY, fontSize: '18px' }}
            onInput={(e) => this.setState({ deckName: e.target.value, hasUnsavedChanges: true })}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Stats button */}
          <button
            type="button"
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ ...BEVELED_BTN, color: TEXT_BODY }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 15px ${GOLD} 0.1)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; e.currentTarget.style.boxShadow = BEVELED_BTN.boxShadow; }}
            onClick={() => this.setState({ showStats: true })}
          >
            Stats
          </button>

          {/* Save button */}
          <button
            type="button"
            className="px-5 py-1.5 text-sm font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
            style={GOLD_BTN}
            disabled={!canSave}
            onClick={this.handleSave}
          >
            {isSaving ? 'Saving\u2026' : 'Save Deck'}
          </button>
        </div>

        {/* ─── MAIN CONTENT ─────────────────────────────────── */}
        <div
          className="relative z-10 flex-1 flex min-h-0 overflow-hidden"
          style={{ zoom: viewScale }}
        >
          {/* Collection browser (~70%) */}
          <div className="flex-[7] min-w-0 overflow-hidden">
            <DeckEditorCollection
              sorceryCards={sorceryCards}
              ownedMap={ownedMap}
              chosenCards={chosenCards}
              onAddCard={this.handleAddCard}
              isArenaMode={isArenaMode}
            />
          </div>

          {/* Sidebar (~30%) */}
          <div className="flex-[3] min-w-0 overflow-hidden" style={{ borderLeft: `1px solid ${GOLD} 0.12)` }}>
            <DeckEditorSidebar
              chosenCards={chosenCards}
              onIncrement={this.handleIncrement}
              onDecrement={this.handleDecrement}
            />
          </div>
        </div>

        {/* ─── STATS MODAL ──────────────────────────────────── */}
        {showStats && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            style={{ zoom: viewScale }}
            onClick={() => this.setState({ showStats: false })}
          >
            <div
              className="relative w-[720px] max-h-[80vh] overflow-y-auto p-6"
              style={DIALOG_STYLE}
              onClick={(e) => e.stopPropagation()}
            >
              <FourCorners />
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="arena-heading text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Deck Statistics</h2>
                <button
                  type="button"
                  className="px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.05] active:scale-[0.97]"
                  style={{ ...BEVELED_BTN, color: TEXT_MUTED }}
                  onClick={() => this.setState({ showStats: false })}
                >
                  Close
                </button>
              </div>
              <SorceryDeckMetricsPanel chosenCards={chosenCards} />
            </div>
          </div>
        )}

        {/* ─── UNSAVED CHANGES DIALOG ───────────────────────── */}
        {showUnsavedPrompt && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            style={{ zoom: viewScale }}
            onClick={() => this.setState({ showUnsavedPrompt: false })}
          >
            <div
              className="relative w-[420px] p-6"
              style={DIALOG_STYLE}
              onClick={(e) => e.stopPropagation()}
            >
              <FourCorners />
              <h2 className="arena-heading text-lg font-bold mb-3" style={{ color: TEXT_PRIMARY }}>Unsaved Changes</h2>
              <p className="text-sm mb-5" style={{ color: TEXT_BODY }}>You have unsaved changes. Save before leaving?</p>
              <div className="flex items-center gap-3 justify-end">
                <button
                  type="button"
                  className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  style={{ ...BEVELED_BTN, color: TEXT_MUTED }}
                  onClick={() => this.setState({ showUnsavedPrompt: false })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  style={{ ...BEVELED_BTN, color: '#c45050' }}
                  onClick={() => { this.setState({ showUnsavedPrompt: false }); this.props.onBack(); }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="px-5 py-1.5 text-sm font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  style={GOLD_BTN}
                  onClick={this.handleSaveAndLeave}
                >
                  Save &amp; Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
