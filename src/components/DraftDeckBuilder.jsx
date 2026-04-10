import { Component } from 'preact';
import { cn } from '../lib/utils';
import CardInspector, { RARITY_LABEL_COLOR } from './CardInspector';
import DeckCardTile from './DeckCardTile';
import DeckEditorSidebar from './DeckEditorSidebar';
import AmbientParticles from './AmbientParticles';
import RuneSpinner from './RuneSpinner';
import { playUI, UI } from '../utils/arena/uiSounds';
import { submitDraftDeck, subscribeToDraftEvents } from '../utils/arena/draftApi';
import { resolvePackContents } from '../utils/arena/packsApi';
import { Select } from './ui/select';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, PANEL_BG,
  BEVELED_BTN, GOLD_BTN,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

const MIN_SPELLBOOK = 24;
const MIN_ATLAS = 12;

const BASIC_SITE_NAMES = ['Spire', 'Stream', 'Valley', 'Wasteland'];
const BASIC_SITE_ELEMENTS = { Spire: 'Air', Stream: 'Water', Valley: 'Earth', Wasteland: 'Fire' };

// Resolve basic sites and Spellslinger from the real card database where possible.
// Cards not found get a minimal placeholder that the sidebar can render (with element initial).
function resolveBasicSites(sorceryCards) {
  return BASIC_SITE_NAMES.map((name) => {
    const real = (sorceryCards || []).find((c) => c.name === name && (c.type === 'Site' || c._sorceryCategory === 'Site'));
    if (real) return real;
    return {
      unique_id: `basic-${name.toLowerCase()}`,
      name,
      type: 'Site',
      _sorceryCategory: 'Site',
      played_horizontally: true,
      rarity: 'Ordinary',
      printings: [{ foiling: 'S', unique_id: `basic-${name.toLowerCase()}-s` }],
    };
  });
}

function resolveSpellslinger(sorceryCards) {
  const real = (sorceryCards || []).find((c) => c.name === 'Spellslinger' && (c.type === 'Avatar' || c._sorceryCategory === 'Avatar'));
  if (real) return real;
  return {
    unique_id: 'spellslinger',
    name: 'Spellslinger',
    type: 'Avatar',
    _sorceryCategory: 'Avatar',
    rarity: 'Unique',
    printings: [{ foiling: 'S' }],
  };
}

function isAvatarCard(card) { return card?.type === 'Avatar' || card?._sorceryCategory === 'Avatar'; }
function isSiteCard(card) { return card?.type === 'Site' || card?._sorceryCategory === 'Site' || card?.played_horizontally; }

export default class DraftDeckBuilder extends Component {
  constructor(props) {
    super(props);

    const rawDrafted = props.draftedCards || [];
    const resolved = resolvePackContents(rawDrafted, props.sorceryCards || []);

    const spellslinger = resolveSpellslinger(props.sorceryCards);
    const basicSites = resolveBasicSites(props.sorceryCards);
    const draftedAvatars = resolved.filter((e) => isAvatarCard(e.card)).map((e) => e.card);
    const availableAvatars = [spellslinger, ...draftedAvatars];

    const initialChosen = [{
      card: spellslinger,
      printing: spellslinger.printings?.[0] || {},
      zone: 'avatar',
      uniqueId: spellslinger.unique_id,
      foiling: 'S',
    }];

    this.state = {
      resolvedPool: resolved,
      chosenCards: initialChosen,
      avatar: spellslinger,
      availableAvatars,
      basicSites,
      timeLeft: 30 * 60,
      submitting: false,
      submitted: false,
      error: null,
      hoveredIndex: -1,
      inspectedEntry: null,
      viewScale: getViewportScale(),
    };
    this.timer = null;
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.unsubDraft = subscribeToDraftEvents({
      timer: (data) => { if (data.phase === 'building') this.setState({ timeLeft: data.timeLeft }); },
      round_start: (data) => { this.props.onTournamentStart?.(data); },
    });
    this.timer = setInterval(() => {
      this.setState((s) => ({ timeLeft: Math.max(0, s.timeLeft - 1) }));
    }, 1000);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.unsubScale?.();
    this.unsubDraft?.();
    clearInterval(this.timer);
    if (this._previewRafId) cancelAnimationFrame(this._previewRafId);
  }

  handleKeyDown = (e) => {
    if (e.repeat) return;
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (this.state.inspectedEntry) {
        playUI(UI.INSPECTOR_CLOSE);
        this.setState({ inspectedEntry: null });
      } else if (this.state.hoveredIndex >= 0) {
        const pool = this.getUnassignedPool();
        if (pool[this.state.hoveredIndex]) {
          playUI(UI.INSPECTOR_OPEN);
          this.setState({ inspectedEntry: pool[this.state.hoveredIndex] });
        }
      }
    }
    if (e.key === 'Escape' && this.state.inspectedEntry) {
      playUI(UI.INSPECTOR_CLOSE);
      this.setState({ inspectedEntry: null });
    }
  };

  getUnassignedPool() {
    const { resolvedPool, chosenCards } = this.state;
    const usedIndexes = new Set(chosenCards.filter((e) => e._poolIndex != null).map((e) => e._poolIndex));
    return resolvedPool
      .map((entry, i) => ({ ...entry, _poolIndex: i }))
      .filter((entry) => !usedIndexes.has(entry._poolIndex) && !isAvatarCard(entry.card));
  }

  handleAddCard = (entry) => {
    if (this.state.submitted) return;
    const card = entry.card;
    if (!card || isAvatarCard(card)) return;

    const zone = isSiteCard(card) ? 'atlas' : 'spellbook';
    this.setState((s) => ({
      chosenCards: [...s.chosenCards, {
        card, printing: entry.printing || {}, zone,
        uniqueId: card.unique_id, foiling: entry.printing?.foiling || 'S',
        _poolIndex: entry._poolIndex,
      }],
    }));
    playUI(UI.CARD_PLACE);
  };

  handleRemoveCard = (uniqueId, foiling) => {
    if (this.state.submitted) return;
    this.setState((s) => {
      const idx = s.chosenCards.findIndex((e) =>
        e.card?.unique_id === uniqueId && (e.printing?.foiling || 'S') === foiling && e.zone !== 'avatar'
      );
      if (idx === -1) return null;
      const next = [...s.chosenCards];
      next.splice(idx, 1);
      return { chosenCards: next };
    });
  };

  handleIncrement = (uniqueId, foiling) => {
    if (this.state.submitted) return;
    const pool = this.getUnassignedPool();
    const entry = pool.find((e) => e.card?.unique_id === uniqueId && (e.printing?.foiling || 'S') === foiling);
    if (entry) this.handleAddCard(entry);
  };

  handleChangeZone = (uniqueId, newZone, foiling) => {
    if (this.state.submitted) return;
    this.setState((s) => ({
      chosenCards: s.chosenCards.map((e) =>
        e.card?.unique_id === uniqueId && (e.printing?.foiling || 'S') === foiling
          ? { ...e, zone: newZone } : e
      ),
    }));
  };

  addBasicSite = (siteCard) => {
    if (this.state.submitted) return;
    this.setState((s) => ({
      chosenCards: [...s.chosenCards, {
        card: siteCard,
        printing: siteCard.printings?.[0] || {},
        zone: 'atlas',
        uniqueId: siteCard.unique_id,
        foiling: 'S',
      }],
    }));
    playUI(UI.CARD_PLACE);
  };

  removeBasicSite = (e, siteCard) => {
    e.preventDefault();
    if (this.state.submitted) return;
    this.setState((s) => {
      const idx = s.chosenCards.findIndex((c) => c.card?.unique_id === siteCard.unique_id);
      if (idx === -1) return null;
      const next = [...s.chosenCards];
      next.splice(idx, 1);
      return { chosenCards: next };
    });
  };

  setAvatar = (avatarId) => {
    if (this.state.submitted) return;
    const avatar = this.state.availableAvatars.find((a) => (a.unique_id || a.cardId) === avatarId);
    if (!avatar) return;

    this.setState((s) => ({
      avatar,
      chosenCards: [
        // Replace avatar entry
        { card: avatar, printing: avatar.printings?.[0] || {}, zone: 'avatar', uniqueId: avatar.unique_id || avatar.cardId, foiling: 'S' },
        ...s.chosenCards.filter((e) => e.zone !== 'avatar'),
      ],
    }));
  };

  getBasicSiteCount(uniqueId) {
    return this.state.chosenCards.filter((e) => e.card?.unique_id === uniqueId).length;
  }

  getTotalAtlasCount() {
    return this.state.chosenCards.filter((e) => e.zone === 'atlas').length;
  }

  getSpellbookCount() {
    return this.state.chosenCards.filter((e) => e.zone === 'spellbook').length;
  }

  isValid() {
    return this.getSpellbookCount() >= MIN_SPELLBOOK && this.getTotalAtlasCount() >= MIN_ATLAS && this.state.avatar;
  }

  handleSubmit = async () => {
    if (!this.isValid() || this.state.submitting) return;
    this.setState({ submitting: true, error: null });

    const { chosenCards, avatar } = this.state;
    const spellbook = chosenCards.filter((e) => e.zone === 'spellbook').map((e) => ({ cardId: e.card.unique_id, printingId: e.printing?.unique_id }));
    const atlas = chosenCards.filter((e) => e.zone === 'atlas').map((e) => ({ cardId: e.card.unique_id, printingId: e.printing?.unique_id }));

    try {
      await submitDraftDeck(this.props.eventId, {
        spellbook, atlas, avatarId: avatar.unique_id || avatar.cardId,
      });
      this.setState({ submitted: true, submitting: false });
    } catch (err) {
      this.setState({ submitting: false, error: err.message });
    }
  };

  // --- Sidebar hover preview (same RAF system as DeckEditor) ---

  _previewAnim = { opacity: 0, top: 0, targetTop: 0, visible: false, imgUrl: '', cardName: '', isSite: false, isFoil: false, foiling: '', sidebarLeft: 0 };
  _previewRafId = null;

  handleSidebarHover = (cardUniqueId, hoverFoiling) => {
    if (!cardUniqueId) {
      this._previewAnim.visible = false;
      this._startPreviewLoop();
      return;
    }
    const targetFoiling = hoverFoiling || 'S';
    const card = this.state.chosenCards.find((c) =>
      c.card?.unique_id === cardUniqueId && (c.printing?.foiling || 'S') === targetFoiling
    ) || this.state.chosenCards.find((c) => c.card?.unique_id === cardUniqueId);
    if (!card) return;
    const row = document.querySelector(`[data-sidebar-card-id="${cardUniqueId}"][data-sidebar-foiling="${targetFoiling}"]`)
      || document.querySelector(`[data-sidebar-card-id="${cardUniqueId}"]`);
    const rect = row?.getBoundingClientRect();
    if (!rect) return;

    const imgUrl = card.printing?.image_url || card.card?.printings?.[0]?.image_url || '';
    const isSite = card.card?.played_horizontally;
    const foiling = card.printing?.foiling || 'S';
    const isFoil = foiling === 'F' || foiling === 'R';
    const previewW = isSite ? 420 : 300;
    const previewH = isSite ? 300 : 420;
    const centerY = rect.top + rect.height / 2;
    let targetTop = centerY - previewH / 2;
    if (targetTop < 8) targetTop = 8;
    if (targetTop + previewH > window.innerHeight - 8) targetTop = window.innerHeight - 8 - previewH;

    const anim = this._previewAnim;
    const wasVisible = anim.visible;
    anim.visible = true;
    anim.imgUrl = imgUrl;
    anim.cardName = card.card?.name || '';
    anim.isSite = isSite;
    anim.isFoil = isFoil;
    anim.foiling = foiling;
    anim.sidebarLeft = rect.left;
    anim.targetTop = targetTop;
    anim.previewW = previewW;
    anim.previewH = previewH;
    if (!wasVisible) { anim.top = targetTop; anim.opacity = 0; }
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
      const { previewW = 300, previewH = 420 } = anim;
      const gap = 16;
      const left = anim.sidebarLeft - previewW - gap;
      el.style.opacity = String(anim.opacity);
      el.style.top = `${anim.top}px`;
      el.style.left = `${left}px`;
      el.style.width = `${previewW}px`;
      el.style.height = `${previewH}px`;
      el.style.transform = `scale(${0.85 + anim.opacity * 0.15})`;
      el.style.display = anim.opacity > 0.01 ? 'block' : 'none';

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

    const isSettled = anim.visible ? anim.opacity >= 1 && Math.abs(anim.top - anim.targetTop) < 0.5 : anim.opacity <= 0;
    if (!isSettled) this._previewRafId = requestAnimationFrame(this._tickPreview);
  };

  render() {
    const { chosenCards, avatar, availableAvatars, basicSites, timeLeft, submitting, submitted, error, hoveredIndex, inspectedEntry, viewScale } = this.state;

    const pool = this.getUnassignedPool();
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timerUrgent = timeLeft <= 120;
    const totalAtlas = this.getTotalAtlasCount();
    const spellbookCount = this.getSpellbookCount();
    const valid = this.isValid();
    const cardWidth = 140;

    const avatarOptions = availableAvatars.map((a) => ({
      value: a.unique_id || a.cardId || 'spellslinger',
      label: a.name || 'Unknown',
    }));

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: '#08080a' }}>
        <div className="absolute inset-0" style={{ background: `url('/hub-bg.png') center/cover no-repeat`, filter: 'blur(6px)', transform: 'scale(1.02)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 100%)' }} />
        <AmbientParticles />

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-2.5 relative z-20" style={{ background: PANEL_BG, borderBottom: `1px solid ${GOLD} 0.15)`, backdropFilter: 'blur(8px)' }}>
          <div className="text-sm font-bold arena-heading" style={{ color: ACCENT_GOLD }}>Build Your Deck</div>
          <div className="text-[10px]" style={{ color: TEXT_MUTED }}>
            Spellbook <span style={{ color: spellbookCount >= MIN_SPELLBOOK ? '#6dba6d' : '#e06060' }}>{spellbookCount}/{MIN_SPELLBOOK}+</span>
            {' · '}Atlas <span style={{ color: totalAtlas >= MIN_ATLAS ? '#6dba6d' : '#e06060' }}>{totalAtlas}/{MIN_ATLAS}+</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {error ? <div className="text-[10px]" style={{ color: '#e06060' }}>{error}</div> : null}
            <div
              className="text-lg font-bold tabular-nums px-3 py-0.5 rounded"
              style={{ color: timerUrgent ? '#e06060' : TEXT_PRIMARY, background: timerUrgent ? 'rgba(224,96,96,0.1)' : 'rgba(0,0,0,0.3)' }}
            >
              {minutes}:{String(seconds).padStart(2, '0')}
            </div>
            <button
              type="button"
              className="px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
              style={valid && !submitted ? GOLD_BTN : BEVELED_BTN}
              data-sound={UI.CONFIRM}
              disabled={!valid || submitting || submitted}
              onClick={this.handleSubmit}
            >
              {submitted ? 'Submitted!' : submitting ? <RuneSpinner size={16} className="inline-block" /> : 'Submit Deck'}
            </button>
          </div>
        </div>

        {/* Avatar + Basic Sites bar — below header, like the filter bar in DeckEditor */}
        <div className="relative z-20 flex items-center gap-6 px-6 py-2" style={{ background: 'rgba(12,10,8,0.85)', borderBottom: `1px solid ${GOLD} 0.1)` }}>
          {/* Avatar selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: `${GOLD} 0.55)` }}>Avatar</span>
            <div style={{ width: 160 }}>
              <Select
                ariaLabel="Avatar"
                options={avatarOptions}
                value={avatar?.unique_id || avatar?.cardId || 'spellslinger'}
                onValueChange={this.setAvatar}
              />
            </div>
          </div>

          {/* Basic sites — miniature card tiles */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: `${GOLD} 0.55)` }}>Basic Sites</span>
            <div className="flex gap-2">
              {basicSites.map((siteCard) => {
                const count = this.getBasicSiteCount(siteCard.unique_id);
                const element = BASIC_SITE_ELEMENTS[siteCard.name] || '';
                return (
                  <div
                    key={siteCard.unique_id}
                    className="relative flex flex-col items-center cursor-pointer"
                    onClick={() => this.addBasicSite(siteCard)}
                    onContextMenu={(e) => this.removeBasicSite(e, siteCard)}
                    title={`${siteCard.name} (${element}) — Left-click to add, right-click to remove`}
                  >
                    <div
                      className="transition-all hover:scale-[1.06] active:scale-[0.95]"
                      style={{
                        width: 56,
                        height: Math.round(56 * 88 / 63),
                        borderRadius: 6,
                        border: count > 0 ? `2px solid ${ACCENT_GOLD}` : '2px solid transparent',
                        boxShadow: count > 0 ? `0 0 8px rgba(212,168,67,0.25)` : 'none',
                        overflow: 'hidden',
                      }}
                    >
                      <DeckCardTile
                        entry={{ card: siteCard, printing: siteCard.printings?.[0] || {}, zone: 'atlas', entryIndex: 0 }}
                        isSelected={false}
                        onClick={() => {}}
                        onHoverChange={() => {}}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums font-semibold mt-0.5" style={{ color: count > 0 ? ACCENT_GOLD : TEXT_MUTED }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 flex-1 flex min-h-0" style={{ zoom: viewScale }}>
          {/* Left: Card pool */}
          <div className="flex-1 min-w-0 flex flex-col px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: TEXT_MUTED }}>
              Draft Pool ({pool.length} remaining) — click to add · Space to inspect
            </div>
            <div
              className="flex-1 overflow-y-auto pr-1"
              style={{ scrollbarWidth: 'thin' }}
              onMouseLeave={() => this.setState({ hoveredIndex: -1 })}
            >
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}>
                {pool.map((entry, i) => (
                  <div key={`pool-${entry.card?.unique_id}-${entry._poolIndex}`} style={{ width: '100%', aspectRatio: '63/88' }}>
                    <DeckCardTile
                      entry={{ card: entry.card, printing: entry.printing || {}, zone: 'spellbook', entryIndex: i }}
                      isSelected={false}
                      onClick={() => this.handleAddCard(entry)}
                      onHoverChange={(hovered) => {
                        this.setState({ hoveredIndex: hovered ? i : -1 });
                        if (hovered) playUI(UI.HOVER, { volume: 0.4 });
                      }}
                    />
                  </div>
                ))}
              </div>
              {pool.length === 0 ? (
                <div className="text-xs text-center py-8" style={{ color: TEXT_MUTED }}>All cards assigned to deck</div>
              ) : null}
            </div>
          </div>

          {/* Right: DeckEditorSidebar */}
          <div className="w-[300px] shrink-0 overflow-hidden h-full">
            <DeckEditorSidebar
              chosenCards={chosenCards}
              onIncrement={this.handleIncrement}
              onDecrement={this.handleRemoveCard}
              onChangeZone={this.handleChangeZone}
              onCardHover={this.handleSidebarHover}
            />
          </div>
        </div>

        {/* Sidebar hover preview */}
        <div
          ref={(el) => { this._previewRef = el; }}
          className="fixed pointer-events-none z-[60]"
          style={{ display: 'none', opacity: 0, borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,0,0,0.4)', transformOrigin: 'right center', willChange: 'transform, opacity, top' }}
        >
          <div data-preview-inner className="w-full h-full rounded-[14px] card-mask">
            <img src="" alt="" className="object-cover" draggable={false} />
          </div>
        </div>

        {/* Card inspector */}
        {inspectedEntry ? (
          <CardInspector
            card={inspectedEntry.card}
            imageUrl={inspectedEntry.printing?.image_url}
            rarity={inspectedEntry.rarity || inspectedEntry.card?.rarity}
            foiling={inspectedEntry.printing?.foiling}
            zoom={1}
            onClose={() => { playUI(UI.INSPECTOR_CLOSE); this.setState({ inspectedEntry: null }); }}
          />
        ) : null}

        {/* Submitted overlay — blocks further interaction */}
        {submitted ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div className="text-center">
              <RuneSpinner size={48} />
              <div className="text-sm font-semibold mt-4" style={{ color: TEXT_PRIMARY }}>Deck Submitted</div>
              <div className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Waiting for other players...</div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}
