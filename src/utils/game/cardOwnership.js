/**
 * CardOwnership — per-card authority state for physics-based multiplayer.
 *
 * Each card on the table is in one of three states:
 *
 *   'free'   — nobody owns it. Body is dynamic, asleep. Pose is consensus.
 *   'local'  — the local player owns it. Body is dynamic (or kinematic
 *              while dragging). The owner streams pose updates at ~30 Hz
 *              and releases ownership when the body sleeps.
 *   'remote' — the opponent owns it. Body is kinematic with collision
 *              response disabled, so it can't push local-owned bodies.
 *              Per-frame interpolation reads pose snapshots from a small
 *              buffer and applies them with a fixed render delay.
 *
 * The owner is whoever's local action (drag, drop, or cascade collision)
 * caused the body to wake. Ownership lasts until the body sleeps again,
 * at which point a release message hands the card back to 'free'.
 *
 * This module is pure data + helpers. The body manipulation (kinematic
 * mode, collision response) and mesh syncing live in physicsWorld.js
 * and GameBoard.jsx; this module only tracks state and computes whether
 * to broadcast / what pose to render.
 *
 * Snapshot interpolation:
 *   Incoming pose snapshots are timestamped on receipt with the local
 *   clock and pushed onto a per-card ring buffer. Each frame, the
 *   render loop samples the buffer at (now - REMOTE_RENDER_DELAY_MS),
 *   interpolating between the two bracketing snapshots. The render
 *   delay hides packet jitter at the cost of a small constant lag.
 */

/**
 * Pose stream throttle: minimum interval between outgoing pose updates
 * for a single card. ~30 Hz matches what TTS-class engines use and is
 * indistinguishable from continuous on the wire.
 */
export const POSE_STREAM_INTERVAL_MS = 33;

/**
 * Render delay for interpolating remote-owned cards. Snapshots are
 * sampled at (now - delay) so we always have a snapshot in the past
 * and one in the present, allowing smooth lerp/slerp instead of
 * snap-to-pose. 100ms is the standard sweet spot — large enough to
 * absorb typical packet jitter, small enough to feel responsive.
 */
export const REMOTE_RENDER_DELAY_MS = 100;

/**
 * Don't broadcast a pose update if the position moved by less than this
 * (in world units; ~1 cm) AND the rotation changed by less than the
 * angular threshold below. Avoids spamming the wire with sub-pixel jitter.
 */
const POS_BROADCAST_EPSILON_SQ = 0.0001;
/** Quaternion dot threshold: 1 - cos(0.5°) ≈ 4e-5. */
const QUAT_BROADCAST_EPSILON = 0.99996;

/** Maximum snapshots kept per remote card (~660ms of buffer at 30 Hz). */
const SNAPSHOT_BUFFER_LIMIT = 20;

export class CardOwnership {
  constructor() {
    this._state = new Map(); // cardId -> 'local' | 'remote' (free is absent)
    this._lastBroadcast = new Map(); // cardId -> { time, pos[3], quat[4] }
    this._snapshots = new Map(); // cardId -> [{ time, pos[3], quat[4] }, ...]
  }

  // --- State ---------------------------------------------------------

  /** Returns 'local', 'remote', or 'free'. */
  get(cardId) {
    return this._state.get(cardId) || 'free';
  }

  is(cardId, owner) {
    return this.get(cardId) === owner;
  }

  setLocal(cardId) {
    this._state.set(cardId, 'local');
  }

  setRemote(cardId) {
    this._state.set(cardId, 'remote');
  }

  /** Hand the card back to the consensus pool. Clears all bookkeeping. */
  setFree(cardId) {
    this._state.delete(cardId);
    this._lastBroadcast.delete(cardId);
    this._snapshots.delete(cardId);
  }

  /** Card removed from the table — drop everything we know about it. */
  forget(cardId) {
    this.setFree(cardId);
  }

  // --- Outbound throttling -------------------------------------------

  /**
   * Should we broadcast a pose for this card right now? True if enough
   * time has passed since the last broadcast AND the pose changed by
   * more than the per-axis epsilon. Also true if no prior broadcast
   * exists (first sample after claim).
   */
  shouldBroadcast(cardId, pos, quat, now) {
    const last = this._lastBroadcast.get(cardId);
    if (!last) return true;
    if (now - last.time < POSE_STREAM_INTERVAL_MS) return false;
    const dx = pos[0] - last.pos[0];
    const dy = pos[1] - last.pos[1];
    const dz = pos[2] - last.pos[2];
    if (dx * dx + dy * dy + dz * dz > POS_BROADCAST_EPSILON_SQ) return true;
    const qdot = Math.abs(
      quat[0] * last.quat[0] + quat[1] * last.quat[1]
      + quat[2] * last.quat[2] + quat[3] * last.quat[3]
    );
    return qdot < QUAT_BROADCAST_EPSILON;
  }

  recordBroadcast(cardId, pos, quat, now) {
    this._lastBroadcast.set(cardId, {
      time: now,
      pos: [pos[0], pos[1], pos[2]],
      quat: [quat[0], quat[1], quat[2], quat[3]],
    });
  }

  // --- Inbound snapshot buffer ---------------------------------------

  /**
   * Record an incoming pose snapshot for a remote-owned card. Time is
   * the LOCAL receive time (performance.now()), not the sender's clock,
   * because the two clients aren't time-synced. This is fine because
   * the render delay is computed in the same local frame.
   */
  pushSnapshot(cardId, pos, quat, time) {
    let buf = this._snapshots.get(cardId);
    if (!buf) {
      buf = [];
      this._snapshots.set(cardId, buf);
    }
    buf.push({
      time,
      pos: [pos[0], pos[1], pos[2]],
      quat: [quat[0], quat[1], quat[2], quat[3]],
    });
    if (buf.length > SNAPSHOT_BUFFER_LIMIT) buf.shift();
  }

  /**
   * Sample the snapshot buffer at the given render time, returning
   * { pos[3], quat[4] } interpolated between the two bracketing samples.
   * Returns null if the buffer is empty.
   *
   * Behaviour at the edges:
   *   - renderTime before the oldest sample → returns the oldest sample
   *     (clamps; happens during the first ~100ms after a claim)
   *   - renderTime after the newest sample → returns the newest sample
   *     (no extrapolation; if the stream stalls we hold the last pose)
   */
  sampleAt(cardId, renderTime) {
    const buf = this._snapshots.get(cardId);
    if (!buf || buf.length === 0) return null;
    if (renderTime <= buf[0].time) {
      return { pos: buf[0].pos, quat: buf[0].quat };
    }
    const last = buf[buf.length - 1];
    if (renderTime >= last.time) {
      return { pos: last.pos, quat: last.quat };
    }
    for (let i = 0; i < buf.length - 1; i++) {
      const a = buf[i];
      const b = buf[i + 1];
      if (renderTime >= a.time && renderTime <= b.time) {
        const span = b.time - a.time;
        const t = span > 0 ? (renderTime - a.time) / span : 0;
        return {
          pos: lerpVec3(a.pos, b.pos, t),
          quat: slerpQuat(a.quat, b.quat, t),
        };
      }
    }
    return { pos: last.pos, quat: last.quat };
  }
}

function lerpVec3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Shortest-path quaternion slerp. Falls back to nlerp when the angle
 * is tiny (sinTheta near zero) to avoid division-by-zero noise.
 */
function slerpQuat(a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    dot = -dot;
  }
  if (dot > 0.9995) {
    const x = a[0] + (bx - a[0]) * t;
    const y = a[1] + (by - a[1]) * t;
    const z = a[2] + (bz - a[2]) * t;
    const w = a[3] + (bw - a[3]) * t;
    const len = Math.hypot(x, y, z, w) || 1;
    return [x / len, y / len, z / len, w / len];
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const wA = Math.sin((1 - t) * theta) / sinTheta;
  const wB = Math.sin(t * theta) / sinTheta;
  return [
    a[0] * wA + bx * wB,
    a[1] * wA + by * wB,
    a[2] * wA + bz * wB,
    a[3] * wA + bw * wB,
  ];
}
