import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Input } from './input';
import { IconChevronDown, IconSearch } from './icons';
import { cn } from '../../lib/utils';
import {
  GOLD, ACCENT_GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  DIALOG_BG, DIALOG_BORDER, BEVELED_BTN, INPUT_STYLE,
} from '../../lib/medievalTheme';

const MENU_VIEWPORT_PADDING = 16;
const MENU_VERTICAL_OFFSET = 8;

// Medieval-themed surface tokens for the Select component. Inline
// styles are used here (instead of Tailwind utility classes) so the
// component renders identically regardless of which CSS layer is
// loaded — and so the rest of the codebase's gold/parchment palette
// stays the single source of truth.
const SELECT_TRIGGER_STYLE = {
  ...BEVELED_BTN,
  borderRadius: '6px',
  color: TEXT_PRIMARY,
  height: '40px',
  // Solid base layer underneath the textures so nothing behind the
  // trigger can bleed through (the rest of the medieval UI assumes
  // dialogs sit on opaque surfaces).
  backgroundColor: '#0e0a06',
};

const SELECT_MENU_STYLE = {
  background: DIALOG_BG,
  backgroundColor: '#0e0a06',
  border: `1px solid ${DIALOG_BORDER}`,
  borderRadius: '8px',
  boxShadow: '0 12px 32px rgba(0,0,0,0.6), 0 0 24px rgba(180,140,60,0.08)',
  color: TEXT_BODY,
};

const SELECT_SEARCH_STYLE = {
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

  if (!normalizedQuery) {
    return true;
  }

  return [option?.label, option?.description, option?.value]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function Select({
  ariaLabel,
  className,
  disabled = false,
  menuAlign = 'start',
  menuClassName,
  menuPreferredWidth = null,
  menuSearchAriaLabel = '',
  menuSearchPlaceholder = 'Search options',
  noOptionsMessage = 'No options',
  onValueChange = () => {},
  options = [],
  placeholder = 'Select an option',
  portalMenu = false,
  renderOptionAccessory,
  searchable = false,
  triggerClassName,
  triggerLabelClassName = 'truncate',
  triggerVariant = 'outline',
  value = '',
}) {
  const [open, setOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState(null);
  // Index of the keyboard-highlighted option in filteredOptions. Defaults
  // to 0 so the first match is selectable with a single Enter — the
  // standard autocomplete affordance.
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const selectedOption = options.find((option) => option.value === value) || null;
  const filteredOptions = searchable ? options.filter((option) => matchesOptionSearch(option, menuQuery)) : options;

  function updateMenuPosition() {
    if (!portalMenu || typeof window === 'undefined') {
      return;
    }

    const trigger = rootRef.current;
    const menu = menuRef.current;

    if (!trigger || !menu) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const availableWidth = Math.max(0, window.innerWidth - MENU_VIEWPORT_PADDING * 2);
    const desiredWidth = Math.max(
      triggerRect.width,
      menuPreferredWidth ?? menuRect.width ?? triggerRect.width
    );
    const width = Math.min(desiredWidth, availableWidth);
    const preferredLeft = menuAlign === 'end' ? triggerRect.right - width : triggerRect.left;
    const left = Math.max(
      MENU_VIEWPORT_PADDING,
      Math.min(preferredLeft, window.innerWidth - MENU_VIEWPORT_PADDING - width)
    );
    const measuredHeight = menuRect.height || menu.offsetHeight || 0;
    const spaceBelow = Math.max(
      0,
      window.innerHeight - triggerRect.bottom - MENU_VIEWPORT_PADDING - MENU_VERTICAL_OFFSET
    );
    const spaceAbove = Math.max(0, triggerRect.top - MENU_VIEWPORT_PADDING - MENU_VERTICAL_OFFSET);
    const shouldOpenUpward = measuredHeight > 0 && spaceBelow < measuredHeight && spaceAbove > spaceBelow;
    const preferredTop = shouldOpenUpward
      ? triggerRect.top - MENU_VERTICAL_OFFSET - measuredHeight
      : triggerRect.bottom + MENU_VERTICAL_OFFSET;
    const top = measuredHeight > 0
      ? Math.max(
          MENU_VIEWPORT_PADDING,
          Math.min(preferredTop, window.innerHeight - MENU_VIEWPORT_PADDING - measuredHeight)
        )
      : Math.max(
          MENU_VIEWPORT_PADDING,
          Math.min(preferredTop, window.innerHeight - MENU_VIEWPORT_PADDING)
        );

    setMenuPosition({
      left,
      top,
      width,
    });
  }

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
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

  // Reset the highlight to the first match whenever the filter changes
  // so a single Enter always picks the top result. Also clamp it within
  // the new filteredOptions length so an out-of-range index doesn't
  // linger after a narrowing filter.
  useEffect(() => {
    setHighlightedIndex((idx) =>
      filteredOptions.length === 0 ? 0 : Math.min(idx, filteredOptions.length - 1)
    );
  }, [filteredOptions.length, menuQuery]);

  // Scroll the highlighted option into view as the user navigates with
  // the arrow keys. block: 'nearest' avoids fighting with the browser's
  // default scroll behavior on the first reveal.
  useEffect(() => {
    if (!open) return;
    const el = optionRefs.current[highlightedIndex];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  useEffect(() => {
    if (!open || !portalMenu) {
      return undefined;
    }

    updateMenuPosition();
    return undefined;
  }, [filteredOptions.length, menuAlign, menuPreferredWidth, open, portalMenu, searchable]);

  const menuContent = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      className={cn(
        portalMenu
          ? 'fixed z-[140] p-1.5'
          : 'absolute left-0 top-full z-30 mt-2 w-full p-1.5',
        menuClassName
      )}
      style={
        portalMenu
          ? {
              ...SELECT_MENU_STYLE,
              left: `${menuPosition?.left ?? MENU_VIEWPORT_PADDING}px`,
              top: `${menuPosition?.top ?? MENU_VIEWPORT_PADDING}px`,
              minWidth: `${menuPosition?.width ?? menuPreferredWidth ?? 0}px`,
              maxHeight: 'min(280px, calc(100vh - 40px))',
              overflowY: 'auto',
              visibility: menuPosition ? 'visible' : 'hidden',
            }
          : { ...SELECT_MENU_STYLE, maxHeight: 'min(280px, calc(100vh - 40px))', overflowY: 'auto' }
      }
    >
      {searchable ? (
        <div
          className="sticky top-0 z-10 -mx-1.5 -mt-1.5 mb-2 px-1.5 py-1.5"
          style={{
            backgroundColor: '#0e0a06',
            borderBottom: `1px solid ${GOLD} 0.2)`,
          }}
        >
          <label className="relative block">
            <IconSearch
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2"
              style={{ color: TEXT_MUTED }}
            />
            <Input
              autoFocus
              type="search"
              role="searchbox"
              aria-label={menuSearchAriaLabel || `Search ${ariaLabel}`}
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
                  if (choice) {
                    onValueChange(choice.value);
                    setOpen(false);
                  }
                }
              }}
              placeholder={menuSearchPlaceholder}
              className="pl-9 shadow-none border-0"
              style={SELECT_SEARCH_STYLE}
            />
          </label>
        </div>
      ) : null}

      {filteredOptions.length === 0 ? (
        <div className="px-3 py-2 text-sm" style={{ color: TEXT_MUTED }}>{noOptionsMessage}</div>
      ) : null}

      {filteredOptions.map((option, optionIdx) => {
        const isActive = option.value === value;
        const isHighlighted = optionIdx === Math.min(highlightedIndex, filteredOptions.length - 1);
        const accessory = renderOptionAccessory?.({
          option,
          isActive,
          closeMenu: () => setOpen(false),
        });
        const optionStyle = isActive
          ? OPTION_ACTIVE_STYLE
          : isHighlighted
            ? OPTION_HIGHLIGHTED_STYLE
            : OPTION_BASE_STYLE;
        const optionButton = (
          <button
            key={option.value}
            ref={(el) => { optionRefs.current[optionIdx] = el; }}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            data-highlighted={isHighlighted ? 'true' : undefined}
            className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm cursor-pointer"
            style={optionStyle}
            onMouseEnter={() => setHighlightedIndex(optionIdx)}
            onClick={() => {
              onValueChange(option.value);
              setOpen(false);
            }}
          >
            <span
              className="flex size-4 shrink-0 items-center justify-center"
              style={{ color: isActive ? ACCENT_GOLD : 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block whitespace-nowrap">{option.label}</span>
              {option.description ? (
                <span className="mt-0.5 block whitespace-nowrap text-xs" style={{ color: TEXT_MUTED }}>{option.description}</span>
              ) : null}
            </span>
          </button>
        );

        if (!accessory) {
          return optionButton;
        }

        return (
          <div key={option.value} className="flex items-center gap-2">
            {optionButton}
            {accessory}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full items-center justify-between px-3 text-sm font-normal cursor-pointer transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          triggerClassName
        )}
        style={SELECT_TRIGGER_STYLE}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={cn('text-left', triggerLabelClassName)}
          style={{ color: selectedOption ? TEXT_PRIMARY : TEXT_MUTED }}
        >
          {selectedOption?.label || placeholder}
        </span>
        <IconChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          style={{ color: ACCENT_GOLD }}
        />
      </button>

      {portalMenu && menuContent && typeof document !== 'undefined' ? createPortal(menuContent, document.body) : menuContent}
    </div>
  );
}

export { Select };
