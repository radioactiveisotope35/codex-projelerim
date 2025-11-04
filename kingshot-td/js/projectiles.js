/**
 * projectiles.js
 * Manages projectile pooling, movement, and collision resolution.
 * How to extend: add new projectile archetypes or visual effects.
 */

import { distSq, clamp } from './util.js';
import { BAL } from './balance.js';

export class ProjectilePool {
  constructor(renderer) {
    this.renderer = renderer;
    this.active = [];
    this.pool = [];
  }

  spawn(data) {
    const proj = this.pool.pop() || {};
    Object.assign(proj, data, {
      alive: true,
      age: 0,
    });
    this.active.push(proj);
    return proj;
  }

  update(dt, enemies, effects) {
    const now = Date.now();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      if (p.homing && p.target && !p.target.dead) {
        const dx = p.target.pos.x - p.pos.x;
        const dy = p.target.pos.y - p.pos.y;
        const len = Math.hypot(dx, dy) + 0.0001;
        p.vel.x = (dx / len) * p.speed;
        p.vel.y = (dy / len) * p.speed;
      }
      if (p.age > p.life) {
        this.recycle(i);
        continue;
      }
      if (p.target && p.target.dead) {
        p.target = null;
      }
      if (p.target) {
        if (distSq(p.pos, p.target.pos) <= (p.hitRadius || 0.2) ** 2) {
          this.hit(p, p.target, enemies, effects);
          this.recycle(i);
        }
      } else {
        for (const enemy of enemies.list) {
          if (distSq(p.pos, enemy.pos) <= (p.hitRadius || 0.2) ** 2) {
            this.hit(p, enemy, enemies, effects);
            this.recycle(i);
            break;
          }
        }
      }
    }
  }

  hit(p, enemy, enemies, effects) {
    if (!enemy || enemy.dead) return;
    enemy.takeDamage(p.damage, p.damageType, effects);
    if (p.splash) {
      for (const e of enemies.list) {
        if (e === enemy) continue;
        if (distSq(p.pos, e.pos) <= p.splash * p.splash) {
          e.takeDamage(p.damage * 0.75, p.damageType, effects);
        }
      }
    }
    if (p.applySlow) {
      enemy.applySlow(p.applySlow.amount, p.applySlow.duration);
    }
    if (p.burn) {
      enemy.applyBurn(p.burn.damage, p.burn.duration);
    }
    if (p.chain) {
      let bounces = p.chain.bounces;
      let current = enemy;
      const hitSet = new Set([enemy]);
      while (bounces-- > 0) {
        let best = null;
        let bestDist = Infinity;
        for (const candidate of enemies.list) {
          if (hitSet.has(candidate) || candidate.dead) continue;
          const d = distSq(candidate.pos, current.pos);
          if (d < bestDist && d <= p.chain.radius * p.chain.radius) {
            best = candidate;
            bestDist = d;
          }
        }
        if (!best) break;
        best.takeDamage(p.damage * 0.6, p.damageType, effects);
        hitSet.add(best);
        current = best;
      }
    }
  }

  recycle(index) {
    const proj = this.active[index];
    this.active.splice(index, 1);
    this.pool.push(proj);
  }
}
