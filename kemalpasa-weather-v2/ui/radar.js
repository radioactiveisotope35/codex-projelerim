const FRAME_COUNT = 11;
const BASE_INTERVAL = 900;

const frameLabel = document.getElementById('radarFrameLabel');
const playButton = document.getElementById('radarPlay');
const backButton = document.getElementById('radarBack');
const forwardButton = document.getElementById('radarForward');
const speedSelect = document.getElementById('radarSpeed');
const opacitySlider = document.getElementById('radarOpacity');

function frameUrl(index) {
  return `https://tilecache.rainviewer.com/v2/radar/nowcast_${index}/256/{z}/{x}/{y}/0/0_0.png`;
}

export function initRadar({ lat, lon, onSelect }) {
  const map = L.map('map', { zoomControl: true }).setView([lat, lon], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  const initialOpacity = opacitySlider && Number.isFinite(Number(opacitySlider.value))
    ? Number(opacitySlider.value) / 100
    : 0.7;

  const radarLayer = L.tileLayer(frameUrl(0), {
    opacity: initialOpacity,
    attribution: 'RainViewer',
    updateWhenIdle: true
  }).addTo(map);

  const marker = L.marker([lat, lon]).addTo(map);

  map.on('click', (event) => {
    const { lat: clickLat, lng: clickLon } = event.latlng;
    marker.setLatLng(event.latlng);
    if (typeof onSelect === 'function') {
      onSelect(Number(clickLat.toFixed(4)), Number(clickLon.toFixed(4)));
    }
  });

  let currentFrame = 0;
  let playing = false;
  let speed = speedSelect && Number.isFinite(Number(speedSelect.value)) ? Number(speedSelect.value) : 1;
  let animationId = null;
  let lastTick = 0;

  function updateLabel() {
    if (frameLabel) frameLabel.textContent = `Çerçeve ${currentFrame} / ${FRAME_COUNT - 1}`;
  }

  function setFrame(index) {
    const clamped = (index + FRAME_COUNT) % FRAME_COUNT;
    currentFrame = clamped;
    radarLayer.setUrl(frameUrl(clamped));
    updateLabel();
  }

  function step(delta) {
    setFrame(currentFrame + delta);
  }

  function pause() {
    playing = false;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    lastTick = 0;
    if (playButton) playButton.textContent = '▶';
  }

  function loop(timestamp) {
    if (!playing) return;
    if (!lastTick) {
      lastTick = timestamp;
    }
    const interval = BASE_INTERVAL / speed;
    if (timestamp - lastTick >= interval) {
      step(1);
      lastTick = timestamp;
    }
    animationId = requestAnimationFrame(loop);
  }

  function togglePlay() {
    if (playing) {
      pause();
    } else {
      playing = true;
      if (playButton) playButton.textContent = '⏸';
      animationId = requestAnimationFrame(loop);
    }
  }

  if (playButton) {
    playButton.addEventListener('click', togglePlay);
  }

  if (backButton) {
    backButton.addEventListener('click', () => {
      pause();
      step(-1);
    });
  }

  if (forwardButton) {
    forwardButton.addEventListener('click', () => {
      pause();
      step(1);
    });
  }

  if (speedSelect) {
    speedSelect.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value) && value > 0) {
        speed = value;
      }
    });
  }

  if (opacitySlider) {
    opacitySlider.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) {
        radarLayer.setOpacity(value / 100);
        opacitySlider.setAttribute('aria-valuenow', String(value));
      }
    });
  }

  updateLabel();

  return {
    updateCoordinates(nextLat, nextLon) {
      const target = [nextLat, nextLon];
      marker.setLatLng(target);
      map.setView(target, map.getZoom());
    },
    stopPlayback: pause
  };
}
