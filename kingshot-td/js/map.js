import { pointInRect } from './utils.js';

export async function loadMap(name = 'meadow') {
  const url = `./maps/${name}.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load map data from ${url} (${res.status})`);
  }
  return res.json();
}

export function pathToWorld(points, tileSize) {
  return points.map(([tx, ty]) => ({
    x: (tx + 0.5) * tileSize,
    y: (ty + 0.5) * tileSize,
  }));
}

function buildLane(path, tileSize) {
  const points = pathToWorld(path, tileSize);
  const segments = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 0.0001;
    segments.push({
      from,
      to,
      len,
      dx: dx / len,
      dy: dy / len,
      start: total,
    });
    total += len;
  }
  const lane = {
    points,
    segments,
    length: total,
  };
  return lane;
}

export function bakeLanes(map) {
  const tileSize = map.tileSize;
  const lanes = (map.paths || []).map((path, idx) => {
    const lane = buildLane(path, tileSize);
    lane.index = idx;
    return lane;
  });
  return {
    tileSize,
    width: map.width * tileSize,
    height: map.height * tileSize,
    lanes,
  };
}

export function buildPads(map) {
  const tileSize = map.tileSize;
  const size = tileSize * 0.75;
  const offset = (tileSize - size) / 2;
  return (map.buildable || []).map(([tx, ty]) => {
    const pad = {
      x: tx * tileSize + offset,
      y: ty * tileSize + offset,
      w: size,
      h: size,
      tx,
      ty,
      centerX: tx * tileSize + tileSize / 2,
      centerY: ty * tileSize + tileSize / 2,
      occupied: false,
      hover: false,
    };
    return pad;
  });
}

export function startStateFromMap(map) {
  return {
    coins: map.startCoins ?? 0,
    lives: map.startLives ?? 20,
  };
}

export function padAt(pads, x, y) {
  for (const pad of pads) {
    if (!pad.occupied && pointInRect(x, y, pad)) {
      return pad;
    }
  }
  return null;
}
