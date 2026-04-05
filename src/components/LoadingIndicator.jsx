const LoadingIndicator = ({ message, detail, progress, showProgress = false }) => {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-background/60 px-4 backdrop-blur-md" role="status" aria-live="polite">
      <div className="w-full max-w-sm rounded-[32px] border border-border/70 bg-card/92 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
        <h2 className="font-display text-[1.75rem] leading-none text-card-foreground">{message}</h2>
        {detail ? <p className="mt-3 text-sm text-muted-foreground">{detail}</p> : null}
        {showProgress && progress !== undefined ? (
          <>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{Math.round(progress)}%</div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default LoadingIndicator;
