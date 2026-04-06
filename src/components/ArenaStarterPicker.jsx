import { Component } from 'preact';
import { motion } from 'framer-motion';
import { STARTER_DECKS } from '../utils/arena/starterDecks';
import { cn } from '../lib/utils';
import { UI } from '../utils/arena/uiSounds';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, PANEL_BG,
  BG_ATMOSPHERE, VIGNETTE, GOLD_BTN, BEVELED_BTN,
  FourCorners, OrnamentalDivider, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

const ELEMENT_COLORS = {
  Earth: { color: '#6ab04c', bg: `rgba(106,176,76,0.12)`, border: `rgba(106,176,76,0.3)` },
  Water: { color: '#4a9bd9', bg: `rgba(74,155,217,0.12)`, border: `rgba(74,155,217,0.3)` },
  Fire: { color: '#e05040', bg: `rgba(224,80,64,0.12)`, border: `rgba(224,80,64,0.3)` },
  Air: { color: '#7cb8d4', bg: `rgba(124,184,212,0.12)`, border: `rgba(124,184,212,0.3)` },
};

export default class ArenaStarterPicker extends Component {
  constructor(props) {
    super(props);
    this.state = { selected: null, entryDone: false, viewScale: getViewportScale() };
    setTimeout(() => this.setState({ entryDone: true }), 600);
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  getAvatarImageUrl(name) {
    const { sorceryCards } = this.props;
    if (!sorceryCards) return null;
    const card = sorceryCards.find((c) => c.name === name && c.type === 'Avatar');
    return card?.printings?.[0]?.image_url || null;
  }

  handleConfirm = () => {
    const deck = STARTER_DECKS.find((d) => d.id === this.state.selected);
    if (!deck) return;
    this.props.onStarterChosen(deck);
  };

  render() {
    const { selected, viewScale } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: BG_ATMOSPHERE }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-6" style={{ zoom: viewScale }}>
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl font-bold arena-heading mb-3" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.1)' }}>Choose Your Path</h1>
            <p className="text-sm max-w-lg mx-auto" style={{ color: TEXT_MUTED }}>Select a starter deck to begin your arena journey. All cards will be added to your collection.</p>
          </motion.div>

          <OrnamentalDivider className="mb-8 w-80" />

          <div className="flex items-stretch justify-center gap-5 mb-8">
            {STARTER_DECKS.map((deck, i) => {
              const isSelected = selected === deck.id;
              const avatarUrl = this.getAvatarImageUrl(deck.name);

              return (
                <motion.button
                  key={deck.id}
                  type="button"
                  className="relative overflow-hidden flex flex-col w-[210px] cursor-pointer"
                  style={{
                    background: PANEL_BG,
                    border: isSelected ? `2px solid ${ACCENT_GOLD}` : `1px solid ${GOLD} 0.2)`,
                    borderRadius: '10px',
                    boxShadow: isSelected
                      ? `0 0 40px ${GOLD} 0.2), inset 0 1px 0 ${GOLD} 0.1)`
                      : `0 4px 20px rgba(0,0,0,0.3)`,
                  }}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={this.state.entryDone
                    ? { type: 'tween', duration: 0.12, ease: 'easeOut' }
                    : { type: 'spring', stiffness: 250, damping: 20, delay: i * 0.1 }
                  }
                  whileHover={{ scale: 1.04, y: -6, transition: { type: 'tween', duration: 0.1, ease: 'easeOut' } }}
                  whileTap={{ scale: 0.98, transition: { duration: 0.05 } }}
                  onClick={() => this.setState({ selected: deck.id })}
                >
                  <FourCorners color={isSelected ? ACCENT_GOLD : `${GOLD} 0.3)`} radius={10} />

                  {/* Avatar card image */}
                  <div className="relative w-full aspect-[63/88]" style={{ background: `${GOLD} 0.04)` }}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={deck.name} className="w-full h-full object-cover card-mask" draggable={false} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl" style={{ color: `${GOLD} 0.15)` }}>?</div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/90 to-transparent" />
                    {isSelected ? (
                      <motion.div
                        className="absolute top-3 right-3 size-7 rounded-full flex items-center justify-center shadow-lg"
                        style={{ background: ACCENT_GOLD }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="#1a1408" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                      </motion.div>
                    ) : null}
                  </div>

                  {/* Info section */}
                  <div className="p-4 flex-1 flex flex-col" style={{ background: isSelected ? `${GOLD} 0.05)` : 'transparent' }}>
                    <div className="text-base font-bold arena-heading mb-2" style={{ color: isSelected ? TEXT_PRIMARY : TEXT_BODY }}>{deck.name}</div>
                    <div className="flex gap-1.5 mb-3">
                      {deck.elements.map((el) => {
                        const c = ELEMENT_COLORS[el] || { color: TEXT_MUTED, bg: 'transparent', border: `${GOLD} 0.2)` };
                        return (
                          <span key={el} className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
                            {el}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs leading-relaxed flex-1" style={{ color: TEXT_MUTED }}>{deck.description}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <button
              type="button"
              disabled={!selected}
              className="px-10 py-3.5 text-sm font-semibold arena-heading cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={selected ? GOLD_BTN : { ...BEVELED_BTN, color: TEXT_MUTED, borderRadius: '6px' }}
              onMouseEnter={(e) => { if (selected) { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(212,168,67,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'; } }}
              onMouseLeave={(e) => { if (selected) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = GOLD_BTN.boxShadow; } }}
              data-sound={UI.CONFIRM}
              onClick={this.handleConfirm}
            >
              Start with this deck
            </button>
          </motion.div>
        </div>
      </div>
    );
  }
}
