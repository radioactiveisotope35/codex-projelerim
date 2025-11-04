import { BALANCE } from './balance.js';
import { upgradePrice, sellRefund } from './economy.js';
import { register as registerAbility } from './abilities.js';

const ADD_KEYS = ['range', 'damage', 'bulletSpeed', 'splashRadius', 'pierce', 'slowPct', 'slowDuration'];

export function getUpgradeInfo(type, path, tier) {
  const deltas = BALANCE.upgrades.deltas[type];
  const price = upgradePrice(type, path, tier);
  if (!deltas) return null;
  const key = `${path}${tier}`;
  const delta = deltas[key];
  if (!delta || !Number.isFinite(price)) return null;
  return { price, deltas: delta };
}

export function canApplyUpgrade(state, tower, path) {
  const tier = tower.tiers[path] + 1;
  if (tier > 5) return { ok: false, reason: 'Max tier' };
  const otherPath = path === 'A' ? 'B' : 'A';
  const otherTier = tower.tiers[otherPath];
  if (tier + tower.tiers[otherPath] > 5) return { ok: false, reason: 'Tier cap' };
  if (tier > 2 && otherTier > 2) return { ok: false, reason: 'Only one Tier 3+' };
  const info = getUpgradeInfo(tower.type, path, tier);
  if (!info) return { ok: false, reason: 'Unavailable' };
  if (!state.sandbox && state.coins < info.price) return { ok: false, reason: 'Not enough coins' };
  return { ok: true, tier, info };
}

export function applyUpgrade(state, tower, path) {
  const check = canApplyUpgrade(state, tower, path);
  if (!check.ok) return false;
  const { info, tier } = check;
  if (!state.sandbox) state.coins -= info.price;
  tower.tiers[path] = tier;
  tower.totalSpent += info.price;
  const delta = info.deltas;
  for (const key of ADD_KEYS) {
    if (key in delta) {
      tower[key] = (tower[key] ?? 0) + delta[key];
    }
  }
  if (delta.fireRateMul) tower.fireRate *= delta.fireRateMul;
  if (delta.camoDetection) tower.camoDetection = true;
  if (delta.shatterLead) tower.shatterLead = true;
  if (delta.ability) registerAbility(state, delta.ability);
  tower.sellValue = sellRefund(tower.totalSpent);
  return true;
}
