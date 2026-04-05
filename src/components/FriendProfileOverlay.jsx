import { Component } from 'preact';
import { cn } from '../lib/utils';
import { getPublicProfile } from '../utils/friendsApi';
import { xpProgressInLevel } from '../utils/arena/profileDefaults';
import { formatRank, TIER_COLORS } from '../utils/arena/rankUtils';

export default class FriendProfileOverlay extends Component {
  constructor(props) {
    super(props);
    this.state = { profile: null, loading: true, error: null };
  }

  componentDidMount() {
    this.loadProfile();
  }

  async loadProfile() {
    try {
      const profile = await getPublicProfile(this.props.profileId);
      this.setState({ profile, loading: false });
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
  }

  render() {
    const { onClose } = this.props;
    const { profile, loading, error } = this.state;

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {loading ? (
            <div className="text-center text-white/40 py-8">Loading...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : profile ? (() => {
            const progress = xpProgressInLevel(profile.xp || 0);
            const level = progress.level;
            const rankColor = TIER_COLORS[profile.rank?.tier] || 'text-white';
            const wins = profile.wins || 0;
            const losses = profile.losses || 0;
            const total = wins + losses;
            const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

            return (
              <div>
                <div className="flex items-center gap-4 mb-5">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="" className="w-16 h-16 rounded-xl object-cover object-top border-2 border-white/10" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center text-2xl text-white/20">?</div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-white">{profile.name}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-amber-400 text-sm font-semibold">Lv. {level}</span>
                      <span className={cn('text-sm font-semibold', rankColor)}>{formatRank(profile.rank?.tier, profile.rank?.division)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 text-center">
                    <div className="text-lg font-bold text-white">{total}</div>
                    <div className="text-[10px] text-muted-foreground">Matches</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 text-center">
                    <div className="text-lg font-bold text-green-400">{wins}</div>
                    <div className="text-[10px] text-muted-foreground">Wins</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 text-center">
                    <div className="text-lg font-bold text-white/60">{winRate}%</div>
                    <div className="text-[10px] text-muted-foreground">Win Rate</div>
                  </div>
                </div>

                {profile.collectionSize != null ? (
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 mb-4">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Collection</div>
                    <div className="text-sm text-white/70">{profile.uniqueCards || 0} unique &middot; {profile.collectionSize} total</div>
                  </div>
                ) : null}

                <div className="text-right">
                  <button type="button" className="rounded-lg border border-white/20 px-4 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={onClose}>Close</button>
                </div>
              </div>
            );
          })() : null}
        </div>
      </div>
    );
  }
}
