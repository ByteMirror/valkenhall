import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Input } from './input';
import { IconChevronDown, IconSearch, IconClose } from './icons';
import { cn } from '../../lib/utils';
import {
  GOLD, ACCENT_GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  DIALOG_BG, DIALOG_BORDER, BEVELED_BTN, INPUT_STYLE,
} from '../../lib/medievalTheme';

// shadcn-style multi-select combobox with a search input, adapted to
// the medieval palette. Modeled on `ui/select.jsx` so both primitives
// share the same popover geometry and keyboard affordances — the only
// structural differences are that:
//   - `value` is an array, not a single string
//   - clicking an option toggles it without closing the menu
//   - the trigger shows "N selected" plus a quick-clear affordance

const MENU_VIEWPORT_PADDING = 16;
const MENU_VERTICAL_OFFSET = 8;
const MENU_MAX_HEIGHT = 320;

const TRIGGER_STYLE = {
  ...BEVELED_BTN,
  borderRadius: '6px',
  color: TEXT_PRIMARY,
  backgroundColor: '#0e0a06',
};

const MENU_STYLE = {
  background: DIALOG_BG,
  backgroundColor: '#0e0a06',
  border: `1px solid ${DIALOG_BORDER}`,
  borderRadius: '8px',
  boxShadow: '0 12px 32px rgba(0,0,0,0.6), 0 0 24px rgba(180,140,60,0.08)',
  color: TEXT_BODY,
  maxHeight: `${MENU_MAX_HEIGHT}px`,
  display: 'flex',
  flexDirection: 'column',
};

const SEARCH_STYLE = {
  ...INPUT_STYLE,
  backgroundColor: '#0e0a06',
  borderRadius: '6px',
  color: TEXT_PRIMARY,
  height: '32px',
};

const OPTION_BASE_STYLE = {
  borderRadius: '6px',
  color: TEXT_BODY,
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  transition: 'background-color 120ms ease, color 120ms ease',
};

const OPTION_ACTIVE_STYLE = {
  ...OPTION_BASE_STYLE,
  background: `${GOLD} 0.18)`,
  color: TEXT_PRIMARY,
  border: `1px solid ${GOLD} 0.4)`,
};

const OPTION_HIGHLIGHTED_STYLE = {
  ...OPTION_BASE_STYLE,
  background: `${GOLD} 0.1)`,
  color: TEXT_PRIMARY,
};

function matchesOptionSearch(option, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [option?.label, option?.description, option?.value]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(normalizedQuery));
}

function MultiSelect({
  ariaLabel,
  className,
  disabled = false,
  menuAlign = 'start',
  menuClassName,
  menuPreferredWidth = null,
  menuSearchPlaceholder = 'Search…',
  noOptionsMessage = 'No options',
  onValueChange = () => {},
  options = [],
  placeholder = 'Select…',
  portalMenu = false,
  triggerClassName,
  triggerHeight = 36,
  value = [],
}) {
  const [open, setOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);

  const selectedSet = new Set(value || []);
  const filteredOptions = options.filter((o) => matchesOptionSearch(o, menuQuery));

  const toggleOption = (optionValue) => {
    const next = new Set(selectedSet);
    if (next.has(optionValue)) next.delete(optionValue);
    else next.add(optionValue);
    onValueChange(Array.from(next));
  };

  const clearAll = () => {
    if (selectedSet.size === 0) return;
    onValueChange([]);
  };

  function updateMenuPosition() {
    if (!portalMenu || typeof window === 'undefined') return;
    const trigger = rootRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const availableWidth = Math.max(0, window.innerWidth - MENU_VIEWPORT_PADDING * 2);
    const desiredWidth = Math.max(
      triggerRect.width,
      menuPreferredWidth ?? menuRect.width ?? triggerRect.width,
    );
    const width = Math.min(desiredWidth, availableWidth);
    const preferredLeft = menuAlign === 'end' ? triggerRect.right - width : triggerRect.left;
    const left = Math.max(
      MENU_VIEWPORT_PADDING,
      Math.min(preferredLeft, window.innerWidth - MENU_VIEWPORT_PADDING - width),
    );
    const measuredHeight = menuRect.height || menu.offsetHeight || 0;
    const spaceBelow = Math.max(
      0,
      window.innerHeight - triggerRect.bottom - MENU_VIEWPORT_PADDING - MENU_VERTICAL_OFFSET,
    );
    const spaceAbove = Math.max(0, triggerRect.top - MENU_VIEWPORT_PADDING - MENU_VERTICAL_OFFSET);
    const shouldOpenUpward = measuredHeight > 0 && spaceBelow < measuredHeight && spaceAbove > spaceBelow;
    const preferredTop = shouldOpenUpward
      ? triggerRect.top - MENU_VERTICAL_OFFSET - measuredHeight
      : triggerRect.bottom + MENU_VERTICAL_OFFSET;
    const top = measuredHeight > 0
      ? Math.max(
          MENU_VIEWPORT_PADDING,
          Math.min(preferredTop, window.innerHeight - MENU_VIEWPORT_PADDING - measuredHeight),
        )
      : Math.max(
          MENU_VIEWPORT_PADDING,
          Math.min(preferredTop, window.innerHeight - MENU_VIEWPORT_PADDING),
        );

    setMenuPosition({ left, top, width });
  }

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    function handleViewportChange() {
      updateMenuPosition();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    if (portalMenu) {
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('scroll', handleViewportChange, true);
    }
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      if (portalMenu) {
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('scroll', handleViewportChange, true);
      }
    };
  }, [open, portalMenu]);

  useEffect(() => {
    if (!open) {
      setMenuQuery('');
      setMenuPosition(null);
      setHighlightedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setHighlightedIndex((idx) =>
      filteredOptions.length === 0 ? 0 : Math.min(idx, filteredOptions.length - 1),
    );
  }, [filteredOptions.length, menuQuery]);

  useEffect(() => {
    if (!open) return;
    const el = optionRefs.current[highlightedIndex];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  useEffect(() => {
    if (!open || !portalMenu) return undefined;
    updateMenuPosition();
    return undefined;
  }, [filteredOptions.length, menuAlign, menuPreferredWidth, open, portalMenu]);

  const selectedCount = selectedSet.size;
  const triggerLabel = selectedCount === 0
    ? placeholder
    : selectedCount === 1
      ? (options.find((o) => o.value === Array.from(selectedSet)[0])?.label || '1 selected')
      : `${selectedCount} selected`;

  const menuContent = open ? (
    <div
      ref={menuRef}
      role="listbox"
      aria-multiselectable="true"
      aria-label={ariaLabel}
      className={cn(
        portalMenu
          ? 'fixed z-[140] overflow-hidden p-2'
          : 'absolute left-0 top-full z-30 mt-2 w-full overflow-hidden p-2',
        menuClassName,
      )}
      style={
        portalMenu
          ? {
              ...MENU_STYLE,
              left: `${menuPosition?.left ?? MENU_VIEWPORT_PADDING}px`,
              top: `${menuPosition?.top ?? MENU_VIEWPORT_PADDING}px`,
              width: `${menuPosition?.width ?? menuPreferredWidth ?? 0}px`,
              visibility: menuPosition ? 'visible' : 'hidden',
            }
          : MENU_STYLE
      }
    >
      <div
        className="mb-2 flex items-center gap-1.5"
        style={{ backgroundColor: '#0e0a06' }}
      >
        <label className="relative block flex-1">
          <IconSearch
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2"
            style={{ color: TEXT_MUTED }}
          />
          <Input
            autoFocus
            type="search"
            role="searchbox"
            aria-label={`Search ${ariaLabel}`}
            value={menuQuery}
            onInput={(event) => setMenuQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (filteredOptions.length === 0) return;
                setHighlightedIndex((idx) => (idx + 1) % filteredOptions.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (filteredOptions.length === 0) return;
                setHighlightedIndex((idx) => (idx - 1 + filteredOptions.length) % filteredOptions.length);
              } else if (event.key === 'Enter') {
                if (filteredOptions.length === 0) return;
                event.preventDefault();
                const safeIdx = Math.min(highlightedIndex, filteredOptions.length - 1);
                const choice = filteredOptions[safeIdx];
                if (choice) toggleOption(choice.value);
              }
            }}
            placeholder={menuSearchPlaceholder}
            className="pl-9 shadow-none border-0"
            style={SEARCH_STYLE}
          />
        </label>
        {selectedCount > 0 ? (
          <button
            type="button"
            className="shrink-0 px-2 h-8 text-[10px] uppercase tracking-wider font-semibold cursor-pointer transition-all"
            style={{
              ...BEVELED_BTN,
              borderRadius: '4px',
              color: TEXT_MUTED,
            }}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            aria-label="Clear selection"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/*
        Scrollbar is intentionally hidden so the left and right padding
        stay visually symmetric — a native scrollbar always reserves
        layout space on the right in webkit, which would shift every
        option inward. Users can still scroll with the mouse wheel,
        arrow keys (via the search input), or touchpad drag.
      */}
      <div
        className="flex-1 overflow-y-auto flex flex-col gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {filteredOptions.length === 0 ? (
          <div className="p-2 text-sm" style={{ color: TEXT_MUTED }}>{noOptionsMessage}</div>
        ) : null}

        {filteredOptions.map((option, optionIdx) => {
          const isActive = selectedSet.has(option.value);
          const isHighlighted = optionIdx === Math.min(highlightedIndex, filteredOptions.length - 1);
          const optionStyle = isActive
            ? OPTION_ACTIVE_STYLE
            : isHighlighted
              ? OPTION_HIGHLIGHTED_STYLE
              : OPTION_BASE_STYLE;
          return (
            <button
              key={option.value}
              ref={(el) => { optionRefs.current[optionIdx] = el; }}
              type="button"
              role="option"
              aria-selected={isActive}
              data-highlighted={isHighlighted ? 'true' : undefined}
              className="flex w-full min-w-0 items-center gap-2 p-2 text-left text-sm cursor-pointer"
              style={optionStyle}
              onMouseEnter={() => setHighlightedIndex(optionIdx)}
              onClick={() => toggleOption(option.value)}
            >
              <span
                className="flex size-4 shrink-0 items-center justify-center rounded-sm"
                style={{
                  border: `1px solid ${isActive ? ACCENT_GOLD : 'rgba(180,140,60,0.35)'}`,
                  background: isActive ? `${GOLD} 0.25)` : 'rgba(0,0,0,0.4)',
                  color: isActive ? ACCENT_GOLD : 'transparent',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-3 text-sm font-normal cursor-pointer transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          triggerClassName,
        )}
        style={{ ...TRIGGER_STYLE, height: `${triggerHeight}px` }}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className="flex min-w-0 items-center gap-1.5"
          style={{ color: selectedCount > 0 ? TEXT_PRIMARY : TEXT_MUTED }}
        >
          <span className="truncate">{triggerLabel}</span>
          {selectedCount > 1 ? (
            <span
              className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: `${GOLD} 0.25)`,
                color: ACCENT_GOLD,
                border: `1px solid ${GOLD} 0.4)`,
              }}
            >
              {selectedCount}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selectedCount > 0 ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              className="flex items-center justify-center size-4 rounded cursor-pointer"
              style={{ color: TEXT_MUTED }}
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  clearAll();
                }
              }}
            >
              <IconClose className="size-3" />
            </span>
          ) : null}
          <IconChevronDown
            className={cn('size-4 transition-transform', open && 'rotate-180')}
            style={{ color: ACCENT_GOLD }}
          />
        </span>
      </button>

      {portalMenu && menuContent && typeof document !== 'undefined'
        ? createPortal(menuContent, document.body)
        : menuContent}
    </div>
  );
}

export { MultiSelect };
