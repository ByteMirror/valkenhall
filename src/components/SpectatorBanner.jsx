export default function SpectatorBanner({ onLeave }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[90] flex items-center justify-center py-2 bg-blue-600/80 backdrop-blur-sm">
      <span className="text-sm font-semibold text-white mr-4">Spectating</span>
      <button
        type="button"
        className="rounded-lg border border-white/30 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
        onClick={onLeave}
      >
        Leave
      </button>
    </div>
  );
}
