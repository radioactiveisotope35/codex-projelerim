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
    Behemoth: { hp: 800, speed: 25, armor: 0.3, reward: 50, spawnsOnDeath: [{ type: 'Tank', count: 2 }] },
    GigaBehemoth: { hp: 3000, speed: 18, armor: 0.4, reward: 150, spawnsOnDeath: [{ type: 'Behemoth', count: 2 }] },
    TerraBehemoth: { hp: 12000, speed: 10, armor: 0.5, reward: 400, spawnsOnDeath: [{ type: 'GigaBehemoth', count: 2 }] },
    traits: {
      camo: { visibleTo: 'camoDetection' },
      lead: { immuneTo: 'physical', weakTo: ['explosive', 'magic', 'energy'], hpMul: 1 },
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
    // YENİ KULE
    Tesla: {
      price: 450,
      range: 170,
      fireRate: 1.1,
      damage: 18,
      damageType: 'energy', // Enerji hasarı Lead'e vurur
      bulletSpeed: 9999, // Anında vuruş
      pierce: 3, // 3 kişi seker
      splashRadius: 0,
      slowPct: 0,
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
      // YENİ Tesla Geliştirmeleri
      Tesla: {
        A: [180, 450, 2800, 9200, 35000], // A: Zincirleme Kapasitesi
        B: [150, 380, 2500, 8500, 32000], // B: Aşırı Yükleme (Hız/Hasar)
      },
      Hero: { A: [0, 0, 0, 0, 0], B: [0, 0, 0, 0, 0] },
    },
    deltas: {
      Archer: {
        A1: { range: +35 },
        A2: { fireRateMul: 0.8 },
        A3: { ability: 'callOfArrows' },
        A4: { fireRateMul: 0.65, range: +30 },
        A5: { fireRateMul: 0.5, damage: +10, camoDetection: true },
        B1: { pierce: +1 },
        B2: { damage: +5 },
        B3: { damage: +10, shatterLead: true },
        B4: { pierce: +2, damage: +5 },
        B5: { damage: +40, pierce: +2, camoDetection: true },
      },
      Cannon: {
        A1: { splashRadius: +25 },
        A2: { pierce: +1 },
        A3: { splashRadius: +30, damage: +5 },
        A4: { damage: +20, pierce: +2 },
        A5: { splashRadius: +60, damage: +55, pierce: +2 },
        B1: { range: +20 },
        B2: { fireRateMul: 0.8 },
        B3: { damage: +15, shatterLead: true },
        B4: { fireRateMul: 0.7, damage: +15 },
        B5: { damage: +70, fireRateMul: 0.6 },
      },
      Mage: {
        A1: { damage: +8 },
        A2: { pierce: +1 },
        A3: { damage: +10, pierce: +1 },
        A4: { range: +20, damage: +15 },
        A5: { ability: 'arcaneSurge', damage: +45, fireRateMul: 0.7 },
        B1: { fireRateMul: 0.85 },
        B2: { range: +30, bulletSpeed: +100 },
        B3: { camoDetection: true },
        B4: { pierce: +2, bulletSpeed: +100 },
        B5: { damage: +30, camoDetection: true, fireRateMul: 0.7 },
      },
      Frost: {
        A1: { slowPct: +0.15 },
        A2: { range: +30 },
        A3: { slowDuration: +1.0 },
        A4: { slowPct: +0.1, slowDuration: +1.0 },
        A5: { ability: 'freezeField', slowPct: +0.1, slowDuration: +1.5 },
        B1: { damage: +4 },
        B2: { fireRateMul: 0.85 },
        B3: { damage: +8, slowPct: +0.05 },
        B4: { range: +35, camoDetection: true },
        B5: { damage: +20, fireRateMul: 0.7, slowPct: +0.1 },
      },
      Tesla: {
        A1: { pierce: +1 },
        A2: { range: +25 },
        A3: { pierce: +2, damage: +5 },
        A4: { pierce: +3, damage: +10 },
        A5: { pierce: +10, range: +50, damage: +20 }, // Süper İletken
        B1: { fireRateMul: 0.85 },
        B2: { damage: +5 },
        B3: { fireRateMul: 0.75, camoDetection: true },
        B4: { damage: +15, fireRateMul: 0.8 },
        B5: { damage: +40, fireRateMul: 0.5 }, // Plazma Fırtınası
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
      2: { range: +15 },
      3: { damage: +4 },
      5: { fireRateMul: 0.9 },
      8: { camoDetection: true },
      10: { ability: 'heroNova' },
      12: { damage: +8, range: +10 },
      15: { aura: { range: +20, dmgMul: 1.15 } },
      18: { fireRateMul: 0.8, damage: +10 },
      20: { damage: +25, range: +20 },
    },
  },
  waves: {
    hpMul(n) {
      return Math.pow(1.045, Math.max(0, n - 1));
    },
    pointsForWave(n) {
      return Math.floor(100 + (n - 20) * 30);
    },
    enemyPointCost: {
      Grunt: 3,
      Runner: 4,
      Shielded: 6,
      Tank: 12,
      Specter: 7,
      Behemoth: 60,
      GigaBehemoth: 250,
      TerraBehemoth: 1000,
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
