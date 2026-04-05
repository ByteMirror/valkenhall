import { Component } from 'preact';
import { cn } from '../lib/utils';

export default class ArenaDeckSelect extends Component {
  constructor(props) {
    super(props);
    this.state = { selected: null };
  }

  render() {
    const { decks, onConfirm, onCancel } = this.props;
    const { selected } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="w-full max-w-2xl px-6">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2 arena-heading">Choose Your Deck</h1>
            <p className="text-muted-foreground">Select a deck for ranked play. You won't be able to change it during the match.</p>
          </div>

          {decks.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm mb-8">
              You don't have any decks. Build one first in the Deck Builder.
            </div>
          ) : (
            <div className="grid gap-3 mb-8">
              {decks.map((deck) => (
                <button
                  key={deck.id}
                  type="button"
                  className={cn(
                    'rounded-2xl border-2 p-4 text-left transition-all flex items-center gap-4',
                    selected === deck.id
                      ? 'border-green-500 bg-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
                      : 'border-border/50 bg-card/60 hover:border-border hover:bg-card/80'
                  )}
                  onClick={() => this.setState({ selected: deck.id })}
                >
                  {deck.previewUrl ? (
                    <img src={deck.previewUrl} alt="" className="w-24 h-16 rounded-lg object-cover object-left shrink-0" />
                  ) : (
                    <div className="w-24 h-16 rounded-lg bg-white/5 border border-dashed border-white/10 shrink-0 flex items-center justify-center text-[9px] text-white/20">No preview</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold text-white">{deck.name}</div>
                    <div className="text-xs text-muted-foreground">{deck.cards?.length || 0} cards</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-white/30 px-6 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-all"
              onClick={onCancel}
            >
              Cancel
            </button>
            {decks.length > 0 ? (
              <button
                type="button"
                disabled={!selected}
                className={cn(
                  'rounded-xl px-8 py-2.5 text-sm font-semibold transition-all',
                  selected
                    ? 'bg-green-500 text-black hover:bg-green-400 shadow-lg'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                )}
                onClick={() => onConfirm(selected)}
              >
                Find Match
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
