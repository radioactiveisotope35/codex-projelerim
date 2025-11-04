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
  let best = Infinity;
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
    if (d < best) best = d;
  }
  return best;
}

function ensureSegments(lane, points) {
  let segments = lane.segments;
  if (segments) return segments;
  segments = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    segments.push({
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      dx: len > 0 ? dx / len : 0,
      dy: len > 0 ? dy / len : 0,
      length: len,
      start: total
    });
    total += len;
  }
  lane.segments = segments;
  lane.length = lane.length ?? total;
  return segments;
}

export function projectAlongPolyline(lane, distance) {
  const source = lane && lane.points ? lane : { points: lane };
  const points = source.points || [];
  if (points.length === 0) {
    return { x: 0, y: 0, done: true, segmentIndex: 0 };
  }
  if (points.length === 1) {
    return { x: points[0].x, y: points[0].y, done: distance >= 0, segmentIndex: 0 };
  }
  const segments = ensureSegments(source, points);
  const total = source.length ?? segments.reduce((acc, seg) => acc + seg.length, 0);

  if (distance <= 0) {
    const seg = segments[0];
    if (!seg || seg.length === 0) {
      return { x: points[0].x, y: points[0].y, done: false, segmentIndex: 0 };
    }
    const ratio = distance / seg.length;
    return {
      x: seg.ax + (seg.bx - seg.ax) * ratio,
      y: seg.ay + (seg.by - seg.ay) * ratio,
      done: false,
      segmentIndex: 0
    };
  }

  let remaining = distance;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (remaining <= seg.length) {
      const ratio = seg.length > 0 ? remaining / seg.length : 0;
      return {
        x: seg.ax + (seg.bx - seg.ax) * ratio,
        y: seg.ay + (seg.by - seg.ay) * ratio,
        done: false,
        segmentIndex: i
      };
    }
    remaining -= seg.length;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y, done: true, segmentIndex: segments.length - 1 };
}

export function extendPolylineBy(points, headOut, tailOut) {
  if (!points || points.length < 2) {
    return points ? points.map(p => ({ x: p.x, y: p.y })) : [];
  }
  const original = points.map(p => ({ x: p.x, y: p.y }));
  const first = original[0];
  const second = original[1];
  const dx0 = second.x - first.x;
  const dy0 = second.y - first.y;
  const len0 = Math.hypot(dx0, dy0);
  if (len0 === 0) {
    return original.slice();
  }
  const head = {
    x: first.x - (dx0 / len0) * headOut,
    y: first.y - (dy0 / len0) * headOut
  };
  const last = original[original.length - 1];
  const prev = original[original.length - 2];
  const dxn = last.x - prev.x;
  const dyn = last.y - prev.y;
  const lenn = Math.hypot(dxn, dyn);
  if (lenn === 0) {
    return [head, ...original];
  }
  const tail = {
    x: last.x + (dxn / lenn) * tailOut,
    y: last.y + (dyn / lenn) * tailOut
  };
  return [head, ...original, tail];
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
