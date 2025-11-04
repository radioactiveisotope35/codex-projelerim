/**
 * ui.js
 * Controls HUD, shop interactions, tower panels, and toasts.
 * How to extend: add new UI panels or animations here.
 */

import { getTowerCost, TARGET_MODES } from './towers.js';
import { formatCoins } from './util.js';
import { BAL } from './balance.js';

export class UIManager {
  constructor(doc) {
    this.doc = doc;
    this.hudCoins = doc.getElementById('hud-coins');
    this.hudLives = doc.getElementById('hud-lives');
    this.hudWave = doc.getElementById('hud-wave');
    this.btnSend = doc.getElementById('btn-send');
    this.btnSpeed = doc.getElementById('btn-speed');
    this.btnPause = doc.getElementById('btn-pause');
    this.shop = doc.getElementById('shop');
    this.panel = doc.getElementById('tower-panel');
    this.toasts = doc.getElementById('toasts');
    this.speedState = 1;
    this.sendHandler = null;
    this.speedHandler = null;
    this.pauseHandler = null;
    this.cardHandler = null;
    this.upgradeHandler = null;
    this.sellHandler = null;
    this.targetHandler = null;
    this.selectedTower = null;
    this.initListeners();
  }

  initListeners() {
    this.btnSend.addEventListener('click', () => this.sendHandler && this.sendHandler());
    this.btnSpeed.addEventListener('click', () => this.speedHandler && this.speedHandler());
    this.btnPause.addEventListener('click', () => this.pauseHandler && this.pauseHandler());
  }

  bind({ onSend, onSpeed, onPause, onSelectCard, onUpgrade, onSell, onTarget }) {
    this.sendHandler = onSend;
    this.speedHandler = onSpeed;
    this.pauseHandler = onPause;
    this.cardHandler = onSelectCard;
    this.upgradeHandler = onUpgrade;
    this.sellHandler = onSell;
    this.targetHandler = onTarget;
  }

  renderShop(economy) {
    const towers = ['Archer', 'Cannon', 'Mage', 'Frost'];
    this.shop.innerHTML = '';
    towers.forEach((type) => {
      const cost = getTowerCost(type);
      const card = document.createElement('button');
      card.className = 'tower-card';
      if (!economy.canAfford(cost)) card.classList.add('disabled');
      card.innerHTML = `<strong>${type}</strong><span class="price">${cost}💰</span><small>${this.flavor(type)}</small>`;
      card.addEventListener('click', () => this.cardHandler && this.cardHandler(type));
      this.shop.appendChild(card);
    });
  }

  flavor(type) {
    switch (type) {
      case 'Archer':
        return 'Fast physical damage';
      case 'Cannon':
        return 'Splash siege rounds';
      case 'Mage':
        return 'Magic burst';
      case 'Frost':
        return 'Slowing shards';
      default:
        return '';
    }
  }

  updateHUD(economy) {
    this.hudCoins.textContent = `💰 ${formatCoins(economy.coins)}`;
    this.hudLives.textContent = `❤️ ${economy.lives}`;
    const waveDisplay = economy.wave === 0 ? 1 : economy.wave;
    this.hudWave.textContent = `Wave ${waveDisplay}/${economy.totalWaves}`;
  }

  setSpeed(mult) {
    this.speedState = mult;
    this.btnSpeed.textContent = `x${mult}`;
  }

  setPaused(paused) {
    this.btnPause.textContent = paused ? '▶️' : '⏸';
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.toasts.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2600);
  }

  showTowerPanel(tower) {
    if (this.selectedTower && this.selectedTower !== tower) {
      this.selectedTower.selected = false;
    }
    this.selectedTower = tower;
    if (!tower) {
      this.panel.classList.remove('active');
      this.panel.innerHTML = '';
      return;
    }
    tower.selected = true;
    this.panel.classList.add('active');
    const upgrades = ['Upgrade', 'Upgrade II'];
    const nextTier = tower.tier < 2 ? tower.tier + 1 : null;
    const upgradeCost = nextTier ? this.getUpgradeCost(tower, nextTier - 1) : null;
    this.panel.innerHTML = `
      <h3>${tower.type} Tier ${tower.tier + 1}</h3>
      <div>Damage: ${tower.stats.dmg}</div>
      <div>Rate: ${tower.stats.rof.toFixed(2)}s</div>
      <div>Range: ${tower.stats.rng.toFixed(1)}</div>
      <div>Target: <select id="target-select">${TARGET_MODES.map((m) => `<option ${tower.targetMode === m ? 'selected' : ''}>${m}</option>`)}</select></div>
      <div class="panel-actions"></div>
    `;
    const actions = this.panel.querySelector('.panel-actions');
    if (nextTier) {
      const btnUp = document.createElement('button');
      btnUp.textContent = `Upgrade (${upgradeCost}💰)`;
      btnUp.addEventListener('click', () => this.upgradeHandler && this.upgradeHandler(tower));
      actions.appendChild(btnUp);
    } else if (tower.perk) {
      const perk = document.createElement('div');
      perk.textContent = tower.perk;
      actions.appendChild(perk);
    }
    const btnSell = document.createElement('button');
    btnSell.textContent = 'Sell';
    btnSell.addEventListener('click', () => this.sellHandler && this.sellHandler(tower));
    actions.appendChild(btnSell);
    const select = this.panel.querySelector('#target-select');
    select.addEventListener('change', (e) => this.targetHandler && this.targetHandler(tower, e.target.value));
  }

  getUpgradeCost(tower, tierIndex) {
    const def = BAL.upgrades?.[tower.type] || [];
    const data = def[tierIndex];
    return data ? data.cost : 0;
  }
}

UIManager.prototype.setGameplayVisible = function (visible) {
  const layer = document.getElementById('ui-layer');
  layer.style.display = visible ? 'flex' : 'none';
};
