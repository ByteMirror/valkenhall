import { Component } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import './app.css';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';

import { deleteSavedDeckById, listSavedDecks, loadSavedDeckById, saveSavedDeck } from './utils/deckStorageApi';
import { createSavedDeckCardIndex, restoreSavedDeckCards } from './utils/savedDeckRestore';
import { applyThemePreference, getStoredThemePreference } from './utils/themePreference';
import { getLocalApiOrigin } from './utils/localApi';
import { getViewportWidth } from './utils/workspaceLayout';
import { loadSorceryCardsWithSource } from './utils/sorcery/cardsApi';
import GameBoard from './components/GameBoard';
import SessionLobby from './components/SessionLobby';
import ArenaHub from './components/ArenaHub';
import ArenaStarterPicker from './components/ArenaStarterPicker';
import ArenaStore from './components/ArenaStore';
import AuctionHouse from './components/AuctionHouse';
import ArenaPackOpening from './components/ArenaPackOpening';
import { loadArenaProfile, saveArenaProfile, grantCards } from './utils/arena/profileApi';
import { purchasePacks, openPendingPack, resolvePendingPacks, resolvePack } from './utils/arena/packsApi';
import { playMusic, stopMusic } from './utils/arena/musicManager';
import { playUI, UI, preloadUISounds } from './utils/arena/uiSounds';
import { createDefaultProfile, CURRENCY, isArenaDebugMode } from './utils/arena/profileDefaults';
import { checkAchievements, getAchievement } from './utils/arena/achievements';
import { resolveStarterDeck } from './utils/arena/starterDecks';
import { createDefaultSeasonProgress, initializeQuests, processMatchResult, attachQuestPool } from './utils/arena/seasonPass';
import { loadCurrentSeason, claimSeasonTier as apiClaimSeasonTier } from './utils/arena/seasonApi';
import ArenaMatchmaking from './components/ArenaMatchmaking';
import ArenaDeckSelect from './components/ArenaDeckSelect';
import ArenaUsernamePrompt from './components/ArenaUsernamePrompt';
import GameMenu from './components/GameMenu';
import LoginScreen from './components/LoginScreen';
import { clearQueueState, joinQueue, leaveQueue, pollQueueStatus } from './utils/arena/matchmakingApi';
import { api } from './utils/serverClient';
import { getStoredToken, validateToken, clearStoredToken, getMyInviteCode } from './utils/authApi';
import FriendsSidebar from './components/FriendsSidebar';
import FriendProfileOverlay from './components/FriendProfileOverlay';
import SpectatorBanner from './components/SpectatorBanner';
import RuneSpinner from './components/RuneSpinner';
import LoadingIndicator from './components/LoadingIndicator';
import FirstRunDownload from './components/FirstRunDownload';
import TradeWindow from './components/TradeWindow';
import { startPresence, stopPresence, updateActivity, refreshFriendList } from './utils/presenceManager';
import * as friendsApi from './utils/friendsApi';
import { createUpdateManager } from './utils/updateManager';
import UpdateModal from './components/UpdateModal';
import SettingsScreen from './components/SettingsScreen';
import DeckGallery from './components/DeckGallery';
import DeckEditor from './components/DeckEditor';
import Mailbox from './components/Mailbox';
import ArcaneTrials from './components/ArcaneTrials';
import DraftBrowser from './components/DraftBrowser';
import DraftLobby from './components/DraftLobby';
import DraftPicker from './components/DraftPicker';
import DraftDeckBuilder from './components/DraftDeckBuilder';
import DraftTournament from './components/DraftTournament';
import DraftResults from './components/DraftResults';
import GuildPanel from './components/GuildPanel';
import GuildLeaderboard from './components/GuildLeaderboard';
import DraftQueueIndicator from './components/DraftQueueIndicator';

const PAGE_TRANSITION_PROPS = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.25, ease: 'easeInOut' },
};

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

function resolvePreferredPrintingStatic(card) {
  if (!card) {
    return null;
  }

  if (card.printings?.length === 1) {
    return card.printings[0];
  }

  return card.printings?.[card.printings.length - 1] || card.printings?.[0] || null;
}

export default class App extends Component {
  constructor() {
    super();

    this.state = {
      authChecking: true,
      authFadeOut: false,
      needsAssetDownload: false,
      loggedIn: false,
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
      sessionMode: null,
      sessionId: null,
      roomCode: null,
      sorceryCards: null,
      sorceryCardsLoadSource: '',
      savedDecks: [],
      loading: true,
      loadingMessage: 'Loading...',
      loadingDetail: '',
      isSavedDecksLoading: true,
      isSavingDeck: false,
      savedDecksError: '',
      editingDeckData: null,
      themePreference: getStoredThemePreference(),
      viewportWidth: getViewportWidth(),
      friendListData: null,
      friendsSidebarOpen: false,
      viewingFriendProfile: null,
      pendingInviteRoomCode: null,
      isInviteMatch: false,
      isInviteHost: false,
      isSpectating: false,
      spectateRoomCode: null,
      tradeActive: false,
      tradePartnerName: null,
      tradeRoomCode: null,
      gameMenuOpen: false,
      updateStatus: null,
      currentSeason: null,
      settingsOpen: false,
      mailboxOpen: false,
      mailboxUnreadCount: 0,
      mailboxSelectedMailId: null,
      mailboxView: null,
      mailboxComposeRecipientId: null,
      // Draft state
      draftEventId: null,
      draftPhase: null,
      draftedCards: null,
      draftFinalStandings: null,
      draftPrizes: null,
      draftQueueOpen: false,
      // Guild state
      guildId: null,
    };

    this.arenaQueuePollTimer = null;
    this.savedDeckCardIndex = null;
    this.savedDeckCardIndexSource = null;
    this.gameBoardRef = null;
    this.themeMediaQuery = null;
    this.updateManager = null;
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleDocumentKeyDown);
    document.addEventListener('keyup', this.handleDocumentKeyUp);
    document.addEventListener('contextmenu', this.handleGlobalContextMenu);
    window.addEventListener('resize', this.handleWindowResize);
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.themeMediaQuery.addEventListener('change', this.handleThemeMediaQueryChange);
    }
    applyThemePreference(this.state.themePreference);
    // Decks are loaded after login via postLoginInit — skipped on mount
    // because the auth token may not be available yet (401 from server).

    this.loadCardsWithRetry = async (retries = 3, delay = 2000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          return await loadSorceryCardsWithSource();
        } catch (error) {
          console.warn(`Card load attempt ${attempt}/${retries} failed:`, error.message);
          if (attempt < retries) {
            this.setState({ loadingDetail: `Retrying... (${attempt}/${retries})` });
            await new Promise((r) => setTimeout(r, delay));
          } else {
            console.error('Failed to load Sorcery cards after retries:', error);
            return { cards: null, source: '' };
          }
        }
      }
      return { cards: null, source: '' };
    };

    // Load sorcery cards
    this.setState({
      loading: true,
      loadingMessage: 'Loading Card Database',
      loadingDetail: 'Fetching card data...',
    });

    this.loadCardsWithRetry()
      .then((sorceryResult) => {
        this.setState({
          sorceryCards: sorceryResult.cards,
          sorceryCardsLoadSource: sorceryResult.source,
          loading: false,
          loadingMessage: '',
          loadingDetail: '',
        }, () => this.initSeason());
      });

    // Check for existing auth token
    this.checkAuth();

    this.updateManager = createUpdateManager((status) => {
      const prev = this.state.updateStatus;
      this.setState({ updateStatus: status });

      if (status.state === 'READY_TO_INSTALL' && prev?.state !== 'READY_TO_INSTALL') {
        toast.info(`Update ${status.newVersion || ''} ready — restart from Settings to install`.trim());
      }
    });

    this.updateManager.init();
  }

  checkAuth = async () => {
    const token = await getStoredToken();
    if (token) {
      try {
        const result = await validateToken(token);
        if (result.valid) {
          // Validate returns a minimal profile; load the full one from the server
          const fullProfile = await loadArenaProfile(token).catch(() => null);
          const serverProfile = fullProfile || result.profile;
          this.setState({
            authChecking: false,
            loggedIn: true,
            arenaProfile: this.profileFromServer(serverProfile, token),
            arenaLoading: false,
          }, () => this.postLoginInit());
          return;
        }
      } catch {}
    }
    this.setState({ authChecking: false });
  };

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleDocumentKeyDown);
    document.removeEventListener('keyup', this.handleDocumentKeyUp);
    document.removeEventListener('contextmenu', this.handleGlobalContextMenu);
    window.removeEventListener('resize', this.handleWindowResize);
    this.themeMediaQuery?.removeEventListener('change', this.handleThemeMediaQueryChange);
  }

  componentDidUpdate(_prevProps, prevState) {
    // Hydrate pending packs once both the server profile and the sorcery
    // card database are available. The two load in parallel, so we react
    // whenever either becomes ready. The `_pendingPacksRaw` marker is
    // removed in the same setState so this block only runs once.
    const raw = this.state.arenaProfile?._pendingPacksRaw;
    if (raw && Array.isArray(this.state.sorceryCards) && this.state.sorceryCards.length > 0) {
      const resolved = resolvePendingPacks(raw, this.state.sorceryCards);
      this.setState((state) => {
        const { _pendingPacksRaw, ...rest } = state.arenaProfile || {};
        return {
          arenaProfile: rest,
          arenaPendingPacks: [...(state.arenaPendingPacks || []), ...resolved],
        };
      });
    }

    if (!this.state.arenaLoading) {
      const view = this.state.arenaView;
      const prevView = prevState.arenaView;
      const justLoaded = prevState.arenaLoading && !this.state.arenaLoading;

      if ((view === 'hub' && (prevView !== 'hub' || justLoaded))) {
        playMusic('arena-hub', { fadeInDuration: 3000 });
      }
      if ((view === 'deck-gallery' || view === 'deck-editor') && prevView !== 'deck-gallery' && prevView !== 'deck-editor') {
        playMusic('arena-deckbuilder', { fadeInDuration: 3000 });
      }
    }

    // Play match music when the game session actually starts
    if (this.state.sessionMode && !prevState.sessionMode && this.state.isGameBoardOpen) {
      playMusic('arena-match', { fadeInDuration: 3000 });
    }
    // Fade back to hub music when game session ends
    if (!this.state.sessionMode && prevState.sessionMode && !this.state.isGameBoardOpen) {
      playMusic('arena-hub', { fadeInDuration: 3000 });
    }

    if (prevState.arenaView !== this.state.arenaView) {
      const activityMap = {
        hub: 'hub',
        store: 'store',
        'deck-select': 'deck-select',
        'deck-gallery': 'deckbuilder',
        'deck-editor': 'deckbuilder',
        matchmaking: 'matchmaking',
        'pack-opening': 'pack-opening',
        'auction-house': 'auction-house',
        'draft': 'draft',
        'draft-lobby': 'draft',
        'draft-picking': 'draft',
        'draft-building': 'draft',
        'draft-tournament': 'draft',
        'draft-results': 'draft',
        'guild': 'guild',
        'guild-leaderboard': 'guild',
      };
      updateActivity(activityMap[this.state.arenaView] || 'hub');
    }

    if (!prevState.isGameBoardOpen && this.state.isGameBoardOpen && this.state.sessionMode) {
      updateActivity('in-match');
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

  profileFromServer = (serverProfile, token) => {
    return {
      id: serverProfile.id,
      email: serverProfile.email,
      name: serverProfile.name || null,
      coins: serverProfile.coins || 0,
      xp: serverProfile.xp || 0,
      arcanaShards: serverProfile.arcanaShards || 0,
      wins: serverProfile.wins || 0,
      losses: serverProfile.losses || 0,
      starterDeck: serverProfile.starterDeck || null,
      profileAvatar: serverProfile.profileAvatar || null,
      serverToken: token,
      serverRegistered: true,
      rank: serverProfile.rank || { tier: 'apprentice', division: 4, lp: 0 },
      collection: serverProfile.collection || [],
      matchHistory: serverProfile.matchHistory || [],
      achievements: serverProfile.achievements || [],
      seasonProgress: serverProfile.seasonProgress || null,
      // Pending packs arrive in wire format from the server. They're
      // resolved against sorceryCards in hydratePendingPacks() once both
      // the profile and the card database have loaded.
      _pendingPacksRaw: serverProfile.pendingPacks || [],
    };
  };

  handleLogin = async (result) => {
    // Verify returns a minimal profile; load the full one from the server
    const fullProfile = await loadArenaProfile(result.token).catch(() => null);
    const serverProfile = fullProfile || result.profile;
    const profile = this.profileFromServer(serverProfile, result.token);
    this.setState({
      loggedIn: true,
      authChecking: false,
      arenaProfile: profile,
      arenaLoading: false,
    }, () => this.postLoginInit());
  };

  initSeason = async () => {
    if (!this.state.arenaProfile) return;
    let season;
    try {
      const result = await loadCurrentSeason();
      season = attachQuestPool(result.season);
    } catch (e) {
      console.error('Failed to load current season:', e);
      return;
    }
    if (!season) return;

    let progress = this.state.arenaProfile.seasonProgress;
    if (!progress || progress.seasonId !== season.seasonId) {
      progress = createDefaultSeasonProgress(season.seasonId);
    }
    progress = initializeQuests(progress, season);
    const updatedProfile = { ...this.state.arenaProfile, seasonProgress: progress };
    this.setState({ currentSeason: season, arenaProfile: updatedProfile });
    // Persist the (possibly newly-initialized) progress so quests/seasonId
    // round-trip even before the player claims a tier.
    saveArenaProfile(updatedProfile).catch(() => {});
  };

  postLoginInit = () => {
    preloadUISounds();
    this.initSeason();
    this.refreshSavedDecks();
    // Fetch the player's personal invite code — stored on the profile
    // object so it flows to AppHeader through every screen's existing
    // profile prop without additional plumbing.
    const token = this.state.arenaProfile?.serverToken;
    if (token) {
      getMyInviteCode(token).then((code) => {
        if (code && this.state.arenaProfile) {
          this.setState((s) => ({
            arenaProfile: { ...s.arenaProfile, inviteCode: code },
          }));
        }
      }).catch(() => {});
    }
    playMusic('arena-hub', { fadeInDuration: 3000 });
    startPresence('hub', {
      onFriendListUpdate: (data) => this.setState({ friendListData: data }),
      onNewNotifications: this.handleNewNotifications,
      onMailCountUpdate: (counts) => this.setState({ mailboxUnreadCount: counts.count }),
      onChatMessage: (msg) => this.setState({ lastChatMessage: msg }),
      onChatClaimed: (data) => this.setState({ lastChatClaimed: data }),
    });
    this.checkAssetDownload();
    this.deliverPatchNews();
  };

  deliverPatchNews = async () => {
    try {
      const status = this.updateManager?.getLastStatus?.();
      const version = status?.currentVersion;
      if (!version) return;
      await api.post('/profile/me/news', { version });
    } catch {}
  };

  checkAssetDownload = async () => {
    try {
      const api = getLocalApiOrigin();
      const statusRes = await fetch(`${api}/api/assets/status`);
      const status = await statusRes.json();

      const cardsRes = await fetch(`${api}/api/sorcery/cards`);
      const cards = await cardsRes.json();
      let totalSlugs = 0;
      for (const card of cards) {
        for (const set of (card.sets || [])) {
          totalSlugs += (set.variants || []).filter(v => v.slug).length;
        }
      }

      if (status.cached < totalSlugs * 0.9) {
        this.setState({ needsAssetDownload: true });
      }
    } catch {}
  };

  handleAssetDownloadComplete = () => {
    this.setState({ needsAssetDownload: false });
  };

  addToast = (toastData) => {
    const duration = toastData.actions ? 8000 : 4000;
    const primaryAction = toastData.actions?.find(a => a.primary);
    const secondaryAction = toastData.actions?.find(a => !a.primary);

    toast(toastData.title, {
      description: toastData.message,
      duration,
      action: primaryAction ? {
        label: primaryAction.label,
        onClick: () => this.handleToastAction(null, primaryAction.key, toastData),
      } : undefined,
      cancel: secondaryAction ? {
        label: secondaryAction.label,
        onClick: () => this.handleToastAction(null, secondaryAction.key, toastData),
      } : undefined,
    });
  };


  handleToastAction = async (toastId, actionKey, toastData) => {
    if (actionKey === 'open-mailbox') {
      this.setState({ mailboxOpen: true });
    } else if (actionKey === 'accept-friend') {
      await friendsApi.acceptFriendRequest(toastData?.senderId).catch(() => {});
    } else if (actionKey === 'decline-friend') {
      await friendsApi.declineFriendRequest(toastData?.senderId).catch(() => {});
    } else if (actionKey === 'accept-invite') {
      // TODO(stage-3): surface deck picker, then call acceptMatchInvite(senderId, deckId).
      // The new server requires a deckId and delivers invite:accepted via WebSocket.
      try {
        friendsApi.acceptMatchInvite(toastData?.senderId);
      } catch {}
    } else if (actionKey === 'decline-invite') {
      try { friendsApi.declineMatchInvite(toastData?.senderId); } catch {}
    } else if (actionKey === 'allow-spectate' || actionKey === 'deny-spectate') {
      // Spectate protocol not yet implemented on the new server — no-op.
    }
  };

  handleInviteAccepted = (result, { isHost = false } = {}) => {
    this.refreshSavedDecks();
    this.setState({
      arenaView: 'deck-select',
      pendingInviteRoomCode: result.roomCode,
      isInviteMatch: true,
      isInviteHost: isHost,
    });
  };

  handleSpectateAllowed = (roomCode) => {
    this.setState({
      isSpectating: true,
      isGameBoardOpen: true,
      spectateRoomCode: roomCode,
    });
  };

  handleLeaveSpectate = () => {
    const returningToDraft = this.state.draftEventId && this.state.draftPhase === 'tournament';
    this.setState({
      isSpectating: false,
      isGameBoardOpen: false,
      spectateRoomCode: null,
      sessionMode: null,
      roomCode: null,
      isArenaMatch: false,
      ...(returningToDraft ? { arenaView: 'draft-tournament' } : {}),
    });
  };

  handleTradeAccepted = (result, partnerName) => {
    this.setState({
      tradeActive: true,
      tradeRoomCode: result.roomCode,
      tradePartnerName: partnerName,
    });
  };

  handleTradeOfferChanged = (offer) => {
    // Will sync via PeerJS in future
  };

  handleTradeLockIn = () => {
    // Will sync via PeerJS in future
  };

  handleTradeConfirm = async (myOffer, theirOffer) => {
    // Trading is not implemented on the new server yet — close the panel so
    // the UI stays functional until the protocol is reintroduced.
    this.addToast({ title: 'Trade Unavailable', message: 'Trading is temporarily disabled.' });
    this.setState({ tradeActive: false, tradePartnerName: null, tradeRoomCode: null });
  };

  handleTradeCancel = () => {
    this.setState({ tradeActive: false, tradePartnerName: null, tradeRoomCode: null });
  };

  handleFriendInvite = async (friendId) => {
    // TODO(stage-3): route through deck picker before dispatching invite.
    try {
      friendsApi.sendMatchInvite(friendId);
      this.addToast({ title: 'Invite Sent', message: 'Waiting for response...' });
    } catch (err) {
      this.addToast({ title: 'Invite Failed', message: err.message });
    }
  };

  handleFriendSpectate = async (friendId) => {
    this.addToast({ title: 'Spectate Unavailable', message: 'Spectating is temporarily disabled.' });
  };

  handleViewFriendProfile = (profileId) => {
    this.setState({ viewingFriendProfile: profileId });
  };

  handleFriendTrade = async (friendId) => {
    this.addToast({ title: 'Trade Unavailable', message: 'Trading is temporarily disabled.' });
  };

  handleNewNotifications = (notifications) => {
    if (notifications.length > 0) playUI(UI.NOTIFICATION);
    for (const n of notifications) {
      if (n.type === 'friend-request') {
        this.addToast({
          title: 'Friend Request',
          message: `${n.senderName} wants to be your friend`,
          avatar: n.senderAvatar,
          senderId: n.senderId,
          actions: [
            { label: 'Accept', key: 'accept-friend', primary: true },
            { label: 'Decline', key: 'decline-friend' },
          ],
        });
      } else if (n.type === 'friend-accepted') {
        this.addToast({
          title: 'Friend Added',
          message: `${n.name} accepted your friend request`,
          avatar: n.avatar,
        });
      } else if (n.type === 'match-invite') {
        this.addToast({
          title: 'Match Invite',
          message: `${n.senderName} invited you to a match`,
          senderId: n.senderId,
          actions: [
            { label: 'Accept', key: 'accept-invite', primary: true },
            { label: 'Decline', key: 'decline-invite' },
          ],
        });
      } else if (n.type === 'invite-accepted') {
        this.handleInviteAccepted({ roomCode: n.roomCode }, { isHost: false });
        this.addToast({
          title: 'Invite Accepted',
          message: `${n.name || n.senderName || 'Your opponent'} accepted — choose your deck!`,
        });
      } else if (n.type === 'draft-player-disconnected') {
        const secs = Math.round((n.gracePeriodMs || 120000) / 1000);
        this.addToast({
          title: 'Player Disconnected',
          message: `${n.playerName} lost connection. They have ${secs}s to reconnect or the draft will be cancelled.`,
        });
      } else if (n.type === 'draft-player-reconnected') {
        this.addToast({
          title: 'Player Reconnected',
          message: `${n.playerName} is back!`,
        });
      } else if (n.type === 'draft-aborted') {
        this.addToast({
          title: 'Draft Cancelled',
          message: 'The draft has been cancelled. Your entry has been refunded.',
        });
        this.setState({
          draftEventId: null,
          draftPhase: null,
          arenaView: 'hub',
        });
      } else if (n.type === 'matchmaking-matched') {
        clearInterval(this.arenaQueuePollTimer);
        this.arenaQueuePollTimer = null;
        const opp = n.opponent || {};
        const opponentAvatarUrl = this.getArenaAvatarUrl(opp.profileAvatar);
        this.setState({
          arenaMatchmakingOpponent: { ...opp, name: opp.name || opp.username || opp.displayName || 'Opponent', avatarUrl: opponentAvatarUrl },
          arenaMatchId: n.roomCode,
        });
        playUI(UI.MATCH_START);
        const delay = n.isHost ? 1500 : 4000;
        setTimeout(() => {
          this.setState({
            arenaMatchmaking: false,
            arenaView: 'hub',
            isGameBoardOpen: true,
            isArenaMatch: true,
            isRankedMatch: true,
            sessionMode: n.isHost ? 'new' : 'join',
            roomCode: n.roomCode,
          });
        }, delay);
      } else if (n.type === 'spectate-request') {
        this.addToast({
          title: 'Spectate Request',
          message: `${n.spectatorName} wants to watch your match`,
          spectatorId: n.spectatorId,
          actions: [
            { label: 'Allow', key: 'allow-spectate', primary: true },
            { label: 'Deny', key: 'deny-spectate' },
          ],
        });
      }
      if (n.type === 'new-mail') {
        playUI(UI.MAIL_RECEIVE);
        const nc = n.newCount || 1;
        this.addToast({
          title: 'New Mail',
          message: nc > 1 ? `You have ${nc} new messages in your mailbox!` : 'You have new mail in your mailbox!',
          actions: [{ label: 'Open', key: 'open-mailbox', primary: true }],
        });
      }
    }
  };

  getArenaAvatarUrl = (cardId) => {
    if (!cardId || !this.state.sorceryCards) return null;
    const card = this.state.sorceryCards.find((c) => c.unique_id === cardId);
    return card?.printings?.[0]?.image_url || null;
  };

  getArenaSavedDecks = () => {
    // Server is the source of truth for decks — use savedDecks directly.
    return (this.state.savedDecks || []).map((d) => ({
      id: d.id,
      name: d.name,
      cards: d.cards || [],
      cardCount: d.cardCount ?? d.cards?.length ?? 0,
      previewUrl: d.previewUrl || null,
      savedAt: d.savedAt || d.updatedAt || null,
      format: d.format || 'constructed',
    }));
  };

  getArenaDecksForGameBoard = () => {
    const decks = this.state.savedDecks || [];
    return decks.map((d) => ({
      id: d.id,
      name: d.name,
      cards: d.cards || [],
      cardCount: d.cardCount ?? d.cards?.length ?? 0,
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

  handleLogout = async () => {
    stopPresence();
    stopMusic(0);
    await clearStoredToken();
    this.setState({
      loggedIn: false,
      authChecking: false,
      arenaProfile: null,
      arenaLoading: false,
      settingsOpen: false,
      isGameBoardOpen: false,
      sessionMode: null,
      friendListData: null,
      friendsSidebarOpen: false,
      mailboxUnreadCount: 0,
    });
  };

  hasValidUsername = () => {
    const name = this.state.arenaProfile?.name;
    return Boolean(name && name.trim() && name !== 'Player');
  };

  registerArenaUsername = async (username) => {
    const { arenaProfile } = this.state;
    const updatedProfile = {
      ...arenaProfile,
      name: username,
    };
    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch((e) => console.error('Failed to save profile:', e));
  };

  startMatchmaking = () => {
    const us = this.state.updateStatus;
    if (us && us.state !== 'UP_TO_DATE' && us.state !== null) {
      if (us.state === 'READY_TO_INSTALL') {
        toast.error('Please restart to apply the update before playing.');
      } else if (us.state === 'DOWNLOADING' || us.state === 'CHECKING' || us.state === 'UPDATE_AVAILABLE') {
        toast.info('An update is downloading. Please wait...');
      } else if (us.state === 'DOWNLOAD_FAILED') {
        toast.error('Update required. Check Settings to retry the download.');
      }
      return;
    }
    this.refreshSavedDecks();
    this.setState({ arenaView: 'deck-select' });
  };

  confirmDeckAndQueue = async (deckId) => {
    const { arenaProfile, isInviteMatch, pendingInviteRoomCode } = this.state;
    if (!arenaProfile?.serverToken) return;

    this._matchRewardApplied = false;
    this.setState({ arenaSelectedDeckId: deckId, arenaMatchmakingOpponent: null });

    // Friend invite: skip public queue, use the private room directly
    if (isInviteMatch && pendingInviteRoomCode) {
      // isInviteHost: the accepter hosts (they act first), the inviter joins later
      const isInviteHost = this.state.isInviteHost || false;
      this.setState({
        isGameBoardOpen: true,
        isArenaMatch: true,
        isRankedMatch: false,
        sessionMode: isInviteHost ? 'new' : 'join',
        roomCode: pendingInviteRoomCode,
        arenaView: 'hub',
        pendingInviteRoomCode: null,
        isInviteMatch: false,
        isInviteHost: false,
      });
      return;
    }

    // Public matchmaking
    this.setState({ arenaMatchmaking: true, arenaView: 'matchmaking' });

    try {
      await clearQueueState(arenaProfile.serverToken).catch(() => {});
      await joinQueue(arenaProfile.serverToken, deckId);
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
        playUI(UI.MATCH_START);
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

    // Aggregate the starter deck cards by (cardId, foiling) into the
    // shape grantCards expects. Avatars get the foil printing — see
    // resolveStarterDeck. The server returns the new collection so we
    // never have to compute it locally.
    const grantItems = [];
    for (const card of resolvedCards) {
      const foiling = card.foiling || 'S';
      const existing = grantItems.find((i) => i.cardId === card.cardId && i.foiling === foiling);
      if (existing) {
        existing.quantity++;
      } else {
        grantItems.push({ cardId: card.cardId, foiling, quantity: 1 });
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
        // Zone info from resolveStarterDeck drives the deck compartment
        // each card lands in. The saved-deck format uses `isSideboard`
        // for Collection cards; Avatar / Spellbook / Atlas all live in
        // the main deck and are reconstructed from card type on load.
        cards: resolvedCards.map((c) => ({
          cardId: c.cardId,
          cardName: cardIndex.get(c.cardId)?.name || '',
          printingId: c.printingId,
          foiling: c.foiling || 'S',
          isSideboard: c.zone === 'collection',
        })),
        previewCards,
      }, 'sorcery');
      previewUrl = savedSummary.previewUrl || null;
    } catch (e) {
      console.warn('Failed to save starter deck for preview:', e);
    }

    const avatarCard = resolvedCards.find((c) => c.zone === 'avatar');

    // Grant the starter cards through the atomic server endpoint and use
    // the returned collection as the new authoritative state. Then save
    // the other profile fields (starterDeck, profileAvatar) separately.
    let serverCollection;
    try {
      const grantResult = await grantCards(grantItems);
      serverCollection = grantResult.collection;
    } catch (e) {
      console.error('Failed to grant starter deck cards:', e);
      serverCollection = arenaProfile.collection || [];
    }

    const updatedProfile = {
      ...arenaProfile,
      starterDeck: deck.id,
      profileAvatar: avatarCard?.cardId || null,
      collection: serverCollection,
    };

    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch((e) => console.error('Failed to save profile:', e));
    await this.refreshSavedDecks();
  };

  handleArenaPlayMatch = () => {
    const us = this.state.updateStatus;
    if (us && us.state !== 'UP_TO_DATE' && us.state !== null) {
      if (us.state === 'READY_TO_INSTALL') {
        toast.error('Please restart to apply the update before playing.');
      } else if (us.state === 'DOWNLOADING' || us.state === 'CHECKING' || us.state === 'UPDATE_AVAILABLE') {
        toast.info('An update is downloading. Please wait...');
      } else if (us.state === 'DOWNLOAD_FAILED') {
        toast.error('Update required. Check Settings to retry the download.');
      }
      return;
    }
    this.setState({ isGameBoardOpen: true, isArenaMatch: true, isRankedMatch: false });
  };

  handleApplyUpdate = () => {
    this.updateManager?.apply();
  };

  handleClaimSeasonReward = async (level) => {
    const { currentSeason, arenaProfile } = this.state;
    if (!currentSeason || !arenaProfile?.seasonProgress) return;

    // Server is authoritative — it validates the tier against its own
    // table + the player's stored progress, applies the reward
    // atomically, and returns the new totals + collection. The client
    // only sends the tier number.
    let result;
    try {
      result = await apiClaimSeasonTier(level);
    } catch (e) {
      const msg = e?.message || 'Failed to claim reward';
      console.error('Season tier claim failed:', e);
      toast.error(msg);
      return;
    }

    const updatedProfile = {
      ...arenaProfile,
      coins: result.newTotals?.coins ?? arenaProfile.coins,
      arcanaShards: result.newTotals?.arcanaShards ?? arenaProfile.arcanaShards,
      collection: result.collection ?? arenaProfile.collection,
      seasonProgress: result.seasonProgress ?? arenaProfile.seasonProgress,
    };
    this.setState({ arenaProfile: updatedProfile });

    // Resolve a display name for the foil reward against the local
    // catalog so we can toast a friendly message. The server only
    // returns cardId — the client owns the name lookup.
    const reward = result.reward || {};
    let foilName = null;
    if (reward.foilCardId && Array.isArray(this.state.sorceryCards)) {
      const card = this.state.sorceryCards.find((c) => c.unique_id === reward.foilCardId);
      foilName = card?.name || null;
    }

    if (reward.coins) toast.success(`+${reward.coins} coins!`);
    if (reward.arcanaShards) toast.success(`+${reward.arcanaShards} Arcana!`);
    if (foilName) toast.success(`Foil ${reward.foilRarity}: ${foilName}!`, { duration: 5000 });
  };

  openArcaneTrials = () => {
    playUI(UI.OPEN);
    if (!this.state.currentSeason) this.initSeason();
    this.setState({ arenaView: 'arcane-trials' });
  };

  // --- Draft handlers ---

  openDraftBrowser = () => {
    playUI(UI.OPEN);
    this.setState({ arenaView: 'draft' });
  };

  openDraftLobby = (eventId) => {
    this.setState({ arenaView: 'draft', draftEventId: eventId, draftPhase: 'lobby', draftQueueOpen: false });
  };

  handleToggleDraftQueue = () => {
    this.setState((s) => ({ draftQueueOpen: !s.draftQueueOpen }));
  };

  handleDraftQueueLeft = () => {
    this.setState({ draftEventId: null, draftPhase: null, draftQueueOpen: false, arenaView: 'hub' });
  };

  handleDraftQueueCancelled = () => {
    this.setState({ draftEventId: null, draftPhase: null, draftQueueOpen: false, arenaView: 'hub' });
  };

  renderDraftQueueDropdown = () => {
    if (!this.state.draftEventId || this.state.draftPhase === 'picking' || this.state.draftPhase === 'building') return null;
    return (
      <DraftQueueIndicator
        eventId={this.state.draftEventId}
        profile={this.state.arenaProfile}
        open={this.state.draftQueueOpen}
        onToggle={this.handleToggleDraftQueue}
        onOpenLobby={() => this.openDraftLobby(this.state.draftEventId)}
        onLeft={this.handleDraftQueueLeft}
        onCancelled={this.handleDraftQueueCancelled}
      />
    );
  };

  handleDraftStarted = (data) => {
    this.setState({ arenaView: 'draft-picking', draftPhase: 'picking' });
  };

  handleDraftBuildingPhase = (data) => {
    this.setState({
      arenaView: 'draft-building',
      draftPhase: 'building',
      draftedCards: data?.draftedCards || [],
    });
  };

  handleDraftTournamentStart = (data) => {
    this.setState({ arenaView: 'draft-tournament', draftPhase: 'tournament' });
  };

  handleDraftSpectate = (roomCode) => {
    this.setState({
      isSpectating: true,
      isGameBoardOpen: true,
      spectateRoomCode: roomCode,
      sessionMode: 'spectate',
      roomCode: roomCode,
      isArenaMatch: true,
      isRankedMatch: false,
    });
  };

  handleDraftPlayMatch = async (roomId) => {
    // Get opponent info from the draft event participants
    let opponentInfo = null;
    if (this.state.draftEventId) {
      try {
        const { getDraftEvent } = await import('./utils/arena/draftApi');
        const event = await getDraftEvent(this.state.draftEventId);
        const opponent = event?.participants?.find((p) => p.playerId !== this.state.arenaProfile?.id);
        if (opponent) {
          const { getPublicProfile } = await import('./utils/friendsApi');
          try {
            const profile = await getPublicProfile(opponent.playerId);
            opponentInfo = {
              name: profile?.name || opponent.playerName || 'Opponent',
              profileAvatar: profile?.profileAvatar,
              avatarUrl: profile?.profileAvatar ? this.getArenaAvatarUrl(profile.profileAvatar) : null,
            };
          } catch {
            opponentInfo = { name: opponent.playerName || 'Opponent' };
          }
        }
      } catch {}
    }

    this.setState({
      isGameBoardOpen: true,
      sessionMode: 'join',
      roomCode: roomId,
      isArenaMatch: true,
      isRankedMatch: false,
      arenaMatchmakingOpponent: opponentInfo,
    });
  };

  handleDraftComplete = (data) => {
    this.setState({
      arenaView: 'draft-results',
      draftPhase: 'results',
      draftFinalStandings: data?.standings || [],
      draftPrizes: data?.prizes || null,
      draftedCards: data?.draftedCards || this.state.draftedCards || [],
    });
    // Refresh profile to pick up granted cards
    getStoredToken().then((token) => {
      if (token) loadArenaProfile(token).then((p) => {
        if (p) this.setState({ arenaProfile: this.profileFromServer(p, token) });
      }).catch(() => {});
    });
  };

  handleDraftCancelled = () => {
    toast('Draft event was cancelled. Entry refunded.');
    this.setState({ arenaView: 'draft', draftEventId: null, draftPhase: null });
  };

  handleDraftBack = () => {
    playUI(UI.CLOSE);
    this.setState({
      arenaView: 'hub',
      draftEventId: null,
      draftPhase: null,
      draftedCards: null,
      draftFinalStandings: null,
      draftPrizes: null,
    });
  };

  // --- Guild handlers ---

  openGuild = () => {
    playUI(UI.OPEN);
    this.setState({ arenaView: 'guild' });
  };

  openGuildLeaderboard = () => {
    playUI(UI.OPEN);
    this.setState({ arenaView: 'guild-leaderboard' });
  };

  handleOpenSettings = () => {
    this.setState({ settingsOpen: true, gameMenuOpen: false });
  };

  handleCloseSettings = () => {
    this.setState({ settingsOpen: false });
  };

  handleToggleMailbox = () => {
    this.setState((s) => ({
      mailboxOpen: !s.mailboxOpen,
      mailboxSelectedMailId: null,
      mailboxView: null,
      mailboxComposeRecipientId: null,
    }));
  };

  handleOpenMailToLetter = (mailId) => {
    this.setState({
      mailboxOpen: true,
      mailboxSelectedMailId: mailId,
      mailboxView: null,
    });
  };

  handleSendMailFromProfile = (friendId) => {
    this.setState({
      viewingFriendProfile: null,
      mailboxOpen: true,
      mailboxView: 'compose',
      mailboxComposeRecipientId: friendId,
      mailboxSelectedMailId: null,
    });
  };

  handleMailProfileUpdate = (updates) => {
    this.setState((s) => {
      const profile = { ...s.arenaProfile };
      if ('coins' in updates) profile.coins = updates.coins;
      if ('collection' in updates) profile.collection = updates.collection;
      return { arenaProfile: profile };
    });
  };

  processAchievements = (profile) => {
    const newlyUnlocked = checkAchievements(profile, this.state.sorceryCards);
    if (newlyUnlocked.length === 0) return profile;

    let bonusCoins = 0;
    for (const id of newlyUnlocked) {
      const achievement = getAchievement(id);
      if (achievement) {
        bonusCoins += achievement.coins || 0;
        playUI(UI.ACHIEVEMENT);
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

    // Report draft match result if this is a draft tournament game
    if (this.state.draftEventId && this.state.draftPhase === 'tournament') {
      try {
        const { reportDraftMatchResult } = await import('./utils/arena/draftApi');
        // Find the current match from standings
        const { getDraftStandings } = await import('./utils/arena/draftApi');
        const data = await getDraftStandings(this.state.draftEventId);
        const myMatch = (data.currentPairings || []).find(
          (p) => p.player1Id === arenaProfile.id || p.player2Id === arenaProfile.id
        );
        if (myMatch && myMatch.status !== 'complete') {
          const winnerId = reward.won ? arenaProfile.id : (myMatch.player1Id === arenaProfile.id ? myMatch.player2Id : myMatch.player1Id);
          await reportDraftMatchResult(this.state.draftEventId, myMatch.id, winnerId);
        }
      } catch (err) {
        console.error('[handleMatchReward] draft match result report failed:', err);
      }
    }

    const opp = this.state.arenaMatchmakingOpponent;
    const opponentName = opp?.name || opp?.username || opp?.displayName || 'Opponent';

    // The server already applied coins/xp/shards/wins/losses and the
    // ranked ladder update (tier/division/LP/shields) atomically in
    // POST /profile/me/match/claim and wrote a match_history row as
    // part of the same transaction. Sync the client cache from the
    // returned totals and append a local history entry for immediate UI.
    const newCoins = reward.newTotals?.coins ?? (arenaProfile.coins + (reward.coins || 0));
    const newXp = reward.newTotals?.xp ?? (arenaProfile.xp + (reward.xp || 0));
    const newWins = reward.newTotals?.wins ?? ((arenaProfile.wins || 0) + (reward.won ? 1 : 0));
    const newLosses = reward.newTotals?.losses ?? ((arenaProfile.losses || 0) + (reward.won ? 0 : 1));
    const newShards = reward.newTotals?.arcanaShards ?? ((arenaProfile.arcanaShards || 0) + (reward.arcanaShards || 0));
    const newRank = reward.newTotals?.rank ?? arenaProfile.rank;
    const newShieldGames = reward.newTotals?.shieldGamesLeft ?? arenaProfile.shieldGamesLeft ?? 0;

    const updatedProfile = {
      ...arenaProfile,
      coins: newCoins,
      xp: newXp,
      arcanaShards: newShards,
      wins: newWins,
      losses: newLosses,
      rank: newRank,
      shieldGamesLeft: newShieldGames,
      matchHistory: [
        {
          date: new Date().toISOString(),
          opponentName,
          won: reward.won,
          coinsEarned: reward.coins || 0,
          xpEarned: reward.xp || 0,
          durationMinutes: reward.durationMinutes || 0,
        },
        ...(arenaProfile.matchHistory || []),
      ],
    };

    let withAchievements = this.processAchievements(updatedProfile);

    // Lazy-init the season if the user finished a match before visiting
    // Arcane Trials. The season comes from the server (deterministic
    // per cycle), so a single call is enough.
    let currentSeason = this.state.currentSeason;
    if (!currentSeason) {
      try {
        const result = await loadCurrentSeason();
        currentSeason = attachQuestPool(result.season);
      } catch (e) {
        console.error('Failed to load current season:', e);
      }
    }
    let seasonProgress = withAchievements.seasonProgress;
    if (currentSeason && (!seasonProgress || seasonProgress.seasonId !== currentSeason.seasonId)) {
      seasonProgress = initializeQuests(createDefaultSeasonProgress(currentSeason.seasonId), currentSeason);
    }

    if (currentSeason && seasonProgress) {
      // Pass the server-computed season XP as the base amount so a
      // tampered client cannot inflate it.
      const seasonResult = processMatchResult(seasonProgress, currentSeason, reward.won, reward.seasonXp || 0);
      withAchievements = { ...withAchievements, seasonProgress: seasonResult.progress };
      if (seasonResult.questXpEarned > 0) {
        toast(`Quest complete! +${seasonResult.questXpEarned} Season XP`, { duration: 3000 });
      }
    }
    this.setState({ arenaProfile: withAchievements, currentSeason });
    // Persist season progress (coins/xp/wins/losses were already applied
    // server-side by the claim endpoint, so this PUT just mirrors them
    // back alongside the updated seasonProgress).
    await saveArenaProfile(withAchievements).catch((e) => console.error('Failed to save profile:', e));
  };

  // Applied by the Card Singles tab after a successful server-side purchase.
  // The server already deducted shards and added the card atomically; we
  // just sync the client cache. Shard purchases are always non-foil, so
  // the local collection delta uses foiling 'S'.
  handleShardPurchaseUpdate = ({ arcanaShards, collectionDelta }) => {
    this.setState((state) => {
      const profile = state.arenaProfile;
      if (!profile) return null;

      let collection = profile.collection || [];
      if (collectionDelta) {
        const { cardId, quantity } = collectionDelta;
        const foiling = 'S';
        collection = [...collection];
        const existing = collection.find((c) => c.cardId === cardId && (c.foiling || 'S') === foiling);
        if (existing) {
          existing.quantity = (existing.quantity || 0) + quantity;
        } else {
          collection.push({ cardId, foiling, quantity });
        }
      }

      const updated = {
        ...profile,
        arcanaShards: arcanaShards != null ? arcanaShards : profile.arcanaShards,
        collection,
      };
      return { arenaProfile: updated };
    });
  };

  openArenaStore = () => {
    playUI('snd-open-store.wav', { volume: 0.5 });
    playMusic('arena-store', { fadeInDuration: 3000 });
    this.setState({ arenaView: 'store' });
  };

  openAuctionHouse = () => {
    playUI('snd-open-auction.wav', { volume: 0.5 });
    this.setState({ arenaView: 'auction-house' });
  };

  buyArenaPack = async (setKey, quantity = 1) => {
    playUI(UI.PURCHASE);

    // The server is authoritative for both the coin debit and the pack
    // roll. If the player can't afford it the server returns 402 and
    // nothing has changed locally yet. On success we update coins from
    // the server response and append the server-rolled packs (resolved
    // against the local card index) to the pending queue.
    let result;
    try {
      result = await purchasePacks(setKey, quantity);
    } catch (err) {
      console.error('Failed to purchase packs:', err);
      return;
    }

    const resolved = (result.packs || []).map((p) => resolvePack(p, this.state.sorceryCards));

    this.setState((state) => ({
      arenaProfile: { ...state.arenaProfile, coins: result.coins },
      arenaPendingPacks: [...(state.arenaPendingPacks || []), ...resolved],
    }), () => {
      try {
        const base = getLocalApiOrigin();
        const a = new Audio(`${base}/game-assets/snd-purchase-pack.mp3`);
        a.volume = 0.6;
        a.play().catch(() => {});
      } catch {}
    });
  };

  openNextPack = () => {
    playUI(UI.CHEST_OPEN);
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
    // Visually swap in the chosen pack so the animation starts immediately.
    // The actual server open call happens in handlePackOpened once the
    // animation finishes, so the grant stays atomic with the reveal.
    const { arenaPendingPacks, arenaOpenedPack } = this.state;
    const allPacks = [arenaOpenedPack, ...(arenaPendingPacks || [])].filter(Boolean);
    const targetIdx = allPacks.findIndex((p) => p.setKey === setKey);
    if (targetIdx < 0) return;

    const targetPack = allPacks[targetIdx];
    const remaining = allPacks.filter((_, i) => i !== targetIdx);

    this.setState({
      arenaOpenedPack: targetPack,
      arenaPendingPacks: remaining,
      arenaAutoOpenPack: true,
    });
  };

  handlePackOpened = async () => {
    const { arenaOpenedPack, arenaProfile } = this.state;
    if (!arenaOpenedPack) return;

    // The server holds the pre-rolled pack contents and grants them
    // atomically when we open it by id. The response includes the new
    // collection so we can sync without a separate fetch. If the call
    // fails (network hiccup, server restart, pack already opened) we
    // fall back to the pre-animation collection — the animation already
    // ran so dropping the reward silently is the least bad option.
    let serverCollection = arenaProfile.collection;
    if (arenaOpenedPack.id) {
      try {
        const { collection } = await openPendingPack(arenaOpenedPack.id);
        serverCollection = collection;
      } catch (e) {
        console.error('Failed to open pack on server:', e);
      }
    }

    const setKey = arenaOpenedPack.setKey || 'unknown';
    const updatedProfile = {
      ...arenaProfile,
      collection: serverCollection,
      packsOpened: (arenaProfile.packsOpened || 0) + 1,
      packsOpenedBySet: {
        ...(arenaProfile.packsOpenedBySet || {}),
        [setKey]: ((arenaProfile.packsOpenedBySet || {})[setKey] || 0) + 1,
      },
    };

    const withAchievements = this.processAchievements(updatedProfile);
    this.setState({ arenaProfile: withAchievements });
    // Persist achievement/coin deltas from processAchievements. The
    // collection is already authoritative on the server.
    saveArenaProfile(withAchievements).catch(() => {});
  };

  handlePackDone = () => {
    this.setState({ arenaView: 'store', arenaOpenedPack: null });
  };

  handleOpenAnother = () => {
    this.openNextPack();
  };

  openArenaDeckBuilder = () => {
    playUI('snd-open-deckbuilder.wav', { volume: 0.5 });
    playMusic('arena-deckbuilder', { fadeInDuration: 3000 });
    this.refreshSavedDecks();
    this.setState({
      arenaView: 'deck-gallery',
      editingDeckData: null,
    });
  };

  handleOpenDeckInEditor = async (deckId) => {
    playUI(UI.OPEN);
    if (!deckId || !Array.isArray(this.state.sorceryCards)) return;
    try {
      const savedDeck = await loadSavedDeckById(deckId, 'sorcery');
      if (!savedDeck) return;

      const activeCards = this.getActiveCards();
      const restoredCards = await restoreSavedDeckCards({
        savedEntries: savedDeck.cards || [],
        cardIndex: this.getSavedDeckCardIndex(activeCards),
        resolvePreferredPrinting: this.resolvePreferredPrinting,
      });
      this.setState({
        arenaView: 'deck-editor',
        editingDeckData: { id: savedDeck.id, name: savedDeck.name, cards: restoredCards },
      });
    } catch (error) {
      console.error('Failed to open deck:', error);
    }
  };

  handleCreateNewDeck = () => {
    playUI(UI.CONFIRM);
    this.setState({
      arenaView: 'deck-editor',
      editingDeckData: { id: '', name: '', cards: [] },
    });
  };

  handleSaveDeckFromEditor = async (payload) => {
    playUI(UI.CONFIRM);
    const savedSummary = await saveSavedDeck(payload, 'sorcery');

    this.setState({
      editingDeckData: {
        ...this.state.editingDeckData,
        id: savedSummary.id,
        name: savedSummary.name,
      },
    });

    await this.refreshSavedDecks();

    return savedSummary;
  };


  handleBackToGallery = () => {
    this.refreshSavedDecks();
    this.setState({ arenaView: 'deck-gallery', editingDeckData: null });
  };

  handleBackToHubFromGallery = () => {
    playMusic('arena-hub', { fadeInDuration: 3000 });
    this.setState({ arenaView: 'hub' });
  };

  handleDeleteDeckFromGallery = async (deckId) => {
    playUI(UI.DELETE);
    if (!deckId) return;
    try {
      await deleteSavedDeckById(deckId, 'sorcery');
      await this.refreshSavedDecks();
    } catch (error) {
      console.error('Failed to delete deck:', error);
    }
  };

  getActiveCards = () => {
    return this.state.sorceryCards;
  };


  resolvePreferredPrinting = async (card) => {
    if (!card) {
      return null;
    }

    return resolvePreferredPrintingStatic(card);
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

  handleDocumentKeyUp = (event) => {
    if (this.state.isGameBoardOpen && 'wasdWASD'.includes(event.key)) {
      this.gameBoardRef?.scene?.setKeyHeld(event.key, false);
    }
  };

  handleToggleFriendsSidebar = () => {
    this.setState((s) => {
      const next = !s.friendsSidebarOpen;
      // Snap to fresh data the moment the user looks at the sidebar — covers
      // the gap between background poll cycles so opening it never shows a
      // stale avatar from a friend who just changed it.
      if (next) refreshFriendList();
      return { friendsSidebarOpen: next };
    });
  };

  handleGameMenuResume = () => this.setState({ gameMenuOpen: false });

  handleGameMenuQuit = () => window.close();

  handleGameMenuMainMenu = () => {
    // If in an active draft, warn the player before leaving
    if (this.state.draftEventId && this.state.draftPhase && this.state.draftPhase !== 'lobby') {
      if (!confirm('You are in an active draft. Leaving will disconnect you — if you don\'t reconnect within 2 minutes, the draft will be cancelled and your entry refunded. Are you sure?')) {
        this.setState({ gameMenuOpen: false });
        return;
      }
      // Clear draft state on client — server will handle the disconnect grace period
      this.setState({ draftEventId: null, draftPhase: null });
    }

    // If the player is matchmaking, leave the queue first (fire-and-forget —
    // we don't want network errors to block returning to the menu).
    if (this.state.arenaMatchmaking) {
      try { leaveQueue(); } catch {}
      clearQueueState();
    }

    // If the game board is mounted, dropping `isGameBoardOpen` will unmount
    // GameBoard, which triggers its componentWillUnmount → autoSave →
    // disconnectSocket → scene.dispose. That's the same graceful shutdown
    // path used by the in-game "Leave game" button.
    if (this.state.isGameBoardOpen) {
      this.gameBoardRef = null;
      stopMusic(2000);
    }

    this.setState({
      gameMenuOpen: false,
      settingsOpen: false,
      mailboxOpen: false,
      isGameBoardOpen: false,
      sessionMode: null,
      sessionId: null,
      roomCode: null,
      isArenaMatch: false,
      isRankedMatch: false,
      arenaMatchmaking: false,
      arenaMatchmakingOpponent: null,
      arenaMatchId: null,
      arenaOpenedPack: null,
      editingDeckData: null,
      arenaView: 'hub',
    });
  };

  handleGlobalContextMenu = (event) => {
    // Allow context menu on input fields for cut/copy/paste
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  };

  handleDocumentKeyDown = (event) => {
    if (event.key === 'Escape' && !isEditableTarget(event.target)) {
      event.preventDefault();
      this.setState((s) => ({ gameMenuOpen: !s.gameMenuOpen }));
      return;
    }

    if (this.state.gameMenuOpen) {
      return;
    }

    if (event.key === 'Tab' && !isEditableTarget(event.target)) {
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
    }
  };

  handleThemeMediaQueryChange = () => {
    if (this.state.themePreference === 'system') {
      applyThemePreference('system');
    }
  };

  setThemePreference = () => {
    // Dark mode is forced — no-op
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
      }));
    } catch (error) {
      console.error('Failed to delete saved deck:', error);
      this.setState({
        savedDecksError: error?.message || 'Failed to delete saved deck',
      });
    }
  };

  renderAuthOverlay() {
    return (
      <AnimatePresence>
        {this.state.authChecking ? (
          <motion.div
            key="auth-overlay"
            className="fixed inset-0 bg-black flex items-center justify-center z-[200]"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          >
            <RuneSpinner size={120} useViewportUnits />
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }

  render() {
    if (!this.state.loggedIn && !this.state.authChecking) {
      return (
        <>
          <LoginScreen onLogin={this.handleLogin} />
          {this.state.gameMenuOpen ? <GameMenu onResume={this.handleGameMenuResume} onQuit={this.handleGameMenuQuit} onOpenSettings={this.handleOpenSettings} appVersion={this.state.updateStatus?.currentVersion} /> : null}
          {this.renderAuthOverlay()}
        </>
      );
    }

    if (!this.state.loggedIn) {
      return this.renderAuthOverlay();
    }

    if (this.state.needsAssetDownload) {
      return (
        <FirstRunDownload onComplete={this.handleAssetDownloadComplete} />
      );
    }

    const showDeckGallery = this.state.arenaView === 'deck-gallery' && !this.state.isGameBoardOpen;
    const showDeckEditor = this.state.arenaView === 'deck-editor' && !this.state.isGameBoardOpen && this.state.editingDeckData;
    const showArena = !this.state.isGameBoardOpen && this.state.arenaView !== 'deck-gallery' && this.state.arenaView !== 'deck-editor';

    return (
      <>
        <AnimatePresence>
        {showDeckGallery ? (
          <motion.div key="deck-gallery" className="fixed inset-0 z-[45]" {...PAGE_TRANSITION_PROPS}>
          <DeckGallery
            savedDecks={this.getArenaSavedDecks()}
            sorceryCards={this.state.sorceryCards}
            profile={this.state.arenaProfile}
            onCreateDeck={this.handleCreateNewDeck}
            onOpenDeck={this.handleOpenDeckInEditor}
            onDeleteDeck={this.handleDeleteDeckFromGallery}
            onBack={this.handleBackToHubFromGallery}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            onToggleFriends={this.handleToggleFriendsSidebar}
            friendListData={this.state.friendListData}
          />
          </motion.div>
        ) : null}
        {showDeckEditor ? (
          <motion.div key="deck-editor" className="fixed inset-0 z-[45]" {...PAGE_TRANSITION_PROPS}>
          <DeckEditor
            deck={this.state.editingDeckData}
            sorceryCards={this.state.sorceryCards}
            arenaProfile={this.state.arenaProfile}
            savedDecks={this.state.savedDecks}
            onSave={this.handleSaveDeckFromEditor}
            onBack={this.handleBackToGallery}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            onToggleFriends={this.handleToggleFriendsSidebar}
            friendListData={this.state.friendListData}
          />
          </motion.div>
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
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            savedDecks={this.state.isArenaMatch ? this.getArenaDecksForGameBoard() : this.state.savedDecks}
            onOpenSettings={this.handleOpenSettings}
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
            isSpectating={this.state.isSpectating}
            onMatchReward={this.handleMatchReward}
            onExit={() => {
              this.gameBoardRef = null;
              const returningToArena = this.state.isArenaMatch;
              const returningToDraft = this.state.draftEventId && this.state.draftPhase === 'tournament';
              stopMusic(2000);
              this.setState({
                isGameBoardOpen: false, sessionMode: null, sessionId: null, roomCode: null,
                isArenaMatch: false, isRankedMatch: false, isSpectating: false, spectateRoomCode: null,
                arenaMatchmakingOpponent: null,
                ...(returningToDraft ? { arenaView: 'draft-tournament' } : returningToArena ? { arenaView: 'hub' } : {}),
              });
            }}
          />
        ) : null}
        {this.state.isSpectating ? <SpectatorBanner onLeave={this.handleLeaveSpectate} /> : null}
        {showArena && this.state.arenaLoading ? (
          <LoadingIndicator message="Loading Arena" detail="Fetching your profile..." />
        ) : null}
        {showArena && this.state.arenaProfile && !this.state.arenaProfile.starterDeck ? (
          <ArenaStarterPicker
            sorceryCards={this.state.sorceryCards}
            onStarterChosen={this.handleStarterChosen}
          />
        ) : null}
        {showArena && this.state.arenaProfile?.starterDeck && !this.hasValidUsername() ? (
          <ArenaUsernamePrompt
            currentName={this.state.arenaProfile.name}
            onRegister={this.registerArenaUsername}
          />
        ) : null}
        {showArena && this.state.arenaProfile?.starterDeck && this.hasValidUsername() && this.state.arenaView === 'hub' ? (
          <ArenaHub
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            rank={this.state.arenaProfile.rank}
            isAdmin={this.state.arenaProfile?.name === 'Clutterfox'}
            onPlayMatch={this.handleArenaPlayMatch}
            onFindMatch={this.startMatchmaking}
            onOpenStore={this.openArenaStore}
            onOpenDeckBuilder={this.openArenaDeckBuilder}
            onOpenAuctionHouse={this.openAuctionHouse}
            onOpenArcaneTrials={this.openArcaneTrials}
            onOpenDraft={this.openDraftBrowser}
            onOpenGuild={this.openGuild}
            onUpdateName={this.updateArenaName}
            onUpdateAvatar={this.updateArenaAvatar}
            onUpdateProfile={(profile) => this.setState({ arenaProfile: profile })}
            friendListData={this.state.friendListData}
            onToggleFriends={this.handleToggleFriendsSidebar}
            onOpenSettings={this.handleOpenSettings}
            onViewProfile={this.handleViewFriendProfile}
            updateStatus={this.state.updateStatus}
            replayHubTutorial={this.state.replayHubTutorialRequested}
            onHubTutorialDismissed={() => this.setState({ replayHubTutorialRequested: false })}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            draftQueueDropdown={this.renderDraftQueueDropdown()}
          />
        ) : null}
        {this.state.arenaView === 'arcane-trials' && !this.state.isGameBoardOpen ? (
          <ArcaneTrials
            season={this.state.currentSeason}
            progress={this.state.arenaProfile?.seasonProgress}
            sorceryCards={this.state.sorceryCards}
            profile={this.state.arenaProfile}
            draftQueueDropdown={this.renderDraftQueueDropdown()}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            onToggleFriends={this.handleToggleFriendsSidebar}
            friendListData={this.state.friendListData}
            onClaimReward={this.handleClaimSeasonReward}
            onBack={() => { playUI(UI.CLOSE); this.setState({ arenaView: 'hub' }); }}
          />
        ) : null}
        {this.state.settingsOpen ? (
          <motion.div key="settings" className="fixed inset-0 z-[100]" {...PAGE_TRANSITION_PROPS}>
          <SettingsScreen
            profile={this.state.arenaProfile}
            updateStatus={this.state.updateStatus}
            updateManager={this.updateManager}
            onApply={this.handleApplyUpdate}
            onBack={this.handleCloseSettings}
            onLogout={this.handleLogout}
            onQuit={() => window.close()}
            onReplayHubTutorial={() => {
              // Close settings, return to the hub, and raise the
              // replay flag so ArenaHub.componentDidUpdate re-mounts
              // the overlay the moment it becomes visible again.
              this.setState({
                settingsOpen: false,
                arenaView: 'hub',
                replayHubTutorialRequested: true,
              });
            }}
          />
          </motion.div>
        ) : null}
        {showArena && this.state.arenaView === 'deck-select' ? (
          <ArenaDeckSelect
            decks={this.getArenaSavedDecks()}
            sorceryCards={this.state.sorceryCards}
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
          <motion.div key="store" className="fixed inset-0 z-[45]" {...PAGE_TRANSITION_PROPS}>
          <ArenaStore
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            pendingPacks={this.state.arenaPendingPacks}
            draftQueueDropdown={this.renderDraftQueueDropdown()}
            onBuyPack={this.buyArenaPack}
            onOpenPacks={this.openNextPack}
            onProfileUpdate={this.handleShardPurchaseUpdate}
            onBack={() => this.setState({ arenaView: 'hub' })}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            onToggleFriends={this.handleToggleFriendsSidebar}
            friendListData={this.state.friendListData}
          />
          </motion.div>
        ) : null}
        {showArena && this.state.arenaView === 'auction-house' ? (
          <motion.div key="auction-house" className="fixed inset-0 z-[45]" {...PAGE_TRANSITION_PROPS}>
          <AuctionHouse
            profile={this.state.arenaProfile}
            savedDecks={this.state.savedDecks}
            sorceryCards={this.state.sorceryCards}
            draftQueueDropdown={this.renderDraftQueueDropdown()}
            onRefreshDecks={this.refreshSavedDecks}
            onUpdateProfile={(profile) => this.setState({ arenaProfile: profile }, () => saveArenaProfile(profile))}
            onBack={() => this.setState({ arenaView: 'hub' })}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            onToggleFriends={this.handleToggleFriendsSidebar}
            friendListData={this.state.friendListData}
          />
          </motion.div>
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
        {showArena && this.state.arenaView === 'draft' ? (
          <motion.div key="draft" className="fixed inset-0 z-[45]" {...PAGE_TRANSITION_PROPS}>
          <DraftBrowser
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            guildId={this.state.guildId}
            friendListData={this.state.friendListData}
            activeDraftEventId={this.state.draftEventId}
            onDraftJoined={(eventId) => this.setState({ draftEventId: eventId, draftPhase: 'lobby' })}
            onDraftLeft={() => this.setState({ draftEventId: null, draftPhase: null })}
            onDraftCancelled={this.handleDraftCancelled}
            onDraftStarted={this.handleDraftStarted}
            onBack={() => { playUI(UI.CLOSE); this.setState({ arenaView: 'hub' }); }}
            draftQueueDropdown={this.renderDraftQueueDropdown()}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            onToggleFriends={this.handleToggleFriendsSidebar}
          />
          </motion.div>
        ) : null}
        {showArena && this.state.arenaView === 'draft-picking' && this.state.draftEventId ? (
          <DraftPicker
            eventId={this.state.draftEventId}
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            onBuildingPhase={this.handleDraftBuildingPhase}
          />
        ) : null}
        {showArena && this.state.arenaView === 'draft-building' && this.state.draftEventId ? (
          <DraftDeckBuilder
            eventId={this.state.draftEventId}
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            draftedCards={this.state.draftedCards}
            onTournamentStart={this.handleDraftTournamentStart}
          />
        ) : null}
        {showArena && this.state.arenaView === 'draft-tournament' && this.state.draftEventId ? (
          <DraftTournament
            eventId={this.state.draftEventId}
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            onPlayMatch={this.handleDraftPlayMatch}
            onSpectate={this.handleDraftSpectate}
            onDraftComplete={this.handleDraftComplete}
          />
        ) : null}
        {showArena && this.state.arenaView === 'draft-results' ? (
          <DraftResults
            eventId={this.state.draftEventId}
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            draftedCards={this.state.draftedCards}
            finalStandings={this.state.draftFinalStandings}
            prizes={this.state.draftPrizes}
            onBack={this.handleDraftBack}
          />
        ) : null}
        {showArena && this.state.arenaView === 'guild' ? (
          <motion.div key="guild" className="fixed inset-0 z-[45]" {...PAGE_TRANSITION_PROPS}>
          <GuildPanel
            profile={this.state.arenaProfile}
            friendListData={this.state.friendListData}
            onBack={() => { playUI(UI.CLOSE); this.setState({ arenaView: 'hub' }); }}
            onOpenDraftBrowser={this.openDraftBrowser}
            onOpenGuildLeaderboard={this.openGuildLeaderboard}
            draftQueueDropdown={this.renderDraftQueueDropdown()}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            onToggleFriends={this.handleToggleFriendsSidebar}
          />
          </motion.div>
        ) : null}
        {showArena && this.state.arenaView === 'guild-leaderboard' ? (
          <motion.div key="guild-leaderboard" className="fixed inset-0 z-[45]" {...PAGE_TRANSITION_PROPS}>
          <GuildLeaderboard
            profile={this.state.arenaProfile}
            myGuildId={this.state.guildId}
            onBack={() => { playUI(UI.CLOSE); this.setState({ arenaView: 'guild' }); }}
            draftQueueDropdown={this.renderDraftQueueDropdown()}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                lastChatMessage={this.state.lastChatMessage}
                lastChatClaimed={this.state.lastChatClaimed}
                onProfileReload={() => this.checkAuth()}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
                onAcceptDraftInvite={(eventId) => { this.setState({ draftEventId: eventId, draftPhase: 'lobby', arenaView: 'draft' }); }}
              />
            }
            onToggleFriends={this.handleToggleFriendsSidebar}
            friendListData={this.state.friendListData}
          />
          </motion.div>
        ) : null}
        {this.state.tradeActive ? (
          <TradeWindow
            collection={this.state.arenaProfile?.collection}
            sorceryCards={this.state.sorceryCards}
            partnerName={this.state.tradePartnerName}
            onOfferChanged={this.handleTradeOfferChanged}
            onLockIn={this.handleTradeLockIn}
            onConfirm={this.handleTradeConfirm}
            onCancel={this.handleTradeCancel}
          />
        ) : null}
        {this.state.viewingFriendProfile ? (
          <FriendProfileOverlay
            profileId={this.state.viewingFriendProfile}
            isFriend={this.state.friendListData?.friends?.some((f) => f.id === this.state.viewingFriendProfile) ?? false}
            sorceryCards={this.state.sorceryCards}
            onClose={() => this.setState({ viewingFriendProfile: null })}
            onInvite={this.handleFriendInvite}
            onSpectate={this.handleFriendSpectate}
            onTrade={this.handleFriendTrade}
            onSendMail={this.handleSendMailFromProfile}
            onRemoveFriend={async (id) => {
              await friendsApi.removeFriend(id).catch(() => {});
              this.setState({ viewingFriendProfile: null });
            }}
          />
        ) : null}
        </AnimatePresence>
        <FriendsSidebar
          open={this.state.friendsSidebarOpen}
          onClose={() => this.setState({ friendsSidebarOpen: false })}
          friendListData={this.state.friendListData}
          sorceryCards={this.state.sorceryCards}
          onViewProfile={this.handleViewFriendProfile}
        />
        {this.state.updateStatus?.state === 'READY_TO_INSTALL' ? (
          <UpdateModal
            newVersion={this.state.updateStatus.newVersion}
            releaseNotes={this.state.updateStatus.releaseNotes}
            onApply={this.handleApplyUpdate}
          />
        ) : null}
        <Toaster />
        {this.state.gameMenuOpen ? (
          <GameMenu
            onResume={this.handleGameMenuResume}
            onQuit={this.handleGameMenuQuit}
            onOpenSettings={this.handleOpenSettings}
            onMainMenu={(this.state.isGameBoardOpen || this.state.arenaView !== 'hub') ? this.handleGameMenuMainMenu : null}
            inSession={this.state.isGameBoardOpen && !!this.state.sessionMode}
            appVersion={this.state.updateStatus?.currentVersion}
          />
        ) : null}
        {this.renderAuthOverlay()}
      </>
    );
  }
}
