import { render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';

const barPropsLog = [];
const barChartPropsLog = [];
const piePropsLog = [];

mock.module('recharts', () => {
  const { createElement, Fragment } = require('preact');

  function passthrough(tag) {
    return function Component(props) {
      return createElement(tag, props, props.children);
    };
  }

  return {
    ResponsiveContainer: passthrough('responsive-container'),
    BarChart(props) {
      barChartPropsLog.push(props);
      return createElement('bar-chart', props, props.children);
    },
    PieChart: passthrough('pie-chart'),
    CartesianGrid: passthrough('cartesian-grid'),
    XAxis: passthrough('x-axis'),
    YAxis: passthrough('y-axis'),
    Tooltip: passthrough('chart-tooltip'),
    Cell: passthrough('chart-cell'),
    Bar(props) {
      barPropsLog.push(props);
      return createElement('chart-bar', props, props.children);
    },
    Pie(props) {
      piePropsLog.push(props);
      return createElement('chart-pie', props, props.children);
    },
    Fragment,
  };
});

mock.module('../utils/chartRuntime', () => ({
  getInteractiveChartsAvailability: vi.fn(() => ({ enabled: true, reason: null })),
  shouldRenderInteractiveCharts: vi.fn(() => true),
}));

const { default: DeckMetricsPanel } = await import('./DeckMetricsPanel.jsx');

const chosenCards = [
  {
    card: {
      unique_id: 'card-1',
      name: 'Command and Conquer',
      pitch: '1',
      cost: '2',
      power: '6',
      defense: '3',
      types: ['Generic', 'Attack Action'],
      functional_text_plain: 'Go again',
    },
    printing: {
      unique_id: 'printing-1',
      rarity: 'M',
    },
  },
  {
    card: {
      unique_id: 'card-2',
      name: 'Sink Below',
      pitch: '3',
      cost: '0',
      power: '0',
      defense: '4',
      types: ['Generic', 'Defense Reaction'],
      functional_text_plain: '',
    },
    printing: {
      unique_id: 'printing-2',
      rarity: 'C',
    },
  },
];

describe('DeckMetricsPanel chart props', () => {
  beforeEach(() => {
    barPropsLog.length = 0;
    barChartPropsLog.length = 0;
    piePropsLog.length = 0;
  });

  it('passes plain chart data to Recharts instead of Cell vnode children', () => {
    render(<DeckMetricsPanel activeMetricFilter={{ kind: 'type', label: 'Attack' }} chosenCards={chosenCards} />);

    expect(screen.getByRole('heading', { name: 'Deck metrics' })).toBeInTheDocument();
    expect(barPropsLog.length).toBeGreaterThan(0);
    expect(barChartPropsLog.length).toBeGreaterThan(0);
    expect(piePropsLog.length).toBeGreaterThan(0);

    for (const props of barPropsLog) {
      expect(props.children).toBeUndefined();
    }

    const typeBarChart = barChartPropsLog.find((props) => Array.isArray(props.data) && props.data.some((entry) => entry.label === 'Attack'));
    expect(typeBarChart).toBeDefined();
    expect(typeBarChart.data.every((entry) => typeof entry.fill === 'string')).toBe(true);
    expect(typeBarChart.data.find((entry) => entry.label === 'Attack').fillOpacity).toBe(1);
    expect(typeBarChart.data.find((entry) => entry.label === 'Action').fillOpacity).toBe(0.38);

    const pie = piePropsLog[0];
    expect(pie.children).toBeUndefined();
    expect(Array.isArray(pie.data)).toBe(true);
    expect(pie.data.every((entry) => typeof entry.fill === 'string')).toBe(true);
  });

  it('wires rarity pie slices into the shared metric filter flow', () => {
    const onBarSelect = vi.fn();

    render(<DeckMetricsPanel activeMetricFilter={{ kind: 'rarity', label: 'Common' }} chosenCards={chosenCards} onBarSelect={onBarSelect} />);

    expect(screen.getByRole('button', { name: 'Apply metric filter rarity Common' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply metric filter rarity Majestic' })).toBeInTheDocument();

    const pie = piePropsLog[0];
    expect(typeof pie.onClick).toBe('function');
    expect(pie.data.find((entry) => entry.label === 'Common').fillOpacity).toBe(1);
    expect(pie.data.find((entry) => entry.label === 'Majestic').fillOpacity).toBe(0.38);

    pie.onClick({ payload: { label: 'Majestic' } }, 0, new MouseEvent('click'));

    expect(onBarSelect).toHaveBeenCalledWith({ kind: 'rarity', label: 'Majestic' });
  });
});
