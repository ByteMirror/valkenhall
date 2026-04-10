import { Component } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import CardInspector, { RARITY_LABEL_COLOR } from './CardInspector';
import DeckCardTile from './DeckCardTile';
import PackOpeningFX from './PackOpeningFX';
import { getLocalApiOrigin } from '../utils/localApi';
import { isFoilFinish } from '../utils/sorcery/foil.js';
import { playUI, UI } from '../utils/arena/uiSounds';
import { sendDraftPick, skipDraft, subscribeToDraftEvents } from '../utils/arena/draftApi';
import { resolvePackContents } from '../utils/arena/packsApi';
import DeckEditorSidebar from './DeckEditorSidebar';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, PANEL_BG,
  BEVELED_BTN, GOLD_BTN,
  OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import RuneSpinner from './RuneSpinner';

const RARITY_GLOW = {
  Ordinary: '0 0 8px rgba(255,255,255,0.06)',
  Exceptional: '0 0 18px rgba(59,130,246,0.4), 0 0 36px rgba(59,130,246,0.12)',
  Elite: '0 0 22px rgba(168,85,247,0.5), 0 0 44px rgba(168,85,247,0.18)',
  Unique: '0 0 28px rgba(245,158,11,0.6), 0 0 56px rgba(245,158,11,0.22), 0 0 80px rgba(245,158,11,0.1)',
  Avatar: '0 0 30px rgba(220,40,40,0.5), 0 0 60px rgba(220,40,40,0.2), 0 0 90px rgba(245,158,11,0.1)',
};

const RARITY_GLOW_HOVER = {
  Ordinary: '0 0 18px rgba(255,255,255,0.12), 0 0 36px rgba(255,255,255,0.04)',
  Exceptional: '0 0 28px rgba(59,130,246,0.55), 0 0 56px rgba(59,130,246,0.2)',
  Elite: '0 0 32px rgba(168,85,247,0.65), 0 0 64px rgba(168,85,247,0.25)',
  Unique: '0 0 38px rgba(245,158,11,0.75), 0 0 76px rgba(245,158,11,0.3), 0 0 110px rgba(245,158,11,0.12)',
  Avatar: '0 0 40px rgba(220,40,40,0.7), 0 0 80px rgba(220,40,40,0.3), 0 0 120px rgba(245,158,11,0.15)',
};

const RARITY_COLORS = {
  Unique: '#e8c840', Elite: '#c860e0', Exceptional: '#4898e0', Ordinary: TEXT_BODY,
};

const BOOSTER_SCALE = { gothic: 1, arthurian: 1.4, beta: 1 };

function getBoosterImage(setKey) {
  const base = getLocalApiOrigin();
  return `${base}/game-assets/booster-${setKey}.webp`;
}

function playSound(src, volume = 0.5) {
  try {
    const base = getLocalApiOrigin();
    const a = new Audio(`${base}/game-assets/${src}`);
    a.volume = volume;
    a.play().catch(() => {});
  } catch {}
}

export default class DraftPicker extends Component {
  constructor(props) {
    super(props);
    this.state = {
      rawPack: [],
      picks: [],
      chosenCards: [],
      packNumber: 1,
      pickNumber: 1,
      direction: 'left',
      timeLeft: 90,
      // Pack opening states
      phase: 'waiting', // 'waiting' | 'sealed' | 'opening' | 'cards'
      entryDone: false,
      // Card interaction
      selectedIndex: null,
      hoveredIndex: -1,
      inspectedEntry: null,
      // Pick state
      confirming: false,
      waitingForOthers: false,
      viewScale: getViewportScale(),
    };
    this.timer = null;
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.unsubDraft = subscribeToDraftEvents({
      pack: (data) => {
        // Ignore pack events from a different draft (stale timers from old drafts)
        if (data.eventId && this.props.eventId && data.eventId !== this.props.eventId) return;

        const isNewPack = data.packNumber !== this.state.packNumber;
        const isFirstPack = this.state.phase === 'waiting';

        this.setState({
          rawPack: data.cards || [],
          packNumber: data.packNumber,
          pickNumber: data.pickNumber,
          direction: data.direction,
          timeLeft: 90,
          selectedIndex: null,
          confirming: false,
          waitingForOthers: false,
          entryDone: false,
          inspectedEntry: null,
          // Only show pack opening animation for genuinely new packs
          phase: (isNewPack || isFirstPack) ? 'sealed' : 'cards',
        });

        // If skipping straight to cards (rotation within same pack), trigger entry done quickly
        if (!isNewPack && !isFirstPack) {
          setTimeout(() => this.setState({ entryDone: true }), 100);
        }
      },
      pick_confirmed: (data) => {
        this.setState((s) => ({
          picks: [...s.picks, data.card],
          chosenCards: this.addPickToChosen(s.chosenCards, data.card),
          confirming: false,
          waitingForOthers: true,
        }));
        playUI(UI.CARD_PLACE);
      },
      auto_picked: (data) => {
        this.setState((s) => ({
          picks: [...s.picks, data.card],
          chosenCards: this.addPickToChosen(s.chosenCards, data.card),
          confirming: false,
          selectedIndex: null,
          waitingForOthers: true,
        }));
      },
      pack_complete: (data) => {
        if (data.eventId && this.props.eventId && data.eventId !== this.props.eventId) return;
        this.setState({
          packNumber: data.nextPackNumber,
          direction: data.nextDirection,
        });
      },
      building: (data) => {
        if (data.eventId && this.props.eventId && data.eventId !== this.props.eventId) return;
        this.props.onBuildingPhase?.(data);
      },
      timer: (data) => {
        if (data.eventId && this.props.eventId && data.eventId !== this.props.eventId) return;
        this.setState({ timeLeft: data.timeLeft });
      },
    });

    if (this.props.initialPack) {
      this.setState({
        rawPack: this.props.initialPack.cards || [],
        packNumber: this.props.initialPack.packNumber || 1,
        pickNumber: this.props.initialPack.pickNumber || 1,
        direction: this.props.initialPack.direction || 'left',
        phase: 'sealed',
      });
    }

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
      } else if (this.state.hoveredIndex >= 0 && this.state.phase === 'cards') {
        const resolved = this.resolvedPack();
        if (resolved[this.state.hoveredIndex]) {
          playUI(UI.INSPECTOR_OPEN);
          this.setState({ inspectedEntry: resolved[this.state.hoveredIndex] });
        }
      }
    }
    if (e.key === 'Escape' && this.state.inspectedEntry) {
      playUI(UI.INSPECTOR_CLOSE);
      this.setState({ inspectedEntry: null });
    }
  };

  resolvedPack() {
    return resolvePackContents(this.state.rawPack, this.props.sorceryCards || []);
  }

  addPickToChosen(chosenCards, rawCard) {
    const sorceryCards = this.props.sorceryCards || [];
    const card = sorceryCards.find((c) => c.unique_id === rawCard.cardId);
    if (!card) return chosenCards;
    const printing = card.printings?.find((p) => p.unique_id === rawCard.printingId) || card.printings?.[0] || {};
    const isSite = card.type === 'Site' || card._sorceryCategory === 'Site' || card.played_horizontally;
    const isAvatar = card.type === 'Avatar' || card._sorceryCategory === 'Avatar';
    const zone = isAvatar ? 'avatar' : isSite ? 'atlas' : 'spellbook';
    return [...chosenCards, { card, printing, zone, uniqueId: card.unique_id, foiling: printing.foiling || 'S' }];
  }

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
    const entry = this.state.chosenCards.find((c) =>
      c.card?.unique_id === cardUniqueId && (c.printing?.foiling || 'S') === targetFoiling
    ) || this.state.chosenCards.find((c) => c.card?.unique_id === cardUniqueId);
    if (!entry) return;
    const row = document.querySelector(`[data-sidebar-card-id="${cardUniqueId}"][data-sidebar-foiling="${targetFoiling}"]`)
      || document.querySelector(`[data-sidebar-card-id="${cardUniqueId}"]`);
    const rect = row?.getBoundingClientRect();
    if (!rect) return;

    const imgUrl = entry.printing?.image_url || entry.card?.printings?.[0]?.image_url || '';
    const isSite = entry.card?.played_horizontally;
    const foiling = entry.printing?.foiling || 'S';
    const isFoil = foiling === 'F' || foiling === 'R';
    const previewW = isSite ? 420 : 300;
    const previewH = isSite ? 300 : 420;
    const centerY = rect.top + rect.height / 2;
    let targetTop = centerY - previewH / 2;
    if (targetTop < 8) targetTop = 8;
    if (targetTop + previewH > window.innerHeight - 8) targetTop = window.innerHeight - 8 - previewH;

    const anim = this._previewAnim;
    const wasVisible = anim.visible;
    anim.visible = true; anim.imgUrl = imgUrl; anim.cardName = entry.card?.name || '';
    anim.isSite = isSite; anim.isFoil = isFoil; anim.foiling = foiling;
    anim.sidebarLeft = rect.left; anim.targetTop = targetTop; anim.previewW = previewW; anim.previewH = previewH;
    if (!wasVisible) { anim.top = targetTop; anim.opacity = 0; }
    this._startPreviewLoop();
  };

  _startPreviewLoop = () => { if (!this._previewRafId) this._previewRafId = requestAnimationFrame(this._tickPreview); };

  _tickPreview = () => {
    this._previewRafId = null;
    const anim = this._previewAnim;
    const speed = 0.18;
    if (anim.visible) { anim.opacity += (1 - anim.opacity) * speed; if (anim.opacity > 0.99) anim.opacity = 1; }
    else { anim.opacity += (0 - anim.opacity) * (speed * 1.5); if (anim.opacity < 0.01) anim.opacity = 0; }
    anim.top += (anim.targetTop - anim.top) * speed;

    const el = this._previewRef;
    if (el) {
      const { previewW = 300, previewH = 420 } = anim;
      const left = anim.sidebarLeft - previewW - 16;
      el.style.opacity = String(anim.opacity); el.style.top = `${anim.top}px`; el.style.left = `${left}px`;
      el.style.width = `${previewW}px`; el.style.height = `${previewH}px`;
      el.style.transform = `scale(${0.85 + anim.opacity * 0.15})`; el.style.display = anim.opacity > 0.01 ? 'block' : 'none';
      const inner = el.querySelector('[data-preview-inner]');
      if (inner) {
        if (anim.isFoil) { inner.className = 'w-full h-full rounded-[14px] card-mask foil-overlay foil-overlay--always'; inner.setAttribute('data-foil', anim.foiling); }
        else { inner.className = 'w-full h-full rounded-[14px] card-mask'; inner.removeAttribute('data-foil'); }
      }
      const img = el.querySelector('img');
      if (img && img.src !== anim.imgUrl && anim.imgUrl) img.src = anim.imgUrl;
      if (img) {
        img.alt = anim.cardName;
        if (anim.isSite) { img.style.transform = 'rotate(90deg)'; img.style.transformOrigin = 'center center'; img.style.width = `${previewH}px`; img.style.height = `${previewW}px`; img.style.position = 'absolute'; img.style.top = `${(previewH - previewW) / 2}px`; img.style.left = `${(previewW - previewH) / 2}px`; }
        else { img.style.transform = 'none'; img.style.width = '100%'; img.style.height = '100%'; img.style.position = 'static'; img.style.top = ''; img.style.left = ''; }
      }
    }
    const isSettled = anim.visible ? anim.opacity >= 1 && Math.abs(anim.top - anim.targetTop) < 0.5 : anim.opacity <= 0;
    if (!isSettled) this._previewRafId = requestAnimationFrame(this._tickPreview);
  };

  handlePackClick = () => {
    if (this.state.phase !== 'sealed') return;
    playSound('snd-pack-opening.mp3', 0.6);
    this.setState({ phase: 'opening' });
    setTimeout(() => {
      playSound('snd-card-slide-1.ogg', 0.4);
      this.setState({ phase: 'cards', entryDone: false });
      const cardCount = this.state.rawPack.length || 15;
      setTimeout(() => this.setState({ entryDone: true }), cardCount * 50 + 400);
    }, 900);
  };

  handleSelectCard = (index) => {
    if (this.state.confirming || this.state.waitingForOthers) return;
    this.setState({ selectedIndex: index });
    playUI(UI.HOVER, { volume: 0.5 });
  };

  handleConfirmPick = () => {
    const { selectedIndex, rawPack } = this.state;
    if (selectedIndex === null || this.state.confirming || this.state.waitingForOthers) return;
    const raw = rawPack[selectedIndex];
    if (!raw) return;
    this.setState({ confirming: true });
    sendDraftPick(raw.cardId, raw.printingId);
  };

  handleSkipDraft = async () => {
    try {
      await skipDraft(this.props.eventId);
    } catch (err) {
      console.error('[DraftPicker] skip failed:', err);
    }
  };

  isDevMode() {
    try { return typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'); } catch { return false; }
  }

  render() {
    const { sorceryCards } = this.props;
    const { packNumber, pickNumber, direction, timeLeft, phase, entryDone, selectedIndex, hoveredIndex, inspectedEntry, confirming, waitingForOthers, picks, viewScale, rawPack } = this.state;

    const resolved = this.resolvedPack();
    const selectedEntry = selectedIndex !== null ? resolved[selectedIndex] : null;
    const timerUrgent = timeLeft <= 15;
    const dirArrow = direction === 'left' ? '←' : '→';
    const setKey = rawPack[0]?.setKey || this.props.setKey || 'beta';

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden select-none" style={{ zoom: viewScale }}>
        <PackOpeningFX active={phase === 'opening' || phase === 'cards'} />

        {/* Header bar */}
        <div className="flex items-center gap-4 px-6 py-3 relative z-10" style={{ background: PANEL_BG, borderBottom: `1px solid ${GOLD} 0.15)`, backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center gap-4 flex-1">
            <div className="text-sm font-semibold arena-heading" style={{ color: ACCENT_GOLD }}>Pack {packNumber}/3</div>
            <div className="text-sm" style={{ color: TEXT_BODY }}>Pick {pickNumber}/15</div>
            <div className="text-xs px-2 py-0.5 rounded" style={{ color: TEXT_MUTED, background: 'rgba(255,255,255,0.05)' }}>
              Pass {dirArrow} {direction}
            </div>
          </div>
          {phase === 'cards' ? <div className="text-xs mr-3" style={{ color: TEXT_MUTED }}>Space to inspect</div> : null}
          {this.isDevMode() ? (
            <button
              type="button"
              className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-[1.05] active:scale-[0.97] mr-2"
              style={{
                background: 'linear-gradient(180deg, rgba(180,60,60,0.15) 0%, rgba(120,30,30,0.1) 100%)',
                border: '1px solid rgba(180,60,60,0.35)',
                borderRadius: '4px',
                color: '#c45050',
              }}
              onClick={this.handleSkipDraft}
            >
              DEV: Skip Draft
            </button>
          ) : null}
          <div
            className="text-xl font-bold tabular-nums px-4 py-1 rounded"
            style={{
              color: timerUrgent ? '#e06060' : TEXT_PRIMARY,
              background: timerUrgent ? 'rgba(224,96,96,0.1)' : 'rgba(0,0,0,0.3)',
              animation: timerUrgent ? 'pulse 1s infinite' : 'none',
            }}
          >
            {timeLeft}s
          </div>
        </div>

        <div className="flex-1 flex relative z-10 overflow-hidden">
          {/* Main content area */}
          <div className="flex-1 flex flex-col items-center justify-center">

            {/* Waiting for pack */}
            {phase === 'waiting' ? (
              <div className="flex flex-col items-center gap-4">
                <RuneSpinner size={64} />
                <div className="text-sm" style={{ color: TEXT_MUTED }}>Waiting for packs...</div>
              </div>
            ) : null}

            {/* Sealed pack — click to open */}
            {(phase === 'sealed' || phase === 'opening') ? (
              <div className="flex flex-col items-center gap-6">
                {phase === 'sealed' ? (
                  <>
                    <h2 className="text-lg font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                      Pack {packNumber} — Pick {pickNumber}/15
                    </h2>
                    <motion.button
                      type="button"
                      className="cursor-pointer"
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={this.handlePackClick}
                    >
                      <div style={{ transform: `scale(${BOOSTER_SCALE[setKey] || 1})` }}>
                        <img
                          src={getBoosterImage(setKey)}
                          alt=""
                          className="max-w-[180px] max-h-[280px] object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.7)]"
                          draggable={false}
                        />
                      </div>
                    </motion.button>
                    <motion.p
                      className="text-sm"
                      style={{ color: TEXT_MUTED }}
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      Click pack to reveal cards
                    </motion.p>
                  </>
                ) : (
                  <motion.div className="flex flex-col items-center gap-6" initial={{ scale: 1 }} animate={{ scale: 1.1, opacity: 0.9 }} transition={{ duration: 0.3 }}>
                    <motion.div
                      animate={{ x: [0, -8, 8, -6, 6, -4, 4, -2, 2, 0], rotate: [0, -3, 3, -2.5, 2.5, -1.5, 1.5, -0.5, 0.5, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <div style={{ transform: `scale(${BOOSTER_SCALE[setKey] || 1})` }}>
                        <img src={getBoosterImage(setKey)} alt="" className="max-w-[240px] max-h-[360px] object-contain drop-shadow-[0_25px_70px_rgba(0,0,0,0.8)]" draggable={false} />
                      </div>
                    </motion.div>
                    <motion.p className="text-sm" style={{ color: ACCENT_GOLD }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                      Opening...
                    </motion.p>
                  </motion.div>
                )}
              </div>
            ) : null}

            {/* Cards revealed — pick one */}
            {phase === 'cards' ? (
              <div className="flex flex-col items-center w-full h-full">
                <div
                  className="flex-1 flex flex-col items-center justify-center gap-4 w-full px-8"
                  onMouseLeave={() => this.setState({ hoveredIndex: -1 })}
                >
                  {[resolved.slice(0, 8), resolved.slice(8)].map((row, rowIdx) => {
                    const rowStart = rowIdx === 0 ? 0 : 8;
                    return (
                      <div key={rowIdx} className="relative flex items-end justify-center gap-2" style={{ perspective: '1200px' }}>
                        {row.map((entry, ri) => {
                          const i = rowStart + ri;
                          const rowN = row.length;
                          const rarity = entry.rarity || entry.card?.rarity || 'Ordinary';
                          const entryFoil = isFoilFinish(entry.printing?.foiling);
                          const isHovered = hoveredIndex === i;
                          const isSelected = selectedIndex === i;
                          const cardWidth = 150;
                          const cardHeight = Math.round(cardWidth * 88 / 63);

                          const t = rowN === 1 ? 0 : (ri / (rowN - 1)) - 0.5;
                          const fanRotate = t * 6;
                          const fanY = Math.abs(t) * 12;

                          const foilPivotAnimate = entryFoil && entryDone ? {
                            rotateX: [0, -10, -14, -10, 0, 10, 14, 10, 0],
                            rotateY: [0, 10, 0, -10, -14, -10, 0, 10, 0],
                          } : { rotateX: 0, rotateY: 0 };

                          return (
                            <motion.div
                              key={i}
                              className="relative"
                              initial={{ opacity: 0, y: 120, scale: 0.3, rotate: (Math.random() - 0.5) * 30 }}
                              animate={{
                                opacity: waitingForOthers ? 0.35 : 1,
                                y: isSelected ? fanY - 12 : fanY,
                                scale: isSelected ? 1.06 : 1,
                                rotate: fanRotate,
                                zIndex: isHovered ? 100 : i + 1,
                              }}
                              transition={entryDone ? {
                                type: 'spring', stiffness: 800, damping: 35, mass: 0.4, restDelta: 0.5,
                                zIndex: { duration: 0 },
                              } : {
                                type: 'spring', stiffness: 250, damping: 20, delay: i * 0.06,
                                zIndex: { duration: 0 },
                              }}
                            >
                              <div
                                className={entryFoil ? 'foil-card-aura' : undefined}
                                style={{
                                  position: 'absolute', inset: 0, borderRadius: 14,
                                  boxShadow: isSelected
                                    ? `0 0 20px rgba(212,168,67,0.5), 0 0 40px rgba(212,168,67,0.2)`
                                    : (entryFoil ? undefined : (isHovered ? RARITY_GLOW_HOVER[rarity] : RARITY_GLOW[rarity])),
                                  transition: 'box-shadow 0.2s ease',
                                  pointerEvents: 'none',
                                }}
                              />
                              <motion.div
                                style={{ transformStyle: 'preserve-3d' }}
                                animate={foilPivotAnimate}
                                transition={entryFoil && entryDone ? { duration: 1.7, ease: 'easeInOut', delay: 0.25 + i * 0.04 } : { duration: 0 }}
                              >
                                <div
                                  style={{
                                    width: cardWidth, height: cardHeight, borderRadius: 14,
                                    border: isSelected ? `2px solid ${ACCENT_GOLD}` : '2px solid transparent',
                                    filter: isHovered && !isSelected ? 'brightness(1.15)' : 'none',
                                    transition: 'filter 0.2s ease, border-color 0.15s ease',
                                    cursor: waitingForOthers ? 'default' : 'pointer',
                                  }}
                                >
                                  <DeckCardTile
                                    entry={{ card: entry.card, printing: entry.printing || {}, zone: 'spellbook', entryIndex: i }}
                                    isSelected={false}
                                    onClick={() => this.handleSelectCard(i)}
                                    onHoverChange={(hovered) => {
                                      this.setState({ hoveredIndex: hovered ? i : -1 });
                                      if (hovered) playUI(UI.HOVER, { volume: 0.4 });
                                    }}
                                  />
                                </div>
                              </motion.div>
                              <AnimatePresence>
                                {isHovered ? (
                                  <motion.div
                                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap z-50 pointer-events-none"
                                    style={{ top: -36 }}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 5 }}
                                    transition={{ duration: 0.12 }}
                                  >
                                    <div className="rounded-lg px-3 py-1.5 text-center" style={{ background: 'rgba(12,10,8,0.95)', border: '1px solid rgba(180,140,60,0.25)', backdropFilter: 'blur(12px)', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
                                      <div className="text-xs font-semibold" style={{ color: '#e8d5a0' }}>{entry.card?.name}</div>
                                      <div className={cn('text-[10px]', RARITY_LABEL_COLOR[rarity])}>{rarity}</div>
                                    </div>
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Bottom action bar */}
                <motion.div
                  className="flex items-center gap-4 pb-6 relative z-10"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  {waitingForOthers ? (
                    <div className="flex items-center gap-3 px-6 py-2.5">
                      <RuneSpinner size={20} />
                      <span className="text-sm" style={{ color: TEXT_MUTED }}>Waiting for other players...</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="px-8 py-2.5 text-sm font-bold transition-all cursor-pointer"
                      style={{
                        ...(selectedEntry ? GOLD_BTN : BEVELED_BTN),
                        borderRadius: '8px',
                        opacity: selectedEntry ? 1 : 0.5,
                        color: selectedEntry ? undefined : TEXT_MUTED,
                      }}
                      data-sound={UI.CONFIRM}
                      disabled={!selectedEntry || confirming}
                      onClick={this.handleConfirmPick}
                    >
                      {confirming ? 'Picking...' : selectedEntry ? `Pick ${selectedEntry.card?.name}` : 'Select a card'}
                    </button>
                  )}
                </motion.div>
              </div>
            ) : null}
          </div>

          {/* Right sidebar: DeckEditorSidebar with picks */}
          <div className="w-[300px] shrink-0 overflow-hidden h-full">
            <DeckEditorSidebar
              chosenCards={this.state.chosenCards}
              onIncrement={() => {}}
              onDecrement={() => {}}
              onChangeZone={() => {}}
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
            rarity={inspectedEntry.rarity}
            foiling={inspectedEntry.printing?.foiling}
            onClose={() => { playUI(UI.INSPECTOR_CLOSE); this.setState({ inspectedEntry: null }); }}
          />
        ) : null}
      </div>
    );
  }
}
