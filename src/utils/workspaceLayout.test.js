import { describe, expect, it } from 'bun:test';
import { getDesktopWorkspaceColumns } from './workspaceLayout';

function getSidebarWidth(columns) {
  const match = columns?.match(/minmax\(\d+px,\s*(\d+)px\)\s+minmax\(0,\s*1fr\)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

describe('getDesktopWorkspaceColumns', () => {
  it('does not override the stacked layout below the desktop breakpoint', () => {
    expect(getDesktopWorkspaceColumns(1279)).toBeUndefined();
  });

  it('keeps the sidebar roomier on laptop-sized desktop widths', () => {
    const columns = getDesktopWorkspaceColumns(1440);

    expect(columns).toBe('minmax(420px, 477px) minmax(0, 1fr)');
    expect(getSidebarWidth(columns)).toBeGreaterThan(450);
  });

  it('caps the sidebar on very wide monitors so the deck area gets the extra room', () => {
    const columns = getDesktopWorkspaceColumns(2560);

    expect(columns).toBe('minmax(440px, 698px) minmax(0, 1fr)');
    expect(getSidebarWidth(columns)).toBeLessThan(770);
  });
});
