/**
 * Renderer-side performance collector. Wraps key operations with
 * performance.now() timers, accumulates samples in a rolling window,
 * and periodically POSTs a summary to /api/perf-log so the dev tooling
 * can read it from /tmp/valkenhall-perf.log without opening DevTools.
 *
 * Two kinds of measurements:
 *
 *   - Timed sections (start/end pairs): physics step, mesh sync, full
 *     frame. The collector tracks count, total ms, max ms, and a small
 *     reservoir for percentiles.
 *
 *   - Counters: things you increment per event. Mesh count, awake body
 *     count, pose-stream sends, claims, releases, snapshots received.
 *
 * Usage:
 *
 *   import { perf } from '../utils/perfMonitor';
 *
 *   perf.start();                  // start the periodic flush
 *
 *   const m = perf.beginMark('frame');
 *   // ... work ...
 *   perf.endMark(m);
 *
 *   perf.count('mesh.spawn');      // increment a counter
 *   perf.gauge('mesh.count', n);   // record a current value
 *
 *   perf.stop();                   // stop the periodic flush
 *
 * The flush sends a single JSON object containing all timed sections
 * and counters from the previous window, then resets the window.
 */

import { getLocalApiOrigin } from './localApi';

const FLUSH_INTERVAL_MS = 2000;

class PerfMonitor {
  constructor() {
    this.enabled = false;
    this.flushTimer = null;
    this.windowStart = 0;
    this.sections = new Map(); // name -> { count, totalMs, maxMs, samples[] }
    this.counters = new Map(); // name -> int
    this.gauges = new Map();   // name -> { last, max }
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.windowStart = performance.now();
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // Begin a timed section. Returns a token to pass to endMark().
  // Inlined hot path: don't allocate an object — just close over the
  // start time via a small array.
  beginMark(name) {
    if (!this.enabled) return null;
    return [name, performance.now()];
  }

  endMark(token) {
    if (!token) return;
    const elapsed = performance.now() - token[1];
    const name = token[0];
    let s = this.sections.get(name);
    if (!s) {
      s = { count: 0, totalMs: 0, maxMs: 0, samples: [] };
      this.sections.set(name, s);
    }
    s.count++;
    s.totalMs += elapsed;
    if (elapsed > s.maxMs) s.maxMs = elapsed;
    // Reservoir of up to 200 samples for p95/p99 calculation at flush time.
    if (s.samples.length < 200) {
      s.samples.push(elapsed);
    } else {
      // Random replacement to keep the reservoir representative.
      const idx = Math.floor(Math.random() * s.samples.length);
      s.samples[idx] = elapsed;
    }
  }

  count(name, n = 1) {
    if (!this.enabled) return;
    this.counters.set(name, (this.counters.get(name) || 0) + n);
  }

  gauge(name, value) {
    if (!this.enabled) return;
    let g = this.gauges.get(name);
    if (!g) {
      g = { last: value, max: value };
      this.gauges.set(name, g);
    } else {
      g.last = value;
      if (value > g.max) g.max = value;
    }
  }

  async flush() {
    if (!this.enabled) return;
    const now = performance.now();
    const windowMs = now - this.windowStart;
    this.windowStart = now;

    if (this.sections.size === 0 && this.counters.size === 0 && this.gauges.size === 0) {
      return; // nothing to report
    }

    const sectionsOut = {};
    for (const [name, s] of this.sections) {
      const sorted = s.samples.slice().sort((a, b) => a - b);
      const p = (q) => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
      sectionsOut[name] = {
        n: s.count,
        avg: +(s.totalMs / s.count).toFixed(3),
        max: +s.maxMs.toFixed(3),
        p50: +p(0.5).toFixed(3),
        p95: +p(0.95).toFixed(3),
        p99: +p(0.99).toFixed(3),
      };
    }

    const countersOut = {};
    for (const [name, c] of this.counters) countersOut[name] = c;

    const gaugesOut = {};
    for (const [name, g] of this.gauges) gaugesOut[name] = { last: g.last, max: g.max };

    // Reset window
    this.sections.clear();
    this.counters.clear();
    this.gauges.clear();

    const payload = {
      windowMs: +windowMs.toFixed(0),
      sections: sectionsOut,
      counters: countersOut,
      gauges: gaugesOut,
    };

    try {
      // Don't await — fire and forget. We don't want flush latency to
      // bleed into the next sample window.
      fetch(`${getLocalApiOrigin()}/api/perf-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }
}

export const perf = new PerfMonitor();
