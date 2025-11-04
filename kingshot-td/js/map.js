import { extendPolylineBy } from './utils.js';
import { build as buildPreset } from './presets.js';

const ENTRY_OUT_FACTOR = 0.55;
const ENTRY_MIN = 0.8;

function tileToWorld(tileSize, tx, ty) {
  return {
    x: (tx + 0.5) * tileSize,
    y: (ty + 0.5) * tileSize
  };
}

export async function loadMap(name = 'meadow') {
  const safeName = String(name || 'meadow');
  if (safeName.startsWith('preset-')) {
    const preset = buildPreset(safeName);
    if (!preset) {
      throw new Error(`Unknown preset map: ${safeName}`);
    }
    return preset;
  }
  const url = `./maps/${safeName}.json`;
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (err) {
    throw new Error(`Failed to fetch map ${url}: ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to load map ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

export function bakeLanes(map, opts = {}) {
  const tileSize = map.tileSize;
  const offscreen = opts.offscreen !== false;
  const entryOut = Math.max(ENTRY_MIN * tileSize, ENTRY_OUT_FACTOR * tileSize + 40);
  const tailOut = entryOut;

  const lanes = (map.paths || []).map(path => {
    const basePoints = path.map(([tx, ty]) => tileToWorld(tileSize, tx, ty));
    const extended = offscreen && basePoints.length >= 2
      ? extendPolylineBy(basePoints, entryOut, tailOut)
      : basePoints.map(p => ({ x: p.x, y: p.y }));

    const segments = [];
    let length = 0;
    for (let i = 0; i < extended.length - 1; i++) {
      const a = extended[i];
      const b = extended[i + 1];
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
        start: length
      });
      length += len;
    }

    return {
      points: extended,
      segments,
      length
    };
  });

  return {
    lanes,
    tileSize,
    width: map.width,
    height: map.height,
    worldW: map.width * tileSize,
    worldH: map.height * tileSize
  };
}

export function startStateFromMap(map) {
  return {
    coins: map.startCoins,
    lives: map.startLives
  };
}
