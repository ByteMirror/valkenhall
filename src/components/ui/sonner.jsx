import { Toaster as Sonner } from 'sonner';

function resolveToasterTheme() {
  if (typeof document === 'undefined') {
    return 'dark';
  }

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function Toaster(props) {
  return (
    <Sonner
      closeButton
      position="bottom-right"
      richColors
      theme={resolveToasterTheme()}
      toastOptions={{
        classNames: {
          toast:
            'border border-border/70 bg-popover/96 text-popover-foreground shadow-[0_22px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
