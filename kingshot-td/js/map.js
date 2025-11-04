/**
 * map.js
 * Responsible for loading map JSON files and preparing build spots and paths.
 * How to extend: add new map modifiers or dynamic events in the loader.
 */

import { loadPathSamples } from './pathfinding.js';

export class GameMap {
  constructor(data) {
    this.name = data.name;
    this.tileSize = data.tileSize;
    this.width = data.width;
    this.height = data.height;
    this.paths = data.paths.map((path, index) => loadPathSamples(path, data.tileSize, index));
    this.buildable = data.buildable.map(([x, y]) => ({ x, y }));
    this.startCoins = data.startCoins;
    this.startLives = data.startLives;
    this.waveset = data.waveset;
  }

  findClosestExit(pos) {
    let best = null;
    let bestDist = Infinity;
    for (const path of this.paths) {
      const last = path.samples[path.samples.length - 1];
      const dx = last.x - pos.x;
      const dy = last.y - pos.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = last;
      }
    }
    return best;
  }
}

export async function loadMap(name) {
  const response = await fetch(`./maps/${name}.json`);
  const data = await response.json();
  return new GameMap(data);
}
