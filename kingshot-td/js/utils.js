export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function nowSeconds() {
  return performance.now() * 0.001;
}

export function seededRng(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function pointToPolylineDistance(px, py, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
      t = clamp(t, 0, 1);
    }
    const ex = lerp(a.x, b.x, t);
    const ey = lerp(a.y, b.y, t);
    const d2 = dist2(px, py, ex, ey);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

export function projectAlongPolyline(poly, tPixels) {
  let remaining = tPixels;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const segLen = dist(a.x, a.y, b.x, b.y);
    if (remaining <= segLen) {
      const ratio = segLen > 0 ? remaining / segLen : 0;
      return { x: lerp(a.x, b.x, ratio), y: lerp(a.y, b.y, ratio), done: false };
    }
    remaining -= segLen;
  }
  const last = poly[poly.length - 1];
  return { x: last.x, y: last.y, done: true };
}

export function extendPolylineBy(poly, headOut, tailOut) {
  if (poly.length < 2) return poly.slice();
  const first = poly[0];
  const second = poly[1];
  const last = poly[poly.length - 1];
  const prev = poly[poly.length - 2];

  const fx = first.x - second.x;
  const fy = first.y - second.y;
  const fl = Math.hypot(fx, fy) || 1;
  const lx = last.x - prev.x;
  const ly = last.y - prev.y;
  const ll = Math.hypot(lx, ly) || 1;

  const head = { x: first.x + (fx / fl) * headOut, y: first.y + (fy / fl) * headOut };
  const tail = { x: last.x + (lx / ll) * tailOut, y: last.y + (ly / ll) * tailOut };

  return [head, ...poly, tail];
}

export function on(target, event, fn, opts) {
  target.addEventListener(event, fn, opts);
}

export function off(target, event, fn, opts) {
  target.removeEventListener(event, fn, opts);
}

export class SpawnQueue {
  constructor() {
    this.list = [];
  }

  add(entry) {
    let i = 0;
    while (i < this.list.length && this.list[i].at <= entry.at) i++;
    this.list.splice(i, 0, entry);
  }

  flush(now, cb) {
    while (this.list.length && this.list[0].at <= now) {
      cb(this.list.shift());
    }
  }

  isEmpty() {
    return this.list.length === 0;
  }

  clear() {
    this.list.length = 0;
  }
}
