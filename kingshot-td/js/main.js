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
  handleEnemyDeath,
} from './entities.js';
import { priceOf, getDifficulty, roundBonus } from './economy.js';
import { wavesByName, generateLateGameWave } from './waves.js';
import * as upgrades from './upgrades.js';
import * as abilities from './abilities.js';
import { generateAndLoadAssets } from './inCodeAssets.js';
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
import { updateEffects } from './visualEffects.js';
import { initAudio, playSound } from './audio.js';

// Global State
let gameState = null;
let animationFrameId = null;

// DOM Elements
const screens = {
  menu: document.getElementById('main-menu-screen'),
  mapSelect: document.getElementById('map-select-screen'),
  game: document.getElementById('game'),
  ui: document.getElementById('ui-layer'),
  pause: document.getElementById('pause-screen'),
  info: document.getElementById('info-screen')
};

const hud = {
  lives: document.getElementById('hud-lives'),
  coins: document.getElementById('hud-coins'),
  wave: document.getElementById('hud-wave'),
  shop: document.getElementById('shop'),
  panel: document.getElementById('tower-panel'),
  btnSend: document.getElementById('btn-send'),
  btnSpeed: document.getElementById('btn-speed'),
  btnPause: document.getElementById('btn-pause-game')
};

// --- EKRAN YÖNETİMİ ---
function showScreen(name) {
  Object.values(screens).forEach(el => el.classList.add('hidden'));
  
  if (name === 'menu') screens.menu.classList.remove('hidden');
  if (name === 'mapSelect') screens.mapSelect.classList.remove('hidden');
  if (name === 'info') screens.info.classList.remove('hidden');
  if (name === 'game') {
    screens.game.classList.remove('hidden');
    screens.ui.classList.remove('hidden');
  }
  if (name === 'pause') {
    screens.game.classList.remove('hidden');
    screens.ui.classList.remove('hidden'); // UI altta görünsün
    screens.pause.classList.remove('hidden');
  }
}

function toast(msg) {
  const container = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// --- ANSİKLOPEDİ (INFO) ---
function buildEncyclopedia() {
  const container = document.getElementById('info-content');
  container.innerHTML = '';

  // Kuleler Bölümü
  let html = '<div class="info-section"><h3>KULELER</h3>';
  for (const [key, def] of Object.entries(BALANCE.towers)) {
    html += `
      <div class="info-item">
        <strong>${key}</strong> (${def.price}💰)<br>
        <small>${getTowerDesc(key)}</small><br>
        Hasar: ${def.damage} | Menzil: ${def.range} | Hız: ${def.fireRate}s
      </div>
    `;
  }
  html += '</div>';

  // Düşmanlar Bölümü
  html += '<div class="info-section"><h3>DÜŞMANLAR</h3>';
  for (const [key, def] of Object.entries(BALANCE.enemies)) {
    if (key === 'traits') continue;
    let tags = '';
    if (def.hp > 100) tags += '<span class="tag">Tank</span>';
    if (def.speed > 80) tags += '<span class="tag Fast">Hızlı</span>';
    html += `
      <div class="info-item">
        <strong>${key}</strong> ${tags}<br>
        Can: ${def.hp} | Hız: ${def.speed} | Zırh: %${def.armor * 100}
      </div>
    `;
  }
  html += '</div>';
  container.innerHTML = html;
}

function getTowerDesc(type) {
  const descs = {
    Archer: 'Temel kule. Ucuz ve hızlı.',
    Cannon: 'Alan hasarı vurur. Lead düşmanları yok eder.',
    Mage: 'Yüksek büyü hasarı. Zırhlılara karşı etkili.',
    Frost: 'Düşmanları yavaşlatır. Hasarı düşüktür.',
    Tesla: 'Zincirleme elektrik saldırısı. Kalabalıklar için ideal.',
    Hero: 'Seviye atladıkça güçlenen özel birim.'
  };
  return descs[type] || 'Bilinmeyen kule.';
}

// --- OYUN KONTROLLERİ ---
function togglePause() {
  if (!gameState) return;
  gameState.paused = !gameState.paused;
  
  if (gameState.paused) {
    showScreen('pause');
    hud.btnPause.textContent = '▶';
  } else {
    showScreen('game'); // Pause ekranını gizle, oyunu göster
    hud.btnPause.textContent = 'II';
  }
}

function quitGame() {
  gameState = null;
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  showScreen('menu');
}

function restartGame() {
  if (!gameState) return;
  const mapName = gameState.mapName; // Harita ismini sakla
  quitGame(); // Önce temizle
  startGame(mapName); // Yeniden başlat
}

// --- OYUN DÖNGÜSÜ VE MANTIĞI ---
async function startGame(mapName) {
  initAudio();
  showScreen('game');
  
  // State Başlatma
  const state = {
    mapName,
    map: null,
    lanes: [],
    tileSize: 64,
    worldW: 0, worldH: 0,
    coins: 0, lives: 0, waveIndex: 0,
    speed: 1, paused: false,
    enemies: [], bullets: [], towers: [],
    selectedTower: null,
    placing: false,
    ghost: { x: 0, y: 0, type: null, valid: false },
    spawnQueue: new SpawnQueue(),
    waveActive: false,
    heroPlaced: false, heroTower: null, heroAura: null,
    gameTime: 0,
    assets: await generateAndLoadAssets(),
    clientToWorld: clientToWorldFactory(getViewport, 1, 1),
    dev: { freePlacement: false, infiniteLives: false, unlockAll: false },
    abilities: { unlocked: new Set(), cooldowns: {}, actives: {} },
    diff: getDifficulty(), // balance.js'den zorluk
    stats: { pops: 0, damage: 0, cashSpent: 0 }
  };

  gameState = state;

  // Harita Yükleme
  try {
    const map = await loadMap(mapName);
    state.map = map;
    const baked = bakeLanes(map, { offscreen: true });
    state.lanes = baked.lanes;
    state.tileSize = baked.tileSize;
    state.worldW = baked.worldW;
    state.worldH = baked.worldH;
    
    // Başlangıç değerleri
    const startVals = startStateFromMap(map);
    state.coins = startVals.coins;
    state.lives = startVals.lives;
    state.waves = wavesByName(map.waveset);
    
    // Buildable/Path setleri
    const buildableKeys = [];
    if (map.buildable) {
        map.buildable.forEach(p => {
             const k = Math.round(p[0]) + ',' + Math.round(p[1]);
             buildableKeys.push(k);
        });
    }
    state.buildableSet = new Set(buildableKeys);
    
    // Path tilelarını hesapla (placement kontrolü için)
    state.pathTiles = new Set();
    map.paths.forEach(path => {
        path.forEach(pt => {
            state.pathTiles.add(Math.round(pt[0]) + ',' + Math.round(pt[1]));
        });
    });
    
    refreshViewport(state);
  } catch (e) {
    console.error(e);
    toast('Harita yüklenemedi!');
    quitGame();
    return;
  }

  buildShop(state);
  updateHUD(state);
  
  let lastTime = nowSeconds();

  const loop = () => {
    if (!gameState) return; // Oyun bittiyse dur
    
    const now = nowSeconds();
    let dt = now - lastTime;
    lastTime = now;
    dt = Math.min(dt, 0.2); // Lag spike koruması

    // Oyun mantığı (Pause değilse)
    if (!state.paused) {
       const scaledDt = dt * state.speed;
       state.gameTime += scaledDt;
       
       // Efektler
       updateEffects(scaledDt);
       abilities.update(scaledDt, state);

       // Spawn
       state.spawnQueue.flush(state.gameTime, (entry) => {
          spawnEnemy(state, entry);
       });

       // Varlık güncellemeleri
       advanceEnemies(state, scaledDt, state.gameTime, state.diff);
       updateTowers(state, scaledDt, state.gameTime);
       updateBullets(state, scaledDt, state.gameTime, state.diff);

       // Dalga bitiş kontrolü
       if (state.waveActive && state.spawnQueue.isEmpty() && state.enemies.length === 0) {
           endWave(state);
       }
       
       // Oyun Bitti Kontrolü
       if (state.lives <= 0 && !state.dev.infiniteLives) {
           toast("OYUN BİTTİ!");
           state.paused = true;
           showScreen('pause'); // Pause ekranını aç ama belki "Game Over" özel ekranı yapılabilir
       }
    }

    render(state, ctx, state.assets);
    updateHUD(state);
    
    animationFrameId = requestAnimationFrame(loop);
  };
  
  loop();
}

// --- YARDIMCI FONKSİYONLAR ---

function spawnEnemy(state, entry) {
    const laneIndex = entry.lane % state.lanes.length;
    const lane = state.lanes[laneIndex];
    const start = lane[0];
    const enemy = createEnemy(entry.type, laneIndex, start, {
        traits: entry.traits,
        hpMul: entry.hpMul,
        wave: state.waveIndex,
        diff: state.diff
    });
    enemy.t = -Math.random() * 14; // Biraz dağıt
    state.enemies.push(enemy);
}

function endWave(state) {
    state.waveActive = false;
    const bonus = roundBonus(state.waveIndex, state.diff);
    if (bonus > 0) {
        state.coins += bonus;
        state.stats.cashEarned += bonus;
        toast(`Dalga Tamamlandı! +${bonus}💰`);
    }
    updateHUD(state);
    hud.btnSend.disabled = false;
    playSound('wave-clear'); // Varsa çal
}

function buildShop(state) {
    hud.shop.innerHTML = '';
    for (const type of Object.keys(BALANCE.towers)) {
        const btn = document.createElement('div');
        btn.className = 'tower-shop-btn';
        btn.innerHTML = `
            <strong>${type}</strong>
            <span class="price">${priceOf(type)}💰</span>
        `;
        btn.onclick = () => {
            if (state.coins >= priceOf(type) || state.dev.freePlacement) {
                state.selectedTowerType = type;
                state.placing = true;
                state.ghost.type = type;
                state.ghost.valid = false;
                selectTower(state, null); // Panel kapat
            } else {
                toast('Yetersiz Bakiye!');
                playSound('error');
            }
        };
        hud.shop.appendChild(btn);
    }
}

function updateHUD(state) {
    hud.lives.textContent = Math.floor(state.lives);
    hud.coins.textContent = Math.floor(state.coins);
    hud.wave.textContent = "Dalga " + state.waveIndex;
    hud.btnSend.disabled = state.waveActive;
    hud.btnSpeed.textContent = "Hız: " + state.speed + "x";
    
    // Shop butonlarını güncelle (paran yetiyor mu?)
    const shopBtns = hud.shop.children;
    let idx = 0;
    for (const type of Object.keys(BALANCE.towers)) {
        const price = priceOf(type);
        const btn = shopBtns[idx++];
        if (btn) {
            if (state.coins < price && !state.dev.freePlacement) btn.classList.add('disabled');
            else btn.classList.remove('disabled');
            // Hero kontrolü
            if (type === 'Hero' && state.heroPlaced) btn.classList.add('disabled');
        }
    }
    
    // Panel güncelleme
    updatePanel(state);
}

function selectTower(state, tower) {
    state.towers.forEach(t => t.selected = false);
    state.selectedTower = tower;
    if (tower) tower.selected = true;
    
    const panel = hud.panel;
    if (!tower) {
        panel.classList.remove('active');
        return;
    }
    
    panel.classList.add('active');
    panel.innerHTML = `
        <h3>${tower.type} (Lv.${tower.hero ? tower.heroLevel : '1'})</h3>
        <div>Hasar: ${Math.round(tower.damage)}</div>
        <div>Menzil: ${Math.round(tower.range)}</div>
        <div style="margin-top:5px">Öncelik: <button id="btn-prio" class="btn btn-small" style="padding:2px 6px; font-size:0.8rem">${tower.priority}</button></div>
        <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:5px">
            <div class="upgrade-row" id="upg-row"></div>
        </div>
        <button id="btn-sell" class="btn btn-danger btn-small" style="width:100%; margin-top:10px">Sat (${tower.sellValue}💰)</button>
    `;
    
    // Event Listeners for Panel
    panel.querySelector('#btn-prio').onclick = () => {
        cyclePriority(tower);
        playSound('build'); // Klik sesi
    };
    panel.querySelector('#btn-sell').onclick = () => {
        state.towers = state.towers.filter(t => t !== tower);
        state.coins += tower.sellValue;
        if (tower.hero) { state.heroPlaced = false; state.heroTower = null; }
        playSound('build'); // Satma sesi (aynı olabilir)
        selectTower(state, null);
        createExplosionEffect(tower.x, tower.y); // Görsel geri bildirim
    };
    
    // Upgrade Butonları
    const upgRow = panel.querySelector('#upg-row');
    if (!tower.hero) {
        ['A', 'B'].forEach(path => {
            const tier = tower.tiers[path];
            const info = upgrades.getUpgradeInfo(tower.type, path, tier + 1);
            const btn = document.createElement('button');
            btn.className = 'upgrade-btn btn';
            if (!info) {
                btn.textContent = "MAX";
                btn.disabled = true;
            } else {
                btn.innerHTML = `${path}${tier+1}<br>${info.price}💰`;
                const check = upgrades.canApplyUpgrade(state, tower, path);
                if (!check.ok) btn.disabled = true;
                btn.onclick = () => {
                    if (upgrades.applyUpgrade(state, tower, path)) {
                        playSound('build');
                        selectTower(state, tower); // Refresh
                    }
                };
            }
            upgRow.appendChild(btn);
        });
    } else {
        upgRow.innerHTML = "<small>Kahraman otomatik seviye atlar.</small>";
    }
}

function createExplosionEffect(x, y) {
    // Basit bir duman efekti visualEffects.js üzerinden çağrılabilir
    // Şimdilik boş, visualEffects'e eklenebilir.
}

// --- INPUT HANDLERS ---
function setupInputs() {
    // Mouse Move (Yerleştirme Hayaleti)
    screens.game.onpointermove = (ev) => {
        if (!gameState || !gameState.placing) return;
        const pos = gameState.clientToWorld(ev.clientX, ev.clientY);
        
        // Grid Snap
        const tx = Math.floor(pos.x / gameState.tileSize);
        const ty = Math.floor(pos.y / gameState.tileSize);
        const snapX = (tx + 0.5) * gameState.tileSize;
        const snapY = (ty + 0.5) * gameState.tileSize;
        
        gameState.ghost.x = snapX;
        gameState.ghost.y = snapY;
        
        // Validasyon (Basitçe mesafe ve path kontrolü, detaylısı entities.js'de var ama burada basit check)
        gameState.ghost.valid = true; 
        // Detaylı validasyon placeTower içinde yapılıyor, burada sadece görsel güncelliyoruz
    };
    
    // Mouse Click (Yerleştirme / Seçme)
    screens.game.onpointerdown = (ev) => {
        if (!gameState) return;
        // Sağ tık iptal
        if (ev.button === 2) {
            gameState.placing = false;
            gameState.ghost.type = null;
            return;
        }
        
        const pos = gameState.clientToWorld(ev.clientX, ev.clientY);
        
        if (gameState.placing) {
            // Kule Koy
            if (placeTowerLogic(gameState, gameState.ghost.x, gameState.ghost.y)) {
                if (!ev.shiftKey) {
                    gameState.placing = false;
                    gameState.ghost.type = null;
                }
            }
        } else {
            // Kule Seç
            let picked = null;
            let minDist = 30;
            gameState.towers.forEach(t => {
                const d = Math.hypot(t.x - pos.x, t.y - pos.y);
                if (d < minDist) { minDist = d; picked = t; }
            });
            selectTower(gameState, picked);
        }
    };
}

function placeTowerLogic(state, x, y) {
    // Basit validasyon
    if (x < 0 || y < 0 || x > state.worldW || y > state.worldH) return false;
    // Para kontrolü
    const price = priceOf(state.selectedTowerType);
    if (state.coins < price && !state.dev.freePlacement) return false;
    
    // Üst üste binme kontrolü
    for (const t of state.towers) {
        if (Math.hypot(t.x - x, t.y - y) < 10) return false;
    }
    
    // Path kontrolü (Basit) - Gelişmişi için map verisine bakmak lazım
    const key = Math.floor(x/64) + ',' + Math.floor(y/64);
    if (state.pathTiles && state.pathTiles.has(key)) {
        toast("Yola inşa edilemez!");
        playSound('error');
        return false;
    }

    // İnşa et
    const t = createTower(state.selectedTowerType, x, y);
    state.towers.push(t);
    if (!state.dev.freePlacement) state.coins -= price;
    if (t.hero) { state.heroPlaced = true; state.heroTower = t; }
    
    playSound('build');
    createExplosionEffect(x, y);
    return true;
}

// --- INITIALIZATION ---
window.onload = () => {
    // Buton Eventleri
    document.getElementById('btn-start-menu').onclick = () => showScreen('mapSelect');
    document.getElementById('btn-info-menu').onclick = () => { buildEncyclopedia(); showScreen('info'); };
    document.getElementById('btn-back-menu').onclick = () => showScreen('menu');
    document.getElementById('btn-close-info').onclick = () => showScreen('menu');
    
    // Harita Kartları
    document.querySelectorAll('.card[data-map]').forEach(el => {
        el.onclick = () => startGame(el.dataset.map);
    });
    
    // Oyun İçi Butonlar
    hud.btnSend.onclick = () => {
        if (gameState && !gameState.waveActive) {
             // Bir sonraki dalgayı başlat (waves.js'den lojiği çekmemiz lazım veya main içinde startWave kopyası)
             // Burada main.js içindeki startWave logicini entegre ediyoruz:
             const next = gameState.waveIndex + 1;
             let groups = gameState.waves[next];
             if (!groups) {
                 groups = generateLateGameWave(next);
                 gameState.waves[next] = groups;
             }
             gameState.waveIndex = next;
             gameState.waveActive = true;
             let at = gameState.gameTime + 0.5;
             groups.forEach(g => {
                 for(let i=0; i<g.count; i++){
                     gameState.spawnQueue.add({
                         at, type: g.type, lane: g.lane, traits: g.traits, hpMul: g.hpMul
                     });
                     at += g.gap;
                 }
             });
             playSound('wave-start');
             updateHUD(gameState);
        }
    };
    
    hud.btnSpeed.onclick = () => {
        if (!gameState) return;
        const speeds = [1, 2, 4, 6, 8, 10];
        let idx = speeds.indexOf(gameState.speed);
        gameState.speed = speeds[(idx + 1) % speeds.length];
        updateHUD(gameState);
    };
    
    hud.btnPause.onclick = togglePause;
    
    // Pause Menü Butonları
    document.getElementById('btn-resume').onclick = togglePause;
    document.getElementById('btn-restart').onclick = restartGame;
    document.getElementById('btn-quit').onclick = quitGame;
    
    // Klavye
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' || ev.key === 'p' || ev.key === 'P') {
            if (gameState) {
                if (gameState.placing) {
                    gameState.placing = false; // Önce placing iptal
                    gameState.ghost.type = null;
                } else {
                    togglePause();
                }
            }
        }
    });
    
    setupInputs();
    showScreen('menu');
};

// Resize Handler
window.onresize = () => {
    if (gameState) refreshViewport(gameState);
};
