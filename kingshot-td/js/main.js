import { clamp, dist2, nowSeconds, pointToPolylineDistance, circleCircleOverlap, on } from './utils.js';
import { loadMap, bakeLanes, startStateFromMap } from './map.js';
import { render } from './renderer.js';
import {
  CONFIG,
  TOWERS,
  createTower,
  createEnemy,
  createBullet,
  applyDamage,
  applySlow,
  resetEnemySlow,
  BASE_RADIUS,
  PATH_CLEAR_FACTOR,
  resetIds
} from './entities.js';
import { wavesByName } from './waves.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hudCoins = document.getElementById('hud-coins');
const hudLives = document.getElementById('hud-lives');
const hudWave = document.getElementById('hud-wave');
const btnSend = document.getElementById('btn-send');
const btnSpeed = document.getElementById('btn-speed');
const btnPause = document.getElementById('btn-pause');
const shopEl = document.getElementById('shop');
const towerPanel = document.getElementById('tower-panel');
const toastsEl = document.getElementById('toasts');

const state = {
  ready: false,
  gameOver: false,
  victoryShown: false,
  map: null,
  lanes: [],
  tileSize: 64,
  worldW: 0,
  worldH: 0,
  coins: 0,
  lives: 0,
  waveIndex: 0,
  maxWave: 0,
  speed: 1,
  paused: false,
  selectedTowerType: 'Archer',
  selectedTowerId: null,
  placing: false,
  ghost: { x: 0, y: 0, type: null, valid: false, range: 0, reason: '' },
  towers: [],
  enemies: [],
  bullets: [],
  spawnQueue: [],
  spawning: false,
  WAVES: {},
  pointer: { x: 0, y: 0 },
  view: { width: 0, height: 0, dpr: window.devicePixelRatio || 1, scale: 1, offsetX: 0, offsetY: 0 }
};

const shopCards = new Map();
const TOWER_ORDER = ['Archer', 'Cannon', 'Mage', 'Frost'];

function showToast(message, duration = 2200) {
  if (!toastsEl) return;
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.padding = '8px 12px';
  toast.style.marginTop = '6px';
  toast.style.background = 'rgba(0,0,0,0.75)';
  toast.style.color = '#fff';
  toast.style.borderRadius = '6px';
  toast.style.fontSize = '14px';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.25s ease';
  toastsEl.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function setupShop() {
  if (!shopEl) return;
  shopEl.innerHTML = '';
  shopCards.clear();
  for (const type of TOWER_ORDER) {
    const def = TOWERS[type];
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.type = type;
    card.style.display = 'inline-flex';
    card.style.flexDirection = 'column';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    card.style.padding = '8px 10px';
    card.style.margin = '4px';
    card.style.borderRadius = '8px';
    card.style.border = '2px solid rgba(0,0,0,0.2)';
    card.style.background = 'rgba(255,255,255,0.12)';
    card.style.color = '#fff';
    card.style.fontSize = '14px';
    card.style.cursor = 'pointer';
    card.innerHTML = `<strong>${type}</strong><small>${def.price}c</small>`;
    card.addEventListener('click', () => {
      state.selectedTowerType = type;
      if (state.coins < def.price) {
        showToast('Not enough coins for placement.');
      }
      enterPlacement(type);
    });
    shopEl.appendChild(card);
    shopCards.set(type, card);
  }
  updateShopUI();
}

function updateShopUI() {
  for (const [type, card] of shopCards.entries()) {
    const def = TOWERS[type];
    const affordable = state.coins >= def.price;
    const selected = (state.placing && state.ghost.type === type) || (!state.placing && state.selectedTowerType === type);
    card.style.opacity = affordable ? '1' : '0.55';
    card.style.borderColor = selected ? '#FFC83D' : 'rgba(0,0,0,0.25)';
    card.style.boxShadow = selected ? '0 0 8px rgba(255,200,61,0.35)' : 'none';
  }
}

function updateTowerPanel() {
  if (!towerPanel) return;
  const tower = state.towers.find(t => t.id === state.selectedTowerId);
  if (!tower) {
    towerPanel.innerHTML = '<p style="margin:8px 0;color:#ddd;">Select a tower to inspect.</p>';
    return;
  }
  const def = tower.def;
  const slowLine = def.slowPct > 0 ? `<p>Slow: ${(def.slowPct * 100).toFixed(0)}%</p>` : '';
  towerPanel.innerHTML = `
    <h3 style="margin:0;color:#FFC83D;">${tower.type}</h3>
    <p>Range: ${def.range.toFixed(0)}</p>
    <p>Damage: ${def.damage.toFixed(0)} (${def.damageType})</p>
    <p>Rate: ${def.fireRate.toFixed(2)}/s</p>
    ${slowLine}
  `;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  state.view.width = rect.width;
  state.view.height = rect.height;
  state.view.dpr = dpr;
  if (state.worldW > 0 && state.worldH > 0) {
    const scale = Math.min(rect.width / state.worldW, rect.height / state.worldH);
    state.view.scale = scale;
    state.view.offsetX = (rect.width - state.worldW * scale) * 0.5;
    state.view.offsetY = (rect.height - state.worldH * scale) * 0.5;
  } else {
    state.view.scale = 1;
    state.view.offsetX = 0;
    state.view.offsetY = 0;
  }
}

function clientToWorld(evt) {
  if (!state.ready) return null;
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  if (state.view.scale === 0) return null;
  const worldX = (x - state.view.offsetX) / state.view.scale;
  const worldY = (y - state.view.offsetY) / state.view.scale;
  return {
    x: clamp(worldX, 0, state.worldW),
    y: clamp(worldY, 0, state.worldH)
  };
}

function validatePlacement(x, y, type) {
  if (!type) return { ok: false, reason: 'type' };
  const def = TOWERS[type];
  if (!def) return { ok: false, reason: 'type' };
  if (x < BASE_RADIUS || y < BASE_RADIUS || x > state.worldW - BASE_RADIUS || y > state.worldH - BASE_RADIUS) {
    return { ok: false, reason: 'bounds' };
  }
  const requiredClear = PATH_CLEAR_FACTOR * state.tileSize;
  for (const lane of state.lanes) {
    const distToPath = pointToPolylineDistance(x, y, lane.points);
    if (distToPath < requiredClear) {
      return { ok: false, reason: 'near path' };
    }
  }
  for (const tower of state.towers) {
    if (circleCircleOverlap(x, y, BASE_RADIUS, tower.x, tower.y, BASE_RADIUS)) {
      return { ok: false, reason: 'overlap' };
    }
  }
  if (state.coins < def.price) {
    return { ok: false, reason: 'cost' };
  }
  return { ok: true };
}

function updateGhostFromPointer() {
  if (!state.placing || !state.ghost.type) return;
  const grid = Math.max(8, state.tileSize / 4);
  const snappedX = Math.round(state.pointer.x / grid) * grid;
  const snappedY = Math.round(state.pointer.y / grid) * grid;
  const x = clamp(snappedX, BASE_RADIUS, state.worldW - BASE_RADIUS);
  const y = clamp(snappedY, BASE_RADIUS, state.worldH - BASE_RADIUS);
  state.ghost.x = x;
  state.ghost.y = y;
  state.ghost.range = TOWERS[state.ghost.type].range;
  const validation = validatePlacement(x, y, state.ghost.type);
  state.ghost.valid = validation.ok;
  state.ghost.reason = validation.reason || '';
}

function refreshGhostValidity() {
  if (!state.placing || !state.ghost.type) return;
  updateGhostFromPointer();
}

function enterPlacement(type) {
  state.selectedTowerType = type;
  if (!state.ready) {
    updateShopUI();
    return;
  }
  state.placing = true;
  state.ghost.type = type;
  if (!state.pointer.x && !state.pointer.y) {
    state.pointer.x = state.worldW * 0.5;
    state.pointer.y = state.worldH * 0.5;
  }
  updateGhostFromPointer();
  clearTowerSelection();
  updateShopUI();
}

function cancelPlacement() {
  if (!state.placing) return;
  state.placing = false;
  state.ghost.type = null;
  state.ghost.valid = false;
  state.ghost.reason = '';
  updateShopUI();
}

function clearTowerSelection() {
  state.selectedTowerId = null;
  for (const tower of state.towers) {
    tower.selected = false;
  }
  updateTowerPanel();
}

function selectTower(tower) {
  if (!tower) {
    clearTowerSelection();
    return;
  }
  state.selectedTowerId = tower.id;
  for (const t of state.towers) {
    t.selected = t.id === tower.id;
  }
  state.selectedTowerType = tower.type;
  updateTowerPanel();
  updateShopUI();
}

function selectTowerNear(x, y) {
  let best = null;
  let bestDist = Infinity;
  const pickRadius = BASE_RADIUS * 1.4;
  const pickRadius2 = pickRadius * pickRadius;
  for (const tower of state.towers) {
    const d2 = dist2(x, y, tower.x, tower.y);
    if (d2 <= pickRadius2 && d2 < bestDist) {
      bestDist = d2;
      best = tower;
    }
  }
  if (best) {
    selectTower(best);
  } else {
    clearTowerSelection();
  }
}

function placeTowerAt(x, y, type) {
  const validation = validatePlacement(x, y, type);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  const tower = createTower(type, x, y);
  state.towers.push(tower);
  state.coins -= TOWERS[type].price;
  selectTower(tower);
  updateShopUI();
  updateHUD();
  return { ok: true };
}

function showPlacementFailure(reason) {
  const messages = {
    bounds: 'Stay within the meadow.',
    'near path': 'Too close to the path.',
    overlap: 'Too close to another tower.',
    cost: 'Not enough coins.'
  };
  showToast(messages[reason] || 'Cannot place there.');
}

function canStartNextWave() {
  if (!state.ready || state.gameOver) return false;
  if (!state.WAVES) return false;
  if (state.waveIndex >= state.maxWave) return false;
  if (state.spawnQueue.length > 0) return false;
  if (state.enemies.some(e => e.alive)) return false;
  return true;
}

function updateHUD() {
  if (hudCoins) hudCoins.textContent = state.coins.toString();
  if (hudLives) hudLives.textContent = state.lives.toString();
  if (hudWave) {
    if (state.maxWave > 0) {
      hudWave.textContent = `Wave ${Math.min(state.waveIndex, state.maxWave)}/${state.maxWave}`;
    } else {
      hudWave.textContent = 'Wave 0/0';
    }
  }
  updateButtons();
}

function updateButtons() {
  if (btnSpeed) {
    btnSpeed.textContent = `Speed x${state.speed.toFixed(0)}`;
  }
  if (btnPause) {
    btnPause.textContent = state.paused ? 'Resume' : 'Pause';
    btnPause.disabled = state.gameOver || state.victoryShown;
  }
  if (btnSend) {
    if (state.waveIndex >= state.maxWave) {
      btnSend.textContent = state.victoryShown ? 'Victory Achieved' : 'All Waves Sent';
    } else {
      btnSend.textContent = `Send Wave ${state.waveIndex + 1}`;
    }
    btnSend.disabled = !canStartNextWave();
    if (state.gameOver || state.victoryShown) btnSend.disabled = true;
  }
}

function startWave(number) {
  if (!state.WAVES) return;
  if (number > state.maxWave) {
    showToast('All waves completed.');
    return;
  }
  const def = state.WAVES[number];
  if (!def || def.length === 0) {
    showToast('Wave has no enemies defined.');
    return;
  }
  state.waveIndex = number;
  const now = nowSeconds();
  let cursor = now + 0.6;
  for (const segment of def) {
    const count = Math.max(1, Math.floor(segment.count || 1));
    const gap = Math.max(0.1, segment.gap || 0.6);
    const lane = segment.lane ?? 0;
    const hpMul = segment.hpMul ?? 1;
    for (let i = 0; i < count; i++) {
      state.spawnQueue.push({
        at: cursor,
        type: segment.type,
        lane,
        hpMul
      });
      cursor += gap;
    }
  }
  state.spawnQueue.sort((a, b) => a.at - b.at);
  state.spawning = state.spawnQueue.length > 0;
  updateButtons();
}

function flushSpawns(now) {
  for (let i = 0; i < state.spawnQueue.length; ) {
    const spawn = state.spawnQueue[i];
    if (spawn.at <= now) {
      state.spawnQueue.splice(i, 1);
      const laneIndex = clamp(Math.floor(spawn.lane || 0), 0, state.lanes.length - 1);
      const lane = state.lanes[laneIndex];
      if (!lane) continue;
      const enemy = createEnemy(spawn.type, laneIndex, lane, spawn.hpMul);
      state.enemies.push(enemy);
    } else {
      break;
    }
  }
  if (state.spawnQueue.length === 0) {
    state.spawning = false;
  }
}

function updateEnemies(dt, now) {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const lane = state.lanes[enemy.lane];
    if (!lane || lane.segments.length === 0) {
      enemy.alive = false;
      enemy.reachedEnd = true;
      continue;
    }
    resetEnemySlow(enemy, now);
    let remaining = enemy.baseSpeed * enemy.slowMul * dt;
    while (remaining > 0 && enemy.alive) {
      const seg = lane.segments[enemy.segIndex];
      if (!seg) {
        enemy.alive = false;
        enemy.reachedEnd = true;
        break;
      }
      const segRemaining = seg.len - enemy.segDistance;
      if (segRemaining <= 0.0001) {
        enemy.segIndex += 1;
        enemy.segDistance = 0;
        continue;
      }
      if (remaining < segRemaining) {
        enemy.segDistance += remaining;
        enemy.pathOffset += remaining;
        remaining = 0;
      } else {
        enemy.segIndex += 1;
        enemy.pathOffset += segRemaining;
        enemy.segDistance = 0;
        remaining -= segRemaining;
        if (enemy.segIndex >= lane.segments.length) {
          enemy.alive = false;
          enemy.reachedEnd = true;
          break;
        }
      }
    }
    enemy.pathOffset = Math.min(enemy.pathOffset, enemy.pathLength || enemy.pathOffset);
    if (enemy.reachedEnd) {
      const end = lane.points[lane.points.length - 1];
      enemy.x = end.x;
      enemy.y = end.y;
    } else {
      const seg = lane.segments[enemy.segIndex];
      if (seg) {
        const ratio = seg.len > 0 ? enemy.segDistance / seg.len : 0;
        enemy.x = seg.ax + (seg.bx - seg.ax) * ratio;
        enemy.y = seg.ay + (seg.by - seg.ay) * ratio;
      }
    }
  }
}

function cleanupEnemies() {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    if (enemy.alive) continue;
    if (enemy.reachedEnd && !enemy.goalProcessed) {
      state.lives = Math.max(0, state.lives - 1);
      enemy.goalProcessed = true;
      if (state.lives === 0 && !state.gameOver) {
        state.gameOver = true;
        state.paused = true;
        showToast('Game Over');
      }
    }
    state.enemies.splice(i, 1);
  }
}

function findEnemyById(id) {
  for (const enemy of state.enemies) {
    if (enemy.id === id && enemy.alive) return enemy;
  }
  return null;
}

function applyBulletImpact(bullet, target, now) {
  const victims = [];
  if (bullet.splashRadius > 0) {
    const radius2 = bullet.splashRadius * bullet.splashRadius;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const d2 = dist2(bullet.x, bullet.y, enemy.x, enemy.y);
      if (d2 <= radius2) {
        victims.push(enemy);
      }
    }
  } else if (target && target.alive) {
    victims.push(target);
  } else if (target) {
    victims.push(target);
  }
  let coinsEarned = 0;
  for (const enemy of victims) {
    const result = applyDamage(enemy, bullet.damage, bullet.damageType);
    if (bullet.slowPct > 0) {
      applySlow(enemy, bullet.slowPct, now);
    }
    if (result.killed) {
      coinsEarned += enemy.reward;
    }
  }
  if (coinsEarned > 0) {
    state.coins += coinsEarned;
    updateShopUI();
  }
}

function updateBullets(dt, now) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];
    bullet.life += dt;
    if (bullet.life > CONFIG.bulletLifetime) {
      state.bullets.splice(i, 1);
      continue;
    }
    const target = findEnemyById(bullet.targetId);
    if (!target) {
      state.bullets.splice(i, 1);
      continue;
    }
    const dx = target.x - bullet.x;
    const dy = target.y - bullet.y;
    const distance = Math.hypot(dx, dy);
    const step = bullet.speed * dt;
    if (distance <= step + 1) {
      bullet.x = target.x;
      bullet.y = target.y;
      applyBulletImpact(bullet, target, now);
      state.bullets.splice(i, 1);
      continue;
    }
    if (distance > 0) {
      bullet.x += (dx / distance) * step;
      bullet.y += (dy / distance) * step;
    }
  }
}

function updateTowers(dt, now) {
  if (state.enemies.length === 0) return;
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    const range2 = tower.range * tower.range;
    let best = null;
    let bestProgress = -Infinity;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const d2 = dist2(tower.x, tower.y, enemy.x, enemy.y);
      if (d2 > range2) continue;
      if (enemy.pathOffset > bestProgress) {
        bestProgress = enemy.pathOffset;
        best = enemy;
      }
    }
    if (best && tower.cooldown <= 0) {
      const bullet = createBullet(tower, best.id);
      state.bullets.push(bullet);
      tower.cooldown += 1 / Math.max(0.01, tower.fireRate);
    }
  }
}

function handleVictoryCheck() {
  if (state.victoryShown || state.gameOver) return;
  if (state.waveIndex < state.maxWave) return;
  const activeEnemies = state.enemies.some(e => e.alive);
  if (activeEnemies) return;
  if (state.spawnQueue.length > 0) return;
  state.victoryShown = true;
  state.paused = true;
  showToast('Victory!');
  updateButtons();
}

function setupUI() {
  if (btnSend) {
    on(btnSend, 'click', () => {
      if (!canStartNextWave()) {
        showToast('Finish current wave first.');
        return;
      }
      startWave(state.waveIndex + 1);
    });
  }
  if (btnSpeed) {
    on(btnSpeed, 'click', () => {
      state.speed = state.speed === 1 ? 2 : 1;
      updateButtons();
    });
  }
  if (btnPause) {
    on(btnPause, 'click', () => {
      if (state.gameOver || state.victoryShown) return;
      state.paused = !state.paused;
      lastTick = nowSeconds();
      updateButtons();
    });
  }
  on(canvas, 'pointermove', event => {
    if (!state.ready) return;
    const world = clientToWorld(event);
    if (!world) return;
    state.pointer.x = world.x;
    state.pointer.y = world.y;
    if (state.placing) {
      updateGhostFromPointer();
    }
  });
  on(canvas, 'pointerdown', event => {
    if (!state.ready) return;
    if (event.button === 2) {
      if (state.placing) cancelPlacement();
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    const world = clientToWorld(event);
    if (!world) return;
    state.pointer.x = world.x;
    state.pointer.y = world.y;
    if (state.placing && state.ghost.type) {
      updateGhostFromPointer();
      if (state.ghost.valid) {
        const result = placeTowerAt(state.ghost.x, state.ghost.y, state.ghost.type);
        if (!event.shiftKey) {
          cancelPlacement();
        } else {
          refreshGhostValidity();
        }
        if (!result.ok) {
          showPlacementFailure(result.reason);
        }
      } else {
        showPlacementFailure(state.ghost.reason);
      }
    } else {
      selectTowerNear(world.x, world.y);
    }
  });
  on(canvas, 'contextmenu', event => {
    event.preventDefault();
  });
  on(window, 'keydown', event => {
    if (event.key === 'Escape') {
      cancelPlacement();
    }
  });
  on(window, 'resize', () => {
    resizeCanvas();
    refreshGhostValidity();
  });
}

let lastTick = nowSeconds();

function gameLoop() {
  const now = nowSeconds();
  let dt = now - lastTick;
  lastTick = now;
  if (!state.paused && state.ready && !state.gameOver) {
    dt = Math.min(dt, 0.05) * state.speed;
    flushSpawns(now);
    updateEnemies(dt, now);
    updateTowers(dt, now);
    updateBullets(dt, now);
    cleanupEnemies();
    handleVictoryCheck();
  }
  updateHUD();
  render(state, ctx);
  requestAnimationFrame(gameLoop);
}

async function bootstrap() {
  resetIds();
  setupShop();
  setupUI();
  resizeCanvas();
  const params = new URLSearchParams(window.location.search);
  const mapName = params.get('map') || 'meadow';
  let map;
  try {
    map = await loadMap(mapName);
  } catch (err) {
    console.error(err);
    showToast('Failed to load map data.');
    return;
  }
  const baked = bakeLanes(map);
  const start = startStateFromMap(map);
  state.map = map;
  state.lanes = baked.lanes;
  state.tileSize = baked.tileSize;
  state.worldW = baked.worldW;
  state.worldH = baked.worldH;
  state.coins = start.coins;
  state.lives = start.lives;
  state.waveIndex = 0;
  state.spawnQueue.length = 0;
  state.enemies.length = 0;
  state.towers.length = 0;
  state.bullets.length = 0;
  state.gameOver = false;
  state.victoryShown = false;
  state.paused = false;
  state.selectedTowerId = null;
  state.selectedTowerType = 'Archer';
  state.placing = false;
  state.ghost = { x: 0, y: 0, type: null, valid: false, range: 0, reason: '' };
  state.pointer = { x: baked.worldW * 0.5, y: baked.worldH * 0.5 };
  state.WAVES = wavesByName(map.waveset);
  state.maxWave = Object.keys(state.WAVES).reduce((max, key) => Math.max(max, Number(key) || 0), 0);
  resizeCanvas();
  updateShopUI();
  updateTowerPanel();
  updateHUD();
  state.ready = true;
  lastTick = nowSeconds();
  requestAnimationFrame(gameLoop);
}

bootstrap().catch(err => {
  console.error(err);
  showToast('Unexpected error during startup.');
});
