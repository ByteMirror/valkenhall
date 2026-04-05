import { afterEach, describe, expect, it, vi } from 'bun:test';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { Select } from './select';

const options = [
  { value: 'all', label: 'All sets' },
  { value: 'ARC', label: 'Arcane Rising', description: 'Downloaded' },
  { value: 'WTR', label: 'Welcome to Rathe', description: 'Available' },
];

function mockTriggerRect(trigger, rect) {
  trigger.parentElement.getBoundingClientRect = vi.fn(() => rect);
}

describe('Select', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clamps a portal menu within the viewport when a preferred width would overflow', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 720,
    });

    render(
      <Select
        ariaLabel="Archive set filter"
        menuAlign="end"
        menuPreferredWidth={448}
        menuSearchAriaLabel="Search archive sets"
        onValueChange={vi.fn()}
        options={options}
        portalMenu
        searchable
        value="all"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Archive set filter' });
    mockTriggerRect(trigger, {
      top: 80,
      bottom: 120,
      left: 12,
      right: 188,
      width: 176,
      height: 40,
    });

    fireEvent.click(trigger);

    const menu = await screen.findByRole('menu', { name: 'Archive set filter' });

    await waitFor(() => {
      expect(menu.style.left).toBe('16px');
      expect(menu.style.width).toBe('288px');
    });
  });

  it('uses an opaque background for the sticky search header in searchable menus', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 720,
    });

    render(
      <Select
        ariaLabel="Archive set filter"
        menuAlign="end"
        menuPreferredWidth={448}
        menuSearchAriaLabel="Search archive sets"
        onValueChange={vi.fn()}
        options={options}
        portalMenu
        searchable
        value="all"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Archive set filter' });
    mockTriggerRect(trigger, {
      top: 80,
      bottom: 120,
      left: 24,
      right: 200,
      width: 176,
      height: 40,
    });

    fireEvent.click(trigger);

    const search = await screen.findByRole('searchbox', { name: 'Search archive sets' });
    const stickyHeader = search.closest('label')?.parentElement;

    expect(stickyHeader).not.toBeNull();
    expect(stickyHeader).toHaveClass('sticky');
    expect(stickyHeader).toHaveClass('bg-popover');
    expect(stickyHeader).not.toHaveClass('bg-popover/96');
  });
});
