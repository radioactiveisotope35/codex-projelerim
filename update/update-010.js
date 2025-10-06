// update/update-010.js
// Patch 010: Stability, fixed-step loop, pooling, and lifecycle hardening

export function applyPatch(ctx){
  if(!ctx || typeof ctx !== 'object'){
    console.warn('[patch-010] applyPatch requires a context object.');
    return;
  }
  const globalNS = globalThis.__patch010 = globalThis.__patch010 || {};
  if(globalNS.applied){
    return;
  }
  globalNS.applied = true;

  try{ globalThis.__patch009?.stopLoop?.(); }catch(_){}
  try{ globalThis.__patch008?.stopLoop?.(); }catch(_){}
  try{ globalThis.__patch007?.stopLoop?.(); }catch(_){}

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
    console.warn('[patch-010] Missing required references.');
    return;
  }

  const CONFIG = {
    CONFIG_VERSION: '010',
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
      safeRadius: 12,
      maxAttempts: 24,
      concurrentCap: 7,
      buyDuration: 12,
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
      focusBurstOffset: [0.08, 0.25],
      burstCooldown: [0.12, 0.22],
      relocateDistance: 3,
      suppressedTime: 0.9,
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

  renderer.shadowMap.enabled = CONFIG.PERF.shadows;

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

  const PATCH_STATE = {
    debug: false,
  };

  globalNS.enableDebug = (flag) => {
    PATCH_STATE.debug = !!flag;
    if(!flag && perfOverlay){
      perfOverlay.style.display = 'none';
    } else if(flag && perfOverlay){
      perfOverlay.style.display = 'block';
    }
  };

  function safeFlagTexture(tex){
    if(tex && tex.image && tex.image.width && tex.image.height){
      tex.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------
  // SHARED HELPERS & POOLS
  // ---------------------------------------------------------------------------
  const shared = globalNS.shared = globalNS.shared || {};
  const tempBox = shared.tempBox || (shared.tempBox = new THREE.Box3());
  const tempBox2 = shared.tempBox2 || (shared.tempBox2 = new THREE.Box3());
  const tempVecA = shared.tempVecA || (shared.tempVecA = new THREE.Vector3());
  const tempVecB = shared.tempVecB || (shared.tempVecB = new THREE.Vector3());
  const tempVecC = shared.tempVecC || (shared.tempVecC = new THREE.Vector3());
  const tempVecD = shared.tempVecD || (shared.tempVecD = new THREE.Vector3());
  const tempVecE = shared.tempVecE || (shared.tempVecE = new THREE.Vector3());
  const tempQuat = shared.tempQuat || (shared.tempQuat = new THREE.Quaternion());
  const tempEuler = shared.tempEuler || (shared.tempEuler = new THREE.Euler(0, 0, 0, 'YXZ'));
  const tempMat3 = shared.tempMat3 || (shared.tempMat3 = new THREE.Matrix3());
  const tempRaycaster = refs.raycaster || shared.tempRaycaster || new THREE.Raycaster();
  if(!refs.raycaster) shared.tempRaycaster = tempRaycaster;
  const helperRay = shared.helperRay || (shared.helperRay = new THREE.Raycaster());
  const upVector = shared.upVector || (shared.upVector = new THREE.Vector3(0, 1, 0));
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

  const staticScratch = [];
  const enemyMeshScratch = [];
  const filteredStaticScratch = [];
  const raycastScratch = [];

  function gatherStaticMeshes(){
    staticScratch.length = 0;
    if(Array.isArray(world.walls)){
      for(let i=0;i<world.walls.length;i++) staticScratch.push(world.walls[i]);
    }
    if(Array.isArray(world.obstacles)){
      for(let i=0;i<world.obstacles.length;i++) staticScratch.push(world.obstacles[i]);
    }
    return staticScratch;
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

    const sprintHeld = (keyState['ShiftLeft'] || keyState['ShiftRight']) && !playerState.storeOpen;
    const crouchSpeedFactor = playerState.crouched ? CONFIG.PLAYER.crouchSpeedMultiplier : 1;

    const staminaMax = CONFIG.STAMINA.max;
    playerState.staminaDelay = Math.max(0, playerState.staminaDelay - delta);
    playerState.staminaCombatDelay = Math.max(0, playerState.staminaCombatDelay - delta);

    const moving = (keyState['KeyW']||keyState['KeyA']||keyState['KeyS']||keyState['KeyD']);
    let sprinting = sprintHeld && moving && playerState.stamina > CONFIG.STAMINA.minSprint && !playerState.crouched;

    if(sprinting){
      playerState.stamina = Math.max(0, playerState.stamina - CONFIG.STAMINA.sprintDrain * delta);
      if(playerState.stamina <= 0){
        sprinting = false;
        playerState.staminaDelay = CONFIG.STAMINA.regenDelay;
      } else {
        playerState.staminaDelay = CONFIG.STAMINA.regenDelay;
      }
    } else {
      if(playerState.staminaDelay <= 0 && playerState.staminaCombatDelay <= 0){
        playerState.stamina = Math.min(staminaMax, playerState.stamina + CONFIG.STAMINA.regenRate * delta);
      }
    }
    updateStaminaIcon();

    const effectiveADS = getAiming() && !sprinting;
    setADSFlag(effectiveADS);

    const adsTarget = effectiveADS ? 1 : 0;
    const adsSpeed = playerState.crouched ? CONFIG.PLAYER.crouchAdsAcceleration : CONFIG.STANCE.adsSpeed;
    const newAds = damp(getADSTransition(), adsTarget, adsSpeed, delta);
    setADSTransition(newAds);

    const targetFov = sprinting ? CONFIG.STANCE.sprintFov : THREE.MathUtils.lerp(CONFIG.STANCE.baseFov, CONFIG.STANCE.adsFov, newAds);
    camera.fov = damp(camera.fov, playerState.crouched ? Math.min(targetFov, CONFIG.STANCE.crouchFov) : targetFov, CONFIG.STANCE.sprintCamDamp, delta);
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

    tempVecA.set(strafe, 0, forward).normalize();
    if(tempVecA.lengthSq() > 0){
      tempVecA.applyQuaternion(controls.getObject().quaternion);
      tempVecA.multiplyScalar(moveSpeed * delta);
      controls.getObject().position.add(tempVecA);
    }

    if(player.velocity){
      player.velocity.y -= player.gravity * delta;
      controls.getObject().position.y += player.velocity.y * delta;
      if(controls.getObject().position.y < CONFIG.PLAYER.baseHeight){
        controls.getObject().position.y = CONFIG.PLAYER.baseHeight;
        player.velocity.y = 0;
        player.onGround = true;
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
    if(force === false){ playerState.crouched = false; return; }
    if(force === true){ playerState.crouched = true; return; }
    if(!player.onGround) return;
    playerState.crouched = !playerState.crouched;
  }

  function damp(current, target, lambda, delta){
    return THREE.MathUtils.damp(current, target, lambda, delta);
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
    if(ctx.muzzleWorldPosition){
      muzzlePos.copy(ctx.muzzleWorldPosition);
    } else {
      muzzlePos.copy(origin);
    }
    if(ctx.muzzleFlash){
      ctx.muzzleFlash.visible = true;
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
          enemy.brain = enemy.brain || createEnemyBrain();
          enemy.brain.lastHitAt = now;
          enemy.suppressedUntil = now + CONFIG.AI.suppressedTime * 1000;
          if(enemy.health <= 0){ patchedRemoveEnemy(enemy); }
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
                if(enemy.health <= 0) patchedRemoveEnemy(enemy);
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
            if(enemy.health <= 0) patchedRemoveEnemy(enemy);
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
  function patchedSpawnEnemy(){
    if(enemies.length >= CONFIG.PERF.maxActiveEnemies){
      game.spawnDelay = Math.max(game.spawnDelay, 0.5);
      return;
    }
    const p = difficulty.params;
    const spawnRadius = world.size/2 - 6;
    const attempts = CONFIG.SPAWN.maxAttempts;
    let pointFound = false;
    const spawnPoint = tempVecB;
    for(let i=0;i<attempts;i++){
      const angle = Math.random()*Math.PI*2;
      const distance = THREE.MathUtils.randFloat(spawnRadius*0.45, spawnRadius);
      tempVecA.set(Math.cos(angle)*distance, 0, Math.sin(angle)*distance);
      if(validateSpawnPoint(tempVecA)){
        spawnPoint.copy(tempVecA);
        pointFound = true;
        break;
      }
    }
    if(!pointFound){
      spawnPoint.set(THREE.MathUtils.randFloatSpread(spawnRadius), 0, THREE.MathUtils.randFloatSpread(spawnRadius));
    }

    const bodyGeometry = new THREE.CapsuleGeometry(.6,1.2,6,12);
    const mat = ctx.enemyMaterialTemplate ? ctx.enemyMaterialTemplate.clone() : new THREE.MeshStandardMaterial({ color:0x223344 });
    const enemyMesh = new THREE.Mesh(bodyGeometry, mat);
    enemyMesh.position.set(spawnPoint.x, 1.5, spawnPoint.z);
    enemyMesh.castShadow = enemyMesh.receiveShadow = true;
    scene.add(enemyMesh);

    const baseHealth = CONFIG.AI.baseHealth + game.round * CONFIG.AI.healthPerRound;
    const enemy = {
      mesh: enemyMesh,
      health: baseHealth,
      maxHealth: baseHealth,
      state: 'patrol',
      chaseSpeed: movementConfig.enemyChase,
      patrolSpeed: movementConfig.enemyPatrol,
      fireCooldown: THREE.MathUtils.randFloat(p.firstShotDelay[0], p.firstShotDelay[1]),
      burstShotsLeft: 0,
      aimSpread: p.aimSpread,
      suppressedUntil: 0,
      brain: createEnemyBrain(),
    };
    enemyMesh.userData.enemy = enemy;
    enemies.push(enemy);
  }

  function createEnemyBrain(){
    return {
      state: 'patrol',
      lastDecisionAt: -Infinity,
      peekUntil: 0,
      coverUntil: 0,
      flankUntil: 0,
      lastKnownPlayerPos: new THREE.Vector3(),
      lastHitAt: -Infinity,
    };
  }

  function validateSpawnPoint(point){
    const playerPos = controls.getObject().position;
    if(point.distanceTo(playerPos) < CONFIG.SPAWN.safeRadius){
      return false;
    }
    tempVecC.copy(point).setY(CONFIG.PLAYER.baseHeight);
    helperRay.set(tempVecC, tempVecA.subVectors(playerPos, point).normalize());
    const statics = gatherStaticMeshes();
    for(const mesh of statics){
      const res = helperRay.intersectObject(mesh, false);
      if(res.length){
        return true;
      }
    }
    return false;
  }

  function patchedUpdateEnemies(delta){
    const now = performance.now();
    for(let i=0;i<enemies.length;i++){
      const enemy = enemies[i];
      const brain = enemy.brain || (enemy.brain = createEnemyBrain());
      const mesh = enemy.mesh;
      if(!mesh) continue;
      const toPlayer = tempVecA.subVectors(controls.getObject().position, mesh.position);
      const distance = toPlayer.length();
      toPlayer.normalize();

      const losKey = `${mesh.uuid}:${Math.round(controls.getObject().position.x*2)}:${Math.round(controls.getObject().position.z*2)}`;
      let hasLine = false;
      if(CONFIG.PERF.losReuse && losCache.has(losKey) && now - losCache.get(losKey).time < 80){
        hasLine = losCache.get(losKey).value;
      } else {
        hasLine = hasLineOfSight(mesh.position, controls.getObject().position);
        losCache.set(losKey, { value: hasLine, time: now });
      }

      switch(brain.state){
        case 'patrol':
          mesh.translateOnAxis(new THREE.Vector3(0,0,1), enemy.patrolSpeed * delta);
          if(hasLine){
            brain.state = 'attack';
            brain.peekUntil = now + THREE.MathUtils.randFloat(CONFIG.AI.peekDuration[0], CONFIG.AI.peekDuration[1]) * 1000;
          }
          break;
        case 'attack':
          mesh.lookAt(controls.getObject().position.x, mesh.position.y, controls.getObject().position.z);
          if(enemy.suppressedUntil > now){
            mesh.translateOnAxis(new THREE.Vector3(-toPlayer.z,0,toPlayer.x), delta);
          }
          if(hasLine){
            if(enemy.fireCooldown <= 0){
              enemy.fireCooldown = THREE.MathUtils.randFloat(CONFIG.AI.burstCooldown[0], CONFIG.AI.burstCooldown[1]);
              enemy.burstShotsLeft = THREE.MathUtils.randInt(2, 4);
            }
            if(enemy.burstShotsLeft > 0){
              enemy.fireCooldown -= delta;
              if(enemy.fireCooldown <= 0){
                patchedEnemyHitscanShoot(enemy);
                enemy.burstShotsLeft -= 1;
                enemy.fireCooldown = THREE.MathUtils.randFloat(CONFIG.AI.burstCooldown[0], CONFIG.AI.burstCooldown[1]);
              }
            }
          } else {
            brain.state = 'flank';
            brain.flankUntil = now + CONFIG.STIM.flankLoSBlock * 1000;
            brain.lastKnownPlayerPos.copy(controls.getObject().position);
          }
          break;
        case 'flank':
          moveTowards(mesh, brain.lastKnownPlayerPos, enemy.chaseSpeed, delta);
          if(hasLine || now > brain.flankUntil){
            brain.state = 'attack';
          }
          break;
      }
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

  function patchedEnemyHitscanShoot(enemy){
    const origin = borrowVec3().copy(enemy.mesh.position);
    origin.y += 1.4;
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
  }

  // ---------------------------------------------------------------------------
  // SPAWN / ROUNDS
  // ---------------------------------------------------------------------------
  function patchedStartNextRound(){
    if(playerState.buyPhase){
      endBuyPhase();
    }
    const params = difficulty.params;
    game.round += 1;
    ui.roundEl && (ui.roundEl.textContent = `Round: ${game.round}`);
    const toSpawn = params.spawnBase + Math.floor(game.round * params.spawnScale);
    game.enemiesRemaining = toSpawn;
    updateEnemiesHud();
    game.spawnQueue = toSpawn;
    game.spawnDelay = 0;
    game.state = 'spawning';
    game.roundStartAt = performance.now();
    patchedShowRoundBanner(`ROUND ${game.round} — ${difficulty.name}`);
  }

  function handleSpawning(delta){
    if(game.state !== 'spawning') return;
    if(enemies.length >= CONFIG.SPAWN.concurrentCap) return;
    game.spawnDelay -= delta;
    if(game.spawnDelay <= 0 && game.spawnQueue > 0){
      patchedSpawnEnemy();
      game.spawnQueue -= 1;
      game.spawnDelay = THREE.MathUtils.randFloat(0.55, 1.1);
    }
    if(game.spawnQueue <= 0){
      game.state = 'inRound';
    }
  }

  function beginBuyPhase(){
    playerState.buyPhase = true;
    game.state = 'buyPhase';
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
        enemy.mesh.geometry?.dispose?.();
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
      if(game.enemiesRemaining <= 0 && game.spawnQueue <= 0 && enemies.length === 0){
        beginBuyPhase();
      }
    }
  }

  function disposeMaterial(mat){
    if(!mat) return;
    if(mat.map && mat.map.image && mat.map.image.width){
      mat.map.dispose?.();
    }
    if(mat.normalMap && mat.normalMap.image && mat.normalMap.image.width){
      mat.normalMap.dispose?.();
    }
    mat.dispose?.();
  }

  const removeEnemy = patchedRemoveEnemy;

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
  function patchedUpdateMinimap(){
    if(!minimapCtx) return;
    const canvas = minimapCtx.canvas;
    const size = canvas.width;
    const scale = size / world.size;
    minimapCtx.clearRect(0,0,size,size);
    minimapCtx.fillStyle='rgba(10,18,28,.9)';
    minimapCtx.fillRect(0,0,size,size);
    minimapCtx.strokeStyle='rgba(255,255,255,.15)';
    minimapCtx.strokeRect(2,2,size-4,size-4);

    const playerPos = controls.getObject().position;
    const yawNode = yawObject || (typeof controls.getObject === 'function' ? controls.getObject() : controls);
    const yaw = yawNode?.rotation?.y ?? 0;
    const hdg = ((yaw % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const project = (pos) => ({ x: size/2 + pos.x*scale, y: size/2 + pos.z*scale });
    const p = project(playerPos);
    if(ui.minimapTexture){
      safeFlagTexture(ui.minimapTexture);
    }
    minimapCtx.fillStyle = '#50c8ff';
    minimapCtx.beginPath();
    minimapCtx.arc(p.x, p.y, 6, 0, Math.PI*2);
    minimapCtx.fill();

    const coneLength = 26;
    const left = hdg - 0.35;
    const right = hdg + 0.35;
    minimapCtx.beginPath();
    minimapCtx.moveTo(p.x, p.y);
    minimapCtx.lineTo(p.x + Math.sin(left)*coneLength, p.y + Math.cos(left)*coneLength);
    minimapCtx.lineTo(p.x + Math.sin(right)*coneLength, p.y + Math.cos(right)*coneLength);
    minimapCtx.closePath();
    minimapCtx.fillStyle = 'rgba(80,200,255,.2)';
    minimapCtx.fill();

    minimapCtx.fillStyle = '#ff5c3b';
    enemies.forEach(e=>{
      const ep = project(e.mesh.position);
      minimapCtx.beginPath();
      minimapCtx.arc(ep.x, ep.y, 5, 0, Math.PI*2);
      minimapCtx.fill();
    });

    minimapCtx.fillStyle = '#9ad0ff';
    coverPoints.forEach(c => {
      const cp = project(c.position);
      minimapCtx.beginPath();
      minimapCtx.arc(cp.x, cp.y, 3, 0, Math.PI*2);
      minimapCtx.fill();
    });
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

  const perfOverlay = CONFIG.PERF.debugOverlay ? createPerfOverlay() : null;

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

  if(renderer.domElement && !globalNS.contextBound){
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false);
    globalNS.contextBound = true;
  }

  // ---------------------------------------------------------------------------
  // INPUT
  // ---------------------------------------------------------------------------
  const boundFlags = globalNS.boundFlags = globalNS.boundFlags || { input:false };
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
    if(e.code === 'Escape' && playerState.storeOpen){ closeStore(); }
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

  function openStore(fromBuyPhase){
    playerState.storeOpen = true;
    pauseLoop();
    if(originalOpenStore) originalOpenStore(fromBuyPhase);
  }
  function closeStore(){
    playerState.storeOpen = false;
    if(originalCloseStore) originalCloseStore();
    resumeLoop();
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
  startLoop();

  PATCH_STATE.CONFIG = CONFIG;
  globalNS.state = { CONFIG, playerState, fireState };

  updateEnemiesHud();
  updateArmorBadge();

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
