import { Component } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import { UI, playUI } from '../utils/arena/uiSounds';
import { getDraftStandings, getDraftPickHistory } from '../utils/arena/draftApi';
import { getLocalApiOrigin } from '../utils/localApi';
import DeckCardTile from './DeckCardTile';
import PackOpeningFX from './PackOpeningFX';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  PANEL_STYLE, BEVELED_BTN, GOLD_BTN, TAB_ACTIVE, TAB_INACTIVE, TAB_BAR_STYLE,
  FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import AmbientParticles from './AmbientParticles';

const CARD_CDN = 'https://d27a44hjr9gen3.cloudfront.net/cards';

const RARITY_COLORS = {
  Unique: '#e8c840',
  Elite: '#c860e0',
  Exceptional: '#4898e0',
  Ordinary: TEXT_BODY,
};

function resolveCardImage(card) {
  const printing = card?.printings?.[0];
  if (printing?.image_url) return printing.image_url;
  if (printing?.unique_id) return `${CARD_CDN}/${printing.unique_id}.jpg`;
  return null;
}

function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

export default class DraftResults extends Component {
  constructor(props) {
    super(props);
    const hasPrize = !!props.prizes?.prizeCard;
    this.state = {
      tab: 'standings',
      standings: props.finalStandings || [],
      picks: [],
      picksLoading: false,
      showPrizeReveal: hasPrize,
      prizeRevealed: false,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    if (!this.state.standings.length) this.loadStandings();
    // Auto-trigger prize reveal animation after a short delay
    if (this.state.showPrizeReveal) {
      setTimeout(() => {
        this.setState({ prizeRevealed: true });
        try {
          const base = getLocalApiOrigin();
          const a = new Audio(`${base}/game-assets/snd-pack-opening.mp3`);
          a.volume = 0.6;
          a.play().catch(() => {});
        } catch {}
        playUI(UI.ACHIEVEMENT);
      }, 800);
    }
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  loadStandings = async () => {
    try {
      const data = await getDraftStandings(this.props.eventId);
      this.setState({ standings: data.standings || [] });
    } catch (err) {
      console.error('[DraftResults] loadStandings failed:', err);
    }
  };

  loadPickHistory = async () => {
    if (this.state.picks.length) return;
    this.setState({ picksLoading: true });
    try {
      const data = await getDraftPickHistory(this.props.eventId);
      this.setState({ picks: data.picks || [], picksLoading: false });
    } catch (err) {
      console.error('[DraftResults] loadPickHistory failed:', err);
      this.setState({ picksLoading: false });
    }
  };

  handleTabChange = (tab) => {
    this.setState({ tab });
    if (tab === 'picks') this.loadPickHistory();
  };

  render() {
    const { profile, onBack, draftedCards, prizes } = this.props;
    const { tab, standings, picks, picksLoading, viewScale } = this.state;

    const myRank = standings.findIndex((s) => s.playerId === profile?.id) + 1;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: '#08080a' }}>
        <div className="absolute inset-0" style={{ background: `url('/hub-bg.png') center/cover no-repeat`, filter: 'blur(6px)', transform: 'scale(1.02)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 100%)' }} />
        <AmbientParticles />

        <div className="relative z-10 flex-1 flex flex-col items-center overflow-hidden p-6" style={{ zoom: viewScale }}>
          <div className="w-full max-w-3xl">
            {/* Header */}
            <div className="text-center mb-2">
              <h2 className="text-2xl font-bold arena-heading" style={{ color: ACCENT_GOLD, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.15)' }}>
                Draft Complete
              </h2>
              {myRank > 0 ? (
                <div className="text-sm mt-1" style={{ color: myRank === 1 ? ACCENT_GOLD : TEXT_BODY }}>
                  You finished {ordinal(myRank)}
                  {prizes?.coinsEarned ? ` — earned ${prizes.coinsEarned} coins` : ''}
                </div>
              ) : null}
            </div>
            <OrnamentalDivider className="mb-4" />

            {/* Tabs */}
            <div className="flex mb-4" style={TAB_BAR_STYLE}>
              {[
                { key: 'standings', label: 'Standings' },
                { key: 'cards', label: 'Drafted Cards' },
                { key: 'picks', label: 'Pick History' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
                  style={tab === t.key ? TAB_ACTIVE : TAB_INACTIVE}
                  data-sound={UI.TAB}
                  onClick={() => this.handleTabChange(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {/* Standings */}
              {tab === 'standings' ? (
                <div className="rounded overflow-hidden" style={PANEL_STYLE}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${GOLD} 0.15)` }}>
                        <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>#</th>
                        <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>Player</th>
                        <th className="text-center px-4 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>W</th>
                        <th className="text-center px-4 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>L</th>
                        <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>Prize</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((entry, i) => {
                        const isMe = entry.playerId === profile?.id;
                        const place = i + 1;
                        return (
                          <tr
                            key={entry.playerId}
                            style={{
                              background: isMe ? 'rgba(212,168,67,0.06)' : 'transparent',
                              borderBottom: `1px solid ${GOLD} 0.06)`,
                            }}
                          >
                            <td className="px-4 py-2.5 tabular-nums font-bold" style={{ color: place <= 3 ? ACCENT_GOLD : TEXT_MUTED }}>
                              {place === 1 ? '🏆' : place}
                            </td>
                            <td className="px-4 py-2.5 font-semibold" style={{ color: isMe ? ACCENT_GOLD : TEXT_PRIMARY }}>{entry.playerName}</td>
                            <td className="px-4 py-2.5 text-center tabular-nums" style={{ color: '#6dba6d' }}>{entry.wins}</td>
                            <td className="px-4 py-2.5 text-center tabular-nums" style={{ color: '#c45050' }}>{entry.losses}</td>
                            <td className="px-4 py-2.5 text-right text-xs" style={{ color: entry.prizeCoins ? ACCENT_GOLD : TEXT_MUTED }}>
                              {entry.prizeCoins ? `+${entry.prizeCoins} coins` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {/* Drafted cards */}
              {tab === 'cards' ? (
                <div>
                  <div className="text-xs mb-2" style={{ color: '#6dba6d' }}>
                    {draftedCards?.length || 0} cards added to your collection
                  </div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                    {(draftedCards || []).map((card, i) => {
                      const imageUrl = resolveCardImage(card);
                      return (
                        <div key={`card-${i}`} className="relative rounded overflow-hidden" style={{ border: `1px solid ${GOLD} 0.1)` }}>
                          {imageUrl ? (
                            <img src={imageUrl} alt={card.name} className="w-full aspect-[5/7] object-cover" draggable={false} />
                          ) : (
                            <div className="w-full aspect-[5/7] flex items-center justify-center text-[10px]" style={{ background: 'rgba(0,0,0,0.5)', color: TEXT_MUTED }}>{card.name}</div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] truncate" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', color: RARITY_COLORS[card.rarity] || TEXT_BODY }}>
                            {card.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Pick history */}
              {tab === 'picks' ? (
                picksLoading ? (
                  <div className="text-center py-8 text-sm" style={{ color: TEXT_MUTED }}>Loading pick history...</div>
                ) : (
                  <div className="space-y-3">
                    {[1, 2, 3].map((packNum) => {
                      const packPicks = picks.filter((p) => p.packNumber === packNum);
                      if (!packPicks.length) return null;
                      return (
                        <div key={packNum}>
                          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: TEXT_MUTED }}>Pack {packNum}</div>
                          <div className="space-y-0.5">
                            {packPicks.map((pick, i) => (
                              <div key={i} className="flex items-center gap-3 px-3 py-1 rounded text-xs" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <span className="w-5 tabular-nums text-right" style={{ color: TEXT_MUTED }}>{pick.pickNumber}</span>
                                <span style={{ color: RARITY_COLORS[pick.rarity] || TEXT_BODY }}>{pick.cardName}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : null}
            </div>

            {/* Back button */}
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                className="px-6 py-2 text-sm transition-all cursor-pointer"
                style={{ ...BEVELED_BTN, color: TEXT_BODY }}
                data-sound={UI.CLOSE}
                onClick={onBack}
              >
                Return to Hub
              </button>
            </div>
          </div>
        </div>

        {/* Prize card reveal overlay */}
        <AnimatePresence>
          {this.state.showPrizeReveal ? this.renderPrizeReveal() : null}
        </AnimatePresence>
      </div>
    );
  }

  renderPrizeReveal() {
    const { prizes, sorceryCards } = this.props;
    const prizeCard = prizes?.prizeCard;
    if (!prizeCard) return null;

    const card = (sorceryCards || []).find((c) => c.unique_id === prizeCard.cardId);
    if (!card) return null;
    const printing = card.printings?.find((p) => p.unique_id === prizeCard.printingId) || card.printings?.find((p) => p.foiling === 'F') || card.printings?.[0];
    const rarity = prizeCard.rarity || card.rarity || 'Ordinary';

    const RARITY_GLOW = {
      Ordinary: 'rgba(255,255,255,0.15)',
      Exceptional: 'rgba(59,130,246,0.5)',
      Elite: 'rgba(168,85,247,0.6)',
      Unique: 'rgba(245,158,11,0.7)',
      Avatar: 'rgba(220,40,40,0.6)',
    };

    return (
      <motion.div
        key="prize-reveal"
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.85)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <PackOpeningFX active={this.state.prizeRevealed} />

        <div className="relative flex flex-col items-center z-10">
          {/* Radial glow behind the card */}
          <motion.div
            className="absolute"
            style={{
              width: 400, height: 400, borderRadius: '50%',
              background: `radial-gradient(circle, ${RARITY_GLOW[rarity]} 0%, transparent 70%)`,
              filter: 'blur(40px)',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={this.state.prizeRevealed ? { scale: 1.5, opacity: 1 } : {}}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />

          {/* Title */}
          <motion.div
            className="text-center mb-6 relative z-10"
            initial={{ opacity: 0, y: -20 }}
            animate={this.state.prizeRevealed ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: ACCENT_GOLD }}>1st Place</div>
            <div className="text-2xl font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 8px rgba(0,0,0,0.5), 0 0 30px rgba(212,168,67,0.3)' }}>
              Draft Champion
            </div>
          </motion.div>

          {/* Card */}
          <motion.div
            className="relative z-10"
            style={{ width: 220, height: Math.round(220 * 88 / 63), borderRadius: 14, perspective: 1200 }}
            initial={{ opacity: 0, scale: 0.3, rotateY: 180 }}
            animate={this.state.prizeRevealed ? { opacity: 1, scale: 1, rotateY: 0 } : {}}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200, damping: 20 }}
          >
            <div style={{
              boxShadow: `0 0 40px ${RARITY_GLOW[rarity]}, 0 20px 60px rgba(0,0,0,0.6)`,
              borderRadius: 14,
              border: `2px solid ${RARITY_GLOW[rarity]}`,
              overflow: 'hidden',
              width: '100%', height: '100%',
            }}>
              <DeckCardTile
                entry={{ card, printing: printing || {}, zone: 'spellbook', entryIndex: 0 }}
                isSelected={false}
                onClick={() => {}}
                onHoverChange={() => {}}
              />
            </div>
          </motion.div>

          {/* Card name + rarity */}
          <motion.div
            className="text-center mt-4 relative z-10"
            initial={{ opacity: 0, y: 10 }}
            animate={this.state.prizeRevealed ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            <div className="text-lg font-bold" style={{ color: RARITY_COLORS[rarity] || TEXT_PRIMARY }}>{card.name}</div>
            <div className="text-xs" style={{ color: TEXT_MUTED }}>{rarity} Foil — Added to your collection</div>
          </motion.div>

          {/* Continue button */}
          <motion.div
            className="mt-6 relative z-10"
            initial={{ opacity: 0 }}
            animate={this.state.prizeRevealed ? { opacity: 1 } : {}}
            transition={{ delay: 1.5 }}
          >
            <button
              type="button"
              className="px-8 py-2.5 text-sm font-semibold cursor-pointer transition-all"
              style={{ ...GOLD_BTN, borderRadius: '8px' }}
              data-sound={UI.CONFIRM}
              onClick={() => this.setState({ showPrizeReveal: false })}
            >
              Continue
            </button>
          </motion.div>
        </div>
      </motion.div>
    );
  }
}
