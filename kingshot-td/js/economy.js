import { BALANCE } from './balance.js';

const DIFF_PARAM = new URLSearchParams(globalThis.location?.search || '');
const DIFF_NAME = ['normal', 'hard', 'impop'].includes(DIFF_PARAM.get('diff'))
  ? DIFF_PARAM.get('diff')
  : 'normal';

export function getDifficulty() {
  return BALANCE.economy.difficulty[DIFF_NAME] || BALANCE.economy.difficulty.normal;
}

export function priceOf(type) {
  return BALANCE.towers[type]?.price ?? Infinity;
}

export function upgradePrice(type, path, tier) {
  const costs = BALANCE.upgrades.costs[type];
  if (!costs) return Infinity;
  const arr = costs[path];
  if (!arr) return Infinity;
  return arr[tier - 1] ?? Infinity;
}

export function popReward(enemyType, diff) {
  const base = BALANCE.enemies[enemyType]?.reward ?? 0;
  return Math.floor((base + BALANCE.economy.cashPerPopBase) * (diff?.cashMul ?? 1));
}

export function roundBonus(wave, diff) {
  return Math.floor(BALANCE.economy.roundBonus(wave) * (diff?.roundBonusMul ?? 1));
}

export function sellRefund(totalSpent) {
  return Math.floor(totalSpent * BALANCE.economy.sellRefund);
}
