import { Component } from 'preact';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  GOLD_BTN, BEVELED_BTN, FourCorners, getViewportScale,
} from '../lib/medievalTheme';

export default class ToastManager extends Component {
  render() {
    const { toasts, onDismiss, onAction } = this.props;
    if (!toasts || toasts.length === 0) return null;

    return (
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ zoom: getViewportScale() }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto relative w-80 p-4 animate-[slideIn_0.3s_ease-out]"
            style={{
              background: PANEL_BG,
              border: `1px solid ${GOLD} 0.25)`,
              borderRadius: '8px',
              boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 20px ${GOLD} 0.04)`,
            }}
          >
            <FourCorners />
            <div className="flex items-start gap-3">
              {toast.avatar ? (
                <img src={toast.avatar} alt="" className="w-8 h-8 rounded-lg object-cover object-top shrink-0" style={{ border: `1px solid ${GOLD} 0.2)` }} />
              ) : (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.15)`, color: TEXT_MUTED }}>?</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{toast.title}</div>
                {toast.message ? <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{toast.message}</div> : null}
                {toast.actions ? (
                  <div className="flex gap-2 mt-2">
                    {toast.actions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        className="px-3 py-1 text-xs font-medium cursor-pointer transition-all"
                        style={action.primary ? GOLD_BTN : { ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                        onClick={() => onAction(toast.id, action.key)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs shrink-0 cursor-pointer transition-colors"
                style={{ color: TEXT_MUTED }}
                onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_BODY; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; }}
                onClick={() => onDismiss(toast.id)}
              >
                x
              </button>
            </div>
          </div>
        ))}

        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }
}
