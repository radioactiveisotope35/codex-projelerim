const BASE_TILE_SIZE = 64;
const BASE_WIDTH = 20;
const BASE_HEIGHT = 12;

function clonePath(points) {
  return points.map(([x, y]) => [x, y]);
}

function buildPresetObject(name, pathPoints) {
  return {
    name,
    tileSize: BASE_TILE_SIZE,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    paths: [clonePath(pathPoints)],
    buildable: [],
    startCoins: 120,
    startLives: 20,
    waveset: 'meadow-20'
  };
}

const PRESETS = {
  'preset-lemons': buildPresetObject('Lemons Run', [
    [0, 7],
    [2, 6],
    [4, 4],
    [6, 3],
    [8, 4],
    [10, 6],
    [12, 8],
    [15, 7],
    [18, 6],
    [19, 5]
  ]),
  'preset-figure8': buildPresetObject('Figure Eight', [
    [0, 6],
    [2, 3],
    [5, 2],
    [8, 4],
    [10, 6],
    [8, 8],
    [5, 10],
    [3, 9],
    [6, 6],
    [9, 5],
    [12, 4],
    [15, 5],
    [18, 7]
  ]),
  'preset-switchback': buildPresetObject('Switchback Ridge', [
    [0, 3],
    [6, 3],
    [6, 5],
    [2, 5],
    [2, 7],
    [8, 7],
    [8, 9],
    [3, 9],
    [3, 10],
    [10, 10],
    [10, 8],
    [15, 8],
    [15, 5],
    [19, 5]
  ])
};

export function build(name) {
  const key = String(name || '').toLowerCase();
  const preset = PRESETS[key];
  return preset ? JSON.parse(JSON.stringify(preset)) : null;
}
