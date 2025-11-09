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

  [
    group({ type: 'Tank', count: 12, gap: 0.75, lane: 1, traits: ['fortified', 'lead'], hpMul: 1.45 }),
    group({ type: 'Runner', count: 30, gap: 0.4, lane: 0, traits: ['camo', 'regrow'], hpMul: 1.3 }),
    group({ type: 'Specter', count: 24, gap: 0.45, lane: 0, traits: ['camo'], hpMul: 1.25 }),
  ],
  [
    group({ type: 'Grunt', count: 40, gap: 0.45, lane: 0, traits: ['lead', 'regrow'], hpMul: 1.35 }),
    group({ type: 'Shielded', count: 22, gap: 0.5, lane: 1, traits: ['fortified', 'lead'], hpMul: 1.45 }),
    group({ type: 'Tank', count: 12, gap: 0.75, lane: 0, traits: ['fortified'], hpMul: 1.45 }),
  ],
  [
    group({ type: 'Runner', count: 32, gap: 0.38, lane: 0, traits: ['camo', 'regrow'], hpMul: 1.35 }),
    group({ type: 'Specter', count: 26, gap: 0.45, lane: 1, traits: ['camo', 'regrow'], hpMul: 1.4 }),
    group({ type: 'Tank', count: 14, gap: 0.7, lane: 0, traits: ['fortified', 'lead'], hpMul: 1.5 }),
  ],
  [
    group({ type: 'Shielded', count: 28, gap: 0.5, lane: 1, traits: ['fortified', 'lead'], hpMul: 1.5 }),
    group({ type: 'Specter', count: 28, gap: 0.42, lane: 0, traits: ['camo', 'regrow'], hpMul: 1.45 }),
    group({ type: 'Tank', count: 14, gap: 0.65, lane: 0, traits: ['fortified', 'lead'], hpMul: 1.55 }),
  ],
  [
    group({ type: 'Tank', count: 16, gap: 0.65, lane: 0, traits: ['fortified', 'lead', 'regrow'], hpMul: 1.6 }),
    group({ type: 'Specter', count: 30, gap: 0.4, lane: 1, traits: ['camo', 'regrow'], hpMul: 1.5 }),
    group({ type: 'Shielded', count: 24, gap: 0.45, lane: 0, traits: ['fortified', 'lead'], hpMul: 1.6 }),
  ],
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
