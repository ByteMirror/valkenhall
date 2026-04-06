export default function RuneSpinner({ size = 48, useViewportUnits = false, className = '' }) {
  const dim = useViewportUnits ? `${size / 10}vmin` : `${size}px`;
  return (
    <img
      src="/rune-divider.webp"
      alt=""
      className={`animate-spin-slow ${className}`}
      draggable={false}
      style={{
        width: dim,
        height: dim,
        opacity: 0.35,
        filter: 'sepia(1) saturate(3) brightness(0.6) hue-rotate(15deg)',
      }}
    />
  );
}
