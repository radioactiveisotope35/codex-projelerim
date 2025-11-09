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
  dist2,
  SpawnQueue,
  clamp,
  setupViewport,
  getViewport,
  clientToWorldFactory,
  throttle,
  pointToPolylineDistance,
} from './utils.js';

const params = new URLSearchParams(globalThis.location?.search || '');
const mapName = params.get('map') || 'meadow';
const sandbox = params.get('sandbox') === '1';
const devParam = params.get('dev') === '1';
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
let panelInfoEl = null;
let devTools = null;

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
  setTimeout(() => entry.remove(), duration);
}

function refreshViewport(state) {
  if (!canvas) return;
  setupViewport(canvas);
  if (state) {
    const worldW = state.worldW || 1;
    const worldH = state.worldH || 1;
    state.clientToWorld = clientToWorldFactory(getViewport, worldW, worldH);
  }
}

function setGameSpeed(state, value) {
  const next = clamp(Math.round(value), 1, 10);
  if (state.speed !== next) {
    state.speed = next;
  }
  updateSpeedButton(state);
  if (devTools) devTools.forceUpdate();
}

function updateShop(state) {
  if (!shopEl) return;
  for (const card of shopEl.querySelectorAll('[data-type]')) {
    const type = card.dataset.type;
    const price = priceOf(type);
    const disabled = (!sandbox && !state.dev.freePlacement && state.coins < price) || (type === 'Hero' && state.heroPlaced);
    card.classList.toggle('disabled', disabled);
    const priceEl = card.querySelector('.price');
    if (priceEl) priceEl.textContent = `$${price}`;
  }
}

function updateSpeedButton(state) {
  if (!btnSpeed) return;
  btnSpeed.textContent = `Speed x${state.speed}`;
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

function updatePanel(state) {
  if (!panelInfoEl) return;
  const tower = state.selectedTower;
  if (!tower) {
    panelInfoEl.innerHTML = '<p>Select a tower for details.</p>';
    return;
  }
  const tiers = `A${tower.tiers.A} / B${tower.tiers.B}`;
  const lines = [
    `<h3>${tower.type} <small>Tier ${tiers}</small></h3>`,
    `<p>Range: ${Math.round(tower.range)} | Damage: ${Math.round(tower.damage)} | Fire rate: ${(tower.fireRate).toFixed(2)}s</p>`,
    `<p>Priority: <button data-action="priority">${tower.priority}</button></p>`,
    `<p>Sell refund: $${tower.sellValue}</p>`,
    '<div class="upgrades"><strong>Upgrades</strong><div class="paths"></div></div>',
    '<div class="abilities"><strong>Abilities</strong><div class="ability-buttons"></div></div>',
    '<p><button data-action="sell">Sell</button></p>',
  ];
  panelInfoEl.innerHTML = lines.join('');
  const pathContainer = panelInfoEl.querySelector('.paths');
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
      let can = upgrades.canApplyUpgrade(state, tower, path);
      if (state.dev.unlockAll) {
        can = { ok: true, info, tier };
      }
      btn.disabled = !can.ok;
      if (!can.ok && can.reason) btn.title = can.reason;
    }
    pathContainer.appendChild(btn);
  }
  const abilityWrap = panelInfoEl.querySelector('.ability-buttons');
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
        if (devTools) devTools.forceUpdate();
        toast('Tower sold');
      }
    } else if (action === 'priority' && state.selectedTower) {
      const newPrio = cyclePriority(state.selectedTower);
      toast(`Priority: ${newPrio}`);
      updatePanel(state);
    } else if (action === 'upgrade' && state.selectedTower) {
      const path = btn.dataset.path;
      const tier = state.selectedTower.tiers[path] + 1;
      const info = upgrades.getUpgradeInfo(state.selectedTower.type, path, tier);
      if (!info) {
        toast('No upgrade available');
        return;
      }
      if (state.dev.unlockAll) {
        const prevSandbox = state.sandbox;
        const prevCoins = state.coins;
        state.sandbox = true;
        state.coins = Math.max(state.coins, info.price);
        const ok = upgrades.applyUpgrade(state, state.selectedTower, path);
        state.sandbox = prevSandbox;
        state.coins = prevCoins;
        if (ok) {
          updatePanel(state);
        } else {
          toast('Upgrade failed');
        }
      } else {
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
      }
      if (devTools) devTools.forceUpdate();
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
    if (ev.key === 'F9') {
      state.dev.panelOpen = !state.dev.panelOpen;
      if (devTools) devTools.setOpen(state.dev.panelOpen);
      ev.preventDefault();
    }
    if (ev.key === '[') {
      setGameSpeed(state, state.speed - 1);
    }
    if (ev.key === ']') {
      setGameSpeed(state, state.speed + 1);
    }
    if (/^[0-9]$/.test(ev.key)) {
      const target = ev.key === '0' ? 10 : Number(ev.key);
      setGameSpeed(state, target);
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
    if (!state.clientToWorld) return;
    const tileSize = state.tileSize || 1;
    const pos = state.clientToWorld(ev.clientX, ev.clientY);
    const tileX = Math.round(pos.x / tileSize - 0.5);
    const tileY = Math.round(pos.y / tileSize - 0.5);
    const snapX = (tileX + 0.5) * tileSize;
    const snapY = (tileY + 0.5) * tileSize;
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
    if (!state.clientToWorld) return;
    const pos = state.clientToWorld(ev.clientX, ev.clientY);
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
      if (devTools) devTools.forceUpdate();
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

function tileKey(tx, ty) {
  const ix = Math.round(Number(tx));
  const iy = Math.round(Number(ty));
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
  return `${ix},${iy}`;
}

function buildPathTileSet(paths) {
  const set = new Set();
  if (!Array.isArray(paths)) return set;
  for (const lane of paths) {
    if (!Array.isArray(lane) || lane.length === 0) continue;
    let [cx, cy] = lane[0] || [];
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const firstKey = tileKey(cx, cy);
    if (firstKey) set.add(firstKey);
    for (let i = 1; i < lane.length; i++) {
      const point = lane[i] || [];
      const nx = Number(point[0]);
      const ny = Number(point[1]);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
      const stepX = Math.sign(nx - cx);
      const stepY = Math.sign(ny - cy);
      while (cx !== nx || cy !== ny) {
        if (cx !== nx) cx += stepX;
        if (cy !== ny) cy += stepY;
        const key = tileKey(cx, cy);
        if (key) set.add(key);
      }
    }
  }
  return set;
}

function validatePlacement(state, x, y, type) {
  const radius = BALANCE.global.baseRadius;
  if (!type) return { ok: false, reason: 'No tower selected' };
  if (x < radius || y < radius || x > state.worldW - radius || y > state.worldH - radius) {
    return { ok: false, reason: 'Bounds' };
  }
  const tileSize = state.tileSize || 1;
  const tileX = Math.round(x / tileSize - 0.5);
  const tileY = Math.round(y / tileSize - 0.5);
  const key = tileKey(tileX, tileY);
  if (!key) {
    return { ok: false, reason: 'Bounds' };
  }
  const centerX = (tileX + 0.5) * tileSize;
  const centerY = (tileY + 0.5) * tileSize;
  const buildableSet = state.buildableSet;
  const hasBuildable = buildableSet instanceof Set && buildableSet.size > 0;
  const restrict = state.map?.restrictPlacement === true;
  const requireWhitelist = restrict && hasBuildable;
  const onWhitelist = hasBuildable && buildableSet.has(key);
  const onPath = state.pathTiles?.has(key);
  if (!state.dev.freePlacement) {
    if (onPath) {
      return { ok: false, reason: 'Path' };
    }
    if (!onWhitelist) {
      const lanes = Array.isArray(state.lanes) ? state.lanes : [];
      const clearance = (state.tileSize || 1) * (BALANCE.global.pathClearFactor ?? 0);
      if (clearance > 0 && lanes.length > 0) {
        const threshold = radius + clearance;
        let tooClose = false;
        for (const lane of lanes) {
          if (!Array.isArray(lane) || lane.length < 2) continue;
          const dist = pointToPolylineDistance(centerX, centerY, lane);
          if (dist < threshold) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) {
          return { ok: false, reason: 'Too close to path' };
        }
      }
    }
    if (requireWhitelist && !onWhitelist) {
      return { ok: false, reason: 'Not a buildable tile' };
    }
  }
  for (const tower of state.towers) {
    if (dist2(x, y, tower.x, tower.y) < (radius * 2) ** 2) {
      return { ok: false, reason: 'Overlap' };
    }
  }
  if (type === 'Hero' && state.heroPlaced) {
    return { ok: false, reason: 'Hero already placed' };
  }
  if (!state.dev.freePlacement && !sandbox) {
    const price = priceOf(type);
    if (state.coins < price) return { ok: false, reason: 'Coins' };
  }
  return { ok: true, tileX, tileY, centerX, centerY };
}

function placeTower(state, x, y, type) {
  const valid = validatePlacement(state, x, y, type);
  if (!valid.ok) {
    toast(valid.reason);
    return false;
  }
  const placeX = valid.centerX ?? x;
  const placeY = valid.centerY ?? y;
  const tower = createTower(type, placeX, placeY);
  state.towers.push(tower);
  if (!sandbox && !state.dev.freePlacement) {
    const cost = priceOf(type);
    state.coins -= cost;
    state.stats.cashSpent += cost;
  }
  if (tower.hero) {
    state.heroPlaced = true;
    state.heroTower = tower;
  }
  selectTower(state, tower);
  updateShop(state);
  if (devTools) devTools.forceUpdate();
  return true;
}

function buildDevPanel(state, setSpeed, spawnTests, skipWaveFn, clearEnemiesFn) {
  if (!panelEl) return null;
  const container = document.createElement('div');
  container.id = 'dev-panel';
  container.style.marginTop = '12px';
  container.style.padding = '10px';
  container.style.background = 'rgba(0,0,0,0.55)';
  container.style.color = '#fff';
  container.style.borderRadius = '8px';
  container.style.fontSize = '12px';
  container.style.display = 'none';
  container.style.gap = '8px';

  const title = document.createElement('div');
  title.textContent = 'Dev Cheats (F9)';
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';
  container.appendChild(title);

  const coinsRow = document.createElement('div');
  coinsRow.style.display = 'flex';
  coinsRow.style.flexWrap = 'wrap';
  coinsRow.style.gap = '6px';
  coinsRow.style.alignItems = 'center';
  const coinsLabel = document.createElement('span');
  coinsRow.appendChild(coinsLabel);
  const add500 = document.createElement('button');
  add500.textContent = '+500';
  add500.addEventListener('click', () => {
    state.coins += 500;
    updateShop(state);
    sync();
  });
  coinsRow.appendChild(add500);
  const add5000 = document.createElement('button');
  add5000.textContent = '+5000';
  add5000.addEventListener('click', () => {
    state.coins += 5000;
    updateShop(state);
    sync();
  });
  coinsRow.appendChild(add5000);
  const setInput = document.createElement('input');
  setInput.type = 'number';
  setInput.placeholder = 'Coins';
  setInput.style.width = '72px';
  const setBtn = document.createElement('button');
  setBtn.textContent = 'Set';
  setBtn.addEventListener('click', () => {
    const value = parseInt(setInput.value, 10);
    if (Number.isFinite(value) && value >= 0) {
      state.coins = value;
      updateShop(state);
      sync();
    }
  });
  coinsRow.appendChild(setInput);
  coinsRow.appendChild(setBtn);
  container.appendChild(coinsRow);

  const speedRow = document.createElement('div');
  speedRow.style.display = 'flex';
  speedRow.style.alignItems = 'center';
  speedRow.style.gap = '8px';
  const speedLabel = document.createElement('span');
  speedRow.appendChild(speedLabel);
  const speedSlider = document.createElement('input');
  speedSlider.type = 'range';
  speedSlider.min = '1';
  speedSlider.max = '10';
  speedSlider.value = String(state.speed);
  speedSlider.addEventListener('input', () => {
    setSpeed(state, Number(speedSlider.value));
    sync();
  });
  speedRow.appendChild(speedSlider);
  container.appendChild(speedRow);

  const roundRow = document.createElement('div');
  roundRow.style.display = 'flex';
  roundRow.style.flexWrap = 'wrap';
  roundRow.style.gap = '6px';
  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip Wave';
  skipBtn.addEventListener('click', () => {
    skipWaveFn(state);
    sync();
  });
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear Enemies';
  clearBtn.addEventListener('click', () => {
    clearEnemiesFn(state);
    sync();
  });
  roundRow.appendChild(skipBtn);
  roundRow.appendChild(clearBtn);
  container.appendChild(roundRow);

  const togglesRow = document.createElement('div');
  togglesRow.style.display = 'flex';
  togglesRow.style.flexWrap = 'wrap';
  togglesRow.style.gap = '6px';
  const unlockBtn = document.createElement('button');
  const freeBtn = document.createElement('button');
  const livesBtn = document.createElement('button');
  unlockBtn.addEventListener('click', () => {
    state.dev.unlockAll = !state.dev.unlockAll;
    updatePanel(state);
    sync();
  });
  freeBtn.addEventListener('click', () => {
    state.dev.freePlacement = !state.dev.freePlacement;
    updateShop(state);
    sync();
  });
  livesBtn.addEventListener('click', () => {
    state.dev.infiniteLives = !state.dev.infiniteLives;
    sync();
  });
  togglesRow.appendChild(unlockBtn);
  togglesRow.appendChild(freeBtn);
  togglesRow.appendChild(livesBtn);
  container.appendChild(togglesRow);

  const spawnRow = document.createElement('div');
  spawnRow.style.display = 'flex';
  spawnRow.style.flexWrap = 'wrap';
  spawnRow.style.gap = '6px';
  const spawnButtons = [
    ['Test Grunts', []],
    ['Test Camo', ['camo']],
    ['Test Lead', ['lead']],
    ['Test Fortified', ['fortified']],
  ];
  for (const [label, traits] of spawnButtons) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      spawnTests(state, traits);
    });
    spawnRow.appendChild(btn);
  }
  container.appendChild(spawnRow);

  function updateToggle(button, text, active) {
    button.textContent = `${text}: ${active ? 'ON' : 'OFF'}`;
    button.classList.toggle('active', active);
  }

  function sync() {
    coinsLabel.textContent = `Coins: ${Math.floor(state.coins)}`;
    speedLabel.textContent = `Speed x${state.speed}`;
    speedSlider.value = String(state.speed);
    updateToggle(unlockBtn, 'Unlock Upgrades', state.dev.unlockAll);
    updateToggle(freeBtn, 'Free Placement', state.dev.freePlacement);
    updateToggle(livesBtn, 'Infinite Lives', state.dev.infiniteLives);
  }

  const throttled = throttle(sync, 80);
  sync();

  return {
    el: container,
    setOpen(open) {
      container.style.display = open ? 'block' : 'none';
    },
    toggle() {
      this.setOpen(container.style.display !== 'block');
    },
    update() {
      throttled();
    },
    forceUpdate: sync,
  };
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
  if (devTools) devTools.forceUpdate();
}

function devSkipWave(state) {
  if (!state.waveActive) {
    const next = state.waveIndex + 1;
    if (!state.waves[next]) {
      toast('No more waves to skip');
      return;
    }
    startWave(state);
  }
  state.spawnQueue.clear();
  state.enemies.length = 0;
  endWave(state);
}

function devClearEnemies(state) {
  if (state.enemies.length) {
    state.enemies.length = 0;
  }
  if (state.waveActive && state.spawnQueue.isEmpty()) {
    endWave(state);
  }
}

function spawnTestGroup(state, traits) {
  const spawnTraits = traits.slice();
  let type = 'Grunt';
  if (spawnTraits.includes('fortified')) type = 'Shielded';
  else if (spawnTraits.includes('camo')) type = 'Runner';
  else if (spawnTraits.includes('lead')) type = 'Grunt';
  const startAt = state.gameTime + 0.3;
  for (let i = 0; i < 10; i++) {
    state.spawnQueue.add({
      at: startAt + i * 0.25,
      type,
      lane: 0,
      traits: spawnTraits,
      hpMul: 1,
    });
  }
  state.waveActive = true;
  updateSendButton(state);
}

function setupControls(state) {
  if (btnSend) btnSend.addEventListener('click', () => {
    if (!state.waveActive) startWave(state);
  });
  if (btnSpeed) btnSpeed.addEventListener('click', () => {
    setGameSpeed(state, state.speed === 1 ? 2 : 1);
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
    buildableSet: new Set(),
    pathTiles: new Set(),
    diff,
    sandbox,
    stats: { pops: 0, damage: 0, cashSpent: 0, cashEarned: 0 },
    gameTime: 0,
    debugVisible: sandbox,
    clientToWorld: clientToWorldFactory(getViewport, 1, 1),
    dev: {
      panelOpen: sandbox || devParam,
      freePlacement: false,
      infiniteLives: false,
      unlockAll: false,
    },
  };

  abilities.ensureState(state);
  refreshViewport(state);

  state.onEnemyKilled = (enemy, reward) => {
    state.stats.cashEarned += reward;
    const xpGain = BALANCE.hero.xpPerPop * Math.max(1, enemy.reward);
    grantHeroXP(state, xpGain);
    updateShop(state);
    if (devTools) devTools.forceUpdate();
  };

  state.onEnemyEscaped = () => {
    if (state.dev.infiniteLives) return;
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
    const buildable = Array.isArray(map.buildable) ? map.buildable : [];
    state.map.buildable = buildable;
    const buildableKeys = [];
    for (const entry of buildable) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const key = tileKey(entry[0], entry[1]);
        if (key) buildableKeys.push(key);
      } else if (typeof entry === 'string') {
        const [sx, sy] = entry.split(',');
        const key = tileKey(sx, sy);
        if (key) buildableKeys.push(key);
      }
    }
    state.buildableSet = new Set(buildableKeys);
    state.pathTiles = buildPathTileSet(map.paths);
    state.lanes = baked.lanes;
    state.tileSize = baked.tileSize;
    state.worldW = baked.worldW;
    state.worldH = baked.worldH;
    const start = startStateFromMap(map);
    const minPrice = Math.min(...Object.values(BALANCE.towers).map((t) => t.price));
    state.coins = sandbox ? 9999 : Math.max(start.coins, minPrice);
    state.lives = start.lives;
    state.waves = wavesByName(map.waveset);
    refreshViewport(state);
  } catch (err) {
    console.error(err);
    toast('Failed to load map');
    return;
  }

  if (panelEl) {
    panelEl.innerHTML = '';
    panelInfoEl = document.createElement('div');
    panelInfoEl.className = 'tower-info';
    panelEl.appendChild(panelInfoEl);
  }
  devTools = buildDevPanel(state, setGameSpeed, spawnTestGroup, devSkipWave, devClearEnemies);
  if (devTools && panelEl) {
    panelEl.appendChild(devTools.el);
    devTools.setOpen(state.dev.panelOpen);
    devTools.forceUpdate();
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
  updatePanel(state);
  if (devTools) devTools.forceUpdate();
  window.addEventListener('resize', () => refreshViewport(state));

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
    let rawDt = now - lastTime;
    lastTime = now;
    rawDt = Math.min(rawDt, 0.25);
    const scaled = state.paused
      ? 0
      : Math.min(BALANCE.global.dtCap || 0.05, rawDt) * state.speed;
    if (!state.paused) {
      state.gameTime += scaled;
      state.spawnQueue.flush(state.gameTime, (entry) => spawnEnemy(state, entry));
      const livesBefore = state.lives;
      advanceEnemies(state, scaled, state.gameTime, diff);
      if (state.dev.infiniteLives && state.lives < livesBefore) {
        state.lives = livesBefore;
      }
      updateTowers(state, scaled, state.gameTime);
      updateBullets(state, scaled, state.gameTime, diff);
      abilities.update(scaled, state);
      if (state.waveActive && state.spawnQueue.isEmpty() && state.enemies.length === 0) {
        endWave(state);
      }
    }
    render(state, ctx);
    refreshDebug(state);
    if (devTools) devTools.update();
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

bootstrap();
