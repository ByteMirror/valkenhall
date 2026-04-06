import { useEffect, useState } from 'preact/hooks';
import { rankPrintingsByResolution } from '../utils/imageQuality';
import { cn } from '../lib/utils';
import { getPitchLabel } from '../utils/deckMetrics';
import { Button } from './ui/button';
import PrintingSelector from './PrintingSelector';
import { buildPrintingOptions, resolveDefaultPrinting } from './printingOptions';
import { isFoilFinish, FOIL_LABEL_COLOR } from '../utils/sorcery/foil.js';

function getPitchTone(pitchLabel) {
  if (pitchLabel === 'Red') {
    return 'bg-red-500';
  }

  if (pitchLabel === 'Yellow') {
    return 'bg-amber-400';
  }

  if (pitchLabel === 'Blue') {
    return 'bg-sky-500';
  }

  return 'bg-transparent';
}

function isInteractiveArchiveTarget(target) {
  return Boolean(
    target?.closest?.(
      'button, input, textarea, select, a, [role="button"], [role="menu"], [role="menuitem"], [role="menuitemradio"]'
    )
  );
}

export default function ArchiveCardRow({
  addCardToChosenCards = () => {},
  card,
  onDragEnd = () => {},
  onDragStart = () => {},
  visiblePrintings = null,
  arenaAvailability = null,
}) {
  const [rankedByResolution, setRankedByResolution] = useState([]);
  const [selectedPrinting, setSelectedPrinting] = useState(null);
  const pitchLabel = getPitchLabel(card);
  const archiveVisiblePrintings = Array.isArray(visiblePrintings) && visiblePrintings.length > 0 ? visiblePrintings : card?.printings || [];
  const visiblePrintingIds = archiveVisiblePrintings.map((printing) => printing.unique_id).join('|');
  const archiveCard = archiveVisiblePrintings === card?.printings ? card : { ...card, printings: archiveVisiblePrintings };
  const printingOptions = buildPrintingOptions(archiveCard, rankedByResolution);
  const previewUrl = selectedPrinting?.image_url || archiveCard?.printings?.[archiveCard.printings.length - 1]?.image_url || '';

  useEffect(() => {
    let isCancelled = false;

    async function loadPrintingData() {
      if (!card) {
        return;
      }

      const nextVisiblePrintings =
        Array.isArray(visiblePrintings) && visiblePrintings.length > 0 ? visiblePrintings : card?.printings || [];
      const nextArchiveCard = nextVisiblePrintings === card?.printings ? card : { ...card, printings: nextVisiblePrintings };
      const ranked = await rankPrintingsByResolution(nextArchiveCard);

      if (isCancelled) {
        return;
      }

      const defaultPrintingState = resolveDefaultPrinting(nextArchiveCard, ranked);

      setRankedByResolution(ranked);
      setSelectedPrinting((current) =>
        nextArchiveCard.printings.some((printing) => printing.unique_id === current?.unique_id)
          ? current
          : defaultPrintingState.printing
      );
    }

    loadPrintingData();

    return () => {
      isCancelled = true;
    };
  }, [card, visiblePrintingIds]);

  const handleRowClick = (event) => {
    if (isInteractiveArchiveTarget(event.target)) {
      return;
    }

    event.currentTarget?.focus?.();
  };

  return (
    <article
      aria-label={`Archive card ${card.name}`}
      className="left-pane-raised-surface grid grid-cols-[12px_52px_minmax(0,1fr)] gap-3 overflow-hidden rounded-[14px] border border-border p-3 transition-[border-color,box-shadow] focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/60"
      data-card-preview-trigger="archive"
      data-archive-card-id={card.unique_id}
      data-card-preview-url={previewUrl}
      draggable
      tabIndex={-1}
      onClick={handleRowClick}
      onDragEnd={onDragEnd}
      onDragStart={(event) => onDragStart(card, event)}
    >
      <div className="flex px-1 py-2" aria-hidden={!pitchLabel}>
        {pitchLabel ? (
          <div
            aria-label={`Pitch strip ${pitchLabel}`}
            className={cn('w-2 self-stretch rounded-full', getPitchTone(pitchLabel))}
          />
        ) : null}
      </div>
      <img
        className="aspect-[63.5/88.9] w-[52px] rounded-[10px] object-cover"
        src={previewUrl}
        alt={card.name}
      />
      <div className={cn('grid min-w-0 gap-3', !arenaAvailability && 'sm:grid-cols-[minmax(0,1fr)_minmax(170px,220px)] sm:items-center')}>
        <div className="min-w-0">
          <strong className="block truncate text-sm text-card-foreground">
            {card.name}
            {isFoilFinish(selectedPrinting?.foiling) ? (
              <span className={`ml-1.5 text-[9px] font-semibold ${FOIL_LABEL_COLOR[selectedPrinting.foiling]}`}>
                {selectedPrinting.foiling === 'R' ? 'RAINBOW' : 'FOIL'}
              </span>
            ) : null}
          </strong>
          {arenaAvailability ? (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Owned <span className="text-card-foreground">{arenaAvailability.owned}</span>
              </span>
              <span className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                arenaAvailability.remaining > 0
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-muted/50 text-muted-foreground/60',
              )}>
                Available <span className={arenaAvailability.remaining > 0 ? 'text-emerald-300' : ''}>{arenaAvailability.remaining}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="ml-auto"
                disabled={arenaAvailability.remaining <= 0}
                title={arenaAvailability.remaining <= 0 ? 'No copies left' : undefined}
                onClick={() => addCardToChosenCards(card, selectedPrinting)}
              >
                Add
              </Button>
            </div>
          ) : (
            <span className="mt-1 block text-xs text-muted-foreground">{archiveVisiblePrintings.length || 0} printings</span>
          )}
        </div>
        {!arenaAvailability && (
          <div data-testid="archive-actions" className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <PrintingSelector
              cardName={card.name}
              onSelect={(printing) => addCardToChosenCards(card, printing)}
              printingOptions={printingOptions}
              selectedPrinting={selectedPrinting}
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => addCardToChosenCards(card, selectedPrinting)}>
              Add
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
