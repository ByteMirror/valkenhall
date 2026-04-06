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
import { loadArenaProfile, saveArenaProfile } from './utils/arena/profileApi';
import { playMusic, stopMusic } from './utils/arena/musicManager';
import { playUI, UI, preloadUISounds } from './utils/arena/uiSounds';
import { createDefaultProfile, CURRENCY, isArenaDebugMode } from './utils/arena/profileDefaults';
import { checkAchievements, getAchievement } from './utils/arena/achievements';
import { buildOwnedMap, buildUsedMap, getAvailableQuantity } from './utils/arena/collectionUtils';
import { generatePack } from './utils/arena/packGenerator';
import { resolveStarterDeck } from './utils/arena/starterDecks';
import { generateSeason, createDefaultSeasonProgress, initializeQuests, processMatchResult } from './utils/arena/seasonPass';
import ArenaMatchmaking from './components/ArenaMatchmaking';
import ArenaDeckSelect from './components/ArenaDeckSelect';
import ArenaUsernamePrompt from './components/ArenaUsernamePrompt';
import GameMenu from './components/GameMenu';
import LoginScreen from './components/LoginScreen';
import { clearQueueState, joinQueue, leaveQueue, pollQueueStatus, reportMatchResult, deleteAccount } from './utils/arena/matchmakingApi';
import { getStoredToken, validateToken, clearStoredToken } from './utils/authApi';
import FriendsSidebar from './components/FriendsSidebar';
import FriendProfileOverlay from './components/FriendProfileOverlay';
import SpectatorBanner from './components/SpectatorBanner';
import RuneSpinner from './components/RuneSpinner';
import LoadingIndicator from './components/LoadingIndicator';
import FirstRunDownload from './components/FirstRunDownload';
import TradeWindow from './components/TradeWindow';
import { startPresence, stopPresence, updateActivity } from './utils/presenceManager';
import * as friendsApi from './utils/friendsApi';
import { createUpdateManager } from './utils/updateManager';
import UpdateModal from './components/UpdateModal';
import SettingsScreen from './components/SettingsScreen';
import DeckGallery from './components/DeckGallery';
import DeckEditor from './components/DeckEditor';
import Mailbox from './components/Mailbox';
import ArcaneTrials from './components/ArcaneTrials';

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
    this.refreshSavedDecks();

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
          });
          this.postLoginInit();
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
      starterDeck: serverProfile.starterDeck || null,
      profileAvatar: serverProfile.profileAvatar || null,
      serverToken: token,
      serverRegistered: true,
      rank: serverProfile.rank || { tier: 'apprentice', division: 4, lp: 0 },
      collection: serverProfile.collection || [],
      decks: serverProfile.decks || [],
      matchHistory: serverProfile.matchHistory || [],
      achievements: serverProfile.achievements || [],
      seasonProgress: serverProfile.seasonProgress || null,
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
    });
    this.postLoginInit();
  };

  initSeason = () => {
    if (!this.state.sorceryCards?.length || !this.state.arenaProfile) return;
    const season = generateSeason(this.state.sorceryCards);
    let progress = this.state.arenaProfile.seasonProgress;
    if (!progress || progress.seasonId !== season.seasonId) {
      progress = createDefaultSeasonProgress(season.seasonId);
    }
    progress = initializeQuests(progress, season);
    const updatedProfile = { ...this.state.arenaProfile, seasonProgress: progress };
    this.setState({ currentSeason: season, arenaProfile: updatedProfile });
    saveArenaProfile(updatedProfile).catch(() => {});
  };

  postLoginInit = () => {
    preloadUISounds();
    this.initSeason();
    playMusic('arena-hub', { fadeInDuration: 3000 });
    startPresence('hub', {
      onFriendListUpdate: (data) => this.setState({ friendListData: data }),
      onNewNotifications: this.handleNewNotifications,
      onMailCountUpdate: (counts) => this.setState({ mailboxUnreadCount: counts.count }),
    });
    this.checkAssetDownload();
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
      try {
        const result = await friendsApi.acceptMatchInvite(toastData?.senderId);
        this.handleInviteAccepted(result, { isHost: true });
      } catch {}
    } else if (actionKey === 'decline-invite') {
      await friendsApi.declineMatchInvite(toastData?.senderId).catch(() => {});
    } else if (actionKey === 'allow-spectate') {
      await friendsApi.allowSpectator(toastData?.spectatorId).catch(() => {});
    } else if (actionKey === 'deny-spectate') {
      await friendsApi.denySpectator(toastData?.spectatorId).catch(() => {});
    }
  };

  handleInviteAccepted = (result, { isHost = false } = {}) => {
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
    this.setState({
      isSpectating: false,
      isGameBoardOpen: false,
      spectateRoomCode: null,
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
    try {
      const { executeTrade } = await import('./utils/friendsApi');
      this.addToast({ title: 'Trade Complete', message: 'Cards exchanged!' });
      this.setState({ tradeActive: false, tradePartnerName: null, tradeRoomCode: null });
    } catch (err) {
      this.addToast({ title: 'Trade Failed', message: err.message });
    }
  };

  handleTradeCancel = () => {
    this.setState({ tradeActive: false, tradePartnerName: null, tradeRoomCode: null });
  };

  handleFriendInvite = async (friendId) => {
    try {
      await friendsApi.sendMatchInvite(friendId);
      this.addToast({ title: 'Invite Sent', message: 'Waiting for response...' });
    } catch (err) {
      this.addToast({ title: 'Invite Failed', message: err.message });
    }
  };

  handleFriendSpectate = async (friendId) => {
    try {
      await friendsApi.requestSpectate(friendId);
      this.addToast({ title: 'Spectate Requested', message: 'Waiting for permission...' });
    } catch (err) {
      this.addToast({ title: 'Request Failed', message: err.message });
    }
  };

  handleViewFriendProfile = (profileId) => {
    this.setState({ viewingFriendProfile: profileId });
  };

  handleFriendTrade = async (friendId) => {
    try {
      await friendsApi.requestTrade(friendId);
      this.addToast({ title: 'Trade Request Sent', message: 'Waiting for response...' });
    } catch (err) {
      this.addToast({ title: 'Trade Failed', message: err.message });
    }
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
    const arenaDecks = this.state.arenaProfile?.decks || [];
    const localById = new Map(this.state.savedDecks.map((d) => [d.id, d]));

    return arenaDecks.map((arenaDeck) => {
      const local = localById.get(arenaDeck.id);
      return {
        id: arenaDeck.id,
        name: arenaDeck.name,
        cards: arenaDeck.cards || [],
        cardCount: arenaDeck.cards?.length || 0,
        previewUrl: local?.previewUrl || arenaDeck.previewUrl || null,
        savedAt: local?.savedAt || null,
        format: local?.format || '',
      };
    });
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
    const token = arenaProfile?.serverToken;

    // Delete game account on server (matchmaking, leaderboard, etc.)
    if (token) {
      await deleteAccount(token).catch((e) => console.error('Failed to delete server account:', e));
    }

    // Create a fresh default profile but keep the auth token so we can save it
    const profile = {
      ...createDefaultProfile(),
      serverToken: token || null,
      email: arenaProfile?.email || null,
      id: arenaProfile?.id || null,
    };

    this.setState({ arenaProfile: profile });

    // Save the blank profile to the server, overwriting the old data
    if (token) {
      await saveArenaProfile(profile).catch((e) => console.error('Failed to save reset profile:', e));
    }
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

    const tier = currentSeason.tiers.find(t => t.level === level);
    if (!tier) return;

    const progress = arenaProfile.seasonProgress;
    if (progress.seasonXp < tier.xpRequired || progress.claimedTiers.includes(level)) return;

    const updatedProgress = {
      ...progress,
      claimedTiers: [...progress.claimedTiers, level],
    };

    let coins = arenaProfile.coins;
    if (tier.reward.coins) coins += tier.reward.coins;

    let collection = [...arenaProfile.collection];
    if (tier.reward.foilCardId && tier.reward.foilPrintingId) {
      const existing = collection.find(c => c.cardId === tier.reward.foilCardId && c.printingId === tier.reward.foilPrintingId);
      if (existing) existing.quantity++;
      else collection.push({ cardId: tier.reward.foilCardId, printingId: tier.reward.foilPrintingId, quantity: 1 });
    }

    const updatedProfile = { ...arenaProfile, coins, collection, seasonProgress: updatedProgress };
    this.setState({ arenaProfile: updatedProfile });
    await saveArenaProfile(updatedProfile).catch(() => {});

    if (tier.reward.coins) toast.success(`+${tier.reward.coins} coins!`);
    if (tier.reward.foilCardName) toast.success(`Foil ${tier.reward.foilRarity}: ${tier.reward.foilCardName}!`, { duration: 5000 });
  };

  openArcaneTrials = () => {
    playUI(UI.OPEN);
    if (!this.state.currentSeason) this.initSeason();
    this.setState({ arenaView: 'arcane-trials' });
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

    let withAchievements = this.processAchievements(updatedProfile);
    if (this.state.currentSeason && withAchievements.seasonProgress) {
      const seasonResult = processMatchResult(withAchievements.seasonProgress, this.state.currentSeason, reward.won);
      withAchievements = { ...withAchievements, seasonProgress: seasonResult.progress };
      const totalSeasonXp = seasonResult.matchXpEarned + seasonResult.questXpEarned;
      toast(`Season XP: +${totalSeasonXp}`, { duration: 3000 });
    }
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
    playUI('snd-open-store.wav', { volume: 0.5 });
    playMusic('arena-store', { fadeInDuration: 3000 });
    this.setState({ arenaView: 'store' });
  };

  openAuctionHouse = () => {
    playUI('snd-open-auction.wav', { volume: 0.5 });
    this.setState({ arenaView: 'auction-house' });
  };

  buyArenaPack = (setKey, quantity = 1) => {
    playUI(UI.PURCHASE);
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
      const foiling = entry.printing?.foiling || 'S';
      const existing = updatedProfile.collection.find(
        (c) => c.cardId === cardId && c.printingId === printingId && (c.foiling || 'S') === foiling
      );
      if (existing) {
        existing.quantity++;
      } else {
        updatedProfile.collection.push({ cardId, printingId, foiling, quantity: 1 });
      }
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
      // Try arena profile first (avoids 404 for decks not in local storage)
      const arenaDeck = this.state.arenaProfile?.decks?.find((d) => d.id === deckId);
      let savedDeck;

      if (arenaDeck) {
        savedDeck = { id: arenaDeck.id, name: arenaDeck.name, cards: arenaDeck.cards || [] };
      } else {
        savedDeck = await loadSavedDeckById(deckId, 'sorcery');
        if (!savedDeck) return;
      }

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

  // Legacy sync — only used by handleStarterChosen for initial deck setup.
  // Normal save/delete operations update the server profile directly.
  syncArenaProfileDecks = (savedDecks, extraDeckData) => {
    this.setState((state) => {
      const { arenaProfile } = state;
      if (!arenaProfile) return null;

      // Build deck list from savedDecks summaries + any full card data we have
      const currentArenaDecks = arenaProfile.decks || [];
      const updatedDecks = savedDecks.map((summary) => {
        // Prefer extra data (just-saved payload), then existing arena deck, then summary-only
        const extra = extraDeckData?.get(summary.id);
        const existing = currentArenaDecks.find((d) => d.id === summary.id);
        return {
          id: summary.id,
          name: summary.name,
          cards: extra?.cards || existing?.cards || [],
          previewUrl: summary.previewUrl || existing?.previewUrl || null,
        };
      });

      return { arenaProfile: { ...arenaProfile, decks: updatedDecks } };
    }, () => {
      if (this.state.arenaProfile) {
        saveArenaProfile(this.state.arenaProfile).catch((e) => console.error('Failed to sync arena profile:', e));
      }
    });
  };

  handleSaveDeckFromEditor = async (payload) => {
    playUI(UI.CONFIRM);
    const savedSummary = await saveSavedDeck(payload, 'sorcery');

    const nextSavedDecks = [savedSummary, ...this.state.savedDecks.filter((d) => d.id !== savedSummary.id)];

    this.setState({
      savedDecks: nextSavedDecks,
      editingDeckData: {
        ...this.state.editingDeckData,
        id: savedSummary.id,
        name: savedSummary.name,
      },
    });

    // Update this deck in the server profile (don't rebuild from local storage)
    this.setState((state) => {
      const { arenaProfile } = state;
      if (!arenaProfile) return null;
      const currentDecks = arenaProfile.decks || [];
      const deckEntry = {
        id: savedSummary.id,
        name: savedSummary.name,
        cards: payload.cards,
        previewUrl: savedSummary.previewUrl || null,
      };
      const updatedDecks = currentDecks.some((d) => d.id === savedSummary.id)
        ? currentDecks.map((d) => d.id === savedSummary.id ? deckEntry : d)
        : [...currentDecks, deckEntry];
      return { arenaProfile: { ...arenaProfile, decks: updatedDecks } };
    }, () => {
      if (this.state.arenaProfile) {
        saveArenaProfile(this.state.arenaProfile).catch((e) => console.error('Failed to save profile:', e));
      }
    });

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
      const nextSavedDecks = this.state.savedDecks.filter((d) => d.id !== deckId);
      this.setState({ savedDecks: nextSavedDecks });
      // Remove from server profile directly
      this.setState((state) => {
        const { arenaProfile } = state;
        if (!arenaProfile) return null;
        return { arenaProfile: { ...arenaProfile, decks: (arenaProfile.decks || []).filter((d) => d.id !== deckId) } };
      }, () => {
        if (this.state.arenaProfile) {
          saveArenaProfile(this.state.arenaProfile).catch((e) => console.error('Failed to save profile:', e));
        }
      });
    } catch (error) {
      console.error('Failed to delete deck:', error);
    }
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

  handleGameMenuResume = () => this.setState({ gameMenuOpen: false });

  handleGameMenuQuit = () => window.close();

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
          {this.state.gameMenuOpen ? <GameMenu onResume={this.handleGameMenuResume} onQuit={this.handleGameMenuQuit} onOpenSettings={this.handleOpenSettings} /> : null}
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
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
              />
            }
            onToggleFriends={() => this.setState((s) => ({ friendsSidebarOpen: !s.friendsSidebarOpen }))}
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
            onSave={this.handleSaveDeckFromEditor}
            onBack={this.handleBackToGallery}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
              />
            }
            onToggleFriends={() => this.setState((s) => ({ friendsSidebarOpen: !s.friendsSidebarOpen }))}
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
              stopMusic(2000);
              this.setState({
                isGameBoardOpen: false, sessionMode: null, sessionId: null, roomCode: null, isArenaMatch: false, isRankedMatch: false,
                ...(returningToArena ? { arenaView: 'hub' } : {}),
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
            onUpdateName={this.updateArenaName}
            onUpdateAvatar={this.updateArenaAvatar}
            onResetProfile={this.resetArenaProfile}
            onUpdateProfile={(profile) => this.setState({ arenaProfile: profile })}
            friendListData={this.state.friendListData}
            onToggleFriends={() => this.setState((s) => ({ friendsSidebarOpen: !s.friendsSidebarOpen }))}
            onOpenSettings={this.handleOpenSettings}
            onViewProfile={this.handleViewFriendProfile}
            updateStatus={this.state.updateStatus}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
              />
            }
          />
        ) : null}
        {this.state.arenaView === 'arcane-trials' && !this.state.isGameBoardOpen ? (
          <ArcaneTrials
            season={this.state.currentSeason}
            progress={this.state.arenaProfile?.seasonProgress}
            sorceryCards={this.state.sorceryCards}
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
            onResetProfile={this.resetArenaProfile}
            onQuit={() => window.close()}
          />
          </motion.div>
        ) : null}
        {showArena && this.state.arenaView === 'deck-select' ? (
          <ArenaDeckSelect
            decks={this.state.arenaProfile?.decks || []}
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
            pendingPacks={this.state.arenaPendingPacks}
            onBuyPack={this.buyArenaPack}
            onOpenPacks={this.openNextPack}
            onBack={() => this.setState({ arenaView: 'hub' })}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
              />
            }
            onToggleFriends={() => this.setState((s) => ({ friendsSidebarOpen: !s.friendsSidebarOpen }))}
            friendListData={this.state.friendListData}
          />
          </motion.div>
        ) : null}
        {showArena && this.state.arenaView === 'auction-house' ? (
          <motion.div key="auction-house" className="fixed inset-0 z-[45]" {...PAGE_TRANSITION_PROPS}>
          <AuctionHouse
            profile={this.state.arenaProfile}
            sorceryCards={this.state.sorceryCards}
            onUpdateProfile={(profile) => this.setState({ arenaProfile: profile }, () => saveArenaProfile(profile))}
            onBack={() => this.setState({ arenaView: 'hub' })}
            onToggleMailbox={this.handleToggleMailbox}
            mailboxUnreadCount={this.state.mailboxUnreadCount}
            mailboxDropdown={
              <Mailbox
                open={this.state.mailboxOpen}
                onClose={() => this.setState({ mailboxOpen: false, mailboxSelectedMailId: null, mailboxView: null, mailboxComposeRecipientId: null })}
                profile={this.state.arenaProfile}
                friendListData={this.state.friendListData}
                sorceryCards={this.state.sorceryCards}
                onProfileUpdate={this.handleMailProfileUpdate}
                selectedMailId={this.state.mailboxSelectedMailId}
                initialView={this.state.mailboxView}
                composeRecipientId={this.state.mailboxComposeRecipientId}
              />
            }
            onToggleFriends={() => this.setState((s) => ({ friendsSidebarOpen: !s.friendsSidebarOpen }))}
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
        {this.state.gameMenuOpen ? <GameMenu onResume={this.handleGameMenuResume} onQuit={this.handleGameMenuQuit} onOpenSettings={this.handleOpenSettings} /> : null}
        {this.renderAuthOverlay()}
      </>
    );
  }
}
