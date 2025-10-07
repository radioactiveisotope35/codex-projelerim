// update/update-001.js
// Patch 001: Consolidated stability cleanup and texture-safe fixed-step loop

export function applyPatch(ctx){
  if(!ctx || typeof ctx !== 'object'){
    console.warn('[patch-001] applyPatch requires a context object.');
    return;
  }
  const globalNS = globalThis.__patch001 = globalThis.__patch001 || {};
  if(typeof globalNS.dispose === 'function'){
    try{
      globalNS.dispose();
    }catch(err){
      console.warn('[patch-001] Failed to dispose previous instance.', err);
    }
  }
  globalNS.applied = false;

  const {
    THREE,
    scene,
    camera,
    renderer,
    controls,
    clock,
    world,
    player,
    game,
    enemies,
    lootItems,
    difficulty,
    keyState,
    movementConfig = {},
    functions = {},
    ui = {},
    refs = {},
    config = {},
  } = ctx;

  if(!THREE || !scene || !camera || !renderer || !controls || !clock){
    console.warn('[patch-001] Missing required references.');
    return;
  }

  if(scene.fog){
    scene.fog.color?.set?.(0x192b42);
    if(typeof scene.fog.near === 'number') scene.fog.near = Math.min(scene.fog.near, 70);
    if(typeof scene.fog.far === 'number') scene.fog.far = Math.max(scene.fog.far, 340);
  } else {
    scene.fog = new THREE.Fog(0x192b42, 70, 340);
  }
  if(scene.background && scene.background.isColor){
    scene.background.set(0x1b2f45);
  }

  if(renderer){
    const currentExposure = typeof renderer.toneMappingExposure === 'number' ? renderer.toneMappingExposure : 1;
    renderer.toneMappingExposure = Math.max(currentExposure, 1.2);
  }

  if(globalNS.lights && Array.isArray(globalNS.lights)){
    for(const light of globalNS.lights){
      if(light && light.parent){
        light.parent.remove(light);
      }
    }
  }
  const ambientLight = new THREE.AmbientLight(0xcfd9ff, 0.32);
  const hemiLight = new THREE.HemisphereLight(0xe4efff, 0x1c232b, 0.85);
  const fillLight = new THREE.DirectionalLight(0xcfe2ff, 0.45);
  const rimLight = new THREE.PointLight(0x66c7ff, 1.45, 70, 2);
  fillLight.position.set(16, 18, 10);
  fillLight.castShadow = true;
  fillLight.shadow.mapSize.set(1024, 1024);
  fillLight.shadow.camera.near = 4;
  fillLight.shadow.camera.far = 90;
  fillLight.shadow.camera.left = -45;
  fillLight.shadow.camera.right = 45;
  fillLight.shadow.camera.top = 45;
  fillLight.shadow.camera.bottom = -45;
  rimLight.position.set(0, 4.5, 0);
  scene.add(ambientLight);
  scene.add(hemiLight);
  scene.add(fillLight);
  scene.add(rimLight);
  globalNS.lights = [ambientLight, hemiLight, fillLight, rimLight];

  const originalShadowEnabled = renderer.shadowMap?.enabled ?? false;
  const baseEnemyTexture = (ctx.enemyMaterialTemplate && ctx.enemyMaterialTemplate.map) || ctx.enemyUniformTexture || null;
  const sharedTextures = globalNS.sharedTextures || (globalNS.sharedTextures = new WeakSet());
  const MATERIAL_TEXTURE_PROPS = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'displacementMap',
    'emissiveMap',
    'alphaMap',
    'lightMap',
    'envMap',
    'bumpMap',
    'specularMap',
    'gradientMap',
    'clearcoatMap',
    'clearcoatNormalMap',
    'clearcoatRoughnessMap',
    'sheenColorMap',
    'sheenRoughnessMap',
    'transmissionMap',
    'thicknessMap',
    'anisotropyMap',
    'specularColorMap',
    'specularIntensityMap',
  ];
  function markSharedTexture(tex){
    if(tex && typeof tex === 'object' && tex.isTexture){
      sharedTextures.add(tex);
    }
  }
  function markMaterialTexturesShared(material){
    if(!material) return;
    const list = Array.isArray(material) ? material : [material];
    for(let i=0;i<list.length;i++){
      const mat = list[i];
      if(!mat || typeof mat !== 'object') continue;
      for(let j=0;j<MATERIAL_TEXTURE_PROPS.length;j++){
        const tex = mat[MATERIAL_TEXTURE_PROPS[j]];
        markSharedTexture(tex);
      }
    }
  }
  markSharedTexture(baseEnemyTexture);
  if(ctx.enemyUniformTexture) markSharedTexture(ctx.enemyUniformTexture);
  if(ctx.enemyMaterialTemplate){
    markMaterialTexturesShared(ctx.enemyMaterialTemplate);
  }

  const CONFIG = {
    CONFIG_VERSION: '001',
    PLAYER: {
      baseHeight: player.height || 1.6,
      crouchRatio: 0.7,
      crouchSpeedMultiplier: 0.8,
      crouchSpreadMultiplier: 0.75,
      crouchAdsAcceleration: 16,
      regenFloor: 60,
      staminaSprintMultiplier: 1.5,
    },
    STAMINA: {
      max: 100,
      sprintDrain: 22,
      regenRate: 18,
      regenDelay: 1.15,
      regenDelayAfterDamage: 2.4,
      minSprint: 10,
    },
    WEAPONS: {
      fireRate: 0.1,
      semiAutoDelay: 0.13,
      spreadHip: THREE.MathUtils.degToRad(0.32),
      spreadADS: THREE.MathUtils.degToRad(0.12),
      spreadHipMax: THREE.MathUtils.degToRad(2.0),
      spreadADSMax: THREE.MathUtils.degToRad(0.55),
      spreadRecovery: THREE.MathUtils.degToRad(1.5),
      spreadRecoveryADS: THREE.MathUtils.degToRad(1.9),
      spreadHipTight: THREE.MathUtils.degToRad(0.22),
      spreadAdsTight: THREE.MathUtils.degToRad(0.08),
      adaptiveFireFloor: 0.075,
      adaptiveFireCeil: 0.11,
      staminaSpreadBonus: 0.82,
      staminaSpreadPenalty: 1.18,
      falloffStart: 25,
      falloffEnd: 70,
      falloffMin: 0.6,
      magazineSize: 30,
      reloadTime: 1.6,
      penetrationThickness: 0.8,
      penetrationDamageScale: 0.55,
      ricochetAngle: THREE.MathUtils.degToRad(20),
      ricochetChance: 0.45,
      ricochetDamageScale: 0.35,
      ricochetRange: 22,
      armorReduction: 0.25,
      semiAutoSpreadFactor: 0.82,
      muzzleVelocity: 180,
      enemyMuzzleVelocity: 160,
      projectileGravity: 5.5,
      projectileDrag: 0.08,
      projectileLife: 2.4,
      projectilePenetration: 0.35,
      tracerInterval: 0.03,
      tracerSegment: 2.6,
    },
    STANCE: {
      adsFov: 58,
      baseFov: camera.fov,
      sprintFov: 78,
      crouchFov: 66,
      adsSpeed: 12,
      sprintCamDamp: 10,
    },
    STIM: {
      flankLoSBlock: 1.2,
      suppressionRelocate: 3,
      suppressionSpread: THREE.MathUtils.degToRad(2.6),
      focusRadius: 10,
      relocateCooldown: 4,
    },
    SPAWN: {
      safeRadius: 18,
      maxAttempts: 36,
      concurrentCap: 7,
      buyDuration: 5,
      spawnCadence: [0.35, 0.65],
      initialDelay: 0.3,
    },
    ECONOMY: {
      baseKill: 30,
      headshotBonus: 20,
      streakBonus: 30,
      streakWindow: 5200,
    },
    STORE: {
      showStaminaHud: false,
    },
    UI: {
      staminaFadeTime: 1.6,
    },
    AI: {
      baseHealth: 85,
      healthPerRound: 6,
      coverDuration: [2.4, 3.6],
      peekDuration: [0.8, 1.4],
      flankRadius: 6,
      flankDistance: 8,
      focusBurstOffset: [0.06, 0.14],
      burstCooldown: [0.1, 0.18],
      relocateDistance: 3,
      suppressedTime: 0.9,
      engageDelay: 0.3,
      reengageDelay: 0.18,
      firstShotDelay: [0.08, 0.22],
      preferredRange: [6, 14],
      leadFactor: 0.18,
      aimJitter: [THREE.MathUtils.degToRad(0.6), THREE.MathUtils.degToRad(1.8)],
      aggressionRange: [0.35, 0.85],
      accuracyRange: [0.4, 0.92],
      resilienceRange: [0.4, 0.95],
      damageScale: [0.9, 1.22],
      fireCadence: [0.08, 0.16],
      flinchSuppression: 0.55,
      reactionFloor: 0.05,
      reactionCeil: 0.16,
      awarenessMemory: 0.9,
      alertDistance: 11,
      baseDamage: 16,
      damagePerRound: 1.2,
      gunshotAlertRadius: 36,
      gunshotMaxBoost: 0.8,
      spawnOppositeRadius: 7,
      magazineSize: [18, 30],
      reloadTime: [1.55, 2.3],
      tacticalReloadTime: [1.0, 1.45],
      tacticalReloadThreshold: [0.32, 0.52],
      reloadVariance: [0.08, 0.22],
      suppressedReloadPenalty: 0.35,
    },
    PERF: {
      fixedStep: 1 / 60,
      maxAccumulator: 0.25,
      tracerPoolSize: 24,
      impactPoolSize: 16,
      tracerLifetime: 0.08,
      impactLifetime: 0.6,
      losReuse: true,
      shadows: true,
      maxActiveEnemies: 12,
      maxMouseDelta: 120,
      debugOverlay: false,
    },
  };

  const ENEMIES_DISABLED = false;

  // Merge external overrides if provided
  if(config && typeof config === 'object'){
    Object.assign(CONFIG.PERF, config.PERF || {});
  }

  const SPAWN_FAILURE_LIMIT = Math.max(
    3,
    Math.min(12, Math.round(((CONFIG.SPAWN?.maxAttempts) || 10) * 0.3))
  );

  if(renderer.shadowMap){
    renderer.shadowMap.enabled = CONFIG.PERF.shadows;
  }

  if(!globalNS.textureGuarded){
    const descriptor = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, 'needsUpdate');
    if(descriptor && descriptor.set){
      Object.defineProperty(THREE.Texture.prototype, 'needsUpdate', {
        configurable: true,
        enumerable: true,
        get: descriptor.get,
        set: function(next){
          if(next){
            const img = this.image;
            if(!img || !img.width || !img.height){
              return;
            }
          }
          descriptor.set.call(this, next);
        }
      });
      globalNS.textureGuarded = true;
    }
  }

  let perfOverlay = null;

  const PATCH_STATE = {
    debug: false,
    weaponParts: null,
    muzzleAnchor: null,
    enemySpawnZones: null,
    playerSpawn: null,
    enemyOppositePoint: null,
    enemyGeometry: null,
    spawnFailureStreak: 0,
    lastSpawnFailureAt: 0,
    frameId: 0,
    enemyProfileSummary: {
      count: 0,
      totalAggression: 0,
      totalAccuracy: 0,
      totalResilience: 0,
    },
    playerFireDelay: null,
    roundDirectives: null,
  };

  globalNS.enableDebug = (flag) => {
    PATCH_STATE.debug = !!flag;
    if(!flag && perfOverlay){
      perfOverlay.style.display = 'none';
    } else if(flag && perfOverlay){
      perfOverlay.style.display = 'block';
    }
  };

  // ---------------------------------------------------------------------------
  // SHARED HELPERS & POOLS (INITIALIZED EARLY)
  // ---------------------------------------------------------------------------
  const shared = globalNS.shared = globalNS.shared || {};
  const tempBox = shared.tempBox || (shared.tempBox = new THREE.Box3());
  const tempBox2 = shared.tempBox2 || (shared.tempBox2 = new THREE.Box3());
  const tempVecA = shared.tempVecA || (shared.tempVecA = new THREE.Vector3());
  const tempVecB = shared.tempVecB || (shared.tempVecB = new THREE.Vector3());
  const tempVecC = shared.tempVecC || (shared.tempVecC = new THREE.Vector3());
  const tempVecD = shared.tempVecD || (shared.tempVecD = new THREE.Vector3());
  const tempVecE = shared.tempVecE || (shared.tempVecE = new THREE.Vector3());
  const tempVecF = shared.tempVecF || (shared.tempVecF = new THREE.Vector3());
  const tempVecG = shared.tempVecG || (shared.tempVecG = new THREE.Vector3());
  const tempVecH = shared.tempVecH || (shared.tempVecH = new THREE.Vector3());
  const tempVecI = shared.tempVecI || (shared.tempVecI = new THREE.Vector3());
  const tempVec2A = shared.tempVec2A || (shared.tempVec2A = new THREE.Vector2());
  const tempVec2B = shared.tempVec2B || (shared.tempVec2B = new THREE.Vector2());
  const tempVec2C = shared.tempVec2C || (shared.tempVec2C = new THREE.Vector2());
  const tempQuat = shared.tempQuat || (shared.tempQuat = new THREE.Quaternion());
  const tempEuler = shared.tempEuler || (shared.tempEuler = new THREE.Euler(0, 0, 0, 'YXZ'));
  const tempMat3 = shared.tempMat3 || (shared.tempMat3 = new THREE.Matrix3());
  const worldBounds = shared.worldBounds || (shared.worldBounds = new THREE.Box3());
  const worldSpawnBounds = shared.worldSpawnBounds || (shared.worldSpawnBounds = new THREE.Box3());
  const playerCollider = refs.playerCollider || shared.playerCollider || (shared.playerCollider = new THREE.Box3());
  const crouchTestBox = shared.crouchTestBox || (shared.crouchTestBox = new THREE.Box3());
  const tempRaycaster = refs.raycaster || shared.tempRaycaster || new THREE.Raycaster();
  if(!refs.raycaster) shared.tempRaycaster = tempRaycaster;
  const helperRay = shared.helperRay || (shared.helperRay = new THREE.Raycaster());
  const upVector = shared.upVector || (shared.upVector = new THREE.Vector3(0, 1, 0));
  const downVector = shared.downVector || (shared.downVector = new THREE.Vector3(0, -1, 0));
  const yawObject = typeof controls.getObject === 'function' ? controls.getObject() : controls.object || controls;
  const pitchObject = camera;
  if(yawObject?.rotation){
    yawObject.rotation.order = 'YXZ';
    yawObject.rotation.z = 0;
  }
  if(pitchObject?.rotation){
    pitchObject.rotation.order = 'YXZ';
    pitchObject.rotation.z = 0;
  }
  const LOOK_SPEED = 0.002;
  const MAX_MOUSE_DELTA = CONFIG.PERF.maxMouseDelta ?? 120;
  const TWO_PI = Math.PI * 2;
  const minPitchClamp = THREE.MathUtils.degToRad(-85);
  const maxPitchClamp = THREE.MathUtils.degToRad(85);
  let lastYaw = yawObject?.rotation?.y ?? 0;
  let lastPitch = pitchObject?.rotation?.x ?? 0;

  if(yawObject){
    yawObject.rotation.y = normalizeYaw(yawObject.rotation.y);
    lastYaw = yawObject.rotation.y;
  }
  if(pitchObject){
    pitchObject.rotation.x = THREE.MathUtils.clamp(pitchObject.rotation.x, minPitchClamp, maxPitchClamp);
    lastPitch = pitchObject.rotation.x;
  }

  const staticScratch = [];
  const enemyMeshScratch = [];
  const filteredStaticScratch = [];
  const raycastScratch = [];
  const zoneOccupancyScratch = { count: 0, closestSq: Infinity };
  const staticBoundsCache = new WeakMap();
  PATCH_STATE.staticBoundsCache = staticBoundsCache;

  const ENEMY_RADIUS = 0.55;
  const ENEMY_HEIGHT = 1.92;
  const ENEMY_HALF_HEIGHT = ENEMY_HEIGHT * 0.5;
  const ENEMY_PROFILE_PALETTES = [
    { base: 0x33435f, accent: 0x63c8ff, emissive: 0x102338, skin: 0xf4cbb0, hair: 0x2a2f3d },
    { base: 0x3d2f4f, accent: 0xff7291, emissive: 0x1c0b1c, skin: 0xf1c3aa, hair: 0x1d141f },
    { base: 0x2f4a3b, accent: 0x8bee77, emissive: 0x0b1c10, skin: 0xf3d2b4, hair: 0x2f2517 },
    { base: 0x4b3a28, accent: 0xffcd74, emissive: 0x1e1406, skin: 0xf7d8bb, hair: 0x2c1c10 },
    { base: 0x2c3f4e, accent: 0xa689ff, emissive: 0x120b2a, skin: 0xf2cdb6, hair: 0x261930 },
  ];
  const DEFAULT_ENEMY_PROFILE = {
    archetype: 'vanguard',
    aggression: 0.62,
    accuracy: 0.64,
    resilience: 0.66,
    aggressionValue: lerpRange(CONFIG.AI.aggressionRange, 0.62),
    accuracyValue: lerpRange(CONFIG.AI.accuracyRange, 0.64),
    resilienceValue: lerpRange(CONFIG.AI.resilienceRange, 0.66),
    preferredRange: THREE.MathUtils.lerp(CONFIG.AI.preferredRange[0], CONFIG.AI.preferredRange[1], 0.6),
    damageScale: 1.18,
    burst: [4, 6],
    burstCadence: [0.048, 0.1],
    restCadence: [0.18, 0.26],
    magazine: 24,
    reloadTime: 1.9,
    tacticalReload: 0.4,
    tacticalReloadTime: 1.3,
    reloadVariance: 0.14,
    scale: { x: 1.04, y: 1.06, z: 1.02 },
    paletteIndex: 0,
    aimJitter: THREE.MathUtils.lerp(CONFIG.AI.aimJitter[1], CONFIG.AI.aimJitter[0], 0.64),
    leadTime: CONFIG.AI.leadFactor * 1.05,
    suppressionResist: 1.12,
  };

  const NEW_ENEMY_ARCHETYPES = [
    {
      id: 'vanguard',
      weight: 1.1,
      palette: 0,
      aggression: [0.42, 0.68],
      accuracy: [0.48, 0.72],
      resilience: [0.46, 0.62],
      burst: [3, 5],
      burstCadence: [0.05, 0.11],
      restCadence: [0.2, 0.28],
      preferredRange: [12, 22],
      damageScale: [0.95, 1.2],
      magazine: [20, 26],
      reload: [1.55, 2.1],
      tactical: [0.34, 0.48],
      tacticalTime: [1.05, 1.35],
      reloadVariance: [0.1, 0.18],
      lead: [0.7, 1.05],
      suppression: [0.9, 1.2],
      scale: {
        x: [0.94, 1.05],
        y: [0.98, 1.1],
        z: [0.92, 1.04],
      },
    },
    {
      id: 'lancer',
      weight: 0.85,
      palette: 1,
      aggression: [0.55, 0.78],
      accuracy: [0.5, 0.68],
      resilience: [0.5, 0.7],
      burst: [4, 6],
      burstCadence: [0.045, 0.09],
      restCadence: [0.18, 0.26],
      preferredRange: [8, 18],
      damageScale: [1, 1.28],
      magazine: [22, 28],
      reload: [1.45, 1.95],
      tactical: [0.36, 0.5],
      tacticalTime: [0.95, 1.25],
      reloadVariance: [0.08, 0.16],
      lead: [0.78, 1.18],
      suppression: [0.95, 1.25],
      scale: {
        x: [0.98, 1.08],
        y: [1, 1.08],
        z: [0.95, 1.02],
      },
    },
    {
      id: 'warden',
      weight: 0.75,
      palette: 2,
      aggression: [0.36, 0.58],
      accuracy: [0.52, 0.76],
      resilience: [0.62, 0.86],
      burst: [3, 4],
      burstCadence: [0.06, 0.12],
      restCadence: [0.24, 0.34],
      preferredRange: [16, 28],
      damageScale: [1.05, 1.32],
      magazine: [24, 32],
      reload: [1.8, 2.4],
      tactical: [0.32, 0.46],
      tacticalTime: [1.15, 1.5],
      reloadVariance: [0.12, 0.22],
      lead: [0.8, 1.24],
      suppression: [1.05, 1.32],
      scale: {
        x: [1.02, 1.12],
        y: [1.04, 1.15],
        z: [1, 1.12],
      },
    },
    {
      id: 'skirmisher',
      weight: 1.15,
      palette: 3,
      aggression: [0.48, 0.82],
      accuracy: [0.42, 0.64],
      resilience: [0.4, 0.58],
      burst: [5, 7],
      burstCadence: [0.04, 0.085],
      restCadence: [0.16, 0.25],
      preferredRange: [6, 16],
      damageScale: [0.9, 1.1],
      magazine: [16, 22],
      reload: [1.3, 1.9],
      tactical: [0.38, 0.54],
      tacticalTime: [0.9, 1.2],
      reloadVariance: [0.08, 0.18],
      lead: [0.68, 1],
      suppression: [0.85, 1.05],
      scale: {
        x: [0.9, 1.02],
        y: [0.94, 1.02],
        z: [0.9, 1],
      },
    },
    {
      id: 'arbitrator',
      weight: 0.6,
      palette: 4,
      aggression: [0.5, 0.76],
      accuracy: [0.62, 0.86],
      resilience: [0.54, 0.74],
      burst: [3, 4],
      burstCadence: [0.048, 0.1],
      restCadence: [0.2, 0.3],
      preferredRange: [18, 32],
      damageScale: [1.1, 1.4],
      magazine: [22, 30],
      reload: [1.6, 2.2],
      tactical: [0.3, 0.46],
      tacticalTime: [1.05, 1.38],
      reloadVariance: [0.1, 0.22],
      lead: [0.85, 1.3],
      suppression: [1, 1.35],
      scale: {
        x: [1, 1.12],
        y: [1.02, 1.18],
        z: [0.98, 1.1],
      },
    },
  ];

  const ROUND_DIRECTIVES = PATCH_STATE.roundDirectives || (PATCH_STATE.roundDirectives = {
    aggressionBias: 0,
    accuracyBias: 0,
    resilienceBias: 0,
    burstBias: 0,
    restBias: 0,
    reactionBias: 0,
    awarenessBonus: 0,
    velocityScale: 1,
    damageBias: 0,
  });

  function lerpRange(range, t){
    if(!Array.isArray(range) || range.length < 2){
      return typeof range === 'number' ? range : t;
    }
    return THREE.MathUtils.lerp(range[0], range[1], THREE.MathUtils.clamp(t, 0, 1));
  }

  function getEnemyPalette(index){
    if(!ENEMY_PROFILE_PALETTES.length){
      return { base: 0x2c3f4e, accent: 0x6bcfff, emissive: 0x0c1725, skin: 0xf2cdb6, hair: 0x261930 };
    }
    const safeIndex = Math.abs(Math.floor(index || 0)) % ENEMY_PROFILE_PALETTES.length;
    return ENEMY_PROFILE_PALETTES[safeIndex];
  }

  function randomRange(range){
    if(Array.isArray(range) && range.length >= 2){
      return THREE.MathUtils.lerp(range[0], range[1], Math.random());
    }
    return typeof range === 'number' ? range : 0;
  }

  function pickArchetype(stage){
    let total = 0;
    const weights = NEW_ENEMY_ARCHETYPES.map((archetype) => {
      const stageBonus = THREE.MathUtils.lerp(1, 1.3, stage);
      const weight = (archetype.weight || 1) * stageBonus;
      total += weight;
      return weight;
    });
    let choice = Math.random() * total;
    for(let i = 0; i < NEW_ENEMY_ARCHETYPES.length; i++){
      choice -= weights[i];
      if(choice <= 0){
        return NEW_ENEMY_ARCHETYPES[i];
      }
    }
    return NEW_ENEMY_ARCHETYPES[NEW_ENEMY_ARCHETYPES.length - 1];
  }

  function buildEnemyProfile(round = 1){
    const stage = THREE.MathUtils.clamp((round - 1) / 10, 0, 1);
    const archetype = pickArchetype(stage);
    const aggroBias = ROUND_DIRECTIVES.aggressionBias || 0;
    const accBias = ROUND_DIRECTIVES.accuracyBias || 0;
    const resBias = ROUND_DIRECTIVES.resilienceBias || 0;
    const aggression = THREE.MathUtils.clamp(randomRange(archetype.aggression) + stage * 0.1 + aggroBias, 0, 1);
    const accuracy = THREE.MathUtils.clamp(randomRange(archetype.accuracy) + stage * 0.12 + accBias, 0, 1);
    const resilience = THREE.MathUtils.clamp(randomRange(archetype.resilience) + stage * 0.08 + resBias, 0, 1);
    const aggressionValue = lerpRange(CONFIG.AI.aggressionRange, aggression);
    const accuracyValue = lerpRange(CONFIG.AI.accuracyRange, accuracy);
    const resilienceValue = lerpRange(CONFIG.AI.resilienceRange, resilience);
    const paletteIndex = archetype.palette ?? Math.floor(Math.random() * ENEMY_PROFILE_PALETTES.length);
    const preferredRange = lerpRange(
      CONFIG.AI.preferredRange,
      THREE.MathUtils.clamp(randomRange(archetype.preferredRange) / 32, 0, 1)
    );
    const damageScale = lerpRange(
      CONFIG.AI.damageScale,
      THREE.MathUtils.clamp(randomRange(archetype.damageScale) - 0.8, 0, 1)
    );
    const burstBias = ROUND_DIRECTIVES.burstBias || 0;
    const restBias = ROUND_DIRECTIVES.restBias || 0;
    const burstMinBase = Math.max(2, Math.round(randomRange(archetype.burst)));
    const burstCountMin = burstMinBase + Math.max(0, Math.round(burstBias));
    const burstCountMax = Math.max(burstCountMin + 1, burstCountMin + Math.round(Math.random() * 2 + stage * 2));
    const cadenceFloor = Math.max(0.038, randomRange(archetype.burstCadence) * THREE.MathUtils.lerp(1, 0.85, accuracy));
    const cadenceCeil = Math.max(cadenceFloor + 0.015, randomRange(archetype.burstCadence) * THREE.MathUtils.lerp(1.1, 1.4, 1 - accuracy));
    const restFloor = Math.max(0.14, randomRange(archetype.restCadence) * THREE.MathUtils.lerp(0.85, 1.15, 1 - aggression));
    const restCeil = Math.max(restFloor + 0.06, restFloor + THREE.MathUtils.lerp(0.04, 0.12, 1 - resilience));
    const scale = {
      x: THREE.MathUtils.lerp(archetype.scale.x[0], archetype.scale.x[1], Math.random()),
      y: THREE.MathUtils.lerp(archetype.scale.y[0], archetype.scale.y[1], Math.random()),
      z: THREE.MathUtils.lerp(archetype.scale.z[0], archetype.scale.z[1], Math.random()),
    };
    const aimJitter = THREE.MathUtils.lerp(CONFIG.AI.aimJitter[1], CONFIG.AI.aimJitter[0], accuracy);
    const leadTime = CONFIG.AI.leadFactor * THREE.MathUtils.lerp(archetype.lead[0], archetype.lead[1], accuracy) * (ROUND_DIRECTIVES.velocityScale || 1);
    const suppressionResist = THREE.MathUtils.lerp(archetype.suppression[0], archetype.suppression[1], resilience);
    const magazineRange = archetype.magazine || CONFIG.AI.magazineSize;
    const reloadRange = archetype.reload || CONFIG.AI.reloadTime;
    const tacticalRange = archetype.tactical || CONFIG.AI.tacticalReloadThreshold;
    const tacticalTimeRange = archetype.tacticalTime || CONFIG.AI.tacticalReloadTime;
    const varianceRange = archetype.reloadVariance || CONFIG.AI.reloadVariance;
    const magazine = Math.max(
      12,
      Math.round(
        lerpRange(
          magazineRange,
          THREE.MathUtils.clamp(resilience * 0.5 + aggression * 0.3 + accuracy * 0.2, 0, 1)
        )
      )
    );
    const reloadTime = Math.max(0.7, lerpRange(reloadRange, THREE.MathUtils.clamp(1 - aggression * 0.35, 0, 1)));
    const tacticalThreshold = THREE.MathUtils.clamp(lerpRange(tacticalRange, accuracy), 0.2, 0.6);
    const tacticalReloadTime = Math.max(
      0.55,
      lerpRange(tacticalTimeRange, THREE.MathUtils.clamp(1 - resilience * 0.25, 0, 1))
    );
    const reloadVariance = THREE.MathUtils.clamp(lerpRange(varianceRange, 1 - accuracy), 0.05, 0.3);
    const damageScaleBias = 1 + (ROUND_DIRECTIVES.damageBias || 0);
    return {
      archetype: archetype.id,
      aggression,
      accuracy,
      resilience,
      aggressionValue,
      accuracyValue,
      resilienceValue,
      preferredRange,
      damageScale: damageScale * damageScaleBias,
      burst: [burstCountMin, burstCountMax],
      burstCadence: [Math.max(0.04, cadenceFloor - burstBias * 0.01), cadenceCeil],
      restCadence: [Math.max(0.14, restFloor - restBias * 0.02), restCeil + restBias * 0.04],
      scale,
      paletteIndex,
      aimJitter,
      leadTime,
      suppressionResist,
      magazine,
      reloadTime,
      tacticalReload: tacticalThreshold,
      tacticalReloadTime,
      reloadVariance,
    };
  }

  const sentinelTextureCache = globalNS.sentinelTextureCache || (globalNS.sentinelTextureCache = new Map());

  function ensureSentinelTexture(key, generator){
    if(sentinelTextureCache.has(key)){
      const tex = sentinelTextureCache.get(key);
      markSharedTexture(tex);
      return tex;
    }
    const texture = generator();
    if(texture){
      sentinelTextureCache.set(key, texture);
      markSharedTexture(texture);
    }
    return texture;
  }

  function createSentinelFabricTexture(palette){
    const key = `fabric:${palette.base.toString(16)}:${palette.accent.toString(16)}`;
    return ensureSentinelTexture(key, () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx2d = canvas.getContext('2d');
      if(ctx2d){
        const base = new THREE.Color(palette.base);
        const accent = new THREE.Color(palette.accent);
        ctx2d.fillStyle = `#${base.getHexString()}`;
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        const grad = ctx2d.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, `#${base.clone().multiplyScalar(1.05).getHexString()}`);
        grad.addColorStop(0.55, `#${base.clone().multiplyScalar(0.92).getHexString()}`);
        grad.addColorStop(1, `#${base.clone().multiplyScalar(0.78).getHexString()}`);
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.globalAlpha = 0.32;
        ctx2d.strokeStyle = `#${accent.clone().lerp(base, 0.55).getHexString()}`;
        ctx2d.lineWidth = 2;
        for(let i = -canvas.width; i < canvas.width; i += 24){
          ctx2d.beginPath();
          ctx2d.moveTo(i, 0);
          ctx2d.lineTo(i + canvas.width, canvas.height);
          ctx2d.stroke();
        }
        ctx2d.globalAlpha = 0.18;
        ctx2d.fillStyle = `#${accent.getHexString()}`;
        ctx2d.fillRect(0, canvas.height * 0.2, canvas.width, 12);
        ctx2d.fillRect(0, canvas.height * 0.58, canvas.width, 10);
        ctx2d.globalAlpha = 1;
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.max(texture.anisotropy || 1, 4);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
  }

  function createSentinelTrimTexture(palette){
    const key = `trim:${palette.accent.toString(16)}:${palette.emissive.toString(16)}`;
    return ensureSentinelTexture(key, () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx2d = canvas.getContext('2d');
      if(ctx2d){
        ctx2d.fillStyle = `#${new THREE.Color(palette.accent).getHexString()}`;
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.globalAlpha = 0.45;
        ctx2d.fillStyle = `#${new THREE.Color(palette.emissive).getHexString()}`;
        for(let i = 0; i < 8; i++){
          ctx2d.fillRect(0, i * 16, canvas.width, 6);
        }
        ctx2d.globalAlpha = 0.15;
        ctx2d.fillStyle = '#ffffff';
        ctx2d.fillRect(0, 0, canvas.width, 6);
        ctx2d.fillRect(0, canvas.height - 6, canvas.width, 6);
        ctx2d.globalAlpha = 1;
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.max(texture.anisotropy || 1, 2);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
  }

  function createSentinelVisorTexture(palette){
    const key = `visor:${palette.accent.toString(16)}:${palette.emissive.toString(16)}`;
    return ensureSentinelTexture(key, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx2d = canvas.getContext('2d');
      if(ctx2d){
        const accent = new THREE.Color(palette.accent);
        const glow = new THREE.Color(palette.emissive);
        const grad = ctx2d.createLinearGradient(0, 0, canvas.width, 0);
        grad.addColorStop(0, `#${glow.clone().lerp(accent, 0.25).getHexString()}`);
        grad.addColorStop(0.4, `#${accent.getHexString()}`);
        grad.addColorStop(1, `#${glow.clone().multiplyScalar(0.6).getHexString()}`);
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.globalAlpha = 0.35;
        ctx2d.fillStyle = '#ffffff';
        ctx2d.fillRect(0, 0, canvas.width, 6);
        ctx2d.globalAlpha = 0.25;
        ctx2d.fillRect(0, canvas.height - 6, canvas.width, 6);
        ctx2d.globalAlpha = 0.45;
        ctx2d.fillStyle = '#000000';
        ctx2d.fillRect(0, canvas.height * 0.35, canvas.width, 4);
        ctx2d.globalAlpha = 1;
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = Math.max(texture.anisotropy || 1, 2);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
  }

  function applyEnemyVisualProfile(enemy){
    if(!enemy?.mesh || !enemy.profile) return;
    const palette = getEnemyPalette(enemy.profile.paletteIndex);
    const materials = enemy.mesh.userData?.materials || {};
    const fabric = createSentinelFabricTexture(palette);
    const trim = createSentinelTrimTexture(palette);

    const bodyMaterial = enemy.primaryMaterial || materials.body || getEnemyPrimaryMaterial(enemy);
    if(bodyMaterial){
      if(bodyMaterial.map !== fabric){
        bodyMaterial.map = fabric;
        bodyMaterial.needsUpdate = true;
      }
      if(bodyMaterial.color?.setHex){
        bodyMaterial.color.setHex(palette.base);
      }
      if(bodyMaterial.emissive?.setHex){
        bodyMaterial.emissive.setHex(palette.emissive);
        bodyMaterial.emissiveIntensity = THREE.MathUtils.clamp(0.28 + enemy.profile.accuracy * 0.5, 0.3, 0.95);
      }
      if(typeof bodyMaterial.metalness === 'number'){
        bodyMaterial.metalness = THREE.MathUtils.clamp(0.28 + enemy.profile.accuracy * 0.25, 0.22, 0.62);
      }
      if(typeof bodyMaterial.roughness === 'number'){
        bodyMaterial.roughness = THREE.MathUtils.clamp(0.42 - enemy.profile.accuracy * 0.18, 0.18, 0.55);
      }
      bodyMaterial.needsUpdate = true;
      enemy.primaryMaterial = bodyMaterial;
    }

    const accentMaterial = enemy.accentMaterial || materials.accent || enemy.mesh?.userData?.accentMaterial;
    if(accentMaterial){
      if(accentMaterial.map !== trim){
        accentMaterial.map = trim;
        accentMaterial.needsUpdate = true;
      }
      if(accentMaterial.color?.setHex){
        accentMaterial.color.setHex(palette.accent);
      }
      if(accentMaterial.emissive?.setHex){
        accentMaterial.emissive.setHex(palette.emissive);
        accentMaterial.emissiveIntensity = THREE.MathUtils.clamp(0.4 + enemy.profile.aggression * 0.45, 0.35, 1.0);
      }
      accentMaterial.needsUpdate = true;
      enemy.accentMaterial = accentMaterial;
    }

    const visorMaterial = enemy.visorMaterial || materials.visor || enemy.mesh?.userData?.visorMaterial;
    if(visorMaterial){
      const visorTexture = createSentinelVisorTexture(palette);
      if(visorMaterial.map !== visorTexture){
        visorMaterial.map = visorTexture;
        visorMaterial.needsUpdate = true;
      }
      visorMaterial.color?.setHex(palette.accent);
      visorMaterial.emissive?.setHex(palette.accent);
      visorMaterial.emissiveIntensity = THREE.MathUtils.clamp(0.75 + enemy.profile.accuracy * 0.4, 0.75, 1.3);
      if(typeof visorMaterial.metalness === 'number'){
        visorMaterial.metalness = THREE.MathUtils.clamp(0.35 + enemy.profile.accuracy * 0.3, 0.3, 0.8);
      }
      if(typeof visorMaterial.roughness === 'number'){
        visorMaterial.roughness = THREE.MathUtils.clamp(0.18 + enemy.profile.aggression * 0.18, 0.18, 0.46);
      }
      visorMaterial.needsUpdate = true;
      enemy.visorMaterial = visorMaterial;
    }

    const skinMaterial = enemy.skinMaterial || materials.skin || enemy.mesh?.userData?.skinMaterial;
    if(skinMaterial){
      skinMaterial.color?.setHex(palette.skin || 0xf2c7a2);
      if(typeof skinMaterial.roughness === 'number'){
        skinMaterial.roughness = 0.42;
      }
      skinMaterial.needsUpdate = true;
      enemy.skinMaterial = skinMaterial;
    }

    const hairMaterial = enemy.hairMaterial || materials.hair || enemy.mesh?.userData?.hairMaterial;
    if(hairMaterial){
      hairMaterial.color?.setHex(palette.hair || 0x2a1f18);
      if(typeof hairMaterial.roughness === 'number'){
        hairMaterial.roughness = 0.32;
      }
      hairMaterial.needsUpdate = true;
      enemy.hairMaterial = hairMaterial;
    }

    enemy.mesh.scale.set(enemy.profile.scale.x, enemy.profile.scale.y, enemy.profile.scale.z);
    enemy.mesh.userData.enemyPalette = palette;
    if(enemy.mesh.userData){
      enemy.mesh.userData.materials = enemy.mesh.userData.materials || {};
      if(bodyMaterial) enemy.mesh.userData.materials.body = bodyMaterial;
      if(accentMaterial) enemy.mesh.userData.materials.accent = accentMaterial;
      if(visorMaterial) enemy.mesh.userData.materials.visor = visorMaterial;
      if(skinMaterial) enemy.mesh.userData.materials.skin = skinMaterial;
      if(hairMaterial) enemy.mesh.userData.materials.hair = hairMaterial;
    }
  }

  function updateEnemySummary(enemy, delta){
    const summary = PATCH_STATE.enemyProfileSummary;
    if(!summary || !enemy?.profile) return;
    summary.totalAggression = Math.max(0, summary.totalAggression + delta * enemy.profile.aggression);
    summary.totalAccuracy = Math.max(0, summary.totalAccuracy + delta * enemy.profile.accuracy);
    summary.totalResilience = Math.max(0, summary.totalResilience + delta * enemy.profile.resilience);
    summary.count = Math.max(0, summary.count + delta);
  }

  function registerEnemyProfile(enemy){
    if(!enemy || enemy.__profileRegistered) return;
    updateEnemySummary(enemy, 1);
    enemy.__profileRegistered = true;
    recalcPlayerTuning();
  }

  function unregisterEnemyProfile(enemy){
    if(!enemy || !enemy.__profileRegistered) return;
    enemy.__profileRegistered = false;
    updateEnemySummary(enemy, -1);
    recalcPlayerTuning();
  }

  function recalcPlayerTuning(){
    if(!playerState || !weaponState) return;
    const summary = PATCH_STATE.enemyProfileSummary || { count: 0, totalAggression: 0, totalAccuracy: 0, totalResilience: 0 };
    const count = Math.max(1, summary.count || 0);
    const avgAgg = summary.count ? summary.totalAggression / count : DEFAULT_ENEMY_PROFILE.aggression;
    const avgAcc = summary.count ? summary.totalAccuracy / count : DEFAULT_ENEMY_PROFILE.accuracy;
    const avgRes = summary.count ? summary.totalResilience / count : DEFAULT_ENEMY_PROFILE.resilience;
    const pressure = THREE.MathUtils.clamp(avgAgg * 0.55 + avgAcc * 0.45, 0, 1);
    const sustain = THREE.MathUtils.clamp(avgRes * 0.6 + (1 - avgAgg) * 0.2, 0, 1);
    const fireDelay = THREE.MathUtils.lerp(CONFIG.WEAPONS.adaptiveFireCeil, CONFIG.WEAPONS.adaptiveFireFloor, pressure);
    PATCH_STATE.playerFireDelay = fireDelay;
    playerState.fireTempo = fireDelay;
    weaponState.baseHip = THREE.MathUtils.lerp(CONFIG.WEAPONS.spreadHipTight, CONFIG.WEAPONS.spreadHip, pressure);
    weaponState.baseAds = THREE.MathUtils.lerp(CONFIG.WEAPONS.spreadAdsTight, CONFIG.WEAPONS.spreadADS, pressure * 0.9);
    weaponState.spreadMaxHip = Math.max(
      weaponState.baseHip * 3.1,
      THREE.MathUtils.lerp(CONFIG.WEAPONS.spreadHipMax * 0.82, CONFIG.WEAPONS.spreadHipMax, pressure)
    );
    weaponState.spreadMaxAds = Math.max(
      weaponState.baseAds * 2.1,
      THREE.MathUtils.lerp(CONFIG.WEAPONS.spreadADSMax * 0.85, CONFIG.WEAPONS.spreadADSMax, pressure * 0.9)
    );
    weaponState.recoveryHip = THREE.MathUtils.lerp(
      CONFIG.WEAPONS.spreadRecovery * 1.32,
      CONFIG.WEAPONS.spreadRecovery,
      sustain
    );
    weaponState.recoveryAds = THREE.MathUtils.lerp(
      CONFIG.WEAPONS.spreadRecoveryADS * 1.22,
      CONFIG.WEAPONS.spreadRecoveryADS,
      sustain
    );
    const minBase = Math.min(weaponState.baseHip, weaponState.baseAds);
    const maxCap = Math.max(weaponState.spreadMaxHip, weaponState.spreadMaxAds);
    weaponState.spreadCurrent = THREE.MathUtils.clamp(weaponState.spreadCurrent, minBase, maxCap);
  }

  function setPeacefulState(){
    if(!game) return;
    game.spawnQueue = 0;
    game.phaseQueue = 0;
    game.enemiesRemaining = 0;
    if(Array.isArray(game.pendingPhases)){
      game.pendingPhases.length = 0;
    } else {
      game.pendingPhases = [];
    }
    game.roundPhase = null;
    game.roundPhaseLabel = '';
    if(game.state !== 'over' && game.state !== 'buyPhase'){
      game.state = 'peaceful';
    }
    if(playerState.buyPhase){
      playerState.buyPhase = false;
      hideBuyBanner();
    }
    if(playerState.storeOpen){
      closeStore();
    }
    updateEnemiesHud();
  }

  function purgeEnemies(){
    if(!Array.isArray(enemies)){
      setPeacefulState();
      return;
    }
    const snapshot = enemies.slice();
    for(let i = 0; i < snapshot.length; i++){
      const enemy = snapshot[i];
      if(!enemy) continue;
      enemy.__suppressLoot = true;
      enemy.__suppressRoundCheck = true;
      patchedRemoveEnemy(enemy);
    }
    setPeacefulState();
  }

  function retrofitExistingEnemies(){
    if(ENEMIES_DISABLED){
      purgeEnemies();
      return;
    }
    if(!Array.isArray(enemies)) return;
    const round = game?.round || 1;
    for(let i = 0; i < enemies.length; i++){
      const enemy = enemies[i];
      if(!enemy) continue;
      if(!enemy.profile){
        const profile = buildEnemyProfile(round);
        enemy.profile = profile;
        enemy.weaponPattern = {
          burstMin: profile.burst[0],
          burstMax: profile.burst[1],
          burstCadence: profile.burstCadence.slice(0, 2),
          restCadence: profile.restCadence.slice(0, 2),
        };
        enemy.preferredRange = profile.preferredRange;
        enemy.damageScalar = profile.damageScale;
      }
      if(enemy.mesh && !enemy.mesh.userData?.materials){
        const previousPos = enemy.mesh.position ? enemy.mesh.position.clone() : null;
        scene.remove(enemy.mesh);
        const rebuilt = buildEnemyRig(enemy.profile);
        if(rebuilt?.group){
          enemy.mesh = rebuilt.group;
          enemy.primaryMaterial = rebuilt.materials?.primary || null;
          enemy.accentMaterial = rebuilt.materials?.accent || null;
          enemy.visorMaterial = rebuilt.materials?.visor || null;
          enemy.skinMaterial = rebuilt.materials?.skin || null;
          enemy.hairMaterial = rebuilt.materials?.hair || null;
          if(previousPos){
            enemy.mesh.position.copy(previousPos);
          } else {
            enemy.mesh.position.set(0, ENEMY_HALF_HEIGHT, 0);
          }
          scene.add(enemy.mesh);
        }
      }
      if(enemy.mesh){
        applyEnemyVisualProfile(enemy);
        enemy.mesh.userData.enemyProfile = enemy.profile;
      }
      enemy.__profileRegistered = false;
      registerEnemyProfile(enemy);
    }
  }

  function ensureEnemyFabricTexture(paletteOverride){
    const palette = paletteOverride || getEnemyPalette(0);
    return createSentinelFabricTexture(palette);
  }

  function applySharedEnemyTexture(material){
    if(!material) return material;
    return material;
  }

  function createDefaultEnemyMaterial(){
    const palette = getEnemyPalette(0);
    const fabric = ensureEnemyFabricTexture(palette);
    return new THREE.MeshStandardMaterial({
      color: palette.base,
      map: fabric,
      roughness: 0.48,
      metalness: 0.28,
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: 0.3,
    });
  }

  function instantiateEnemyMaterial(){
    return createDefaultEnemyMaterial();
  }

  function ensureEnemyRigAssets(){
    if(PATCH_STATE.enemyRigAssets){
      return PATCH_STATE.enemyRigAssets;
    }

    const assets = {};
    const torsoHeight = ENEMY_HEIGHT * 0.48;
    const torsoWidth = ENEMY_RADIUS * 1.9;
    const torsoDepth = ENEMY_RADIUS * 1.2;
    const pelvisHeight = ENEMY_HEIGHT * 0.2;
    const limbLength = ENEMY_HEIGHT * 0.38;
    const limbRadius = ENEMY_RADIUS * 0.32;
    assets.torso = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    assets.pelvis = new THREE.BoxGeometry(torsoWidth * 0.8, pelvisHeight * 0.85, torsoDepth * 0.9);
    assets.backplate = new THREE.BoxGeometry(torsoWidth * 0.9, torsoHeight * 0.5, torsoDepth * 0.5);
    assets.chestPlate = new THREE.BoxGeometry(torsoWidth * 1.05, torsoHeight * 0.45, torsoDepth * 0.6);
    assets.shoulderBridge = new THREE.BoxGeometry(torsoWidth * 0.9, ENEMY_HEIGHT * 0.08, torsoDepth * 1.5);
    assets.shoulder = new THREE.CylinderGeometry(ENEMY_RADIUS * 0.48, ENEMY_RADIUS * 0.42, ENEMY_HEIGHT * 0.18, 14, 1, true);
    assets.armUpper = new THREE.CapsuleGeometry(limbRadius, limbLength * 0.6, 8, 12);
    assets.armLower = new THREE.CapsuleGeometry(limbRadius * 0.9, limbLength * 0.62, 8, 12);
    assets.forearmGuard = new THREE.BoxGeometry(ENEMY_RADIUS * 0.55, ENEMY_HEIGHT * 0.16, ENEMY_RADIUS * 0.7);
    assets.hand = new THREE.BoxGeometry(ENEMY_RADIUS * 0.6, ENEMY_HEIGHT * 0.14, ENEMY_RADIUS * 0.36);
    assets.neck = new THREE.CylinderGeometry(ENEMY_RADIUS * 0.22, ENEMY_RADIUS * 0.2, ENEMY_HEIGHT * 0.08, 12);
    assets.head = new THREE.SphereGeometry(ENEMY_RADIUS * 0.55, 26, 20);
    assets.face = new THREE.CylinderGeometry(ENEMY_RADIUS * 0.46, ENEMY_RADIUS * 0.46, ENEMY_HEIGHT * 0.18, 20, 1, true);
    assets.hair = new THREE.SphereGeometry(ENEMY_RADIUS * 0.6, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.5);
    assets.visor = new THREE.SphereGeometry(ENEMY_RADIUS * 0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48);
    assets.thigh = new THREE.CapsuleGeometry(ENEMY_RADIUS * 0.36, limbLength * 0.7, 10, 14);
    assets.shin = new THREE.CapsuleGeometry(ENEMY_RADIUS * 0.32, limbLength * 0.7, 10, 14);
    assets.guard = new THREE.BoxGeometry(ENEMY_RADIUS * 0.7, ENEMY_HEIGHT * 0.16, ENEMY_RADIUS * 0.9);
    assets.boot = new THREE.BoxGeometry(ENEMY_RADIUS * 0.9, ENEMY_HEIGHT * 0.08, ENEMY_RADIUS * 0.96);
    assets.collision = new THREE.CapsuleGeometry(ENEMY_RADIUS, ENEMY_HEIGHT * 0.5, 12, 20);

    for(const key of Object.keys(assets)){
      const geom = assets[key];
      geom.computeBoundingBox?.();
      geom.computeBoundingSphere?.();
    }

    PATCH_STATE.enemyRigAssets = assets;
    PATCH_STATE.enemyGeometry = assets.collision;
    return assets;
  }

  function ensureEnemyGeometry(){
    const assets = ensureEnemyRigAssets();
    return assets.collision;
  }

  function isSharedEnemyGeometry(geometry){
    if(!geometry) return false;
    const assets = ensureEnemyRigAssets();
    for(const key of Object.keys(assets)){
      if(assets[key] === geometry){
        return true;
      }
    }
    return false;
  }

  function buildEnemyRig(profile){
    const assets = ensureEnemyRigAssets();
    const rig = new THREE.Group();
    rig.name = 'sentinel-frame';

    const palette = getEnemyPalette(profile?.paletteIndex ?? 0);
    const fabric = createSentinelFabricTexture(palette);
    const trim = createSentinelTrimTexture(palette);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: palette.base,
      map: fabric,
      roughness: 0.44,
      metalness: 0.32,
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: 0.32,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: palette.accent,
      map: trim,
      roughness: 0.3,
      metalness: 0.52,
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: 0.45,
    });
    const visorMaterial = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: new THREE.Color(palette.accent),
      emissiveIntensity: 0.85,
      roughness: 0.18,
      metalness: 0.28,
      transparent: true,
      opacity: 0.86,
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: palette.skin,
      roughness: 0.42,
      metalness: 0.08,
    });
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: palette.hair,
      roughness: 0.32,
      metalness: 0.16,
    });

    const addMesh = (geometry, material, position, rotation = null, name = '') => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      if(name) mesh.name = name;
      if(position) mesh.position.copy(position);
      if(rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
      rig.add(mesh);
      return mesh;
    };

    const baseY = -ENEMY_HALF_HEIGHT;
    const pelvisY = baseY + ENEMY_HEIGHT * 0.28;
    const torsoY = pelvisY + (assets.torso.parameters?.height || ENEMY_HEIGHT * 0.48) * 0.5;
    const shoulderY = pelvisY + ENEMY_HEIGHT * 0.42;
    const headY = pelvisY + ENEMY_HEIGHT * 0.68;

    addMesh(assets.pelvis, bodyMaterial, new THREE.Vector3(0, pelvisY, 0), null, 'sentinel-pelvis');
    addMesh(assets.torso, bodyMaterial, new THREE.Vector3(0, torsoY, 0), null, 'sentinel-torso');
    addMesh(assets.backplate, accentMaterial, new THREE.Vector3(0, torsoY, -ENEMY_RADIUS * 0.2), null, 'sentinel-backplate');
    addMesh(assets.chestPlate, accentMaterial, new THREE.Vector3(0, torsoY + ENEMY_RADIUS * 0.2, ENEMY_RADIUS * 0.3), null, 'sentinel-chestplate');
    addMesh(assets.shoulderBridge, accentMaterial, new THREE.Vector3(0, shoulderY, 0), new THREE.Euler(0, 0, Math.PI / 2), 'sentinel-shoulder-bridge');

    const shoulderOffset = ENEMY_RADIUS * 0.85;
    addMesh(assets.shoulder, accentMaterial, new THREE.Vector3(-shoulderOffset, shoulderY, 0), new THREE.Euler(0, 0, Math.PI / 2), 'sentinel-shoulder-left');
    addMesh(assets.shoulder, accentMaterial, new THREE.Vector3(shoulderOffset, shoulderY, 0), new THREE.Euler(0, 0, Math.PI / 2), 'sentinel-shoulder-right');

    addMesh(assets.armUpper, bodyMaterial, new THREE.Vector3(-shoulderOffset, shoulderY - 0.12, 0), null, 'sentinel-arm-upper-left');
    addMesh(assets.armUpper, bodyMaterial, new THREE.Vector3(shoulderOffset, shoulderY - 0.12, 0), null, 'sentinel-arm-upper-right');
    addMesh(assets.armLower, bodyMaterial, new THREE.Vector3(-shoulderOffset, shoulderY - 0.38, 0), null, 'sentinel-arm-lower-left');
    addMesh(assets.armLower, bodyMaterial, new THREE.Vector3(shoulderOffset, shoulderY - 0.38, 0), null, 'sentinel-arm-lower-right');
    addMesh(assets.forearmGuard, accentMaterial, new THREE.Vector3(-shoulderOffset, shoulderY - 0.34, ENEMY_RADIUS * 0.12), null, 'sentinel-arm-guard-left');
    addMesh(assets.forearmGuard, accentMaterial, new THREE.Vector3(shoulderOffset, shoulderY - 0.34, ENEMY_RADIUS * 0.12), null, 'sentinel-arm-guard-right');
    addMesh(assets.hand, accentMaterial, new THREE.Vector3(-shoulderOffset, shoulderY - 0.58, 0.05), null, 'sentinel-hand-left');
    addMesh(assets.hand, accentMaterial, new THREE.Vector3(shoulderOffset, shoulderY - 0.58, 0.05), null, 'sentinel-hand-right');

    const legOffset = ENEMY_RADIUS * 0.5;
    addMesh(assets.thigh, bodyMaterial, new THREE.Vector3(-legOffset, baseY + ENEMY_HEIGHT * 0.18, 0), null, 'sentinel-thigh-left');
    addMesh(assets.thigh, bodyMaterial, new THREE.Vector3(legOffset, baseY + ENEMY_HEIGHT * 0.18, 0), null, 'sentinel-thigh-right');
    addMesh(assets.guard, accentMaterial, new THREE.Vector3(-legOffset, baseY + ENEMY_HEIGHT * 0.2, ENEMY_RADIUS * 0.08), null, 'sentinel-guard-left');
    addMesh(assets.guard, accentMaterial, new THREE.Vector3(legOffset, baseY + ENEMY_HEIGHT * 0.2, ENEMY_RADIUS * 0.08), null, 'sentinel-guard-right');
    addMesh(assets.shin, bodyMaterial, new THREE.Vector3(-legOffset, baseY - ENEMY_HEIGHT * 0.02, 0), null, 'sentinel-shin-left');
    addMesh(assets.shin, bodyMaterial, new THREE.Vector3(legOffset, baseY - ENEMY_HEIGHT * 0.02, 0), null, 'sentinel-shin-right');
    addMesh(assets.boot, accentMaterial, new THREE.Vector3(-legOffset, baseY - ENEMY_HEIGHT * 0.22, ENEMY_RADIUS * 0.16), null, 'sentinel-boot-left');
    addMesh(assets.boot, accentMaterial, new THREE.Vector3(legOffset, baseY - ENEMY_HEIGHT * 0.22, ENEMY_RADIUS * 0.16), null, 'sentinel-boot-right');

    addMesh(assets.neck, bodyMaterial, new THREE.Vector3(0, shoulderY + 0.08, 0), null, 'sentinel-neck');
    addMesh(assets.head, skinMaterial, new THREE.Vector3(0, headY, 0), null, 'sentinel-head');
    addMesh(assets.face, visorMaterial, new THREE.Vector3(0, headY, ENEMY_RADIUS * 0.52), new THREE.Euler(Math.PI / 2, 0, 0), 'sentinel-face');
    addMesh(assets.hair, hairMaterial, new THREE.Vector3(0, headY + ENEMY_RADIUS * 0.18, -ENEMY_RADIUS * 0.05), null, 'sentinel-hair');
    addMesh(assets.visor, visorMaterial, new THREE.Vector3(0, headY, ENEMY_RADIUS * 0.5), null, 'sentinel-visor');

    rig.traverse((obj) => {
      if(obj && obj.isMesh){
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    rig.userData.primaryMaterial = bodyMaterial;
    rig.userData.accentMaterial = accentMaterial;
    rig.userData.visorMaterial = visorMaterial;
    rig.userData.skinMaterial = skinMaterial;
    rig.userData.hairMaterial = hairMaterial;
    rig.userData.materials = {
      body: bodyMaterial,
      accent: accentMaterial,
      visor: visorMaterial,
      skin: skinMaterial,
      hair: hairMaterial,
    };

    return {
      group: rig,
      materials: {
        primary: bodyMaterial,
        accent: accentMaterial,
        visor: visorMaterial,
        skin: skinMaterial,
        hair: hairMaterial,
      }
    };
  }

  function getEnemyPrimaryMaterial(enemy){
    if(!enemy) return null;
    if(enemy.primaryMaterial) return enemy.primaryMaterial;
    const mesh = enemy.mesh;
    if(!mesh) return null;
    if(mesh.userData?.materials?.body){
      return mesh.userData.materials.body;
    }
    if(mesh.userData?.primaryMaterial && mesh.userData.primaryMaterial.isMaterial){
      return mesh.userData.primaryMaterial;
    }
    if(mesh.isMesh){
      return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    }
    if(mesh.isGroup){
      let found = null;
      mesh.traverse(child => {
        if(found || !child || !child.isMesh) return;
        if(child.userData?.primaryMaterial){
          found = Array.isArray(child.material) ? child.material[0] : child.material;
        }
      });
      if(found) return found;
      mesh.traverse(child => {
        if(found || !child || !child.isMesh) return;
        found = Array.isArray(child.material) ? child.material[0] : child.material;
      });
      return found;
    }
    return null;
  }

  function getStaticBounds(mesh, forceUpdate = false){
    if(!mesh) return null;
    let entry = staticBoundsCache.get(mesh);
    if(!entry){
      entry = { box: new THREE.Box3(), frame: -1 };
      staticBoundsCache.set(mesh, entry);
      forceUpdate = true;
    }
    const frameId = PATCH_STATE.frameId || 0;
    if(forceUpdate || entry.frame !== frameId){
      mesh.updateWorldMatrix?.(true, false);
      const geometry = mesh.geometry;
      if(geometry && geometry.boundingBox){
        entry.box.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      } else if(geometry && geometry.computeBoundingBox){
        geometry.computeBoundingBox();
        entry.box.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      } else {
        entry.box.setFromObject(mesh);
      }
      entry.frame = frameId;
    }
    return entry.box;
  }

  function ensureWeaponModel(){
    if(PATCH_STATE.weaponParts){
      return;
    }
    if(!ctx.muzzleFlash){
      return;
    }
    const weaponGroup = ctx.muzzleFlash.parent?.parent || ctx.muzzleFlash.parent;
    if(!weaponGroup){
      return;
    }
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2839,
      metalness: 0.55,
      roughness: 0.35,
      emissive: new THREE.Color(0x0b121d),
      emissiveIntensity: 0.25,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b86ff,
      emissive: new THREE.Color(0x162b45),
      emissiveIntensity: 0.45,
      metalness: 0.4,
      roughness: 0.4,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.82), bodyMaterial);
    body.position.set(0.02, -0.05, -0.52);
    body.castShadow = body.receiveShadow = true;

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.24), bodyMaterial.clone());
    grip.position.set(-0.08, -0.16, -0.26);
    grip.rotation.x = THREE.MathUtils.degToRad(12);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.35), bodyMaterial.clone());
    stock.position.set(-0.12, -0.04, 0.05);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.58, 12, 1, true), new THREE.MeshStandardMaterial({
      color: 0x1f1f24,
      metalness: 0.75,
      roughness: 0.2,
    }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.09, 0.0, -0.96);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.38), accentMaterial);
    rail.position.set(0.05, 0.02, -0.42);

    weaponGroup.add(body, grip, stock, barrel, rail);
    PATCH_STATE.weaponParts = [body, grip, stock, barrel, rail];
  }

  function ensureMuzzleAnchor(){
    if(!ctx.muzzleFlash) return;
    const weaponGroup = ctx.muzzleFlash.parent?.parent || ctx.muzzleFlash.parent;
    if(!weaponGroup) return;
    let anchor = PATCH_STATE.muzzleAnchor;
    if(!anchor){
      anchor = new THREE.Object3D();
      anchor.name = 'patch001-muzzle-anchor';
      anchor.position.set(0.18, -0.08, -0.92);
      PATCH_STATE.muzzleAnchor = anchor;
      weaponGroup.add(anchor);
    } else if(anchor.parent !== weaponGroup){
      weaponGroup.add(anchor);
    }
    if(ctx.muzzleFlash.parent !== anchor){
      anchor.add(ctx.muzzleFlash);
      ctx.muzzleFlash.position.set(0, 0, 0);
    }
    ctx.muzzleAnchor = anchor;
    anchor.updateMatrixWorld(true);
  }

  function buildEnemySpawnZones(){
    const zones = [];
    ensureSpawnBounds();
    const rawSources = [];
    if(Array.isArray(ctx.enemySpawnPoints)) rawSources.push(...ctx.enemySpawnPoints);
    if(Array.isArray(refs.enemySpawnPoints)) rawSources.push(...refs.enemySpawnPoints);
    if(Array.isArray(world.enemySpawnPoints)) rawSources.push(...world.enemySpawnPoints);
    if(world.spawnPoints){
      if(Array.isArray(world.spawnPoints.enemy)) rawSources.push(...world.spawnPoints.enemy);
      else if(Array.isArray(world.spawnPoints)) rawSources.push(...world.spawnPoints);
    }
    if(refs.spawnPoints){
      if(Array.isArray(refs.spawnPoints.enemy)) rawSources.push(...refs.spawnPoints.enemy);
      else if(Array.isArray(refs.spawnPoints)) rawSources.push(...refs.spawnPoints);
    }
    for(const entry of rawSources){
      const zone = normalizeSpawnZone(entry);
      if(zone) zones.push(zone);
    }
    if(zones.length === 0){
      const size = Math.max(20, world.size || 60);
      const radius = Math.max(8, size * 0.18);
      const fallbackZones = [
        { center: new THREE.Vector3(0, 0, -size * 0.4), radius, height: 0 },
        { center: new THREE.Vector3(size * 0.35, 0, size * 0.35), radius: radius * 0.75, height: 0 },
        { center: new THREE.Vector3(-size * 0.35, 0, size * 0.35), radius: radius * 0.75, height: 0 },
      ];
      for(let i = 0; i < fallbackZones.length; i++){
        const clamped = clampZoneToSpawnBounds(fallbackZones[i]);
        if(clamped) zones.push(clamped);
      }
    }
    return zones;
  }

  function normalizeSpawnZone(entry){
    if(!entry) return null;
    const baseRadius = Math.max(6, (world.size || 60) * 0.12);
    let zone = null;
    if(entry.isVector3){
      zone = { center: entry.clone(), radius: baseRadius, height: entry.y || 0 };
    } else if(entry.position?.isVector3){
      const radius = typeof entry.userData?.radius === 'number' ? entry.userData.radius : (entry.radius || baseRadius);
      zone = { center: entry.position.clone(), radius: Math.max(4, radius), height: entry.position.y || 0 };
    } else if(typeof entry === 'object'){
      if(entry.center?.isVector3){
        zone = { center: entry.center.clone(), radius: entry.radius || baseRadius, height: entry.height || entry.center.y || 0 };
      } else if('x' in entry && 'z' in entry){
        const center = new THREE.Vector3(entry.x, entry.y || 0, entry.z);
        const radius = entry.radius || entry.r || baseRadius;
        zone = { center, radius: Math.max(4, radius), height: entry.height || center.y };
      }
    }
    if(!zone) return null;
    zone = clampZoneToSpawnBounds(zone);
    if(!zone) return null;
    if(!Number.isFinite(zone.radius) || zone.radius <= ENEMY_RADIUS + 0.2) return null;
    return zone;
  }

  function computeOppositeSpawnPoint(){
    const playerSpawn = PATCH_STATE.playerSpawn;
    if(!playerSpawn) return null;
    const bounds = ensureSpawnBounds();
    const center = tempVecH;
    if(bounds && !bounds.isEmpty()){
      bounds.getCenter(center);
    } else {
      center.set(0, playerSpawn.y, 0);
    }
    const opposite = new THREE.Vector3(
      center.x * 2 - playerSpawn.x,
      playerSpawn.y,
      center.z * 2 - playerSpawn.z
    );
    if(bounds && !bounds.isEmpty()){
      opposite.x = THREE.MathUtils.clamp(opposite.x, bounds.min.x, bounds.max.x);
      opposite.z = THREE.MathUtils.clamp(opposite.z, bounds.min.z, bounds.max.z);
      opposite.y = THREE.MathUtils.clamp(opposite.y, bounds.min.y, bounds.max.y);
    }
    return opposite;
  }

  function enforceOppositeSpawnAlignment(){
    const playerSpawn = PATCH_STATE.playerSpawn;
    if(!playerSpawn) return;
    const opposite = computeOppositeSpawnPoint();
    if(!opposite) return;
    const zones = PATCH_STATE.enemySpawnZones || [];
    const baseRadius = CONFIG.AI.spawnOppositeRadius || 6;
    let sourceRadius = baseRadius;
    for(let i = 0; i < zones.length; i++){
      const radius = zones[i]?.radius;
      if(Number.isFinite(radius) && radius > sourceRadius){
        sourceRadius = radius;
      }
    }
    const zone = {
      center: opposite.clone(),
      radius: Math.max(baseRadius, sourceRadius),
      height: opposite.y,
    };
    const clamped = clampZoneToSpawnBounds(zone) || zone;
    PATCH_STATE.enemyOppositePoint = clamped.center.clone();
    PATCH_STATE.enemySpawnZones = [clamped];
  }

  ensureWeaponModel();
  ensureMuzzleAnchor();

  PATCH_STATE.playerSpawn = (PATCH_STATE.playerSpawn || new THREE.Vector3()).copy(controls.getObject().position);
  refreshWorldBounds();
  PATCH_STATE.enemySpawnZones = buildEnemySpawnZones();
  enforceOppositeSpawnAlignment();

  const fallbackCanvas = globalNS.fallbackCanvas || (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx2d = canvas.getContext('2d');
    if(ctx2d){
      ctx2d.fillStyle = '#131b24';
      ctx2d.fillRect(0, 0, 1, 1);
    }
    return canvas;
  })();
  globalNS.fallbackCanvas = fallbackCanvas;
  const fallbackCubeImage = globalNS.fallbackCubeImage || (() => {
    const faces = new Array(6);
    for(let i = 0; i < 6; i++) faces[i] = fallbackCanvas;
    return faces;
  })();
  globalNS.fallbackCubeImage = fallbackCubeImage;

  function ensureTextureReady(tex){
    if(!tex) return false;
    const img = tex.image;
    if(!img){
      if(!tex.userData) tex.userData = {};
      if(!tex.userData.fallbackApplied){
        tex.image = tex.isCubeTexture ? fallbackCubeImage : fallbackCanvas;
        tex.userData.fallbackApplied = true;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
      }
      return false;
    }
    if(Array.isArray(img)){
      let valid = true;
      for(let i = 0; i < img.length; i++){
        const face = img[i];
        if(!face){ valid = false; break; }
        const w = face.width || face.naturalWidth || face.videoWidth;
        const h = face.height || face.naturalHeight || face.videoHeight;
        if(!w || !h){ valid = false; break; }
      }
      if(!valid){
        tex.image = fallbackCubeImage;
        tex.userData = tex.userData || {};
        tex.userData.fallbackApplied = true;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return true;
      }
      return true;
    }
    const isImageEl = typeof Image !== 'undefined' && img instanceof Image;
    if(isImageEl){
      if(!img.complete){
        if(!tex.userData) tex.userData = {};
        if(!tex.userData.errorHooked){
          tex.userData.errorHooked = true;
          img.addEventListener('error', () => {
            tex.image = tex.isCubeTexture ? fallbackCubeImage : fallbackCanvas;
            tex.userData.fallbackApplied = true;
            tex.generateMipmaps = false;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
          }, { once: true });
        }
        return false;
      }
      if(img.naturalWidth === 0 || img.naturalHeight === 0){
        tex.image = tex.isCubeTexture ? fallbackCubeImage : fallbackCanvas;
        tex.userData = tex.userData || {};
        tex.userData.fallbackApplied = true;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return true;
      }
    } else {
      const width = img.width || img.videoWidth || img.naturalWidth;
      const height = img.height || img.videoHeight || img.naturalHeight;
      if(!width || !height){
        tex.image = tex.isCubeTexture ? fallbackCubeImage : fallbackCanvas;
        tex.userData = tex.userData || {};
        tex.userData.fallbackApplied = true;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return true;
      }
    }
    return true;
  }

  function safeFlagTexture(tex){
    if(!ensureTextureReady(tex)) return;
    if(tex.image && (tex.image.width || tex.image.naturalWidth || tex.image.videoWidth)){
      tex.needsUpdate = true;
    }
  }

  const textureCandidates = [];
  if(ui){
    for(const value of Object.values(ui)){
      if(value && value.isTexture){
        textureCandidates.push(value);
      } else if(Array.isArray(value)){
        for(const t of value){ if(t && t.isTexture) textureCandidates.push(t); }
      }
    }
  }
  if(refs){
    for(const value of Object.values(refs)){
      if(value && value.isTexture){
        textureCandidates.push(value);
      } else if(Array.isArray(value)){
        for(const t of value){ if(t && t.isTexture) textureCandidates.push(t); }
      }
    }
  }
  textureCandidates.forEach(ensureTextureReady);

  function wrapPositive(angle){
    let wrapped = (angle + Math.PI) % TWO_PI;
    if(wrapped < 0) wrapped += TWO_PI;
    return wrapped;
  }

  function normalizeYaw(angle){
    return wrapPositive(angle) - Math.PI;
  }

  function shortestAngleDiff(a, b){
    let diff = a - b;
    diff = (diff + Math.PI) % TWO_PI;
    if(diff < 0) diff += TWO_PI;
    return diff - Math.PI;
  }

  function enforceLookConsistency(){
    if(!yawObject || !pitchObject) return;
    const pointerSpeed = typeof controls.pointerSpeed === 'number' ? controls.pointerSpeed : 1;
    const maxStep = MAX_MOUSE_DELTA * LOOK_SPEED * pointerSpeed;

    const currentYaw = yawObject.rotation.y;
    const yawDiff = shortestAngleDiff(currentYaw, lastYaw);
    const clampedYaw = normalizeYaw(lastYaw + THREE.MathUtils.clamp(yawDiff, -maxStep, maxStep));

    const currentPitch = pitchObject.rotation.x;
    const pitchDiff = THREE.MathUtils.clamp(currentPitch - lastPitch, -maxStep, maxStep);
    const clampedPitch = THREE.MathUtils.clamp(lastPitch + pitchDiff, minPitchClamp, maxPitchClamp);

    yawObject.rotation.y = clampedYaw;
    yawObject.rotation.z = 0;
    pitchObject.rotation.x = clampedPitch;
    pitchObject.rotation.z = 0;

    lastYaw = clampedYaw;
    lastPitch = clampedPitch;
  }

  const vectorPool = shared.vectorPool || (shared.vectorPool = []);
  function borrowVec3(){
    return vectorPool.pop() || new THREE.Vector3();
  }
  function releaseVec3(v){
    if(!v) return;
    v.setScalar(0);
    vectorPool.push(v);
  }

  const pools = globalNS.pools = globalNS.pools || {};
  const tracerPool = pools.tracerPool || (pools.tracerPool = []);
  const activeTracers = pools.activeTracers || (pools.activeTracers = []);
  const tracerMaterial = pools.tracerMaterial || (pools.tracerMaterial = new THREE.LineBasicMaterial({ color: 0xfff6a0, transparent: true, opacity: 0.85 }));
  function createTracer(){
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    line.frustumCulled = false;
    line.visible = false;
    return line;
  }
  function primeTracerPool(){
    const required = CONFIG.PERF.tracerPoolSize;
    const total = tracerPool.length + activeTracers.length;
    for(let i=total;i<required;i++){
      const tracer = createTracer();
      tracer.userData.life = 0;
      tracerPool.push(tracer);
      scene.add(tracer);
    }
  }
  primeTracerPool();

  function spawnTracer(start, end, options = {}){
    const tracer = tracerPool.pop() || createTracer();
    const posAttr = tracer.geometry.getAttribute('position');
    posAttr.setXYZ(0, start.x, start.y, start.z);
    posAttr.setXYZ(1, end.x, end.y, end.z);
    posAttr.needsUpdate = true;
    tracer.visible = true;
    const life = options.life ?? CONFIG.PERF.tracerLifetime;
    tracer.userData.life = life;
    tracer.userData.fade = options.fade ?? life;
    tracer.userData.followProjectile = !!options.follow;
    const mat = tracer.material;
    if(options.color !== undefined){
      mat.color.set(options.color);
    }
    if(options.opacity !== undefined){
      mat.opacity = options.opacity;
    } else {
      mat.opacity = 0.85;
    }
    activeTracers.push(tracer);
    if(!tracer.parent){
      scene.add(tracer);
    }
    return tracer;
  }
  function updateTracers(dt){
    for(let i=activeTracers.length-1;i>=0;i--){
      const tracer = activeTracers[i];
      tracer.userData.life -= dt;
      const material = tracer.material;
      material.opacity = Math.max(0, tracer.userData.life / tracer.userData.fade);
      if(tracer.userData.life <= 0){
        tracer.visible = false;
        activeTracers.splice(i,1);
        tracerPool.push(tracer);
      }
    }
  }

  const impactPool = pools.impactPool || (pools.impactPool = []);
  const activeImpacts = pools.activeImpacts || (pools.activeImpacts = []);
  function createImpact(){
    const geo = new THREE.PlaneGeometry(0.3, 0.3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 999;
    return mesh;
  }
  function primeImpactPool(){
    const required = CONFIG.PERF.impactPoolSize;
    const total = impactPool.length + activeImpacts.length;
    for(let i=total;i<required;i++){
      const impact = createImpact();
      impact.userData.life = 0;
      impactPool.push(impact);
      scene.add(impact);
    }
  }
  primeImpactPool();

  function spawnImpact(position, normal){
    const impact = impactPool.pop() || createImpact();
    impact.position.copy(position);
    const alignedNormal = tempVecA.copy(normal);
    if(alignedNormal.lengthSq() === 0){
      alignedNormal.copy(upVector);
    } else {
      alignedNormal.normalize();
    }
    tempQuat.setFromUnitVectors(upVector, alignedNormal);
    impact.quaternion.copy(tempQuat);
    impact.visible = true;
    impact.userData.life = CONFIG.PERF.impactLifetime;
    impact.userData.fade = CONFIG.PERF.impactLifetime;
    activeImpacts.push(impact);
    if(!impact.parent){
      scene.add(impact);
    }
  }
  function updateImpacts(dt){
    for(let i=activeImpacts.length-1;i>=0;i--){
      const impact = activeImpacts[i];
      impact.userData.life -= dt;
      const mat = impact.material;
      mat.opacity = Math.max(0, impact.userData.life / impact.userData.fade);
      if(impact.userData.life <= 0){
        impact.visible = false;
        activeImpacts.splice(i,1);
        impactPool.push(impact);
      }
    }
  }

  const projectilePool = pools.projectilePool || (pools.projectilePool = []);
  const activeProjectiles = pools.activeProjectiles || (pools.activeProjectiles = []);

  function spawnProjectile(options = {}){
    const projectile = projectilePool.pop() || {
      position: new THREE.Vector3(),
      prevPosition: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    };
    const origin = options.origin || camera.position;
    projectile.position.copy(origin);
    projectile.prevPosition.copy(origin);
    projectile.origin.copy(origin);
    projectile.velocity.copy(options.direction || getCameraForward(tempVecH));
    if(projectile.velocity.lengthSq() < 1e-6){
      projectile.velocity.set(0, 0, -1);
    }
    const speed = Math.max(1, options.speed || CONFIG.WEAPONS.muzzleVelocity);
    projectile.velocity.normalize().multiplyScalar(speed);
    projectile.gravity = options.gravity ?? CONFIG.WEAPONS.projectileGravity;
    projectile.drag = Math.max(0, options.drag ?? CONFIG.WEAPONS.projectileDrag);
    projectile.life = 0;
    projectile.maxLife = Math.max(0.1, options.maxLife ?? CONFIG.WEAPONS.projectileLife);
    projectile.owner = options.owner || 'player';
    projectile.sourceEnemy = options.sourceEnemy || null;
    projectile.onEnemyHit = options.onEnemyHit || null;
    projectile.onWorldHit = options.onWorldHit || null;
    projectile.onPlayerHit = options.onPlayerHit || null;
    projectile.tracerColor = options.tracerColor;
    projectile.tracerOpacity = options.tracerOpacity;
    projectile.tracerTimer = 0;
    projectile.penetration = Math.max(0, options.penetration ?? CONFIG.WEAPONS.projectilePenetration);
    projectile.extra = options.extra || {};
    activeProjectiles.push(projectile);
    return projectile;
  }

  function retireProjectile(index){
    const projectile = activeProjectiles[index];
    if(!projectile) return;
    activeProjectiles.splice(index, 1);
    projectile.onEnemyHit = null;
    projectile.onWorldHit = null;
    projectile.onPlayerHit = null;
    projectile.sourceEnemy = null;
    projectile.extra = {};
    projectilePool.push(projectile);
  }

  function updateProjectiles(dt){
    if(!activeProjectiles.length) return;
    const statics = gatherStaticMeshes();
    const enemyMeshes = gatherEnemyMeshes();
    const playerBox = playerCollider && !playerCollider.isEmpty() ? playerCollider : null;
    for(let i = activeProjectiles.length - 1; i >= 0; i--){
      const projectile = activeProjectiles[i];
      projectile.life += dt;
      if(projectile.life >= projectile.maxLife){
        retireProjectile(i);
        continue;
      }

      projectile.prevPosition.copy(projectile.position);
      if(projectile.gravity){
        projectile.velocity.y -= projectile.gravity * dt;
      }
      if(projectile.drag > 0){
        const damp = Math.max(0, 1 - projectile.drag * dt);
        projectile.velocity.multiplyScalar(damp);
      }

      tempVecA.copy(projectile.velocity).multiplyScalar(dt);
      projectile.position.add(tempVecA);
      const travel = tempVecA.length();
      if(travel <= 1e-5){
        projectile.tracerTimer -= dt;
        if(projectile.tracerTimer <= 0){
          spawnTracer(projectile.prevPosition, projectile.position, {
            color: projectile.tracerColor ?? (projectile.owner === 'player' ? 0xfff3a0 : 0xff6d6d),
            opacity: projectile.tracerOpacity ?? 0.9,
            life: CONFIG.PERF.tracerLifetime * 1.2,
          });
          projectile.tracerTimer = CONFIG.WEAPONS.tracerInterval;
        }
        continue;
      }

      const dir = tempVecB.copy(tempVecA).multiplyScalar(1 / travel);
      helperRay.set(projectile.prevPosition, dir);
      helperRay.far = travel + 0.05;
      let consumed = false;

      if(projectile.owner === 'player'){
        const hits = helperRay.intersectObjects(composeRaycastList(enemyMeshes, statics), false);
        if(hits.length){
          const hit = hits[0];
          const enemy = hit.object?.userData?.enemy;
          if(enemy && projectile.onEnemyHit){
            consumed = projectile.onEnemyHit(projectile, enemy, hit) !== false;
          } else if(projectile.onWorldHit){
            consumed = projectile.onWorldHit(projectile, hit, dir, enemyMeshes, statics) !== false;
          } else {
            consumed = true;
          }
        }
      } else {
        if(playerBox){
          const impact = helperRay.ray.intersectBox(playerBox, tempVecC);
          if(impact && impact.distanceToSquared(projectile.prevPosition) <= (travel + 0.1) * (travel + 0.1)){
            if(projectile.onPlayerHit){
              projectile.onPlayerHit(projectile, impact.clone?.() ? impact.clone() : tempVecH.copy(impact));
            }
            consumed = true;
          }
        }
        if(!consumed){
          const hits = helperRay.intersectObjects(statics, false);
          if(hits.length){
            const hit = hits[0];
            if(projectile.onWorldHit){
              projectile.onWorldHit(projectile, hit, dir);
            }
            consumed = true;
          }
        }
      }

      helperRay.far = Infinity;

      if(consumed){
        retireProjectile(i);
        continue;
      }

      projectile.tracerTimer -= dt;
      if(projectile.tracerTimer <= 0){
        spawnTracer(projectile.prevPosition, projectile.position, {
          color: projectile.tracerColor ?? (projectile.owner === 'player' ? 0xfff3a0 : 0xff6d6d),
          opacity: projectile.tracerOpacity ?? 0.9,
          life: CONFIG.PERF.tracerLifetime * 1.6,
        });
        projectile.tracerTimer = CONFIG.WEAPONS.tracerInterval;
      }
    }
  }

  const minimapCtx = ui.minimapCtx;

  function gatherStaticMeshes(){
    staticScratch.length = 0;
    if(Array.isArray(world.walls)){
      for(let i=0;i<world.walls.length;i++) staticScratch.push(world.walls[i]);
    }
    if(Array.isArray(world.obstacles)){
      for(let i=0;i<world.obstacles.length;i++) staticScratch.push(world.obstacles[i]);
    }
    if(world.ground) staticScratch.push(world.ground);
    if(world.floor) staticScratch.push(world.floor);
    if(Array.isArray(world.platforms)){
      for(let i=0;i<world.platforms.length;i++) staticScratch.push(world.platforms[i]);
    }
    return staticScratch;
  }

  function refreshWorldBounds(){
    worldBounds.makeEmpty();
    worldSpawnBounds.makeEmpty();
    const statics = gatherStaticMeshes();
    for(let i = 0; i < statics.length; i++){
      const mesh = statics[i];
      if(!mesh) continue;
      const bounds = getStaticBounds(mesh, true);
      if(!bounds) continue;
      if(!Number.isFinite(bounds.min.x) || !Number.isFinite(bounds.max.x) || !Number.isFinite(bounds.min.z) || !Number.isFinite(bounds.max.z)){
        continue;
      }
      worldBounds.union(bounds);
    }
    if(worldBounds.isEmpty() || !Number.isFinite(worldBounds.min.x) || !Number.isFinite(worldBounds.max.x)){
      const size = Math.max(20, world.size || 60);
      worldBounds.min.set(-size * 0.5, -10, -size * 0.5);
      worldBounds.max.set(size * 0.5, 10, size * 0.5);
    }
    worldSpawnBounds.copy(worldBounds);
    const margin = Math.max(ENEMY_RADIUS * 1.6, 0.75);
    worldSpawnBounds.min.x += margin;
    worldSpawnBounds.min.z += margin;
    worldSpawnBounds.max.x -= margin;
    worldSpawnBounds.max.z -= margin;
    if(worldSpawnBounds.min.x > worldSpawnBounds.max.x){
      const midX = (worldBounds.min.x + worldBounds.max.x) * 0.5;
      worldSpawnBounds.min.x = worldSpawnBounds.max.x = midX;
    }
    if(worldSpawnBounds.min.z > worldSpawnBounds.max.z){
      const midZ = (worldBounds.min.z + worldBounds.max.z) * 0.5;
      worldSpawnBounds.min.z = worldSpawnBounds.max.z = midZ;
    }
    worldSpawnBounds.min.y = worldBounds.min.y;
    worldSpawnBounds.max.y = worldBounds.max.y;
    const stateBounds = PATCH_STATE.worldBounds || (PATCH_STATE.worldBounds = new THREE.Box3());
    stateBounds.copy(worldBounds);
    const stateSpawnBounds = PATCH_STATE.worldSpawnBounds || (PATCH_STATE.worldSpawnBounds = new THREE.Box3());
    stateSpawnBounds.copy(worldSpawnBounds);
    return stateSpawnBounds;
  }

  function ensureSpawnBounds(){
    if(PATCH_STATE.worldSpawnBounds && !PATCH_STATE.worldSpawnBounds.isEmpty()){
      return PATCH_STATE.worldSpawnBounds;
    }
    return refreshWorldBounds();
  }

  function clampZoneToSpawnBounds(zone){
    if(!zone || !zone.center) return null;
    const bounds = ensureSpawnBounds();
    if(!bounds || bounds.isEmpty()) return zone;
    zone.center.x = THREE.MathUtils.clamp(zone.center.x, bounds.min.x, bounds.max.x);
    zone.center.z = THREE.MathUtils.clamp(zone.center.z, bounds.min.z, bounds.max.z);
    const spanX = Math.max(0, bounds.max.x - bounds.min.x);
    const spanZ = Math.max(0, bounds.max.z - bounds.min.z);
    const maxRadius = Math.max(ENEMY_RADIUS + 0.35, Math.min(spanX, spanZ) * 0.5);
    zone.radius = Math.max(ENEMY_RADIUS + 0.35, Math.min(zone.radius || maxRadius, maxRadius));
    const clampedHeight = THREE.MathUtils.clamp(zone.height ?? zone.center.y ?? 0, bounds.min.y, bounds.max.y);
    zone.height = clampedHeight;
    return zone;
  }

  function gatherEnemyMeshes(){
    enemyMeshScratch.length = 0;
    for(let i=0;i<enemies.length;i++){
      const enemy = enemies[i];
      const root = enemy?.mesh;
      if(!root) continue;
      root.traverse?.((obj) => {
        if(!obj || !obj.isMesh) return;
        enemyMeshScratch.push(obj);
        if(!obj.userData) obj.userData = {};
        if(!obj.userData.enemy) obj.userData.enemy = enemy;
      });
      if(root.isMesh && !enemyMeshScratch.includes(root)){
        enemyMeshScratch.push(root);
      }
    }
    return enemyMeshScratch;
  }

  function composeRaycastList(a, b){
    raycastScratch.length = 0;
    for(let i=0;i<a.length;i++) raycastScratch.push(a[i]);
    for(let i=0;i<b.length;i++) raycastScratch.push(b[i]);
    return raycastScratch;
  }

  function filterStatic(excludeList, exclude){
    filteredStaticScratch.length = 0;
    for(let i=0;i<excludeList.length;i++){
      if(excludeList[i] !== exclude){
        filteredStaticScratch.push(excludeList[i]);
      }
    }
    return filteredStaticScratch;
  }

  const getShooting = () => (refs.getShooting ? refs.getShooting() : ctx.shooting?.value ?? false);
  const setShooting = (v) => {
    if(refs.setShooting) refs.setShooting(v);
    else if(ctx.shooting) ctx.shooting.value = v;
  };
  const getAiming = () => (refs.getAiming ? refs.getAiming() : ctx.aiming?.value ?? false);
  const setAiming = (v) => {
    if(refs.setAiming) refs.setAiming(v);
    else if(ctx.aiming) ctx.aiming.value = v;
  };
  const getADS = () => (refs.getADS ? refs.getADS() : ctx.isADS?.value ?? false);
  const setADSFlag = (v) => {
    if(refs.setADS) refs.setADS(v);
    else if(ctx.isADS) ctx.isADS.value = v;
  };
  const getADSTransition = () => (refs.getAdsT ? refs.getAdsT() : ctx.adsT?.value ?? 0);
  const setADSTransition = (v) => {
    if(refs.setAdsT) refs.setAdsT(v);
    else if(ctx.adsT) ctx.adsT.value = v;
  };

  // ---------------------------------------------------------------------------
  // PLAYER STATE
  // ---------------------------------------------------------------------------
  const playerState = {
    crouched: false,
    heightRatio: 1,
    stamina: CONFIG.STAMINA.max,
    staminaDelay: 0,
    staminaCombatDelay: 0,
    staminaVisible: CONFIG.STORE.showStaminaHud,
    semiAuto: false,
    semiAutoReady: true,
    lastShotTime: -Infinity,
    lastKillTime: -Infinity,
    headshotStreak: 0,
    armorCharges: 0,
    mods: { recoil: false, reload: false },
    buyPhase: false,
    storeOpen: false,
    suppressedHits: 0,
    jumpHeld: false,
    storePausedLoop: false,
    manualPause: false,
    fireTempo: CONFIG.WEAPONS.fireRate,
  };
  player.credits = player.credits || 0;

  const weaponState = {
    baseHip: CONFIG.WEAPONS.spreadHip,
    baseAds: CONFIG.WEAPONS.spreadADS,
    spreadMaxHip: CONFIG.WEAPONS.spreadHipMax,
    spreadMaxAds: CONFIG.WEAPONS.spreadADSMax,
    spreadCurrent: CONFIG.WEAPONS.spreadHip,
    recoveryHip: CONFIG.WEAPONS.spreadRecovery,
    recoveryAds: CONFIG.WEAPONS.spreadRecoveryADS,
  };

  recalcPlayerTuning();

  const fireState = {
    nextFireTime: 0,
  };

  const coverPoints = [];
  const losCache = new Map();
  const losCacheScratch = [];
  const LOS_CACHE_MAX_ENTRIES = 256;
  const LOS_CACHE_MAX_AGE = 240;
  const LOS_CACHE_PRUNE_INTERVAL = 120;
  let lastLosPrune = 0;

  function pruneLosCache(now){
    if(!losCache.size) return;
    const needsAggressivePrune = losCache.size > LOS_CACHE_MAX_ENTRIES;
    if(!needsAggressivePrune && now - lastLosPrune < LOS_CACHE_PRUNE_INTERVAL){
      return;
    }
    lastLosPrune = now;
    const cutoff = now - LOS_CACHE_MAX_AGE;
    for(const [key, entry] of losCache){
      if(!entry || entry.time < cutoff){
        losCache.delete(key);
      }
    }
    if(losCache.size <= LOS_CACHE_MAX_ENTRIES){
      return;
    }
    losCacheScratch.length = 0;
    for(const [key, entry] of losCache){
      losCacheScratch.push([key, entry?.time ?? 0]);
    }
    losCacheScratch.sort((a, b) => a[1] - b[1]);
    const excess = Math.max(0, losCache.size - LOS_CACHE_MAX_ENTRIES);
    for(let i = 0; i < excess && i < losCacheScratch.length; i++){
      losCache.delete(losCacheScratch[i][0]);
    }
    losCacheScratch.length = 0;
  }

  // ---------------------------------------------------------------------------
  // ORIG REFS
  // ---------------------------------------------------------------------------
  const originalUpdatePlayer = functions.updatePlayer;
  const originalHitscanShoot = functions.hitscanShoot;
  const originalEnemyHitscanShoot = functions.enemyHitscanShoot;
  const originalSpawnEnemy = functions.spawnEnemy;
  const originalUpdateEnemies = functions.updateEnemies;
  const originalMoveTowards = functions.moveTowards;
  const originalUpdateMinimap = functions.updateMinimap;
  const originalStartNextRound = functions.startNextRound;
  const originalRemoveEnemy = functions.removeEnemy;
  const originalDamagePlayer = functions.damagePlayer;
  const originalShowRoundBanner = functions.showRoundBanner;
  const originalAnimate = functions.animate;

  // ---------------------------------------------------------------------------
  // PLAYER
  // ---------------------------------------------------------------------------
  function patchedUpdatePlayer(delta){
    if(!controls.isLocked || game.state === 'over'){
      return;
    }

    if(ctx.muzzleWorldPosition?.isVector3){
      getMuzzleWorldPosition(ctx.muzzleWorldPosition);
    }

    const previousPosition = borrowVec3();
    previousPosition.copy(controls.getObject().position);

    try {
      const sprintHeld = (keyState['ShiftLeft'] || keyState['ShiftRight']) && !playerState.storeOpen;
      const moving = (keyState['KeyW']||keyState['KeyA']||keyState['KeyS']||keyState['KeyD']);
      const baseHeight = player.height || CONFIG.PLAYER.baseHeight;
      const crouchSpeedFactor = playerState.crouched ? CONFIG.PLAYER.crouchSpeedMultiplier : 1;

      const targetRatio = playerState.crouched ? CONFIG.PLAYER.crouchRatio : 1;
      playerState.heightRatio = THREE.MathUtils.clamp(
        damp(playerState.heightRatio, targetRatio, 18, delta),
        CONFIG.PLAYER.crouchRatio,
        1
      );
      const currentHeight = baseHeight * playerState.heightRatio;

      const staminaMax = CONFIG.STAMINA.max;
      playerState.staminaDelay = Math.max(0, playerState.staminaDelay - delta);
      playerState.staminaCombatDelay = Math.max(0, playerState.staminaCombatDelay - delta);

      let sprinting = sprintHeld && moving && playerState.stamina > CONFIG.STAMINA.minSprint && !playerState.crouched;

      if(sprinting){
        playerState.stamina = Math.max(0, playerState.stamina - CONFIG.STAMINA.sprintDrain * delta);
        playerState.staminaDelay = CONFIG.STAMINA.regenDelay;
        if(playerState.stamina <= 0){
          sprinting = false;
        }
      } else if(playerState.staminaDelay <= 0 && playerState.staminaCombatDelay <= 0){
        playerState.stamina = Math.min(staminaMax, playerState.stamina + CONFIG.STAMINA.regenRate * delta);
      }
      updateStaminaIcon();

      if(!player.velocity || typeof player.velocity.y !== 'number'){
        player.velocity = new THREE.Vector3(0, 0, 0);
      }
      if(typeof player.gravity !== 'number' || !isFinite(player.gravity)){
        player.gravity = 9.81;
      }

      const jumpPressed = keyState['Space'] && !playerState.storeOpen;
      if(jumpPressed && !playerState.jumpHeld){
        if(playerState.crouched){
          if(canStandFullHeight()){ playerState.crouched = false; }
        }
        if(player.onGround){
          const jumpStrength = player.jumpStrength || player.jumpPower || 6.5;
          player.velocity.y = jumpStrength;
          player.onGround = false;
          playerState.staminaDelay = Math.max(playerState.staminaDelay, 0.2);
        }
      }
      playerState.jumpHeld = jumpPressed;

      const effectiveADS = getAiming() && !sprinting && player.alive !== false && !player.isReloading && !playerState.storeOpen;
      setADSFlag(effectiveADS);

      const adsTarget = effectiveADS ? 1 : 0;
      const adsSpeed = playerState.crouched ? CONFIG.PLAYER.crouchAdsAcceleration : CONFIG.STANCE.adsSpeed;
      const newAds = damp(getADSTransition(), adsTarget, adsSpeed, delta);
      setADSTransition(newAds);

      const targetFov = sprinting ? CONFIG.STANCE.sprintFov : THREE.MathUtils.lerp(CONFIG.STANCE.baseFov, CONFIG.STANCE.adsFov, newAds);
      const crouchFov = playerState.crouched ? Math.min(targetFov, CONFIG.STANCE.crouchFov) : targetFov;
      camera.fov = damp(camera.fov, crouchFov, CONFIG.STANCE.sprintCamDamp, delta);
      camera.updateProjectionMatrix();

      const baseHip = getSpreadBase(false);
      const baseAds = getSpreadBase(true);
      const spreadBase = effectiveADS ? baseAds : baseHip;
      const spreadMax = effectiveADS ? weaponState.spreadMaxAds : weaponState.spreadMaxHip;
      weaponState.spreadCurrent = THREE.MathUtils.clamp(weaponState.spreadCurrent, spreadBase, spreadMax);

      const moveSpeed = (player.walkSpeed || movementConfig.playerWalk || 7.5) * crouchSpeedFactor * (sprinting ? (player.sprintMultiplier || 1.5) : 1);
      let forward = 0; let strafe = 0;
      if(keyState['KeyW']) forward += 1;
      if(keyState['KeyS']) forward -= 1;
      if(keyState['KeyD']) strafe += 1;
      if(keyState['KeyA']) strafe -= 1;

      tempVecA.set(strafe, 0, -forward).normalize();
      if(tempVecA.lengthSq() > 0){
        tempVecA.applyQuaternion(controls.getObject().quaternion);
        tempVecA.multiplyScalar(moveSpeed * delta);
        controls.getObject().position.add(tempVecA);
      }

      player.velocity.y -= player.gravity * delta;
      controls.getObject().position.y += player.velocity.y * delta;
      if(controls.getObject().position.y < currentHeight){
        controls.getObject().position.y = currentHeight;
        player.velocity.y = 0;
        player.onGround = true;
      } else if(player.velocity.y < -0.01){
        player.onGround = false;
      }

      if(playerCollider){
        const colliderSize = tempVecD.set(1, currentHeight, 1);
        playerCollider.setFromCenterAndSize(controls.getObject().position, colliderSize);
        const statics = gatherStaticMeshes();
        for(let i = 0; i < statics.length; i++){
          const mesh = statics[i];
          if(!mesh) continue;
          tempBox.setFromObject(mesh);
          if(playerCollider.intersectsBox(tempBox)){
            controls.getObject().position.copy(previousPosition);
            controls.getObject().position.y = Math.max(previousPosition.y, currentHeight);
            if(previousPosition.y <= currentHeight + 0.001){
              player.velocity.y = 0;
              player.onGround = true;
            } else {
              player.velocity.y = Math.min(0, player.velocity.y);
            }
            break;
          }
        }
      }

      if(player.isReloading){
        player.reloadTimer -= delta;
        if(player.reloadTimer <= 0){
          const need = player.maxAmmo - player.ammo;
          const toLoad = Math.min(need, player.reserve);
          player.ammo += toLoad;
          player.reserve -= toLoad;
          updateAmmoDisplay();
          player.isReloading = false;
        }
      }

      const recoverRate = effectiveADS ? weaponState.recoveryAds : weaponState.recoveryHip;
      weaponState.spreadCurrent = Math.max(spreadBase, weaponState.spreadCurrent - recoverRate * delta);

      if(functions.updateWeaponPose) functions.updateWeaponPose(delta);
      if(functions.updateRegen) functions.updateRegen(delta);
    } finally {
      releaseVec3(previousPosition);
    }
  }

  function getSpreadBase(ads){
    const staminaRatio = CONFIG.STAMINA?.max ? THREE.MathUtils.clamp(playerState.stamina / CONFIG.STAMINA.max, 0, 1) : 1;
    const staminaScale = THREE.MathUtils.lerp(CONFIG.WEAPONS.staminaSpreadPenalty, CONFIG.WEAPONS.staminaSpreadBonus, staminaRatio);
    if(ads){
      const base = weaponState.baseAds;
      const crouchScale = playerState.crouched ? CONFIG.PLAYER.crouchSpreadMultiplier * 0.8 : 1;
      return base * staminaScale * crouchScale;
    }
    const base = weaponState.baseHip;
    const crouchScale = playerState.crouched ? CONFIG.PLAYER.crouchSpreadMultiplier : 1;
    return base * staminaScale * crouchScale;
  }

  function toggleCrouch(force){
    if(force === false){
      if(!playerState.crouched) return;
      if(!canStandFullHeight()) return;
      playerState.crouched = false;
      return;
    }
    if(force === true){
      playerState.crouched = true;
      return;
    }
    if(playerState.crouched){
      if(canStandFullHeight()){
        playerState.crouched = false;
      }
      return;
    }
    if(!player.onGround) return;
    playerState.crouched = true;
  }

  function canStandFullHeight(){
    if(!playerCollider) return true;
    const baseHeight = player.height || CONFIG.PLAYER.baseHeight;
    const center = tempVecF.copy(controls.getObject().position);
    center.y = Math.max(center.y, baseHeight);
    const size = tempVecG.set(1, baseHeight, 1);
    crouchTestBox.setFromCenterAndSize(center, size);
    const statics = gatherStaticMeshes();
    for(let i = 0; i < statics.length; i++){
      const mesh = statics[i];
      if(!mesh) continue;
      tempBox.setFromObject(mesh);
      if(crouchTestBox.intersectsBox(tempBox)){
        return false;
      }
    }
    return true;
  }

  function damp(current, target, lambda, delta){
    return THREE.MathUtils.damp(current, target, lambda, delta);
  }

  function getCameraForward(out){
    return out.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  }

  function getCameraRight(out){
    return out.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  }

  function getCameraUp(out){
    return out.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  }

  function getMuzzleWorldPosition(out){
    const anchor = ctx.muzzleAnchor || PATCH_STATE.muzzleAnchor;
    if(anchor?.getWorldPosition){
      anchor.updateMatrixWorld?.(true);
      return anchor.getWorldPosition(out);
    }
    if(ctx.muzzleFlash?.getWorldPosition){
      return ctx.muzzleFlash.getWorldPosition(out);
    }
    const weaponGroup = ctx.muzzleFlash?.parent?.parent || ctx.muzzleFlash?.parent;
    if(weaponGroup?.localToWorld){
      tempVecG.set(0.18, -0.08, -0.92);
      return weaponGroup.localToWorld(out.copy(tempVecG));
    }
    const forward = getCameraForward(tempVecF);
    const right = getCameraRight(tempVecD);
    const up = getCameraUp(tempVecE);
    out.copy(camera.position);
    out.addScaledVector(forward, 0.9);
    out.addScaledVector(right, 0.18);
    out.addScaledVector(up, -0.08);
    return out;
  }

  // ---------------------------------------------------------------------------
  // WEAPONS
  // ---------------------------------------------------------------------------
  function getReloadDuration(){
    const base = player.reloadTime || player.reloadDuration || CONFIG.WEAPONS.reloadTime || 1.6;
    const reloadMod = player.mods?.reload ? 0.85 : 1;
    return Math.max(0.25, base * reloadMod);
  }

  function canBeginReload(){
    if(!player || player.alive === false) return false;
    if(playerState.storeOpen) return false;
    if(player.isReloading) return false;
    const clipSize = Number.isFinite(player.maxAmmo) ? player.maxAmmo : CONFIG.WEAPONS.magazineSize;
    if((player.ammo ?? 0) >= clipSize) return false;
    if((player.reserve ?? 0) <= 0) return false;
    return true;
  }

  function beginReload(reason = 'manual'){
    if(!canBeginReload()) return false;
    const duration = getReloadDuration();
    player.isReloading = true;
    player.reloadTimer = duration;
    player.reloadReason = reason;
    if(typeof player.onReloadStart === 'function'){
      try{ player.onReloadStart(duration, reason); }catch(err){ console.warn('[patch-001] player.onReloadStart failed', err); }
    }
    if(typeof functions.onReloadStart === 'function'){
      try{ functions.onReloadStart(duration, reason); }catch(err){ console.warn('[patch-001] functions.onReloadStart failed', err); }
    }
    return true;
  }

  function autoReloadIfEmpty(reason = 'empty-mag'){
    if((player.ammo ?? 0) > 0) return false;
    return beginReload(reason);
  }

  function attemptFire(now){
    if(!player.alive || playerState.storeOpen) return false;
    if(player.isReloading){
      return false;
    }
    if(player.ammo <= 0){
      autoReloadIfEmpty('empty-trigger');
      return false;
    }
    if(playerState.semiAuto && !playerState.semiAutoReady) return false;
    if(now < fireState.nextFireTime) return false;

    performShot(now);

    const baseFire = playerState.fireTempo ?? CONFIG.WEAPONS.fireRate;
    const delaySec = playerState.semiAuto ? CONFIG.WEAPONS.semiAutoDelay : baseFire;
    fireState.nextFireTime = now + delaySec * 1000;
    player.fireCooldown = delaySec;
    playerState.lastShotTime = now;
    if(playerState.semiAuto){
      playerState.semiAutoReady = false;
    }
    autoReloadIfEmpty('empty-mag');
    return true;
  }

  function performShot(now){
    const ads = getADS();
    const stanceSpread = getSpreadBase(ads);
    const stanceMax = ads ? weaponState.spreadMaxAds : weaponState.spreadMaxHip;
    const stanceSpreadCur = weaponState.spreadCurrent;

    const spreadScalar = THREE.MathUtils.clamp(stanceSpreadCur, stanceSpread, stanceMax);
    camera.getWorldDirection(tempVecA).normalize();
    const yawOff = (Math.random() * 2 - 1) * spreadScalar;
    const pitchOff = (Math.random() * 2 - 1) * spreadScalar * 0.7;
    tempEuler.set(pitchOff, yawOff, 0);
    tempQuat.setFromEuler(tempEuler);
    tempVecA.applyQuaternion(tempQuat).normalize();

    const muzzlePos = borrowVec3();
    getMuzzleWorldPosition(muzzlePos);
    if(ctx.muzzleWorldPosition?.isVector3){
      ctx.muzzleWorldPosition.copy(muzzlePos);
    }
    const flash = ctx.muzzleFlash;
    if(flash){
      flash.visible = true;
      setTimeout(()=>{ if(ctx.muzzleFlash) ctx.muzzleFlash.visible = false; }, 45);
    }
    const tracerEnd = borrowVec3().copy(muzzlePos).addScaledVector(tempVecA, CONFIG.WEAPONS.tracerSegment);
    spawnTracer(muzzlePos, tracerEnd, { color: 0xfff3a0, life: CONFIG.PERF.tracerLifetime * 1.3 });

    const direction = borrowVec3().copy(tempVecA);
    spawnProjectile({
      origin: muzzlePos,
      direction,
      speed: CONFIG.WEAPONS.muzzleVelocity * (ROUND_DIRECTIVES.velocityScale || 1),
      gravity: CONFIG.WEAPONS.projectileGravity,
      drag: CONFIG.WEAPONS.projectileDrag,
      owner: 'player',
      maxLife: CONFIG.WEAPONS.projectileLife,
      tracerColor: 0xfff3a0,
      tracerOpacity: 0.92,
      onEnemyHit: handlePlayerProjectileEnemyHit,
      onWorldHit: handlePlayerProjectileWorldHit,
    });

    if(functions.crosshairBloom) functions.crosshairBloom();

    player.ammo = Math.max(0, (player.ammo || 0) - 1);
    updateAmmoDisplay();

    weaponState.spreadCurrent = Math.min(stanceMax, weaponState.spreadCurrent + (ads ? 0.08 : 0.18) * (playerState.semiAuto ? CONFIG.WEAPONS.semiAutoSpreadFactor : 1));

    if(functions.noteGunshotNoise) functions.noteGunshotNoise();
    broadcastGunshot(muzzlePos, 1);

    releaseVec3(muzzlePos);
    releaseVec3(tracerEnd);
    releaseVec3(direction);
  }

  function handlePlayerProjectileEnemyHit(projectile, enemy, hit){
    if(!enemy || !enemy.mesh) return true;
    const point = hit.point || enemy.mesh.position;
    const localY = point.y - enemy.mesh.position.y;
    let damage = computeBaseDamage(localY);
    const distance = projectile.origin.distanceTo(point);
    damage *= applyDamageFalloff(distance);
    damage *= enemy.damageScalar || 1;
    enemy.health -= damage;
    const now = performance.now();
    enemy.brain = enemy.brain || createEnemyBrain(enemy.spawnZone, enemy.profile || DEFAULT_ENEMY_PROFILE);
    enemy.brain.lastHitAt = now;
    enemy.brain.alertUntil = Math.max(enemy.brain.alertUntil, now + 900);
    enemy.brain.awareness = Math.min(1, enemy.brain.awareness + 0.35);
    enemy.brain.reactionTimer = Math.min(enemy.brain.reactionTimer, enemy.brain.reactionDelay * 0.45);
    const suppressionScalar = enemy.profile?.suppressionResist || 1;
    enemy.suppressedUntil = now + CONFIG.AI.suppressedTime * 1000 * suppressionScalar;
    const headshot = localY >= 1.0;
    if(functions.showHitmarker) functions.showHitmarker();
    if(functions.screenShake) functions.screenShake(headshot ? 0.02 : 0.012, 0.06);
    if(enemy.health <= 0){
      removeEnemyLocal(enemy);
    } else {
      const flickerMaterial = getEnemyPrimaryMaterial(enemy);
      if(flickerMaterial?.emissive?.setHex){
        const original = flickerMaterial.emissive.getHex();
        flickerMaterial.emissive.setHex(0xff3333);
        flickerMaterial.emissiveIntensity = Math.max(flickerMaterial.emissiveIntensity ?? 0.4, 0.65);
        setTimeout(()=>{
          if(enemy.mesh && flickerMaterial?.emissive?.setHex){
            flickerMaterial.emissive.setHex(original);
            flickerMaterial.emissiveIntensity = THREE.MathUtils.clamp(0.35 + (enemy.profile?.accuracy || 0) * 0.4, 0.35, 0.85);
          }
        }, 120);
      }
    }
    broadcastGunshot(point, 0.85);
    return true;
  }

  function handlePlayerProjectileWorldHit(projectile, hit, dir, enemyMeshes, statics){
    const impactPoint = hit.point;
    const normal = hit.face
      ? borrowVec3().copy(hit.face.normal).applyMatrix3(tempMat3.getNormalMatrix(hit.object.matrixWorld)).normalize()
      : borrowVec3().copy(dir).multiplyScalar(-1);
    spawnImpact(impactPoint, normal);
    handleRicochetOrPenetration(hit, projectile.prevPosition, dir, enemyMeshes, statics, 0);
    releaseVec3(normal);
    return true;
  }

  function patchedHitscanShoot(){
    return attemptFire(performance.now());
  }

  function computeBaseDamage(localY){
    if(localY >= 1.0){
      playerState.headshotStreak += 1;
      playerState.lastKillTime = performance.now();
      return 110;
    }
    playerState.headshotStreak = 0;
    if(localY >= 0.3) return 35;
    return 22;
  }

  function applyDamageFalloff(distance){
    if(distance <= CONFIG.WEAPONS.falloffStart) return 1;
    if(distance >= CONFIG.WEAPONS.falloffEnd) return CONFIG.WEAPONS.falloffMin;
    const t = (distance - CONFIG.WEAPONS.falloffStart) / (CONFIG.WEAPONS.falloffEnd - CONFIG.WEAPONS.falloffStart);
    return THREE.MathUtils.lerp(1, CONFIG.WEAPONS.falloffMin, t);
  }

  function handleRicochetOrPenetration(first, origin, dir, enemyMeshes, staticObjs, carriedDamage){
    const mesh = first.object;
    const bbox = tempBox2.setFromObject(mesh);
    const size = bbox.getSize(tempVecC);
    const approxThickness = Math.abs(dir.x)*size.x + Math.abs(dir.y)*size.y + Math.abs(dir.z)*size.z;

    const normal = first.face
      ? borrowVec3().copy(first.face.normal).applyMatrix3(tempMat3.getNormalMatrix(mesh.matrixWorld)).normalize()
      : tempVecD.subVectors(first.point, mesh.getWorldPosition(tempVecE)).normalize();
    const incidence = Math.abs(dir.dot(normal));

    let ricochet = false;
    if(mesh.userData.ricochet && incidence < Math.cos(CONFIG.WEAPONS.ricochetAngle)){
      if(Math.random() < CONFIG.WEAPONS.ricochetChance){
        ricochet = true;
      }
    }

    if(ricochet){
      const reflected = borrowVec3().copy(dir).reflect(normal).normalize();
      const newOrigin = borrowVec3().copy(first.point).addScaledVector(reflected, 0.02);
      helperRay.set(newOrigin, reflected);
      const combined = helperRay.intersectObjects(composeRaycastList(enemyMeshes, staticObjs), false);
      const maxDistance = CONFIG.WEAPONS.ricochetRange;
      const endPoint = borrowVec3().copy(newOrigin).addScaledVector(reflected, maxDistance);
      if(combined.length){
        for(const hit of combined){
          const distance = hit.distance;
          if(distance <= maxDistance){
            endPoint.copy(hit.point);
            if(enemyMeshes.includes(hit.object)){
              const enemy = hit.object?.userData?.enemy || enemies.find(en => en.mesh === hit.object);
              if(enemy){
                const localY = hit.point.y - enemy.mesh.position.y;
                let dmg = computeBaseDamage(localY) * CONFIG.WEAPONS.ricochetDamageScale;
                enemy.health -= dmg;
                if(enemy.health <= 0) removeEnemyLocal(enemy);
              }
            }
            break;
          }
        }
      }
      spawnTracer(first.point, endPoint);
      spawnImpact(first.point, normal);
      if(first.face){ releaseVec3(normal); }
      releaseVec3(reflected);
      releaseVec3(newOrigin);
      releaseVec3(endPoint);
      return;
    }

    if(approxThickness <= CONFIG.WEAPONS.penetrationThickness){
      const newOrigin = borrowVec3().copy(first.point).addScaledVector(dir, 0.05);
      helperRay.set(newOrigin, dir);
      const nextHits = helperRay.intersectObjects(composeRaycastList(enemyMeshes, filterStatic(staticObjs, mesh)), false);
      const endPoint = borrowVec3().copy(newOrigin).addScaledVector(dir, 40);
      if(nextHits.length){
        const nh = nextHits[0];
        endPoint.copy(nh.point);
        if(enemyMeshes.includes(nh.object)){
          const enemy = nh.object?.userData?.enemy || enemies.find(en => en.mesh === nh.object);
          if(enemy){
            const localY = nh.point.y - enemy.mesh.position.y;
            let dmg = computeBaseDamage(localY) * CONFIG.WEAPONS.penetrationDamageScale;
            dmg *= applyDamageFalloff(origin.distanceTo(endPoint));
            enemy.health -= dmg;
            if(enemy.health <= 0) removeEnemyLocal(enemy);
          }
        }
      }
      spawnTracer(first.point, endPoint);
      if(first.face){ releaseVec3(normal); }
      releaseVec3(newOrigin);
      releaseVec3(endPoint);
    } else {
      spawnImpact(first.point, normal);
      if(first.face){ releaseVec3(normal); }
    }
  }

  function broadcastGunshot(source, severity = 1){
    if(!source) return;
    const now = performance.now();
    const baseRadius = CONFIG.AI.gunshotAlertRadius || 36;
    const maxRadius = baseRadius * THREE.MathUtils.lerp(1.1, 1.6, THREE.MathUtils.clamp(severity, 0, 2));
    for(let i = 0; i < enemies.length; i++){
      const enemy = enemies[i];
      const mesh = enemy?.mesh;
      if(!mesh) continue;
      const distance = mesh.position.distanceTo(source);
      if(!Number.isFinite(distance) || distance > maxRadius) continue;
      const brain = enemy.brain || (enemy.brain = createEnemyBrain(enemy.spawnZone, enemy.profile || DEFAULT_ENEMY_PROFILE));
      const proximity = THREE.MathUtils.clamp(1 - distance / maxRadius, 0, 1);
      const boost = THREE.MathUtils.lerp(0.28, CONFIG.AI.gunshotMaxBoost ?? 0.8, proximity) * severity;
      brain.awareness = Math.min(1, Math.max(brain.awareness, boost));
      brain.alertUntil = Math.max(brain.alertUntil || 0, now + 500 + proximity * 900);
      brain.lastKnownPlayerPos.copy(source);
      brain.lastKnownPlayerPos.y = desiredEnemyCenterY(enemy);
      brain.searchUntil = Math.max(brain.searchUntil || 0, now + 750 + proximity * 650);
      brain.hasCoverTarget = false;
      const reactionClamp = Math.max(0.02, brain.reactionDelay * THREE.MathUtils.lerp(0.35, 0.6, proximity));
      brain.reactionTimer = Math.min(brain.reactionTimer, reactionClamp);
      const cooldownClamp = Math.max(0.01, (CONFIG.AI.reengageDelay || 0.18) * THREE.MathUtils.lerp(0.45, 0.8, proximity));
      enemy.fireCooldown = Math.min(enemy.fireCooldown ?? cooldownClamp, cooldownClamp);
      enemy.burstShotsLeft = Math.max(enemy.burstShotsLeft || 0, 1);
      if(brain.state === 'patrol'){
        brain.state = 'flank';
        brain.repositionUntil = Math.max(brain.repositionUntil || 0, now + 400 + proximity * 700);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------
  function resolveSpawnHeight(point, zone, statics){
    const baseHeight = zone?.height ?? point.y ?? 0;
    const startY = baseHeight + ENEMY_HEIGHT * 2;
    tempVecI.set(point.x, startY, point.z);
    helperRay.set(tempVecI, downVector);
    helperRay.far = startY + ENEMY_HEIGHT * 2;
    const hits = helperRay.intersectObjects(statics, false);
    helperRay.far = Infinity;
    for(let i=0;i<hits.length;i++){
      const hit = hits[i];
      if(!hit) continue;
      if(hit.face){
        tempMat3.getNormalMatrix(hit.object.matrixWorld);
        tempVecI.copy(hit.face.normal).applyMatrix3(tempMat3).normalize();
        if(tempVecI.y < 0.35) continue;
      }
      return hit.point.y;
    }
    if(typeof world.groundHeight === 'number' && isFinite(world.groundHeight)){
      return world.groundHeight;
    }
    return baseHeight;
  }

  function capsuleOverlapsStatics(center, radius, height, statics){
    const half = height * 0.5;
    for(let i=0;i<statics.length;i++){
      const mesh = statics[i];
      if(!mesh) continue;
      const bounds = getStaticBounds(mesh);
      if(!bounds) continue;
      if(center.y + half <= bounds.min.y - 0.05) continue;
      if(center.y - half >= bounds.max.y + 0.05) continue;
      if(center.x + radius <= bounds.min.x - 0.05) continue;
      if(center.x - radius >= bounds.max.x + 0.05) continue;
      if(center.z + radius <= bounds.min.z - 0.05) continue;
      if(center.z - radius >= bounds.max.z + 0.05) continue;
      return true;
    }
    return false;
  }

  function ensureSpawnClearance(point, zone, statics){
    const height = resolveSpawnHeight(point, zone, statics);
    if(!Number.isFinite(height)) return null;
    const spawnBounds = ensureSpawnBounds();
    if(spawnBounds && !spawnBounds.isEmpty()){
      if(height < spawnBounds.min.y - 0.05 || height > spawnBounds.max.y + 0.05){
        return null;
      }
    }
    const centerY = height + ENEMY_HALF_HEIGHT;
    tempVecH.set(point.x, centerY, point.z);
    if(capsuleOverlapsStatics(tempVecH, ENEMY_RADIUS, ENEMY_HEIGHT, statics)){
      return null;
    }
    point.y = height;
    return height;
  }

  function desiredEnemyCenterY(enemy){
    if(!enemy || !enemy.mesh) return 0;
    const zoneHeight = enemy.spawnZone?.height;
    const base = isFinite(enemy.groundHeight) ? enemy.groundHeight : (isFinite(zoneHeight) ? zoneHeight : (enemy.mesh.position.y - ENEMY_HALF_HEIGHT));
    return base + ENEMY_HALF_HEIGHT;
  }

  function zoneOccupancyInfo(zone){
    zoneOccupancyScratch.count = 0;
    zoneOccupancyScratch.closestSq = Infinity;
    if(!zone || !zone.center) return zoneOccupancyScratch;
    const radius = Math.max(ENEMY_RADIUS * 2.6, zone.radius || 0);
    const radiusSq = radius * radius;
    for(let i=0;i<enemies.length;i++){
      const mesh = enemies[i]?.mesh;
      if(!mesh) continue;
      const dx = mesh.position.x - zone.center.x;
      const dz = mesh.position.z - zone.center.z;
      const distSq = dx*dx + dz*dz;
      if(distSq <= radiusSq){
        zoneOccupancyScratch.count += 1;
        if(distSq < zoneOccupancyScratch.closestSq){
          zoneOccupancyScratch.closestSq = distSq;
        }
      }
    }
    return zoneOccupancyScratch;
  }

  function zoneHasDirectLine(zonePoint, statics, playerPos){
    tempVecC.copy(zonePoint);
    tempVecC.y += 0.5;
    tempVecD.subVectors(playerPos, tempVecC);
    const distance = tempVecD.length();
    if(distance < 1e-4){
      helperRay.far = Infinity;
      return true;
    }
    tempVecD.multiplyScalar(1 / distance);
    helperRay.set(tempVecC, tempVecD);
    helperRay.far = distance;
    let blocked = false;
    for(let i=0;i<statics.length;i++){
      const mesh = statics[i];
      if(!mesh) continue;
      const hits = helperRay.intersectObject(mesh, false);
      if(hits.length && hits[0].distance > 0.2){
        blocked = true;
        break;
      }
    }
    helperRay.far = Infinity;
    return !blocked;
  }

  function clampEnemyToZone(enemy){
    const zone = enemy?.spawnZone;
    const mesh = enemy?.mesh;
    if(!zone || !mesh) return;
    const radius = Math.max(1, zone.radius || 0) - ENEMY_RADIUS * 0.25;
    if(radius <= 0) return;
    tempVecG.copy(mesh.position).sub(zone.center).setY(0);
    const dist = tempVecG.length();
    if(dist <= radius) return;
    tempVecG.normalize().multiplyScalar(radius);
    mesh.position.x = zone.center.x + tempVecG.x;
    mesh.position.z = zone.center.z + tempVecG.z;
  }

  function applyEnemyVelocity(enemy, velocity, delta, statics){
    const mesh = enemy?.mesh;
    if(!mesh) return;
    if(velocity.lengthSq() < 1e-6) return;
    tempVecE.copy(velocity).multiplyScalar(delta);
    tempVecH.copy(mesh.position);
    tempVecI.copy(tempVecH).add(tempVecE);
    if(!capsuleOverlapsStatics(tempVecI, ENEMY_RADIUS, ENEMY_HEIGHT, statics)){
      mesh.position.copy(tempVecI);
    } else {
      let moved = false;
      if(Math.abs(tempVecE.x) > 1e-4){
        tempVecI.set(tempVecH.x + tempVecE.x, tempVecH.y, tempVecH.z);
        if(!capsuleOverlapsStatics(tempVecI, ENEMY_RADIUS, ENEMY_HEIGHT, statics)){
          mesh.position.copy(tempVecI);
          moved = true;
        }
      }
      if(!moved && Math.abs(tempVecE.z) > 1e-4){
        tempVecI.set(tempVecH.x, tempVecH.y, tempVecH.z + tempVecE.z);
        if(!capsuleOverlapsStatics(tempVecI, ENEMY_RADIUS, ENEMY_HEIGHT, statics)){
          mesh.position.copy(tempVecI);
          moved = true;
        }
      }
      if(!moved) return;
    }
    clampEnemyToZone(enemy);
    mesh.position.y = desiredEnemyCenterY(enemy);
  }

  function moveEnemyTowards(enemy, target, speed, delta, statics){
    const mesh = enemy?.mesh;
    if(!mesh) return Infinity;
    tempVecD.subVectors(target, mesh.position).setY(0);
    const distance = tempVecD.length();
    if(distance < 1e-3) return distance;
    tempVecD.normalize().multiplyScalar(speed);
    applyEnemyVelocity(enemy, tempVecD, delta, statics);
    return distance;
  }

  function computeAnchorCandidate(enemy, playerPos, statics, preferredSide){
    const mesh = enemy?.mesh;
    if(!mesh){
      return tempVecH.copy(playerPos).setY(desiredEnemyCenterY(enemy));
    }
    tempVecD.copy(mesh.position).sub(playerPos).setY(0);
    let distance = tempVecD.length();
    if(distance < 1e-3){
      tempVecD.set(0, 0, 1);
      distance = 1;
    } else {
      tempVecD.multiplyScalar(1 / distance);
    }
    const preferredRange = THREE.MathUtils.clamp(enemy?.preferredRange || CONFIG.STIM.focusRadius || 10, 6, 32);
    const anchorRange = THREE.MathUtils.lerp(preferredRange * 0.85, preferredRange * 1.15, Math.random());
    tempVecE.copy(playerPos).addScaledVector(tempVecD, anchorRange);
    tempVecF.set(-tempVecD.z, 0, tempVecD.x);
    if(tempVecF.lengthSq() > 1e-6){
      const side = preferredSide || 1;
      const lateral = THREE.MathUtils.lerp(1.1, 3.2, enemy?.profile?.aggression || 0.5);
      tempVecF.normalize().multiplyScalar(lateral * side);
      tempVecE.add(tempVecF);
    }
    const zone = enemy?.spawnZone || null;
    const resolvedHeight = resolveSpawnHeight(tempVecE, zone, statics);
    tempVecE.y = Number.isFinite(resolvedHeight) ? resolvedHeight + ENEMY_HALF_HEIGHT : desiredEnemyCenterY(enemy);
    if(zone){
      tempVecG.copy(tempVecE).sub(zone.center).setY(0);
      const radius = Math.max(1, zone.radius || 0) - ENEMY_RADIUS * 0.5;
      const dist = tempVecG.length();
      if(dist > radius){
        tempVecG.normalize().multiplyScalar(Math.max(0, radius));
        tempVecE.x = zone.center.x + tempVecG.x;
        tempVecE.z = zone.center.z + tempVecG.z;
      }
    }
    if(capsuleOverlapsStatics(tempVecE, ENEMY_RADIUS, ENEMY_HEIGHT, statics)){
      tempVecE.sub(tempVecF.multiplyScalar(0.7));
      if(capsuleOverlapsStatics(tempVecE, ENEMY_RADIUS, ENEMY_HEIGHT, statics)){
        tempVecE.copy(mesh.position);
      }
    }
    return tempVecE;
  }

  function ensureAttackAnchor(enemy, playerPos, hasLine, now, statics){
    const brain = enemy?.brain;
    if(!brain || !enemy?.mesh){
      return enemy?.mesh?.position || playerPos;
    }
    if(!brain.anchorTarget){
      brain.anchorTarget = new THREE.Vector3();
    }
    const anchorRadius = brain.anchorRadius || (brain.anchorRadius = THREE.MathUtils.lerp(0.9, 1.5, enemy.profile?.accuracy || 0.5));
    const needsRefresh =
      !brain.anchorValid ||
      !Number.isFinite(brain.anchorTarget.x) ||
      brain.anchorUntil <= now ||
      brain.anchorTarget.distanceToSquared(enemy.mesh.position) > Math.pow(Math.max(anchorRadius * 6, 6), 2) ||
      (!hasLine && now - (brain.lastSeenAt || 0) > 420);
    if(needsRefresh){
      const side = brain.anchorSide || (Math.random() < 0.5 ? -1 : 1);
      const candidate = computeAnchorCandidate(enemy, playerPos, statics, side);
      brain.anchorTarget.copy(candidate);
      brain.anchorValid = true;
      brain.anchorUntil = now + THREE.MathUtils.randFloat(900, 1650);
      brain.anchorSide = side;
      brain.microStrafeCooldown = now + THREE.MathUtils.randFloat(480, 880);
    }
    return brain.anchorTarget;
  }

  function scheduleEnemyReload(enemy, now, options = {}){
    if(!enemy || enemy.isReloading) return false;
    const profile = enemy.profile || DEFAULT_ENEMY_PROFILE;
    const base = options.tactical
      ? enemy.tacticalReloadDuration || profile.tacticalReloadTime || Math.max(0.6, profile.reloadTime * 0.72)
      : enemy.reloadDuration || profile.reloadTime || 1.9;
    const variance = enemy.reloadVariance ?? profile.reloadVariance ?? 0.14;
    const multiplier = THREE.MathUtils.lerp(1 - variance, 1 + variance, Math.random());
    const reloadTime = Math.max(0.55, base * multiplier);
    enemy.isReloading = true;
    enemy.reloadTimer = reloadTime;
    enemy.fireCooldown = Math.max(enemy.fireCooldown, reloadTime);
    enemy.burstShotsLeft = 0;
    enemy.lastReloadAt = now;
    const brain = enemy.brain;
    if(brain){
      brain.reactionTimer = Math.max(brain.reactionTimer, Math.min(brain.reactionDelay, reloadTime * 0.5));
      brain.anchorUntil = Math.max(brain.anchorUntil, now + reloadTime * 650);
      brain.microStrafeUntil = Math.min(brain.microStrafeUntil || now, now + 120);
    }
    return reloadTime;
  }

  function completeEnemyReload(enemy, restCadence, brain, now){
    if(!enemy) return;
    enemy.isReloading = false;
    enemy.reloadTimer = 0;
    enemy.ammo = enemy.magazineSize;
    enemy.burstShotsLeft = 0;
    const restDelay = Array.isArray(restCadence) && restCadence.length >= 2
      ? THREE.MathUtils.randFloat(restCadence[0], restCadence[1])
      : 0.18;
    enemy.fireCooldown = Math.max(enemy.fireCooldown, restDelay * 0.65);
    enemy.lastReloadAt = now;
    if(brain){
      brain.reactionTimer = Math.max(brain.reactionTimer, Math.min(brain.reactionDelay, restDelay * 0.5));
      brain.anchorUntil = Math.max(brain.anchorUntil, now + 380);
    }
  }

  function pickCoverPoint(origin, toPlayerDir){
    if(!Array.isArray(coverPoints) || !coverPoints.length) return null;
    let best = null;
    let bestScore = -Infinity;
    for(let i=0;i<coverPoints.length;i++){
      const cover = coverPoints[i];
      if(!cover?.position) continue;
      tempVecD.copy(cover.position);
      const dx = tempVecD.x - origin.x;
      const dz = tempVecD.z - origin.z;
      const distSq = dx*dx + dz*dz;
      if(distSq < 6 || distSq > 400) continue;
      tempVecD.y = origin.y;
      if(hasLineOfSight(tempVecD, controls.getObject().position)) continue;
      const distance = Math.sqrt(distSq);
      const dirDot = (dx * toPlayerDir.x + dz * toPlayerDir.z) / Math.max(distance, 1e-3);
      const score = -distSq + dirDot * 6;
      if(score > bestScore){
        bestScore = score;
        best = cover.position;
      }
    }
    return best;
  }

  function patchedSpawnEnemy(){
    if(ENEMIES_DISABLED){
      purgeEnemies();
      return false;
    }
    const rigAssets = ensureEnemyRigAssets();
    if(!rigAssets){
      registerSpawnFailure();
      game.spawnDelay = Math.max(game.spawnDelay, nextSpawnDelay());
      return false;
    }

    if(enemies.length >= CONFIG.PERF.maxActiveEnemies){
      game.spawnDelay = Math.max(game.spawnDelay, 0.5);
      return false;
    }
    const statics = gatherStaticMeshes();
    const playerPos = controls.getObject().position;
    const p = difficulty.params;
    const attempts = CONFIG.SPAWN.maxAttempts;
    const spawnPoint = tempVecB;
    let pointFound = false;
    let chosenZone = null;
    const zones = PATCH_STATE.enemySpawnZones || [];

    if(zones.length){
      const preferred = pickSpawnZone();
      const zoneOrder = [];
      if(preferred) zoneOrder.push(preferred);
      for(let i=0;i<zones.length;i++){
        const zone = zones[i];
        if(zone && zone !== preferred) zoneOrder.push(zone);
      }
      for(let zi=0; zi<zoneOrder.length && !pointFound; zi++){
        const zone = zoneOrder[zi];
        const radius = Math.max(2.5, zone.radius || 0);
        for(let i=0;i<attempts;i++){
          const distance = Math.sqrt(Math.random()) * Math.max(1.5, radius - ENEMY_RADIUS);
          const angle = Math.random() * Math.PI * 2;
          spawnPoint.set(
            zone.center.x + Math.cos(angle) * distance,
            zone.height || 0,
            zone.center.z + Math.sin(angle) * distance
          );
          if(validateSpawnPoint(spawnPoint, zone, statics)){
            chosenZone = zone;
            pointFound = true;
            break;
          }
        }
        if(pointFound) break;
        spawnPoint.copy(zone.center);
        spawnPoint.y = zone.height || 0;
        if(validateSpawnPoint(spawnPoint, zone, statics)){
          chosenZone = zone;
          pointFound = true;
        }
      }
    } else {
      const spawnBounds = ensureSpawnBounds();
      for(let i=0;i<attempts;i++){
        if(spawnBounds && !spawnBounds.isEmpty()){
          spawnPoint.set(
            THREE.MathUtils.randFloat(spawnBounds.min.x, spawnBounds.max.x),
            THREE.MathUtils.clamp(playerPos.y, spawnBounds.min.y, spawnBounds.max.y),
            THREE.MathUtils.randFloat(spawnBounds.min.z, spawnBounds.max.z)
          );
        } else {
          const spawnRadius = Math.max(24, (world.size || 60) * 0.45);
          const angle = Math.random() * Math.PI * 2;
          const distance = THREE.MathUtils.randFloat(spawnRadius * 0.65, spawnRadius);
          spawnPoint.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
        }
        if(validateSpawnPoint(spawnPoint, null, statics)){
          pointFound = true;
          break;
        }
      }
    }

    if(!pointFound){
      game.spawnDelay = Math.max(game.spawnDelay, nextSpawnDelay());
      registerSpawnFailure();
      return false;
    }

    const spawnHeight = spawnPoint.y;
    const baseHealth = CONFIG.AI.baseHealth + game.round * CONFIG.AI.healthPerRound;
    const engageClamp = Number.isFinite(CONFIG.AI.engageDelay) ? CONFIG.AI.engageDelay : 0.3;
    const firstShotValues = [];
    if(Array.isArray(CONFIG.AI.firstShotDelay)){
      firstShotValues.push(...CONFIG.AI.firstShotDelay);
    }
    if(Array.isArray(p.firstShotDelay)){
      firstShotValues.push(...p.firstShotDelay);
    }
    const validFirstShot = firstShotValues.filter(v => Number.isFinite(v) && v >= 0);
    let firstShotMin = 0.08;
    let firstShotMax = 0.22;
    if(validFirstShot.length){
      firstShotMin = Math.min(...validFirstShot);
      firstShotMax = Math.max(...validFirstShot);
    }
    firstShotMin = Math.max(0.05, Math.min(firstShotMin, engageClamp));
    firstShotMax = Math.max(firstShotMin + 0.04, Math.min(firstShotMax, engageClamp + 0.12));
    const initialFireDelay = THREE.MathUtils.randFloat(firstShotMin, firstShotMax);

    const profile = buildEnemyProfile(game.round || 1);
    const healthScalar = THREE.MathUtils.lerp(0.88, 1.28, profile.resilience);
    const enemyHealth = baseHealth * healthScalar;
    const chaseMultiplier = THREE.MathUtils.lerp(0.85, 1.25, profile.aggression);
    const patrolMultiplier = THREE.MathUtils.lerp(0.72, 1.08, profile.resilience * 0.5 + profile.accuracy * 0.3);
    const restFloor = Array.isArray(profile.restCadence) && profile.restCadence.length
      ? Math.max(0.05, profile.restCadence[0])
      : 0.18;
    const initialCooldown = Math.max(0.05, Math.min(initialFireDelay, restFloor * 0.75));
    const magazineSize = Math.max(8, Math.round(profile.magazine || DEFAULT_ENEMY_PROFILE.magazine || 24));
    const reloadDuration = Math.max(0.6, profile.reloadTime || DEFAULT_ENEMY_PROFILE.reloadTime || 1.9);
    const tacticalReloadDuration = Math.max(0.55, profile.tacticalReloadTime || reloadDuration * 0.72);
    const tacticalThreshold = Math.max(
      1,
      Math.round(
        magazineSize * THREE.MathUtils.clamp(
          profile.tacticalReload ?? DEFAULT_ENEMY_PROFILE.tacticalReload ?? 0.4,
          0.2,
          0.75
        )
      )
    );
    const reloadVariance = THREE.MathUtils.clamp(
      profile.reloadVariance ?? DEFAULT_ENEMY_PROFILE.reloadVariance ?? 0.14,
      0.05,
      0.35
    );

    const rigBuild = buildEnemyRig(profile);
    const enemyMesh = rigBuild?.group;
    if(!enemyMesh){
      registerSpawnFailure();
      game.spawnDelay = Math.max(game.spawnDelay, nextSpawnDelay());
      return false;
    }
    enemyMesh.position.set(spawnPoint.x, spawnHeight + ENEMY_HALF_HEIGHT, spawnPoint.z);
    scene.add(enemyMesh);

    const enemy = {
      mesh: enemyMesh,
      health: enemyHealth,
      maxHealth: enemyHealth,
      state: 'patrol',
      chaseSpeed: (movementConfig.enemyChase || 3.8) * chaseMultiplier,
      patrolSpeed: (movementConfig.enemyPatrol || 2.6) * patrolMultiplier,
      fireCooldown: initialCooldown,
      burstShotsLeft: 0,
      aimSpread: Math.max(THREE.MathUtils.degToRad(0.45), p.aimSpread * THREE.MathUtils.lerp(1.05, 0.62, profile.accuracy)),
      suppressedUntil: 0,
      brain: createEnemyBrain(chosenZone, profile),
      groundHeight: spawnHeight,
      profile,
      weaponPattern: {
        burstMin: profile.burst[0],
        burstMax: profile.burst[1],
        burstCadence: profile.burstCadence.slice(0, 2),
        restCadence: profile.restCadence.slice(0, 2),
      },
      preferredRange: profile.preferredRange,
      damageScalar: profile.damageScale,
      magazineSize,
      ammo: magazineSize,
      reloadDuration,
      tacticalReloadDuration,
      tacticalReloadThreshold: tacticalThreshold,
      reloadVariance,
      reloadTimer: 0,
      isReloading: false,
      lastReloadAt: -Infinity,
    };
    enemy.spawnZone = chosenZone || null;
    enemy.primaryMaterial = rigBuild.materials?.primary || getEnemyPrimaryMaterial(enemy);
    enemy.accentMaterial = rigBuild.materials?.accent || null;
    enemy.visorMaterial = rigBuild.materials?.visor || null;
    enemy.skinMaterial = rigBuild.materials?.skin || enemyMesh.userData?.skinMaterial || null;
    enemy.hairMaterial = rigBuild.materials?.hair || enemyMesh.userData?.hairMaterial || null;
    applyEnemyVisualProfile(enemy);
    enemyMesh.traverse(obj => {
      if(obj && obj.isMesh){
        obj.userData.enemy = enemy;
      }
    });
    enemyMesh.userData.enemyProfile = profile;
    enemyMesh.userData.enemy = enemy;
    enemies.push(enemy);
    registerEnemyProfile(enemy);
    resetSpawnFailureCounters();
    return true;
  }

  function pickSpawnZone(){
    const zones = PATCH_STATE.enemySpawnZones || [];
    if(!zones.length) return null;
    const playerPos = controls.getObject().position;
    const playerSpawn = PATCH_STATE.playerSpawn;
    const statics = gatherStaticMeshes();
    let bestZone = zones[0];
    let bestScore = -Infinity;
    for(let i=0;i<zones.length;i++){
      const zone = zones[i];
      const dx = zone.center.x - playerPos.x;
      const dz = zone.center.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      const spawnDist = playerSpawn ? Math.hypot(zone.center.x - playerSpawn.x, zone.center.z - playerSpawn.z) : dist;
      const radius = Math.max(4, zone.radius || 0);
      const occupancy = zoneOccupancyInfo(zone);
      const crowdingRadius = Math.max(ENEMY_RADIUS * 2.2, 1.6);
      const crowdingPenalty = occupancy.closestSq < crowdingRadius * crowdingRadius ? 14 : 0;
      const occupancyPenalty = occupancy.count * Math.max(6, radius * 0.35);
      const zoneHeight = Number.isFinite(zone.height) ? zone.height : 0;
      tempVecE.set(zone.center.x, zoneHeight + ENEMY_HALF_HEIGHT, zone.center.z);
      const hasLine = zoneHasDirectLine(tempVecE, statics, playerPos);
      let linePenalty = 0;
      if(hasLine){
        const safeRadius = CONFIG.SPAWN.safeRadius;
        if(dist < safeRadius * 1.5){
          linePenalty = (safeRadius * 1.5 - dist) * 0.55;
        }
      } else {
        linePenalty = -Math.min(radius, 22) * 0.2;
      }
      const breathingRoom = Math.min(radius, 24) * 0.4;
      const score = dist + spawnDist * 0.5 + breathingRoom - occupancyPenalty - crowdingPenalty - linePenalty;
      if(score > bestScore){
        bestScore = score;
        bestZone = zone;
      }
    }
    return bestZone;
  }

  function createEnemyBrain(zone, profile = DEFAULT_ENEMY_PROFILE){
    const reactionScalar = THREE.MathUtils.clamp(profile.accuracy * 0.6 + profile.aggression * 0.4, 0, 1);
    const reactionFloor = CONFIG.AI.reactionFloor ?? 0.05;
    const reactionCeil = CONFIG.AI.reactionCeil ?? 0.16;
    const reactionBase = THREE.MathUtils.lerp(reactionCeil, reactionFloor, reactionScalar);
    const vigilance = THREE.MathUtils.lerp(0.35, 0.82, profile.aggression * 0.6 + profile.resilience * 0.4);
    return {
      state: 'patrol',
      zone: zone || null,
      lastDecisionAt: -Infinity,
      peekUntil: 0,
      coverUntil: 0,
      flankUntil: 0,
      repositionUntil: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeUntil: 0,
      anchorTarget: new THREE.Vector3(),
      anchorValid: false,
      anchorUntil: 0,
      anchorRadius: THREE.MathUtils.lerp(0.9, 1.5, profile.accuracy),
      anchorSide: Math.random() < 0.5 ? -1 : 1,
      microStrafeUntil: 0,
      microStrafeCooldown: 0,
      wanderTarget: new THREE.Vector3(),
      nextWanderAt: 0,
      coverTarget: new THREE.Vector3(),
      hasCoverTarget: false,
      lastKnownPlayerPos: new THREE.Vector3(),
      lastHitAt: -Infinity,
      alertUntil: 0,
      seeingPlayer: false,
      lastSeenAt: -Infinity,
      awareness: 0,
      vigilance,
      reactionDelay: reactionBase,
      reactionTimer: reactionBase,
      reacquireBoost: Math.max(0.03, reactionBase * 0.28),
      searchUntil: 0,
      investigationTarget: new THREE.Vector3(),
    };
  }

  function validateSpawnPoint(point, zone, staticsOverride){
    const statics = staticsOverride || gatherStaticMeshes();
    const spawnBounds = ensureSpawnBounds();
    if(spawnBounds && !spawnBounds.isEmpty()){
      if(point.x < spawnBounds.min.x || point.x > spawnBounds.max.x || point.z < spawnBounds.min.z || point.z > spawnBounds.max.z){
        return false;
      }
    }
    const playerPos = controls.getObject().position;
    const safeRadius = CONFIG.SPAWN.safeRadius;
    if(point.distanceTo(playerPos) < safeRadius){
      return false;
    }
    if(PATCH_STATE.playerSpawn && point.distanceTo(PATCH_STATE.playerSpawn) < safeRadius * 0.9){
      return false;
    }

    let activeZone = zone || null;
    const zones = PATCH_STATE.enemySpawnZones || [];
    if(activeZone){
      tempVecG.copy(point).sub(activeZone.center).setY(0);
      const radius = Math.max(1, activeZone.radius || 0) - ENEMY_RADIUS * 0.5;
      if(tempVecG.lengthSq() > radius * radius){
        return false;
      }
    } else if(zones.length){
      let inside = false;
      for(let i=0;i<zones.length;i++){
        const candidate = zones[i];
        if(!candidate) continue;
        tempVecG.copy(point).sub(candidate.center).setY(0);
        const radius = Math.max(1, candidate.radius || 0) - ENEMY_RADIUS * 0.5;
        if(tempVecG.lengthSq() <= radius * radius){
          inside = true;
          activeZone = candidate;
          break;
        }
      }
      if(!inside) return false;
    }

    const resolved = ensureSpawnClearance(point, activeZone, statics);
    if(resolved === null){
      return false;
    }

    tempVecC.set(point.x, resolved + ENEMY_HALF_HEIGHT, point.z);
    const minEnemyGap = ENEMY_RADIUS * 2.6;
    const minEnemyGapSq = minEnemyGap * minEnemyGap;
    for(let i=0;i<enemies.length;i++){
      const other = enemies[i];
      const mesh = other?.mesh;
      if(!mesh) continue;
      tempVecD.copy(mesh.position);
      tempVecD.y = tempVecC.y;
      const dx = tempVecD.x - tempVecC.x;
      const dz = tempVecD.z - tempVecC.z;
      if(dx*dx + dz*dz < minEnemyGapSq){
        return false;
      }
    }
    tempVecA.subVectors(playerPos, tempVecC);
    const distance = tempVecA.length();
    if(distance < 1e-3){
      return false;
    }
    tempVecA.normalize();
    helperRay.set(tempVecC, tempVecA);
    helperRay.far = distance;
    let blocked = false;
    for(let i=0;i<statics.length;i++){
      const mesh = statics[i];
      if(!mesh) continue;
      const intersections = helperRay.intersectObject(mesh, false);
      if(intersections.length && intersections[0].distance > 0.35){
        blocked = true;
        break;
      }
    }
    helperRay.far = Infinity;
    if(blocked){
      return true;
    }
    return distance >= safeRadius * 1.4;
  }

  function patchedUpdateEnemies(delta){
    if(ENEMIES_DISABLED){
      if(Array.isArray(enemies) && enemies.length){
        purgeEnemies();
      } else if(game?.state !== 'peaceful'){
        setPeacefulState();
      }
      return;
    }
    const now = performance.now();
    pruneLosCache(now);
    const playerPos = controls.getObject().position;
    const statics = gatherStaticMeshes();
    const engageClamp = Number.isFinite(CONFIG.AI.engageDelay) ? CONFIG.AI.engageDelay : 0.3;
    const reengageClamp = Number.isFinite(CONFIG.AI.reengageDelay) ? CONFIG.AI.reengageDelay : 0.18;
    for(let i=0;i<enemies.length;i++){
      const enemy = enemies[i];
      const mesh = enemy.mesh;
      if(!mesh) continue;
      const brain = enemy.brain || (enemy.brain = createEnemyBrain(enemy.spawnZone, enemy.profile || DEFAULT_ENEMY_PROFILE));
      const previousState = brain.state;
      mesh.position.y = desiredEnemyCenterY(enemy);
      clampEnemyToZone(enemy);

      tempVecA.subVectors(playerPos, mesh.position);
      const distance = tempVecA.length();
      const toPlayerDir = tempVecB.copy(tempVecA);
      if(distance > 1e-3){
        toPlayerDir.multiplyScalar(1 / distance);
      } else {
        toPlayerDir.set(0, 0, 0);
      }

      const losKey = `${mesh.uuid}:${Math.round(playerPos.x*2)}:${Math.round(playerPos.z*2)}`;
      let hasLine = false;
      if(CONFIG.PERF.losReuse && losCache.has(losKey) && now - losCache.get(losKey).time < 80){
        hasLine = losCache.get(losKey).value;
      } else {
        hasLine = hasLineOfSight(mesh.position, playerPos);
        losCache.set(losKey, { value: hasLine, time: now });
      }

      const profile = enemy.profile || DEFAULT_ENEMY_PROFILE;
      const directives = ROUND_DIRECTIVES || {};
      const reactionBias = directives.reactionBias || 0;
      const reactionFloor = Number.isFinite(CONFIG.AI.reactionFloor) ? CONFIG.AI.reactionFloor : 0.05;
      const reactionCeil = Number.isFinite(CONFIG.AI.reactionCeil) ? CONFIG.AI.reactionCeil : 0.16;
      const awarenessMemorySec = Number.isFinite(CONFIG.AI.awarenessMemory) ? CONFIG.AI.awarenessMemory : 0.9;
      const awarenessMemoryMs = Math.max(awarenessMemorySec * 1000, 200);
      brain.reactionDelay = THREE.MathUtils.clamp(brain.reactionDelay + reactionBias * -0.05, reactionFloor, reactionCeil);
      brain.reactionTimer = Math.min(brain.reactionTimer, brain.reactionDelay);

      const suppressed = enemy.suppressedUntil > now;
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - delta);
      if(hasLine){
        brain.lastKnownPlayerPos.copy(playerPos);
        brain.lastKnownPlayerPos.y = desiredEnemyCenterY(enemy);
      }

      const weaponPattern = enemy.weaponPattern || {
        burstMin: DEFAULT_ENEMY_PROFILE.burst?.[0] ?? 2,
        burstMax: DEFAULT_ENEMY_PROFILE.burst?.[1] ?? 3,
        burstCadence: DEFAULT_ENEMY_PROFILE.burstCadence || CONFIG.AI.focusBurstOffset,
        restCadence: DEFAULT_ENEMY_PROFILE.restCadence || CONFIG.AI.burstCooldown,
      };
      const burstMin = Math.max(1, Math.round(weaponPattern.burstMin || 2));
      const burstMax = Math.max(burstMin, Math.round(weaponPattern.burstMax || burstMin + 1));
      const burstCadence = Array.isArray(weaponPattern.burstCadence) && weaponPattern.burstCadence.length >= 2
        ? weaponPattern.burstCadence
        : (DEFAULT_ENEMY_PROFILE.burstCadence || CONFIG.AI.focusBurstOffset);
      const restCadence = Array.isArray(weaponPattern.restCadence) && weaponPattern.restCadence.length >= 2
        ? weaponPattern.restCadence
        : (DEFAULT_ENEMY_PROFILE.restCadence || CONFIG.AI.burstCooldown);
      const preferredRange = enemy.preferredRange || profile.preferredRange || CONFIG.STIM.focusRadius;
      const engageRange = Math.max(CONFIG.STIM.focusRadius, preferredRange);
      const strafeAggression = THREE.MathUtils.clamp(profile.aggression * 0.8 + profile.accuracy * 0.2, 0, 1);
      const retreatAggression = THREE.MathUtils.clamp(1 - profile.resilience * 0.6, 0, 1);
      const suppressionResist = profile.suppressionResist || 1;
      const detectionSkill = THREE.MathUtils.clamp(profile.accuracy * 0.6 + profile.aggression * 0.4 + (directives.awarenessBonus || 0), 0, 1);
      const alertDistanceBase = Number.isFinite(CONFIG.AI.alertDistance) ? CONFIG.AI.alertDistance : engageRange;
      const alertDistance = alertDistanceBase * (1 + THREE.MathUtils.clamp(directives.awarenessBonus || 0, 0, 0.8));
      const awarenessGain = THREE.MathUtils.lerp(1.6, 3.2, profile.aggression * 0.7 + profile.accuracy * 0.3);
      const awarenessLoss = THREE.MathUtils.lerp(0.4, 0.9, 1 - profile.resilience * 0.5);
      const reactionPull = THREE.MathUtils.lerp(3.2, 6.2, profile.aggression * 0.6 + profile.accuracy * 0.4 + Math.max(0, reactionBias));
      const reacquireWindow = Math.max(0.02, brain.reactionDelay * 0.35);
      const memoryHold = awarenessMemoryMs * THREE.MathUtils.lerp(0.55, 0.9, detectionSkill);
      if(enemy.isReloading){
        enemy.reloadTimer = Math.max(0, (enemy.reloadTimer || 0) - delta);
        enemy.fireCooldown = Math.max(enemy.fireCooldown, enemy.reloadTimer);
        if(enemy.reloadTimer <= 0){
          completeEnemyReload(enemy, restCadence, brain, now);
        }
      } else if((enemy.ammo ?? enemy.magazineSize) <= 0){
        scheduleEnemyReload(enemy, now, { tactical: false });
      } else {
        const threshold = enemy.tacticalReloadThreshold || Math.max(1, Math.round((enemy.magazineSize || 12) * 0.35));
        const lowAmmo = enemy.ammo <= threshold;
        const sinceLastShot = now - (enemy.lastFireAt || 0);
        const sinceReload = now - (enemy.lastReloadAt || -Infinity);
        const tacticalWindow = sinceLastShot > 220 && sinceReload > 600;
        if(lowAmmo && tacticalWindow && (!hasLine || suppressed)){
          scheduleEnemyReload(enemy, now, { tactical: true });
        }
      }
      if(hasLine){
        if(now - brain.lastSeenAt > 140){
          enemy.fireCooldown = Math.min(enemy.fireCooldown, reacquireWindow);
          enemy.burstShotsLeft = Math.max(enemy.burstShotsLeft, 1);
        }
        brain.awareness = Math.min(1, brain.awareness + delta * awarenessGain);
        brain.reactionTimer = Math.max(0, brain.reactionTimer - delta * reactionPull);
        brain.lastSeenAt = now;
        brain.seeingPlayer = true;
        const directiveHold = (directives.awarenessBonus || 0) * 320;
        brain.alertUntil = Math.max(brain.alertUntil || 0, now + awarenessMemoryMs * THREE.MathUtils.lerp(0.8, 1.3, detectionSkill) + directiveHold);
      } else {
        const sinceSeen = now - brain.lastSeenAt;
        brain.awareness = Math.max(0, brain.awareness - delta * (awarenessLoss + (brain.awareness > 0.55 ? 0.7 : 0.35)));
        brain.reactionTimer = Math.min(brain.reactionDelay, brain.reactionTimer + delta * 0.7);
        if(sinceSeen < memoryHold){
          brain.alertUntil = Math.max(brain.alertUntil || 0, brain.lastSeenAt + memoryHold);
        } else if(brain.alertUntil && now > brain.alertUntil){
          brain.awareness = Math.max(0, brain.awareness - delta * 1.1);
        }
        if(sinceSeen > 220){
          brain.seeingPlayer = false;
        }
      }

      if(distance < alertDistance){
        brain.awareness = Math.min(1, brain.awareness + delta * 2.2 + 0.2);
        const closeBonus = THREE.MathUtils.lerp(520, 320, detectionSkill) + (directives.awarenessBonus || 0) * 280;
        brain.alertUntil = Math.max(brain.alertUntil || 0, now + closeBonus);
      }

      if(!hasLine && distance < engageRange * THREE.MathUtils.lerp(1.05, 1.45, directives.awarenessBonus || 0)){
        brain.alertUntil = Math.max(brain.alertUntil || 0, now + 380 + (directives.awarenessBonus || 0) * 320);
        brain.awareness = Math.min(1, brain.awareness + 0.25);
      }

      const alertActive = hasLine || brain.awareness > 0.45 || (brain.alertUntil || 0) > now;
      if(alertActive && !hasLine){
        brain.searchUntil = Math.max(brain.searchUntil || 0, now + 1800);
        brain.investigationTarget.copy(brain.lastKnownPlayerPos);
      } else if(hasLine){
        brain.searchUntil = Math.max(brain.searchUntil || 0, now + 900);
        brain.investigationTarget.copy(playerPos);
      }

      if(hasLine){
        if(brain.state !== 'attack'){
          brain.state = 'attack';
          brain.hasCoverTarget = false;
        }
        const immediateWindow = Math.max(0.02, Math.min(engageClamp, brain.reactionDelay * 0.6));
        enemy.fireCooldown = Math.min(enemy.fireCooldown, immediateWindow);
        brain.reactionTimer = Math.min(brain.reactionTimer, immediateWindow);
      } else if(alertActive && brain.state === 'patrol'){
        brain.state = 'flank';
        brain.repositionUntil = Math.max(brain.repositionUntil, now + 600);
      }

      switch(brain.state){
        case 'patrol': {
          const zone = enemy.spawnZone;
          if((brain.searchUntil || 0) > now && !hasLine){
            brain.state = 'flank';
            brain.repositionUntil = Math.max(brain.repositionUntil, now + 600);
            brain.hasCoverTarget = false;
            break;
          }
          if(
            now >= brain.nextWanderAt ||
            !isFinite(brain.wanderTarget.x) ||
            brain.wanderTarget.distanceToSquared(mesh.position) < 0.5
          ){
            const center = zone?.center || mesh.position;
            const radius = zone
              ? Math.max(1.5, (zone.radius || 6) * THREE.MathUtils.lerp(0.6, 1.0, profile.aggression * 0.25 + profile.resilience * 0.35))
              : 6;
            const wanderAngle = Math.random() * Math.PI * 2;
            const wanderDist = Math.sqrt(Math.random()) * radius;
            brain.wanderTarget.set(
              center.x + Math.cos(wanderAngle) * wanderDist,
              desiredEnemyCenterY(enemy),
              center.z + Math.sin(wanderAngle) * wanderDist
            );
            const wanderDelay = THREE.MathUtils.randFloat(900, 1600) * THREE.MathUtils.lerp(0.75, 1.2, 1 - profile.aggression * 0.5);
            brain.nextWanderAt = now + wanderDelay;
          }
          brain.hasCoverTarget = false;
          const patrolSpeed = Math.max(enemy.patrolSpeed * THREE.MathUtils.lerp(0.78, 1.12, profile.aggression * 0.25 + profile.resilience * 0.35), 0.45);
          moveEnemyTowards(enemy, brain.wanderTarget, patrolSpeed, delta, statics);
          mesh.lookAt(playerPos.x, mesh.position.y, playerPos.z);
          const engageThreshold = engageRange * THREE.MathUtils.lerp(1.35, 1.75, profile.aggression);
          if(((alertActive && distance < engageThreshold) || (hasLine && distance < engageThreshold * 1.05)) || suppressed){
            brain.state = 'attack';
            const strafeWindow = THREE.MathUtils.randFloat(500, 1400) * THREE.MathUtils.lerp(0.85, 1.2, strafeAggression);
            brain.strafeUntil = now + strafeWindow;
          }
          break;
        }
        case 'attack': {
          mesh.lookAt(playerPos.x, mesh.position.y, playerPos.z);
          brain.hasCoverTarget = false;
          const anchorTarget = ensureAttackAnchor(enemy, playerPos, hasLine, now, statics);
          const anchorRadius = brain.anchorRadius || (brain.anchorRadius = THREE.MathUtils.lerp(0.9, 1.6, profile.accuracy));
          tempVecF.subVectors(anchorTarget, mesh.position).setY(0);
          const anchorDistance = tempVecF.length();
          if(anchorDistance > anchorRadius){
            tempVecF.normalize().multiplyScalar(enemy.chaseSpeed * THREE.MathUtils.lerp(0.62, 1.05, profile.aggression));
          } else {
            tempVecF.set(0, 0, 0);
          }
          const rangeBuffer = THREE.MathUtils.lerp(0.3, 0.12, profile.accuracy);
          if(distance > engageRange * (1 + rangeBuffer)){
            tempVecF.addScaledVector(toPlayerDir, enemy.chaseSpeed * THREE.MathUtils.lerp(0.62, 1.05, profile.aggression));
          } else if(distance < engageRange * Math.max(0.38, 1 - rangeBuffer * 1.4)){
            tempVecF.addScaledVector(toPlayerDir, -enemy.chaseSpeed * THREE.MathUtils.lerp(0.28, 0.62, retreatAggression));
          }
          if(!hasLine && toPlayerDir.lengthSq() > 1e-6){
            tempVecF.addScaledVector(toPlayerDir, enemy.chaseSpeed * THREE.MathUtils.lerp(0.52, 0.9, profile.aggression));
          }
          if(toPlayerDir.lengthSq() > 1e-6){
            tempVecC.set(toPlayerDir.z, 0, -toPlayerDir.x);
            if(tempVecC.lengthSq() > 1e-6){
              tempVecC.normalize();
              if(hasLine && now > brain.microStrafeCooldown){
                brain.anchorSide = brain.anchorSide || (Math.random() < 0.5 ? -1 : 1);
                brain.anchorSide = -brain.anchorSide;
                brain.microStrafeCooldown = now + THREE.MathUtils.randFloat(640, 1100);
                brain.microStrafeUntil = now + THREE.MathUtils.randFloat(260, 520);
              }
              if(hasLine && now < brain.microStrafeUntil){
                const strafeSpeed = enemy.chaseSpeed * THREE.MathUtils.lerp(0.22, 0.54, strafeAggression);
                tempVecF.addScaledVector(tempVecC, strafeSpeed * brain.anchorSide);
              }
            }
          }
          if(enemy.isReloading){
            const reloadRetreat = enemy.chaseSpeed * THREE.MathUtils.lerp(
              0.2,
              0.48,
              THREE.MathUtils.clamp(retreatAggression + (CONFIG.AI.suppressedReloadPenalty || 0.35), 0, 1.2)
            );
            tempVecF.addScaledVector(toPlayerDir, -reloadRetreat);
          }
          applyEnemyVelocity(enemy, tempVecF, delta, statics);
          if(hasLine){
            const closeShotWindow = Math.max(0.035, brain.reactionDelay * 0.4);
            brain.reactionTimer = Math.max(0, brain.reactionTimer - delta * (reactionPull + 6));
            enemy.fireCooldown = Math.min(enemy.fireCooldown, brain.reactionTimer + closeShotWindow);
            const cooldownPull = THREE.MathUtils.lerp(1.4, 2.1, profile.aggression) + (reactionBias > 0 ? reactionBias * 3.2 : 0);
            enemy.fireCooldown = Math.max(0, enemy.fireCooldown - delta * cooldownPull);
          }
          if((!hasLine && !(brain.alertUntil && brain.alertUntil > now)) || suppressed){
            brain.state = 'flank';
            const flankDelay = CONFIG.STIM.flankLoSBlock * 1000 * THREE.MathUtils.lerp(0.85, 1.25, strafeAggression);
            brain.flankUntil = now + flankDelay;
            brain.repositionUntil = now + CONFIG.STIM.suppressionRelocate * 1000 * suppressionResist;
            brain.hasCoverTarget = false;
            enemy.burstShotsLeft = 0;
            break;
          }
          if(enemy.isReloading){
            break;
          }
          if(enemy.fireCooldown <= 0){
            if(!suppressed && brain.reactionTimer > 0){
              if(distance < engageRange * 1.3 || hasLine){
                brain.reactionTimer = Math.max(0, brain.reactionTimer - delta * (reactionPull + 4));
              }
              enemy.fireCooldown = Math.max(enemy.fireCooldown, brain.reactionTimer);
            } else {
              if(enemy.burstShotsLeft <= 0){
                enemy.burstShotsLeft = THREE.MathUtils.randInt(burstMin, burstMax);
              }
              patchedEnemyHitscanShoot(enemy, delta, {
                suppressed,
                distance,
                toPlayerDir,
                now,
                playerPos,
                profile,
              });
              enemy.burstShotsLeft -= 1;
              if(enemy.burstShotsLeft > 0){
                enemy.fireCooldown = THREE.MathUtils.randFloat(burstCadence[0], burstCadence[1]);
                brain.reactionTimer = Math.max(0, brain.reactionDelay * 0.25);
              } else {
                enemy.fireCooldown = THREE.MathUtils.randFloat(restCadence[0], restCadence[1]);
                brain.reactionTimer = Math.max(0, brain.reactionDelay * THREE.MathUtils.lerp(0.4, 0.7, 1 - profile.aggression));
              }
            }
          }
          break;
        }
        default: {
          if(!brain.hasCoverTarget){
            if(alertActive && !hasLine && brain.lastKnownPlayerPos){
              brain.coverTarget.copy(brain.lastKnownPlayerPos);
            } else {
              const cover = pickCoverPoint(mesh.position, toPlayerDir.lengthSq() > 1e-6 ? toPlayerDir : tempVecC.set(0, 0, 1));
              if(cover){
                brain.coverTarget.copy(cover);
              } else if((brain.searchUntil || 0) > now){
                brain.coverTarget.copy(brain.investigationTarget);
              } else {
                brain.coverTarget.copy(brain.lastKnownPlayerPos);
              }
            }
            brain.coverTarget.y = desiredEnemyCenterY(enemy);
            brain.hasCoverTarget = true;
          }
          const relocateSpeed = enemy.chaseSpeed * THREE.MathUtils.lerp(0.78, 1.08, profile.aggression);
          const distToCover = moveEnemyTowards(enemy, brain.coverTarget, relocateSpeed, delta, statics);
          mesh.lookAt(playerPos.x, mesh.position.y, playerPos.z);
          if((alertActive && now > brain.flankUntil) || (hasLine && now > brain.flankUntil)){
            brain.state = 'attack';
            brain.hasCoverTarget = false;
          } else if(distToCover < THREE.MathUtils.lerp(0.9, 0.55, profile.accuracy) || now > brain.repositionUntil){
            brain.state = alertActive || hasLine ? 'attack' : 'patrol';
            brain.hasCoverTarget = false;
          }
          break;
        }
      }

      if(previousState !== brain.state && brain.state === 'attack'){
        const engageDelay = engageClamp * THREE.MathUtils.lerp(0.85, 1.15, 1 - profile.aggression);
        const immediate = Math.max(0.02, engageDelay - Math.max(0, reactionBias) * 0.5);
        enemy.fireCooldown = Math.min(enemy.fireCooldown, immediate);
        brain.reactionTimer = Math.min(brain.reactionTimer, immediate);
      }
      if(brain.state === 'attack' && hasLine && enemy.fireCooldown > reengageClamp){
        const clampTarget = reengageClamp * THREE.MathUtils.lerp(0.75, 1.05, 1 - profile.accuracy) * Math.max(0.45, 1 - reactionBias * 0.8);
        const cooldownPull = delta * THREE.MathUtils.lerp(1.2, 1.8, profile.aggression) * (1 + Math.max(0, reactionBias) * 1.8);
        enemy.fireCooldown = Math.max(clampTarget, enemy.fireCooldown - cooldownPull);
        brain.reactionTimer = Math.min(brain.reactionTimer, clampTarget);
      }

      if(brain.searchUntil && now > brain.searchUntil){
        brain.searchUntil = 0;
      }
      enemy.state = brain.state;
    }
  }

  function hasLineOfSight(from, to){
    tempVecC.copy(from).setY(from.y + 0.5);
    helperRay.set(tempVecC, tempVecB.subVectors(to, from).normalize());
    const statics = gatherStaticMeshes();
    const hits = helperRay.intersectObjects(statics, false);
    if(hits.length && hits[0].distance < from.distanceTo(to)){
      return false;
    }
    return true;
  }

  function moveTowards(mesh, target, speed, delta){
    tempVecA.subVectors(target, mesh.position).setY(0);
    const distance = tempVecA.length();
    if(distance < 0.1) return;
    tempVecA.normalize();
    mesh.position.addScaledVector(tempVecA, speed * delta);
  }

  function patchedEnemyHitscanShoot(enemy, delta = 0, context = {}){
    const muzzle = borrowVec3().copy(enemy.mesh.position);
    const forward = borrowVec3();
    if(context.toPlayerDir && context.toPlayerDir.lengthSq() > 1e-6){
      forward.copy(context.toPlayerDir).setY(0);
    } else if(typeof enemy.mesh.getWorldDirection === 'function'){
      enemy.mesh.getWorldDirection(forward);
    } else {
      forward.set(0, 0, -1);
    }
    if(forward.lengthSq() < 1e-6){
      forward.set(0, 0, -1);
    }
    forward.normalize();
    forward.y = 0;
    if(forward.lengthSq() < 1e-6){
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const right = borrowVec3().set(forward.z, 0, -forward.x);
    if(right.lengthSq() > 1e-6){
      right.normalize();
    } else {
      right.set(1, 0, 0);
    }
    muzzle.y = desiredEnemyCenterY(enemy) + 0.2;
    muzzle.addScaledVector(forward, 0.8);
    muzzle.addScaledVector(right, 0.25);

    const target = borrowVec3().copy(controls.getObject().position);
    target.y += CONFIG.PLAYER.baseHeight;
    const profile = context.profile || enemy.profile || DEFAULT_ENEMY_PROFILE;
    const playerVel = borrowVec3();
    if(player.velocity && typeof player.velocity.x === 'number'){
      playerVel.copy(player.velocity);
    } else {
      playerVel.set(0, 0, 0);
    }
    const distance = context.distance ?? muzzle.distanceTo(target);
    const leadTime = (profile.leadTime || CONFIG.AI.leadFactor) * Math.min(1.4, Math.max(0.4, distance / 18));
    target.addScaledVector(playerVel, leadTime);
    const dir = borrowVec3().subVectors(target, muzzle).normalize();
    const jitterBase = profile.aimJitter || DEFAULT_ENEMY_PROFILE.aimJitter || THREE.MathUtils.degToRad(1.2);
    const jitterScale = (context.suppressed ? jitterBase * 1.45 : jitterBase) * THREE.MathUtils.lerp(1.2, 0.85, profile.accuracy || 0.5);
    if(jitterScale > 0.0001){
      const yawJitter = (Math.random() * 2 - 1) * jitterScale;
      const pitchJitter = (Math.random() * 2 - 1) * jitterScale * 0.6;
      tempEuler.set(pitchJitter, yawJitter, 0);
      tempQuat.setFromEuler(tempEuler);
      dir.applyQuaternion(tempQuat).normalize();
    }

    const tracerEnd = borrowVec3().copy(muzzle).addScaledVector(dir, CONFIG.WEAPONS.tracerSegment);
    spawnTracer(muzzle, tracerEnd, { color: 0xff6d6d, life: CONFIG.PERF.tracerLifetime * 1.25, opacity: 0.85 });

    spawnProjectile({
      origin: muzzle,
      direction: dir,
      speed: CONFIG.WEAPONS.enemyMuzzleVelocity * (ROUND_DIRECTIVES.velocityScale || 1),
      gravity: CONFIG.WEAPONS.projectileGravity * 0.8,
      drag: CONFIG.WEAPONS.projectileDrag,
      owner: 'enemy',
      sourceEnemy: enemy,
      maxLife: CONFIG.WEAPONS.projectileLife,
      tracerColor: 0xff6d6d,
      tracerOpacity: 0.85,
      onPlayerHit: handleEnemyProjectilePlayerHit,
      onWorldHit: handleEnemyProjectileWorldHit,
      extra: {
        profile,
        suppressed: context.suppressed,
      },
    });
    if(typeof enemy.ammo === 'number'){
      enemy.ammo = Math.max(0, enemy.ammo - 1);
    }
    enemy.lastFireAt = performance.now();

    releaseVec3(tracerEnd);
    releaseVec3(playerVel);
    releaseVec3(target);
    releaseVec3(muzzle);
    releaseVec3(dir);
    releaseVec3(forward);
    releaseVec3(right);
  }

  function handleEnemyProjectilePlayerHit(projectile, impact){
    const enemy = projectile.sourceEnemy;
    const profile = projectile.extra?.profile || enemy?.profile || DEFAULT_ENEMY_PROFILE;
    const baseDamage = (CONFIG.AI.baseDamage || 16) + (game.round || 1) * (CONFIG.AI.damagePerRound || 0);
    let damage = baseDamage * (enemy?.damageScalar || profile.damageScale || 1);
    if(projectile.extra?.suppressed){
      damage *= CONFIG.AI.flinchSuppression;
    }
    patchedDamagePlayer(damage);
    return true;
  }

  function handleEnemyProjectileWorldHit(projectile, hit, dir){
    const normal = hit.face
      ? borrowVec3().copy(hit.face.normal).applyMatrix3(tempMat3.getNormalMatrix(hit.object.matrixWorld)).normalize()
      : borrowVec3().copy(dir).multiplyScalar(-1);
    spawnImpact(hit.point, normal);
    releaseVec3(normal);
    return true;
  }

  // ---------------------------------------------------------------------------
  // SPAWN / ROUNDS
  // ---------------------------------------------------------------------------
  function resetSpawnFailureCounters(){
    PATCH_STATE.spawnFailureStreak = 0;
    PATCH_STATE.lastSpawnFailureAt = 0;
  }

  function registerSpawnFailure(){
    PATCH_STATE.spawnFailureStreak = (PATCH_STATE.spawnFailureStreak || 0) + 1;
    PATCH_STATE.lastSpawnFailureAt = performance.now();
    if(PATCH_STATE.spawnFailureStreak < SPAWN_FAILURE_LIMIT){
      return;
    }

    PATCH_STATE.spawnFailureStreak = 0;
    if(game.spawnQueue > 0){
      game.spawnQueue = Math.max(0, game.spawnQueue - 1);
    }
    if(typeof game.phaseQueue === 'number' && game.phaseQueue > 0){
      game.phaseQueue = Math.max(0, game.phaseQueue - 1);
    }
    if(game.enemiesRemaining > 0){
      game.enemiesRemaining = Math.max(0, game.enemiesRemaining - 1);
      updateEnemiesHud();
    }
    if(game.spawnQueue <= 0){
      game.spawnQueue = 0;
      if(game.state === 'spawning'){
        game.state = 'inRound';
      }
      maybeEndRound();
    }
  }

  function buildRoundScript(round, params){
    if(ENEMIES_DISABLED){
      return { total: 0, phases: [] };
    }
    const baseTotal = params.spawnBase + Math.floor(round * params.spawnScale);
    const total = Math.max(4, baseTotal);
    const intensity = THREE.MathUtils.clamp((round - 1) / 10, 0, 1);
    const phases = [
      {
        label: 'Çatışma',
        weight: 1,
        cadence: [0.42, 0.65],
        warmup: 0.45,
        aggressionBias: 0.05,
        accuracyBias: 0.02,
        awarenessBonus: 0.08,
        reactionBias: 0.02,
        velocityScale: 0,
        damageBias: 0,
      },
      {
        label: 'Baskı',
        weight: THREE.MathUtils.lerp(0.6, 1.05, intensity),
        cadence: [0.28, 0.5],
        warmup: 0.75,
        aggressionBias: 0.16,
        accuracyBias: 0.1,
        awarenessBonus: 0.22,
        reactionBias: 0.08,
        velocityScale: 0.06,
        damageBias: 0.05,
      },
      {
        label: 'Taarruz',
        weight: THREE.MathUtils.lerp(0.35, 0.85, intensity),
        cadence: [0.18, 0.34],
        warmup: 0.95,
        aggressionBias: 0.28,
        accuracyBias: 0.16,
        awarenessBonus: 0.32,
        reactionBias: 0.16,
        velocityScale: 0.12,
        damageBias: 0.08,
      },
    ];
    if(round % 4 === 0){
      phases.push({
        label: 'Kuşatma',
        weight: THREE.MathUtils.lerp(0.25, 0.7, intensity),
        cadence: [0.16, 0.28],
        warmup: 1.1,
        aggressionBias: 0.35,
        accuracyBias: 0.22,
        awarenessBonus: 0.4,
        reactionBias: 0.22,
        velocityScale: 0.18,
        damageBias: 0.12,
      });
    }
    const filtered = phases.filter(p => p.weight > 0);
    const weightSum = filtered.reduce((acc, phase) => acc + phase.weight, 0);
    let remaining = total;
    for(let i = 0; i < filtered.length; i++){
      const phase = filtered[i];
      if(i === filtered.length - 1){
        phase.count = Math.max(1, remaining);
      } else {
        const portion = total * (phase.weight / weightSum);
        const estimated = Math.max(1, Math.round(portion));
        const reserved = Math.max(0, filtered.length - i - 1);
        const maxAllowed = Math.max(1, remaining - reserved);
        phase.count = Math.min(maxAllowed, estimated);
        remaining -= phase.count;
      }
    }
    return { total, phases: filtered };
  }

  function applyPhaseDirectives(phase){
    if(!phase){
      ROUND_DIRECTIVES.aggressionBias = 0;
      ROUND_DIRECTIVES.accuracyBias = 0;
      ROUND_DIRECTIVES.resilienceBias = 0;
      ROUND_DIRECTIVES.burstBias = 0;
      ROUND_DIRECTIVES.restBias = 0;
      ROUND_DIRECTIVES.reactionBias = 0;
      ROUND_DIRECTIVES.awarenessBonus = 0;
      ROUND_DIRECTIVES.velocityScale = 1;
      ROUND_DIRECTIVES.damageBias = 0;
      game.roundPhaseLabel = '';
      return;
    }
    ROUND_DIRECTIVES.aggressionBias = phase.aggressionBias || 0;
    ROUND_DIRECTIVES.accuracyBias = phase.accuracyBias || 0;
    ROUND_DIRECTIVES.resilienceBias = phase.resilienceBias || 0;
    ROUND_DIRECTIVES.burstBias = phase.burstBias || 0;
    ROUND_DIRECTIVES.restBias = phase.restBias || 0;
    ROUND_DIRECTIVES.reactionBias = phase.reactionBias || 0;
    ROUND_DIRECTIVES.awarenessBonus = phase.awarenessBonus || 0;
    ROUND_DIRECTIVES.velocityScale = 1 + (phase.velocityScale || 0);
    ROUND_DIRECTIVES.damageBias = phase.damageBias || 0;
    game.roundPhaseLabel = phase.label || '';
  }

  function announcePhase(phase, index){
    if(!phase) return;
    const label = phase.label ? phase.label.toUpperCase() : `FAZ ${index + 1}`;
    patchedShowRoundBanner(`FAZ ${index + 1} — ${label}`);
  }

  function activateNextPhase(initial = false){
    if(ENEMIES_DISABLED){
      applyPhaseDirectives(null);
      return false;
    }
    if(!Array.isArray(game.pendingPhases) || !game.pendingPhases.length){
      applyPhaseDirectives(null);
      return false;
    }
    const next = game.pendingPhases.shift();
    game.roundPhaseIndex = (game.roundPhaseIndex ?? -1) + 1;
    game.roundPhase = next;
    game.phaseQueue = next.count;
    game.spawnQueue = next.count;
    game.phaseDelay = Math.max(0, next.warmup ?? 0);
    applyPhaseDirectives(next);
    announcePhase(next, game.roundPhaseIndex);
    game.spawnDelay = Math.max(game.phaseDelay, nextSpawnDelay());
    updateEnemiesHud();
    return true;
  }

  function patchedStartNextRound(){
    if(ENEMIES_DISABLED){
      if(playerState.buyPhase){
        endBuyPhase();
      }
      resetSpawnFailureCounters();
      const previousRound = Number.isFinite(game.round) ? game.round : 0;
      game.round = previousRound + 1;
      ui.roundEl && (ui.roundEl.textContent = `Round: ${game.round}`);
      setPeacefulState();
      game.roundStartAt = performance.now();
      applyPhaseDirectives(null);
      patchedShowRoundBanner('BÖLGE GÜVENDE');
      return;
    }
    if(playerState.buyPhase){
      endBuyPhase();
    }
    resetSpawnFailureCounters();
    const params = difficulty.params;
    const previousRound = Number.isFinite(game.round) ? game.round : 0;
    game.round = previousRound + 1;
    ui.roundEl && (ui.roundEl.textContent = `Round: ${game.round}`);
    const script = buildRoundScript(game.round, params);
    game.roundScript = script;
    game.pendingPhases = script.phases.slice();
    game.enemiesRemaining = script.total;
    game.roundPhaseIndex = -1;
    game.roundPhase = null;
    game.roundPhaseLabel = '';
    game.spawnQueue = 0;
    game.phaseQueue = 0;
    game.phaseDelay = 0;
    updateEnemiesHud();
    game.state = 'spawning';
    game.roundStartAt = performance.now();
    applyPhaseDirectives(null);
    patchedShowRoundBanner(`ROUND ${game.round} — ${difficulty.name}`);
    activateNextPhase(true);
  }

  function nextSpawnDelay(){
    const phase = game.roundPhase;
    if(phase && Array.isArray(phase.cadence) && phase.cadence.length >= 2){
      const min = Math.max(0.1, Math.min(phase.cadence[0], phase.cadence[1]));
      const max = Math.max(min + 0.04, Math.max(phase.cadence[0], phase.cadence[1]));
      return THREE.MathUtils.randFloat(min, max);
    }
    const cadence = CONFIG.SPAWN.spawnCadence;
    if(Array.isArray(cadence) && cadence.length >= 2){
      const min = Math.max(0.12, Math.min(cadence[0], cadence[1]));
      const max = Math.max(min + 0.05, Math.max(cadence[0], cadence[1]));
      return THREE.MathUtils.randFloat(min, max);
    }
    return THREE.MathUtils.randFloat(0.35, 0.65);
  }

  function handleSpawning(delta){
    if(game.state !== 'spawning') return;
    if(game.spawnQueue < 0){
      game.spawnQueue = 0;
    }
    if(game.phaseDelay > 0){
      game.phaseDelay -= delta;
      if(game.phaseDelay > 0){
        return;
      }
    }
    game.spawnDelay -= delta;
    const cadence = CONFIG.SPAWN.spawnCadence;
    let maxCatchup = -0.75;
    if(Array.isArray(cadence) && cadence.length >= 2){
      const minWindow = Math.max(0.12, Math.min(cadence[0], cadence[1]));
      maxCatchup = -minWindow * 1.5;
    }
    if(game.spawnDelay < maxCatchup){
      game.spawnDelay = maxCatchup;
    }
    const canAttemptSpawn = enemies.length < CONFIG.SPAWN.concurrentCap;
    if(canAttemptSpawn && game.spawnDelay <= 0 && game.spawnQueue > 0){
      if(patchedSpawnEnemy()){
        game.spawnQueue -= 1;
        if(typeof game.phaseQueue === 'number'){
          game.phaseQueue = Math.max(0, game.phaseQueue - 1);
        }
        game.spawnDelay = nextSpawnDelay();
        updateEnemiesHud();
      } else {
        game.spawnDelay = Math.max(game.spawnDelay, nextSpawnDelay());
      }
    }
    if(game.spawnQueue <= 0){
      game.spawnQueue = 0;
      if(game.phaseQueue <= 0 && activateNextPhase()){
        return;
      }
      if(!Array.isArray(game.pendingPhases) || !game.pendingPhases.length){
        game.state = 'inRound';
      }
    }
  }

  function beginBuyPhase(){
    if(playerState.buyPhase){
      return;
    }
    resetSpawnFailureCounters();
    playerState.buyPhase = true;
    game.state = 'buyPhase';
    game.spawnQueue = 0;
    game.buyTimer = CONFIG.SPAWN.buyDuration;
    showBuyBanner();
    openStore(true);
  }

  function endBuyPhase(){
    playerState.buyPhase = false;
    game.state = 'waiting';
    if(playerState.storeOpen){
      closeStore();
    }
    hideBuyBanner();
  }

  function maybeEndRound(){
    if(game.state === 'over' || playerState.buyPhase){
      return;
    }
    if(game.enemiesRemaining <= 0 && game.spawnQueue <= 0 && enemies.length === 0){
      beginBuyPhase();
    }
  }

  function updateBuyPhase(delta){
    if(!playerState.buyPhase) return;
    game.buyTimer -= delta;
    if(game.buyTimer <= 0){
      endBuyPhase();
      patchedStartNextRound();
    } else {
      updateBuyBanner();
    }
  }

  function patchedShowRoundBanner(text){
    if(originalShowRoundBanner) originalShowRoundBanner(text);
  }

  // ---------------------------------------------------------------------------
  // ECONOMY / STORE
  // ---------------------------------------------------------------------------
  function patchedRemoveEnemy(enemy){
    if(!enemy) return;
    const idx = enemies.indexOf(enemy);
    if(idx !== -1){
      const skipRoundCheck = enemy.__suppressRoundCheck === true;
      unregisterEnemyProfile(enemy);
      const shouldDropLoot = enemy.__suppressLoot !== true;
      enemy.__suppressLoot = false;
      if(shouldDropLoot){
        maybeDropLoot(enemy.mesh?.position || controls.getObject().position);
      }
      scene.remove(enemy.mesh);
      if(enemy.mesh){
        enemy.mesh.traverse?.((obj) => {
          if(!obj || !obj.isMesh) return;
          if(obj.geometry && !isSharedEnemyGeometry(obj.geometry)){
            obj.geometry.dispose?.();
          }
          disposeMaterial(obj.material);
        });
      }
      enemy.primaryMaterial = null;
      enemy.accentMaterial = null;
      enemy.visorMaterial = null;
      enemy.skinMaterial = null;
      enemy.hairMaterial = null;
      enemies.splice(idx,1);
      delete enemy.__suppressLoot;
      delete enemy.__suppressRoundCheck;
      const now = performance.now();
      game.score += 10;
      ui.scoreEl && (ui.scoreEl.textContent = `Skor: ${game.score}`);
      const headshot = now - playerState.lastKillTime < CONFIG.ECONOMY.streakWindow && playerState.headshotStreak > 1;
      let reward = CONFIG.ECONOMY.baseKill;
      if(headshot) reward += CONFIG.ECONOMY.headshotBonus;
      if(playerState.headshotStreak >= 3) reward += CONFIG.ECONOMY.streakBonus;
      player.credits = (player.credits || 0) + reward;
      updateCredits();
      updateCreditLine();
      game.enemiesRemaining = Math.max(0, game.enemiesRemaining - 1);
      updateEnemiesHud();
      if(!skipRoundCheck){
        maybeEndRound();
      }
    }
  }

  function disposeTexture(tex){
    if(!tex || typeof tex !== 'object' || !tex.isTexture) return;
    if(sharedTextures.has(tex)) return;
    if(tex.image && (Number.isFinite(tex.image.width) || Number.isFinite(tex.image.height))){
      tex.dispose?.();
      return;
    }
    if(tex.source && tex.source.data){
      tex.dispose?.();
      return;
    }
    tex.dispose?.();
  }

  function disposeMaterial(mat){
    if(!mat) return;
    if(Array.isArray(mat)){
      for(let i=0;i<mat.length;i++){
        disposeMaterial(mat[i]);
      }
      return;
    }
    for(let i=0;i<MATERIAL_TEXTURE_PROPS.length;i++){
      const prop = MATERIAL_TEXTURE_PROPS[i];
      const tex = mat[prop];
      if(!tex || typeof tex !== 'object' || !tex.isTexture) continue;
      if(sharedTextures.has(tex)) continue;
      disposeTexture(tex);
      if(mat[prop] === tex){
        mat[prop] = null;
      }
    }
    mat.dispose?.();
  }

  const removeEnemyLocal = patchedRemoveEnemy;

  function patchedDamagePlayer(amount){
    if(playerState.armorCharges > 0){
      amount *= (1 - CONFIG.WEAPONS.armorReduction);
      playerState.armorCharges -= 1;
      updateArmorBadge();
    }
    playerState.staminaCombatDelay = CONFIG.STAMINA.regenDelayAfterDamage;
    if(originalDamagePlayer) originalDamagePlayer(amount);
  }

  // ---------------------------------------------------------------------------
  // UI / MINIMAP
  // ---------------------------------------------------------------------------
  const minimapState = shared.minimapState || (shared.minimapState = {
    lastYaw: null,
    lastPlayerX: null,
    lastPlayerZ: null,
    lastEnemyCount: 0,
    lastUpdate: 0
  });

  function patchedUpdateMinimap(){
    if(!minimapCtx) return;
    const now = performance.now();
    const playerPos = controls.getObject().position;
    const forward3 = tempVecF.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward3.y = 0;
    if(forward3.lengthSq() < 1e-6){
      forward3.set(0, 0, -1);
    }
    forward3.normalize();
    const forward2 = tempVec2A.set(forward3.x, forward3.z);
    if(forward2.lengthSq() < 1e-6){
      forward2.set(0, -1);
    } else {
      forward2.normalize();
    }
    const heading = Math.atan2(forward2.x, forward2.y);
    const yawDiff = minimapState.lastYaw === null ? Infinity : Math.abs(shortestAngleDiff(heading, minimapState.lastYaw));
    const posDiff = minimapState.lastPlayerX === null ? Infinity : Math.abs(playerPos.x - minimapState.lastPlayerX) + Math.abs(playerPos.z - minimapState.lastPlayerZ);
    const enemyCount = enemies.length;
    const timeDiff = now - minimapState.lastUpdate;
    const shouldUpdate = timeDiff > 120 || yawDiff > 0.01 || posDiff > 0.05 || enemyCount !== minimapState.lastEnemyCount;
    if(!shouldUpdate) return;

    minimapState.lastYaw = heading;
    minimapState.lastPlayerX = playerPos.x;
    minimapState.lastPlayerZ = playerPos.z;
    minimapState.lastEnemyCount = enemyCount;
    minimapState.lastUpdate = now;

    const canvas = minimapCtx.canvas;
    const size = canvas.width;
    const mapSize = Math.max(1, world.size || 60);
    const scale = size / mapSize;
    const center = size * 0.5;

    minimapCtx.clearRect(0, 0, size, size);
    minimapCtx.fillStyle = 'rgba(10,18,28,.9)';
    minimapCtx.fillRect(0, 0, size, size);
    minimapCtx.strokeStyle = 'rgba(255,255,255,.15)';
    minimapCtx.strokeRect(2, 2, size - 4, size - 4);

    if(Array.isArray(world.obstacles)){
      minimapCtx.fillStyle = 'rgba(255,255,255,.08)';
      for(let i = 0; i < world.obstacles.length; i++){
        const obstacle = world.obstacles[i];
        if(!obstacle) continue;
        tempBox.setFromObject(obstacle);
        const oc = tempBox.getCenter(tempVecA);
        const os = tempBox.getSize(tempVecB);
        minimapCtx.fillRect(
          center + oc.x * scale - (os.x * scale) / 2,
          center + oc.z * scale - (os.z * scale) / 2,
          Math.max(2, os.x * scale),
          Math.max(2, os.z * scale)
        );
      }
    }

    if(Array.isArray(PATCH_STATE.enemySpawnZones) && PATCH_STATE.enemySpawnZones.length){
      minimapCtx.strokeStyle = 'rgba(255,92,59,.25)';
      minimapCtx.lineWidth = 1;
      for(let i = 0; i < PATCH_STATE.enemySpawnZones.length; i++){
        const zone = PATCH_STATE.enemySpawnZones[i];
        const zx = center + zone.center.x * scale;
        const zy = center + zone.center.z * scale;
        minimapCtx.beginPath();
        minimapCtx.arc(zx, zy, Math.max(4, (zone.radius || 0) * scale), 0, Math.PI * 2);
        minimapCtx.stroke();
      }
      minimapCtx.lineWidth = 1;
    }

    const px = center + playerPos.x * scale;
    const py = center + playerPos.z * scale;
    minimapCtx.fillStyle = '#50c8ff';
    minimapCtx.beginPath();
    minimapCtx.arc(px, py, 6, 0, Math.PI * 2);
    minimapCtx.fill();

    if(PATCH_STATE.playerSpawn){
      const sx = center + PATCH_STATE.playerSpawn.x * scale;
      const sy = center + PATCH_STATE.playerSpawn.z * scale;
      minimapCtx.fillStyle = 'rgba(80,200,255,.35)';
      minimapCtx.fillRect(sx - 3, sy - 3, 6, 6);
    }

    const halfFov = THREE.MathUtils.degToRad(camera.fov || CONFIG.STANCE.baseFov) * 0.5;
    const leftVec = rotateVec2(tempVec2B, forward2, -halfFov);
    const rightVec = rotateVec2(tempVec2C, forward2, halfFov);
    const coneLength = Math.min(size * 0.35, 32);
    minimapCtx.beginPath();
    minimapCtx.moveTo(px, py);
    minimapCtx.lineTo(px + leftVec.x * coneLength, py + leftVec.y * coneLength);
    minimapCtx.lineTo(px + rightVec.x * coneLength, py + rightVec.y * coneLength);
    minimapCtx.closePath();
    minimapCtx.fillStyle = 'rgba(80,200,255,.2)';
    minimapCtx.fill();

    minimapCtx.strokeStyle = 'rgba(80,200,255,.55)';
    minimapCtx.beginPath();
    minimapCtx.moveTo(px, py);
    minimapCtx.lineTo(px + forward2.x * coneLength, py + forward2.y * coneLength);
    minimapCtx.stroke();

    minimapCtx.fillStyle = '#ff5c3b';
    for(let i = 0; i < enemyCount; i++){
      const enemy = enemies[i];
      if(!enemy?.mesh) continue;
      const ex = center + enemy.mesh.position.x * scale;
      const ez = center + enemy.mesh.position.z * scale;
      minimapCtx.beginPath();
      minimapCtx.arc(ex, ez, 5, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    minimapCtx.fillStyle = '#9ad0ff';
    for(let i = 0; i < coverPoints.length; i++){
      const c = coverPoints[i];
      const cx = center + c.position.x * scale;
      const cz = center + c.position.z * scale;
      minimapCtx.beginPath();
      minimapCtx.arc(cx, cz, 3, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    if(ui.minimapTexture){
      safeFlagTexture(ui.minimapTexture);
    }
  }

  function rotateVec2(target, source, angle){
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const x = source.x;
    const y = source.y;
    target.set(x * c - y * s, x * s + y * c);
    return target;
  }

  function setupCoverPoints(){
    coverPoints.length = 0;
    if(!Array.isArray(world.obstacles)) return;
    world.obstacles.forEach(ob => {
      tempBox.setFromObject(ob);
      const center = tempBox.getCenter(tempVecA);
      const size = tempBox.getSize(tempVecB);
      coverPoints.push({ position: center.clone().add(new THREE.Vector3(size.x * 0.5 + 0.6, 0, 0)) });
      coverPoints.push({ position: center.clone().add(new THREE.Vector3(-size.x * 0.5 - 0.6, 0, 0)) });
      coverPoints.push({ position: center.clone().add(new THREE.Vector3(0, 0, size.z * 0.5 + 0.6)) });
      coverPoints.push({ position: center.clone().add(new THREE.Vector3(0, 0, -size.z * 0.5 - 0.6)) });
      ob.userData.ricochet = size.length() > 6;
    });
  }

  function setupStaminaIcon(){
    if(!ui.ammoEl || !ui.hud) return;
    if(ui.hud.querySelector('#staminaIcon')){
      playerState.staminaIcon = ui.hud.querySelector('#staminaIcon');
      playerState.staminaFill = playerState.staminaIcon.firstElementChild;
      return;
    }
    const icon = document.createElement('div');
    icon.id = 'staminaIcon';
    icon.style.position = 'absolute';
    icon.style.right = '32px';
    icon.style.bottom = '72px';
    icon.style.width = '120px';
    icon.style.height = '8px';
    icon.style.border = '1px solid rgba(255,255,255,.3)';
    icon.style.borderRadius = '999px';
    icon.style.overflow = 'hidden';
    icon.style.opacity = '0';
    icon.style.transition = 'opacity .3s ease';
    const fill = document.createElement('span');
    fill.style.display = 'block';
    fill.style.height = '100%';
    fill.style.width = '100%';
    fill.style.background = 'linear-gradient(90deg,#ffe66d,#ff8a3b)';
    icon.appendChild(fill);
    ui.hud.appendChild(icon);
    playerState.staminaIcon = icon;
    playerState.staminaFill = fill;
  }

  function updateStaminaIcon(){
    if(!playerState.staminaIcon) return;
    const visible = playerState.staminaVisible || playerState.stamina < CONFIG.STAMINA.max;
    playerState.staminaIcon.style.opacity = visible ? '1' : '0';
    playerState.staminaFill.style.width = `${(playerState.stamina/CONFIG.STAMINA.max)*100}%`;
  }

  function updateArmorBadge(){
    if(!ui.hud) return;
    if(!ui.armorBadge){
      ui.armorBadge = ui.hud.querySelector('#armorBadge');
    }
    if(!ui.armorBadge){
      const badge = document.createElement('div');
      badge.id = 'armorBadge';
      badge.style.position = 'absolute';
      badge.style.left = '32px';
      badge.style.bottom = '72px';
      badge.style.padding = '6px 10px';
      badge.style.border = '1px solid rgba(255,255,255,.3)';
      badge.style.borderRadius = '8px';
      badge.style.fontSize = '14px';
      badge.style.background = 'rgba(0,0,0,.4)';
      ui.hud.appendChild(badge);
      ui.armorBadge = badge;
    }
    ui.armorBadge.textContent = playerState.armorCharges > 0 ? `Armor: ${playerState.armorCharges}` : '';
  }

  function updateCredits(){
    if(ui.creditsEl){
      ui.creditsEl.textContent = `₺ ${player.credits}`;
    }
  }

  function updateCreditLine(){
    if(ui.pickupBannerEl){
      ui.pickupBannerEl.textContent = `Credits: ₺${player.credits}`;
    }
  }

  function updateEnemiesHud(){
    if(ui.enemiesEl){
      let text = `Hayatta Kalan Düşman: ${Math.max(game.enemiesRemaining,0)}`;
      if(game.roundPhaseLabel){
        text += ` | Faz: ${game.roundPhaseLabel.toUpperCase()}`;
        if(typeof game.phaseQueue === 'number' && game.phaseQueue > 0){
          text += ` (${game.phaseQueue} takviye)`;
        }
      }
      ui.enemiesEl.textContent = text;
    }
  }

  // ---------------------------------------------------------------------------
  // PERF
  // ---------------------------------------------------------------------------
  const loopState = {
    lastTime: performance.now(),
    accumulator: 0,
    rafId: null,
    paused: false,
  };

  function fixedStepFrame(now){
    loopState.rafId = requestAnimationFrame(fixedStepFrame);
    const delta = Math.min(0.05, clock.getDelta());
    if(loopState.paused){
      loopState.lastTime = now;
      loopState.accumulator = 0;
      renderScene(0);
      return;
    }
    loopState.accumulator = Math.min(loopState.accumulator + delta, CONFIG.PERF.maxAccumulator);
    while(loopState.accumulator >= CONFIG.PERF.fixedStep){
      simulate(CONFIG.PERF.fixedStep);
      loopState.accumulator -= CONFIG.PERF.fixedStep;
    }
    const alpha = loopState.accumulator / CONFIG.PERF.fixedStep;
    renderScene(alpha);
  }

  function simulate(dt){
    PATCH_STATE.frameId = (PATCH_STATE.frameId || 0) + 1;
    enforceLookConsistency();
    const now = performance.now();
    player.fireCooldown = Math.max(0, (fireState.nextFireTime - now) / 1000);
    if(getShooting()){
      attemptFire(now);
    } else if(playerState.semiAuto){
      playerState.semiAutoReady = true;
    }

    if(game.state !== 'over'){
      patchedUpdatePlayer(dt);
      if(game.state !== 'buyPhase' && !playerState.storeOpen){
        patchedUpdateEnemies(dt);
      }
      if(functions.updateLoot) functions.updateLoot(dt);
      patchedUpdateMinimap();
      handleSpawning(dt);
      updateBuyPhase(dt);
    }
    updateProjectiles(dt);
    updateTracers(dt);
    updateImpacts(dt);
  }

  function renderScene(alpha){
    if(CONFIG.PERF.debugOverlay && PATCH_STATE.debug && perfOverlay){
      perfOverlay.textContent = `activeTracers:${activeTracers.length} pool:${tracerPool.length}`;
    }
    renderer.render(scene, camera);
  }

  function startLoop(){
    globalNS.stopLoop?.();
    loopState.rafId = requestAnimationFrame(fixedStepFrame);
  }

  function pauseLoop(){
    loopState.paused = true;
  }
  function resumeLoop(){
    if(playerState.manualPause || playerState.storePausedLoop){
      return;
    }
    loopState.paused = false;
    loopState.accumulator = 0;
    loopState.lastTime = performance.now();
  }

  globalNS.stopLoop = () => {
    if(loopState.rafId !== null){
      cancelAnimationFrame(loopState.rafId);
      loopState.rafId = null;
    }
  };

  perfOverlay = CONFIG.PERF.debugOverlay ? createPerfOverlay() : null;

  function createPerfOverlay(){
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '12px';
    el.style.top = '12px';
    el.style.padding = '6px 10px';
    el.style.background = 'rgba(0,0,0,.6)';
    el.style.color = '#fff';
    el.style.fontSize = '12px';
    el.style.zIndex = '1000';
    el.style.display = 'none';
    ui.hud?.appendChild(el);
    return el;
  }

  function handleContextLost(e){
    e.preventDefault();
    pauseLoop();
    showContextOverlay(true);
  }
  function handleContextRestored(){
    showContextOverlay(false);
    resumeLoop();
  }

  function showContextOverlay(show){
    if(!ui.contextOverlay){
      const overlay = document.createElement('div');
      overlay.textContent = 'WebGL context lost. Please wait...';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.display = 'grid';
      overlay.style.placeItems = 'center';
      overlay.style.background = 'rgba(0,0,0,.8)';
      overlay.style.fontSize = '24px';
      overlay.style.color = '#fff';
      overlay.style.zIndex = '999';
      overlay.style.display = 'none';
      ui.hud?.appendChild(overlay);
      ui.contextOverlay = overlay;
    }
    ui.contextOverlay.style.display = show ? 'grid' : 'none';
  }

  function ensurePauseOverlay(){
    if(!ui.pauseOverlay){
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.display = 'grid';
      overlay.style.placeItems = 'center';
      overlay.style.background = 'rgba(0,0,0,.65)';
      overlay.style.fontSize = '28px';
      overlay.style.fontWeight = '600';
      overlay.style.color = '#fff';
      overlay.style.letterSpacing = '0.06em';
      overlay.style.textAlign = 'center';
      overlay.style.zIndex = '998';
      overlay.style.display = 'none';
      overlay.style.whiteSpace = 'pre-line';
      overlay.textContent = 'Duraklatıldı\nESC ile devam et';
      ui.hud?.appendChild(overlay);
      ui.pauseOverlay = overlay;
    }
  }

  function setPauseOverlay(show){
    ensurePauseOverlay();
    if(ui.pauseOverlay){
      ui.pauseOverlay.style.display = show ? 'grid' : 'none';
    }
  }

  if(renderer.domElement && !globalNS.contextBound){
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false);
    globalNS.contextBound = true;
  }

  // ---------------------------------------------------------------------------
  // INPUT
  // ---------------------------------------------------------------------------
  const boundFlags = { input:false };
  globalNS.boundFlags = boundFlags;

  function setManualPauseState(paused){
    if(paused){
      if(playerState.manualPause) return;
      playerState.manualPause = true;
      setShooting(false);
      setAiming(false);
      pauseLoop();
      setPauseOverlay(true);
      controls.unlock?.();
    } else {
      if(!playerState.manualPause) return;
      playerState.manualPause = false;
      setPauseOverlay(false);
      resumeLoop();
      if(!playerState.storeOpen && controls.lock && document.pointerLockElement !== renderer.domElement){
        try{
          controls.lock();
        }catch(err){
          console.warn('[patch-001] Failed to re-lock pointer on resume.', err);
        }
      }
    }
  }

  function toggleManualPause(){
    setManualPauseState(!playerState.manualPause);
  }

  if(!boundFlags.input){
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    boundFlags.input = true;
  }

  function onKeyDown(e){
    if(e.code === 'ControlLeft' || e.code === 'ControlRight'){
      if(!e.repeat) toggleCrouch();
    }
    if(e.code === 'KeyB' && !e.repeat){
      playerState.semiAuto = !playerState.semiAuto;
      showModeBanner(playerState.semiAuto ? 'Semi-auto mode' : 'Full-auto mode');
    }
    if(e.code === 'KeyM'){
      e.preventDefault();
      if(playerState.storeOpen) closeStore();
      else openStore(false);
    }
    if(e.code === 'Escape'){
      if(playerState.storeOpen){
        closeStore();
      } else {
        e.preventDefault();
        toggleManualPause();
      }
    }
  }

  function onKeyUp(e){
    if(e.code === 'ControlLeft' || e.code === 'ControlRight'){ /* handled */ }
  }

  function showModeBanner(text){
    if(!ui.pickupBannerEl) return;
    ui.pickupBannerEl.textContent = text;
    ui.pickupBannerEl.classList.add('show-pickup');
    setTimeout(()=>ui.pickupBannerEl.classList.remove('show-pickup'), 1200);
  }

  // ---------------------------------------------------------------------------
  // STORE HOOKS
  // ---------------------------------------------------------------------------
  const originalOpenStore = functions.openStore || ctx.openStore;
  const originalCloseStore = functions.closeStore || ctx.closeStore;
  const originalBindings = {
    updatePlayer: originalUpdatePlayer,
    hitscanShoot: originalHitscanShoot,
    enemyHitscanShoot: originalEnemyHitscanShoot,
    spawnEnemy: originalSpawnEnemy,
    updateEnemies: originalUpdateEnemies,
    moveTowards: originalMoveTowards,
    updateMinimap: originalUpdateMinimap,
    startNextRound: originalStartNextRound,
    removeEnemy: originalRemoveEnemy,
    damagePlayer: originalDamagePlayer,
    showRoundBanner: originalShowRoundBanner,
    animate: originalAnimate,
    openStore: originalOpenStore,
    closeStore: originalCloseStore,
  };

  function openStore(fromBuyPhase){
    playerState.storeOpen = true;
    const shouldPause = !fromBuyPhase;
    playerState.storePausedLoop = shouldPause;
    if(shouldPause){
      pauseLoop();
    }
    if(originalOpenStore) originalOpenStore(fromBuyPhase);
  }
  function closeStore(){
    const wasPaused = playerState.storePausedLoop;
    playerState.storePausedLoop = false;
    playerState.storeOpen = false;
    if(originalCloseStore) originalCloseStore();
    if(wasPaused && !playerState.manualPause){
      resumeLoop();
    }
  }

  function showBuyBanner(){
    if(functions.showBuyBanner) functions.showBuyBanner();
  }
  function hideBuyBanner(){
    if(functions.hideBuyBanner) functions.hideBuyBanner();
  }
  function updateBuyBanner(){
    if(functions.updateBuyBanner) functions.updateBuyBanner(game.buyTimer);
  }

  functions.openStore = openStore;
  functions.closeStore = closeStore;

  // ---------------------------------------------------------------------------
  // BINDINGS
  // ---------------------------------------------------------------------------
  setupCoverPoints();
  setupStaminaIcon();

  functions.updatePlayer = patchedUpdatePlayer;
  functions.hitscanShoot = patchedHitscanShoot;
  functions.enemyHitscanShoot = patchedEnemyHitscanShoot;
  functions.reloadWeapon = beginReload;
  functions.spawnEnemy = patchedSpawnEnemy;
  functions.updateEnemies = patchedUpdateEnemies;
  functions.moveTowards = moveTowards;
  functions.updateMinimap = patchedUpdateMinimap;
  functions.startNextRound = patchedStartNextRound;
  functions.removeEnemy = patchedRemoveEnemy;
  functions.damagePlayer = patchedDamagePlayer;
  functions.showRoundBanner = patchedShowRoundBanner;

  retrofitExistingEnemies();

  functions.animate = () => {};
  if((game.state === undefined || game.state === null || game.state === 'waiting') && (game.spawnQueue ?? 0) <= 0 && enemies.length === 0){
    patchedStartNextRound();
  }
  startLoop();

  PATCH_STATE.CONFIG = CONFIG;
  globalNS.state = { CONFIG, playerState, fireState, enemySpawnZones: PATCH_STATE.enemySpawnZones, playerSpawn: PATCH_STATE.playerSpawn };

  updateEnemiesHud();
  updateArmorBadge();

  globalNS.dispose = () => {
    try{
      if(typeof globalNS.stopLoop === 'function'){
        globalNS.stopLoop();
      }
    }catch(err){
      console.warn('[patch-001] Failed to stop loop during dispose.', err);
    }

    PATCH_STATE.enemyProfileSummary = {
      count: 0,
      totalAggression: 0,
      totalAccuracy: 0,
      totalResilience: 0,
    };
    PATCH_STATE.playerFireDelay = null;
    playerState.fireTempo = CONFIG.WEAPONS.fireRate;
    while(activeProjectiles.length){
      const proj = activeProjectiles.pop();
      projectilePool.push(proj);
    }
    if(Array.isArray(enemies)){
      for(const enemy of enemies){
        if(enemy) enemy.__profileRegistered = false;
      }
    }

    if(globalNS.lights){
      for(const light of globalNS.lights){
        if(light && light.parent){
          light.parent.remove(light);
        }
      }
      globalNS.lights = null;
    }

    if(boundFlags.input){
      document.removeEventListener('keydown', onKeyDown, false);
      document.removeEventListener('keyup', onKeyUp, false);
      boundFlags.input = false;
    }

    if(renderer.domElement && globalNS.contextBound){
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost, false);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored, false);
      globalNS.contextBound = false;
    }

    if(renderer.shadowMap){
      renderer.shadowMap.enabled = originalShadowEnabled;
    }

    if(PATCH_STATE.enemyGeometry){
      PATCH_STATE.enemyGeometry.dispose?.();
      PATCH_STATE.enemyGeometry = null;
    }

    if(perfOverlay && typeof perfOverlay.remove === 'function'){
      perfOverlay.remove();
      perfOverlay = null;
    }

    if(ui.contextOverlay){
      if(typeof ui.contextOverlay.remove === 'function'){
        ui.contextOverlay.remove();
      }
      delete ui.contextOverlay;
    }

    if(ui.pauseOverlay){
      if(typeof ui.pauseOverlay.remove === 'function'){
        ui.pauseOverlay.remove();
      }
      delete ui.pauseOverlay;
    }

    playerState.manualPause = false;

    if(Array.isArray(PATCH_STATE.weaponParts)){
      for(const part of PATCH_STATE.weaponParts){
        if(!part) continue;
        part.parent?.remove(part);
        part.geometry?.dispose?.();
        if(part.material){
          if(Array.isArray(part.material)){
            part.material.forEach(disposeMaterial);
          } else {
            disposeMaterial(part.material);
          }
        }
      }
      PATCH_STATE.weaponParts = null;
    }

    if(PATCH_STATE.muzzleAnchor){
      const anchor = PATCH_STATE.muzzleAnchor;
      if(ctx.muzzleFlash && ctx.muzzleFlash.parent === anchor && anchor.parent){
        anchor.parent.add(ctx.muzzleFlash);
        ctx.muzzleFlash.position.copy(anchor.position);
      }
      anchor.parent?.remove(anchor);
      PATCH_STATE.muzzleAnchor = null;
      ctx.muzzleAnchor = null;
    }

    PATCH_STATE.enemySpawnZones = null;
    PATCH_STATE.playerSpawn = null;

    for(const [key, value] of Object.entries(originalBindings)){
      if(value !== undefined && value !== null){
        functions[key] = value;
      } else {
        delete functions[key];
      }
    }

    PATCH_STATE.debug = false;

    globalNS.boundFlags = { input:false };
    globalNS.state = null;
    globalNS.stopLoop = undefined;
    globalNS.dispose = undefined;
    globalNS.applied = false;
  };

  globalNS.applied = true;

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  function maybeDropLoot(position){
    if(functions.maybeDropLoot) functions.maybeDropLoot(position);
  }

  function updateAmmoDisplay(){
    if(functions.updateAmmoDisplay) functions.updateAmmoDisplay();
  }
}
