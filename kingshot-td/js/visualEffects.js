import { seededRng } from './utils.js';

export const PARTICLES = [];
export const FLOATING_TEXTS = [];
export const LIGHTNINGS = []; // YENİ: Şimşekler dizisi

const PALETTE = {
  blood: ['#e53935', '#c62828', '#8e0000'],
  explosion: ['#ffeb3b', '#ff9800', '#ff5722', '#f44336'],
  magic: ['#d1c4e9', '#b39ddb', '#673ab7'],
  frost: ['#e0f7fa', '#80deea', '#00acc1'],
  white: ['#ffffff', '#eceff1'],
  spark: ['#ffff00', '#fff59d'] // YENİ
};

function randomColor(type) {
  const colors = PALETTE[type] || PALETTE.white;
  return colors[Math.floor(Math.random() * colors.length)];
}

export function spawnParticles(x, y, count, type = 'blood') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 100 + 30;
    PARTICLES.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.7,
      size: Math.random() * 3 + 2,
      color: randomColor(type === 'tesla' ? 'spark' : type), // Tesla için özel renk
      drag: 0.90
    });
  }
}

export function spawnFloatingText(x, y, text, color = '#fff') {
  FLOATING_TEXTS.push({
    x, y: y - 12,
    text, color,
    life: 0.8,
    vy: -35
  });
}

// YENİ: Şimşek oluşturma fonksiyonu
export function spawnLightning(x1, y1, x2, y2) {
  LIGHTNINGS.push({
    x1, y1, x2, y2,
    life: 0.15 // Çok kısa ömürlü
  });
}

export function updateEffects(dt) {
  for (let i = PARTICLES.length - 1; i >= 0; i--) {
    const p = PARTICLES[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.life -= dt;
    p.size *= 0.94;
    if (p.life <= 0 || p.size < 0.5) PARTICLES.splice(i, 1);
  }

  for (let i = FLOATING_TEXTS.length - 1; i >= 0; i--) {
    const t = FLOATING_TEXTS[i];
    t.y += t.vy * dt;
    t.life -= dt;
    if (t.life <= 0) FLOATING_TEXTS.splice(i, 1);
  }

  // Şimşekleri güncelle
  for (let i = LIGHTNINGS.length - 1; i >= 0; i--) {
    LIGHTNINGS[i].life -= dt;
    if (LIGHTNINGS[i].life <= 0) LIGHTNINGS.splice(i, 1);
  }
}

export function drawEffects(ctx) {
  // 1. Şimşekleri çiz (En altta olabilir)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const l of LIGHTNINGS) {
    const opacity = l.life / 0.15;
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = '#b3e5fc'; // Dış parıltı
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    // Basit bir zigzag efekti
    const midX = (l.x1 + l.x2) / 2 + (Math.random() - 0.5) * 20;
    const midY = (l.y1 + l.y2) / 2 + (Math.random() - 0.5) * 20;
    ctx.lineTo(midX, midY);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();

    ctx.strokeStyle = '#fff'; // İç çekirdek
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();

  // 2. Partikülleri çiz
  for (const p of PARTICLES) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.beginPath();
    ctx.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 3. Yazıları çiz
  if (FLOATING_TEXTS.length > 0) {
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    for (const t of FLOATING_TEXTS) {
      ctx.fillStyle = t.color;
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
