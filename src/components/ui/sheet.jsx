import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { IconClose } from './icons';

const SheetContext = createContext({ open: false, onOpenChange: () => {} });

function Sheet({ open = false, onOpenChange = () => {}, children }) {
  return <SheetContext.Provider value={{ open, onOpenChange }}>{children}</SheetContext.Provider>;
}

function SheetTrigger({ children }) {
  return children;
}

function SheetClose({ children }) {
  return children;
}

function SheetContent({ className, children, hideClose = false, ...props }) {
  const { open, onOpenChange } = useContext(SheetContext);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="sheet-overlay no-print fixed inset-0 z-40 bg-background/40" onClick={() => onOpenChange(false)} />
      <section
        role="dialog"
        aria-modal="true"
        className={cn(
          'sheet-panel no-print fixed z-50 flex flex-col overflow-hidden rounded-[22px] border border-border/70 bg-popover/94 text-popover-foreground shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl outline-none',
          className
        )}
        {...props}
      >
        {!hideClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-8 w-8 rounded-lg text-muted-foreground"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <IconClose />
          </Button>
        ) : null}
        {children}
      </section>
    </>
  );
}

function SheetHeader({ className, ...props }) {
  return <div className={cn('flex items-center justify-between gap-3 px-4 pb-3 pt-4', className)} {...props} />;
}

function SheetTitle({ className, ...props }) {
  return <h2 className={cn('text-sm font-semibold tracking-tight text-popover-foreground', className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger };
