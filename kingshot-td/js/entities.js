import { clamp } from './utils.js';

export const CONFIG = {
  sellRefund: 0.7,
  slowDuration: 1.5,
  towers: {
    Archer: {
      price: 35,
      range: 3.4,
      reload: 0.45,
      damage: 9,
      projectileSpeed: 560,
      splashRadius: 0,
      slowPct: 0,
      slowDuration: 0,
      damageType: 'physical',
      targetPriority: 'first',
      color: '#D9B48F',
      capColor: '#F5E6C8',
      projectileColor: '#F5E6C8',
    },
    Cannon: {
      price: 60,
      range: 3.1,
      reload: 1.1,
      damage: 28,
      projectileSpeed: 420,
      splashRadius: 1.25,
      slowPct: 0,
      slowDuration: 0,
      damageType: 'physical',
      targetPriority: 'first',
      color: '#B06B37',
      capColor: '#F4B860',
      projectileColor: '#FFCE84',
    },
    Mage: {
      price: 75,
      range: 3.3,
      reload: 0.9,
      damage: 22,
      projectileSpeed: 520,
      splashRadius: 0.5,
      slowPct: 0,
      slowDuration: 0,
      damageType: 'magic',
      targetPriority: 'strongest',
      color: '#6E5AA6',
      capColor: '#C4A7FF',
      projectileColor: '#B7A3FF',
    },
    Frost: {
      price: 55,
      range: 3.6,
      reload: 1.05,
      damage: 7,
      projectileSpeed: 480,
      splashRadius: 0,
      slowPct: 0.45,
      slowDuration: 1.5,
      damageType: 'magic',
      targetPriority: 'first',
      color: '#5B9FAF',
      capColor: '#9EDBF0',
      projectileColor: '#C4F4FF',
    },
  },
  enemies: {
    Grunt: {
      baseHp: 65,
      speed: 52,
      armor: 0.1,
      magicResist: 0.05,
      reward: 6,
      radius: 14,
      color: '#4C7D4F',
    },
    Runner: {
      baseHp: 40,
      speed: 95,
      armor: 0,
      magicResist: 0,
      reward: 5,
      radius: 12,
      color: '#7BBE77',
    },
    Tank: {
      baseHp: 220,
      speed: 38,
      armor: 0.35,
      magicResist: 0.2,
      reward: 13,
      radius: 18,
      color: '#3F5C3C',
    },
    Shielded: {
      baseHp: 130,
      speed: 50,
      armor: 0.45,
      magicResist: 0.15,
      reward: 12,
      radius: 16,
      color: '#58749D',
    },
    Specter: {
      baseHp: 120,
      speed: 60,
      armor: 0.05,
      magicResist: 0.45,
      reward: 12,
      radius: 15,
      color: '#8A7BC8',
    },
  },
};

let enemyId = 0;
let towerId = 0;
const MIN_SLOW_FACTOR = 0.25;
const BULLET_HIT_RADIUS = 12;

export function resetEntityIds() {
  enemyId = 0;
  towerId = 0;
}

export function createEnemy(type, lane, hpMultiplier = 1) {
  const def = CONFIG.enemies[type];
  if (!def) {
    throw new Error(`Unknown enemy type: ${type}`);
  }
  const enemy = {
    id: enemyId++,
    type,
    path: lane,
    laneIndex: lane.index ?? 0,
    x: lane.points[0]?.x ?? 0,
    y: lane.points[0]?.y ?? 0,
    t: 0,
    segmentIndex: 0,
    hp: def.baseHp * hpMultiplier,
    maxHp: def.baseHp * hpMultiplier,
    speed: def.speed,
    armor: def.armor ?? 0,
    magicResist: clamp(def.magicResist ?? 0, 0, 0.95),
    reward: def.reward,
    radius: def.radius,
    color: def.color,
    alive: true,
    slowFactor: 1,
    slowTimer: 0,
  };
  return enemy;
}

export function advanceEnemy(enemy, dt) {
  if (!enemy.alive) return false;
  if (enemy.slowTimer > 0) {
    enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
    if (enemy.slowTimer === 0) {
      enemy.slowFactor = 1;
    }
  }
  const lane = enemy.path;
  const effectiveSpeed = enemy.speed * enemy.slowFactor;
  enemy.t += effectiveSpeed * dt;
  if (enemy.t >= lane.length) {
    enemy.alive = false;
    return true;
  }
  const segments = lane.segments;
  let index = enemy.segmentIndex || 0;
  while (index < segments.length && enemy.t > segments[index].start + segments[index].len) {
    index++;
  }
  enemy.segmentIndex = Math.min(index, segments.length - 1);
  const seg = segments[enemy.segmentIndex];
  const dist = clamp(enemy.t - seg.start, 0, seg.len);
  enemy.x = seg.from.x + seg.dx * dist;
  enemy.y = seg.from.y + seg.dy * dist;
  return false;
}

export function applyDamage(enemy, amount, type) {
  if (!enemy.alive) return { killed: false, damage: 0 };
  let modifier = 1;
  if (type === 'physical') {
    modifier = 1 - clamp(enemy.armor, 0, 0.8);
  } else if (type === 'magic') {
    modifier = 1 - clamp(enemy.magicResist ?? 0, 0, 0.8);
  }
  const dmg = Math.max(1, amount * modifier);
  enemy.hp -= dmg;
  if (enemy.hp <= 0) {
    enemy.alive = false;
    return { killed: true, damage: dmg };
  }
  return { killed: false, damage: dmg };
}

export function applySlow(enemy, slowPct, duration) {
  if (slowPct <= 0) return;
  const factor = Math.max(MIN_SLOW_FACTOR, 1 - slowPct);
  enemy.slowFactor = Math.min(enemy.slowFactor, factor);
  enemy.slowTimer = Math.max(enemy.slowTimer, duration);
}

export function createTower(type, tileSize, x, y) {
  const def = CONFIG.towers[type];
  if (!def) {
    throw new Error(`Unknown tower type: ${type}`);
  }
  const tower = {
    id: towerId++,
    type,
    x,
    y,
    range: def.range * tileSize,
    reload: def.reload,
    fireCooldown: 0,
    damage: def.damage,
    damageType: def.damageType,
    splash: def.splashRadius * tileSize,
    slowPct: def.slowPct,
    slowDuration: def.slowDuration,
    projectileSpeed: def.projectileSpeed,
    targetPriority: def.targetPriority,
    price: def.price,
    color: def.color,
    capColor: def.capColor,
    projectileColor: def.projectileColor,
    selected: false,
  };
  return tower;
}

export function acquireTarget(tower, enemies) {
  let best = null;
  let bestMetric = tower.targetPriority === 'last' ? Infinity : -Infinity;
  const rangeSq = tower.range * tower.range;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - tower.x;
    const dy = enemy.y - tower.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > rangeSq) continue;
    let metric;
    switch (tower.targetPriority) {
      case 'last':
        metric = -enemy.t;
        if (metric < bestMetric) {
          bestMetric = metric;
          best = enemy;
        }
        break;
      case 'strongest':
        metric = enemy.hp;
        if (metric > bestMetric) {
          bestMetric = metric;
          best = enemy;
        }
        break;
      default:
        metric = enemy.t;
        if (metric > bestMetric) {
          bestMetric = metric;
          best = enemy;
        }
        break;
    }
  }
  return best;
}

export function spawnProjectile(tower, target) {
  return {
    type: tower.type,
    color: tower.projectileColor,
    x: tower.x,
    y: tower.y,
    vx: 0,
    vy: 0,
    speed: tower.projectileSpeed,
    target,
    damage: tower.damage,
    damageType: tower.damageType,
    splash: tower.splash,
    slowPct: tower.slowPct,
    slowDuration: tower.slowDuration,
    ttl: 2.5,
    hitRadiusSq: BULLET_HIT_RADIUS * BULLET_HIT_RADIUS,
  };
}

export function enemyReward(enemy) {
  return CONFIG.enemies[enemy.type]?.reward ?? 0;
}
