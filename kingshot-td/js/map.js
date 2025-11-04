export async function loadMap(name = 'meadow') {
  const safeName = String(name || 'meadow');
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

function tileToWorld(tileSize, tx, ty) {
  return {
    x: (tx + 0.5) * tileSize,
    y: (ty + 0.5) * tileSize
  };
}

export function bakeLanes(map) {
  const tileSize = map.tileSize;
  const lanes = (map.paths || []).map(path => {
    const points = path.map(([tx, ty]) => tileToWorld(tileSize, tx, ty));
    const segments = [];
    let totalLength = 0;
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
        len,
        start: totalLength
      });
      totalLength += len;
    }
    return {
      points,
      segments,
      length: totalLength
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
