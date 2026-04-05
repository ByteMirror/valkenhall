import { createPortal } from 'preact/compat';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { cn } from '../../lib/utils';
import { Button } from './button';

const MENU_WIDTH = 240;
const VIEWPORT_PADDING = 12;

function clampPosition(position = {}) {
  const width = typeof window === 'undefined' ? MENU_WIDTH : window.innerWidth;
  const height = typeof window === 'undefined' ? 0 : window.innerHeight;

  return {
    x: Math.max(VIEWPORT_PADDING, Math.min(position.x || VIEWPORT_PADDING, width - MENU_WIDTH - VIEWPORT_PADDING)),
    y: Math.max(VIEWPORT_PADDING, Math.min(position.y || VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, height - 120))),
  };
}

function ContextMenuContent({
  ariaLabel = 'Context menu',
  children,
  className,
  onOpenChange = () => {},
  open = false,
  position = null,
}) {
  const contentRef = useRef(null);
  const resolvedPosition = useMemo(() => (open && position ? clampPosition(position) : null), [open, position]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleMouseDown(event) {
      if (contentRef.current?.contains(event.target)) {
        return;
      }

      onOpenChange(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onOpenChange, open]);

  if (!open || !resolvedPosition || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={contentRef}
      role="menu"
      aria-label={ariaLabel}
      className={cn(
        'fixed z-[140] min-w-60 overflow-hidden rounded-2xl border border-border/70 bg-popover/96 p-1.5 text-popover-foreground shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl',
        className
      )}
      style={{
        left: `${resolvedPosition.x}px`,
        top: `${resolvedPosition.y}px`,
        width: `${MENU_WIDTH}px`,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

function ContextMenuItem({ className, inset = false, onClick, ...props }) {
  return (
    <Button
      type="button"
      variant="ghost"
      role="menuitem"
      className={cn('w-full justify-start rounded-xl px-3 py-2 text-left text-sm', inset && 'pl-8', className)}
      onClick={(event) => {
        onClick?.(event);
      }}
      {...props}
    />
  );
}

function ContextMenuSeparator({ className, ...props }) {
  return <div className={cn('mx-2 my-1 h-px bg-border/70', className)} aria-hidden="true" {...props} />;
}

export { ContextMenuContent, ContextMenuItem, ContextMenuSeparator };
