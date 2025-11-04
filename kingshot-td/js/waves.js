/**
 * waves.js
 * Defines wave scripts and orchestrates timed enemy spawns.
 * How to extend: register new wave sets by composing the DSL below.
 */

import { BAL } from './balance.js';
import { getEnemyStats } from './enemies.js';

class WaveEntry {
  constructor(script, number) {
    this.script = script;
    this.number = number;
    if (!script.table.has(number)) script.table.set(number, []);
    this.actions = script.table.get(number);
    this.laneIndex = 0;
    this.delayOffset = 0;
  }
  lane(index) {
    this.laneIndex = index;
    return this;
  }
  delay(seconds) {
    this.delayOffset = seconds;
    return this;
  }
  spawn(type, count, interval = 0.6) {
    this.actions.push({ kind: 'spawn', lane: this.laneIndex, type, count, interval, delay: this.delayOffset });
    this.laneIndex = 0;
    this.delayOffset = 0;
    return this;
  }
  boss(type) {
    this.actions.push({ kind: 'boss', lane: this.laneIndex, type, delay: this.delayOffset });
    this.laneIndex = 0;
    this.delayOffset = 0;
    return this;
  }
}

class WaveScript {
  constructor(key) {
    this.key = key;
    this.table = new Map();
  }
  wave(number) {
    return new WaveEntry(this, number);
  }
}

export class WaveManager {
  constructor(enemies, economy, map) {
    this.enemies = enemies;
    this.economy = economy;
    this.map = map;
    this.script = null;
    this.waveNumber = 0;
    this.queue = [];
    this.timer = 0;
    this.active = false;
    this.onWaveComplete = null;
    this.onWaveStart = null;
  }

  load(key) {
    this.script = WAVES[key];
  }

  startWave(number) {
    if (!this.script) return;
    this.waveNumber = number;
    this.queue.length = 0;
    this.timer = 0;
    const actions = this.script.table.get(number) || [];
    let timeCursor = 0;
    for (const action of actions) {
      if (action.kind === 'spawn') {
        let spawnTime = timeCursor + action.delay;
        for (let i = 0; i < action.count; i++) {
          this.queue.push({ time: spawnTime, action: { ...action, count: 1 } });
          spawnTime += action.interval;
        }
        timeCursor = Math.max(timeCursor, spawnTime);
      } else if (action.kind === 'boss') {
        this.queue.push({ time: timeCursor + action.delay, action });
        timeCursor += 2;
      }
    }
    this.queue.sort((a, b) => a.time - b.time);
    this.active = true;
    if (this.onWaveStart) this.onWaveStart(number);
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    while (this.queue.length && this.queue[0].time <= this.timer) {
      const item = this.queue.shift();
      this.executeAction(item.action);
    }
    if (!this.queue.length && !this.enemies.list.length) {
      this.active = false;
      if (this.onWaveComplete) this.onWaveComplete(this.waveNumber);
    }
  }

  executeAction(action) {
    const lane = Math.min(this.map.paths.length - 1, action.lane || 0);
    const path = this.map.paths[lane];
    const waveMult = this.getWaveMultiplier(action.type === 'OgreBoss');
    const stats = getEnemyStats(action.type);
    if (action.kind === 'spawn') {
      const copies = stats.spawn || 1;
      for (let i = 0; i < copies; i++) {
        this.enemies.spawn(action.type, { ...stats, spawn: undefined }, path, waveMult);
      }
    } else if (action.kind === 'boss') {
      this.enemies.spawn(action.type, stats, path, this.getWaveMultiplier(true));
    }
  }

  getWaveMultiplier(isBoss = false) {
    const index = this.waveNumber - 1;
    const hp = Math.pow(BAL.waves.hpMulPerWave, index) * (isBoss ? BAL.waves.bossHPBonus : 1);
    const bounty = Math.pow(BAL.waves.bountyMulPerWave, index);
    return { hp, bounty };
  }
}

function makeScript(key, build) {
  const script = new WaveScript(key);
  const W = {
    wave: (num) => script.wave(num),
  };
  build(W);
  return script;
}

const WAVES = {
  'meadow-20': makeScript('meadow-20', (W) => {
    W.wave(1).spawn('Grunt', 12, 0.9);
    W.wave(2).spawn('Grunt', 16, 0.75);
    W.wave(3).spawn('Runner', 18, 0.4);
    W.wave(4).lane(0).spawn('Grunt', 10, 0.8).lane(0).delay(2).spawn('Shielded', 6, 1.2);
    W.wave(5).boss('OgreBoss');
    W.wave(6).spawn('Runner', 20, 0.35);
    W.wave(7).spawn('Tank', 6, 1.4).delay(1.5).spawn('Grunt', 15, 0.7);
    W.wave(8).lane(0).spawn('Swarm', 8, 0.5).delay(2).spawn('Shielded', 8, 0.9);
    W.wave(9).spawn('Specter', 10, 0.6).delay(1).spawn('Runner', 14, 0.4);
    W.wave(10).boss('OgreBoss');
    W.wave(11).spawn('Grunt', 20, 0.5).delay(3).spawn('Swarm', 12, 0.35);
    W.wave(12).spawn('Shielded', 12, 0.8).delay(2).spawn('Tank', 8, 1.2);
    W.wave(13).spawn('Runner', 24, 0.3);
    W.wave(14).lane(0).spawn('Specter', 12, 0.7).delay(2).spawn('Grunt', 20, 0.5);
    W.wave(15).boss('OgreBoss');
    W.wave(16).spawn('Tank', 10, 1.1).delay(2).spawn('Swarm', 18, 0.4);
    W.wave(17).spawn('Shielded', 18, 0.75);
    W.wave(18).spawn('Runner', 28, 0.28).delay(1).spawn('Specter', 12, 0.6);
    W.wave(19).spawn('Tank', 14, 1).delay(2).spawn('Swarm', 20, 0.35);
    W.wave(20).boss('OgreBoss').delay(5).spawn('Specter', 16, 0.5);
  }),
  'canyon-20': makeScript('canyon-20', (W) => {
    W.wave(1).spawn('Grunt', 14, 0.8);
    W.wave(2).lane(0).spawn('Runner', 18, 0.35);
    W.wave(3).lane(0).spawn('Shielded', 8, 1.0);
    W.wave(4).lane(0).spawn('Grunt', 20, 0.6).delay(1).spawn('Swarm', 12, 0.4);
    W.wave(5).boss('OgreBoss');
    W.wave(6).lane(0).spawn('Runner', 24, 0.3);
    W.wave(7).spawn('Tank', 8, 1.2);
    W.wave(8).spawn('Specter', 12, 0.6).delay(2).spawn('Shielded', 10, 0.8);
    W.wave(9).lane(0).spawn('Swarm', 16, 0.35).delay(1.5).spawn('Tank', 10, 1.1);
    W.wave(10).boss('OgreBoss');
    W.wave(11).spawn('Runner', 28, 0.28);
    W.wave(12).spawn('Specter', 16, 0.55);
    W.wave(13).spawn('Shielded', 18, 0.7).delay(2).spawn('Tank', 12, 1);
    W.wave(14).spawn('Swarm', 18, 0.35).delay(3).spawn('Runner', 22, 0.28);
    W.wave(15).boss('OgreBoss');
    W.wave(16).spawn('Tank', 12, 1).delay(2).spawn('Shielded', 14, 0.8);
    W.wave(17).spawn('Specter', 20, 0.5);
    W.wave(18).spawn('Runner', 32, 0.24);
    W.wave(19).spawn('Tank', 16, 0.9).delay(1).spawn('Shielded', 18, 0.7);
    W.wave(20).boss('OgreBoss').delay(4).spawn('Specter', 20, 0.5);
  }),
  'crossroads-20': makeScript('crossroads-20', (W) => {
    W.wave(1).lane(0).spawn('Grunt', 10, 0.9).lane(1).spawn('Grunt', 10, 0.9);
    W.wave(2).lane(0).spawn('Runner', 16, 0.35).lane(1).spawn('Runner', 16, 0.35);
    W.wave(3).lane(0).spawn('Shielded', 6, 1.1).lane(1).spawn('Shielded', 6, 1.1);
    W.wave(4).lane(0).spawn('Swarm', 12, 0.4).lane(1).spawn('Swarm', 12, 0.4);
    W.wave(5).boss('OgreBoss');
    W.wave(6).lane(0).spawn('Runner', 20, 0.3).lane(1).spawn('Runner', 20, 0.3);
    W.wave(7).lane(0).spawn('Tank', 8, 1.2).lane(1).spawn('Tank', 8, 1.2);
    W.wave(8).lane(0).spawn('Specter', 12, 0.6).lane(1).spawn('Specter', 12, 0.6);
    W.wave(9).lane(0).spawn('Shielded', 12, 0.8).lane(1).spawn('Swarm', 16, 0.35);
    W.wave(10).boss('OgreBoss');
    W.wave(11).lane(0).spawn('Runner', 28, 0.28).lane(1).spawn('Swarm', 20, 0.35);
    W.wave(12).lane(0).spawn('Specter', 16, 0.55).lane(1).spawn('Shielded', 14, 0.7);
    W.wave(13).lane(0).spawn('Tank', 12, 1).lane(1).spawn('Runner', 24, 0.26);
    W.wave(14).lane(0).spawn('Swarm', 20, 0.33).lane(1).spawn('Specter', 18, 0.5);
    W.wave(15).boss('OgreBoss');
    W.wave(16).lane(0).spawn('Tank', 14, 0.95).lane(1).spawn('Shielded', 16, 0.75);
    W.wave(17).lane(0).spawn('Runner', 32, 0.25).lane(1).spawn('Specter', 20, 0.45);
    W.wave(18).lane(0).spawn('Swarm', 24, 0.33).lane(1).spawn('Tank', 14, 0.95);
    W.wave(19).lane(0).spawn('Shielded', 18, 0.7).lane(1).spawn('Runner', 34, 0.23);
    W.wave(20).boss('OgreBoss').delay(3).lane(1).spawn('Specter', 24, 0.45);
  }),
};

export function getWaveset(key) {
  return WAVES[key];
}
