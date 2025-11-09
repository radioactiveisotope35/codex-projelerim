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
  Archer: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bowBody" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#5FA3FF" />
          <stop offset="1" stop-color="#1F56A6" />
        </linearGradient>
        <radialGradient id="arrowGlow" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9" />
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="20" fill="url(#arrowGlow)" />
      <path d="M10 38 Q24 10 38 10" stroke="url(#bowBody)" stroke-width="4" fill="none" stroke-linecap="round" />
      <path d="M12 36 L36 12" stroke="#F7F8FA" stroke-width="3" stroke-linecap="round" />
      <polygon points="34,14 40,12 38,18" fill="#F7F8FA" />
      <polygon points="14,34 10,36 12,30" fill="#FFD166" />
    </svg>
  `,
  Cannon: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cannonBarrel" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#5B5D63" />
          <stop offset="1" stop-color="#2F2E32" />
        </linearGradient>
        <linearGradient id="cannonBody" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#C98F4D" />
          <stop offset="1" stop-color="#925628" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="30" r="13" fill="url(#cannonBody)" />
      <rect x="20" y="8" width="8" height="18" rx="3" fill="url(#cannonBarrel)" />
      <circle cx="24" cy="30" r="6" fill="#3B2F22" />
      <circle cx="24" cy="30" r="3" fill="#FCEBD2" />
    </svg>
  `,
  Mage: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mageRobe" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#D7B3FF" />
          <stop offset="1" stop-color="#6E2CCF" />
        </linearGradient>
        <radialGradient id="mageOrb" cx="0.5" cy="0.35" r="0.5">
          <stop offset="0" stop-color="#FFE89D" />
          <stop offset="1" stop-color="#FF8C42" />
        </radialGradient>
      </defs>
      <path d="M24 4 L6 40 L42 40 Z" fill="url(#mageRobe)" />
      <circle cx="24" cy="22" r="7" fill="url(#mageOrb)" />
      <path d="M24 4 L30 18 L18 18 Z" fill="#2A0A59" opacity="0.6" />
    </svg>
  `,
  Frost: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="frostCrystal" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#B9F3FF" />
          <stop offset="1" stop-color="#3BA4D6" />
        </linearGradient>
      </defs>
      <path d="M24 4 L31 16 L24 28 L17 16 Z" fill="url(#frostCrystal)" />
      <path d="M24 20 L31 32 L24 44 L17 32 Z" fill="#E6FDFF" opacity="0.85" />
      <circle cx="24" cy="24" r="6" fill="#FFFFFF" opacity="0.7" />
    </svg>
  `,
  Hero: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="heroCore" cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stop-color="#FFF5B0" />
          <stop offset="1" stop-color="#D69B1C" />
        </radialGradient>
      </defs>
      <path d="M24 4 L29 18 L44 18 L32 28 L37 44 L24 34 L11 44 L16 28 L4 18 L19 18 Z" fill="url(#heroCore)" />
      <circle cx="24" cy="24" r="6" fill="#FFFFFF" opacity="0.5" />
    </svg>
  `,
  Grunt: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gruntSkin" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#8F4E39" />
          <stop offset="1" stop-color="#4D271A" />
        </linearGradient>
      </defs>
      <ellipse cx="24" cy="28" rx="16" ry="14" fill="url(#gruntSkin)" />
      <circle cx="18" cy="24" r="3" fill="#FF5B5B" />
      <circle cx="30" cy="24" r="3" fill="#FF5B5B" />
      <path d="M16 34 Q24 38 32 34" stroke="#2A1108" stroke-width="3" stroke-linecap="round" />
    </svg>
  `,
  Runner: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="runnerBody" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#41D27C" />
          <stop offset="1" stop-color="#0C6533" />
        </linearGradient>
      </defs>
      <ellipse cx="24" cy="28" rx="18" ry="11" fill="url(#runnerBody)" />
      <path d="M8 30 L16 20" stroke="#C8FFD8" stroke-width="3" stroke-linecap="round" />
      <path d="M24 30 L32 20" stroke="#C8FFD8" stroke-width="3" stroke-linecap="round" />
      <circle cx="18" cy="24" r="2" fill="#0F2716" />
      <circle cx="30" cy="24" r="2" fill="#0F2716" />
    </svg>
  `,
  Shielded: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shieldPlate" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#7B8196" />
          <stop offset="1" stop-color="#343746" />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="28" height="28" rx="6" fill="url(#shieldPlate)" />
      <path d="M24 14 L24 34 M14 24 L34 24" stroke="#D7DBE6" stroke-width="4" stroke-linecap="round" />
      <circle cx="24" cy="24" r="6" fill="#42475C" />
    </svg>
  `,
  Tank: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tankBody" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#62636D" />
          <stop offset="1" stop-color="#2F3037" />
        </linearGradient>
        <linearGradient id="tankChassis" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#3F414B" />
          <stop offset="1" stop-color="#1E1F24" />
        </linearGradient>
      </defs>
      <rect x="6" y="18" width="36" height="16" rx="6" fill="url(#tankChassis)" />
      <rect x="18" y="10" width="12" height="14" rx="4" fill="url(#tankBody)" />
      <rect x="20" y="4" width="8" height="10" rx="3" fill="#1B1C20" />
      <circle cx="18" cy="26" r="4" fill="#0F0F12" />
      <circle cx="30" cy="26" r="4" fill="#0F0F12" />
    </svg>
  `,
  Specter: `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="specterBody" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#B8BAF1" />
          <stop offset="1" stop-color="#5B5EA9" />
        </linearGradient>
      </defs>
      <path d="M10 42 Q24 8 38 42 Q24 30 10 42" fill="url(#specterBody)" />
      <circle cx="18" cy="24" r="3" fill="#FFFFFF" />
      <circle cx="30" cy="24" r="3" fill="#FFFFFF" />
      <circle cx="18" cy="24" r="1.5" fill="#1C1D38" />
      <circle cx="30" cy="24" r="1.5" fill="#1C1D38" />
    </svg>
  `,
  Behemoth: `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="behemothHide" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#E07088" />
          <stop offset="1" stop-color="#5E0F24" />
        </linearGradient>
        <radialGradient id="behemothGlow" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stop-color="#FF91A6" stop-opacity="0.8" />
          <stop offset="1" stop-color="#BF4F6B" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="38" rx="26" ry="20" fill="url(#behemothHide)" />
      <path d="M12 48 Q32 18 52 48" stroke="#2C0210" stroke-width="4" stroke-linecap="round" fill="none" />
      <circle cx="24" cy="30" r="6" fill="#FFE0E5" />
      <circle cx="40" cy="30" r="6" fill="#FFE0E5" />
      <circle cx="24" cy="30" r="3" fill="#470015" />
      <circle cx="40" cy="30" r="3" fill="#470015" />
      <path d="M20 46 Q32 52 44 46" stroke="#470015" stroke-width="4" stroke-linecap="round" />
      <ellipse cx="32" cy="36" rx="22" ry="16" fill="url(#behemothGlow)" />
    </svg>
  `,
  GigaBehemoth: `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gigaHide" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#40E0D0" />
          <stop offset="1" stop-color="#20605A" />
        </linearGradient>
        <radialGradient id="gigaGlow" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stop-color="#AFFFF5" stop-opacity="0.8" />
          <stop offset="1" stop-color="#40E0D0" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="38" rx="28" ry="22" fill="url(#gigaHide)" />
      <path d="M10 50 Q32 20 54 50" stroke="#0F2F2B" stroke-width="5" stroke-linecap="round" fill="none" />
      <circle cx="22" cy="30" r="7" fill="#FFFFFF" />
      <circle cx="22" cy="30" r="4" fill="#0F2F2B" />
      <circle cx="42" cy="30" r="7" fill="#FFFFFF" />
      <circle cx="42" cy="30" r="4" fill="#0F2F2B" />
      <path d="M20 48 Q32 56 44 48" stroke="#0F2F2B" stroke-width="5" stroke-linecap="round" />
      <ellipse cx="32" cy="36" rx="24" ry="18" fill="url(#gigaGlow)" />
    </svg>
  `,
  TerraBehemoth: `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="terraHide" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#555555" />
          <stop offset="1" stop-color="#0A0A0A" />
        </linearGradient>
        <radialGradient id="terraGlow" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stop-color="#FF5555" stop-opacity="0.8" />
          <stop offset="1" stop-color="#AA0000" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="38" rx="30" ry="24" fill="url(#terraHide)" />
      <path d="M8 52 Q32 22 56 52" stroke="#FF0000" stroke-width="5" stroke-linecap="round" fill="none" />
      <circle cx="20" cy="30" r="8" fill="#AA0000" />
      <circle cx="20" cy="30" r="4" fill="#FFAAAA" />
      <circle cx="44" cy="30" r="8" fill="#AA0000" />
      <circle cx="44" cy="30" r="4" fill="#FFAAAA" />
      <path d="M20 50 Q32 60 44 50" stroke="#FF0000" stroke-width="5" stroke-linecap="round" />
      <ellipse cx="32" cy="36" rx="26" ry="20" fill="url(#terraGlow)" />
    </svg>
  `,
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
