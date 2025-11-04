/**
 * pathfinding.js
 * Converts waypoint lists into smooth path samples for enemies to follow.
 * How to extend: support alternate path behaviors or procedural sampling.
 */

import { dist } from './util.js';

export function loadPathSamples(points, tileSize, laneIndex) {
  const samples = [];
  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    segments.push({ x1, y1, x2, y2, length, laneIndex });
    totalLength += length;
  }
  const step = 0.25;
  for (const seg of segments) {
    const steps = Math.max(1, Math.floor(seg.length / step));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = seg.x1 + (seg.x2 - seg.x1) * t;
      const y = seg.y1 + (seg.y2 - seg.y1) * t;
      samples.push({ x, y, lane: seg.laneIndex });
    }
  }
  return { samples, length: totalLength, segments };
}

export function advanceAlongPath(path, progress) {
  const total = path.samples.length;
  const index = Math.min(total - 1, Math.max(0, Math.floor(progress)));
  const frac = progress - index;
  const current = path.samples[index];
  const next = path.samples[Math.min(total - 1, index + 1)];
  const x = current.x + (next.x - current.x) * frac;
  const y = current.y + (next.y - current.y) * frac;
  return { x, y, lane: current.lane };
}
