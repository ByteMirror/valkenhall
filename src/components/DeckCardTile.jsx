import { Component, createRef } from 'preact';
import { cn } from '../lib/utils';
import { isFoilFinish } from '../utils/sorcery/foil.js';

const TILT_MAX_DEG = 10;
const HOVER_SCALE = 1.04;
const SITE_SCALE = 1.08;

function getImageUrl(entry) {
  return entry.printing?.image_url || entry.card?.printings?.[0]?.image_url || '';
}

function getFoiling(entry) {
  return entry.printing?.foiling || 'S';
}

export default class DeckCardTile extends Component {
  constructor(props) {
    super(props);
    this.state = {
      rotateX: 0, rotateY: 0, hovering: false,
      mx: 50, my: 50,
      originX: 'center', originY: 'center',
      nudgeX: 0, nudgeY: 0,
    };
    this.ref = createRef();
  }

  handleMouseMove = (e) => {
    const el = this.ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    this.setState({
      rotateY: (x - 0.5) * 2 * TILT_MAX_DEG,
      rotateX: (0.5 - y) * 2 * TILT_MAX_DEG,
      mx: x * 100,
      my: y * 100,
    });
  };

  handleMouseEnter = () => {
    const el = this.ref.current;
    if (!el) {
      this.setState({ hovering: true });
      this.props.onHoverChange?.(true);
      return;
    }

    const rect = el.getBoundingClientRect();
    const isSite = this.props.entry?.card?.played_horizontally;

    // Find the nearest clipping ancestor to measure available space
    let clipLeft = 0;
    let clipRight = window.innerWidth;
    let clipTop = 0;
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      const ov = style.overflow + style.overflowX + style.overflowY;
      if (ov.includes('auto') || ov.includes('scroll') || ov.includes('hidden')) {
        const pr = parent.getBoundingClientRect();
        clipLeft = Math.max(clipLeft, pr.left);
        clipRight = Math.min(clipRight, pr.right);
        clipTop = Math.max(clipTop, pr.top);
        break;
      }
      parent = parent.parentElement;
    }

    // Compute where the transformed card edges would land
    const w = rect.width;
    const h = rect.height;
    const cx = rect.left + w / 2;
    const cy = rect.top + h / 2;

    let originX = 'center';
    let originY = 'center';
    let nudgeX = 0;
    let nudgeY = 0;

    if (isSite) {
      // Site rotated 90° from center: visual width = h * scale, visual height = w * scale
      // Always use center origin for sites — nudge via translate instead
      const visW = h * SITE_SCALE;
      const visH = w * SITE_SCALE;
      const leftEdge = cx - visW / 2;
      const rightEdge = cx + visW / 2;
      const topEdge = cy - visH / 2;

      if (leftEdge < clipLeft + 6) nudgeX = (clipLeft + 6) - leftEdge;
      else if (rightEdge > clipRight - 6) nudgeX = (clipRight - 6) - rightEdge;
      if (topEdge < clipTop + 6) nudgeY = (clipTop + 6) - topEdge;
    } else {
      // Regular card: shift origin toward nearest edge
      const expandX = w * (HOVER_SCALE - 1) / 2;
      const expandY = h * (HOVER_SCALE - 1) / 2;

      if (rect.left - expandX < clipLeft + 4) originX = 'left';
      else if (rect.right + expandX > clipRight - 4) originX = 'right';
      if (rect.top - expandY < clipTop + 4) originY = 'top';
    }

    this.setState({ hovering: true, originX, originY, nudgeX, nudgeY });
    this.props.onHoverChange?.(true);
  };

  handleMouseLeave = () => {
    this.setState({
      rotateX: 0, rotateY: 0, hovering: false,
      mx: 50, my: 50, nudgeX: 0, nudgeY: 0,
    });
    this.props.onHoverChange?.(false);
  };

  render() {
    const { entry, isSelected, onClick, onContextMenu } = this.props;
    const { rotateX, rotateY, hovering, mx, my, originX, originY, nudgeX, nudgeY } = this.state;
    const isSite = entry.card?.played_horizontally;
    const imgUrl = getImageUrl(entry);
    const foiling = getFoiling(entry);
    const isFoil = isFoilFinish(foiling);

    const siteHovered = isSite && hovering;

    const dx = (mx / 100) - 0.5;
    const dy = (my / 100) - 0.5;
    const fromCenter = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.5);
    const bgX = 20 + (mx / 100) * 60;
    const bgY = 20 + (my / 100) * 60;
    const sheenAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    const sheenOffset = (0.5 - (mx / 100)) * 100;

    const foilStyle = isFoil ? {
      '--foil-bg-x': `${bgX}%`,
      '--foil-bg-y': `${bgY}%`,
      '--foil-d': fromCenter,
      '--foil-angle': `${sheenAngle}deg`,
      '--foil-offset': `${sheenOffset}%`,
    } : {};

    const nudge = (nudgeX || nudgeY) ? `translate(${nudgeX}px, ${nudgeY}px) ` : '';
    let innerTransform;
    if (siteHovered) {
      innerTransform = `${nudge}rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotate(90deg) scale(${SITE_SCALE})`;
    } else if (hovering) {
      innerTransform = `${nudge}rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${HOVER_SCALE})`;
    } else {
      innerTransform = 'none';
    }

    return (
      <div
        ref={this.ref}
        role="option"
        aria-label={entry.card.name}
        aria-selected={String(isSelected)}
        tabIndex={isSelected ? 0 : -1}
        data-deck-entry-index={entry.entryIndex}
        className={cn(
          'deck-card-tile cursor-pointer rounded-[14px]',
          isSelected && 'ring-2 ring-primary/60 shadow-[0_0_20px_rgba(180,140,60,0.25)]',
          hovering && 'deck-card-tile--hover',
          siteHovered && 'deck-card-tile--site-hover',
        )}
        style={{ perspective: '600px' }}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseMove={this.handleMouseMove}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >
        {/* Glow wrapper — no overflow restrictions, carries transform + shadow */}
        <div
          className="h-full w-full rounded-[14px]"
          style={{
            transform: innerTransform,
            transformOrigin: `${originX} ${originY}`,
            transition: hovering
              ? 'transform 0.15s ease-out'
              : 'transform 0.35s ease-out',
            transformStyle: 'preserve-3d',
            boxShadow: [
              isFoil && foiling === 'R' && '0 0 14px rgba(160,120,255,0.4), 0 0 30px rgba(100,180,255,0.15)',
              isFoil && foiling !== 'R' && '0 0 10px rgba(200,170,80,0.35), 0 0 24px rgba(200,170,80,0.12)',
              siteHovered && '0 14px 40px rgba(0,0,0,0.55)',
              !siteHovered && hovering && '0 8px 24px rgba(0,0,0,0.45)',
            ].filter(Boolean).join(', ') || undefined,
          }}
        >
          {/* Inner card — overflow:hidden for image masking, foil effects */}
          <div
            className={cn(
              'deck-card-tile-inner h-full w-full overflow-hidden rounded-[14px]',
              isFoil && 'foil-overlay',
              isFoil && !hovering && 'foil-overlay--idle',
              isFoil && hovering && 'foil-overlay--active'
            )}
            data-foil={isFoil ? foiling : undefined}
            style={foilStyle}
          >
            <img
              src={imgUrl}
              alt={entry.card.name}
              loading="lazy"
              decoding="async"
              className="deck-card-tile-image h-full w-full object-cover"
            />
            {hovering ? (
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
      </div>
    );
  }
}
