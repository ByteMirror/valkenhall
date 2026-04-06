import { Component } from 'preact';
import { UI } from '../utils/arena/uiSounds';
import { searchPlayers, sendFriendRequest } from '../utils/friendsApi';
import { saveArenaProfile } from '../utils/arena/profileApi';
import { generatePack } from '../utils/arena/packGenerator';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  DIALOG_STYLE, BEVELED_BTN, GOLD_BTN, DANGER_BTN, INPUT_STYLE,
  FourCorners, OrnamentalDivider,
} from '../lib/medievalTheme';

const ADMIN_USERNAMES = ['Clutterfox'];

export function isAdminUser(profile) {
  return ADMIN_USERNAMES.includes(profile?.name);
}

const FOIL_SEED_ENTRIES = [
  { cardId: 'sorcery-angel_ascendant', printingId: 'got-angel_ascendant-b-f', foiling: 'F', quantity: 4 },
  { cardId: 'sorcery-abaddon_succubus', printingId: 'got-abaddon_succubus-b-f', foiling: 'F', quantity: 4 },
  { cardId: 'sorcery-day_of_judgment', printingId: 'got-day_of_judgment-b-f', foiling: 'F', quantity: 4 },
  { cardId: 'sorcery-river_of_blood', printingId: 'got-river_of_blood-b-f', foiling: 'F', quantity: 4 },
  { cardId: 'sorcery-bladedancer', printingId: 'got-bladedancer-b-f', foiling: 'F', quantity: 4 },
  { cardId: 'sorcery-excalibur', printingId: 'art-excalibur-b-f', foiling: 'F', quantity: 4 },
  { cardId: 'sorcery-black_knight', printingId: 'art-black_knight-b-f', foiling: 'F', quantity: 4 },
  { cardId: 'sorcery-dragonlord', printingId: 'pro-dragonlord-op-rf', foiling: 'R', quantity: 4 },
  { cardId: 'sorcery-witch', printingId: 'pro-witch-op-rf', foiling: 'R', quantity: 4 },
  { cardId: 'sorcery-avatar_of_fire', printingId: 'pro-avatar_of_fire-op-rf', foiling: 'R', quantity: 4 },
  { cardId: 'sorcery-elementalist', printingId: 'pro-elementalist-op-rf', foiling: 'R', quantity: 4 },
];

export default class AdminPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      log: [],
      friendSearchQuery: '',
      friendSearchResults: null,
      friendSearching: false,
      goldAmount: 5000,
      packSet: 'gothic',
      packCount: 10,
    };
  }

  addLog = (message) => {
    this.setState((s) => ({ log: [...s.log.slice(-19), { time: new Date().toLocaleTimeString(), message }] }));
  };

  // ─── Seed foil cards ─────────────────────────────────
  handleSeedFoils = () => {
    const { profile, onUpdateProfile } = this.props;
    const collection = [...(profile.collection || [])];
    let added = 0;
    for (const entry of FOIL_SEED_ENTRIES) {
      const existing = collection.find((c) => c.printingId === entry.printingId && (c.foiling || 'S') === entry.foiling);
      if (existing) {
        if (existing.quantity < entry.quantity) {
          added += entry.quantity - existing.quantity;
          existing.quantity = entry.quantity;
        }
      } else {
        collection.push({ ...entry });
        added += entry.quantity;
      }
    }
    const updated = { ...profile, collection };
    onUpdateProfile(updated);
    saveArenaProfile(updated).catch(() => {});
    this.addLog(`Seeded ${added} foil cards (${FOIL_SEED_ENTRIES.length} unique)`);
  };

  // ─── Add gold ────────────────────────────────────────
  handleAddGold = () => {
    const { profile, onUpdateProfile } = this.props;
    const amount = parseInt(this.state.goldAmount, 10) || 0;
    const updated = { ...profile, coins: (profile.coins || 0) + amount };
    onUpdateProfile(updated);
    saveArenaProfile(updated).catch(() => {});
    this.addLog(`Added ${amount} gold (total: ${updated.coins})`);
  };

  // ─── Generate packs ──────────────────────────────────
  handleGeneratePacks = () => {
    const { profile, sorceryCards, onUpdateProfile } = this.props;
    const count = parseInt(this.state.packCount, 10) || 1;
    const setKey = this.state.packSet;
    const packs = [];
    for (let i = 0; i < count; i++) {
      packs.push(generatePack(sorceryCards, setKey));
    }
    // Add all cards from packs directly to collection
    const collection = [...(profile.collection || [])];
    let totalCards = 0;
    for (const pack of packs) {
      for (const entry of pack.cards) {
        if (!entry.card) continue;
        const cardId = entry.card.unique_id;
        const printingId = entry.printing?.unique_id || '';
        const foiling = entry.printing?.foiling || 'S';
        const existing = collection.find(
          (c) => c.cardId === cardId && c.printingId === printingId && (c.foiling || 'S') === foiling
        );
        if (existing) existing.quantity++;
        else collection.push({ cardId, printingId, foiling, quantity: 1 });
        totalCards++;
      }
    }
    const updated = { ...profile, collection };
    onUpdateProfile(updated);
    saveArenaProfile(updated).catch(() => {});
    this.addLog(`Opened ${count} ${setKey} packs → ${totalCards} cards added to collection`);
  };

  // ─── Grant all cards ─────────────────────────────────
  handleGrantAllCards = () => {
    const { profile, sorceryCards, onUpdateProfile } = this.props;
    const collection = [...(profile.collection || [])];
    let added = 0;
    for (const card of (sorceryCards || [])) {
      const cardId = card.unique_id;
      const existing = collection.find((c) => c.cardId === cardId);
      if (!existing) {
        const printingId = card.printings?.[0]?.unique_id || '';
        collection.push({ cardId, printingId, foiling: 'S', quantity: 4 });
        added++;
      } else if (existing.quantity < 4) {
        added++;
        existing.quantity = 4;
      }
    }
    const updated = { ...profile, collection };
    onUpdateProfile(updated);
    saveArenaProfile(updated).catch(() => {});
    this.addLog(`Granted all cards (${added} new/updated, ${sorceryCards?.length || 0} total in game)`);
  };

  // ─── Friend search & add ─────────────────────────────
  handleFriendSearch = async () => {
    const q = this.state.friendSearchQuery.trim();
    if (q.length < 2) return;
    this.setState({ friendSearching: true });
    try {
      const results = await searchPlayers(q);
      this.setState({ friendSearchResults: results, friendSearching: false });
      this.addLog(`Found ${results.length} players matching "${q}"`);
    } catch {
      this.setState({ friendSearchResults: [], friendSearching: false });
      this.addLog(`Friend search failed for "${q}"`);
    }
  };

  handleSendFriendRequest = async (targetId, targetName) => {
    try {
      await sendFriendRequest(targetId);
      this.addLog(`Friend request sent to ${targetName}`);
    } catch (err) {
      this.addLog(`Failed to send request to ${targetName}: ${err.message}`);
    }
  };

  // ─── Send test mail ──────────────────────────────────
  handleSendTestMail = async () => {
    const { profile } = this.props;
    if (!profile?.serverToken) {
      this.addLog('No auth token — cannot send test mail');
      return;
    }
    try {
      const res = await fetch('https://fab-matchmaking.vercel.app/api/mail/test-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${profile.serverToken}` },
        body: JSON.stringify({
          senderName: 'Auction House',
          subject: 'Your Bladedancer sold!',
          body: 'A fellow adventurer purchased your Bladedancer for 350 gold. The proceeds have been added to this letter. May fortune favour your trades!',
          cards: ['sorcery-bladedancer'],
          coins: 350,
        }),
      });
      const result = await res.json();
      if (result.success) {
        this.addLog(`Test mail sent (id: ${result.mailId})`);
      } else {
        this.addLog(`Test mail failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      this.addLog(`Test mail error: ${err.message}`);
    }
  };

  // ─── Set XP/Level ────────────────────────────────────
  handleSetLevel = (level) => {
    const { profile, onUpdateProfile } = this.props;
    // XP formula: each level needs level*100 XP, cumulative
    const xp = Array.from({ length: level }, (_, i) => (i + 1) * 100).reduce((a, b) => a + b, 0);
    const updated = { ...profile, xp };
    onUpdateProfile(updated);
    saveArenaProfile(updated).catch(() => {});
    this.addLog(`Set level to ${level} (${xp} XP)`);
  };

  render() {
    const { onClose } = this.props;
    const { log, friendSearchQuery, friendSearchResults, friendSearching, goldAmount, packSet, packCount } = this.state;

    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
        <div
          className="relative w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          style={{ ...DIALOG_STYLE }}
          onClick={(e) => e.stopPropagation()}
        >
          <FourCorners />

          {/* Header */}
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${GOLD} 0.15)` }}>
            <h2 className="text-lg font-bold arena-heading" style={{ color: ACCENT_GOLD, textShadow: `0 0 12px ${GOLD} 0.2)` }}>
              Admin Panel
            </h2>
            <button
              type="button"
              className="px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all hover:scale-[1.03]"
              style={{ ...BEVELED_BTN, color: TEXT_MUTED }}
              data-sound={UI.CANCEL}
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {/* ─── Collection Commands ─────────────────────── */}
            <Section title="Collection">
              <div className="flex flex-wrap gap-2">
                <AdminButton onClick={this.handleSeedFoils}>Seed Foil Cards</AdminButton>
                <AdminButton onClick={this.handleGrantAllCards}>Grant All Cards ×4</AdminButton>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Open packs:</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={packCount}
                  onInput={(e) => this.setState({ packCount: e.target.value })}
                  className="w-16 px-2 py-1 text-xs text-center"
                  style={INPUT_STYLE}
                />
                <select
                  value={packSet}
                  onChange={(e) => this.setState({ packSet: e.target.value })}
                  className="px-2 py-1 text-xs"
                  style={{ ...INPUT_STYLE, color: TEXT_BODY }}
                >
                  <option value="gothic">Gothic</option>
                  <option value="arthurian">Arthurian</option>
                  <option value="beta">Beta</option>
                </select>
                <AdminButton onClick={this.handleGeneratePacks}>Open & Add</AdminButton>
              </div>
            </Section>

            {/* ─── Economy Commands ────────────────────────── */}
            <Section title="Economy">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={goldAmount}
                  onInput={(e) => this.setState({ goldAmount: e.target.value })}
                  className="w-24 px-2 py-1 text-xs text-center"
                  style={INPUT_STYLE}
                />
                <AdminButton onClick={this.handleAddGold}>Add Gold</AdminButton>
              </div>
            </Section>

            {/* ─── Level Commands ──────────────────────────── */}
            <Section title="Level">
              <div className="flex flex-wrap gap-2">
                {[5, 10, 20, 50].map((lvl) => (
                  <AdminButton key={lvl} onClick={() => this.handleSetLevel(lvl)}>Set Lvl {lvl}</AdminButton>
                ))}
              </div>
            </Section>

            {/* ─── Mail Commands ──────────────────────────── */}
            <Section title="Mail">
              <div className="flex flex-wrap gap-2">
                <AdminButton onClick={this.handleSendTestMail}>Send Test Auction Mail</AdminButton>
              </div>
              <div className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>
                Sends a mail with 1 Bladedancer card + 350 gold attached
              </div>
            </Section>

            {/* ─── Friends Commands ────────────────────────── */}
            <Section title="Friends">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search player name..."
                  value={friendSearchQuery}
                  onInput={(e) => this.setState({ friendSearchQuery: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && this.handleFriendSearch()}
                  className="flex-1 px-3 py-1.5 text-xs"
                  style={INPUT_STYLE}
                />
                <AdminButton onClick={this.handleFriendSearch} disabled={friendSearching}>
                  {friendSearching ? 'Searching...' : 'Search'}
                </AdminButton>
              </div>
              {friendSearchResults && (
                <div className="mt-2 flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {friendSearchResults.length === 0 ? (
                    <span className="text-xs" style={{ color: TEXT_MUTED }}>No players found</span>
                  ) : friendSearchResults.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-2 py-1 rounded" style={{ background: `${GOLD} 0.04)` }}>
                      <span className="text-xs" style={{ color: TEXT_BODY }}>{p.name}</span>
                      <button
                        type="button"
                        className="text-[10px] px-2 py-0.5 rounded font-semibold transition-all hover:scale-[1.05]"
                        style={{ background: `${GOLD} 0.15)`, color: ACCENT_GOLD, border: `1px solid ${GOLD} 0.3)` }}
                        onClick={() => this.handleSendFriendRequest(p.id, p.name)}
                      >
                        Add Friend
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ─── Log ────────────────────────────────────── */}
            <Section title="Log">
              <div className="max-h-28 overflow-y-auto flex flex-col gap-0.5">
                {log.length === 0 ? (
                  <span className="text-[11px]" style={{ color: TEXT_MUTED }}>No actions yet</span>
                ) : log.map((entry, i) => (
                  <div key={i} className="text-[11px]" style={{ color: TEXT_BODY }}>
                    <span style={{ color: TEXT_MUTED }}>[{entry.time}]</span> {entry.message}
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </div>
    );
  }
}

function Section({ title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest arena-heading" style={{ color: `${GOLD} 0.5)` }}>{title}</span>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${GOLD} 0.2), transparent)` }} />
      </div>
      {children}
    </div>
  );
}

function AdminButton({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40"
      style={BEVELED_BTN}
      onClick={onClick}
      disabled={disabled}
    >
      <span style={{ color: TEXT_BODY }}>{children}</span>
    </button>
  );
}
