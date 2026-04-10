import { Component } from 'preact';
import { UI } from '../utils/arena/uiSounds';
import { getDraftEvent, getDraftStandings, subscribeToDraftEvents } from '../utils/arena/draftApi';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  PANEL_STYLE, BEVELED_BTN, GOLD_BTN,
  OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import AmbientParticles from './AmbientParticles';

export default class DraftTournament extends Component {
  constructor(props) {
    super(props);
    this.state = {
      standings: [],
      pairings: [],
      currentRound: 1,
      totalRounds: 1,
      myMatchRoomId: null,
      prizeCard: null,
      loading: true,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.unsubDraft = subscribeToDraftEvents({
      round_start: (data) => {
        this.setState({
          pairings: data.pairings || [],
          currentRound: data.round,
          totalRounds: data.totalRounds,
          myMatchRoomId: data.myRoomId || null,
        });
        this.loadStandings();
      },
      round_result: (data) => {
        this.setState((s) => ({ pairings: data.pairings || s.pairings }));
        this.loadStandings();
      },
      complete: (data) => {
        this.props.onDraftComplete?.(data);
      },
    });
    this.loadStandings();
  }

  componentWillUnmount() {
    this.unsubScale?.();
    this.unsubDraft?.();
  }

  loadStandings = async () => {
    try {
      const [data, event] = await Promise.all([
        getDraftStandings(this.props.eventId),
        this.state.prizeCard ? null : getDraftEvent(this.props.eventId),
      ]);
      const pairings = data.currentPairings || this.state.pairings;

      // Extract myRoomId from pairings if not set
      let myRoomId = this.state.myMatchRoomId;
      if (!myRoomId && pairings.length > 0) {
        const myPairing = pairings.find(
          (p) => p.player1Id === this.props.profile?.id || p.player2Id === this.props.profile?.id
        );
        if (myPairing?.roomId) myRoomId = myPairing.roomId;
      }

      this.setState((s) => ({
        standings: data.standings || [],
        pairings,
        currentRound: data.currentRound || s.currentRound,
        totalRounds: data.totalRounds || s.totalRounds,
        myMatchRoomId: myRoomId || s.myMatchRoomId,
        prizeCard: event?.prizeCard || s.prizeCard,
        loading: false,
      }));
    } catch (err) {
      console.error('[DraftTournament] loadStandings failed:', err);
      this.setState({ loading: false });
    }
  };

  render() {
    const { profile, onPlayMatch } = this.props;
    const { standings, pairings, currentRound, totalRounds, myMatchRoomId, loading, viewScale } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: '#08080a' }}>
        <div className="absolute inset-0" style={{ background: `url('/hub-bg.png') center/cover no-repeat`, filter: 'blur(6px)', transform: 'scale(1.02)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 100%)' }} />
        <AmbientParticles />

        <div className="relative z-10 flex-1 flex flex-col items-center overflow-hidden p-6" style={{ zoom: viewScale }}>
          <div className="w-full max-w-2xl">
            <h2 className="text-2xl font-bold arena-heading text-center mb-1" style={{ color: ACCENT_GOLD, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.15)' }}>
              Draft Tournament
            </h2>
            <div className="text-xs text-center uppercase tracking-wider mb-4" style={{ color: TEXT_MUTED }}>
              Round {currentRound} of {totalRounds} — Swiss
            </div>
            <OrnamentalDivider className="mb-5" />

            {/* Current pairings */}
            <div className="mb-6">
              <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: TEXT_MUTED }}>
                Round {currentRound} Pairings
              </div>
              <div className="space-y-2">
                {pairings.map((pairing, i) => {
                  const isMyMatch = pairing.player1Id === profile?.id || pairing.player2Id === profile?.id;
                  const isBye = !pairing.player2Id;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between px-4 py-3 rounded"
                      style={{
                        ...PANEL_STYLE,
                        border: isMyMatch ? `1px solid ${ACCENT_GOLD}` : PANEL_STYLE.border,
                        boxShadow: isMyMatch ? `0 0 8px rgba(212,168,67,0.15)` : PANEL_STYLE.boxShadow,
                      }}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: pairing.winnerId === pairing.player1Id ? '#6dba6d' : TEXT_PRIMARY }}
                        >
                          {pairing.player1Name || 'Player'}
                        </span>
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>vs</span>
                        <span
                          className="text-sm font-semibold"
                          style={{ color: isBye ? TEXT_MUTED : pairing.winnerId === pairing.player2Id ? '#6dba6d' : TEXT_PRIMARY }}
                        >
                          {isBye ? 'BYE' : (pairing.player2Name || 'Player')}
                        </span>
                      </div>
                      {pairing.status === 'complete' ? (
                        <span className="text-[10px] uppercase font-bold" style={{ color: '#6dba6d' }}>Done</span>
                      ) : isMyMatch && !isBye && (myMatchRoomId || pairing.roomId) ? (
                        <button
                          type="button"
                          className="px-4 py-1.5 text-xs font-bold transition-all cursor-pointer"
                          style={GOLD_BTN}
                          data-sound={UI.CONFIRM}
                          onClick={() => onPlayMatch?.(myMatchRoomId || pairing.roomId)}
                        >
                          Play Match
                        </button>
                      ) : !isMyMatch && pairing.status === 'in_progress' && pairing.roomId ? (
                        <button
                          type="button"
                          className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer"
                          style={{ ...BEVELED_BTN, color: TEXT_BODY }}
                          data-sound={UI.CONFIRM}
                          onClick={() => this.props.onSpectate?.(pairing.roomId)}
                        >
                          Watch
                        </button>
                      ) : !isMyMatch && pairing.status === 'in_progress' ? (
                        <span className="text-[10px] uppercase font-bold animate-pulse" style={{ color: ACCENT_GOLD }}>Playing</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Prize teaser — card identity hidden until draft ends */}
            {this.state.prizeCard ? (
              <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${GOLD} 0.15)` }}>
                <div
                  className="flex items-center justify-center text-lg shrink-0"
                  style={{ width: 44, height: Math.round(44 * 88 / 63), borderRadius: 4, background: `linear-gradient(135deg, rgba(212,168,67,0.15), rgba(180,140,60,0.05))`, border: `1px solid ${GOLD} 0.25)` }}
                >
                  ?
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>1st Place Prize</div>
                  <div className="text-sm font-semibold" style={{ color: ACCENT_GOLD }}>Random Foil Card</div>
                  <div className="text-[10px]" style={{ color: TEXT_MUTED }}>Revealed at the end of the tournament</div>
                </div>
              </div>
            ) : null}

            {/* Standings table */}
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: TEXT_MUTED }}>
                Standings
              </div>
              <div className="rounded overflow-hidden" style={PANEL_STYLE}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${GOLD} 0.15)` }}>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>#</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>Player</th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>W</th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_MUTED }}>L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((entry, i) => {
                      const isMe = entry.playerId === profile?.id;
                      return (
                        <tr
                          key={entry.playerId}
                          style={{
                            background: isMe ? 'rgba(212,168,67,0.06)' : 'transparent',
                            borderBottom: `1px solid ${GOLD} 0.06)`,
                          }}
                        >
                          <td className="px-3 py-2 tabular-nums" style={{ color: i === 0 ? ACCENT_GOLD : TEXT_MUTED }}>{i + 1}</td>
                          <td className="px-3 py-2 font-semibold" style={{ color: isMe ? ACCENT_GOLD : TEXT_PRIMARY }}>{entry.playerName}</td>
                          <td className="px-3 py-2 text-center tabular-nums" style={{ color: '#6dba6d' }}>{entry.wins}</td>
                          <td className="px-3 py-2 text-center tabular-nums" style={{ color: '#c45050' }}>{entry.losses}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
