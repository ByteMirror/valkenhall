import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import AppHeader from './AppHeader';
import { UI } from '../utils/arena/uiSounds';
import { getGuildLeaderboard } from '../utils/arena/guildApi';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  VIGNETTE, PANEL_STYLE,
  BEVELED_BTN, INPUT_STYLE,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import AmbientParticles from './AmbientParticles';

export default class GuildLeaderboard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      guilds: [],
      loading: true,
      search: '',
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.loadLeaderboard();
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  loadLeaderboard = async () => {
    this.setState({ loading: true });
    try {
      const data = await getGuildLeaderboard();
      this.setState({ guilds: data || [], loading: false });
    } catch (err) {
      console.error('[GuildLeaderboard] load failed:', err);
      this.setState({ guilds: [], loading: false });
    }
  };

  getFiltered() {
    const { guilds, search } = this.state;
    const q = search.toLowerCase().trim();
    if (!q) return guilds;
    return guilds.filter((g) => g.name.toLowerCase().includes(q));
  }

  render() {
    const { profile, onBack, onToggleMailbox, mailboxUnreadCount, mailboxDropdown, onToggleFriends, friendListData, myGuildId } = this.props;
    const { loading, search, viewScale } = this.state;
    const filtered = this.getFiltered();

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: '#08080a' }}>
        <div className="absolute inset-0" style={{ background: `url('/hub-bg.png') center/cover no-repeat`, filter: 'blur(3px)', transform: 'scale(1.02)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.7) 100%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <AmbientParticles />

        <AppHeader
          profile={profile}
          onToggleMailbox={onToggleMailbox}
          mailboxUnreadCount={mailboxUnreadCount}
          mailboxDropdown={mailboxDropdown}
          onToggleFriends={onToggleFriends}
          friendListData={friendListData}
          draftQueueDropdown={this.props.draftQueueDropdown}
          zoom={viewScale}
        />

        <div className="relative z-10 flex-1 flex flex-col items-center overflow-hidden px-8 py-4" style={{ zoom: viewScale }}>
          <div className="w-full max-w-2xl">
            {/* Title bar */}
            <div className="flex items-center gap-4 mb-4">
              <button type="button" className="px-4 py-1.5 text-sm transition-all cursor-pointer" style={{ ...BEVELED_BTN, color: TEXT_BODY }} data-sound={UI.CLOSE} onClick={onBack}>← Back</button>
              <h1 className="text-2xl font-bold arena-heading" style={{ color: ACCENT_GOLD, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.15)' }}>
                Guild Leaderboard
              </h1>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search guilds..."
              value={search}
              onChange={(e) => this.setState({ search: e.target.value })}
              style={{ ...INPUT_STYLE, width: '100%', marginBottom: 12 }}
            />

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-16"><RuneSpinner size={48} /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: TEXT_MUTED }}>No guilds found</div>
            ) : (
              <div className="rounded overflow-hidden" style={PANEL_STYLE}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${GOLD} 0.15)` }}>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>#</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>Guild</th>
                      <th className="text-center px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>Members</th>
                      <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>Total Wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((guild, i) => {
                      const isMyGuild = guild.id === myGuildId;
                      const rank = i + 1;
                      return (
                        <tr
                          key={guild.id}
                          style={{
                            background: isMyGuild ? 'rgba(212,168,67,0.06)' : 'transparent',
                            borderBottom: `1px solid ${GOLD} 0.06)`,
                          }}
                        >
                          <td className="px-4 py-2.5 tabular-nums font-bold" style={{ color: rank <= 3 ? ACCENT_GOLD : TEXT_MUTED }}>
                            {rank}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-semibold" style={{ color: isMyGuild ? ACCENT_GOLD : TEXT_PRIMARY }}>{guild.name}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums" style={{ color: TEXT_BODY }}>{guild.memberCount}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: TEXT_PRIMARY }}>{guild.totalWins}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
