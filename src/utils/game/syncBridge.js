import { emitGameAction, onGameAction, offGameAction } from './socketClient';

/**
 * GameSyncBridge — the single source of truth for every outbound game
 * action, and the single place where inbound game action handlers are
 * registered.
 *
 * Why this exists:
 * Before this class, GameBoard.jsx made ~45 raw `emitGameAction(type, data)`
 * calls scattered through the file, each re-checking `this.suppressBroadcast`
 * and each hand-crafting its payload. Every new synced action required
 * finding the right pattern to copy; any missed `suppressBroadcast` guard
 * caused a re-emit loop. This class gives every action exactly one home.
 *
 * Design:
 *   - Typed methods per message type (claimCard, tapCard, syncPile, …).
 *   - Internal suppressBroadcast flag. Callers don't check it — they call
 *     the method and trust the bridge to skip the emit if suppressed.
 *   - `withSuppressed(fn)` wraps a synchronous block. For calls that need
 *     to suppress across an async boundary (e.g. restoreSession), use the
 *     setSuppressed(bool) escape hatch.
 *   - registerHandlers() accepts a flat { type: fn } map and tracks the
 *     registrations so destroy() can clean them up on unmount.
 */
export class GameSyncBridge {
  constructor() {
    this._suppressed = false;
    this._handlers = [];
  }

  // --- Suppression -----------------------------------------------------

  /** Run a synchronous block with outbound broadcasts suppressed. */
  withSuppressed(fn) {
    const prev = this._suppressed;
    this._suppressed = true;
    try {
      return fn();
    } finally {
      this._suppressed = prev;
    }
  }

  /** Raw flag setter for operations that span async boundaries. */
  setSuppressed(value) {
    this._suppressed = !!value;
  }

  get isSuppressed() {
    return this._suppressed;
  }

  // --- Internal send ---------------------------------------------------

  _send(type, data) {
    if (this._suppressed) return;
    emitGameAction(type, data);
  }

  // --- Card mutations --------------------------------------------------

  /** Place a card on the table. Payload carries the full cardInstance. */
  placeCard(cardInstance) {
    this._send('card:place', { cardInstance });
  }

  /** Remove a card from the table by id. */
  removeCard(cardId) {
    this._send('card:remove', { cardId });
  }

  /**
   * Claim ownership of a card. Sent the moment a local action wakes up
   * the card's body (drag start, or auto-claim from a cascade collision).
   * Receivers flip the body to kinematic + non-colliding so it can't
   * fight the incoming pose stream.
   */
  claimCard(cardId) {
    this._send('card:claim', { cardId });
  }

  /**
   * Stream the current physics pose of a locally-owned card. Throttled
   * to ~30 Hz by the caller via CardOwnership.shouldBroadcast. The pose
   * arrays are flat [x, y, z] and [x, y, z, w] for cheap JSON encoding.
   */
  streamCardPose(cardId, pos, quat) {
    this._send('card:pose', { cardId, pos, quat });
  }

  /**
   * Release ownership and report the final settled pose. Sent when the
   * card's body sleeps after the local player stopped interacting.
   * Receivers apply the pose, sleep the body, and return it to dynamic
   * + colliding so future actions on either side can wake it again.
   */
  releaseCard(cardId, pos, quat) {
    this._send('card:release', { cardId, pos, quat });
  }

  /** Tap / untap a card. */
  tapCard(cardId, tapped) {
    this._send('card:tap', { cardId, tapped });
  }

  /** Flip a card face-up / face-down. */
  flipCard(cardId, faceDown) {
    this._send('card:flip', { cardId, faceDown });
  }

  /** Absolute stat value for minion ATK or HP. */
  setCardStat(cardId, stat, value) {
    this._send('card:stat', { cardId, stat, value });
  }

  /** Change card level (surface / underground / underwater). */
  setCardLevel(cardId, level) {
    this._send('card:level', { cardId, level });
  }

  /** Toggle a keyword status effect (Stealth, Ward, etc.) on a card. */
  setCardStatus(cardId, statusKey, active) {
    this._send('card:status', { cardId, statusKey, active });
  }

  /** Broadcast which card the local player is hovering or inspecting.
   *  Pass `null` to clear the highlight on the opponent's board. */
  hoverCard(cardId) {
    this._send('card:hover', { cardId });
  }

  // --- Groups ----------------------------------------------------------

  /**
   * Broadcast that a set of cards on the table have been grouped together
   * under a shared groupId. Receivers write the groupId onto each card
   * instance and rebuild their groups map so the cards drag together on
   * the opponent's board too. Group membership is fully replaceable —
   * sending the same groupId with a different card list replaces it.
   */
  setGroup(groupId, cardIds) {
    this._send('group:set', { groupId, cardIds });
  }

  /** Dissolve a group. Receivers clear the groupId from every member. */
  clearGroup(groupId) {
    this._send('group:clear', { groupId });
  }

  // --- Pile sync -------------------------------------------------------

  /** Full-pile sync — carries the updated pile object. */
  syncPile(pile) {
    this._send('pile:sync', { pile });
  }

  /** Remove an empty pile entirely. */
  removePile(pileId) {
    this._send('pile:remove', { pileId });
  }

  // --- Trackers (life, mana, earth, water, fire, wind) ---------------

  setTracker(player, key, value) {
    this._send('tracker:set', { player, key, value });
  }

  // --- Hand / turn ---------------------------------------------------

  /** Broadcast the opponent-visible hand info (card count + site flags). */
  updateHandInfo(cards) {
    this._send('hand:info', { cards });
  }

  passTurn(currentTurn, turnNumber) {
    this._send('turn:pass', { currentTurn, turnNumber });
  }

  // --- Dice ----------------------------------------------------------

  spawnDice(diceInstance) {
    this._send('dice:spawn', { diceInstance });
  }

  moveDice(diceId, x, z) {
    this._send('dice:move', { diceId, x, z });
  }

  rollDice(diceId, value) {
    this._send('dice:roll', { diceId, value });
  }

  deleteDice(diceId) {
    this._send('dice:delete', { diceId });
  }

  // --- Match result --------------------------------------------------

  proposeMatch(winner) {
    this._send('match:propose', { winner });
  }

  rejectMatch() {
    this._send('match:reject', {});
  }

  confirmMatch(winner) {
    this._send('match:confirmed', { winner });
  }

  // --- Legacy --------------------------------------------------------

  /** Raw escape hatch for messages that don't yet have a typed method. */
  emit(type, data) {
    this._send(type, data);
  }

  // --- Inbound handler registration ---------------------------------

  /**
   * Register a flat map of { 'message:type': handler } subscriptions.
   * All registrations are tracked so destroy() can unsubscribe them.
   */
  registerHandlers(handlers) {
    for (const [event, fn] of Object.entries(handlers)) {
      onGameAction(event, fn);
      this._handlers.push({ event, fn });
    }
  }

  /** Unsubscribe everything registered via registerHandlers. */
  destroy() {
    for (const { event, fn } of this._handlers) {
      try { offGameAction(event, fn); } catch {}
    }
    this._handlers = [];
    this._suppressed = false;
  }
}
