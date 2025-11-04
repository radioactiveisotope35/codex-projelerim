import { BALANCE } from './balance.js';
import { loadMap, bakeLanes, startStateFromMap } from './map.js';
import { render } from './renderer.js';
import {
  createTower,
  createEnemy,
  advanceEnemies,
  updateTowers,
  updateBullets,
  cyclePriority,
  applyDamage,
} from './entities.js';
import { priceOf, getDifficulty, roundBonus, popReward } from './economy.js';
import { wavesByName } from './waves.js';
import * as upgrades from './upgrades.js';
import * as abilities from './abilities.js';
import {
  nowSeconds,
  pointToPolylineDistance,
  dist2,
  SpawnQueue,
  clamp,
} from './utils.js';

const params = new URLSearchParams(globalThis.location?.search || '');
const mapName = params.get('map') || 'meadow';
const sandbox = params.get('sandbox') === '1';
const diff = getDifficulty();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const btnSend = document.getElementById('btn-send');
const btnSpeed = document.getElementById('btn-speed');
const btnPause = document.getElementById('btn-pause');
const shopEl = document.getElementById('shop');
const panelEl = document.getElementById('tower-panel');
const toastEl = document.getElementById('toasts');

let debugOverlay = null;

function makeDebugOverlay() {
  const div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.top = '12px';
  div.style.right = '12px';
  div.style.maxWidth = '320px';
  div.style.background = 'rgba(0,0,0,0.6)';
  div.style.color = '#fff';
  div.style.padding = '8px 12px';
  div.style.fontSize = '12px';
  div.style.lineHeight = '1.4';
  div.style.pointerEvents = 'none';
  document.body.appendChild(div);
  return div;
}

function toast(message, duration = 2000) {
  if (!toastEl) return;
  const entry = document.createElement('div');
  entry.textContent = message;
  entry.style.padding = '6px 10px';
  entry.style.marginTop = '6px';
  entry.style.background = 'rgba(0,0,0,0.65)';
  entry.style.color = '#fff';
  entry.style.borderRadius = '6px';
  toastEl.appendChild(entry);
  setTimeout(() => {
    entry.remove();
  }, duration);
}

function resizeCanvas(state) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width * dpr;
  const height = rect.height * dpr;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  if (state && state.worldW && state.worldH) {
    state.viewScale = Math.min(width / state.worldW, height / state.worldH);
    const scaledW = state.worldW * state.viewScale;
    const scaledH = state.worldH * state.viewScale;
    const extraX = Math.max(0, width - scaledW) / state.viewScale;
    const extraY = Math.max(0, height - scaledH) / state.viewScale;
    state.viewOffsetX = extraX * 0.5;
    state.viewOffsetY = extraY * 0.5;
  }
}

function clientToWorld(state, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const deviceX = (event.clientX - rect.left) * scaleX;
  const deviceY = (event.clientY - rect.top) * scaleY;
  const scale = state.viewScale || 1;
  const offsetX = state.viewOffsetX || 0;
  const offsetY = state.viewOffsetY || 0;
  return {
    x: deviceX / scale - offsetX,
    y: deviceY / scale - offsetY,
  };
}

function updateShop(state) {
  if (!shopEl) return;
  for (const card of shopEl.querySelectorAll('[data-type]')) {
    const type = card.dataset.type;
    const price = priceOf(type);
    const disabled = (!sandbox && state.coins < price) || (type === 'Hero' && state.heroPlaced);
    card.classList.toggle('disabled', disabled);
    const priceEl = card.querySelector('.price');
    if (priceEl) priceEl.textContent = `$${price}`;
  }
}

function updateSpeedButton(state) {
  if (!btnSpeed) return;
  btnSpeed.textContent = `Speed x${state.speed.toFixed(1)}`;
}

function updatePauseButton(state) {
  if (!btnPause) return;
  btnPause.textContent = state.paused ? 'Resume' : 'Pause';
}

function updateSendButton(state) {
  if (!btnSend) return;
  btnSend.disabled = state.waveActive;
}

function refreshDebug(state) {
  if (!state.debugVisible) {
    if (debugOverlay) debugOverlay.style.display = 'none';
    return;
  }
  if (!debugOverlay) debugOverlay = makeDebugOverlay();
  debugOverlay.style.display = 'block';
  const lines = [];
  lines.push(`Wave: ${state.waveIndex}`);
  lines.push(`Coins: ${state.coins} | Lives: ${state.lives}`);
  lines.push(`Pops: ${state.stats.pops} | Damage: ${Math.round(state.stats.damage)}`);
  lines.push(`Cash Spent: ${state.stats.cashSpent} | Earned: ${state.stats.cashEarned}`);
  lines.push('--- Towers ---');
  for (const tower of state.towers) {
    const dps = tower.stats.damage / Math.max(1, state.gameTime);
    const dpb = tower.stats.damage / Math.max(1, tower.totalSpent);
    lines.push(
      `${tower.type}#${tower.id} dmg=${Math.round(tower.stats.damage)} dps=${dps.toFixed(1)} dpb=${dpb.toFixed(2)} prio=${tower.priority}`
    );
  }
  debugOverlay.textContent = lines.join('\n');
}

function buildShop(state) {
  if (!shopEl) return;
  shopEl.innerHTML = '';
  for (const type of Object.keys(BALANCE.towers)) {
    const card = document.createElement('button');
    card.className = 'tower-card';
    card.dataset.type = type;
    card.innerHTML = `<strong>${type}</strong><span class="price"></span>`;
    card.addEventListener('click', () => {
      state.selectedTowerType = type;
      state.placing = true;
      state.ghost.type = type;
      state.ghost.range = BALANCE.towers[type].range;
      state.ghost.baseRadius = BALANCE.global.baseRadius;
      state.ghost.valid = false;
    });
    shopEl.appendChild(card);
  }
}

function selectTower(state, tower) {
  for (const t of state.towers) t.selected = false;
  state.selectedTower = tower;
  if (tower) tower.selected = true;
  updatePanel(state);
}

function validatePlacement(state, x, y, type) {
  const radius = BALANCE.global.baseRadius;
  if (!type) return { ok: false, reason: 'No tower selected' };
  if (x < radius || y < radius || x > state.worldW - radius || y > state.worldH - radius) {
    return { ok: false, reason: 'Bounds' };
  }
  const pathClear = state.tileSize * BALANCE.global.pathClearFactor;
  for (const lane of state.lanes) {
    if (pointToPolylineDistance(x, y, lane) < pathClear) {
      return { ok: false, reason: 'Path too close' };
    }
  }
  for (const tower of state.towers) {
    if (dist2(x, y, tower.x, tower.y) < (radius * 2) ** 2) {
      return { ok: false, reason: 'Overlap' };
    }
  }
  const price = priceOf(type);
  if (!sandbox && state.coins < price) {
    return { ok: false, reason: 'Coins' };
  }
  if (type === 'Hero' && state.heroPlaced) {
    return { ok: false, reason: 'Hero already placed' };
  }
  return { ok: true };
}

function placeTower(state, x, y, type) {
  const valid = validatePlacement(state, x, y, type);
  if (!valid.ok) {
    toast(valid.reason);
    return false;
  }
  const tower = createTower(type, x, y);
  state.towers.push(tower);
  if (!sandbox) {
    state.coins -= priceOf(type);
    state.stats.cashSpent += priceOf(type);
  }
  if (tower.hero) {
    state.heroPlaced = true;
    state.heroTower = tower;
  }
  selectTower(state, tower);
  updateShop(state);
  updatePanel(state);
  return true;
}

function updatePanel(state) {
  if (!panelEl) return;
  const tower = state.selectedTower;
  if (!tower) {
    panelEl.innerHTML = '<p>Select a tower for details.</p>';
    return;
  }
  const tiers = `A${tower.tiers.A} / B${tower.tiers.B}`;
  const lines = [
    `<h3>${tower.type} <small>Tier ${tiers}</small></h3>`,
    `<p>Range: ${Math.round(tower.range)} | Damage: ${Math.round(tower.damage)} | Fire rate: ${(tower.fireRate).toFixed(2)}s</p>`,
    `<p>Priority: <button data-action="priority">${tower.priority}</button></p>`,
    `<p>Sell refund: $${tower.sellValue}</p>`,
  ];
  lines.push('<div class="upgrades"><strong>Upgrades</strong><div class="paths"></div></div>');
  lines.push('<div class="abilities"><strong>Abilities</strong><div class="ability-buttons"></div></div>');
  lines.push('<p><button data-action="sell">Sell</button></p>');
  panelEl.innerHTML = lines.join('');
  const pathContainer = panelEl.querySelector('.paths');
  for (const path of ['A', 'B']) {
    const tier = tower.tiers[path] + 1;
    const btn = document.createElement('button');
    btn.dataset.action = 'upgrade';
    btn.dataset.path = path;
    const info = upgrades.getUpgradeInfo(tower.type, path, tier);
    if (!info) {
      btn.disabled = true;
      btn.textContent = `${path}-Path maxed`;
    } else {
      btn.textContent = `${path}${tier}: $${info.price}`;
      const can = upgrades.canApplyUpgrade(state, tower, path);
      btn.disabled = !can.ok;
      if (!can.ok) btn.title = can.reason || '';
    }
    pathContainer.appendChild(btn);
  }
  const abilityWrap = panelEl.querySelector('.ability-buttons');
  for (const ability of abilities.list()) {
    if (!abilities.isUnlocked(ability.id, state)) continue;
    const status = abilities.uiStatus(ability.id, state);
    const btn = document.createElement('button');
    btn.dataset.action = 'ability';
    btn.dataset.ability = ability.id;
    btn.textContent = `${ability.name} [${ability.hotkey}]`;
    btn.disabled = !abilities.canUse(ability.id, state);
    if (status.cooldown > 0) {
      btn.textContent += ` (${status.cooldown.toFixed(1)}s)`;
    }
    abilityWrap.appendChild(btn);
  }
}

function applyHeroBonus(state, hero, level) {
  const bonus = BALANCE.hero.levelBonuses[level];
  if (!bonus) return;
  if (bonus.range) hero.range += bonus.range;
  if (bonus.damage) hero.damage += bonus.damage;
  if (bonus.fireRateMul) hero.fireRate *= bonus.fireRateMul;
  if (bonus.camoDetection) hero.camoDetection = true;
  if (bonus.aura) {
    state.heroAura = { range: hero.range + bonus.aura.range, dmgMul: bonus.aura.dmgMul };
  }
  if (bonus.ability) abilities.register(state, bonus.ability);
  toast(`Hero reached level ${level}!`);
}

function grantHeroXP(state, amount) {
  const hero = state.heroTower;
  if (!hero) return;
  hero.heroXP += amount;
  const maxLevel = BALANCE.hero.maxLevel;
  while (hero.heroLevel < maxLevel && hero.heroXP >= hero.heroNextXP) {
    hero.heroXP -= hero.heroNextXP;
    hero.heroLevel += 1;
    hero.heroNextXP = BALANCE.hero.levelXp(hero.heroLevel);
    applyHeroBonus(state, hero, hero.heroLevel);
    updatePanel(state);
  }
}

function setupPanelInteractions(state) {
  if (!panelEl) return;
  panelEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'sell' && state.selectedTower) {
      const tower = state.selectedTower;
      const index = state.towers.indexOf(tower);
      if (index >= 0) {
        state.towers.splice(index, 1);
        state.coins += tower.sellValue;
        state.stats.cashEarned += tower.sellValue;
        if (tower.hero) {
          state.heroPlaced = false;
          state.heroTower = null;
          state.heroAura = null;
        }
        selectTower(state, null);
        updateShop(state);
        toast('Tower sold');
      }
    } else if (action === 'priority' && state.selectedTower) {
      const newPrio = cyclePriority(state.selectedTower);
      toast(`Priority: ${newPrio}`);
      updatePanel(state);
    } else if (action === 'upgrade' && state.selectedTower) {
      const path = btn.dataset.path;
      const check = upgrades.canApplyUpgrade(state, state.selectedTower, path);
      if (!check.ok) {
        toast(check.reason || 'Cannot upgrade');
        return;
      }
      const price = check.info.price;
      if (upgrades.applyUpgrade(state, state.selectedTower, path)) {
        if (!sandbox) state.stats.cashSpent += price;
        updateShop(state);
        updatePanel(state);
      }
    } else if (action === 'ability') {
      const abilityId = btn.dataset.ability;
      if (state.triggerAbility) state.triggerAbility(abilityId);
      updatePanel(state);
    }
  });
}

function attachHotkeys(state) {
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      state.placing = false;
      state.ghost.type = null;
    }
    if (ev.key === 'F2') {
      state.debugVisible = !state.debugVisible;
    }
    for (const ability of abilities.list()) {
      if (ability.hotkey === ev.key) {
        if (state.triggerAbility) state.triggerAbility(ability.id);
        updatePanel(state);
      }
    }
  });
}

function setupPlacementEvents(state) {
  if (!canvas) return;
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('pointermove', (ev) => {
    const pos = clientToWorld(state, ev);
    const grid = state.tileSize / 4;
    const snapX = Math.round(pos.x / grid) * grid;
    const snapY = Math.round(pos.y / grid) * grid;
    if (state.placing && state.ghost.type) {
      const check = validatePlacement(state, snapX, snapY, state.ghost.type);
      state.ghost.x = snapX;
      state.ghost.y = snapY;
      state.ghost.range = BALANCE.towers[state.ghost.type].range;
      state.ghost.baseRadius = BALANCE.global.baseRadius;
      state.ghost.valid = check.ok;
    }
  });
  canvas.addEventListener('pointerdown', (ev) => {
    const pos = clientToWorld(state, ev);
    if (ev.button === 2) {
      state.placing = false;
      state.ghost.type = null;
      return;
    }
    if (state.placing && state.ghost.type && state.ghost.valid) {
      const placed = placeTower(state, state.ghost.x, state.ghost.y, state.ghost.type);
      if (!ev.shiftKey || !placed) {
        state.placing = false;
        if (!placed) state.ghost.type = null;
      }
      updateShop(state);
      return;
    }
    let best = null;
    let bestDist = Infinity;
    for (const tower of state.towers) {
      const d2 = dist2(pos.x, pos.y, tower.x, tower.y);
      if (d2 < (tower.baseRadius + 6) ** 2 && d2 < bestDist) {
        best = tower;
        bestDist = d2;
      }
    }
    selectTower(state, best);
  });
}

function startWave(state) {
  const next = state.waveIndex + 1;
  const groups = state.waves[next];
  if (!groups) {
    toast('No more waves!');
    return;
  }
  state.waveIndex = next;
  state.waveActive = true;
  const startTime = state.gameTime + 0.5;
  let at = startTime;
  for (const group of groups) {
    for (let i = 0; i < group.count; i++) {
      state.spawnQueue.add({
        at,
        type: group.type,
        lane: group.lane,
        traits: group.traits || [],
        hpMul: group.hpMul || 1,
      });
      at += group.gap;
    }
  }
  updateSendButton(state);
}

function spawnEnemy(state, entry) {
  const laneIndex = entry.lane % state.lanes.length;
  const lane = state.lanes[laneIndex];
  const start = lane[0];
  const enemy = createEnemy(entry.type, laneIndex, start, {
    traits: entry.traits,
    hpMul: entry.hpMul,
    wave: state.waveIndex,
    diff,
  });
  enemy.t = -Math.random() * 14;
  state.enemies.push(enemy);
}

function endWave(state) {
  if (!state.waveActive) return;
  state.waveActive = false;
  if (!sandbox) {
    const bonus = roundBonus(state.waveIndex, diff);
    if (bonus > 0) {
      state.coins += bonus;
      state.stats.cashEarned += bonus;
      toast(`Wave ${state.waveIndex} cleared! +$${bonus}`);
    }
  }
  updateSendButton(state);
  updateShop(state);
}

function setupControls(state) {
  if (btnSend) btnSend.addEventListener('click', () => {
    if (!state.waveActive) startWave(state);
  });
  if (btnSpeed) btnSpeed.addEventListener('click', () => {
    state.speed = state.speed === 1 ? 2 : 1;
    updateSpeedButton(state);
  });
  if (btnPause) btnPause.addEventListener('click', () => {
    state.paused = !state.paused;
    updatePauseButton(state);
  });
}

async function bootstrap() {
  const state = {
    map: null,
    lanes: [],
    tileSize: 64,
    worldW: 0,
    worldH: 0,
    coins: 0,
    lives: 0,
    waveIndex: 0,
    speed: 1,
    paused: false,
    enemies: [],
    bullets: [],
    towers: [],
    selectedTowerType: 'Archer',
    selectedTower: null,
    placing: false,
    ghost: { x: 0, y: 0, type: null, range: 0, baseRadius: BALANCE.global.baseRadius, valid: false },
    spawnQueue: new SpawnQueue(),
    waveActive: false,
    heroPlaced: false,
    heroTower: null,
    heroAura: null,
    diff,
    sandbox,
    stats: { pops: 0, damage: 0, cashSpent: 0, cashEarned: 0 },
    gameTime: 0,
    debugVisible: sandbox,
    viewScale: 1,
    viewOffsetX: 0,
    viewOffsetY: 0,
  };

  abilities.ensureState(state);

  state.onEnemyKilled = (enemy, reward) => {
    state.stats.cashEarned += reward;
    const xpGain = BALANCE.hero.xpPerPop * Math.max(1, enemy.reward);
    grantHeroXP(state, xpGain);
    updateShop(state);
  };

  state.onEnemyEscaped = () => {
    if (state.lives <= 0) {
      toast('Game Over');
      state.paused = true;
      updatePauseButton(state);
    }
  };

  try {
    const map = await loadMap(mapName);
    state.map = map;
    const baked = bakeLanes(map, { offscreen: true });
    state.lanes = baked.lanes;
    state.tileSize = baked.tileSize;
    state.worldW = baked.worldW;
    state.worldH = baked.worldH;
    const start = startStateFromMap(map);
    state.coins = sandbox ? 9999 : start.coins;
    state.lives = start.lives;
    state.waves = wavesByName(map.waveset);
  } catch (err) {
    console.error(err);
    toast('Failed to load map');
    return;
  }

  buildShop(state);
  updateShop(state);
  setupPanelInteractions(state);
  setupPlacementEvents(state);
  setupControls(state);
  attachHotkeys(state);
  updateSpeedButton(state);
  updatePauseButton(state);
  updateSendButton(state);
  resizeCanvas(state);
  window.addEventListener('resize', () => resizeCanvas(state));
  updatePanel(state);

  let lastTime = nowSeconds();

  function abilityDamage(enemy, damage, type, options = {}) {
    const dealt = applyDamage(enemy, damage, type, {
      now: state.gameTime,
      slowPct: options.slowPct,
      slowDuration: options.slowDuration,
      shatterLead: options.shatterLead,
    });
    if (dealt > 0) {
      state.stats.damage += dealt;
      if (!enemy.alive) {
        const reward = popReward(enemy.type, diff);
        state.coins += reward;
        state.stats.pops += 1;
        if (state.onEnemyKilled) state.onEnemyKilled(enemy, reward);
      }
    }
  }

  function triggerAbilityWithContext(id) {
    const ok = abilities.activate(id, state, {
      now: state.gameTime,
      tower: state.selectedTower,
      hero: state.heroTower,
      applyDamage: (enemy, dmg, type, options = {}) => abilityDamage(enemy, dmg, type, options),
    });
    if (!ok) toast('Ability not ready');
  }

  state.triggerAbility = (id) => triggerAbilityWithContext(id);

  const loop = () => {
    const now = nowSeconds();
    let frameDt = now - lastTime;
    lastTime = now;
    if (frameDt > 0.3) frameDt = 0.3;
    const scaled = state.paused ? 0 : clamp(frameDt * state.speed, 0, BALANCE.global.dtCap);
    if (!state.paused) {
      state.gameTime += scaled;
      state.spawnQueue.flush(state.gameTime, (entry) => spawnEnemy(state, entry));
      advanceEnemies(state, scaled, state.gameTime, diff);
      updateTowers(state, scaled, state.gameTime);
      updateBullets(state, scaled, state.gameTime, diff);
      abilities.update(scaled, state);
      if (state.waveActive && state.spawnQueue.isEmpty() && state.enemies.length === 0) {
        endWave(state);
      }
    }
    const scale = state.viewScale || 1;
    const offsetX = (state.viewOffsetX || 0) * scale;
    const offsetY = (state.viewOffsetY || 0) * scale;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    render(state, ctx);
    ctx.restore();
    refreshDebug(state);
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

bootstrap();
