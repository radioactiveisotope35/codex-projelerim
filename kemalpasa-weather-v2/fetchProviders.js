const OPEN_METEO_MODELS = [
  { key: 'ecmwf', name: 'ECMWF', url: 'https://api.open-meteo.com/v1/ecmwf' },
  { key: 'icon', name: 'ICON', url: 'https://api.open-meteo.com/v1/dwd-icon' },
  { key: 'gfs', name: 'GFS', url: 'https://api.open-meteo.com/v1/gfs' }
];

const MET_PROVIDER = { key: 'metno', name: 'MET Norway', url: 'https://api.met.no/weatherapi/locationforecast/2.0/compact' };

const HOURLY_VARS = ['temperature_2m', 'precipitation', 'wind_speed_10m', 'weather_code'];
const DAILY_VARS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_speed_10m_max', 'weather_code'];
const FETCH_TIMEOUT = 8000;
const CACHE_TTL = 45 * 60 * 1000;

let metDisabledReason = null;

export function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  const opts = { ...options, signal: controller.signal };
  return fetch(url, opts).finally(() => clearTimeout(timeout));
}

function buildOpenMeteoParams(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    timezone: 'auto',
    hourly: HOURLY_VARS.join(','),
    daily: DAILY_VARS.join(','),
    past_days: '1',
    forecast_days: '7'
  });
  return params.toString();
}

function getCacheKey(modelKey, params) {
  return `om_${modelKey}_${params}`;
}

function sanitizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function normalizeOpenMeteo(modelKey, raw) {
  const hourlyTime = Array.isArray(raw?.hourly?.time) ? raw.hourly.time : [];
  const dailyTime = Array.isArray(raw?.daily?.time) ? raw.daily.time : [];

  const hourly = {
    time: hourlyTime.slice(),
    temp: hourlyTime.map((_, i) => sanitizeNumber(raw.hourly?.temperature_2m?.[i])),
    precip: hourlyTime.map((_, i) => sanitizeNumber(raw.hourly?.precipitation?.[i])),
    wind: hourlyTime.map((_, i) => sanitizeNumber(raw.hourly?.wind_speed_10m?.[i])),
    code: hourlyTime.map((_, i) => sanitizeNumber(raw.hourly?.weather_code?.[i]))
  };

  const daily = {
    time: dailyTime.slice(),
    tmax: dailyTime.map((_, i) => sanitizeNumber(raw.daily?.temperature_2m_max?.[i])),
    tmin: dailyTime.map((_, i) => sanitizeNumber(raw.daily?.temperature_2m_min?.[i])),
    psum: dailyTime.map((_, i) => sanitizeNumber(raw.daily?.precipitation_sum?.[i])),
    wmax: dailyTime.map((_, i) => sanitizeNumber(raw.daily?.wind_speed_10m_max?.[i])),
    code: dailyTime.map((_, i) => sanitizeNumber(raw.daily?.weather_code?.[i]))
  };

  return { provider: modelKey, hourly, daily };
}

function aggregateDailyFromMet(hourly) {
  const dayMap = new Map();
  for (let i = 0; i < hourly.time.length; i += 1) {
    const ts = hourly.time[i];
    if (!ts) continue;
    const day = ts.slice(0, 10);
    let bucket = dayMap.get(day);
    if (!bucket) {
      bucket = { tmax: -Infinity, tmin: Infinity, psum: 0, wmax: 0 };
      dayMap.set(day, bucket);
    }
    const temp = hourly.temp[i];
    const precip = hourly.precip[i];
    const wind = hourly.wind[i];
    if (Number.isFinite(temp)) {
      if (temp > bucket.tmax) bucket.tmax = temp;
      if (temp < bucket.tmin) bucket.tmin = temp;
    }
    if (Number.isFinite(precip)) bucket.psum += precip;
    if (Number.isFinite(wind) && wind > bucket.wmax) bucket.wmax = wind;
  }
  const sortedKeys = Array.from(dayMap.keys()).sort();
  return {
    time: sortedKeys,
    tmax: sortedKeys.map((k) => (dayMap.get(k).tmax === -Infinity ? NaN : dayMap.get(k).tmax)),
    tmin: sortedKeys.map((k) => (dayMap.get(k).tmin === Infinity ? NaN : dayMap.get(k).tmin)),
    psum: sortedKeys.map((k) => dayMap.get(k).psum),
    wmax: sortedKeys.map((k) => dayMap.get(k).wmax),
    code: sortedKeys.map(() => NaN)
  };
}

function normalizeMetNorway(raw) {
  const timeseries = raw?.properties?.timeseries ?? [];
  const time = [];
  const temp = [];
  const precip = [];
  const wind = [];
  const code = [];
  for (let i = 0; i < timeseries.length; i += 1) {
    const entry = timeseries[i];
    const timestamp = entry?.time;
    if (!timestamp) continue;
    time.push(timestamp);
    temp.push(sanitizeNumber(entry?.data?.instant?.details?.air_temperature));
    precip.push(sanitizeNumber(entry?.data?.next_1_hours?.details?.precipitation_amount));
    const windValue = sanitizeNumber(entry?.data?.instant?.details?.wind_speed);
    wind.push(Number.isFinite(windValue) ? windValue * 3.6 : NaN);
    code.push(NaN);
  }
  const hourly = { time, temp, precip, wind, code };
  const daily = aggregateDailyFromMet(hourly);
  return { provider: MET_PROVIDER.key, hourly, daily };
}

async function fetchOpenMeteoModel(model, params) {
  const cacheKey = getCacheKey(model.key, params);
  const cachedRaw = sessionStorage.getItem(cacheKey);
  if (cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw);
      if (Date.now() - parsed.timestamp < CACHE_TTL && parsed.data) {
        return {
          dataset: { ...normalizeOpenMeteo(model.key, parsed.data), latencyMs: 0, updatedAt: new Date(parsed.timestamp) },
          status: { key: model.key, name: model.name, state: 'AKTİF', latencyMs: 0, lastUpdated: new Date(parsed.timestamp), detail: 'Önbellek' }
        };
      }
    } catch (err) {
      sessionStorage.removeItem(cacheKey);
    }
  }

  const start = performance.now();
  try {
    const response = await fetchWithTimeout(`${model.url}?${params}`, { cache: 'no-store' });
    const latency = performance.now() - start;
    if (!response.ok) {
      return {
        dataset: null,
        status: { key: model.key, name: model.name, state: 'HATA', latencyMs: latency, lastUpdated: null, detail: `Hata ${response.status}` }
      };
    }
    const json = await response.json();
    sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: json }));
    return {
      dataset: { ...normalizeOpenMeteo(model.key, json), latencyMs: latency, updatedAt: new Date() },
      status: { key: model.key, name: model.name, state: 'AKTİF', latencyMs: latency, lastUpdated: new Date(), detail: null }
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        dataset: null,
        status: { key: model.key, name: model.name, state: 'TIMEOUT', latencyMs: null, lastUpdated: null, detail: '8 sn sınır aşıldı' }
      };
    }
    return {
      dataset: null,
      status: { key: model.key, name: model.name, state: 'HATA', latencyMs: null, lastUpdated: null, detail: 'Bağlantı hatası' }
    };
  }
}

async function fetchMetNorway(lat, lon) {
  if (metDisabledReason) {
    return {
      dataset: null,
      status: { key: MET_PROVIDER.key, name: MET_PROVIDER.name, state: 'PASİF', latencyMs: null, lastUpdated: null, detail: metDisabledReason }
    };
  }

  const url = new URL(MET_PROVIDER.url);
  url.searchParams.set('lat', lat.toFixed(4));
  url.searchParams.set('lon', lon.toFixed(4));

  const start = performance.now();
  try {
    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: 'application/json' }
    });
    const latency = performance.now() - start;
    if (!response.ok) {
      if ([403, 429].includes(response.status)) {
        metDisabledReason = `Pasif (${response.status})`;
        return {
          dataset: null,
          status: { key: MET_PROVIDER.key, name: MET_PROVIDER.name, state: 'PASİF', latencyMs: null, lastUpdated: null, detail: metDisabledReason }
        };
      }
      return {
        dataset: null,
        status: { key: MET_PROVIDER.key, name: MET_PROVIDER.name, state: 'HATA', latencyMs: latency, lastUpdated: null, detail: `Hata ${response.status}` }
      };
    }
    const json = await response.json();
    return {
      dataset: { ...normalizeMetNorway(json), latencyMs: latency, updatedAt: new Date() },
      status: { key: MET_PROVIDER.key, name: MET_PROVIDER.name, state: 'AKTİF', latencyMs: latency, lastUpdated: new Date(), detail: null }
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        dataset: null,
        status: { key: MET_PROVIDER.key, name: MET_PROVIDER.name, state: 'TIMEOUT', latencyMs: null, lastUpdated: null, detail: '8 sn sınır aşıldı' }
      };
    }
    if (error instanceof TypeError) {
      metDisabledReason = 'CORS engeli';
      return {
        dataset: null,
        status: { key: MET_PROVIDER.key, name: MET_PROVIDER.name, state: 'PASİF', latencyMs: null, lastUpdated: null, detail: metDisabledReason }
      };
    }
    return {
      dataset: null,
      status: { key: MET_PROVIDER.key, name: MET_PROVIDER.name, state: 'HATA', latencyMs: null, lastUpdated: null, detail: 'Bağlantı hatası' }
    };
  }
}

export async function fetchAllProviders(lat, lon) {
  const params = buildOpenMeteoParams(lat, lon);
  const tasks = OPEN_METEO_MODELS.map((model) => fetchOpenMeteoModel(model, params));
  tasks.push(fetchMetNorway(lat, lon));

  const results = await Promise.all(tasks);
  const datasets = [];
  const statuses = [];

  for (const result of results) {
    if (!result) continue;
    statuses.push(result.status);
    if (result.dataset) {
      datasets.push(result.dataset);
    }
  }

  return { datasets, statuses };
}

export function resetMetDisable() {
  metDisabledReason = null;
}
