import { loadMap, bakeLanes, buildPads, startStateFromMap, padAt } from './map.js';
import { render } from './renderer.js';
import {
  Timeline,
  nowSeconds,
  dist2,
  pointInCircle,
} from './utils.js';
import {
  CONFIG,
  createTower,
  createEnemy,
  advanceEnemy,
  applyDamage,
  applySlow,
  acquireTarget,
  spawnProjectile,
  enemyReward,
  resetEntityIds,
} from './entities.js';
import {
  waveset_meadow_20,
  waveset_canyon_20,
  waveset_crossroads_20,
} from './waves.js';

const WAVES_REGISTRY = {
  'meadow-20': waveset_meadow_20,
  'canyon-20': waveset_canyon_20,
  'crossroads-20': waveset_crossroads_20,
};

const toastLayer = document.getElementById('toasts');
const coinsEl = document.getElementById('hud-coins');
const livesEl = document.getElementById('hud-lives');
const waveEl = document.getElementById('hud-wave');
const btnSend = document.getElementById('btn-send');
const btnSpeed = document.getElementById('btn-speed');
const btnPause = document.getElementById('btn-pause');
const shopEl = document.getElementById('shop');
const towerPanel = document.getElementById('tower-panel');

function showToast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  toastLayer.appendChild(node);
  setTimeout(() => {
    node.remove();
  }, 2600);
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const urlParams = new URLSearchParams(window.location.search);
const requestedMap = urlParams.get('map');
const allowedMaps = new Set(['meadow', 'canyon', 'crossroads']);
const mapName = allowedMaps.has((requestedMap || '').toLowerCase())
  ? requestedMap.toLowerCase()
  : 'meadow';

(async () => {
  let mapData;
  try {
    mapData = await loadMap(mapName);
  } catch (err) {
    console.error(err);
    showToast('Failed to load map data.');
    return;
  }

  resetEntityIds();

  const lanes = bakeLanes(mapData);
  const pads = buildPads(mapData);
  const baseState = startStateFromMap(mapData);
  const waveFactory = WAVES_REGISTRY[mapData.waveset] || WAVES_REGISTRY['meadow-20'];
  const waveDefs = waveFactory();
  const waveKeys = Object.keys(waveDefs).map((key) => Number(key));
  const maxWave = waveKeys.length ? Math.max(...waveKeys) : 0;

  const state = {
    canvas,
    ctx,
    canvasWidth: 0,
    canvasHeight: 0,
    time: 0,
    speed: 1,
    paused: false,
    gameOver: false,
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    map: mapData,
    lanes,
    pads,
    tileSize: mapData.tileSize,
    worldWidth: lanes.width,
    worldHeight: lanes.height,
    coins: baseState.coins,
    lives: baseState.lives,
    waveIndex: 0,
    waveInProgress: false,
    pendingSpawns: 0,
    timeline: new Timeline(),
    towers: [],
    enemies: [],
    bullets: [],
    selectedTowerType: 'Archer',
    selectedTower: null,
    preview: null,
    hoverPad: null,
    waveDefs,
    maxWave,
    hudCache: { coins: '', lives: '', wave: '' },
    pointer: { x: 0, y: 0, worldX: 0, worldY: 0, inside: false },
    victoryShown: false,
  };

  setupShop(state);
  setupControls(state);
  resizeCanvas(state);
  updateHud(state, true);
  updateSendButton(state);
  requestAnimationFrame(() => gameLoop(state));
})();

function setupShop(state) {
  shopEl.innerHTML = '';
  for (const [type, def] of Object.entries(CONFIG.towers)) {
    const card = document.createElement('div');
    card.className = 'tower-card';
    card.dataset.type = type;
    card.innerHTML = `
      <strong>${type}</strong>
      <span class="price">${def.price}💰</span>
      <small>${def.damageType === 'magic' ? 'Magic' : 'Physical'} • Range ${(def.range).toFixed(1)} tiles</small>
    `;
    card.addEventListener('click', () => {
      state.selectedTowerType = type;
      state.selectedTower = null;
      for (const tower of state.towers) tower.selected = false;
      updateTowerPanel(state);
      updateShopAvailability(state);
      refreshPreview(state);
    });
    shopEl.appendChild(card);
  }
  state.selectedTowerType = 'Archer';
  updateShopAvailability(state);
}

function setupControls(state) {
  window.addEventListener('resize', () => resizeCanvas(state));
  canvas.addEventListener('pointermove', (ev) => {
    updatePointer(state, ev);
    state.pointer.inside = true;
    updateHover(state);
  });
  canvas.addEventListener('pointerleave', () => {
    state.pointer.inside = false;
    state.hoverPad = null;
    state.preview = null;
    for (const pad of state.pads) pad.hover = false;
  });
  canvas.addEventListener('pointerdown', (ev) => {
    updatePointer(state, ev);
    state.pointer.inside = true;
    handlePointerDown(state);
  });

  btnSend.addEventListener('click', () => {
    if (state.paused || state.waveInProgress) return;
    const nextWave = state.waveIndex + 1;
    const def = state.waveDefs[nextWave];
    if (!def) {
      showToast('All waves cleared!');
      return;
    }
    startWave(state, nextWave, def);
  });

  btnSpeed.addEventListener('click', () => {
    state.speed = state.speed === 1 ? 2 : 1;
    btnSpeed.textContent = state.speed === 1 ? 'x1' : 'x2';
  });

  btnPause.addEventListener('click', () => {
    state.paused = !state.paused;
    btnPause.textContent = state.paused ? '▶' : '⏸';
    updateSendButton(state);
  });
}

function resizeCanvas(state) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  state.canvasWidth = canvas.width;
  state.canvasHeight = canvas.height;
  updateView(state);
}

function updateView(state) {
  const { worldWidth, worldHeight } = state;
  const scale = Math.min(
    state.canvasWidth / worldWidth,
    state.canvasHeight / worldHeight
  ) || 1;
  const worldCanvasWidth = state.canvasWidth / scale;
  const worldCanvasHeight = state.canvasHeight / scale;
  state.view.scale = scale;
  state.view.offsetX = (worldCanvasWidth - worldWidth) / 2;
  state.view.offsetY = (worldCanvasHeight - worldHeight) / 2;
}

function updatePointer(state, ev) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (ev.clientX - rect.left) * scaleX;
  const y = (ev.clientY - rect.top) * scaleY;
  state.pointer.x = x;
  state.pointer.y = y;
  state.pointer.worldX = x / state.view.scale - state.view.offsetX;
  state.pointer.worldY = y / state.view.scale - state.view.offsetY;
}

function updateHover(state) {
  let hovered = null;
  for (const pad of state.pads) {
    if (pad.occupied) {
      pad.hover = false;
      continue;
    }
    if (pointInCircle(state.pointer.worldX, state.pointer.worldY, {
      x: pad.centerX,
      y: pad.centerY,
      r: pad.w * 0.5,
    })) {
      hovered = pad;
      pad.hover = true;
    } else {
      pad.hover = false;
    }
  }
  state.hoverPad = hovered;
  refreshPreview(state);
}

function refreshPreview(state) {
  if (state.hoverPad && state.selectedTowerType) {
    const def = CONFIG.towers[state.selectedTowerType];
    state.preview = {
      x: state.hoverPad.centerX,
      y: state.hoverPad.centerY,
      range: def.range * state.tileSize,
    };
  } else {
    state.preview = null;
  }
}

function handlePointerDown(state) {
  const pointer = state.pointer;
  const worldPoint = { x: pointer.worldX, y: pointer.worldY };
  let selected = null;
  for (const tower of state.towers) {
    const d2 = dist2(worldPoint, tower);
    if (d2 <= 20 * 20) {
      selected = tower;
      break;
    }
  }
  if (selected) {
    setSelectedTower(state, selected);
    return;
  }

  const pad = state.hoverPad || padAt(state.pads, worldPoint.x, worldPoint.y);
  if (pad && !pad.occupied) {
    placeTowerOnPad(state, pad);
  } else {
    setSelectedTower(state, null);
  }
}

function setSelectedTower(state, tower) {
  state.selectedTower = tower;
  for (const t of state.towers) {
    t.selected = t === tower;
  }
  updateTowerPanel(state);
}

function placeTowerOnPad(state, pad) {
  const type = state.selectedTowerType;
  if (!type) {
    showToast('Select a tower first.');
    return;
  }
  const def = CONFIG.towers[type];
  if (state.coins < def.price) {
    showToast('Not enough coins.');
    return;
  }
  const tower = createTower(type, state.tileSize, pad.centerX, pad.centerY);
  state.towers.push(tower);
  pad.occupied = true;
  pad.hover = false;
  state.preview = null;
  state.coins -= def.price;
  setSelectedTower(state, tower);
  updateShopAvailability(state);
  updateHud(state, true);
}

function updateShopAvailability(state) {
  const cards = shopEl.querySelectorAll('.tower-card');
  for (const card of cards) {
    const type = card.dataset.type;
    const def = CONFIG.towers[type];
    const affordable = state.coins >= def.price;
    card.classList.toggle('disabled', !affordable);
    card.classList.toggle('selected', state.selectedTowerType === type);
  }
}

function updateTowerPanel(state) {
  const tower = state.selectedTower;
  if (!tower) {
    towerPanel.classList.remove('active');
    towerPanel.innerHTML = '';
    return;
  }
  towerPanel.classList.add('active');
  towerPanel.innerHTML = `
    <strong>${tower.type} Tower</strong>
    <div>Damage: ${tower.damage}</div>
    <div>Range: ${(tower.range / state.tileSize).toFixed(1)} tiles</div>
    <div>Rate: ${(1 / tower.reload).toFixed(2)} shots/s</div>
    <div>Type: ${tower.damageType}</div>
  `;
}

function updateHud(state, force = false) {
  const coinsText = `💰 ${Math.round(state.coins)}`;
  if (force || coinsText !== state.hudCache.coins) {
    coinsEl.textContent = coinsText;
    state.hudCache.coins = coinsText;
  }
  const livesText = `❤️ ${state.lives}`;
  if (force || livesText !== state.hudCache.lives) {
    livesEl.textContent = livesText;
    state.hudCache.lives = livesText;
  }
  const waveText = `Wave ${state.waveIndex}/${state.maxWave}`;
  if (force || waveText !== state.hudCache.wave) {
    waveEl.textContent = waveText;
    state.hudCache.wave = waveText;
  }
}

function updateSendButton(state) {
  const nextWave = state.waveIndex < state.maxWave ? state.waveIndex + 1 : null;
  btnSend.textContent = nextWave ? `Wave ${nextWave}` : 'Done';
  btnSend.disabled = state.paused || state.waveInProgress || !nextWave || state.gameOver;
}

function startWave(state, waveNumber, groups) {
  state.waveIndex = waveNumber;
  state.waveInProgress = true;
  state.pendingSpawns = 0;
  let anchor = state.time + 0.5;
  for (const group of groups) {
    const { type, count, gap, lane, hpMul } = group;
    let spawnTime = anchor;
    for (let i = 0; i < count; i++) {
      state.timeline.schedule(spawnTime, { type, lane, hpMul });
      spawnTime += gap;
      state.pendingSpawns++;
    }
    anchor = Math.max(anchor + 0.6, spawnTime);
  }
  updateHud(state, true);
  updateSendButton(state);
}

function gameLoop(state) {
  const now = nowSeconds();
  if (!state.lastFrameTime) {
    state.lastFrameTime = now;
  }
  let dt = now - state.lastFrameTime;
  state.lastFrameTime = now;
  dt = Math.min(dt, 0.15);

  if (!state.paused && !state.gameOver) {
    updateGame(state, dt * state.speed);
  }

  render(state, ctx);
  requestAnimationFrame(() => gameLoop(state));
}

function updateGame(state, dt) {
  state.time += dt;

  const events = state.timeline.popDue(state.time);
  for (const evt of events) {
    spawnEnemy(state, evt);
  }

  const survivors = [];
  for (const enemy of state.enemies) {
    if (!enemy.alive) {
      continue;
    }
    const reached = advanceEnemy(enemy, dt);
    if (reached) {
      state.lives = Math.max(0, state.lives - 1);
      if (state.lives === 0 && !state.gameOver) {
        state.gameOver = true;
        state.paused = true;
        showToast('Game Over');
        updateSendButton(state);
      }
      continue;
    }
    survivors.push(enemy);
  }
  state.enemies = survivors;

  updateTowers(state, dt);
  updateBullets(state, dt);

  if (
    state.waveInProgress &&
    state.pendingSpawns === 0 &&
    state.timeline.isEmpty() &&
    state.enemies.length === 0
  ) {
    state.waveInProgress = false;
    updateSendButton(state);
    if (!state.victoryShown && state.waveIndex >= state.maxWave) {
      showToast('Victory!');
      state.victoryShown = true;
    }
  }

  updateHud(state);
  updateShopAvailability(state);
}

function spawnEnemy(state, evt) {
  const lane = state.lanes.lanes[evt.lane] || state.lanes.lanes[0];
  if (!lane) return;
  const enemy = createEnemy(evt.type, lane, evt.hpMul);
  state.enemies.push(enemy);
  state.pendingSpawns = Math.max(0, state.pendingSpawns - 1);
}

function updateTowers(state, dt) {
  for (const tower of state.towers) {
    tower.fireCooldown = Math.max(0, tower.fireCooldown - dt);
    if (tower.fireCooldown > 0) continue;
    const target = acquireTarget(tower, state.enemies);
    if (!target) continue;
    const bullet = spawnProjectile(tower, target);
    const dx = target.x - bullet.x;
    const dy = target.y - bullet.y;
    const len = Math.hypot(dx, dy) || 1;
    bullet.vx = dx / len;
    bullet.vy = dy / len;
    state.bullets.push(bullet);
    tower.fireCooldown = tower.reload;
  }
}

function updateBullets(state, dt) {
  const active = [];
  let coinsEarned = 0;
  for (const bullet of state.bullets) {
    if (bullet.target && bullet.target.alive) {
      const dx = bullet.target.x - bullet.x;
      const dy = bullet.target.y - bullet.y;
      const len = Math.hypot(dx, dy) || 1;
      bullet.vx = dx / len;
      bullet.vy = dy / len;
    }

    bullet.x += bullet.vx * bullet.speed * dt;
    bullet.y += bullet.vy * bullet.speed * dt;
    bullet.ttl -= dt;

    let detonated = false;
    if (bullet.target && bullet.target.alive) {
      const dx = bullet.target.x - bullet.x;
      const dy = bullet.target.y - bullet.y;
      if (dx * dx + dy * dy <= bullet.hitRadiusSq) {
        detonated = true;
      }
    } else if (bullet.splash > 0) {
      detonated = true;
    }

    if (bullet.ttl <= 0) {
      detonated = true;
    }

    if (detonated) {
      coinsEarned += resolveBullet(state, bullet);
      continue;
    }

    active.push(bullet);
  }
  state.bullets = active;
  if (coinsEarned > 0) {
    state.coins += coinsEarned;
    updateHud(state, true);
  }
}

function resolveBullet(state, bullet) {
  let coins = 0;
  const victims = [];
  if (bullet.splash > 0) {
    const radiusSq = bullet.splash * bullet.splash;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - bullet.x;
      const dy = enemy.y - bullet.y;
      if (dx * dx + dy * dy <= radiusSq) {
        victims.push(enemy);
      }
    }
  } else if (bullet.target && bullet.target.alive) {
    victims.push(bullet.target);
  }

  for (const enemy of victims) {
    const result = applyDamage(enemy, bullet.damage, bullet.damageType);
    if (bullet.slowPct > 0 && enemy.alive) {
      applySlow(enemy, bullet.slowPct, bullet.slowDuration);
    }
    if (result.killed) {
      coins += enemyReward(enemy);
    }
  }

  return coins;
}
