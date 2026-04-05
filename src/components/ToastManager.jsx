import { Component } from 'preact';
import { cn } from '../lib/utils';

export default class ToastManager extends Component {
  render() {
    const { toasts, onDismiss, onAction } = this.props;
    if (!toasts || toasts.length === 0) return null;

    return (
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto w-80 rounded-xl border border-white/15 bg-card/95 backdrop-blur-md p-4 shadow-2xl animate-[slideIn_0.3s_ease-out]"
          >
            <div className="flex items-start gap-3">
              {toast.avatar ? (
                <img src={toast.avatar} alt="" className="w-8 h-8 rounded-lg object-cover object-top shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm text-white/40 shrink-0">?</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{toast.title}</div>
                {toast.message ? <div className="text-xs text-muted-foreground mt-0.5">{toast.message}</div> : null}
                {toast.actions ? (
                  <div className="flex gap-2 mt-2">
                    {toast.actions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        className={cn(
                          'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
                          action.primary
                            ? 'bg-amber-500 text-black hover:bg-amber-400'
                            : 'border border-white/20 text-white/60 hover:bg-white/10'
                        )}
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
                className="text-white/30 hover:text-white/60 text-xs shrink-0"
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
