export const BALANCE = {
  global: {
    dtCap: 0.05,
    baseRadius: 18,
    pathClearFactor: 0.45,
    bulletLead: 0.1,
  },
  economy: {
    sellRefund: 0.7,
    cashPerPopBase: 6,
    roundBonus(wave) {
      return Math.floor(80 + wave * 20);
    },
    difficulty: {
      normal: { hpMul: 1, cashMul: 1, roundBonusMul: 1 },
      hard: { hpMul: 1.15, cashMul: 0.9, roundBonusMul: 0.9 },
      impop: { hpMul: 1.35, cashMul: 0.8, roundBonusMul: 0 },
    },
  },
  enemies: {
    Grunt: { hp: 20, speed: 55, armor: 0, reward: 4 },
    Runner: { hp: 20, speed: 95, armor: 0, reward: 7 },
    Tank: { hp: 140, speed: 40, armor: 0.2, reward: 18 },
    Shielded: { hp: 70, speed: 55, armor: 0.4, reward: 12 },
    Specter: { hp: 42, speed: 68, armor: 0.1, reward: 11 },
    traits: {
      camo: { visibleTo: 'camoDetection' },
      lead: { immuneTo: 'physical', weakTo: ['explosive', 'magic'], hpMul: 1 },
      regrow: { delay: 2.5, rate: 0.2 },
      fortified: { hpMul: 1.5, armorBonus: 0.2 },
    },
  },
  towers: {
    Archer: {
      price: 170,
      range: 210,
      fireRate: 0.85,
      damage: 15,
      damageType: 'physical',
      bulletSpeed: 520,
      pierce: 1,
      splashRadius: 0,
      slowPct: 0,
      camoDetection: false,
    },
    Cannon: {
      price: 320,
      range: 190,
      fireRate: 1.35,
      damage: 26,
      damageType: 'explosive',
      bulletSpeed: 420,
      pierce: 1,
      splashRadius: 40,
      slowPct: 0,
      camoDetection: false,
    },
    Mage: {
      price: 380,
      range: 200,
      fireRate: 1,
      damage: 22,
      damageType: 'magic',
      bulletSpeed: 560,
      pierce: 1,
      splashRadius: 0,
      slowPct: 0,
      camoDetection: false,
    },
    Frost: {
      price: 280,
      range: 180,
      fireRate: 1.2,
      damage: 6,
      damageType: 'magic',
      bulletSpeed: 500,
      pierce: 1,
      splashRadius: 0,
      slowPct: 0.35,
      camoDetection: false,
    },
    Hero: {
      price: 600,
      range: 230,
      fireRate: 1.1,
      damage: 18,
      damageType: 'magic',
      bulletSpeed: 540,
      pierce: 1,
      splashRadius: 0,
      slowPct: 0.1,
      camoDetection: true,
    },
  },
  upgrades: {
    costs: {
      Archer: {
        A: [120, 350, 2400, 8200, 32000],
        B: [100, 320, 2100, 6900, 28000],
      },
      Cannon: {
        A: [150, 400, 3200, 11500, 42000],
        B: [130, 380, 2800, 9800, 36000],
      },
      Mage: {
        A: [140, 420, 2600, 9400, 36000],
        B: [120, 390, 2400, 8600, 34000],
      },
      Frost: {
        A: [110, 300, 1900, 6800, 26000],
        B: [100, 280, 1800, 6400, 25000],
      },
      Hero: { A: [0, 0, 0, 0, 0], B: [0, 0, 0, 0, 0] },
    },
    deltas: {
      Archer: {
        A1: { range: +35 },
        A2: { fireRateMul: 0.8 },
        A3: { ability: 'callOfArrows', pierce: +1 },
        A4: { fireRateMul: 0.65, pierce: +2 },
        A5: { fireRateMul: 0.5, damage: +40, camoDetection: true },
        B1: { damage: +12, pierce: +1 },
        B2: { range: +25 },
        B3: { damage: +28, shatterLead: true },
        B4: { fireRateMul: 0.7, pierce: +2 },
        B5: { damage: +65, camoDetection: true },
      },
      Cannon: {
        A1: { splashRadius: +25 },
        A2: { damage: +15 },
        A3: { splashRadius: +30, pierce: +1 },
        A4: { fireRateMul: 0.75, damage: +20 },
        A5: { splashRadius: +60, damage: +55, fireRateMul: 0.65 },
        B1: { range: +20 },
        B2: { fireRateMul: 0.85 },
        B3: { damage: +30, shatterLead: true },
        B4: { pierce: +2, splashRadius: +20 },
        B5: { damage: +90, fireRateMul: 0.6 },
      },
      Mage: {
        A1: { damage: +12 },
        A2: { pierce: +1 },
        A3: { camoDetection: true },
        A4: { range: +40, bulletSpeed: +140 },
        A5: { ability: 'arcaneSurge', damage: +45, fireRateMul: 0.7 },
        B1: { fireRateMul: 0.9, damage: +10 },
        B2: { pierce: +1 },
        B3: { damage: +28, bulletSpeed: +160 },
        B4: { fireRateMul: 0.75, pierce: +1 },
        B5: { damage: +65, camoDetection: true },
      },
      Frost: {
        A1: { slowPct: +0.15 },
        A2: { range: +30 },
        A3: { fireRateMul: 0.85 },
        A4: { slowPct: +0.2, slowDuration: +0.8 },
        A5: { ability: 'freezeField', slowPct: +0.15, slowDuration: +1.5 },
        B1: { damage: +6 },
        B2: { fireRateMul: 0.9 },
        B3: { damage: +12, slowPct: +0.05 },
        B4: { range: +35, camoDetection: true },
        B5: { damage: +25, fireRateMul: 0.75, slowPct: +0.1 },
      },
    },
  },
  hero: {
    maxLevel: 20,
    xpPerPop: 0.6,
    levelXp(level) {
      return Math.floor(60 + 20 * level + 4 * level * level);
    },
    levelBonuses: {
      2: { range: +10 },
      4: { damage: +4 },
      7: { aura: { range: +12, dmgMul: 1.1 } },
      10: { fireRateMul: 0.9 },
      15: { camoDetection: true },
      20: { ability: 'heroNova' },
    },
  },
  waves: {
    hpMul(n) {
      return Math.pow(1.045, Math.max(0, n - 1));
    },
    pointsForWave(n) {
      // Linear scaling to complement the exponential HP scaling
      return Math.floor(100 + (n - 20) * 30);
    },
    enemyPointCost: {
      Grunt: 3,
      Runner: 4,
      Shielded: 6,
      Tank: 12,
      Specter: 7,
    },
    traitPointCost: {
      camo: 3,
      lead: 4,
      regrow: 2,
      fortified: 6,
    },
    schedule(n) {
      const traits = [];
      if (n >= 5) traits.push('camo');
      if (n >= 10) traits.push('lead');
      if (n >= 15) traits.push('fortified');
      if (n >= 18) traits.push('regrow');
      return traits;
    },
  },
};
