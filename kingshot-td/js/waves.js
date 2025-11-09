import { BALANCE } from './balance.js';

const BASE_WAVES = [
  null,
  // Wave 1: (Phase 1 Fix) Gentle introduction to Grunts.
  [group({ type: 'Grunt', count: 10, gap: 2.2, lane: 0 })],

  // Wave 2: A few more Grunts.
  [group({ type: 'Grunt', count: 16, gap: 2.0, lane: 0 })],

  // Wave 3: Introduce the second lane (if map has one) and first Runners.
  [
    group({ type: 'Grunt', count: 10, gap: 2.1, lane: 0 }),
    group({ type: 'Runner', count: 6, gap: 1.8, lane: 1 }),
  ],

  // Wave 4: A simple mix of Grunts and Runners.
  [
    group({ type: 'Grunt', count: 12, gap: 1.5, lane: 0 }),
    group({ type: 'Runner', count: 10, gap: 2.0, lane: 1 }),
  ],

  // Wave 5: Introduce the "Camo" trait.
  [
    group({ type: 'Grunt', count: 10, gap: 1.2, lane: 0 }),
    group({ type: 'Runner', count: 8, gap: 1.5, lane: 1, traits: ['camo'] }),
  ],

  // Wave 6: A heavier mix, testing the player's early setup.
  [
    group({ type: 'Runner', count: 12, gap: 1.0, lane: 0 }),
    group({ type: 'Grunt', count: 15, gap: 1.3, lane: 1 }),
  ],

  // Wave 7: Introduce "Shielded" (armored) enemies.
  [
    group({ type: 'Shielded', count: 8, gap: 2.0, lane: 0 }),
    group({ type: 'Runner', count: 10, gap: 1.5, lane: 1 }),
  ],

  // Wave 8: Mix Shielded and fast enemies.
  [
    group({ type: 'Grunt', count: 20, gap: 0.8, lane: 0 }),
    group({ type: 'Shielded', count: 10, gap: 2.2, lane: 1 }),
  ],

  // Wave 9: Introduce "Specter" and Camo pressure.
  [
    group({ type: 'Specter', count: 12, gap: 1.5, lane: 1 }),
    group({ type: 'Runner', count: 15, gap: 1.0, lane: 0, traits: ['camo'] }),
  ],

  // Wave 10: Introduce "Lead" (the first "wall" that requires specific upgrades).
  [
    group({ type: 'Grunt', count: 10, gap: 1.0, lane: 0, traits: ['lead'] }),
    group({ type: 'Shielded', count: 12, gap: 1.8, lane: 1 }),
  ],

  // --- Start of Phase 4 Replacement ---

  // Wave 11: A light wave to recover, mixing camo and lead.
  [
    group({ type: 'Runner', count: 12, gap: 1.2, lane: 0, traits: ['camo'] }),
    group({ type: 'Grunt', count: 8, gap: 2.0, lane: 1, traits: ['lead'] }),
  ],

  // Wave 12: More lead, and introducing the Tank.
  [
    group({ type: 'Tank', count: 2, gap: 2.5, lane: 0 }),
    group({ type: 'Shielded', count: 10, gap: 1.5, lane: 1, traits: ['lead'] }),
  ],

  // Wave 13: A dense wave of Runners and Shielded.
  [
    group({ type: 'Runner', count: 25, gap: 0.8, lane: 0 }),
    group({ type: 'Shielded', count: 15, gap: 1.3, lane: 1 }),
  ],

  // Wave 14: Camo and Tank pressure.
  [
    group({ type: 'Tank', count: 2, gap: 2.0, lane: 1 }),
    group({ type: 'Specter', count: 20, gap: 1.0, lane: 0, traits: ['camo'] }),
  ],

  // Wave 15: Introduce "Fortified" (on Grunts first).
  [
    group({ type: 'Grunt', count: 15, gap: 1.0, lane: 0, traits: ['fortified'] }),
    group({ type: 'Grunt', count: 15, gap: 1.0, lane: 1 }),
    group({ type: 'Shielded', count: 10, gap: 2.0, lane: 0, traits: ['lead'] }),
  ],

  // Wave 16: Heavier fortified wave with Tanks.
  [
    group({ type: 'Tank', count: 3, gap: 2.2, lane: 0, traits: ['fortified'] }),
    group({ type: 'Runner', count: 18, gap: 1.0, lane: 1 }),
  ],

  // Wave 17: Camo Lead. A specific test.
  [
    group({ type: 'Specter', count: 12, gap: 1.5, lane: 0, traits: ['camo', 'lead'] }),
    group({ type: 'Grunt', count: 20, gap: 0.9, lane: 1 }),
  ],

  // Wave 18: Introduce "Regrow".
  [
    group({ type: 'Runner', count: 20, gap: 0.8, lane: 0, traits: ['regrow'] }),
    group({ type: 'Shielded', count: 15, gap: 1.2, lane: 1, traits: ['fortified'] }),
  ],

  // Wave 19: A difficult mix of Camo, Regrow, and Fortified.
  [
    group({ type: 'Specter', count: 15, gap: 1.1, lane: 1, traits: ['camo', 'regrow'] }),
    group({ type: 'Tank', count: 2, gap: 3.0, lane: 0, traits: ['fortified'] }),
  ],

  // Wave 20: The "boss" wave for the mid-game. All major threats.
  [
    group({ type: 'Tank', count: 4, gap: 2.0, lane: 0, traits: ['fortified'] }),
    group({ type: 'Shielded', count: 15, gap: 1.0, lane: 1, traits: ['fortified', 'lead'] }),
    group({ type: 'Runner', count: 10, gap: 0.5, lane: 0, traits: ['camo', 'regrow'] }),
  ],

  // --- End of Phase 4 Replacement ---
];

function group({ type, count, gap, lane = 0, traits = [], hpMul = 1 }) {
  return { type, count, gap, lane, traits, hpMul };
}

function cloneWaves(list, laneOffset = 0) {
  const dict = {};
  for (let wave = 1; wave < list.length; wave++) {
    const groups = list[wave];
    if (!groups) continue;
    dict[wave] = groups.map((entry, idx) => ({
      type: entry.type,
      count: entry.count,
      gap: entry.gap,
      lane: ((entry.lane + laneOffset + idx) % 3 + 3) % 3,
      hpMul: entry.hpMul,
      traits: entry.traits.slice(),
    }));
  }
  return dict;
}

export function waveset_meadow() {
  return cloneWaves(BASE_WAVES, 0);
}

export function waveset_canyon() {
  return cloneWaves(BASE_WAVES, 1);
}

export function waveset_crossroads() {
  return cloneWaves(BASE_WAVES, 2);
}

export function wavesByName(name) {
  const key = (name || '').toLowerCase();
  if (key.includes('canyon')) return cloneWaves(BASE_WAVES, 1);
  if (key.includes('cross')) return cloneWaves(BASE_WAVES, 2);
  return cloneWaves(BASE_WAVES, 0);
}

export function generateLateGameWave(waveIndex) {
  const balance = BALANCE.waves;
  let points = balance.pointsForWave(waveIndex);
  const availableTraits = balance.schedule(waveIndex);
  const enemyTypes = Object.keys(balance.enemyPointCost);

  const groups = [];
  let guard = 0;

  while (points > 0 && guard < 20) {
    guard++;
    let type;
    const rand = Math.random();

    if (waveIndex > 60 && rand < (0.05 + (waveIndex - 60) * 0.005)) {
      type = 'TerraBehemoth';
      if ((balance.enemyPointCost[type] || Infinity) > points && groups.length > 0) {
        type = 'GigaBehemoth';
      }
    } else if (waveIndex > 40 && rand < (0.05 + (waveIndex - 40) * 0.005)) {
      type = 'GigaBehemoth';
      if ((balance.enemyPointCost[type] || Infinity) > points && groups.length > 0) {
        type = 'Behemoth';
      }
    } else if (waveIndex > 20 && rand < (0.05 + (waveIndex - 20) * 0.005)) {
      type = 'Behemoth';
      if ((balance.enemyPointCost[type] || Infinity) > points && groups.length > 0) {
        type = 'Tank';
      }
    } else {
      do {
        type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
      } while (type === 'Behemoth' || type === 'GigaBehemoth' || type === 'TerraBehemoth');
    }
    const cost = balance.enemyPointCost[type] || 999;

    if (cost > points && groups.length > 0) continue; // Avoid getting stuck

    const maxCount = Math.floor(points / cost);
    const count = Math.max(1, Math.min(maxCount, 10 + waveIndex / 5 + Math.floor(Math.random() * 10)));
    const gap = Math.max(0.2, 1.2 - waveIndex * 0.005);

    const traits = [];
    if (availableTraits.includes('camo') && Math.random() < 0.3 + waveIndex * 0.005) {
      traits.push('camo');
    }
    if (availableTraits.includes('lead') && Math.random() < 0.25 + waveIndex * 0.005) {
      traits.push('lead');
    }
    if (availableTraits.includes('regrow') && Math.random() < 0.2 + waveIndex * 0.005) {
      traits.push('regrow');
    }
    if (availableTraits.includes('fortified') && Math.random() < 0.35 + waveIndex * 0.005) {
      traits.push('fortified');
    }

    let totalCost = cost * count;
    for (const trait of traits) {
      totalCost += (balance.traitPointCost[trait] || 0) * count;
    }

    if (totalCost > points && count > 1) {
      const newCount = Math.floor(points / (cost + (totalCost - cost * count) / count));
      if (newCount > 0) {
        groups.push(group({ type, count: newCount, gap, lane: guard % 2, traits }));
        points -= totalCost * (newCount / count);
      }
    } else if (totalCost <= points) {
      groups.push(group({ type, count, gap, lane: guard % 2, traits }));
      points -= totalCost;
    } else if (groups.length === 0) {
      groups.push(group({ type, count: 1, gap, lane: 0, traits }));
      points = 0;
    }
  }
  return groups;
}
