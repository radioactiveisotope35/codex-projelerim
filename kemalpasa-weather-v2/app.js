// Ensemble + Radar viewer (no keys)
// Providers:
//  - Open-Meteo: ECMWF, ICON, GFS (public, no key)
//  - MET Norway (best-effort from browser; UA policy may block; we fail gracefully)
// Radar: RainViewer tiles on Leaflet map

const DEFAULT_COORDS = { lat: 38.426, lon: 27.417 };
const TZ = "auto";
const OM_MODELS = {
  ecmwf: "https://api.open-meteo.com/v1/ecmwf",
  icon:  "https://api.open-meteo.com/v1/dwd-icon",
  gfs:   "https://api.open-meteo.com/v1/gfs"
};
const HOURLY_VARS = ["temperature_2m","precipitation","wind_speed_10m","weather_code"];
const DAILY_VARS  = ["temperature_2m_max","temperature_2m_min","precipitation_sum","wind_speed_10m_max","weather_code"];

const stateEl = document.getElementById("status");
const latEl = document.getElementById("lat");
const lonEl = document.getElementById("lon");
const hourlyEl = document.getElementById("hourly");
const dailyEl = document.getElementById("daily");
const summaryEl = document.getElementById("summary");
const reloadBtn = document.getElementById("reload");

let map, radarLayer, marker;
let tempChart, precChart, windChart;

function fmt(n, d=1){ return (n===undefined || n===null || Number.isNaN(n)) ? "—" : Number(n).toFixed(d); }
function med(arr){ const a = arr.filter(x=>Number.isFinite(x)).sort((x,y)=>x-y); if(!a.length) return NaN; const m = Math.floor(a.length/2); return a.length%2 ? a[m] : (a[m-1]+a[m])/2; }
function stdev(arr){ const a = arr.filter(x=>Number.isFinite(x)); if(a.length<2) return 0; const mean = a.reduce((s,x)=>s+x,0)/a.length; const v = a.reduce((s,x)=>s+(x-mean)**2,0)/(a.length-1); return Math.sqrt(v); }
function uniq(a){ return Array.from(new Set(a)); }

function buildOMParams(lat, lon){
  const p = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: TZ,
    hourly: HOURLY_VARS.join(","),
    daily: DAILY_VARS.join(","),
    forecast_days: "7",
    past_days: "1"
  });
  return p.toString();
}

async function fetchOpenMeteoModel(name, url, params){
  const key = `om_${name}_${params}`;
  const cached = sessionStorage.getItem(key);
  if(cached){
    try { const o = JSON.parse(cached); if(Date.now()-o.ts < 45*60*1000) return o.data; } catch {}
  }
  const res = await fetch(`${url}?${params}`);
  if(!res.ok) throw new Error(`${name} ${res.status}`);
  const data = await res.json();
  sessionStorage.setItem(key, JSON.stringify({ts: Date.now(), data}));
  return data;
}

async function fetchMETNO(lat, lon){
  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  const res = await fetch(url, { headers: { "Accept":"application/json" } });
  if(!res.ok) throw new Error("metno "+res.status);
  const j = await res.json();
  const ts = j?.properties?.timeseries ?? [];
  // Hourly
  const time = ts.map(x => x?.time);
  const temp = ts.map(x => x?.data?.instant?.details?.air_temperature ?? NaN);
  const wind = ts.map(x => (x?.data?.instant?.details?.wind_speed ?? 0)*3.6); // m/s -> km/h
  const precip = ts.map(x => x?.data?.next_1_hours?.details?.precipitation_amount ?? 0);
  const code = ts.map(_ => NaN); // WMO'ya kolay dönüş yok, NA bırakıyoruz
  // Daily aggregate from hourly
  const byDay = {};
  for(let i=0;i<time.length;i++){
    const d = time[i]?.slice(0,10);
    if(!byDay[d]) byDay[d] = {tmax:-1e9, tmin:1e9, psum:0, wmax:0};
    byDay[d].tmax = Math.max(byDay[d].tmax, temp[i] ?? -1e9);
    byDay[d].tmin = Math.min(byDay[d].tmin, temp[i] ?? 1e9);
    byDay[d].psum += precip[i] ?? 0;
    byDay[d].wmax = Math.max(byDay[d].wmax, wind[i] ?? 0);
  }
  const dkeys = Object.keys(byDay).sort();
  return {
    provider: "metno",
    hourly: { time, temp, precip, wind, code },
    daily: {
      time: dkeys,
      tmax: dkeys.map(k => byDay[k].tmax),
      tmin: dkeys.map(k => byDay[k].tmin),
      psum: dkeys.map(k => byDay[k].psum),
      wmax: dkeys.map(k => byDay[k].wmax),
      code: dkeys.map(_ => NaN)
    }
  };
}

function alignTimes(seriesList){
  if(seriesList.length === 0) return [];
  const sets = seriesList.map(s => new Set(s.time));
  const all = Array.from(new Set(seriesList.flatMap(s => s.time)));
  return all.filter(t => sets.every(S => S.has(t))).sort();
}

function aggregateHour(seriesList){
  const time = alignTimes(seriesList);
  function agg(key){
    const series=[], spread=[];
    for(let i=0;i<time.length;i++){
      const vals = seriesList.map(s => s[key][s.time.indexOf(time[i])]).filter(Number.isFinite);
      series.push(med(vals));
      spread.push(stdev(vals));
    }
    return {series, spread};
  }
  const temp = agg("temp");
  const prec = agg("precip");
  const wind = agg("wind");
  const code = seriesList.length ? time.map((t,i)=> med(seriesList.map(s => s.code[s.time.indexOf(t)]).filter(Number.isFinite))) : [];
  return { time, temp, prec, wind, code };
}

function aggregateDay(dailyList){
  if(dailyList.length===0) return {time:[], tmax:[], tmin:[], psum:[], wmax:[], wcode:[]};
  const time = alignTimes(dailyList);
  function dagg(key){
    return time.map(t => med(dailyList.map(s => s[key][s.time.indexOf(t)]).filter(Number.isFinite)));
  }
  return {
    time,
    tmax: dagg("tmax"),
    tmin: dagg("tmin"),
    psum: dagg("psum"),
    wmax: dagg("wmax"),
    wcode: dagg("code")
  };
}

function confidenceFromSpread(spreadArr, scale){
  const avg = spreadArr.slice(0,24).filter(Number.isFinite).reduce((a,b)=>a+b,0) / Math.max(1, Math.min(24, spreadArr.length));
  const score = Math.max(0, 1 - (avg/scale));
  const level = score>=0.8 ? "yüksek" : score>=0.55 ? "orta" : "düşük";
  return {score, level};
}

function renderHourly(times, s){
  const rows = [];
  for(let i=0;i<Math.min(times.length, 24);i++){
    const t = new Date(times[i]);
    const hh = t.getHours().toString().padStart(2,"0");
    rows.push(`<tr>
      <td>${t.toLocaleDateString(undefined,{weekday:"short"})} ${hh}:00</td>
      <td>${fmt(s.temp[i])}°C</td>
      <td>${fmt(s.prec[i])} mm</td>
      <td>${fmt(s.wind[i])} km/sa</td>
    </tr>`);
  }
  hourlyEl.innerHTML = `<table class="hourly"><thead>
    <tr><th>Saat</th><th>Sıcaklık</th><th>Yağış</th><th>Rüzgar</th></tr>
  </thead><tbody>${rows.join("")}</tbody></table>`;
}

function renderDaily(d){
  const cards = [];
  for(let i=0;i<d.time.length;i++){
    cards.push(`<div class="card">
      <div class="day">${new Date(d.time[i]).toLocaleDateString(undefined,{weekday:"long", day:"2-digit", month:"short"})}</div>
      <div class="big">${fmt(d.tmax[i])} / ${fmt(d.tmin[i])} °C</div>
      <div>Yağış toplam: ${fmt(d.psum[i])} mm</div>
      <div>Rüzgar max: ${fmt(d.wmax[i])} km/sa</div>
    </div>`);
  }
  dailyEl.innerHTML = cards.join("");
}

function renderSummary(lat, lon, providers, conf){
  const card = document.createElement("div");
  card.className = "card wide";
  card.innerHTML = `<div><strong>Konum:</strong> ${lat.toFixed(4)}, ${lon.toFixed(4)} | <strong>Sağlayıcılar:</strong> ${providers.join(", ")}</div>
                    <div><strong>Genel Güven:</strong> <span class="conf ${conf.level}">${conf.level}</span></div>`;
  summaryEl.replaceChildren(card);
}

function drawCharts(times, s){
  const labels = times.slice(0,24).map(t => new Date(t).getHours().toString().padStart(2,"0"));
  const temp = s.temp.slice(0,24).map(x => Number.isFinite(x)?x:null);
  const prec = s.prec.slice(0,24).map(x => Number.isFinite(x)?x:null);
  const wind = s.wind.slice(0,24).map(x => Number.isFinite(x)?x:null);

  const tctx = document.getElementById("tempChart").getContext("2d");
  const pctx = document.getElementById("precChart").getContext("2d");
  const wctx = document.getElementById("windChart").getContext("2d");

  if(tempChart) tempChart.destroy();
  if(precChart) precChart.destroy();
  if(windChart) windChart.destroy();

  tempChart = new Chart(tctx, { type: "line", data: { labels, datasets: [{ label:"°C", data: temp }]}, options: { responsive:true, plugins:{legend:{display:false}} } });
  precChart = new Chart(pctx, { type: "bar",  data: { labels, datasets: [{ label:"mm", data: prec }]}, options: { responsive:true, plugins:{legend:{display:false}} } });
  windChart = new Chart(wctx, { type: "line", data: { labels, datasets: [{ label:"km/sa", data: wind }]}, options: { responsive:true, plugins:{legend:{display:false}} } });
}

function initMap(lat, lon){
  if(!map){
    map = L.map('map', { zoomControl: true }).setView([lat, lon], 9);
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    radarLayer = L.tileLayer('https://tilecache.rainviewer.com/v2/radar/nowcast_0/256/{z}/{x}/{y}/0/0_0.png', {
      opacity: 0.7, attribution: 'RainViewer'
    }).addTo(map);
    marker = L.marker([lat, lon]).addTo(map);
  } else {
    map.setView([lat, lon], 9);
    marker.setLatLng([lat, lon]);
  }
}

async function load(lat, lon){
  stateEl.textContent = "Veri çekiliyor…";
  initMap(lat, lon);

  const params = buildOMParams(lat, lon);
  const tasks = [
    fetchOpenMeteoModel("ecmwf", OM_MODELS.ecmwf, params).then(d => ({
      provider: "ecmwf",
      hourly: { time: d.hourly.time, temp: d.hourly.temperature_2m, precip: d.hourly.precipitation, wind: d.hourly.wind_speed_10m, code: d.hourly.weather_code },
      daily:  { time: d.daily.time,  tmax: d.daily.temperature_2m_max, tmin: d.daily.temperature_2m_min, psum: d.daily.precipitation_sum, wmax: d.daily.wind_speed_10m_max, code: d.daily.weather_code }
    })).catch(()=>null),
    fetchOpenMeteoModel("icon", OM_MODELS.icon, params).then(d => ({
      provider: "icon",
      hourly: { time: d.hourly.time, temp: d.hourly.temperature_2m, precip: d.hourly.precipitation, wind: d.hourly.wind_speed_10m, code: d.hourly.weather_code },
      daily:  { time: d.daily.time,  tmax: d.daily.temperature_2m_max, tmin: d.daily.temperature_2m_min, psum: d.daily.precipitation_sum, wmax: d.daily.wind_speed_10m_max, code: d.daily.weather_code }
    })).catch(()=>null),
    fetchOpenMeteoModel("gfs", OM_MODELS.gfs, params).then(d => ({
      provider: "gfs",
      hourly: { time: d.hourly.time, temp: d.hourly.temperature_2m, precip: d.hourly.precipitation, wind: d.hourly.wind_speed_10m, code: d.hourly.weather_code },
      daily:  { time: d.daily.time,  tmax: d.daily.temperature_2m_max, tmin: d.daily.temperature_2m_min, psum: d.daily.precipitation_sum, wmax: d.daily.wind_speed_10m_max, code: d.daily.weather_code }
    })).catch(()=>null),
    fetchMETNO(lat, lon).catch(()=>null)
  ];

  const results = (await Promise.all(tasks)).filter(Boolean);
  const providers = results.map(r => r.provider.toUpperCase());

  if(results.length === 0){
    stateEl.textContent = "Sağlayıcı bulunamadı.";
    return;
  }

  const hourlyAgg = aggregateHour(results.map(r => r.hourly));
  const dailyAgg = aggregateDay(results.map(r => r.daily));

  renderHourly(hourlyAgg.time, { temp: hourlyAgg.temp.series, prec: hourlyAgg.prec.series, wind: hourlyAgg.wind.series });
  renderDaily({ time: dailyAgg.time, tmax: dailyAgg.tmax, tmin: dailyAgg.tmin, psum: dailyAgg.psum, wmax: dailyAgg.wmax });

  const confT = confidenceFromSpread(hourlyAgg.temp.spread, 3);
  const confP = confidenceFromSpread(hourlyAgg.prec.spread, 3);
  const confW = confidenceFromSpread(hourlyAgg.wind.spread, 8);
  const avg = (confT.score + confP.score + confW.score)/3;
  const level = avg>=0.8 ? "yüksek" : avg>=0.55 ? "orta" : "düşük";
  renderSummary(lat, lon, providers, { level });

  drawCharts(hourlyAgg.time, { temp: hourlyAgg.temp.series, prec: hourlyAgg.prec.series, wind: hourlyAgg.wind.series });

  stateEl.textContent = `Yüklendi: ${providers.join(", ")}`;
}

function bootstrap(){
  const lat = parseFloat(latEl.value) || DEFAULT_COORDS.lat;
  const lon = parseFloat(lonEl.value) || DEFAULT_COORDS.lon;
  reloadBtn.onclick = () => load(parseFloat(latEl.value), parseFloat(lonEl.value));
  load(lat, lon);
}
bootstrap();
