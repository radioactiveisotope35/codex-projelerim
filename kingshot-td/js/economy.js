/**
 * economy.js
 * Tracks player resources (coins, lives) and handles payouts and penalties.
 * How to extend: add additional currencies or mission modifiers here.
 */

import { BAL } from './balance.js';

export class Economy {
  constructor(upgrades) {
    this.coins = 0;
    this.lives = 0;
    this.wave = 0;
    this.totalWaves = 0;
    this.upgrades = upgrades;
    this.listeners = new Set();
  }

  setup(startCoins, startLives, totalWaves) {
    const bonusCoins = startCoins * this.upgrades.getCoinBonus();
    this.coins = Math.floor(startCoins + bonusCoins);
    this.lives = startLives + this.upgrades.getLifeBonus();
    this.totalWaves = totalWaves;
    this.wave = 0;
    this.notify();
  }

  onChange(cb) {
    this.listeners.add(cb);
  }

  notify() {
    for (const cb of this.listeners) cb(this);
  }

  canAfford(cost) {
    return this.coins >= cost;
  }

  spend(cost) {
    this.coins -= cost;
    this.notify();
  }

  earn(amount) {
    const bonus = amount * this.upgrades.getCoinBonus();
    this.coins += Math.floor(amount + bonus);
    this.notify();
  }

  loseLife(amount = 1) {
    this.lives -= amount;
    this.notify();
    return this.lives <= 0;
  }

  sellTower(tower) {
    const base = BAL.econ.sellRefund + this.upgrades.getSellBonus();
    const value = tower.baseStats.cost;
    const refund = Math.floor(value * base);
    this.coins += refund;
    this.notify();
    return refund;
  }

  beginWave() {
    this.wave += 1;
    this.notify();
  }

  earlySendBonus(base) {
    const bonus = Math.floor(base * BAL.econ.earlySendBonus);
    this.coins += bonus;
    this.notify();
  }
}
