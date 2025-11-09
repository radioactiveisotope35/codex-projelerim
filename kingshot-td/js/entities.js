import { BALANCE } from './balance.js';
import { dist2, projectAlongPolyline } from './utils.js';
import { popReward, sellRefund } from './economy.js';
import { isActive } from './abilities.js';

let ENEMY_ID = 1;
let BULLET_ID = 1;
let TOWER_ID = 1;

const TARGET_PRIORITIES = ['first', 'last', 'strong', 'close'];

export const ENEMY_DEFS = BALANCE.enemies;
export const TOWER_DEFS = BALANCE.towers;

export function createEnemy(type, laneIndex, startPoint, opts = {}) {
  const base = ENEMY_DEFS[type];
  if (!base) throw new Error(`Unknown enemy ${type}`);
  const enemy = {
    id: ENEMY_ID++,
    type,
    lane: laneIndex,
    t: opts.startOffset ?? 0,
    x: startPoint.x,
    y: startPoint.y,
    baseSpeed: base.speed,
    speed: base.speed,
    armor: base.armor,
    hp: base.hp,
    maxHp: base.hp,
    reward: base.reward,
    alive: true,
    traits: {},
    slowUntil: 0,
    slowMul: 1,
    freezeUntil: 0,
    lastHitAt: 0,
    regrowDelay: 0,
    regrowRate: 0,
  };

  const traits = opts.traits || [];
  const hpMul = (opts.hpMul ?? 1) * (opts.wave ? BALANCE.waves.hpMul(opts.wave) : 1) * (opts.diff?.hpMul ?? 1);
  enemy.hp = enemy.maxHp = base.hp * hpMul;
  if (traits.includes('fortified')) {
    enemy.traits.fortified = true;
    enemy.maxHp *= BALANCE.enemies.traits.fortified.hpMul;
    enemy.hp = enemy.maxHp;
    enemy.armor += BALANCE.enemies.traits.fortified.armorBonus;
  }
  if (traits.includes('lead')) {
    enemy.traits.lead = true;
  }
  if (traits.includes('camo')) {
    enemy.traits.camo = true;
  }
  if (traits.includes('regrow')) {
    enemy.traits.regrow = true;
    enemy.regrowDelay = BALANCE.enemies.traits.regrow.delay;
    enemy.regrowRate = BALANCE.enemies.traits.regrow.rate;
  }

  enemy.hp = enemy.maxHp;
  return enemy;
}

export function createTower(type, x, y) {
  const base = TOWER_DEFS[type];
  if (!base) throw new Error(`Unknown tower ${type}`);
  const tower = {
    id: TOWER_ID++,
    type,
    x,
    y,
    baseRadius: BALANCE.global.baseRadius,
    range: base.range,
    fireRate: base.fireRate,
    damage: base.damage,
    damageType: base.damageType,
    bulletSpeed: base.bulletSpeed,
    pierce: base.pierce,
    splashRadius: base.splashRadius,
    slowPct: base.slowPct,
    slowDuration: 1.5,
    camoDetection: base.camoDetection,
    shatterLead: false,
    cooldown: 0,
    priority: 'first',
    selected: false,
    tiers: { A: 0, B: 0 },
    totalSpent: base.price,
    sellValue: sellRefund(base.price),
    stats: { damage: 0, shots: 0 },
  };
  if (type === 'Hero') {
    tower.hero = true;
    tower.heroLevel = 1;
    tower.heroXP = 0;
    tower.heroNextXP = BALANCE.hero.levelXp(1);
  }
  return tower;
}

function enemyEffectiveSpeed(enemy, now) {
  let speed = enemy.baseSpeed;
  if (now < enemy.freezeUntil) return 0;
  if (enemy.slowUntil < now) {
    enemy.slowMul = 1;
  }
  speed *= enemy.slowMul;
  return speed;
}

function towerCanSee(enemy, tower, state) {
  if (!enemy.traits?.camo) return true;
  if (tower.camoDetection) return true;
  if (tower.type === 'Mage' && isActive('arcaneSurge', state)) return true;
  if (tower.hero && tower.heroLevel >= 15) return true;
  return false;
}

function prioritizeTarget(tower, enemies) {
  let best = null;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const d2 = dist2(tower.x, tower.y, enemy.x, enemy.y);
    if (d2 > tower.range * tower.range) continue;
    if (!towerCanSee(enemy, tower, tower._state)) continue;
    if (best === null) {
      best = { enemy, d2 };
      continue;
    }
    switch (tower.priority) {
      case 'first':
        if (enemy.t > best.enemy.t) best = { enemy, d2 };
        break;
      case 'last':
        if (enemy.t < best.enemy.t) best = { enemy, d2 };
        break;
      case 'strong':
        if (enemy.maxHp > best.enemy.maxHp) best = { enemy, d2 };
        break;
      case 'close':
        if (d2 < best.d2) best = { enemy, d2 };
        break;
      default:
        if (enemy.t > best.enemy.t) best = { enemy, d2 };
    }
  }
  return best?.enemy || null;
}

function buildBullet(tower, enemy, lane, now) {
  const lead = BALANCE.global.bulletLead;
  const future = projectAlongPolyline(lane, enemy.t + enemy.baseSpeed * lead);
  const dx = future.x - tower.x;
  const dy = future.y - tower.y;
  const len = Math.hypot(dx, dy) || 1;
  const bullet = {
    id: BULLET_ID++,
    x: tower.x,
    y: tower.y,
    vx: (dx / len) * tower.bulletSpeed,
    vy: (dy / len) * tower.bulletSpeed,
    damage: tower.damage,
    damageType: tower.damageType,
    pierce: tower.pierce,
    splashRadius: tower.splashRadius,
    slowPct: tower.slowPct,
    slowDuration: tower.slowDuration,
    shatterLead: tower.shatterLead || false,
    ttl: 4,
    from: tower,
    directHits: new Set(),
  };
  if (tower.type === 'Mage' && isActive('arcaneSurge', tower._state)) {
    bullet.damage *= 2;
    bullet.shatterLead = true;
  }
  const hero = tower._state.heroTower;
  const aura = tower._state.heroAura;
  if (hero && aura && tower.id !== hero.id) {
    const ddx = tower.x - hero.x;
    const ddy = tower.y - hero.y;
    if (ddx * ddx + ddy * ddy <= aura.range * aura.range) {
      bullet.damage *= aura.dmgMul;
    }
  }
  return bullet;
}

export function updateTowers(state, dt, now) {
  const lanes = state.lanes;
  for (const tower of state.towers) {
    tower._state = state;
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) continue;
    const lane = lanes[0];
    const target = prioritizeTarget(tower, state.enemies);
    if (!target) continue;
    const lanePath = lanes[target.lane] || lane;
    const bullet = buildBullet(tower, target, lanePath, now);
    tower.cooldown += tower.fireRate;
    tower.stats.shots++;
    state.bullets.push(bullet);
  }
}

function canDamage(enemy, damageType, shatterLead) {
  if (!enemy.traits?.lead) return true;
  if (damageType === 'physical' && !shatterLead) return false;
  return true;
}

export function applyDamage(enemy, rawDamage, damageType, { now, slowPct, slowDuration, shatterLead }) {
  if (!enemy.alive) return 0;
  if (!canDamage(enemy, damageType, shatterLead)) return 0;
  let dmg = rawDamage;
  if (damageType === 'physical') {
    dmg *= 1 - enemy.armor;
  }
  dmg = Math.max(1, dmg);
  enemy.hp -= dmg;
  enemy.lastHitAt = now;
  if (slowPct && slowPct > 0) {
    const mult = 1 - slowPct;
    enemy.slowMul = Math.min(enemy.slowMul, mult);
    enemy.slowUntil = Math.max(enemy.slowUntil, now + (slowDuration || 1.5));
  }
  if (enemy.hp <= 0) {
    enemy.alive = false;
  }
  return dmg;
}

export function updateBullets(state, dt, now, diff) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.ttl -= dt;
    if (bullet.ttl <= 0) {
      state.bullets.splice(i, 1);
      continue;
    }
    let directHits = bullet.directHits;
    if (!(directHits instanceof Set)) {
      const legacy = bullet.hitSet ?? directHits;
      if (legacy instanceof Set) {
        directHits = new Set(legacy);
      } else if (Array.isArray(legacy)) {
        directHits = new Set(legacy);
      } else if (typeof legacy === 'number' || typeof legacy === 'string') {
        const numeric = Number(legacy);
        directHits = new Set([Number.isNaN(numeric) ? legacy : numeric]);
      } else if (legacy && typeof legacy[Symbol.iterator] === 'function') {
        directHits = new Set(legacy);
      } else if (legacy && typeof legacy === 'object') {
        const entries = Object.keys(legacy).map((key) => {
          const num = Number(key);
          return Number.isNaN(num) ? key : num;
        });
        directHits = new Set(entries);
      } else {
        directHits = new Set();
      }
      bullet.directHits = directHits;
      delete bullet.hitSet;
    }
    let pierceLeft = bullet.pierce ?? 1;
    const splash = bullet.splashRadius;
    const hitRadius = bullet.from?.baseRadius ?? BALANCE.global.baseRadius;
    const hitRadius2 = hitRadius * hitRadius;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      if (directHits.has(enemy.id)) continue;
      const d2 = dist2(bullet.x, bullet.y, enemy.x, enemy.y);
      if (d2 > hitRadius2) continue;
      const dealt = applyDamage(enemy, bullet.damage, bullet.damageType, {
        now,
        slowPct: bullet.slowPct,
        slowDuration: bullet.slowDuration,
        shatterLead: bullet.shatterLead,
      });
      if (dealt > 0) {
        directHits.add(enemy.id);
        pierceLeft -= 1;
        if (bullet.from?.stats) {
          const towerStats = bullet.from.stats;
          towerStats.damage = (towerStats.damage ?? 0) + dealt;
        }
        if (state.stats) {
          state.stats.damage = (state.stats.damage ?? 0) + dealt;
        }
        if (enemy.hp <= 0) {
          const reward = popReward(enemy.type, diff);
          state.coins += reward;
          if (state.stats) {
            state.stats.pops = (state.stats.pops ?? 0) + 1;
          }
          enemy.alive = false;
          if (state.onEnemyKilled) state.onEnemyKilled(enemy, reward);
        }
        if (splash > 0) {
          const radius2 = splash * splash;
          const slowSplashPct = bullet.slowPct ? bullet.slowPct * 0.5 : 0;
          for (const other of state.enemies) {
            if (!other.alive || other === enemy) continue;
            const ds = dist2(enemy.x, enemy.y, other.x, other.y);
            if (ds <= radius2) {
              const dealtSplash = applyDamage(other, bullet.damage * 0.7, bullet.damageType, {
                now,
                slowPct: slowSplashPct,
                slowDuration: bullet.slowDuration,
                shatterLead: bullet.shatterLead,
              });
              if (dealtSplash > 0) {
                if (bullet.from?.stats) {
                  const towerStats = bullet.from.stats;
                  towerStats.damage = (towerStats.damage ?? 0) + dealtSplash;
                }
                if (state.stats) {
                  state.stats.damage = (state.stats.damage ?? 0) + dealtSplash;
                }
                if (other.hp <= 0) {
                  const reward = popReward(other.type, diff);
                  state.coins += reward;
                  if (state.stats) {
                    state.stats.pops = (state.stats.pops ?? 0) + 1;
                  }
                  other.alive = false;
                  if (state.onEnemyKilled) state.onEnemyKilled(other, reward);
                }
              }
            }
          }
        }
      }
      if (pierceLeft <= 0) break;
    }
    bullet.pierce = pierceLeft;
    if (pierceLeft <= 0) {
      state.bullets.splice(i, 1);
    }
  }
}

export function advanceEnemies(state, dt, now, diff) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    if (!enemy.alive) {
      state.enemies.splice(i, 1);
      continue;
    }
    const lane = state.lanes[enemy.lane] || state.lanes[0];
    const speed = enemyEffectiveSpeed(enemy, now);
    enemy.t += speed * dt;
    const pos = projectAlongPolyline(lane, enemy.t);
    enemy.x = pos.x;
    enemy.y = pos.y;
    if (enemy.traits?.regrow && enemy.hp < enemy.maxHp) {
      if (now - enemy.lastHitAt > enemy.regrowDelay) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * enemy.regrowRate * dt);
      }
    }
    if (pos.done) {
      state.lives -= 1;
      enemy.alive = false;
      state.enemies.splice(i, 1);
      if (state.onEnemyEscaped) state.onEnemyEscaped(enemy);
    }
  }
}

export function cyclePriority(tower) {
  const idx = TARGET_PRIORITIES.indexOf(tower.priority);
  tower.priority = TARGET_PRIORITIES[(idx + 1) % TARGET_PRIORITIES.length];
  return tower.priority;
}
