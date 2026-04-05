import { Tooltip } from 'recharts';
import { cn } from '../../lib/utils';

function ChartContainer({ children, className, config = {}, ...props }) {
  const chartStyle = Object.entries(config).reduce((style, [key, entry]) => {
    if (entry?.color) {
      style[`--color-${key}`] = entry.color;
    }

    return style;
  }, {});

  return (
    <div
      className={cn(
        'chart-shell min-w-0 [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/70 [&_.recharts-layer.recharts-pie-sector]:outline-none [&_.recharts-legend-item-text]:text-muted-foreground [&_.recharts-polar-grid_[stroke="#ccc"]]:stroke-border/60 [&_.recharts-sector:focus-visible]:outline-none',
        className
      )}
      style={chartStyle}
      {...props}
    >
      {children}
    </div>
  );
}

const ChartTooltip = Tooltip;

function ChartTooltipContent({ active, hideLabel = false, label, payload }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  return (
    <div className="min-w-28 rounded-xl border border-border/70 bg-popover/95 px-3 py-2 text-sm text-popover-foreground shadow-[0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
      {hideLabel ? null : <div className="mb-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>}
      <div className="grid gap-1">
        {payload.map((item) => (
          <div key={item.dataKey || item.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color || item.payload?.fill }} />
              {item.name || item.dataKey}
            </span>
            <span className="font-medium text-popover-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
