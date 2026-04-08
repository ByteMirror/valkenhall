import { Component } from 'preact';
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from './ui/context-menu';
import {
  GOLD, GOLD_TEXT, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, PANEL_BORDER, ACCENT_GOLD,
  SECTION_HEADER_STYLE, OrnamentalDivider,
} from '../lib/medievalTheme';
import { Sparkles, Rainbow } from 'lucide-react';
import { playUI, UI } from '../utils/arena/uiSounds';

const ELEMENT_COLORS = {
  Water: '#01FFFF',
  Earth: '#CFA572',
  Fire: '#FF5F00',
  Air: '#A0BADB',
};

function ElementPip({ element }) {
  // Sorcery convention: Water/Earth point DOWN, Fire/Air point UP. The
  // horizontal bar on Earth (downward) and Air (upward) sits in the wide
  // portion of the triangle — near the top for Earth, near the bottom
  // for Air — matching the SorceryElementIcon used in DeckEditorCollection.
  const isUp = element === 'Fire' || element === 'Air';
  const color = ELEMENT_COLORS[element] || '#888';
  const points = isUp ? '5,1 9,9 1,9' : '5,9 1,1 9,1';
  const line = element === 'Earth'
    ? { x1: 2, y1: 4, x2: 8, y2: 4 }
    : element === 'Air'
      ? { x1: 2, y1: 6, x2: 8, y2: 6 }
      : null;

  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <polygon points={points} fill="none" stroke={color} strokeWidth="1.2" />
      {line && <line {...line} stroke={color} strokeWidth="1.2" />}
    </svg>
  );
}

function getThresholdPips(card) {
  const pips = [];
  const thresholds = [
    ['Water', card.waterThreshold],
    ['Earth', card.earthThreshold],
    ['Fire', card.fireThreshold],
    ['Air', card.airThreshold],
  ];
  for (const [element, count] of thresholds) {
    for (let i = 0; i < (count || 0); i++) {
      pips.push({ element, key: `${element}-${i}` });
    }
  }
  return pips;
}

function aggregateAndSort(entries) {
  const map = new Map();
  for (const entry of entries) {
    const foiling = entry.printing?.foiling || 'S';
    const key = `${entry.card.unique_id}::${foiling}`;
    if (map.has(key)) {
      map.get(key).qty += 1;
    } else {
      map.set(key, { card: entry.card, printing: entry.printing, foiling, qty: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const costDiff = (a.card.cost ?? 0) - (b.card.cost ?? 0);
    if (costDiff !== 0) return costDiff;
    const nameCmp = (a.card.name || '').localeCompare(b.card.name || '');
    if (nameCmp !== 0) return nameCmp;
    // Standard before foil before rainbow
    const foilOrder = { S: 0, F: 1, R: 2 };
    return (foilOrder[a.foiling] || 0) - (foilOrder[b.foiling] || 0);
  });
}

function isFoilCode(foiling) {
  return foiling === 'F' || foiling === 'R';
}

function FoilIcon({ foiling }) {
  if (foiling === 'R') {
    return <Rainbow size={11} className="shrink-0" style={{ color: '#c480e0' }} />;
  }
  return <Sparkles size={11} className="shrink-0" style={{ color: ACCENT_GOLD }} />;
}

const ZONES = [
  { key: 'spellbook', label: 'Spellbook' },
  { key: 'atlas', label: 'Atlas' },
  { key: 'collection', label: 'Collection' },
];

export default class DeckEditorSidebar extends Component {
  constructor(props) {
    super(props);
    this.state = {
      collapsed: { spellbook: false, atlas: false, collection: false },
      contextMenu: null,
      dragCardId: null,
      dragCardName: '',
      dragSourceZone: null,
      dragIsSite: false,
      dragOverZone: null,
    };
  }

  toggleSection = (zone) => {
    this.setState((prev) => ({
      collapsed: { ...prev.collapsed, [zone]: !prev.collapsed[zone] },
    }));
  };

  handleRowClick = (uniqueId, foiling) => {
    this.props.onIncrement?.(uniqueId, foiling);
  };

  handleRowContext = (e, uniqueId, foiling, currentZone, isSite) => {
    e.preventDefault();
    this.setState({
      contextMenu: { x: e.clientX, y: e.clientY, cardId: uniqueId, foiling, currentZone, isSite },
    });
  };

  closeContextMenu = () => {
    this.setState({ contextMenu: null });
  };

  handleMoveToZone = (zone) => {
    const { contextMenu } = this.state;
    if (contextMenu) {
      this.props.onChangeZone?.(contextMenu.cardId, zone, contextMenu.foiling);
    }
    this.closeContextMenu();
  };

  handleRemoveFromMenu = () => {
    const { contextMenu } = this.state;
    if (contextMenu) {
      this.props.onDecrement?.(contextMenu.cardId, contextMenu.foiling);
    }
    this.closeContextMenu();
  };

  handleRowHover = (uniqueId, foiling) => {
    this.props.onCardHover?.(uniqueId, foiling);
  };

  canMoveToZone(sourceZone, targetZone, isSite) {
    if (sourceZone === targetZone) return false;
    // Spellbook ↔ Atlas is not allowed
    if (sourceZone === 'spellbook' && targetZone === 'atlas') return false;
    if (sourceZone === 'atlas' && targetZone === 'spellbook') return false;
    // Sites cannot go to spellbook
    if (isSite && targetZone === 'spellbook') return false;
    return true;
  }

  handleDragStart = (e, cardId, sourceZone, isSite, cardName) => {
    playUI(UI.DRAG_START);
    this.setState({ dragCardId: cardId, dragSourceZone: sourceZone, dragIsSite: isSite, dragCardName: cardName });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  };

  handleSectionDragEnter = (targetZone) => {
    const { dragSourceZone, dragIsSite } = this.state;
    if (this.canMoveToZone(dragSourceZone, targetZone, dragIsSite)) {
      this.setState({ dragOverZone: targetZone });
    }
  };

  handleSectionDragLeave = (e, targetZone) => {
    // Only clear if truly leaving the section (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      if (this.state.dragOverZone === targetZone) {
        this.setState({ dragOverZone: null });
      }
    }
  };

  handleDragOver = (e) => {
    const { dragSourceZone, dragIsSite, dragOverZone } = this.state;
    if (dragOverZone && this.canMoveToZone(dragSourceZone, dragOverZone, dragIsSite)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  handleDrop = (e, targetZone) => {
    e.preventDefault();
    const { dragCardId, dragSourceZone, dragIsSite } = this.state;
    if (dragCardId && this.canMoveToZone(dragSourceZone, targetZone, dragIsSite)) {
      this.props.onChangeZone?.(dragCardId, targetZone);
    }
    this.setState({ dragCardId: null, dragSourceZone: null, dragIsSite: false, dragCardName: '', dragOverZone: null });
  };

  handleDragEnd = () => {
    playUI(UI.DRAG_DROP);
    this.setState({ dragCardId: null, dragSourceZone: null, dragIsSite: false, dragCardName: '', dragOverZone: null });
  };

  render() {
    const { chosenCards = [] } = this.props;
    const { collapsed } = this.state;

    const grouped = { spellbook: [], atlas: [], collection: [] };
    for (const entry of chosenCards) {
      let zone = entry.zone;
      if (!zone || !grouped[zone]) {
        const cat = entry.card?._sorceryCategory?.toLowerCase();
        if (cat === 'site' || entry.card?.type === 'Site') zone = 'atlas';
        else if (entry.isSideboard) zone = 'collection';
        else zone = 'spellbook';
      }
      grouped[zone].push(entry);
    }

    const totalCount = chosenCards.length;

    return (
      <div
        className="flex flex-col h-full select-none"
        style={{
          background: PANEL_BG,
          borderLeft: `2px solid ${PANEL_BORDER}`,
        }}
      >
        {/* Header */}
        <div className="px-3 pt-3 pb-1 flex items-baseline justify-between">
          <span
            className="text-sm font-bold tracking-wide uppercase"
            style={{ color: TEXT_PRIMARY }}
          >
            Deck
          </span>
          <span className="text-xs" style={{ color: TEXT_MUTED }}>
            {totalCount} Card{totalCount !== 1 ? 's' : ''}
          </span>
        </div>

        <OrnamentalDivider className="px-3 py-1" />

        {/* Scrollable sections */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2 medieval-scrollbar">
          {ZONES.map(({ key, label }) => {
            const entries = grouped[key];
            const rows = entries.length ? aggregateAndSort(entries) : [];
            const isCollapsed = collapsed[key];

            const isDragOver = this.state.dragOverZone === key;
            const canDrop = this.state.dragCardId && this.canMoveToZone(this.state.dragSourceZone, key, this.state.dragIsSite);

            return (
              <div
                key={key}
                className="mb-1 transition-all duration-150"
                style={{
                  borderRadius: '6px',
                  background: isDragOver ? `${GOLD} 0.06)` : 'transparent',
                  outline: isDragOver ? `1.5px dashed ${GOLD} 0.35)` : 'none',
                  outlineOffset: '-1px',
                }}
                onDragOver={this.handleDragOver}
                onDragEnter={() => this.handleSectionDragEnter(key)}
                onDragLeave={(e) => this.handleSectionDragLeave(e, key)}
                onDrop={(e) => this.handleDrop(e, key)}
              >
                {/* Section header — drop target */}
                <button
                  type="button"
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors duration-150"
                  style={{
                    background: isDragOver ? `${GOLD} 0.1)` : 'none',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                  onClick={() => this.toggleSection(key)}
                >
                  <span
                    className="text-[10px] transition-transform duration-150"
                    style={{
                      color: isDragOver ? `${GOLD} 0.8)` : `${GOLD} 0.45)`,
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      display: 'inline-block',
                    }}
                  >
                    &#9660;
                  </span>
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={isDragOver ? { color: `${GOLD} 0.8)`, textShadow: `0 0 10px ${GOLD} 0.2)` } : SECTION_HEADER_STYLE}
                  >
                    {label}
                  </span>
                  <span
                    className="text-[10px] ml-auto"
                    style={{ color: isDragOver ? `${GOLD} 0.6)` : `${GOLD} 0.35)` }}
                  >
                    ({entries.length})
                  </span>
                </button>

                {/* Card rows */}
                {!isCollapsed && rows.map((row) => {
                  const isSite = row.card?.type === 'Site' || row.card?.played_horizontally;
                  return (
                  <div
                    key={`${row.card.unique_id}::${row.foiling}`}
                    data-sidebar-card-id={row.card.unique_id}
                    data-sidebar-foiling={row.foiling}
                    draggable
                    className="flex items-center gap-1.5 px-2 rounded cursor-grab transition-colors duration-100"
                    style={isFoilCode(row.foiling) ? {
                      height: 32,
                      background: row.foiling === 'R'
                        ? 'linear-gradient(135deg, rgba(217,142,255,0.06) 0%, rgba(255,154,158,0.04) 50%, rgba(109,213,237,0.06) 100%)'
                        : 'linear-gradient(135deg, rgba(109,213,237,0.06) 0%, rgba(109,213,237,0.03) 100%)',
                      border: `1px solid ${row.foiling === 'R' ? 'rgba(217,142,255,0.2)' : 'rgba(109,213,237,0.2)'}`,
                      boxShadow: `inset 0 1px 0 ${row.foiling === 'R' ? 'rgba(217,142,255,0.08)' : 'rgba(109,213,237,0.08)'}, inset 0 -1px 0 rgba(0,0,0,0.15)`,
                      borderRadius: '5px',
                    } : {
                      height: 32,
                      background: 'transparent',
                    }}
                    onClick={() => this.handleRowClick(row.card.unique_id, row.foiling)}
                    onContextMenu={(e) => this.handleRowContext(e, row.card.unique_id, row.foiling, key, isSite)}
                    onDragStart={(e) => this.handleDragStart(e, row.card.unique_id, key, isSite, row.card.name)}
                    onDragEnd={this.handleDragEnd}
                    onMouseEnter={(e) => {
                      playUI(UI.HOVER, { volume: 0.4 });
                      e.currentTarget.style.background = `${GOLD} 0.06)`;
                      this.handleRowHover(row.card.unique_id, row.foiling);
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      this.props.onCardHover?.(null, null);
                    }}
                  >
                    {/* Quantity */}
                    <span
                      className="text-xs font-medium shrink-0"
                      style={{ color: `${GOLD_TEXT} 0.7)`, width: 20, textAlign: 'right' }}
                    >
                      {row.qty}x
                    </span>

                    {/* Card name + foil icon */}
                    <span
                      className="text-xs truncate flex-1 flex items-center gap-1"
                      style={{ color: TEXT_BODY }}
                      title={row.card.name}
                    >
                      {row.card.name}
                      {isFoilCode(row.foiling) && <FoilIcon foiling={row.foiling} />}
                    </span>

                    {/* Element pips */}
                    {getThresholdPips(row.card).length > 0 && (
                      <span className="flex items-center gap-px shrink-0">
                        {getThresholdPips(row.card).map((pip) => (
                          <ElementPip key={pip.key} element={pip.element} />
                        ))}
                      </span>
                    )}

                    {/* Mana cost circle — hidden for cards with no mana cost */}
                    {row.card.cost ? (
                      <span
                        className="shrink-0 flex items-center justify-center rounded-full text-[10px] font-bold"
                        style={{
                          width: 20, height: 20,
                          background: `${GOLD} 0.12)`,
                          border: `1px solid ${GOLD} 0.3)`,
                          color: ACCENT_GOLD,
                        }}
                      >
                        {row.card.cost}
                      </span>
                    ) : null}
                  </div>
                  );
                })}

                {/* Ghost preview row — shows where the dragged card will land */}
                {isDragOver && canDrop && this.state.dragCardName && (
                  <div
                    className="flex items-center gap-1.5 px-2 rounded mx-1"
                    style={{
                      height: 32,
                      background: `${GOLD} 0.08)`,
                      border: `1px dashed ${GOLD} 0.3)`,
                      borderRadius: '4px',
                      marginTop: 2,
                      marginBottom: 2,
                    }}
                  >
                    <span className="text-xs font-medium shrink-0" style={{ color: `${GOLD} 0.5)`, width: 20, textAlign: 'right' }}>
                      +
                    </span>
                    <span className="text-xs truncate flex-1" style={{ color: `${GOLD} 0.6)`, fontStyle: 'italic' }}>
                      {this.state.dragCardName}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Context menu for moving cards between zones */}
        <ContextMenuContent
          ariaLabel="Card zone actions"
          open={!!this.state.contextMenu}
          position={this.state.contextMenu}
          onOpenChange={(open) => { if (!open) this.closeContextMenu(); }}
        >
          {this.state.contextMenu && (() => {
            const { currentZone, isSite } = this.state.contextMenu;
            return (
              <>
                {this.canMoveToZone(currentZone, 'spellbook', isSite) && (
                  <ContextMenuItem onClick={() => this.handleMoveToZone('spellbook')}>
                    Move to Spellbook
                  </ContextMenuItem>
                )}
                {this.canMoveToZone(currentZone, 'atlas', isSite) && (
                  <ContextMenuItem onClick={() => this.handleMoveToZone('atlas')}>
                    Move to Atlas
                  </ContextMenuItem>
                )}
                {this.canMoveToZone(currentZone, 'collection', isSite) && (
                  <ContextMenuItem onClick={() => this.handleMoveToZone('collection')}>
                    Move to Collection
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={this.handleRemoveFromMenu}>
                  Remove from Deck
                </ContextMenuItem>
              </>
            );
          })()}
        </ContextMenuContent>
      </div>
    );
  }
}
