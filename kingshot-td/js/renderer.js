import { getViewport } from './utils.js';

const COLORS = {
  groundTop: '#7DBF85',
  groundBottom: '#4E8C58',
  path: '#E9D8B4',
  pathStroke: '#C9B695',
  towerBase: '#6B442B',
  towerFill: {
    Archer: '#3B6FB6',
    Cannon: '#B6733B',
    Mage: '#8E4FBF',
    Frost: '#58C7D8',
    Hero: '#E0C13B',
  },
  enemy: {
    Grunt: '#6A3D2C',
    Runner: '#1E8E54',
    Shielded: '#555A6D',
    Tank: '#3B3C47',
    Specter: '#8A8ABF',
  },
};

const HUD = {
  coins: document.getElementById('hud-coins'),
  lives: document.getElementById('hud-lives'),
  wave: document.getElementById('hud-wave'),
};

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function drawGround(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, COLORS.groundTop);
  grad.addColorStop(1, COLORS.groundBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function drawPath(ctx, lanes, tileSize, worldW, worldH) {
  if (!lanes || !lanes.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, worldW, worldH);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.55 * tileSize;
  ctx.strokeStyle = COLORS.path;
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 12;
  for (const lane of lanes) {
    ctx.beginPath();
    ctx.moveTo(lane[0].x, lane[0].y);
    for (let i = 1; i < lane.length; i++) ctx.lineTo(lane[i].x, lane[i].y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(6, 0.55 * tileSize - 6);
  ctx.strokeStyle = COLORS.pathStroke;
  for (const lane of lanes) {
    ctx.beginPath();
    ctx.moveTo(lane[0].x, lane[0].y);
    for (let i = 1; i < lane.length; i++) ctx.lineTo(lane[i].x, lane[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTowers(ctx, towers) {
  for (const tower of towers) {
    const baseR = tower.baseRadius ?? 18;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    circle(ctx, tower.x + 4, tower.y + 6, baseR * 0.6);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = COLORS.towerBase;
    circle(ctx, tower.x, tower.y, baseR);
    ctx.fill();
    ctx.fillStyle = COLORS.towerFill[tower.type] || '#ffffff';
    circle(ctx, tower.x, tower.y - baseR * 0.2, baseR * 0.7);
    ctx.fill();

    if (tower.selected) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      circle(ctx, tower.x, tower.y, tower.range);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawEnemyTraits(ctx, enemy, bodyRadius) {
  if (enemy.traits?.camo) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    circle(ctx, enemy.x, enemy.y, bodyRadius + 4);
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.traits?.fortified) {
    ctx.save();
    ctx.strokeStyle = '#FFD34A';
    ctx.lineWidth = 3;
    circle(ctx, enemy.x, enemy.y, bodyRadius + 2);
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.traits?.lead) {
    ctx.save();
    ctx.strokeStyle = '#2E2E2E';
    ctx.lineWidth = 4;
    circle(ctx, enemy.x, enemy.y, bodyRadius + 1);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawEnemies(ctx, enemies, worldW, worldH) {
  for (const enemy of enemies) {
    if (enemy.x < -32 || enemy.y < -32 || enemy.x > worldW + 32 || enemy.y > worldH + 32) {
      continue;
    }
    const bodyRadius = 14;
    ctx.fillStyle = COLORS.enemy[enemy.type] || '#b33';
    circle(ctx, enemy.x, enemy.y, bodyRadius);
    ctx.fill();
    drawEnemyTraits(ctx, enemy, bodyRadius);
    const hpPct = Math.max(0, enemy.hp) / enemy.maxHp;
    ctx.fillStyle = '#222';
    ctx.fillRect(enemy.x - 16, enemy.y - bodyRadius - 10, 32, 4);
    ctx.fillStyle = hpPct > 0.5 ? '#4CAF50' : hpPct > 0.25 ? '#FFC107' : '#E53935';
    ctx.fillRect(enemy.x - 16, enemy.y - bodyRadius - 10, 32 * hpPct, 4);
  }
}

export function drawBullets(ctx, bullets) {
  ctx.fillStyle = '#FFF3';
  for (const b of bullets) {
    circle(ctx, b.x, b.y, 4);
    ctx.fill();
  }
}

export function drawPlacementGhost(ctx, ghost) {
  if (!ghost?.type) return;
  const color = ghost.valid ? 'rgba(120,255,140,0.6)' : 'rgba(255,120,120,0.6)';
  const stroke = ghost.valid ? 'rgba(120,255,140,0.8)' : 'rgba(255,120,120,0.8)';
  ctx.save();
  ctx.fillStyle = color;
  circle(ctx, ghost.x, ghost.y, ghost.baseRadius);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  circle(ctx, ghost.x, ghost.y, ghost.range);
  ctx.stroke();
  ctx.restore();
}

export function render(state, ctx) {
  const canvas = ctx.canvas;
  const vp = getViewport();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // black bars
  ctx.fillStyle = '#000';
  if (vp.viewX > 0) {
    ctx.fillRect(0, 0, vp.viewX, canvas.height);
    ctx.fillRect(vp.viewX + vp.viewW, 0, canvas.width - (vp.viewX + vp.viewW), canvas.height);
  }
  if (vp.viewY > 0) {
    ctx.fillRect(vp.viewX, 0, vp.viewW, vp.viewY);
    ctx.fillRect(vp.viewX, vp.viewY + vp.viewH, vp.viewW, canvas.height - (vp.viewY + vp.viewH));
  }

  const sx = vp.viewW / state.worldW;
  const sy = vp.viewH / state.worldH;
  ctx.setTransform(sx, 0, 0, sy, vp.viewX, vp.viewY);

  drawGround(ctx, state.worldW, state.worldH);
  drawPath(ctx, state.lanes, state.tileSize, state.worldW, state.worldH);
  drawTowers(ctx, state.towers);
  drawEnemies(ctx, state.enemies, state.worldW, state.worldH);
  drawBullets(ctx, state.bullets);
  if (state.placing && state.ghost?.type) {
    drawPlacementGhost(ctx, state.ghost);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (HUD.coins) HUD.coins.textContent = Math.floor(state.coins).toString();
  if (HUD.lives) HUD.lives.textContent = Math.max(0, Math.floor(state.lives)).toString();
  if (HUD.wave) HUD.wave.textContent = `Wave ${state.waveIndex}`;
}
