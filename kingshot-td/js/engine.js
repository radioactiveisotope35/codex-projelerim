/**
 * engine.js
 * Fixed timestep game loop and event emitter utilities.
 * How to extend: wire in new systems or expose additional lifecycle hooks.
 */

const STEP = 1 / 60;

export class Emitter {
  constructor() {
    this.listeners = new Map();
  }
  on(evt, cb) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(cb);
    return () => this.off(evt, cb);
  }
  off(evt, cb) {
    const set = this.listeners.get(evt);
    if (set) set.delete(cb);
  }
  emit(evt, data) {
    const set = this.listeners.get(evt);
    if (!set) return;
    for (const cb of set) cb(data);
  }
}

export class Engine extends Emitter {
  constructor() {
    super();
    this.accumulator = 0;
    this.speed = 1;
    this.last = 0;
    this.running = false;
    this.scene = null;
  }

  setScene(scene) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.scene = scene;
    if (this.scene && this.scene.enter) this.scene.enter();
  }

  setSpeed(mult) {
    this.speed = mult;
  }

  start() {
    this.running = true;
    this.last = performance.now() / 1000;
    const frame = () => {
      if (!this.running) return;
      const now = performance.now() / 1000;
      let dt = (now - this.last) * this.speed;
      if (dt > 0.25) dt = 0.25;
      this.last = now;
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        if (this.scene && this.scene.update) this.scene.update(STEP);
        this.emit('update', STEP);
        this.accumulator -= STEP;
      }
      const alpha = this.accumulator / STEP;
      if (this.scene && this.scene.render) this.scene.render(alpha);
      this.emit('render', alpha);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
  }
}
