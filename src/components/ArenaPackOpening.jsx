import { Component } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import CardInspector, { RARITY_LABEL_COLOR } from './CardInspector';
import PackOpeningFX from './PackOpeningFX';
import { getLocalApiOrigin } from '../utils/localApi';
import { isFoilFinish, FOIL_OVERLAY_CLASSES } from '../utils/sorcery/foil.js';
import { getViewportScale, onViewportScaleChange } from '../lib/medievalTheme';

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

const RARITY_BORDER_COLOR = {
  Ordinary: 'rgba(255,255,255,0.1)',
  Exceptional: 'rgba(59,130,246,0.5)',
  Elite: 'rgba(168,85,247,0.5)',
  Unique: 'rgba(245,158,11,0.6)',
  Avatar: 'rgba(220,40,40,0.6)',
};

export default class ArenaPackOpening extends Component {
  constructor(props) {
    super(props);
    this.state = {
      phase: 'sealed',
      shaking: false,
      hoveredIndex: -1,
      inspectedEntry: null,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    if (this.props.autoOpen) {
      // Skip the sealed chooser — go straight to opening animation
      this.handlePackClick();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.unsubScale?.();
  }

  handleKeyDown = (e) => {
    if (e.repeat) return; // prevent key repeat flicker
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (this.state.inspectedEntry) {
        this.setState({ inspectedEntry: null });
      } else if (this.state.hoveredIndex >= 0 && this.state.phase === 'summary') {
        this.setState({ inspectedEntry: this.props.pack.cards[this.state.hoveredIndex] });
      }
    }
    if (e.key === 'Escape' && this.state.inspectedEntry) {
      this.setState({ inspectedEntry: null });
    }
  };

  handlePackClick = () => {
    if (this.state.phase !== 'sealed') return;
    playSound('snd-pack-opening.mp3', 0.6);
    // Tell parent to add this pack's cards to collection
    if (this.props.onPackOpened) this.props.onPackOpened();
    this.setState({ shaking: true, phase: 'opening' });
    setTimeout(() => {
      playSound('snd-card-slide-1.ogg', 0.4);
      this.setState({ phase: 'summary', shaking: false, entryDone: false });
      const cardCount = this.props.pack?.cards?.length || 15;
      setTimeout(() => this.setState({ entryDone: true }), cardCount * 50 + 400);
    }, 900);
  };

  render() {
    const { pack, onDone, onOpenAnother, canAffordAnother, remainingPacks } = this.props;
    const { phase, shaking, hoveredIndex, inspectedEntry } = this.state;
    const boosterImg = getBoosterImage(pack.setKey);
    const N = pack.cards.length;

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden" style={{ zoom: this.state.viewScale }}>
        {/* Particle FX overlay */}
        <PackOpeningFX active={phase === 'opening' || phase === 'summary'} />

        {/* Light rays and ambient glow are now rendered by PackOpeningFX canvas */}

        <div className="flex items-center gap-4 px-6 py-3 border-b border-white/10 bg-black/80 backdrop-blur-sm relative z-10">
          <button
            type="button"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
            onClick={onDone}
          >
            Back to Store
          </button>
          <div className="text-sm font-semibold text-white">{pack.setLabel} Pack</div>
          {remainingPacks > 0 ? <div className="text-xs text-muted-foreground">{remainingPacks} more to open</div> : null}
          {phase === 'summary' ? <div className="ml-auto text-xs text-muted-foreground">Space to inspect</div> : null}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center relative z-10">

          {/* Sealed — show all pending packs grouped by set */}
          {(phase === 'sealed' || phase === 'opening') ? (
            <div className="flex flex-col items-center gap-8">
              {phase === 'sealed' ? (
                <>
                  <h2 className="text-xl font-bold text-white">Choose a Pack to Open</h2>
                  <div className="flex items-end justify-center gap-10">
                    {(() => {
                      const allPending = [pack, ...(this.props.allPendingPacks || [])];
                      const bySet = {};
                      for (const p of allPending) {
                        bySet[p.setKey] = (bySet[p.setKey] || 0) + 1;
                      }
                      return Object.entries(bySet).map(([setKey, count]) => (
                        <motion.button
                          key={setKey}
                          type="button"
                          className="flex flex-col items-center gap-3 cursor-pointer"
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => {
                            if (this.props.onOpenFromSet) this.props.onOpenFromSet(setKey);
                          }}
                          initial={{ opacity: 0, y: 30 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                        >
                          <div style={{ transform: `scale(${BOOSTER_SCALE[setKey] || 1})` }}>
                            <img
                              src={getBoosterImage(setKey)}
                              alt=""
                              className="max-w-[180px] max-h-[280px] object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.7)]"
                              draggable={false}
                            />
                          </div>
                          <div className="text-sm font-semibold text-white">{count}x</div>
                        </motion.button>
                      ));
                    })()}
                  </div>
                  <motion.p
                    className="text-sm text-muted-foreground"
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    Click a pack to open it
                  </motion.p>
                </>
              ) : (
                <motion.div className="flex flex-col items-center gap-6" initial={{ scale: 1 }} animate={{ scale: 1.1, opacity: 0.9 }} transition={{ duration: 0.3 }}>
                  <motion.div
                    animate={{ x: [0, -8, 8, -6, 6, -4, 4, -2, 2, 0], rotate: [0, -3, 3, -2.5, 2.5, -1.5, 1.5, -0.5, 0.5, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <div style={{ transform: `scale(${BOOSTER_SCALE[pack.setKey] || 1})` }}>
                      <img src={boosterImg} alt="" className="max-w-[240px] max-h-[360px] object-contain drop-shadow-[0_25px_70px_rgba(0,0,0,0.8)]" draggable={false} />
                    </div>
                  </motion.div>
                  <motion.p className="text-sm text-amber-400" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8 }}>Opening...</motion.p>
                </motion.div>
              )}
            </div>
          ) : null}

          {/* Summary — two rows of cards */}
          {phase === 'summary' ? (
            <div className="flex flex-col items-center w-full h-full">
              <div
                className="flex-1 flex flex-col items-center justify-center gap-4 w-full px-8"
                onMouseLeave={() => this.setState({ hoveredIndex: -1 })}
              >
                {[pack.cards.slice(0, 8), pack.cards.slice(8)].map((row, rowIdx) => {
                  const rowStart = rowIdx === 0 ? 0 : 8;
                  return (
                    <div key={rowIdx} className="relative flex items-end justify-center gap-2">
                      {row.map((entry, ri) => {
                        const i = rowStart + ri;
                        const rowN = row.length;
                        const rarity = entry.rarity || 'Ordinary';
                        const isSite = entry.card?.type === 'Site' || entry.card?.played_horizontally;
                        const entryFoil = isFoilFinish(entry.printing?.foiling);
                        const isHovered = hoveredIndex === i;
                        const isEntryDone = this.state.entryDone;
                        const cardWidth = 170;
                        const cardHeight = Math.round(cardWidth * 88 / 63);

                        // Fan: slight rotation and vertical offset based on position in row
                        const t = rowN === 1 ? 0 : (ri / (rowN - 1)) - 0.5; // -0.5 to 0.5
                        const fanRotate = t * 6; // -3° to 3°
                        const fanY = Math.abs(t) * 12; // edges dip slightly

                        return (
                          <motion.div
                            key={i}
                            className="cursor-pointer relative"
                            initial={{ opacity: 0, y: 120, scale: 0.3, rotate: (Math.random() - 0.5) * 30 }}
                            animate={{
                              opacity: 1,
                              y: isHovered ? -40 + fanY : fanY,
                              scale: isHovered ? (isSite ? 1.5 : 1.3) : 1,
                              rotate: isHovered ? (isSite ? 90 : 0) : fanRotate,
                              zIndex: isHovered ? 100 : i + 1,
                            }}
                            transition={isEntryDone ? {
                              type: 'spring',
                              stiffness: 800,
                              damping: 35,
                              mass: 0.4,
                              restDelta: 0.5,
                              zIndex: { duration: 0 },
                            } : {
                              type: 'spring',
                              stiffness: 250,
                              damping: 20,
                              delay: i * 0.06,
                              zIndex: { duration: 0 },
                            }}
                            onMouseEnter={() => {
                              this.setState({ hoveredIndex: i });
                              if (rarity === 'Unique') playSound('snd-card-place-1.ogg', 0.3);
                            }}
                            onMouseLeave={() => this.setState({ hoveredIndex: -1 })}
                            onClick={() => this.setState({ inspectedEntry: inspectedEntry === entry ? null : entry })}
                          >
                            <motion.div
                              className={cn(entryFoil && FOIL_OVERLAY_CLASSES)}
                              data-foil={entryFoil ? entry.printing?.foiling : undefined}
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                borderRadius: 10,
                                overflow: 'hidden',
                                background: '#000',
                                border: `2px solid ${RARITY_BORDER_COLOR[rarity]}`,
                              }}
                              animate={rarity !== 'Ordinary' && !isHovered ? {
                                boxShadow: [RARITY_GLOW[rarity], RARITY_GLOW_HOVER[rarity], RARITY_GLOW[rarity]],
                              } : {
                                boxShadow: isHovered ? RARITY_GLOW_HOVER[rarity] : RARITY_GLOW[rarity],
                              }}
                              transition={rarity !== 'Ordinary' && !isHovered ? {
                                duration: rarity === 'Unique' ? 2 : 3,
                                repeat: Infinity,
                                ease: 'easeInOut',
                              } : { duration: 0.15 }}
                            >
                              <img
                                src={entry.printing?.image_url || entry.card?.printings?.[0]?.image_url || ''}
                                alt={entry.card?.name || ''}
                                className="w-full h-full object-cover"
                                draggable={false}
                              />
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
                                  <div className="bg-black/95 border border-white/15 rounded-lg px-3 py-1.5 backdrop-blur-xl text-center">
                                    <div className="text-xs font-semibold text-white">{entry.card?.name}</div>
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

              {/* Buttons */}
              <motion.div
                className="flex gap-3 pb-8 relative z-10"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                {remainingPacks > 0 ? (
                  <button type="button" className="rounded-xl px-6 py-2.5 text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 shadow-lg" onClick={onOpenAnother}>
                    Open Next Pack ({remainingPacks} remaining)
                  </button>
                ) : canAffordAnother ? (
                  <button type="button" className="rounded-xl px-6 py-2.5 text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 shadow-lg" onClick={onOpenAnother}>
                    Buy &amp; Open Another
                  </button>
                ) : null}
                <button type="button" className="rounded-xl px-6 py-2.5 text-sm font-semibold border border-white/30 text-white hover:bg-white/10" onClick={onDone}>
                  Back to Store
                </button>
              </motion.div>
            </div>
          ) : null}
        </div>

        {/* Card inspector */}
        {inspectedEntry ? (
          <CardInspector
            card={inspectedEntry.card}
            imageUrl={inspectedEntry.printing?.image_url}
            rarity={inspectedEntry.rarity}
            foiling={inspectedEntry.printing?.foiling}
            onClose={() => this.setState({ inspectedEntry: null })}
          />
        ) : null}
      </div>
    );
  }
}
