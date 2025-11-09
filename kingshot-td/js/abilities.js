function hasCamoVision(state) {
  if (!state) return false;
  if (state.heroTower?.camoDetection) return true;
  if (Array.isArray(state.towers) && state.towers.some((tower) => tower?.camoDetection)) return true;
  if (state.abilities?.actives?.arcaneSurge > 0) {
    return state.towers?.some((tower) => tower?.type === 'Mage');
  }
  return false;
}

const ABILITIES = {
  callOfArrows: {
    id: 'callOfArrows',
    name: 'Call of Arrows',
    cooldown: 45,
    hotkey: '1',
    description: 'Volley hits all visible non-lead enemies for 35 physical damage.',
    activate(state, context) {
      const { now, applyDamage } = context;
      const camoVision = hasCamoVision(state);
      for (const enemy of state.enemies) {
        if (!enemy.alive || enemy.traits?.lead) continue;
        if (enemy.traits?.camo && !camoVision) continue;
        applyDamage(enemy, 35, 'physical', { now, source: 'ability' });
      }
    },
  },
  arcaneSurge: {
    id: 'arcaneSurge',
    name: 'Arcane Surge',
    cooldown: 60,
    duration: 8,
    hotkey: '2',
    description: 'Mages gain 2x damage and camo detection for 8s.',
    activate(state) {
      state.abilities.actives.arcaneSurge = Math.max(state.abilities.actives.arcaneSurge || 0, 8);
    },
  },
  freezeField: {
    id: 'freezeField',
    name: 'Freeze Field',
    cooldown: 50,
    duration: 2,
    hotkey: '3',
    description: 'Freezes enemies around the selected tower for 2s.',
    canUse(state) {
      return !!state?.selectedTower;
    },
    activate(state, context) {
      const { tower, now } = context;
      if (!tower) return false;
      const radius = 170;
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.x - tower.x;
        const dy = enemy.y - tower.y;
        if (dx * dx + dy * dy <= radius * radius) {
          enemy.freezeUntil = Math.max(enemy.freezeUntil || 0, now + 2);
        }
      }
      state.abilities.actives.freezeField = Math.max(state.abilities.actives.freezeField || 0, 2);
      return true;
    },
  },
  heroNova: {
    id: 'heroNova',
    name: 'Hero Nova',
    cooldown: 70,
    hotkey: '4',
    description: 'Hero unleashes a massive magical burst dealing 120 damage in a wide radius.',
    canUse(state) {
      return !!state?.heroTower;
    },
    activate(state, context) {
      const { now, hero, applyDamage } = context;
      if (!hero) return false;
      const radius = 220;
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.x - hero.x;
        const dy = enemy.y - hero.y;
        if (dx * dx + dy * dy <= radius * radius) {
          applyDamage(enemy, 120, 'magic', { now, source: 'ability' });
        }
      }
      return true;
    },
  },
};

export function list() {
  return Object.values(ABILITIES);
}

export function ensureState(state) {
  if (!state.abilities) {
    state.abilities = {
      unlocked: new Set(),
      cooldowns: {},
      actives: {},
    };
  }
  return state.abilities;
}

export function register(state, id) {
  ensureState(state);
  if (ABILITIES[id]) state.abilities.unlocked.add(id);
}

export function isUnlocked(id, state) {
  return !!state.abilities?.unlocked?.has(id);
}

export function isActive(id, state) {
  return (state.abilities?.actives?.[id] || 0) > 0;
}

export function canUse(id, state) {
  if (!isUnlocked(id, state)) return false;
  const cd = state.abilities.cooldowns?.[id] || 0;
  if (cd > 0) return false;
  const ability = ABILITIES[id];
  if (ability?.canUse) {
    return ability.canUse(state) !== false;
  }
  return true;
}

export function activate(id, state, context) {
  const ability = ABILITIES[id];
  if (!ability || !canUse(id, state)) return false;
  const result = ability.activate(state, context || {}) !== false;
  if (result) {
    state.abilities.cooldowns[id] = ability.cooldown;
    if (ability.duration) {
      state.abilities.actives[id] = ability.duration;
    }
  }
  return result;
}

export function update(dt, state) {
  ensureState(state);
  for (const id of Object.keys(state.abilities.cooldowns)) {
    state.abilities.cooldowns[id] = Math.max(0, state.abilities.cooldowns[id] - dt);
  }
  for (const id of Object.keys(state.abilities.actives)) {
    state.abilities.actives[id] -= dt;
    if (state.abilities.actives[id] <= 0) delete state.abilities.actives[id];
  }
}

export function uiStatus(id, state) {
  const def = ABILITIES[id];
  if (!def) return null;
  const cooldown = state.abilities?.cooldowns?.[id] || 0;
  const active = isActive(id, state);
  return { id, name: def.name, cooldown, active, hotkey: def.hotkey, description: def.description };
}
