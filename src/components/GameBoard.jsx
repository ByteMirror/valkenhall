import { Component, createRef } from 'preact';
import { toast } from 'sonner';
import { createTableScene } from '../utils/game/tableScene';
import { createCardMesh, createPileMesh, updatePileMesh, setCardBackUrls, disposeTextureCache, CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS, createTokenMesh, createTokenButtonMesh, createHandBackMesh, TOKEN_REST_Y, TOKEN_DRAG_Y, createLifeHUD, updateLifeHUD, STATUS_EFFECTS, buildStatusBadges } from '../utils/game/cardMesh';
import { createGameState, createTrackerState, spawnDeck, drawFromPile, shufflePile, createTokenInstance, createDiceInstance } from '../utils/game/gameState';
import { createDiceMesh, animateDiceRoll, setDieFaceUp, DICE_REST_Y, DICE_DRAG_Y, DICE_CONFIGS } from '../utils/game/diceMesh';
import { loadSpawnConfig, getSpawnPoint, SPAWN_LABELS, SPAWN_COLORS, getTrackerPositions, setTrackerPosition, isTrackerConfigured, getTrackerTokenPosition } from '../utils/game/spawnConfig';
import { TRACKER_DEFS, PLAYERS, PLAYER_LABELS, getTrackerSpawnEntries, getTotalPositions, indexToRowPosition, getTrackerProgressLabel, trackerSpawnKey, valueToPositions } from '../utils/game/trackerConfig';
import CardInspector from './CardInspector';
import { addTween, animateCardFlip, animateCardTap, animateShufflePile, animateCardToPile, animateCardFromPile } from '../utils/game/animations';
import { saveGameSession, loadGameSession, listGameSessions } from '../utils/game/sessionStorage';
import { createRoom, createRoomWithCode, joinRoom, disconnectSocket, onPlayerJoined, onPlayerLeft, onStateSyncRequest, sendStateSync, requestStateSync, onStateSync } from '../utils/game/socketClient';
import { GameSyncBridge } from '../utils/game/syncBridge';
import {
  createPhysicsWorld,
  stepPhysics,
  addCardBody,
  removeCardBody,
  syncMeshFromBody,
  setBodyKinematic,
  setBodyDynamic,
  moveKinematicBody,
  setBodyRemoteControlled,
  applyRemotePoseAndRest,
} from '../utils/game/physicsWorld';
import { CardOwnership, REMOTE_RENDER_DELAY_MS } from '../utils/game/cardOwnership';
import { perf } from '../utils/perfMonitor';
import * as CANNON from 'cannon-es';
import { getLocalApiOrigin, resolveLocalImageUrl } from '../utils/localApi';
import { playSound, preloadSounds } from '../utils/game/sounds';
import { getSoundSettings, saveSoundSettings } from '../utils/arena/soundSettings';
import { updateMusicVolume } from '../utils/arena/musicManager';
import { AMBIENCE_TRACKS, playAmbience, pauseAmbience, stopAmbience, setAmbienceTrack, setAmbienceVolume, getAmbienceState, subscribeAmbience } from '../utils/arena/ambienceManager';
import { cn } from '../lib/utils';
import RuneSpinner from './RuneSpinner';
import { playUI, UI } from '../utils/arena/uiSounds';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  BEVELED_BTN, GOLD_BTN, DANGER_BTN, INPUT_STYLE, DIALOG_STYLE,
  POPOVER_STYLE, SECTION_HEADER_STYLE, FourCorners, COIN_COLOR,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import * as THREE from 'three';
import ArenaMatchResult from './ArenaMatchResult';
import { isFoilFinish, FOIL_OVERLAY_CLASSES } from '../utils/sorcery/foil.js';
import PileSearchDialog from './gameBoard/PileSearchDialog';
import DeckSpawnDialog from './gameBoard/DeckSpawnDialog';
import GameContextMenu from './gameBoard/GameContextMenu';
import StatusRingMenu from './gameBoard/StatusRingMenu';
import TutorialOverlay from './TutorialOverlay';
import { shouldAutoPlay, markTutorialSeen, hydrateTutorialState } from '../utils/arena/tutorialState';

const BOARD_TUTORIAL_KEY = 'game-board';

// Medieval-styled keyboard shortcut indicator — stone keycap with gold
// lettering, embossed shadow to mimic a carved rune. Used in the
// tutorial's shortcuts step.
const KBD_STYLE = {
  display: 'inline-block',
  padding: '1px 6px',
  background: `linear-gradient(180deg, rgba(40,34,24,0.9) 0%, rgba(20,17,12,0.95) 100%)`,
  border: `1px solid rgba(180,140,60,0.35)`,
  borderRadius: '4px',
  fontSize: '10px',
  fontFamily: 'ui-monospace, "SF Mono", "Cascadia Mono", monospace',
  fontWeight: 700,
  color: '#d4a843',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
  minWidth: '20px',
  textAlign: 'center',
  lineHeight: '18px',
  letterSpacing: '0.5px',
};

function Kbd({ children }) {
  return <span style={KBD_STYLE}>{children}</span>;
}

const SHORTCUT_SECTIONS = [
  {
    label: 'Cards',
    items: [
      { keys: ['F'], desc: 'Flip face-down / face-up' },
      { keys: ['T'], desc: 'Tap / untap' },
      { keys: ['Space'], desc: 'Inspect in full size' },
      { keys: ['G'], desc: 'Group / ungroup selection' },
      { keys: ['2×Click'], desc: 'Quick tap / untap' },
    ],
  },
  {
    label: 'Camera',
    items: [
      { keys: ['W', 'A', 'S', 'D'], desc: 'Pan the view' },
      { keys: ['Shift', '1'], desc: 'Zoom to overview' },
      { keys: ['Shift', '2'], desc: 'Zoom to hovered card' },
      { keys: ['Shift', '3'], desc: 'Flip perspective (P1/P2)' },
    ],
  },
  {
    label: 'Piles',
    items: [
      { keys: ['X'], desc: 'Search Spellbook' },
      { keys: ['Z'], desc: 'Search Atlas' },
      { keys: ['C'], desc: 'Search Cemetery' },
      { keys: ['V'], desc: 'Search Collection' },
      { keys: ['R'], desc: 'Shuffle hovered pile' },
      { keys: ['1–9'], desc: 'Draw N from hovered pile' },
    ],
  },
  {
    label: 'Game',
    items: [
      { keys: ['Tab'], desc: 'Pass the turn' },
      { keys: ['↑', '↓'], desc: 'Adjust life total' },
      { keys: ['←', '→'], desc: 'Adjust mana' },
      { keys: ['?'], desc: 'Show this help screen' },
    ],
  },
];

function ShortcutList() {
  const sectionStyle = {
    color: 'rgba(180,140,60,0.5)',
    textShadow: '0 0 8px rgba(180,140,60,0.1)',
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs" style={{ color: '#A6A09B' }}>
        These work on the hovered card or marquee selection:
      </div>
      <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {SHORTCUT_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="text-[9px] font-semibold uppercase tracking-widest mb-1.5" style={sectionStyle}>
              {section.label}
            </div>
            <div className="flex flex-col gap-1">
              {section.items.map((item) => (
                <div key={item.desc} className="flex items-center gap-2">
                  <span className="shrink-0 flex items-center gap-0.5">
                    {item.keys.map((k, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-[9px] mx-0.5" style={{ color: 'rgba(166,160,155,0.3)' }}>+</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                  <span className="text-[11px]" style={{ color: '#A6A09B' }}>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ordered onboarding for the game board. Steps that point at DOM
// overlays use a selector; in-canvas explanatory steps centre their
// modal instead of trying to lock onto a 3D element.
const BOARD_TUTORIAL_STEPS = [
  {
    key: 'welcome',
    title: 'Welcome to the Table',
    body: 'Valkenhall is a sandbox virtual tabletop — you move the cards, tokens, and dice yourself. Take a moment to get comfortable; a friendly tour of the board is just ahead.',
  },
  {
    key: 'hand',
    title: 'Your Hand',
    body: 'Your hand sits along the bottom of the screen. Hover it to fan out the cards, then click + drag a card onto the table to play it. Right-click a card in hand to send it to a pile.',
    selector: '[data-tutorial="board-hand"]',
  },
  {
    key: 'piles',
    title: 'Spellbook, Atlas, Cemetery',
    body: 'Your decks live on the sides of the table as physical piles. Click a pile to draw from it, or right-click for shuffle / search options. Cards you send to the cemetery stack there automatically.',
  },
  {
    key: 'trackers',
    title: 'Life, Mana & Elemental Trackers',
    body: 'Life, mana, and the four elemental thresholds (air, earth, fire, water) are tracked on the table next to your avatar. Click the + / − buttons beside each tracker to adjust the count yourself — the board never does the math for you.',
    selector: '[data-tutorial="board-life-hud"]',
  },
  {
    key: 'manipulating',
    title: 'Moving Cards Around',
    body: 'Left-click and drag any card to move it. Drag across empty table space to draw a marquee selection box, then drag any selected card to move the whole group together. Right-click a card for a context menu with Tap, Flip, Delete, and pile options.',
  },
  {
    key: 'shortcuts',
    title: 'Keyboard Shortcuts',
    body: <ShortcutList />,
    width: 560,
  },
  {
    key: 'menu',
    title: 'Session Menu',
    body: 'The burger menu in the top-left opens your session controls — go online to invite a friend, save the current table state, or exit back to the main menu.',
    selector: '[data-tutorial="board-menu"]',
  },
  {
    key: 'fair-play',
    title: 'You Decide Who Won',
    body: 'Valkenhall intentionally has no automated rules engine — no HP tracking, no mana enforcement, no win detection. At the end of a game, you and your opponent decide together who won. Be a good sport, play fair, and have fun. The goal here is the joy of sharing a match, not the scoreboard.',
  },
];

// Texture URLs for the tracker tokens printed on the board. The SVGs are
// served by the Bun runtime out of dist/gameboard-tokens. `wind` maps to
// the `air-token.svg` asset — the two are interchangeable terms here.
const TOKEN_ASSET_BASE = '/game-assets/gameboard-tokens';
const TRACKER_TOKEN_TEXTURES = {
  life: `${TOKEN_ASSET_BASE}/generic-token.svg`,
  mana: `${TOKEN_ASSET_BASE}/generic-token.svg`,
  earth: `${TOKEN_ASSET_BASE}/earth-token.svg`,
  water: `${TOKEN_ASSET_BASE}/water-token.svg`,
  fire: `${TOKEN_ASSET_BASE}/fire-token.svg`,
  wind: `${TOKEN_ASSET_BASE}/air-token.svg`,
};
const TRACKER_BUTTON_TEXTURES = {
  plus: `${TOKEN_ASSET_BASE}/plus-token.svg`,
  minus: `${TOKEN_ASSET_BASE}/minus-token.svg`,
};

export default class GameBoard extends Component {
  constructor(props) {
    super(props);

    this.canvasRef = createRef();
    this.scene = null;
    this.physicsWorld = createPhysicsWorld();
    this.unsubFrame = null;
    // Tracks per-card ownership (local/remote/free), broadcast throttling,
    // and the remote-side snapshot interpolation buffer.
    this.ownership = new CardOwnership();
    this.meshes = new Map();
    this.pileMeshes = new Map();
    this.dragging = null;
    this.hoveredMesh = null;
    this.opponentHoveredCardId = null;
    this.lastMouseEvent = null;
    this.sync = new GameSyncBridge();
    // Table-card multi-selection + grouping.
    // selectedCardIds  — cards currently highlighted via marquee drag,
    //                    cleared on click-empty or Escape.
    // groups           — groupId → Set<cardId>; persistent groups that
    //                    drag together even without pre-selection.
    //                    Each member card also carries its groupId on
    //                    cardInstance.groupId so the group survives
    //                    serialization round trips.
    // marquee          — transient rectangle state while the user is
    //                    dragging a selection box on the empty board.
    this.selectedCardIds = new Set();
    this.groups = new Map();
    // Timestamp per groupId marking when the group was created. The
    // per-frame freeze guard in tickPhysicsSync skips groups that are
    // still within the settling grace period so gravity can pull them
    // onto the table before they get frozen.
    this.groupSettleTimes = new Map();
    this.marquee = null;
    this.marqueeOverlayRef = createRef();
    // The "hug rect" is the persistent rounded outline that wraps
    // around every currently-selected card, follows them as they move,
    // and serves as a hit-zone so the user can click anywhere inside
    // the outline (not just on a card) to drag the whole selection.
    // Stored in screen coordinates because the click hit-test is done
    // against event.clientX/clientY.
    this.hugRectRef = createRef();
    this.hugRectScreen = null; // { minX, minY, maxX, maxY } | null
    // Reusable THREE scratch instances so the per-frame hug-rect
    // recompute allocates nothing.
    this._hugBox = new THREE.Box3();
    this._hugVec = new THREE.Vector3();
    this.spawnMarkers = new Map();
    this.tokenMeshes = new Map();
    this.lifeHUDs = new Map(); // cardId -> { sprite, plusMesh, minusMesh }
    this.statusHUDs = new Map(); // cardId -> [badge meshes]
    this.diceMeshes = new Map();
    this.trackerPreviewMarkers = [];
    this.trackerCursorPreview = null;
    this.trackerTokenMeshes = new Map();
    this.trackerButtonMeshes = new Map();
    // 3D face-down cards on the table representing the opponent's hand.
    // Purely visual — not interactive, no physics. Updated whenever the
    // `opponentHand` state changes via the `hand:info` sync message.
    this.opponentHandMeshes = [];
    this.handRetractTimer = null;
    this.autoSaveTimer = null;
    this._socketListenersActive = false;

    this.state = {
      isLoading: true,
      loadingMessage: 'Preparing game table...',
      gameState: createGameState(),
      showDeckPicker: false,
      showExitConfirm: false,
      isPlacingSpawns: false,
      activeSpawnKey: null,
      spawnConfig: {},
      contextMenu: null,
      ringMenu: null,
      handCards: [],
      inspectedCard: null,
      opponentHand: [],
      roomCode: '',
      connectionStatus: 'offline',
      isHost: true,
      showSaveDialog: false,
      saveDialogName: '',
      savedSessions: [],
      currentSessionId: null,
      currentSessionName: '',
      showGameMenu: false,
      showSpawnConfirm: false,
      pendingSpawnDeckId: null,
      pendingSpawnPlayerNum: 1,
      hoveredHandIndex: -1,
      handRetracted: true,
      searchPile: null,
      searchQuery: '',
      showShortcutHelp: false,
      trackerEditing: null,
      showDiceMenu: false,
      currentTurn: 'p1',
      turnNumber: 1,
      showMatchResult: false,
      matchStartTime: null,
      showSoundSettings: false,
      soundSettings: getSoundSettings(),
      showAmbienceMenu: false,
      ambienceState: getAmbienceState(),
      viewScale: getViewportScale(),
      showBoardTutorial: false,
    };
  }

  handleBoardTutorialDismiss = () => {
    const profileId = this.props.profile?.id;
    if (profileId) markTutorialSeen(profileId, BOARD_TUTORIAL_KEY);
    this.setState({ showBoardTutorial: false });
  };

  componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    preloadSounds();

    this.unsubAmbience = subscribeAmbience(() => {
      this.setState({ ambienceState: getAmbienceState() });
    });
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    // Auto-start ambience when entering the game board.
    playAmbience();

    const apiOrigin = getLocalApiOrigin();
    setCardBackUrls(
      `${apiOrigin}/game-assets/cardback-spellbook-rounded.png`,
      `${apiOrigin}/game-assets/cardback-atlas-rounded.png`
    );

    try {
      this.scene = createTableScene(canvas, `${apiOrigin}/game-assets/battlemap.webp`, `${apiOrigin}/game-assets/table-background-hd.png`);
    } catch (err) {
      console.error('[GameBoard] Failed to create 3D scene:', err);
      this.setState({
        connectionFailed: true,
        loadingMessage: 'Failed to initialize 3D renderer',
      });
      return;
    }

    if (!this.scene) {
      console.error('[GameBoard] Scene creation returned null');
      this.setState({
        connectionFailed: true,
        loadingMessage: 'Failed to initialize 3D renderer',
      });
      return;
    }

    canvas.addEventListener('mousedown', this.handleMouseDown);
    canvas.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('dblclick', this.handleDoubleClick);
    canvas.addEventListener('contextmenu', this.handleContextMenu);

    // Listen for a mouseup ANYWHERE on the window so a marquee drag
    // that leaves the canvas edge still closes cleanly. Same for
    // Escape — it cancels an active marquee or clears selection.
    window.addEventListener('mouseup', this.handleWindowMouseUp);
    window.addEventListener('keydown', this.handleWindowKeyDown);

    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    // Per-frame loop. Three responsibilities:
    //   1. Step the local physics world
    //   2. For each card mesh, drive the body either from local physics
    //      (local-owned or free) or from the remote interpolation buffer
    //      (remote-owned), then sync the result onto the mesh
    //   3. Stream pose updates for locally-owned cards, auto-claim free
    //      cards whose body just woke (cascade detection), and release
    //      ownership when bodies sleep
    perf.start();
    this.unsubFrame = this.scene.onFrame((dt) => {
      const frameMark = perf.beginMark('frame.tick');
      const physicsMark = perf.beginMark('frame.physics');
      stepPhysics(this.physicsWorld, dt);
      perf.endMark(physicsMark);
      const syncMark = perf.beginMark('frame.sync');
      this.tickPhysicsSync();
      perf.endMark(syncMark);
      // Hug rect follows the selected cards every frame so it tracks
      // drags, settle animations, and camera pans. Early-outs inside
      // updateHugRect() make the no-selection case a single Set size
      // check per frame.
      this.updateHugRect();
      perf.endMark(frameMark);
    });

    loadSpawnConfig().then((config) => {
      this.setState({ spawnConfig: config }, () => {
        this.createTrackerTokens();
        this.createTrackerButtons();
      });
    });

    // First-run onboarding. Deferred a beat so the hand / HUD have
    // laid out before the overlay measures its targets, and so the
    // user sees the table before the tutorial modal appears. Awaits
    // tutorialState hydration so the seen flag from disk is read
    // before we decide whether to show the overlay.
    const profileId = this.props.profile?.id;
    if (profileId) {
      hydrateTutorialState().then(() => {
        if (this._unmounted) return;
        if (!shouldAutoPlay(profileId, BOARD_TUTORIAL_KEY)) return;
        setTimeout(() => {
          if (!this._unmounted) this.setState({ showBoardTutorial: true });
        }, 900);
      });
    }

    this.initSession().then(async () => {
      // Ranked matchmaking: the server provides BOTH decks on room:joined,
      // so every client spawns identical, authoritative initial state.
      // No client-to-client races possible.
      const { roomInfo } = this.state;
      if (this.props.isArenaMatch && roomInfo?.hostDeck && roomInfo?.guestDeck) {
        // Reconnection case: the host's match state was already cached,
        // request a sync instead of re-spawning fresh decks.
        if (roomInfo.resumed) {
          requestStateSync();
        } else {
          try {
            // Both clients receive the same server-prepared deck data and
            // spawn independently; withSuppressed prevents re-emitting the
            // deck:spawn broadcast back over the wire.
            this.sync.withSuppressed(() => {
              this.spawnSelectedDeck(roomInfo.hostDeck, 1);
              this.spawnSelectedDeck(roomInfo.guestDeck, 2);
            });
          } catch (err) {
            console.error('Failed to spawn match decks:', err);
          }
        }
      } else if (this.props.arenaSelectedDeckId) {
        // Non-matchmaking arena (e.g. friend invite) — fall back to the
        // legacy single-deck flow. TODO: migrate invite flow to server-auth too.
        const localPlayerNum = this.state.isHost ? 1 : 2;
        try {
          await this.doSpawnDeck(this.props.arenaSelectedDeckId, localPlayerNum);
        } catch {}
        if (!this.state.isHost && this.props.sessionMode === 'join') {
          requestStateSync();
        }
      }
      // Determine whether this session should auto-draw opening hands.
      // Only for fresh competitive or friend matches — not solo/offline,
      // not reconnections (resumed), not loaded saved sessions.
      const isOnlineMatch = (this.props.isArenaMatch && roomInfo && !roomInfo.resumed)
        || (this.props.arenaSelectedDeckId && this.state.connectionStatus !== 'offline');

      // Give textures a moment to upload to GPU
      setTimeout(() => {
        this.setState({ isLoading: false });

        // 1 second after the board appears, auto-draw the opening hand:
        // 3 cards from Atlas (sites) + 3 from Spellbook (spells/minions).
        if (isOnlineMatch) {
          setTimeout(() => {
            if (!this._unmounted) this.performOpeningDraw();
          }, 1000);
        }
      }, 500);
    });
    this.autoSaveTimer = setInterval(() => this.autoSave(), 60000);
  }

  componentWillUnmount() {
    this._unmounted = true;
    const canvas = this.canvasRef.current;
    if (canvas) {
      canvas.removeEventListener('mousedown', this.handleMouseDown);
      canvas.removeEventListener('mousemove', this.handleMouseMove);
      canvas.removeEventListener('mouseup', this.handleMouseUp);
      canvas.removeEventListener('dblclick', this.handleDoubleClick);
      canvas.removeEventListener('contextmenu', this.handleContextMenu);
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mouseup', this.handleWindowMouseUp);
    window.removeEventListener('keydown', this.handleWindowKeyDown);
    clearTimeout(this.handRetractTimer);
    clearInterval(this.autoSaveTimer);
    this.autoSave();
    if (this.unsubAmbience) this.unsubAmbience();
    if (this.unsubScale) this.unsubScale();
    stopAmbience({ silent: true });
    // Unsubscribe every game action handler before tearing down the socket.
    this.sync.destroy();
    perf.stop();
    if (this.unsubFrame) this.unsubFrame();
    disconnectSocket();
    this.meshes.clear();
    this.pileMeshes.clear();
    this.tokenMeshes.clear();
    this.lifeHUDs.clear();
    this.diceMeshes.clear();
    for (const [, mesh] of this.trackerTokenMeshes) {
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m?.dispose());
    }
    this.trackerTokenMeshes.clear();
    for (const [, mesh] of this.trackerButtonMeshes) {
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m?.dispose());
    }
    this.trackerButtonMeshes.clear();
    this.trackerPreviewMarkers = [];
    for (const mesh of this.opponentHandMeshes) {
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m?.dispose());
    }
    this.opponentHandMeshes = [];
    disposeTextureCache();
    this.scene?.dispose();
    this.scene = null;
  }

  handleResize = () => {
    this.scene?.resize();
  };

  // Returns the world-Y of the highest card top whose footprint
  // contains the given (x, z) point, or the table baseline if no
  // card overlaps. excludeId lets the caller skip a specific card
  // (e.g., the one being picked up — its own y shouldn't influence
  // how high it gets lifted).
  //
  // Used by hand-placement and drag handling to guarantee that the
  // most recently touched card always ends up on TOP of any stack.
  // `exclude` can be a single cardId string, a Set<cardId>, or null.
  // Passing a Set lets a multi-card drag skip every member that's
  // currently moving together, which prevents a ratchet loop where
  // card A lifts to clear card B while B simultaneously lifts to
  // clear the newly-raised A, forever. The set-path is a single
  // hash lookup per iteration — same cost as the string-equality
  // path so there's no measurable overhead.
  findStackHeightAt = (x, z, exclude = null) => {
    const baseTop = 0.05 + CARD_THICKNESS / 2;
    // Use the larger half-extent so a tap-rotated card still counts
    // as covering the point (its footprint flips when tapped 90°).
    const halfFootprint = CARD_HEIGHT / 2;
    const isExcluded = typeof exclude === 'string'
      ? (id) => id === exclude
      : (exclude && typeof exclude.has === 'function')
        ? (id) => exclude.has(id)
        : () => false;
    let highestTop = baseTop;
    for (const [cardId, mesh] of this.meshes) {
      if (isExcluded(cardId)) continue;
      const dx = Math.abs(mesh.position.x - x);
      const dz = Math.abs(mesh.position.z - z);
      if (dx < halfFootprint && dz < halfFootprint) {
        const top = mesh.position.y + CARD_THICKNESS / 2;
        if (top > highestTop) highestTop = top;
      }
    }
    return highestTop;
  };

  // Per-frame physics + multiplayer sync. Runs after stepPhysics inside
  // the scene's render loop. For each card mesh:
  //   - remote-owned: read an interpolated snapshot from the buffer at
  //     (now - render delay) and apply it to the body
  //   - free or local-owned: let local physics drive the body
  //   - free + just woke: a local action's collision must have woken
  //     it (remote bodies are non-colliding), so claim ownership and
  //     broadcast a card:claim
  //   - local-owned: throttled-broadcast the body's pose at ~30 Hz, and
  //     release ownership when the body finally sleeps
  tickPhysicsSync = () => {
    const now = performance.now();
    const renderTime = now - REMOTE_RENDER_DELAY_MS;
    let awakeCount = 0;
    let localCount = 0;
    let remoteCount = 0;

    for (const [cardId, mesh] of this.meshes) {
      const body = mesh.userData?.body;
      if (!body) continue;
      if (body.sleepState !== CANNON.Body.SLEEPING) awakeCount++;

      const owner = this.ownership.get(cardId);

      if (owner === 'remote') {
        remoteCount++;
        const sample = this.ownership.sampleAt(cardId, renderTime);
        if (sample) {
          body.position.set(sample.pos[0], sample.pos[1], sample.pos[2]);
          body.quaternion.set(sample.quat[0], sample.quat[1], sample.quat[2], sample.quat[3]);
        }
        syncMeshFromBody(mesh);
        continue;
      }

      // Local or free — let local physics own the body
      syncMeshFromBody(mesh);

      // Grouped cards use STATIC bodies once settled (TTS-style).
      // During the 2s settling window after grouping, bodies stay
      // DYNAMIC so gravity pulls them onto the table. Once the window
      // closes, we freeze the group to STATIC so they can't move.
      const cardGroupId = mesh.userData?.cardInstance?.groupId;
      if (cardGroupId && body.type === CANNON.Body.DYNAMIC) {
        const isDraggingGroup = this.dragging
          && this.dragging.draggingIds?.has(cardId);
        if (!isDraggingGroup) {
          const settleStart = this.groupSettleTimes.get(cardGroupId) || 0;
          if (now - settleStart > 2000) {
            this.freezeGroup(cardGroupId);
            this.groupSettleTimes.delete(cardGroupId);
            continue;
          }
        }
      }

      // Auto-claim cascade: a free body can only have woken from a
      // local action because remote-controlled bodies don't collide.
      // Skipped during withSuppressed (initial deck spawn / state sync)
      // so both sides simulate independently without exchanging claims —
      // the first real interaction after setup is what triggers the
      // ownership exchange.
      if (
        owner === 'free'
        && body.sleepState === CANNON.Body.AWAKE
        && !this.sync.isSuppressed
      ) {
        this.ownership.setLocal(cardId);
        this.sync.claimCard(cardId);
        perf.count('sync.claim.send');
      }

      if (this.ownership.is(cardId, 'local')) {
        localCount++;
        const pos = [body.position.x, body.position.y, body.position.z];
        const quat = [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w];

        if (this.ownership.shouldBroadcast(cardId, pos, quat, now)) {
          this.sync.streamCardPose(cardId, pos, quat);
          this.ownership.recordBroadcast(cardId, pos, quat, now);
          perf.count('sync.pose.send');
        }

        // Release once settled, but never while the user is dragging.
        // This must check EVERY member of an active multi-card drag,
        // not just the primary: group members are kinematic + at rest
        // relative to the camera, so the physics engine happily puts
        // them to sleep the instant the user holds still. Using only
        // cardInstance?.id would release every non-primary member
        // mid-drag, which would flag them free, let the auto-claim
        // cascade re-grab them next frame, and result in the "cards
        // change relative order / jitter" bug the user sees.
        const isDraggingThis = this.dragging
          && (this.dragging.draggingIds
            ? this.dragging.draggingIds.has(cardId)
            : this.dragging.cardInstance?.id === cardId);
        if (!isDraggingThis && body.sleepState === CANNON.Body.SLEEPING) {
          this.sync.releaseCard(cardId, pos, quat);
          this.ownership.setFree(cardId);
          perf.count('sync.release.send');
        }
      }
    }

    perf.gauge('mesh.count', this.meshes.size);
    perf.gauge('body.awake', awakeCount);
    perf.gauge('owner.local', localCount);
    perf.gauge('owner.remote', remoteCount);
  };

  broadcastHandInfo = (handCards) => {
    this.sync.updateHandInfo(handCards.map((c) => ({ isSite: c.isSite || false })));
  };

  addToHand = (cardInstance) => {
    this.setState((state) => {
      const handCards = [...state.handCards, cardInstance];
      this.broadcastHandInfo(handCards);
      return { handCards };
    });
  };

  removeFromHand = (cardInstance) => {
    this.setState((state) => {
      const handCards = state.handCards.filter((c) => c.id !== cardInstance.id);
      this.broadcastHandInfo(handCards);
      return { handCards };
    });
  };

  updateCardRotation = (mesh, card) => {
    const flipX = card.faceDown ? Math.PI / 2 : -Math.PI / 2;
    const flipZ = card.faceDown ? Math.PI : 0;
    const tapZ = card.tapped ? -Math.PI / 2 : 0;
    const siteZ = card.isSite ? -Math.PI / 2 : 0;
    const baseZ = card.rotated ? Math.PI : 0;
    mesh.rotation.set(flipX, 0, baseZ + siteZ + flipZ + tapZ);
  };

  handleGameHotkey = (event) => {
    // Don't fire hotkeys while the user is typing in a text field
    // (e.g. the pile search dialog's search input).
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;

    // ? — toggle the keyboard shortcuts help overlay.
    if (event.key === '?') {
      this.setState((s) => ({ showShortcutHelp: !s.showShortcutHelp }));
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      this.passTurn();
      return;
    }
    if (event.key === 'Escape') {
      if (this.state.showShortcutHelp) {
        this.setState({ showShortcutHelp: false });
        return;
      }
      if (this.state.showExitConfirm) {
        this.setState({ showExitConfirm: false });
      } else {
        this.requestExit();
      }
      return;
    }

    if (event.key === ' ' || event.key === 'Space') {
      event.preventDefault();
      if (this.state.inspectedCard) {
        this.setState({ inspectedCard: null });
        // Clear the inspect highlight on the opponent's board
        this.sync.hoverCard(this.hoveredMesh?.userData?.cardInstance?.id || null);
        return;
      }

      // Check table cards
      if (this.hoveredMesh?.userData?.type === 'card') {
        const card = this.hoveredMesh.userData.cardInstance;
        this.setState({ inspectedCard: card });
        // Broadcast that we're inspecting this card — the opponent
        // sees the same highlight as a hover but it persists while
        // the inspector is open.
        this.sync.hoverCard(card.id);
        return;
      }

      // Check hand cards (hand cards don't have table meshes, so no
      // highlight to show on the opponent's board — but we still
      // clear any stale table hover).
      const { hoveredHandIndex, handCards } = this.state;
      if (hoveredHandIndex >= 0 && handCards[hoveredHandIndex]) {
        this.setState({ inspectedCard: handCards[hoveredHandIndex] });
        this.sync.hoverCard(null);
        return;
      }
      return;
    }

    if (this.state.inspectedCard) return;
    if (this.state.showExitConfirm || this.state.showDeckPicker) return;

    if (event.key === 'f' || event.key === 'F') {
      // Prefer the marquee selection if one exists: flipping works
      // on every selected card as a unit. All cards flip to the
      // SAME target face — if any are currently face-up, they all
      // flip face-down; otherwise they all flip face-up. This
      // matches the user's mental model of "flip the selection"
      // better than independent per-card toggles.
      if (this.selectedCardIds.size > 0) {
        const meshes = [];
        for (const id of this.selectedCardIds) {
          const mesh = this.meshes.get(id);
          if (mesh?.userData?.type === 'card' && this.isOwnedCard(mesh.userData.cardInstance)) meshes.push(mesh);
        }
        if (meshes.length === 0) return;
        const targetFaceDown = !meshes.some((m) => m.userData.cardInstance.faceDown);
        for (const mesh of meshes) {
          const card = mesh.userData.cardInstance;
          if (card.faceDown === targetFaceDown) continue;
          card.faceDown = targetFaceDown;
          animateCardFlip(mesh, card);
          this.sync.flipCard(card.id, card.faceDown);
        }
        playSound('cardFlip');
        return;
      }
      if (this.hoveredMesh?.userData?.type === 'card') {
        const card = this.hoveredMesh.userData.cardInstance;
        if (!this.isOwnedCard(card)) return;
        card.faceDown = !card.faceDown;
        animateCardFlip(this.hoveredMesh, card);
        playSound('cardFlip');
        this.sync.flipCard(card.id, card.faceDown);
      }
      return;
    }

    if (event.key === 't' || event.key === 'T') {
      // Tap works the same way: selection first, unified target
      // state. Sites can't be tapped so they're filtered out.
      if (this.selectedCardIds.size > 0) {
        const meshes = [];
        for (const id of this.selectedCardIds) {
          const mesh = this.meshes.get(id);
          if (mesh?.userData?.type === 'card' && !mesh.userData.cardInstance.isSite && this.isOwnedCard(mesh.userData.cardInstance)) {
            meshes.push(mesh);
          }
        }
        if (meshes.length === 0) return;
        const targetTapped = !meshes.every((m) => m.userData.cardInstance.tapped);
        for (const mesh of meshes) {
          const card = mesh.userData.cardInstance;
          if (card.tapped === targetTapped) continue;
          card.tapped = targetTapped;
          animateCardTap(mesh, card);
          this.sync.tapCard(card.id, card.tapped);
        }
        playSound('cardPlace');
        return;
      }
      if (this.hoveredMesh?.userData?.type === 'card') {
        const card = this.hoveredMesh.userData.cardInstance;
        if (card.isSite || !this.isOwnedCard(card)) return;
        card.tapped = !card.tapped;
        animateCardTap(this.hoveredMesh, card);
        playSound('cardPlace');
        this.sync.tapCard(card.id, card.tapped);
      }
      return;
    }

    // Backspace while hovering a card sends it to the local player's
    // cemetery — a quick alternative to right-click → Send to Cemetery.
    if (event.key === 'Backspace' && this.hoveredMesh?.userData?.type === 'card') {
      const card = this.hoveredMesh.userData.cardInstance;
      if (!this.isOwnedCard(card)) return;
      this.sendCardToPile(card, 'Cemetery');
      return;
    }

    // Shift+1/2/3 camera controls. Using event.code (physical key
    // position) instead of event.key (produced character) so these work
    // on non-US layouts like QWERTZ, AZERTY, and Nordic — on those
    // keyboards Shift+1/2/3 produce different characters than !/@/#.
    if (event.shiftKey && event.code === 'Digit1') {
      this.scene?.zoomToOverview();
      return;
    }

    if (event.shiftKey && event.code === 'Digit2' && this.hoveredMesh) {
      const pos = this.hoveredMesh.position;
      this.scene?.zoomToCard(pos.x, pos.z);
      return;
    }

    if (event.shiftKey && event.code === 'Digit3') {
      this.scene?.flipPerspective();
      return;
    }

    if ((event.key === 'r' || event.key === 'R') && this.hoveredMesh?.userData?.type === 'pile') {
      if (!this.isOwnedPile(this.hoveredMesh.userData.pile)) return;
      const pile = this.hoveredMesh.userData.pile;
      animateShufflePile(this.hoveredMesh, pile, this.scene.scene);
      playSound(pile.name === 'Atlas' ? 'cardShuffleAtlas' : 'cardShuffleSpellbook');
      shufflePile(this.state.gameState, pile.id);
      return;
    }

    if ((event.key === 'r' || event.key === 'R') && this.hoveredMesh?.userData?.type === 'dice') {
      this.rollDice(this.hoveredMesh.userData.diceInstance);
      return;
    }

    // Tracker hotkeys — adjust the local player's life and mana totals.
    // Up/Down = life, Right/Left = mana. Always targets the local player
    // because each client only manages their own trackers.
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown'
        || event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const localPlayer = this.state.isHost ? 'p1' : 'p2';
      const trackerKey = (event.key === 'ArrowUp' || event.key === 'ArrowDown') ? 'life' : 'mana';
      const direction = (event.key === 'ArrowUp' || event.key === 'ArrowRight') ? 'up' : 'down';
      if (direction === 'up') {
        this.incrementTracker(localPlayer, trackerKey);
      } else {
        this.decrementTracker(localPlayer, trackerKey);
      }
      event.preventDefault();
      return;
    }

    // Token browser — B opens a virtual pile of all token cards that can
    // be spawned an unlimited number of times. Each click/right-click
    // creates a brand-new instance so the token never "runs out".
    if (event.key === 'b' || event.key === 'B') {
      if (this.state.searchPile && this.state.searchPile.id === 'token-pile') {
        this.handlePileSearchClose();
      } else {
        this.openPileSearch(this.buildTokenPile());
      }
      event.preventDefault();
      return;
    }

    // Pile search hotkeys — open the local player's pile in the search dialog.
    // C = Cemetery, Z = Atlas, X = Spellbook, V = Collection. Pressing the
    // same key again while the dialog is open closes it (toggle behavior).
    if (event.key === 'c' || event.key === 'C'
        || event.key === 'z' || event.key === 'Z'
        || event.key === 'x' || event.key === 'X'
        || event.key === 'v' || event.key === 'V') {
      const key = event.key.toLowerCase();
      let pile = null;
      let pileLabel = '';
      if (key === 'c') {
        pile = this.findOrCreateCemetery(!this.state.isHost);
        pileLabel = 'Cemetery';
      } else if (key === 'z') {
        pile = this.findLocalPileByName('Atlas');
        pileLabel = 'Atlas';
      } else if (key === 'x') {
        pile = this.findLocalPileByName('Spellbook');
        pileLabel = 'Spellbook';
      } else if (key === 'v') {
        pile = this.findLocalPileByName('Collection');
        pileLabel = 'Collection';
      }
      if (pile) {
        // Toggle: if the dialog is already showing this pile, close it.
        if (this.state.searchPile && this.state.searchPile.id === pile.id) {
          this.handlePileSearchClose();
        } else {
          this.openPileSearch(pile);
        }
      } else {
        toast(`No ${pileLabel} pile yet`);
      }
      event.preventDefault();
      return;
    }

    // WASD panning — handled via held keys in render loop
    if ('wasdWASD'.includes(event.key)) {
      this.scene?.setKeyHeld(event.key, true);
      return;
    }

    // Number keys: draw N cards from hovered pile, staggered so each
    // card has its own draw animation + sound (~140ms apart) instead
    // of all firing on the same frame.
    const drawCount = parseInt(event.key, 10);
    if (drawCount >= 1 && drawCount <= 9 && this.hoveredMesh?.userData?.type === 'pile') {
      if (!this.isOwnedPile(this.hoveredMesh.userData.pile)) return;
      const pileId = this.hoveredMesh.userData.pile.id;
      this.drawCardsStaggered(pileId, drawCount);
      return;
    }
  };

  // Draws `count` cards from a pile one-by-one with a small delay so
  // the per-card sound and fly-to-hand animation feel fanned out
  // instead of stacking on top of each other.
  drawCardsStaggered = (pileId, count) => {
    const STAGGER_MS = 140;
    for (let i = 0; i < count; i++) {
      if (i === 0) {
        this.drawCard(pileId);
      } else {
        setTimeout(() => this.drawCard(pileId), i * STAGGER_MS);
      }
    }
  };

  requestExit = () => {
    this.setState({ showExitConfirm: true });
  };

  // --- Session & Multiplayer ---

  initSession = async () => {
    const { sessionMode, sessionId, joinRoomCode, isArenaMatch } = this.props;

    // Matchmaking auto-connect — host creates room with server-assigned code, guest joins it
    if (isArenaMatch && joinRoomCode && sessionMode === 'new') {
      try {
        this.setState({ loadingMessage: 'Creating match room...' });
        const roomInfo = await createRoomWithCode(joinRoomCode);
        this.setState({
          roomCode: roomInfo.roomCode,
          connectionStatus: 'waiting',
          isHost: true,
          roomInfo,
        });
        this.setupSocketListeners();
      } catch (error) {
        console.error('Failed to create matchmaking room:', error);
        this.setState({ connectionStatus: 'offline' });
      }
      return;
    }

    if (sessionMode === 'spectate') {
      try {
        this.setState({ loadingMessage: 'Joining as spectator...' });
        const { spectateRoom } = await import('../utils/game/socketClient');
        const roomInfo = await spectateRoom(joinRoomCode);
        this.setState({
          roomCode: roomInfo.roomCode,
          connectionStatus: 'connected',
          isHost: false,
          loadingMessage: 'Watching match...',
          roomInfo,
        });
        this.setupSocketListeners();
      } catch (error) {
        console.error('Failed to join as spectator:', error);
        this.setState({ connectionStatus: 'offline' });
      }
      return;
    }

    if (sessionMode === 'join') {
      const maxRetries = isArenaMatch ? 15 : 1;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          this.setState({ loadingMessage: attempt > 0 ? `Connecting to host (attempt ${attempt + 1})...` : 'Connecting to host...' });
          const roomInfo = await joinRoom(joinRoomCode);
          const isHost = !!roomInfo.isHost;
          this.setState({
            roomCode: roomInfo.roomCode,
            connectionStatus: 'connected',
            isHost,
            loadingMessage: 'Preparing battlefield...',
            roomInfo,
          });
          this.setupSocketListeners();
          // Rotate camera 180° for player 2 perspective
          if (!isHost) this.scene?.setOrbitTheta(Math.PI);
          return;
        } catch (error) {
          console.error(`Failed to join room (attempt ${attempt + 1}):`, error);
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 2000));
            disconnectSocket();
          } else {
            this.setState({ connectionStatus: 'offline', connectionFailed: true, loadingMessage: 'Connection failed' });
          }
        }
      }
      return;
    }

    // Load saved session if applicable — no multiplayer by default
    if (sessionMode === 'load' && sessionId) {
      try {
        this.setState({ loadingMessage: 'Loading saved session...' });
        const session = await loadGameSession(sessionId);
        if (session) {
          this.restoreSession(session);
          this.setState({ currentSessionId: session.id, currentSessionName: session.name || '' });
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    }
  };

  startMultiplayer = async () => {
    try {
      this.setState({ connectionStatus: 'starting' });
      const code = await createRoom();
      this.setState({ roomCode: code, connectionStatus: 'waiting' });
      this.setupSocketListeners();
      toast.success(`Online — code: ${code}`, { description: 'Share this code with a friend' });
    } catch (error) {
      console.error('Failed to start multiplayer:', error);
      this.setState({ connectionStatus: 'offline', roomCode: '' });
      toast.error('Failed to go online');
    }
  };

  stopMultiplayer = () => {
    disconnectSocket();
    this._socketListenersActive = false;
    this.setState({ roomCode: '', connectionStatus: 'offline' });
    toast('Went offline');
  };

  setupSocketListeners = () => {
    if (this._socketListenersActive) return;
    this._socketListenersActive = true;
    onPlayerJoined(() => {
      this.setState((state) => ({
        connectionStatus: 'connected',
        matchStartTime: state.matchStartTime || Date.now(),
      }));
      toast.success('Opponent connected');
    });

    onPlayerLeft(() => {
      // Opponent left or disconnected — award the win to the remaining
      // player. Open the match result dialog and auto-claim the reward
      // so the player sees their earnings before returning to the hub.
      if (this.props.isRankedMatch) {
        toast('Opponent left — you win!');
        this.setState({ showMatchResult: true }, () => {
          if (this.matchResultRef) {
            this.matchResultRef.applyRewards(true, { silent: true });
          }
        });
      } else {
        disconnectSocket();
        toast.error('Opponent disconnected — session ended');
        this.props.onExit();
      }
    });

    onStateSyncRequest(() => {
      const state = this.serializeTableState();
      // Don't send our hand cards to the other player
      state.handCards = [];
      state.opponentHandInfo = this.state.handCards.map((c) => ({ isSite: c.isSite || false }));
      sendStateSync(state);
    });

    onStateSync((data) => {
      const state = data?.state || data;
      // Preserve our own hand, don't overwrite with remote data
      const myHand = this.state.handCards;
      this.restoreSession(state);
      this.setState({ handCards: myHand, opponentHand: state.opponentHandInfo || [] }, () => {
        this.updateOpponentHandMeshes();
      });
    });

    // Listen for remote game actions — broadcast=false to prevent re-emit loops
    const actionHandlers = {
      'card:place': (data) => {
        const instance = data.cardInstance;
        this.addCardToTable(instance, false);
        // Immediately mark the new card as remote-owned. The opponent
        // who placed it will own and stream its drop animation. Without
        // this, our per-frame auto-claim could fire on the spawned-awake
        // body before the opponent's card:claim message arrives, ending
        // up with both clients thinking they own the card.
        const mesh = this.meshes.get(instance.id);
        if (mesh?.userData?.body) {
          this.ownership.setRemote(instance.id);
          setBodyRemoteControlled(mesh.userData.body);
        }
      },
      // The opponent is taking ownership of a card. Switch our copy to
      // remote-controlled mode (kinematic, non-colliding) so local physics
      // doesn't fight the incoming pose stream. If we currently believe
      // we own the card, yield — last claim wins. The rare double-grab
      // race resolves itself within one round trip.
      'card:claim': (data) => {
        perf.count('sync.claim.recv');
        const mesh = this.meshes.get(data.cardId);
        if (!mesh) return;
        const body = mesh.userData?.body;
        if (!body) return;
        // If ANY card in our active drag (single or multi) was just
        // claimed by the opponent, abort the whole drag — last claim
        // wins. Checking draggingIds handles the multi-card case so
        // a late claim on a group member still yields cleanly.
        if (this.dragging
          && (this.dragging.draggingIds
            ? this.dragging.draggingIds.has(data.cardId)
            : this.dragging.cardInstance?.id === data.cardId)) {
          this.dragging = null;
        }
        this.ownership.setRemote(data.cardId);
        setBodyRemoteControlled(body);
      },
      // Pose snapshot for a remote-owned card. Buffered for interpolation;
      // the per-frame loop reads samples at (now - render delay) so motion
      // appears smooth even when packets arrive jittered.
      'card:pose': (data) => {
        if (!Array.isArray(data?.pos) || !Array.isArray(data?.quat)) return;
        perf.count('sync.pose.recv');
        // Only buffer if we currently believe the card is remote-owned;
        // a stray pose for a free/local card would corrupt our state.
        if (!this.ownership.is(data.cardId, 'remote')) return;
        this.ownership.pushSnapshot(data.cardId, data.pos, data.quat, performance.now());
      },
      // Opponent's card has settled. Apply the authoritative final pose,
      // return the body to dynamic + colliding, sleep it, and mark the
      // card free so either side can wake it again on next interaction.
      'card:release': (data) => {
        perf.count('sync.release.recv');
        const mesh = this.meshes.get(data.cardId);
        if (!mesh) return;
        const body = mesh.userData?.body;
        if (!body) return;
        if (Array.isArray(data?.pos) && Array.isArray(data?.quat)) {
          applyRemotePoseAndRest(body, data.pos, data.quat);
        }
        // Only play sound if the card was recently claimed (< 2s ago).
        // Physics micro-settles on stacked cards cause rapid claim→
        // release cycles that fill the board with constant clicking.
        const claimAge = performance.now() - (this.ownership.claimTime(data.cardId) || 0);
        if (claimAge < 2000) playSound('cardPlace');
        this.ownership.setFree(data.cardId);
        syncMeshFromBody(mesh);
      },
      'card:tap': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (mesh) {
          const card = mesh.userData.cardInstance;
          card.tapped = data.tapped;
          animateCardTap(mesh, card);
          playSound('cardPlace');
        }
      },
      'card:flip': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (mesh) {
          const card = mesh.userData.cardInstance;
          card.faceDown = data.faceDown;
          animateCardFlip(mesh, card);
          playSound('cardFlip');
        }
      },
      'card:remove': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (mesh) {
          // Strip the card out of any lock-constraint chain before
          // disposing the body so we never leave a constraint
          // pointing at a destroyed body.
          this.evictCardFromGroup(data.cardId);
          removeCardBody(this.physicsWorld, mesh);
          this.scene.scene.remove(mesh);
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
          this.meshes.delete(data.cardId);
        }
        this.lifeHUDs.delete(data.cardId);
        this.statusHUDs.delete(data.cardId);
        this.selectedCardIds.delete(data.cardId);
      },
      // Full-pile sync: authoritative update for a single pile.
      // Sent by the acting player whenever a pile's card list changes
      // (draw, discard, shuffle, cemetery creation). Carries the entire
      // pile object so the receiver's state always matches the sender's.
      //
      // The receiver compares the incoming pile against its existing copy
      // to figure out which sound to play:
      //   - length decreased → opponent drew → cardDraw
      //   - length unchanged → opponent shuffled → atlas/spellbook variant
      //   - length increased → opponent sent a card to the pile → cardPlace
      'pile:sync': (data) => {
        if (!data?.pile?.id) return;
        const incoming = data.pile;
        const { gameState } = this.state;
        const existing = gameState.piles.find((p) => p.id === incoming.id);
        let pileSound = null;
        if (existing) {
          const prevLen = existing.cards.length;
          const nextLen = incoming.cards.length;
          if (nextLen < prevLen) {
            pileSound = 'cardDraw';
          } else if (nextLen === prevLen) {
            pileSound = incoming.name === 'Atlas' ? 'cardShuffleAtlas' : 'cardShuffleSpellbook';
          } else {
            pileSound = 'cardPlace';
          }
          // Mutate in place so existing mesh.userData.pile references stay
          // valid — otherwise the pile search dialog and context menu read
          // stale card lists after a sync and the player can't search.
          existing.cards = incoming.cards;
          existing.name = incoming.name;
          existing.x = incoming.x;
          existing.z = incoming.z;
          existing.rotated = incoming.rotated;
        } else {
          // New pile (opponent just created a cemetery, etc).
          pileSound = 'cardPlace';
          gameState.piles.push(incoming);
          // Create a mesh for the new pile (e.g., a cemetery the opponent
          // just created with a freshly dead card).
          if (!this.pileMeshes.get(incoming.id)) {
            const mesh = createPileMesh(incoming);
            if (mesh) {
              this.scene.scene.add(mesh);
              this.pileMeshes.set(incoming.id, mesh);
            }
          }
        }
        this.updatePileMeshes();
        this.forceUpdate();
        if (pileSound) playSound(pileSound);
      },
      // Remove a pile entirely (e.g., empty cemetery cleanup).
      'pile:remove': (data) => {
        if (!data?.pileId) return;
        const { gameState } = this.state;
        gameState.piles = gameState.piles.filter((p) => p.id !== data.pileId);
        const mesh = this.pileMeshes.get(data.pileId);
        if (mesh) {
          this.scene.scene.remove(mesh);
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
          this.pileMeshes.delete(data.pileId);
        }
        this.forceUpdate();
      },
      // Legacy blanket refresh — kept for backwards compat during rollout.
      // New code should emit pile:sync with the updated pile instead.
      'pile:update': () => {
        this.updatePileMeshes();
      },
      // Remote player created or updated a group. Apply the same
      // assignment locally so the cards drag together on both boards.
      // Suppress the outbound broadcast that assignGroup would otherwise
      // trigger — we're applying a remote event, not originating one.
      'group:set': (data) => {
        if (!data?.groupId || !Array.isArray(data.cardIds)) return;
        this.sync.withSuppressed(() => {
          this.assignGroup(data.groupId, data.cardIds);
        });
      },
      'group:clear': (data) => {
        if (!data?.groupId) return;
        this.sync.withSuppressed(() => {
          this.dissolveGroup(data.groupId);
        });
      },
      // Minion ATK/HP sync: carries the new absolute value so clicks
      // can't desync even under rapid input.
      'card:stat': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (!mesh) return;
        const card = mesh.userData.cardInstance;
        const hud = this.lifeHUDs.get(data.cardId);
        if (data.stat === 'atk') {
          card.currentAttack = data.value;
          if (hud) updateLifeHUD(hud.sprite, card.currentAttack, 'atk');
        } else if (data.stat === 'hp') {
          card.currentLife = data.value;
          if (hud) updateLifeHUD(hud.hpSprite, card.currentLife, 'hp');
        }
      },
      'card:status': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (!mesh) return;
        const card = mesh.userData.cardInstance;
        if (!card.statuses) card.statuses = [];
        if (data.active) {
          if (!card.statuses.includes(data.statusKey)) card.statuses.push(data.statusKey);
        } else {
          card.statuses = card.statuses.filter((s) => s !== data.statusKey);
        }
        this.rebuildStatusBadges(data.cardId);
      },
      // Opponent hover highlight — when the other player hovers or
      // inspects a card, we tint its emissive so it's visible on our
      // board. Uses a distinct blue tone to differentiate from local
      // hover (gray 0x222222) and selection (gold 0x5a3f0a).
      'card:hover': (data) => {
        const OPPONENT_HOVER_COLOR = 0x0f2a55;

        // Clear previous opponent highlight
        if (this.opponentHoveredCardId) {
          const prevMesh = this.meshes.get(this.opponentHoveredCardId);
          if (prevMesh) {
            const mats = Array.isArray(prevMesh.material) ? prevMesh.material : [prevMesh.material];
            const isSelected = this.selectedCardIds.has(this.opponentHoveredCardId);
            const isLocalHover = this.hoveredMesh?.userData?.cardInstance?.id === this.opponentHoveredCardId;
            const restoreHex = isSelected ? 0x5a3f0a : isLocalHover ? 0x222222 : 0x000000;
            for (const m of mats) { if (m.emissive) m.emissive.setHex(restoreHex); }
          }
        }

        this.opponentHoveredCardId = data.cardId || null;

        // Apply new opponent highlight
        if (this.opponentHoveredCardId) {
          const mesh = this.meshes.get(this.opponentHoveredCardId);
          if (mesh) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) { if (m.emissive) m.emissive.setHex(OPPONENT_HOVER_COLOR); }
          }
        }
      },

      // Tracker sync: life, mana, elemental thresholds.
      'tracker:set': (data) => {
        if (!data?.player || !data?.key) return;
        const { gameState } = this.state;
        if (!gameState.trackers[data.player]) return;
        gameState.trackers[data.player][data.key] = data.value;
        this.updateTrackerTokenPositions();
        this.forceUpdate();
      },
      'hand:info': (data) => {
        this.setState({ opponentHand: data.cards || [] }, () => {
          this.updateOpponentHandMeshes();
        });
      },
      'deck:spawn': (data) => {
        if (data.deck) {
          this.sync.withSuppressed(() => {
            this.spawnSelectedDeck(data.deck, data.playerNum);
          });
        }
      },
      'dice:spawn': (data) => {
        const d = data.diceInstance;
        if (!d) return;
        this.state.gameState.dice.push(d);
        const mesh = createDiceMesh(d);
        this.scene.scene.add(mesh);
        this.diceMeshes.set(d.id, mesh);
      },
      'dice:move': (data) => {
        const mesh = this.diceMeshes.get(data.diceId);
        if (mesh) {
          addTween({ target: mesh.position, property: 'x', from: mesh.position.x, to: data.x, duration: 200 });
          addTween({ target: mesh.position, property: 'z', from: mesh.position.z, to: data.z, duration: 200 });
        }
      },
      'dice:roll': (data) => {
        const mesh = this.diceMeshes.get(data.diceId);
        if (mesh) {
          animateDiceRoll(mesh, data.value);
        }
      },
      'dice:delete': (data) => {
        const dice = this.state.gameState.dice.find((d) => d.id === data.diceId);
        if (dice) {
          const mesh = this.diceMeshes.get(data.diceId);
          if (mesh) {
            this.scene.scene.remove(mesh);
            mesh.traverse((obj) => {
              if (obj.geometry) obj.geometry.dispose();
              if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
              }
            });
            this.diceMeshes.delete(data.diceId);
          }
          this.state.gameState.dice = this.state.gameState.dice.filter((d) => d.id !== data.diceId);
        }
      },
      'turn:pass': (data) => {
        const localPlayer = this.state.isHost ? 'p1' : 'p2';
        if (data.currentTurn === localPlayer) {
          playUI('snd-turn-pass.wav', { volume: 0.5 });
        }
        this.setState({ currentTurn: data.currentTurn, turnNumber: data.turnNumber });
      },
      'match:propose': (data) => {
        // Auto-open the match result overlay if not already showing
        this.pendingMatchProposal = data;
        this.setState({ showMatchResult: true }, () => {
          if (this.matchResultProposalHandler) {
            this.matchResultProposalHandler(data);
          }
        });
      },
      'match:reject': () => {
        if (this.matchResultRef) {
          this.matchResultRef.setState({ phase: 'propose', proposedWinner: null });
        }
      },
      'match:confirmed': (data) => {
        if (this.matchResultRef) {
          const iWon = data.winner === 'opponent';
          // silent: true means we will NOT re-broadcast match:confirmed
          // when our local applyRewards finishes — otherwise both clients
          // would echo each other in a tight loop, retrying claims and
          // hitting 409 conflicts repeatedly.
          this.matchResultRef.applyRewards(iWon, { silent: true });
        }
      },
    };

    this.sync.registerHandlers(actionHandlers);
  };

  serializeTableState = () => {
    const tableCards = [];
    for (const [id, mesh] of this.meshes) {
      const card = mesh.userData.cardInstance;
      tableCards.push({
        ...card,
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z,
      });
    }
    return {
      name: 'Autosave',
      tableCards,
      piles: this.state.gameState.piles,
      handCards: this.state.handCards,
      spawnConfig: this.state.spawnConfig,
      tokens: this.state.gameState.tokens.map((t) => {
        const mesh = this.tokenMeshes.get(t.id);
        return { ...t, x: mesh?.position.x ?? t.x, z: mesh?.position.z ?? t.z };
      }),
      trackers: this.state.gameState.trackers,
      dice: (this.state.gameState.dice || []).map((d) => {
        const mesh = this.diceMeshes.get(d.id);
        return { ...d, x: mesh?.position.x ?? d.x, z: mesh?.position.z ?? d.z };
      }),
    };
  };

  restoreSession = (session) => {
    this.sync.setSuppressed(true);
    // Clear existing table
    for (const [, mesh] of this.meshes) {
      this.scene.scene.remove(mesh);
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
    this.meshes.clear();
    for (const [, mesh] of this.pileMeshes) {
      this.scene.scene.remove(mesh);
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
    this.pileMeshes.clear();

    // Restore piles
    const gameState = createGameState();
    gameState.piles = session.piles || [];
    gameState.trackers = session.trackers || createTrackerState();
    this.setState({ gameState, handCards: session.handCards || [] });

    for (const pile of gameState.piles) {
      const mesh = createPileMesh(pile);
      if (mesh) {
        this.scene.scene.add(mesh);
        this.pileMeshes.set(pile.id, mesh);
      }
    }

    // Restore table cards
    for (const card of session.tableCards || []) {
      this.addCardToTable(card);
    }

    // Restore tokens
    for (const [, mesh] of this.tokenMeshes) {
      this.scene.scene.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    this.tokenMeshes.clear();

    gameState.tokens = session.tokens || [];
    for (const token of gameState.tokens) {
      const mesh = createTokenMesh(token);
      this.scene.scene.add(mesh);
      this.tokenMeshes.set(token.id, mesh);
    }

    // Restore dice
    for (const [, mesh] of this.diceMeshes) {
      this.scene.scene.remove(mesh);
      mesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }
    this.diceMeshes.clear();

    gameState.dice = session.dice || [];
    for (const dice of gameState.dice) {
      const mesh = createDiceMesh(dice);
      this.scene.scene.add(mesh);
      this.diceMeshes.set(dice.id, mesh);
    }

    if (session.spawnConfig) {
      this.setState({ spawnConfig: session.spawnConfig }, () => {
        this.createTrackerTokens();
        this.createTrackerButtons();
      });
    } else {
      this.createTrackerTokens();
      this.createTrackerButtons();
    }
    this.sync.setSuppressed(false);
  };

  autoSave = async () => {
    if (!this.state.isHost) return;
    const state = this.serializeTableState();
    const hasTrackers = state.trackers && Object.values(state.trackers).some((p) =>
      Object.values(p).some((v) => v > 0)
    );
    const hasContent = state.tableCards.length > 0 || state.handCards.length > 0 || state.piles.some((p) => p.cards.length > 0) || (state.tokens && state.tokens.length > 0) || (state.dice && state.dice.length > 0) || hasTrackers;
    if (!hasContent) return;

    state.id = 'autosave';
    state.name = 'Autosave';
    try {
      await saveGameSession(state);
    } catch (error) {
      console.warn('Auto-save failed:', error);
    }
  };

  manualSave = async (name, existingId = null) => {
    if (!this.state.isHost) return;
    const state = this.serializeTableState();
    state.name = name || `Game ${new Date().toLocaleString()}`;
    if (existingId) state.id = existingId;
    try {
      const summary = await saveGameSession(state);
      this.setState({
        showSaveDialog: false,
        currentSessionId: summary.id,
        currentSessionName: state.name,
      });
      toast.success(`Saved "${state.name}"`);
    } catch (error) {
      console.error('Failed to save session:', error);
      toast.error('Failed to save session');
    }
  };

  quickSave = async () => {
    if (!this.state.isHost) return;
    const { currentSessionId, currentSessionName } = this.state;
    if (currentSessionId && currentSessionId !== 'autosave') {
      await this.manualSave(currentSessionName, currentSessionId);
    } else {
      this.openSaveDialog();
    }
  };

  openSaveDialog = async () => {
    try {
      const sessions = await listGameSessions();
      this.setState({ showSaveDialog: true, savedSessions: sessions, saveDialogName: this.state.currentSessionName || '' });
    } catch {
      this.setState({ showSaveDialog: true, savedSessions: [], saveDialogName: '' });
    }
  };

  // --- Ownership ---

  // In multiplayer, P1 (host) owns rotated=false objects, P2 (guest) owns rotated=true.
  // In single-player (offline), everything is owned by the local player.
  isOwnedByLocalPlayer(obj) {
    if (this.state.connectionStatus === 'offline') return true;
    const isLocalP2 = !this.state.isHost;
    if (obj?.type === 'card' || obj?.type === 'pile') {
      return !!obj.cardInstance?.rotated === isLocalP2 || !!obj.pile?.rotated === isLocalP2;
    }
    // Tokens and dice have no owner — anyone can interact
    return true;
  }

  isOwnedPile(pile) {
    if (this.state.connectionStatus === 'offline') return true;
    return !!pile?.rotated === !this.state.isHost;
  }

  isOwnedCard(cardInstance) {
    if (this.state.connectionStatus === 'offline') return true;
    return !!cardInstance?.rotated === !this.state.isHost;
  }

  // --- 3D Interaction ---

  getInteractableMeshes() {
    const meshes = [...this.meshes.values(), ...this.pileMeshes.values(), ...this.tokenMeshes.values(), ...this.diceMeshes.values(), ...this.trackerButtonMeshes.values()];
    for (const hud of this.lifeHUDs.values()) {
      meshes.push(hud.plusMesh, hud.minusMesh, hud.hpPlusMesh, hud.hpMinusMesh);
    }
    return meshes;
  }

  // --- Multi-selection & grouping ---

  /**
   * Compose the set of cards that should visually register as "selected"
   * right now: the marquee selection union'd with every group that has at
   * least one selected member. This is the single source of truth the
   * highlight pass and the multi-drag pickup both read from.
   */
  collectHighlightedCardIds() {
    const ids = new Set(this.selectedCardIds);
    // If any selected card belongs to a group, pull every other member
    // in — selecting one member implies selecting the whole group.
    for (const cardId of this.selectedCardIds) {
      const mesh = this.meshes.get(cardId);
      const gid = mesh?.userData?.cardInstance?.groupId;
      if (gid && this.groups.has(gid)) {
        for (const memberId of this.groups.get(gid)) ids.add(memberId);
      }
    }
    return ids;
  }

  /**
   * Collect the cards that should drag together when `primaryCardId` is
   * picked up: the primary card itself, every other card currently in the
   * same marquee selection, and every card that shares a group with any
   * of those. Returns an ordered Set with the primary card first so
   * callers can compute the drag offset from it.
   */
  collectDragGroupForCard(primaryCardId) {
    const result = new Set([primaryCardId]);

    // If the primary is in the marquee selection, pull every selection
    // member along. If the primary is NOT selected, we still pick up its
    // group so right-clicking (which doesn't select) still works for
    // grouped cards.
    const primaryIsSelected = this.selectedCardIds.has(primaryCardId);
    if (primaryIsSelected) {
      for (const id of this.selectedCardIds) result.add(id);
    }

    // Expand via groups: for every card already in `result`, follow its
    // groupId and add every member.
    const seeds = [...result];
    for (const id of seeds) {
      const mesh = this.meshes.get(id);
      const gid = mesh?.userData?.cardInstance?.groupId;
      if (gid && this.groups.has(gid)) {
        for (const memberId of this.groups.get(gid)) result.add(memberId);
      }
    }

    return result;
  }

  /**
   * Repaint emissive tints across every card mesh so the selected/grouped
   * cards read clearly. Selected (marquee) cards get a bright gold glow,
   * grouped cards get a softer gold tint, and everything else is cleared.
   * Safe to call frequently — it's a cheap loop over meshes with no
   * allocations beyond a Set.
   */
  updateSelectionHighlights() {
    const highlighted = this.collectHighlightedCardIds();
    // Only cards that are in the active marquee selection get an
    // emissive tint. Grouped (but unselected) cards look identical to
    // ungrouped ones — the hug outline wraps them together when
    // selected, and multi-drag is what surfaces the group at drag
    // time. This keeps the board visually quiet during normal play.
    for (const [cardId, mesh] of this.meshes) {
      if (!mesh?.material) continue;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const emissive = highlighted.has(cardId) ? 0x5a3f0a : 0x000000;
      for (const m of mats) {
        if (m.emissive) m.emissive.setHex(emissive);
      }
    }
    // The hug rect depends on the same highlighted set, so refresh it
    // in lockstep. This gives instant feedback when the marquee adds
    // or removes a card — the hug outline snaps to match.
    this.updateHugRect();
  }

  /**
   * Project a card mesh's world position to canvas-local screen pixels.
   * Used by the marquee hit test and any future UI that needs to sit on
   * top of a 3D card.
   */
  worldPositionToScreen(worldPos) {
    if (!this.scene?.camera || !this.canvasRef.current) return null;
    const v = this._hugVec.copy(worldPos).project(this.scene.camera);
    const rect = this.canvasRef.current.getBoundingClientRect();
    return {
      x: ((v.x + 1) / 2) * rect.width + rect.left,
      y: ((-v.y + 1) / 2) * rect.height + rect.top,
    };
  }

  /**
   * Recompute the persistent "hug" rectangle that wraps every selected
   * card, writing both the screen-space bounds (for hit testing) and
   * the DOM overlay style (for rendering). Called every frame by the
   * scene tick so the rect follows cards as they move, as well as from
   * updateSelectionHighlights() the moment the selection changes so
   * the user gets instant feedback.
   *
   * The bounds are computed by projecting each selected card's world-
   * space AABB corners through the camera and taking min/max of the
   * resulting screen coordinates. That handles tapped / rotated cards
   * correctly — we always hug the oriented shape, not an ideal
   * rectangle.
   *
   * A generous padding is applied so the outline doesn't touch card
   * edges; that makes the rounded-corner styling read as a halo rather
   * than a tight frame.
   */
  updateHugRect() {
    const el = this.hugRectRef.current;
    if (!el) return;

    const highlighted = this.collectHighlightedCardIds();
    if (highlighted.size === 0 || !this.scene?.camera || !this.canvasRef.current) {
      el.style.display = 'none';
      this.hugRectScreen = null;
      return;
    }

    const camera = this.scene.camera;
    const rect = this.canvasRef.current.getBoundingClientRect();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;

    const box = this._hugBox;
    const v = this._hugVec;

    for (const cardId of highlighted) {
      const mesh = this.meshes.get(cardId);
      if (!mesh) continue;
      box.setFromObject(mesh);
      if (!isFinite(box.min.x) || box.isEmpty()) continue;

      // Project all 8 corners of the world-space AABB.
      const mn = box.min, mx = box.max;
      const corners = [
        [mn.x, mn.y, mn.z], [mx.x, mn.y, mn.z],
        [mn.x, mx.y, mn.z], [mx.x, mx.y, mn.z],
        [mn.x, mn.y, mx.z], [mx.x, mn.y, mx.z],
        [mn.x, mx.y, mx.z], [mx.x, mx.y, mx.z],
      ];
      for (const [x, y, z] of corners) {
        v.set(x, y, z).project(camera);
        const sx = ((v.x + 1) / 2) * rect.width + rect.left;
        const sy = ((-v.y + 1) / 2) * rect.height + rect.top;
        if (sx < minX) minX = sx;
        if (sy < minY) minY = sy;
        if (sx > maxX) maxX = sx;
        if (sy > maxY) maxY = sy;
        any = true;
      }
    }

    if (!any) {
      el.style.display = 'none';
      this.hugRectScreen = null;
      return;
    }

    // Pad the outline so it reads as a halo around the cards rather
    // than a tight frame pressed into them. The padding is the SAME
    // value we test against in hit detection, so clicks that land just
    // outside the visual edge still register as "inside the hug zone".
    const padding = 10;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    this.hugRectScreen = { minX, minY, maxX, maxY };
    el.style.display = 'block';
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${maxX - minX}px`;
    el.style.height = `${maxY - minY}px`;
  }

  /** True if the given client-space point is inside the current hug rect. */
  isPointInsideHugRect(clientX, clientY) {
    const r = this.hugRectScreen;
    if (!r) return false;
    return clientX >= r.minX && clientX <= r.maxX && clientY >= r.minY && clientY <= r.maxY;
  }

  /**
   * Freeze all member bodies in a group by making them STATIC.
   * Static bodies are immovable (no gravity, no solver jitter) but
   * other dynamic bodies still collide with them, so a stack sitting
   * on the table blocks anything dropped on top.
   *
   * Inspired by how Tabletop Simulator handles grouped cards: instead
   * of N bodies with fragile constraints, the group is treated as one
   * immovable object until the user explicitly picks it up.
   */
  freezeGroup(groupId) {
    const members = this.groups.get(groupId);
    if (!members) return;
    for (const cardId of members) {
      const body = this.meshes.get(cardId)?.userData?.body;
      if (!body) continue;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.type = CANNON.Body.STATIC;
      body.collisionResponse = true;
    }
  }

  /** Return all member bodies to DYNAMIC so physics can act on them. */
  unfreezeGroup(groupId) {
    const members = this.groups.get(groupId);
    if (!members) return;
    for (const cardId of members) {
      const body = this.meshes.get(cardId)?.userData?.body;
      if (!body) continue;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.type = CANNON.Body.DYNAMIC;
      body.collisionResponse = true;
      body.wakeUp();
    }
  }

  /**
   * Assign a groupId to a list of card ids. Bodies are left DYNAMIC
   * for a brief settling period (so gravity pulls them onto the table),
   * then a delayed freeze switches them to STATIC. No constraints are
   * used — static bodies can't move, so the group is perfectly rigid.
   */
  assignGroup(groupId, cardIds) {
    const members = new Set();
    const affectedOldGroups = new Set();
    for (const cardId of cardIds) {
      const mesh = this.meshes.get(cardId);
      if (!mesh) continue;
      const instance = mesh.userData.cardInstance;
      if (instance.groupId && instance.groupId !== groupId) {
        const old = this.groups.get(instance.groupId);
        if (old) {
          old.delete(cardId);
          affectedOldGroups.add(instance.groupId);
          if (old.size === 0) this.groups.delete(instance.groupId);
        }
      }
      instance.groupId = groupId;
      members.add(cardId);
    }
    if (members.size === 0) return;
    this.groups.set(groupId, members);

    // Schedule freeze after a settling window so gravity can pull
    // the cards onto the table first.
    this.groupSettleTimes.set(groupId, performance.now());

    // Any old groups that lost members: if they still have 2+ members
    // they stay valid. Otherwise dissolve.
    for (const oldGroupId of affectedOldGroups) {
      const remaining = this.groups.get(oldGroupId);
      if (!remaining || remaining.size < 2) {
        if (remaining) {
          for (const id of remaining) {
            const m = this.meshes.get(id);
            if (m?.userData?.cardInstance) delete m.userData.cardInstance.groupId;
          }
          this.groups.delete(oldGroupId);
          this.groupSettleTimes.delete(oldGroupId);
        }
      }
    }

    this.updateSelectionHighlights();
  }

  /** Dissolve a group. Unfreezes members back to DYNAMIC. */
  dissolveGroup(groupId) {
    this.unfreezeGroup(groupId);
    const members = this.groups.get(groupId);
    if (!members) return;
    for (const cardId of members) {
      const mesh = this.meshes.get(cardId);
      if (mesh?.userData?.cardInstance) {
        delete mesh.userData.cardInstance.groupId;
      }
    }
    this.groups.delete(groupId);
    this.groupSettleTimes.delete(groupId);
    this.updateSelectionHighlights();
  }

  /**
   * Remove a card from whatever group it belongs to. Dissolves the
   * group entirely if it drops below 2 members.
   */
  evictCardFromGroup(cardId) {
    const mesh = this.meshes.get(cardId);
    const gid = mesh?.userData?.cardInstance?.groupId;
    if (!gid) return;
    const members = this.groups.get(gid);
    if (!members) return;
    members.delete(cardId);
    delete mesh.userData.cardInstance.groupId;
    // Make the evicted card dynamic again
    const body = mesh.userData?.body;
    if (body && body.type === CANNON.Body.STATIC) {
      body.type = CANNON.Body.DYNAMIC;
      body.wakeUp();
    }
    if (members.size < 2) {
      // Singleton — dissolve the remainder
      for (const remainingId of members) {
        const m = this.meshes.get(remainingId);
        if (m?.userData?.cardInstance) delete m.userData.cardInstance.groupId;
        const b = m?.userData?.body;
        if (b && b.type === CANNON.Body.STATIC) {
          b.type = CANNON.Body.DYNAMIC;
          b.wakeUp();
        }
      }
      this.groups.delete(gid);
      this.groupSettleTimes.delete(gid);
    }
  }

  findHitObject(hitObject) {
    let obj = hitObject;
    while (obj) {
      if (obj.userData?.type === 'card' || obj.userData?.type === 'pile' || obj.userData?.type === 'token' || obj.userData?.type === 'dice' || obj.userData?.type === 'trackerButton' || obj.userData?.type === 'lifeButton') return obj;
      obj = obj.parent;
    }
    return hitObject;
  }

  handleMouseDown = (event) => {
    // Spectators can orbit the camera (right-click / middle-click) but can't interact with cards
    if (this.props.isSpectating) {
      if (event.button !== 0) return; // allow non-left-click through for camera
      return;
    }
    if (event.button !== 0) return;
    this.setState({ contextMenu: null, ringMenu: null });

    if (this.state.isPlacingSpawns && this.state.activeSpawnKey) {
      const point = this.scene.raycastTablePoint(event);
      if (point) {
        const key = this.state.activeSpawnKey;
        const newConfig = { ...this.state.spawnConfig, [key]: { x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10 } };
        this.setState({ spawnConfig: newConfig, activeSpawnKey: null });
        // spawn config is hardcoded — no persistence
        this.updateSpawnMarkers(newConfig);
      }
      return;
    }

    if (this.state.isPlacingSpawns && this.state.trackerEditing) {
      const point = this.scene.raycastTablePoint(event);
      if (!point) return;
      const { trackerKey, player, flatIndex } = this.state.trackerEditing;
      const { row, index } = indexToRowPosition(trackerKey, flatIndex);
      const roundedPoint = { x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10 };

      const newConfig = { ...this.state.spawnConfig };
      setTrackerPosition(newConfig, player, trackerKey, row, index, roundedPoint);

      this.addTrackerPreview(roundedPoint.x, roundedPoint.z);

      const total = getTotalPositions(trackerKey);
      const nextIndex = flatIndex + 1;
      if (nextIndex >= total) {
        this.setState({ spawnConfig: newConfig, trackerEditing: null }, () => {
          this.createTrackerTokens();
          this.createTrackerButtons();
        });
        this.clearTrackerPreviews();
        this.hideTrackerCursorPreview();
      } else {
        this.setState({ spawnConfig: newConfig, trackerEditing: { trackerKey, player, flatIndex: nextIndex } });
      }
      // spawn config is hardcoded — no persistence
      return;
    }

    // Priority raycast: check life buttons first (they're children of cards, so
    // the general raycast hits the card before the button)
    const lifeButtonMeshes = [];
    for (const hud of this.lifeHUDs.values()) {
      lifeButtonMeshes.push(hud.plusMesh, hud.minusMesh, hud.hpPlusMesh, hud.hpMinusMesh);
    }
    if (lifeButtonMeshes.length > 0) {
      const lifeHits = this.scene.raycastObjects(event, lifeButtonMeshes);
      if (lifeHits.length > 0) {
        const btn = lifeHits[0].object;
        if (btn?.userData?.type === 'lifeButton') {
          this.applyLifeButton(btn.userData);
          event.preventDefault();
          return;
        }
      }
    }

    const hits = this.scene.raycastObjects(event, this.getInteractableMeshes());
    if (hits.length === 0) {
      // Empty board click. Before starting a fresh marquee, check
      // whether the click landed INSIDE the persistent hug outline of
      // the current selection — if it did, the user is picking up
      // the whole selection from a gap between cards, not starting a
      // new selection.
      if (this.isPointInsideHugRect(event.clientX, event.clientY) && this.selectedCardIds.size > 0) {
        const point = this.scene.raycastTablePoint(event);
        if (point) {
          this.startCardDrag({
            primaryMesh: null,
            dragIds: new Set(this.collectHighlightedCardIds()),
            anchorX: point.x,
            anchorZ: point.z,
          });
          event.preventDefault();
          return;
        }
      }

      // Not inside the hug zone — fresh marquee drag-select. Clear
      // any existing selection first. Marquee state lives on `this`
      // (not in React state) so mouse-move can render at 60fps
      // without triggering re-renders.
      this.selectedCardIds.clear();
      this.updateSelectionHighlights();
      this.marquee = {
        originX: event.clientX,
        originY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
      };
      this.renderMarqueeOverlay();
      event.preventDefault();
      return;
    }

    const hit = this.findHitObject(hits[0].object);

    // Drag existing token
    if (hit?.userData.type === 'token') {
      this.dragging = {
        mesh: hit,
        tokenInstance: hit.userData.tokenInstance,
        offsetX: 0,
        offsetZ: 0,
      };
      hit.position.y = TOKEN_DRAG_Y;
      event.preventDefault();
      return;
    }

    // Drag dice
    if (hit?.userData.type === 'dice') {
      this.dragging = {
        mesh: hit,
        diceInstance: hit.userData.diceInstance,
        offsetX: 0,
        offsetZ: 0,
      };
      hit.position.y = DICE_DRAG_Y;
      playSound('cardPickup');
      event.preventDefault();
      return;
    }

    // Life counter +/- button click on cards
    if (hit?.userData.type === 'lifeButton') {
      this.applyLifeButton(hit.userData);
      event.preventDefault();
      return;
    }

    // Tracker +/- button click
    if (hit?.userData.type === 'trackerButton') {
      const { action, player, trackerKey } = hit.userData;
      if (action === 'increment' || action === 'integrated') this.incrementTracker(player, trackerKey);
      else this.decrementTracker(player, trackerKey);
      event.preventDefault();
      return;
    }

    // Single-click draw from your own Spellbook or Atlas. Only these
    // two piles support click-to-draw — Cemetery and Collection are
    // managed via right-click search. The ownership check prevents
    // drawing from the opponent's piles.
    if (hit?.userData.type === 'pile') {
      const pile = hit.userData.pile;
      if (this.isOwnedPile(pile) && (pile.name === 'Spellbook' || pile.name === 'Atlas')) {
        this.drawCard(pile.id);
        event.preventDefault();
      }
      return;
    }

    if (hit?.userData.type === 'card') {
      if (!this.isOwnedCard(hit.userData.cardInstance)) return;
      if (event.shiftKey) {
        // Shift-click: defer to mouseup for the status ring menu.
        this._pendingCardClick = {
          hit,
          x: event.clientX,
          y: event.clientY,
          shiftKey: true,
        };
        event.preventDefault();
        return;
      }
      // Normal click: start drag immediately.
      const primaryId = hit.userData.cardInstance.id;
      const dragIds = this.collectDragGroupForCard(primaryId);
      this.startCardDrag({
        primaryMesh: hit,
        dragIds,
        anchorX: hit.position.x,
        anchorZ: hit.position.z,
      });
      event.preventDefault();
      return;
    }
  };

  /**
   * Pick up a single card OR a whole selection/group starting from the
   * given hit mesh. Builds this.dragging.members with one entry per card
   * to drag; the single-card case falls out naturally as a members array
   * of length 1.
   */
  /**
   * Pick up a single card, a selection, or a group.
   *
   * `primaryMesh` is the card the user clicked (or null when dragging
   * from an empty spot inside the hug rect). `dragIds` is the set of
   * cards that should travel together. `anchorX`/`anchorZ` is the
   * world-space point each member's offset is computed against — for
   * card-clicks, this is the primary's own position; for hug-drags,
   * it's the raycast table point under the cursor. Both cases converge
   * in handleMouseMove, which just adds (point + offset) per member.
   */
  startCardDrag({ primaryMesh, dragIds, anchorX, anchorZ }) {
    // If the click is on an unrelated card (not in selection, not in a
    // group), clicking it clears any leftover marquee selection.
    if (primaryMesh) {
      const primaryId = primaryMesh.userData.cardInstance.id;
      if (!this.selectedCardIds.has(primaryId) && !primaryMesh.userData.cardInstance.groupId) {
        if (this.selectedCardIds.size > 0) {
          this.selectedCardIds.clear();
          this.updateSelectionHighlights();
        }
      }
    }

    const baseDragY = this.scene.CARD_DRAG_Y;
    const dragIdSet = dragIds instanceof Set ? dragIds : new Set(dragIds);

    // Collect every member with its ORIGINAL world pose at pickup
    // time. Offsets and initialY are stored per-member and never
    // recomputed mid-drag, so two grouped + stacked cards keep their
    // original vertical separation for the entire drag. The group
    // travels as one rigid card while every body stays a normal
    // collider that scatters non-group stacks just like a single
    // dragged card would.
    const members = [];
    let lowestMember = null;
    for (const cardId of dragIdSet) {
      const mesh = this.meshes.get(cardId);
      if (!mesh) continue;
      const m = {
        mesh,
        cardInstance: mesh.userData.cardInstance,
        offsetX: mesh.position.x - anchorX,
        offsetZ: mesh.position.z - anchorZ,
        initialY: mesh.position.y,
      };
      members.push(m);
      if (!lowestMember || m.initialY < lowestMember.initialY) lowestMember = m;
    }

    // Compute the initial lift delta that puts the lowest member
    // above the stack it sits on (minus its own group-mates, which
    // dragIdSet excludes). Every member is shifted by the SAME delta
    // so relative stacking is preserved.
    let liftDelta = 0;
    if (lowestMember) {
      const stackTop = this.findStackHeightAt(
        lowestMember.mesh.position.x,
        lowestMember.mesh.position.z,
        dragIdSet
      );
      const lowestTargetY = Math.max(baseDragY, stackTop + CARD_THICKNESS + 1);
      liftDelta = Math.max(0, lowestTargetY - lowestMember.initialY);
    }

    // Claim ownership, flip each body kinematic (still colliding, so
    // the group can scatter non-group stacks it crosses the same way
    // a single card can), and write the lifted world pose. Intra-
    // group jitter is prevented by passing the full dragIdSet to
    // findStackHeightAt — members never lift to clear each other.
    for (const m of members) {
      const cardId = m.cardInstance.id;
      if (!this.ownership.is(cardId, 'local')) {
        this.ownership.setLocal(cardId);
        this.sync.claimCard(cardId);
      }
      setBodyKinematic(m.mesh.userData.body);
      const y = m.initialY + liftDelta;
      m.mesh.position.y = y;
      moveKinematicBody(m.mesh.userData.body, m.mesh.position.x, y, m.mesh.position.z);
    }

    this.dragging = {
      mesh: primaryMesh, // may be null for hug-drag
      cardInstance: primaryMesh?.userData?.cardInstance || null,
      offsetX: 0,
      offsetZ: 0,
      // Legacy field kept so unrelated consumers still see a number.
      dragY: (lowestMember ? lowestMember.initialY + liftDelta : baseDragY),
      members,
      // Cache the set of dragging ids once — handleMouseMove reuses
      // it so findStackHeightAt skips every member in O(1) per hit.
      draggingIds: dragIdSet,
      // Monotonic shared lift applied to every member's initialY.
      // Only grows during the drag (never drops) so the group
      // doesn't yo-yo as the cursor crosses uneven terrain.
      liftDelta,
    };
    playSound('cardPickup');
  }

  handleMouseMove = (event) => {
    this.lastMouseEvent = event;

    // Pending shift-click for ring menu: cancel if cursor drifts too far.
    if (this._pendingCardClick) {
      const dx = event.clientX - this._pendingCardClick.x;
      const dy = event.clientY - this._pendingCardClick.y;
      if (dx * dx + dy * dy > 25) {
        this._pendingCardClick = null;
      }
      return;
    }

    // Marquee drag: update the overlay rect and recompute the selection
    // from every card whose screen-projected position sits inside it.
    if (this.marquee) {
      this.marquee.currentX = event.clientX;
      this.marquee.currentY = event.clientY;
      this.renderMarqueeOverlay();

      const minX = Math.min(this.marquee.originX, this.marquee.currentX);
      const maxX = Math.max(this.marquee.originX, this.marquee.currentX);
      const minY = Math.min(this.marquee.originY, this.marquee.currentY);
      const maxY = Math.max(this.marquee.originY, this.marquee.currentY);

      const nextSelection = new Set();
      for (const [cardId, mesh] of this.meshes) {
        const screen = this.worldPositionToScreen(mesh.position);
        if (!screen) continue;
        if (screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY) {
          nextSelection.add(cardId);
        }
      }
      if (nextSelection.size !== this.selectedCardIds.size ||
          [...nextSelection].some((id) => !this.selectedCardIds.has(id))) {
        this.selectedCardIds = nextSelection;
        this.updateSelectionHighlights();
      }
      return;
    }

    if (this.dragging) {
      const point = this.scene.raycastTablePoint(event);
      if (!point) return;

      // Dice and token drags have no `members` — handle them here
      // before the card-specific group-drag logic below.
      if (this.dragging.diceInstance || this.dragging.tokenInstance) {
        this.dragging.mesh.position.x = point.x + this.dragging.offsetX;
        this.dragging.mesh.position.z = point.z + this.dragging.offsetZ;
        return;
      }

      // Every member travels as part of a single rigid group. Single-
      // card drags are synthesised as a 1-member array so the loop
      // below handles both paths.
      const members = this.dragging.members;
      if (!members || members.length === 0) return;

      const draggingIds = this.dragging.draggingIds;

      // Find the member with the lowest initialY — that's the one
      // whose target position drives the group-wide stack-clear
      // math. Cached on the dragging record so we only walk the
      // member list once per drag, not per move event.
      let lowestMember = this.dragging._lowestMember;
      if (!lowestMember) {
        for (const m of members) {
          if (!lowestMember || m.initialY < lowestMember.initialY) lowestMember = m;
        }
        this.dragging._lowestMember = lowestMember;
      }

      // Compute where the lowest member WOULD land, then derive the
      // required shared lift to clear the stack at that point. The
      // result is a SINGLE group-wide liftDelta, so every member
      // keeps its original relative vertical offset and the group
      // moves as one frozen rigid object.
      const lowestTargetX = point.x + lowestMember.offsetX;
      const lowestTargetZ = point.z + lowestMember.offsetZ;
      const stackTop = this.findStackHeightAt(lowestTargetX, lowestTargetZ, draggingIds);
      const neededLowestY = Math.max(this.scene.CARD_DRAG_Y, stackTop + CARD_THICKNESS + 1);
      const neededLift = Math.max(0, neededLowestY - lowestMember.initialY);
      // Monotonic — never drops during a drag.
      if (neededLift > this.dragging.liftDelta) this.dragging.liftDelta = neededLift;
      const liftDelta = this.dragging.liftDelta;

      // Apply the shared (dx, dy, dz) delta to every member. Each
      // member's Y is initialY + liftDelta, so two stacked cards
      // stay stacked at the same vertical separation they had when
      // the drag started.
      for (const m of members) {
        const targetX = point.x + m.offsetX;
        const targetZ = point.z + m.offsetZ;
        const targetY = m.initialY + liftDelta;
        m.mesh.position.x = targetX;
        m.mesh.position.y = targetY;
        m.mesh.position.z = targetZ;
        moveKinematicBody(m.mesh.userData.body, targetX, targetY, targetZ);
      }
      // Legacy field kept in sync for any consumer still reading it.
      this.dragging.dragY = lowestMember.initialY + liftDelta;
      return;
    }

    // Move tracker cursor preview with mouse
    if (this.state.isPlacingSpawns && this.state.trackerEditing && this.trackerCursorPreview) {
      const point = this.scene.raycastTablePoint(event);
      if (point) {
        this.trackerCursorPreview.position.x = Math.round(point.x * 10) / 10;
        this.trackerCursorPreview.position.z = Math.round(point.z * 10) / 10;
        this.trackerCursorPreview.visible = true;
      }
    }

    const hits = this.scene.raycastObjects(event, this.getInteractableMeshes());
    const hit = hits.length > 0 ? this.findHitObject(hits[0].object) : null;
    const newHovered = (hit?.userData?.type === 'card' || hit?.userData?.type === 'pile' || hit?.userData?.type === 'token' || hit?.userData?.type === 'dice' || hit?.userData?.type === 'trackerButton' || hit?.userData?.type === 'lifeButton') ? hit : null;

    if (this.hoveredMesh !== newHovered) {

      // Remove highlight from old — restore to the correct base state
      // rather than always resetting to black. If the opponent is
      // hovering the card or it's in our marquee selection, those
      // highlights take priority over the blank state.
      if (this.hoveredMesh?.material) {
        if (this.hoveredMesh.userData?.action === 'integrated') {
          this.hoveredMesh.material.opacity = 0;
        } else {
          const oldCardId = this.hoveredMesh.userData?.cardInstance?.id;
          const isOpponentHover = oldCardId && oldCardId === this.opponentHoveredCardId;
          const isSelected = oldCardId && this.selectedCardIds.has(oldCardId);
          const restoreHex = isSelected ? 0x5a3f0a : isOpponentHover ? 0x0f2a55 : 0x000000;
          const mats = Array.isArray(this.hoveredMesh.material) ? this.hoveredMesh.material : [this.hoveredMesh.material];
          mats.forEach((m) => { if (m.emissive) m.emissive.setHex(restoreHex); });
        }
      }
      // Add highlight to new
      if (newHovered?.material) {
        if (newHovered.userData?.action === 'integrated') {
          // Integrated button: show subtle transparent highlight on hover
          newHovered.material.color.setHex(0xffffff);
          newHovered.material.opacity = 0.15;
        } else {
          const mats = Array.isArray(newHovered.material) ? newHovered.material : [newHovered.material];
          mats.forEach((m) => { if (m.emissive) m.emissive.setHex(0x222222); });
        }
      }
      this.hoveredMesh = newHovered;
      this.canvasRef.current.style.cursor = newHovered
        ? "url('/cursors/pointer.png') 20 4, pointer"
        : "url('/cursors/default.png') 4 2, auto";

      // Broadcast to the opponent which card we're hovering so they
      // see a highlight on their board. Only cards are interesting —
      // piles, tokens, and buttons don't need remote feedback.
      const hoveredCardId = newHovered?.userData?.type === 'card'
        ? newHovered.userData.cardInstance?.id
        : null;
      this.sync.hoverCard(hoveredCardId);
    }

  };

  handleMouseUp = (event) => {
    if (this.props.isSpectating) return; // No click actions for spectators

    // Quick click on a card (no drag started): show the status ring menu.
    if (this._pendingCardClick) {
      const { hit, x, y } = this._pendingCardClick;
      this._pendingCardClick = null;
      const card = hit.userData.cardInstance;
      if (card) {
        playUI(UI.SELECT);
        this.setState({
          ringMenu: { cardInstance: card, x: event.clientX, y: event.clientY },
        });
      }
      return;
    }

    // Finish a marquee selection: clear the transient rect and the
    // overlay DOM, leaving this.selectedCardIds populated for the
    // subsequent drag/right-click.
    if (this.marquee) {
      this.marquee = null;
      this.renderMarqueeOverlay();
      return;
    }

    if (!this.dragging) return;

    const droppedMesh = this.dragging.mesh;

    // Token drop — simple position update
    if (this.dragging.tokenInstance) {
      const token = this.dragging.tokenInstance;
      token.x = droppedMesh.position.x;
      token.z = droppedMesh.position.z;
      droppedMesh.position.y = TOKEN_REST_Y;
      this.dragging = null;
      return;
    }

    // Dice drop
    if (this.dragging.diceInstance) {
      const dice = this.dragging.diceInstance;
      dice.x = droppedMesh.position.x;
      dice.z = droppedMesh.position.z;
      droppedMesh.position.y = DICE_REST_Y;
      playSound('cardPlace');
      this.sync.moveDice(dice.id, dice.x, dice.z);
      this.dragging = null;
      return;
    }

    // Card drop — hand every dragged body back to physics. Gravity
    // and contact solving resolve the final pose naturally; the per-
    // frame tickPhysicsSync emits card:release when each body
    // settles asleep. For multi-card group drags, the members fall
    // together with their preserved relative Y offsets (kinematic
    // →dynamic transition zeros velocity) so stacking is maintained.
    const members = this.dragging.members || [{ mesh: droppedMesh }];
    for (const m of members) {
      if (m.mesh?.userData?.body) setBodyDynamic(m.mesh.userData.body);
    }
    // If any dropped card belongs to a group, reset the settle timer
    // so the group re-freezes to STATIC after 2s of settling.
    const droppedGroupIds = new Set();
    for (const m of members) {
      const gid = m.mesh?.userData?.cardInstance?.groupId;
      if (gid && !droppedGroupIds.has(gid)) {
        droppedGroupIds.add(gid);
        this.groupSettleTimes.set(gid, performance.now());
      }
    }
    playSound('cardPlace');
    this.dragging = null;
  };

  /**
   * Write the current this.marquee state into the DOM overlay div
   * directly, bypassing React state — this runs on every mouse-move
   * while the marquee is active and state churn would be wasteful.
   * Called with null (or an absent marquee) to hide the overlay.
   */
  renderMarqueeOverlay() {
    const el = this.marqueeOverlayRef.current;
    if (!el) return;
    if (!this.marquee) {
      el.style.display = 'none';
      return;
    }
    const minX = Math.min(this.marquee.originX, this.marquee.currentX);
    const maxX = Math.max(this.marquee.originX, this.marquee.currentX);
    const minY = Math.min(this.marquee.originY, this.marquee.currentY);
    const maxY = Math.max(this.marquee.originY, this.marquee.currentY);
    el.style.display = 'block';
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${maxX - minX}px`;
    el.style.height = `${maxY - minY}px`;
  }

  /**
   * Window-level mouseup: clean up marquee state that may have been left
   * behind when the drag left the canvas bounds. The canvas-level
   * handleMouseUp covers the common case; this is the backstop.
   */
  handleWindowMouseUp = (event) => {
    if (this.marquee) {
      this.marquee = null;
      this.renderMarqueeOverlay();
    }
  };

  /**
   * Window-level Escape: abort an active marquee, and (on a second
   * press, or if there's no marquee) clear the current selection.
   * Input elements keep their own keydown handling — we bail if the
   * event originated from one.
   */
  handleWindowKeyDown = (event) => {
    const target = event.target;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

    if (event.key === 'Escape') {
      if (this.marquee) {
        this.marquee = null;
        this.renderMarqueeOverlay();
        return;
      }
      if (this.selectedCardIds.size > 0) {
        this.selectedCardIds.clear();
        this.updateSelectionHighlights();
      }
      return;
    }

    if (event.key === 'g' || event.key === 'G') {
      // Ignore while modifier keys are held so it doesn't fight
      // browser / OS shortcuts (⌘G, Ctrl+G find, etc.).
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      this.toggleGroupForSelection();
      event.preventDefault();
    }
  };

  /**
   * `G` hotkey handler. Toggles grouping for the current marquee
   * selection:
   *   - if every selected card is already in the same single group,
   *     dissolve that group
   *   - otherwise, if 2+ cards are selected, group them all into a
   *     fresh group (the assignGroup eviction logic absorbs any
   *     members that were in a different group)
   *   - selections of 0 or 1 cards do nothing
   *
   * Broadcasts the change via the existing group:set / group:clear
   * sync bridge methods so the opponent's client stays in lockstep.
   */
  toggleGroupForSelection() {
    const ids = [...this.selectedCardIds];
    if (ids.length === 0) return;

    // Detect the "already a single cohesive group" case. When true,
    // hitting G should ungroup — anything else (mixed groups, no
    // groups at all) should group into one.
    let sharedGid = null;
    let cohesive = false;
    if (ids.length >= 2) {
      const first = this.meshes.get(ids[0]);
      const gid = first?.userData?.cardInstance?.groupId || null;
      if (gid) {
        cohesive = ids.every((id) => {
          const mesh = this.meshes.get(id);
          return mesh?.userData?.cardInstance?.groupId === gid;
        });
        if (cohesive) sharedGid = gid;
      }
    }

    if (cohesive && sharedGid) {
      this.dissolveGroup(sharedGid);
      this.sync.clearGroup(sharedGid);
      return;
    }

    if (ids.length >= 2) {
      const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.assignGroup(groupId, ids);
      this.sync.setGroup(groupId, ids);
    }
  }

  handleDoubleClick = (event) => {
    const hits = this.scene.raycastObjects(event, this.getInteractableMeshes());
    if (hits.length === 0) return;

    const hit = this.findHitObject(hits[0].object);
    if (!hit) return;

    if (hit.userData.type === 'pile') {
      if (!this.isOwnedPile(hit.userData.pile)) return;
      this.drawCard(hit.userData.pile.id);
      return;
    }

    if (hit.userData.type === 'card') {
      const card = hit.userData.cardInstance;
      if (card.isSite) return;
      card.tapped = !card.tapped;
      animateCardTap(hit, card);
      this.sync.tapCard(card.id, card.tapped);
    }
  };

  handleContextMenu = (event) => {
    event.preventDefault();

    const hits = this.scene.raycastObjects(event, this.getInteractableMeshes());
    if (hits.length === 0) {
      this.setState({ contextMenu: null });
      return;
    }

    const hit = this.findHitObject(hits[0].object);
    if (!hit) { this.setState({ contextMenu: null }); return; }

    // Integrated tracker button: right-click = decrement
    if (hit.userData.type === 'trackerButton' && hit.userData.action === 'integrated') {
      this.decrementTracker(hit.userData.player, hit.userData.trackerKey);
      return;
    }

    if (hit.userData.type === 'card') {
      const cardInstance = hit.userData.cardInstance;
      // Block context menu on opponent's cards — the only permitted
      // interaction with the opponent's side is viewing their cemetery
      // (which goes through the pile branch below, not this one).
      if (!this.isOwnedCard(cardInstance)) return;

      // Include enough info for the menu to decide whether to show
      // Group selected / Ungroup.
      const selectedIds = [...this.selectedCardIds];
      let selectionAlreadyGrouped = false;
      if (selectedIds.length >= 2) {
        const firstMesh = this.meshes.get(selectedIds[0]);
        const sharedGid = firstMesh?.userData?.cardInstance?.groupId || null;
        if (sharedGid) {
          selectionAlreadyGrouped = selectedIds.every((id) => {
            const m = this.meshes.get(id);
            return m?.userData?.cardInstance?.groupId === sharedGid;
          });
        }
      }
      this.setState({
        contextMenu: {
          x: event.clientX,
          y: event.clientY,
          type: 'card',
          cardInstance,
          mesh: hit,
          selectionSize: this.selectedCardIds.size,
          groupId: cardInstance.groupId || null,
          selectedIds,
          selectionAlreadyGrouped,
        },
      });
    } else if (hit.userData.type === 'pile') {
      if (!this.isOwnedPile(hit.userData.pile)) return;
      this.setState({
        contextMenu: {
          x: event.clientX,
          y: event.clientY,
          type: 'pile',
          pile: hit.userData.pile,
        },
      });
    } else if (hit.userData.type === 'token') {
      this.setState({
        contextMenu: {
          x: event.clientX,
          y: event.clientY,
          type: 'token',
          tokenInstance: hit.userData.tokenInstance,
        },
      });
    } else if (hit.userData.type === 'dice') {
      this.setState({
        contextMenu: {
          x: event.clientX,
          y: event.clientY,
          type: 'dice',
          diceInstance: hit.userData.diceInstance,
        },
      });
    }
  };

  // --- Spawn Point Markers ---

  updateSpawnMarkers = (config) => {
    // Remove old markers
    for (const [, mesh] of this.spawnMarkers) {
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.spawnMarkers.clear();

    if (!this.state.isPlacingSpawns) return;

    for (const [key, label] of Object.entries(SPAWN_LABELS)) {
      const point = getSpawnPoint(config, key);
      const color = SPAWN_COLORS[key] || '#ffffff';

      const geo = new THREE.RingGeometry(1.5, 2, 32);
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(point.x, 0.2, point.z);
      this.scene.scene.add(mesh);
      this.spawnMarkers.set(key, mesh);
    }
  };

  clearTrackerPreviews = () => {
    for (const mesh of this.trackerPreviewMarkers) {
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.trackerPreviewMarkers = [];
  };

  trackerMeshKey = (player, trackerKey, row) => `${player}_${trackerKey}_${row || 'single'}`;

  createTrackerTokens = () => {
    for (const [, mesh] of this.trackerTokenMeshes) {
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m?.dispose());
    }
    this.trackerTokenMeshes.clear();

    const { spawnConfig, gameState } = this.state;

    for (const player of PLAYERS) {
      for (const [trackerKey, def] of Object.entries(TRACKER_DEFS)) {
        if (!isTrackerConfigured(spawnConfig, player, trackerKey, def)) continue;

        const value = gameState.trackers[player][trackerKey];
        const positions = valueToPositions(trackerKey, value);
        const topTexture = TRACKER_TOKEN_TEXTURES[trackerKey];

        for (const { row, posIndex } of positions) {
          const pos = getTrackerTokenPosition(spawnConfig, player, trackerKey, row, posIndex);
          if (!pos) continue;

          const meshKey = this.trackerMeshKey(player, trackerKey, row);
          const tokenInstance = {
            id: `tracker-${player}-${trackerKey}-${row || 'single'}`,
            x: pos.x,
            z: pos.z,
            color: 'red',
            topTexture,
            flip: player === 'p2',
          };
          const mesh = createTokenMesh(tokenInstance);
          this.scene.scene.add(mesh);
          this.trackerTokenMeshes.set(meshKey, mesh);
        }
      }
    }
  };

  updateTrackerTokenPositions = () => {
    const { spawnConfig, gameState } = this.state;

    for (const player of PLAYERS) {
      for (const trackerKey of Object.keys(TRACKER_DEFS)) {
        const value = gameState.trackers[player][trackerKey];
        const positions = valueToPositions(trackerKey, value);

        for (const { row, posIndex } of positions) {
          const meshKey = this.trackerMeshKey(player, trackerKey, row);
          const mesh = this.trackerTokenMeshes.get(meshKey);
          if (!mesh) continue;

          const pos = getTrackerTokenPosition(spawnConfig, player, trackerKey, row, posIndex);
          if (pos) {
            mesh.position.x = pos.x;
            mesh.position.z = pos.z;
          }
        }
      }
    }
  };

  createTrackerButtons = () => {
    // Remove existing button meshes
    for (const [, mesh] of this.trackerButtonMeshes) {
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m?.dispose());
    }
    this.trackerButtonMeshes.clear();

    const { spawnConfig } = this.state;
    const btnRadius = 1.2;
    const btnHeight = 0.2;
    const btnRestY = btnHeight / 2 + 0.1;

    for (const player of PLAYERS) {
      for (const [trackerKey, def] of Object.entries(TRACKER_DEFS)) {
        if (!isTrackerConfigured(spawnConfig, player, trackerKey, def)) continue;

        const data = getTrackerPositions(spawnConfig, player, trackerKey);
        if (!data) continue;

        // Element affinities: single transparent button at stored position[0]
        if (def.integratedButton) {
          const btnPos = data[0];
          if (!btnPos) continue;

          const geo = new THREE.CylinderGeometry(btnRadius, btnRadius, btnHeight, 32);
          const mat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0,
            roughness: 0.5,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(btnPos.x, btnRestY, btnPos.z);
          mesh.userData = { type: 'trackerButton', action: 'integrated', player, trackerKey };
          this.scene.scene.add(mesh);
          this.trackerButtonMeshes.set(`${player}_${trackerKey}_integrated`, mesh);
          continue;
        }

        // Life/Mana: textured minus (-) and plus (+) buttons at computed offsets
        let firstPos, lastPos;
        if (def.rows) {
          firstPos = data.ones?.[0];
          lastPos = data.ones?.[data.ones.length - 1];
        } else {
          firstPos = data[0];
          lastPos = data[data.length - 1];
        }
        if (!firstPos || !lastPos) continue;

        const dx = lastPos.x - firstPos.x;
        const dz = lastPos.z - firstPos.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const nx = dx / len;
        const nz = dz / len;
        const offset = 3;

        const minusPos = { x: firstPos.x - nx * offset, z: firstPos.z - nz * offset };
        const plusPos = { x: lastPos.x + nx * offset, z: lastPos.z + nz * offset };

        const flip = player === 'p2';

        const minusMesh = createTokenButtonMesh({
          radius: btnRadius,
          height: btnHeight,
          topTextureUrl: TRACKER_BUTTON_TEXTURES.minus,
          flip,
        });
        minusMesh.position.set(minusPos.x, btnRestY, minusPos.z);
        minusMesh.userData = { type: 'trackerButton', action: 'decrement', player, trackerKey };
        this.scene.scene.add(minusMesh);
        this.trackerButtonMeshes.set(`${player}_${trackerKey}_minus`, minusMesh);

        const plusMesh = createTokenButtonMesh({
          radius: btnRadius,
          height: btnHeight,
          topTextureUrl: TRACKER_BUTTON_TEXTURES.plus,
          flip,
        });
        plusMesh.position.set(plusPos.x, btnRestY, plusPos.z);
        plusMesh.userData = { type: 'trackerButton', action: 'increment', player, trackerKey };
        this.scene.scene.add(plusMesh);
        this.trackerButtonMeshes.set(`${player}_${trackerKey}_plus`, plusMesh);
      }
    }
  };

  // Apply an in-HUD +/- button click on a minion's ATK or HP.
  // Mutates the card instance, updates the HUD sprite, and broadcasts the
  // new absolute value so both clients stay in sync (no action loss under
  // multiple rapid clicks because each broadcast carries the final number).
  applyLifeButton = ({ action, stat, cardId }) => {
    const cardMesh = this.meshes.get(cardId);
    if (!cardMesh) return;
    const card = cardMesh.userData.cardInstance;
    if (!this.isOwnedCard(card)) return;
    const hud = this.lifeHUDs.get(cardId);
    if (stat === 'atk') {
      if (action === 'increment') card.currentAttack = (card.currentAttack || 0) + 1;
      else card.currentAttack = Math.max(0, (card.currentAttack || 0) - 1);
      if (hud) updateLifeHUD(hud.sprite, card.currentAttack, 'atk');
      this.sync.setCardStat(cardId, 'atk', card.currentAttack);
    } else {
      if (action === 'increment') card.currentLife = (card.currentLife || 0) + 1;
      else card.currentLife = Math.max(0, (card.currentLife || 0) - 1);
      if (hud) updateLifeHUD(hud.hpSprite, card.currentLife, 'hp');
      this.sync.setCardStat(cardId, 'hp', card.currentLife);
    }
  };

  incrementTracker = (player, trackerKey) => {
    const def = TRACKER_DEFS[trackerKey];
    const { gameState } = this.state;
    if (gameState.trackers[player][trackerKey] < def.max) {
      gameState.trackers[player][trackerKey]++;
      playSound('uiClick');
      this.updateTrackerTokenPositions();
      this.forceUpdate();
      this.sync.setTracker(player, trackerKey, gameState.trackers[player][trackerKey]);
    }
  };

  decrementTracker = (player, trackerKey) => {
    const { gameState } = this.state;
    if (gameState.trackers[player][trackerKey] > 0) {
      gameState.trackers[player][trackerKey]--;
      playSound('uiClick');
      this.updateTrackerTokenPositions();
      this.forceUpdate();
      this.sync.setTracker(player, trackerKey, gameState.trackers[player][trackerKey]);
    }
  };

  addTrackerPreview = (x, z) => {
    const geometry = new THREE.CylinderGeometry(1.75, 1.75, 0.35, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.5 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.3, z);
    this.scene.scene.add(mesh);
    this.trackerPreviewMarkers.push(mesh);
  };

  showTrackerCursorPreview = () => {
    if (this.trackerCursorPreview) return;
    const geometry = new THREE.CylinderGeometry(1.75, 1.75, 0.35, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0.3, 0);
    mesh.visible = false;
    this.scene.scene.add(mesh);
    this.trackerCursorPreview = mesh;
  };

  hideTrackerCursorPreview = () => {
    if (!this.trackerCursorPreview) return;
    this.scene.scene.remove(this.trackerCursorPreview);
    this.trackerCursorPreview.geometry.dispose();
    this.trackerCursorPreview.material.dispose();
    this.trackerCursorPreview = null;
  };

  toggleSpawnEditor = () => {
    this.setState((state) => {
      const next = !state.isPlacingSpawns;
      if (next) {
        this.updateSpawnMarkers(state.spawnConfig);
      } else {
        for (const [, mesh] of this.spawnMarkers) {
          this.scene.scene.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
        this.spawnMarkers.clear();
        this.clearTrackerPreviews();
        this.hideTrackerCursorPreview();
      }
      return { isPlacingSpawns: next, activeSpawnKey: null, trackerEditing: null };
    });
  };

  // --- Game Actions ---

  drawCard = (pileId) => {
    const { gameState } = this.state;
    const pileMesh = this.pileMeshes.get(pileId);
    const pile = gameState.piles.find((p) => p.id === pileId);
    const card = drawFromPile(gameState, pileId);
    if (!card) return;
    playSound('cardDraw');

    // Broadcast the updated pile so the opponent sees it shrink
    if (pile) this.sync.syncPile(pile);

    // Animate card flying from pile to hand
    if (pileMesh && this.scene?.camera && this.canvasRef.current) {
      const pos = pileMesh.position.clone();
      pos.y += 2;
      pos.project(this.scene.camera);
      const canvas = this.canvasRef.current;
      const screenX = ((pos.x + 1) / 2) * canvas.clientWidth;
      const screenY = ((-pos.y + 1) / 2) * canvas.clientHeight;

      const flyCard = document.createElement('div');
      flyCard.style.cssText = `
        position: fixed; z-index: 2000; pointer-events: none;
        width: 80px; height: 112px; border-radius: 8px; overflow: hidden;
        left: ${screenX}px; top: ${screenY}px;
        transform: translate(-50%, -50%) scale(0.5);
        transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        box-shadow: 0 8px 30px rgba(0,0,0,0.5);
      `;
      const img = document.createElement('img');
      img.src = resolveLocalImageUrl(card.imageUrl);
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
      img.draggable = false;
      flyCard.appendChild(img);
      document.body.appendChild(flyCard);

      requestAnimationFrame(() => {
        flyCard.style.left = `${window.innerWidth / 2}px`;
        flyCard.style.top = `${window.innerHeight - 40}px`;
        flyCard.style.transform = 'translate(-50%, -50%) scale(1)';
        flyCard.style.opacity = '0.6';
      });

      setTimeout(() => {
        flyCard.remove();
      }, 450);
    }

    this.addToHand(card);
    this.setState((state) => ({ gameState: { ...state.gameState } }));
    this.updatePileMeshes();
  };

  playCardFromHand = (cardInstance, event) => {
    const point = this.scene.raycastTablePoint(event);
    if (!point) return;

    cardInstance.x = point.x;
    cardInstance.z = point.z;

    this.removeFromHand(cardInstance);
    this.addCardToTable(cardInstance);
    playSound('cardPlace');
  };

  addCardToTable = (cardInstance, broadcast = true) => {
    const mesh = createCardMesh(cardInstance);
    this.scene.scene.add(mesh);
    this.meshes.set(cardInstance.id, mesh);

    // Add ATK + HP HUD for minion-type cards only. Spells (Magic),
    // Auras, Artifacts, Sites, and Avatars have no combat stats.
    if (cardInstance.type === 'Minion') {
      if (cardInstance.currentLife === undefined || cardInstance.currentAttack === undefined) {
        const fullCard = this.props.sorceryCards?.find((c) => c.unique_id === cardInstance.cardId);
        const defense = parseInt(fullCard?.defense, 10);
        const power = parseInt(fullCard?.power, 10);
        if (cardInstance.currentLife === undefined) cardInstance.currentLife = defense > 0 ? defense : 0;
        if (cardInstance.currentAttack === undefined) cardInstance.currentAttack = power > 0 ? power : 0;
      }
      const hud = createLifeHUD(cardInstance);
      mesh.add(hud.sprite);      // ATK display
      mesh.add(hud.hpSprite);    // HP display
      mesh.add(hud.plusMesh);    // ATK +
      mesh.add(hud.minusMesh);   // ATK -
      mesh.add(hud.hpPlusMesh);  // HP +
      mesh.add(hud.hpMinusMesh); // HP -
      this.lifeHUDs.set(cardInstance.id, hud);
    }

    // Restore status effect badges (e.g. from session restore)
    if (cardInstance.statuses?.length > 0) {
      const badges = buildStatusBadges(cardInstance.statuses, cardInstance.isSite);
      for (const badge of badges) mesh.add(badge);
      this.statusHUDs.set(cardInstance.id, badges);
    }

    // Restore saved Y position (for stacked cards) or use default
    if (cardInstance.y !== undefined && cardInstance.y > 0) {
      mesh.position.y = cardInstance.y;
    }

    // Spawn ABOVE any existing stack at the target position so the
    // newly placed card always lands on top — never inside or below
    // an existing stack. The drop is what gives the "tossed onto the
    // table" feel; the dynamic height ensures it works for empty
    // patches and tall stacks alike.
    if (!this.sync.isSuppressed) {
      const stackTop = this.findStackHeightAt(mesh.position.x, mesh.position.z, cardInstance.id);
      mesh.position.y = stackTop + CARD_THICKNESS + 5;
    }

    // Create a matching dynamic body so cards collide and stack naturally.
    addCardBody(this.physicsWorld, mesh, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      thickness: CARD_THICKNESS,
    });

    if (broadcast) {
      this.sync.placeCard(cardInstance);
      // When the local player places a site, update their elemental
      // affinity counters AND add 1 mana immediately — in Sorcery,
      // a freshly played site produces mana the turn it enters.
      // Rubble and other "dead" sites (all thresholds 0) are excluded.
      if (cardInstance.isSite) {
        const player = cardInstance.rotated ? 'p2' : 'p1';
        this.recalculateSiteAffinities(player);
        if (this._siteProvidesMana(cardInstance)) {
          const { trackers } = this.state.gameState;
          const def = TRACKER_DEFS.mana;
          if (trackers[player].mana < def.max) {
            trackers[player].mana++;
            this.sync.setTracker(player, 'mana', trackers[player].mana);
            this.updateTrackerTokenPositions();
            this.forceUpdate();
          }
        }
      }
    }
  };

  removeCardFromTable = (cardInstance, broadcast = true) => {
    const mesh = this.meshes.get(cardInstance.id);
    if (mesh) {
      // Strip from any lock-constraint chain before the body is
      // destroyed so the chain is rebuilt around the survivors.
      this.evictCardFromGroup(cardInstance.id);
      // Tear down physics body before disposing the mesh.
      removeCardBody(this.physicsWorld, mesh);
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
      this.meshes.delete(cardInstance.id);
    }
    this.lifeHUDs.delete(cardInstance.id);
    this.statusHUDs.delete(cardInstance.id);
    this.selectedCardIds.delete(cardInstance.id);
    this.ownership.forget(cardInstance.id);
    if (broadcast) {
      this.sync.removeCard(cardInstance.id);
      if (cardInstance.isSite) {
        const player = cardInstance.rotated ? 'p2' : 'p1';
        this.recalculateSiteAffinities(player);
        if (this._siteProvidesMana(cardInstance)) {
          const { trackers } = this.state.gameState;
          if (trackers[player].mana > 0) {
            trackers[player].mana--;
            this.sync.setTracker(player, 'mana', trackers[player].mana);
            this.updateTrackerTokenPositions();
            this.forceUpdate();
          }
        }
      }
    }
  };

  sendToHand = (cardInstance) => {
    this.removeCardFromTable(cardInstance);
    this.addToHand(cardInstance);
    this.setState({ contextMenu: null });
  };

  deleteCard = (cardInstance) => {
    this.removeCardFromTable(cardInstance);
    this.setState({ contextMenu: null });
  };

  deleteToken = (tokenInstance) => {
    const mesh = this.tokenMeshes.get(tokenInstance.id);
    if (mesh) {
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.tokenMeshes.delete(tokenInstance.id);
    }
    const { gameState } = this.state;
    gameState.tokens = gameState.tokens.filter((t) => t.id !== tokenInstance.id);
    this.setState({ contextMenu: null });
  };

  spawnDice = (dieType) => {
    const diceInstance = createDiceInstance(0, 0, dieType);
    this.state.gameState.dice.push(diceInstance);
    const mesh = createDiceMesh(diceInstance);
    this.scene.scene.add(mesh);
    this.diceMeshes.set(diceInstance.id, mesh);
    playSound('diceRoll');
    this.sync.spawnDice(diceInstance);
    this.setState({ showDiceMenu: false });
  };

  rollDice = (diceInstance) => {
    const mesh = this.diceMeshes.get(diceInstance.id);
    if (!mesh) return;
    const faceCount = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 }[diceInstance.dieType] || 6;
    const targetValue = Math.ceil(Math.random() * faceCount);
    animateDiceRoll(mesh, targetValue);
    playSound('diceRoll');
    this.sync.rollDice(diceInstance.id, targetValue);
  };

  // ── Site-based resource tracking ────────────────────────────────
  //
  // Walks this.meshes to find all site cards owned by `player`, then
  // sets the elemental affinity trackers (earth, water, fire, wind) to
  // the sum of those sites' thresholds. Called whenever a site enters
  // or leaves the table.
  //
  // Mana is NOT touched here — it resets only on turn start (inside
  // passTurn) so that mid-turn spending isn't overwritten by placing a
  // new site.

  // Check whether a site card actually produces mana. Normal sites
  // contribute 1 mana each; Rubble (and any future "dead" sites) have
  // all thresholds at 0 and produce nothing.
  _siteProvidesMana = (cardInstance) => {
    const fullCard = this.props.sorceryCards?.find((c) => c.unique_id === cardInstance.cardId);
    if (!fullCard) return false;
    return ((fullCard.earthThreshold || 0) + (fullCard.waterThreshold || 0) +
            (fullCard.fireThreshold || 0) + (fullCard.airThreshold || 0)) > 0;
  };

  recalculateSiteAffinities = (player) => {
    const playerIsP2 = player === 'p2';
    const totals = { earth: 0, water: 0, fire: 0, wind: 0 };

    for (const [, mesh] of this.meshes) {
      const card = mesh.userData.cardInstance;
      if (!card || !card.isSite) continue;
      if (card.rotated !== playerIsP2) continue;

      const fullCard = this.props.sorceryCards?.find((c) => c.unique_id === card.cardId);
      if (!fullCard) continue;

      totals.earth += fullCard.earthThreshold || 0;
      totals.water += fullCard.waterThreshold || 0;
      totals.fire += fullCard.fireThreshold || 0;
      totals.wind += fullCard.airThreshold || 0; // card data uses "air", tracker uses "wind"
    }

    const { trackers } = this.state.gameState;
    let changed = false;
    for (const [key, value] of Object.entries(totals)) {
      if (trackers[player][key] !== value) {
        trackers[player][key] = value;
        this.sync.setTracker(player, key, value);
        changed = true;
      }
    }
    if (changed) {
      this.updateTrackerTokenPositions();
      this.forceUpdate();
    }
  };

  // Count only mana-producing sites (excludes Rubble and similar).
  countSitesForPlayer = (player) => {
    const playerIsP2 = player === 'p2';
    let count = 0;
    for (const [, mesh] of this.meshes) {
      const card = mesh.userData.cardInstance;
      if (card && card.isSite && card.rotated === playerIsP2 && this._siteProvidesMana(card)) count++;
    }
    return count;
  };

  passTurn = () => {
    const localPlayer = this.state.isHost ? 'p1' : 'p2';
    if (this.state.currentTurn !== localPlayer) return;
    const nextTurn = this.state.currentTurn === 'p1' ? 'p2' : 'p1';
    const nextNumber = nextTurn === 'p1' ? this.state.turnNumber + 1 : this.state.turnNumber;
    playSound('uiClick');

    // Reset HP (not ATK) of all creatures on the table to their base defense
    for (const [cardId, mesh] of this.meshes) {
      const card = mesh.userData.cardInstance;
      if (card && card.type !== 'Site' && card.type !== 'Avatar' && card.currentLife !== undefined) {
        const fullCard = this.props.sorceryCards?.find((c) => c.unique_id === card.cardId);
        const baseDef = parseInt(fullCard?.defense, 10);
        card.currentLife = baseDef > 0 ? baseDef : 0;
        const hud = this.lifeHUDs.get(cardId);
        if (hud) updateLifeHUD(hud.hpSprite, card.currentLife, 'hp');
        // ATK is NOT reset on turn end
      }
    }

    // Reset mana for the player whose turn is starting: set it to the
    // number of sites they currently have in play. This undoes any
    // mid-turn spending and accounts for sites gained or lost since
    // their last turn. Elemental affinities are also refreshed in case
    // a site was destroyed or placed without an immediate recalculation.
    const { trackers } = this.state.gameState;
    const manaCount = this.countSitesForPlayer(nextTurn);
    trackers[nextTurn].mana = manaCount;
    this.sync.setTracker(nextTurn, 'mana', manaCount);
    this.recalculateSiteAffinities(nextTurn);

    // Auto-untap every card belonging to the player whose turn is starting.
    // Card ownership is encoded via `card.rotated` (false = p1, true = p2),
    // matching the pattern used elsewhere (canInteract, spawnSelectedDeck).
    // Sites are skipped because their own rotation doubles as orientation
    // and the manual tap handlers never tap them in the first place.
    const nextPlayerRotated = nextTurn === 'p2';
    for (const [, mesh] of this.meshes) {
      const card = mesh.userData.cardInstance;
      if (!card || card.isSite) continue;
      if (card.rotated !== nextPlayerRotated) continue;
      if (!card.tapped) continue;
      card.tapped = false;
      animateCardTap(mesh, card);
      this.sync.tapCard(card.id, false);
    }

    this.setState({ currentTurn: nextTurn, turnNumber: nextNumber });
    this.sync.passTurn(nextTurn, nextNumber);
  };


  findOrCreateCemetery = (rotated) => {
    const isP2 = !!rotated;
    const cemeteryId = isP2 ? 'cemetery-p2' : 'cemetery-p1';
    const cemeteryName = isP2 ? 'Cemetery P2' : 'Cemetery P1';
    const spawnKey = isP2 ? 'cemetery2' : 'cemetery';
    const { gameState, spawnConfig } = this.state;

    let pile = gameState.piles.find((p) => p.id === cemeteryId);
    if (pile) return pile;

    const point = getSpawnPoint(spawnConfig, spawnKey);
    pile = {
      id: cemeteryId,
      name: cemeteryName,
      cards: [],
      x: point.x,
      z: point.z,
      rotated: isP2,
    };
    gameState.piles.push(pile);
    // The mesh is created lazily by updatePileMeshes once the first card
    // lands — createPileMesh returns null for empty piles.
    return pile;
  };


  // Replace a site card with a Rubble token at the same position and
  // send the original site to the acting player's own cemetery.
  turnToRubble = (cardInstance) => {
    const mesh = this.meshes.get(cardInstance.id);
    if (!mesh) { this.closeContextMenu(); return; }

    // Save the site's world position before removing it.
    const px = mesh.position.x;
    const pz = mesh.position.z;

    // Resolve Rubble from the card database (sorcery-rubble).
    const rubbleCard = this.props.sorceryCards?.find((c) => c.unique_id === 'sorcery-rubble');
    const rubblePrinting = rubbleCard?.printings?.find((p) => p.foiling === 'S') || rubbleCard?.printings?.[0];
    if (!rubbleCard || !rubblePrinting) {
      console.warn('[turnToRubble] Rubble card not found in sorceryCards');
      this.closeContextMenu();
      return;
    }

    // Send the original site to the LOCAL player's cemetery.
    const localRotated = !this.state.isHost;
    const cemetery = this.findOrCreateCemetery(localRotated);
    this.removeCardFromTable(cardInstance);
    cemetery.cards.push(cardInstance);
    this.updatePileMeshes();

    // Spawn the Rubble card at the same position.
    const rubbleInstance = {
      id: `rubble-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cardId: rubbleCard.unique_id,
      name: rubbleCard.name,
      imageUrl: rubblePrinting.image_url,
      printingId: rubblePrinting.unique_id,
      foiling: 'S',
      type: 'Site',
      isSite: true,
      rotated: localRotated,
      x: px,
      z: pz,
    };
    this.addCardToTable(rubbleInstance);
    this.closeContextMenu();
  };

  deleteDice = (diceInstance) => {
    const mesh = this.diceMeshes.get(diceInstance.id);
    if (mesh) {
      this.scene.scene.remove(mesh);
      mesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      this.diceMeshes.delete(diceInstance.id);
    }
    const { gameState } = this.state;
    gameState.dice = gameState.dice.filter((d) => d.id !== diceInstance.id);
    this.sync.deleteDice(diceInstance.id);
    this.setState({ contextMenu: null });
  };

  setDiceValue = (diceInstance, value) => {
    const mesh = this.diceMeshes.get(diceInstance.id);
    if (mesh) setDieFaceUp(mesh, value);
    this.sync.rollDice(diceInstance.id, value);
    this.setState({ contextMenu: null });
  };

  findPileByName = (name) => {
    return this.state.gameState.piles.find((p) => p.name === name);
  };

  // Find a pile by name owned by the LOCAL player. Used by the C/Z/X
  // hotkeys so the host's Spellbook isn't returned for the guest.
  findLocalPileByName = (name) => {
    const localRotated = !this.state.isHost;
    return this.state.gameState.piles.find(
      (p) => p.name === name && !!p.rotated === localRotated,
    );
  };

  // Resolve the destination pile for a context-menu "put into pile"
  // action.
  //
  // In multiplayer both players have identically-named piles (two
  // "Spellbook"s, two "Atlas"s, etc.) distinguished only by the
  // `rotated` flag that marks which player owns them.
  //
  // Non-Cemetery piles route to the LOCAL PLAYER's pile — in a sandbox
  // tabletop "Spellbook (bottom)" means "my Spellbook", regardless of
  // which player originally owned the card. If you need to put a card
  // in the opponent's pile, drag it there manually.
  //
  // Cemetery is the exception: it routes to the CARD OWNER's cemetery,
  // matching the TCG convention that destroyed cards go back to their
  // owner's graveyard.
  findDestinationPile = (cardInstance, pileName) => {
    if (pileName === 'Cemetery') {
      return this.findOrCreateCemetery(cardInstance.rotated);
    }
    const localRotated = !this.state.isHost;
    return this.state.gameState.piles.find(
      (p) => p.name === pileName && !!p.rotated === localRotated,
    );
  };

  sendCardToPile = (cardInstance, pileName, shouldShuffle = false) => {
    const pile = this.findDestinationPile(cardInstance, pileName);
    if (!pile) {
      this.setState({ contextMenu: null });
      return;
    }

    const cardMesh = this.meshes.get(cardInstance.id);
    const pileMesh = this.pileMeshes.get(pile.id);
    if (cardMesh && pileMesh) {
      this.meshes.delete(cardInstance.id);
      this.lifeHUDs.delete(cardInstance.id);
      this.statusHUDs.delete(cardInstance.id);
      // Recalculate affinities and drop mana now (after meshes.delete)
      // so the counters update immediately, even before the fly-to-pile
      // animation finishes. Rubble and dead sites are excluded from
      // the mana adjustment.
      if (cardInstance.isSite) {
        const player = cardInstance.rotated ? 'p2' : 'p1';
        this.recalculateSiteAffinities(player);
        if (this._siteProvidesMana(cardInstance)) {
          const { trackers } = this.state.gameState;
          if (trackers[player].mana > 0) {
            trackers[player].mana--;
            this.sync.setTracker(player, 'mana', trackers[player].mana);
            this.updateTrackerTokenPositions();
            this.forceUpdate();
          }
        }
      }
      animateCardToPile(cardMesh, pileMesh.position.x, pileMesh.position.z, this.scene.scene, () => {
        pile.cards.push(cardInstance);
        if (shouldShuffle) {
          shufflePile(this.state.gameState, pile.id);
          const pm = this.pileMeshes.get(pile.id);
          if (pm) animateShufflePile(pm, pile, this.scene.scene);
        }
        this.updatePileMeshes();
        this.sync.removeCard(cardInstance.id);
        this.sync.syncPile(pile);
      });
    } else {
      pile.cards.push(cardInstance);
      if (shouldShuffle) {
        shufflePile(this.state.gameState, pile.id);
        const pm = this.pileMeshes.get(pile.id);
        if (pm) animateShufflePile(pm, pile, this.scene.scene);
      }
      this.removeCardFromTable(cardInstance);
      this.updatePileMeshes();
      this.sync.syncPile(pile);
    }

    this.setState({ contextMenu: null });
  };

  sendHandCardToPile = (cardInstance, pileName, shouldShuffle = false) => {
    const pile = this.findDestinationPile(cardInstance, pileName);
    if (pile) {
      pile.cards.push(cardInstance);
      if (shouldShuffle) {
        shufflePile(this.state.gameState, pile.id);
        const mesh = this.pileMeshes.get(pile.id);
        if (mesh) animateShufflePile(mesh, pile, this.scene.scene);
      }
      this.updatePileMeshes();
      this.sync.syncPile(pile);
    }
    this.removeFromHand(cardInstance);
    this.setState({ contextMenu: null, hoveredHandIndex: -1 });
  };

  shufflePileAction = (pile) => {
    const mesh = this.pileMeshes.get(pile.id);
    if (mesh) {
      animateShufflePile(mesh, pile, this.scene.scene);
    }
    playSound(pile.name === 'Atlas' ? 'cardShuffleAtlas' : 'cardShuffleSpellbook');
    shufflePile(this.state.gameState, pile.id);
    this.setState({ contextMenu: null });
    this.sync.syncPile(pile);
  };

  flipCard = (cardInstance, mesh) => {
    cardInstance.faceDown = !cardInstance.faceDown;
    animateCardFlip(mesh, cardInstance);
    playSound('cardFlip');
    this.sync.flipCard(cardInstance.id, cardInstance.faceDown);
    this.setState({ contextMenu: null });
  };

  tapCard = (cardInstance, mesh) => {
    if (cardInstance.isSite) { this.setState({ contextMenu: null }); return; }
    cardInstance.tapped = !cardInstance.tapped;
    animateCardTap(mesh, cardInstance);
    this.sync.tapCard(cardInstance.id, cardInstance.tapped);
    this.setState({ contextMenu: null });
  };

  // ── Status effects ──────────────────────────────────────────────

  toggleCardStatus = (cardInstance, statusKey) => {
    if (!cardInstance.statuses) cardInstance.statuses = [];
    const active = cardInstance.statuses.includes(statusKey);
    if (active) {
      cardInstance.statuses = cardInstance.statuses.filter((s) => s !== statusKey);
    } else {
      cardInstance.statuses.push(statusKey);
    }
    this.rebuildStatusBadges(cardInstance.id);
    this.sync.setCardStatus(cardInstance.id, statusKey, !active);
  };

  clearAllStatuses = (cardInstance) => {
    if (!cardInstance.statuses || cardInstance.statuses.length === 0) return;
    const removed = [...cardInstance.statuses];
    cardInstance.statuses = [];
    this.rebuildStatusBadges(cardInstance.id);
    for (const key of removed) {
      this.sync.setCardStatus(cardInstance.id, key, false);
    }
  };

  rebuildStatusBadges = (cardId) => {
    const mesh = this.meshes.get(cardId);
    if (!mesh) return;
    const card = mesh.userData.cardInstance;

    // Remove existing badge meshes from the card.
    const existing = this.statusHUDs.get(cardId) || [];
    for (const badge of existing) {
      mesh.remove(badge);
      badge.geometry.dispose();
      badge.material.map?.dispose();
      badge.material.dispose();
    }

    const statuses = card.statuses || [];
    if (statuses.length === 0) {
      this.statusHUDs.delete(cardId);
      return;
    }

    const badges = buildStatusBadges(statuses, card.isSite);
    for (const badge of badges) mesh.add(badge);
    this.statusHUDs.set(cardId, badges);
  };

  // --- Deck Spawning ---

  spawnSelectedDeck = (deck, playerNum = 1) => {
    const { sorceryCards } = this.props;
    const { spawnConfig } = this.state;
    const suffix = playerNum === 1 ? '' : '2';
    const points = {
      spellbook: getSpawnPoint(spawnConfig, `spellbook${suffix}`),
      atlas: getSpawnPoint(spawnConfig, `atlas${suffix}`),
      avatar: getSpawnPoint(spawnConfig, `avatar${suffix}`),
      collection: getSpawnPoint(spawnConfig, `collection${suffix}`),
    };
    const isP2 = playerNum === 2;
    const result = spawnDeck(deck, sorceryCards, points, isP2);

    this.setState((state) => {
      const gameState = { ...state.gameState };
      gameState.piles = [...gameState.piles, ...result.piles];
      const nextState = { gameState, showDeckPicker: false };

      if (result.avatarCard) {
        this.addCardToTable(result.avatarCard);
      }

      return nextState;
    });

    for (const pile of result.piles) {
      const mesh = createPileMesh(pile);
      if (mesh) {
        this.scene.scene.add(mesh);
        this.pileMeshes.set(pile.id, mesh);
      }
    }

    this.createTrackerTokens();
    this.createTrackerButtons();

    // Broadcast deck spawn to the other player (legacy path — server-prepared
    // matches use room:joined so this only fires for casual/invite decks).
    this.sync.emit('deck:spawn', { deck, playerNum });
  };

  updatePileMeshes = () => {
    const { gameState } = this.state;
    for (const pile of gameState.piles) {
      const mesh = this.pileMeshes.get(pile.id);

      if (!mesh) {
        // Lazy-create the mesh the first time a pile becomes non-empty.
        // Cemeteries are created with an empty card list, so createPileMesh
        // returns null at creation time — we build it here once a card lands.
        if (pile.cards.length > 0) {
          const newMesh = createPileMesh(pile);
          if (newMesh) {
            this.scene.scene.add(newMesh);
            this.pileMeshes.set(pile.id, newMesh);
          }
        }
        continue;
      }

      if (pile.cards.length === 0) {
        this.scene.scene.remove(mesh);
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => m.dispose());
        this.pileMeshes.delete(pile.id);
      } else {
        updatePileMesh(mesh, pile);
      }
    }
  };

  // ── Opponent hand: 3D face-down cards on the table ──────────────
  //
  // Lays out N face-down card meshes near the opponent's table edge so
  // the local player can see how many cards the opponent is holding
  // (and whether any are Sites) without revealing the faces. Called
  // whenever `opponentHand` state changes via the `hand:info` sync
  // message. The meshes have no physics and no interactivity — they're
  // purely a visual indicator, like looking across a table and seeing
  // the back of someone's fanned hand.

  updateOpponentHandMeshes = () => {
    if (!this.scene) return;

    const { opponentHand } = this.state;

    // Remove old meshes.
    for (const mesh of this.opponentHandMeshes) {
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
    this.opponentHandMeshes = [];

    const N = opponentHand.length;
    if (N === 0) return;

    // ── Position the fan BEHIND the opponent's table edge ──
    // Table half-depth is ~70 units; placing the hand at ±82 puts it
    // ~12 units past the edge so it's visually "off the board" — the
    // same place a real player would hold their cards.
    const opponentZ = this.state.isHost ? -82 : 82;
    const opponentRotation = this.state.isHost ? 0 : Math.PI;

    // Fan geometry — spread cards across up to ~60 world units, tapering
    // the angle per card as the hand grows so it stays readable.
    const maxSpread = 50;
    const spacing = Math.min(CARD_WIDTH * 0.65, maxSpread / Math.max(N, 1));
    const totalWidth = spacing * (N - 1);
    const startX = -totalWidth / 2;

    // Subtle arc rotation — cards at the edges tilt outward slightly.
    const maxTilt = N <= 3 ? 3 : N <= 6 ? 5 : N <= 10 ? 8 : 10; // degrees total arc
    const tiltPerCard = N > 1 ? maxTilt / (N - 1) : 0;

    for (let i = 0; i < N; i++) {
      const card = opponentHand[i];
      const mesh = createHandBackMesh(card.isSite);

      const x = startX + i * spacing;
      const tiltDeg = N === 1 ? 0 : -maxTilt / 2 + i * tiltPerCard;
      const tiltRad = (tiltDeg * Math.PI) / 180;

      // Lay flat: rotation.x = -π/2 puts +Z (card face) up.
      // rotation.z encodes the fan tilt + player orientation.
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = opponentRotation + tiltRad;

      // Slight vertical stacking so overlapping cards don't z-fight.
      const y = CARD_THICKNESS / 2 + 0.1 + i * 0.05;
      mesh.position.set(x, y, opponentZ);

      this.scene.scene.add(mesh);
      this.opponentHandMeshes.push(mesh);
    }
  };

  // --- Hand to Table ---

  startHandCardDrag = (event, cardInstance) => {
    event.preventDefault();
    playUI('snd-card-hand-click.wav', { volume: 0.6 });

    // Remove from hand immediately.
    this.removeFromHand(cardInstance);
    this.setState({ hoveredHandIndex: -1 });

    // Spawn the mesh at the cursor's table-plane point so the card
    // lands under the cursor instead of at a default origin.
    const point = this.scene.raycastTablePoint(event);
    if (point) {
      cardInstance.x = point.x;
      cardInstance.z = point.z;
    }
    this.addCardToTable(cardInstance);

    // Hand off to the shared pickup routine so the dragging record
    // gets the same `members` / `draggingIds` / `liftDelta` shape as
    // a regular table drag. Without this, handleMouseMove bails out
    // on `!members` and the card appears to drop the instant it
    // leaves the hand.
    const mesh = this.meshes.get(cardInstance.id);
    if (mesh) {
      this.startCardDrag({
        primaryMesh: mesh,
        dragIds: new Set([cardInstance.id]),
        anchorX: mesh.position.x,
        anchorZ: mesh.position.z,
      });
    }
  };

  // --- Render ---

  // Flat map of the orchestration callbacks the GameContextMenu component
  // needs. Re-created per render (cheap) so the component receives the
  // latest references without us having to worry about stale closures.
  buildContextMenuActions = () => ({
    tapCard: (cardInstance, mesh) => { this.tapCard(cardInstance, mesh); this.closeContextMenu(); },
    flipCard: (cardInstance, mesh) => { this.flipCard(cardInstance, mesh); this.closeContextMenu(); },
    sendToHand: this.sendToHand,
    sendCardToPile: this.sendCardToPile,
    deleteCard: this.deleteCard,
    turnToRubble: this.turnToRubble,
    drawCard: this.handleDrawCardFromPile,
    shufflePile: this.shufflePileAction,
    openPileSearch: this.openPileSearch,
    drawPileToHand: this.drawPileToHand,
    sendHandCardToPile: this.sendHandCardToPile,
    deleteToken: this.deleteToken,
    rollDice: this.handleRollDiceAndClose,
    setDiceValue: this.setDiceValue,
    deleteDice: this.deleteDice,
    groupSelected: this.handleGroupSelected,
    ungroup: this.handleUngroup,
    toggleCardStatus: (cardInstance, statusKey) => { this.toggleCardStatus(cardInstance, statusKey); },
    clearAllStatuses: (cardInstance) => { this.clearAllStatuses(cardInstance); },
  });

  /**
   * Bundle every currently-selected card into a new group. The right-
   * clicked card is implicitly part of the group if it wasn't already
   * in the selection (so right-clicking a single card + "Group" still
   * does something sensible — it just groups that card with the rest
   * of the selection). Broadcasts via setGroup so the opponent's
   * client mirrors the grouping.
   */
  handleGroupSelected = (clickedCardInstance) => {
    const ids = new Set(this.selectedCardIds);
    if (clickedCardInstance?.id) ids.add(clickedCardInstance.id);
    if (ids.size < 2) { this.closeContextMenu(); return; }
    const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.assignGroup(groupId, [...ids]);
    this.sync.setGroup(groupId, [...ids]);
    this.closeContextMenu();
  };

  /**
   * Dissolve the group the clicked card belongs to. No-op if the card
   * isn't currently grouped.
   */
  handleUngroup = (clickedCardInstance) => {
    const gid = clickedCardInstance?.groupId;
    if (!gid) { this.closeContextMenu(); return; }
    this.dissolveGroup(gid);
    this.sync.clearGroup(gid);
    this.closeContextMenu();
  };

  takeCardFromPile = (pile, cardInstance) => {
    if (pile.infinite) {
      // Token pile — clone with a fresh id so the same token can be
      // spawned unlimited times without depleting the virtual pile.
      const clone = { ...cardInstance, id: `${cardInstance.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
      this.addToHand(clone);
      return;
    }
    const idx = pile.cards.indexOf(cardInstance);
    if (idx !== -1) pile.cards.splice(idx, 1);
    this.addToHand(cardInstance);
    this.setState((state) => ({
      searchPile: pile.cards.length === 0 ? null : state.searchPile,
    }));
    this.updatePileMeshes();
  };

  renderCardInspector() {
    const { inspectedCard } = this.state;
    if (!inspectedCard) return null;

    const { sorceryCards } = this.props;
    const fullCard = sorceryCards?.find((c) => c.unique_id === inspectedCard.cardId) || {};

    return (
      <CardInspector
        card={fullCard}
        imageUrl={resolveLocalImageUrl(inspectedCard.imageUrl)}
        foiling={inspectedCard.foiling}
        onClose={() => this.setState({ inspectedCard: null })}
      />
    );
  }

  // --- Context menu action wrappers ---
  // Thin orchestration helpers that the GameContextMenu component calls so
  // it can stay purely presentational.

  closeContextMenu = () => this.setState({ contextMenu: null });

  // Opening draw: each player automatically draws 3 from their Atlas
  // (site pile) and 3 from their Spellbook at the start of a match.
  // Staggered with short delays so the cards fan into the hand one at a
  // time instead of appearing all at once. Only called for competitive
  // and friend matches — never for solo/offline sessions.
  performOpeningDraw = () => {
    const atlas = this.findLocalPileByName('Atlas');
    const spellbook = this.findLocalPileByName('Spellbook');

    // Build a draw queue. Interleave atlas and spellbook so the visual
    // pacing feels natural — atlas, spellbook, atlas, spellbook, ...
    const queue = [];
    for (let i = 0; i < 3; i++) {
      if (atlas && atlas.cards.length > 0) queue.push(atlas);
      if (spellbook && spellbook.cards.length > 0) queue.push(spellbook);
    }

    queue.forEach((pile, i) => {
      setTimeout(() => {
        if (this._unmounted) return;
        if (pile.cards.length === 0) return;
        this.drawPileToHand(pile);
        playSound('cardDeal');
      }, i * 200);
    });
  };

  // Pop the top card off a pile into the player's hand.
  drawPileToHand = (pile) => {
    if (pile.cards.length > 0) {
      const card = pile.cards[pile.cards.length - 1];
      pile.cards.pop();
      this.addToHand(card);
      this.updatePileMeshes();
    }
    this.setState({ contextMenu: null });
  };

  // Build a virtual pile containing every token card in the game. Tokens
  // are identified by having no mana cost (cost === '') and being a
  // Minion or Artifact. The pile is flagged `infinite: true` so the
  // take-to-hand / take-to-field callbacks clone each pick instead of
  // splicing it out of the array.
  buildTokenPile = () => {
    const sorceryCards = this.props.sorceryCards || [];
    // Rubble is excluded — it's a Site token with its own "Turn to
    // Rubble" context menu action rather than a spawn-from-browser token.
    const tokens = sorceryCards
      .filter((c) => c.cost === '' && (c.type === 'Minion' || c.type === 'Artifact'))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const cards = tokens.map((card) => {
      // Always pick the Standard printing — tokens must never show as foils.
      const printing = card.printings?.find((p) => p.foiling === 'S') || card.printings?.[0] || {};
      return {
        id: `token-${card.unique_id}`,
        cardId: card.unique_id,
        imageUrl: printing.image_url,
        printingId: printing.unique_id,
        foiling: 'S',
        type: card.type,
        isToken: true,
      };
    });
    return { id: 'token-pile', name: 'Tokens', cards, infinite: true };
  };

  openPileSearch = (pile) => {
    this.setState({ searchPile: pile, searchQuery: '', contextMenu: null });
  };

  handleDrawCardFromPile = (pileId) => {
    this.drawCard(pileId);
    this.setState({ contextMenu: null });
  };

  handleRollDiceAndClose = (diceInstance) => {
    this.rollDice(diceInstance);
    this.setState({ contextMenu: null });
  };

  handlePileSearchClose = () => {
    this.setState({ searchPile: null, searchQuery: '' });
  };

  handlePileSearchQueryChange = (value) => {
    this.setState({ searchQuery: value });
  };

  handlePileSearchTakeToField = (card) => {
    const { searchPile } = this.state;
    if (!searchPile) return;

    if (searchPile.infinite) {
      // Token pile — spawn a fresh clone directly onto the board.
      // P2 (guest) tokens must be rotated so ownership is correct.
      const isLocalP2 = !this.state.isHost;
      const clone = { ...card, id: `${card.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, x: 0, z: isLocalP2 ? 0 : 0, rotated: isLocalP2 };
      this.addCardToTable(clone);
      return;
    }

    const idx = searchPile.cards.indexOf(card);
    if (idx !== -1) searchPile.cards.splice(idx, 1);
    card.x = 0;
    card.z = 0;
    this.addCardToTable(card);
    this.setState((state) => ({
      searchPile: searchPile.cards.length === 0 ? null : state.searchPile,
    }));
    this.updatePileMeshes();
  };

  renderDeckPicker() {
    if (!this.state.showDeckPicker) return null;
    return (
      <DeckSpawnDialog
        savedDecks={this.props.savedDecks}
        sorceryCards={this.props.sorceryCards}
        onSpawn={(deckId, playerNum) => this.loadAndSpawnDeck(deckId, playerNum)}
        onClose={() => this.setState({ showDeckPicker: false })}
      />
    );
  }

  loadAndSpawnDeck = async (deckId, playerNum = 1) => {
    // Check if there are already cards/piles for this player
    const hasExistingContent = this.meshes.size > 0 || this.state.gameState.piles.length > 0 || this.state.handCards.length > 0;
    if (hasExistingContent) {
      this.setState({
        pendingSpawnDeckId: deckId,
        pendingSpawnPlayerNum: playerNum,
        showSpawnConfirm: true,
        showDeckPicker: false,
      });
      return;
    }
    await this.doSpawnDeck(deckId, playerNum);
  };

  confirmSpawnDeck = async () => {
    const { pendingSpawnDeckId, pendingSpawnPlayerNum } = this.state;
    this.setState({ showSpawnConfirm: false });
    this.clearBoard();
    await this.doSpawnDeck(pendingSpawnDeckId, pendingSpawnPlayerNum);
  };

  clearBoard = () => {
    // Remove all table cards
    for (const [, mesh] of this.meshes) {
      this.scene.scene.remove(mesh);
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
    this.meshes.clear();

    // Remove all pile meshes
    for (const [, mesh] of this.pileMeshes) {
      this.scene.scene.remove(mesh);
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
    this.pileMeshes.clear();

    // Clear state
    this.setState({
      gameState: createGameState(),
      handCards: [],
    });
  };

  doSpawnDeck = async (deckId, playerNum) => {
    try {
      // Check props first (arena decks are passed inline with cards, not stored in API)
      const propDeck = (this.props.savedDecks || []).find((d) => d.id === deckId);
      if (propDeck?.cards?.length > 0) {
        this.spawnSelectedDeck(propDeck, playerNum);
        toast.success(`Spawned "${propDeck.name}" as P${playerNum}`);
        return;
      }

      const { loadSavedDeckById } = await import('../utils/deckStorageApi');
      const deck = await loadSavedDeckById(deckId, 'sorcery');
      if (deck) {
        this.spawnSelectedDeck(deck, playerNum);
        toast.success(`Spawned "${deck.name}" as P${playerNum}`);
      }
    } catch (error) {
      console.error('Failed to load deck for game:', error);
      toast.error('Failed to spawn deck');
    }
  };

  render() {
    // Wraps the actual render body so we can measure how often Preact
    // re-runs this component (often due to setState in mousemove
    // handlers) and how long each render takes. Total render time per
    // window = avg * count, and that's what shows up as missed frames.
    perf.count('gameboard.render');
    const mark = perf.beginMark('gameboard.render');
    const out = this._renderBody();
    perf.endMark(mark);
    return out;
  }

  _renderBody() {
    const { onExit } = this.props;
    const { handCards, contextMenu } = this.state;

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={() => contextMenu && this.setState({ contextMenu: null })}>
        {/* Loading overlay */}
        {this.state.isLoading || this.state.connectionFailed ? (
          <div className="fixed inset-0 z-[2000] bg-black flex items-center justify-center">
            <div className="flex flex-col items-center gap-4" style={{ zoom: this.state.viewScale }}>
              {this.state.connectionFailed ? (
                <>
                  <div className="text-lg font-bold arena-heading" style={{ color: '#c45050' }}>Connection Failed</div>
                  <p className="text-sm text-center max-w-xs" style={{ color: TEXT_BODY }}>
                    Unable to connect to the game server. Check your internet connection and try again.
                  </p>
                  <div className="flex gap-3 mt-2">
                    <button
                      type="button"
                      className="px-5 py-2 text-sm font-semibold cursor-pointer transition-all"
                      style={{ ...GOLD_BTN, borderRadius: '8px' }}
                      onClick={() => {
                        this.setState({ connectionFailed: false, isLoading: true, loadingMessage: 'Reconnecting...' });
                        this.initSession().then(async () => {
                          const { roomInfo } = this.state;
                          if (this.props.isArenaMatch && roomInfo?.hostDeck && roomInfo?.guestDeck) {
                            if (!roomInfo.resumed) {
                              try {
                                this.sync.withSuppressed(() => {
                                  this.spawnSelectedDeck(roomInfo.hostDeck, 1);
                                  this.spawnSelectedDeck(roomInfo.guestDeck, 2);
                                });
                              } catch {}
                            }
                          }
                          setTimeout(() => this.setState({ isLoading: false }), 500);
                        });
                      }}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="px-5 py-2 text-sm cursor-pointer transition-all"
                      style={{ ...BEVELED_BTN, borderRadius: '8px', color: TEXT_BODY }}
                      onClick={() => { if (this.props.onExit) this.props.onExit(); }}
                    >
                      Back
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <RuneSpinner size={64} />
                  <p className="text-sm" style={{ color: TEXT_BODY }}>{this.state.loadingMessage}</p>
                </>
              )}
            </div>
          </div>
        ) : null}

        {/* Floating sidebar buttons — top left */}
        <div data-tutorial="board-menu" className="fixed top-3 left-3 z-[1001] flex flex-col gap-2" style={{ zoom: this.state.viewScale }}>
          {/* Burger menu */}
          <div className="relative">
            <button
              type="button"
              className="size-10 rounded-xl flex items-center justify-center cursor-pointer transition-all" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.2)`, color: TEXT_BODY }}
              onClick={() => { playSound('uiClick'); this.setState((s) => ({ showGameMenu: !s.showGameMenu })); }}
              title="Menu"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            {this.state.showGameMenu ? (
              <div className="absolute left-12 top-0 w-56 p-2.5" style={POPOVER_STYLE}>
                <FourCorners radius={8} />
                <div className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Session</div>
                <div className="mx-1 mb-2.5 h-px" style={{ background: `${GOLD} 0.12)` }} />
                {this.state.connectionStatus === 'offline' ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer" style={{ color: '#6ab04c' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.startMultiplayer(); this.setState({ showGameMenu: false }); }}>
                    <div className="size-2 rounded-full bg-green-400" /> Go Online
                  </button>
                ) : (
                  <>
                    {this.state.roomCode ? (
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/80 hover:bg-white/10 font-mono" onClick={() => { navigator.clipboard?.writeText(this.state.roomCode); toast('Code copied to clipboard'); }} title="Click to copy">
                        Code: {this.state.roomCode}
                      </button>
                    ) : null}
                    <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer" style={{ color: '#c45050' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.stopMultiplayer(); this.setState({ showGameMenu: false }); }}>
                      Stop Online
                    </button>
                  </>
                )}

                <div className="mx-1 my-2.5 h-px" style={{ background: `${GOLD} 0.08)` }} />

                {/* Save */}
                {!this.props.isRankedMatch && this.state.isHost ? (
                  <>
                    <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.quickSave(); this.setState({ showGameMenu: false }); }}>
                      Quick Save{this.state.currentSessionName ? ` (${this.state.currentSessionName})` : ''}
                    </button>
                    <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.openSaveDialog(); this.setState({ showGameMenu: false }); }}>
                      Save As...
                    </button>
                  </>
                ) : null}

                {/* Spawn config — dev only */}
                {this.props.devMode ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.toggleSpawnEditor(); this.setState({ showGameMenu: false }); }}>
                    {this.state.isPlacingSpawns ? 'Done Placing' : 'Set Spawn Points'}
                  </button>
                ) : null}

                {this.props.isArenaMatch && this.state.connectionStatus === 'connected' ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer" style={{ color: ACCENT_GOLD }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => this.setState({ showMatchResult: true, showGameMenu: false })}>
                    End Match
                  </button>
                ) : null}
                {this.props.isArenaMatch && this.state.connectionStatus !== 'connected' ? (
                  <div className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-not-allowed" style={{ color: TEXT_MUTED }}>
                    End Match (waiting for opponent)
                  </div>
                ) : null}

                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.setState({ showGameMenu: false }); if (this.props.onOpenSettings) this.props.onOpenSettings(); }}>
                  Settings
                </button>

                <div className="mx-1 my-2.5 h-px" style={{ background: `${GOLD} 0.08)` }} />

                {/* Exit */}
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer" style={{ color: '#c45050' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.requestExit(); this.setState({ showGameMenu: false }); }}>
                  Exit Game
                </button>
              </div>
            ) : null}
          </div>

          {/* Spawn Deck — only in solo play (no pre-selected arena deck
              and not spectating). Multiplayer matches handle deck spawning
              through the matchmaking flow. */}
          {!this.props.arenaSelectedDeckId && !this.state.roomInfo?.hostDeck && !this.props.isSpectating ? (
            <button
              type="button"
              className="size-10 rounded-xl flex items-center justify-center cursor-pointer transition-all" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.2)`, color: TEXT_BODY }}
              onClick={() => { playSound('uiClick'); this.setState({ showDeckPicker: true }); }}
              title="Spawn Deck"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6 7h6M6 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            </button>
          ) : null}

          {/* Dice tool */}
          <div className="relative">
            <button
              type="button"
              className="size-10 rounded-xl flex items-center justify-center cursor-pointer transition-all" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.2)`, color: TEXT_BODY }}
              onClick={() => { playSound('uiClick'); this.setState((s) => ({ showDiceMenu: !s.showDiceMenu })); }}
              title="Spawn Dice"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2.5" y="2.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="12" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>
            </button>
            {this.state.showDiceMenu ? (
              <div className="absolute left-12 top-0 w-36 p-1.5" style={POPOVER_STYLE}>
                <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Spawn Dice</div>
                {Object.entries(DICE_CONFIGS).map(([type, config]) => (
                  <button
                    key={type}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs cursor-pointer transition-colors"
                    style={{ color: TEXT_BODY }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => { playSound('uiClick'); this.spawnDice(type); }}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: `#${config.color.toString(16).padStart(6, '0')}` }} />
                    {config.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Ambient sound mixer */}
          <div className="relative">
            <button
              type="button"
              className="size-10 rounded-xl flex items-center justify-center cursor-pointer transition-all"
              style={{
                background: PANEL_BG,
                border: `1px solid ${GOLD} ${this.state.ambienceState.isPlaying ? '0.45)' : '0.2)'}`,
                color: this.state.ambienceState.isPlaying ? ACCENT_GOLD : TEXT_BODY,
              }}
              onClick={() => { playSound('uiClick'); this.setState((s) => ({ showAmbienceMenu: !s.showAmbienceMenu })); }}
              title="Ambient Sound"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
            </button>
            {this.state.showAmbienceMenu ? (() => {
              const amb = this.state.ambienceState;
              const ss = this.state.soundSettings;
              const currentIdx = AMBIENCE_TRACKS.findIndex((t) => t.id === amb.trackId);
              const safeIdx = currentIdx >= 0 ? currentIdx : 0;
              const currentTrack = AMBIENCE_TRACKS[safeIdx];
              const cycleTrack = (delta) => {
                const next = AMBIENCE_TRACKS[(safeIdx + delta + AMBIENCE_TRACKS.length) % AMBIENCE_TRACKS.length];
                setAmbienceTrack(next.id);
              };
              const updateMusic = (value) => {
                const next = { ...ss, musicVolume: value };
                saveSoundSettings(next);
                this.setState({ soundSettings: next });
                updateMusicVolume();
              };
              return (
                <div className="absolute left-12 top-0 w-56 p-2.5" style={POPOVER_STYLE}>
                  <FourCorners radius={8} />
                  <div className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Atmosphere</div>
                  <div className="mx-1 mb-2.5 h-px" style={{ background: `${GOLD} 0.12)` }} />

                  {/* Play/pause + track switcher */}
                  <div className="flex items-center gap-2 px-1">
                    <button
                      type="button"
                      className="size-9 shrink-0 rounded-lg flex items-center justify-center cursor-pointer transition-all"
                      style={{
                        background: amb.isPlaying ? `${GOLD} 0.18)` : `${GOLD} 0.06)`,
                        border: `1px solid ${GOLD} ${amb.isPlaying ? '0.45)' : '0.2)'}`,
                        color: amb.isPlaying ? ACCENT_GOLD : TEXT_BODY,
                      }}
                      onClick={() => {
                        playSound('uiClick');
                        if (amb.isPlaying) pauseAmbience();
                        else playAmbience();
                      }}
                      title={amb.isPlaying ? 'Pause' : 'Play'}
                    >
                      {amb.isPlaying ? (
                        <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1.5" width="2.5" height="7" rx="0.5" /><rect x="6" y="1.5" width="2.5" height="7" rx="0.5" /></svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor"><path d="M2.5 1.5 L8.5 5 L2.5 8.5 Z" /></svg>
                      )}
                    </button>
                    <button
                      type="button"
                      className="size-6 shrink-0 rounded-md flex items-center justify-center cursor-pointer transition-colors"
                      style={{ color: TEXT_BODY }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT_GOLD; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_BODY; }}
                      onClick={() => { playSound('uiClick'); cycleTrack(-1); }}
                      title="Previous track"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1.5 L2.5 5 L6.5 8.5" /></svg>
                    </button>
                    <span className="flex-1 text-center text-xs font-medium truncate" style={{ color: amb.isPlaying ? TEXT_PRIMARY : TEXT_BODY }}>
                      {currentTrack.label}
                    </span>
                    <button
                      type="button"
                      className="size-6 shrink-0 rounded-md flex items-center justify-center cursor-pointer transition-colors"
                      style={{ color: TEXT_BODY }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT_GOLD; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_BODY; }}
                      onClick={() => { playSound('uiClick'); cycleTrack(1); }}
                      title="Next track"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 1.5 L7.5 5 L3.5 8.5" /></svg>
                    </button>
                  </div>

                  <div className="mx-1 my-2.5 h-px" style={{ background: `${GOLD} 0.08)` }} />

                  {/* Ambient volume */}
                  <div className="px-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Ambience</span>
                      <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>{Math.round(amb.volume * 100)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(amb.volume * 100)}
                      className="w-full h-1 accent-amber-500 cursor-pointer"
                      onInput={(e) => setAmbienceVolume(parseInt(e.currentTarget.value, 10) / 100)}
                    />
                  </div>

                  {/* Music volume */}
                  <div className="px-1 mt-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Music</span>
                      <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>{Math.round(ss.musicVolume * 100)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(ss.musicVolume * 100)}
                      className="w-full h-1 accent-amber-500 cursor-pointer"
                      disabled={!ss.musicEnabled}
                      onInput={(e) => updateMusic(parseInt(e.currentTarget.value, 10) / 100)}
                    />
                  </div>
                </div>
              );
            })() : null}
          </div>

          {/* Connection status indicator */}
          {this.state.connectionStatus !== 'offline' ? (
            <div className="size-10 rounded-xl flex items-center justify-center" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.15)` }} title={this.state.connectionStatus}>
              <div className={cn('size-2.5 rounded-full', this.state.connectionStatus === 'connected' ? 'bg-green-400' : this.state.connectionStatus === 'waiting' ? 'bg-blue-400 animate-pulse' : 'bg-red-400')} />
            </div>
          ) : null}

        </div>

        {/* 3D Canvas — opponent hand is rendered as 3D meshes on the
            table by updateOpponentHandMeshes(), driven by the same
            opponentHand state that the old 2D overlay used. */}
        {/* 3D Canvas */}
        <div className="relative flex-1 min-h-0">
          <canvas
            ref={this.canvasRef}
            className="block w-full h-full"
          />

          {/* Marquee drag-select overlay. Position-fixed with raw
              clientX/clientY; renderMarqueeOverlay mutates the style
              directly during the drag. Rounded corners + soft gold
              glow so it reads as a modern selection box rather than
              a bare rectangle. */}
          <div
            ref={this.marqueeOverlayRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              display: 'none',
              pointerEvents: 'none',
              border: '1.5px solid rgba(212, 168, 67, 0.9)',
              background: 'rgba(212, 168, 67, 0.1)',
              boxShadow: '0 0 16px rgba(212, 168, 67, 0.35), inset 0 0 12px rgba(212, 168, 67, 0.08)',
              borderRadius: '8px',
              zIndex: 50,
            }}
          />

          {/* Persistent "hug" outline around the current selection.
              Rendered in screen space by updateHugRect() on every
              frame so it tracks cards as they move. Purely
              decorative (pointer-events: none) — the click hit-test
              for "click inside the hug zone to drag the selection"
              lives in handleMouseDown and reads this.hugRectScreen
              directly. */}
          <div
            ref={this.hugRectRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              display: 'none',
              pointerEvents: 'none',
              border: '1.5px solid rgba(212, 168, 67, 0.85)',
              background: 'rgba(212, 168, 67, 0.05)',
              boxShadow: '0 0 22px rgba(212, 168, 67, 0.28), inset 0 0 14px rgba(212, 168, 67, 0.08)',
              borderRadius: '14px',
              zIndex: 48,
              transition: 'border-color 120ms ease',
            }}
          />

          <GameContextMenu
            contextMenu={this.state.contextMenu}
            actions={this.buildContextMenuActions()}
            viewScale={this.state.viewScale}
          />

          <StatusRingMenu
            ringMenu={this.state.ringMenu}
            onToggle={(card, statusKey) => this.toggleCardStatus(card, statusKey)}
            onClearAll={(card) => this.clearAllStatuses(card)}
            onClose={() => this.setState({ ringMenu: null })}
            viewScale={this.state.viewScale}
          />

          {/* First-run onboarding walkthrough. */}
          {this.state.showBoardTutorial && (
            <TutorialOverlay
              steps={BOARD_TUTORIAL_STEPS}
              onDismiss={this.handleBoardTutorialDismiss}
            />
          )}

          {/* Life & Mana HUD */}
          {(() => {
            const localPlayer = this.state.isHost ? 'p1' : 'p2';
            const opponentPlayer = localPlayer === 'p1' ? 'p2' : 'p1';
            const isMyTurn = this.state.currentTurn === localPlayer;
            // Always render the local player first so "You" is on top on
            // both clients, regardless of whether they host or joined.
            const orderedPlayers = [localPlayer, opponentPlayer];
            return (
              <div data-tutorial="board-life-hud" className="absolute top-3 right-3 z-10 px-5 py-4" style={{ ...POPOVER_STYLE, borderRadius: '12px', boxShadow: '0 18px 48px rgba(0,0,0,0.4), 0 0 20px rgba(180,140,60,0.04)', zoom: this.state.viewScale }}>
                <FourCorners radius={12} />
                <div className="flex items-center justify-between gap-4 mb-3 pb-2" style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={SECTION_HEADER_STYLE}>Turn {this.state.turnNumber}</span>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer"
                    style={isMyTurn ? GOLD_BTN : { background: `${GOLD} 0.06)`, color: TEXT_MUTED, border: `1px solid ${GOLD} 0.1)`, borderRadius: '6px', cursor: 'not-allowed' }}
                    disabled={!isMyTurn}
                    onClick={this.passTurn}
                  >
                    End Turn
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  {orderedPlayers.map((player) => {
                    const t = this.state.gameState.trackers[player];
                    const isLocal = player === localPlayer;
                    // Map each row to the player it actually represents —
                    // the local player's info goes on their own row whether
                    // they're the host (p1) or the guest (p2).
                    const info = isLocal ? this.props.arenaPlayerInfo : this.props.arenaOpponentInfo;
                    const displayName = info?.name || PLAYER_LABELS[player];
                    const avatarUrl = info?.avatarUrl || null;
                    const isActive = this.state.currentTurn === player;
                    return (
                      <div key={player} className="flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 transition-colors" style={isActive ? { background: `${GOLD} 0.08)` } : undefined}>
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover object-top shrink-0" style={{ border: isActive ? `2px solid ${ACCENT_GOLD}` : `1px solid ${GOLD} 0.15)` }} />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] shrink-0" style={isActive ? { background: `${GOLD} 0.15)`, border: `2px solid ${ACCENT_GOLD}`, color: ACCENT_GOLD } : { background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.15)`, color: TEXT_MUTED }}>
                            {isLocal ? 'You' : 'Opp'}
                          </div>
                        )}
                        <span className="text-xs font-semibold min-w-[4rem] truncate" style={{ color: isActive ? TEXT_PRIMARY : TEXT_BODY }}>{displayName}</span>
                        {isActive ? <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: ACCENT_GOLD }}>turn</span> : null}
                        <div className="flex items-center gap-1.5 ml-auto" title="Life Total">
                          <svg className="size-4 text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                          <span className="text-base font-bold tabular-nums min-w-[1.5rem] text-right">{t.life}</span>
                        </div>
                        <div className="flex items-center gap-1.5" title="Mana">
                          <svg className="size-4 text-blue-400" viewBox="0 0 73 109" fill="currentColor"><path d="M68.0545 54.4998L36.4698 0L16.0701 35.2017L13.2228 40.1123L4.88575 54.5002C-1.62858 65.7451-1.62858 79.5956 4.88575 90.8352C11.4001 102.075 23.4412 109 36.4704 109C49.4996 109 61.5404 102.075 68.055 90.8352C71.2907 85.323 73 79.0531 73 72.6705C73 66.2825 71.29 60.0122 68.0545 54.4998ZM64.6679 88.8845H64.6626C58.8494 98.9206 48.102 105.104 36.4698 105.104C24.8377 105.104 14.0904 98.9206 8.2771 88.8845C2.45854 78.8484 2.45854 66.4863 8.2771 56.4501L18.604 38.6292C29.6373 36.4264 41.08 39.3061 49.7469 46.4624C55.8081 51.4482 59.6369 58.6261 60.3864 66.4221C61.1306 74.2178 58.7417 81.986 53.7427 88.0253C49.8007 92.7747 44.1332 95.7672 37.9746 96.3529C31.8217 96.9385 25.6903 95.0742 20.9184 91.1576C13.1477 84.7589 12.0475 73.2996 18.4539 65.5465C23.4583 59.5184 32.4095 58.6642 38.4713 63.6339C40.7146 65.4821 42.1382 68.1414 42.4133 71.032C42.6937 73.9225 41.804 76.8021 39.9544 79.0425C36.9993 82.5991 31.709 83.1042 28.1338 80.1654C25.4429 77.9518 25.0599 73.9815 27.2817 71.2952C28.9211 69.3181 31.86 69.0388 33.8499 70.672C34.5348 71.2307 34.9662 72.042 35.0525 72.9231C35.1387 73.7988 34.8691 74.6799 34.3029 75.3568C33.9739 75.7598 33.8122 76.2702 33.8607 76.786C33.9092 77.3018 34.1627 77.7746 34.5617 78.1077C34.9662 78.4354 35.4785 78.5912 35.9962 78.5429C36.5139 78.4945 36.9885 78.242 37.3228 77.8391C39.8736 74.7605 39.4313 70.2045 36.3413 67.6634C32.6852 64.6654 27.2818 65.1812 24.2619 68.8185C20.6704 73.165 21.2853 79.5852 25.6424 83.1748C30.8841 87.4782 38.6386 86.7423 42.9692 81.5254C45.4821 78.4899 46.6847 74.5786 46.3072 70.6621C45.9351 66.7454 44.0099 63.135 40.9631 60.6313C33.2355 54.2916 21.8196 55.3823 15.4403 63.0651C11.7033 67.5835 9.91829 73.402 10.479 79.2314C11.0345 85.0607 13.898 90.4333 18.4277 94.1668C23.9984 98.7388 31.1651 100.92 38.3485 100.238C45.5368 99.5502 52.1591 96.0526 56.7589 90.5081C62.4212 83.6741 65.1282 74.874 64.2816 66.0523C63.4349 57.2251 59.0993 49.102 52.2398 43.4547C43.5631 36.2876 32.3136 32.9727 21.119 34.2889L36.4717 7.79619L64.6699 56.4506C67.5549 61.3719 69.081 66.9647 69.081 72.665C69.081 78.3653 67.5549 83.9636 64.6645 88.885L64.6679 88.8845Z" /></svg>
                          <span className="text-base font-bold tabular-nums min-w-[1.5rem] text-right">{t.mana}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Floating avatar portraits on table edges */}
          {this.props.arenaPlayerInfo?.avatarUrl ? (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[4] pointer-events-none" style={{ zoom: this.state.viewScale }}>
              <div className="flex flex-col items-center gap-1">
                <img
                  src={this.props.arenaPlayerInfo.avatarUrl}
                  alt={this.props.arenaPlayerInfo.name}
                  className="w-14 h-14 rounded-full object-cover object-top shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                  style={{ border: `2px solid ${GOLD} 0.4)` }}
                />
                <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ color: TEXT_BODY, background: PANEL_BG }}>{this.props.arenaPlayerInfo.name}</span>
              </div>
            </div>
          ) : null}
          {this.props.arenaOpponentInfo?.avatarUrl ? (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[4] pointer-events-none" style={{ zoom: this.state.viewScale }}>
              <div className="flex flex-col items-center gap-1">
                <img
                  src={this.props.arenaOpponentInfo.avatarUrl}
                  alt={this.props.arenaOpponentInfo.name}
                  className="w-14 h-14 rounded-full object-cover object-top shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                  style={{ border: '2px solid rgba(180,60,60,0.4)' }}
                />
                <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ color: TEXT_BODY, background: PANEL_BG }}>{this.props.arenaOpponentInfo.name}</span>
              </div>
            </div>
          ) : null}

          {this.state.isPlacingSpawns ? (
            <div className="absolute top-2 left-2 z-10 w-56 max-h-[80vh] overflow-y-auto p-2" style={{ ...POPOVER_STYLE, zoom: this.state.viewScale }}>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Pile Spawn Points</div>
              {Object.entries(SPAWN_LABELS).map(([key, label]) => {
                const isActive = this.state.activeSpawnKey === key;
                const hasPoint = this.state.spawnConfig[key];
                const color = SPAWN_COLORS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer"
                    style={isActive ? { background: `${GOLD} 0.15)`, color: TEXT_PRIMARY } : { color: TEXT_BODY }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => {
                      this.setState({ activeSpawnKey: isActive ? null : key, trackerEditing: null });
                      this.clearTrackerPreviews();
                      this.hideTrackerCursorPreview();
                    }}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="flex-1 text-left">{label}</span>
                    {hasPoint ? <span className="text-[9px]" style={{ color: TEXT_MUTED }}>set</span> : null}
                  </button>
                );
              })}
              {this.state.activeSpawnKey ? (
                <div className="mt-2 text-[10px]" style={{ color: ACCENT_GOLD }}>Click on the table to place {SPAWN_LABELS[this.state.activeSpawnKey]}</div>
              ) : null}

              <div className="mt-3 mb-2 pt-2 text-[10px] font-semibold uppercase tracking-widest" style={{ borderTop: `1px solid ${GOLD} 0.1)`, ...SECTION_HEADER_STYLE }}>Tracker Spawn Points</div>
              {getTrackerSpawnEntries().map((entry) => {
                const te = this.state.trackerEditing;
                const isActive = te && te.trackerKey === entry.trackerKey && te.player === entry.player;
                const configured = isTrackerConfigured(this.state.spawnConfig, entry.player, entry.trackerKey, TRACKER_DEFS[entry.trackerKey]);
                return (
                  <button
                    key={entry.spawnKey}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer"
                    style={isActive ? { background: `${GOLD} 0.15)`, color: ACCENT_GOLD } : { color: TEXT_BODY }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => {
                      this.clearTrackerPreviews();
                      if (isActive) {
                        this.hideTrackerCursorPreview();
                        this.setState({ trackerEditing: null, activeSpawnKey: null });
                      } else {
                        this.showTrackerCursorPreview();
                        this.setState({
                          trackerEditing: { trackerKey: entry.trackerKey, player: entry.player, flatIndex: 0 },
                          activeSpawnKey: null,
                        });
                      }
                    }}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="flex-1 text-left">{entry.label}</span>
                    {configured ? <span className="text-[9px]" style={{ color: TEXT_MUTED }}>set</span> : null}
                  </button>
                );
              })}
              {this.state.trackerEditing ? (
                <div className="mt-2 text-[10px]" style={{ color: ACCENT_GOLD }}>
                  {getTrackerProgressLabel(this.state.trackerEditing.trackerKey, this.state.trackerEditing.player, this.state.trackerEditing.flatIndex)}
                  <br />Click on the table to set this position.
                </div>
              ) : null}

            </div>
          ) : null}
          {this.renderDeckPicker()}

          {/* Shortcut help overlay — toggled by pressing ? */}
          {this.state.showShortcutHelp ? (
            <div
              className="fixed inset-0 z-[1200] flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
              onClick={() => this.setState({ showShortcutHelp: false })}
            >
              <div
                className="relative"
                style={{
                  width: 560,
                  zoom: this.state.viewScale,
                  background: `url("/tex-noise-panel.webp"), #0e0a06`,
                  border: `1px solid ${GOLD} 0.22)`,
                  borderRadius: '12px',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 32px rgba(180,140,60,0.08)',
                  padding: '20px 22px 18px',
                  isolation: 'isolate',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <FourCorners radius={12} />
                <div className="flex items-center justify-between mb-3">
                  <h2
                    className="text-lg font-bold arena-heading"
                    style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                  >
                    Keyboard Shortcuts
                  </h2>
                  <button
                    type="button"
                    className="px-3 py-1 text-xs cursor-pointer transition-all"
                    style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                    data-sound={UI.CANCEL}
                    onClick={() => this.setState({ showShortcutHelp: false })}
                  >
                    Close
                  </button>
                </div>
                <ShortcutList />
              </div>
            </div>
          ) : null}

          <PileSearchDialog
            pile={this.state.searchPile}
            query={this.state.searchQuery}
            sorceryCards={this.props.sorceryCards}
            onQueryChange={this.handlePileSearchQueryChange}
            onClose={this.handlePileSearchClose}
            onTakeToHand={(card) => this.takeCardFromPile(this.state.searchPile, card)}
            onTakeToField={this.handlePileSearchTakeToField}
          />
          {this.renderCardInspector()}
          {this.state.showMatchResult && this.props.isArenaMatch ? (
            <ArenaMatchResult
              ref={(ref) => { this.matchResultRef = ref; }}
              matchDurationMinutes={this.state.matchStartTime ? Math.round((Date.now() - this.state.matchStartTime) / 60000) : 0}
              roundsPlayed={this.state.turnNumber}
              onProposeWinner={(winner) => this.sync.proposeMatch(winner)}
              onRejectProposal={() => this.sync.rejectMatch()}
              onListenForProposal={(handler) => {
                this.matchResultProposalHandler = handler;
                // If a proposal arrived before the component mounted, deliver it now
                if (this.pendingMatchProposal) {
                  handler(this.pendingMatchProposal);
                  this.pendingMatchProposal = null;
                }
              }}
              onRewardsApplied={(reward) => {
                this.sync.confirmMatch(reward.won ? 'me' : 'opponent');
                if (this.props.onMatchReward) {
                  this.props.onMatchReward(reward);
                }
              }}
              onClose={() => {
                this.setState({ showMatchResult: false });
              }}
              onMatchComplete={() => {
                if (this.props.onExit) this.props.onExit();
              }}
            />
          ) : null}
          {this.state.showExitConfirm ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
              <div className="relative w-80 p-5" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.25)`, borderRadius: '12px', boxShadow: '0 0 60px rgba(0,0,0,0.5)', zoom: this.state.viewScale, isolation: 'isolate' }}>
                <FourCorners radius={12} />
                <h2 className="mb-2 text-lg font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>Leave game?</h2>
                <p className="mb-4 text-sm" style={{ color: TEXT_MUTED }}>
                  {this.props.isRankedMatch
                    ? 'Leaving a ranked match counts as a loss. Your opponent will be awarded the win.'
                    : 'Your game will be auto-saved. Are you sure you want to exit?'}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium cursor-pointer transition-all"
                    style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                    onClick={() => this.setState({ showExitConfirm: false })}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium cursor-pointer transition-all"
                    style={{ ...DANGER_BTN, borderRadius: '6px' }}
                    onClick={this.props.onExit}
                  >
                    Leave game
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {this.state.showSpawnConfirm ? (
            <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="w-80 rounded-2xl border border-border/70 bg-card p-5 shadow-2xl" style={{ zoom: this.state.viewScale }}>
                <h2 className="mb-2 text-lg font-semibold">Replace current game?</h2>
                <p className="mb-4 text-sm text-muted-foreground">This will clear all cards, piles, and your hand from the table and spawn a new deck.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted" onClick={() => this.setState({ showSpawnConfirm: false })}>
                    Cancel
                  </button>
                  <button type="button" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700" onClick={this.confirmSpawnDeck}>
                    Replace
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {this.state.showSaveDialog ? (
            <div className="fixed inset-0 z-[1100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => this.setState({ showSaveDialog: false })}>
              <div className="relative w-[420px] max-h-[70vh] flex flex-col" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.25)`, borderRadius: '12px', boxShadow: '0 0 60px rgba(0,0,0,0.5)', zoom: this.state.viewScale, isolation: 'isolate' }} onClick={(e) => e.stopPropagation()}>
                <FourCorners radius={12} />
                <div className="p-5" style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}>
                  <h2 className="text-lg font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>Save Session</h2>
                </div>

                {/* New save */}
                <div className="p-4" style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}>
                  <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={SECTION_HEADER_STYLE}>New Save</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter save name..."
                      value={this.state.saveDialogName}
                      onInput={(e) => this.setState({ saveDialogName: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter' && this.state.saveDialogName.trim()) this.manualSave(this.state.saveDialogName); }}
                      className="flex-1 px-3 py-2 text-sm outline-none"
                      style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50 transition-all"
                      style={GOLD_BTN}
                      disabled={!this.state.saveDialogName.trim()}
                      onClick={() => this.manualSave(this.state.saveDialogName)}
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* Existing saves */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={SECTION_HEADER_STYLE}>Overwrite Existing</div>
                  {this.state.savedSessions.length === 0 ? (
                    <p className="text-xs py-2" style={{ color: TEXT_MUTED }}>No existing saves.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {this.state.savedSessions.filter((s) => s.id !== 'autosave').map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          className="flex items-center justify-between px-3 py-2.5 text-left text-xs cursor-pointer transition-all"
                          style={session.id === this.state.currentSessionId
                            ? { border: `1px solid ${GOLD} 0.35)`, background: `${GOLD} 0.06)`, borderRadius: '6px' }
                            : { border: `1px solid ${GOLD} 0.1)`, borderRadius: '6px' }
                          }
                          onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = session.id === this.state.currentSessionId ? `${GOLD} 0.06)` : 'transparent'; }}
                          onClick={() => this.manualSave(session.name, session.id)}
                        >
                          <div>
                            <div className="font-medium" style={{ color: TEXT_PRIMARY }}>{session.name}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{new Date(session.savedAt).toLocaleString()}</div>
                          </div>
                          {session.id === this.state.currentSessionId ? (
                            <span className="text-[9px] font-semibold" style={{ color: ACCENT_GOLD }}>CURRENT</span>
                          ) : (
                            <span className="text-[9px]" style={{ color: TEXT_MUTED }}>Overwrite</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 flex justify-end" style={{ borderTop: `1px solid ${GOLD} 0.12)` }}>
                  <button type="button" className="px-4 py-2 text-sm cursor-pointer transition-all" style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }} onClick={() => this.setState({ showSaveDialog: false })}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Hand */}
        {this.renderHand(handCards, 'center')}
        {false && (
          <div
            className="fixed bottom-0 left-0 right-0 z-[1000]"
            style={{
              height: this.state.handRetracted ? '60px' : '140px',
              transition: 'height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
            onMouseEnter={() => {
              clearTimeout(this.handRetractTimer);
              this.setState({ handRetracted: false });
            }}
            onMouseMove={(e) => {
              clearTimeout(this.handRetractTimer);
              const N = handCards.length;
              if (N === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseX = e.clientX - rect.left - rect.width / 2;
              const maxAnglePerCard = N <= 3 ? 3 : N <= 5 ? 3 : N <= 8 ? 3 : N <= 12 ? 2 : 1.2;
              const totalArcMax = N <= 5 ? 15 : N <= 8 ? 22 : N <= 12 ? 22 : 15;
              const anglePerCard = Math.min(maxAnglePerCard, totalArcMax / Math.max(N - 1, 1));
              const arcRadius = 1600;
              const totalArc = anglePerCard * (N - 1);

              let closestIdx = -1;
              let closestDist = Infinity;
              for (let i = 0; i < N; i++) {
                const angleDeg = N === 1 ? 0 : -totalArc / 2 + i * anglePerCard;
                const cardX = arcRadius * Math.sin(angleDeg * Math.PI / 180);
                const dist = Math.abs(mouseX - cardX);
                if (dist < closestDist && dist < 80) {
                  closestDist = dist;
                  closestIdx = i;
                }
              }

              if (closestIdx !== this.state.hoveredHandIndex) {
                this.setState({ hoveredHandIndex: closestIdx });
              }
            }}
            onMouseLeave={() => {
              this.setState({ hoveredHandIndex: -1 });
              this.handRetractTimer = setTimeout(() => {
                this.setState({ handRetracted: true });
              }, 2000);
            }}
          >
            {handCards.map((card, i) => {
              const N = handCards.length;
              // Dynamic arc: less curve with more cards so edges stay visible
              const maxArc = N <= 5 ? 30 : N <= 8 ? 25 : N <= 12 ? 18 : 12;
              const maxAnglePerCard = N <= 5 ? 6 : N <= 8 ? 3.5 : N <= 12 ? 2 : 1.2;
              const anglePerCard = Math.min(maxAnglePerCard, maxArc / Math.max(N - 1, 1));
              const totalArc = anglePerCard * (N - 1);
              const angleDeg = N === 1 ? 0 : -totalArc / 2 + i * anglePerCard;
              const arcRadius = N <= 8 ? 1600 : 2400;

              const angleRad = angleDeg * (Math.PI / 180);
              let x = arcRadius * Math.sin(angleRad);
              const retractOffset = this.state.handRetracted ? 90 : 0;
              let y = arcRadius - arcRadius * Math.cos(angleRad) + 50 + retractOffset;
              let rotation = angleDeg;
              let scale = 1;
              let zIndex = i + 1;

              const hovered = this.state.hoveredHandIndex;
              if (i === hovered) {
                y = card.isSite ? -10 : -5;
                rotation = 0;
                scale = hoverScale;
                zIndex = N + 10;
              } else if (hovered >= 0) {
                const distance = Math.abs(i - hovered);
                const direction = i < hovered ? -1 : 1;
                x += direction * (60 / (distance + 0.5));
              }

              return (
                <div
                  key={card.id}
                  className="absolute pointer-events-auto cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => { if (e.button === 0) this.startHandCardDrag(e, card); }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.setState({
                      contextMenu: { x: e.clientX, y: e.clientY, type: 'handcard', cardInstance: card },
                    });
                  }}
                  style={{
                    left: '50%',
                    bottom: '0px',
                    width: '120px',
                    height: '175px',
                    zIndex,
                    transformOrigin: 'bottom center',
                    transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    transform: `translateX(calc(-50% + ${x}px)) translateY(${y - (card.isSite ? 30 : 0)}px) rotate(${rotation + (card.isSite ? 90 : 0)}deg) scale(${scale})`,
                  }}
                >
                  <div
                    className={cn(
                      'w-full h-full overflow-hidden rounded-lg card-mask',
                      isFoilFinish(card.foiling) && FOIL_OVERLAY_CLASSES
                    )}
                    data-foil={isFoilFinish(card.foiling) ? card.foiling : undefined}
                  >
                    <img
                      src={resolveLocalImageUrl(card.imageUrl)}
                      alt={card.name}
                      className="w-full h-full object-cover shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                      draggable={false}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  renderHand(cards, position) {
    if (!cards || cards.length === 0) return null;

    // Scale hand to viewport — use vw for width-based scaling
    const vw = window.innerWidth || 1920;
    const vh = window.innerHeight || 1080;
    const s = Math.max(0.8, Math.min(2.5, Math.max(vw / 1920, vh / 1080)));
    const cardW = Math.round(160 * s);
    const cardH = Math.round(224 * s);
    const arcRadius = Math.round(1800 * s);
    const spreadBase = Math.round(70 * s);
    const hoverDetectRadius = Math.round(100 * s);
    const containerHeight = Math.round(190 * s);
    const retractedHeight = Math.round(70 * s);
    const retractOffset = Math.round(120 * s);
    const hoverScale = 1.8;

    // Compute how wide the fan of cards actually is so the container only
    // covers that region. Everything outside the fan passes through to the
    // canvas beneath — no more full-width blocking div.
    const N = cards.length;

    const isLeft = position === 'left';
    const hoveredKey = isLeft ? 'hoveredAtlasHandIndex' : 'hoveredHandIndex';
    const retractKey = isLeft ? 'atlasHandRetracted' : 'handRetracted';

    // Use existing state keys for spellbook hand, simple hover for atlas
    const hovered = isLeft ? (this.state.hoveredAtlasHandIndex ?? -1) : this.state.hoveredHandIndex;
    const retracted = isLeft ? (this.state.atlasHandRetracted !== false) : this.state.handRetracted;

    // For the center hand: shrink the container to just the card fan
    // width (plus generous padding for hover-expansion) instead of the
    // full viewport width. This lets clicks in the empty regions on either
    // side pass through to the canvas beneath.
    let fanContainerWidth;
    if (!isLeft) {
      const maxAPC = N <= 3 ? 3 : N <= 5 ? 3 : N <= 8 ? 3 : N <= 12 ? 2 : 1.2;
      const tArcMax = N <= 5 ? 15 : N <= 8 ? 22 : N <= 12 ? 22 : 15;
      const apc = Math.min(maxAPC, tArcMax / Math.max(N - 1, 1));
      const tArc = apc * (N - 1);
      const halfArcRad = (tArc / 2) * (Math.PI / 180);
      const fanSpan = N <= 1 ? 0 : 2 * arcRadius * Math.sin(halfArcRad);
      // Padding: full hovered card width on each side + spread room
      fanContainerWidth = Math.round(fanSpan + cardW * hoverScale + spreadBase * 4);
    }

    return (
      <div
        data-tutorial={isLeft ? 'board-atlas-hand' : 'board-hand'}
        className="fixed z-[1000]"
        style={isLeft ? {
          left: retracted ? '-120px' : '0px', bottom: '60px', width: '200px', height: 'auto',
          transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflow: 'visible',
        } : {
          bottom: '0px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: `${fanContainerWidth}px`,
          maxWidth: '100vw',
          height: retracted ? `${retractedHeight}px` : `${containerHeight}px`,
          transition: 'height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
        onMouseEnter={() => {
          clearTimeout(isLeft ? this.atlasRetractTimer : this.handRetractTimer);
          this.setState({ [retractKey]: false });
        }}
        onMouseMove={(e) => {
          perf.count('hand.mousemove');
          clearTimeout(isLeft ? this.atlasRetractTimer : this.handRetractTimer);

          if (isLeft) {
            // Vertical stack for atlas
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseY = e.clientY - rect.top;
            const cardHeight = 70;
            const idx = Math.floor(mouseY / cardHeight);
            const clampedIdx = Math.max(-1, Math.min(idx, cards.length - 1));
            if (clampedIdx !== hovered) {
              if (clampedIdx >= 0) try { playUI(UI.HOVER, { volume: 0.4 }); } catch {}
              this.setState({ [hoveredKey]: clampedIdx });
            }
          } else {
            // Arc for spellbook
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - rect.width / 2;
            const N = cards.length;
            const maxAnglePerCard = N <= 3 ? 3 : N <= 5 ? 3 : N <= 8 ? 3 : N <= 12 ? 2 : 1.2;
            const totalArcMax = N <= 5 ? 15 : N <= 8 ? 22 : N <= 12 ? 22 : 15;
            const hoverAnglePerCard = Math.min(maxAnglePerCard, totalArcMax / Math.max(N - 1, 1));
            const totalArc = hoverAnglePerCard * (N - 1);

            let closestIdx = -1;
            let closestDist = Infinity;
            for (let i = 0; i < N; i++) {
              const angleDeg = N === 1 ? 0 : -totalArc / 2 + i * hoverAnglePerCard;
              const cardX = arcRadius * Math.sin(angleDeg * Math.PI / 180);
              const dist = Math.abs(mouseX - cardX);
              if (dist < closestDist && dist < hoverDetectRadius) { closestDist = dist; closestIdx = i; }
            }
            if (closestIdx !== hovered) {
              if (closestIdx >= 0) try { playUI(UI.HOVER, { volume: 0.4 }); } catch {}
              this.setState({ [hoveredKey]: closestIdx });
            }
          }
        }}
        onMouseLeave={() => {
          this.setState({ [hoveredKey]: -1 });
          const timer = setTimeout(() => this.setState({ [retractKey]: true }), 2000);
          if (isLeft) this.atlasRetractTimer = timer; else this.handRetractTimer = timer;
        }}
      >
        {cards.map((card, i) => {
          const N = cards.length;

          if (isLeft) {
            // Vertical stack on the left
            let yPos = i * 65;
            let scale = 1;
            let zIndex = i + 1;

            if (i === hovered) {
              scale = hoverScale;
              zIndex = N + 10;
            }

            return (
              <div
                key={card.id}
                className="absolute pointer-events-auto cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => { if (e.button === 0) this.startHandCardDrag(e, card); }}
                onContextMenu={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  this.setState({ contextMenu: { x: e.clientX, y: e.clientY, type: 'handcard', cardInstance: card } });
                }}
                style={{
                  left: '10px',
                  top: `${yPos}px`,
                  width: '120px',
                  height: '82px',
                  zIndex,
                  transformOrigin: 'left center',
                  transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  transform: `scale(${scale})`,
                }}
              >
                <div
                  className={cn('w-full h-full overflow-hidden rounded-md card-mask', isFoilFinish(card.foiling) && FOIL_OVERLAY_CLASSES)}
                  data-foil={isFoilFinish(card.foiling) ? card.foiling : undefined}
                >
                  <img src={resolveLocalImageUrl(card.imageUrl)} alt={card.name} className="w-full h-full object-cover shadow-[0_4px_20px_rgba(0,0,0,0.5)]" draggable={false} />
                </div>
              </div>
            );
          }

          // Spellbook hand — fanned arc at bottom center
          const maxAnglePC = N <= 3 ? 3 : N <= 5 ? 3 : N <= 8 ? 3 : N <= 12 ? 2 : 1.2;
          const totalArcMax = N <= 5 ? 15 : N <= 8 ? 22 : N <= 12 ? 22 : 15;
          const anglePerCard = Math.min(maxAnglePC, totalArcMax / Math.max(N - 1, 1));
          const totalArc = anglePerCard * (N - 1);
          const angleDeg = N === 1 ? 0 : -totalArc / 2 + i * anglePerCard;

          const angleRad = angleDeg * (Math.PI / 180);
          let x = arcRadius * Math.sin(angleRad);
          const rOffset = retracted ? retractOffset : 0;
          let y = arcRadius - arcRadius * Math.cos(angleRad) + 50 * s + rOffset;
          let rotation = angleDeg;
          let scale = 1;
          let zIndex = i + 1;

          if (i === hovered) {
            y = Math.round(-5 * s);
            rotation = 0;
            scale = 1.5;
            zIndex = N + 10;
          } else if (hovered >= 0) {
            const distance = Math.abs(i - hovered);
            const direction = i < hovered ? -1 : 1;
            x += direction * (spreadBase / (distance + 0.5));
          }

          return (
            <div
              key={card.id}
              className="absolute pointer-events-auto cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => { if (e.button === 0) this.startHandCardDrag(e, card); }}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation();
                this.setState({ contextMenu: { x: e.clientX, y: e.clientY, type: 'handcard', cardInstance: card } });
              }}
              style={{
                left: '50%',
                bottom: '0px',
                width: `${cardW}px`,
                height: `${cardH}px`,
                zIndex,
                transformOrigin: 'bottom center',
                transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px) rotate(${rotation}deg) scale(${scale})`,
              }}
            >
              <div
                className={cn('w-full h-full overflow-hidden rounded-lg card-mask', isFoilFinish(card.foiling) && FOIL_OVERLAY_CLASSES)}
                data-foil={isFoilFinish(card.foiling) ? card.foiling : undefined}
              >
                <img src={resolveLocalImageUrl(card.imageUrl)} alt={card.name} className="w-full h-full object-cover shadow-[0_4px_20px_rgba(0,0,0,0.5)]" draggable={false} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}
