import { BarChart, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

export function getInteractiveChartsAvailability({
  envMode = typeof process !== 'undefined' ? process.env.NODE_ENV : undefined,
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  chartPrimitives = [ResponsiveContainer, BarChart, PieChart, XAxis, YAxis],
} = {}) {
  if (envMode === 'test') {
    return {
      enabled: false,
      reason: 'test-environment',
    };
  }

  const normalizedUserAgent = String(userAgent || '').toLowerCase();

  if (
    normalizedUserAgent.includes('jsdom') ||
    normalizedUserAgent.includes('vitest') ||
    normalizedUserAgent.includes('happy-dom')
  ) {
    return {
      enabled: false,
      reason: 'headless-dom-user-agent',
    };
  }

  if (!chartPrimitives.every((component) => typeof component === 'function')) {
    return {
      enabled: false,
      reason: 'chart-primitives-unavailable',
    };
  }

  return {
    enabled: true,
    reason: null,
  };
}

export function shouldRenderInteractiveCharts(options) {
  return getInteractiveChartsAvailability(options).enabled;
}
