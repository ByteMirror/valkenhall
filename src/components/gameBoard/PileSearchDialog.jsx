import { Component } from 'preact';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG,
  BEVELED_BTN, INPUT_STYLE, FourCorners,
  TAB_ACTIVE, TAB_INACTIVE,
  getViewportScale, onViewportScaleChange,
} from '../../lib/medievalTheme';
import DeckCardTile from '../DeckCardTile';

const TYPES = ['Avatar', 'Minion', 'Magic', 'Aura', 'Artifact', 'Site'];
const ELEMENTS = ['Water', 'Earth', 'Fire', 'Air'];

const TOGGLE_BASE = {
  padding: '4px 10px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  transition: 'all 0.15s ease',
};

function toggleStyle(active) {
  return {
    ...TOGGLE_BASE,
    ...(active ? TAB_ACTIVE : TAB_INACTIVE),
  };
}

/**
 * Pile search dialog used by Spellbook / Atlas / Cemetery hotkeys (X / Z / C).
 * Fixed size, identical layout for all three piles. Renders cards through
 * DeckCardTile so the visual matches the deck builder card grid.
 *
 * Pure presentational. Looks up full sorcery card metadata via the
 * sorceryCards prop because pile cards only carry id / cardId / imageUrl /
 * foiling — DeckCardTile needs the full card object for type filters,
 * elements, etc.
 */
export default class PileSearchDialog extends Component {
  constructor(props) {
    super(props);
    this.state = {
      typeFilters: new Set(),
      elementFilters: new Set(),
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    if (this.unsubScale) this.unsubScale();
  }

  toggleType = (type) => {
    this.setState((s) => {
      const next = new Set(s.typeFilters);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { typeFilters: next };
    });
  };

  clearTypes = () => this.setState({ typeFilters: new Set() });

  toggleElement = (element) => {
    this.setState((s) => {
      const next = new Set(s.elementFilters);
      if (next.has(element)) next.delete(element);
      else next.add(element);
      return { elementFilters: next };
    });
  };

  clearElements = () => this.setState({ elementFilters: new Set() });

  // Build a DeckCardTile-compatible entry from a pile cardInstance.
  // Looks up the full sorcery card by cardId and uses the cardInstance's
  // imageUrl + foiling for the printing.
  buildEntry = (cardInstance, idx) => {
    const fullCard = this.props.sorceryCards?.find((c) => c.unique_id === cardInstance.cardId);
    if (!fullCard) return null;
    const printing = fullCard.printings?.find((p) => p.unique_id === cardInstance.printingId)
      || { image_url: cardInstance.imageUrl, foiling: cardInstance.foiling };
    return {
      card: fullCard,
      printing,
      zone: 'pile',
      entryIndex: idx,
      _instance: cardInstance,
    };
  };

  render() {
    const { pile, query, onQueryChange, onClose, onTakeToHand, onTakeToField } = this.props;
    const { typeFilters, elementFilters, viewScale } = this.state;

    if (!pile) return null;

    // Atlas piles only contain sites, so type filters would all be the same.
    // Show element filters instead. Spellbook and Cemetery use type filters.
    const isAtlas = pile.name === 'Atlas';

    const lowerQuery = query.toLowerCase();
    const entries = pile.cards
      .map((c, i) => this.buildEntry(c, i))
      .filter(Boolean)
      .filter((e) => !lowerQuery || e.card.name.toLowerCase().includes(lowerQuery))
      .filter((e) => isAtlas || typeFilters.size === 0 || typeFilters.has(e.card.type))
      .filter((e) => !isAtlas || elementFilters.size === 0
        || e.card.elements?.some((el) => elementFilters.has(el.name)));

    // Fixed design size in pixels. The `zoom` factor multiplies these
    // so the dialog stays the same percentage of the viewport at any
    // screen size (~68% × ~71% of a 1600×900 reference).
    const DESIGN_WIDTH = 1100;
    const DESIGN_HEIGHT = 640;
    // Safe-area clamp: on viewports too small to contain the design size
    // (after zoom is applied), shrink the panel to fit. zoom multiplies
    // pixel dimensions so we divide by viewScale to compensate.
    const safeMaxWidth = typeof window !== 'undefined'
      ? Math.max(320, (window.innerWidth - 48) / viewScale)
      : DESIGN_WIDTH;
    const safeMaxHeight = typeof window !== 'undefined'
      ? Math.max(240, (window.innerHeight - 48) / viewScale)
      : DESIGN_HEIGHT;

    return (
      <div className="responsive-dialog-overlay" onClick={onClose}>
        <div
          className="responsive-dialog-panel"
          style={{
            background: PANEL_BG,
            border: `1px solid ${GOLD} 0.25)`,
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            maxWidth: safeMaxWidth,
            maxHeight: safeMaxHeight,
            zoom: viewScale,
            isolation: 'isolate',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <FourCorners radius={12} />

          {/* Header — title + count + search + close */}
          <div
            className="flex items-center gap-3 p-4"
            style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}
          >
            <h2 className="text-lg font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>
              {pile.name}
            </h2>
            <span className="text-sm" style={{ color: TEXT_MUTED }}>
              {pile.cards.length} cards
            </span>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="search"
                placeholder="Search cards..."
                value={query}
                onInput={(e) => onQueryChange(e.target.value)}
                className="px-3 py-1.5 text-sm outline-none"
                style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY, width: 220 }}
                autoFocus
              />
              <button
                type="button"
                className="px-3 py-1.5 text-sm cursor-pointer transition-all"
                style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>

          {/* Filter row — element filters for Atlas (sites only),
              type filters for Spellbook / Cemetery */}
          <div
            className="flex items-center gap-1 px-4 py-2"
            style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}
          >
            {isAtlas ? (
              <>
                <span className="text-[10px] uppercase tracking-wider mr-2" style={{ color: TEXT_MUTED }}>
                  Element
                </span>
                <button type="button" style={toggleStyle(elementFilters.size === 0)} onClick={this.clearElements}>
                  All
                </button>
                {ELEMENTS.map((el) => (
                  <button
                    key={el}
                    type="button"
                    style={toggleStyle(elementFilters.has(el))}
                    onClick={() => this.toggleElement(el)}
                  >
                    {el}
                  </button>
                ))}
              </>
            ) : (
              <>
                <span className="text-[10px] uppercase tracking-wider mr-2" style={{ color: TEXT_MUTED }}>
                  Type
                </span>
                <button type="button" style={toggleStyle(typeFilters.size === 0)} onClick={this.clearTypes}>
                  All
                </button>
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    style={toggleStyle(typeFilters.has(t))}
                    onClick={() => this.toggleType(t)}
                  >
                    {t}
                  </button>
                ))}
              </>
            )}
            <span className="ml-auto text-xs" style={{ color: TEXT_MUTED }}>
              Showing {entries.length} of {pile.cards.length}
            </span>
          </div>

          {/* Card grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {entries.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: TEXT_MUTED }}>
                {pile.cards.length === 0
                  ? 'Pile is empty'
                  : 'No cards match the active filters'}
              </div>
            ) : (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
              >
                {entries.map((entry) => (
                  <div key={entry._instance.id} className="flex flex-col">
                    <DeckCardTile
                      entry={entry}
                      isSelected={false}
                      onClick={() => onTakeToHand(entry._instance)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onTakeToField(entry._instance);
                      }}
                    />
                    <div className="mt-1 text-[10px] text-center truncate" style={{ color: TEXT_MUTED }}>
                      Click → hand · Right-click → field
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
