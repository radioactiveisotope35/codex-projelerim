/**
 * save.js
 * Manages localStorage persistence for player progress and settings.
 * How to extend: bump version and migrate profile data when new fields are added.
 */

const KEY = 'kingshot-td-profile';

const DEFAULT_PROFILE = {
  version: 1,
  crowns: 0,
  research: { coinGain: 0, lives: 0, refund: 0, range: 0, proj: 0 },
  completed: {},
  settings: { sfx: true, music: false, autoSend: false },
};

export class SaveManager {
  constructor() {
    this.profile = loadProfile();
  }

  persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.profile));
    } catch (err) {
      console.warn('Unable to persist save', err);
    }
  }

  reset() {
    this.profile = structuredClone(DEFAULT_PROFILE);
    this.persist();
  }
}

function loadProfile() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_PROFILE), ...parsed };
  } catch (err) {
    console.warn('Failed to load save, using defaults', err);
    return structuredClone(DEFAULT_PROFILE);
  }
}
