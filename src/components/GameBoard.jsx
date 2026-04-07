import { Component, createRef } from 'preact';
import { toast } from 'sonner';
import { createTableScene } from '../utils/game/tableScene';
import { createCardMesh, createPileMesh, updatePileMesh, setCardBackUrls, disposeTextureCache, CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS, createTokenMesh, TOKEN_REST_Y, TOKEN_DRAG_Y, createLifeHUD, updateLifeHUD } from '../utils/game/cardMesh';
import { createGameState, createTrackerState, spawnDeck, drawFromPile, shufflePile, createTokenInstance, createDiceInstance } from '../utils/game/gameState';
import { createDiceMesh, animateDiceRoll, setDieFaceUp, DICE_REST_Y, DICE_DRAG_Y, DICE_CONFIGS } from '../utils/game/diceMesh';
import { loadSpawnConfig, getSpawnPoint, SPAWN_LABELS, SPAWN_COLORS, getTrackerPositions, setTrackerPosition, isTrackerConfigured, getTrackerTokenPosition } from '../utils/game/spawnConfig';
import { TRACKER_DEFS, PLAYERS, PLAYER_LABELS, getTrackerSpawnEntries, getTotalPositions, indexToRowPosition, getTrackerProgressLabel, trackerSpawnKey, valueToPositions } from '../utils/game/trackerConfig';
import CardInspector from './CardInspector';
import { addTween, animateCardFlip, animateCardTap, animateShufflePile, animateCardToPile, animateCardFromPile } from '../utils/game/animations';
import { saveGameSession, loadGameSession, listGameSessions } from '../utils/game/sessionStorage';
import { createRoom, createRoomWithCode, joinRoom, disconnectSocket, onPlayerJoined, onPlayerLeft, onStateSyncRequest, sendStateSync, requestStateSync, onStateSync } from '../utils/game/socketClient';
import { GameSyncBridge } from '../utils/game/syncBridge';
import { getLocalApiOrigin, resolveLocalImageUrl } from '../utils/localApi';
import { playSound, preloadSounds } from '../utils/game/sounds';
import { getSoundSettings, saveSoundSettings } from '../utils/arena/soundSettings';
import { updateMusicVolume } from '../utils/arena/musicManager';
import { cn } from '../lib/utils';
import RuneSpinner from './RuneSpinner';
import { playUI, UI } from '../utils/arena/uiSounds';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  BEVELED_BTN, GOLD_BTN, DANGER_BTN, INPUT_STYLE, DIALOG_STYLE,
  POPOVER_STYLE, SECTION_HEADER_STYLE, FourCorners, COIN_COLOR,
} from '../lib/medievalTheme';
import * as THREE from 'three';
import ArenaMatchResult from './ArenaMatchResult';
import { isFoilFinish, FOIL_OVERLAY_CLASSES } from '../utils/sorcery/foil.js';
import PileSearchDialog from './gameBoard/PileSearchDialog';
import GameContextMenu from './gameBoard/GameContextMenu';


export default class GameBoard extends Component {
  constructor(props) {
    super(props);

    this.canvasRef = createRef();
    this.scene = null;
    this.meshes = new Map();
    this.pileMeshes = new Map();
    this.dragging = null;
    this.hoveredMesh = null;
    this.lastMouseEvent = null;
    this.sync = new GameSyncBridge();
    this.spawnMarkers = new Map();
    this.tokenMeshes = new Map();
    this.lifeHUDs = new Map(); // cardId -> { sprite, plusMesh, minusMesh }
    this.diceMeshes = new Map();
    this.trackerPreviewMarkers = [];
    this.trackerCursorPreview = null;
    this.trackerTokenMeshes = new Map();
    this.trackerButtonMeshes = new Map();
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
      trackerEditing: null,
      showDiceMenu: false,
      currentTurn: 'p1',
      turnNumber: 1,
      showMatchResult: false,
      matchStartTime: null,
      showSoundSettings: false,
      soundSettings: getSoundSettings(),
    };
  }

  componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    preloadSounds();

    const apiOrigin = getLocalApiOrigin();
    setCardBackUrls(
      `${apiOrigin}/game-assets/cardback-spellbook-rounded.png`,
      `${apiOrigin}/game-assets/cardback-atlas-rounded.png`
    );
    this.scene = createTableScene(canvas, `${apiOrigin}/game-assets/battlemap.webp`, `${apiOrigin}/game-assets/table-background-hd.png`);

    canvas.addEventListener('mousedown', this.handleMouseDown);
    canvas.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('dblclick', this.handleDoubleClick);
    canvas.addEventListener('contextmenu', this.handleContextMenu);

    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    loadSpawnConfig().then((config) => {
      this.setState({ spawnConfig: config }, () => {
        this.createTrackerTokens();
        this.createTrackerButtons();
      });
    });

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
      // Give textures a moment to upload to GPU
      setTimeout(() => {
        this.setState({ isLoading: false });
      }, 500);
    });
    this.autoSaveTimer = setInterval(() => this.autoSave(), 60000);
  }

  componentWillUnmount() {
    const canvas = this.canvasRef.current;
    if (canvas) {
      canvas.removeEventListener('mousedown', this.handleMouseDown);
      canvas.removeEventListener('mousemove', this.handleMouseMove);
      canvas.removeEventListener('mouseup', this.handleMouseUp);
      canvas.removeEventListener('dblclick', this.handleDoubleClick);
      canvas.removeEventListener('contextmenu', this.handleContextMenu);
    }
    window.removeEventListener('resize', this.handleResize);
    clearTimeout(this.handRetractTimer);
    clearInterval(this.autoSaveTimer);
    this.autoSave();
    // Unsubscribe every game action handler before tearing down the socket.
    this.sync.destroy();
    disconnectSocket();
    this.meshes.clear();
    this.pileMeshes.clear();
    this.tokenMeshes.clear();
    this.lifeHUDs.clear();
    this.diceMeshes.clear();
    for (const [, mesh] of this.trackerTokenMeshes) {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    this.trackerTokenMeshes.clear();
    for (const [, mesh] of this.trackerButtonMeshes) {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    this.trackerButtonMeshes.clear();
    this.trackerPreviewMarkers = [];
    disposeTextureCache();
    this.scene?.dispose();
    this.scene = null;
  }

  handleResize = () => {
    this.scene?.resize();
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
    if (event.key === 'Tab') {
      event.preventDefault();
      this.passTurn();
      return;
    }
    if (event.key === 'Escape') {
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
        return;
      }

      // Check table cards
      if (this.hoveredMesh?.userData?.type === 'card') {
        this.setState({ inspectedCard: this.hoveredMesh.userData.cardInstance });
        return;
      }

      // Check hand cards
      const { hoveredHandIndex, handCards } = this.state;
      if (hoveredHandIndex >= 0 && handCards[hoveredHandIndex]) {
        this.setState({ inspectedCard: handCards[hoveredHandIndex] });
        return;
      }
      return;
    }

    if (this.state.inspectedCard) return;
    if (this.state.showExitConfirm || this.state.showDeckPicker) return;

    if ((event.key === 'f' || event.key === 'F') && this.hoveredMesh?.userData?.type === 'card') {
      const card = this.hoveredMesh.userData.cardInstance;
      if (!this.isOwnedCard(card)) return;
      card.faceDown = !card.faceDown;
      animateCardFlip(this.hoveredMesh, card);
      playSound('cardFlip');
      this.sync.flipCard(card.id, card.faceDown);
      return;
    }

    if ((event.key === 't' || event.key === 'T') && this.hoveredMesh?.userData?.type === 'card') {
      const card = this.hoveredMesh.userData.cardInstance;
      if (!this.isOwnedCard(card)) return;
      if (card.isSite) return;
      card.tapped = !card.tapped;
      animateCardTap(this.hoveredMesh, card);
      playSound('cardPlace');
      this.sync.tapCard(card.id, card.tapped);
      return;
    }

    if (event.key === '!' && event.shiftKey) {
      this.scene?.zoomToOverview();
      return;
    }

    if (event.key === '@' && event.shiftKey && this.hoveredMesh) {
      const pos = this.hoveredMesh.position;
      this.scene?.zoomToCard(pos.x, pos.z);
      return;
    }

    if (event.key === '#' && event.shiftKey) {
      this.scene?.flipPerspective();
      return;
    }

    if ((event.key === 'r' || event.key === 'R') && this.hoveredMesh?.userData?.type === 'pile') {
      if (!this.isOwnedPile(this.hoveredMesh.userData.pile)) return;
      const pile = this.hoveredMesh.userData.pile;
      animateShufflePile(this.hoveredMesh, pile, this.scene.scene);
      playSound('cardShuffle');
      shufflePile(this.state.gameState, pile.id);
      return;
    }

    if ((event.key === 'r' || event.key === 'R') && this.hoveredMesh?.userData?.type === 'dice') {
      this.rollDice(this.hoveredMesh.userData.diceInstance);
      return;
    }

    // WASD panning — handled via held keys in render loop
    if ('wasdWASD'.includes(event.key)) {
      this.scene?.setKeyHeld(event.key, true);
      return;
    }

    // Number keys: draw N cards from hovered pile
    const drawCount = parseInt(event.key, 10);
    if (drawCount >= 1 && drawCount <= 9 && this.hoveredMesh?.userData?.type === 'pile') {
      if (!this.isOwnedPile(this.hoveredMesh.userData.pile)) return;
      const pileId = this.hoveredMesh.userData.pile.id;
      for (let i = 0; i < drawCount; i++) {
        this.drawCard(pileId);
      }
      return;
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

    if (sessionMode === 'join') {
      const maxRetries = isArenaMatch ? 15 : 1;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          this.setState({ loadingMessage: attempt > 0 ? `Connecting to host (attempt ${attempt + 1})...` : 'Connecting to host...' });
          const roomInfo = await joinRoom(joinRoomCode);
          this.setState({
            roomCode: roomInfo.roomCode,
            connectionStatus: 'connected',
            isHost: false,
            loadingMessage: 'Preparing battlefield...',
            roomInfo,
          });
          this.setupSocketListeners();
          // Rotate camera 180° for player 2 perspective
          this.scene?.setOrbitTheta(Math.PI);
          return;
        } catch (error) {
          console.error(`Failed to join room (attempt ${attempt + 1}):`, error);
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 2000));
            disconnectSocket();
          } else {
            this.setState({ connectionStatus: 'offline' });
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
      disconnectSocket();
      toast.error('Opponent disconnected — session ended');
      this.props.onExit();
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
      this.setState({ handCards: myHand, opponentHand: state.opponentHandInfo || [] });
    });

    // Listen for remote game actions — broadcast=false to prevent re-emit loops
    const actionHandlers = {
      'card:place': (data) => {
        const instance = data.cardInstance;
        this.addCardToTable(instance, false);
      },
      'card:move': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (!mesh) return;
        // Free placement — smooth tween from current to target position.
        addTween({ target: mesh.position, property: 'x', from: mesh.position.x, to: data.x, duration: 200 });
        if (data.y !== undefined) addTween({ target: mesh.position, property: 'y', from: mesh.position.y, to: data.y, duration: 200 });
        addTween({ target: mesh.position, property: 'z', from: mesh.position.z, to: data.z, duration: 200 });
      },
      'card:tap': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (mesh) {
          const card = mesh.userData.cardInstance;
          card.tapped = data.tapped;
          animateCardTap(mesh, card);
        }
      },
      'card:flip': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (mesh) {
          const card = mesh.userData.cardInstance;
          card.faceDown = data.faceDown;
          animateCardFlip(mesh, card);
        }
      },
      'card:remove': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (mesh) {
          this.scene.scene.remove(mesh);
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
          this.meshes.delete(data.cardId);
        }
        this.lifeHUDs.delete(data.cardId);
      },
      // Full-pile sync: authoritative update for a single pile.
      // Sent by the acting player whenever a pile's card list changes
      // (draw, discard, shuffle, cemetery creation). Carries the entire
      // pile object so the receiver's state always matches the sender's.
      'pile:sync': (data) => {
        if (!data?.pile?.id) return;
        const incoming = data.pile;
        const { gameState } = this.state;
        const existing = gameState.piles.find((p) => p.id === incoming.id);
        if (existing) {
          // Mutate in place so existing mesh.userData.pile references stay
          // valid — otherwise the pile search dialog and context menu read
          // stale card lists after a sync and the player can't search.
          existing.cards = incoming.cards;
          existing.name = incoming.name;
          existing.x = incoming.x;
          existing.z = incoming.z;
          existing.rotated = incoming.rotated;
        } else {
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
        this.setState({ opponentHand: data.cards || [] });
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
          this.matchResultRef.applyRewards(iWon);
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

  isOwnedCard(cardInstance) {
    if (this.state.connectionStatus === 'offline') return true;
    return !!cardInstance?.rotated === !this.state.isHost;
  }

  isOwnedPile(pile) {
    if (this.state.connectionStatus === 'offline') return true;
    return !!pile?.rotated === !this.state.isHost;
  }

  // --- 3D Interaction ---

  getInteractableMeshes() {
    const meshes = [...this.meshes.values(), ...this.pileMeshes.values(), ...this.tokenMeshes.values(), ...this.diceMeshes.values(), ...this.trackerButtonMeshes.values()];
    for (const hud of this.lifeHUDs.values()) {
      meshes.push(hud.plusMesh, hud.minusMesh, hud.hpPlusMesh, hud.hpMinusMesh);
    }
    return meshes;
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
    if (this.props.isSpectating) return;
    if (event.button !== 0) return;
    this.setState({ contextMenu: null });

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
    if (hits.length === 0) return;

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

    if (hit?.userData.type === 'card') {
      if (!this.isOwnedCard(hit.userData.cardInstance)) return;
      // Free drag — pure sandbox, no grid logic.
      this.dragging = {
        mesh: hit,
        cardInstance: hit.userData.cardInstance,
        offsetX: 0,
        offsetZ: 0,
      };
      hit.position.y = this.scene.CARD_DRAG_Y;
      playSound('cardPickup');
      event.preventDefault();
    }
  };

  handleMouseMove = (event) => {
    if (this.props.isSpectating) return;
    this.lastMouseEvent = event;

    if (this.dragging) {
      const point = this.scene.raycastTablePoint(event);
      if (!point) return;
      this.dragging.mesh.position.x = point.x;
      this.dragging.mesh.position.z = point.z;
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

      // Remove highlight from old
      if (this.hoveredMesh?.material) {
        if (this.hoveredMesh.userData?.action === 'integrated') {
          // Integrated button: revert to fully transparent
          this.hoveredMesh.material.opacity = 0;
        } else {
          const mats = Array.isArray(this.hoveredMesh.material) ? this.hoveredMesh.material : [this.hoveredMesh.material];
          mats.forEach((m) => { if (m.emissive) m.emissive.setHex(0x000000); });
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
    }

  };

  handleMouseUp = (event) => {
    if (this.props.isSpectating) return;
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

    // Card drop — pure free placement (sandbox mode, no grid).
    const card = this.dragging.cardInstance;
    card.x = droppedMesh.position.x;
    card.z = droppedMesh.position.z;

    // Stack on top of any cards directly underneath the drop point.
    let highestY = this.scene.CARD_REST_Y;
    for (const [, mesh] of this.meshes) {
      if (mesh === droppedMesh) continue;
      const dx = Math.abs(mesh.position.x - droppedMesh.position.x);
      const dz = Math.abs(mesh.position.z - droppedMesh.position.z);
      if (dx < CARD_WIDTH * 0.6 && dz < CARD_HEIGHT * 0.6) {
        const topOfCard = mesh.position.y + CARD_THICKNESS;
        if (topOfCard > highestY) highestY = topOfCard;
      }
    }
    droppedMesh.position.y = highestY;

    playSound('cardPlace');
    this.sync.moveCard({
      cardId: card.id,
      x: card.x,
      y: droppedMesh.position.y,
      z: card.z,
    });
    this.dragging = null;
  };

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
      if (!this.isOwnedCard(hit.userData.cardInstance)) return;
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
      if (!this.isOwnedCard(hit.userData.cardInstance)) return;
      this.setState({
        contextMenu: {
          x: event.clientX,
          y: event.clientY,
          type: 'card',
          cardInstance: hit.userData.cardInstance,
          mesh: hit,
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
      mesh.material.dispose();
    }
    this.trackerTokenMeshes.clear();

    const { spawnConfig, gameState } = this.state;

    for (const player of PLAYERS) {
      for (const [trackerKey, def] of Object.entries(TRACKER_DEFS)) {
        if (!isTrackerConfigured(spawnConfig, player, trackerKey, def)) continue;

        const value = gameState.trackers[player][trackerKey];
        const positions = valueToPositions(trackerKey, value);

        for (const { row, posIndex } of positions) {
          const pos = getTrackerTokenPosition(spawnConfig, player, trackerKey, row, posIndex);
          if (!pos) continue;

          const meshKey = this.trackerMeshKey(player, trackerKey, row);
          const tokenInstance = { id: `tracker-${player}-${trackerKey}-${row || 'single'}`, x: pos.x, z: pos.z, color: 'red' };
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
      mesh.material.dispose();
    }
    this.trackerButtonMeshes.clear();

    const { spawnConfig } = this.state;
    const btnRadius = 1.2;
    const btnHeight = 0.2;

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
          mesh.position.set(btnPos.x, btnHeight / 2 + 0.1, btnPos.z);
          mesh.userData = { type: 'trackerButton', action: 'integrated', player, trackerKey };
          this.scene.scene.add(mesh);
          this.trackerButtonMeshes.set(`${player}_${trackerKey}_integrated`, mesh);
          continue;
        }

        // Life/Mana: separate red (-) and green (+) buttons at computed offsets
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

        // Minus button
        const minusGeo = new THREE.CylinderGeometry(btnRadius, btnRadius, btnHeight, 32);
        const minusMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.5, metalness: 0.1 });
        const minusMesh = new THREE.Mesh(minusGeo, minusMat);
        minusMesh.position.set(minusPos.x, btnHeight / 2 + 0.1, minusPos.z);
        minusMesh.receiveShadow = true;
        minusMesh.userData = { type: 'trackerButton', action: 'decrement', player, trackerKey };
        this.scene.scene.add(minusMesh);
        this.trackerButtonMeshes.set(`${player}_${trackerKey}_minus`, minusMesh);

        // Plus button
        const plusGeo = new THREE.CylinderGeometry(btnRadius, btnRadius, btnHeight, 32);
        const plusMat = new THREE.MeshStandardMaterial({ color: 0x22aa44, roughness: 0.5, metalness: 0.1 });
        const plusMesh = new THREE.Mesh(plusGeo, plusMat);
        plusMesh.position.set(plusPos.x, btnHeight / 2 + 0.1, plusPos.z);
        plusMesh.receiveShadow = true;
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
  };

  addCardToTable = (cardInstance, broadcast = true) => {
    const mesh = createCardMesh(cardInstance);
    this.scene.scene.add(mesh);
    this.meshes.set(cardInstance.id, mesh);

    // Add ATK + HP HUD for minion-type cards
    if (cardInstance.type !== 'Site' && cardInstance.type !== 'Avatar') {
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

    // Restore saved Y position (for stacked cards) or use default
    if (cardInstance.y !== undefined && cardInstance.y > 0) {
      mesh.position.y = cardInstance.y;
    }

    // Drop-in animation (skip during session restore / initial spawn)
    if (!this.sync.isSuppressed) {
      const targetY = mesh.position.y;
      mesh.position.y = targetY + 15;
      addTween({ target: mesh.position, property: 'y', from: mesh.position.y, to: targetY, duration: 300 });
    }

    if (broadcast) this.sync.placeCard(cardInstance);
  };

  removeCardFromTable = (cardInstance, broadcast = true) => {
    const mesh = this.meshes.get(cardInstance.id);
    if (mesh) {
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
      this.meshes.delete(cardInstance.id);
    }
    this.lifeHUDs.delete(cardInstance.id);
    if (broadcast) this.sync.removeCard(cardInstance.id);
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

  // Resolve the destination pile for a given card + name.
  // Cemetery is special: each player has their own (deterministic id),
  // routed by the card's rotation.
  findDestinationPile = (cardInstance, pileName) => {
    if (pileName === 'Cemetery') {
      return this.findOrCreateCemetery(cardInstance.rotated);
    }
    // For other piles (Spellbook, Atlas, Collection), keep the existing
    // lookup by name — those are spawned from the deck and uniquely named.
    return this.findPileByName(pileName);
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

  // --- Hand to Table ---

  startHandCardDrag = (event, cardInstance) => {
    event.preventDefault();
    playUI('snd-card-hand-click.wav', { volume: 0.6 });

    // Remove from hand immediately
    this.removeFromHand(cardInstance);
    this.setState({ hoveredHandIndex: -1 });

    // Create 3D mesh at cursor position
    const point = this.scene.raycastTablePoint(event);
    if (point) {
      cardInstance.x = point.x;
      cardInstance.z = point.z;
    }
    this.addCardToTable(cardInstance);

    // Start dragging the new mesh
    const mesh = this.meshes.get(cardInstance.id);
    if (mesh) {
      this.dragging = {
        mesh,
        cardInstance,
        offsetX: 0,
        offsetZ: 0,
      };
      mesh.position.y = this.scene.CARD_DRAG_Y;
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
    drawCard: this.handleDrawCardFromPile,
    shufflePile: this.shufflePileAction,
    openPileSearch: this.openPileSearch,
    drawPileToHand: this.drawPileToHand,
    sendHandCardToPile: this.sendHandCardToPile,
    deleteToken: this.deleteToken,
    rollDice: this.handleRollDiceAndClose,
    setDiceValue: this.setDiceValue,
    deleteDice: this.deleteDice,
  });

  takeCardFromPile = (pile, cardInstance) => {
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

    const { savedDecks } = this.props;
    const sorceryDecks = savedDecks || [];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => this.setState({ showDeckPicker: false })}>
        <div className="relative w-[520px] max-h-[70vh] flex flex-col" style={DIALOG_STYLE} onClick={(e) => e.stopPropagation()}>
          <FourCorners radius={12} />
          <h2 className="shrink-0 px-6 pt-6 pb-4 text-lg font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Spawn Deck</h2>
          <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
            {sorceryDecks.length === 0 ? (
              <p className="text-sm" style={{ color: TEXT_MUTED }}>No saved Sorcery decks. Build and save a deck first.</p>
            ) : (
              <div className="grid gap-2">
                {sorceryDecks.map((deck) => (
                  <div key={deck.id} className="relative flex items-center gap-2 p-3" style={{ background: `${GOLD} 0.03)`, border: `1px solid ${GOLD} 0.12)`, borderRadius: '8px' }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" style={{ color: TEXT_PRIMARY }}>{deck.name}</div>
                      <div className="text-xs" style={{ color: TEXT_MUTED }}>{deck.cardCount} cards</div>
                    </div>
                    <button type="button" className="px-2.5 py-1 text-xs font-medium cursor-pointer transition-all" style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }} onClick={() => this.loadAndSpawnDeck(deck.id, 1)}>P1</button>
                    <button type="button" className="px-2.5 py-1 text-xs font-medium cursor-pointer transition-all" style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }} onClick={() => this.loadAndSpawnDeck(deck.id, 2)}>P2</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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
    const { onExit } = this.props;
    const { handCards, contextMenu } = this.state;

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={() => contextMenu && this.setState({ contextMenu: null })}>
        {/* Loading overlay */}
        {this.state.isLoading ? (
          <div className="fixed inset-0 z-[2000] bg-black flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <RuneSpinner size={64} />
              <p className="text-sm" style={{ color: TEXT_BODY }}>{this.state.loadingMessage}</p>
            </div>
          </div>
        ) : null}

        {/* Floating sidebar buttons — top left */}
        <div className="fixed top-3 left-3 z-[1001] flex flex-col gap-2">
          {/* Burger menu */}
          <button
            type="button"
            className="size-10 rounded-xl flex items-center justify-center cursor-pointer transition-all" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.2)`, color: TEXT_BODY }}
            onClick={() => { playSound('uiClick'); this.setState((s) => ({ showGameMenu: !s.showGameMenu })); }}
            title="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>

          {/* Spawn Deck — hidden in ranked matches (deck is pre-selected) */}
          {!this.props.arenaSelectedDeckId ? (
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

          {/* Connection status indicator */}
          {this.state.connectionStatus !== 'offline' ? (
            <div className="size-10 rounded-xl flex items-center justify-center" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.15)` }} title={this.state.connectionStatus}>
              <div className={cn('size-2.5 rounded-full', this.state.connectionStatus === 'connected' ? 'bg-green-400' : this.state.connectionStatus === 'waiting' ? 'bg-blue-400 animate-pulse' : 'bg-red-400')} />
            </div>
          ) : null}

          {/* Burger menu dropdown */}
          {this.state.showGameMenu ? (
            <div className="w-52 p-1.5" style={POPOVER_STYLE}>
              {/* Multiplayer section */}
              <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Session</div>
              {this.state.connectionStatus === 'offline' ? (
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: '#6ab04c' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.startMultiplayer(); this.setState({ showGameMenu: false }); }}>
                  <div className="size-2 rounded-full bg-green-400" /> Go Online
                </button>
              ) : (
                <>
                  {this.state.roomCode ? (
                    <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/80 hover:bg-white/10 font-mono" onClick={() => { navigator.clipboard?.writeText(this.state.roomCode); toast('Code copied to clipboard'); }} title="Click to copy">
                      Code: {this.state.roomCode}
                    </button>
                  ) : null}
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: '#c45050' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.stopMultiplayer(); this.setState({ showGameMenu: false }); }}>
                    Stop Online
                  </button>
                </>
              )}

              <div className="mx-2 my-1 h-px" style={{ background: `${GOLD} 0.1)` }} />

              {/* Save */}
              {!this.props.isRankedMatch && this.state.isHost ? (
                <>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.quickSave(); this.setState({ showGameMenu: false }); }}>
                    Quick Save{this.state.currentSessionName ? ` (${this.state.currentSessionName})` : ''}
                  </button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.openSaveDialog(); this.setState({ showGameMenu: false }); }}>
                    Save As...
                  </button>
                </>
              ) : null}

              {/* Spawn config — dev only */}
              {this.props.devMode ? (
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.toggleSpawnEditor(); this.setState({ showGameMenu: false }); }}>
                  {this.state.isPlacingSpawns ? 'Done Placing' : 'Set Spawn Points'}
                </button>
              ) : null}

              {this.props.isRankedMatch && this.state.connectionStatus === 'connected' ? (
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: ACCENT_GOLD }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => this.setState({ showMatchResult: true, showGameMenu: false })}>
                  End Match
                </button>
              ) : null}
              {this.props.isRankedMatch && this.state.connectionStatus !== 'connected' ? (
                <div className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-not-allowed" style={{ color: TEXT_MUTED }}>
                  End Match (waiting for opponent)
                </div>
              ) : null}

              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.setState({ showGameMenu: false }); if (this.props.onOpenSettings) this.props.onOpenSettings(); }}>
                Settings
              </button>

              <div className="mx-2 my-1 h-px" style={{ background: `${GOLD} 0.1)` }} />

              {/* Exit */}
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: '#c45050' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.requestExit(); this.setState({ showGameMenu: false }); }}>
                Exit Game
              </button>
            </div>
          ) : null}
        </div>

        {/* Opponent hand — fanned arc at top, face down */}
        {this.state.opponentHand.length > 0 ? (() => {
          const oCards = this.state.opponentHand;
          const N = oCards.length;
          const vs = Math.max(0.8, Math.min(2.5, Math.max((window.innerWidth || 1920) / 1920, (window.innerHeight || 1080) / 1080)));
          const oCW = Math.round(100 * vs);
          const oCH = Math.round(140 * vs);
          const oRadius = Math.round(1200 * vs);
          const oMaxAngle = N <= 3 ? 3 : N <= 5 ? 3 : N <= 8 ? 3 : N <= 12 ? 2 : 1.2;
          const oTotalMax = N <= 5 ? 15 : N <= 8 ? 22 : N <= 12 ? 22 : 15;
          const oAnglePerCard = Math.min(oMaxAngle, oTotalMax / Math.max(N - 1, 1));
          const oTotalArc = oAnglePerCard * (N - 1);
          const apiOrigin = getLocalApiOrigin();

          return (
            <div className="fixed top-0 left-0 right-0 z-[999] pointer-events-none" style={{ height: `${Math.round(80 * vs)}px` }}>
              {oCards.map((card, i) => {
                const angleDeg = N === 1 ? 0 : -oTotalArc / 2 + i * oAnglePerCard;
                const angleRad = angleDeg * (Math.PI / 180);
                const x = oRadius * Math.sin(angleRad);
                const y = -(oRadius - oRadius * Math.cos(angleRad)) - Math.round(30 * vs);
                const backImg = card.isSite
                  ? `${apiOrigin}/game-assets/cardback-atlas-rounded.png`
                  : `${apiOrigin}/game-assets/cardback-spellbook-rounded.png`;

                return (
                  <div
                    key={i}
                    className="absolute"
                    style={{
                      left: '50%',
                      top: '0px',
                      width: `${oCW}px`,
                      height: `${oCH}px`,
                      zIndex: i + 1,
                      transformOrigin: 'top center',
                      transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px) rotate(${180 + angleDeg}deg)`,
                    }}
                  >
                    <img
                      src={backImg}
                      alt="Opponent card"
                      className="w-full h-full object-cover rounded-lg shadow-[0_4px_15px_rgba(0,0,0,0.4)]"
                      draggable={false}
                    />
                  </div>
                );
              })}
            </div>
          );
        })() : null}

        {/* 3D Canvas */}
        <div className="relative flex-1 min-h-0">
          <canvas
            ref={this.canvasRef}
            className="block w-full h-full"
          />

          <GameContextMenu
            contextMenu={this.state.contextMenu}
            actions={this.buildContextMenuActions()}
          />

          {/* Life & Mana HUD */}
          {(() => {
            const localPlayer = this.state.isHost ? 'p1' : 'p2';
            const opponentPlayer = localPlayer === 'p1' ? 'p2' : 'p1';
            const isMyTurn = this.state.currentTurn === localPlayer;
            // Always render the local player first so "You" is on top on
            // both clients, regardless of whether they host or joined.
            const orderedPlayers = [localPlayer, opponentPlayer];
            return (
              <div className="absolute top-3 right-3 z-10 px-5 py-4" style={{ ...POPOVER_STYLE, borderRadius: '12px', boxShadow: '0 18px 48px rgba(0,0,0,0.4), 0 0 20px rgba(180,140,60,0.04)' }}>
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
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[4] pointer-events-none">
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
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[4] pointer-events-none">
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
            <div className="absolute top-2 left-2 z-10 w-56 max-h-[80vh] overflow-y-auto p-2" style={POPOVER_STYLE}>
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
          <PileSearchDialog
            pile={this.state.searchPile}
            query={this.state.searchQuery}
            resolveImageUrl={resolveLocalImageUrl}
            onQueryChange={this.handlePileSearchQueryChange}
            onClose={this.handlePileSearchClose}
            onTakeToHand={(card) => this.takeCardFromPile(this.state.searchPile, card)}
            onTakeToField={this.handlePileSearchTakeToField}
          />
          {this.renderCardInspector()}
          {this.state.showMatchResult && this.props.isRankedMatch ? (
            <ArenaMatchResult
              ref={(ref) => { this.matchResultRef = ref; }}
              matchDurationMinutes={this.state.matchStartTime ? Math.round((Date.now() - this.state.matchStartTime) / 60000) : 0}
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
                if (this.props.isRankedMatch && this.props.onExit) {
                  this.props.onExit();
                }
              }}
            />
          ) : null}
          {this.state.showExitConfirm ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
              <div className="relative w-80 p-5" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.25)`, borderRadius: '12px', boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}>
                <FourCorners radius={12} />
                <h2 className="mb-2 text-lg font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>Leave game?</h2>
                <p className="mb-4 text-sm" style={{ color: TEXT_MUTED }}>Your game will be auto-saved. Are you sure you want to exit?</p>
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
              <div className="w-80 rounded-2xl border border-border/70 bg-card p-5 shadow-2xl">
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
              <div className="relative w-[420px] max-h-[70vh] flex flex-col" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.25)`, borderRadius: '12px', boxShadow: '0 0 60px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
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

    const isLeft = position === 'left';
    const hoveredKey = isLeft ? 'hoveredAtlasHandIndex' : 'hoveredHandIndex';
    const retractKey = isLeft ? 'atlasHandRetracted' : 'handRetracted';

    // Use existing state keys for spellbook hand, simple hover for atlas
    const hovered = isLeft ? (this.state.hoveredAtlasHandIndex ?? -1) : this.state.hoveredHandIndex;
    const retracted = isLeft ? (this.state.atlasHandRetracted !== false) : this.state.handRetracted;

    return (
      <div
        className="fixed z-[1000]"
        style={isLeft ? {
          left: retracted ? '-120px' : '0px', bottom: '60px', width: '200px', height: 'auto',
          transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflow: 'visible',
        } : {
          bottom: '0px', left: '0px', right: '0px',
          height: retracted ? `${retractedHeight}px` : `${containerHeight}px`,
          transition: 'height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
        onMouseEnter={() => {
          clearTimeout(isLeft ? this.atlasRetractTimer : this.handRetractTimer);
          this.setState({ [retractKey]: false });
        }}
        onMouseMove={(e) => {
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
