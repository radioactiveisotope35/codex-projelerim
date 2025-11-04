/**
 * scenes.js
 * All high level scenes: Menu, Map selection, Gameplay, Victory, Defeat, Research.
 * How to extend: create additional scene classes and register them in createScenes().
 */

import { loadMap } from './map.js';
import { WaveManager } from './waves.js';
import { screenToWorld } from './util.js';
import { getTowerCost } from './towers.js';
import { BAL } from './balance.js';

function makeOverlay() {
  const el = document.createElement('div');
  el.className = 'scene-overlay';
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    background: 'rgba(15,24,18,0.92)',
    color: '#fff',
    zIndex: 30,
    padding: '1.5rem',
    textAlign: 'center',
  });
  return el;
}

function makeButton(label) {
  const btn = document.createElement('button');
  Object.assign(btn.style, {
    background: '#8C5A3C',
    color: '#fff',
    padding: '0.8rem 1.8rem',
    borderRadius: '1.2rem',
    border: 'none',
    fontSize: '1.1rem',
    fontWeight: '600',
    boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
  });
  btn.textContent = label;
  return btn;
}

class BaseScene {
  constructor(game) {
    this.game = game;
    this.overlay = null;
  }
  enter() {}
  exit() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
  update() {}
  render() {}
}

class MenuScene extends BaseScene {
  enter() {
    super.enter();
    this.game.ui.setGameplayVisible(false);
    const overlay = makeOverlay();
    overlay.innerHTML = `<h1 style="font-size:2.2rem;margin:0;">KingShot TD</h1><p style="max-width:320px;">Defend the kingdom with a tap-friendly low-poly arsenal. Place towers, upgrade them, and hold off waves of raiders.</p>`;
    const play = makeButton('Play');
    play.addEventListener('click', () => this.game.goto('map-select'));
    const research = makeButton('Research');
    research.addEventListener('click', () => this.game.goto('research'));
    const settings = makeButton('Settings');
    settings.addEventListener('click', () => alert('Sound toggles coming soon!'));
    overlay.append(play, research, settings);
    document.body.appendChild((this.overlay = overlay));
  }
}

class MapSelectScene extends BaseScene {
  enter() {
    super.enter();
    this.game.ui.setGameplayVisible(false);
    const overlay = makeOverlay();
    overlay.innerHTML = `<h2 style="margin-bottom:0.3rem;">Select a Battlefield</h2>`;
    const maps = [
      { key: 'meadow', name: 'Meadow', desc: 'Easy • Rolling farms', waves: 20 },
      { key: 'canyon', name: 'Canyon', desc: 'Normal • Tight turns', waves: 20 },
      { key: 'crossroads', name: 'Crossroads', desc: 'Hard • Dual lanes', waves: 20 },
    ];
    const container = document.createElement('div');
    Object.assign(container.style, {
      display: 'grid',
      gap: '1rem',
    });
    maps.forEach((map) => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        background: 'rgba(255,255,255,0.08)',
        padding: '1rem',
        borderRadius: '1rem',
        width: 'min(280px, 80vw)',
      });
      const btn = makeButton(`${map.name} • ${map.desc}`);
      btn.style.width = '100%';
      btn.addEventListener('click', () => this.startMap(map));
      const stars = this.game.research.profile.completed[map.name]?.stars || 0;
      const crowns = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      card.innerHTML = `<strong style="display:block;font-size:1.2rem;margin-bottom:0.4rem;">${map.name}</strong><div style="margin-bottom:0.4rem;opacity:0.8;">${map.desc}</div><div style="margin-bottom:0.6rem;">${crowns}</div>`;
      card.appendChild(btn);
      container.appendChild(card);
    });
    const back = makeButton('Back');
    back.addEventListener('click', () => this.game.goto('menu'));
    overlay.appendChild(container);
    overlay.appendChild(back);
    document.body.appendChild((this.overlay = overlay));
  }

  async startMap(mapInfo) {
    this.game.selectedMap = mapInfo;
    this.game.goto('gameplay');
  }
}

class ResearchScene extends BaseScene {
  enter() {
    super.enter();
    this.game.ui.setGameplayVisible(false);
    this.game.research.refresh();
    const overlay = makeOverlay();
    overlay.innerHTML = `<h2>Research Tree</h2><p>Spend crowns to power up all future runs.</p><div id="research-grid" style="display:grid;gap:0.8rem;"></div>`;
    const grid = overlay.querySelector('#research-grid');
    const nodes = [
      { key: 'coinGain', label: '+5% coins each level' },
      { key: 'lives', label: '+1 starting life' },
      { key: 'refund', label: '+10% sell refund' },
      { key: 'range', label: '+5% tower range' },
      { key: 'proj', label: '+10% projectile speed' },
    ];
    nodes.forEach((node) => {
      const btn = makeButton(`${node.label}`);
      const level = this.game.research.getNodeLevel(node.key);
      btn.textContent = `${node.label} • L${level}`;
      btn.addEventListener('click', () => {
        if (!this.game.research.purchase(node.key)) {
          alert('Not enough crowns or maxed out!');
        } else {
          if (this.overlay) this.overlay.remove();
          this.enter();
        }
      });
      grid.appendChild(btn);
    });
    const crowns = document.createElement('div');
    crowns.textContent = `Crowns: ${this.game.research.profile.crowns}`;
    const back = makeButton('Back');
    back.addEventListener('click', () => this.game.goto('menu'));
    overlay.append(crowns, back);
    document.body.appendChild((this.overlay = overlay));
  }
}

class GameplayScene extends BaseScene {
  constructor(game) {
    super(game);
    this.map = null;
    this.waveManager = null;
    this.ghost = null;
    this.selectedTowerType = null;
    this.totalWaves = 20;
    this.paused = false;
  }

  async enter() {
    super.enter();
    this.game.ui.setGameplayVisible(true);
    const mapKey = this.game.selectedMap?.key || 'meadow';
    this.map = await loadMap(mapKey);
    this.totalWaves = 20;
    this.game.renderer.camera.tileW = this.map.tileSize;
    this.game.renderer.camera.tileH = this.map.tileSize / 2;
    this.waveManager = new WaveManager(this.game.enemies, this.game.economy, this.map);
    this.waveManager.load(this.map.waveset);
    this.waveManager.onWaveComplete = (wave) => {
      if (wave >= this.totalWaves && !this.game.enemies.list.length) {
        const result = this.game.research.applyVictory(this.map.name, this.game.economy.lives, this.map.startLives);
        this.game.victoryData = result;
        this.game.goto('victory');
      } else if (this.game.save.profile.settings.autoSend && this.game.economy.wave < this.totalWaves) {
        this.startWave();
      }
    };
    this.waveManager.onWaveStart = () => {
      this.game.ui.showToast('Wave incoming!');
    };
    this.game.projectiles.active.length = 0;
    this.game.towers.clear();
    this.game.enemies.reset();
    this.game.enemies.onExit = (enemy) => {
      if (this.game.economy.loseLife(1)) {
        this.game.goto('defeat');
      }
    };
    this.game.ui.bind({
      onSend: () => this.sendWave(),
      onSpeed: () => this.toggleSpeed(),
      onPause: () => this.togglePause(),
      onSelectCard: (type) => this.selectTower(type),
      onUpgrade: (tower) => this.upgradeTower(tower),
      onSell: (tower) => this.sellTower(tower),
      onTarget: (tower, mode) => (tower.targetMode = mode),
    });
    this.game.economy.setup(this.map.startCoins, this.map.startLives, this.totalWaves);
    this.game.ui.updateHUD(this.game.economy);
    this.game.ui.renderShop(this.game.economy);
    this.game.engine.emit('map-loaded', this.map);
    this.game.input.consumeRelease();
  }

  sendWave() {
    if (this.game.economy.wave >= this.totalWaves) return;
    if (this.waveManager.active && this.waveManager.queue.length) {
      this.game.ui.showToast('Wave already sending');
      return;
    }
    if (this.waveManager.active && !this.waveManager.queue.length) {
      this.game.economy.earlySendBonus(20);
      this.game.ui.showToast('Early send bonus!');
    }
    this.startWave();
  }

  startWave() {
    if (this.game.economy.wave >= this.totalWaves) return;
    this.game.economy.beginWave();
    this.waveManager.startWave(this.game.economy.wave);
  }

  toggleSpeed() {
    const mult = this.game.engine.speed === 1 ? 2 : 1;
    this.game.engine.setSpeed(mult);
    this.game.ui.setSpeed(mult);
  }

  togglePause() {
    this.paused = !this.paused;
    this.game.engine.setSpeed(this.paused ? 0 : this.game.ui.speedState);
    this.game.ui.setPaused(this.paused);
  }

  selectTower(type) {
    if (!this.game.economy.canAfford(getTowerCost(type))) {
      this.game.ui.showToast('Not enough coins');
      return;
    }
    this.game.ui.showTowerPanel(null);
    this.selectedTowerType = type;
  }

  upgradeTower(tower) {
    if (!this.game.towers.upgradeTower(tower)) {
      this.game.ui.showToast('Cannot upgrade');
    } else {
      this.game.ui.renderShop(this.game.economy);
      this.game.ui.showTowerPanel(tower);
    }
  }

  sellTower(tower) {
    this.game.towers.sellTower(tower);
    this.game.ui.renderShop(this.game.economy);
    this.game.ui.showTowerPanel(null);
  }

  update(dt) {
    if (this.paused) return;
    const pan = this.game.input.getPanDelta(dt);
    this.game.renderer.camera.target.x += pan.x;
    this.game.renderer.camera.target.y += pan.y;
    this.game.enemies.update(dt, {
      renderer: this.game.renderer,
      onKill: (enemy) => this.game.economy.earn(enemy.bounty),
    });
    this.game.towers.update(dt, this.game.enemies);
    this.game.projectiles.update(dt, this.game.enemies, {
      renderer: this.game.renderer,
      onKill: (enemy) => this.game.economy.earn(enemy.bounty),
    });
    this.waveManager.update(dt);
    this.game.renderer.update(dt);
    this.handlePointer(dt);
    this.game.ui.updateHUD(this.game.economy);
  }

  handlePointer(dt) {
    const pointer = this.game.input.pointer;
    const released = this.game.input.consumeRelease();
    const world = screenToWorld(this.game.renderer.camera, pointer.x, pointer.y);
    if (this.selectedTowerType) {
      const tile = { x: Math.round(world.x), y: Math.round(world.y) };
      const canBuild = this.isBuildable(tile);
      if (!this.ghost) {
        const base = this.game.towers.applyUpgrades({ ...BAL.towers[this.selectedTowerType] });
        this.ghost = {
          pos: { x: tile.x, y: tile.y },
          range: base.rng,
          color: '#ffffff',
          canPlace: canBuild,
        };
      }
      this.ghost.pos.x = tile.x;
      this.ghost.pos.y = tile.y;
      this.ghost.canPlace = canBuild;
      if (released && canBuild) {
        const cost = getTowerCost(this.selectedTowerType);
        if (!this.game.economy.canAfford(cost)) {
          this.game.ui.showToast('Not enough coins');
        } else {
          this.game.economy.spend(cost);
          this.game.towers.addTower(this.selectedTowerType, tile);
          this.game.ui.renderShop(this.game.economy);
          this.selectedTowerType = null;
          this.ghost = null;
        }
      } else if (released && !canBuild) {
        this.game.ui.showToast('Tile not buildable');
      }
    } else {
      this.ghost = null;
      if (released) {
        const closest = this.game.towers.list.find((tower) => Math.hypot(tower.pos.x - world.x, tower.pos.y - world.y) < 0.8);
        if (closest) {
          this.game.ui.showTowerPanel(closest);
        } else {
          this.game.ui.showTowerPanel(null);
        }
      }
    }
  }

  isBuildable(tile) {
    if (this.game.towers.isOccupied(tile.x, tile.y)) return false;
    return this.map.buildable.some((pad) => pad.x === tile.x && pad.y === tile.y);
  }

  render() {
    const { renderer } = this.game;
    renderer.clear();
    if (!this.map) return;
    renderer.drawMap(this.map);
    renderer.drawTowers(this.game.towers);
    renderer.drawEnemies(this.game.enemies);
    renderer.drawProjectiles(this.game.projectiles);
    renderer.drawGhost(this.ghost);
    renderer.drawFX();
  }
}

class VictoryScene extends BaseScene {
  enter() {
    super.enter();
    this.game.ui.setGameplayVisible(false);
    const overlay = makeOverlay();
    const { stars, crowns } = this.game.victoryData || { stars: 0, crowns: 0 };
    overlay.innerHTML = `<h2>Victory!</h2><p>You earned ${crowns} crowns.</p><div>${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`;
    const next = makeButton('Map Select');
    next.addEventListener('click', () => this.game.goto('map-select'));
    const menu = makeButton('Menu');
    menu.addEventListener('click', () => this.game.goto('menu'));
    overlay.append(next, menu);
    document.body.appendChild((this.overlay = overlay));
  }
}

class DefeatScene extends BaseScene {
  enter() {
    super.enter();
    this.game.ui.setGameplayVisible(false);
    const overlay = makeOverlay();
    overlay.innerHTML = `<h2>Defeat</h2><p>Your defenses fell. Try a new strategy!</p>`;
    const retry = makeButton('Retry');
    retry.addEventListener('click', () => this.game.goto('gameplay'));
    const menu = makeButton('Map Select');
    menu.addEventListener('click', () => this.game.goto('map-select'));
    overlay.append(retry, menu);
    document.body.appendChild((this.overlay = overlay));
  }
}

export function createScenes(game) {
  return {
    menu: new MenuScene(game),
    'map-select': new MapSelectScene(game),
    research: new ResearchScene(game),
    gameplay: new GameplayScene(game),
    victory: new VictoryScene(game),
    defeat: new DefeatScene(game),
  };
}
