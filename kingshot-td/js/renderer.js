import { getViewport } from './utils.js';
import { getAsset } from './inCodeAssets.js';

const COLORS = {
  groundTop: '#9ed8a8',
  groundMid: '#77c191',
  groundBottom: '#4f9363',
  pathFill: '#f1dfb6',
  pathEdgeLight: '#f6e7c8',
  pathEdgeDark: '#c0a879',
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
    Behemoth: '#BF4F6B',
  },
};

let groundPatternCanvas = null;

function ensureGroundPattern() {
  if (groundPatternCanvas || typeof document === 'undefined') return;
  const size = 160;
  groundPatternCanvas = document.createElement('canvas');
  groundPatternCanvas.width = size;
  groundPatternCanvas.height = size;
  const g = groundPatternCanvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, 'rgba(255,255,255,0.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.02)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const drawSpeckles = (count, color, radius) => {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, radius, 0, Math.PI * 2);
      g.fill();
    }
  };
  drawSpeckles(40, 'rgba(255,255,255,0.15)', 1.2);
  drawSpeckles(40, 'rgba(0,0,0,0.1)', 1.1);
  drawSpeckles(20, 'rgba(255,255,255,0.08)', 2.0);
}

function seededRandomFactory(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 0xffffffff;
  };
}

function drawGroundDetails(ctx, w, h, lanes) {
  if (typeof document === 'undefined') return;
  ensureGroundPattern();
  if (groundPatternCanvas) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    const pattern = ctx.createPattern(groundPatternCanvas, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  const seed = Math.floor((lanes?.length || 1) * 97 + w * 13 + h * 11);
  const rand = seededRandomFactory(seed);
  const clumpCount = Math.max(8, Math.round((w * h) / 45000));

  ctx.save();
  for (let i = 0; i < clumpCount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const radius = 18 + rand() * 24;
    const shadowAlpha = 0.12 + rand() * 0.14;
    ctx.fillStyle = `rgba(30, 80, 52, ${shadowAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (0.7 + rand() * 0.3), radius, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    const highlightAlpha = 0.12 + rand() * 0.15;
    ctx.fillStyle = `rgba(210, 250, 210, ${highlightAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(x + radius * 0.2, y - radius * 0.15, radius * (0.5 + rand() * 0.3), radius * 0.6, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const HUD = {
  coins: document.getElementById('hud-coins'),
  lives: document.getElementById('hud-lives'),
  wave: document.getElementById('hud-wave'),
};

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function drawGround(ctx, w, h, lanes) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, COLORS.groundTop);
  grad.addColorStop(0.55, COLORS.groundMid);
  grad.addColorStop(1, COLORS.groundBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  drawGroundDetails(ctx, w, h, lanes);
}

export function drawPath(ctx, lanes, tileSize, worldW, worldH) {
  if (!lanes || !lanes.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, worldW, worldH);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const strokeWidth = 0.55 * tileSize;
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = COLORS.pathFill;
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 18;
  for (const lane of lanes) {
    ctx.beginPath();
    ctx.moveTo(lane[0].x, lane[0].y);
    for (let i = 1; i < lane.length; i++) ctx.lineTo(lane[i].x, lane[i].y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(6, strokeWidth - 6);
  ctx.strokeStyle = COLORS.pathEdgeDark;
  for (const lane of lanes) {
    ctx.beginPath();
    ctx.moveTo(lane[0].x, lane[0].y);
    for (let i = 1; i < lane.length; i++) ctx.lineTo(lane[i].x, lane[i].y);
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(4, strokeWidth - 10);
  ctx.strokeStyle = COLORS.pathEdgeLight;
  ctx.globalAlpha = 0.65;
  for (const lane of lanes) {
    ctx.beginPath();
    ctx.moveTo(lane[0].x, lane[0].y);
    for (let i = 1; i < lane.length; i++) ctx.lineTo(lane[i].x, lane[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawTowers(ctx, towers) {
  const SIZE = 44;
  for (const tower of towers) {
    const baseR = tower.baseRadius ?? 18;
    const asset = getAsset(tower.type);
    const halfSize = SIZE / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    circle(ctx, tower.x + 4, tower.y + 6, baseR * 0.6);
    ctx.fill();
    ctx.restore();

    if (asset) {
      ctx.drawImage(asset, tower.x - halfSize, tower.y - halfSize, SIZE, SIZE);
    } else {
      ctx.fillStyle = COLORS.towerBase;
      circle(ctx, tower.x, tower.y, baseR);
      ctx.fill();
      ctx.fillStyle = COLORS.towerFill[tower.type] || '#ffffff';
      circle(ctx, tower.x, tower.y - baseR * 0.2, baseR * 0.7);
      ctx.fill();
    }

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
  const BASE_SIZE = 32;
  for (const enemy of enemies) {
    if (enemy.x < -32 || enemy.y < -32 || enemy.x > worldW + 32 || enemy.y > worldH + 32) {
      continue;
    }

    let size = BASE_SIZE;
    let bodyRadius = 14;
    if (enemy.type === 'Behemoth') {
      size = BASE_SIZE * 1.5;
      bodyRadius = 22;
    }
    const asset = getAsset(enemy.type);
    const halfSize = size / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(enemy.x + 6, enemy.y + halfSize * 0.4, halfSize * 0.7, halfSize * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (asset) {
      ctx.drawImage(asset, enemy.x - halfSize, enemy.y - halfSize, size, size);
    } else {
      ctx.fillStyle = COLORS.enemy[enemy.type] || '#b33';
      circle(ctx, enemy.x, enemy.y, bodyRadius);
      ctx.fill();
    }

    drawEnemyTraits(ctx, enemy, bodyRadius);

    const hpPct = Math.max(0, enemy.hp) / enemy.maxHp;
    const hpW = size * 1.2;
    const hpH = 5;
    const hpY = enemy.y - bodyRadius - 10;
    ctx.fillStyle = '#222';
    ctx.fillRect(enemy.x - hpW / 2, hpY, hpW, hpH);
    ctx.fillStyle = hpPct > 0.5 ? '#4CAF50' : hpPct > 0.25 ? '#FFC107' : '#E53935';
    ctx.fillRect(enemy.x - hpW / 2, hpY, hpW * hpPct, hpH);
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

  drawGround(ctx, state.worldW, state.worldH, state.lanes);
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
