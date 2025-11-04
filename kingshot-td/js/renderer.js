import { CONFIG } from './entities.js';

const COLORS = {
  groundTop: '#7DBF85',
  groundBottom: '#4F8C59',
  pathFill: '#E9D8B4',
  pathStroke: '#C6B18D',
  towerBase: '#8C5A3C',
  towerAccent: '#FFC83D',
  enemies: {
    Grunt: '#5A4E7A',
    Runner: '#1D8E79',
    Tank: '#6B442B',
    Shielded: '#3E4C7C',
    Specter: '#884BA5'
  },
  bullets: '#F2F5FF'
};

export function drawGround(ctx, width, height) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, COLORS.groundTop);
  grad.addColorStop(1, COLORS.groundBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

export function drawPath(ctx, lanes, tileSize) {
  const pathWidth = tileSize * 0.55;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = pathWidth;
  ctx.strokeStyle = COLORS.pathFill;
  for (const lane of lanes) {
    const pts = lane.points;
    if (!pts || pts.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(2, pathWidth * 0.18);
  ctx.strokeStyle = COLORS.pathStroke;
  for (const lane of lanes) {
    const pts = lane.points;
    if (!pts || pts.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  }
}

function drawTowerBody(ctx, tower) {
  const baseRadius = CONFIG.towerBaseRadius;
  ctx.save();
  ctx.translate(tower.x, tower.y);
  ctx.fillStyle = COLORS.towerBase;
  ctx.strokeStyle = '#3d2617';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.towerAccent;
  ctx.beginPath();
  ctx.arc(0, -baseRadius * 0.4, baseRadius * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawTowers(ctx, towers) {
  for (const tower of towers) {
    if (tower.selected) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawTowerBody(ctx, tower);
    ctx.save();
    ctx.translate(tower.x, tower.y - CONFIG.towerBaseRadius * 0.2);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 16px sans-serif';
    ctx.fillText(tower.type.charAt(0), 0, 0);
    ctx.restore();
  }
}

export function drawEnemies(ctx, enemies) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const color = COLORS.enemies[enemy.type] || '#444';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 14, 0, Math.PI * 2);
    ctx.fill();

    const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    const barWidth = 28;
    const barHeight = 4;
    ctx.fillStyle = '#1f1f1f';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - 22, barWidth, barHeight);
    ctx.fillStyle = '#7ae582';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - 22, barWidth * hpRatio, barHeight);
  }
}

export function drawBullets(ctx, bullets) {
  ctx.fillStyle = COLORS.bullets;
  for (const bullet of bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPlacementGhost(ctx, ghost) {
  if (!ghost || !ghost.type) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = ghost.valid ? '#2f9e44' : '#c92a2a';
  ctx.beginPath();
  ctx.arc(ghost.x, ghost.y, CONFIG.towerBaseRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = ghost.valid ? '#2f9e44' : '#c92a2a';
  ctx.setLineDash([10, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ghost.x, ghost.y, ghost.range || 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function render(state, ctx) {
  const { view } = state;
  const width = ctx.canvas.width / (view.dpr || 1);
  const height = ctx.canvas.height / (view.dpr || 1);

  ctx.save();
  ctx.setTransform(view.dpr || 1, 0, 0, view.dpr || 1, 0, 0);
  drawGround(ctx, width, height);

  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);

  drawPath(ctx, state.lanes, state.tileSize);
  drawTowers(ctx, state.towers);
  drawEnemies(ctx, state.enemies);
  drawBullets(ctx, state.bullets);
  if (state.placing && state.ghost.type) {
    drawPlacementGhost(ctx, state.ghost);
  }

  ctx.restore();
  ctx.restore();
}
