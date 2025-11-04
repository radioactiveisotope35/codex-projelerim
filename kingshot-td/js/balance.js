export const BALANCE = {
  global: {
    dtCap: 0.05,
    baseRadius: 18,
    pathClearFactor: 0.45,
    bulletLead: 0.1,
  },
  economy: {
    sellRefund: 0.7,
    cashPerPopBase: 1,
    roundBonus(wave) {
      return Math.floor(10 + 0.12 * wave * wave);
    },
    difficulty: {
      normal: { hpMul: 1, cashMul: 1, roundBonusMul: 1 },
      hard: { hpMul: 1.15, cashMul: 0.9, roundBonusMul: 0.9 },
      impop: { hpMul: 1.35, cashMul: 0.8, roundBonusMul: 0 },
    },
  },
  enemies: {
    Grunt: { hp: 30, speed: 55, armor: 0, reward: 1 },
    Runner: { hp: 20, speed: 95, armor: 0, reward: 1 },
    Tank: { hp: 140, speed: 40, armor: 0.2, reward: 3 },
    Shielded: { hp: 70, speed: 55, armor: 0.4, reward: 2 },
    Specter: { hp: 42, speed: 68, armor: 0.1, reward: 2 },
    traits: {
      camo: { visibleTo: 'camoDetection' },
      lead: { immuneTo: 'physical', weakTo: ['explosive', 'magic'], hpMul: 1 },
      regrow: { delay: 2.5, rate: 0.2 },
      fortified: { hpMul: 1.5, armorBonus: 0.2 },
    },
  },
  towers: {
    Archer: {
      price: 250,
      range: 210,
      fireRate: 0.85,
      damage: 10,
      damageType: 'physical',
      bulletSpeed: 520,
      pierce: 1,
      splashRadius: 0,
      slowPct: 0,
      camoDetection: false,
    },
    Cannon: {
      price: 450,
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
      price: 520,
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
      price: 360,
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
      price: 750,
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
      Archer: { A: [120, 180, 260, 400, 650], B: [110, 170, 240, 360, 600] },
      Cannon: { A: [180, 250, 360, 520, 800], B: [170, 240, 340, 480, 720] },
      Mage: { A: [160, 240, 360, 520, 820], B: [150, 220, 320, 460, 700] },
      Frost: { A: [130, 190, 270, 380, 560], B: [120, 180, 250, 340, 520] },
      Hero: { A: [0, 0, 0, 0, 0], B: [0, 0, 0, 0, 0] },
    },
    deltas: {
      Archer: {
        A1: { range: +20 },
        A2: { fireRateMul: 0.85 },
        A3: { ability: 'callOfArrows' },
        A4: { pierce: +1 },
        A5: { camoDetection: true },
        B1: { damage: +6 },
        B2: { range: +18 },
        B3: { pierce: +1 },
        B4: { fireRateMul: 0.8 },
        B5: { damage: +10, shatterLead: true },
      },
      Cannon: {
        A1: { splashRadius: +12 },
        A2: { damage: +8 },
        A3: { splashRadius: +16 },
        A4: { fireRateMul: 0.85 },
        A5: { splashRadius: +24, damage: +12 },
        B1: { pierce: +1 },
        B2: { fireRateMul: 0.9 },
        B3: { pierce: +1 },
        B4: { range: +18 },
        B5: { fireRateMul: 0.8 },
      },
      Mage: {
        A1: { damage: +8 },
        A2: { pierce: +1 },
        A3: { camoDetection: true },
        A4: { range: +24 },
        A5: { ability: 'arcaneSurge' },
        B1: { bulletSpeed: +120 },
        B2: { fireRateMul: 0.9 },
        B3: { pierce: +1 },
        B4: { damage: +8 },
        B5: { range: +20 },
      },
      Frost: {
        A1: { slowPct: +0.1 },
        A2: { range: +16 },
        A3: { fireRateMul: 0.9 },
        A4: { slowPct: +0.1 },
        A5: { slowDuration: +0.7 },
        B1: { range: +14 },
        B2: { fireRateMul: 0.9 },
        B3: { slowPct: +0.05 },
        B4: { ability: 'freezeField' },
        B5: { range: +20 },
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
      return Math.pow(1.12, Math.max(0, n - 1));
    },
    pointsForWave(n) {
      return Math.floor(50 + 22 * n + Math.pow(n, 1.35) * 3);
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
