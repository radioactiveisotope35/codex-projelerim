/**
 * enemies.js
 * Holds enemy definitions and update logic for movement, damage, and effects.
 * How to extend: register new enemy archetypes in ENEMY_DEFS and spawn them via waves.
 */

import { advanceAlongPath } from './pathfinding.js';
import { BAL } from './balance.js';

const ENEMY_DEFS = {
  Grunt: { color: '#5d4128' },
  Runner: { color: '#6b8f2f' },
  Tank: { color: '#3b2a1c' },
  Shielded: { color: '#444f63' },
  Specter: { color: '#9c7be2' },
  Swarm: { color: '#c9972f' },
  OgreBoss: { color: '#a43d2f' },
};

export class Enemy {
  constructor(type, stats, path, waveMultiplier) {
    this.type = type;
    this.base = stats;
    this.path = path;
    this.waveMultiplier = waveMultiplier;
    this.progress = 0;
    this.speed = stats.speed;
    this.hp = stats.hp * waveMultiplier.hp;
    this.maxHp = this.hp;
    this.bounty = stats.bounty * waveMultiplier.bounty;
    this.armor = stats.armor;
    this.magicResist = stats.magicResist;
    this.pos = { x: path.samples[0].x, y: path.samples[0].y };
    this.dead = false;
    this.size = stats.size || 1;
    this.color = ENEMY_DEFS[type]?.color || '#fff';
    this.slowStack = 0;
    this.slowTimer = 0;
    this.burn = null;
  }

  update(dt) {
    if (this.dead) return;
    if (this.burn) {
      this.burn.timer -= dt;
      if (this.burn.timer <= 0) {
        this.takeDamage(this.burn.damage, 'magic');
        this.burn.timer = this.burn.interval;
        this.burn.ticks--;
        if (this.burn.ticks <= 0) this.burn = null;
      }
    }
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowStack = 0;
      }
    }
    const slowMul = 1 - Math.min(this.slowStack, BAL.slow.maxStack);
    this.progress += this.speed * slowMul * dt;
    const sample = advanceAlongPath(this.path, this.progress);
    this.pos.x = sample.x;
    this.pos.y = sample.y;
  }

  takeDamage(amount, type, effects) {
    if (this.dead) return;
    const resist = type === 'magic' ? this.magicResist : this.armor;
    const final = Math.max(1, amount * (1 - resist));
    this.hp -= final;
    if (effects && effects.renderer) {
      effects.renderer.addDamageText({
        x: this.pos.x,
        y: this.pos.y,
        value: Math.round(final),
        color: '#fff',
        life: 0.8,
        t: 0,
      });
    }
    if (this.hp <= 0) {
      this.dead = true;
      if (effects && effects.onKill) effects.onKill(this);
      if (effects && effects.renderer) {
        effects.renderer.enqueueParticle({
          x: this.pos.x,
          y: this.pos.y,
          radius: 40,
          color: 'rgba(255,200,61,0.5)',
          life: 0.5,
          t: 0,
        });
      }
    }
  }

  applySlow(amount, duration) {
    this.slowStack = Math.min(BAL.slow.maxStack, this.slowStack + amount);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  applyBurn(damage, duration) {
    this.burn = {
      damage: damage / 3,
      ticks: 3,
      timer: duration / 3,
      interval: duration / 3,
    };
  }
}

export class EnemySystem {
  constructor() {
    this.list = [];
    this.spawnQueue = [];
    this.onExit = null;
  }

  reset() {
    this.list.length = 0;
    this.spawnQueue.length = 0;
  }

  scheduleSpawn(time, factory) {
    this.spawnQueue.push({ time, factory });
    this.spawnQueue.sort((a, b) => a.time - b.time);
  }

  update(dt, effects) {
    for (const enemy of this.list) {
      enemy.update(dt);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const enemy = this.list[i];
      if (enemy.dead) {
        this.list.splice(i, 1);
        continue;
      }
      if (enemy.progress >= enemy.path.samples.length - 1) {
        this.list.splice(i, 1);
        if (this.onExit) this.onExit(enemy);
      }
    }
  }

  spawn(type, stats, path, waveMultiplier) {
    const enemy = new Enemy(type, stats, path, waveMultiplier);
    this.list.push(enemy);
    return enemy;
  }
}

export function getEnemyStats(type) {
  return BAL.enemies[type];
}
