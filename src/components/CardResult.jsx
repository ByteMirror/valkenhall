import { Component, createRef } from 'preact';
import { rankPrintingsByResolution, rankPrintingsByResolutionStatic } from '../utils/imageQuality';
import { Button } from './ui/button';
import { IconChevronDown, IconPlus, IconTrash } from './ui/icons';
import { cn } from '../lib/utils';
import PrintingSelector from './PrintingSelector';
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from './ui/context-menu';
import {
  buildPrintingOptions,
  getQualityTone,
  printingMatchesVariant,
  resolveDefaultPrinting,
} from './printingOptions';

const SPECIAL_VARIANT_TAGS = ['EA', 'FA', 'V'];
const SPECIAL_VARIANT_LABELS = {
  EA: 'Extended Art',
  FA: 'Full Art',
  V: 'Marvel',
};

const EMPTY_PRINTING_STATE = {
  printing: null,
  rankedByResolution: [],
  currentResolution: { width: 0, height: 0, rank: null, quality: null },
};

const rankedPrintingsCache = new Map();

function getPrintingCacheId(printing) {
  return printing?._source_printing_id || printing?.unique_id || printing?.image_url || 'unknown-printing';
}

function getCardPrintingsCacheKey(card) {
  if (!card?.unique_id) {
    return null;
  }

  const printingsSignature = (card.printings || [])
    .map((printing) => `${getPrintingCacheId(printing)}:${printing?.image_url || ''}`)
    .join('|');

  return `${card.unique_id}::${printingsSignature}`;
}

function getCachedPrintingState(card, forcedPrinting) {
  const cacheKey = getCardPrintingsCacheKey(card);

  if (!cacheKey) {
    return null;
  }

  const rankedByResolution = rankedPrintingsCache.get(cacheKey);

  if (!rankedByResolution) {
    return null;
  }

  return {
    rankedByResolution,
    ...resolveDefaultPrinting(card, rankedByResolution, forcedPrinting),
  };
}

function createInitialPrintingState(card, forcedPrinting) {
  const rankedByResolution = rankPrintingsByResolutionStatic(card);

  return {
    rankedByResolution,
    ...resolveDefaultPrinting(card, rankedByResolution, forcedPrinting),
  };
}

function needsMeasuredRanking(rankedByResolution) {
  return rankedByResolution.some((entry) => !entry.width || !entry.height);
}

function isInteractiveCardTarget(target) {
  return Boolean(
    target?.closest?.(
      'button, input, textarea, select, a, [role="button"], [role="menu"], [role="menuitem"], [role="menuitemradio"]'
    )
  );
}

export default class CardResult extends Component {
  constructor(props) {
    super(props);

    const cachedPrintingState = getCachedPrintingState(props.card, props.printing);
    const initialPrintingState = cachedPrintingState || createInitialPrintingState(props.card, props.printing);

    this.state = {
      ...EMPTY_PRINTING_STATE,
      ...initialPrintingState,
      qualityActionsOpen: false,
      qualityActionsPosition: null,
    };

    this.printingStateRequestId = 0;
    this.qualityActionsTriggerRef = createRef();
  }

  componentDidMount() {
    this.primePrintingState();
  }

  componentDidUpdate(prevProps) {
    if (!prevProps) {
      return;
    }

    if (
      prevProps.card.unique_id !== this.props.card.unique_id ||
      prevProps.printing?.unique_id !== this.props.printing?.unique_id
    ) {
      this.closeQualityActionsMenu();
      this.primePrintingState();
    }
  }

  componentWillUnmount() {
    this.printingStateRequestId += 1;
  }

  primePrintingState = async () => {
    const { card, printing: forcedPrinting } = this.props;

    if (!card) {
      return;
    }

    const cachedPrintingState = getCachedPrintingState(card, forcedPrinting);

    if (cachedPrintingState) {
      this.setState(cachedPrintingState);
      return;
    }

    const initialPrintingState = createInitialPrintingState(card, forcedPrinting);
    this.setState(initialPrintingState);

    if (!needsMeasuredRanking(initialPrintingState.rankedByResolution)) {
      return;
    }

    const requestId = this.printingStateRequestId + 1;
    this.printingStateRequestId = requestId;
    const rankedByResolution = await rankPrintingsByResolution(card);
    const defaultPrintingState = resolveDefaultPrinting(card, rankedByResolution, forcedPrinting);
    const cacheKey = getCardPrintingsCacheKey(card);

    if (requestId !== this.printingStateRequestId) {
      return;
    }

    if (cacheKey) {
      rankedPrintingsCache.set(cacheKey, rankedByResolution);
    }

    this.setState({
      rankedByResolution,
      ...defaultPrintingState,
    });
  };

  applyPrintingSelection = (selectedPrinting) => {
    const { card = {}, chosenList = false, changeCardPrintingFromChosenCards = null, entryIndex = null } = this.props;

    if (!selectedPrinting) {
      return;
    }

    if (chosenList && entryIndex !== null) {
      changeCardPrintingFromChosenCards?.(entryIndex, selectedPrinting);
    }

    this.setState(resolveDefaultPrinting(card, this.state.rankedByResolution, selectedPrinting));
  };

  getVariantShortcutPrintings = () => {
    const { card = {} } = this.props;
    const ranked = this.state.rankedByResolution || [];

    return SPECIAL_VARIANT_TAGS.map((tag) => {
      const rankedMatch = ranked.find((entry) => printingMatchesVariant(entry.printing, tag))?.printing;
      const fallbackMatch = card.printings?.find((printing) => printingMatchesVariant(printing, tag));
      const printing = rankedMatch || fallbackMatch || null;

      return printing ? { tag, printing } : null;
    }).filter(Boolean);
  };

  selectVariantPrinting = (selectedPrinting) => {
    this.applyPrintingSelection(selectedPrinting);
  };

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

  openQualityActionsMenu = (event) => {
    const triggerNode = event?.currentTarget || this.qualityActionsTriggerRef.current;
    const rect = triggerNode?.getBoundingClientRect?.();

    if (!rect) {
      return;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();

    this.setState({
      qualityActionsOpen: true,
      qualityActionsPosition: {
        x: rect.right - 224,
        y: rect.bottom + 10,
      },
    });
  };

  closeQualityActionsMenu = () => {
    this.setState({
      qualityActionsOpen: false,
      qualityActionsPosition: null,
    });
  };

  toggleQualityActionsMenu = (event) => {
    if (this.state.qualityActionsOpen) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      this.closeQualityActionsMenu();
      return;
    }

    this.openQualityActionsMenu(event);
  };

  handleUpscaleAction = () => {
    const { entryIndex = null, upscaleChosenCardAtIndex = null } = this.props;

    if (entryIndex === null || typeof upscaleChosenCardAtIndex !== 'function') {
      return;
    }

    this.closeQualityActionsMenu();
    upscaleChosenCardAtIndex(entryIndex);
  };

  handleRevertAction = () => {
    const { entryIndex = null, revertChosenCardAtIndex = null } = this.props;

    if (entryIndex === null || typeof revertChosenCardAtIndex !== 'function') {
      return;
    }

    this.closeQualityActionsMenu();
    revertChosenCardAtIndex(entryIndex);
  };

  handleToggleUpscale = (printing) => {
    const { entryIndex = null, revertChosenCardAtIndex = null, restoreUpscaleFromCache = null } = this.props;

    if (entryIndex === null) {
      return;
    }

    if (printing._upscaled) {
      revertChosenCardAtIndex?.(entryIndex);
    } else if (printing._cachedUpscale) {
      restoreUpscaleFromCache?.(entryIndex);
    }
  };

  render() {
    const {
      card = {},
      chosenList = false,
      entryIndex = null,
      isUpscaling = false,
      isSelected = false,
      revertChosenCardAtIndex = null,
      upscaleChosenCardAtIndex = null,
    } = this.props;
    const { currentResolution, printing, qualityActionsOpen, qualityActionsPosition, rankedByResolution } = this.state;

    if (printing == null) {
      return <article className="card-card">Loading...</article>;
    }

    const rotateImage =
      card.played_horizontally &&
      printing.image_rotation_degrees !== 270 &&
      printing.image_rotation_degrees !== 90;

    const { width, height } = currentResolution;
    const aspectRatio = width && height ? width / height : 0;
    const isVerticalCard = aspectRatio > 1.2;
    const qualityLabel = currentResolution.quality?.label || 'Unknown';
    const qualityTone = getQualityTone(qualityLabel);
    const variantShortcutPrintings = this.getVariantShortcutPrintings();
    const printingOptions = buildPrintingOptions(card, rankedByResolution);
    const qualityBadgeClasses = cn(
      'quality-pill inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[10px] font-medium leading-none shadow-[0_6px_16px_rgba(0,0,0,0.14)] transition-colors',
      qualityTone
    );
    const qualityBadgeContent = <>{qualityLabel}</>;
    const canUpscaleFromBadge =
      chosenList &&
      !isUpscaling &&
      !printing?._upscaled &&
      entryIndex !== null &&
      typeof upscaleChosenCardAtIndex === 'function';
    const canRevertFromBadge =
      chosenList &&
      !isUpscaling &&
      printing?._upscaled &&
      entryIndex !== null &&
      typeof revertChosenCardAtIndex === 'function';
    const usesQualityActionsMenu = chosenList;
    const qualityMenuTitle = printing?._upscaled ? 'Upscaled printing' : `${qualityLabel} quality`;
    const qualityMenuDescription = canUpscaleFromBadge
      ? 'Use this printing as the new local default for matching deck copies.'
      : canRevertFromBadge
        ? 'Restore the original local printing for this card.'
        : isUpscaling
          ? 'This card is being upscaled locally right now.'
          : 'Already using the best local printing';

    const actionButton = chosenList ? (
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Remove card"
        title="Remove card"
        className="h-10 w-10 rounded-xl border-input bg-background/50 text-foreground no-print"
        onClick={() => this.props.removeCardFromChosenCards(entryIndex, card, printing)}
      >
        <IconTrash />
      </Button>
    ) : (
      <Button
        type="button"
        className="h-9 rounded-xl no-print"
        onClick={() => this.props.addCardToChosenCards(card, printing)}
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
        <div className="card-header no-print mb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-card-foreground">{card.name}</h3>
            <p className="card-meta mt-1 whitespace-nowrap text-xs text-muted-foreground">
              {currentResolution.width}×{currentResolution.height}px
              {currentResolution.rank ? ` • Rank ${currentResolution.rank}/${rankedByResolution.length}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {usesQualityActionsMenu ? (
              <button
                ref={this.qualityActionsTriggerRef}
                type="button"
                aria-label={`Open quality actions (${qualityLabel} quality)`}
                aria-expanded={qualityActionsOpen ? 'true' : 'false'}
                aria-haspopup="menu"
                title="Open quality actions"
                className={cn(
                  qualityBadgeClasses,
                  !isUpscaling && 'cursor-pointer',
                  isUpscaling && 'cursor-progress opacity-80',
                  qualityActionsOpen && 'border-primary/50 bg-card text-foreground'
                )}
                disabled={isUpscaling}
                onClick={this.toggleQualityActionsMenu}
              >
                {qualityBadgeContent}
                <IconChevronDown className={cn('size-2.5 text-current/80 transition-transform', qualityActionsOpen && 'rotate-180')} />
              </button>
            ) : (
              <span className={qualityBadgeClasses}>{qualityBadgeContent}</span>
            )}
          </div>
        </div>
        {usesQualityActionsMenu ? (
          <ContextMenuContent
            ariaLabel="Quality actions"
            className="min-w-[224px]"
            onOpenChange={(open) => {
              if (!open) {
                this.closeQualityActionsMenu();
              }
            }}
            open={qualityActionsOpen}
            position={qualityActionsPosition}
          >
            <div className="px-3 pb-2 pt-1">
              <p className="text-sm font-semibold text-popover-foreground">{qualityMenuTitle}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{qualityMenuDescription}</p>
            </div>
            {(canUpscaleFromBadge || canRevertFromBadge) ? <ContextMenuSeparator /> : null}
            {canUpscaleFromBadge ? (
              <ContextMenuItem onClick={this.handleUpscaleAction}>{qualityLabel === 'Optimal' ? 'Sharpen' : 'Upscale'} current printing</ContextMenuItem>
            ) : null}
            {canRevertFromBadge ? (
              <ContextMenuItem onClick={this.handleRevertAction}>Revert current printing</ContextMenuItem>
            ) : null}
          </ContextMenuContent>
        ) : null}

        <div className="relative">
          <div
            className={`card-image-shell relative overflow-hidden rounded-[14px] bg-muted/30 ${rotateImage ? 'is-rotated' : ''} ${isVerticalCard ? 'is-vertical-card' : ''}`}
          >
            <img
              className="card-image h-full w-full object-contain"
              src={printing.image_url}
              alt={card.name}
              loading="lazy"
              decoding="async"
            />
            {isUpscaling ? (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/78 backdrop-blur-sm"
                aria-label={`Upscaling ${card.name}`}
                role="status"
              >
                <div className="size-10 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
                <div className="space-y-1 text-center">
                  <p className="text-sm font-semibold text-card-foreground">Upscaling...</p>
                  <p className="text-xs text-muted-foreground">Replacing this printing with a sharper local copy.</p>
                </div>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted/80">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/80" />
                </div>
              </div>
            ) : null}
          </div>
          {variantShortcutPrintings.length > 0 ? (
            <div className="no-print absolute right-0 top-5 z-10 flex translate-x-[28%] flex-col items-center gap-3">
              {variantShortcutPrintings.map(({ tag, printing: variantPrinting }) => {
                const isActive = printingMatchesVariant(printing, tag);

                return (
                  <button
                    key={`${card.unique_id}-${tag}`}
                    type="button"
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-semibold tracking-[0.08em] shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-colors',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                    aria-label={tag}
                    title={SPECIAL_VARIANT_LABELS[tag] || tag}
                    onClick={() => this.selectVariantPrinting(variantPrinting)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="card-footer no-print mt-2.5 flex flex-col gap-2.5">
          <div className="card-controls grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            {actionButton}
            <PrintingSelector
              cardName={card.name}
              onSelect={this.applyPrintingSelection}
              onToggleUpscale={chosenList ? this.handleToggleUpscale : undefined}
              printingOptions={printingOptions}
              selectedPrinting={printing}
            />
          </div>
        </div>
      </article>
    );
  }
}
