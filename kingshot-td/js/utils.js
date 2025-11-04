/**
 * Collection of lightweight math and scheduling helpers used across the Tower Defense prototype.
 * All utilities here are self-contained and framework-agnostic so they can be safely imported
 * from any module without introducing side effects.
 */

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function rand(min = 0, max = 1) {
  return Math.random() * (max - min) + min;
}

export function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function nowSeconds() {
  return performance.now() / 1000;
}

export class Timeline {
  constructor() {
    this.events = [];
  }

  schedule(time, payload) {
    const evt = { time, payload };
    if (this.events.length === 0 || time >= this.events[this.events.length - 1].time) {
      this.events.push(evt);
      return;
    }
    let lo = 0;
    let hi = this.events.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (time < this.events[mid].time) hi = mid - 1;
      else lo = mid + 1;
    }
    this.events.splice(lo, 0, evt);
  }

  popDue(now) {
    const due = [];
    while (this.events.length && this.events[0].time <= now) {
      const next = this.events.shift();
      due.push(next.payload);
    }
    return due;
  }

  clear() {
    this.events.length = 0;
  }

  isEmpty() {
    return this.events.length === 0;
  }

  peekTime() {
    return this.events.length ? this.events[0].time : Infinity;
  }
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function rectsOverlap(a, b) {
  return !(
    a.x + a.w <= b.x ||
    a.x >= b.x + b.w ||
    a.y + a.h <= b.y ||
    a.y >= b.y + b.h
  );
}

export function pointInCircle(x, y, circle) {
  const dx = x - circle.x;
  const dy = y - circle.y;
  return dx * dx + dy * dy <= circle.r * circle.r;
}
