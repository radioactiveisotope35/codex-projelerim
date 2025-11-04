/**
 * renderer.js
 * Handles the isometric camera projection and all draw order responsibilities.
 * How to extend: add new layers or rendering effects by expanding draw routines.
 */

import { worldToScreen, easeOutQuad, hashStringToSeed, RNG } from './util.js';

export class Camera {
  constructor(canvas) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.target = { x: 0, y: 0, scale: 1 };
    this.tileW = 64;
    this.tileH = 32;
  }
  resize(w, h) {
    this.width = w;
    this.height = h;
  }
  update(dt) {
    this.x += (this.target.x - this.x) * Math.min(1, dt * 4);
    this.y += (this.target.y - this.y) * Math.min(1, dt * 4);
    this.scale += (this.target.scale - this.scale) * Math.min(1, dt * 4);
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera(canvas);
    this.particles = [];
    this.damageTexts = [];
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  enqueueParticle(p) {
    this.particles.push(p);
  }

  addDamageText(text) {
    this.damageTexts.push(text);
  }

  update(dt) {
    this.camera.update(dt);
    this.particles = this.particles.filter((p) => {
      p.t += dt;
      if (p.t >= p.life) return false;
      return true;
    });
    this.damageTexts = this.damageTexts.filter((t) => {
      t.t += dt;
      return t.t < t.life;
    });
  }

  drawMap(map) {
    const { ctx, camera } = this;
    const isoH = camera.tileH;
    const isoW = camera.tileW;

    if (!map.decorations) {
      const rng = new RNG(hashStringToSeed(map.name));
      const trees = [];
      const huts = [];
      const fences = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const chance = rng.nextFloat();
          if (chance < 0.06) {
            trees.push({ x: x + rng.range(-0.15, 0.15), y: y + rng.range(-0.15, 0.15), scale: rng.range(0.85, 1.2) });
          } else if (chance < 0.08) {
            huts.push({ x: x + rng.range(-0.1, 0.1), y: y + rng.range(-0.1, 0.1), rot: rng.range(-0.3, 0.3) });
          }
        }
      }
      for (const pad of map.buildable) {
        const segments = rng.nextFloat() > 0.5 ? 3 : 2;
        for (let i = 0; i < segments; i++) {
          const offset = i / segments;
          fences.push({
            x1: pad.x - 0.4 + offset * 0.8,
            y1: pad.y + 0.5,
            x2: pad.x - 0.4 + (offset + 1 / segments) * 0.8,
            y2: pad.y + 0.55,
          });
        }
      }
      map.decorations = { trees, huts, fences };
    }

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const screen = worldToScreen(camera, x, y, 0);
        const gradient = ctx.createLinearGradient(0, screen.y - isoH, 0, screen.y + isoH);
        gradient.addColorStop(0, '#6FAE76');
        gradient.addColorStop(1, '#4f7f56');
        ctx.fillStyle = gradient;
        drawIsoTile(ctx, screen.x, screen.y, isoW, isoH);
      }
    }
    // Draw path tiles
    ctx.fillStyle = '#E9D8B4';
    ctx.strokeStyle = 'rgba(108,78,52,0.5)';
    for (const path of map.paths) {
      for (let i = 0; i < path.samples.length; i++) {
        const tile = path.samples[i];
        const screen = worldToScreen(camera, tile.x, tile.y, 1);
        drawIsoTile(ctx, screen.x, screen.y, isoW * 0.9, isoH * 0.9);
      }
    }
    // Build pads
    ctx.fillStyle = '#d2b48c';
    for (const pad of map.buildable) {
      const screen = worldToScreen(camera, pad.x, pad.y, -6);
      drawIsoTile(ctx, screen.x, screen.y, isoW * 0.8, isoH * 0.8);
    }

    ctx.save();
    ctx.globalAlpha = 0.92;
    for (const tree of map.decorations.trees) {
      const screen = worldToScreen(camera, tree.x, tree.y, 18);
      drawTree(ctx, screen.x, screen.y, tree.scale);
    }
    ctx.restore();

    for (const hut of map.decorations.huts) {
      const screen = worldToScreen(camera, hut.x, hut.y, 12);
      drawHut(ctx, screen.x, screen.y, hut.rot);
    }

    ctx.strokeStyle = '#6B442B';
    for (const fence of map.decorations.fences) {
      const a = worldToScreen(camera, fence.x1, fence.y1, 8);
      const b = worldToScreen(camera, fence.x2, fence.y2, 8);
      drawFence(ctx, a.x, a.y, b.x, b.y);
    }
  }

  drawTowers(towers) {
    const { ctx, camera } = this;
    for (const tower of towers.list) {
      if (tower.hp <= 0) continue;
      const screen = worldToScreen(camera, tower.pos.x, tower.pos.y, 24);
      drawTower(ctx, screen.x, screen.y, tower.color, tower.tier || 1);
      if (tower.selected || tower.placing) {
        ctx.save();
        ctx.globalAlpha = tower.canPlace ? 0.25 : 0.1;
        ctx.fillStyle = tower.canPlace ? '#7DBF85' : '#cc4444';
        const radius = tower.range * camera.tileW;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawEnemies(enemies) {
    const { ctx, camera } = this;
    for (const e of enemies.list) {
      const screen = worldToScreen(camera, e.pos.x, e.pos.y, e.size * 12);
      drawEnemy(ctx, screen.x, screen.y, e.color, e.size, e.hp / e.maxHp);
    }
  }

  drawProjectiles(projectiles) {
    const { ctx, camera } = this;
    ctx.save();
    for (const p of projectiles.active) {
      const screen = worldToScreen(camera, p.pos.x, p.pos.y, 14);
      drawProjectile(ctx, screen.x, screen.y, p.color);
    }
    ctx.restore();
  }

  drawFX() {
    const { ctx, camera } = this;
    for (const p of this.particles) {
      const screen = worldToScreen(camera, p.x, p.y, p.z || 0);
      const t = p.t / p.life;
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, p.radius * easeOutQuad(1 - t), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const text of this.damageTexts) {
      const screen = worldToScreen(camera, text.x, text.y, 20);
      const t = text.t / text.life;
      const y = screen.y - t * 40;
      drawDamageText(this.ctx, screen.x, y, text.value, text.color, 1 - t);
    }
  }
}

function drawIsoTile(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTree(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#6B442B';
  ctx.fillRect(-4, 8, 8, 18);
  ctx.fillStyle = '#3f6c44';
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.lineTo(20, 12);
  ctx.lineTo(-20, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4f8f57';
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(16, 8);
  ctx.lineTo(-16, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHut(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#8C5A3C';
  ctx.beginPath();
  ctx.moveTo(-18, 10);
  ctx.lineTo(18, 10);
  ctx.lineTo(12, -6);
  ctx.lineTo(-12, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6B442B';
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(22, -4);
  ctx.lineTo(-22, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFence(ctx, x1, y1, x2, y2) {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineWidth = 2;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  ctx.beginPath();
  ctx.moveTo(midX, midY - 6);
  ctx.lineTo(midX, midY + 6);
  ctx.stroke();
  ctx.restore();
}

function drawTower(ctx, x, y, color, tier) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#422';
  ctx.fillRect(-12, 18, 24, 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(15, 18);
  ctx.lineTo(-15, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tier >= 3 ? '#FFC83D' : tier === 2 ? '#dca54c' : '#c68a2c';
  ctx.beginPath();
  ctx.arc(0, -4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, x, y, color, size, hpRatio) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-22, 22, 44, 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16 + size * 2, 16 - size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c33';
  ctx.fillRect(-18, 18, 36, 6);
  ctx.fillStyle = '#6f6';
  ctx.fillRect(-18, 18, 36 * hpRatio, 6);
  ctx.restore();
}

function drawProjectile(ctx, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDamageText(ctx, x, y, value, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = '600 18px "Segoe UI"';
  ctx.textAlign = 'center';
  ctx.fillText(value, x, y);
  ctx.restore();
}

Renderer.prototype.drawGhost = function (ghost) {
  if (!ghost) return;
  const screen = worldToScreen(this.camera, ghost.pos.x, ghost.pos.y, 24);
  const ctx = this.ctx;
  ctx.save();
  ctx.globalAlpha = ghost.canPlace ? 0.5 : 0.2;
  ctx.fillStyle = ghost.color;
  ctx.beginPath();
  ctx.moveTo(screen.x, screen.y - 18);
  ctx.lineTo(screen.x + 14, screen.y + 18);
  ctx.lineTo(screen.x - 14, screen.y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = ghost.canPlace ? 0.2 : 0.1;
  ctx.fillStyle = ghost.canPlace ? '#7DBF85' : '#cc4444';
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, ghost.range * this.camera.tileW * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};
