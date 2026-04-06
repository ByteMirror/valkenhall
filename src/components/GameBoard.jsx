import { Component, createRef } from 'preact';
import { toast } from 'sonner';
import { createTableScene } from '../utils/game/tableScene';
import { createCardMesh, createPileMesh, updatePileMesh, setCardBackUrls, disposeTextureCache, CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS, createTokenMesh, TOKEN_REST_Y, TOKEN_DRAG_Y, createLifeHUD, updateLifeHUD } from '../utils/game/cardMesh';
import { createGameState, createTrackerState, spawnDeck, drawFromPile, shufflePile, createTokenInstance, createDiceInstance } from '../utils/game/gameState';
import { createDiceMesh, animateDiceRoll, setDieFaceUp, DICE_REST_Y, DICE_DRAG_Y, DICE_CONFIGS } from '../utils/game/diceMesh';
import { loadSpawnConfig, saveSpawnConfig, getSpawnPoint, SPAWN_LABELS, SPAWN_COLORS, getTrackerPositions, setTrackerPosition, isTrackerConfigured, getTrackerTokenPosition, getGameGrid, setGameGrid } from '../utils/game/spawnConfig';
import { TRACKER_DEFS, PLAYERS, PLAYER_LABELS, getTrackerSpawnEntries, getTotalPositions, indexToRowPosition, getTrackerProgressLabel, trackerSpawnKey, valueToPositions } from '../utils/game/trackerConfig';
import CardInspector from './CardInspector';
import { addTween, animateCardFlip, animateCardTap, animateShufflePile, animateCardToPile, animateCardFromPile } from '../utils/game/animations';
import { saveGameSession, loadGameSession, listGameSessions } from '../utils/game/sessionStorage';
import { createRoom, createRoomWithCode, joinRoom, emitGameAction, onGameAction, offGameAction, disconnectSocket, onPlayerJoined, onPlayerLeft, onStateSyncRequest, sendStateSync, requestStateSync, onStateSync } from '../utils/game/socketClient';
import { getLocalApiOrigin } from '../utils/localApi';
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
import { resolveCombat, resolveSiteAttack, getValidTargets, resolveMultiCombat, getDefenders, getInterceptors } from '../utils/game/combat';
import { getMovementAbilities, getMaxSteps, isValidStep, getLevelOptions, LEVELS } from '../utils/game/movementAbilities';


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
    this.suppressBroadcast = false;
    this.spawnMarkers = new Map();
    this.tokenMeshes = new Map();
    this.lifeHUDs = new Map(); // cardId -> { sprite, plusMesh, minusMesh }
    this.diceMeshes = new Map();
    this.trackerPreviewMarkers = [];
    this.trackerCursorPreview = null;
    this.trackerTokenMeshes = new Map();
    this.trackerButtonMeshes = new Map();
    this.gridLinesMesh = null;
    this.gridBorderMesh = null;
    this.gridHandles = [];
    this.gridDraggingHandle = null;
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
      gridEditMode: null,
      gridDragStart: null,
      gridDragEnd: null,
      gridAdjustHandle: null,
      combatSelectingTarget: null,
      pendingAttack: null,
      defendPrompt: null,
      waitingForDefense: false,
      interceptPrompt: null,
      waitingForIntercept: false,
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

    this.initSession().then(() => {
      // Auto-spawn deck for ranked matchmaking
      if (this.props.arenaSelectedDeckId) {
        this.doSpawnDeck(this.props.arenaSelectedDeckId, 1).catch(() => {});
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
    this.clearGridVisualization();
    if (this._combatHighlightPulse) cancelAnimationFrame(this._combatHighlightPulse);
    if (this._defendHighlightPulse) cancelAnimationFrame(this._defendHighlightPulse);
    if (this._interceptHighlightPulse) cancelAnimationFrame(this._interceptHighlightPulse);
    this.clearPathStepLabel();
    disposeTextureCache();
    this.scene?.dispose();
    this.scene = null;
  }

  handleResize = () => {
    this.scene?.resize();
  };

  broadcastHandInfo = (handCards) => {
    emitGameAction('hand:info', {
      cards: handCards.map((c) => ({ isSite: c.isSite || false })),
    });
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
      if (this._pathMode) {
        this.cancelPathMode();
        this.hideGridCellHighlight();
        this.setState({ contextMenu: null });
        return;
      }
      if (this.state.combatSelectingTarget) {
        this.clearCombatHighlights();
        toast('Target selection cancelled');
        return;
      }
      // Don't allow escape out of defend/intercept prompts or waiting states
      if (this.state.defendPrompt || this.state.interceptPrompt || this.state.waitingForDefense || this.state.waitingForIntercept) return;
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
      emitGameAction('card:flip', { cardId: card.id, faceDown: card.faceDown });
      return;
    }

    if ((event.key === 't' || event.key === 'T') && this.hoveredMesh?.userData?.type === 'card') {
      const card = this.hoveredMesh.userData.cardInstance;
      if (!this.isOwnedCard(card)) return;
      if (card.isSite) return;
      card.tapped = !card.tapped;
      animateCardTap(this.hoveredMesh, card);
      playSound('cardPlace');
      emitGameAction('card:tap', { cardId: card.id, tapped: card.tapped });
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
        const code = await createRoomWithCode(joinRoomCode);
        this.setState({ roomCode: code, connectionStatus: 'waiting', isHost: true });
        this.setupSocketListeners();
      } catch (error) {
        console.error('Failed to create matchmaking room:', error);
        this.setState({ connectionStatus: 'offline' });
      }
      return;
    }

    if (sessionMode === 'join') {
      const maxRetries = isArenaMatch ? 5 : 1;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          this.setState({ loadingMessage: attempt > 0 ? `Connecting to host (attempt ${attempt + 1})...` : 'Connecting to host...' });
          const code = await joinRoom(joinRoomCode);
          this.setState({ roomCode: code, connectionStatus: 'connected', isHost: false, loadingMessage: 'Syncing game state...' });
          this.setupSocketListeners();
          if (!isArenaMatch) requestStateSync();
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
      if (!this.state.isHost) {
        disconnectSocket();
        toast.error('Host disconnected');
        this.props.onExit();
        return;
      }
      this.setState({ connectionStatus: 'opponent disconnected' });
      toast.warning('Opponent disconnected');
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
        if (mesh) {
          addTween({ target: mesh.position, property: 'x', from: mesh.position.x, to: data.x, duration: 200 });
          if (data.y !== undefined) addTween({ target: mesh.position, property: 'y', from: mesh.position.y, to: data.y, duration: 200 });
          addTween({ target: mesh.position, property: 'z', from: mesh.position.z, to: data.z, duration: 200 });
        }
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
      },
      'pile:update': () => {
        this.updatePileMeshes();
      },
      'hand:info': (data) => {
        this.setState({ opponentHand: data.cards || [] });
      },
      'deck:spawn': (data) => {
        if (data.deck) {
          this.suppressBroadcast = true;
          this.spawnSelectedDeck(data.deck, data.playerNum);
          this.suppressBroadcast = false;
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
      'combat:resolve': (data) => {
        this.applyRemoteCombatResolve(data);
      },
      'combat:siteAttack': (data) => {
        this.applyRemoteSiteAttack(data);
      },
      'combat:declareAttack': (data) => {
        this.handleRemoteDeclareAttack(data);
      },
      'combat:defendResponse': (data) => {
        this.handleRemoteDefendResponse(data);
      },
      'combat:moveComplete': (data) => {
        this.handleRemoteMoveComplete(data);
      },
      'combat:interceptResponse': (data) => {
        this.handleRemoteInterceptResponse(data);
      },
      'combat:multiResolve': (data) => {
        this.applyRemoteMultiCombatResolve(data);
      },
      'card:level': (data) => {
        const mesh = this.meshes.get(data.cardId);
        if (mesh) {
          const ci = mesh.userData.cardInstance;
          ci._level = data.level;
          this.updateLevelIndicator(ci, mesh);
        }
      },
    };

    for (const [event, handler] of Object.entries(actionHandlers)) {
      onGameAction(event, handler);
    }
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
    this.suppressBroadcast = true;
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
    this.suppressBroadcast = false;
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

    // Grid editor: drag-start — begin rectangle definition
    if (this.state.gridEditMode === 'drag-start') {
      const point = this.scene.raycastTablePoint(event);
      if (point) {
        this.setState({ gridEditMode: 'drag-end', gridDragStart: { x: point.x, z: point.z }, gridDragEnd: { x: point.x, z: point.z } });
      }
      return;
    }

    // Grid editor: adjust mode — check if a handle was clicked
    if (this.state.gridEditMode === 'adjust') {
      if (this.gridHandles.length > 0) {
        const handleHits = this.scene.raycastObjects(event, this.gridHandles);
        if (handleHits.length > 0) {
          const handle = handleHits[0].object;
          this.gridDraggingHandle = handle;
          event.preventDefault();
          return;
        }
      }
      return;
    }

    if (this.state.isPlacingSpawns && this.state.activeSpawnKey) {
      const point = this.scene.raycastTablePoint(event);
      if (point) {
        const key = this.state.activeSpawnKey;
        const newConfig = { ...this.state.spawnConfig, [key]: { x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10 } };
        this.setState({ spawnConfig: newConfig, activeSpawnKey: null });
        saveSpawnConfig(newConfig);
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
      saveSpawnConfig(newConfig);
      return;
    }

    // Defend prompt: clicking valid defenders on the board toggles them
    if (this.state.defendPrompt) {
      const hits = this.scene.raycastObjects(event, this.getInteractableMeshes());
      if (hits.length > 0) {
        const hit = this.findHitObject(hits[0].object);
        if (hit?.userData.type === 'card') {
          const clickedCard = hit.userData.cardInstance;
          if (this.state.defendPrompt.validDefenders.includes(clickedCard.id)) {
            this.toggleDefender(clickedCard.id);
            event.preventDefault();
            return;
          }
        }
      }
      event.preventDefault();
      return;
    }

    // Intercept prompt: clicking valid interceptors toggles them
    if (this.state.interceptPrompt) {
      const hits = this.scene.raycastObjects(event, this.getInteractableMeshes());
      if (hits.length > 0) {
        const hit = this.findHitObject(hits[0].object);
        if (hit?.userData.type === 'card') {
          const clickedCard = hit.userData.cardInstance;
          if (this.state.interceptPrompt.validInterceptors.includes(clickedCard.id)) {
            this.toggleInterceptor(clickedCard.id);
            event.preventDefault();
            return;
          }
        }
      }
      event.preventDefault();
      return;
    }

    // Block interaction while waiting for opponent response
    if (this.state.waitingForDefense || this.state.waitingForIntercept) {
      event.preventDefault();
      return;
    }

    // Combat target selection mode: clicking selects a target
    if (this.state.combatSelectingTarget) {
      const { attackerInstance, attackerMesh, targetIds } = this.state.combatSelectingTarget;
      const hits = this.scene.raycastObjects(event, this.getInteractableMeshes());
      if (hits.length > 0) {
        const hit = this.findHitObject(hits[0].object);
        if (hit?.userData.type === 'card') {
          const clickedCard = hit.userData.cardInstance;
          if (targetIds.has(clickedCard.id)) {
            this.resolveCombatAction(attackerInstance, attackerMesh, clickedCard, hit);
            event.preventDefault();
            return;
          }
        }
      }
      // Clicked something that isn't a valid target — cancel
      this.clearCombatHighlights();
      toast('Target selection cancelled');
      event.preventDefault();
      return;
    }

    // Path mode: clicking adds cells to the path
    if (this._pathMode) {
      const point = this.scene.raycastTablePoint(event);
      if (point) {
        const cell = this.getGridCellAt(point.x, point.z);
        if (cell) {
          this.addCellToPath(cell.col, cell.row);
          playSound('cardPickup');
        }
      }
      event.preventDefault();
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
          const { action, stat, cardId } = btn.userData;
          const cardMesh = this.meshes.get(cardId);
          if (cardMesh) {
            const card = cardMesh.userData.cardInstance;
            const hud = this.lifeHUDs.get(cardId);
            if (stat === 'atk') {
              if (action === 'increment') card.currentAttack = (card.currentAttack || 0) + 1;
              else card.currentAttack = Math.max(0, (card.currentAttack || 0) - 1);
              if (hud) updateLifeHUD(hud.sprite, card.currentAttack, 'atk');
            } else {
              if (action === 'increment') card.currentLife = (card.currentLife || 0) + 1;
              else card.currentLife = Math.max(0, (card.currentLife || 0) - 1);
              if (hud) updateLifeHUD(hud.hpSprite, card.currentLife, 'hp');
            }
          }
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
      const { action, stat, cardId } = hit.userData;
      const cardMesh = this.meshes.get(cardId);
      if (cardMesh) {
        const card = cardMesh.userData.cardInstance;
        const hud = this.lifeHUDs.get(cardId);
        if (stat === 'atk') {
          if (action === 'increment') card.currentAttack = (card.currentAttack || 0) + 1;
          else card.currentAttack = Math.max(0, (card.currentAttack || 0) - 1);
          if (hud) updateLifeHUD(hud.sprite, card.currentAttack, 'atk');
        } else {
          if (action === 'increment') card.currentLife = (card.currentLife || 0) + 1;
          else card.currentLife = Math.max(0, (card.currentLife || 0) - 1);
          if (hud) updateLifeHUD(hud.hpSprite, card.currentLife, 'hp');
        }
      }
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

      // When cards are expanded and user clicks a card NOT in the expanded cell, collapse first
      const ci = hit.userData.cardInstance;
      if (this._expandedCell) {
        const inExpandedCell = ci._gridCol === this._expandedCell.col && ci._gridRow === this._expandedCell.row;
        if (!inExpandedCell) {
          this.collapseCellHover();
          event.preventDefault();
          return;
        }
        // Card IS in expanded cell — allow interaction, then collapse
        this.collapseCellHover();
      }
      const isOnGrid = ci._gridCol != null && ci._gridRow != null;
      const isSite = ci.isSite;

      // Click a non-site card on the grid: directly start Move path mode
      if (isOnGrid && !isSite) {
        if (this._pathMode && this._pathMode.cardInstance.id === ci.id) {
          this.cancelPathMode();
          event.preventDefault();
          return;
        }
        const abilities = this.getCardAbilities(ci);
        if (abilities?.immobile) {
          toast('This unit is immobile');
          event.preventDefault();
          return;
        }
        this.startPathMode(ci, hit, 'move');
        event.preventDefault();
        return;
      }

      // Free drag for cards not on the grid or site cards
      this.dragging = {
        mesh: hit,
        cardInstance: ci,
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

    // Grid editor: dragging to define rectangle
    if (this.state.gridEditMode === 'drag-start' || this.state.gridEditMode === 'drag-end') {
      if (this.canvasRef.current) this.canvasRef.current.style.cursor = 'crosshair';
      if (this.state.gridEditMode === 'drag-end') {
        const point = this.scene.raycastTablePoint(event);
        if (point) {
          this.setState({ gridDragEnd: { x: point.x, z: point.z } });
          this.updateGridPreviewRect(this.state.gridDragStart, { x: point.x, z: point.z });
        }
      }
      return;
    }

    // Grid editor: dragging a handle
    if (this.state.gridEditMode === 'adjust' && this.gridDraggingHandle) {
      const point = this.scene.raycastTablePoint(event);
      if (point && this.currentEditGrid) {
        const { colIndex, rowIndex } = this.gridDraggingHandle.userData;
        const newGrid = this.handleGridAdjust(this.gridDraggingHandle.userData, point, this.currentEditGrid);
        this.currentEditGrid = newGrid;
        this.updateGridVisualization(newGrid, true);
        // Re-find the handle after recreation
        this.gridDraggingHandle = this.gridHandles.find((h) =>
          h.userData.colIndex === colIndex && h.userData.rowIndex === rowIndex
        ) || null;
      }
      return;
    }

    // Path mode: update hover preview
    if (this._pathMode) {
      const point = this.scene.raycastTablePoint(event);
      if (point) {
        const cell = this.getGridCellAt(point.x, point.z);
        const newHover = cell ? { col: cell.col, row: cell.row } : null;
        const prev = this._pathMode.lastHoveredCell;
        if (!prev || !newHover || prev.col !== newHover.col || prev.row !== newHover.row) {
          this._pathMode.lastHoveredCell = newHover;
          this.renderPathArrow();
        }
        // Show grid highlight on hovered cell
        this.showGridCellHighlight(cell);
      }
      return;
    }

    if (this.dragging) {
      const point = this.scene.raycastTablePoint(event);
      if (!point) return;
      this.dragging.mesh.position.x = point.x;
      this.dragging.mesh.position.z = point.z;

      // Show grid cell highlight while dragging a card
      if (this.dragging.cardInstance) {
        const cell = this.getGridCellAt(point.x, point.z);
        this.showGridCellHighlight(cell);
      }
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

    // Expanded cell hover management — check bounds, not just hovered mesh
    if (this._expandedCell && !this.dragging) {
      const tablePoint = this.scene.raycastTablePoint(event);
      const inBounds = tablePoint && this.isPointInExpandedBounds(tablePoint.x, tablePoint.z);
      const hoveringExpandedCard = newHovered?.userData?.type === 'card' && newHovered.userData.cardInstance?._gridCol === this._expandedCell.col && newHovered.userData.cardInstance?._gridRow === this._expandedCell.row;

      if (!inBounds && !hoveringExpandedCard) {
        this.collapseCellHover();
      }
    }

    // Expand cell when hovering a grid card (and not dragging, and no cell already expanded)
    if (!this.dragging && !this._expandedCell && newHovered?.userData?.type === 'card') {
      const ci = newHovered.userData.cardInstance;
      if (ci && ci._gridCol != null && ci._gridRow != null) {
        const cards = this.getCardsInCell(ci._gridCol, ci._gridRow);
        if (cards.filter((c) => !c.cardInstance.isSite).length > 1) {
          this.expandCellOnHover(ci._gridCol, ci._gridRow);
        }
      }
    }

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

    // Grid editor: finish rectangle drag
    if (this.state.gridEditMode === 'drag-end') {
      const { gridDragStart, gridDragEnd } = this.state;
      if (gridDragStart && gridDragEnd) {
        const dx = Math.abs(gridDragEnd.x - gridDragStart.x);
        const dz = Math.abs(gridDragEnd.z - gridDragStart.z);
        if (dx > 3 && dz > 3) {
          const grid = this.gridFromDragRect(gridDragStart, gridDragEnd);
          this.currentEditGrid = grid;
          this.updateGridVisualization(grid, true);
          this.setState({ gridEditMode: 'adjust', gridDragStart: null, gridDragEnd: null });
        } else {
          this.clearGridVisualization();
          this.setState({ gridEditMode: 'drag-start', gridDragStart: null, gridDragEnd: null });
        }
      }
      return;
    }

    // Grid editor: release handle
    if (this.state.gridEditMode === 'adjust' && this.gridDraggingHandle) {
      this.gridDraggingHandle = null;
      return;
    }

    if (!this.dragging) return;

    const droppedMesh = this.dragging.mesh;

    this.hideGridCellHighlight();

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
      emitGameAction('dice:move', { diceId: dice.id, x: dice.x, z: dice.z });
      this.dragging = null;
      return;
    }

    // Card drop — snap to grid if over a cell, otherwise free placement
    const card = this.dragging.cardInstance;
    this.hideGridCellHighlight();

    const cell = this.getGridCellAt(droppedMesh.position.x, droppedMesh.position.z);
    if (cell) {
      const isSite = card.isSite;

      // Enforce: only one site card per cell
      if (isSite) {
        const existingSites = this.getCardsInCell(cell.col, cell.row).filter((c) => c.cardInstance.isSite && c.cardId !== card.id);
        if (existingSites.length > 0) {
          // Return the card to the player's hand
          this.removeCardFromTable(card);
          this.addToHand(card);
          toast.error('This site is already occupied. Only one site card per square.');
          this.dragging = null;
          return;
        }
      }

      // Remove from old cell if moving between cells
      const oldCol = card._gridCol;
      const oldRow = card._gridRow;

      // Assign to new cell
      card._gridCol = cell.col;
      card._gridRow = cell.row;

      // Rotate site cards horizontally
      if (isSite && droppedMesh.rotation.z === 0) {
        droppedMesh.rotation.z = -Math.PI / 2;
      }

      // Arrange all cards in the new cell (including the dropped one)
      this.arrangeCardsInCell(cell.col, cell.row);

      // Re-arrange old cell if card moved between cells
      if (oldCol != null && oldRow != null && (oldCol !== cell.col || oldRow !== cell.row)) {
        this.arrangeCardsInCell(oldCol, oldRow);
      }
    } else {
      // Dropped outside grid — remove from any cell tracking
      const oldCol = card._gridCol;
      const oldRow = card._gridRow;
      card._gridCol = undefined;
      card._gridRow = undefined;
      card.x = droppedMesh.position.x;
      card.z = droppedMesh.position.z;

      // Free placement stacking
      let highestY = this.scene.CARD_REST_Y;
      for (const [id, mesh] of this.meshes) {
        if (mesh === droppedMesh) continue;
        const dx = Math.abs(mesh.position.x - droppedMesh.position.x);
        const dz = Math.abs(mesh.position.z - droppedMesh.position.z);
        if (dx < CARD_WIDTH * 0.6 && dz < CARD_HEIGHT * 0.6) {
          const topOfCard = mesh.position.y + CARD_THICKNESS;
          if (topOfCard > highestY) highestY = topOfCard;
        }
      }
      droppedMesh.position.y = highestY;

      // Re-arrange old cell
      if (oldCol != null && oldRow != null) {
        this.arrangeCardsInCell(oldCol, oldRow);
      }
    }

    playSound('cardPlace');
    emitGameAction('card:move', { cardId: card.id, x: card.x, y: droppedMesh.position.y, z: card.z });
    this.dragging = null;
  };

  handleDoubleClick = (event) => {
    // Path mode: double-click confirms the move immediately
    if (this._pathMode && this._pathMode.path.length > 1) {
      this.hideGridCellHighlight();
      this.confirmPathMove();
      event.preventDefault();
      return;
    }
    if (this._pathMode) {
      // Double-click with no path — cancel
      this.cancelPathMode();
      this.hideGridCellHighlight();
      event.preventDefault();
      return;
    }

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
      emitGameAction('card:tap', { cardId: card.id, tapped: card.tapped });
    }
  };

  handleContextMenu = (event) => {
    event.preventDefault();

    // Right-click cancels path mode
    if (this._pathMode) {
      this.cancelPathMode();
      this.hideGridCellHighlight();
      return;
    }

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

  incrementTracker = (player, trackerKey) => {
    const def = TRACKER_DEFS[trackerKey];
    const { gameState } = this.state;
    if (gameState.trackers[player][trackerKey] < def.max) {
      gameState.trackers[player][trackerKey]++;
      playSound('uiClick');
      this.updateTrackerTokenPositions();
      this.forceUpdate();
    }
  };

  decrementTracker = (player, trackerKey) => {
    const { gameState } = this.state;
    if (gameState.trackers[player][trackerKey] > 0) {
      gameState.trackers[player][trackerKey]--;
      playSound('uiClick');
      this.updateTrackerTokenPositions();
      this.forceUpdate();
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

  // --- Grid Editor ---

  computeGridPositions = (grid) => {
    const { topLeft, topRight, bottomLeft, bottomRight, cols, rows, colDividers, rowDividers } = grid;
    // Compute actual column X positions (normalized across top/bottom edges)
    const cDivs = colDividers || Array.from({ length: cols - 1 }, (_, i) => (i + 1) / cols);
    const rDivs = rowDividers || Array.from({ length: rows - 1 }, (_, i) => (i + 1) / rows);
    // All normalized positions including 0 and 1
    const colPositions = [0, ...cDivs, 1];
    const rowPositions = [0, ...rDivs, 1];
    return { colPositions, rowPositions };
  };

  getGridPoint = (grid, colT, rowT) => {
    // Bilinear interpolation of four corners
    const { topLeft, topRight, bottomLeft, bottomRight } = grid;
    const topX = topLeft.x + (topRight.x - topLeft.x) * colT;
    const topZ = topLeft.z + (topRight.z - topLeft.z) * colT;
    const botX = bottomLeft.x + (bottomRight.x - bottomLeft.x) * colT;
    const botZ = bottomLeft.z + (bottomRight.z - bottomLeft.z) * colT;
    return {
      x: topX + (botX - topX) * rowT,
      z: topZ + (botZ - topZ) * rowT,
    };
  };

  // --- Grid Snap Helpers ---

  getCardsInCell = (col, row) => {
    // Find all card meshes that are snapped to this grid cell
    const result = [];
    for (const [cardId, mesh] of this.meshes) {
      const ci = mesh.userData.cardInstance;
      if (ci && ci._gridCol === col && ci._gridRow === row) {
        result.push({ cardId, mesh, cardInstance: ci });
      }
    }
    return result;
  };

  setHudVisibility = (cardId, visible) => {
    const hud = this.lifeHUDs.get(cardId);
    if (!hud) return;
    const meshes = [hud.sprite, hud.hpSprite, hud.plusMesh, hud.minusMesh, hud.hpPlusMesh, hud.hpMinusMesh];
    for (const m of meshes) {
      if (m) m.visible = visible;
    }
  };

  arrangeCardsInCell = (col, row, excludeCardId = null) => {
    const cell = this.getGridCellByIndex(col, row);
    if (!cell) return;

    const cards = this.getCardsInCell(col, row);
    const sites = cards.filter((c) => c.cardInstance.isSite);
    const nonSites = cards.filter((c) => !c.cardInstance.isSite);

    // Separate by player: rotated = player 2, non-rotated = player 1
    const p1Cards = nonSites.filter((c) => !c.cardInstance.rotated);
    const p2Cards = nonSites.filter((c) => c.cardInstance.rotated);

    let baseY = this.scene.CARD_REST_Y;

    // Site card: always at the bottom, centered
    for (const s of sites) {
      s.mesh.position.x = cell.centerX;
      s.mesh.position.z = cell.centerZ + cell.height * 0.22;
      s.mesh.position.y = baseY;
      s.cardInstance.x = s.mesh.position.x;
      s.cardInstance.z = s.mesh.position.z;
      this.setHudVisibility(s.cardId, nonSites.length === 0);
      baseY += CARD_THICKNESS;
    }

    const hasBothPlayers = p1Cards.length > 0 && p2Cards.length > 0;
    // Offset for opposing corners when both players have cards
    const cornerOffsetX = hasBothPlayers ? cell.width * 0.12 : 0;
    const cornerOffsetZ = hasBothPlayers ? cell.height * 0.08 : 0;

    // Player 1 cards: upper-left area (negative X offset, negative Z offset)
    if (p1Cards.length > 0) {
      const anchorX = cell.centerX - cornerOffsetX;
      const anchorZ = cell.centerZ - cell.height * 0.18 - cornerOffsetZ;
      const fanSpread = Math.min(3.5, (cell.width * 0.25) / Math.max(p1Cards.length - 1, 1));

      for (let i = 0; i < p1Cards.length; i++) {
        const c = p1Cards[i];
        if (c.cardId === excludeCardId) continue;
        const offsetX = p1Cards.length > 1 ? (i - (p1Cards.length - 1) / 2) * fanSpread : 0;
        c.mesh.position.x = anchorX + offsetX;
        c.mesh.position.z = anchorZ;
        c.mesh.position.y = baseY + i * CARD_THICKNESS;
        c.cardInstance.x = c.mesh.position.x;
        c.cardInstance.z = c.mesh.position.z;
        this.setHudVisibility(c.cardId, i === p1Cards.length - 1);
      }
    }

    // Player 2 cards: lower-right area (positive X offset, positive Z offset)
    if (p2Cards.length > 0) {
      const anchorX = cell.centerX + cornerOffsetX;
      const anchorZ = cell.centerZ - cell.height * 0.18 + cornerOffsetZ;
      const p2BaseY = baseY + p1Cards.length * CARD_THICKNESS;
      const fanSpread = Math.min(3.5, (cell.width * 0.25) / Math.max(p2Cards.length - 1, 1));

      for (let i = 0; i < p2Cards.length; i++) {
        const c = p2Cards[i];
        if (c.cardId === excludeCardId) continue;
        const offsetX = p2Cards.length > 1 ? (i - (p2Cards.length - 1) / 2) * fanSpread : 0;
        c.mesh.position.x = anchorX + offsetX;
        c.mesh.position.z = anchorZ;
        c.mesh.position.y = p2BaseY + i * CARD_THICKNESS;
        c.cardInstance.x = c.mesh.position.x;
        c.cardInstance.z = c.mesh.position.z;
        this.setHudVisibility(c.cardId, i === p2Cards.length - 1);
      }
    }
  };

  expandCellOnHover = (col, row) => {
    const cards = this.getCardsInCell(col, row);
    const nonSites = cards.filter((c) => !c.cardInstance.isSite);
    if (nonSites.length <= 1) return;

    const cell = this.getGridCellByIndex(col, row);
    if (!cell) return;

    const p1Cards = nonSites.filter((c) => !c.cardInstance.rotated);
    const p2Cards = nonSites.filter((c) => c.cardInstance.rotated);

    const gap = CARD_WIDTH * 0.15;
    const spreadPerCard = CARD_WIDTH + gap;
    const liftY = 3;
    const baseZ = cell.centerZ - cell.height * 0.18;
    // If both players have cards, separate into two rows
    const p1Z = p2Cards.length > 0 ? baseZ - CARD_HEIGHT * 0.55 : baseZ;
    const p2Z = p1Cards.length > 0 ? baseZ + CARD_HEIGHT * 0.55 : baseZ;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const fanRow = (group, anchorZ) => {
      for (let i = 0; i < group.length; i++) {
        const c = group[i];
        const offsetX = (i - (group.length - 1) / 2) * spreadPerCard;
        const posX = cell.centerX + offsetX;
        c.mesh.position.x = posX;
        c.mesh.position.z = anchorZ;
        c.mesh.position.y = this.scene.CARD_REST_Y + liftY;
        minX = Math.min(minX, posX - CARD_WIDTH / 2);
        maxX = Math.max(maxX, posX + CARD_WIDTH / 2);
        minZ = Math.min(minZ, anchorZ - CARD_HEIGHT / 2);
        maxZ = Math.max(maxZ, anchorZ + CARD_HEIGHT / 2);
        this.setHudVisibility(c.cardId, true);
      }
    };

    if (p1Cards.length > 0) fanRow(p1Cards, p1Z);
    if (p2Cards.length > 0) fanRow(p2Cards, p2Z);

    this._expandedCell = { col, row };
    this._expandedBounds = {
      minX: minX - gap,
      maxX: maxX + gap,
      minZ: minZ - 2,
      maxZ: maxZ + 2,
    };
  };

  collapseCellHover = () => {
    if (!this._expandedCell) return;
    const { col, row } = this._expandedCell;
    this.arrangeCardsInCell(col, row);
    this._expandedCell = null;
    this._expandedBounds = null;
  };

  // --- Path Movement Mode ---

  startPathMode = (cardInstance, mesh, action = 'move') => {
    const startCol = cardInstance._gridCol;
    const startRow = cardInstance._gridRow;
    const startCell = this.getGridCellByIndex(startCol, startRow);
    if (!startCell) return;

    // Look up full card data and parse movement abilities
    const abilities = this.getCardAbilities(cardInstance);

    if (abilities.immobile) {
      toast('This unit is immobile');
      return;
    }

    const maxSteps = getMaxSteps(abilities, action);

    // Highlight the selected card
    mesh.position.y += 0.5;

    this._pathMode = {
      cardInstance,
      mesh,
      startCol,
      startRow,
      action,
      abilities,
      maxSteps,
      // Path is a list of {col, row} cells visited
      path: [{ col: startCol, row: startRow }],
      lastHoveredCell: null,
    };
    this.renderPathArrow();
  };

  cancelPathMode = () => {
    if (!this._pathMode) return;
    // Restore card height
    this.arrangeCardsInCell(this._pathMode.startCol, this._pathMode.startRow);
    this.clearPathArrow();
    this.clearPathStepLabel();
    this._pathMode = null;
  };

  addCellToPath = (col, row) => {
    if (!this._pathMode) return;
    const { path, abilities, maxSteps } = this._pathMode;
    const last = path[path.length - 1];

    // Validate adjacency using movement abilities (allows diagonals for Airborne)
    if (!isValidStep(last.col, last.row, col, row, abilities)) return;

    // Check if stepping back — remove last step (undo)
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      if (prev.col === col && prev.row === row) {
        path.pop();
        this.renderPathArrow();
        return;
      }
    }

    // Don't revisit cells already in path
    if (path.some((p) => p.col === col && p.row === row)) return;

    // Enforce step limit (path includes start cell, so steps = path.length - 1)
    const currentSteps = path.length - 1;
    if (currentSteps >= maxSteps) return;

    path.push({ col, row });
    this.renderPathArrow();
  };

  confirmPathMove = () => {
    if (!this._pathMode) return;
    const { cardInstance, mesh, startCol, startRow, path, action } = this._pathMode;
    if (path.length <= 1) {
      this.cancelPathMode();
      return;
    }

    const dest = path[path.length - 1];
    this.clearPathArrow();
    this.clearPathStepLabel();
    this.setState({ contextMenu: null });

    // Animate the card along the path
    this.animateCardAlongPath(cardInstance, mesh, path, () => {
      const oldCol = cardInstance._gridCol;
      const oldRow = cardInstance._gridRow;

      cardInstance._gridCol = dest.col;
      cardInstance._gridRow = dest.row;

      this.arrangeCardsInCell(dest.col, dest.row);
      if (oldCol !== dest.col || oldRow !== dest.row) {
        this.arrangeCardsInCell(oldCol, oldRow);
      }

      playSound('cardPlace');
      emitGameAction('card:move', {
        cardId: cardInstance.id,
        x: cardInstance.x,
        y: mesh.position.y,
        z: cardInstance.z,
        action,
        path: path.map((p) => ({ col: p.col, row: p.row })),
      });

      // Only Move & Attack taps the unit — plain movement does not
      if (action === 'attack') {
        if (!cardInstance.tapped) {
          cardInstance.tapped = true;
          animateCardTap(mesh, cardInstance);
          emitGameAction('card:tap', { cardId: cardInstance.id, tapped: true });
        }
        this.enterTargetSelection(cardInstance, mesh);
      } else if (action === 'move') {
        // Broadcast move-complete so opponent can intercept
        this.broadcastMoveComplete(cardInstance, dest.col, dest.row);
      }
    });

    this._pathMode = null;
  };

  animateCardAlongPath = (cardInstance, mesh, path, onComplete) => {
    if (path.length <= 1) { onComplete(); return; }

    const waypoints = path.map((p) => {
      const cell = this.getGridCellByIndex(p.col, p.row);
      return cell ? { x: cell.centerX, z: cell.centerZ - cell.height * 0.18 } : null;
    }).filter(Boolean);

    if (waypoints.length <= 1) { onComplete(); return; }

    const liftY = this.scene.CARD_REST_Y + 1.5;
    mesh.position.y = liftY;
    let step = 1;
    const speed = 0.22; // lerp speed per frame — fast but smooth

    const tick = () => {
      if (step >= waypoints.length) {
        onComplete();
        return;
      }
      const target = waypoints[step];
      const dx = target.x - mesh.position.x;
      const dz = target.z - mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.3) {
        mesh.position.x = target.x;
        mesh.position.z = target.z;
        cardInstance.x = target.x;
        cardInstance.z = target.z;
        step++;
        requestAnimationFrame(tick);
      } else {
        mesh.position.x += dx * speed;
        mesh.position.z += dz * speed;
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  };

  renderPathArrow = () => {
    this.clearPathArrow();
    if (!this._pathMode || this._pathMode.path.length < 1) return;

    const path = this._pathMode.path;
    const Y = 0.2;
    const verts = [];

    for (let i = 0; i < path.length; i++) {
      const cell = this.getGridCellByIndex(path[i].col, path[i].row);
      if (!cell) continue;
      if (i > 0) {
        const prevCell = this.getGridCellByIndex(path[i - 1].col, path[i - 1].row);
        if (prevCell) {
          verts.push(prevCell.centerX, Y, prevCell.centerZ);
          verts.push(cell.centerX, Y, cell.centerZ);
        }
      }
    }

    // Also draw to current hover cell if valid step and within step limit
    const abilities = this._pathMode.abilities;
    const maxSteps = this._pathMode.maxSteps;
    const currentSteps = path.length - 1;
    if (this._pathMode.lastHoveredCell) {
      const hc = this._pathMode.lastHoveredCell;
      const last = path[path.length - 1];
      const validStep = isValidStep(last.col, last.row, hc.col, hc.row, abilities);
      const withinLimit = currentSteps < maxSteps;
      if (validStep && withinLimit && !path.some((p) => p.col === hc.col && p.row === hc.row)) {
        const lastCell = this.getGridCellByIndex(last.col, last.row);
        const hoverCell = this.getGridCellByIndex(hc.col, hc.row);
        if (lastCell && hoverCell) {
          verts.push(lastCell.centerX, Y, lastCell.centerZ);
          verts.push(hoverCell.centerX, Y, hoverCell.centerZ);
        }
      }
    }

    // Build a thick ribbon from the path points
    const points = [];
    for (let i = 0; i < path.length; i++) {
      const cell = this.getGridCellByIndex(path[i].col, path[i].row);
      if (cell) points.push({ x: cell.centerX, z: cell.centerZ });
    }
    if (this._pathMode.lastHoveredCell) {
      const hc = this._pathMode.lastHoveredCell;
      const last = path[path.length - 1];
      const validStep = isValidStep(last.col, last.row, hc.col, hc.row, abilities);
      const withinLimit = currentSteps < maxSteps;
      if (validStep && withinLimit && !path.some((p) => p.col === hc.col && p.row === hc.row)) {
        const hoverCell = this.getGridCellByIndex(hc.col, hc.row);
        if (hoverCell) points.push({ x: hoverCell.centerX, z: hoverCell.centerZ });
      }
    }

    if (points.length < 2) return;

    const ribbonWidth = 1.4;
    const hw = ribbonWidth / 2;
    const ribbonVerts = [];
    const circleSegs = 10;

    // Add a filled circle at each waypoint for rounded corners
    const addCircle = (cx, cz, radius) => {
      for (let s = 0; s < circleSegs; s++) {
        const a1 = (s / circleSegs) * Math.PI * 2;
        const a2 = ((s + 1) / circleSegs) * Math.PI * 2;
        ribbonVerts.push(
          cx, Y, cz,
          cx + Math.cos(a1) * radius, Y, cz + Math.sin(a1) * radius,
          cx + Math.cos(a2) * radius, Y, cz + Math.sin(a2) * radius,
        );
      }
    };

    // Ribbon quads between waypoints
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const px = (-dz / len) * hw;
      const pz = (dx / len) * hw;
      ribbonVerts.push(
        a.x + px, Y, a.z + pz, b.x + px, Y, b.z + pz, a.x - px, Y, a.z - pz,
        b.x + px, Y, b.z + pz, b.x - px, Y, b.z - pz, a.x - px, Y, a.z - pz,
      );
      // Rounded joint at each waypoint
      addCircle(a.x, a.z, hw);
    }
    // Circle at the last point before arrowhead
    addCircle(points[points.length - 1].x, points[points.length - 1].z, hw);

    // Arrowhead at the end
    if (points.length >= 2) {
      const tip = points[points.length - 1];
      const prev = points[points.length - 2];
      const dx = tip.x - prev.x;
      const dz = tip.z - prev.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      const arrowLen = 2.5;
      const arrowW = 2.2;
      const tipX = tip.x + nx * arrowLen;
      const tipZ = tip.z + nz * arrowLen;
      const px = -nz * arrowW / 2;
      const pz = nx * arrowW / 2;
      ribbonVerts.push(
        tip.x + px, Y, tip.z + pz, tipX, Y, tipZ, tip.x - px, Y, tip.z - pz,
      );
    }

    // Color the ribbon based on action and step limit
    const atLimit = currentSteps >= maxSteps;
    const isAttackAction = this._pathMode.action === 'attack';
    const ribbonColor = atLimit ? 0xcc6633 : (isAttackAction ? 0xc04040 : 0xd4a843);
    const lineColor = atLimit ? 0xe07040 : (isAttackAction ? 0xf06060 : 0xf0d060);

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonVerts, 3));
    const ribbonMat = new THREE.MeshBasicMaterial({ color: ribbonColor, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    this._pathArrowMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    this.scene.scene.add(this._pathArrowMesh);

    // Brighter center line
    const lineVerts = [];
    for (let i = 0; i < points.length - 1; i++) {
      lineVerts.push(points[i].x, Y + 0.01, points[i].z, points[i + 1].x, Y + 0.01, points[i + 1].z);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.85 });
    this._pathCenterLine = new THREE.LineSegments(lineGeo, lineMat);
    this.scene.scene.add(this._pathCenterLine);

    // Highlight cells in the path (orange/red when at step limit)
    this._pathCellHighlights = [];
    for (let i = 1; i < path.length; i++) {
      const cell = this.getGridCellByIndex(path[i].col, path[i].row);
      if (!cell) continue;
      const { tl, tr, bl, br } = cell;
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        tl.x, Y - 0.01, tl.z, tr.x, Y - 0.01, tr.z, bl.x, Y - 0.01, bl.z,
        tr.x, Y - 0.01, tr.z, br.x, Y - 0.01, br.z, bl.x, Y - 0.01, bl.z,
      ], 3));
      const isLastCell = i === path.length - 1;
      const cellColor = (atLimit && isLastCell) ? 0xcc6633 : 0xd4a843;
      const cellOpacity = (atLimit && isLastCell) ? 0.15 : 0.08;
      const fillMat = new THREE.MeshBasicMaterial({ color: cellColor, transparent: true, opacity: cellOpacity, side: THREE.DoubleSide });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      this.scene.scene.add(fillMesh);
      this._pathCellHighlights.push(fillMesh);
    }

    // Start cell highlight (different color)
    const startCell = this.getGridCellByIndex(path[0].col, path[0].row);
    if (startCell) {
      const { tl, tr, bl, br } = startCell;
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        tl.x, Y - 0.01, tl.z, tr.x, Y - 0.01, tr.z, bl.x, Y - 0.01, bl.z,
        tr.x, Y - 0.01, tr.z, br.x, Y - 0.01, br.z, bl.x, Y - 0.01, bl.z,
      ], 3));
      const sMat = new THREE.MeshBasicMaterial({ color: 0x50c0f0, transparent: true, opacity: 0.1, side: THREE.DoubleSide });
      const sMesh = new THREE.Mesh(sGeo, sMat);
      this.scene.scene.add(sMesh);
      this._pathCellHighlights.push(sMesh);
    }

    // Update step counter label
    this.updatePathStepLabel();
  };

  clearPathArrow = () => {
    if (this._pathArrowMesh) {
      this.scene?.scene.remove(this._pathArrowMesh);
      this._pathArrowMesh.geometry.dispose();
      this._pathArrowMesh.material.dispose();
      this._pathArrowMesh = null;
    }
    if (this._pathCenterLine) {
      this.scene?.scene.remove(this._pathCenterLine);
      this._pathCenterLine.geometry.dispose();
      this._pathCenterLine.material.dispose();
      this._pathCenterLine = null;
    }
    if (this._pathCellHighlights) {
      for (const m of this._pathCellHighlights) {
        this.scene?.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
      this._pathCellHighlights = null;
    }
  };

  getCardAbilities = (cardInstance) => {
    if (cardInstance._abilities) return cardInstance._abilities;
    const fullCard = this.props.sorceryCards?.find((c) => c.unique_id === cardInstance.cardId);
    const rulesText = fullCard?.functional_text_plain || fullCard?.functional_text || '';
    cardInstance._abilities = getMovementAbilities(rulesText);
    return cardInstance._abilities;
  };

  updatePathStepLabel = () => {
    if (!this._pathMode) { this.clearPathStepLabel(); return; }

    const { path, maxSteps, action, abilities } = this._pathMode;
    const currentSteps = path.length - 1;
    const atLimit = currentSteps >= maxSteps;

    // Build label text
    const parts = [];
    if (action === 'attack') parts.push('ATK');
    else parts.push('MOV');
    if (abilities.airborne) parts.push('AIR');
    if (maxSteps < 99) parts.push(`${currentSteps}/${maxSteps}`);
    else if (currentSteps > 0) parts.push(`${currentSteps}`);
    const labelText = parts.join(' ');

    // Create or update the DOM step label overlay
    if (!this._pathStepLabel) {
      this._pathStepLabel = document.createElement('div');
      this._pathStepLabel.className = 'fixed pointer-events-none z-[200] text-xs font-semibold px-2 py-0.5 rounded-md';
      document.body.appendChild(this._pathStepLabel);
    }

    this._pathStepLabel.textContent = labelText;
    this._pathStepLabel.style.background = atLimit ? 'rgba(180, 80, 30, 0.85)' : 'rgba(40, 35, 30, 0.85)';
    this._pathStepLabel.style.color = atLimit ? '#ffccaa' : '#e0c880';
    this._pathStepLabel.style.border = `1px solid ${atLimit ? 'rgba(220, 120, 50, 0.5)' : 'rgba(200, 170, 80, 0.3)'}`;

    // Position near the last path cell
    const last = path[path.length - 1];
    const cell = this.getGridCellByIndex(last.col, last.row);
    if (cell && this.scene) {
      const pos = new THREE.Vector3(cell.centerX, 1.5, cell.centerZ);
      pos.project(this.scene.camera);
      const canvas = this.canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = ((pos.x + 1) / 2) * rect.width + rect.left;
        const y = ((-pos.y + 1) / 2) * rect.height + rect.top - 24;
        this._pathStepLabel.style.left = `${x}px`;
        this._pathStepLabel.style.top = `${y}px`;
        this._pathStepLabel.style.transform = 'translateX(-50%)';
      }
    }
    this._pathStepLabel.style.display = 'block';
  };

  clearPathStepLabel = () => {
    if (this._pathStepLabel) {
      this._pathStepLabel.remove();
      this._pathStepLabel = null;
    }
  };

  isPointInExpandedBounds = (x, z) => {
    if (!this._expandedBounds) return false;
    const b = this._expandedBounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  };

  getGridCellByIndex = (col, row) => {
    const grid = getGameGrid(this.state.spawnConfig);
    if (!grid) return null;
    const { colPositions, rowPositions } = this.computeGridPositions(grid);
    if (col < 0 || col >= colPositions.length - 1 || row < 0 || row >= rowPositions.length - 1) return null;

    const tl = this.getGridPoint(grid, colPositions[col], rowPositions[row]);
    const tr = this.getGridPoint(grid, colPositions[col + 1], rowPositions[row]);
    const bl = this.getGridPoint(grid, colPositions[col], rowPositions[row + 1]);
    const br = this.getGridPoint(grid, colPositions[col + 1], rowPositions[row + 1]);
    const centerX = (tl.x + tr.x + bl.x + br.x) / 4;
    const centerZ = (tl.z + tr.z + bl.z + br.z) / 4;
    const width = Math.abs(tr.x - tl.x);
    const height = Math.abs(bl.z - tl.z);
    return { col, row, centerX, centerZ, width, height, tl, tr, bl, br, totalRows: rowPositions.length - 1 };
  };

  getGridCellAt = (x, z) => {
    const grid = getGameGrid(this.state.spawnConfig);
    if (!grid) return null;
    const { colPositions, rowPositions } = this.computeGridPositions(grid);

    // Find which cell the point falls in
    let col = -1;
    let row = -1;
    for (let c = 0; c < colPositions.length - 1; c++) {
      const left = this.getGridPoint(grid, colPositions[c], 0.5);
      const right = this.getGridPoint(grid, colPositions[c + 1], 0.5);
      if (x >= Math.min(left.x, right.x) && x <= Math.max(left.x, right.x)) { col = c; break; }
    }
    for (let r = 0; r < rowPositions.length - 1; r++) {
      const top = this.getGridPoint(grid, 0.5, rowPositions[r]);
      const bot = this.getGridPoint(grid, 0.5, rowPositions[r + 1]);
      if (z >= Math.min(top.z, bot.z) && z <= Math.max(top.z, bot.z)) { row = r; break; }
    }
    if (col < 0 || row < 0) return null;

    // Compute cell center and bounds
    const tl = this.getGridPoint(grid, colPositions[col], rowPositions[row]);
    const tr = this.getGridPoint(grid, colPositions[col + 1], rowPositions[row]);
    const bl = this.getGridPoint(grid, colPositions[col], rowPositions[row + 1]);
    const br = this.getGridPoint(grid, colPositions[col + 1], rowPositions[row + 1]);
    const centerX = (tl.x + tr.x + bl.x + br.x) / 4;
    const centerZ = (tl.z + tr.z + bl.z + br.z) / 4;
    const width = Math.abs(tr.x - tl.x);
    const height = Math.abs(bl.z - tl.z);

    return { col, row, centerX, centerZ, width, height, tl, tr, bl, br, totalRows: rowPositions.length - 1 };
  };

  showGridCellHighlight = (cell) => {
    if (!cell || !this.scene) {
      this.hideGridCellHighlight();
      return;
    }
    const { tl, tr, bl, br } = cell;
    const Y = 0.16;

    if (!this.gridHighlightMesh) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        tl.x, Y, tl.z, tr.x, Y, tr.z,
        tr.x, Y, tr.z, br.x, Y, br.z,
        br.x, Y, br.z, bl.x, Y, bl.z,
        bl.x, Y, bl.z, tl.x, Y, tl.z,
      ], 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xf0c050, transparent: true, opacity: 0.8 });
      this.gridHighlightMesh = new THREE.LineSegments(geo, mat);
      this.scene.scene.add(this.gridHighlightMesh);

      // Fill quad
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        tl.x, Y - 0.01, tl.z, tr.x, Y - 0.01, tr.z, bl.x, Y - 0.01, bl.z,
        tr.x, Y - 0.01, tr.z, br.x, Y - 0.01, br.z, bl.x, Y - 0.01, bl.z,
      ], 3));
      const fillMat = new THREE.MeshBasicMaterial({ color: 0xd4a843, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
      this.gridHighlightFill = new THREE.Mesh(fillGeo, fillMat);
      this.scene.scene.add(this.gridHighlightFill);
    } else {
      const pos = this.gridHighlightMesh.geometry.attributes.position;
      pos.setXYZ(0, tl.x, Y, tl.z); pos.setXYZ(1, tr.x, Y, tr.z);
      pos.setXYZ(2, tr.x, Y, tr.z); pos.setXYZ(3, br.x, Y, br.z);
      pos.setXYZ(4, br.x, Y, br.z); pos.setXYZ(5, bl.x, Y, bl.z);
      pos.setXYZ(6, bl.x, Y, bl.z); pos.setXYZ(7, tl.x, Y, tl.z);
      pos.needsUpdate = true;

      const fPos = this.gridHighlightFill.geometry.attributes.position;
      fPos.setXYZ(0, tl.x, Y - 0.01, tl.z); fPos.setXYZ(1, tr.x, Y - 0.01, tr.z); fPos.setXYZ(2, bl.x, Y - 0.01, bl.z);
      fPos.setXYZ(3, tr.x, Y - 0.01, tr.z); fPos.setXYZ(4, br.x, Y - 0.01, br.z); fPos.setXYZ(5, bl.x, Y - 0.01, bl.z);
      fPos.needsUpdate = true;
    }
    this.gridHighlightMesh.visible = true;
    this.gridHighlightFill.visible = true;
  };

  hideGridCellHighlight = () => {
    if (this.gridHighlightMesh) this.gridHighlightMesh.visible = false;
    if (this.gridHighlightFill) this.gridHighlightFill.visible = false;
  };

  clearGridVisualization = () => {
    if (this.gridLinesMesh) {
      this.scene?.scene.remove(this.gridLinesMesh);
      this.gridLinesMesh.geometry.dispose();
      this.gridLinesMesh.material.dispose();
      this.gridLinesMesh = null;
    }
    if (this.gridBorderMesh) {
      this.scene?.scene.remove(this.gridBorderMesh);
      this.gridBorderMesh.geometry.dispose();
      this.gridBorderMesh.material.dispose();
      this.gridBorderMesh = null;
    }
    for (const handle of this.gridHandles) {
      this.scene?.scene.remove(handle);
      handle.geometry.dispose();
      handle.material.dispose();
    }
    this.gridHandles = [];
    if (this.gridHighlightMesh) {
      this.scene?.scene.remove(this.gridHighlightMesh);
      this.gridHighlightMesh.geometry.dispose();
      this.gridHighlightMesh.material.dispose();
      this.gridHighlightMesh = null;
    }
    if (this.gridHighlightFill) {
      this.scene?.scene.remove(this.gridHighlightFill);
      this.gridHighlightFill.geometry.dispose();
      this.gridHighlightFill.material.dispose();
      this.gridHighlightFill = null;
    }
  };

  updateGridVisualization = (grid, showHandles = true) => {
    this.clearGridVisualization();
    if (!grid || !this.scene) return;

    const { colPositions, rowPositions } = this.computeGridPositions(grid);
    const Y = 0.15;

    // Inner grid lines
    const innerVerts = [];
    // Vertical lines (columns) — skip first and last (those are the border)
    for (let c = 1; c < colPositions.length - 1; c++) {
      const t = colPositions[c];
      const top = this.getGridPoint(grid, t, 0);
      const bot = this.getGridPoint(grid, t, 1);
      innerVerts.push(top.x, Y, top.z, bot.x, Y, bot.z);
    }
    // Horizontal lines (rows)
    for (let r = 1; r < rowPositions.length - 1; r++) {
      const t = rowPositions[r];
      const left = this.getGridPoint(grid, 0, t);
      const right = this.getGridPoint(grid, 1, t);
      innerVerts.push(left.x, Y, left.z, right.x, Y, right.z);
    }

    if (innerVerts.length > 0) {
      const innerGeo = new THREE.BufferGeometry();
      innerGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerVerts, 3));
      const innerMat = new THREE.LineBasicMaterial({ color: 0xd4a843, transparent: true, opacity: 0.35 });
      this.gridLinesMesh = new THREE.LineSegments(innerGeo, innerMat);
      this.scene.scene.add(this.gridLinesMesh);
    }

    // Outer border
    const tl = this.getGridPoint(grid, 0, 0);
    const tr = this.getGridPoint(grid, 1, 0);
    const bl = this.getGridPoint(grid, 0, 1);
    const br = this.getGridPoint(grid, 1, 1);
    const borderVerts = [
      tl.x, Y, tl.z, tr.x, Y, tr.z,
      tr.x, Y, tr.z, br.x, Y, br.z,
      br.x, Y, br.z, bl.x, Y, bl.z,
      bl.x, Y, bl.z, tl.x, Y, tl.z,
    ];
    const borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderVerts, 3));
    const borderMat = new THREE.LineBasicMaterial({ color: 0xd4a843, transparent: true, opacity: 0.7 });
    this.gridBorderMesh = new THREE.LineSegments(borderGeo, borderMat);
    this.scene.scene.add(this.gridBorderMesh);

    // Handles at intersections
    if (showHandles) {
      this.createGridHandles(grid);
    }
  };

  createGridHandles = (grid) => {
    for (const handle of this.gridHandles) {
      this.scene.scene.remove(handle);
      handle.geometry.dispose();
      handle.material.dispose();
    }
    this.gridHandles = [];

    const { colPositions, rowPositions } = this.computeGridPositions(grid);
    const Y = 0.2;

    for (let r = 0; r < rowPositions.length; r++) {
      for (let c = 0; c < colPositions.length; c++) {
        const pt = this.getGridPoint(grid, colPositions[c], rowPositions[r]);
        const isCorner = (r === 0 || r === rowPositions.length - 1) && (c === 0 || c === colPositions.length - 1);
        const isEdge = !isCorner && (r === 0 || r === rowPositions.length - 1 || c === 0 || c === colPositions.length - 1);

        const color = isCorner ? 0xf0c050 : isEdge ? 0xc0a040 : 0x908060;
        const radius = isCorner ? 0.6 : 0.45;

        const geo = new THREE.SphereGeometry(radius, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pt.x, Y, pt.z);
        mesh.userData = {
          type: 'gridHandle',
          colIndex: c,
          rowIndex: r,
          isCorner,
          isEdge,
          colPositions,
          rowPositions,
        };
        this.scene.scene.add(mesh);
        this.gridHandles.push(mesh);
      }
    }
  };

  gridFromDragRect = (start, end) => {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);
    return {
      topLeft: { x: minX, z: minZ },
      topRight: { x: maxX, z: minZ },
      bottomLeft: { x: minX, z: maxZ },
      bottomRight: { x: maxX, z: maxZ },
      cols: 5,
      rows: 4,
      colDividers: [0.2, 0.4, 0.6, 0.8],
      rowDividers: [0.25, 0.5, 0.75],
    };
  };

  updateGridPreviewRect = (start, end) => {
    this.clearGridVisualization();
    if (!start || !end || !this.scene) return;
    const Y = 0.15;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);
    const verts = [
      minX, Y, minZ, maxX, Y, minZ,
      maxX, Y, minZ, maxX, Y, maxZ,
      maxX, Y, maxZ, minX, Y, maxZ,
      minX, Y, maxZ, minX, Y, minZ,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xd4a843, transparent: true, opacity: 0.6 });
    this.gridBorderMesh = new THREE.LineSegments(geo, mat);
    this.scene.scene.add(this.gridBorderMesh);
  };

  handleGridAdjust = (handleData, point, grid) => {
    const { colIndex, rowIndex, isCorner, colPositions, rowPositions } = handleData;
    const newGrid = { ...grid };

    if (isCorner) {
      // Move the corner
      const isTop = rowIndex === 0;
      const isLeft = colIndex === 0;
      if (isTop && isLeft) newGrid.topLeft = { x: point.x, z: point.z };
      else if (isTop && !isLeft) newGrid.topRight = { x: point.x, z: point.z };
      else if (!isTop && isLeft) newGrid.bottomLeft = { x: point.x, z: point.z };
      else newGrid.bottomRight = { x: point.x, z: point.z };
    } else {
      // Adjust divider position(s)
      // Find normalized position of the dragged point within the grid rectangle
      // We project onto the col/row axes
      const tl = newGrid.topLeft;
      const tr = newGrid.topRight;
      const bl = newGrid.bottomLeft;
      const br = newGrid.bottomRight;

      // Approximate: compute normalized column position
      if (colIndex > 0 && colIndex < colPositions.length - 1) {
        // Adjust column divider
        const topSpanX = tr.x - tl.x;
        const topSpanZ = tr.z - tl.z;
        const botSpanX = br.x - bl.x;
        const botSpanZ = br.z - bl.z;
        // Average the normalized position from top and bottom edges
        let colT;
        if (Math.abs(topSpanX) > Math.abs(topSpanZ)) {
          colT = topSpanX !== 0 ? (point.x - tl.x) / topSpanX : 0.5;
        } else {
          colT = topSpanZ !== 0 ? (point.z - tl.z) / topSpanZ : 0.5;
        }
        colT = Math.max(0.02, Math.min(0.98, colT));
        const dividers = [...(newGrid.colDividers || Array.from({ length: newGrid.cols - 1 }, (_, i) => (i + 1) / newGrid.cols))];
        dividers[colIndex - 1] = Math.round(colT * 1000) / 1000;
        // Keep sorted
        dividers.sort((a, b) => a - b);
        newGrid.colDividers = dividers;
      }
      if (rowIndex > 0 && rowIndex < rowPositions.length - 1) {
        // Adjust row divider
        const leftSpanX = bl.x - tl.x;
        const leftSpanZ = bl.z - tl.z;
        let rowT;
        if (Math.abs(leftSpanZ) > Math.abs(leftSpanX)) {
          rowT = leftSpanZ !== 0 ? (point.z - tl.z) / leftSpanZ : 0.5;
        } else {
          rowT = leftSpanX !== 0 ? (point.x - tl.x) / leftSpanX : 0.5;
        }
        rowT = Math.max(0.02, Math.min(0.98, rowT));
        const dividers = [...(newGrid.rowDividers || Array.from({ length: newGrid.rows - 1 }, (_, i) => (i + 1) / newGrid.rows))];
        dividers[rowIndex - 1] = Math.round(rowT * 1000) / 1000;
        dividers.sort((a, b) => a - b);
        newGrid.rowDividers = dividers;
      }
    }

    return newGrid;
  };

  acceptGrid = () => {
    const grid = this.currentEditGrid || getGameGrid(this.state.spawnConfig);
    if (!grid) return;
    const newConfig = { ...this.state.spawnConfig };
    setGameGrid(newConfig, grid);
    this.setState({ spawnConfig: newConfig, gridEditMode: null, gridDragStart: null, gridDragEnd: null, gridAdjustHandle: null });
    saveSpawnConfig(newConfig);
    this.updateGridVisualization(grid, false);
    this.currentEditGrid = null;
  };

  cancelGrid = () => {
    this.clearGridVisualization();
    this.currentEditGrid = null;
    const existingGrid = getGameGrid(this.state.spawnConfig);
    if (existingGrid) this.updateGridVisualization(existingGrid, false);
    this.setState({ gridEditMode: null, gridDragStart: null, gridDragEnd: null, gridAdjustHandle: null });
  };

  clearGrid = () => {
    const newConfig = { ...this.state.spawnConfig };
    setGameGrid(newConfig, null);
    this.setState({ spawnConfig: newConfig, gridEditMode: null, gridDragStart: null, gridDragEnd: null, gridAdjustHandle: null });
    saveSpawnConfig(newConfig);
    this.clearGridVisualization();
    this.currentEditGrid = null;
  };

  toggleSpawnEditor = () => {
    this.setState((state) => {
      const next = !state.isPlacingSpawns;
      if (next) {
        this.updateSpawnMarkers(state.spawnConfig);
        const existingGrid = getGameGrid(state.spawnConfig);
        if (existingGrid) this.updateGridVisualization(existingGrid, false);
      } else {
        for (const [, mesh] of this.spawnMarkers) {
          this.scene.scene.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
        this.spawnMarkers.clear();
        this.clearTrackerPreviews();
        this.hideTrackerCursorPreview();
        this.clearGridVisualization();
      }
      return { isPlacingSpawns: next, activeSpawnKey: null, trackerEditing: null, gridEditMode: null, gridDragStart: null, gridDragEnd: null, gridAdjustHandle: null };
    });
  };

  // --- Game Actions ---

  drawCard = (pileId) => {
    const { gameState } = this.state;
    const pileMesh = this.pileMeshes.get(pileId);
    const card = drawFromPile(gameState, pileId);
    if (!card) return;
    playSound('cardDraw');

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
      img.src = card.imageUrl;
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

    // Drop-in animation (skip during session restore)
    if (!this.suppressBroadcast) {
      const targetY = mesh.position.y;
      mesh.position.y = targetY + 15;
      addTween({ target: mesh.position, property: 'y', from: mesh.position.y, to: targetY, duration: 300 });
    }

    if (broadcast && !this.suppressBroadcast) emitGameAction('card:place', { cardInstance });
  };

  removeCardFromTable = (cardInstance) => {
    const mesh = this.meshes.get(cardInstance.id);
    if (mesh) {
      this.scene.scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
      this.meshes.delete(cardInstance.id);
    }
    this.lifeHUDs.delete(cardInstance.id);
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
    emitGameAction('dice:spawn', { diceInstance });
    this.setState({ showDiceMenu: false });
  };

  rollDice = (diceInstance) => {
    const mesh = this.diceMeshes.get(diceInstance.id);
    if (!mesh) return;
    const faceCount = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 }[diceInstance.dieType] || 6;
    const targetValue = Math.ceil(Math.random() * faceCount);
    animateDiceRoll(mesh, targetValue);
    playSound('diceRoll');
    emitGameAction('dice:roll', { diceId: diceInstance.id, value: targetValue });
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
    emitGameAction('turn:pass', { currentTurn: nextTurn, turnNumber: nextNumber });
  };

  // --- Combat System ---

  enterTargetSelection = (attackerInstance, attackerMesh) => {
    const col = attackerInstance._gridCol;
    const row = attackerInstance._gridRow;
    if (col == null || row == null) return;

    const cardsInCell = this.getCardsInCell(col, row);
    const targets = getValidTargets(attackerInstance, cardsInCell, { sorceryCards: this.props.sorceryCards });

    if (targets.length === 0) {
      toast('No valid targets in this cell');
      return;
    }

    if (targets.length === 1) {
      this.resolveCombatAction(attackerInstance, attackerMesh, targets[0].cardInstance, targets[0].mesh);
      return;
    }

    // Multiple targets — highlight them and wait for user to pick one
    this._combatHighlightedMeshes = [];
    for (const t of targets) {
      const mats = Array.isArray(t.mesh.material) ? t.mesh.material : [t.mesh.material];
      for (const mat of mats) {
        mat._prevEmissive = mat.emissive ? mat.emissive.clone() : null;
        mat._prevEmissiveIntensity = mat.emissiveIntensity ?? 0;
        if (mat.emissive) {
          mat.emissive.setHex(0xcc4422);
          mat.emissiveIntensity = 0.6;
        }
      }
      this._combatHighlightedMeshes.push(t.mesh);
    }
    this._combatHighlightPulse = this.startCombatHighlightPulse();

    this.setState({
      combatSelectingTarget: {
        attackerInstance,
        attackerMesh,
        cell: { col, row },
        targetIds: new Set(targets.map((t) => t.cardInstance.id)),
      },
    });
    toast('Select a target to attack');
  };

  startCombatHighlightPulse = () => {
    let frame = 0;
    const tick = () => {
      if (!this._combatHighlightedMeshes?.length) return;
      frame++;
      const intensity = 0.4 + Math.sin(frame * 0.08) * 0.25;
      for (const mesh of this._combatHighlightedMeshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat.emissive) mat.emissiveIntensity = intensity;
        }
      }
      this._combatHighlightPulse = requestAnimationFrame(tick);
    };
    return requestAnimationFrame(tick);
  };

  clearCombatHighlights = () => {
    if (this._combatHighlightPulse) {
      cancelAnimationFrame(this._combatHighlightPulse);
      this._combatHighlightPulse = null;
    }
    if (this._combatHighlightedMeshes) {
      for (const mesh of this._combatHighlightedMeshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat._prevEmissive) {
            mat.emissive.copy(mat._prevEmissive);
            mat.emissiveIntensity = mat._prevEmissiveIntensity ?? 0;
            delete mat._prevEmissive;
            delete mat._prevEmissiveIntensity;
          }
        }
      }
      this._combatHighlightedMeshes = null;
    }
    this.setState({ combatSelectingTarget: null });
  };

  resolveCombatAction = (attackerInstance, attackerMesh, targetInstance, targetMesh) => {
    this.clearCombatHighlights();

    if (targetInstance.isSite) {
      this.resolveSiteAttackAction(attackerInstance, attackerMesh, targetInstance, targetMesh);
      return;
    }

    // In multiplayer, route through defense phase so opponent can respond
    if (this.state.connectionStatus === 'connected') {
      const cell = { col: targetInstance._gridCol, row: targetInstance._gridRow };
      this.setState({
        pendingAttack: {
          attackerId: attackerInstance.id,
          attackerMesh,
          targetId: targetInstance.id,
          targetMesh,
          targetType: 'unit',
          cell,
        },
        waitingForDefense: true,
      });
      emitGameAction('combat:declareAttack', {
        attackerId: attackerInstance.id,
        targetId: targetInstance.id,
        targetType: 'unit',
        cell,
      });
      return;
    }

    // Offline: resolve immediately (no defense phase)
    this.resolveDirectCombat(attackerInstance, attackerMesh, targetInstance, targetMesh);
  };

  resolveDirectCombat = (attackerInstance, attackerMesh, targetInstance, targetMesh) => {
    const attackerAbilities = this.getCardAbilities(attackerInstance);
    const defenderAbilities = this.getCardAbilities(targetInstance);
    const result = resolveCombat(attackerInstance, targetInstance, { attackerAbilities, defenderAbilities });

    attackerInstance.currentLife = result.attackerNewLife;
    targetInstance.currentLife = result.defenderNewLife;

    const atkHud = this.lifeHUDs.get(attackerInstance.id);
    if (atkHud) updateLifeHUD(atkHud.hpSprite, attackerInstance.currentLife, 'hp');
    const defHud = this.lifeHUDs.get(targetInstance.id);
    if (defHud) updateLifeHUD(defHud.hpSprite, targetInstance.currentLife, 'hp');

    if (result.defenderDamage > 0) {
      this.showDamageNumber(targetMesh, result.defenderDamage, 'damage');
    }
    if (result.attackerDamage > 0) {
      this.showDamageNumber(attackerMesh, result.attackerDamage, 'damage');
    }

    playSound('cardPlace');

    setTimeout(() => {
      const attackerCol = attackerInstance._gridCol;
      const attackerRow = attackerInstance._gridRow;
      const targetCol = targetInstance._gridCol;
      const targetRow = targetInstance._gridRow;

      if (result.defenderDead) {
        this.animateCardDeath(targetInstance, targetMesh);
      }
      if (result.attackerDead) {
        this.animateCardDeath(attackerInstance, attackerMesh);
      }

      setTimeout(() => {
        if (result.defenderDead && targetCol != null) {
          this.arrangeCardsInCell(targetCol, targetRow);
        }
        if (result.attackerDead && attackerCol != null) {
          this.arrangeCardsInCell(attackerCol, attackerRow);
        }
      }, 600);
    }, 400);

    emitGameAction('combat:resolve', {
      attackerId: attackerInstance.id,
      targetId: targetInstance.id,
      attackerDamage: result.attackerDamage,
      defenderDamage: result.defenderDamage,
      attackerNewLife: result.attackerNewLife,
      defenderNewLife: result.defenderNewLife,
      attackerDead: result.attackerDead,
      defenderDead: result.defenderDead,
    });
  };

  resolveSiteAttackAction = (attackerInstance, attackerMesh, siteInstance, siteMesh) => {
    const { damage } = resolveSiteAttack(attackerInstance);

    if (damage > 0) {
      this.showDamageNumber(siteMesh, damage, 'damage');
    }

    playSound('cardPlace');
    toast(`Avatar takes ${damage} damage from site attack`);

    emitGameAction('combat:siteAttack', {
      attackerId: attackerInstance.id,
      siteId: siteInstance.id,
      damage,
    });
  };

  applyRemoteCombatResolve = (data) => {
    const attackerMesh = this.meshes.get(data.attackerId);
    const targetMesh = this.meshes.get(data.targetId);
    if (!attackerMesh || !targetMesh) return;

    const attacker = attackerMesh.userData.cardInstance;
    const target = targetMesh.userData.cardInstance;

    attacker.currentLife = data.attackerNewLife;
    target.currentLife = data.defenderNewLife;

    const atkHud = this.lifeHUDs.get(data.attackerId);
    if (atkHud) updateLifeHUD(atkHud.hpSprite, attacker.currentLife, 'hp');
    const defHud = this.lifeHUDs.get(data.targetId);
    if (defHud) updateLifeHUD(defHud.hpSprite, target.currentLife, 'hp');

    if (data.defenderDamage > 0) {
      this.showDamageNumber(targetMesh, data.defenderDamage, 'damage');
    }
    if (data.attackerDamage > 0) {
      this.showDamageNumber(attackerMesh, data.attackerDamage, 'damage');
    }

    playSound('cardPlace');

    setTimeout(() => {
      const attackerCol = attacker._gridCol;
      const attackerRow = attacker._gridRow;
      const targetCol = target._gridCol;
      const targetRow = target._gridRow;

      if (data.defenderDead) {
        this.animateCardDeath(target, targetMesh);
      }
      if (data.attackerDead) {
        this.animateCardDeath(attacker, attackerMesh);
      }

      setTimeout(() => {
        if (data.defenderDead && targetCol != null) {
          this.arrangeCardsInCell(targetCol, targetRow);
        }
        if (data.attackerDead && attackerCol != null) {
          this.arrangeCardsInCell(attackerCol, attackerRow);
        }
      }, 600);
    }, 400);
  };

  applyRemoteSiteAttack = (data) => {
    const siteMesh = this.meshes.get(data.siteId);
    if (siteMesh && data.damage > 0) {
      this.showDamageNumber(siteMesh, data.damage, 'damage');
    }
    playSound('cardPlace');
    toast(`Avatar takes ${data.damage} damage from site attack`);
  };

  // --- Defense & Intercept Reaction System ---

  getAllGridCards = () => {
    const result = [];
    for (const [cardId, mesh] of this.meshes) {
      const ci = mesh.userData.cardInstance;
      if (ci && ci._gridCol != null && ci._gridRow != null) {
        result.push({ cardId, mesh, cardInstance: ci });
      }
    }
    return result;
  };

  handleRemoteDeclareAttack = (data) => {
    const { attackerId, targetId, targetType, cell } = data;
    const targetMesh = this.meshes.get(targetId);
    const attackerMesh = this.meshes.get(attackerId);
    if (!targetMesh || !attackerMesh) return;

    const targetInstance = targetMesh.userData.cardInstance;
    const attackerInstance = attackerMesh.userData.cardInstance;

    // Defending player is the one whose card is being attacked
    const defendingPlayerRotated = !!targetInstance.rotated;
    const allGridCards = this.getAllGridCards();
    const attackerAbilities = this.getCardAbilities(attackerInstance);
    const validDefenders = getDefenders(cell.col, cell.row, allGridCards, defendingPlayerRotated, { attackerAbilities });

    if (validDefenders.length === 0) {
      // No defenders available, auto-pass
      emitGameAction('combat:defendResponse', {
        attackerId,
        targetId,
        defenders: [],
        keepTarget: true,
      });
      return;
    }

    // Highlight valid defender meshes with blue pulse
    this._defendHighlightedMeshes = [];
    for (const d of validDefenders) {
      const mats = Array.isArray(d.mesh.material) ? d.mesh.material : [d.mesh.material];
      for (const mat of mats) {
        mat._prevEmissive = mat.emissive ? mat.emissive.clone() : null;
        mat._prevEmissiveIntensity = mat.emissiveIntensity ?? 0;
        if (mat.emissive) {
          mat.emissive.setHex(0x2266cc);
          mat.emissiveIntensity = 0.5;
        }
      }
      this._defendHighlightedMeshes.push(d.mesh);
    }
    this._defendHighlightPulse = this.startDefendHighlightPulse();

    this.setState({
      defendPrompt: {
        attackerId,
        targetId,
        attackerName: attackerInstance.name || 'Attacker',
        targetName: targetInstance.name || 'Target',
        validDefenders: validDefenders.map((d) => d.cardInstance.id),
        selectedDefenders: new Set(),
        keepOriginalTarget: true,
        cell,
      },
    });
  };

  startDefendHighlightPulse = () => {
    let frame = 0;
    const tick = () => {
      if (!this._defendHighlightedMeshes?.length) return;
      frame++;
      const intensity = 0.3 + Math.sin(frame * 0.06) * 0.2;
      for (const mesh of this._defendHighlightedMeshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat.emissive) mat.emissiveIntensity = intensity;
        }
      }
      this._defendHighlightPulse = requestAnimationFrame(tick);
    };
    return requestAnimationFrame(tick);
  };

  clearDefendHighlights = () => {
    if (this._defendHighlightPulse) {
      cancelAnimationFrame(this._defendHighlightPulse);
      this._defendHighlightPulse = null;
    }
    if (this._defendHighlightedMeshes) {
      for (const mesh of this._defendHighlightedMeshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat._prevEmissive) {
            mat.emissive.copy(mat._prevEmissive);
            mat.emissiveIntensity = mat._prevEmissiveIntensity ?? 0;
            delete mat._prevEmissive;
            delete mat._prevEmissiveIntensity;
          }
        }
      }
      this._defendHighlightedMeshes = null;
    }
  };

  toggleDefender = (cardId) => {
    this.setState((state) => {
      if (!state.defendPrompt) return null;
      const selected = new Set(state.defendPrompt.selectedDefenders);
      if (selected.has(cardId)) {
        selected.delete(cardId);
        // Revert to blue highlight
        const mesh = this.meshes.get(cardId);
        if (mesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (mat.emissive) mat.emissive.setHex(0x2266cc);
          }
        }
      } else {
        selected.add(cardId);
        // Switch to green highlight
        const mesh = this.meshes.get(cardId);
        if (mesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (mat.emissive) mat.emissive.setHex(0x22cc44);
          }
        }
      }
      return { defendPrompt: { ...state.defendPrompt, selectedDefenders: selected } };
    });
  };

  submitDefendResponse = () => {
    const { defendPrompt } = this.state;
    if (!defendPrompt) return;

    const defenders = [...defendPrompt.selectedDefenders];
    this.clearDefendHighlights();

    // Tap selected defenders
    for (const defId of defenders) {
      const mesh = this.meshes.get(defId);
      if (mesh) {
        const card = mesh.userData.cardInstance;
        if (!card.tapped) {
          card.tapped = true;
          animateCardTap(mesh, card);
          emitGameAction('card:tap', { cardId: card.id, tapped: true });
        }
      }
    }

    emitGameAction('combat:defendResponse', {
      attackerId: defendPrompt.attackerId,
      targetId: defendPrompt.targetId,
      defenders,
      keepTarget: defendPrompt.keepOriginalTarget,
    });

    this.setState({ defendPrompt: null });
  };

  passDefend = () => {
    const { defendPrompt } = this.state;
    if (!defendPrompt) return;

    this.clearDefendHighlights();
    emitGameAction('combat:defendResponse', {
      attackerId: defendPrompt.attackerId,
      targetId: defendPrompt.targetId,
      defenders: [],
      keepTarget: true,
    });
    this.setState({ defendPrompt: null });
  };

  handleRemoteDefendResponse = (data) => {
    const { attackerId, targetId, defenders, keepTarget } = data;
    const attackerMesh = this.meshes.get(attackerId);
    const targetMesh = this.meshes.get(targetId);
    if (!attackerMesh || !targetMesh) {
      this.setState({ pendingAttack: null, waitingForDefense: false });
      return;
    }

    const attackerInstance = attackerMesh.userData.cardInstance;
    const targetInstance = targetMesh.userData.cardInstance;

    this.setState({ waitingForDefense: false, pendingAttack: null });

    if (!defenders || defenders.length === 0) {
      // No defense — resolve direct combat
      this.resolveDirectCombat(attackerInstance, attackerMesh, targetInstance, targetMesh);
      return;
    }

    // Collect all combatants: defenders + optionally the original target
    const allDefenderInstances = [];
    for (const defId of defenders) {
      const mesh = this.meshes.get(defId);
      if (mesh) allDefenderInstances.push(mesh.userData.cardInstance);
    }
    if (keepTarget) {
      allDefenderInstances.push(targetInstance);
    }

    if (allDefenderInstances.length === 0) {
      this.resolveDirectCombat(attackerInstance, attackerMesh, targetInstance, targetMesh);
      return;
    }

    // Resolve multi-combat with abilities
    const attackerAbilities = this.getCardAbilities(attackerInstance);
    const defenderAbilitiesList = allDefenderInstances.map((d) => this.getCardAbilities(d));
    const result = resolveMultiCombat(attackerInstance, allDefenderInstances, { attackerAbilities, defenderAbilitiesList });

    // Apply attacker damage
    attackerInstance.currentLife = result.attackerNewLife;
    const atkHud = this.lifeHUDs.get(attackerInstance.id);
    if (atkHud) updateLifeHUD(atkHud.hpSprite, attackerInstance.currentLife, 'hp');
    if (result.attackerDamage > 0) {
      this.showDamageNumber(attackerMesh, result.attackerDamage, 'damage');
    }

    // Apply defender damage
    for (const defResult of result.defenderResults) {
      const defMesh = this.meshes.get(defResult.id);
      if (!defMesh) continue;
      const defInstance = defMesh.userData.cardInstance;
      defInstance.currentLife = defResult.newLife;
      const defHud = this.lifeHUDs.get(defResult.id);
      if (defHud) updateLifeHUD(defHud.hpSprite, defInstance.currentLife, 'hp');
      if (defResult.damage > 0) {
        this.showDamageNumber(defMesh, defResult.damage, 'damage');
      }
    }

    playSound('cardPlace');

    // Handle deaths
    setTimeout(() => {
      const deadCells = [];
      for (const defResult of result.defenderResults) {
        if (defResult.dead) {
          const defMesh = this.meshes.get(defResult.id);
          if (defMesh) {
            const defInstance = defMesh.userData.cardInstance;
            deadCells.push({ col: defInstance._gridCol, row: defInstance._gridRow });
            this.animateCardDeath(defInstance, defMesh);
          }
        }
      }
      if (result.attackerDead) {
        deadCells.push({ col: attackerInstance._gridCol, row: attackerInstance._gridRow });
        this.animateCardDeath(attackerInstance, attackerMesh);
      }

      setTimeout(() => {
        for (const { col, row } of deadCells) {
          if (col != null) this.arrangeCardsInCell(col, row);
        }
      }, 600);
    }, 400);

    // Broadcast multi-combat result to opponent
    emitGameAction('combat:multiResolve', {
      attackerId: attackerInstance.id,
      attackerDamage: result.attackerDamage,
      attackerNewLife: result.attackerNewLife,
      attackerDead: result.attackerDead,
      defenderResults: result.defenderResults,
    });
  };

  applyRemoteMultiCombatResolve = (data) => {
    const attackerMesh = this.meshes.get(data.attackerId);
    if (attackerMesh) {
      const attacker = attackerMesh.userData.cardInstance;
      attacker.currentLife = data.attackerNewLife;
      const atkHud = this.lifeHUDs.get(data.attackerId);
      if (atkHud) updateLifeHUD(atkHud.hpSprite, attacker.currentLife, 'hp');
      if (data.attackerDamage > 0) {
        this.showDamageNumber(attackerMesh, data.attackerDamage, 'damage');
      }
    }

    for (const defResult of data.defenderResults) {
      const defMesh = this.meshes.get(defResult.id);
      if (!defMesh) continue;
      const defInstance = defMesh.userData.cardInstance;
      defInstance.currentLife = defResult.newLife;
      const defHud = this.lifeHUDs.get(defResult.id);
      if (defHud) updateLifeHUD(defHud.hpSprite, defInstance.currentLife, 'hp');
      if (defResult.damage > 0) {
        this.showDamageNumber(defMesh, defResult.damage, 'damage');
      }
    }

    playSound('cardPlace');

    setTimeout(() => {
      const deadCells = [];
      for (const defResult of data.defenderResults) {
        if (defResult.dead) {
          const defMesh = this.meshes.get(defResult.id);
          if (defMesh) {
            const defInstance = defMesh.userData.cardInstance;
            deadCells.push({ col: defInstance._gridCol, row: defInstance._gridRow });
            this.animateCardDeath(defInstance, defMesh);
          }
        }
      }
      if (data.attackerDead && attackerMesh) {
        const attacker = attackerMesh.userData.cardInstance;
        deadCells.push({ col: attacker._gridCol, row: attacker._gridRow });
        this.animateCardDeath(attacker, attackerMesh);
      }

      setTimeout(() => {
        for (const { col, row } of deadCells) {
          if (col != null) this.arrangeCardsInCell(col, row);
        }
      }, 600);
    }, 400);
  };

  // --- Intercept System ---

  broadcastMoveComplete = (cardInstance, col, row) => {
    if (this.state.connectionStatus !== 'connected') return;
    emitGameAction('combat:moveComplete', {
      cardId: cardInstance.id,
      cell: { col, row },
    });
  };

  handleRemoteMoveComplete = (data) => {
    const { cardId, cell } = data;
    const cardMesh = this.meshes.get(cardId);
    if (!cardMesh) return;

    const movedCard = cardMesh.userData.cardInstance;
    // The intercepting player is the opponent of whoever moved
    const interceptingPlayerRotated = !movedCard.rotated;
    const allGridCards = this.getAllGridCards();
    const moverAbilities = this.getCardAbilities(movedCard);
    const validInterceptors = getInterceptors(cell.col, cell.row, allGridCards, interceptingPlayerRotated, { moverAbilities });

    if (validInterceptors.length === 0) return;

    // Highlight interceptors
    this._interceptHighlightedMeshes = [];
    for (const ic of validInterceptors) {
      const mats = Array.isArray(ic.mesh.material) ? ic.mesh.material : [ic.mesh.material];
      for (const mat of mats) {
        mat._prevEmissive = mat.emissive ? mat.emissive.clone() : null;
        mat._prevEmissiveIntensity = mat.emissiveIntensity ?? 0;
        if (mat.emissive) {
          mat.emissive.setHex(0xcc8822);
          mat.emissiveIntensity = 0.5;
        }
      }
      this._interceptHighlightedMeshes.push(ic.mesh);
    }
    this._interceptHighlightPulse = this.startInterceptHighlightPulse();

    this.setState({
      interceptPrompt: {
        arrivedCardId: cardId,
        arrivedCardName: movedCard.name || 'Enemy unit',
        cell,
        validInterceptors: validInterceptors.map((ic) => ic.cardInstance.id),
        selectedInterceptors: new Set(),
      },
    });
  };

  startInterceptHighlightPulse = () => {
    let frame = 0;
    const tick = () => {
      if (!this._interceptHighlightedMeshes?.length) return;
      frame++;
      const intensity = 0.3 + Math.sin(frame * 0.06) * 0.2;
      for (const mesh of this._interceptHighlightedMeshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat.emissive) mat.emissiveIntensity = intensity;
        }
      }
      this._interceptHighlightPulse = requestAnimationFrame(tick);
    };
    return requestAnimationFrame(tick);
  };

  clearInterceptHighlights = () => {
    if (this._interceptHighlightPulse) {
      cancelAnimationFrame(this._interceptHighlightPulse);
      this._interceptHighlightPulse = null;
    }
    if (this._interceptHighlightedMeshes) {
      for (const mesh of this._interceptHighlightedMeshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat._prevEmissive) {
            mat.emissive.copy(mat._prevEmissive);
            mat.emissiveIntensity = mat._prevEmissiveIntensity ?? 0;
            delete mat._prevEmissive;
            delete mat._prevEmissiveIntensity;
          }
        }
      }
      this._interceptHighlightedMeshes = null;
    }
  };

  toggleInterceptor = (cardId) => {
    this.setState((state) => {
      if (!state.interceptPrompt) return null;
      const selected = new Set(state.interceptPrompt.selectedInterceptors);
      if (selected.has(cardId)) {
        selected.delete(cardId);
        const mesh = this.meshes.get(cardId);
        if (mesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (mat.emissive) mat.emissive.setHex(0xcc8822);
          }
        }
      } else {
        selected.add(cardId);
        const mesh = this.meshes.get(cardId);
        if (mesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (mat.emissive) mat.emissive.setHex(0x22cc44);
          }
        }
      }
      return { interceptPrompt: { ...state.interceptPrompt, selectedInterceptors: selected } };
    });
  };

  submitInterceptResponse = () => {
    const { interceptPrompt } = this.state;
    if (!interceptPrompt) return;

    const interceptors = [...interceptPrompt.selectedInterceptors];
    this.clearInterceptHighlights();

    // Tap selected interceptors
    for (const icId of interceptors) {
      const mesh = this.meshes.get(icId);
      if (mesh) {
        const card = mesh.userData.cardInstance;
        if (!card.tapped) {
          card.tapped = true;
          animateCardTap(mesh, card);
          emitGameAction('card:tap', { cardId: card.id, tapped: true });
        }
      }
    }

    emitGameAction('combat:interceptResponse', {
      arrivedCardId: interceptPrompt.arrivedCardId,
      interceptors,
    });

    this.setState({ interceptPrompt: null });
  };

  passIntercept = () => {
    const { interceptPrompt } = this.state;
    if (!interceptPrompt) return;

    this.clearInterceptHighlights();
    emitGameAction('combat:interceptResponse', {
      arrivedCardId: interceptPrompt.arrivedCardId,
      interceptors: [],
    });
    this.setState({ interceptPrompt: null });
  };

  handleRemoteInterceptResponse = (data) => {
    const { arrivedCardId, interceptors } = data;
    if (!interceptors || interceptors.length === 0) return;

    const arrivedMesh = this.meshes.get(arrivedCardId);
    if (!arrivedMesh) return;
    const arrivedCard = arrivedMesh.userData.cardInstance;

    const interceptorInstances = [];
    for (const icId of interceptors) {
      const mesh = this.meshes.get(icId);
      if (mesh) interceptorInstances.push(mesh.userData.cardInstance);
    }

    if (interceptorInstances.length === 0) return;

    // Resolve intercept combat: arrived card vs all interceptors (with abilities)
    const arrivedAbilities = this.getCardAbilities(arrivedCard);
    const interceptorAbilitiesList = interceptorInstances.map((ic) => this.getCardAbilities(ic));
    const result = resolveMultiCombat(arrivedCard, interceptorInstances, { attackerAbilities: arrivedAbilities, defenderAbilitiesList: interceptorAbilitiesList });

    arrivedCard.currentLife = result.attackerNewLife;
    const atkHud = this.lifeHUDs.get(arrivedCardId);
    if (atkHud) updateLifeHUD(atkHud.hpSprite, arrivedCard.currentLife, 'hp');
    if (result.attackerDamage > 0) {
      this.showDamageNumber(arrivedMesh, result.attackerDamage, 'damage');
    }

    for (const defResult of result.defenderResults) {
      const defMesh = this.meshes.get(defResult.id);
      if (!defMesh) continue;
      const defInstance = defMesh.userData.cardInstance;
      defInstance.currentLife = defResult.newLife;
      const defHud = this.lifeHUDs.get(defResult.id);
      if (defHud) updateLifeHUD(defHud.hpSprite, defInstance.currentLife, 'hp');
      if (defResult.damage > 0) {
        this.showDamageNumber(defMesh, defResult.damage, 'damage');
      }
    }

    playSound('cardPlace');

    setTimeout(() => {
      const deadCells = [];
      for (const defResult of result.defenderResults) {
        if (defResult.dead) {
          const defMesh = this.meshes.get(defResult.id);
          if (defMesh) {
            const defInstance = defMesh.userData.cardInstance;
            deadCells.push({ col: defInstance._gridCol, row: defInstance._gridRow });
            this.animateCardDeath(defInstance, defMesh);
          }
        }
      }
      if (result.attackerDead) {
        deadCells.push({ col: arrivedCard._gridCol, row: arrivedCard._gridRow });
        this.animateCardDeath(arrivedCard, arrivedMesh);
      }

      setTimeout(() => {
        for (const { col, row } of deadCells) {
          if (col != null) this.arrangeCardsInCell(col, row);
        }
      }, 600);
    }, 400);

    emitGameAction('combat:multiResolve', {
      attackerId: arrivedCardId,
      attackerDamage: result.attackerDamage,
      attackerNewLife: result.attackerNewLife,
      attackerDead: result.attackerDead,
      defenderResults: result.defenderResults,
    });
  };

  // --- Artifact Pick Up / Drop ---

  pickUpArtifacts = (cardInstance) => {
    const col = cardInstance._gridCol;
    const row = cardInstance._gridRow;
    if (col == null || row == null) return;

    const cardsInCell = this.getCardsInCell(col, row);
    const artifacts = cardsInCell.filter(({ cardInstance: ci }) =>
      ci.type === 'Artifact' && ci.id !== cardInstance.id && !ci._carriedBy
    );

    if (artifacts.length === 0) {
      toast('No artifacts to pick up');
      this.setState({ contextMenu: null });
      return;
    }

    if (!cardInstance.carriedArtifacts) cardInstance.carriedArtifacts = [];

    for (const { cardInstance: artifact } of artifacts) {
      artifact._carriedBy = cardInstance.id;
      cardInstance.carriedArtifacts.push(artifact.id);
      // Hide the artifact mesh
      const artifactMesh = this.meshes.get(artifact.id);
      if (artifactMesh) artifactMesh.visible = false;
    }

    toast(`Picked up ${artifacts.length} artifact${artifacts.length > 1 ? 's' : ''}`);
    this.setState({ contextMenu: null });
  };

  dropArtifacts = (cardInstance) => {
    if (!cardInstance.carriedArtifacts || cardInstance.carriedArtifacts.length === 0) {
      toast('No artifacts to drop');
      this.setState({ contextMenu: null });
      return;
    }

    const col = cardInstance._gridCol;
    const row = cardInstance._gridRow;
    const count = cardInstance.carriedArtifacts.length;

    for (const artifactId of cardInstance.carriedArtifacts) {
      const artifactMesh = this.meshes.get(artifactId);
      if (artifactMesh) {
        const artifact = artifactMesh.userData.cardInstance;
        artifact._carriedBy = undefined;
        artifact._gridCol = col;
        artifact._gridRow = row;
        artifactMesh.visible = true;
      }
    }

    cardInstance.carriedArtifacts = [];
    if (col != null && row != null) this.arrangeCardsInCell(col, row);
    toast(`Dropped ${count} artifact${count > 1 ? 's' : ''}`);
    this.setState({ contextMenu: null });
  };

  changeCardLevel = (cardInstance, newLevel) => {
    const oldLevel = cardInstance._level || LEVELS.SURFACE;
    cardInstance._level = newLevel;

    // Update the visual indicator
    const mesh = this.meshes.get(cardInstance.id);
    if (mesh) this.updateLevelIndicator(cardInstance, mesh);

    const labels = {
      [LEVELS.SURFACE]: 'surfaced',
      [LEVELS.UNDERGROUND]: 'burrowed underground',
      [LEVELS.UNDERWATER]: 'submerged underwater',
    };
    toast(`${cardInstance.name} ${labels[newLevel] || newLevel}`);
    emitGameAction('card:level', { cardId: cardInstance.id, level: newLevel });
    this.setState({ contextMenu: null });
  };

  updateLevelIndicator = (cardInstance, mesh) => {
    // Remove old indicator
    const oldIndicator = mesh.children.find((c) => c.userData?.type === 'levelIndicator');
    if (oldIndicator) {
      mesh.remove(oldIndicator);
      oldIndicator.geometry?.dispose();
      oldIndicator.material?.dispose();
    }

    const level = cardInstance._level || LEVELS.SURFACE;
    if (level === LEVELS.SURFACE) return; // No indicator for surface

    // Create a small icon sprite above the card
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Background circle
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = level === LEVELS.UNDERGROUND ? 'rgba(180, 120, 50, 0.9)' : 'rgba(30, 120, 200, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrow icon pointing down
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↓', 32, 34);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.5, 2.5, 1);
    sprite.position.set(0, CARD_HEIGHT / 2 - 1.5, CARD_THICKNESS / 2 + 0.2);
    sprite.userData = { type: 'levelIndicator' };
    mesh.add(sprite);
  };

  showDamageNumber = (mesh, amount, type = 'damage') => {
    if (!this.scene?.camera || !this.canvasRef.current) return;

    const pos = mesh.position.clone();
    pos.y += 3;
    pos.project(this.scene.camera);
    const canvas = this.canvasRef.current;
    const screenX = ((pos.x + 1) / 2) * canvas.clientWidth;
    const screenY = ((-pos.y + 1) / 2) * canvas.clientHeight;

    const container = canvas.parentElement;
    if (!container) return;

    const el = document.createElement('div');
    el.textContent = `-${amount}`;
    el.style.cssText = `
      position: absolute; z-index: 200; pointer-events: none;
      left: ${screenX}px; top: ${screenY}px;
      transform: translate(-50%, -50%);
      font-size: 28px; font-weight: 900; font-family: system-ui, sans-serif;
      color: ${type === 'damage' ? '#ef4444' : '#eab308'};
      text-shadow: 0 2px 8px rgba(0,0,0,0.7), 0 0 12px ${type === 'damage' ? 'rgba(239,68,68,0.5)' : 'rgba(234,179,8,0.5)'};
      opacity: 1;
      transition: transform 1.5s ease-out, opacity 1.2s ease-in;
    `;
    container.appendChild(el);

    // Force reflow then animate
    el.getBoundingClientRect();
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%, -50%) translateY(-60px)';
      el.style.opacity = '0';
    });

    setTimeout(() => el.remove(), 1600);
  };

  animateCardDeath = (cardInstance, mesh) => {
    const col = cardInstance._gridCol;
    const row = cardInstance._gridRow;

    // Drop carried artifacts at current location
    if (cardInstance.carriedArtifacts && cardInstance.carriedArtifacts.length > 0) {
      for (const artifactId of cardInstance.carriedArtifacts) {
        const artifactMesh = this.meshes.get(artifactId);
        if (artifactMesh) {
          const artifact = artifactMesh.userData.cardInstance;
          artifact._carriedBy = undefined;
          artifact._gridCol = col;
          artifact._gridRow = row;
          artifactMesh.visible = true;
        }
      }
      cardInstance.carriedArtifacts = [];
    }

    // Clear grid tracking
    cardInstance._gridCol = undefined;
    cardInstance._gridRow = undefined;

    // Brief shake
    const origX = mesh.position.x;
    const shakeFrames = 8;
    let shakeCount = 0;
    const shake = () => {
      if (shakeCount >= shakeFrames) {
        mesh.position.x = origX;
        // Fade out
        this.animateCardFadeOut(cardInstance, mesh);
        return;
      }
      mesh.position.x = origX + (Math.random() - 0.5) * 0.4;
      shakeCount++;
      requestAnimationFrame(shake);
    };
    requestAnimationFrame(shake);
  };

  animateCardFadeOut = (cardInstance, mesh) => {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      mat.transparent = true;
    }

    const duration = 500;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const opacity = 1 - t;
      for (const mat of mats) {
        mat.opacity = opacity;
      }
      // Also fade HUD sprites
      const hud = this.lifeHUDs.get(cardInstance.id);
      if (hud) {
        if (hud.sprite?.material) hud.sprite.material.opacity = opacity;
        if (hud.hpSprite?.material) hud.hpSprite.material.opacity = opacity;
      }

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // Send to cemetery and clean up
        this.sendDeadCardToCemetery(cardInstance);
      }
    };
    requestAnimationFrame(tick);
  };

  sendDeadCardToCemetery = (cardInstance) => {
    // Guard against double-sends
    if (cardInstance._sentToCemetery) return;
    cardInstance._sentToCemetery = true;

    // Reset opacity on materials before sending to pile
    const mesh = this.meshes.get(cardInstance.id);
    if (mesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        mat.opacity = 1;
        mat.transparent = false;
      }
    }

    const pile = this.findPileByName('Cemetery');
    if (pile) {
      pile.cards.push(cardInstance);
      this.removeCardFromTable(cardInstance);
      this.updatePileMeshes();
    } else {
      // Create cemetery pile if it doesn't exist
      const { spawnConfig } = this.state;
      const point = getSpawnPoint(spawnConfig, 'cemetery');
      const newPile = {
        id: `pile-${Date.now()}`,
        name: 'Cemetery',
        cards: [cardInstance],
        x: point.x,
        z: point.z,
        rotated: cardInstance.rotated || false,
      };
      this.state.gameState.piles.push(newPile);
      const pileMesh = createPileMesh(newPile);
      if (pileMesh) {
        this.scene.scene.add(pileMesh);
        this.pileMeshes.set(newPile.id, pileMesh);
      }
      this.removeCardFromTable(cardInstance);
    }
    emitGameAction('pile:update', {});
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
    emitGameAction('dice:delete', { diceId: diceInstance.id });
    this.setState({ contextMenu: null });
  };

  setDiceValue = (diceInstance, value) => {
    const mesh = this.diceMeshes.get(diceInstance.id);
    if (mesh) setDieFaceUp(mesh, value);
    emitGameAction('dice:roll', { diceId: diceInstance.id, value });
    this.setState({ contextMenu: null });
  };

  findPileByName = (name) => {
    return this.state.gameState.piles.find((p) => p.name === name);
  };

  sendCardToPile = (cardInstance, pileName, shouldShuffle = false) => {
    const pile = this.findPileByName(pileName);
    if (!pile) {
      // Create the pile at a default position if it doesn't exist (e.g., Cemetery)
      const { spawnConfig } = this.state;
      const key = pileName.toLowerCase();
      const point = getSpawnPoint(spawnConfig, key);
      const newPile = { id: `pile-${Date.now()}`, name: pileName, cards: [], x: point.x, z: point.z, rotated: cardInstance.rotated || false };
      this.state.gameState.piles.push(newPile);
      newPile.cards.push(cardInstance);

      const mesh = createPileMesh(newPile);
      if (mesh) {
        this.scene.scene.add(mesh);
        this.pileMeshes.set(newPile.id, mesh);
      }
    } else {
      // Animate card flying to pile, then add to pile data
      const cardMesh = this.meshes.get(cardInstance.id);
      const pileMesh = this.pileMeshes.get(pile.id);
      if (cardMesh && pileMesh) {
        this.meshes.delete(cardInstance.id);
        animateCardToPile(cardMesh, pileMesh.position.x, pileMesh.position.z, this.scene.scene, () => {
          pile.cards.push(cardInstance);
          if (shouldShuffle) {
            shufflePile(this.state.gameState, pile.id);
            const pm = this.pileMeshes.get(pile.id);
            if (pm) animateShufflePile(pm, pile, this.scene.scene);
          }
          this.updatePileMeshes();
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
      }
    }

    this.setState({ contextMenu: null });
  };

  sendHandCardToPile = (cardInstance, pileName, shouldShuffle = false) => {
    const pile = this.findPileByName(pileName);
    if (pile) {
      pile.cards.push(cardInstance);
      if (shouldShuffle) {
        shufflePile(this.state.gameState, pile.id);
        const mesh = this.pileMeshes.get(pile.id);
        if (mesh) animateShufflePile(mesh, pile, this.scene.scene);
      }
      this.updatePileMeshes();
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
  };

  flipCard = (cardInstance, mesh) => {
    cardInstance.faceDown = !cardInstance.faceDown;
    animateCardFlip(mesh, cardInstance);
    playSound('cardFlip');
    emitGameAction('card:flip', { cardId: cardInstance.id, faceDown: cardInstance.faceDown });
    this.setState({ contextMenu: null });
  };

  tapCard = (cardInstance, mesh) => {
    if (cardInstance.isSite) { this.setState({ contextMenu: null }); return; }
    cardInstance.tapped = !cardInstance.tapped;
    animateCardTap(mesh, cardInstance);
    emitGameAction('card:tap', { cardId: cardInstance.id, tapped: cardInstance.tapped });
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
  };

  updatePileMeshes = () => {
    const { gameState } = this.state;
    for (const pile of gameState.piles) {
      const mesh = this.pileMeshes.get(pile.id);
      if (!mesh) continue;

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

  renderContextMenu() {
    const { contextMenu } = this.state;
    if (!contextMenu) return null;

    const menuStyle = {
      position: 'fixed',
      left: contextMenu.x,
      top: contextMenu.y,
      zIndex: 100,
    };

    const menuCls = 'flex w-full items-center rounded-lg px-3 py-1.5 cursor-pointer transition-colors';
    const menuHover = (e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; };
    const menuLeave = (e) => { e.currentTarget.style.background = 'transparent'; };
    const divider = <div className="mx-2 my-1 h-px" style={{ background: `${GOLD} 0.1)` }} />;

    if (contextMenu.type === 'moveAction') {
      const { cardInstance, mesh } = contextMenu;
      const abilities = this.getCardAbilities(cardInstance);
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
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${GOLD} 0.1)`, color: ACCENT_GOLD }}>{tag}</span>
              ))}
            </div>
          ) : null}
          {divider}
          <button type="button" className={menuCls}
            style={{ color: isImmobile ? TEXT_MUTED : TEXT_BODY, opacity: isImmobile ? 0.4 : 1 }}
            onMouseEnter={isImmobile ? undefined : menuHover} onMouseLeave={menuLeave}
            onClick={() => {
              if (isImmobile) return;
              this.setState({ contextMenu: null });
              this.startPathMode(cardInstance, mesh, 'move');
            }}>
            <span className="mr-2">&#9814;</span> Move
            {isImmobile ? <span className="ml-auto text-[10px] opacity-60">Immobile</span> : null}
          </button>
          <button type="button" className={menuCls}
            style={{ color: isImmobile ? TEXT_MUTED : '#c45050', opacity: isImmobile ? 0.4 : 1 }}
            onMouseEnter={isImmobile ? undefined : menuHover} onMouseLeave={menuLeave}
            onClick={() => {
              if (isImmobile) return;
              this.setState({ contextMenu: null });
              this.startPathMode(cardInstance, mesh, 'attack');
            }}>
            <span className="mr-2">&#9876;</span> Move &amp; Attack
            <span className="ml-auto text-[10px] opacity-60">{attackSteps} step{attackSteps !== 1 ? 's' : ''}</span>
          </button>
          {divider}
          <button type="button" className={menuCls} style={{ color: TEXT_MUTED }} onMouseEnter={menuHover} onMouseLeave={menuLeave}
            onClick={() => { this._pendingPathCard = null; this.setState({ contextMenu: null }); }}>
            Cancel
          </button>
        </div>
      );
    }

    if (contextMenu.type === 'card') {
      const { cardInstance, mesh } = contextMenu;
      return (
        <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
          <div className="px-3 py-1.5 text-xs font-semibold truncate" style={{ color: TEXT_PRIMARY }}>{cardInstance.name}</div>
          {/* Move & Attack option for grid cards */}
          {(() => {
            const isOnGrid = cardInstance._gridCol != null && cardInstance._gridRow != null;
            const isSite = cardInstance.isSite;
            if (!isOnGrid || isSite) return null;
            const abilities = this.getCardAbilities(cardInstance);
            if (abilities?.immobile) return null;
            const steps = 1 + (abilities?.movementBonus || 0);
            return (
              <>
                <button type="button" className={menuCls} style={{ color: '#c45050' }} onMouseEnter={menuHover} onMouseLeave={menuLeave}
                  onClick={() => {
                    this.setState({ contextMenu: null });
                    // Tap and attack in place — enter target selection at current cell
                    if (!cardInstance.tapped) {
                      cardInstance.tapped = true;
                      animateCardTap(mesh, cardInstance);
                      emitGameAction('card:tap', { cardId: cardInstance.id, tapped: true });
                    }
                    this.enterTargetSelection(cardInstance, mesh);
                  }}>
                  &#9876; Attack
                </button>
                <button type="button" className={menuCls} style={{ color: '#c45050' }} onMouseEnter={menuHover} onMouseLeave={menuLeave}
                  onClick={() => { this.setState({ contextMenu: null }); this.startPathMode(cardInstance, mesh, 'attack'); }}>
                  &#9876; Move &amp; Attack <span className="ml-auto text-[10px] opacity-60">{steps} step{steps !== 1 ? 's' : ''}</span>
                </button>
                {divider}
              </>
            );
          })()}
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.tapCard(cardInstance, mesh)}>
            {cardInstance.tapped ? 'Untap' : 'Tap'}
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.flipCard(cardInstance, mesh)}>
            Flip {cardInstance.faceDown ? '(face up)' : '(face down)'}
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendToHand(cardInstance)}>
            Send to hand
          </button>
          {divider}
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendCardToPile(cardInstance, 'Cemetery')}>
            Send to Cemetery
          </button>
          {divider}
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Put into pile</div>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendCardToPile(cardInstance, 'Spellbook', true)}>
            Spellbook (shuffle)
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendCardToPile(cardInstance, 'Spellbook', false)}>
            Spellbook (bottom)
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendCardToPile(cardInstance, 'Atlas', true)}>
            Atlas (shuffle)
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendCardToPile(cardInstance, 'Atlas', false)}>
            Atlas (bottom)
          </button>
          {!cardInstance.isSite && cardInstance._gridCol != null ? (() => {
            const cellCards = this.getCardsInCell(cardInstance._gridCol, cardInstance._gridRow);
            const hasUncarriedArtifacts = cellCards.some(({ cardInstance: ci }) =>
              ci.type === 'Artifact' && ci.id !== cardInstance.id && !ci._carriedBy
            );
            const hasCarried = cardInstance.carriedArtifacts && cardInstance.carriedArtifacts.length > 0;
            if (!hasUncarriedArtifacts && !hasCarried) return null;
            return (
              <>
                {divider}
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Artifacts</div>
                {hasUncarriedArtifacts ? (
                  <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.pickUpArtifacts(cardInstance)}>
                    Pick Up Artifacts
                  </button>
                ) : null}
                {hasCarried ? (
                  <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.dropArtifacts(cardInstance)}>
                    Drop Artifacts ({cardInstance.carriedArtifacts.length})
                  </button>
                ) : null}
              </>
            );
          })() : null}
          {/* Level options (Burrow / Submerge) */}
          {(() => {
            const abilities = this.getCardAbilities(cardInstance);
            const levelOpts = abilities ? getLevelOptions(abilities, cardInstance._level || LEVELS.SURFACE) : [];
            if (levelOpts.length === 0) return null;
            return (
              <>
                {divider}
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Level</div>
                {levelOpts.map((opt) => (
                  <button key={opt.level} type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave}
                    onClick={() => this.changeCardLevel(cardInstance, opt.level)}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </>
            );
          })()}
          {divider}
          <button type="button" className={menuCls} style={{ color: '#c45050' }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.deleteCard(cardInstance)}>
            Delete
          </button>
        </div>
      );
    }

    if (contextMenu.type === 'pile') {
      const { pile } = contextMenu;
      return (
        <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
          <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>{pile.name} ({pile.cards.length} cards)</div>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => { this.drawCard(pile.id); this.setState({ contextMenu: null }); }}>
            Draw card
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => { this.shufflePileAction(pile); }}>
            Shuffle
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => { this.setState({ searchPile: pile, searchQuery: '', contextMenu: null }); }}>
            Search
          </button>
          {divider}
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => {
            if (pile.cards.length > 0) {
              const card = pile.cards[pile.cards.length - 1];
              pile.cards.pop();
              this.addToHand(card);
              this.setState({ contextMenu: null });
              this.updatePileMeshes();
            } else {
              this.setState({ contextMenu: null });
            }
          }}>
            Draw to hand
          </button>
        </div>
      );
    }

    if (contextMenu.type === 'handcard') {
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
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendHandCardToPile(cardInstance, 'Spellbook', true)}>
            Spellbook (shuffle)
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendHandCardToPile(cardInstance, 'Spellbook', false)}>
            Spellbook (bottom)
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendHandCardToPile(cardInstance, 'Atlas', true)}>
            Atlas (shuffle)
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendHandCardToPile(cardInstance, 'Atlas', false)}>
            Atlas (bottom)
          </button>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.sendHandCardToPile(cardInstance, 'Cemetery', false)}>
            Send to Cemetery
          </button>
        </div>
      );
    }

    if (contextMenu.type === 'token') {
      return (
        <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
          <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>Token</div>
          <button type="button" className={menuCls} style={{ color: '#c45050' }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.deleteToken(contextMenu.tokenInstance)}>
            Delete
          </button>
        </div>
      );
    }

    if (contextMenu.type === 'dice') {
      const di = contextMenu.diceInstance;
      const maxVal = DICE_CONFIGS[di.dieType]?.faces || 6;
      return (
        <div style={{ ...menuStyle, ...POPOVER_STYLE }} className="min-w-48 overflow-hidden p-1 text-sm">
          <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>{di.dieType.toUpperCase()} — showing {di.value}</div>
          <button type="button" className={menuCls} style={{ color: TEXT_BODY }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => { this.rollDice(di); this.setState({ contextMenu: null }); }}>
            Roll
          </button>
          <div className="px-3 py-1 text-[10px] font-semibold mt-1" style={SECTION_HEADER_STYLE}>Set Value</div>
          <div className="flex flex-wrap gap-1 px-2 pb-1.5">
            {Array.from({ length: maxVal }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                type="button"
                className="size-7 rounded-md text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors"
                style={v === di.value
                  ? { background: `${GOLD} 0.25)`, color: TEXT_PRIMARY, border: `1px solid ${GOLD} 0.4)` }
                  : { color: TEXT_BODY }
                }
                onMouseEnter={(e) => { if (v !== di.value) e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                onMouseLeave={(e) => { if (v !== di.value) e.currentTarget.style.background = 'transparent'; }}
                onClick={() => this.setDiceValue(di, v)}
              >
                {v}
              </button>
            ))}
          </div>
          <button type="button" className={menuCls} style={{ color: '#c45050' }} onMouseEnter={menuHover} onMouseLeave={menuLeave} onClick={() => this.deleteDice(di)}>
            Delete
          </button>
        </div>
      );
    }

    return null;
  }

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
        imageUrl={inspectedCard.imageUrl}
        foiling={inspectedCard.foiling}
        onClose={() => this.setState({ inspectedCard: null })}
      />
    );
  }

  renderPileSearch() {
    const { searchPile, searchQuery } = this.state;
    if (!searchPile) return null;

    const query = searchQuery.toLowerCase();
    const filtered = query
      ? searchPile.cards.filter((c) => c.name.toLowerCase().includes(query))
      : searchPile.cards;

    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => this.setState({ searchPile: null, searchQuery: '' })}>
        <div className="relative w-[600px] max-h-[80vh] flex flex-col" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.25)`, borderRadius: '12px', boxShadow: '0 0 60px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
          <FourCorners radius={12} />
          <div className="flex items-center gap-3 p-4" style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}>
            <h2 className="text-lg font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>{searchPile.name}</h2>
            <span className="text-sm" style={{ color: TEXT_MUTED }}>{searchPile.cards.length} cards</span>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="search"
                placeholder="Search cards..."
                value={searchQuery}
                onInput={(e) => this.setState({ searchQuery: e.target.value })}
                className="px-3 py-1.5 text-sm outline-none"
                style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
                autoFocus
              />
              <button
                type="button"
                className="px-3 py-1.5 text-sm cursor-pointer transition-all"
                style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                onClick={() => this.setState({ searchPile: null, searchQuery: '' })}
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: TEXT_MUTED }}>
                {query ? 'No cards match your search' : 'Pile is empty'}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {filtered.map((card) => (
                  <div key={card.id} className="group relative cursor-pointer rounded-lg overflow-hidden transition-colors" style={{ border: `1px solid ${GOLD} 0.12)` }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.4)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.12)`; }}
                  >
                    <img src={card.imageUrl} alt={card.name} className={cn('w-full object-cover', card.isSite ? 'aspect-[88.9/63.5]' : 'aspect-[63.5/88.9]')} />
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-full p-2 flex gap-1">
                        <button
                          type="button"
                          className="flex-1 rounded px-2 py-1 text-[10px] font-medium cursor-pointer transition-colors"
                          style={{ background: `${GOLD} 0.2)`, color: TEXT_PRIMARY }}
                          onClick={() => this.takeCardFromPile(searchPile, card)}
                        >
                          To hand
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded px-2 py-1 text-[10px] font-medium cursor-pointer transition-colors"
                          style={{ background: `${GOLD} 0.2)`, color: TEXT_PRIMARY }}
                          onClick={() => {
                            const idx = searchPile.cards.indexOf(card);
                            if (idx !== -1) searchPile.cards.splice(idx, 1);
                            card.x = 0; card.z = 0;
                            this.addCardToTable(card);
                            this.setState((state) => ({ searchPile: searchPile.cards.length === 0 ? null : state.searchPile }));
                            this.updatePileMeshes();
                          }}
                        >
                          To field
                        </button>
                      </div>
                    </div>
                    <div className="absolute top-1 left-1 right-1 truncate text-[9px] font-medium drop-shadow-md" style={{ color: TEXT_PRIMARY }}>{card.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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

              {/* Spawn config */}
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors" style={{ color: TEXT_BODY }} onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} onClick={() => { this.toggleSpawnEditor(); this.setState({ showGameMenu: false }); }}>
                {this.state.isPlacingSpawns ? 'Done Placing' : 'Set Spawn Points'}
              </button>

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

          {this.renderContextMenu()}

          {/* Waiting for opponent defense/intercept */}
          {this.state.waitingForDefense ? (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 flex items-center gap-3" style={{ ...POPOVER_STYLE, borderRadius: '10px', border: `1px solid ${GOLD} 0.3)` }}>
              <div className="size-3 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>Waiting for opponent to respond...</span>
            </div>
          ) : null}

          {/* Defend Prompt */}
          {this.state.defendPrompt ? (() => {
            const dp = this.state.defendPrompt;
            const selectedCount = dp.selectedDefenders.size;
            return (
              <div className="absolute bottom-0 left-0 right-0 z-[60]" style={{ background: 'linear-gradient(to top, rgba(8,6,4,0.95) 0%, rgba(8,6,4,0.85) 70%, transparent 100%)' }}>
                <div className="max-w-2xl mx-auto px-6 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="size-2.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-sm font-bold" style={{ color: '#c45050' }}>ATTACK DECLARED</span>
                  </div>
                  <p className="text-sm mb-3" style={{ color: TEXT_BODY }}>
                    <span style={{ color: TEXT_PRIMARY }}>{dp.attackerName}</span> is attacking your <span style={{ color: TEXT_PRIMARY }}>{dp.targetName}</span>! Click adjacent units on the board to assign defenders, or pass.
                  </p>
                  {selectedCount > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[...dp.selectedDefenders].map((defId) => {
                        const mesh = this.meshes.get(defId);
                        const name = mesh?.userData?.cardInstance?.name || defId;
                        return (
                          <span key={defId} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer" style={{ background: `rgba(34,204,68,0.15)`, border: '1px solid rgba(34,204,68,0.3)', color: '#6fd87a' }} onClick={() => this.toggleDefender(defId)}>
                            {name} &times;
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: TEXT_MUTED }}>
                      <input
                        type="checkbox"
                        checked={dp.keepOriginalTarget}
                        onChange={(e) => this.setState((s) => ({ defendPrompt: { ...s.defendPrompt, keepOriginalTarget: e.target.checked } }))}
                        className="accent-amber-500"
                      />
                      <span className="text-xs">Keep {dp.targetName} in fight</span>
                    </label>
                    <div className="flex-1" />
                    <button
                      type="button"
                      className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer"
                      style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                      onClick={this.passDefend}
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer disabled:opacity-40"
                      style={{ ...GOLD_BTN, borderRadius: '6px' }}
                      disabled={selectedCount === 0}
                      onClick={this.submitDefendResponse}
                    >
                      Defend ({selectedCount})
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : null}

          {/* Intercept Prompt */}
          {this.state.interceptPrompt ? (() => {
            const ip = this.state.interceptPrompt;
            const selectedCount = ip.selectedInterceptors.size;
            return (
              <div className="absolute bottom-0 left-0 right-0 z-[60]" style={{ background: 'linear-gradient(to top, rgba(8,6,4,0.95) 0%, rgba(8,6,4,0.85) 70%, transparent 100%)' }}>
                <div className="max-w-2xl mx-auto px-6 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="size-2.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-sm font-bold" style={{ color: ACCENT_GOLD }}>ENEMY ARRIVED</span>
                  </div>
                  <p className="text-sm mb-3" style={{ color: TEXT_BODY }}>
                    <span style={{ color: TEXT_PRIMARY }}>{ip.arrivedCardName}</span> has moved into your territory! Click units on the board to intercept, or pass.
                  </p>
                  {selectedCount > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[...ip.selectedInterceptors].map((icId) => {
                        const mesh = this.meshes.get(icId);
                        const name = mesh?.userData?.cardInstance?.name || icId;
                        return (
                          <span key={icId} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer" style={{ background: `rgba(34,204,68,0.15)`, border: '1px solid rgba(34,204,68,0.3)', color: '#6fd87a' }} onClick={() => this.toggleInterceptor(icId)}>
                            {name} &times;
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <div className="flex-1" />
                    <button
                      type="button"
                      className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer"
                      style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                      onClick={this.passIntercept}
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer disabled:opacity-40"
                      style={{ ...GOLD_BTN, borderRadius: '6px' }}
                      disabled={selectedCount === 0}
                      onClick={this.submitInterceptResponse}
                    >
                      Intercept ({selectedCount})
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : null}

          {/* Life & Mana HUD */}
          {(() => {
            const localPlayer = this.state.isHost ? 'p1' : 'p2';
            const isMyTurn = this.state.currentTurn === localPlayer;
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
                  {PLAYERS.map((player) => {
                    const t = this.state.gameState.trackers[player];
                    const isP1 = player === 'p1';
                    const info = isP1 ? this.props.arenaPlayerInfo : this.props.arenaOpponentInfo;
                    const displayName = info?.name || PLAYER_LABELS[player];
                    const avatarUrl = info?.avatarUrl || null;
                    const isActive = this.state.currentTurn === player;
                    return (
                      <div key={player} className="flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 transition-colors" style={isActive ? { background: `${GOLD} 0.08)` } : undefined}>
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover object-top shrink-0" style={{ border: isActive ? `2px solid ${ACCENT_GOLD}` : `1px solid ${GOLD} 0.15)` }} />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] shrink-0" style={isActive ? { background: `${GOLD} 0.15)`, border: `2px solid ${ACCENT_GOLD}`, color: ACCENT_GOLD } : { background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.15)`, color: TEXT_MUTED }}>
                            {isP1 ? '1' : '2'}
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

              <div className="mt-3 mb-2 pt-2 text-[10px] font-semibold uppercase tracking-widest" style={{ borderTop: `1px solid ${GOLD} 0.1)`, ...SECTION_HEADER_STYLE }}>Game Grid</div>

              {!this.state.gridEditMode ? (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer"
                    style={{ color: TEXT_BODY }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => {
                      this.setState({ gridEditMode: 'drag-start', activeSpawnKey: null, trackerEditing: null });
                      this.clearTrackerPreviews();
                      this.hideTrackerCursorPreview();
                    }}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: '#d4a843' }} />
                    <span className="flex-1 text-left">{getGameGrid(this.state.spawnConfig) ? 'Redefine Grid' : 'Define Grid'}</span>
                  </button>
                  {getGameGrid(this.state.spawnConfig) ? (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer"
                        style={{ color: TEXT_BODY }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        onClick={() => {
                          const grid = getGameGrid(this.state.spawnConfig);
                          this.currentEditGrid = JSON.parse(JSON.stringify(grid));
                          this.updateGridVisualization(grid, true);
                          this.setState({ gridEditMode: 'adjust', activeSpawnKey: null, trackerEditing: null });
                          this.clearTrackerPreviews();
                          this.hideTrackerCursorPreview();
                        }}
                      >
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: '#c0a040' }} />
                        <span className="flex-1 text-left">Adjust Grid</span>
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer"
                        style={{ color: '#c45050' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        onClick={() => this.clearGrid()}
                      >
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: '#c45050' }} />
                        <span className="flex-1 text-left">Clear Grid</span>
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {this.state.gridEditMode === 'drag-start' ? (
                <div className="mt-2 text-[10px]" style={{ color: ACCENT_GOLD }}>
                  Click and drag on the table to define the grid area.
                </div>
              ) : null}

              {this.state.gridEditMode === 'drag-end' ? (
                <div className="mt-2 text-[10px]" style={{ color: ACCENT_GOLD }}>
                  Release to set the grid rectangle.
                </div>
              ) : null}

              {this.state.gridEditMode === 'adjust' ? (
                <div className="flex flex-col gap-1">
                  <div className="mt-1 text-[10px]" style={{ color: ACCENT_GOLD }}>
                    Drag handles to adjust the grid. Corners move the boundary, edge and interior handles adjust dividers.
                  </div>
                  <div className="flex gap-1 mt-2">
                    <button
                      type="button"
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                      style={GOLD_BTN}
                      onClick={() => this.acceptGrid()}
                    >
                      Accept Grid
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                      style={BEVELED_BTN}
                      onClick={() => this.cancelGrid()}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {this.renderDeckPicker()}
          {this.renderPileSearch()}
          {this.renderCardInspector()}
          {this.state.showMatchResult && this.props.isRankedMatch ? (
            <ArenaMatchResult
              ref={(ref) => { this.matchResultRef = ref; }}
              matchDurationMinutes={this.state.matchStartTime ? Math.round((Date.now() - this.state.matchStartTime) / 60000) : 0}
              onProposeWinner={(winner) => {
                emitGameAction('match:propose', { winner });
              }}
              onRejectProposal={() => {
                emitGameAction('match:reject', {});
              }}
              onListenForProposal={(handler) => {
                this.matchResultProposalHandler = handler;
                // If a proposal arrived before the component mounted, deliver it now
                if (this.pendingMatchProposal) {
                  handler(this.pendingMatchProposal);
                  this.pendingMatchProposal = null;
                }
              }}
              onRewardsApplied={(reward) => {
                emitGameAction('match:confirmed', { winner: reward.won ? 'me' : 'opponent' });
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
                  className={cn(
                    'absolute pointer-events-auto cursor-grab active:cursor-grabbing card-mask',
                    isFoilFinish(card.foiling) && FOIL_OVERLAY_CLASSES
                  )}
                  data-foil={isFoilFinish(card.foiling) ? card.foiling : undefined}
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
                    overflow: 'hidden',
                    zIndex,
                    transformOrigin: 'bottom center',
                    transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    transform: `translateX(calc(-50% + ${x}px)) translateY(${y - (card.isSite ? 30 : 0)}px) rotate(${rotation + (card.isSite ? 90 : 0)}deg) scale(${scale})`,
                    borderRadius: '8px',
                  }}
                >
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="w-full h-full object-cover rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                    draggable={false}
                  />
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
                <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]" draggable={false} />
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
                overflow: 'hidden',
                zIndex,
                transformOrigin: 'bottom center',
                transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px) rotate(${rotation}deg) scale(${scale})`,
              }}
            >
              <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)]" draggable={false} />
            </div>
          );
        })}
      </div>
    );
  }
}
