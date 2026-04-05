import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from './button';
import { Input } from './input';
import { IconChevronDown, IconSearch } from './icons';
import { cn } from '../../lib/utils';

const MENU_VIEWPORT_PADDING = 16;
const MENU_VERTICAL_OFFSET = 8;

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
  const rootRef = useRef(null);
  const menuRef = useRef(null);
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
    }
  }, [open]);

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
          ? 'fixed z-[140] overflow-hidden rounded-2xl border border-border/70 bg-popover/96 p-1.5 text-popover-foreground shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl'
          : 'absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border/70 bg-popover/96 p-1.5 text-popover-foreground shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl',
        menuClassName
      )}
      style={
        portalMenu
          ? {
              left: `${menuPosition?.left ?? MENU_VIEWPORT_PADDING}px`,
              top: `${menuPosition?.top ?? MENU_VIEWPORT_PADDING}px`,
              width: `${menuPosition?.width ?? menuPreferredWidth ?? 0}px`,
              visibility: menuPosition ? 'visible' : 'hidden',
            }
          : undefined
      }
    >
      {searchable ? (
        <div className="sticky top-0 z-10 -m-1.5 mb-1.5 border-b border-border/60 bg-popover px-1.5 py-1.5 backdrop-blur-xl">
          <label className="relative block">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              type="search"
              role="searchbox"
              aria-label={menuSearchAriaLabel || `Search ${ariaLabel}`}
              value={menuQuery}
              onInput={(event) => setMenuQuery(event.currentTarget.value)}
              placeholder={menuSearchPlaceholder}
              className="h-9 border-border/60 bg-background/50 pl-9 shadow-none"
            />
          </label>
        </div>
      ) : null}

      {filteredOptions.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">{noOptionsMessage}</div>
      ) : null}

      {filteredOptions.map((option) => {
        const isActive = option.value === value;
        const accessory = renderOptionAccessory?.({
          option,
          isActive,
          closeMenu: () => setOpen(false),
        });
        const optionButton = (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            className={cn(
              'flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
              isActive ? 'bg-primary/12 text-foreground' : 'hover:bg-muted text-popover-foreground'
            )}
            onClick={() => {
              onValueChange(option.value);
              setOpen(false);
            }}
          >
            <span className={cn('flex size-4 shrink-0 items-center justify-center', isActive ? 'text-primary' : 'text-transparent')}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{option.label}</span>
              {option.description ? (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{option.description}</span>
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
      <Button
        type="button"
        variant={triggerVariant}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          'h-10 w-full justify-between rounded-xl border-input bg-input/40 px-3.5 text-sm font-normal text-foreground shadow-sm',
          triggerClassName
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn('text-left', triggerLabelClassName)}>{selectedOption?.label || placeholder}</span>
        <IconChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </Button>

      {portalMenu && menuContent && typeof document !== 'undefined' ? createPortal(menuContent, document.body) : menuContent}
    </div>
  );
}

export { Select };
