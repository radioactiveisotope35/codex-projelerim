/**
 * input.js
 * Collects pointer/touch events and provides a virtual joystick for camera panning.
 * How to extend: add gesture recognition or keyboard bindings here.
 */

import { clamp } from './util.js';

export class InputSystem {
  constructor(canvas, joystickEl) {
    this.canvas = canvas;
    this.joystickEl = joystickEl;
    this.activeTouches = new Map();
    this.pointer = { x: 0, y: 0, down: false, justReleased: false };
    this.dragging = false;
    this.dragOrigin = { x: 0, y: 0 };
    this.joystick = { active: false, dx: 0, dy: 0 };
    this.gestures = [];
    this.listeners();
  }

  listeners() {
    const pointerDown = (e) => {
      e.preventDefault();
      const point = this.getPoint(e);
      this.pointer.down = true;
      this.pointer.justReleased = false;
      this.pointer.x = point.x;
      this.pointer.y = point.y;
      this.dragOrigin.x = point.x;
      this.dragOrigin.y = point.y;
      this.dragging = true;
    };
    const pointerMove = (e) => {
      const point = this.getPoint(e);
      this.pointer.x = point.x;
      this.pointer.y = point.y;
      if (this.dragging && this.pointer.down) {
        const dx = this.pointer.x - this.dragOrigin.x;
        const dy = this.pointer.y - this.dragOrigin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 25 && !this.joystick.active) {
          this.activateJoystick(this.dragOrigin.x, this.dragOrigin.y);
        }
        if (this.joystick.active) {
          this.setJoystick(dx, dy);
        }
      }
    };
    const pointerUp = (e) => {
      e.preventDefault();
      this.pointer.down = false;
      this.pointer.justReleased = true;
      this.dragging = false;
      this.deactivateJoystick();
    };

    const opts = { passive: false };
    this.canvas.addEventListener('pointerdown', pointerDown, opts);
    window.addEventListener('pointermove', pointerMove, opts);
    window.addEventListener('pointerup', pointerUp, opts);
  }

  getPoint(e) {
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  activateJoystick(x, y) {
    this.joystickEl.style.display = 'block';
    this.joystickEl.style.left = `${x - 60}px`;
    this.joystickEl.style.top = `${y - 60}px`;
    this.joystick.active = true;
    this.joystick.dx = 0;
    this.joystick.dy = 0;
  }

  setJoystick(dx, dy) {
    const mag = Math.min(40, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    this.joystick.dx = Math.cos(angle) * (mag / 40);
    this.joystick.dy = Math.sin(angle) * (mag / 40);
    this.joystickEl.style.setProperty('--inner-x', `${this.joystick.dx * 40}px`);
    this.joystickEl.style.setProperty('--inner-y', `${this.joystick.dy * 40}px`);
    this.joystickEl.style.transform = `translate3d(0,0,0)`;
    this.joystickEl.style.setProperty('display', 'block');
  }

  deactivateJoystick() {
    this.joystick.active = false;
    this.joystick.dx = 0;
    this.joystick.dy = 0;
    this.joystickEl.style.display = 'none';
  }

  consumeRelease() {
    const released = this.pointer.justReleased;
    this.pointer.justReleased = false;
    return released;
  }

  getPanDelta(dt) {
    if (!this.joystick.active) return { x: 0, y: 0 };
    const speed = 12 * dt;
    return { x: -this.joystick.dx * speed, y: -this.joystick.dy * speed };
  }

  getPointerWorld(camera) {
    return { x: this.pointer.x, y: this.pointer.y };
  }
}
