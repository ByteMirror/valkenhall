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
        'fixed z-[140] min-w-60 overflow-hidden rounded-lg p-1',
        className
      )}
      style={{
        left: `${resolvedPosition.x}px`,
        top: `${resolvedPosition.y}px`,
        width: `${MENU_WIDTH}px`,
        background: 'rgba(12, 10, 8, 0.96)',
        border: '1px solid rgba(180, 140, 60, 0.25)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 20px rgba(180,140,60,0.04)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {children}
    </div>,
    document.body
  );
}

function ContextMenuItem({ className, inset = false, onClick, children, ...props }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'w-full text-left rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
        inset && 'pl-8',
        className
      )}
      style={{
        color: '#A6A09B',
        background: 'transparent',
        border: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(180,140,60,0.1)';
        e.currentTarget.style.color = '#e8d5a0';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = '#A6A09B';
      }}
      onClick={(event) => {
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function ContextMenuSeparator({ className, ...props }) {
  return (
    <div
      className={cn('mx-2 my-1 h-px', className)}
      style={{ background: 'linear-gradient(90deg, transparent, rgba(180,140,60,0.2), transparent)' }}
      aria-hidden="true"
      {...props}
    />
  );
}

export { ContextMenuContent, ContextMenuItem, ContextMenuSeparator };
