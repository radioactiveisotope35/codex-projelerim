export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function stdev(values) {
  const filtered = values.filter(Number.isFinite);
  if (filtered.length < 2) return 0;
  const mean = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  const variance = filtered.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (filtered.length - 1);
  return Math.sqrt(variance);
}

export function alignTimes(seriesList) {
  if (!seriesList.length) return [];
  const [first, ...rest] = seriesList;
  const base = first.time;
  if (!base || !base.length) return [];
  const sets = rest.map((series) => new Set(series.time));
  return base.filter((timestamp) => sets.every((set) => set.has(timestamp))).sort();
}

function buildLookup(series) {
  const map = new Map();
  for (let i = 0; i < series.time.length; i += 1) {
    map.set(series.time[i], i);
  }
  return map;
}

function aggregateByKey(alignedTimes, lookups, key) {
  const series = [];
  const spreads = [];
  for (let i = 0; i < alignedTimes.length; i += 1) {
    const timestamp = alignedTimes[i];
    const sample = [];
    for (let j = 0; j < lookups.length; j += 1) {
      const { dataset, indexMap } = lookups[j];
      const idx = indexMap.get(timestamp);
      if (idx === undefined) continue;
      const value = dataset[key][idx];
      if (Number.isFinite(value)) {
        sample.push(value);
      }
    }
    series.push(sample.length ? median(sample) : NaN);
    spreads.push(sample.length ? stdev(sample) : 0);
  }
  return { series, spreads };
}

function aggregateCode(alignedTimes, lookups) {
  const codes = [];
  for (let i = 0; i < alignedTimes.length; i += 1) {
    const timestamp = alignedTimes[i];
    const sample = [];
    for (let j = 0; j < lookups.length; j += 1) {
      const { dataset, indexMap } = lookups[j];
      const idx = indexMap.get(timestamp);
      if (idx === undefined) continue;
      const value = dataset.code[idx];
      if (Number.isFinite(value)) sample.push(value);
    }
    codes.push(sample.length ? median(sample) : NaN);
  }
  return codes;
}

export function aggregateHourly(seriesList) {
  if (!seriesList.length) {
    return {
      time: [],
      temp: { series: [], spreads: [] },
      precip: { series: [], spreads: [] },
      wind: { series: [], spreads: [] },
      code: []
    };
  }
  const aligned = alignTimes(seriesList);
  const lookups = seriesList.map((dataset) => ({ dataset, indexMap: buildLookup(dataset) }));
  return {
    time: aligned,
    temp: aggregateByKey(aligned, lookups, 'temp'),
    precip: aggregateByKey(aligned, lookups, 'precip'),
    wind: aggregateByKey(aligned, lookups, 'wind'),
    code: aggregateCode(aligned, lookups)
  };
}

export function aggregateDaily(seriesList) {
  if (!seriesList.length) {
    return {
      time: [],
      tmax: [],
      tmin: [],
      psum: [],
      wmax: [],
      code: []
    };
  }
  const aligned = alignTimes(seriesList);
  const lookups = seriesList.map((dataset) => ({ dataset, indexMap: buildLookup(dataset) }));
  const tmax = aggregateByKey(aligned, lookups, 'tmax').series;
  const tmin = aggregateByKey(aligned, lookups, 'tmin').series;
  const psum = aggregateByKey(aligned, lookups, 'psum').series;
  const wmax = aggregateByKey(aligned, lookups, 'wmax').series;
  const code = aggregateCode(aligned, lookups);
  return { time: aligned, tmax, tmin, psum, wmax, code };
}

export function confidenceFromSpread(spreadArray, scale) {
  const relevant = spreadArray.slice(0, 24).filter(Number.isFinite);
  const avgSpread = relevant.length ? relevant.reduce((sum, value) => sum + value, 0) / relevant.length : 0;
  const score = Math.max(0, 1 - avgSpread / scale);
  let label = 'düşük';
  if (score >= 0.8) label = 'yüksek';
  else if (score >= 0.55) label = 'orta';
  return { score, label, averageSpread: avgSpread, scale };
}
