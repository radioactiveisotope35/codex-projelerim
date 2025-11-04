function createWaveBuilder() {
  const store = new Map();
  let current = 1;
  const ensure = (wave) => {
    if (!store.has(wave)) store.set(wave, []);
    return store.get(wave);
  };
  const api = {
    wave(n) {
      current = n;
      ensure(n);
      return api;
    },
    spawn(type, count = 10, gap = 0.6, lane = 0, hpMul = 1) {
      ensure(current).push({ type, count, gap, lane, hpMul, boss: false });
      return api;
    },
    lane(idx) {
      ensure(current);
      return {
        spawn(type, count = 10, gap = 0.6, hpMul = 1) {
          ensure(current).push({ type, count, gap, lane: idx, hpMul, boss: false });
          return api;
        },
        boss(type = 'Boss', hpMul = 8) {
          ensure(current).push({ type, count: 1, gap: 0, lane: idx, hpMul, boss: true });
          return api;
        },
      };
    },
    boss(type = 'Boss', lane = 0, hpMul = 8) {
      ensure(current).push({ type, count: 1, gap: 0, lane, hpMul, boss: true });
      return api;
    },
    build() {
      const result = {};
      const keys = Array.from(store.keys()).sort((a, b) => a - b);
      for (const key of keys) {
        result[key] = store.get(key).map((entry) => ({ ...entry }));
      }
      return result;
    },
  };
  return api;
}

function defineWaves(definer) {
  const builder = createWaveBuilder();
  definer(builder);
  return builder.build();
}

export function waveset_meadow_20() {
  return defineWaves((W) => {
    W.wave(1).spawn('Grunt', 8, 0.9);
    W.wave(2).spawn('Grunt', 10, 0.7).spawn('Runner', 4, 0.5, 0, 1.2);
    W.wave(3).spawn('Grunt', 12, 0.65).spawn('Runner', 6, 0.45, 0, 1.3);
    W.wave(4).spawn('Grunt', 10, 0.6).spawn('Shielded', 3, 1.2, 0, 1.4);
    W.wave(5).spawn('Runner', 8, 0.45, 0, 1.5).boss('Tank', 0, 4.5);
    W.wave(6).spawn('Grunt', 14, 0.55, 0, 1.2).spawn('Specter', 3, 1.1, 0, 1.3);
    W.wave(7).spawn('Runner', 10, 0.4, 0, 1.6).spawn('Shielded', 4, 1.0, 0, 1.6);
    W.wave(8).spawn('Grunt', 16, 0.5, 0, 1.4).spawn('Specter', 4, 0.9, 0, 1.6);
    W.wave(9).spawn('Runner', 12, 0.4, 0, 1.8).spawn('Shielded', 5, 0.9, 0, 1.8);
    W.wave(10).spawn('Specter', 6, 0.8, 0, 1.9).boss('Tank', 0, 6);
    W.wave(11).spawn('Grunt', 18, 0.45, 0, 1.7).spawn('Runner', 10, 0.35, 0, 2.0);
    W.wave(12).spawn('Shielded', 6, 0.9, 0, 2.0).spawn('Specter', 5, 0.85, 0, 2.1);
    W.wave(13).spawn('Runner', 16, 0.35, 0, 2.1).spawn('Grunt', 12, 0.5, 0, 2.2);
    W.wave(14).spawn('Shielded', 7, 0.8, 0, 2.3).spawn('Specter', 6, 0.85, 0, 2.4);
    W.wave(15).spawn('Runner', 14, 0.4, 0, 2.4).boss('Tank', 0, 7.5);
    W.wave(16).spawn('Shielded', 8, 0.75, 0, 2.6).spawn('Specter', 7, 0.8, 0, 2.6);
    W.wave(17).spawn('Runner', 18, 0.35, 0, 2.6).spawn('Grunt', 16, 0.45, 0, 2.6);
    W.wave(18).spawn('Shielded', 9, 0.7, 0, 2.8).spawn('Specter', 8, 0.75, 0, 2.9);
    W.wave(19).spawn('Runner', 20, 0.32, 0, 2.8).spawn('Shielded', 10, 0.7, 0, 3.0);
    W.wave(20).spawn('Specter', 10, 0.7, 0, 3.2).boss('Tank', 0, 9);
  });
}

export function waveset_canyon_20() {
  return defineWaves((W) => {
    W.wave(1).spawn('Grunt', 8, 0.85, 0, 1.0).lane(1).spawn('Grunt', 6, 0.9, 1, 1.0);
    W.wave(2).lane(0).spawn('Grunt', 10, 0.7, 1.1).lane(1).spawn('Runner', 6, 0.55, 1.2);
    W.wave(3).spawn('Runner', 8, 0.5, 0, 1.3).lane(1).spawn('Grunt', 12, 0.65, 1.2);
    W.wave(4).spawn('Shielded', 4, 1.0, 0, 1.4).lane(1).spawn('Runner', 8, 0.5, 1.4);
    W.wave(5).spawn('Runner', 10, 0.45, 0, 1.6).boss('Tank', 0, 5.5).lane(1).spawn('Grunt', 12, 0.6, 1.4);
    W.wave(6).lane(0).spawn('Shielded', 5, 0.9, 1.6).lane(1).spawn('Specter', 4, 0.85, 1.6);
    W.wave(7).spawn('Runner', 12, 0.45, 0, 1.8).lane(1).spawn('Shielded', 5, 0.9, 1.8);
    W.wave(8).lane(0).spawn('Specter', 5, 0.85, 2.0).lane(1).spawn('Runner', 10, 0.45, 2.0);
    W.wave(9).spawn('Shielded', 6, 0.85, 0, 2.0).lane(1).spawn('Specter', 6, 0.85, 2.1);
    W.wave(10).spawn('Runner', 12, 0.4, 0, 2.2).boss('Tank', 0, 7).lane(1).spawn('Shielded', 6, 0.85, 2.2);
    W.wave(11).lane(0).spawn('Specter', 7, 0.8, 2.3).lane(1).spawn('Runner', 12, 0.4, 2.3);
    W.wave(12).spawn('Shielded', 7, 0.8, 0, 2.5).lane(1).spawn('Specter', 7, 0.8, 2.6);
    W.wave(13).lane(0).spawn('Runner', 14, 0.38, 2.6).lane(1).spawn('Shielded', 8, 0.75, 2.6);
    W.wave(14).spawn('Specter', 8, 0.75, 0, 2.8).lane(1).spawn('Runner', 14, 0.35, 2.8);
    W.wave(15).spawn('Shielded', 8, 0.75, 0, 2.9).boss('Tank', 0, 8).lane(1).spawn('Specter', 8, 0.75, 2.9);
    W.wave(16).lane(0).spawn('Runner', 16, 0.35, 3.0).lane(1).spawn('Shielded', 9, 0.7, 3.0);
    W.wave(17).spawn('Specter', 9, 0.7, 0, 3.1).lane(1).spawn('Runner', 16, 0.33, 3.1);
    W.wave(18).lane(0).spawn('Shielded', 10, 0.7, 3.2).lane(1).spawn('Specter', 9, 0.7, 3.2);
    W.wave(19).spawn('Runner', 18, 0.32, 0, 3.2).lane(1).spawn('Shielded', 10, 0.68, 3.3);
    W.wave(20).spawn('Specter', 10, 0.68, 0, 3.4).boss('Tank', 0, 9).lane(1).spawn('Runner', 18, 0.3, 3.3);
  });
}

export function waveset_crossroads_20() {
  return defineWaves((W) => {
    W.wave(1).spawn('Grunt', 10, 0.8, 0, 1.1).lane(1).spawn('Grunt', 8, 0.85, 1.1);
    W.wave(2).lane(0).spawn('Runner', 6, 0.55, 1.2).lane(1).spawn('Grunt', 10, 0.7, 1.2);
    W.wave(3).spawn('Shielded', 3, 1.0, 0, 1.3).lane(1).spawn('Runner', 8, 0.5, 1.3);
    W.wave(4).lane(0).spawn('Runner', 10, 0.5, 1.4).lane(1).spawn('Shielded', 4, 0.95, 1.4);
    W.wave(5).spawn('Runner', 12, 0.45, 0, 1.6).boss('Tank', 0, 5.5).lane(1).spawn('Specter', 4, 0.9, 1.5);
    W.wave(6).lane(0).spawn('Shielded', 5, 0.9, 1.6).lane(1).spawn('Runner', 12, 0.45, 1.7);
    W.wave(7).spawn('Specter', 5, 0.85, 0, 1.8).lane(1).spawn('Shielded', 5, 0.85, 1.9);
    W.wave(8).lane(0).spawn('Runner', 14, 0.42, 2.0).lane(1).spawn('Specter', 6, 0.8, 2.0);
    W.wave(9).spawn('Shielded', 6, 0.82, 0, 2.1).lane(1).spawn('Runner', 14, 0.4, 2.1);
    W.wave(10).spawn('Specter', 6, 0.8, 0, 2.3).boss('Tank', 0, 7.5).lane(1).spawn('Shielded', 6, 0.8, 2.3);
    W.wave(11).lane(0).spawn('Runner', 16, 0.38, 2.4).lane(1).spawn('Specter', 7, 0.78, 2.4);
    W.wave(12).spawn('Shielded', 7, 0.78, 0, 2.6).lane(1).spawn('Runner', 16, 0.36, 2.6);
    W.wave(13).lane(0).spawn('Specter', 7, 0.75, 2.7).lane(1).spawn('Shielded', 8, 0.72, 2.7);
    W.wave(14).spawn('Runner', 18, 0.34, 0, 2.8).lane(1).spawn('Specter', 8, 0.75, 2.9);
    W.wave(15).spawn('Shielded', 8, 0.72, 0, 3.0).boss('Tank', 0, 8.5).lane(1).spawn('Runner', 18, 0.33, 3.0);
    W.wave(16).lane(0).spawn('Specter', 8, 0.72, 3.1).lane(1).spawn('Shielded', 9, 0.68, 3.1);
    W.wave(17).spawn('Runner', 20, 0.32, 0, 3.1).lane(1).spawn('Specter', 9, 0.72, 3.2);
    W.wave(18).lane(0).spawn('Shielded', 10, 0.68, 3.3).lane(1).spawn('Runner', 20, 0.3, 3.3);
    W.wave(19).spawn('Specter', 9, 0.7, 0, 3.4).lane(1).spawn('Shielded', 10, 0.66, 3.4);
    W.wave(20).spawn('Runner', 22, 0.3, 0, 3.5).boss('Tank', 0, 10).lane(1).spawn('Specter', 10, 0.68, 3.5);
  });
}
