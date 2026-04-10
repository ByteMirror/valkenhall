import { cloneElement } from 'preact';
import { createPortal } from 'preact/compat';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { GOLD, TEXT_PRIMARY } from '../../lib/medievalTheme';

const TOOLTIP_OFFSET = 8;
const VIEWPORT_PAD = 8;

/**
 * Medieval-styled tooltip. Wraps a single child element and shows a
 * floating label on hover. The tooltip is portalled to document.body
 * so it escapes any overflow/clipping and z-index stacking contexts.
 *
 * Uses cloneElement to inject ref + mouse handlers onto the child
 * directly — no wrapper span — so it works seamlessly with absolutely
 * positioned children like Framer Motion elements.
 *
 * Usage:
 *   <Tooltip content="Ward — blocks first targeting">
 *     <button>WRD</button>
 *   </Tooltip>
 */
export function Tooltip({ content, children, delay = 0, side = 'bottom' }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timerRef = useRef(null);

  const show = useCallback(() => {
    if (delay > 0) {
      timerRef.current = setTimeout(() => setVisible(true), delay);
    } else {
      setVisible(true);
    }
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
    setPos(null);
  }, []);

  // Position the tooltip once it mounts and the trigger is measured
  useEffect(() => {
    if (!visible) return;
    const trigger = triggerRef.current;
    const tip = tooltipRef.current;
    if (!trigger || !tip) return;

    const tRect = trigger.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    // Vertical: prefer the requested side, flip if there's no room
    let actualSide = side;
    if (side === 'bottom') {
      if (window.innerHeight - tRect.bottom - TOOLTIP_OFFSET < tipRect.height + VIEWPORT_PAD) {
        actualSide = 'top';
      }
    } else if (side === 'top') {
      if (tRect.top - TOOLTIP_OFFSET < tipRect.height + VIEWPORT_PAD) {
        actualSide = 'bottom';
      }
    }
    const top = actualSide === 'top'
      ? tRect.top - tipRect.height - TOOLTIP_OFFSET
      : tRect.bottom + TOOLTIP_OFFSET;

    // Horizontal: centered, clamped to viewport
    let left = tRect.left + tRect.width / 2 - tipRect.width / 2;
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - tipRect.width - VIEWPORT_PAD));

    setPos({ left, top: Math.max(VIEWPORT_PAD, top) });
  }, [visible, side]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Merge our handlers with any existing ones on the child
  const child = Array.isArray(children) ? children[0] : children;
  const mergedProps = {
    ref: triggerRef,
    onMouseEnter: (e) => {
      show();
      child.props?.onMouseEnter?.(e);
    },
    onMouseLeave: (e) => {
      hide();
      child.props?.onMouseLeave?.(e);
    },
  };

  const tooltip = visible ? createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      className="fixed z-[1300] pointer-events-none px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        background: 'linear-gradient(180deg, rgba(30,25,14,0.98) 0%, rgba(16,13,8,0.98) 100%)',
        border: `1px solid ${GOLD} 0.45)`,
        borderRadius: '6px',
        boxShadow: `0 6px 20px rgba(0,0,0,0.5), 0 0 10px ${GOLD} 0.06)`,
        color: TEXT_PRIMARY,
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        letterSpacing: '0.02em',
      }}
    >
      {content}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {cloneElement(child, mergedProps)}
      {tooltip}
    </>
  );
}
