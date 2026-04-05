import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { cn } from '../../lib/utils';

const TabsContext = createContext(null);

function Tabs({ children, className, onValueChange = () => {}, value, ...props }) {
  return (
    <TabsContext.Provider value={{ onValueChange, value }}>
      <div data-slot="tabs" className={cn('flex', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ children, className, ...props }) {
  return (
    <div
      role="tablist"
      data-slot="tabs-list"
      className={cn(
        'inline-flex items-center rounded-xl border border-border/70 bg-card/80 p-1 text-muted-foreground shadow-[0_12px_28px_rgba(0,0,0,0.12)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function TabsTrigger({ children, className, disabled = false, value, ...props }) {
  const context = useContext(TabsContext);
  const isActive = context?.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-slot="tabs-trigger"
      data-state={isActive ? 'active' : 'inactive'}
      disabled={disabled}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
        isActive ? 'bg-background text-foreground shadow-sm' : 'hover:bg-muted/80 hover:text-foreground',
        className
      )}
      onClick={() => context?.onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  );
}

export { Tabs, TabsList, TabsTrigger };
