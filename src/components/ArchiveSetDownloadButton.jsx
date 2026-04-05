import { Button } from './ui/button';
import { IconCheck, IconClose, IconDownload } from './ui/icons';
import { cn } from '../lib/utils';

const RING_RADIUS = 8.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function getDownloadProgress(status) {
  const total = Math.max(0, Number(status?.total) || 0);
  const completed = Math.min(total, Math.max(0, Number(status?.completed) || 0));
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, percent };
}

function getButtonLabel(label, status) {
  const { total, completed } = getDownloadProgress(status);

  if (status?.downloaded) {
    return `${label} downloaded`;
  }

  if (status?.state === 'downloading') {
    return total > 0 ? `Downloading ${label} (${completed} of ${total})` : `Downloading ${label}`;
  }

  if (status?.state === 'error') {
    return `Retry download ${label}`;
  }

  return `Download ${label}`;
}

export default function ArchiveSetDownloadButton({
  label,
  onClick = () => {},
  status = null,
}) {
  const { total, completed, percent } = getDownloadProgress(status);
  const isDownloaded = Boolean(status?.downloaded);
  const isDownloading = status?.state === 'downloading';
  const isError = status?.state === 'error';
  const showProgress = total > 0 && (isDownloading || isDownloaded || isError);
  const buttonLabel = getButtonLabel(label, status);
  const ringOffset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={buttonLabel}
      className={cn(
        'rounded-full border bg-background/40 shadow-none',
        isDownloading && 'border-primary/40 text-primary animate-pulse',
        isDownloaded && 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300',
        isError && 'border-destructive/40 bg-destructive/10 text-destructive',
        !isDownloading && !isDownloaded && !isError && 'border-border/70 text-muted-foreground'
      )}
      onClick={onClick}
      title={buttonLabel}
    >
      <span className="relative flex size-5 items-center justify-center">
        {showProgress ? (
          <span
            role="progressbar"
            aria-label={`Download progress for ${label}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={String(percent)}
            className="absolute inset-[-4px]"
          >
            <svg className="-rotate-90" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="opacity-20"
              />
              <circle
                cx="12"
                cy="12"
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                className="transition-[stroke-dashoffset] duration-500 ease-out"
              />
            </svg>
          </span>
        ) : null}

        {isDownloaded ? (
          <IconCheck className="size-3.5" />
        ) : isError ? (
          <IconClose className="size-3.5" />
        ) : (
          <IconDownload className="size-3.5" />
        )}
      </span>

      <span className="sr-only">
        {showProgress && total > 0 ? `${completed} of ${total} downloaded` : buttonLabel}
      </span>
    </Button>
  );
}
