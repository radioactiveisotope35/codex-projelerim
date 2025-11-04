export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function nowSeconds() {
  return performance.now() / 1000;
}

export function seededRng(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    }
  };
}

export function pointToPolylineDistance(px, py, polyline) {
  if (!polyline || polyline.length === 0) {
    return Infinity;
  }
  if (polyline.length === 1) {
    return dist(px, py, polyline[0].x, polyline[0].y);
  }
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
      t = clamp(t, 0, 1);
    }
    const sx = a.x + dx * t;
    const sy = a.y + dy * t;
    const d = dist(px, py, sx, sy);
    if (d < min) {
      min = d;
    }
  }
  return min;
}

export function circleCircleOverlap(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

export function on(element, event, handler, options) {
  element.addEventListener(event, handler, options);
}

export function off(element, event, handler, options) {
  element.removeEventListener(event, handler, options);
}
