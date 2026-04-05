import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { getPrintingVariantLabel, getQualityTone } from './printingOptions';

const PRINTING_MENU_OPEN_EVENT = 'card-result-printing-menu-open';

export default function PrintingSelector({
  cardName = '',
  onSelect = () => {},
  onToggleUpscale,
  printingOptions = [],
  selectedPrinting = null,
  triggerClassName,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const instanceIdRef = useRef(`printing-selector-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleDocumentMouseDown(event) {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) {
        return;
      }

      setIsOpen(false);
      setMenuPosition(null);
    }

    function handleDocumentKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setMenuPosition(null);
      }
    }

    function handleExternalPrintingMenuOpen(event) {
      if (event.detail?.instanceId !== instanceIdRef.current) {
        setIsOpen(false);
        setMenuPosition(null);
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    window.addEventListener(PRINTING_MENU_OPEN_EVENT, handleExternalPrintingMenuOpen);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    updateMenuPosition();

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
      window.removeEventListener(PRINTING_MENU_OPEN_EVENT, handleExternalPrintingMenuOpen);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, printingOptions, selectedPrinting]);

  const currentPrintingIdx = Math.max(
    0,
    printingOptions.findIndex((option) => option.printing.unique_id === selectedPrinting?.unique_id)
  );
  const idealMenuHeight = 26 * 16;

  function updateMenuPosition() {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 24;
    const menuWidth = Math.min(480, Math.max(280, window.innerWidth - viewportPadding * 2));
    const verticalOffset = 12;
    const maxMenuHeight = Math.max(0, window.innerHeight - viewportPadding * 2);
    const menuHeight = Math.min(idealMenuHeight, maxMenuHeight);
    const spaceAbove = Math.max(0, rect.top - viewportPadding - verticalOffset);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding - verticalOffset);
    const shouldOpenDownward =
      (spaceBelow >= idealMenuHeight && spaceAbove < idealMenuHeight) ||
      (spaceBelow >= spaceAbove && spaceBelow > 0);
    const preferredTop = shouldOpenDownward ? rect.bottom + verticalOffset : rect.top - verticalOffset - menuHeight;
    const nextTop = Math.max(
      viewportPadding,
      Math.min(preferredTop, window.innerHeight - viewportPadding - menuHeight)
    );

    const nextPosition = {
      right: Math.max(viewportPadding, window.innerWidth - rect.right),
      width: menuWidth,
      height: menuHeight,
      top: nextTop,
    };

    setMenuPosition(nextPosition);
  }

  function toggleMenu() {
    setIsOpen((current) => {
      const nextValue = !current;

      if (nextValue) {
        window.dispatchEvent(new CustomEvent(PRINTING_MENU_OPEN_EVENT, { detail: { instanceId: instanceIdRef.current } }));
      }

      if (!nextValue) {
        setMenuPosition(null);
      }

      return nextValue;
    });
  }

  function handleSelect(nextPrinting) {
    onSelect(nextPrinting);
    setIsOpen(false);
    setMenuPosition(null);
  }

  return (
    <div ref={triggerRef}>
      <Button
        type="button"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Printing ${currentPrintingIdx + 1}`}
        className={cn(
          'h-10 w-full justify-between rounded-xl border-input bg-background/40 px-3 text-left text-foreground',
          triggerClassName
        )}
        disabled={printingOptions.length === 0}
        onClick={toggleMenu}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-medium">Printing {currentPrintingIdx + 1}</span>
          {selectedPrinting?._upscaled ? (
            <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">Upscaled</span>
          ) : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">{getPrintingVariantLabel(selectedPrinting)}</span>
      </Button>

      {isOpen && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Printing options"
              className="fixed z-[120] overflow-hidden rounded-2xl border border-border/70 bg-popover/96 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl"
              style={{
                right: `${menuPosition.right}px`,
                width: `${menuPosition.width}px`,
                top: `${menuPosition.top}px`,
              }}
            >
              <div
                className="scrollbar-rail-less scrollbar-stable grid min-h-[26rem] max-h-[26rem] content-start grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3"
                style={{
                  height: `${menuPosition.height ?? idealMenuHeight}px`,
                }}
              >
                {printingOptions.map(({ printing, index, label, quality }) => {
                  const isActive = printing.unique_id === selectedPrinting?.unique_id;
                  const qualityTone = getQualityTone(quality.label);

                  return (
                    <button
                      key={printing.unique_id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className={cn(
                        'flex w-full flex-col gap-2 rounded-2xl border p-2 text-left transition-colors',
                        isActive ? 'border-primary/60 bg-primary/10' : 'border-border/70 bg-background/35 hover:bg-muted/60'
                      )}
                      onClick={() => handleSelect(printing)}
                    >
                      <div className="relative">
                        <div className="absolute left-2.5 top-2.5 z-10 rounded-md bg-card shadow-[0_8px_20px_rgba(0,0,0,0.28)]">
                          <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium', qualityTone)}>
                            {quality.label}
                          </span>
                        </div>
                        {onToggleUpscale && (printing._upscaled || printing._cachedUpscale) ? (
                          <button
                            type="button"
                            aria-label={printing._upscaled ? 'Switch to original' : 'Switch to upscaled'}
                            className={cn(
                              'absolute right-2.5 top-2.5 z-10 inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold tracking-wide shadow-[0_8px_20px_rgba(0,0,0,0.28)] transition-colors',
                              printing._upscaled
                                ? 'bg-violet-500/90 text-white'
                                : 'bg-card text-muted-foreground ring-1 ring-border/70'
                            )}
                            onClick={(e) => { e.stopPropagation(); onToggleUpscale(printing); }}
                          >
                            AI
                          </button>
                        ) : null}
                        <img
                          className="h-36 w-full rounded-xl object-contain"
                          src={printing.image_url}
                          alt={`${cardName} printing ${index + 1}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">Printing {index + 1}</p>
                          {isActive ? (
                            <span className="rounded-md bg-primary/14 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                              Active
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
