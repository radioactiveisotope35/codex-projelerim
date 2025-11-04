/**
 * util.js
 * Helper math, RNG, geometry and easing utilities used across the game.
 * How to extend: add additional math helpers or deterministic utilities here.
 */

export class RNG {
  constructor(seed = 1) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next() {
    return (this.seed = (this.seed * 16807) % 2147483647);
  }
  nextFloat() {
    return (this.next() - 1) / 2147483646;
  }
  range(min, max) {
    return min + (max - min) * this.nextFloat();
  }
}

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeOutQuad(t) {
  return t * (2 - t);
}

export function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function distSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function pointInCircle(px, py, cx, cy, radius) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

export function worldToScreen(camera, x, y, z = 0) {
  const scale = camera.scale;
  const isoX = (x - y) * camera.tileW * 0.5;
  const isoY = (x + y) * camera.tileH * 0.5 - z;
  return {
    x: (isoX - camera.x) * scale + camera.width / 2,
    y: (isoY - camera.y) * scale + camera.height / 2,
  };
}

export function screenToWorld(camera, sx, sy) {
  const scale = camera.scale;
  const nx = (sx - camera.width / 2) / scale + camera.x;
  const ny = (sy - camera.height / 2) / scale + camera.y;
  const x = (ny / camera.tileH + nx / camera.tileW);
  const y = (ny / camera.tileH - nx / camera.tileW);
  return { x, y };
}

export function rectContains(rect, px, py) {
  return px >= rect.x && py >= rect.y && px <= rect.x + rect.w && py <= rect.y + rect.h;
}

export function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function formatCoins(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.floor(value)}`;
}

export function shallowClone(obj) {
  return Object.assign({}, obj);
}

export function now() {
  return performance.now();
}

export function tween(value, target, speed, dt) {
  const diff = target - value;
  const step = diff * clamp(speed * dt, 0, 1);
  return value + step;
}

export function hashStringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}
