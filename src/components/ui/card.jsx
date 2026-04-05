import { cn } from '../../lib/utils';

function Card({ className, ...props }) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border/70 bg-card/84 text-card-foreground shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return <div className={cn('flex items-start justify-between gap-4 p-4', className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div className={cn('p-4 pt-0', className)} {...props} />;
}

function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-sm font-semibold text-card-foreground', className)} {...props} />;
}

export { Card, CardContent, CardHeader, CardTitle };
