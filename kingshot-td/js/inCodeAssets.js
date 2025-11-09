// This file generates minimalist SVG icons for all game entities
// and loads them as Image objects.

function createSvgDataUri(svgXml) {
  const base64 = typeof btoa === 'function' ? btoa(svgXml) : Buffer.from(svgXml).toString('base64');
  return 'data:image/svg+xml;base64,' + base64;
}

function loadImage(dataUri) {
  if (typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.error('Failed to load in-code asset.');
      resolve(null);
    };
    img.src = dataUri;
  });
}

const SVG_STRINGS = {
  Archer:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2 L16 30 M4 16 L30 16" stroke="#3B6FB6" stroke-width="3" fill="none" transform="rotate(45 16 16)"/><path d="M2 16 L16 2" stroke="#888" stroke-width="2" fill="none"/><path d="M10 8 L8 10" stroke="white" stroke-width="3" fill="none"/></svg>',
  Cannon:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="12" fill="#B6733B"/><rect x="12" y="4" width="8" height="12" fill="#555"/></svg>',
  Mage:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2 L2 26 L30 26 Z" fill="#8E4FBF"/><circle cx="16" cy="20" r="5" fill="#FFC83D"/></svg>',
  Frost:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2 L22 10 L16 18 L10 10 Z" fill="#58C7D8"/><path d="M16 14 L22 22 L16 30 L10 22 Z" fill="#FFF"/></svg>',
  Hero:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 2 L19 12 L30 12 L21 19 L25 30 L16 23 L7 30 L11 19 L2 12 L13 12 Z" fill="#E0C13B"/></svg>',
  Grunt:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="18" r="10" fill="#6A3D2C"/><circle cx="12" cy="16" r="2" fill="red"/><circle cx="20" cy="16" r="2" fill="red"/></svg>',
  Runner:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><ellipse cx="16" cy="18" rx="12" ry="8" fill="#1E8E54"/><path d="M4 18 L10 12 M12 18 L18 12 M20 18 L26 12" stroke="white" stroke-width="2"/></svg>',
  Shielded:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="20" height="20" rx="4" fill="#555A6D"/><path d="M16 8 L16 24 M8 16 L24 16" stroke="#AAA" stroke-width="3"/></svg>',
  Tank:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="8" width="24" height="18" rx="6" fill="#3B3C47"/><rect x="10" y="4" width="12" height="10" fill="#555"/></svg>',
  Specter:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M8 30 Q 16 10, 24 30 Q 16 20, 8 30" fill="#8A8ABF"/><circle cx="12" cy="20" r="2" fill="white"/><circle cx="20" cy="20" r="2" fill="white"/></svg>',
  Behemoth:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M6 30 C 6 10, 26 10, 26 30 Z M10 20 C 10 16, 14 16, 14 20 Z M18 20 C 18 16, 22 16, 22 20 Z M10 12 L22 12" stroke="#BF4F6B" stroke-width="3" fill="#222"/><circle cx="12" cy="14" r="3" fill="red"/><circle cx="20" cy="14" r="3" fill="red"/></svg>',
};

const loadedAssets = {};
let loadPromise = null;

export function generateAndLoadAssets() {
  if (loadPromise) return loadPromise;

  const promises = Object.entries(SVG_STRINGS).map(async ([key, svgString]) => {
    const dataUri = createSvgDataUri(svgString);
    const image = await loadImage(dataUri);
    if (image) {
      loadedAssets[key] = image;
    }
  });

  loadPromise = Promise.all(promises).then(() => loadedAssets);
  return loadPromise;
}

export function getAsset(key) {
  return loadedAssets[key];
}
