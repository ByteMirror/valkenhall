import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  POPOVER_STYLE, SECTION_HEADER_STYLE,
} from '../../lib/medievalTheme';
import { getLevelOptions, LEVELS } from '../../utils/game/movementAbilities';
import { DICE_CONFIGS } from '../../utils/game/diceMesh';

const menuCls = 'flex w-full items-center rounded-lg px-3 py-1.5 cursor-pointer transition-colors';
const menuHover = (e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; };
const menuLeave = (e) => { e.currentTarget.style.background = 'transparent'; };

function Divider() {
  return <div className="mx-2 my-1 h-px" style={{ background: `${GOLD} 0.1)` }} />;
}

function MenuButton({ onClick, color = TEXT_BODY, disabled = false, children }) {
  return (
    <button
      type="button"
      className={menuCls}
      style={{ color: disabled ? TEXT_MUTED : color, opacity: disabled ? 0.4 : 1 }}
      onMouseEnter={disabled ? undefined : menuHover}
      onMouseLeave={menuLeave}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </button>
  );
}

/**
 * Context menu rendered at a screen position for a clicked card / pile /
 * hand card / token / dice / move-action target. Dispatches to orchestration
 * callbacks supplied by GameBoard — stays presentational with zero game
 * state mutation of its own.
 */
export default function GameContextMenu({
  contextMenu,
  getCardAbilities,
  getCardsInCell,
  actions,
}) {
  if (!contextMenu) return null;

  const menuStyle = {
    position: 'fixed',
    left: contextMenu.x,
    top: contextMenu.y,
    zIndex: 100,
  };

  if (contextMenu.type === 'moveAction') {
    return <MoveActionMenu
      menuStyle={menuStyle}
      cardInstance={contextMenu.cardInstance}
      mesh={contextMenu.mesh}
      getCardAbilities={getCardAbilities}
      actions={actions}
    />;
  }

  if (contextMenu.type === 'card') {
    return <CardMenu
      menuStyle={menuStyle}
      cardInstance={contextMenu.cardInstance}
      mesh={contextMenu.mesh}
      getCardAbilities={getCardAbilities}
      getCardsInCell={getCardsInCell}
      actions={actions}
    />;
  }

  if (contextMenu.type === 'pile') {
    return <PileMenu menuStyle={menuStyle} pile={contextMenu.pile} actions={actions} />;
  }

  if (contextMenu.type === 'handcard') {
    return <HandCardMenu
      contextMenu={contextMenu}
      actions={actions}
    />;
  }

  if (contextMenu.type === 'token') {
    return <TokenMenu menuStyle={menuStyle} tokenInstance={contextMenu.tokenInstance} actions={actions} />;
  }

  if (contextMenu.type === 'dice') {
    return <DiceMenu menuStyle={menuStyle} diceInstance={contextMenu.diceInstance} actions={actions} />;
  }

  return null;
}

// --- Individual menu variants ---

function MoveActionMenu({ menuStyle, cardInstance, mesh, getCardAbilities, actions }) {
  const abilities = getCardAbilities(cardInstance);
  const isImmobile = abilities.immobile;
  const attackSteps = 1 + abilities.movementBonus;
  const abilityTags = [];
  if (abilities.airborne) abilityTags.push('Airborne');
  if (abilities.stealth) abilityTags.push('Stealth');
  if (abilities.lethal) abilityTags.push('Lethal');
  if (abilities.charge) abilityTags.push('Charge');
  if (abilities.movementBonus > 0) abilityTags.push(`Movement +${abilities.movementBonus}`);

  return (
    <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
      <div className="px-3 py-1.5 text-xs font-semibold truncate" style={{ color: ACCENT_GOLD }}>
        {cardInstance.name || 'Unit'}
      </div>
      {abilityTags.length > 0 ? (
        <div className="px-3 pb-1 flex flex-wrap gap-1">
          {abilityTags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: `${GOLD} 0.1)`, color: ACCENT_GOLD }}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <Divider />
      <MenuButton
        disabled={isImmobile}
        onClick={() => actions.startPathMode(cardInstance, mesh, 'move')}
      >
        <span className="mr-2">&#9814;</span> Move
        {isImmobile ? <span className="ml-auto text-[10px] opacity-60">Immobile</span> : null}
      </MenuButton>
      <MenuButton
        disabled={isImmobile}
        color="#c45050"
        onClick={() => actions.startPathMode(cardInstance, mesh, 'attack')}
      >
        <span className="mr-2">&#9876;</span> Move &amp; Attack
        <span className="ml-auto text-[10px] opacity-60">{attackSteps} step{attackSteps !== 1 ? 's' : ''}</span>
      </MenuButton>
      <Divider />
      <MenuButton color={TEXT_MUTED} onClick={actions.cancelMoveAction}>
        Cancel
      </MenuButton>
    </div>
  );
}

function CardMenu({ menuStyle, cardInstance, mesh, getCardAbilities, getCardsInCell, actions }) {
  const isOnGrid = cardInstance._gridCol != null && cardInstance._gridRow != null;
  const isSite = cardInstance.isSite;
  const abilities = getCardAbilities(cardInstance);

  const showMoveAttack = isOnGrid && !isSite && !abilities?.immobile;
  const attackSteps = 1 + (abilities?.movementBonus || 0);

  let artifactSection = null;
  if (!isSite && cardInstance._gridCol != null) {
    const cellCards = getCardsInCell(cardInstance._gridCol, cardInstance._gridRow);
    const hasUncarriedArtifacts = cellCards.some(({ cardInstance: ci }) =>
      ci.type === 'Artifact' && ci.id !== cardInstance.id && !ci._carriedBy
    );
    const hasCarried = cardInstance.carriedArtifacts && cardInstance.carriedArtifacts.length > 0;
    if (hasUncarriedArtifacts || hasCarried) {
      artifactSection = (
        <>
          <Divider />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Artifacts</div>
          {hasUncarriedArtifacts ? (
            <MenuButton onClick={() => actions.pickUpArtifacts(cardInstance)}>
              Pick Up Artifacts
            </MenuButton>
          ) : null}
          {hasCarried ? (
            <MenuButton onClick={() => actions.dropArtifacts(cardInstance)}>
              Drop Artifacts ({cardInstance.carriedArtifacts.length})
            </MenuButton>
          ) : null}
        </>
      );
    }
  }

  const levelOpts = abilities ? getLevelOptions(abilities, cardInstance._level || LEVELS.SURFACE) : [];

  return (
    <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
      <div className="px-3 py-1.5 text-xs font-semibold truncate" style={{ color: TEXT_PRIMARY }}>{cardInstance.name}</div>

      {showMoveAttack ? (
        <>
          <MenuButton color="#c45050" onClick={() => actions.attackInPlace(cardInstance, mesh)}>
            &#9876; Attack
          </MenuButton>
          <MenuButton color="#c45050" onClick={() => actions.startPathMode(cardInstance, mesh, 'attack')}>
            &#9876; Move &amp; Attack <span className="ml-auto text-[10px] opacity-60">{attackSteps} step{attackSteps !== 1 ? 's' : ''}</span>
          </MenuButton>
          <Divider />
        </>
      ) : null}

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
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Cemetery')}>
        Send to Cemetery
      </MenuButton>
      <Divider />
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Put into pile</div>
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Spellbook', true)}>Spellbook (shuffle)</MenuButton>
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Spellbook', false)}>Spellbook (bottom)</MenuButton>
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Atlas', true)}>Atlas (shuffle)</MenuButton>
      <MenuButton onClick={() => actions.sendCardToPile(cardInstance, 'Atlas', false)}>Atlas (bottom)</MenuButton>

      {artifactSection}

      {levelOpts.length > 0 ? (
        <>
          <Divider />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Level</div>
          {levelOpts.map((opt) => (
            <MenuButton key={opt.level} onClick={() => actions.changeCardLevel(cardInstance, opt.level)}>
              {opt.icon} {opt.label}
            </MenuButton>
          ))}
        </>
      ) : null}

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

function HandCardMenu({ contextMenu, actions }) {
  const { cardInstance } = contextMenu;
  const handMenuStyle = {
    position: 'fixed',
    left: contextMenu.x,
    bottom: window.innerHeight - contextMenu.y,
    zIndex: 1100,
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
