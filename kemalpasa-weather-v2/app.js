import { fetchAllProviders } from './fetchProviders.js';
import { aggregateDaily, aggregateHourly, confidenceFromSpread } from './aggregate.js';
import { renderProviderStatuses, updateConfidenceBadge, updateSummary, notify } from './ui/status.js';
import { renderCharts } from './ui/charts.js';
import { initRadar } from './ui/radar.js';

const DEFAULT_COORDS = { lat: 38.426, lon: 27.417 };
const INPUT_DEBOUNCE = 500;
const PRECISION = 4;

const latInput = document.getElementById('latInput');
const lonInput = document.getElementById('lonInput');
const recalcButton = document.getElementById('recalcBtn');
const hourlyTableBody = document.querySelector('#hourlyTable tbody');
const dailyCards = document.getElementById('dailyCards');

let radarController;
let currentCoords = { ...DEFAULT_COORDS };
let debounceTimer = null;
let loadToken = 0;

function formatCoord(value) {
  return Number(value).toFixed(PRECISION);
}

function parseCoordinates() {
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function hourLabel(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.getHours().toString().padStart(2, '0');
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function renderHourlyTable(times, temp, precip, wind) {
  if (!hourlyTableBody) return;
  hourlyTableBody.replaceChildren();
  const limit = Math.min(24, times.length);
  for (let i = 0; i < limit; i += 1) {
    const row = document.createElement('tr');
    const hourCell = document.createElement('th');
    hourCell.scope = 'row';
    hourCell.textContent = hourLabel(times[i]);

    const tempCell = document.createElement('td');
    tempCell.textContent = fmt(temp[i]);

    const precipCell = document.createElement('td');
    precipCell.textContent = fmt(precip[i]);

    const windCell = document.createElement('td');
    windCell.textContent = fmt(wind[i]);

    row.append(hourCell, tempCell, precipCell, windCell);
    hourlyTableBody.appendChild(row);
  }
}

function renderDailyCards(daily) {
  if (!dailyCards) return;
  dailyCards.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < daily.time.length; i += 1) {
    const card = document.createElement('div');
    card.className = 'card';
    const date = new Date(daily.time[i]);
    const dateText = Number.isNaN(date.getTime())
      ? daily.time[i]
      : date.toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'short' });

    card.innerHTML = `
      <div class="day">${dateText}</div>
      <div class="big">${fmt(daily.tmax[i])} / ${fmt(daily.tmin[i])} °C</div>
      <div>Yağış toplamı: ${fmt(daily.psum[i])} mm</div>
      <div>Rüzgar maks: ${fmt(daily.wmax[i])} km/sa</div>
    `;
    fragment.appendChild(card);
  }
  dailyCards.appendChild(fragment);
}

function computeGeneralConfidence(hourlyAggregated) {
  const tempConf = confidenceFromSpread(hourlyAggregated.temp.spreads, 3);
  const precipConf = confidenceFromSpread(hourlyAggregated.precip.spreads, 3);
  const windConf = confidenceFromSpread(hourlyAggregated.wind.spreads, 8);
  const score = (tempConf.score + precipConf.score + windConf.score) / 3;
  let label = 'düşük';
  if (score >= 0.8) label = 'yüksek';
  else if (score >= 0.55) label = 'orta';
  return {
    label,
    score,
    spreads: {
      temp: tempConf,
      precip: precipConf,
      wind: windConf
    }
  };
}

async function loadForecast(coords, { silent = false } = {}) {
  const token = ++loadToken;
  if (!silent) notify('info', 'Veriler getiriliyor…');
  try {
    const { datasets, statuses } = await fetchAllProviders(coords.lat, coords.lon);
    if (token !== loadToken) return;
    renderProviderStatuses(statuses);
    if (!datasets.length) {
      notify('warn', 'Sağlayıcı verisi alınamadı.');
      updateConfidenceBadge({ label: null, spreads: { temp: { averageSpread: 0, scale: 3 }, precip: { averageSpread: 0, scale: 3 }, wind: { averageSpread: 0, scale: 8 } }, score: 0 });
      updateSummary({ coords: `${formatCoord(coords.lat)}, ${formatCoord(coords.lon)}`, updated: '—' });
      return;
    }

    const hourlySeries = datasets.map((entry) => entry.hourly);
    const dailySeries = datasets.map((entry) => entry.daily);
    const hourly = aggregateHourly(hourlySeries);
    const daily = aggregateDaily(dailySeries);

    renderHourlyTable(hourly.time, hourly.temp.series, hourly.precip.series, hourly.wind.series);
    renderDailyCards(daily);
    renderCharts(hourly.time, {
      temp: hourly.temp.series,
      precip: hourly.precip.series,
      wind: hourly.wind.series
    });

    const confidence = computeGeneralConfidence(hourly);
    updateConfidenceBadge(confidence);

    const coordsText = `${formatCoord(coords.lat)}, ${formatCoord(coords.lon)}`;
    const newest = statuses.reduce((max, status) => {
      if (!status.lastUpdated) return max;
      const value = status.lastUpdated instanceof Date ? status.lastUpdated.getTime() : new Date(status.lastUpdated).getTime();
      return Number.isNaN(value) ? max : Math.max(max, value);
    }, 0);
    const updatedText = newest
      ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(newest))
      : new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    updateSummary({ coords: coordsText, updated: updatedText });

    currentCoords = coords;
    if (radarController) {
      radarController.updateCoordinates(coords.lat, coords.lon);
    }
    recalcButton.classList.add('is-hidden');
    notify('success', 'Veriler güncellendi.');
  } catch (error) {
    if (token !== loadToken) return;
    notify('error', 'Veriler alınırken hata oluştu.');
  }
}

function scheduleInputLoad() {
  recalcButton.classList.add('is-hidden');
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const coords = parseCoordinates();
    if (!coords) {
      if (latInput.value !== '' && lonInput.value !== '') {
        notify('warn', 'Geçerli koordinat girin.');
      }
      return;
    }
    loadForecast(coords, { silent: true });
  }, INPUT_DEBOUNCE);
}

function handleMapSelect(lat, lon) {
  latInput.value = formatCoord(lat);
  lonInput.value = formatCoord(lon);
  recalcButton.classList.remove('is-hidden');
  notify('info', 'Yeni koordinat seçildi. "Yeniden Hesapla" butonuna basın.');
}

function initInputs() {
  latInput.value = formatCoord(DEFAULT_COORDS.lat);
  lonInput.value = formatCoord(DEFAULT_COORDS.lon);
  latInput.addEventListener('input', scheduleInputLoad);
  lonInput.addEventListener('input', scheduleInputLoad);
  recalcButton.addEventListener('click', () => {
    const coords = parseCoordinates();
    if (!coords) {
      notify('warn', 'Geçerli koordinat girin.');
      return;
    }
    loadForecast(coords);
  });
}

function startup() {
  initInputs();
  radarController = initRadar({
    lat: DEFAULT_COORDS.lat,
    lon: DEFAULT_COORDS.lon,
    onSelect: handleMapSelect
  });
  loadForecast(DEFAULT_COORDS);
}

startup();
