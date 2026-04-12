import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  POPOVER_STYLE, SECTION_HEADER_STYLE,
} from '../../lib/medievalTheme';
import { DICE_CONFIGS } from '../../utils/game/diceMesh';
import { STATUS_EFFECTS } from '../../utils/game/cardMesh';

const menuCls = 'flex w-full items-center rounded-lg px-3 py-1.5 cursor-pointer transition-colors';
const menuHover = (e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; };
const menuLeave = (e) => { e.currentTarget.style.background = 'transparent'; };

// Measures the menu after mount and flips it upward/leftward if it
// would overflow the viewport. Returns a ref to attach to the menu div
// and an adjusted style object.
function useAutoPosition(baseStyle, scale = 1) {
  const ref = useRef(null);
  const [adjusted, setAdjusted] = useState(baseStyle);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const style = { ...baseStyle };

    // Flip upward if menu extends below viewport
    if (rect.bottom > vh - 8) {
      style.top = (baseStyle.top * scale - rect.height) / scale;
    }
    // Flip leftward if menu extends past right edge
    if (rect.right > vw - 8) {
      style.left = (baseStyle.left * scale - rect.width) / scale;
    }
    setAdjusted(style);
  }, [baseStyle.left, baseStyle.top]);

  return { ref, style: adjusted };
}

function Divider() {
  return <div className="mx-2 my-1 h-px" style={{ background: `${GOLD} 0.1)` }} />;
}

function MenuButton({ onClick, color = TEXT_BODY, children }) {
  return (
    <button
      type="button"
      className={menuCls}
      style={{ color }}
      onMouseEnter={menuHover}
      onMouseLeave={menuLeave}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Sandbox-mode context menu. No combat / move / attack / level / artifact
 * options — players manipulate cards manually. Renders one of:
 *   - card menu (tap, flip, send to hand, send to pile, delete)
 *   - pile menu (draw, shuffle, search, draw to hand)
 *   - hand card menu (put back into spellbook / atlas / cemetery)
 *   - token menu (delete)
 *   - dice menu (roll, set value, delete)
 */
export default function GameContextMenu({ contextMenu, actions, viewScale = 1 }) {
  if (!contextMenu) return null;

  const scale = viewScale || 1;
  const baseStyle = {
    position: 'fixed',
    left: contextMenu.x / scale,
    top: contextMenu.y / scale,
    zIndex: 100,
    zoom: scale,
  };

  const { ref, style: menuStyle } = useAutoPosition(baseStyle, scale);

  if (contextMenu.type === 'card') {
    return (
      <CardMenu
        menuRef={ref}
        menuStyle={menuStyle}
        cardInstance={contextMenu.cardInstance}
        mesh={contextMenu.mesh}
        actions={actions}
        selectionSize={contextMenu.selectionSize || 0}
        groupId={contextMenu.groupId || null}
        selectionAlreadyGrouped={!!contextMenu.selectionAlreadyGrouped}
      />
    );
  }
  if (contextMenu.type === 'pile') {
    return <PileMenu menuRef={ref} menuStyle={menuStyle} pile={contextMenu.pile} actions={actions} />;
  }
  if (contextMenu.type === 'handcard') {
    return <HandCardMenu contextMenu={contextMenu} actions={actions} viewScale={viewScale} />;
  }
  if (contextMenu.type === 'token') {
    return <TokenMenu menuRef={ref} menuStyle={menuStyle} tokenInstance={contextMenu.tokenInstance} actions={actions} />;
  }
  if (contextMenu.type === 'dice') {
    return <DiceMenu menuRef={ref} menuStyle={menuStyle} diceInstance={contextMenu.diceInstance} actions={actions} />;
  }
  return null;
}

function StatusFlyout({ cardInstance, actions, parentRef }) {
  const activeStatuses = cardInstance.statuses || [];
  const flyoutRef = useRef(null);
  const [side, setSide] = useState('right');

  // On mount, measure the parent trigger and decide which side has room.
  useEffect(() => {
    const parent = parentRef?.current;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const flyoutWidth = 180;
    const spaceRight = window.innerWidth - rect.right;
    setSide(spaceRight >= flyoutWidth + 8 ? 'right' : 'left');
  }, []);

  const posStyle = side === 'right'
    ? { left: '100%', top: 0, marginLeft: 4 }
    : { right: '100%', top: 0, marginRight: 4 };

  return (
    <div
      ref={flyoutRef}
      className="absolute z-10 min-w-[170px] max-h-[320px] overflow-y-auto p-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ ...POPOVER_STYLE, ...posStyle }}
    >
      {STATUS_EFFECTS.map((effect) => {
        const isActive = activeStatuses.includes(effect.key);
        return (
          <button
            key={effect.key}
            type="button"
            className={menuCls}
            style={{ color: TEXT_BODY }}
            onMouseEnter={menuHover}
            onMouseLeave={menuLeave}
            onClick={(e) => {
              e.stopPropagation();
              actions.toggleCardStatus(cardInstance, effect.key);
            }}
          >
            <span
              className="mr-2 inline-block size-3 rounded-full shrink-0"
              style={{
                background: isActive ? effect.color : 'transparent',
                border: `2px solid ${effect.color}`,
              }}
            />
            <span className={isActive ? 'font-semibold' : ''}>{effect.label}</span>
          </button>
        );
      })}
      {activeStatuses.length > 0 && (
        <>
          <Divider />
          <button
            type="button"
            className={menuCls}
            style={{ color: '#c45050' }}
            onMouseEnter={menuHover}
            onMouseLeave={menuLeave}
            onClick={(e) => {
              e.stopPropagation();
              actions.clearAllStatuses(cardInstance);
            }}
          >
            Clear All
          </button>
        </>
      )}
    </div>
  );
}

function CardMenu({ menuRef, menuStyle, cardInstance, mesh, actions, selectionSize, groupId, selectionAlreadyGrouped }) {
  const [showStatuses, setShowStatuses] = useState(false);
  const statusTriggerRef = useRef(null);
  const activeCount = (cardInstance.statuses || []).length;

  const canGroup = !selectionAlreadyGrouped && (
    selectionSize >= 2 || (selectionSize >= 1 && !groupId)
  );
  const canUngroup = !!groupId;

  return (
    <div ref={menuRef} style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-visible p-1 text-sm">
      <div className="px-3 py-1.5 text-xs font-semibold truncate" style={{ color: TEXT_PRIMARY }}>{cardInstance.name}</div>

      <MenuButton onClick={() => actions.tapCard(cardInstance, mesh)}>
        {cardInstance.tapped ? 'Untap' : 'Tap'}
      </MenuButton>
      <MenuButton onClick={() => actions.flipCard(cardInstance, mesh)}>
        Flip {cardInstance.faceDown ? '(face up)' : '(face down)'}
      </MenuButton>
      <MenuButton onClick={() => actions.sendToHand(cardInstance)}>
        Send to hand
      </MenuButton>

      <Divider />
      <div
        ref={statusTriggerRef}
        className="relative"
        onMouseEnter={() => setShowStatuses(true)}
        onMouseLeave={() => setShowStatuses(false)}
      >
        <button
          type="button"
          className={menuCls}
          style={{ color: TEXT_BODY }}
          onMouseEnter={menuHover}
          onMouseLeave={menuLeave}
          onClick={(e) => { e.stopPropagation(); setShowStatuses(!showStatuses); }}
        >
          Status Effects
          {activeCount > 0 && (
            <span
              className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${GOLD} 0.25)`, color: TEXT_PRIMARY }}
            >
              {activeCount}
            </span>
          )}
          <span className="ml-1 text-[10px]" style={{ color: TEXT_MUTED }}>▶</span>
        </button>
        {showStatuses && <StatusFlyout cardInstance={cardInstance} actions={actions} parentRef={statusTriggerRef} />}
      </div>

      {(canGroup || canUngroup) && <Divider />}
      {canGroup && (
        <MenuButton onClick={() => actions.groupSelected(cardInstance)}>
          Group {selectionSize >= 2 ? `${selectionSize} selected` : 'with selection'}
        </MenuButton>
      )}
      {canUngroup && (
        <MenuButton onClick={() => actions.ungroup(cardInstance)}>
          Ungroup
        </MenuButton>
      )}

      <Divider />
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Cemetery')}>
        Send to Cemetery
      </MenuButton>
      {cardInstance.isSite && cardInstance.cardId !== 'sorcery-rubble' && (
        <MenuButton onClick={() => actions.turnToRubble(cardInstance)}>
          Turn to Rubble
        </MenuButton>
      )}
      <Divider />
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Put into pile</div>
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Spellbook', true)}>Spellbook (shuffle)</MenuButton>
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Spellbook', false)}>Spellbook (bottom)</MenuButton>
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Atlas', true)}>Atlas (shuffle)</MenuButton>
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Atlas', false)}>Atlas (bottom)</MenuButton>

      <Divider />
      <MenuButton color="#c45050" onClick={() => actions.deleteCard(cardInstance)}>
        Delete
      </MenuButton>
    </div>
  );
}

function PileMenu({ menuRef, menuStyle, pile, actions }) {
  return (
    <div ref={menuRef} style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
      <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>
        {pile.name} ({pile.cards.length} cards)
      </div>
      <MenuButton onClick={() => actions.drawCard(pile.id)}>Draw card</MenuButton>
      <MenuButton onClick={() => actions.shufflePile(pile)}>Shuffle</MenuButton>
      <MenuButton onClick={() => actions.openPileSearch(pile)}>Search</MenuButton>
      <Divider />
      <MenuButton onClick={() => actions.drawPileToHand(pile)}>Draw to hand</MenuButton>
    </div>
  );
}

function HandCardMenu({ contextMenu, actions, viewScale = 1 }) {
  const { cardInstance } = contextMenu;
  // Same zoom compensation as GameContextMenu — divide the page-level
  // coordinates by the scale so the zoomed menu lands at the cursor.
  const scale = viewScale || 1;
  const handMenuStyle = {
    position: 'fixed',
    left: contextMenu.x / scale,
    bottom: (window.innerHeight - contextMenu.y) / scale,
    zIndex: 1100,
    zoom: scale,
  };

  return (
    <div style={{ ...handMenuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
      <div className="px-3 py-1.5 text-xs font-semibold truncate" style={{ color: TEXT_PRIMARY }}>{cardInstance.name}</div>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Put into pile</div>
      <MenuButton onClick={() => actions.sendHandCardToPile(cardInstance, 'Spellbook', true)}>Spellbook (shuffle)</MenuButton>
      <MenuButton onClick={() => actions.sendHandCardToPile(cardInstance, 'Spellbook', false)}>Spellbook (bottom)</MenuButton>
      <MenuButton onClick={() => actions.sendHandCardToPile(cardInstance, 'Atlas', true)}>Atlas (shuffle)</MenuButton>
      <MenuButton onClick={() => actions.sendHandCardToPile(cardInstance, 'Atlas', false)}>Atlas (bottom)</MenuButton>
      <MenuButton onClick={() => actions.sendHandCardToPile(cardInstance, 'Cemetery', false)}>Send to Cemetery</MenuButton>
    </div>
  );
}

function TokenMenu({ menuRef, menuStyle, tokenInstance, actions }) {
  return (
    <div ref={menuRef} style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
      <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>Token</div>
      <MenuButton color="#c45050" onClick={() => actions.deleteToken(tokenInstance)}>
        Delete
      </MenuButton>
    </div>
  );
}

function DiceMenu({ menuRef, menuStyle, diceInstance, actions }) {
  const maxVal = DICE_CONFIGS[diceInstance.dieType]?.faces || 6;

  return (
    <div ref={menuRef} style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
      <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>
        {diceInstance.dieType.toUpperCase()} — showing {diceInstance.value}
      </div>
      <MenuButton onClick={() => actions.rollDice(diceInstance)}>Roll</MenuButton>
      <div className="px-3 py-1 text-[10px] font-semibold mt-1" style={SECTION_HEADER_STYLE}>Set Value</div>
      <div className="flex flex-wrap gap-1 px-2 pb-1.5">
        {Array.from({ length: maxVal }, (_, i) => i + 1).map((v) => (
          <button
            key={v}
            type="button"
            className="size-7 rounded-md text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors"
            style={v === diceInstance.value
              ? { background: `${GOLD} 0.25)`, color: TEXT_PRIMARY, border: `1px solid ${GOLD} 0.4)` }
              : { color: TEXT_BODY }
            }
            onMouseEnter={(e) => { if (v !== diceInstance.value) e.currentTarget.style.background = `${GOLD} 0.08)`; }}
            onMouseLeave={(e) => { if (v !== diceInstance.value) e.currentTarget.style.background = 'transparent'; }}
            onClick={() => actions.setDiceValue(diceInstance, v)}
          >
            {v}
          </button>
        ))}
      </div>
      <MenuButton color="#c45050" onClick={() => actions.deleteDice(diceInstance)}>
        Delete
      </MenuButton>
    </div>
  );
}
