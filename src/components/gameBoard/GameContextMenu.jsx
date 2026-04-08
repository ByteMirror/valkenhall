import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  POPOVER_STYLE, SECTION_HEADER_STYLE,
} from '../../lib/medievalTheme';
import { DICE_CONFIGS } from '../../utils/game/diceMesh';

const menuCls = 'flex w-full items-center rounded-lg px-3 py-1.5 cursor-pointer transition-colors';
const menuHover = (e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; };
const menuLeave = (e) => { e.currentTarget.style.background = 'transparent'; };

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

  // The menu applies `zoom: viewScale` to scale its contents with the
  // rest of the UI. CSS `zoom` on a position:fixed element ALSO scales
  // its `left`/`top` values from the containing block origin — so if we
  // want the zoomed menu to end up at the actual cursor position, we
  // have to pre-divide the click coordinates by the scale. Without
  // this the menu drifts by a factor of `viewScale` at viewScale != 1.
  const scale = viewScale || 1;
  const menuStyle = {
    position: 'fixed',
    left: contextMenu.x / scale,
    top: contextMenu.y / scale,
    zIndex: 100,
    zoom: scale,
  };

  if (contextMenu.type === 'card') {
    return (
      <CardMenu
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
    return <PileMenu menuStyle={menuStyle} pile={contextMenu.pile} actions={actions} />;
  }
  if (contextMenu.type === 'handcard') {
    return <HandCardMenu contextMenu={contextMenu} actions={actions} viewScale={viewScale} />;
  }
  if (contextMenu.type === 'token') {
    return <TokenMenu menuStyle={menuStyle} tokenInstance={contextMenu.tokenInstance} actions={actions} />;
  }
  if (contextMenu.type === 'dice') {
    return <DiceMenu menuStyle={menuStyle} diceInstance={contextMenu.diceInstance} actions={actions} />;
  }
  return null;
}

function CardMenu({ menuStyle, cardInstance, mesh, actions, selectionSize, groupId, selectionAlreadyGrouped }) {
  // Group selected — shown when the user has a marquee selection that
  // ISN'T already a single cohesive group. The `selectionAlreadyGrouped`
  // flag is computed upstream in GameBoard.handleContextMenu: it's
  // true when every selected card shares the same non-empty groupId.
  // When the selection is already grouped, only Ungroup is useful.
  const canGroup = !selectionAlreadyGrouped && (
    selectionSize >= 2 || (selectionSize >= 1 && !groupId)
  );
  const canUngroup = !!groupId;

  return (
    <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
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

function PileMenu({ menuStyle, pile, actions }) {
  return (
    <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
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

function TokenMenu({ menuStyle, tokenInstance, actions }) {
  return (
    <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
      <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>Token</div>
      <MenuButton color="#c45050" onClick={() => actions.deleteToken(tokenInstance)}>
        Delete
      </MenuButton>
    </div>
  );
}

function DiceMenu({ menuStyle, diceInstance, actions }) {
  const maxVal = DICE_CONFIGS[diceInstance.dieType]?.faces || 6;

  return (
    <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
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
