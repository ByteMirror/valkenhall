import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import { Button } from './ui/button';
import { IconPlus, IconTrash } from './ui/icons';
import { cn } from '../lib/utils';

function isInteractiveCardTarget(target) {
  return Boolean(
    target?.closest?.(
      'button, input, textarea, select, a, [role="button"], [role="menu"], [role="menuitem"], [role="menuitemradio"]'
    )
  );
}

export default class CardResult extends Component {
  handleChosenCardClick = (event) => {
    const { chosenList = false, entryIndex = null, onChosenCardSelect = null } = this.props;

    if (!chosenList || entryIndex === null || typeof onChosenCardSelect !== 'function' || isInteractiveCardTarget(event.target)) {
      return;
    }

    onChosenCardSelect(entryIndex, event);
    event.currentTarget?.focus?.();
  };

  handleChosenCardContextMenu = (event) => {
    const { chosenList = false, entryIndex = null, onChosenCardContextMenu = null } = this.props;

    if (
      !chosenList ||
      entryIndex === null ||
      typeof onChosenCardContextMenu !== 'function' ||
      isInteractiveCardTarget(event.target)
    ) {
      return;
    }

    event.currentTarget?.focus?.();
    onChosenCardContextMenu(entryIndex, event);
  };

  render() {
    const {
      card = {},
      chosenList = false,
      entryIndex = null,
      isSelected = false,
      printing,
    } = this.props;

    const activePrinting = printing || card.printings?.[card.printings.length - 1] || null;

    if (!activePrinting) {
      return <article className="card-card flex items-center justify-center"><RuneSpinner size={48} /></article>;
    }

    const rotateImage =
      card.played_horizontally &&
      activePrinting.image_rotation_degrees !== 270 &&
      activePrinting.image_rotation_degrees !== 90;

    const actionButton = chosenList ? (
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Remove card"
        title="Remove card"
        className="h-10 w-10 rounded-xl border-input bg-background/50 text-foreground"
        onClick={() => this.props.removeCardFromChosenCards(entryIndex, card, activePrinting)}
      >
        <IconTrash />
      </Button>
    ) : (
      <Button
        type="button"
        className="h-9 rounded-xl"
        onClick={() => this.props.addCardToChosenCards(card, activePrinting)}
      >
        <IconPlus />
        Add
      </Button>
    );

    return (
      <article
        data-deck-entry-index={chosenList ? entryIndex : undefined}
        role={chosenList ? 'option' : undefined}
        aria-label={chosenList ? card.name : undefined}
        aria-selected={chosenList ? String(isSelected) : undefined}
        tabIndex={chosenList ? (isSelected ? 0 : -1) : undefined}
        className={cn(
          'card-card relative rounded-[18px] border border-border/70 bg-card/92 p-2.5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]',
          chosenList && 'cursor-pointer transition-colors',
          chosenList && isSelected && 'border-primary/70 bg-primary/10 ring-2 ring-primary/30'
        )}
        onClick={this.handleChosenCardClick}
        onContextMenu={this.handleChosenCardContextMenu}
      >
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <h3 className="truncate text-sm font-semibold text-card-foreground">{card.name}</h3>
        </div>

        <div
          className={`card-image-shell relative overflow-hidden rounded-[14px] bg-muted/30 ${rotateImage ? 'is-rotated' : ''}`}
        >
          <img
            className="card-image h-full w-full object-contain"
            src={activePrinting.image_url}
            alt={card.name}
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className="mt-2.5 flex justify-center">
          {actionButton}
        </div>
      </article>
    );
  }
}
