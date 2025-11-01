let tempChart = null;
let precipChart = null;
let windChart = null;

const COLORS = {
  temp: '#ff9f43',
  precip: '#4dabf7',
  wind: '#82e0aa'
};

function hourLabel(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.getHours().toString().padStart(2, '0');
}

function toNullIfNaN(value) {
  return Number.isFinite(value) ? value : null;
}

function destroy(chart) {
  if (chart) {
    chart.destroy();
  }
}

export function renderCharts(times, data) {
  const limit = Math.min(24, times.length);
  const labels = times.slice(0, limit).map(hourLabel);
  const tempData = data.temp.slice(0, limit).map(toNullIfNaN);
  const precipData = data.precip.slice(0, limit).map(toNullIfNaN);
  const windData = data.wind.slice(0, limit).map(toNullIfNaN);

  const tempCtx = document.getElementById('tempChart');
  const precipCtx = document.getElementById('precChart');
  const windCtx = document.getElementById('windChart');

  destroy(tempChart);
  destroy(precipChart);
  destroy(windChart);

  tempChart = new Chart(tempCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '°C',
        data: tempData,
        borderColor: COLORS.temp,
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { autoSkip: false } },
        y: { ticks: { callback: (value) => `${value}°` } }
      }
    }
  });

  precipChart = new Chart(precipCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'mm',
        data: precipData,
        backgroundColor: COLORS.precip,
        borderRadius: 4,
        barPercentage: 0.8,
        categoryPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { autoSkip: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => `${value}` }
        }
      }
    }
  });

  windChart = new Chart(windCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'km/sa',
        data: windData,
        borderColor: COLORS.wind,
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { autoSkip: false } },
        y: { ticks: { callback: (value) => `${value}` } }
      }
    }
  });
}
