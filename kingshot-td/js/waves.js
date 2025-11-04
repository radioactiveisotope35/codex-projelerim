function createBuilder() {
  const waves = {};
  let current = 1;

  const api = {
    spawn(type, count = 10, gap = 0.6, lane = 0, hpMul = 1) {
      if (!waves[current]) waves[current] = [];
      waves[current].push({ type, count, gap, lane, hpMul, boss: false });
      return api;
    },
    boss(type = 'Boss', lane = 0, hpMul = 8) {
      if (!waves[current]) waves[current] = [];
      waves[current].push({ type, count: 1, gap: 1.2, lane, hpMul, boss: true });
      return api;
    }
  };

  function w(n) {
    current = n;
    if (!waves[current]) waves[current] = [];
    return api;
  }

  function build() {
    return waves;
  }

  return { w, build };
}

function makeSet(definition) {
  const { w, build } = createBuilder();
  definition(w);
  return build();
}

export function waveset_meadow_20() {
  return makeSet(w => {
    w(1).spawn('Grunt', 12, 0.8, 0, 1);
    w(2).spawn('Runner', 14, 0.6, 0, 1.1);
    w(3).spawn('Grunt', 10, 0.5, 0, 1.3).spawn('Runner', 6, 0.6, 0, 1.3);
    w(4).spawn('Shielded', 8, 0.7, 0, 1.4);
    w(5).boss('Tank', 0, 6);
    w(6).spawn('Runner', 18, 0.45, 0, 1.6);
    w(7).spawn('Grunt', 14, 0.55, 0, 1.8).spawn('Shielded', 6, 0.8, 0, 1.8);
    w(8).spawn('Specter', 10, 0.7, 0, 1.9);
    w(9).spawn('Tank', 6, 0.9, 0, 2.2).spawn('Runner', 10, 0.55, 0, 2);
    w(10).boss('Tank', 0, 9);
    w(11).spawn('Grunt', 20, 0.5, 0, 2.4);
    w(12).spawn('Shielded', 12, 0.6, 0, 2.6).spawn('Runner', 10, 0.5, 0, 2.5);
    w(13).spawn('Specter', 14, 0.55, 0, 2.7);
    w(14).spawn('Tank', 8, 0.8, 0, 3);
    w(15).boss('Specter', 0, 10);
    w(16).spawn('Runner', 22, 0.45, 0, 3.2);
    w(17).spawn('Shielded', 16, 0.55, 0, 3.4);
    w(18).spawn('Grunt', 24, 0.45, 0, 3.6).spawn('Specter', 10, 0.6, 0, 3.5);
    w(19).spawn('Tank', 10, 0.8, 0, 3.8);
    w(20).boss('Tank', 0, 12);
  });
}

export function waveset_canyon_20() {
  return makeSet(w => {
    w(1).spawn('Grunt', 14, 0.8, 0, 1);
    w(2).spawn('Runner', 12, 0.55, 1, 1.2);
    w(3).spawn('Grunt', 12, 0.6, 0, 1.3).spawn('Runner', 8, 0.6, 1, 1.3);
    w(4).spawn('Shielded', 10, 0.7, 0, 1.5);
    w(5).boss('Tank', 0, 6.5);
    w(6).spawn('Runner', 18, 0.45, 1, 1.7);
    w(7).spawn('Grunt', 18, 0.5, 0, 1.9);
    w(8).spawn('Specter', 12, 0.6, 1, 2.1);
    w(9).spawn('Tank', 8, 0.85, 0, 2.3);
    w(10).boss('Specter', 1, 9);
    w(11).spawn('Shielded', 16, 0.55, 0, 2.5);
    w(12).spawn('Runner', 20, 0.45, 1, 2.6);
    w(13).spawn('Grunt', 22, 0.5, 0, 2.8);
    w(14).spawn('Specter', 16, 0.5, 1, 3);
    w(15).boss('Tank', 0, 11);
    w(16).spawn('Runner', 24, 0.4, 1, 3.2);
    w(17).spawn('Shielded', 18, 0.55, 0, 3.4);
    w(18).spawn('Tank', 10, 0.75, 0, 3.6).spawn('Runner', 12, 0.5, 1, 3.6);
    w(19).spawn('Specter', 18, 0.55, 1, 3.8);
    w(20).boss('Specter', 1, 12);
  });
}

export function waveset_crossroads_20() {
  return makeSet(w => {
    w(1).spawn('Grunt', 16, 0.75, 0, 1);
    w(2).spawn('Runner', 16, 0.55, 1, 1.1);
    w(3).spawn('Shielded', 10, 0.65, 0, 1.3);
    w(4).spawn('Specter', 10, 0.65, 1, 1.4);
    w(5).boss('Tank', 0, 6);
    w(6).spawn('Runner', 22, 0.45, 0, 1.6).spawn('Runner', 10, 0.6, 1, 1.6);
    w(7).spawn('Grunt', 20, 0.5, 0, 1.8).spawn('Shielded', 8, 0.6, 1, 1.8);
    w(8).spawn('Specter', 14, 0.55, 1, 2);
    w(9).spawn('Tank', 10, 0.8, 0, 2.2);
    w(10).boss('Specter', 1, 9);
    w(11).spawn('Runner', 26, 0.4, 0, 2.4).spawn('Runner', 10, 0.5, 1, 2.4);
    w(12).spawn('Shielded', 18, 0.55, 0, 2.6);
    w(13).spawn('Specter', 18, 0.5, 1, 2.8);
    w(14).spawn('Tank', 12, 0.75, 0, 3);
    w(15).boss('Tank', 0, 11);
    w(16).spawn('Runner', 28, 0.4, 0, 3.2).spawn('Runner', 12, 0.55, 1, 3.2);
    w(17).spawn('Shielded', 20, 0.5, 0, 3.4);
    w(18).spawn('Specter', 20, 0.5, 1, 3.6);
    w(19).spawn('Tank', 12, 0.7, 0, 3.8);
    w(20).boss('Specter', 1, 12);
  });
}

export function wavesByName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('canyon')) return waveset_canyon_20();
  if (n.includes('cross')) return waveset_crossroads_20();
  return waveset_meadow_20();
}
