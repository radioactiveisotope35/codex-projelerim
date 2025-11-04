/**
 * upgrades.js
 * Handles persistent research upgrades applied to new runs.
 * How to extend: add new research nodes and expose getters for systems.
 */

import { BAL } from './balance.js';

const MAX_LEVEL = 5;

export class Research {
  constructor(save) {
    this.save = save;
    this.profile = save.profile;
  }

  refresh() {
    this.profile = this.save.profile;
  }

  getNodeLevel(key) {
    return this.profile.research[key] || 0;
  }

  purchase(key) {
    const level = this.getNodeLevel(key);
    if (level >= MAX_LEVEL) return false;
    const cost = (level + 1) * 3;
    if (this.profile.crowns < cost) return false;
    this.profile.crowns -= cost;
    this.profile.research[key] = level + 1;
    this.save.persist();
    return true;
  }

  getCoinBonus() {
    return this.getNodeLevel('coinGain') * BAL.research.coinGain.base;
  }

  getLifeBonus() {
    return this.getNodeLevel('lives') * BAL.research.lives.base;
  }

  getSellBonus() {
    return this.getNodeLevel('refund') * BAL.research.refund.base;
  }

  getRangeBonus() {
    return this.getNodeLevel('range') * BAL.research.range.base;
  }

  getProjectileBonus() {
    return this.getNodeLevel('proj') * BAL.research.proj.base;
  }

  getTowerModifiers() {
    return {
      range: this.getRangeBonus(),
      projectileSpeed: this.getProjectileBonus(),
    };
  }

  applyVictory(mapName, livesLeft, startLives) {
    const stars = livesLeft >= startLives ? 3 : livesLeft >= startLives * 0.5 ? 2 : livesLeft > 0 ? 1 : 0;
    const crowns = stars * BAL.econ.crownPerStar;
    this.profile.crowns += crowns;
    const existing = this.profile.completed[mapName]?.stars || 0;
    this.profile.completed[mapName] = { stars: Math.max(existing, stars) };
    this.save.persist();
    return { stars, crowns };
  }
}
