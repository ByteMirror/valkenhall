import { Component } from 'preact';
import { getLocalApiOrigin } from '../utils/localApi';

// Catalog of every Viking ornament we have available. Each entry maps a
// short, stable key to its filename in /game-assets/ornaments/. New
// ornaments only need to be added here.
export const VIKING_ORNAMENTS = {
  broa016:       'viking-broa-016.svg',          // ornate intertwined creature, vertical
  figurative005: 'viking-figurative-005.svg',    // standing humanoid figure, vertical
  borreKnot:     'viking-borre-knot.svg',        // symmetric butterfly/triquetra knot
  urnes009:      'viking-urnes-009.svg',         // horizontal serpent/vine band (3.4:1 ratio)
  style2c005:    'viking-style2c-005.svg',       // horizontal intertwined beast plate (~2.43:1 ratio)
  style2d007:    'viking-style2d-007.svg',       // circular medallion (square 1:1)
  ringerike004:  'viking-ringerike-004.svg',     // triangular interlaced knot, ~1:1
  style1007:     'viking-style1-007.svg',        // vertical hammer/standard ornament (1:1.79)
};

const ORNAMENT_BASE = `${getLocalApiOrigin()}/game-assets/ornaments`;

// Stable per-session cache-bust. CEF aggressively caches CSS mask-image
// SVGs, which makes ornament edits during development invisible until a
// full app reinstall — the disk cache entry survives restarts. Including
// the module load time as a query string forces a unique URL on every
// dev launch so CEF's cache key changes and the new file is fetched.
const ORNAMENT_CACHE_BUST = String(Date.now());

function ornamentUrl(key) {
  const filename = VIKING_ORNAMENTS[key];
  return filename ? `${ORNAMENT_BASE}/${filename}?v=${ORNAMENT_CACHE_BUST}` : null;
}

/**
 * VikingOrnament — render an SVG ornament as a decorative element.
 *
 * The SVG is used as a CSS `mask-image` so the wrapper div's
 * `background-color` shines through wherever the ornament's strokes
 * are. This lets us tint the same SVG to any color (gold, copper,
 * silver, etc.) without shipping multiple variants.
 *
 * Variants:
 *
 *   variant="centerpiece"  — full panel embossed background. The
 *     ornament fills the parent at very low opacity, behind content.
 *     Use for big modal panels (Mailbox, Friends, Profile, Store).
 *
 *   variant="side"         — fixed-size accent at one vertical edge,
 *     used to fill empty side gutters of tall dialogs.
 *
 *   variant="corner"       — small fixed-size accent in one corner.
 *
 *   variant="footer"       — horizontal strip glued to the bottom of
 *     the parent. No visible divider, no occupied layout space — just
 *     decorative ornamentation. Designed for landscape ornaments like
 *     the Urnes serpent band (3.4:1 ratio).
 *
 *   variant="medallion"    — fills the parent square/circle from edge
 *     to edge with a radial-fade tint: strongest color in the middle,
 *     fading outward to transparent at the edges. Designed for circular
 *     button-like surfaces (currency badges) using square ornaments
 *     like the Style II D medallion.
 *
 * Common props:
 *   ornament    key from VIKING_ORNAMENTS
 *   color       tint, defaults to GOLD; any CSS color
 *   opacity     visual strength
 *   side        'left' | 'right' (only for side variant)
 *   corner      'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
 *   size        pixel size override
 *   className   extra classes for the wrapper
 *
 * The component places itself absolutely — make sure the parent has
 * `position: relative`.
 */
export default class VikingOrnament extends Component {
  render() {
    const {
      ornament,
      variant = 'centerpiece',
      color = 'rgba(212, 168, 67, 1)',
      opacity,
      side = 'left',
      corner = 'top-left',
      size,
      className = '',
      style = {},
    } = this.props;

    const url = ornamentUrl(ornament);
    if (!url) return null;

    // Default opacities tuned per variant. Centerpieces sit far behind
    // content so they need to be subtle; side/corner accents are
    // visible decoration so they're brighter.
    const finalOpacity = opacity != null ? opacity : (variant === 'centerpiece' ? 0.10 : 0.32);

    // Common mask + tint properties — the SVG defines where the color
    // shows; the wrapper's background-color is what's actually rendered.
    const maskCss = {
      maskImage: `url("${url}")`,
      WebkitMaskImage: `url("${url}")`,
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
      backgroundColor: color,
      // Embossed feel: a soft drop-shadow lift highlight + a darker
      // recess shadow. Drop-shadow on a masked element only follows
      // the masked-in pixels, so it tracks the ornament strokes.
      filter: variant === 'centerpiece'
        ? 'drop-shadow(0 1px 0 rgba(255, 220, 140, 0.22)) drop-shadow(0 -1px 0 rgba(0, 0, 0, 0.7))'
        : 'drop-shadow(0 1px 1px rgba(255, 220, 140, 0.28)) drop-shadow(0 -1px 1px rgba(0, 0, 0, 0.65))',
      opacity: finalOpacity,
      pointerEvents: 'none',
    };

    let positionStyle;
    if (variant === 'centerpiece') {
      // Centered, contained, with comfortable margin so content stays
      // legible on top of the embossed art. zIndex: -1 puts it BELOW
      // static content within the parent's stacking context (the parent
      // must have its own stacking context — z-index ≥ 0 — for negative
      // children to be clipped to it instead of escaping outward).
      positionStyle = {
        position: 'absolute',
        top: '6%',
        bottom: '6%',
        left: '50%',
        width: 'min(72%, 480px)',
        transform: 'translateX(-50%)',
        zIndex: -1,
      };
    } else if (variant === 'side') {
      positionStyle = {
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [side]: '16px',
        width: size || '120px',
        height: size || '120px',
        zIndex: 0,
      };
    } else if (variant === 'footer') {
      // Horizontal band glued to the bottom of the parent. Used for
      // landscape ornaments like the Urnes serpent band — works as
      // pure decoration without consuming any layout space, since the
      // wrapper is absolutely positioned and only ~20px tall. Adds
      // a mix-blend-mode: overlay so the band reads as if it were
      // engraved into the toast/panel surface rather than overlayed.
      positionStyle = {
        position: 'absolute',
        left: '50%',
        bottom: '6px',
        transform: 'translateX(-50%)',
        width: '78%',
        maxWidth: '320px',
        height: size || '20px',
        zIndex: 0,
        mixBlendMode: 'overlay',
      };
    } else if (variant === 'medallion') {
      // Fills the parent (typically a circular button) edge to edge.
      // The mask-image is the ornament SVG, and the wrapper's background
      // is a radial-gradient instead of a flat color — so the SVG strokes
      // show with a strong tint in the middle and fade to transparent at
      // the edges. Designed for round currency badges in Arcane Trials.
      //
      // backgroundColor is explicitly cleared to override the flat color
      // set by maskCss above; backgroundImage carries the gradient.
      //
      // mask-size: contain (inherited from maskCss) is enough now that
      // the source SVGs used here have their viewBox cropped tight to
      // the actual medallion content. The radial gradient extends from
      // the centre to the visible edge with no fade past the rim, so the
      // tint exactly spans the SVG instead of leaving a dark gap.
      positionStyle = {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'transparent',
        backgroundImage: `radial-gradient(circle at center, ${color}, transparent 100%)`,
        zIndex: 0,
      };
    } else { // corner
      const [vertical, horizontal] = corner.split('-');
      positionStyle = {
        position: 'absolute',
        [vertical]: '14px',
        [horizontal]: '14px',
        width: size || '56px',
        height: size || '56px',
        zIndex: 0,
      };
    }

    return (
      <div
        className={className}
        style={{ ...maskCss, ...positionStyle, ...style }}
        aria-hidden="true"
      />
    );
  }
}
