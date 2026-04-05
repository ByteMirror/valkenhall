import { describe, expect, it } from 'bun:test';
import { getInteractiveChartsAvailability, shouldRenderInteractiveCharts } from './chartRuntime';

describe('shouldRenderInteractiveCharts', () => {
  it('disables charts in test environments', () => {
    expect(
      shouldRenderInteractiveCharts({
        envMode: 'test',
        reactCreateElement: () => {},
        compatCreateElement: () => {},
      })
    ).toBe(false);
  });

  it('disables charts when Recharts exports are not callable components', () => {
    expect(
      shouldRenderInteractiveCharts({
        envMode: 'development',
        userAgent: 'Mozilla/5.0',
        chartPrimitives: [() => {}, { broken: true }],
      })
    ).toBe(false);
  });

  it('enables charts when Recharts exports are callable even if React identities differ', () => {
    expect(
      shouldRenderInteractiveCharts({
        envMode: 'development',
        userAgent: 'Mozilla/5.0',
        reactCreateElement: () => {},
        compatCreateElement: () => {},
        chartPrimitives: [() => {}, () => {}, () => {}, () => {}, () => {}],
      })
    ).toBe(true);
  });
});

describe('getInteractiveChartsAvailability', () => {
  it('returns a reason for disabled test environments', () => {
    expect(
      getInteractiveChartsAvailability({
        envMode: 'test',
      })
    ).toEqual({
      enabled: false,
      reason: 'test-environment',
    });
  });

  it('returns a reason for headless DOM user agents', () => {
    expect(
      getInteractiveChartsAvailability({
        envMode: 'development',
        userAgent: 'Mozilla/5.0 happy-dom',
      })
    ).toEqual({
      enabled: false,
      reason: 'headless-dom-user-agent',
    });
  });

  it('returns a reason when chart primitives are not callable', () => {
    expect(
      getInteractiveChartsAvailability({
        envMode: 'development',
        userAgent: 'Mozilla/5.0',
        chartPrimitives: [() => {}, { broken: true }],
      })
    ).toEqual({
      enabled: false,
      reason: 'chart-primitives-unavailable',
    });
  });

  it('returns enabled when interactive charts can render', () => {
    expect(
      getInteractiveChartsAvailability({
        envMode: 'development',
        userAgent: 'Mozilla/5.0',
        chartPrimitives: [() => {}, () => {}, () => {}, () => {}, () => {}],
      })
    ).toEqual({
      enabled: true,
      reason: null,
    });
  });
});
