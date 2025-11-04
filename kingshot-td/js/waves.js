import { BALANCE } from './balance.js';
import { clamp, seededRng } from './utils.js';

function buildSet(seed) {
  const rng = seededRng(seed);
  const waves = {};
  const maxWave = 25;
  for (let wave = 1; wave <= maxWave; wave++) {
    const budget = BALANCE.waves.pointsForWave(wave);
    const traitsPool = BALANCE.waves.schedule(wave);
    const groups = [];
    let remaining = budget;
    let attempts = 0;
    const typePool = ['Grunt'];
    if (wave >= 2) typePool.push('Runner');
    if (wave >= 4) typePool.push('Shielded');
    if (wave >= 6) typePool.push('Specter');
    if (wave >= 9) typePool.push('Tank');

    while (remaining > 0 && groups.length < 4 && attempts < 32) {
      attempts++;
      const type = typePool[Math.floor(rng.next() * typePool.length)];
      const baseCost = BALANCE.waves.enemyPointCost[type];
      if (!baseCost) break;
      const lane = groups.length % 2; // simple alternation; runtime will mod by actual lanes
      const traitCount = traitsPool.length ? Math.min(2, Math.floor(rng.next() * (traitsPool.length + 1))) : 0;
      const traitSet = [];
      for (let t = 0; t < traitCount; t++) {
        const trait = traitsPool[Math.floor(rng.next() * traitsPool.length)];
        if (trait && !traitSet.includes(trait)) traitSet.push(trait);
      }
      const traitCost = traitSet.reduce((sum, tr) => sum + (BALANCE.waves.traitPointCost[tr] || 0), 0);
      const costPer = baseCost + traitCost;
      if (costPer <= 0 || costPer > remaining && groups.length > 0) {
        if (attempts > 24) break;
        continue;
      }
      const ratio = clamp(remaining / costPer, 1, 12);
      const count = Math.max(1, Math.floor(ratio * (0.35 + rng.next() * 0.65)));
      const spend = count * costPer;
      if (spend > remaining && count > 1) {
        continue;
      }
      remaining -= spend;
      groups.push({
        type,
        count,
        gap: 0.35 + rng.next() * 0.45,
        lane,
        hpMul: 1,
        traits: traitSet,
      });
      if (remaining < Math.min(...Object.values(BALANCE.waves.enemyPointCost))) break;
    }

    if (!groups.length) {
      groups.push({ type: 'Grunt', count: 8 + Math.floor(wave * 0.6), gap: 0.5, lane: 0, hpMul: 1, traits: [] });
    }

    waves[wave] = groups;
  }
  return waves;
}

const CACHE = {};

export function waveset_meadow() {
  return CACHE.meadow || (CACHE.meadow = buildSet(1013));
}

export function waveset_canyon() {
  return CACHE.canyon || (CACHE.canyon = buildSet(2099));
}

export function waveset_crossroads() {
  return CACHE.crossroads || (CACHE.crossroads = buildSet(3091));
}

export function wavesByName(name) {
  const key = (name || '').toLowerCase();
  if (key.includes('canyon')) return waveset_canyon();
  if (key.includes('cross')) return waveset_crossroads();
  return waveset_meadow();
}
