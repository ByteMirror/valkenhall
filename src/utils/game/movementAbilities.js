/**
 * Movement ability parsing and validation for the Sorcery TCG game board.
 * Extracts movement-relevant keywords from a card's rules text and provides
 * step validation logic for path movement.
 */

/**
 * Parse movement abilities from a card's rules text.
 * Returns an object describing the card's movement capabilities.
 */
export function getMovementAbilities(rulesText) {
  const text = (rulesText || '').toLowerCase();

  return {
    airborne: /\bairborne\b/.test(text),
    // TODO: Burrowing needs terrain/level system integration
    burrowing: /\bburrowing\b/.test(text),
    // TODO: Submerge needs terrain/level system integration
    submerge: /\bsubmerge\b/.test(text),
    // TODO: Voidwalk needs terrain/level system integration
    voidwalk: /\bvoidwalk\b/.test(text),
    immobile: /\bimmobile\b/.test(text),
    stealth: /\bstealth\b/.test(text),
    ranged: parseRanged(text),
    movementBonus: parseMovementBonus(text),
    charge: /\bcharge\b/.test(text),
    lethal: /\blethal\b/.test(text),
  };
}

function parseMovementBonus(text) {
  const match = text.match(/\bmovement\s*\+(\d+)\b/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseRanged(text) {
  const match = text.match(/\branged\s*(\d+)?\b/);
  if (!match) return 0;
  return match[1] ? parseInt(match[1], 10) : 1;
}

/**
 * Get the maximum number of steps a card can take.
 * Move & Attack: 1 base + movement bonus.
 * Plain Move: unlimited (capped at 99 for safety).
 */
export function getMaxSteps(abilities, action) {
  if (abilities.immobile) return 0;
  if (action === 'attack') return 1 + abilities.movementBonus;
  return 99;
}

/**
 * Check if a step from one cell to another is valid for a given card's abilities.
 * Airborne cards can move diagonally (any of 8 adjacent cells).
 * Normal cards move orthogonally only (4 adjacent cells).
 */
export function isValidStep(fromCol, fromRow, toCol, toRow, abilities) {
  const dCol = Math.abs(toCol - fromCol);
  const dRow = Math.abs(toRow - fromRow);

  if (abilities.airborne) {
    // Airborne: any adjacent cell including diagonals
    return dCol <= 1 && dRow <= 1 && (dCol + dRow) > 0;
  }

  // Normal: orthogonal only
  return (dCol + dRow) === 1;
}

// --- Level System (Burrowing / Submerge) ---

/** Card levels */
export const LEVELS = {
  SURFACE: 'surface',
  UNDERGROUND: 'underground',
  UNDERWATER: 'underwater',
};

/**
 * Get the level options available to a card based on its abilities and current level.
 * Returns array of { level, label, icon } objects for context menu display.
 */
export function getLevelOptions(abilities, currentLevel = LEVELS.SURFACE) {
  const options = [];
  if (abilities.burrowing) {
    if (currentLevel === LEVELS.SURFACE) {
      options.push({ level: LEVELS.UNDERGROUND, label: 'Burrow Underground', icon: '⛏' });
    } else if (currentLevel === LEVELS.UNDERGROUND) {
      options.push({ level: LEVELS.SURFACE, label: 'Surface', icon: '↑' });
    }
  }
  if (abilities.submerge) {
    if (currentLevel === LEVELS.SURFACE) {
      options.push({ level: LEVELS.UNDERWATER, label: 'Submerge Underwater', icon: '🌊' });
    } else if (currentLevel === LEVELS.UNDERWATER) {
      options.push({ level: LEVELS.SURFACE, label: 'Surface', icon: '↑' });
    }
  }
  return options;
}

/**
 * Check if two cards at the same cell can interact (fight, target, etc).
 * Cards on different levels cannot interact.
 */
export function canInteract(cardA, cardB) {
  const levelA = cardA._level || LEVELS.SURFACE;
  const levelB = cardB._level || LEVELS.SURFACE;
  return levelA === levelB;
}
