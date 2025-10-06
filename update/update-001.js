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
      falloffStart: 25,
      falloffEnd: 70,
      falloffMin: 0.6,
      penetrationThickness: 0.8,
      penetrationDamageScale: 0.55,
      ricochetAngle: THREE.MathUtils.degToRad(20),
      ricochetChance: 0.45,
      ricochetDamageScale: 0.35,
      ricochetRange: 22,
      armorReduction: 0.25,
      semiAutoSpreadFactor: 0.82,
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
    enemyGeometry: null,
    spawnFailureStreak: 0,
    lastSpawnFailureAt: 0,
    frameId: 0,
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

  const ENEMY_RADIUS = 0.6;
  const ENEMY_HEIGHT = 2.4;
  const ENEMY_HALF_HEIGHT = ENEMY_HEIGHT * 0.5;

  function applySharedEnemyTexture(material){
    if(!material || !baseEnemyTexture) return material;
    const previous = material.map;
    if(previous && previous !== baseEnemyTexture && typeof previous.dispose === 'function' && !sharedTextures.has(previous)){
      try{
        previous.dispose();
      }catch(err){
        console.warn('[patch-001] Failed to dispose previous enemy material map.', err);
      }
    }
    material.map = baseEnemyTexture;
    material.needsUpdate = true;
    return material;
  }

  function createDefaultEnemyMaterial(){
    const material = new THREE.MeshStandardMaterial({ color:0x223344 });
    return applySharedEnemyTexture(material);
  }

  function instantiateEnemyMaterial(){
    const template = ctx.enemyMaterialTemplate;
    if(!template){
      return createDefaultEnemyMaterial();
    }

    if(Array.isArray(template)){
      const materials = [];
      for(let i=0;i<template.length;i++){
        const src = template[i];
        let clone = null;
        if(src && typeof src.clone === 'function'){
          try{
            clone = src.clone();
          }catch(err){
            console.warn('[patch-001] Failed to clone enemy material template entry.', err);
            clone = null;
          }
        }
        if((!clone || clone === src) && src && src.isMaterial){
          try{
            clone = new src.constructor();
            if(clone && clone.copy){
              clone.copy(src);
            }
          }catch(err){
            console.warn('[patch-001] Failed to copy enemy material template entry.', err);
            clone = null;
          }
        }
        if(!clone || clone === src){
          clone = createDefaultEnemyMaterial();
        } else {
          applySharedEnemyTexture(clone);
        }
        materials.push(clone);
      }
      return materials;
    }

    let clone = null;
    if(template && typeof template.clone === 'function'){
      try{
        clone = template.clone();
      }catch(err){
        console.warn('[patch-001] Failed to clone enemy material template.', err);
        clone = null;
      }
    }
    if((!clone || clone === template) && template && template.isMaterial){
      try{
        clone = new template.constructor();
        if(clone && clone.copy){
          clone.copy(template);
        }
      }catch(err){
        console.warn('[patch-001] Failed to copy enemy material template.', err);
        clone = null;
      }
    }
    if(!clone || clone === template){
      clone = createDefaultEnemyMaterial();
    } else {
      applySharedEnemyTexture(clone);
    }
    return clone;
  }

  function ensureEnemyGeometry(){
    if(PATCH_STATE.enemyGeometry){
      return PATCH_STATE.enemyGeometry;
    }

    const cylinderHeight = Math.max(0, ENEMY_HEIGHT - ENEMY_RADIUS * 2);
    const radialSegments = 12;
    const heightSegments = 6;

    let geometry = null;

    const tryBuild = (builder, label) => {
      if(geometry || typeof builder !== 'function'){
        return;
      }
      try{
        geometry = new builder(ENEMY_RADIUS, cylinderHeight, heightSegments, radialSegments);
      }catch(err){
        console.warn(`[patch-001] Failed to create ${label} enemy geometry.`, err);
        geometry = null;
      }
    };

    tryBuild(THREE.CapsuleGeometry, 'CapsuleGeometry');
    tryBuild(THREE.CapsuleBufferGeometry, 'CapsuleBufferGeometry');

    if(!geometry){
      try{
        geometry = new THREE.CylinderGeometry(ENEMY_RADIUS, ENEMY_RADIUS, Math.max(ENEMY_HEIGHT, ENEMY_RADIUS * 2), radialSegments, 1, false);
        if(!PATCH_STATE.enemyGeometryFallbackLogged){
          PATCH_STATE.enemyGeometryFallbackLogged = true;
          console.warn('[patch-001] Falling back to cylinder enemy geometry; capsule geometry unavailable.');
        }
      }catch(err){
        console.error('[patch-001] Failed to create fallback enemy geometry.', err);
        geometry = null;
      }
    }

    if(geometry){
      geometry.computeBoundingBox?.();
      geometry.computeBoundingSphere?.();
      PATCH_STATE.enemyGeometry = geometry;
    }

    return geometry;
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

  ensureWeaponModel();
  ensureMuzzleAnchor();

  PATCH_STATE.playerSpawn = (PATCH_STATE.playerSpawn || new THREE.Vector3()).copy(controls.getObject().position);
  refreshWorldBounds();
  PATCH_STATE.enemySpawnZones = buildEnemySpawnZones();

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

  function spawnTracer(start, end){
    const tracer = tracerPool.pop() || createTracer();
    const posAttr = tracer.geometry.getAttribute('position');
    posAttr.setXYZ(0, start.x, start.y, start.z);
    posAttr.setXYZ(1, end.x, end.y, end.z);
    posAttr.needsUpdate = true;
    tracer.visible = true;
    tracer.userData.life = CONFIG.PERF.tracerLifetime;
    tracer.userData.fade = CONFIG.PERF.tracerLifetime;
    activeTracers.push(tracer);
    if(!tracer.parent){
      scene.add(tracer);
    }
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
      if(enemies[i].mesh) enemyMeshScratch.push(enemies[i].mesh);
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
    if(ads){
      const base = weaponState.baseAds;
      return playerState.crouched ? base * (CONFIG.PLAYER.crouchSpreadMultiplier * 0.85) : base;
    }
    const base = weaponState.baseHip;
    return playerState.crouched ? base * CONFIG.PLAYER.crouchSpreadMultiplier : base;
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
  function attemptFire(now){
    if(!player.alive || player.isReloading || player.ammo <= 0 || playerState.storeOpen) return false;
    if(playerState.semiAuto && !playerState.semiAutoReady) return false;
    if(now < fireState.nextFireTime) return false;

    performShot(now);

    const delaySec = playerState.semiAuto ? CONFIG.WEAPONS.semiAutoDelay : CONFIG.WEAPONS.fireRate;
    fireState.nextFireTime = now + delaySec * 1000;
    player.fireCooldown = delaySec;
    playerState.lastShotTime = now;
    if(playerState.semiAuto){
      playerState.semiAutoReady = false;
    }
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

    const origin = borrowVec3();
    camera.getWorldPosition(origin);
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

    const staticObjs = gatherStaticMeshes();
    const enemyMeshes = gatherEnemyMeshes();
    tempRaycaster.set(origin, tempVecA);
    const intersects = tempRaycaster.intersectObjects(composeRaycastList(enemyMeshes, staticObjs), false);

    let hitPoint = borrowVec3().copy(origin).addScaledVector(tempVecA, 200);
    let damageWasHeadshot = false;
    let inflictedDamage = 0;

    if(intersects.length){
      const first = intersects[0];
      hitPoint.copy(first.point);
      if(enemyMeshes.includes(first.object)){
          const enemy = enemies.find(en => en.mesh === first.object);
        if(enemy){
          const localY = first.point.y - enemy.mesh.position.y;
          let dmg = computeBaseDamage(localY);
          dmg *= applyDamageFalloff(origin.distanceTo(hitPoint));
          inflictedDamage = dmg;
          enemy.health -= dmg;
          damageWasHeadshot = localY >= 1.0;
          enemy.brain = enemy.brain || createEnemyBrain(enemy.spawnZone);
          enemy.brain.lastHitAt = now;
          enemy.suppressedUntil = now + CONFIG.AI.suppressedTime * 1000;
          if(enemy.health <= 0){ removeEnemyLocal(enemy); }
          else if(enemy.mesh?.material?.emissive){
            enemy.mesh.material.emissive.setHex(0xff3333);
            setTimeout(()=>{ if(enemy.mesh) enemy.mesh.material.emissive.setHex(0x050b14); }, 90);
          }
        }
      } else {
        handleRicochetOrPenetration(first, origin, tempVecA, enemyMeshes, staticObjs, inflictedDamage);
      }
    }

    spawnTracer(muzzlePos, hitPoint);
    if(functions.crosshairBloom) functions.crosshairBloom();
    if(functions.screenShake) functions.screenShake(damageWasHeadshot ? 0.02 : 0.01, 0.06);
    if(functions.showHitmarker) functions.showHitmarker();

    player.ammo -= 1;
    updateAmmoDisplay();

    weaponState.spreadCurrent = Math.min(stanceMax, weaponState.spreadCurrent + (ads ? 0.08 : 0.18) * (playerState.semiAuto ? CONFIG.WEAPONS.semiAutoSpreadFactor : 1));

    if(functions.noteGunshotNoise) functions.noteGunshotNoise();

    releaseVec3(origin);
    releaseVec3(muzzlePos);
    releaseVec3(hitPoint);
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
              const enemy = enemies.find(en => en.mesh === hit.object);
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
          const enemy = enemies.find(en => en.mesh === nh.object);
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
    const bodyGeometry = ensureEnemyGeometry();
    if(!bodyGeometry){
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
    const enemyMaterial = instantiateEnemyMaterial();
    const enemyMesh = new THREE.Mesh(bodyGeometry, enemyMaterial);
    enemyMesh.position.set(spawnPoint.x, spawnHeight + ENEMY_HALF_HEIGHT, spawnPoint.z);
    enemyMesh.castShadow = enemyMesh.receiveShadow = true;
    scene.add(enemyMesh);

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

    const enemy = {
      mesh: enemyMesh,
      health: baseHealth,
      maxHealth: baseHealth,
      state: 'patrol',
      chaseSpeed: movementConfig.enemyChase,
      patrolSpeed: movementConfig.enemyPatrol,
      fireCooldown: initialFireDelay,
      burstShotsLeft: 0,
      aimSpread: p.aimSpread,
      suppressedUntil: 0,
      brain: createEnemyBrain(chosenZone),
      groundHeight: spawnHeight,
    };
    enemy.spawnZone = chosenZone || null;
    enemyMesh.userData.enemy = enemy;
    enemies.push(enemy);
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

  function createEnemyBrain(zone){
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
      wanderTarget: new THREE.Vector3(),
      nextWanderAt: 0,
      coverTarget: new THREE.Vector3(),
      hasCoverTarget: false,
      lastKnownPlayerPos: new THREE.Vector3(),
      lastHitAt: -Infinity,
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
      const brain = enemy.brain || (enemy.brain = createEnemyBrain(enemy.spawnZone));
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

      const suppressed = enemy.suppressedUntil > now;
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - delta);
      if(hasLine){
        brain.lastKnownPlayerPos.copy(playerPos);
        brain.lastKnownPlayerPos.y = desiredEnemyCenterY(enemy);
      }

      switch(brain.state){
        case 'patrol': {
          const zone = enemy.spawnZone;
          if(
            now >= brain.nextWanderAt ||
            !isFinite(brain.wanderTarget.x) ||
            brain.wanderTarget.distanceToSquared(mesh.position) < 0.5
          ){
            const center = zone?.center || mesh.position;
            const radius = zone ? Math.max(1.5, (zone.radius || 6) * 0.6) : 6;
            const wanderAngle = Math.random() * Math.PI * 2;
            const wanderDist = Math.sqrt(Math.random()) * radius;
            brain.wanderTarget.set(
              center.x + Math.cos(wanderAngle) * wanderDist,
              desiredEnemyCenterY(enemy),
              center.z + Math.sin(wanderAngle) * wanderDist
            );
            brain.nextWanderAt = now + THREE.MathUtils.randFloat(900, 1600);
          }
          brain.hasCoverTarget = false;
          moveEnemyTowards(enemy, brain.wanderTarget, Math.max(enemy.patrolSpeed * 0.75, 0.5), delta, statics);
          mesh.lookAt(playerPos.x, mesh.position.y, playerPos.z);
          if((hasLine && distance < CONFIG.STIM.focusRadius * 1.6) || suppressed){
            brain.state = 'attack';
            brain.strafeUntil = now + THREE.MathUtils.randFloat(500, 1400);
          }
          break;
        }
        case 'attack': {
          mesh.lookAt(playerPos.x, mesh.position.y, playerPos.z);
          if(now > brain.strafeUntil){
            brain.strafeDir = Math.random() < 0.5 ? -1 : 1;
            brain.strafeUntil = now + THREE.MathUtils.randFloat(600, 1400);
          }
          brain.hasCoverTarget = false;
          tempVecF.set(0, 0, 0);
          if(distance > CONFIG.STIM.focusRadius * 1.1){
            tempVecF.addScaledVector(toPlayerDir, enemy.chaseSpeed * 0.8);
          } else if(distance < CONFIG.STIM.focusRadius * 0.6){
            tempVecF.addScaledVector(toPlayerDir, -enemy.chaseSpeed * 0.6);
          }
          if(toPlayerDir.lengthSq() > 1e-6){
            tempVecC.set(toPlayerDir.z, 0, -toPlayerDir.x);
            if(tempVecC.lengthSq() > 1e-6){
              tempVecC.normalize();
              tempVecF.addScaledVector(tempVecC, enemy.chaseSpeed * 0.55 * brain.strafeDir);
            }
          }
          applyEnemyVelocity(enemy, tempVecF, delta, statics);
          if(!hasLine || suppressed){
            brain.state = 'flank';
            brain.flankUntil = now + CONFIG.STIM.flankLoSBlock * 1000;
            brain.repositionUntil = now + CONFIG.STIM.suppressionRelocate * 1000;
            brain.hasCoverTarget = false;
            enemy.burstShotsLeft = 0;
            break;
          }
          if(enemy.fireCooldown <= 0){
            if(enemy.burstShotsLeft <= 0){
              enemy.burstShotsLeft = THREE.MathUtils.randInt(2, 4);
            }
            patchedEnemyHitscanShoot(enemy, delta);
            enemy.burstShotsLeft -= 1;
            enemy.fireCooldown = enemy.burstShotsLeft > 0
              ? THREE.MathUtils.randFloat(CONFIG.AI.focusBurstOffset[0], CONFIG.AI.focusBurstOffset[1])
              : THREE.MathUtils.randFloat(CONFIG.AI.burstCooldown[0], CONFIG.AI.burstCooldown[1]);
          }
          break;
        }
        default: {
          if(!brain.hasCoverTarget){
            const cover = pickCoverPoint(mesh.position, toPlayerDir.lengthSq() > 1e-6 ? toPlayerDir : tempVecC.set(0, 0, 1));
            if(cover){
              brain.coverTarget.copy(cover);
            } else {
              brain.coverTarget.copy(brain.lastKnownPlayerPos);
            }
            brain.coverTarget.y = desiredEnemyCenterY(enemy);
            brain.hasCoverTarget = true;
          }
          const distToCover = moveEnemyTowards(enemy, brain.coverTarget, enemy.chaseSpeed, delta, statics);
          mesh.lookAt(playerPos.x, mesh.position.y, playerPos.z);
          if(hasLine && now > brain.flankUntil){
            brain.state = 'attack';
            brain.hasCoverTarget = false;
          } else if(distToCover < 0.75 || now > brain.repositionUntil){
            brain.state = hasLine ? 'attack' : 'patrol';
            brain.hasCoverTarget = false;
          }
          break;
        }
      }

      if(previousState !== brain.state && brain.state === 'attack'){
        enemy.fireCooldown = Math.min(enemy.fireCooldown, engageClamp);
      }
      if(brain.state === 'attack' && hasLine && enemy.fireCooldown > reengageClamp){
        enemy.fireCooldown = Math.max(reengageClamp, enemy.fireCooldown - delta * 1.5);
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

  function patchedEnemyHitscanShoot(enemy, delta = 0){
    const origin = borrowVec3().copy(enemy.mesh.position);
    const forward = borrowVec3();
    enemy.mesh.getWorldDirection(forward);
    if(forward.lengthSq() < 1e-6){
      forward.set(0, 0, -1);
    }
    forward.normalize();
    const right = borrowVec3().set(forward.z, 0, -forward.x);
    if(right.lengthSq() > 1e-6){
      right.normalize();
    } else {
      right.set(1, 0, 0);
    }
    origin.copy(enemy.mesh.position);
    origin.y = desiredEnemyCenterY(enemy) + 0.2;
    origin.addScaledVector(forward, 0.8);
    origin.addScaledVector(right, 0.25);

    const target = borrowVec3().copy(controls.getObject().position);
    target.y += CONFIG.PLAYER.baseHeight;
    const dir = borrowVec3().subVectors(target, origin).normalize();
    helperRay.set(origin, dir);
    const statics = gatherStaticMeshes();
    const hits = helperRay.intersectObjects(statics, false);

    const playerPos = borrowVec3().copy(controls.getObject().position);
    playerPos.y += CONFIG.PLAYER.baseHeight;
    const distToPlayer = origin.distanceTo(playerPos);
    let blocked = false;
    for(const mesh of statics){
      const arr = helperRay.intersectObject(mesh, false);
      if(arr.length && arr[0].distance < distToPlayer){ blocked = true; break; }
    }

    let hitPoint = borrowVec3().copy(origin).addScaledVector(dir, 100);
    if(!blocked){
      patchedDamagePlayer(difficulty.params.enemyDamage);
      hitPoint.copy(playerPos);
    } else if(hits.length){
      hitPoint.copy(hits[0].point);
    }
    spawnTracer(origin, hitPoint);
    releaseVec3(playerPos);
    releaseVec3(target);
    releaseVec3(origin);
    releaseVec3(dir);
    releaseVec3(hitPoint);
    releaseVec3(forward);
    releaseVec3(right);
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

  function patchedStartNextRound(){
    if(playerState.buyPhase){
      endBuyPhase();
    }
    resetSpawnFailureCounters();
    const params = difficulty.params;
    const previousRound = Number.isFinite(game.round) ? game.round : 0;
    game.round = previousRound + 1;
    ui.roundEl && (ui.roundEl.textContent = `Round: ${game.round}`);
    const toSpawn = params.spawnBase + Math.floor(game.round * params.spawnScale);
    game.enemiesRemaining = toSpawn;
    updateEnemiesHud();
    game.spawnQueue = toSpawn;
    const initialDelay = Number(CONFIG.SPAWN.initialDelay);
    game.spawnDelay = Number.isFinite(initialDelay) ? Math.max(0, initialDelay) : 0.3;
    game.state = 'spawning';
    game.roundStartAt = performance.now();
    patchedShowRoundBanner(`ROUND ${game.round} — ${difficulty.name}`);
  }

  function nextSpawnDelay(){
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
        game.spawnDelay = nextSpawnDelay();
      } else {
        game.spawnDelay = Math.max(game.spawnDelay, nextSpawnDelay());
      }
    }
    if(game.spawnQueue <= 0){
      game.spawnQueue = 0;
      game.state = 'inRound';
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
      maybeDropLoot(enemy.mesh?.position || controls.getObject().position);
      scene.remove(enemy.mesh);
      if(enemy.mesh){
        if(enemy.mesh.geometry && enemy.mesh.geometry !== PATCH_STATE.enemyGeometry){
          enemy.mesh.geometry.dispose?.();
        }
        if(enemy.mesh.material){
          if(Array.isArray(enemy.mesh.material)){
            enemy.mesh.material.forEach(m=>disposeMaterial(m));
          } else {
            disposeMaterial(enemy.mesh.material);
          }
        }
      }
      enemies.splice(idx,1);
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
      maybeEndRound();
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
      ui.enemiesEl.textContent = `Hayatta Kalan Düşman: ${Math.max(game.enemiesRemaining,0)}`;
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
  functions.spawnEnemy = patchedSpawnEnemy;
  functions.updateEnemies = patchedUpdateEnemies;
  functions.moveTowards = moveTowards;
  functions.updateMinimap = patchedUpdateMinimap;
  functions.startNextRound = patchedStartNextRound;
  functions.removeEnemy = patchedRemoveEnemy;
  functions.damagePlayer = patchedDamagePlayer;
  functions.showRoundBanner = patchedShowRoundBanner;

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
