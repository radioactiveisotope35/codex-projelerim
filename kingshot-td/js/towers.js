/**
 * towers.js
 * Contains tower definitions, targeting logic, and upgrade flow.
 * How to extend: push new tower descriptors into TOWER_TYPES and update behaviors.
 */

import { BAL } from './balance.js';
import { distSq, angleTo } from './util.js';

export const TARGET_MODES = ['First', 'Last', 'Strong', 'Weak', 'Closest'];

const TOWER_TYPES = {
  Archer: {
    color: '#c9a063',
    damageType: 'physical',
  },
  Cannon: {
    color: '#8c5a3c',
    damageType: 'physical',
  },
  Mage: {
    color: '#7e66c4',
    damageType: 'magic',
  },
  Frost: {
    color: '#5bb6d7',
    damageType: 'magic',
  },
};

export class Tower {
  constructor(type, tile, stats) {
    this.type = type;
    this.tile = tile;
    this.pos = { x: tile.x, y: tile.y };
    this.level = 1;
    this.tier = 0;
    this.range = stats.rng;
    this.baseStats = { ...stats };
    this.stats = { ...stats };
    this.fireCooldown = 0;
    this.target = null;
    this.color = TOWER_TYPES[type].color;
    this.selected = false;
    this.targetMode = 'First';
    this.hp = 100;
    this.canPlace = true;
    this.placing = false;
    this.perk = null;
  }
}

export class TowerSystem {
  constructor(projectiles, renderer, economy, upgrades) {
    this.list = [];
    this.projectiles = projectiles;
    this.renderer = renderer;
    this.economy = economy;
    this.upgrades = upgrades;
    this.occupied = new Set();
  }

  clear() {
    this.list.length = 0;
    this.occupied.clear();
  }

  isOccupied(x, y) {
    return this.occupied.has(`${x},${y}`);
  }

  markOccupied(tile) {
    this.occupied.add(`${tile.x},${tile.y}`);
  }

  unmark(tile) {
    this.occupied.delete(`${tile.x},${tile.y}`);
  }

  addTower(type, tile) {
    const base = BAL.towers[type];
    const tower = new Tower(type, tile, this.applyUpgrades(base));
    this.list.push(tower);
    this.markOccupied(tile);
    return tower;
  }

  applyUpgrades(stats) {
    const mod = this.upgrades.getTowerModifiers();
    const result = {
      ...stats,
      rng: stats.rng * (1 + mod.range),
    };
    if (typeof stats.proj === 'number') {
      result.proj = stats.proj * (1 + mod.projectileSpeed);
    }
    return result;
  }

  sellTower(tower) {
    const refund = this.economy.sellTower(tower);
    this.list = this.list.filter((t) => t !== tower);
    this.unmark(tower.tile);
    return refund;
  }

  upgradeTower(tower) {
    const data = BAL.upgrades[tower.type][tower.tier];
    if (!data) return false;
    if (!this.economy.canAfford(data.cost)) return false;
    this.economy.spend(data.cost);
    tower.tier += 1;
    tower.level += 1;
    Object.assign(tower.stats, data);
    tower.range = tower.stats.rng;
    tower.perk = data.perk || null;
    return true;
  }

  update(dt, enemies) {
    for (const tower of this.list) {
      if (tower.fireCooldown > 0) tower.fireCooldown -= dt;
      if (!tower.target || tower.target.dead || distSq(tower.pos, tower.target.pos) > tower.range * tower.range) {
        tower.target = this.acquireTarget(tower, enemies);
      }
      if (tower.target && tower.fireCooldown <= 0) {
        this.fire(tower, tower.target);
        tower.fireCooldown = tower.stats.rof;
      }
    }
  }

  acquireTarget(tower, enemies) {
    if (!enemies.list.length) return null;
    const candidates = enemies.list.filter((e) => !e.dead && distSq(e.pos, tower.pos) <= tower.range * tower.range);
    if (!candidates.length) return null;
    switch (tower.targetMode) {
      case 'Last':
        return candidates.reduce((a, b) => (b.progress > a.progress ? b : a));
      case 'Strong':
        return candidates.reduce((a, b) => (b.hp > a.hp ? b : a));
      case 'Weak':
        return candidates.reduce((a, b) => (b.hp < a.hp ? b : a));
      case 'Closest':
        return candidates.reduce((a, b) => (distSq(a.pos, tower.pos) < distSq(b.pos, tower.pos) ? a : b));
      case 'First':
      default:
        return candidates.reduce((a, b) => (a.progress < b.progress ? b : a));
    }
  }

  fire(tower, target) {
    const dir = angleTo(tower.pos, target.pos);
    const speed = tower.stats.proj || BAL.projectiles[tower.type]?.speed || 6;
    const projectile = this.projectiles.spawn({
      pos: { x: tower.pos.x, y: tower.pos.y },
      vel: { x: Math.cos(dir) * speed, y: Math.sin(dir) * speed },
      speed,
      damage: tower.stats.dmg,
      damageType: TOWER_TYPES[tower.type].damageType,
      target,
      splash: tower.stats.splash || null,
      applySlow: tower.type === 'Frost' ? { amount: tower.stats.slow, duration: 1.2 } : null,
      burn: tower.perk && tower.perk.includes('Burn') ? { damage: tower.stats.dmg * 0.5, duration: 3 } : null,
      chain: tower.perk && tower.perk.includes('Chain') ? { bounces: 3, radius: 2.5 } : null,
      life: 2,
      hitRadius: tower.type === 'Cannon' ? 0.5 : 0.25,
      homing: tower.type === 'Frost',
      color: tower.color,
    });
    if (tower.perk && tower.perk.includes('Crit')) {
      if (Math.random() < 0.15) {
        projectile.damage *= 2;
      }
    }
  }
}

export function getTowerCost(type) {
  return BAL.towers[type].cost;
}
