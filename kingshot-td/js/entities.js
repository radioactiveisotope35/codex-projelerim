import { clamp } from './utils.js';

export const CONFIG = {
  towerBaseRadius: 18,
  pathClearFactor: 0.45,
  slowDuration: 1.5,
  minDamage: 1,
  bulletLifetime: 4
};

export const ENEMIES = {
  Grunt: { baseHp: 40, speed: 52, armor: 0.1, reward: 8 },
  Runner: { baseHp: 24, speed: 78, armor: 0.05, reward: 7 },
  Tank: { baseHp: 160, speed: 32, armor: 0.4, reward: 18 },
  Shielded: { baseHp: 110, speed: 38, armor: 0.55, reward: 16 },
  Specter: { baseHp: 90, speed: 65, armor: 0.2, reward: 20 }
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

let nextEnemyId = 1;
let nextTowerId = 1;
let nextBulletId = 1;

export function createEnemy(type, laneIndex, lane, hpMul = 1, distanceOffset = 0) {
  const def = ENEMIES[type] || ENEMIES.Grunt;
  const hp = def.baseHp * hpMul;
  const firstPoint = lane?.points?.[0] || { x: 0, y: 0 };
  return {
    id: nextEnemyId++,
    type,
    lane: laneIndex,
    hp,
    maxHp: hp,
    reward: def.reward || 1,
    baseSpeed: def.speed || 40,
    armor: clamp(def.armor ?? 0, 0, 0.95),
    alive: true,
    escaped: false,
    dead: false,
    distance: distanceOffset,
    slowUntil: 0,
    slowMul: 1,
    pathLength: lane?.length ?? 0,
    x: firstPoint.x,
    y: firstPoint.y
  };
}

export function createTower(type, x, y) {
  const def = TOWERS[type];
  if (!def) {
    throw new Error(`Unknown tower type: ${type}`);
  }
  return {
    id: nextTowerId++,
    type,
    x,
    y,
    range: def.range,
    cooldown: 0,
    selected: false,
    def
  };
}

export function createBullet(tower, targetId) {
  return {
    id: nextBulletId++,
    type: tower.type,
    x: tower.x,
    y: tower.y,
    targetId,
    speed: tower.def.bulletSpeed,
    damage: tower.def.damage,
    damageType: tower.def.damageType,
    splashRadius: tower.def.splashRadius,
    slowPct: tower.def.slowPct,
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
  }
  actual = Math.max(CONFIG.minDamage, actual);
  enemy.hp = Math.max(0, enemy.hp - actual);
  if (enemy.hp === 0) {
    enemy.alive = false;
    enemy.dead = true;
    return { killed: true, dealt: actual };
  }
  return { killed: false, dealt: actual };
}

export function applySlow(enemy, slowPct, now) {
  if (!enemy.alive || slowPct <= 0) return;
  const mul = 1 - clamp(slowPct, 0, 0.95);
  enemy.slowMul = Math.min(enemy.slowMul, mul);
  enemy.slowUntil = Math.max(enemy.slowUntil, now + CONFIG.slowDuration);
}

export function resetEnemySlow(enemy, now) {
  if (enemy.slowMul < 1 && enemy.slowUntil <= now) {
    enemy.slowMul = 1;
  }
}

export function resetIds() {
  nextEnemyId = 1;
  nextTowerId = 1;
  nextBulletId = 1;
}

export const BASE_RADIUS = CONFIG.towerBaseRadius;
export const PATH_CLEAR_FACTOR = CONFIG.pathClearFactor;
