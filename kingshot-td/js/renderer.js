const COLORS = {
  groundTop: '#7DBF85',
  groundBottom: '#6FAE76',
  pathMain: '#E9D8B4',
  pathEdge: '#CDBE94',
  padFill: '#F1C978',
  padStroke: '#8C5A3C',
  padHover: '#FFD88C',
  padSelected: '#FFE5AA',
  range: 'rgba(255, 255, 255, 0.18)',
  rangeOutline: 'rgba(255, 255, 255, 0.45)',
  bullet: '#fff',
};

export function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

export function drawGround(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, COLORS.groundTop);
  grad.addColorStop(1, COLORS.groundBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function drawPath(ctx, baked) {
  const { lanes, tileSize } = baked;
  if (!lanes.length) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const width = tileSize * 0.55;
  ctx.strokeStyle = COLORS.pathMain;
  ctx.lineWidth = width;
  for (const lane of lanes) {
    if (!lane.points.length) continue;
    ctx.beginPath();
    ctx.moveTo(lane.points[0].x, lane.points[0].y);
    for (let i = 1; i < lane.points.length; i++) {
      const pt = lane.points[i];
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = COLORS.pathEdge;
  ctx.lineWidth = Math.max(2, width * 0.2);
  for (const lane of lanes) {
    if (!lane.points.length) continue;
    ctx.beginPath();
    ctx.moveTo(lane.points[0].x, lane.points[0].y);
    for (let i = 1; i < lane.points.length; i++) {
      const pt = lane.points[i];
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawPads(ctx, pads) {
  for (const pad of pads) {
    if (pad.occupied) continue;
    const fill = pad.hover ? COLORS.padHover : COLORS.padFill;
    ctx.fillStyle = fill;
    ctx.strokeStyle = COLORS.padStroke;
    ctx.lineWidth = 2;
    roundedRectPath(ctx, pad.x, pad.y, pad.w, pad.h, pad.w * 0.2);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawPreview(ctx, preview) {
  if (!preview) return;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.rangeOutline;
  ctx.fillStyle = COLORS.range;
  ctx.beginPath();
  ctx.arc(preview.x, preview.y, preview.range, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawTowers(ctx, towers) {
  for (const tower of towers) {
    if (tower.selected) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.rangeOutline;
      ctx.fillStyle = COLORS.range;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(tower.x, tower.y);
    ctx.fillStyle = tower.color;
    ctx.strokeStyle = '#3d2a1f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(12, 10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tower.capColor;
    ctx.beginPath();
    ctx.arc(0, -6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawEnemies(ctx, enemies) {
  for (const enemy of enemies) {
    const radius = enemy.radius;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const barWidth = radius * 2;
    const barHeight = 4;
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(enemy.x - radius, enemy.y - radius - 10, barWidth, barHeight);
    ctx.fillStyle = '#7CFF7C';
    ctx.fillRect(enemy.x - radius, enemy.y - radius - 10, barWidth * ratio, barHeight);
  }
}

export function drawBullets(ctx, bullets) {
  ctx.lineWidth = 2;
  for (const bullet of bullets) {
    ctx.fillStyle = bullet.color || COLORS.bullet;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function render(state, ctx) {
  const { canvasWidth, canvasHeight } = state;
  clear(ctx, canvasWidth, canvasHeight);
  drawGround(ctx, canvasWidth, canvasHeight);

  ctx.save();
  ctx.scale(state.view.scale, state.view.scale);
  ctx.translate(state.view.offsetX, state.view.offsetY);

  drawPath(ctx, state.lanes);
  drawPads(ctx, state.pads);
  drawPreview(ctx, state.preview);
  drawTowers(ctx, state.towers);
  drawEnemies(ctx, state.enemies);
  drawBullets(ctx, state.bullets);

  ctx.restore();
}
