import { Component } from 'preact';
import { useRef, useState, useCallback, useEffect } from 'preact/hooks';
import { playUI, UI } from '../utils/arena/uiSounds';
import { extractKeywordAbilities, findGlossaryTermsInText, getGlossaryEntry } from '../utils/game/sorceryKeywords';
import { isFoilFinish, FOIL_LABEL, FOIL_LABEL_COLOR, FOIL_OVERLAY_CLASSES } from '../utils/sorcery/foil.js';
import { Sparkles, Rainbow } from 'lucide-react';
import {
  GOLD, GOLD_TEXT, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  PANEL_BG, DIALOG_STYLE, POPOVER_STYLE, VIGNETTE,
  FourCorners, OrnamentalDivider,
  getViewportScale,
} from '../lib/medievalTheme';

class GlossaryTerm extends Component {
  constructor(props) {
    super(props);
    this.state = { open: false };
    this.timer = null;
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
  }

  render() {
    const { entry, renderNested, depth } = this.props;
    const { open } = this.state;

    return (
      <span
        className="relative inline"
        onMouseEnter={() => { clearTimeout(this.timer); this.setState({ open: true }); }}
        onMouseLeave={() => { this.timer = setTimeout(() => this.setState({ open: false }), 200); }}
      >
        <span className="cursor-help" style={{ color: ACCENT_GOLD, textShadow: `0 0 8px ${GOLD} 0.2)` }}>{entry.keyword}</span>
        {open ? (
          <span
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-lg p-3 text-xs"
            style={{ ...POPOVER_STYLE, zIndex: 100 + depth * 10 }}
            onMouseEnter={() => { clearTimeout(this.timer); }}
            onMouseLeave={() => { this.timer = setTimeout(() => this.setState({ open: false }), 200); }}
          >
            <span className="font-semibold block mb-1" style={{ color: TEXT_PRIMARY }}>{entry.keyword}</span>
            <span className="leading-relaxed" style={{ color: TEXT_BODY }}>
              {renderNested(entry.description)}
            </span>
          </span>
        ) : null}
      </span>
    );
  }
}

function renderTextWithTooltips(text, depth = 0) {
  if (!text || depth > 2) return text;

  const terms = findGlossaryTermsInText(text);
  const patterns = terms.map((t) => t.keyword).sort((a, b) => b.length - a.length);

  if (patterns.length === 0) {
    return <span className={depth === 0 ? 'whitespace-pre-line' : ''}>{text}</span>;
  }

  const regex = new RegExp(
    `(${patterns.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  );

  const parts = text.split(regex);

  return (
    <span className={depth === 0 ? 'whitespace-pre-line' : ''}>
      {parts.map((part, i) => {
        const entry = getGlossaryEntry(part);
        if (entry) {
          return <GlossaryTerm key={i} entry={entry} renderNested={(t) => renderTextWithTooltips(t, depth + 1)} depth={depth} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

const RARITY_COLORS = {
  Ordinary: TEXT_MUTED,
  Exceptional: '#6ea8d4',
  Elite: '#b480d4',
  Unique: ACCENT_GOLD,
  Avatar: '#c45050',
};

export const RARITY_LABEL_COLOR = {
  Ordinary: 'text-white/40',
  Exceptional: 'text-blue-400',
  Elite: 'text-purple-400',
  Unique: 'text-amber-400',
  Avatar: 'text-red-400',
};

const STAT_COLORS = {
  ATK: '#c45050',
  DEF: '#6ea8d4',
  HP: '#6ab04c',
  Cost: ACCENT_GOLD,
};

const TILT_MAX = 12;

function InspectorCard({ imgSrc, cardName, isSite, isFoil, foiling }) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50, active: false });

  const handleMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({
      rx: (0.5 - y) * 2 * TILT_MAX,
      ry: (x - 0.5) * 2 * TILT_MAX,
      mx: x * 100,
      my: y * 100,
      active: true,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50, active: false });
  }, []);

  const { rx, ry, mx, my, active } = tilt;
  const dx = (mx / 100) - 0.5;
  const dy = (my / 100) - 0.5;
  const fromCenter = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.5);
  const bgX = 20 + (mx / 100) * 60;
  const bgY = 20 + (my / 100) * 60;
  const sheenAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  const sheenOffset = (0.5 - (mx / 100)) * 100;

  const foilVars = isFoil ? {
    '--foil-bg-x': `${bgX}%`,
    '--foil-bg-y': `${bgY}%`,
    '--foil-d': fromCenter,
    '--foil-angle': `${sheenAngle}deg`,
    '--foil-offset': `${sheenOffset}%`,
  } : {};

  return (
    <div
      ref={ref}
      className="flex-shrink-0"
      style={{ perspective: '800px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`overflow-hidden card-mask ${isSite ? 'card-mask--landscape' : ''} ${isFoil ? `${FOIL_OVERLAY_CLASSES} rounded-xl` : 'rounded-xl'} ${isFoil && active ? 'foil-overlay--active' : ''}`}
        data-foil={isFoil ? foiling : undefined}
        style={{
          ...foilVars,
          transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
          transition: active ? 'transform 0.1s ease-out' : 'transform 0.4s ease-out',
          transformStyle: 'preserve-3d',
          ...(isSite ? { width: '40vh', height: 'calc(40vh * 63.5 / 88.9)' } : {}),
        }}
      >
        <img
          src={imgSrc}
          alt={cardName || ''}
          className="card-image rounded-xl"
          style={isSite
            ? { height: '40vh', width: 'calc(40vh * 63.5 / 88.9)', transform: 'rotate(90deg) translateX(0%) translateY(-100%)', transformOrigin: 'top left' }
            : { height: '40vh' }
          }
        />
        {active ? (
          <div
            className="card-sheen"
            style={{
              '--sheen-angle': `${sheenAngle}deg`,
              '--sheen-offset': `${sheenOffset}%`,
              '--sheen-d': fromCenter,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function CardInspector({ card, imageUrl, rarity, foiling, onClose, zoom }) {
  if (!card) return null;

  // Play open sound on mount, close sound on unmount
  useEffect(() => {
    playUI(UI.INSPECTOR_OPEN);
    return () => playUI(UI.INSPECTOR_CLOSE);
  }, []);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const rulesText = card.functional_text_plain || card.functional_text || '';
  const keywordAbilities = extractKeywordAbilities(rulesText);
  const isSite = card.type === 'Site' || card.played_horizontally;
  const imgSrc = imageUrl || card.printings?.[0]?.image_url || '';
  const isFoil = isFoilFinish(foiling);

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={handleClose}
    >
      <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
      <div className="relative flex items-start gap-8 max-w-[90vw]" style={{ zoom: zoom ?? getViewportScale() }} onClick={(e) => e.stopPropagation()}>
        <InspectorCard
          imgSrc={imgSrc}
          cardName={card.name}
          isSite={isSite}
          isFoil={isFoil}
          foiling={foiling}
        />

        <div className="flex flex-col gap-3 min-w-[340px] max-w-[480px]">
          {/* Main card info */}
          <div className="relative p-5" style={{ ...DIALOG_STYLE }}>
            <FourCorners radius={12} />

            {isFoil ? (
              <div
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md"
                style={{
                  background: foiling === 'R'
                    ? 'linear-gradient(135deg, rgba(180,80,200,0.15), rgba(80,160,220,0.15))'
                    : `${GOLD} 0.1)`,
                  border: `1px solid ${foiling === 'R' ? 'rgba(180,80,200,0.3)' : `${GOLD} 0.25)`}`,
                }}
              >
                {foiling === 'R'
                  ? <Rainbow size={13} style={{ color: '#c480e0' }} />
                  : <Sparkles size={13} style={{ color: ACCENT_GOLD }} />
                }
                <span className="text-[10px] font-semibold" style={{ color: foiling === 'R' ? '#c480e0' : ACCENT_GOLD }}>
                  {FOIL_LABEL[foiling]}
                </span>
              </div>
            ) : null}

            <h2 className="text-lg font-bold arena-heading pr-24" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{card.name}</h2>
            <div className="mt-1.5 flex items-center gap-2">
              {rarity ? <span className="text-xs font-semibold" style={{ color: RARITY_COLORS[rarity] || TEXT_MUTED }}>{rarity}</span> : null}
              <span className="text-xs" style={{ color: TEXT_MUTED }}>{card.type_text || card.type || ''}</span>
            </div>

            {rulesText ? (
              <>
                <div className="my-3 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD} 0.2), transparent)` }} />
                <div className="text-sm leading-relaxed" style={{ color: TEXT_BODY }}>{renderTextWithTooltips(rulesText)}</div>
              </>
            ) : null}

            {(card.power || card.defense) ? (
              <div className="mt-3 flex gap-4 text-sm font-semibold">
                {card.power ? <span style={{ color: STAT_COLORS.ATK }}>ATK {card.power}</span> : null}
                {card.defense ? <span style={{ color: STAT_COLORS.DEF }}>DEF {card.defense}</span> : null}
                {card.health ? <span style={{ color: STAT_COLORS.HP }}>HP {card.health}</span> : null}
                {card.cost ? <span style={{ color: STAT_COLORS.Cost }}>Cost {card.cost}</span> : null}
              </div>
            ) : null}
          </div>

          {/* Keyword ability boxes */}
          {keywordAbilities.length > 0 ? (
            <div className="flex flex-col gap-2">
              {keywordAbilities.map(({ keyword, description }) => (
                <div
                  key={keyword}
                  className="relative p-3"
                  style={{
                    background: PANEL_BG,
                    border: `1px solid ${GOLD} 0.18)`,
                    borderRadius: '8px',
                    boxShadow: `inset 0 1px 0 ${GOLD} 0.04), 0 2px 8px rgba(0,0,0,0.3)`,
                  }}
                >
                  <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{keyword}</div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: TEXT_BODY }}>{renderTextWithTooltips(description, 1)}</div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="text-center text-[10px] mt-1" style={{ color: TEXT_MUTED }}>
            Hover highlighted words for explanations · Space / Click to close
          </div>
        </div>
      </div>
    </div>
  );
}
