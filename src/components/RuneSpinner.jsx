export default function RuneSpinner({ size = 48, useViewportUnits = false, dark = false, className = '' }) {
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
        opacity: dark ? 0.5 : 0.35,
        filter: dark
          ? 'sepia(1) saturate(2) brightness(0.3) hue-rotate(15deg)'
          : 'sepia(1) saturate(3) brightness(0.6) hue-rotate(15deg)',
      }}
    />
  );
}
