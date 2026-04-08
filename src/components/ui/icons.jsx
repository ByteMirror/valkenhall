const baseProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': 'true',
};

function IconSearch(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconPrint(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M7 8V4h10v4" />
      <rect x="6" y="14" width="12" height="6" rx="1.5" />
      <path d="M6 10H5a2 2 0 0 0-2 2v4h4" />
      <path d="M18 16h3v-4a2 2 0 0 0-2-2h-1" />
      <path d="M8 12h8" />
    </svg>
  );
}

function IconSettings(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M4 12h4" />
      <path d="M16 12h4" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function IconSparkles(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4z" />
      <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
    </svg>
  );
}

function IconTrash(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M7 7v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function IconMagic(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m4 20 8-8" />
      <path d="m13 7 4-4" />
      <path d="m14 3 1 2" />
      <path d="m18 7 2 1" />
      <path d="m11 10 3 3" />
      <path d="m5 14 5 5" />
    </svg>
  );
}

function IconMenu(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function IconSave(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v6h8V4" />
      <path d="M9 19v-5h6v5" />
    </svg>
  );
}

function IconChartBar(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconChevronLeft(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function IconChevronRight(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconChevronDown(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconPlus(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconClose(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

function IconDownload(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function IconCheck(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

// Currency glyphs — match the style established in the app header so the
// same visual shows up wherever coins or arcana shards are displayed.
// Both icons use low-opacity fill + solid stroke + drop-shadow glow.
export const COIN_ICON_COLOR = '#f0d060';
export const SHARD_ICON_COLOR = '#7dd3fc';

function CoinIcon({ size = 14, glow = true, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      style={glow ? { filter: 'drop-shadow(0 0 6px rgba(240,208,96,0.4))' } : undefined}
      aria-hidden="true"
      {...rest}
    >
      <circle cx="7" cy="7" r="6" fill={COIN_ICON_COLOR} fillOpacity="0.25" stroke={COIN_ICON_COLOR} strokeWidth="1" />
      <circle cx="7" cy="7" r="3.8" stroke={COIN_ICON_COLOR} strokeOpacity="0.55" strokeWidth="0.6" fill="none" />
      <path d="M7 1.2 L7 12.8 M1.2 7 L12.8 7" stroke={COIN_ICON_COLOR} strokeOpacity="0.5" strokeWidth="0.6" />
    </svg>
  );
}

function ShardIcon({ size = 13, glow = true, ...rest }) {
  // Preserve the 13:15 aspect ratio of the header shard so the glyph never
  // squashes when it scales.
  const height = Math.round((size * 15) / 13);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 13 15"
      fill="none"
      style={glow ? { filter: 'drop-shadow(0 0 6px rgba(125,211,252,0.4))' } : undefined}
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M6.5 0.5 L12 5 L10 14 L3 14 L1 5 Z"
        fill={SHARD_ICON_COLOR}
        fillOpacity="0.25"
        stroke={SHARD_ICON_COLOR}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M6.5 0.5 L6.5 14 M1 5 L12 5" stroke={SHARD_ICON_COLOR} strokeOpacity="0.5" strokeWidth="0.6" />
    </svg>
  );
}

export {
  CoinIcon,
  ShardIcon,
  IconCheck,
  IconChevronDown,
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconMagic,
  IconMenu,
  IconPlus,
  IconPrint,
  IconSave,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTrash,
};
