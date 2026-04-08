import { Component } from 'preact';
import { createPortal } from 'preact/compat';
import { UI, playUI } from '../utils/arena/uiSounds';
import {
  GOLD, ACCENT_GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  BEVELED_BTN, GOLD_BTN, DIALOG_BG, DIALOG_BORDER, FourCorners,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

/**
 * TutorialOverlay — medieval-styled step-by-step onboarding, shared
 * across every screen that wants a guided walkthrough (main menu,
 * game board, deck builder, etc.).
 *
 * How it works:
 *   - The parent passes a list of `steps`, each { key, title, body,
 *     selector?, getRect? }. `selector` is a CSS selector resolved
 *     at measurement time; `getRect` is an escape hatch for targets
 *     that aren't in the DOM (e.g. 3D-canvas elements whose screen
 *     position needs camera projection). If neither is supplied the
 *     step renders as a centered explanatory modal with no arrow.
 *   - On every step change (or window resize), we read the target's
 *     bounding rect via the selector or the callback and compute
 *     two things: the spotlight cutout rectangle and the modal +
 *     arrow position.
 *   - The backdrop is a full-viewport dimmer with an SVG mask cutout
 *     around the target so the highlighted element stays bright
 *     while everything else darkens.
 *   - An animated gold arrow points at the target from the modal
 *     side (auto-chosen: right if the target is on the left half of
 *     the screen, left otherwise).
 *   - The modal card holds title, body, step counter, and
 *     Back/Skip/Continue buttons. On the final step, Continue becomes
 *     "Got it". Skip always dismisses the whole tutorial.
 *
 * The overlay is position:fixed so it works regardless of what
 * wraps it. Its modal and arrow apply `zoom: viewScale` to match
 * the rest of the UI at any viewport scale; the spotlight stays in
 * screen space because getBoundingClientRect already accounts for
 * ancestor zoom.
 */

const BACKDROP_ALPHA = 0.62;
const SPOTLIGHT_PADDING = 10;
const SPOTLIGHT_RADIUS = 14;
const ARROW_LENGTH = 72;
const ARROW_GAP = 18;

export default class TutorialOverlay extends Component {
  constructor(props) {
    super(props);
    this.state = {
      stepIndex: 0,
      targetRect: null,
      viewScale: getViewportScale(),
    };
    this._raf = null;
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => {
      this.setState({ viewScale: scale });
      this.queueMeasure();
    });
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    // Defer the first measurement a frame so parent mount animations
    // have time to settle before we read the target's bounding rect.
    this.queueMeasure();
    playUI(UI.OPEN);
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.stepIndex !== this.state.stepIndex) this.queueMeasure();
  }

  componentWillUnmount() {
    this.unsubScale?.();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  handleResize = () => this.queueMeasure();

  handleKeyDown = (event) => {
    if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.back();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.skip();
    }
  };

  queueMeasure() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this.measureTarget();
    });
  }

  measureTarget() {
    const step = this.currentStep();
    if (!step) return;

    // Two target sources: a CSS selector for DOM-based targets, or
    // a getRect callback for 3D-canvas / computed targets. If the
    // step supplies neither (or both return nothing) we centre the
    // modal as a no-target explanatory step instead of soft-locking.
    let rect = null;
    if (typeof step.getRect === 'function') {
      try {
        rect = step.getRect() || null;
      } catch {
        rect = null;
      }
    }
    if (!rect && step.selector) {
      const el = document.querySelector(step.selector);
      if (el) rect = el.getBoundingClientRect();
    }
    if (!rect) {
      this.setState({ targetRect: null });
      return;
    }
    this.setState({
      targetRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
  }

  currentStep() {
    const { steps } = this.props;
    if (!Array.isArray(steps) || steps.length === 0) return null;
    const idx = Math.min(Math.max(this.state.stepIndex, 0), steps.length - 1);
    return steps[idx];
  }

  next = () => {
    const { steps } = this.props;
    if (this.state.stepIndex >= steps.length - 1) {
      this.finish();
      return;
    }
    playUI(UI.CONFIRM);
    this.setState((s) => ({ stepIndex: s.stepIndex + 1 }));
  };

  back = () => {
    if (this.state.stepIndex === 0) return;
    playUI(UI.CANCEL);
    this.setState((s) => ({ stepIndex: s.stepIndex - 1 }));
  };

  skip = () => {
    playUI(UI.CANCEL);
    this.props.onDismiss?.({ reason: 'skip' });
  };

  finish = () => {
    playUI(UI.CONFIRM);
    this.props.onDismiss?.({ reason: 'finish' });
  };

  render() {
    const { steps } = this.props;
    if (!Array.isArray(steps) || steps.length === 0) return null;

    const { stepIndex, targetRect, viewScale } = this.state;
    const step = this.currentStep();
    if (!step) return null;

    const winW = window.innerWidth || 1280;
    const winH = window.innerHeight || 800;
    const isLast = stepIndex === steps.length - 1;
    const isFirst = stepIndex === 0;
    // viewScale is the same multiplier the hub applies to its own
    // content via `zoom`. Bounding rects from getBoundingClientRect
    // already bake that factor in, so the spotlight SVG below uses
    // the raw screen-space numbers. The modal and arrow are
    // independent DOM nodes that don't live inside the hub's zoom
    // wrapper — we apply `zoom: scale` to them directly and
    // pre-divide their left/top so the post-zoom result still lands
    // at the computed screen-space position.
    const scale = viewScale || 1;

    const spotlight = targetRect
      ? {
          x: targetRect.left - SPOTLIGHT_PADDING,
          y: targetRect.top - SPOTLIGHT_PADDING,
          width: targetRect.width + SPOTLIGHT_PADDING * 2,
          height: targetRect.height + SPOTLIGHT_PADDING * 2,
        }
      : null;

    // Pick the side the modal sits on: opposite of the target's side
    // of the screen. If no target, centre the modal.
    let modalAnchor = 'center';
    if (targetRect) {
      const cx = targetRect.left + targetRect.width / 2;
      modalAnchor = cx < winW / 2 ? 'right' : 'left';
    }

    // Zoomed visual size of the modal so clamping uses the actual
    // on-screen dimensions, not the pre-zoom ones.
    const modalWidthUnzoomed = 400;
    const modalHeightUnzoomed = 240;
    const modalWidthScreen = modalWidthUnzoomed * scale;
    const modalHeightScreen = modalHeightUnzoomed * scale;
    // Same for the arrow — it's rendered in a zoomed wrapper so its
    // length + offset from the spotlight grow/shrink with the UI.
    const arrowLengthScreen = ARROW_LENGTH * scale;
    const arrowGapScreen = ARROW_GAP * scale;

    let modalLeftScreen;
    let modalTopScreen;
    if (modalAnchor === 'center' || !spotlight) {
      modalLeftScreen = (winW - modalWidthScreen) / 2;
      modalTopScreen = winH / 2 - modalHeightScreen / 2;
    } else if (modalAnchor === 'right') {
      modalLeftScreen = spotlight.x + spotlight.width + arrowGapScreen + arrowLengthScreen;
      modalTopScreen = spotlight.y + spotlight.height / 2 - modalHeightScreen / 2;
    } else {
      modalLeftScreen = spotlight.x - arrowGapScreen - arrowLengthScreen - modalWidthScreen;
      modalTopScreen = spotlight.y + spotlight.height / 2 - modalHeightScreen / 2;
    }
    // Clamp into the viewport with a 16px screen-space margin on
    // every side.
    modalLeftScreen = Math.max(16, Math.min(modalLeftScreen, winW - modalWidthScreen - 16));
    modalTopScreen = Math.max(16, Math.min(modalTopScreen, winH - modalHeightScreen - 16));
    // Pre-divide for the `zoom` style — after CSS zoom multiplies
    // by `scale`, we land back at the screen-space position.
    const modalLeft = modalLeftScreen / scale;
    const modalTop = modalTopScreen / scale;

    // Arrow origin sits between the modal and the target, pointing
    // from the modal side of the spotlight toward the target centre.
    // Computed in screen space, then divided by scale at the end.
    let arrowStyle = null;
    if (spotlight && modalAnchor !== 'center') {
      const targetCy = spotlight.y + spotlight.height / 2;
      let leftScreen;
      let topScreen;
      let rotate;
      if (modalAnchor === 'right') {
        leftScreen = spotlight.x + spotlight.width + arrowGapScreen;
        topScreen = targetCy - 18 * scale;
        rotate = 180;
      } else {
        leftScreen = spotlight.x - arrowGapScreen - arrowLengthScreen;
        topScreen = targetCy - 18 * scale;
        rotate = 0;
      }
      arrowStyle = {
        left: leftScreen / scale,
        top: topScreen / scale,
        rotate,
      };
    }

    // The overlay is portalled directly into document.body so it
    // never inherits an ancestor's `zoom`, `transform`, `filter`, or
    // other containing-block properties. Several screens (the store,
    // game board, etc.) apply `zoom: viewScale` to their root div;
    // if the overlay lived inside one of those, its fixed-position
    // modal would inherit a compound zoom of viewScale² and the
    // `left`/`top` coordinates would get multiplied by the ancestor
    // zoom on top of our per-modal compensation — which is exactly
    // the "huge, bottom-right, cut off" bug. Portalling to body
    // sidesteps all of that: the overlay sits at the top of the DOM
    // and its `position: fixed` is truly viewport-relative.
    const body = (
      <div
        aria-modal="true"
        role="dialog"
        className="fixed inset-0 z-[1500] pointer-events-auto"
        style={{ animation: 'tutorialFadeIn 180ms ease-out' }}
      >
        {/* Dimmed backdrop with a spotlight cutout. SVG mask is
            cheap, GPU-composited, and lets us apply the dim as a
            single rect so the whole thing is a single layer. */}
        <svg
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            <mask id="tutorial-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlight && (
                <rect
                  x={spotlight.x}
                  y={spotlight.y}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx={SPOTLIGHT_RADIUS}
                  ry={SPOTLIGHT_RADIUS}
                  fill="black"
                  style={{ transition: 'x 260ms ease, y 260ms ease, width 260ms ease, height 260ms ease' }}
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`rgba(4, 3, 2, ${BACKDROP_ALPHA})`}
            mask="url(#tutorial-spotlight-mask)"
          />
          {/* Gold ring around the spotlight — draws on top of the
              dimmed backdrop via a second rect with a stroke only. */}
          {spotlight && (
            <rect
              x={spotlight.x}
              y={spotlight.y}
              width={spotlight.width}
              height={spotlight.height}
              rx={SPOTLIGHT_RADIUS}
              ry={SPOTLIGHT_RADIUS}
              fill="none"
              stroke="rgba(212, 168, 67, 0.95)"
              strokeWidth="2"
              style={{
                filter: 'drop-shadow(0 0 16px rgba(212,168,67,0.6))',
                transition: 'x 260ms ease, y 260ms ease, width 260ms ease, height 260ms ease',
              }}
            />
          )}
        </svg>

        {/* Animated arrow pointing at the target from the modal.
            Rendered inside a `zoom`-scaled wrapper so the arrow's
            visual size tracks the hub's viewport scale — at 1.2x
            the arrow is 20% longer and thicker, matching the rest
            of the UI. left/top are pre-divided by the scale in
            arrowStyle above so the post-zoom position lands on the
            computed screen-space coordinates. */}
        {arrowStyle && (
          <div
            className="absolute"
            style={{
              left: arrowStyle.left,
              top: arrowStyle.top,
              width: ARROW_LENGTH,
              height: 36,
              pointerEvents: 'none',
              zoom: scale,
              animation: 'tutorialArrowNudge 1.3s ease-in-out infinite',
              transform: `rotate(${arrowStyle.rotate}deg)`,
              transformOrigin: 'center',
              transition: 'left 260ms ease, top 260ms ease',
            }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 72 36" width="100%" height="100%">
              <defs>
                <linearGradient id="tutorial-arrow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(212,168,67,0.25)" />
                  <stop offset="60%" stopColor="rgba(212,168,67,0.95)" />
                  <stop offset="100%" stopColor="#f0d890" />
                </linearGradient>
              </defs>
              <path
                d="M4 18 L52 18 M42 6 L58 18 L42 30"
                fill="none"
                stroke="url(#tutorial-arrow-grad)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 0 10px rgba(212,168,67,0.55))' }}
              />
            </svg>
          </div>
        )}

        {/* The medieval modal card. Scaled via `zoom: scale` so its
            text, padding, and button sizes track the hub's viewport
            scale. left/top are pre-divided by scale (same pattern
            as the context menu) so the post-zoom result still lands
            at the computed screen-space coordinates. */}
        <div
          className="absolute"
          style={{
            left: modalLeft,
            top: modalTop,
            width: modalWidthUnzoomed,
            zoom: scale,
            background: DIALOG_BG,
            backgroundColor: '#0e0a06',
            border: `1px solid ${DIALOG_BORDER}`,
            borderRadius: '12px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 32px rgba(180,140,60,0.08)',
            padding: '20px 22px 18px',
            color: TEXT_BODY,
            isolation: 'isolate',
            transition: 'left 260ms ease, top 260ms ease',
            animation: 'tutorialModalIn 260ms ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <FourCorners radius={12} />

          {/* Step counter + close */}
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: `${GOLD} 0.5)` }}
            >
              Tutorial · {stepIndex + 1} / {steps.length}
            </span>
            <button
              type="button"
              className="text-[10px] uppercase tracking-wider cursor-pointer transition-colors"
              style={{ color: TEXT_MUTED }}
              onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_BODY; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; }}
              onClick={this.skip}
            >
              Skip
            </button>
          </div>

          {/* Title */}
          <h2
            className="arena-heading text-lg font-bold leading-tight mb-2"
            style={{
              color: TEXT_PRIMARY,
              textShadow: '0 2px 6px rgba(0,0,0,0.55), 0 0 18px rgba(180,140,60,0.18)',
            }}
          >
            {step.title}
          </h2>

          {/* Body */}
          <p className="text-[12.5px] leading-snug mb-4" style={{ color: TEXT_BODY }}>
            {step.body}
          </p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-4" aria-hidden="true">
            {steps.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === stepIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === stepIndex ? ACCENT_GOLD : `${GOLD} 0.25)`,
                  transition: 'width 180ms ease, background 180ms ease',
                }}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2 justify-end">
            {!isFirst && (
              <button
                type="button"
                className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.98]"
                style={{ ...BEVELED_BTN, backgroundColor: '#0e0a06', color: TEXT_BODY }}
                onClick={this.back}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="px-5 py-1.5 text-[12px] font-bold uppercase tracking-wider cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.98]"
              style={GOLD_BTN}
              onClick={this.next}
            >
              {isLast ? 'Got it' : 'Continue'}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes tutorialFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes tutorialModalIn {
            from { opacity: 0; transform: translateY(6px) scale(0.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes tutorialArrowNudge {
            0%, 100% { transform: translateX(0) rotate(var(--r, 0deg)); }
            50% { transform: translateX(6px) rotate(var(--r, 0deg)); }
          }
        `}</style>
      </div>
    );

    if (typeof document === 'undefined') return body;
    return createPortal(body, document.body);
  }
}
