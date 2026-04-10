import { motion, AnimatePresence } from 'framer-motion';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
} from '../../lib/medievalTheme';
import { STATUS_EFFECTS } from '../../utils/game/cardMesh';
import { playUI, UI } from '../../utils/arena/uiSounds';
import { Tooltip } from '../ui/tooltip';

const RING_RADIUS = 115;
const BADGE_SIZE = 38;

// Solid 3D badge style — dark base with a radial "dome" gradient,
// gold rim, colored top-glow, no stone texture, fully opaque.
function badgeStyle(color, isActive) {
  return {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: '50%',
    border: `2px solid ${isActive ? 'rgba(220,180,80,0.8)' : 'rgba(140,110,50,0.7)'}`,
    background: isActive
      ? `radial-gradient(circle at 40% 35%, ${color}ee, ${color}bb 55%, ${color}88 100%)`
      : `radial-gradient(circle at 40% 35%, #3a3530, #201c18 55%, #0e0c0a 100%)`,
    color: isActive ? '#fff' : color,
    boxShadow: isActive
      ? `0 0 16px ${color}55, inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 4px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.6)`
      : 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.6)',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.03em',
    textShadow: isActive
      ? '0 1px 3px rgba(0,0,0,0.7)'
      : `0 0 8px ${color}66, 0 1px 2px rgba(0,0,0,0.6)`,
  };
}

export default function StatusRingMenu({ ringMenu, onToggle, onClearAll, onClose, viewScale = 1 }) {
  const open = !!ringMenu;
  return (
    <AnimatePresence>
      {open && <RingMenuContent ringMenu={ringMenu} onToggle={onToggle} onClearAll={onClearAll} onClose={onClose} viewScale={viewScale} />}
    </AnimatePresence>
  );
}

function RingMenuContent({ ringMenu, onToggle, onClearAll, onClose, viewScale }) {
  const { cardInstance, x, y } = ringMenu;
  const activeStatuses = cardInstance.statuses || [];
  const scale = viewScale || 1;
  const cx = x / scale;
  const cy = y / scale;
  const N = STATUS_EFFECTS.length;

  return (
    <motion.div
      className="fixed inset-0 z-[1100]"
      style={{ zoom: scale }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
    >
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)' }} />

      {STATUS_EFFECTS.map((effect, i) => {
        const isActive = activeStatuses.includes(effect.key);
        const angle = ((2 * Math.PI) / N) * i - Math.PI / 2;
        const tx = cx + RING_RADIUS * Math.cos(angle) - BADGE_SIZE / 2;
        const ty = cy + RING_RADIUS * Math.sin(angle) - BADGE_SIZE / 2;

        return (
          <Tooltip key={effect.key} content={effect.label}>
            <motion.button
              type="button"
              className="absolute flex items-center justify-center cursor-pointer"
              initial={{ left: cx - BADGE_SIZE / 2, top: cy - BADGE_SIZE / 2, scale: 0, opacity: 0 }}
              animate={{ left: tx, top: ty, scale: 1, opacity: 1 }}
              exit={{ left: cx - BADGE_SIZE / 2, top: cy - BADGE_SIZE / 2, scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30, delay: i * 0.012 }}
              whileHover={{ scale: 1.18, transition: { duration: 0.08 } }}
              whileTap={{ scale: 0.88, transition: { duration: 0.05 } }}
              style={badgeStyle(effect.color, isActive)}
              onClick={(e) => {
                e.stopPropagation();
                playUI(UI.SELECT);
                onToggle(cardInstance, effect.key);
                onClose();
              }}
            >
              {effect.abbr}
            </motion.button>
          </Tooltip>
        );
      })}

      {/* Center: Clear button when any status is active, else label */}
      {activeStatuses.length > 0 ? (
        <Tooltip content="Clear All">
        <motion.button
          type="button"
          className="absolute flex items-center justify-center cursor-pointer"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          whileHover={{ scale: 1.12, transition: { duration: 0.08 } }}
          whileTap={{ scale: 0.88, transition: { duration: 0.05 } }}
          style={{
            left: cx - 22,
            top: cy - 22,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '2px solid rgba(180,70,70,0.7)',
            background: 'radial-gradient(circle at 40% 35%, #4a2828, #2a1515 55%, #180c0c 100%)',
            color: '#e87070',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.6)',
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            textShadow: '0 1px 2px rgba(0,0,0,0.7)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            playUI(UI.CANCEL);
            onClearAll(cardInstance);
            onClose();
          }}
        >
          Clear
        </motion.button>
        </Tooltip>
      ) : (
        <motion.div
          className="absolute pointer-events-none text-[10px] font-semibold uppercase tracking-wider text-center"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          style={{
            left: cx - 40,
            top: cy - 6,
            width: 80,
            color: TEXT_MUTED,
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}
        >
          Status
        </motion.div>
      )}
    </motion.div>
  );
}
