import { extendPolylineBy } from './utils.js';

export async function loadMap(name = 'meadow') {
  const url = `./maps/${name}.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load map: ${url} (${res.status})`);
  }
  return res.json();
}

export function bakeLanes(map, opts = {}) {
  const tileSize = map.tileSize;
  const lanes = map.paths.map((lane) =>
    lane.map(([tx, ty]) => ({ x: (tx + 0.5) * tileSize, y: (ty + 0.5) * tileSize }))
  );

  if (opts.offscreen !== false) {
    const entryOut = Math.max(0.8 * tileSize, 0.55 * tileSize + 40);
    const exitOut = entryOut;
    for (let i = 0; i < lanes.length; i++) {
      lanes[i] = extendPolylineBy(lanes[i], entryOut, exitOut);
    }
  }

  return {
    lanes,
    tileSize,
    width: map.width,
    height: map.height,
    worldW: map.width * tileSize,
    worldH: map.height * tileSize,
  };
}

export function startStateFromMap(map) {
  return { coins: map.startCoins, lives: map.startLives };
}
