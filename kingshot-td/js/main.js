/**
 * main.js
 * Quickstart: open index.html (or serve statically) and the game boots automatically.
 * This module wires together the engine, renderer, UI, and scenes.
 */

import { Engine } from './engine.js';
import { Renderer } from './renderer.js';
import { InputSystem } from './input.js';
import { ProjectilePool } from './projectiles.js';
import { EnemySystem } from './enemies.js';
import { Economy } from './economy.js';
import { TowerSystem } from './towers.js';
import { SaveManager } from './save.js';
import { Research } from './upgrades.js';
import { UIManager } from './ui.js';
import { createScenes } from './scenes.js';
import { BAL } from './balance.js';

const canvas = document.getElementById('game');
const joystick = document.getElementById('joystick');
const engine = new Engine();
const renderer = new Renderer(canvas);
const input = new InputSystem(canvas, joystick);
const save = new SaveManager();
const research = new Research(save);
const economy = new Economy(research);
const projectiles = new ProjectilePool(renderer);
const enemies = new EnemySystem();
const towers = new TowerSystem(projectiles, renderer, economy, research);
const ui = new UIManager(document);

window.BALANCE = BAL;

const GAME = {
  canvas,
  engine,
  renderer,
  input,
  save,
  research,
  economy,
  projectiles,
  enemies,
  towers,
  ui,
  scenes: null,
  currentScene: null,
  goto(name) {
    this.currentScene = this.scenes[name];
    engine.setScene(this.currentScene);
  },
};

GAME.scenes = createScenes(GAME);

economy.onChange(() => {
  ui.updateHUD(economy);
  if (GAME.currentScene === GAME.scenes.gameplay) {
    ui.renderShop(economy);
  }
});

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer.camera.resize(width, height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

engine.on('map-loaded', (map) => {
  renderer.camera.target.x = map.width / 2;
  renderer.camera.target.y = map.height / 2;
  renderer.camera.target.scale = 1.1;
});

document.body.classList.toggle('pwa-installable', false);
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.body.classList.add('pwa-installable');
});
window.addEventListener('appinstalled', () => {
  document.body.classList.remove('pwa-installable');
  deferredPrompt = null;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

GAME.goto('menu');
engine.start();

export default GAME;
