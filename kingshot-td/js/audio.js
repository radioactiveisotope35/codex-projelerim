// Web Audio API kullanarak basit sesler üreten modül
const AudioContext = window.AudioContext || window.webkitAudioContext;
let ctx = null;
let enabled = false;

export function initAudio() {
  if (enabled) return;
  try {
    ctx = new AudioContext();
    enabled = true;
    // Mobil tarayıcılar için boş bir ses çalarak kilidi aç
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch (e) {
    console.warn('Audio init failed', e);
  }
}

const VOLUME = 0.15;

function osc(type, freq, duration, vol = 1) {
  if (!enabled || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  g.gain.setValueAtTime(vol * VOLUME, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + duration);
}

function noise(duration, vol = 1) {
  if (!enabled || !ctx) return;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * VOLUME, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  noise.connect(g);
  g.connect(ctx.destination);
  noise.start();
}

export function playSound(id) {
  if (!enabled) return;
  switch (id) {
    case 'shoot-arrow':
      osc('triangle', 600, 0.1, 0.5);
      break;
    case 'shoot-cannon':
      noise(0.3, 0.8);
      osc('sawtooth', 100, 0.2, 0.6);
      break;
    case 'shoot-magic':
      osc('sine', 880, 0.15, 0.4);
      break;
    case 'shoot-tesla':
      // Cızırtılı elektrik sesi
      osc('sawtooth', 1500, 0.1, 0.3);
      osc('square', 1200, 0.1, 0.3);
      break;
    case 'hit':
      noise(0.05, 0.3);
      break;
    case 'kill':
      osc('square', 150, 0.1, 0.4);
      break;
    case 'build':
      osc('sine', 400, 0.1);
      setTimeout(() => osc('sine', 600, 0.1), 100);
      break;
    case 'error':
      osc('sawtooth', 150, 0.2);
      break;
    case 'wave-start':
      osc('triangle', 300, 0.3);
      setTimeout(() => osc('triangle', 400, 0.3), 200);
      break;
  }
}
