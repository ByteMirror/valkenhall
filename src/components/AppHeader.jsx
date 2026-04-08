import { Mail } from 'lucide-react';
import {
  GOLD, GOLD_TEXT, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  BEVELED_BTN, getViewportScale,
} from '../lib/medievalTheme';
import { CoinIcon, ShardIcon } from './ui/icons';

/**
 * Unified header bar used across all screens.
 *
 * Layout: [left (flex, grows)] [right (fixed-width slot)]
 *
 * The right side (gold, mail, friends) occupies a fixed-width slot so it
 * never moves regardless of what the left side contains. The left side
 * is passed as `children` and can contain any screen-specific content.
 */
export default function AppHeader({
  children,
  profile,
  onToggleMailbox,
  mailboxUnreadCount = 0,
  mailboxDropdown,
  onToggleFriends,
  friendListData,
  zoom,
}) {
  const viewScale = zoom ?? getViewportScale();
  const pendingFriends = friendListData?.pendingCount || 0;

  return (
    <div
      className="relative z-20 flex items-center px-6 py-2.5 shrink-0"
      style={{
        borderBottom: `1px solid ${GOLD} 0.15)`,
        background: 'rgba(12, 10, 8, 0.92)',
        backdropFilter: 'blur(8px)',
        zoom: viewScale,
      }}
    >
      {/* Left side — screen-specific content, grows to fill available space */}
      <div className="flex items-center gap-6 flex-1 min-w-0">
        {children}
      </div>

      {/* Right side — uniform 24 px rhythm to match the header's px-6.
          `gap-6` between every right-side element (shards → gold →
          friends → mail) lines up exactly with the 24 px padding on
          the header edges, so the spacing between currencies matches
          the spacing between buttons AND the distance from the last
          button to the right edge. No fixed-width slots either: the
          currencies flow at their natural size, giving them the same
          rhythm as the friends/mail buttons next to them. */}
      <div className="flex items-center gap-6 shrink-0 ml-auto pl-6">
        {/* Arcana display */}
        {profile?.arcanaShards != null && (
          <div className="flex items-center gap-1.5" title="Arcana">
            <ShardIcon size={13} />
            <span className="text-lg font-bold tabular-nums" style={{ color: '#7dd3fc', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{profile.arcanaShards}</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(125,211,252,0.4)' }}>arcana</span>
          </div>
        )}

        {/* Gold display */}
        {profile?.coins != null && (
          <div className="flex items-center gap-1.5" title="Gold">
            <CoinIcon size={14} />
            <span className="text-lg font-bold tabular-nums" style={{ color: '#f0d060', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{profile.coins}</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: `${GOLD} 0.4)` }}>gold</span>
          </div>
        )}

        {/* Friends button */}
        {onToggleFriends && (
          <button
            type="button"
            data-tutorial="friends"
            className="relative px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.7)` }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
            onClick={onToggleFriends}
          >
            Friends
            {pendingFriends > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white px-1"
                style={{ boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}
              >
                {pendingFriends}
              </span>
            )}
          </button>
        )}

        {/* Mailbox button + dropdown */}
        {onToggleMailbox && (
          <div className="relative" data-tutorial="mailbox">
            <button
              type="button"
              className="relative px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.7)` }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
              onClick={onToggleMailbox}
            >
              <Mail size={14} className="inline-block mr-1" style={{ verticalAlign: '-2px' }} />
              Mail
              {mailboxUnreadCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1"
                  style={{ background: ACCENT_GOLD, boxShadow: `0 0 8px ${GOLD} 0.5)` }}
                >
                  {mailboxUnreadCount}
                </span>
              )}
            </button>
            {mailboxDropdown}
          </div>
        )}
      </div>
    </div>
  );
}
