import { afterEach, describe, expect, it, mock, vi } from 'bun:test';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/preact';

mock.module('../utils/imageQuality', () => ({
  assessPrintQuality: vi.fn(() => ({
    label: 'Optimal',
    dpiX: 300,
    dpiY: 300,
  })),
  rankPrintingsByResolution: vi.fn(async (card) =>
    (card.printings || []).map((printing, index) => ({
      printing,
      width: 1200 - index * 10,
      height: 1680 - index * 10,
      pixels: (1200 - index * 10) * (1680 - index * 10),
    }))
  ),
  rankPrintingsByResolutionStatic: vi.fn((card) =>
    (card.printings || []).map((printing, index) => ({
      printing,
      width: 1200 - index * 10,
      height: 1680 - index * 10,
      pixels: (1200 - index * 10) * (1680 - index * 10),
    }))
  ),
}));

const { default: CardResult } = await import('./CardResult.jsx');
const { assessPrintQuality, rankPrintingsByResolution, rankPrintingsByResolutionStatic } = await import('../utils/imageQuality');

const basePrinting = {
  unique_id: 'base',
  image_url: 'https://example.com/base.png',
  image_rotation_degrees: 0,
  art_variations: [],
  rarity: 'M',
};

const extendedArtPrinting = {
  unique_id: 'ea',
  image_url: 'https://example.com/ea.png',
  image_rotation_degrees: 0,
  art_variations: ['EA'],
  rarity: 'M',
};

const fullArtPrinting = {
  unique_id: 'fa',
  image_url: 'https://example.com/fa.png',
  image_rotation_degrees: 0,
  art_variations: ['FA'],
  rarity: 'M',
};

const marvelPrinting = {
  unique_id: 'marvel',
  image_url: 'https://example.com/marvel.png',
  image_rotation_degrees: 0,
  art_variations: [],
  rarity: 'V',
};

const alternateTextPrinting = {
  unique_id: 'at',
  image_url: 'https://example.com/at.png',
  image_rotation_degrees: 0,
  art_variations: ['AT'],
  rarity: 'M',
};

const alternateBorderPrinting = {
  unique_id: 'ab',
  image_url: 'https://example.com/ab.png',
  image_rotation_degrees: 0,
  art_variations: ['AB'],
  rarity: 'M',
};

const specialVariantCard = {
  unique_id: 'card-1',
  name: 'Variant Test Card',
  played_horizontally: false,
  printings: [
    basePrinting,
    extendedArtPrinting,
    fullArtPrinting,
    marvelPrinting,
    alternateTextPrinting,
    alternateBorderPrinting,
  ],
};

describe('CardResult special variant shortcuts', () => {
  afterEach(() => {
    assessPrintQuality.mockImplementation(() => ({
      label: 'Optimal',
      dpiX: 300,
      dpiY: 300,
    }));
    rankPrintingsByResolution.mockImplementation(async (card) =>
      (card.printings || []).map((printing, index) => ({
        printing,
        width: 1200 - index * 10,
        height: 1680 - index * 10,
        pixels: (1200 - index * 10) * (1680 - index * 10),
      }))
    );
    rankPrintingsByResolutionStatic.mockImplementation((card) =>
      (card.printings || []).map((printing, index) => ({
        printing,
        width: 1200 - index * 10,
        height: 1680 - index * 10,
        pixels: (1200 - index * 10) * (1680 - index * 10),
      }))
    );
  });

  it('renders quick-switch buttons only for EA, FA, and Marvel printings and switches locally', async () => {
    render(<CardResult card={specialVariantCard} printing={basePrinting} addCardToChosenCards={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByAltText('Variant Test Card')).toHaveAttribute('src', basePrinting.image_url);
    });

    expect(screen.getByRole('button', { name: 'EA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'V' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AT' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AB' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'V' }));

    await waitFor(() => {
      expect(screen.getByAltText('Variant Test Card')).toHaveAttribute('src', marvelPrinting.image_url);
    });

    fireEvent.click(screen.getByRole('button', { name: 'EA' }));

    await waitFor(() => {
      expect(screen.getByAltText('Variant Test Card')).toHaveAttribute('src', extendedArtPrinting.image_url);
    });
  });

  it('shows descriptive hover tooltips for the variant shortcut abbreviations', async () => {
    render(<CardResult card={specialVariantCard} printing={basePrinting} addCardToChosenCards={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'EA' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'EA' })).toHaveAttribute('title', 'Extended Art');
    expect(screen.getByRole('button', { name: 'FA' })).toHaveAttribute('title', 'Full Art');
    expect(screen.getByRole('button', { name: 'V' })).toHaveAttribute('title', 'Marvel');
  });

  it('uses the parent printing change handler for chosen cards', async () => {
    const changeCardPrintingFromChosenCards = vi.fn();

    render(
      <CardResult
        card={specialVariantCard}
        printing={basePrinting}
        chosenList={true}
        entryIndex={4}
        changeCardPrintingFromChosenCards={changeCardPrintingFromChosenCards}
        removeCardFromChosenCards={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'FA' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'FA' }));

    expect(changeCardPrintingFromChosenCards).toHaveBeenCalledWith(4, fullArtPrinting);
  });

  it('renders the forced printing immediately while resolution ranking is still loading', () => {
    let resolveRanking;
    rankPrintingsByResolution.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRanking = resolve;
        })
    );
    const uncachedCard = {
      ...specialVariantCard,
      unique_id: 'card-immediate-render',
    };

    render(
      <CardResult
        card={uncachedCard}
        printing={fullArtPrinting}
        chosenList={true}
        entryIndex={2}
        changeCardPrintingFromChosenCards={vi.fn()}
        removeCardFromChosenCards={vi.fn()}
      />
    );

    expect(screen.getByAltText('Variant Test Card')).toHaveAttribute('src', fullArtPrinting.image_url);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

    resolveRanking?.(
      (uncachedCard.printings || []).map((printing, index) => ({
        printing,
        width: 1200 - index * 10,
        height: 1680 - index * 10,
        pixels: (1200 - index * 10) * (1680 - index * 10),
      }))
    );
  });

  it('opens a quality actions menu from the badge and exposes upscale or revert based on the chosen printing state', async () => {
    rankPrintingsByResolution.mockImplementation(async (card) =>
      (card.printings || []).map((printing, index) => ({
        printing,
        width: 400 - index * 10,
        height: 560 - index * 10,
        pixels: (400 - index * 10) * (560 - index * 10),
      }))
    );
    rankPrintingsByResolutionStatic.mockImplementation((card) =>
      (card.printings || []).map((printing, index) => ({
        printing,
        width: 400 - index * 10,
        height: 560 - index * 10,
        pixels: (400 - index * 10) * (560 - index * 10),
      }))
    );
    assessPrintQuality.mockImplementation((width) => ({
      label: width >= 1000 ? 'Optimal' : 'Fair',
      dpiX: width >= 1000 ? 300 : 160,
      dpiY: width >= 1000 ? 300 : 160,
    }));

    const upscaleChosenCardAtIndex = vi.fn();
    const revertChosenCardAtIndex = vi.fn();
    const { rerender } = render(
      <CardResult
        card={specialVariantCard}
        printing={basePrinting}
        chosenList={true}
        entryIndex={3}
        changeCardPrintingFromChosenCards={vi.fn()}
        removeCardFromChosenCards={vi.fn()}
        upscaleChosenCardAtIndex={upscaleChosenCardAtIndex}
        revertChosenCardAtIndex={revertChosenCardAtIndex}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open quality actions (Fair quality)' })).toBeInTheDocument();
      expect(screen.getByText('Fair')).toBeInTheDocument();
      expect(screen.queryByText(/DPI/i)).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open quality actions (Fair quality)' }));

    const fairMenu = await screen.findByRole('menu', { name: 'Quality actions' });
    expect(within(fairMenu).getByText('Fair quality')).toBeInTheDocument();

    fireEvent.click(within(fairMenu).getByRole('menuitem', { name: 'Upscale current printing' }));

    expect(upscaleChosenCardAtIndex).toHaveBeenCalledWith(3);

    rerender(
      <CardResult
        card={{
          ...specialVariantCard,
          printings: [
            {
              ...basePrinting,
              unique_id: 'base-upscaled',
              _upscaled: true,
              _source_printing_id: basePrinting.unique_id,
              _source_printing: basePrinting,
            },
          ],
        }}
        printing={{
          ...basePrinting,
          unique_id: 'base-upscaled',
          _upscaled: true,
          _source_printing_id: basePrinting.unique_id,
          _source_printing: basePrinting,
        }}
        chosenList={true}
        entryIndex={3}
        changeCardPrintingFromChosenCards={vi.fn()}
        removeCardFromChosenCards={vi.fn()}
        upscaleChosenCardAtIndex={upscaleChosenCardAtIndex}
        revertChosenCardAtIndex={revertChosenCardAtIndex}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Open quality actions/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Open quality actions/ }));

    const optimalMenu = await screen.findByRole('menu', { name: 'Quality actions' });
    expect(within(optimalMenu).getByText('Upscaled printing')).toBeInTheDocument();

    fireEvent.click(within(optimalMenu).getByRole('menuitem', { name: 'Revert current printing' }));

    expect(revertChosenCardAtIndex).toHaveBeenCalledWith(3);
  });

  it('shows a passive quality actions menu when the selected printing is already optimal and no contextual action is available', async () => {
    render(
      <CardResult
        card={specialVariantCard}
        printing={basePrinting}
        chosenList={true}
        entryIndex={1}
        changeCardPrintingFromChosenCards={vi.fn()}
        removeCardFromChosenCards={vi.fn()}
        upscaleChosenCardAtIndex={vi.fn()}
        revertChosenCardAtIndex={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Optimal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open quality actions (Optimal quality)' }));

    const menu = await screen.findByRole('menu', { name: 'Quality actions' });
    expect(within(menu).getByText('Optimal quality')).toBeInTheDocument();
    expect(within(menu).getByText('Use this printing as the new local default for matching deck copies.')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Sharpen current printing' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Revert current printing' })).not.toBeInTheDocument();
    expect(screen.queryByText(/DPI/i)).not.toBeInTheDocument();
  });

  it('replaces arrow navigation with a printing picker menu that shows previews, labels, and resolutions', async () => {
    const removeCardFromChosenCards = vi.fn();

    render(
      <CardResult
        card={specialVariantCard}
        printing={basePrinting}
        chosenList={true}
        entryIndex={2}
        changeCardPrintingFromChosenCards={vi.fn()}
        removeCardFromChosenCards={removeCardFromChosenCards}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove card' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Previous printing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next printing' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Printing 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Printing 1' }));

    const menu = await screen.findByRole('menu', { name: 'Printing options' });
    const standardOption = within(menu).getByRole('menuitemradio', { name: /Standard/i });
    const extendedArtOption = within(menu).getByRole('menuitemradio', { name: /Extended Art/i });
    const fullArtOption = within(menu).getByRole('menuitemradio', { name: /Full Art/i });
    const marvelOption = within(menu).getByRole('menuitemradio', { name: /Marvel/i });

    expect(standardOption).toBeInTheDocument();
    expect(extendedArtOption).toBeInTheDocument();
    expect(fullArtOption).toBeInTheDocument();
    expect(marvelOption).toBeInTheDocument();
    expect(within(menu).getAllByRole('img')).toHaveLength(6);
    expect(within(menu).getAllByText('Optimal').length).toBeGreaterThan(0);
    expect(within(menu).getAllByText('Optimal')[0].parentElement).toHaveClass('absolute');
    expect(within(menu).getAllByText('Optimal')[0].parentElement).toHaveClass('bg-card');
    expect(within(menu).getAllByText('Optimal')[0].parentElement).toHaveClass('rounded-md');
    expect(within(menu).queryByText('1200×1680px')).not.toBeInTheDocument();
    expect(within(menu).queryByText('1190×1670px')).not.toBeInTheDocument();
  });

  it('keeps only one printing menu open at a time across cards', async () => {
    const secondCard = {
      ...specialVariantCard,
      unique_id: 'card-2',
      name: 'Second Variant Card',
      printings: [
        {
          ...basePrinting,
          unique_id: 'base-2',
          image_url: 'https://example.com/base-2.png',
        },
        {
          ...extendedArtPrinting,
          unique_id: 'ea-2',
          image_url: 'https://example.com/ea-2.png',
        },
      ],
    };

    render(
      <div>
        <CardResult
          card={specialVariantCard}
          printing={basePrinting}
          chosenList={true}
          entryIndex={0}
          changeCardPrintingFromChosenCards={vi.fn()}
          removeCardFromChosenCards={vi.fn()}
        />
        <CardResult
          card={secondCard}
          printing={secondCard.printings[0]}
          chosenList={true}
          entryIndex={1}
          changeCardPrintingFromChosenCards={vi.fn()}
          removeCardFromChosenCards={vi.fn()}
        />
      </div>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Printing 1' })).toHaveLength(2);
    });

    const [firstTrigger, secondTrigger] = screen.getAllByRole('button', { name: 'Printing 1' });

    fireEvent.click(firstTrigger);

    await waitFor(() => {
      expect(screen.getByRole('menu', { name: 'Printing options' })).toBeInTheDocument();
    });

    fireEvent.click(secondTrigger);

    await waitFor(() => {
      expect(screen.getByRole('menu', { name: 'Printing options' })).toBeInTheDocument();
    });

    expect(screen.getAllByRole('menu', { name: 'Printing options' })).toHaveLength(1);
    expect(screen.getByAltText('Second Variant Card printing 1')).toBeInTheDocument();
    expect(screen.queryByAltText('Variant Test Card printing 2')).not.toBeInTheDocument();
  });

  it('closes the printing menu when clicking outside the dropdown', async () => {
    render(
      <div>
        <button type="button">Outside target</button>
        <CardResult
          card={specialVariantCard}
          printing={basePrinting}
          chosenList={true}
          entryIndex={0}
          changeCardPrintingFromChosenCards={vi.fn()}
          removeCardFromChosenCards={vi.fn()}
        />
      </div>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Printing 1' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Printing 1' }));

    await waitFor(() => {
      expect(screen.getByRole('menu', { name: 'Printing options' })).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside target' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Printing options' })).not.toBeInTheDocument();
    });
  });

  it('renders the printing menu in a portal so it is not clipped by card container overflow', async () => {
    const { container } = render(
      <div className="overflow-hidden">
        <CardResult
          card={specialVariantCard}
          printing={basePrinting}
          chosenList={true}
          entryIndex={0}
          changeCardPrintingFromChosenCards={vi.fn()}
          removeCardFromChosenCards={vi.fn()}
        />
      </div>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Printing 1' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Printing 1' }));

    const menu = await screen.findByRole('menu', { name: 'Printing options' });
    const cardRoot = container.querySelector('.card-card');

    expect(menu).toBeInTheDocument();
    expect(menu).toHaveClass('fixed');
    expect(cardRoot).not.toContainElement(menu);
  });

  it('keeps the printing menu at a fixed six-card-sized height even when fewer printings exist', async () => {
    const compactCard = {
      ...specialVariantCard,
      unique_id: 'compact-card',
      printings: [basePrinting, extendedArtPrinting, fullArtPrinting],
    };

    render(
      <CardResult
        card={compactCard}
        printing={basePrinting}
        chosenList={true}
        entryIndex={0}
        changeCardPrintingFromChosenCards={vi.fn()}
        removeCardFromChosenCards={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Printing 1' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Printing 1' }));

    const menu = await screen.findByRole('menu', { name: 'Printing options' });
    const grid = menu.firstElementChild;

    expect(grid).toHaveClass('min-h-[26rem]');
    expect(grid).toHaveClass('max-h-[26rem]');
  });

  it('opens the printing menu downward when the trigger is near the top of the viewport', async () => {
    render(
      <CardResult
        card={specialVariantCard}
        printing={basePrinting}
        chosenList={true}
        entryIndex={0}
        changeCardPrintingFromChosenCards={vi.fn()}
        removeCardFromChosenCards={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Printing 1' })).toBeInTheDocument();
    });

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    });

    const trigger = screen.getByRole('button', { name: 'Printing 1' });
    trigger.parentElement.getBoundingClientRect = vi.fn(() => ({
      top: 48,
      bottom: 88,
      right: 640,
      left: 320,
      width: 320,
      height: 40,
    }));

    fireEvent.click(trigger);

    const menu = await screen.findByRole('menu', { name: 'Printing options' });

    expect(menu.style.top).toBe('100px');
    expect(menu.style.bottom).toBe('');
  });

  it('keeps the printing menu tall by shifting it into the viewport when space around the trigger is tight', async () => {
    render(
      <CardResult
        card={specialVariantCard}
        printing={basePrinting}
        chosenList={true}
        entryIndex={0}
        changeCardPrintingFromChosenCards={vi.fn()}
        removeCardFromChosenCards={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Printing 1' })).toBeInTheDocument();
    });

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 900,
    });

    const trigger = screen.getByRole('button', { name: 'Printing 1' });
    trigger.parentElement.getBoundingClientRect = vi.fn(() => ({
      top: 132,
      bottom: 172,
      right: 640,
      left: 320,
      width: 320,
      height: 40,
    }));

    fireEvent.click(trigger);

    const menu = await screen.findByRole('menu', { name: 'Printing options' });
    const grid = menu.firstElementChild;

    expect(menu.style.top).toBe('24px');
    expect(menu.style.bottom).toBe('');
    expect(grid.style.height).toBe('312px');
  });
});
