import { clamp } from './utils.js';

export const CONFIG = {
  towerBaseRadius: 18,
  slowDuration: 1.5,
  minDamage: 1,
  bulletLifetime: 4,
  pathClearFactor: 0.45
};

export const ENEMIES = {
  Grunt: { baseHp: 36, speed: 45, armor: 0.08, magicResist: 0.05, reward: 8 },
  Runner: { baseHp: 22, speed: 70, armor: 0, magicResist: 0.15, reward: 7 },
  Tank: { baseHp: 140, speed: 32, armor: 0.35, magicResist: 0.1, reward: 16 },
  Shielded: { baseHp: 90, speed: 34, armor: 0.55, magicResist: 0.2, reward: 15 },
  Specter: { baseHp: 70, speed: 58, armor: 0.1, magicResist: 0.45, reward: 18 }
};

export const TOWERS = {
  Archer: {
    price: 45,
    range: 160,
    fireRate: 1.8,
    damage: 16,
    splashRadius: 0,
    slowPct: 0,
    damageType: 'physical',
    bulletSpeed: 360
  },
  Cannon: {
    price: 70,
    range: 150,
    fireRate: 0.9,
    damage: 46,
    splashRadius: 70,
    slowPct: 0,
    damageType: 'physical',
    bulletSpeed: 280
  },
  Mage: {
    price: 80,
    range: 175,
    fireRate: 1.1,
    damage: 34,
    splashRadius: 0,
    slowPct: 0,
    damageType: 'magic',
    bulletSpeed: 340
  },
  Frost: {
    price: 60,
    range: 150,
    fireRate: 1.2,
    damage: 12,
    splashRadius: 0,
    slowPct: 0.4,
    damageType: 'magic',
    bulletSpeed: 300
  }
};

let enemyId = 1;
let towerId = 1;
let bulletId = 1;

export function createEnemy(type, laneIndex, laneData, hpMul = 1) {
  const def = ENEMIES[type] || ENEMIES.Grunt;
  const hp = def.baseHp * hpMul;
  const firstPoint = laneData?.points?.[0] || { x: 0, y: 0 };
  return {
    id: enemyId++,
    type,
    lane: laneIndex,
    x: firstPoint.x,
    y: firstPoint.y,
    hp,
    maxHp: hp,
    baseSpeed: def.speed,
    armor: def.armor || 0,
    magicResist: def.magicResist || 0,
    reward: def.reward || 1,
    alive: true,
    reachedEnd: false,
    slowUntil: 0,
    slowMul: 1,
    pathOffset: 0,
    segIndex: 0,
    segDistance: 0,
    pathLength: laneData?.length || 0,
    goalProcessed: false
  };
}

export function createTower(type, x, y) {
  const def = TOWERS[type];
  if (!def) {
    throw new Error(`Unknown tower type: ${type}`);
  }
  return {
    id: towerId++,
    type,
    x,
    y,
    range: def.range,
    fireRate: def.fireRate,
    damage: def.damage,
    splashRadius: def.splashRadius,
    slowPct: def.slowPct,
    damageType: def.damageType,
    bulletSpeed: def.bulletSpeed,
    cooldown: 0,
    selected: false,
    def
  };
}

export function createBullet(tower, targetId) {
  return {
    id: bulletId++,
    type: tower.type,
    x: tower.x,
    y: tower.y,
    targetId,
    speed: tower.bulletSpeed,
    damage: tower.damage,
    damageType: tower.damageType,
    splashRadius: tower.splashRadius,
    slowPct: tower.slowPct,
    life: 0
  };
}

export function applyDamage(enemy, damage, damageType) {
  if (!enemy.alive) {
    return { killed: false, dealt: 0 };
  }
  let actual = damage;
  if (damageType === 'physical') {
    actual *= 1 - clamp(enemy.armor, 0, 0.95);
  } else if (damageType === 'magic') {
    actual *= 1 - clamp(enemy.magicResist || 0, 0, 0.95);
  }
  actual = Math.max(CONFIG.minDamage, actual);
  enemy.hp = Math.max(0, enemy.hp - actual);
  if (enemy.hp === 0) {
    enemy.alive = false;
    return { killed: true, dealt: actual };
  }
  return { killed: false, dealt: actual };
}

export function applySlow(enemy, slowPct, now) {
  if (!enemy.alive || slowPct <= 0) return;
  const mul = 1 - slowPct;
  enemy.slowMul = Math.min(enemy.slowMul, mul);
  enemy.slowUntil = Math.max(enemy.slowUntil, now + CONFIG.slowDuration);
}

export function resetEnemySlow(enemy, now) {
  if (enemy.slowMul < 1 && enemy.slowUntil <= now) {
    enemy.slowMul = 1;
  }
}

export function resetIds() {
  enemyId = 1;
  towerId = 1;
  bulletId = 1;
}

export const BASE_RADIUS = CONFIG.towerBaseRadius;
export const PATH_CLEAR_FACTOR = CONFIG.pathClearFactor;
