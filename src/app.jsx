import { Component, createRef } from 'preact';
import './app.css';
import { toast } from 'sonner';
import ArchiveCardRow from './components/ArchiveCardRow';
import CardList from './components/CardList';
import LoadingIndicator from './components/LoadingIndicator';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader } from './components/ui/card';
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from './components/ui/context-menu';
import {
  IconChevronRight,
  IconClose,
  IconSave,
  IconSearch,
  IconSparkles,
  IconTrash,
} from './components/ui/icons';
import { Input } from './components/ui/input';
import { Select } from './components/ui/select';
import { Toaster } from './components/ui/sonner';
import { cn } from './lib/utils';
import { buildSorceryArchiveSetOptions, getSorcerySetName, sorceryCardMatchesSetFilter } from './utils/sorcery/sets';
import { resolveAppHotkey } from './utils/hotkeys';
import {
  selectPrintingNewestMeeting300,
  selectPrintingNewestMeeting300Static,
} from './utils/imageQuality';
import { deleteSavedDeckById, listSavedDecks, loadSavedDeckById, saveSavedDeck } from './utils/deckStorageApi';
import { createSavedDeckCardIndex, restoreSavedDeckCards } from './utils/savedDeckRestore';
import {
  applyThemePreference,
  getStoredThemePreference,
  persistThemePreference,
  THEME_PREFERENCES,
} from './utils/themePreference';
import { getLocalApiOrigin } from './utils/localApi';
import { getDesktopWorkspaceColumns, getResponsiveWorkspaceVars, getViewportWidth } from './utils/workspaceLayout';
import { loadSorceryCardsWithSource } from './utils/sorcery/cardsApi';
import { parseSorceryImportText, isStandaloneCuriosaDeckUrl } from './utils/sorcery/importInput';
import { importFromCuriosaUrl } from './utils/sorcery/curiosaApi';
import SorceryDeckMetricsPanel from './components/SorceryDeckMetricsPanel';
import GameBoard from './components/GameBoard';
import SessionLobby from './components/SessionLobby';
import ArenaHub from './components/ArenaHub';
import ArenaStarterPicker from './components/ArenaStarterPicker';
import ArenaStore from './components/ArenaStore';
import AuctionHouse from './components/AuctionHouse';
import ArenaPackOpening from './components/ArenaPackOpening';
import { loadArenaProfile, saveArenaProfile } from './utils/arena/profileApi';
import { playMusic, stopMusic } from './utils/arena/musicManager';
import { createDefaultProfile, CURRENCY, isArenaDebugMode } from './utils/arena/profileDefaults';
import { checkAchievements, getAchievement } from './utils/arena/achievements';
import { buildOwnedMap, buildUsedMap, getAvailableQuantity } from './utils/arena/collectionUtils';
import { generatePack } from './utils/arena/packGenerator';
import { resolveStarterDeck } from './utils/arena/starterDecks';
import ArenaMatchmaking from './components/ArenaMatchmaking';
import ArenaDeckSelect from './components/ArenaDeckSelect';
import ArenaUsernamePrompt from './components/ArenaUsernamePrompt';
import { registerPlayer, clearQueueState, joinQueue, leaveQueue, pollQueueStatus, reportMatchResult, deleteAccount } from './utils/arena/matchmakingApi';
import { formatRank, TIER_COLORS } from './utils/arena/rankUtils';

function normalizeText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isEditableTarget(target) {
  if (!target || typeof target !== 'object') {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function getCardsReadyLabel(count) {
  return `${count} ready`;
}

function getPersistentPrintingId(printing) {
  return printing?._source_printing_id || printing?.unique_id || null;
}

function resolvePreferredPrintingStatic(card) {
  if (!card) {
    return null;
  }

  if (card.printings?.length === 1) {
    return card.printings[0];
  }

  return (
    selectPrintingNewestMeeting300Static(card) ||
    card.printings?.[card.printings.length - 1] ||
    card.printings?.[0] ||
    null
  );
}

function serializeChosenCardEntry(entry) {
  const cardId = entry?.card?.unique_id;
  const printingId = getPersistentPrintingId(entry?.printing);

  if (!cardId || !printingId) {
    return null;
  }

  const serializedEntry = {
    cardId,
    cardName: entry.card.name,
    printingId,
    isSideboard: Boolean(entry?.isSideboard || entry?.zone === 'collection'),
  };

  return serializedEntry;
}

function resolveDeckPreviewImageUrl(printing) {
  const imageUrl = printing?.image_url || '';
  const persistedImageUrl = printing?._persisted_image_url || '';
  const sourceImageUrl = printing?._source_image_url || '';

  if (typeof imageUrl === 'string' && imageUrl.startsWith('blob:')) {
    return persistedImageUrl || sourceImageUrl;
  }

  return persistedImageUrl || imageUrl || sourceImageUrl || '';
}

function SorceryElementIcon({ element, className = 'size-3.5' }) {
  const triangles = {
    Water: { points: '6,1 11,10 1,10', line: null, color: '#01FFFF' },
    Earth: { points: '6,1 11,10 1,10', line: [2.5, 7, 9.5, 7], color: '#CFA572' },
    Fire: { points: '6,11 1,2 11,2', line: null, color: '#FF5F00' },
    Air: { points: '6,11 1,2 11,2', line: [2.5, 5, 9.5, 5], color: '#A0BADB' },
  };

  const t = triangles[element];
  if (!t) return null;

  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke={t.color} strokeWidth="1.5" strokeLinejoin="round">
      <polygon points={t.points} />
      {t.line ? <line x1={t.line[0]} y1={t.line[1]} x2={t.line[2]} y2={t.line[3]} /> : null}
    </svg>
  );
}

function matchesSorceryDeckFilter(filter, entry) {
  if (filter.id === 'collection') {
    return entry?.zone === 'collection';
  }

  if (entry?.zone === 'collection') {
    return false;
  }

  if (filter.id === 'all') {
    return true;
  }

  if (filter.id === 'spellbook') {
    const zone = entry?.zone || '';
    const type = entry?.card?.type || '';
    return zone === 'spellbook' || (zone !== 'atlas' && zone !== 'avatar' && type !== 'Site' && type !== 'Avatar');
  }

  if (filter.id === 'atlas') {
    return entry?.zone === 'atlas' || entry?.card?.type === 'Site';
  }

  return true;
}

function matchesSorceryTypeFilter(typeFilter, entry) {
  if (!typeFilter || typeFilter === 'all') {
    return true;
  }

  const selected = SORCERY_TYPE_FILTERS.find((f) => f.id === typeFilter);
  if (!selected?.type) {
    return true;
  }

  return entry?.card?.type === selected.type;
}

function matchesSorceryElementFilter(elementFilter, entry) {
  if (!elementFilter || elementFilter === 'all') {
    return true;
  }

  const selectedFilter = SORCERY_ELEMENT_FILTERS.find((f) => f.id === elementFilter);
  if (!selectedFilter?.element) {
    return true;
  }

  const elements = (entry?.card?.elements || []).map((el) => el?.name || el?.id || '');
  return elements.includes(selectedFilter.element);
}

const SORCERY_DECK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'spellbook', label: 'Spellbook' },
  { id: 'atlas', label: 'Atlas' },
  { id: 'collection', label: 'Collection' },
];

const SORCERY_TYPE_FILTERS = [
  { id: 'all', label: 'All types' },
  { id: 'minion', label: 'Minion', type: 'Minion' },
  { id: 'magic', label: 'Magic', type: 'Magic' },
  { id: 'aura', label: 'Aura', type: 'Aura' },
  { id: 'artifact', label: 'Artifact', type: 'Artifact' },
];

const SORCERY_ELEMENT_FILTERS = [
  { id: 'all', label: 'All elements', element: null, icon: null },
  { id: 'water', label: 'Water', element: 'Water', icon: () => <SorceryElementIcon element="Water" /> },
  { id: 'earth', label: 'Earth', element: 'Earth', icon: () => <SorceryElementIcon element="Earth" /> },
  { id: 'fire', label: 'Fire', element: 'Fire', icon: () => <SorceryElementIcon element="Fire" /> },
  { id: 'air', label: 'Air', element: 'Air', icon: () => <SorceryElementIcon element="Air" /> },
];

const SORCERY_ARCHIVE_CARD_TYPE_ORDER = ['Minion', 'Magic', 'Aura', 'Artifact', 'Site', 'Avatar'];

const LEFT_PANEL_TABS = [
  { id: 'archive', label: 'Archive', icon: IconSearch, shortcut: '1' },
  { id: 'saved', label: 'Decks', icon: IconSave, shortcut: '2' },
  { id: 'metrics', label: 'Metrics', icon: IconSparkles, shortcut: '3' },
];

const SORCERY_DECK_FORMATS = [
  { id: 'constructed', label: 'Constructed' },
];

const CARD_PREVIEW_ANIMATION_MS = 260;

function matchesArchiveRarityFilter(filter, card, setFilter = 'all') {
  if (!filter || filter === 'all') {
    return true;
  }

  return filterArchivePrintings(card, setFilter, filter).length > 0;
}

function filterArchivePrintings(card, setFilter = 'all', rarityFilter = 'all') {
  const printings = Array.isArray(card?.printings) ? card.printings : [];

  return printings.filter(
    (printing) =>
      sorceryCardMatchesSetFilter(printing, setFilter) &&
      matchesArchivePrintingRarityFilter(rarityFilter, printing)
  );
}

function matchesArchivePrintingRarityFilter(filter, printing) {
  if (!filter || filter === 'all') {
    return true;
  }

  const rarity = printing?.rarity || 'Unknown';
  return rarity === filter;
}

function getArchiveVisiblePrintings(card, setFilter = 'all', rarityFilter = 'all') {
  const printings = Array.isArray(card?.printings) ? card.printings : [];
  const filteredPrintings = filterArchivePrintings(card, setFilter, rarityFilter);
  return filteredPrintings.length > 0 ? filteredPrintings : printings;
}

function getSorceryArchiveCardTypes(card) {
  const types = Array.isArray(card?.types) ? card.types : [];
  return types.map((t) => String(t || '').trim()).filter(Boolean);
}

function matchesArchiveTypeFilter(filter, card) {
  if (!filter || filter === 'all') {
    return true;
  }

  return getSorceryArchiveCardTypes(card).includes(filter);
}

function buildArchiveFilterOptions(labels, allLabel, orderMap = null) {
  const uniqueLabels = [...new Set(labels.filter(Boolean))].sort((left, right) => {
    if (orderMap) {
      const leftRank = orderMap[left] ?? Number.MAX_SAFE_INTEGER;
      const rightRank = orderMap[right] ?? Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }

    return left.localeCompare(right);
  });

  return [
    { value: 'all', label: allLabel },
    ...uniqueLabels.map((label) => ({ value: label, label })),
  ];
}

function buildArchiveCardTypeOptions(cards = []) {
  const orderList = SORCERY_ARCHIVE_CARD_TYPE_ORDER;
  return buildArchiveFilterOptions(
    (Array.isArray(cards) ? cards : []).flatMap((card) => getSorceryArchiveCardTypes(card)),
    'All card types',
    Object.fromEntries(orderList.map((label, index) => [label, index + 1]))
  );
}

function buildArchiveRarityOptions(cards = []) {
  return buildArchiveFilterOptions(
    (Array.isArray(cards) ? cards : []).flatMap((card) =>
      (Array.isArray(card?.printings) ? card.printings : []).map((printing) => printing?.rarity || 'Unknown')
    ),
    'All rarities'
  );
}

function hasActiveArchiveBrowseFilters(filters) {
  return (
    filters.archiveSetFilter !== 'all' ||
    filters.archiveCardTypeFilter !== 'all' ||
    filters.archiveRarityFilter !== 'all' ||
    filters.archiveElementFilter !== 'all'
  );
}

export default class App extends Component {
  constructor() {
    super();

    this.state = {
      isGameBoardOpen: false,
      arenaProfile: null,
      arenaLoading: true,
      arenaView: 'hub',
      arenaOpenedPack: null,
      arenaLastSetKey: null,
      arenaPendingPacks: [],
      arenaEditDeck: null,
      isArenaMatch: false,
      isRankedMatch: false,
      arenaMatchmaking: false,
      arenaMatchmakingOpponent: null,
      arenaMatchId: null,
      arenaSelectedDeckId: null,
      isArenaCollectionMode: false,
      sessionMode: null,
      sessionId: null,
      roomCode: null,
      sorceryCards: null,
      sorceryCardsLoadSource: '',
      sorceryElementFilter: 'all',
      sorceryTypeFilter: 'all',
      archiveQuery: '',
      archiveCardTypeFilter: 'all',
      archiveElementFilter: 'all',
      archiveRarityFilter: 'all',
      archiveSetFilter: 'all',
      currentDeckName: '',
      currentSavedDeckId: '',
      savedDeckSearchQuery: '',
      searchResultCards: [],
      chosenCards: [],
      savedDecks: [],
      loading: true,
      loadingMessage: 'Loading...',
      loadingDetail: '',
      isSavedDecksLoading: true,
      isSavingDeck: false,
      savedDecksError: '',
      deckFilter: 'all',
      leftPanelTab: 'archive',
      isDeckMenuOpen: false,
      isCloseDeckDialogOpen: false,
      isSaveDialogOpen: false,
      saveDialogName: '',
      pendingCloseAfterSave: false,
      selectedDeckEntryIndices: [],
      previewedArchiveCard: null,
      previewedDeckEntryIndex: null,
      previewedDeckEntryOrigin: null,
      previewedDeckEntryState: null,
      deckSelectionAnchorIndex: null,
      deckCardContextMenu: null,
      isDeckPaneScrolling: false,
      themePreference: getStoredThemePreference(),
      viewportWidth: getViewportWidth(),
    };

    this.arenaQueuePollTimer = null;
    this.deckPaneScrollTimer = null;
    this.cardPreviewTimer = null;
    this.savedDeckCardIndex = null;
    this.savedDeckCardIndexSource = null;
    this.deckMenuContainerRef = createRef();
    this.gameBoardRef = null;
    this.deckMenuRef = createRef();
    this.deckCardContextMenuRef = createRef();
    this.themeMediaQuery = null;
  }

  componentDidMount() {
    document.addEventListener('mousedown', this.handleDocumentMouseDown);
    document.addEventListener('keydown', this.handleDocumentKeyDown);
    document.addEventListener('keyup', this.handleDocumentKeyUp);
    window.addEventListener('resize', this.handleWindowResize);
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.themeMediaQuery.addEventListener('change', this.handleThemeMediaQueryChange);
    }
    applyThemePreference(this.state.themePreference);
    this.refreshSavedDecks();

    // Load sorcery cards then initialize arena
    this.setState({
      loading: true,
      loadingMessage: 'Loading Card Database',
      loadingDetail: 'Fetching card data...',
    });

    loadSorceryCardsWithSource()
      .catch((error) => {
        console.error('Failed to load Sorcery cards:', error);
        return { cards: null, source: '' };
      })
      .then((sorceryResult) => {
        this.setState({
          sorceryCards: sorceryResult.cards,
          sorceryCardsLoadSource: sorceryResult.source,
          loading: false,
          loadingMessage: '',
          loadingDetail: '',
        });

        // Initialize arena mode directly
        this.initArena();
      });
  }

  componentWillUnmount() {
    clearTimeout(this.deckPaneScrollTimer);
    clearTimeout(this.cardPreviewTimer);
    document.removeEventListener('mousedown', this.handleDocumentMouseDown);
    document.removeEventListener('keydown', this.handleDocumentKeyDown);
    document.removeEventListener('keyup', this.handleDocumentKeyUp);
    window.removeEventListener('resize', this.handleWindowResize);
    this.themeMediaQuery?.removeEventListener('change', this.handleThemeMediaQueryChange);
  }

  componentDidUpdate(_prevProps, prevState) {
    if (!this.state.arenaLoading) {
      const view = this.state.arenaView;
      const prevView = prevState.arenaView;
      const justLoaded = prevState.arenaLoading && !this.state.arenaLoading;

      if ((view === 'hub' && (prevView !== 'hub' || justLoaded))) {
        playMusic('arena-hub', { fadeInDuration: 3000 });
      }
      if (this.state.isArenaCollectionMode && !prevState.isArenaCollectionMode) {
        playMusic('arena-deckbuilder', { fadeInDuration: 3000 });
      }
    }
  }

  handleWindowResize = () => {
    const viewportWidth = getViewportWidth();

    this.setState((state) => (state.viewportWidth === viewportWidth ? null : { viewportWidth }));
  };

  refreshSavedDecks = async () => {
    this.setState({ isSavedDecksLoading: true, savedDecksError: '' });

    try {
      const savedDecks = await listSavedDecks('sorcery');
      this.setState({ savedDecks, isSavedDecksLoading: false });
    } catch (error) {
      console.error('Failed to load saved decks:', error);
      this.setState({
        savedDecks: [],
        isSavedDecksLoading: false,
        savedDecksError: error?.message || 'Failed to load saved decks',
      });
    }
  };

  initArena = async () => {
    this.setState({ arenaLoading: true, arenaView: 'hub' });
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});

    if (!this.state.sorceryCards) {
      try {
        const { cards, source } = await loadSorceryCardsWithSource();
        this.setState({ sorceryCards: cards, sorceryCardsLoadSource: source });
      } catch (error) {
        console.error('Failed to load sorcery cards for arena:', error);
      }
    }

    try {
      let profile = await loadArenaProfile();
      if (!profile) {
        profile = createDefaultProfile();
        await saveArenaProfile(profile);
      }
      if (profile.starterDeck && profile.collection.length === 0 && this.state.sorceryCards) {
        const { STARTER_DECKS } = await import('./utils/arena/starterDecks');
        const starterDeck = STARTER_DECKS.find((d) => d.id === profile.starterDeck);
        if (starterDeck) {
          const resolvedCards = resolveStarterDeck(starterDeck, this.state.sorceryCards);
          const collection = [];
          for (const card of resolvedCards) {
            const existing = collection.find((c) => c.cardId === card.cardId && c.printingId === card.printingId);
            if (existing) existing.quantity++;
            else collection.push({ cardId: card.cardId, printingId: card.printingId, quantity: 1 });
          }
          profile = { ...profile, collection, decks: [{ id: `deck-${Date.now()}`, name: starterDeck.name, cards: resolvedCards }] };
          await saveArenaProfile(profile).catch(() => {});
        }
      }
      const profileWithAchievements = this.processAchievements(profile);
      if (profileWithAchievements !== profile) {
        await saveArenaProfile(profileWithAchievements).catch(() => {});
      }
      this.setState({ arenaProfile: profileWithAchievements, arenaLoading: false });
      playMusic('arena-hub', { fadeInDuration: 3000, volume: 0.3 });
    } catch (error) {
      console.error('Failed to load arena profile:', error);
      // Show arena flow anyway; login system will handle this in Task 4
      this.setState({ arenaLoading: false });
    }
  };

  getArenaAvatarUrl = (cardId) => {
    if (!cardId || !this.state.sorceryCards) return null;
    const card = this.state.sorceryCards.find((c) => c.unique_id === cardId);
    return card?.printings?.[0]?.image_url || null;
  };

  getArenaDecksForGameBoard = () => {
    const decks = this.state.arenaProfile?.decks || [];
    return decks.map((d) => ({
      id: d.id,
      name: d.name,
      cards: d.cards || [],
      cardCount: d.cards?.length || 0,
      format: 'constructed',
      previewUrl: d.previewUrl || null,
    }));
  };

  updateArenaName = async (name) => {
    const { arenaProfile } = this.state;
    if (!arenaProfile) return;
    const updatedProfile = { ...arenaProfile, name };
    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch((e) => console.error('Failed to save profile:', e));
  };

  updateArenaAvatar = async (cardId) => {
    const { arenaProfile } = this.state;
    if (!arenaProfile) return;
    const updatedProfile = { ...arenaProfile, profileAvatar: cardId };
    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch((e) => console.error('Failed to save profile:', e));
  };

  resetArenaProfile = async () => {
    const { arenaProfile } = this.state;
    if (arenaProfile?.serverToken) {
      await deleteAccount(arenaProfile.serverToken).catch((e) => console.error('Failed to delete server account:', e));
    }
    const profile = createDefaultProfile();
    this.setState({ arenaProfile: profile });
    await saveArenaProfile(profile).catch((e) => console.error('Failed to save profile:', e));
  };

  registerArenaUsername = async (username) => {
    const { arenaProfile } = this.state;
    const result = await registerPlayer(arenaProfile.id, username);
    const updatedProfile = {
      ...arenaProfile,
      name: username,
      serverToken: result.token,
      serverRegistered: true,
      rank: result.rank,
    };
    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch((e) => console.error('Failed to save profile:', e));
  };

  startMatchmaking = () => {
    this.setState({ arenaView: 'deck-select' });
  };

  confirmDeckAndQueue = async (deckId) => {
    const { arenaProfile } = this.state;
    if (!arenaProfile?.serverToken) return;

    this._matchRewardApplied = false;
    this.setState({ arenaSelectedDeckId: deckId, arenaMatchmaking: true, arenaMatchmakingOpponent: null, arenaView: 'matchmaking' });

    try {
      await clearQueueState(arenaProfile.serverToken).catch(() => {});
      await joinQueue(arenaProfile.serverToken);
      this.arenaQueuePollTimer = setInterval(() => this.pollMatchmaking(), 2000);
    } catch (error) {
      console.error('Failed to join queue:', error);
      this.setState({ arenaMatchmaking: false, arenaView: 'hub', arenaSelectedDeckId: null });
    }
  };

  pollMatchmaking = async () => {
    const { arenaProfile } = this.state;
    if (!arenaProfile?.serverToken) return;

    try {
      const result = await pollQueueStatus(arenaProfile.serverToken);
      if (result.status === 'matched') {
        clearInterval(this.arenaQueuePollTimer);
        this.arenaQueuePollTimer = null;
        const opp = result.opponent || {};
        const opponentAvatarUrl = this.getArenaAvatarUrl(opp.profileAvatar);
        this.setState({
          arenaMatchmakingOpponent: { ...opp, name: opp.name || opp.username || opp.displayName || 'Opponent', avatarUrl: opponentAvatarUrl },
          arenaMatchId: result.matchId,
        });
        playMusic('arena-match', { fadeInDuration: 3000 });
        const delay = result.isHost ? 1500 : 4000;
        setTimeout(() => {
          this.setState({
            arenaMatchmaking: false,
            arenaView: 'hub',
            isGameBoardOpen: true,
            isArenaMatch: true,
            isRankedMatch: true,
            sessionMode: result.isHost ? 'new' : 'join',
            roomCode: result.roomCode,
          });
        }, delay);
      }
    } catch (error) {
      console.error('Queue poll error:', error);
    }
  };

  cancelMatchmaking = async () => {
    const { arenaProfile } = this.state;
    clearInterval(this.arenaQueuePollTimer);
    this.arenaQueuePollTimer = null;

    if (arenaProfile?.serverToken) {
      await leaveQueue(arenaProfile.serverToken).catch(() => {});
    }

    this.setState({ arenaMatchmaking: false, arenaView: 'hub', arenaMatchmakingOpponent: null });
  };

  handleStarterChosen = async (deck) => {
    const { arenaProfile, sorceryCards } = this.state;
    if (!sorceryCards || sorceryCards.length === 0) {
      console.error('Cannot choose starter deck: sorcery cards not loaded');
      return;
    }
    const resolvedCards = resolveStarterDeck(deck, sorceryCards);
    const cardIndex = new Map();
    for (const c of sorceryCards) cardIndex.set(c.unique_id, c);

    const collection = [];
    for (const card of resolvedCards) {
      const existing = collection.find((c) => c.cardId === card.cardId && c.printingId === card.printingId);
      if (existing) {
        existing.quantity++;
      } else {
        collection.push({ cardId: card.cardId, printingId: card.printingId, quantity: 1 });
      }
    }

    const deckId = `deck-${Date.now()}`;
    const previewCards = [];
    const seen = new Set();
    for (const entry of resolvedCards) {
      if (seen.has(entry.cardId)) continue;
      const card = cardIndex.get(entry.cardId);
      const imageUrl = card?.printings?.[0]?.image_url;
      if (imageUrl) {
        seen.add(entry.cardId);
        previewCards.push({ name: card.name, imageUrl });
        if (previewCards.length >= 10) break;
      }
    }

    let previewUrl = null;
    try {
      const savedSummary = await saveSavedDeck({
        id: deckId,
        name: deck.name,
        format: 'constructed',
        cards: resolvedCards.map((c) => ({ cardId: c.cardId, cardName: cardIndex.get(c.cardId)?.name || '', printingId: c.printingId, isSideboard: false })),
        previewCards,
      }, 'sorcery');
      previewUrl = savedSummary.previewUrl || null;
    } catch (e) {
      console.warn('Failed to save starter deck for preview:', e);
    }

    const avatarCard = resolvedCards.find((c) => {
      const card = cardIndex.get(c.cardId);
      return card?.type === 'Avatar';
    });

    const updatedProfile = {
      ...arenaProfile,
      starterDeck: deck.id,
      profileAvatar: avatarCard?.cardId || null,
      collection,
      decks: [{ id: deckId, name: deck.name, cards: resolvedCards, previewUrl }],
    };

    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch((e) => console.error('Failed to save profile:', e));
  };

  handleArenaPlayMatch = () => {
    playMusic('arena-match', { fadeInDuration: 3000 });
    this.setState({ isGameBoardOpen: true, isArenaMatch: true, isRankedMatch: false });
  };

  processAchievements = (profile) => {
    const newlyUnlocked = checkAchievements(profile, this.state.sorceryCards);
    if (newlyUnlocked.length === 0) return profile;

    let bonusCoins = 0;
    for (const id of newlyUnlocked) {
      const achievement = getAchievement(id);
      if (achievement) {
        bonusCoins += achievement.coins || 0;
        toast.success(`Achievement Unlocked: ${achievement.icon} ${achievement.name}`, {
          description: `${achievement.description} (+${achievement.coins} coins)`,
          duration: 5000,
        });
      }
    }

    return {
      ...profile,
      achievements: [...(profile.achievements || []), ...newlyUnlocked],
      coins: profile.coins + bonusCoins,
    };
  };

  handleMatchReward = async (reward) => {
    if (this._matchRewardApplied) return;
    this._matchRewardApplied = true;

    const { arenaProfile } = this.state;
    if (!arenaProfile) return;

    const opp = this.state.arenaMatchmakingOpponent;
    const opponentName = opp?.name || opp?.username || opp?.displayName || 'Opponent';

    const updatedProfile = {
      ...arenaProfile,
      coins: arenaProfile.coins + reward.coins,
      xp: arenaProfile.xp + reward.xp,
      matchHistory: [
        {
          date: new Date().toISOString(),
          opponentName,
          won: reward.won,
          coinsEarned: reward.coins,
          xpEarned: reward.xp,
          durationMinutes: Math.round(reward.xp / 10),
        },
        ...arenaProfile.matchHistory,
      ],
    };

    const withAchievements = this.processAchievements(updatedProfile);
    this.setState({ arenaProfile: withAchievements });
    await saveArenaProfile(withAchievements).catch((e) => console.error('Failed to save profile:', e));

    const { arenaMatchId } = this.state;
    if (arenaProfile.serverToken && arenaMatchId) {
      try {
        const result = await reportMatchResult(arenaProfile.serverToken, arenaMatchId, reward.won ? 'me' : 'opponent');
        if (result.status === 'resolved') {
          this.setState((state) => ({
            arenaProfile: { ...state.arenaProfile, rank: { tier: result.newTier, division: result.newDivision, lp: result.newLp } },
          }));
          await saveArenaProfile({ ...updatedProfile, rank: { tier: result.newTier, division: result.newDivision, lp: result.newLp } }).catch(() => {});
        }
      } catch (error) {
        console.error('Failed to report match result to server:', error);
      }
    }
  };

  openArenaStore = () => {
    playMusic('arena-store', { fadeInDuration: 3000 });
    this.setState({ arenaView: 'store' });
  };

  openAuctionHouse = () => {
    this.setState({ arenaView: 'auction-house' });
  };

  buyArenaPack = (setKey, quantity = 1) => {
    const debug = isArenaDebugMode();
    const totalCost = quantity * CURRENCY.PACK_PRICE;

    const newPacks = [];
    for (let i = 0; i < quantity; i++) {
      newPacks.push(generatePack(this.state.sorceryCards, setKey));
    }

    this.setState((state) => {
      const { arenaProfile, arenaPendingPacks } = state;
      if (!debug && arenaProfile.coins < totalCost) return null;

      return {
        arenaProfile: { ...arenaProfile, coins: debug ? arenaProfile.coins : arenaProfile.coins - totalCost },
        arenaPendingPacks: [...(arenaPendingPacks || []), ...newPacks],
      };
    }, () => {
      try { const base = getLocalApiOrigin(); const a = new Audio(`${base}/game-assets/snd-purchase-pack.mp3`); a.volume = 0.6; a.play().catch(() => {}); } catch {}
      saveArenaProfile(this.state.arenaProfile).catch((e) => console.error('Failed to save profile:', e));
    });
  };

  openNextPack = () => {
    const { arenaPendingPacks } = this.state;
    if (!arenaPendingPacks || arenaPendingPacks.length === 0) return;

    const nextPack = arenaPendingPacks[0];
    const remaining = arenaPendingPacks.slice(1);

    this.setState({
      arenaView: 'pack-opening',
      arenaOpenedPack: nextPack,
      arenaPendingPacks: remaining,
    });
  };

  pickPackFromSet = (setKey) => {
    const { arenaPendingPacks, arenaOpenedPack } = this.state;
    const allPacks = [arenaOpenedPack, ...(arenaPendingPacks || [])];
    const targetIdx = allPacks.findIndex((p) => p.setKey === setKey);
    if (targetIdx < 0) return;

    const targetPack = allPacks[targetIdx];
    const remaining = allPacks.filter((_, i) => i !== targetIdx);

    this.setState({
      arenaOpenedPack: targetPack,
      arenaPendingPacks: remaining,
    });
  };

  openFromSet = (setKey) => {
    const { arenaPendingPacks, arenaOpenedPack, arenaProfile } = this.state;
    const allPacks = [arenaOpenedPack, ...(arenaPendingPacks || [])].filter(Boolean);
    const targetIdx = allPacks.findIndex((p) => p.setKey === setKey);
    if (targetIdx < 0) return;

    const targetPack = allPacks[targetIdx];
    const remaining = allPacks.filter((_, i) => i !== targetIdx);

    const updatedProfile = { ...arenaProfile };
    for (const entry of targetPack.cards) {
      if (!entry.card) continue;
      const cardId = entry.card.unique_id;
      const printingId = entry.printing?.unique_id || entry.card.printings?.[0]?.unique_id || '';
      const existing = updatedProfile.collection.find((c) => c.cardId === cardId && c.printingId === printingId);
      if (existing) existing.quantity++;
      else updatedProfile.collection.push({ cardId, printingId, quantity: 1 });
    }

    this.setState({
      arenaProfile: updatedProfile,
      arenaOpenedPack: targetPack,
      arenaPendingPacks: remaining,
      arenaAutoOpenPack: true,
    });
    saveArenaProfile(updatedProfile).catch(() => {});
  };

  handlePackOpened = () => {
    const { arenaOpenedPack, arenaProfile } = this.state;
    if (!arenaOpenedPack) return;

    const updatedProfile = { ...arenaProfile };
    for (const entry of arenaOpenedPack.cards) {
      if (!entry.card) continue;
      const cardId = entry.card.unique_id;
      const printingId = entry.printing?.unique_id || entry.card.printings?.[0]?.unique_id || '';
      const existing = updatedProfile.collection.find((c) => c.cardId === cardId && c.printingId === printingId);
      if (existing) existing.quantity++;
      else updatedProfile.collection.push({ cardId, printingId, quantity: 1 });
    }

    updatedProfile.packsOpened = (updatedProfile.packsOpened || 0) + 1;
    if (!updatedProfile.packsOpenedBySet) updatedProfile.packsOpenedBySet = {};
    const setKey = arenaOpenedPack.setKey || 'unknown';
    updatedProfile.packsOpenedBySet[setKey] = (updatedProfile.packsOpenedBySet[setKey] || 0) + 1;

    const withAchievements = this.processAchievements(updatedProfile);
    this.setState({ arenaProfile: withAchievements });
    saveArenaProfile(withAchievements).catch(() => {});
  };

  handlePackDone = () => {
    this.setState({ arenaView: 'store', arenaOpenedPack: null });
  };

  handleOpenAnother = () => {
    this.openNextPack();
  };

  openArenaDeckBuilder = () => {
    playMusic('arena-deckbuilder', { fadeInDuration: 3000 });
    this.setState({
      isArenaCollectionMode: true,
      leftPanelTab: 'archive',
      chosenCards: [],
      currentDeckName: '',
      currentSavedDeckId: '',
      savedDecksError: '',
    });
  };

  saveArenaDeck = async (deck) => {
    const { arenaProfile } = this.state;

    const cleanedDecks = arenaProfile.decks.filter(
      (d) => d.id !== deck.id && d.name !== deck.name,
    );
    const excludeIds = arenaProfile.decks
      .filter((d) => d.id === deck.id || d.name === deck.name)
      .map((d) => d.id);

    const usedMap = buildUsedMap(
      arenaProfile.decks.filter((d) => !excludeIds.includes(d.id)),
    );
    const ownedMap = buildOwnedMap(arenaProfile.collection);
    const needed = new Map();
    for (const card of deck.cards) {
      needed.set(card.cardId, (needed.get(card.cardId) || 0) + 1);
    }
    for (const [cardId, count] of needed) {
      const available = getAvailableQuantity(cardId, ownedMap, usedMap);
      if (count > available) {
        const cardName = this.state.sorceryCards?.find((c) => c.unique_id === cardId)?.name || cardId;
        this.setState({ savedDecksError: `Not enough copies of "${cardName}" available` });
        return;
      }
    }

    cleanedDecks.push(deck);
    const updatedProfile = { ...arenaProfile, decks: cleanedDecks };
    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch((e) => console.error('Failed to save profile:', e));
  };

  getActiveCards = () => {
    const cards = this.state.sorceryCards;
    if (this.state.isArenaCollectionMode && this.state.arenaProfile?.collection && Array.isArray(cards)) {
      const ownedMap = buildOwnedMap(this.state.arenaProfile.collection);
      return cards.filter((card) => (ownedMap.get(card.unique_id) || 0) > 0);
    }
    return cards;
  };

  handleArchiveQueryChange = (value) => {
    clearTimeout(this.timer);
    this.setState({ archiveQuery: value });
    this.timer = setTimeout(() => this.searchCards(value), 220);
  };

  handleArchiveSetFilterChange = (nextValue) => {
    this.setState({ archiveSetFilter: nextValue }, () => {
      this.searchCards(
        this.state.archiveQuery,
        nextValue,
        this.state.archiveCardTypeFilter,
        this.state.archiveRarityFilter,
        this.state.archiveElementFilter
      );
    });
  };

  handleArchiveCardTypeFilterChange = (nextValue) => {
    this.setState({ archiveCardTypeFilter: nextValue }, () => {
      this.searchCards(
        this.state.archiveQuery,
        this.state.archiveSetFilter,
        nextValue,
        this.state.archiveRarityFilter,
        this.state.archiveElementFilter
      );
    });
  };

  handleArchiveRarityFilterChange = (nextValue) => {
    this.setState({ archiveRarityFilter: nextValue }, () => {
      this.searchCards(
        this.state.archiveQuery,
        this.state.archiveSetFilter,
        this.state.archiveCardTypeFilter,
        nextValue,
        this.state.archiveElementFilter
      );
    });
  };

  handleArchiveElementFilterChange = (nextValue) => {
    this.setState({ archiveElementFilter: nextValue }, () => {
      this.searchCards(
        this.state.archiveQuery,
        this.state.archiveSetFilter,
        this.state.archiveCardTypeFilter,
        this.state.archiveRarityFilter,
        nextValue
      );
    });
  };

  searchCards = (
    name,
    setFilter = this.state.archiveSetFilter,
    cardTypeFilter = this.state.archiveCardTypeFilter,
    rarityFilter = this.state.archiveRarityFilter,
    elementFilter = this.state.archiveElementFilter
  ) => {
    const normalizedName = normalizeText(name);
    const activeCards = this.getActiveCards();

    if (!Array.isArray(activeCards)) {
      this.setState({ searchResultCards: [] });
      return;
    }

    const isBrowsingFilteredArchive = hasActiveArchiveBrowseFilters({
      archiveSetFilter: setFilter,
      archiveCardTypeFilter: cardTypeFilter,
      archiveRarityFilter: rarityFilter,
      archiveElementFilter: elementFilter,
    });

    if (!isBrowsingFilteredArchive && normalizedName.length < 3) {
      this.setState({ searchResultCards: [] });
      return;
    }

    const foundCards = activeCards.filter(
      (card) => {
        const matchingVisiblePrintings = filterArchivePrintings(card, setFilter, rarityFilter);

        if (
          matchingVisiblePrintings.length === 0 ||
          !matchesArchiveTypeFilter(cardTypeFilter, card) ||
          !matchesSorceryElementFilter(elementFilter, { card })
        ) {
          return false;
        }

        if (normalizedName.length === 0) {
          return true;
        }

        return normalizeText(card.name).includes(normalizedName);
      }
    );
    this.setState({ searchResultCards: foundCards });
  };

  resolvePreferredPrinting = async (card) => {
    if (!card) {
      return null;
    }

    return (
      (await selectPrintingNewestMeeting300(card)) ||
      resolvePreferredPrintingStatic(card)
    );
  };

  getSavedDeckCardIndex = (cards = this.getActiveCards()) => {
    if (!Array.isArray(cards)) {
      return null;
    }

    if (this.savedDeckCardIndexSource !== cards) {
      this.savedDeckCardIndex = createSavedDeckCardIndex(cards);
      this.savedDeckCardIndexSource = cards;
    }

    return this.savedDeckCardIndex;
  };

  addCardToChosenCards = async (card, printing = null) => {
    const resolvedPrinting = printing || (await this.resolvePreferredPrinting(card));

    if (!resolvedPrinting) {
      return;
    }

    if (this.state.isArenaCollectionMode && this.state.arenaProfile) {
      const { collection, decks } = this.state.arenaProfile;
      const ownedMap = buildOwnedMap(collection);
      const usedMap = buildUsedMap(decks, this.state.currentSavedDeckId);
      const available = getAvailableQuantity(card.unique_id, ownedMap, usedMap);
      const inCurrentDeck = this.state.chosenCards.filter((c) => c.card.unique_id === card.unique_id).length;
      if (inCurrentDeck >= available) return;
    }

    const newEntry = { card, printing: resolvedPrinting, isSideboard: false };
    if (card._sorceryCategory) {
      newEntry.zone = card._sorceryCategory.toLowerCase();
      if (newEntry.zone === 'spell') newEntry.zone = 'spellbook';
    }
    this.setState((state) => ({
      chosenCards: [...state.chosenCards, newEntry],
    }));
  };

  removeCardFromChosenCards = (indexOrCard, maybeCard, maybePrinting) => {
    this.setState((state) => ({
      chosenCards:
        typeof indexOrCard === 'number'
          ? state.chosenCards.filter((_, index) => index !== indexOrCard)
          : state.chosenCards.filter(
              (chosenCard) =>
                !(
                  chosenCard.card.unique_id === indexOrCard.unique_id &&
                  chosenCard.printing.unique_id === maybeCard.unique_id
                )
            ),
      selectedDeckEntryIndices: [],
      previewedDeckEntryIndex: null,
      deckSelectionAnchorIndex: null,
      deckCardContextMenu: null,
    }));
  };

  changeCardPrintingFromChosenCards = (index, printing) => {
    this.setState((state) => {
      const newList = [...state.chosenCards];
      newList[index] = {
        ...newList[index],
        printing,
      };
      return { chosenCards: newList };
    });
  };

  handleDocumentMouseDown = (event) => {
    const menuContainerNode = this.deckMenuContainerRef.current;
    const menuNode = this.deckMenuRef.current;
    const deckCardContextMenuNode = this.deckCardContextMenuRef.current;
    const isInsideDeckActionsMenu =
      menuContainerNode && menuNode && (menuContainerNode.contains(event.target) || menuNode.contains(event.target));
    const isInsideDeckCardContextMenu = deckCardContextMenuNode?.contains(event.target);
    const isInsideDeckCard = Boolean(event.target?.closest?.('[role="option"]'));
    const isInsideArchiveCard = Boolean(event.target?.closest?.('[data-card-preview-trigger="archive"]'));
    const activeArchiveCard = document.activeElement?.closest?.('[data-card-preview-trigger="archive"]');
    const nextState = {};

    if (this.state.isDeckMenuOpen && !isInsideDeckActionsMenu) {
      nextState.isDeckMenuOpen = false;
    }

    if (this.state.deckCardContextMenu && !isInsideDeckCardContextMenu) {
      nextState.deckCardContextMenu = null;
    }

    if (
      this.state.previewedDeckEntryIndex === null &&
      this.state.selectedDeckEntryIndices.length > 0 &&
      !isInsideDeckCard &&
      !isInsideDeckCardContextMenu
    ) {
      nextState.selectedDeckEntryIndices = [];
      nextState.deckSelectionAnchorIndex = null;
    }

    if (this.state.previewedDeckEntryIndex === null && !this.state.previewedArchiveCard && activeArchiveCard && !isInsideArchiveCard) {
      activeArchiveCard.blur?.();
    }

    if (Object.keys(nextState).length > 0) {
      this.setState(nextState);
    }
  };

  isMetricsTabEnabled = (state = this.state) => Boolean(state.currentSavedDeckId) || state.chosenCards.length > 0;

  isLeftPanelTabEnabled = (leftPanelTab, state = this.state) => {
    return leftPanelTab !== 'metrics' || this.isMetricsTabEnabled(state);
  };

  setLeftPanelTab = (leftPanelTab, callback) => {
    if (!this.isLeftPanelTabEnabled(leftPanelTab)) {
      return;
    }

    this.setState({ leftPanelTab }, callback);
  };

  setDeckFilter = (deckFilter) => {
    this.setState({
      deckFilter,
      selectedDeckEntryIndices: [],
      previewedDeckEntryIndex: null,
      deckSelectionAnchorIndex: null,
      deckCardContextMenu: null,
    });
  };

  handleDocumentKeyUp = (event) => {
    if (this.state.isGameBoardOpen && 'wasdWASD'.includes(event.key)) {
      this.gameBoardRef?.scene?.setKeyHeld(event.key, false);
    }
  };

  handleDocumentKeyDown = (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      if (this.state.isGameBoardOpen) {
        this.gameBoardRef?.passTurn();
      } else {
        this.setState({ isGameBoardOpen: true });
      }
      return;
    }

    if (this.state.isGameBoardOpen) {
      this.gameBoardRef?.handleGameHotkey(event);
      return;
    }

    if (!this.state.isArenaCollectionMode) {
      return;
    }

    const hotkey = resolveAppHotkey({
      event,
      state: this.state,
      isEditableTarget,
      leftPanelTabs: LEFT_PANEL_TABS,
      deckFilters: SORCERY_DECK_FILTERS,
    });

    if (!hotkey) {
      return;
    }

    if (hotkey.preventDefault) {
      event.preventDefault();
    }

    if (hotkey.kind === 'close-save-dialog') {
      if (this.state.isSavingDeck) {
        return;
      }

      this.setState({
        isSaveDialogOpen: false,
        isCloseDeckDialogOpen: false,
      });
      return;
    }

    if (hotkey.kind === 'close-card-preview') {
      this.closeCardPreview();
      return;
    }

    if (hotkey.kind === 'close-deck-card-context-menu') {
      this.setState({
        deckCardContextMenu: null,
        selectedDeckEntryIndices: [],
        previewedDeckEntryIndex: null,
        deckSelectionAnchorIndex: null,
      });
      return;
    }

    if (hotkey.kind === 'focus-archive-search') {
      this.setLeftPanelTab('archive', () => {
        document.getElementById('archive-search')?.focus();
      });
      return;
    }

    if (hotkey.kind === 'toggle-card-preview') {
      this.toggleSelectedCardPreview();
      return;
    }

    if (hotkey.kind === 'navigate-card-preview') {
      this.navigateCardPreview(hotkey.direction);
      return;
    }

    if (hotkey.kind === 'set-left-panel-tab') {
      this.setLeftPanelTab(hotkey.leftPanelTabId);
      return;
    }

    if (hotkey.kind === 'cycle-deck-filter') {
      this.setDeckFilter(hotkey.deckFilterId);
    }
  };

  handleThemeMediaQueryChange = () => {
    if (this.state.themePreference === 'system') {
      applyThemePreference('system');
    }
  };

  clearChosenCards = () => {
    this.setState({
      chosenCards: [],
      currentDeckName: '',
      currentSavedDeckId: '',
      isDeckMenuOpen: false,
      isCloseDeckDialogOpen: false,
      isSaveDialogOpen: false,
      saveDialogName: '',
      pendingCloseAfterSave: false,
      selectedDeckEntryIndices: [],
      previewedDeckEntryIndex: null,
      deckSelectionAnchorIndex: null,
      deckCardContextMenu: null,
    });
  };

  setThemePreference = (themePreference) => {
    persistThemePreference(themePreference);
    applyThemePreference(themePreference);
    this.setState({ themePreference });
  };

  handleDeckPaneScroll = () => {
    clearTimeout(this.deckPaneScrollTimer);

    if (!this.state.isDeckPaneScrolling) {
      this.setState({ isDeckPaneScrolling: true });
    }

    this.deckPaneScrollTimer = setTimeout(() => {
      this.setState({ isDeckPaneScrolling: false });
    }, 700);
  };

  getVisibleDeckEntries = (state = this.state) => {
    const activeFilter = SORCERY_DECK_FILTERS.find((filter) => filter.id === state.deckFilter) || SORCERY_DECK_FILTERS[0];

    let entries = state.chosenCards
      .map((entry, index) => ({ ...entry, entryIndex: index }))
      .filter((entry) => matchesSorceryDeckFilter(activeFilter, entry));

    if (state.sorceryElementFilter !== 'all') {
      entries = entries.filter((entry) => matchesSorceryElementFilter(state.sorceryElementFilter, entry));
    }
    if (state.sorceryTypeFilter !== 'all') {
      entries = entries.filter((entry) => matchesSorceryTypeFilter(state.sorceryTypeFilter, entry));
    }

    return entries;
  };

  handleDeckCardSelect = (entryIndex, event) => {
    this.setState((state) => {
      const visibleEntryIndices = this.getVisibleDeckEntries(state).map((entry) => entry.entryIndex);
      const shouldSelectRange =
        Boolean(event?.shiftKey) &&
        state.deckSelectionAnchorIndex !== null &&
        visibleEntryIndices.includes(state.deckSelectionAnchorIndex) &&
        visibleEntryIndices.includes(entryIndex);

      if (shouldSelectRange) {
        const startIndex = visibleEntryIndices.indexOf(state.deckSelectionAnchorIndex);
        const endIndex = visibleEntryIndices.indexOf(entryIndex);
        const [rangeStart, rangeEnd] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

        return {
          selectedDeckEntryIndices: visibleEntryIndices.slice(rangeStart, rangeEnd + 1),
          deckCardContextMenu: null,
        };
      }

      return {
        selectedDeckEntryIndices: [entryIndex],
        deckSelectionAnchorIndex: entryIndex,
        deckCardContextMenu: null,
      };
    });
  };

  handleDeckCardContextMenu = (entryIndex, event) => {
    event.preventDefault();

    this.setState((state) => {
      const isExistingSelection = state.selectedDeckEntryIndices.includes(entryIndex);

      return {
        selectedDeckEntryIndices: isExistingSelection ? state.selectedDeckEntryIndices : [entryIndex],
        deckSelectionAnchorIndex: isExistingSelection ? state.deckSelectionAnchorIndex ?? entryIndex : entryIndex,
        deckCardContextMenu: {
          x: event.clientX,
          y: event.clientY,
        },
        isDeckMenuOpen: false,
      };
    });
  };

  getSelectedPreviewEntryIndex = (state = this.state) => {
    const selectedEntryIndex = state.selectedDeckEntryIndices?.[0];

    if (!Number.isInteger(selectedEntryIndex) || !state.chosenCards?.[selectedEntryIndex]) {
      return null;
    }

    return selectedEntryIndex;
  };

  getPreviewedDeckEntry = (state = this.state) => {
    const previewedDeckEntryIndex = state.previewedDeckEntryIndex;

    if (!Number.isInteger(previewedDeckEntryIndex)) {
      return null;
    }

    return state.chosenCards?.[previewedDeckEntryIndex] || null;
  };

  getFocusedArchivePreviewEntry = () => {
    const archiveRow = document.activeElement?.closest?.('[data-card-preview-trigger="archive"]');
    const archiveCardId = archiveRow?.getAttribute?.('data-archive-card-id');
    const previewUrl = archiveRow?.getAttribute?.('data-card-preview-url');

    if (!archiveCardId || !previewUrl) {
      return null;
    }

    const card = this.state.searchResultCards.find((entry) => entry?.unique_id === archiveCardId);

    if (!card) {
      return null;
    }

    return {
      card,
      printing: {
        image_url: previewUrl,
      },
    };
  };

  getPreviewedCardEntry = (state = this.state) => state.previewedArchiveCard || this.getPreviewedDeckEntry(state);

  getArchivePreviewRowByCardId = (archiveCardId) =>
    Array.from(document.querySelectorAll('[data-card-preview-trigger="archive"]')).find(
      (node) => node.getAttribute('data-archive-card-id') === archiveCardId
    ) || null;

  focusArchivePreviewRow = (archiveCardId) => {
    this.getArchivePreviewRowByCardId(archiveCardId)?.focus?.();
  };

  getArchivePreviewEntryByCardId = (archiveCardId) => {
    if (!archiveCardId) {
      return null;
    }

    const card = this.state.searchResultCards.find((entry) => entry?.unique_id === archiveCardId);

    if (!card) {
      return null;
    }

    const archiveRow = this.getArchivePreviewRowByCardId(archiveCardId);
    const previewUrl =
      archiveRow?.getAttribute?.('data-card-preview-url') ||
      card?.printings?.[card.printings.length - 1]?.image_url ||
      '';

    if (!previewUrl) {
      return null;
    }

    return {
      card,
      printing: {
        image_url: previewUrl,
      },
    };
  };

  getDeckCardNode = (entryIndex) => document.querySelector(`[data-deck-entry-index="${entryIndex}"]`);

  focusDeckCard = (entryIndex) => {
    this.getDeckCardNode(entryIndex)?.focus?.();
  };

  getFallbackDeckPreviewEntryIndex = (direction, visibleEntries, currentVisibleIndex) => {
    if (currentVisibleIndex === -1) {
      return null;
    }

    if (direction === 'ArrowLeft' || direction === 'ArrowUp') {
      return visibleEntries[currentVisibleIndex - 1]?.entryIndex ?? null;
    }

    if (direction === 'ArrowRight' || direction === 'ArrowDown') {
      return visibleEntries[currentVisibleIndex + 1]?.entryIndex ?? null;
    }

    return null;
  };

  getNextDeckPreviewEntryIndex = (direction) => {
    const visibleEntries = this.getVisibleDeckEntries();
    const currentEntryIndex = this.state.previewedDeckEntryIndex;
    const currentVisibleIndex = visibleEntries.findIndex((entry) => entry.entryIndex === currentEntryIndex);

    if (currentVisibleIndex === -1) {
      return null;
    }

    const currentNode = this.getDeckCardNode(currentEntryIndex);
    const currentRect = currentNode?.getBoundingClientRect?.();
    const hasCurrentRect = Boolean(
      currentRect &&
      (currentRect.width || currentRect.height || currentRect.left || currentRect.top || currentRect.right || currentRect.bottom)
    );

    if (!hasCurrentRect) {
      return this.getFallbackDeckPreviewEntryIndex(direction, visibleEntries, currentVisibleIndex);
    }

    const positionedEntries = visibleEntries
      .map((entry) => {
        const node = this.getDeckCardNode(entry.entryIndex);
        const rect = node?.getBoundingClientRect?.();
        const hasRect = Boolean(rect && (rect.width || rect.height || rect.left || rect.top || rect.right || rect.bottom));

        if (!node || !hasRect) {
          return null;
        }

        return {
          entryIndex: entry.entryIndex,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        };
      })
      .filter(Boolean);

    const currentPosition = positionedEntries.find((entry) => entry.entryIndex === currentEntryIndex);

    if (!currentPosition) {
      return this.getFallbackDeckPreviewEntryIndex(direction, visibleEntries, currentVisibleIndex);
    }

    const axis = direction === 'ArrowLeft' || direction === 'ArrowRight' ? 'horizontal' : 'vertical';
    const directionSign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1;
    const epsilon = 6;
    const candidates = positionedEntries
      .filter((entry) => entry.entryIndex !== currentEntryIndex)
      .map((entry) => {
        const deltaX = entry.centerX - currentPosition.centerX;
        const deltaY = entry.centerY - currentPosition.centerY;
        return {
          entryIndex: entry.entryIndex,
          deltaX,
          deltaY,
          score:
            axis === 'horizontal'
              ? Math.abs(deltaX) + Math.abs(deltaY) * 4
              : Math.abs(deltaY) + Math.abs(deltaX) * 4,
        };
      })
      .filter((entry) =>
        axis === 'horizontal'
          ? directionSign * entry.deltaX > epsilon
          : directionSign * entry.deltaY > epsilon
      )
      .sort((left, right) => left.score - right.score);

    if (candidates.length === 0) {
      return this.getFallbackDeckPreviewEntryIndex(direction, visibleEntries, currentVisibleIndex);
    }

    return candidates[0].entryIndex;
  };

  resolveCardPreviewOrigin = (triggerNode = null) => {
    const originNode = triggerNode || document.activeElement;
    const rect = originNode?.getBoundingClientRect?.();

    if (!rect || typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) {
      return null;
    }

    const originCenterX = rect.left + rect.width / 2;
    const originCenterY = rect.top + rect.height / 2;
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const fromScale = Math.max(0.28, Math.min(0.62, Math.max(rect.width / 720, rect.height / 960)));

    return {
      offsetX: `${originCenterX - viewportCenterX}px`,
      offsetY: `${originCenterY - viewportCenterY}px`,
      fromScale: Number(fromScale.toFixed(3)),
    };
  };

  getCardPreviewMotionStyle = (origin = null) => ({
    '--card-preview-offset-x': origin?.offsetX || '0px',
    '--card-preview-offset-y': origin?.offsetY || '18px',
    '--card-preview-from-scale': origin?.fromScale || 0.82,
  });

  openCardPreview = (previewedDeckEntryIndex) => {
    if (!Number.isInteger(previewedDeckEntryIndex) || !this.state.chosenCards?.[previewedDeckEntryIndex]) {
      return;
    }

    clearTimeout(this.cardPreviewTimer);
    this.cardPreviewTimer = null;

    this.setState({
      previewedArchiveCard: null,
      previewedDeckEntryIndex,
      previewedDeckEntryOrigin: this.resolveCardPreviewOrigin(),
      previewedDeckEntryState: 'open',
      deckCardContextMenu: null,
      isDeckMenuOpen: false,
    });
  };

  openArchiveCardPreview = (previewedArchiveCard) => {
    if (!previewedArchiveCard?.card || !previewedArchiveCard?.printing?.image_url) {
      return;
    }

    clearTimeout(this.cardPreviewTimer);
    this.cardPreviewTimer = null;

    this.setState({
      previewedArchiveCard,
      previewedDeckEntryIndex: null,
      previewedDeckEntryOrigin: this.resolveCardPreviewOrigin(),
      previewedDeckEntryState: 'open',
      deckCardContextMenu: null,
      isDeckMenuOpen: false,
    });
  };

  closeCardPreview = () => {
    if (
      (this.state.previewedDeckEntryIndex === null && !this.state.previewedArchiveCard) ||
      this.state.previewedDeckEntryState === 'closing'
    ) {
      return;
    }

    clearTimeout(this.cardPreviewTimer);
    this.setState({ previewedDeckEntryState: 'closing' });
    this.cardPreviewTimer = setTimeout(() => {
      this.cardPreviewTimer = null;
      this.setState({
        previewedArchiveCard: null,
        previewedDeckEntryIndex: null,
        previewedDeckEntryOrigin: null,
        previewedDeckEntryState: null,
      });
    }, CARD_PREVIEW_ANIMATION_MS);
  };

  toggleSelectedCardPreview = () => {
    const focusedArchivePreviewEntry = this.getFocusedArchivePreviewEntry();
    const selectedPreviewEntryIndex = this.getSelectedPreviewEntryIndex();
    const previewedArchiveCard = this.state.previewedArchiveCard;

    if (focusedArchivePreviewEntry) {
      if (
        previewedArchiveCard &&
        previewedArchiveCard.card?.unique_id === focusedArchivePreviewEntry.card.unique_id &&
        previewedArchiveCard.printing?.image_url === focusedArchivePreviewEntry.printing.image_url &&
        this.state.previewedDeckEntryState !== 'closing'
      ) {
        this.closeCardPreview();
        return;
      }

      this.openArchiveCardPreview(focusedArchivePreviewEntry);
      return;
    }

    if (
      this.state.previewedDeckEntryIndex !== null &&
      selectedPreviewEntryIndex === this.state.previewedDeckEntryIndex &&
      this.state.previewedDeckEntryState !== 'closing'
    ) {
      this.closeCardPreview();
      return;
    }

    if (selectedPreviewEntryIndex === null) {
      this.closeCardPreview();
      return;
    }

    this.openCardPreview(selectedPreviewEntryIndex);
  };

  navigateArchivePreview = (direction) => {
    if (direction !== 'ArrowUp' && direction !== 'ArrowDown') {
      return;
    }

    const currentArchiveCardId = this.state.previewedArchiveCard?.card?.unique_id;
    const currentArchiveIndex = this.state.searchResultCards.findIndex((entry) => entry?.unique_id === currentArchiveCardId);

    if (currentArchiveIndex === -1) {
      return;
    }

    const nextArchiveIndex = direction === 'ArrowUp' ? currentArchiveIndex - 1 : currentArchiveIndex + 1;
    const nextArchiveCard = this.state.searchResultCards[nextArchiveIndex];
    const nextArchivePreviewEntry = nextArchiveCard ? this.getArchivePreviewEntryByCardId(nextArchiveCard.unique_id) : null;

    if (!nextArchivePreviewEntry) {
      return;
    }

    this.setState(
      {
        previewedArchiveCard: nextArchivePreviewEntry,
        previewedDeckEntryIndex: null,
        previewedDeckEntryState: 'open',
      },
      () => {
        this.focusArchivePreviewRow(nextArchiveCard.unique_id);
      }
    );
  };

  navigateDeckPreview = (direction) => {
    const nextDeckEntryIndex = this.getNextDeckPreviewEntryIndex(direction);

    if (!Number.isInteger(nextDeckEntryIndex)) {
      return;
    }

    this.setState(
      {
        selectedDeckEntryIndices: [nextDeckEntryIndex],
        deckSelectionAnchorIndex: nextDeckEntryIndex,
        previewedArchiveCard: null,
        previewedDeckEntryIndex: nextDeckEntryIndex,
        previewedDeckEntryState: 'open',
      },
      () => {
        this.focusDeckCard(nextDeckEntryIndex);
      }
    );
  };

  navigateCardPreview = (direction) => {
    if (this.state.previewedDeckEntryState === 'closing') {
      return;
    }

    if (this.state.previewedArchiveCard) {
      this.navigateArchivePreview(direction);
      return;
    }

    if (this.state.previewedDeckEntryIndex !== null) {
      this.navigateDeckPreview(direction);
    }
  };

  closeDeckCardContextMenu = () => {
    this.setState({ deckCardContextMenu: null });
  };

  removeSelectedCardsFromDeck = () => {
    this.setState((state) => {
      const selectedEntryIndexSet = new Set(state.selectedDeckEntryIndices);

      if (selectedEntryIndexSet.size === 0) {
        return {
          deckCardContextMenu: null,
        };
      }

      return {
        chosenCards: state.chosenCards.filter((_, index) => !selectedEntryIndexSet.has(index)),
        selectedDeckEntryIndices: [],
        previewedDeckEntryIndex: null,
        deckSelectionAnchorIndex: null,
        deckCardContextMenu: null,
      };
    });
  };

  buildDeckSavePayload = (deckName, deckId = '') => {
    const { chosenCards } = this.state;
    const savedCards = chosenCards.map(serializeChosenCardEntry).filter(Boolean);
    const previewCards = (() => {
      const sorted = [...chosenCards].sort((a, b) => {
        const aIsAvatar = a.zone === 'avatar' || a.card?._sorceryCategory === 'Avatar' ? 0 : 1;
        const bIsAvatar = b.zone === 'avatar' || b.card?._sorceryCategory === 'Avatar' ? 0 : 1;
        return aIsAvatar - bIsAvatar;
      });

      const seen = new Set();
      const result = [];
      for (const entry of sorted) {
        const cardId = entry?.card?.unique_id;
        if (!cardId || seen.has(cardId)) continue;
        const imageUrl = resolveDeckPreviewImageUrl(entry?.printing);
        if (!imageUrl) continue;
        seen.add(cardId);
        result.push({ name: entry?.card?.name || '', imageUrl });
        if (result.length >= 10) break;
      }
      return result;
    })();

    if (savedCards.length === 0) {
      return null;
    }

    return {
      ...(deckId ? { id: deckId } : {}),
      name: deckName,
      format: 'constructed',
      cards: savedCards,
      previewCards,
    };
  };

  saveAndCloseCurrentDeck = async () => {
    const {
      chosenCards,
      currentDeckName,
      currentSavedDeckId,
      deckFilter,
      savedDecks,
    } = this.state;

    const previousDeckState = {
      chosenCards,
      currentDeckName,
      currentSavedDeckId,
      deckFilter,
    };

    const nextDeckName = currentDeckName.trim() || `Deck ${savedDecks.length + 1}`;
    const payload =
      chosenCards.length > 0 ? this.buildDeckSavePayload(nextDeckName, currentSavedDeckId) : null;

    this.setState({
      chosenCards: [],
      currentDeckName: '',
      currentSavedDeckId: '',
      deckFilter: 'all',
      isDeckMenuOpen: false,
      isCloseDeckDialogOpen: false,
      pendingCloseAfterSave: false,
      saveDialogName: '',
      selectedDeckEntryIndices: [],
      previewedDeckEntryIndex: null,
      deckSelectionAnchorIndex: null,
      deckCardContextMenu: null,
    });

    if (!payload) {
      return null;
    }

    this.setState({ isSavingDeck: true, savedDecksError: '' });

    try {
      const savedSummary = await saveSavedDeck(payload, 'sorcery');

      this.setState((state) => ({
        isSavingDeck: false,
        savedDecks: [savedSummary, ...state.savedDecks.filter((deck) => deck.id !== savedSummary.id)],
      }));

      return savedSummary;
    } catch (error) {
      console.error('Failed to save and close current deck:', error);
      this.setState({
        ...previousDeckState,
        isSavingDeck: false,
        savedDecksError: error?.message || 'Failed to save current deck',
      });
      throw error;
    }
  };

  saveDeckWithName = async (deckId = '', action = '') => {
    const { chosenCards, savedDecks, saveDialogName } = this.state;

    if (chosenCards.length === 0 || this.state.isSavingDeck) {
      return;
    }

    const deckName = saveDialogName.trim() || (this.state.isArenaCollectionMode
      ? `Arena Deck ${(this.state.arenaProfile?.decks?.length || 0) + 1}`
      : `Deck ${savedDecks.length + 1}`);

    const payload = this.buildDeckSavePayload(deckName, deckId);

    if (!payload) {
      return;
    }

    this.setState({ isSavingDeck: true, savedDecksError: '' });

    try {
      const savedSummary = await saveSavedDeck(payload, 'sorcery');

      if (this.state.isArenaCollectionMode) {
        const arenaId = this.state.currentSavedDeckId || savedSummary.id;
        const arenaDeck = {
          id: arenaId,
          name: savedSummary.name,
          cards: chosenCards.map((entry) => ({ cardId: entry.card.unique_id, printingId: entry.printing?.unique_id || '' })),
          previewUrl: savedSummary.previewUrl || null,
        };
        await this.saveArenaDeck(arenaDeck);
        this.setState({
          isSavingDeck: false, isSaveDialogOpen: false, saveDialogName: '',
          currentSavedDeckId: arenaDeck.id,
          currentDeckName: arenaDeck.name,
          savedDecks: [savedSummary, ...this.state.savedDecks.filter((d) => d.id !== savedSummary.id)],
        });
        return;
      }

      this.setState((state) => ({
        isSavingDeck: false,
        savedDecks: [savedSummary, ...state.savedDecks.filter((deck) => deck.id !== savedSummary.id)],
        currentDeckName: savedSummary.name,
        currentSavedDeckId: savedSummary.id,
        isSaveDialogOpen: false,
        saveDialogName: savedSummary.name,
      }));
    } catch (error) {
      console.error('Failed to save deck:', error);
      this.setState({
        isSavingDeck: false,
        savedDecksError: error?.message || 'Failed to save deck',
      });
    }
  };

  saveCurrentDeck = () => {
    const { chosenCards, currentDeckName, isSavingDeck } = this.state;

    if (chosenCards.length === 0 || isSavingDeck) {
      return;
    }

    this.setState({
      isCloseDeckDialogOpen: false,
      isSaveDialogOpen: true,
      saveDialogName: currentDeckName,
      savedDecksError: '',
    });
  };

  updateCurrentDeck = async () => {
    await this.saveDeckWithName(this.state.currentSavedDeckId, 'update');
  };

  saveDeckAsCopy = async () => {
    await this.saveDeckWithName('', 'copy');
  };

  closeCurrentDeck = async () => {
    const { chosenCards, currentDeckName, currentSavedDeckId, isSavingDeck } = this.state;

    if (chosenCards.length === 0 || isSavingDeck) {
      return;
    }

    if (currentSavedDeckId || currentDeckName.trim()) {
      try {
        await this.saveAndCloseCurrentDeck();
      } catch (error) {
        return;
      }
      return;
    }

    this.setState({
      isDeckMenuOpen: false,
      isCloseDeckDialogOpen: true,
      pendingCloseAfterSave: false,
      savedDecksError: '',
    });
  };

  closeCloseDeckDialog = () => {
    if (this.state.isSavingDeck) {
      return;
    }

    this.setState({ isCloseDeckDialogOpen: false });
  };

  discardDeckAndClose = () => {
    if (this.state.isSavingDeck) {
      return;
    }

    this.clearChosenCards();
  };

  saveDeckBeforeClose = () => {
    const { chosenCards, currentDeckName, isSavingDeck } = this.state;

    if (chosenCards.length === 0 || isSavingDeck) {
      return;
    }

    this.setState({
      isDeckMenuOpen: false,
      isCloseDeckDialogOpen: false,
      isSaveDialogOpen: true,
      saveDialogName: currentDeckName,
      pendingCloseAfterSave: true,
      savedDecksError: '',
    });
  };

  closeSaveDialog = () => {
    if (this.state.isSavingDeck) {
      return;
    }

    this.setState({
      isSaveDialogOpen: false,
      pendingCloseAfterSave: false,
    });
  };

  handleSaveDialogNameChange = (event) => {
    this.setState({ saveDialogName: event.target.value });
  };

  performLoadSavedDeck = async (deckId) => {
    if (!deckId || !Array.isArray(this.state.sorceryCards)) {
      return;
    }

    try {
      const savedDeck = await loadSavedDeckById(deckId, 'sorcery');

      if (!savedDeck) {
        return;
      }

      const activeCards = this.getActiveCards();
      const restoredCards = await restoreSavedDeckCards({
        savedEntries: savedDeck.cards || [],
        cardIndex: this.getSavedDeckCardIndex(activeCards),
        resolvePreferredPrinting: this.resolvePreferredPrinting,
      });

      this.setState({
        sorceryCards: (activeCards || []).map((card) => {
          const restoredCard = restoredCards.find((entry) => entry?.card?.unique_id === card.unique_id)?.card;
          return restoredCard || card;
        }),
        chosenCards: restoredCards,
        currentDeckName: savedDeck.name,
        currentSavedDeckId: savedDeck.id,
        deckFilter: 'all',
        archiveQuery: '',
        searchResultCards: [],
        isDeckMenuOpen: false,
        selectedDeckEntryIndices: [],
        previewedDeckEntryIndex: null,
        deckSelectionAnchorIndex: null,
        deckCardContextMenu: null,
      });
    } catch (error) {
      console.error('Failed to load saved deck:', error);
      this.setState({
        savedDecksError: error?.message || 'Failed to load saved deck',
      });
    }
  };

  loadSavedDeck = async (deckId) => {
    if (!deckId || !Array.isArray(this.getActiveCards())) {
      return;
    }

    const { chosenCards, currentDeckName, currentSavedDeckId, isSavingDeck } = this.state;

    if (isSavingDeck) {
      return;
    }

    const isSwitchingDecks = chosenCards.length > 0 && currentSavedDeckId !== deckId;

    if (isSwitchingDecks) {
      try {
        await this.saveAndCloseCurrentDeck();
      } catch (error) {
        return;
      }
    }

    await this.performLoadSavedDeck(deckId);
  };

  deleteSavedDeck = async (deckId) => {
    if (!deckId) {
      return;
    }

    try {
      await deleteSavedDeckById(deckId, 'sorcery');
      this.setState((state) => ({
        savedDecks: state.savedDecks.filter((deck) => deck.id !== deckId),
        currentSavedDeckId: state.currentSavedDeckId === deckId ? '' : state.currentSavedDeckId,
        currentDeckName: state.currentSavedDeckId === deckId ? '' : state.currentDeckName,
      }));
    } catch (error) {
      console.error('Failed to delete saved deck:', error);
      this.setState({
        savedDecksError: error?.message || 'Failed to delete saved deck',
      });
    }
  };

  loadArenaDeck = (deck) => {
    const sorceryCards = this.state.sorceryCards || [];
    const cardIndex = new Map();
    for (const card of sorceryCards) {
      cardIndex.set(card.unique_id, card);
    }

    const chosenCards = [];
    for (const entry of deck.cards || []) {
      const card = cardIndex.get(entry.cardId);
      if (!card) continue;
      const printing = card.printings?.find((p) => p.unique_id === entry.printingId) || card.printings?.[0];
      if (!printing) continue;

      const newEntry = { card, printing, isSideboard: false };
      if (card._sorceryCategory) {
        newEntry.zone = card._sorceryCategory.toLowerCase();
        if (newEntry.zone === 'spell') newEntry.zone = 'spellbook';
      }
      chosenCards.push(newEntry);
    }

    this.setState({
      chosenCards,
      currentDeckName: deck.name,
      currentSavedDeckId: deck.id,
      saveDialogName: deck.name,
      leftPanelTab: 'archive',
    });
  };

  deleteArenaDeck = async (deckId) => {
    const { arenaProfile } = this.state;
    if (!arenaProfile) return;
    const updatedProfile = {
      ...arenaProfile,
      decks: arenaProfile.decks.filter((d) => d.id !== deckId),
    };
    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch((e) => console.error('Failed to save profile:', e));
  };

  renderSavedDecksContent() {
    const isArena = this.state.isArenaCollectionMode;

    const {
      isSavedDecksLoading,
      isSavingDeck,
      loading,
      savedDeckSearchQuery,
      savedDecks,
      savedDecksError,
    } = this.state;

    const effectiveDecks = isArena ? (this.state.arenaProfile?.decks || []).map((d) => ({
      id: d.id,
      name: d.name,
      cardCount: d.cards?.length || 0,
      format: 'constructed',
      previewUrl: d.previewUrl || null,
      _arenaDeck: d,
    })) : savedDecks;
    const effectiveLoading = isArena ? false : isSavedDecksLoading;
    const effectiveError = isArena ? '' : savedDecksError;
    const normalizedSearch = normalizeText(savedDeckSearchQuery.trim());
    const filteredDecks = effectiveDecks.filter((savedDeck) =>
      normalizedSearch.length === 0 ? true : normalizeText(savedDeck.name).includes(normalizedSearch)
    );

    return (
      <CardContent className="left-pane-panel-content flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div data-testid="saved-decks-controls" className="flex items-center gap-3">
          <Input
            id="saved-deck-search"
            type="search"
            role="searchbox"
            aria-label="Saved deck search"
            value={savedDeckSearchQuery}
            onInput={(e) => this.setState({ savedDeckSearchQuery: e.target.value })}
            placeholder="Search saved decks"
            className="min-w-0 flex-1"
          />

          {isArena ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => this.setState({ chosenCards: [], currentDeckName: '', currentSavedDeckId: '', leftPanelTab: 'archive' })}
            >
              New Deck
            </Button>
          ) : null}
        </div>

        <div className="left-pane-scroll scrollbar-rail-less scrollbar-stable min-h-0 flex-1 overflow-y-auto">
          {effectiveLoading ? (
            <div className="flex h-full min-h-56 items-center justify-center rounded-[16px] border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              Loading saved decks...
            </div>
          ) : effectiveError ? (
            <div className="flex h-full min-h-56 items-center justify-center rounded-[16px] border border-dashed border-destructive/40 bg-destructive/5 px-6 text-center text-sm text-destructive">
              {effectiveError}
            </div>
          ) : effectiveDecks.length === 0 ? (
            <div className="flex h-full min-h-56 items-center justify-center rounded-[16px] border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              {isArena ? 'No arena decks yet' : 'No saved decks yet'}
            </div>
          ) : filteredDecks.length === 0 ? (
            <div className="flex h-full min-h-56 items-center justify-center rounded-[16px] border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              No saved decks match that search
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredDecks.map((savedDeck) => {
                return (
                  <div
                    key={savedDeck.id}
                    data-saved-deck-card={savedDeck.id}
                    className="left-pane-raised-surface overflow-hidden rounded-[16px] border border-border/60 p-3"
                  >
                    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-stretch md:gap-5">
                      <div className="flex min-w-0 flex-col gap-3 md:min-h-[128px]">
                        <div className="min-w-0">
                          <strong className="block min-w-0 truncate text-sm text-card-foreground md:text-base">{savedDeck.name}</strong>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:text-sm">
                            <span>{getCardsReadyLabel(savedDeck.cardCount || 0)}</span>
                            {savedDeck.savedAt ? (
                              <span>{new Date(savedDeck.savedAt).toLocaleDateString()}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center justify-start gap-2 md:mt-auto">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Delete saved deck ${savedDeck.name}`}
                            onClick={() => isArena ? this.deleteArenaDeck(savedDeck.id) : this.deleteSavedDeck(savedDeck.id)}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            data-icon="inline-end"
                            aria-label={`Load deck ${savedDeck.name}`}
                            disabled={!Array.isArray(this.state.sorceryCards) || loading || isSavingDeck}
                            onClick={() => isArena ? this.loadArenaDeck(savedDeck._arenaDeck || savedDeck) : this.loadSavedDeck(savedDeck.id)}
                          >
                            Load
                            <IconChevronRight className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex min-w-0 flex-col items-end justify-end gap-3">
                        <div className="flex w-full items-end justify-end -mb-3 md:-mt-1 md:-mr-3">
                          <div
                            role="group"
                            aria-label={`Preview cards for ${savedDeck.name}`}
                            className="relative h-[128px] w-full max-w-[356px]"
                          >
                            {savedDeck.previewUrl ? (
                              <img
                                src={savedDeck.previewUrl}
                                alt={`Preview for ${savedDeck.name}`}
                                className="block h-full w-full object-cover object-left"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center rounded-[16px] border border-dashed border-border/60 px-3 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground/80">
                                No preview
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    );
  }

  renderArchiveContent() {
    const {
      archiveCardTypeFilter,
      archiveElementFilter,
      archiveQuery,
      archiveRarityFilter,
      archiveSetFilter,
      searchResultCards,
    } = this.state;
    const activeCards = this.getActiveCards();

    let arenaAvailabilityMap = null;
    if (this.state.isArenaCollectionMode && this.state.arenaProfile) {
      const { collection, decks } = this.state.arenaProfile;
      const ownedMap = buildOwnedMap(collection);
      const usedMap = buildUsedMap(decks, this.state.currentSavedDeckId);
      const { chosenCards } = this.state;
      arenaAvailabilityMap = new Map();
      for (const card of searchResultCards) {
        const available = getAvailableQuantity(card.unique_id, ownedMap, usedMap);
        const inDeck = chosenCards.filter((c) => c.card.unique_id === card.unique_id).length;
        const owned = ownedMap.get(card.unique_id) || 0;
        arenaAvailabilityMap.set(card.unique_id, { owned, available, remaining: available - inDeck });
      }
    }

    const archiveSetOptions = buildSorceryArchiveSetOptions(activeCards);
    const archiveCardTypeOptions = buildArchiveCardTypeOptions(activeCards);
    const archiveRarityOptions = buildArchiveRarityOptions(activeCards);
    const shouldShowSearchPrompt =
      !hasActiveArchiveBrowseFilters({
        archiveSetFilter,
        archiveCardTypeFilter,
        archiveRarityFilter,
        archiveElementFilter,
      }) && archiveQuery.trim().length < 3;

    return (
      <CardContent className="left-pane-panel-content flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex flex-col gap-2">
          <div data-testid="archive-search-row" className="flex min-w-0 items-center gap-3">
            <Input
              id="archive-search"
              type="search"
              role="searchbox"
              aria-label="Archive search"
              value={archiveQuery}
              onInput={(event) => this.handleArchiveQueryChange(event.target.value)}
              placeholder="Search cards"
              className="min-w-0 flex-1"
            />

            <Select
              ariaLabel="Archive set filter"
              className="w-44 max-w-[45vw] shrink-0"
              disabled={archiveSetOptions.length <= 1}
              menuAlign="end"
              menuClassName="max-h-[min(24rem,calc(100vh-10rem))] overflow-y-auto overflow-x-hidden scrollbar-rail-less scrollbar-stable"
              menuPreferredWidth={448}
              menuSearchAriaLabel="Search archive sets"
              menuSearchPlaceholder="Search sets"
              noOptionsMessage="No sets match that search"
              onValueChange={this.handleArchiveSetFilterChange}
              options={archiveSetOptions}
              portalMenu
              searchable
              value={archiveSetFilter}
            />
          </div>

          <div data-testid="archive-filter-controls" className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Select
              ariaLabel="Archive card type filter"
              className="w-40 max-w-[40vw] shrink-0"
              disabled={archiveCardTypeOptions.length <= 1}
              onValueChange={this.handleArchiveCardTypeFilterChange}
              options={archiveCardTypeOptions}
              value={archiveCardTypeFilter}
            />

            <Select
              ariaLabel="Archive rarity filter"
              className="w-36 max-w-[40vw] shrink-0"
              disabled={archiveRarityOptions.length <= 1}
              onValueChange={this.handleArchiveRarityFilterChange}
              options={archiveRarityOptions}
              value={archiveRarityFilter}
            />

            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/50 bg-background/50 px-1 h-10">
              {SORCERY_ELEMENT_FILTERS.map((filter) => {
                const isActive = this.state.archiveElementFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-label={filter.label}
                    title={filter.label}
                    className={cn(
                      'h-7 rounded-md px-1.5 transition-colors inline-flex items-center justify-center',
                      isActive ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => this.handleArchiveElementFilterChange(filter.id)}
                  >
                    {filter.icon ? filter.icon() : <span className="text-[10px]">All</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="left-pane-scroll scrollbar-rail-less scrollbar-stable min-h-0 flex-1 overflow-y-auto">
          {shouldShowSearchPrompt ? (
            <div className="flex h-full min-h-56 items-center justify-center rounded-[16px] border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              Type 3+ letters or choose a set
            </div>
          ) : searchResultCards.length > 0 ? (
            <div className="grid gap-3">
              {searchResultCards.map((card) => (
                <ArchiveCardRow
                  key={card.unique_id}
                  addCardToChosenCards={this.addCardToChosenCards}
                  card={card}
                  visiblePrintings={getArchiveVisiblePrintings(card, archiveSetFilter, archiveRarityFilter)}
                  arenaAvailability={arenaAvailabilityMap?.get(card.unique_id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-56 items-center justify-center rounded-[16px] border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              No results
            </div>
          )}
        </div>
      </CardContent>
    );
  }

  renderLeftPanel() {
    const { leftPanelTab } = this.state;

    let panelContent;

    if (leftPanelTab === 'saved') {
      panelContent = this.renderSavedDecksContent();
    } else if (leftPanelTab === 'metrics') {
      panelContent = (
        <CardContent className="left-pane-panel-content left-pane-scroll scrollbar-rail-less scrollbar-stable min-h-0 flex-1 overflow-y-auto p-3">
          <SorceryDeckMetricsPanel chosenCards={this.state.chosenCards} />
        </CardContent>
      );
    } else {
      panelContent = this.renderArchiveContent();
    }

    return (
      <Card className="left-pane-shell workspace-pane no-print flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader className="left-pane-header justify-center pb-3">
          <div className="left-pane-toolbar flex w-full items-center justify-center gap-3">
            <div
              className="left-pane-tabs grid w-full gap-1 rounded-xl border border-border/70 bg-card/70 p-1"
              style={{ gridTemplateColumns: `repeat(${LEFT_PANEL_TABS.length}, minmax(0, 1fr))` }}
            >
              {LEFT_PANEL_TABS.map((tab) => {
                const isActive = leftPanelTab === tab.id;
                const isDisabled = !this.isLeftPanelTabEnabled(tab.id);
                const TabIcon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={isDisabled}
                    className={cn(
                      'grid h-8 w-full min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors',
                      isDisabled
                        ? 'cursor-not-allowed text-muted-foreground/50 opacity-50'
                        : isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    onClick={() => this.setLeftPanelTab(tab.id)}
                  >
                    <span className="flex h-full w-7 items-center justify-center">
                      <TabIcon className="size-3.5 shrink-0" />
                    </span>
                    <span className="truncate text-center">{tab.label}</span>
                    <span className="flex h-full w-7 items-center justify-center">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'left-pane-tab-shortcut inline-flex min-w-5 shrink-0 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                          isDisabled
                            ? 'border-border/60 bg-background/35 text-muted-foreground/60'
                            : isActive
                            ? 'border-primary-foreground/20 bg-primary-foreground/12 text-primary-foreground'
                            : 'border-border/80 bg-background/50 text-muted-foreground'
                        )}
                      >
                        {tab.shortcut}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>

        {panelContent}
      </Card>
    );
  }

  renderDeckPanel() {
    const {
      chosenCards,
      deckCardContextMenu,
      deckFilter,
      isDeckPaneScrolling,
      isSavingDeck,
      loading,
      selectedDeckEntryIndices,
    } = this.state;
    const visibleCards = this.getVisibleDeckEntries();
    const selectedDeckEntries = selectedDeckEntryIndices.map((entryIndex) => chosenCards[entryIndex]).filter(Boolean);
    const selectedDeckEntriesCount = selectedDeckEntries.length;

    return (
      <section
        aria-label="Deck cards panel"
        className="workspace-pane deck-pane flex h-full min-h-0 flex-col rounded-[20px] transition-shadow"
      >
        <div className="flex items-center gap-4 px-1 pb-3 no-print">
          <div className="flex min-w-0 items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-card/80 p-1 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
              {SORCERY_DECK_FILTERS.map((filter) => {
                const count = chosenCards.filter((entry) => matchesSorceryDeckFilter(filter, entry)).length;
                const isActive = deckFilter === filter.id;

                return (
                  <button
                    key={filter.id}
                    type="button"
                    className={cn(
                      'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors',
                      isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    onClick={() => this.setDeckFilter(filter.id)}
                  >
                    <span>{filter.label}</span>
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px]', isActive ? 'bg-primary-foreground/12 text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-10 rounded-xl shadow-[0_12px_28px_rgba(0,0,0,0.18)]"
              aria-label="Save deck"
              title="Save deck"
              disabled={chosenCards.length === 0 || isSavingDeck}
              onClick={this.saveCurrentDeck}
            >
              <IconSave />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-10 rounded-xl shadow-[0_12px_28px_rgba(0,0,0,0.18)]"
              aria-label="Close deck"
              title="Close deck"
              disabled={chosenCards.length === 0 || isSavingDeck}
              onClick={this.closeCurrentDeck}
            >
              <IconClose />
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {this.state.isArenaCollectionMode ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="rounded-xl px-3 shadow-[0_12px_28px_rgba(0,0,0,0.18)]"
                onClick={() => this.setState({ isArenaCollectionMode: false, arenaView: 'hub', chosenCards: [] })}
              >
                Back to Arena
              </Button>
            ) : null}
          </div>
        </div>

        {(() => {
          const mainFilter = SORCERY_DECK_FILTERS.find((f) => f.id === deckFilter) || SORCERY_DECK_FILTERS[0];
          const mainFiltered = chosenCards.filter((entry) => matchesSorceryDeckFilter(mainFilter, entry));
          return (
            <div className="flex items-center gap-2 px-1 pb-2 no-print">
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/50 p-0.5">
                {SORCERY_TYPE_FILTERS.map((filter) => {
                  const isActive = this.state.sorceryTypeFilter === filter.id;
                  const count = filter.id === 'all' ? mainFiltered.length : mainFiltered.filter((e) => e?.card?.type === filter.type).length;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-label={filter.label}
                      className={cn(
                        'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors',
                        isActive ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => this.setState({ sorceryTypeFilter: filter.id })}
                    >
                      <span>{filter.label}</span>
                      <span className={cn('text-[9px] tabular-nums', isActive ? 'text-foreground/60' : 'text-muted-foreground/60')}>{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/50 p-0.5">
                {SORCERY_ELEMENT_FILTERS.map((filter) => {
                  const isActive = this.state.sorceryElementFilter === filter.id;
                  const count = filter.id === 'all'
                    ? mainFiltered.length
                    : mainFiltered.filter((e) => (e?.card?.elements || []).some((el) => (el?.name || el) === filter.element)).length;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-label={filter.label}
                      title={`${filter.label} (${count})`}
                      className={cn(
                        'h-6 rounded-md px-1 transition-colors inline-flex items-center justify-center gap-1',
                        isActive ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => this.setState({ sorceryElementFilter: filter.id })}
                    >
                      {filter.icon ? filter.icon() : <span className="size-2 rounded-full bg-foreground/40 ring-1 ring-border/70 ring-inset" />}
                      <span className={cn('text-[9px] tabular-nums', isActive ? 'text-foreground/60' : 'text-muted-foreground/60')}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div
          aria-label="Deck cards list"
          className={cn(
            'deck-pane-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pr-1',
            'scrollbar-rail-less',
            'scrollbar-stable',
            isDeckPaneScrolling && 'is-scrolling'
          )}
          onScroll={this.handleDeckPaneScroll}
        >
          {visibleCards.length > 0 ? (
            <CardList
              cards={visibleCards}
              chosenList={true}
              changeCardPrintingFromChosenCards={this.changeCardPrintingFromChosenCards}
              onChosenCardContextMenu={this.handleDeckCardContextMenu}
              onChosenCardSelect={this.handleDeckCardSelect}
              removeCardFromChosenCards={this.removeCardFromChosenCards}
              selectedEntryIndices={selectedDeckEntryIndices}
            />
          ) : null}
        </div>

        <ContextMenuContent
          ariaLabel="Deck card actions"
          onOpenChange={(open) => {
            if (!open) {
              this.closeDeckCardContextMenu();
            }
          }}
          open={Boolean(deckCardContextMenu)}
          position={deckCardContextMenu}
        >
          <div ref={this.deckCardContextMenuRef}>
            {selectedDeckEntriesCount > 0 ? (
              <ContextMenuItem className="text-destructive hover:text-destructive" onClick={this.removeSelectedCardsFromDeck}>
                Delete {selectedDeckEntriesCount} {selectedDeckEntriesCount === 1 ? 'card' : 'cards'} from deck
              </ContextMenuItem>
            ) : null}
          </div>
        </ContextMenuContent>
      </section>
    );
  }

  renderSaveDialog() {
    const {
      currentSavedDeckId,
      isSaveDialogOpen,
      isSavingDeck,
      saveDialogName,
    } = this.state;

    if (!isSaveDialogOpen) {
      return null;
    }

    const isExistingDeck = Boolean(currentSavedDeckId);
    const primaryLabel = isExistingDeck ? 'Update deck' : 'Save deck';

    return (
      <>
        <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm" onClick={this.closeSaveDialog} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Save deck"
            className="w-full max-w-md rounded-[24px] border border-border/70 bg-popover/96 p-5 shadow-[0_32px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-popover-foreground">Save deck</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isExistingDeck
                    ? 'Update the current deck or save a renamed copy.'
                    : 'Choose a name for this deck.'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close save dialog"
                disabled={isSavingDeck}
                onClick={this.closeSaveDialog}
              >
                <IconClose className="size-4" />
              </Button>
            </div>

            <div className="mt-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Deck name</span>
                <Input
                  id="save-deck-name"
                  type="text"
                  aria-label="Deck name"
                  autoFocus
                  value={saveDialogName}
                  onInput={this.handleSaveDialogNameChange}
                  placeholder="Name this deck"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={isSavingDeck} onClick={this.closeSaveDialog}>
                Cancel
              </Button>
              {isExistingDeck && !this.state.isArenaCollectionMode ? (
                <Button type="button" variant="outline" disabled={isSavingDeck} onClick={this.saveDeckAsCopy}>
                  Save as copy
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={isSavingDeck}
                onClick={isExistingDeck ? this.updateCurrentDeck : this.saveDeckAsCopy}
              >
                {primaryLabel}
              </Button>
            </div>
          </section>
        </div>
      </>
    );
  }

  renderCloseDeckDialog() {
    const { isCloseDeckDialogOpen } = this.state;

    if (!isCloseDeckDialogOpen) {
      return null;
    }

    return (
      <>
        <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm" onClick={this.closeCloseDeckDialog} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved changes"
            className="w-full max-w-md rounded-[24px] border border-border/70 bg-popover/96 p-5 shadow-[0_32px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-popover-foreground">Unsaved changes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  These cards are not saved to a deck yet. Save them before clearing the grid, or discard them now.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close unsaved changes dialog"
                onClick={this.closeCloseDeckDialog}
              >
                <IconClose className="size-4" />
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={this.closeCloseDeckDialog}>
                Keep editing
              </Button>
              <Button type="button" variant="destructive" onClick={this.discardDeckAndClose}>
                Discard changes
              </Button>
              <Button type="button" onClick={this.saveDeckBeforeClose}>
                Save as deck
              </Button>
            </div>
          </section>
        </div>
      </>
    );
  }

  renderCardPreviewDialog() {
    const previewedEntry = this.getPreviewedCardEntry();

    if (!previewedEntry) {
      return null;
    }

    const { card, printing } = previewedEntry;
    const previewState = this.state.previewedDeckEntryState || 'open';
    const isClosing = previewState === 'closing';
    const previewMotionStyle = this.getCardPreviewMotionStyle(this.state.previewedDeckEntryOrigin);

    return (
      <>
        <div
          aria-hidden="true"
          className={cn(
            'card-preview-backdrop card-preview-backdrop--blurred fixed inset-0 z-40',
            isClosing && 'is-closing'
          )}
          data-preview-state={previewState}
          onClick={this.closeCardPreview}
        />
        <div className="card-preview-stage fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Card preview"
            data-preview-state={previewState}
            className="card-preview-dialog flex items-center justify-center"
          >
            <div
              className={cn(
                'card-preview-card',
                isClosing && 'is-closing'
              )}
              style={previewMotionStyle}
            >
              <img
                src={printing?.image_url}
                alt={`Preview of ${card.name}`}
                className="card-preview-image h-full w-full object-contain"
              />
            </div>
          </section>
        </div>
      </>
    );
  }

  render() {
    const workspaceStyle = getResponsiveWorkspaceVars(this.state.viewportWidth);
    const workspaceColumns = getDesktopWorkspaceColumns(this.state.viewportWidth);

    // Show the deck builder when in arena collection mode
    const showDeckBuilder = this.state.isArenaCollectionMode && !this.state.isGameBoardOpen;
    // Show arena UI when NOT in deck builder and NOT in game
    const showArena = !this.state.isArenaCollectionMode && !this.state.isGameBoardOpen;

    return (
      <>
        {showDeckBuilder ? (
          <>
            {this.state.loading ? (
              <LoadingIndicator
                message={this.state.loadingMessage}
                detail={this.state.loadingDetail}
              />
            ) : null}

            <main className="app-shell h-dvh overflow-hidden flex flex-col" style={workspaceStyle}>
              <div
                className="workspace-grid grid flex-1 min-h-0 gap-4 xl:grid-cols-[minmax(400px,0.92fr)_minmax(0,1.08fr)]"
                style={workspaceColumns ? { gridTemplateColumns: workspaceColumns } : undefined}
              >
                {this.renderLeftPanel()}
                {this.renderDeckPanel()}
              </div>
            </main>
            {this.renderCloseDeckDialog()}
            {this.renderSaveDialog()}
            {this.renderCardPreviewDialog()}
          </>
        ) : null}
        {this.state.isGameBoardOpen && !this.state.sessionMode ? (
          <SessionLobby
            isArenaMatch={this.state.isRankedMatch}
            onExit={() => {
              const returningToArena = this.state.isArenaMatch;
              this.setState({ isGameBoardOpen: false, isArenaMatch: false, isRankedMatch: false,
                ...(returningToArena ? { arenaView: 'hub' } : {}),
              });
            }}
            onNewSession={() => this.setState({ sessionMode: 'new', sessionId: null })}
            onLoadSession={(id) => this.setState({ sessionMode: 'load', sessionId: id })}
            onJoinSession={(code) => this.setState({ sessionMode: 'join', roomCode: code })}
          />
        ) : null}
        {this.state.isGameBoardOpen && this.state.sessionMode ? (
          <GameBoard
            ref={(ref) => { this.gameBoardRef = ref; }}
            sorceryCards={this.state.sorceryCards}
            savedDecks={this.state.isArenaMatch ? this.getArenaDecksForGameBoard() : this.state.savedDecks}
            sessionMode={this.state.sessionMode}
            sessionId={this.state.sessionId}
            joinRoomCode={this.state.roomCode}
            isArenaMatch={this.state.isArenaMatch}
            isRankedMatch={this.state.isRankedMatch}
            arenaSelectedDeckId={this.state.arenaSelectedDeckId}
            arenaPlayerInfo={this.state.isArenaMatch && this.state.arenaProfile ? {
              name: this.state.arenaProfile.name,
              avatarUrl: this.getArenaAvatarUrl(this.state.arenaProfile.profileAvatar),
            } : null}
            arenaOpponentInfo={this.state.arenaMatchmakingOpponent || null}
            onMatchReward={this.handleMatchReward}
            onExit={() => {
              this.gameBoardRef = null;
              const returningToArena = this.state.isArenaMatch;
              stopMusic(2000);
              this.setState({
                isGameBoardOpen: false, sessionMode: null, sessionId: null, roomCode: null, isArenaMatch: false, isRankedMatch: false,
                ...(returningToArena ? { arenaView: 'hub' } : {}),
              });
            }}
          />
        ) : null}
        {showArena && this.state.arenaLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
            <div className="text-white/60 text-sm">Loading arena profile...</div>
          </div>
        ) : null}
        {showArena && this.state.arenaProfile && !this.state.arenaProfile.starterDeck ? (
          <ArenaStarterPicker
            sorceryCards={this.state.sorceryCards}
            onStarterChosen={this.handleStarterChosen}
          />
        ) : null}
        {showArena && this.state.arenaProfile?.starterDeck && !this.state.arenaProfile?.serverRegistered ? (
          <ArenaUsernamePrompt
            currentName={this.state.arenaProfile.name}
            onRegister={this.registerArenaUsername}
          />
        ) : null}
        {showArena && this.state.arenaProfile?.starterDeck && this.state.arenaProfile?.serverRegistered && this.state.arenaView === 'hub' ? (
          <ArenaHub
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            rank={this.state.arenaProfile.rank}
            onPlayMatch={this.handleArenaPlayMatch}
            onFindMatch={this.startMatchmaking}
            onOpenStore={this.openArenaStore}
            onOpenDeckBuilder={this.openArenaDeckBuilder}
            onOpenAuctionHouse={this.openAuctionHouse}
            onUpdateName={this.updateArenaName}
            onUpdateAvatar={this.updateArenaAvatar}
            onResetProfile={this.resetArenaProfile}
          />
        ) : null}
        {showArena && this.state.arenaView === 'deck-select' ? (
          <ArenaDeckSelect
            decks={this.state.arenaProfile?.decks || []}
            onConfirm={this.confirmDeckAndQueue}
            onCancel={() => this.setState({ arenaView: 'hub' })}
          />
        ) : null}
        {showArena && this.state.arenaView === 'matchmaking' ? (
          <ArenaMatchmaking
            opponent={this.state.arenaMatchmakingOpponent}
            onCancel={this.cancelMatchmaking}
          />
        ) : null}
        {showArena && this.state.arenaView === 'store' ? (
          <ArenaStore
            profile={this.state.arenaProfile}
            pendingPacks={this.state.arenaPendingPacks}
            onBuyPack={this.buyArenaPack}
            onOpenPacks={this.openNextPack}
            onBack={() => this.setState({ arenaView: 'hub' })}
          />
        ) : null}
        {showArena && this.state.arenaView === 'auction-house' ? (
          <AuctionHouse
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            onUpdateProfile={(profile) => this.setState({ arenaProfile: profile }, () => saveArenaProfile(profile))}
            onBack={() => this.setState({ arenaView: 'hub' })}
          />
        ) : null}
        {showArena && this.state.arenaView === 'pack-opening' && this.state.arenaOpenedPack ? (
          <ArenaPackOpening
            key={this.state.arenaOpenedPack?.setKey + '-' + (this.state.arenaPendingPacks?.length || 0) + '-' + (this.state.arenaAutoOpenPack ? 'auto' : '')}
            pack={this.state.arenaOpenedPack}
            allPendingPacks={this.state.arenaPendingPacks}
            autoOpen={this.state.arenaAutoOpenPack || false}
            onDone={() => { this.setState({ arenaAutoOpenPack: false }); this.handlePackDone(); }}
            onOpenAnother={this.handleOpenAnother}
            onOpenFromSet={this.openFromSet}
            onPackOpened={this.handlePackOpened}
            canAffordAnother={this.state.arenaProfile?.coins >= CURRENCY.PACK_PRICE}
            remainingPacks={this.state.arenaPendingPacks?.length || 0}
          />
        ) : null}
        <Toaster />
      </>
    );
  }
}
