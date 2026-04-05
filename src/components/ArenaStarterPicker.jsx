import { Component } from 'preact';
import { motion } from 'framer-motion';
import { STARTER_DECKS } from '../utils/arena/starterDecks';
import { cn } from '../lib/utils';

const ELEMENT_COLORS = {
  Earth: { text: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/30' },
  Water: { text: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
  Fire: { text: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' },
  Air: { text: 'text-sky-300', bg: 'bg-sky-500/15', border: 'border-sky-500/30' },
};

export default class ArenaStarterPicker extends Component {
  constructor(props) {
    super(props);
    this.state = { selected: null, entryDone: false };
    setTimeout(() => this.setState({ entryDone: true }), 600);
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
    const { selected } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black overflow-hidden">
        {/* Subtle ambient glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(245,158,11,0.04) 0%, transparent 60%)' }} />

        <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-6">
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl font-bold text-white mb-3">Choose Your Path</h1>
            <p className="text-muted-foreground text-base max-w-lg mx-auto">Select a starter deck to begin your arena journey. All cards will be added to your collection.</p>
          </motion.div>

          <div className="flex items-stretch justify-center gap-5 mb-10">
            {STARTER_DECKS.map((deck, i) => {
              const isSelected = selected === deck.id;
              const avatarUrl = this.getAvatarImageUrl(deck.name);

              return (
                <motion.button
                  key={deck.id}
                  type="button"
                  className={cn(
                    'relative rounded-2xl border-2 p-0 overflow-hidden transition-all flex flex-col w-[220px]',
                    isSelected
                      ? 'border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.2)]'
                      : 'border-white/10 hover:border-white/30'
                  )}
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
                  {/* Avatar card image */}
                  <div className="relative w-full aspect-[63/88] bg-black/40">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={deck.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl text-white/10">?</div>
                    )}
                    {/* Gradient overlay at bottom for readability */}
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/90 to-transparent" />
                    {/* Selected checkmark */}
                    {isSelected ? (
                      <motion.div
                        className="absolute top-3 right-3 size-7 rounded-full bg-amber-500 flex items-center justify-center shadow-lg"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <svg className="size-4 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                      </motion.div>
                    ) : null}
                  </div>

                  {/* Info section */}
                  <div className={cn(
                    'p-4 flex-1 flex flex-col transition-colors',
                    isSelected ? 'bg-amber-500/5' : 'bg-card/40'
                  )}>
                    <div className="text-base font-bold text-white mb-2">{deck.name}</div>
                    <div className="flex gap-1.5 mb-3">
                      {deck.elements.map((el) => {
                        const colors = ELEMENT_COLORS[el] || { text: 'text-white/60', bg: 'bg-white/10', border: 'border-white/20' };
                        return (
                          <span key={el} className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold border', colors.text, colors.bg, colors.border)}>
                            {el}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed flex-1">{deck.description}</p>
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
              className={cn(
                'rounded-xl px-10 py-3.5 text-sm font-semibold transition-all',
                selected
                  ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/25'
                  : 'bg-white/5 text-white/20 cursor-not-allowed'
              )}
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
