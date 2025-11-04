/**
 * balance.js
 * Centralized tunable numbers and knobs. Adjust difficulty and pacing here.
 * How to extend: introduce new balance groupings or modifiers and import elsewhere.
 */

export const BAL = {
  version: 1,
  seed: 42,
  speed: { base: 1, fast: 2, boss: 0.7 },
  econ: { sellRefund: 0.7, earlySendBonus: 0.1, crownPerStar: 1 },
  waves: { hpMulPerWave: 1.12, bountyMulPerWave: 1.05, bossHPBonus: 6 },
  slow: { maxStack: 0.6, decayPerSec: 0.25 },
  research: {
    coinGain: { base: 0.05 },
    lives: { base: 1 },
    refund: { base: 0.1 },
    range: { base: 0.05 },
    proj: { base: 0.1 },
  },
  towers: {
    Archer: { cost: 35, dmg: 8, rof: 0.45, rng: 3.5, proj: 9 },
    Cannon: { cost: 60, dmg: 22, rof: 1.2, rng: 3.2, splash: 1.2 },
    Mage: { cost: 75, dmg: 18, rof: 0.9, rng: 3.4, pierce: 0.25 },
    Frost: { cost: 50, dmg: 4, rof: 0.6, rng: 3.6, slow: 0.35 },
  },
  projectiles: {
    Archer: { speed: 9 },
    Cannon: { speed: 6 },
    Mage: { speed: 8.5 },
    Frost: { speed: 7 },
  },
  upgrades: {
    Archer: [
      { cost: 60, dmg: 11, rof: 0.4 },
      { cost: 120, dmg: 14, rof: 0.32, perk: 'Crit chance 15%' },
    ],
    Cannon: [
      { cost: 90, dmg: 32, rof: 1.0, splash: 1.4 },
      { cost: 160, dmg: 48, rof: 0.8, splash: 1.6, perk: 'Burn damage over time' },
    ],
    Mage: [
      { cost: 110, dmg: 26, rof: 0.75, pierce: 0.35 },
      { cost: 180, dmg: 34, rof: 0.6, pierce: 0.45, perk: 'Chain lightning' },
    ],
    Frost: [
      { cost: 80, dmg: 6, rof: 0.55, slow: 0.45 },
      { cost: 150, dmg: 9, rof: 0.5, slow: 0.5, perk: 'Chilling aura' },
    ],
  },
  enemies: {
    Grunt: { hp: 55, speed: 1, armor: 0.1, magicResist: 0.05, bounty: 6 },
    Runner: { hp: 32, speed: 1.8, armor: 0.05, magicResist: 0.05, bounty: 5 },
    Tank: { hp: 160, speed: 0.7, armor: 0.25, magicResist: 0.1, bounty: 12 },
    Shielded: { hp: 90, speed: 0.9, armor: 0.45, magicResist: 0.15, bounty: 9 },
    Specter: { hp: 80, speed: 1.1, armor: 0.05, magicResist: 0.5, bounty: 9 },
    Swarm: { hp: 14, speed: 1.4, armor: 0, magicResist: 0, bounty: 2, spawn: 4 },
    OgreBoss: { hp: 400, speed: 0.6, armor: 0.25, magicResist: 0.2, bounty: 40 },
  },
};
