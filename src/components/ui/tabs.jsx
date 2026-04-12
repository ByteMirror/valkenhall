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
        'inline-flex items-center rounded-lg p-0.5',
        className
      )}
      style={{
        background: 'rgba(0, 0, 0, 0.35)',
        border: '1px solid rgba(180, 140, 60, 0.12)',
      }}
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
        'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      style={isActive ? {
        background: 'rgba(180, 140, 60, 0.15)',
        color: '#e8d5a0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      } : {
        background: 'transparent',
        color: 'rgba(166, 160, 155, 0.5)',
      }}
      onClick={() => context?.onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  );
}

export { Tabs, TabsList, TabsTrigger };
