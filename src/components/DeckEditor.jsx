import { Component } from 'preact';
import { Mail, Users } from 'lucide-react';
import { toast } from 'sonner';
import RuneSpinner from './RuneSpinner';
import AppHeader from './AppHeader';
import DeckEditorCollection from './DeckEditorCollection';
import DeckEditorSidebar from './DeckEditorSidebar';
import { playUI, UI } from '../utils/arena/uiSounds';
import SorceryDeckMetricsPanel from './SorceryDeckMetricsPanel';
import {
  GOLD, GOLD_TEXT, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, PANEL_BORDER,
  BEVELED_BTN, GOLD_BTN, INPUT_STYLE, ACCENT_GOLD,
  BG_ATMOSPHERE, VIGNETTE, DIALOG_STYLE,
  FourCorners, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import { buildOwnedMap, buildUsedMap } from '../utils/arena/collectionUtils';
import { canAddCard } from '../utils/sorcery/deckRules';

export default class DeckEditor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      chosenCards: (this.props.deck?.cards || []).map((entry) => {
        if (entry.zone) return entry;
        const cat = entry.card?._sorceryCategory;
        let zone = 'spellbook';
        if (cat === 'Site') zone = 'atlas';
        else if (cat === 'Avatar') zone = 'avatar';
        else if (entry.isSideboard) zone = 'collection';
        return { ...entry, zone };
      }),
      deckName: this.props.deck?.name || '',
      deckId: this.props.deck?.id || '',
      hasUnsavedChanges: false,
      isSaving: false,
      showStats: false,
      showUnsavedPrompt: false,
      hoveredSidebarCard: null,
      hoveredSidebarRect: null,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentDidUpdate(prevProps) {
    // Sync deck ID from parent when it changes (e.g., after first save assigns an ID)
    const newId = this.props.deck?.id;
    if (newId && newId !== prevProps.deck?.id && newId !== this.state.deckId) {
      this.setState({ deckId: newId });
    }
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  handleAddCard = (card, specificPrinting) => {
    const ownedMap = this.props.arenaProfile ? buildOwnedMap(this.props.arenaProfile.collection) : null;
    const usedElsewhereMap = this.props.arenaProfile ? buildUsedMap(this.props.arenaProfile.decks, this.state.deckId) : null;
    const check = canAddCard(card, this.state.chosenCards, { ownedMap, usedElsewhereMap });
    if (!check.allowed) {
      this.showToast(check.reason);
      return;
    }

    const printing = specificPrinting || card.printings?.[card.printings.length - 1] || card.printings?.[0];
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

  handleChangeZone = (cardUniqueId, newZone, foiling = 'S') => {
    this.setState((state) => {
      const idx = state.chosenCards.findIndex((c) =>
        c.card.unique_id === cardUniqueId && (c.printing?.foiling || 'S') === foiling
      );
      if (idx === -1) return null;
      const next = [...state.chosenCards];
      next[idx] = { ...next[idx], zone: newZone, isSideboard: newZone === 'collection' };
      return { chosenCards: next, hasUnsavedChanges: true };
    });
  };

  handleAddCardToZone = (card, zone) => {
    const printing = card.printings?.[card.printings.length - 1] || card.printings?.[0];
    if (!printing) return;

    const ownedMap = this.props.arenaProfile ? buildOwnedMap(this.props.arenaProfile.collection) : null;
    const usedElsewhereMap = this.props.arenaProfile ? buildUsedMap(this.props.arenaProfile.decks, this.state.deckId) : null;
    const check = canAddCard(card, this.state.chosenCards, { ownedMap, usedElsewhereMap });
    if (!check.allowed) {
      this.showToast(check.reason);
      return;
    }

    this.setState((state) => ({
      chosenCards: [...state.chosenCards, { card, printing, zone, isSideboard: zone === 'collection' }],
      hasUnsavedChanges: true,
    }));
  };

  // Animated sidebar card preview state
  _previewAnim = { opacity: 0, top: 0, targetTop: 0, visible: false, imgUrl: '', cardName: '', isSite: false, isFoil: false, foiling: '', sidebarLeft: 0 };
  _previewRafId = null;

  _getCardSize() {
    const gridCard = document.querySelector('.card-grid img');
    if (gridCard) {
      const r = gridCard.getBoundingClientRect();
      if (r.width > 50) return { w: Math.round(r.width * 1.2), h: Math.round(r.height * 1.2) };
    }
    return { w: 300, h: 420 };
  }

  handleSidebarHover = (cardUniqueId, hoverFoiling) => {
    if (!cardUniqueId) {
      this._previewAnim.visible = false;
      this._startPreviewLoop();
      return;
    }
    const targetFoiling = hoverFoiling || 'S';
    const card = this.state.chosenCards.find(c =>
      c.card.unique_id === cardUniqueId && (c.printing?.foiling || 'S') === targetFoiling
    ) || this.state.chosenCards.find(c => c.card.unique_id === cardUniqueId);
    if (!card) return;
    const row = document.querySelector(`[data-sidebar-card-id="${cardUniqueId}"][data-sidebar-foiling="${targetFoiling}"]`)
      || document.querySelector(`[data-sidebar-card-id="${cardUniqueId}"]`);
    const rect = row?.getBoundingClientRect();
    if (!rect) return;

    const imgUrl = card.printing?.image_url || card.card?.printings?.[0]?.image_url || '';
    const isSite = card.card?.played_horizontally;
    const foiling = card.printing?.foiling || 'S';
    const isFoil = foiling === 'F' || foiling === 'R';
    const cardSize = this._getCardSize();
    const previewW = isSite ? cardSize.h : cardSize.w;
    const previewH = isSite ? cardSize.w : cardSize.h;
    const centerY = rect.top + rect.height / 2;
    let targetTop = centerY - previewH / 2;
    if (targetTop < 8) targetTop = 8;
    if (targetTop + previewH > window.innerHeight - 8) targetTop = window.innerHeight - 8 - previewH;

    const anim = this._previewAnim;
    const wasVisible = anim.visible;
    anim.visible = true;
    anim.imgUrl = imgUrl;
    anim.cardName = card.card.name;
    anim.isSite = isSite;
    anim.isFoil = isFoil;
    anim.foiling = foiling;
    anim.sidebarLeft = rect.left;
    anim.targetTop = targetTop;
    anim.previewW = previewW;
    anim.previewH = previewH;
    if (!wasVisible) {
      anim.top = targetTop;
      anim.opacity = 0;
    }
    this._startPreviewLoop();
  };

  _startPreviewLoop = () => {
    if (this._previewRafId) return;
    this._previewRafId = requestAnimationFrame(this._tickPreview);
  };

  _tickPreview = () => {
    this._previewRafId = null;
    const anim = this._previewAnim;
    const speed = 0.18;

    if (anim.visible) {
      anim.opacity += (1 - anim.opacity) * speed;
      if (anim.opacity > 0.99) anim.opacity = 1;
    } else {
      anim.opacity += (0 - anim.opacity) * (speed * 1.5);
      if (anim.opacity < 0.01) anim.opacity = 0;
    }

    anim.top += (anim.targetTop - anim.top) * speed;

    const el = this._previewRef;
    if (el) {
      const previewW = anim.previewW || 300;
      const previewH = anim.previewH || 420;
      const gap = 16;
      const left = anim.sidebarLeft - previewW - gap;
      el.style.opacity = String(anim.opacity);
      el.style.top = `${anim.top}px`;
      el.style.left = `${left}px`;
      el.style.width = `${previewW}px`;
      el.style.height = `${previewH}px`;
      el.style.transform = `scale(${0.85 + anim.opacity * 0.15})`;
      el.style.display = anim.opacity > 0.01 ? 'block' : 'none';

      // Foil overlay classes — must match the DeckCardTile foil rendering
      const inner = el.querySelector('[data-preview-inner]');
      if (inner) {
        if (anim.isFoil) {
          inner.className = 'w-full h-full rounded-[14px] card-mask foil-overlay foil-overlay--always';
          inner.setAttribute('data-foil', anim.foiling);
        } else {
          inner.className = 'w-full h-full rounded-[14px] card-mask';
          inner.removeAttribute('data-foil');
        }
      }

      const img = el.querySelector('img');
      if (img && img.src !== anim.imgUrl && anim.imgUrl) img.src = anim.imgUrl;
      if (img) {
        img.alt = anim.cardName;
        if (anim.isSite) {
          img.style.transform = 'rotate(90deg)';
          img.style.transformOrigin = 'center center';
          img.style.width = `${previewH}px`;
          img.style.height = `${previewW}px`;
          img.style.position = 'absolute';
          img.style.top = `${(previewH - previewW) / 2}px`;
          img.style.left = `${(previewW - previewH) / 2}px`;
        } else {
          img.style.transform = 'none';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.position = 'static';
          img.style.top = '';
          img.style.left = '';
        }
      }
    }

    const isSettled = anim.visible ? anim.opacity >= 1 && Math.abs(anim.top - anim.targetTop) < 0.5
      : anim.opacity <= 0;
    if (!isSettled) {
      this._previewRafId = requestAnimationFrame(this._tickPreview);
    }
  };

  renderSidebarPreview() {
    return (
      <div
        ref={(el) => { this._previewRef = el; }}
        className="fixed pointer-events-none z-[60]"
        style={{
          display: 'none',
          opacity: 0,
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,0,0,0.4)',
          transformOrigin: 'right center',
          willChange: 'transform, opacity, top',
        }}
      >
        <div data-preview-inner className="w-full h-full rounded-[14px] card-mask">
          <img src="" alt="" className="object-cover" draggable={false} />
        </div>
      </div>
    );
  }

  showToast = (message) => {
    toast(message);
  };

  handleIncrement = (cardUniqueId, foiling = 'S') => {
    const existing = this.state.chosenCards.find(c =>
      c.card.unique_id === cardUniqueId && (c.printing?.foiling || 'S') === foiling
    );
    if (!existing) return;
    playUI(UI.EQUIP);
    this.handleAddCard(existing.card, existing.printing);
  };

  handleDecrement = (cardUniqueId, foiling = 'S') => {
    playUI(UI.UNEQUIP);
    this.setState(state => {
      const idx = state.chosenCards.findLastIndex(c =>
        c.card.unique_id === cardUniqueId && (c.printing?.foiling || 'S') === foiling
      );
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

      const result = await this.props.onSave(payload);
      this.setState({
        isSaving: false,
        hasUnsavedChanges: false,
        deckId: result?.id || this.state.deckId,
        deckName: result?.name || this.state.deckName,
      });
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
    const { sorceryCards, arenaProfile, onToggleMailbox, mailboxUnreadCount, mailboxDropdown, onToggleFriends, friendListData } = this.props;
    const { chosenCards, deckName, isSaving, showStats, showUnsavedPrompt, viewScale } = this.state;
    const isArenaMode = !!arenaProfile;
    const ownedMap = arenaProfile ? buildOwnedMap(arenaProfile.collection) : new Map();
    const canSave = chosenCards.length > 0 && !isSaving;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: 'url("/deck-builder-bg.webp") center no-repeat, #08080a', backgroundSize: '100% 100%' }}>
        {/* Dim + vignette overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.4)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        {/* ─── TOOLBAR ──────────────────────────────────────── */}
        <AppHeader
          profile={arenaProfile}
          onToggleMailbox={onToggleMailbox}
          mailboxUnreadCount={mailboxUnreadCount}
          mailboxDropdown={mailboxDropdown}
          onToggleFriends={onToggleFriends}
          friendListData={friendListData}
          zoom={viewScale}
        >
          <button
            type="button"
            data-sound={UI.CANCEL}
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ ...BEVELED_BTN, color: TEXT_BODY }}
            onClick={this.handleBack}
          >
            &#8592; Back
          </button>
          <input
            type="text"
            value={deckName}
            placeholder="Untitled Deck"
            className="arena-heading text-lg font-bold px-3 py-1.5 flex-shrink-0 w-64 outline-none transition-colors duration-200 focus:border-[rgba(180,140,60,0.35)]"
            style={{ ...INPUT_STYLE, color: TEXT_PRIMARY, fontSize: '18px' }}
            onInput={(e) => this.setState({ deckName: e.target.value, hasUnsavedChanges: true })}
          />
          <button
            type="button"
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ ...BEVELED_BTN, color: TEXT_BODY }}
            onClick={() => this.setState({ showStats: true })}
          >
            Stats
          </button>
          <button
            type="button"
            data-sound={UI.CONFIRM}
            className="px-5 py-1.5 text-sm font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
            style={GOLD_BTN}
            disabled={!canSave}
            onClick={this.handleSave}
          >
            {isSaving ? <RuneSpinner size={18} className="inline-block" /> : 'Save Deck'}
          </button>
        </AppHeader>

        {/* ─── MAIN CONTENT ─────────────────────────────────── */}
        <div
          className="relative z-10 flex-1 flex min-h-0"
          style={{ zoom: viewScale }}
        >
          {/* Collection browser */}
          <div className="flex-1 min-w-0 px-4 py-2">
            <DeckEditorCollection
              sorceryCards={sorceryCards}
              collection={arenaProfile?.collection}
              ownedMap={ownedMap}
              chosenCards={chosenCards}
              onAddCard={this.handleAddCard}
              onRemoveCard={this.handleDecrement}
              onShowToast={this.showToast}
              isArenaMode={isArenaMode}
            />
          </div>

          {/* Sidebar */}
          <div className="w-[300px] shrink-0 overflow-hidden h-full">
            <DeckEditorSidebar
              chosenCards={chosenCards}
              onIncrement={this.handleIncrement}
              onDecrement={this.handleDecrement}
              onChangeZone={this.handleChangeZone}
              onCardHover={this.handleSidebarHover}
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
              className="relative w-[520px] max-w-[90vw] p-8"
              style={DIALOG_STYLE}
              onClick={(e) => e.stopPropagation()}
            >
              <FourCorners />
              <h2 className="arena-heading text-xl font-bold mb-2" style={{ color: TEXT_PRIMARY }}>Unsaved Changes</h2>
              <p className="text-sm mb-6" style={{ color: TEXT_BODY }}>You have unsaved changes. Save before leaving?</p>
              <div className="flex items-center gap-3 justify-end">
                <button
                  type="button"
                  className="whitespace-nowrap px-5 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  style={{ ...BEVELED_BTN, color: TEXT_MUTED }}
                  onClick={() => { playUI(UI.CANCEL); this.setState({ showUnsavedPrompt: false }); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="whitespace-nowrap px-5 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  style={{ ...BEVELED_BTN, color: '#c45050' }}
                  onClick={() => { playUI(UI.DELETE); this.setState({ showUnsavedPrompt: false }); this.props.onBack(); }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="whitespace-nowrap px-6 py-2 text-sm font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  style={GOLD_BTN}
                  onClick={() => { playUI(UI.CONFIRM); this.handleSaveAndLeave(); }}
                >
                  Save &amp; Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar hover card preview */}
        {this.renderSidebarPreview()}
      </div>
    );
  }
}
