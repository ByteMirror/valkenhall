import { Component } from 'preact';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';
import { buildSorceryDeckMetrics, ELEMENT_FILLS } from '../utils/sorcery/deckMetrics';
import { getInteractiveChartsAvailability } from '../utils/chartRuntime';

function SummaryTile({ eyebrow, value, detail }) {
  return (
    <div className="rounded-[18px] border border-border/70 bg-card/70 p-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
      <div className="mt-2 text-2xl font-semibold text-card-foreground">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function MetricsChartCard({ children, className = '', description, title }) {
  return (
    <Card className={`overflow-hidden border-border/70 bg-card/74 shadow-[0_18px_44px_rgba(0,0,0,0.2)] ${className}`.trim()}>
      <CardHeader className="flex-col items-start gap-1 border-b border-border/50 pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="p-3 pt-3">{children}</CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[52vh] flex-col items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-muted/15 px-6 text-center">
      <h2 className="text-xl font-semibold text-card-foreground">Deck metrics</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Import cards or load a saved deck to see element distribution, cost curves, threshold analysis, and card type breakdowns.
      </p>
    </div>
  );
}

function ThresholdBar({ label, demand, supply, color }) {
  const max = Math.max(demand, supply, 1);
  const demandPct = (demand / max) * 100;
  const supplyPct = (supply / max) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <span className="w-10 text-right text-muted-foreground">Need</span>
          <div className="h-3 flex-1 rounded-full bg-muted/30">
            <div className="h-full rounded-full" style={{ width: `${demandPct}%`, backgroundColor: color, opacity: 0.6 }} />
          </div>
          <span className="w-4 text-right">{demand}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-10 text-right text-muted-foreground">Have</span>
          <div className="h-3 flex-1 rounded-full bg-muted/30">
            <div className="h-full rounded-full" style={{ width: `${supplyPct}%`, backgroundColor: color }} />
          </div>
          <span className="w-4 text-right">{supply}</span>
        </div>
      </div>
    </div>
  );
}

function buildChartConfig(data) {
  return Object.fromEntries(data.map((entry) => [entry.label, { label: entry.label, color: entry.fill }]));
}

class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-64 items-center justify-center rounded-[18px] border border-dashed border-border/60 bg-muted/15 px-4 text-center text-xs text-muted-foreground">
          Chart rendering unavailable in this environment.
        </div>
      );
    }
    return this.props.children;
  }
}

function SimpleBarChart({ data }) {
  return (
    <ChartErrorBoundary>
      <ChartContainer className="h-64" config={buildChartConfig(data)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 6, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" type="category" tickLine={false} axisLine={false} />
            <YAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} width={28} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="value" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </ChartErrorBoundary>
  );
}

export default class SorceryDeckMetricsPanel extends Component {
  render() {
    const { chosenCards } = this.props;
    const metrics = buildSorceryDeckMetrics(chosenCards);
    const chartAvailability = getInteractiveChartsAvailability();
    const chartsEnabled = chartAvailability.enabled;

    if (metrics.totals.spellbookSize === 0 && metrics.totals.atlasSize === 0) {
      return <EmptyState />;
    }

    const statTiles = [
      { eyebrow: 'Spellbook', value: metrics.totals.spellbookSize, detail: '60 minimum' },
      { eyebrow: 'Atlas', value: metrics.totals.atlasSize, detail: '30 minimum' },
      { eyebrow: 'Avg Cost', value: metrics.averages.cost },
    ];

    const { demand, supply } = metrics.thresholds;
    const elementData = metrics.charts.elements;
    const costData = metrics.charts.cost;
    const typesData = metrics.charts.types;
    const rarityData = metrics.charts.rarity;

    return (
      <div className="grid gap-3 metrics-panel">
        <h2 className="sr-only">Deck metrics</h2>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {statTiles.map((tile) => (
            <SummaryTile key={tile.eyebrow} eyebrow={tile.eyebrow} value={tile.value} detail={tile.detail} />
          ))}
        </section>

        <div className="grid gap-3">
          {elementData.length > 0 && (
            <MetricsChartCard title="Element Distribution" description="Spellbook cards by element.">
              {chartsEnabled ? <SimpleBarChart data={elementData} /> : null}
            </MetricsChartCard>
          )}

          {costData.length > 0 && (
            <MetricsChartCard title="Cost Curve" description="Spellbook cards by printed cost.">
              {chartsEnabled ? <SimpleBarChart data={costData} /> : null}
            </MetricsChartCard>
          )}

          <MetricsChartCard title="Threshold Analysis" description="Element thresholds needed by your spellbook vs. supplied by your atlas.">
            <div className="flex flex-col gap-3">
              {Object.entries(ELEMENT_FILLS).map(([element, color]) => (
                <ThresholdBar
                  key={element}
                  label={element}
                  demand={demand[element] || 0}
                  supply={supply[element] || 0}
                  color={color}
                />
              ))}
            </div>
          </MetricsChartCard>

          {typesData.length > 0 && (
            <MetricsChartCard title="Card Types" description="Breakdown of spellbook card types.">
              {chartsEnabled ? <SimpleBarChart data={typesData} /> : null}
            </MetricsChartCard>
          )}

          {rarityData.length > 0 && (
            <MetricsChartCard title="Rarity Distribution" description="Based on the currently selected printing for each card entry.">
              {chartsEnabled ? <SimpleBarChart data={rarityData} /> : null}
            </MetricsChartCard>
          )}
        </div>
      </div>
    );
  }
}
