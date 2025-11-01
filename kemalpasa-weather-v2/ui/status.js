const badgeContainer = document.getElementById('providerBadges');
const notifyArea = document.getElementById('notifyArea');
const confidenceBadge = document.getElementById('confidenceBadge');
const summaryCoords = document.getElementById('summaryCoords');
const summaryUpdated = document.getElementById('summaryUpdated');

const STATUS_CLASS = {
  AKTİF: 'aktif',
  PASİF: 'pasif',
  TIMEOUT: 'timeout',
  HATA: 'hata'
};

function formatTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatLatency(latency) {
  if (!Number.isFinite(latency)) return '—';
  return `${Math.round(latency)} ms`;
}

export function renderProviderStatuses(statuses) {
  if (!badgeContainer) return;
  badgeContainer.replaceChildren();
  const fragment = document.createDocumentFragment();
  statuses.forEach((status) => {
    const badge = document.createElement('span');
    badge.classList.add('badge');
    const css = STATUS_CLASS[status.state] ?? 'pasif';
    badge.classList.add(css);
    badge.setAttribute('role', 'status');
    const metaParts = [
      status.state,
      Number.isFinite(status.latencyMs) ? formatLatency(status.latencyMs) : '—',
      status.lastUpdated ? formatTime(status.lastUpdated) : '—'
    ];
    badge.innerHTML = `<span class="name">${status.name}</span><span class="meta">${metaParts.join(' • ')}</span>`;
    if (status.detail) {
      badge.title = status.detail;
    }
    fragment.appendChild(badge);
  });
  badgeContainer.appendChild(fragment);
}

export function updateConfidenceBadge({ label, spreads, score }) {
  if (!confidenceBadge) return;
  confidenceBadge.classList.remove('yüksek', 'orta', 'düşük');
  if (!label) {
    confidenceBadge.textContent = '—';
    confidenceBadge.dataset.tooltip = '';
    return;
  }
  confidenceBadge.classList.add(label);
  confidenceBadge.textContent = label.toLocaleUpperCase('tr-TR');
  const parts = [
    `Sıcaklık yayılımı: ${spreads.temp.averageSpread.toFixed(1)}°C (ölçek ${spreads.temp.scale}°C)`,
    `Yağış yayılımı: ${spreads.precip.averageSpread.toFixed(1)} mm/sa (ölçek ${spreads.precip.scale} mm/sa)`,
    `Rüzgar yayılımı: ${spreads.wind.averageSpread.toFixed(1)} km/sa (ölçek ${spreads.wind.scale} km/sa)`
  ];
  parts.push(`Genel skor: ${(score * 100).toFixed(0)}%`);
  confidenceBadge.dataset.tooltip = parts.join('\n');
}

export function updateSummary({ coords, updated }) {
  if (summaryCoords) summaryCoords.textContent = coords ?? '—';
  if (summaryUpdated) summaryUpdated.textContent = updated ?? '—';
}

export function notify(type, message) {
  if (!notifyArea) return;
  notifyArea.className = `notify${type ? ` ${type}` : ''}`;
  notifyArea.textContent = message ?? '';
}
