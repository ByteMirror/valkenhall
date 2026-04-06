/**
 * Pure combat resolution utilities for the Sorcery TCG game board.
 * No DOM, no THREE.js — just math and filtering.
 */

import { getMovementAbilities, canInteract } from './movementAbilities';

/**
 * Resolve simultaneous combat between an attacker and defender.
 * Both cards strike at the same time: attacker deals its power to defender,
 * defender deals its power back to attacker.
 * Supports Lethal: any strictly positive damage from a unit with Lethal kills.
 */
export function resolveCombat(attacker, defender, { attackerAbilities, defenderAbilities } = {}) {
  const atkPower = attacker.currentAttack || 0;
  const defPower = defender.currentAttack || 0;

  const defenderDamageTaken = atkPower;
  const attackerDamageTaken = defPower;

  const newDefLife = (defender.currentLife || 0) - defenderDamageTaken;
  const newAtkLife = (attacker.currentLife || 0) - attackerDamageTaken;

  const attackerHasLethal = !!attackerAbilities?.lethal;
  const defenderHasLethal = !!defenderAbilities?.lethal;

  return {
    attackerDamage: attackerDamageTaken,
    defenderDamage: defenderDamageTaken,
    attackerNewLife: Math.max(0, newAtkLife),
    defenderNewLife: Math.max(0, newDefLife),
    attackerDead: (newAtkLife <= 0 && defPower > 0) || (defenderHasLethal && defPower > 0),
    defenderDead: (newDefLife <= 0 && atkPower > 0) || (attackerHasLethal && atkPower > 0),
  };
}

/**
 * Resolve a site attack. The attacker strikes the site but the site
 * does not strike back. Damage is also dealt to the controlling avatar.
 */
export function resolveSiteAttack(attacker) {
  const damage = attacker.currentAttack || 0;
  return { damage };
}

/**
 * Get valid attack targets in a grid cell for a given attacker.
 * Returns the subset of cardsInCell that are enemies of the attacker.
 * If the target has Stealth, it cannot be targeted by attacks.
 */
export function getValidTargets(attackerInstance, cardsInCell, { sorceryCards } = {}) {
  const attackerRotated = !!attackerInstance.rotated;
  return cardsInCell.filter(({ cardInstance }) => {
    if (cardInstance.id === attackerInstance.id) return false;
    if (!!cardInstance.rotated === attackerRotated) return false;

    // Level check: can only target cards on the same level
    if (!canInteract(attackerInstance, cardInstance)) return false;

    // Stealth: unit cannot be targeted by attacks
    if (sorceryCards) {
      const abilities = getCachedAbilities(cardInstance, sorceryCards);
      if (abilities?.stealth) return false;
    }

    return true;
  });
}

/**
 * Resolve combat with multiple defenders.
 * Each defender strikes the attacker with its full power simultaneously.
 * The attacker deals its full power to each defender.
 * Supports Lethal on both attacker and individual defenders.
 */
export function resolveMultiCombat(attacker, defenders, { attackerAbilities, defenderAbilitiesList } = {}) {
  let totalDamageToAttacker = 0;
  const attackerHasLethal = !!attackerAbilities?.lethal;
  let anyDefenderHasLethal = false;

  for (let i = 0; i < defenders.length; i++) {
    const def = defenders[i];
    totalDamageToAttacker += def.currentAttack || 0;
    const defAbilities = defenderAbilitiesList?.[i];
    if (defAbilities?.lethal && (def.currentAttack || 0) > 0) {
      anyDefenderHasLethal = true;
    }
  }

  const attackerNewLife = Math.max(0, (attacker.currentLife || 0) - totalDamageToAttacker);
  const attackerDead = (attackerNewLife <= 0 && totalDamageToAttacker > 0) || (anyDefenderHasLethal);

  const atkPower = attacker.currentAttack || 0;
  const defenderResults = defenders.map((def) => {
    const newLife = Math.max(0, (def.currentLife || 0) - atkPower);
    return {
      id: def.id,
      damage: atkPower,
      newLife,
      dead: (newLife <= 0 && atkPower > 0) || (attackerHasLethal && atkPower > 0),
    };
  });

  return {
    attackerDamage: totalDamageToAttacker,
    attackerNewLife,
    attackerDead,
    defenderResults,
  };
}

/**
 * Get units that can defend an attack at a target cell.
 * Must be: owned by defending player, untapped, adjacent (1 cell away orthogonally),
 * not a site card, not at the same cell as the target.
 * If the attacker has Stealth, the attack cannot be defended.
 */
export function getDefenders(targetCol, targetRow, allGridCards, defendingPlayerRotated, { attackerAbilities } = {}) {
  // Stealth: attack cannot be defended
  if (attackerAbilities?.stealth) return [];

  return allGridCards.filter(({ cardInstance }) => {
    if (cardInstance.isSite) return false;
    if (cardInstance.tapped) return false;
    if (!!cardInstance.rotated !== defendingPlayerRotated) return false;
    if (cardInstance._gridCol == null) return false;
    const dCol = Math.abs(cardInstance._gridCol - targetCol);
    const dRow = Math.abs(cardInstance._gridRow - targetRow);
    if (dCol + dRow !== 1) return false;
    return true;
  });
}

/**
 * Get units that can intercept at a given cell.
 * Must be: at the same cell, untapped, owned by the intercepting player, not a site.
 * If the moving unit has Stealth, it cannot be intercepted.
 */
export function getInterceptors(col, row, allGridCards, interceptingPlayerRotated, { moverAbilities } = {}) {
  // Stealth: unit cannot be intercepted
  if (moverAbilities?.stealth) return [];

  return allGridCards.filter(({ cardInstance }) => {
    if (cardInstance.isSite) return false;
    if (cardInstance.tapped) return false;
    if (!!cardInstance.rotated !== interceptingPlayerRotated) return false;
    if (cardInstance._gridCol !== col || cardInstance._gridRow !== row) return false;
    return true;
  });
}

/**
 * Get cached abilities for a card instance, looking up the full card data if needed.
 */
function getCachedAbilities(cardInstance, sorceryCards) {
  if (cardInstance._abilities) return cardInstance._abilities;
  const fullCard = sorceryCards?.find((c) => c.unique_id === cardInstance.cardId);
  if (!fullCard) return null;
  const rulesText = fullCard.functional_text_plain || fullCard.functional_text || '';
  cardInstance._abilities = getMovementAbilities(rulesText);
  return cardInstance._abilities;
}
