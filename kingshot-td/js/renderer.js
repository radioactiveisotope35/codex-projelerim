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
    GigaBehemoth: '#40E0D0',
    TerraBehemoth: '#333333',
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

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * vx + (py - ay) * vy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  return Math.hypot(px - projX, py - projY);
}

function distanceToLanes(lanes, x, y) {
  if (!lanes || !lanes.length) return Infinity;
  let min = Infinity;
  for (const lane of lanes) {
    for (let i = 1; i < lane.length; i++) {
      const prev = lane[i - 1];
      const curr = lane[i];
      const dist = pointSegmentDistance(x, y, prev.x, prev.y, curr.x, curr.y);
      if (dist < min) min = dist;
    }
  }
  return min;
}

function sampleClearPoint(rand, w, h, lanes, minDist) {
  const attempts = 28;
  for (let i = 0; i < attempts; i++) {
    const x = rand() * w;
    const y = rand() * h;
    if (distanceToLanes(lanes, x, y) >= minDist) {
      return { x, y };
    }
  }
  return null;
}

function drawGrassTufts(ctx, rand, w, h, lanes) {
  const tuftCount = Math.max(16, Math.round((w * h) / 35000));
  ctx.save();
  for (let i = 0; i < tuftCount; i++) {
    const point = sampleClearPoint(rand, w, h, lanes, 32);
    if (!point) continue;
    const { x, y } = point;
    const bladeCount = 6 + Math.floor(rand() * 4);
    const radius = 6 + rand() * 6;
    ctx.save();
    ctx.translate(x, y);
    const angle = rand() * Math.PI * 2;
    ctx.rotate(angle);
    for (let b = 0; b < bladeCount; b++) {
      const t = (b / (bladeCount - 1)) * 2 - 1;
      const lean = (rand() * 0.4 - 0.2) * radius;
      const bladeHeight = radius * (1.1 + rand() * 0.6);
      ctx.beginPath();
      ctx.moveTo(t * 3, 2);
      ctx.quadraticCurveTo(lean * 0.5, -bladeHeight * 0.2, lean, -bladeHeight);
      ctx.strokeStyle = `rgba(${80 + rand() * 40}, ${140 + rand() * 60}, ${70 + rand() * 40}, 0.8)`;
      ctx.lineWidth = 1.2 + rand() * 0.6;
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(20,60,30,1)';
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 6, radius, radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawTrees(ctx, rand, w, h, lanes) {
  const treeCount = Math.max(6, Math.round((w * h) / 90000));
  for (let i = 0; i < treeCount; i++) {
    const point = sampleClearPoint(rand, w, h, lanes, 64);
    if (!point) continue;
    const { x, y } = point;
    const canopyRadius = 26 + rand() * 18;
    const trunkHeight = canopyRadius * (0.55 + rand() * 0.15);
    const trunkWidth = canopyRadius * 0.25;

    ctx.save();
    ctx.translate(x, y);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.ellipse(6, trunkHeight * 0.8, canopyRadius * 0.9, canopyRadius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const trunkGrad = ctx.createLinearGradient(0, -trunkHeight * 0.2, 0, trunkHeight);
    trunkGrad.addColorStop(0, '#5c3a23');
    trunkGrad.addColorStop(1, '#402413');
    ctx.fillStyle = trunkGrad;
    ctx.fillRect(-trunkWidth / 2, 0, trunkWidth, trunkHeight);

    const canopyGrad = ctx.createRadialGradient(0, -canopyRadius * 0.3, canopyRadius * 0.1, 0, 0, canopyRadius);
    canopyGrad.addColorStop(0, `rgba(120, ${Math.round(180 + rand() * 30)}, 95, 0.95)`);
    canopyGrad.addColorStop(1, `rgba(40, ${Math.round(95 + rand() * 25)}, 45, 0.95)`);
    ctx.fillStyle = canopyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -canopyRadius * 0.35, canopyRadius * 0.9, canopyRadius, rand() * Math.PI * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(-canopyRadius * 0.5, -canopyRadius * 0.6, canopyRadius * 0.6, canopyRadius * 0.75, rand() * 0.6, 0, Math.PI * 2);
    ctx.ellipse(canopyRadius * 0.55, -canopyRadius * 0.45, canopyRadius * 0.65, canopyRadius * 0.7, rand() * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawLake(ctx, rand, w, h, lanes) {
  const point = sampleClearPoint(rand, w, h, lanes, 70);
  if (!point) return;
  const { x, y } = point;
  const baseRadius = Math.min(w, h) * (0.08 + rand() * 0.06);
  const rx = baseRadius * (0.8 + rand() * 0.6);
  const ry = baseRadius * (0.5 + rand() * 0.4);
  const rotation = rand() * Math.PI;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.beginPath();
  ctx.ellipse(6, ry * 0.9, rx * 0.85, ry * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const waterGrad = ctx.createRadialGradient(0, 0, ry * 0.2, 0, 0, Math.max(rx, ry));
  waterGrad.addColorStop(0, 'rgba(120, 205, 235, 0.95)');
  waterGrad.addColorStop(0.6, 'rgba(70, 160, 205, 0.92)');
  waterGrad.addColorStop(1, 'rgba(40, 110, 150, 0.9)');
  ctx.fillStyle = waterGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.9, ry * 0.9, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawRiver(ctx, rand, w, h, lanes) {
  const orientation = rand() < 0.5 ? 'horizontal' : 'vertical';
  const segments = 6 + Math.floor(rand() * 4);
  const points = [];
  if (orientation === 'horizontal') {
    const baseY = h * (0.25 + rand() * 0.5);
    const amplitude = 40 + rand() * 35;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = t * w;
      const sinOffset = Math.sin((t + rand() * 0.4) * Math.PI * (1.5 + rand())) * amplitude;
      points.push({ x, y: baseY + sinOffset });
    }
  } else {
    const baseX = w * (0.25 + rand() * 0.5);
    const amplitude = 40 + rand() * 35;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * h;
      const sinOffset = Math.sin((t + rand() * 0.4) * Math.PI * (1.5 + rand())) * amplitude;
      points.push({ x: baseX + sinOffset, y });
    }
  }

  let minDist = Infinity;
  for (const p of points) {
    const dist = distanceToLanes(lanes, p.x, p.y);
    if (dist < minDist) minDist = dist;
  }
  if (minDist < 60) return;

  const width = Math.max(36, Math.min(w, h) * 0.05);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const grad = ctx.createLinearGradient(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y);
  grad.addColorStop(0, 'rgba(120, 205, 235, 0.9)');
  grad.addColorStop(1, 'rgba(50, 135, 185, 0.9)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = width;
  ctx.globalAlpha = 0.92;
  ctx.stroke();

  ctx.lineWidth = Math.max(12, width * 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.globalAlpha = 0.4;
  ctx.stroke();

  ctx.restore();
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
  if (rand() < 0.6) drawLake(ctx, rand, w, h, lanes);
  if (rand() < 0.5) drawRiver(ctx, rand, w, h, lanes);
  drawGrassTufts(ctx, rand, w, h, lanes);
  drawTrees(ctx, rand, w, h, lanes);
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
    } else if (enemy.type === 'GigaBehemoth') {
      size = BASE_SIZE * 1.8;
      bodyRadius = 26;
    } else if (enemy.type === 'TerraBehemoth') {
      size = BASE_SIZE * 2.2;
      bodyRadius = 32;
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
