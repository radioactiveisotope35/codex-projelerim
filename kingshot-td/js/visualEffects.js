import { seededRng } from './utils.js';

export const PARTICLES = [];
export const FLOATING_TEXTS = [];

// Partikül Renk Paletleri
const PALETTE = {
  blood: ['#e53935', '#c62828', '#8e0000'],
  explosion: ['#ffeb3b', '#ff9800', '#ff5722', '#f44336'],
  magic: ['#d1c4e9', '#b39ddb', '#673ab7'],
  frost: ['#e0f7fa', '#80deea', '#00acc1'],
  white: ['#ffffff', '#eceff1']
};

function randomColor(type) {
  const colors = PALETTE[type] || PALETTE.white;
  return colors[Math.floor(Math.random() * colors.length)];
}

export function spawnParticles(x, y, count, type = 'blood') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Hızı ve ömrü rastgele belirle
    const speed = Math.random() * 100 + 30;
    PARTICLES.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.4, // 0.3 ile 0.7 saniye arası
      maxLife: 0.7,
      size: Math.random() * 3 + 2,
      color: randomColor(type),
      drag: 0.90 // Hava sürtünmesi
    });
  }
}

export function spawnFloatingText(x, y, text, color = '#fff') {
  FLOATING_TEXTS.push({
    x, 
    y: y - 12, // Düşmanın biraz üstünden başlasın
    text,
    color,
    life: 0.8,
    vy: -35 // Yukarı doğru yavaşça süzülme
  });
}

export function updateEffects(dt) {
  // Partikülleri güncelle
  for (let i = PARTICLES.length - 1; i >= 0; i--) {
    const p = PARTICLES[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.life -= dt;
    p.size *= 0.94; // Giderek küçülme efekti
    
    if (p.life <= 0 || p.size < 0.5) {
      PARTICLES.splice(i, 1);
    }
  }

  // Uçuşan yazıları güncelle
  for (let i = FLOATING_TEXTS.length - 1; i >= 0; i--) {
    const t = FLOATING_TEXTS[i];
    t.y += t.vy * dt;
    t.life -= dt;
    
    if (t.life <= 0) {
      FLOATING_TEXTS.splice(i, 1);
    }
  }
}

export function drawEffects(ctx) {
  // 1. Partikülleri çiz
  for (const p of PARTICLES) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.beginPath();
    ctx.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 2. Yazıları çiz
  if (FLOATING_TEXTS.length > 0) {
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    
    for (const t of FLOATING_TEXTS) {
      ctx.fillStyle = t.color;
      // Sonlara doğru transparanlaşsın
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillText(t.text, t.x, t.y);
    }
    
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
