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

export {
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
