// update/update-007.js
// Patch 007: Advanced gameplay upgrade for Mini CS: Arena

export function applyPatch(ctx){
  if(!ctx || typeof ctx !== 'object'){
    console.warn('[patch-007] applyPatch requires a context object.');
    return;
  }
  if(globalThis.__patch007?.applied){
    return;
  }

  const PATCH_NS = (globalThis.__patch007 = globalThis.__patch007 || {});
  PATCH_NS.applied = true;
  PATCH_NS.enableDebug = enableDebug;

  const {
    THREE,
    scene,
    camera,
    renderer,
    controls,
    clock,
    world,
    movementConfig,
    player,
    game,
    enemies,
    lootItems,
    difficulty,
    keyState,
    refs = {},
    functions = {},
    ui = {},
  } = ctx;

  if(!THREE || !scene || !camera || !controls){
    console.warn('[patch-007] Missing core references, aborting.');
    return;
  }

  const CONFIG = {
    PLAYER: {
      baseHeight: player.height || 1.6,
      crouchRatio: 0.7,
      crouchSpeedMultiplier: 0.8,
      crouchSpreadMultiplier: 0.75,
      crouchAdsAcceleration: 16,
      hipFireSpreadMultiplier: 1,
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
    RECOIL: {
      // Recoil tuning expressed in radians; followStrength controls how fast the
      // applied offset follows the instantaneous targets.
      kickPitch: 0.012,
      kickYaw: 0.003,
      pitchVariance: 0.25,
      yawJitter: 0.6,
      adsScale: 0.6,
      crouchScale: 0.7,
      hipScale: 1,
      recoverPitch: 14,
      recoverYaw: 11,
      adsRecoverBonus: 1.2,
      crouchRecoverBonus: 1.1,
      followStrength: 18,
      modPitchScale: 0.75,
      minPitchDeg: -85,
      maxPitchDeg: 85,
      semiAutoFactor: 0.82,
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
      items: [
        { id: 'ammo', label: 'Ammo Pack', cost: 65, description: '+60 Reserve Ammo', apply: () => {
          const gain = 60;
          player.reserve = Math.min(player.reserveMax, player.reserve + gain);
          safeCall(functions.updateAmmoDisplay);
        }},
        { id: 'med', label: 'Med Kit', cost: 85, description: '+45 Health (overheal to 120)', apply: () => {
          player.health = Math.min(120, player.health + 45);
          updateHealthBar();
        }},
        { id: 'armor', label: 'Light Armor', cost: 110, description: 'Next 3 hits -25% dmg', apply: () => {
          playerState.armorCharges = 3;
          updateArmorBadge();
        }},
        { id: 'mod', label: 'Weapon Mod Slot', cost: 180, description: 'Install recoil or reload mod', apply: openModSelector },
      ],
      mods: [
        { id: 'recoil', label: 'Recoil Stabilizer', description: '-25% vertical recoil', apply: () => { playerState.mods.recoil = true; }},
        { id: 'reload', label: 'Speed Loader', description: '-25% reload time', apply: () => { playerState.mods.reload = true; player.reloadTime *= 0.75; }},
      ],
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
      losReuse: true,
    },
  };

  // Patch local state containers
  const playerState = {
    crouched: false,
    stamina: CONFIG.STAMINA.max,
    staminaDelay: 0,
    staminaCombatDelay: 0,
    staminaVisible: CONFIG.STORE.showStaminaHud,
    recoil: {
      pitch: 0,
      yaw: 0,
      pitchTarget: 0,
      yawTarget: 0,
      appliedPitch: 0,
      appliedYaw: 0,
    },
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

  const recoilState = playerState.recoil;

  const coverPoints = [];
  const losCache = new Map();
  const tempBox = refs.tempBox || new THREE.Box3();
  const tempBox2 = new THREE.Box3();
  const tempVecA = new THREE.Vector3();
  const tempVecB = new THREE.Vector3();
  const tempVecC = new THREE.Vector3();
  const tempVecD = new THREE.Vector3();
  const tempVecE = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const tempEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const tempRaycaster = refs.raycaster || new THREE.Raycaster();
  const helperRay = new THREE.Raycaster();
  const tempMat3 = new THREE.Matrix3();
  const minimapCtx = ui.minimapCtx;

  const yawObject = typeof controls.getObject === 'function' ? controls.getObject() : controls.object || controls;
  const pitchObject = findPitchNode(yawObject, camera) || camera;
  const recoilPitchMin = THREE.MathUtils.degToRad(CONFIG.RECOIL.minPitchDeg);
  const recoilPitchMax = THREE.MathUtils.degToRad(CONFIG.RECOIL.maxPitchDeg);

  const spawnTracer = ctx.spawnTracer || functions.spawnTracer;
  const spawnImpactDecal = ctx.spawnImpactDecal || functions.spawnImpactDecal;
  const showHitmarker = ctx.showHitmarker || functions.showHitmarker;
  const screenShake = ctx.screenShake || functions.screenShake;
  const crosshairBloom = ctx.crosshairBloom || functions.crosshairBloom;
  const noteGunshotNoise = ctx.noteGunshotNoise || functions.noteGunshotNoise;
  const updateAmmoDisplay = safeCall.bind(null, functions.updateAmmoDisplay);
  const updateLoot = functions.updateLoot;
  const updateRegen = functions.updateRegen;
  const getNoiseInfo = ctx.getNoiseInfo || (() => ({ lastNoiseAt: -Infinity, noise: null }));

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

  setupCoverPoints();
  setupStaminaIcon();
  setupStore();
  hookInput();

  functions.updatePlayer = patchedUpdatePlayer;
  functions.hitscanShoot = patchedHitscanShoot;
  functions.enemyHitscanShoot = patchedEnemyHitscanShoot;
  functions.spawnEnemy = patchedSpawnEnemy;
  functions.updateEnemies = patchedUpdateEnemies;
  functions.moveTowards = patchedMoveTowards;
  functions.updateMinimap = patchedUpdateMinimap;
  functions.startNextRound = patchedStartNextRound;
  functions.removeEnemy = patchedRemoveEnemy;
  functions.damagePlayer = patchedDamagePlayer;
  functions.showRoundBanner = patchedShowRoundBanner;
  functions.animate = patchedAnimate;

  PATCH_NS.state = { CONFIG, playerState };

  // ---------------------------------------------------------------------------
  // PLAYER
  // ---------------------------------------------------------------------------
  function patchedUpdatePlayer(delta){
    const adsBeforeUpdate = !!getADS();
    if(!controls.isLocked || game.state === 'over'){
      updateRecoil(delta, adsBeforeUpdate);
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

    const moveSpeed = movementConfig.playerWalk * crouchSpeedFactor * (sprinting ? player.sprintMultiplier : 1);
    let forward = 0; let strafe = 0;
    if(keyState['KeyW']) forward += 1;
    if(keyState['KeyS']) forward -= 1;
    if(keyState['KeyD']) strafe += 1;
    if(keyState['KeyA']) strafe -= 1;
    const len = Math.hypot(forward, strafe);
    if(len>0){ forward /= len; strafe /= len; }

    const oldPos = tempVecA.copy(controls.getObject().position);
    const dist = moveSpeed * delta;
    if(forward !== 0) controls.moveForward(forward * dist);
    if(strafe !== 0) controls.moveRight(strafe * dist);

    if(player.onGround && keyState['Space']){
      player.velocity.y = player.jumpStrength;
      player.onGround = false;
      if(playerState.crouched){ toggleCrouch(false); }
    }

    player.velocity.y -= player.gravity * delta;
    controls.getObject().position.y += player.velocity.y * delta;

    const crouchHeight = CONFIG.PLAYER.baseHeight * CONFIG.PLAYER.crouchRatio;
    const targetHeight = playerState.crouched ? crouchHeight : CONFIG.PLAYER.baseHeight;
    const body = controls.getObject().position;
    if(body.y < targetHeight){
      player.velocity.y = 0;
      body.y = targetHeight;
      player.onGround = true;
    } else if(player.velocity.y < 0){
      player.onGround = false;
    }
    player.height = targetHeight;

    const colliders = [...world.walls, ...world.obstacles];
    const colliderSize = tempVecB.set(1, targetHeight, 1);
    const playerCollider = refs.playerCollider || new THREE.Box3();
    playerCollider.setFromCenterAndSize(body, colliderSize);
    for(const c of colliders){
      tempBox.setFromObject(c);
      if(playerCollider.intersectsBox(tempBox)){
        controls.getObject().position.copy(oldPos);
        player.velocity.y = 0;
        player.onGround = true;
        break;
      }
    }

    if(player.isReloading){
      player.reloadTimer -= delta;
      if(player.reloadTimer <= 0){
        const need = player.maxAmmo - player.ammo;
        const toLoad = Math.min(need, player.reserve);
        player.ammo += toLoad;
        player.reserve -= toLoad;
        updateAmmoDisplay?.();
        player.isReloading = false;
      }
    }

    const recoverRate = effectiveADS ? weaponState.recoveryAds : weaponState.recoveryHip;
    weaponState.spreadCurrent = Math.max(spreadBase, weaponState.spreadCurrent - recoverRate * delta);

    updateRecoil(delta, effectiveADS);

    if(updateRegen) updateRegen(delta);
    if(functions.updateWeaponPose) functions.updateWeaponPose(delta);
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

  function findPitchNode(root, cam){
    if(!root || !root.children) return null;
    for(let i = 0; i < root.children.length; i++){
      const child = root.children[i];
      if(child === cam) return root;
      const nested = findPitchNode(child, cam);
      if(nested) return nested;
    }
    return null;
  }

  function updateRecoil(delta, adsActive){
    if(!yawObject || !pitchObject) return;
    const stanceRecover = (adsActive ? CONFIG.RECOIL.adsRecoverBonus : 1) *
      (playerState.crouched ? CONFIG.RECOIL.crouchRecoverBonus : 1);
    const followRate = 1 - Math.exp(-CONFIG.RECOIL.followStrength * delta);
    const pitchDecay = Math.exp(-CONFIG.RECOIL.recoverPitch * stanceRecover * delta);
    const yawDecay = Math.exp(-CONFIG.RECOIL.recoverYaw * stanceRecover * delta);

    recoilState.pitchTarget *= pitchDecay;
    recoilState.yawTarget *= yawDecay;

    recoilState.pitch += (recoilState.pitchTarget - recoilState.pitch) * followRate;
    recoilState.yaw += (recoilState.yawTarget - recoilState.yaw) * followRate;

    applyRecoilOffsets();
  }

  function applyShotRecoil(isADS){
    const stanceScale = (isADS ? CONFIG.RECOIL.adsScale : CONFIG.RECOIL.hipScale) *
      (playerState.crouched ? CONFIG.RECOIL.crouchScale : 1);
    const pitchVariance = 1 + (Math.random() * CONFIG.RECOIL.pitchVariance);
    const pitchMod = playerState.mods.recoil ? CONFIG.RECOIL.modPitchScale : 1;
    const pitchKick = CONFIG.RECOIL.kickPitch * stanceScale * pitchVariance * pitchMod;

    const side = Math.random() < 0.5 ? -1 : 1;
    const yawVariance = 1 + ((Math.random() * 2 - 1) * CONFIG.RECOIL.yawJitter * 0.5);
    const yawKick = CONFIG.RECOIL.kickYaw * stanceScale * yawVariance * side;

    recoilState.pitchTarget += pitchKick;
    recoilState.yawTarget += yawKick;
  }

  function applyRecoilOffsets(){
    if(!yawObject || !pitchObject) return;

    if(recoilState.appliedYaw !== 0){
      yawObject.rotation.y += recoilState.appliedYaw;
    }
    const newYaw = recoilState.yaw;
    if(newYaw !== 0){
      yawObject.rotation.y -= newYaw;
    }
    recoilState.appliedYaw = newYaw;

    if(recoilState.appliedPitch !== 0){
      pitchObject.rotation.x = THREE.MathUtils.clamp(
        pitchObject.rotation.x + recoilState.appliedPitch,
        recoilPitchMin,
        recoilPitchMax,
      );
    }
    const newPitch = recoilState.pitch;
    if(newPitch !== 0){
      pitchObject.rotation.x = THREE.MathUtils.clamp(
        pitchObject.rotation.x - newPitch,
        recoilPitchMin,
        recoilPitchMax,
      );
    } else {
      pitchObject.rotation.x = THREE.MathUtils.clamp(
        pitchObject.rotation.x,
        recoilPitchMin,
        recoilPitchMax,
      );
    }
    recoilState.appliedPitch = newPitch;
  }

  // ---------------------------------------------------------------------------
  // WEAPONS
  // ---------------------------------------------------------------------------
  function patchedHitscanShoot(){
    if(!player.alive || player.isReloading || player.ammo <= 0 || playerState.storeOpen) return;

    const now = performance.now();
    const fireModeDelay = playerState.semiAuto ? CONFIG.WEAPONS.semiAutoDelay : CONFIG.WEAPONS.fireRate;
    if(playerState.semiAuto && !playerState.semiAutoReady) return;
    if(player.fireCooldown > 0) return;

    const ads = getADS();
    const stanceSpread = getSpreadBase(ads);
    const stanceMax = ads ? weaponState.spreadMaxAds : weaponState.spreadMaxHip;
    const stanceSpreadCur = weaponState.spreadCurrent;

    const spreadScalar = THREE.MathUtils.clamp(stanceSpreadCur, stanceSpread, stanceMax);
    camera.getWorldDirection(tempVecA).normalize();
    const yawOff = (Math.random()*2-1) * spreadScalar;
    const pitchOff = (Math.random()*2-1) * spreadScalar * 0.7;
    tempEuler.set(pitchOff, yawOff, 0);
    tempQuat.setFromEuler(tempEuler);
    tempVecA.applyQuaternion(tempQuat).normalize();

    const origin = camera.getWorldPosition(tempVecB);
    const muzzlePos = ctx.muzzleWorldPosition ? ctx.muzzleWorldPosition.clone() : origin.clone();
    if(ctx.muzzleFlash){ ctx.muzzleFlash.visible = true; setTimeout(()=>{ ctx.muzzleFlash.visible = false; }, 45); }

    const staticObjs = [...world.walls, ...world.obstacles];
    const enemyMeshes = enemies.map(e => e.mesh);
    tempRaycaster.set(origin, tempVecA);
    const intersects = tempRaycaster.intersectObjects([...enemyMeshes, ...staticObjs], false);

    let hitPoint = origin.clone().add(tempVecA.clone().multiplyScalar(200));
    let damageWasHeadshot = false;
    let inflictedDamage = 0;

    if(intersects.length){
      const first = intersects[0];
      hitPoint = first.point.clone();
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
          if(enemy.health <= 0){ removeEnemy(enemy); }
          else { enemy.mesh.material.emissive.setHex(0xff3333); setTimeout(()=>enemy.mesh.material.emissive.setHex(0x050b14), 90); }
        }
      } else {
        handleRicochetOrPenetration(first, origin, tempVecA.clone(), enemyMeshes, staticObjs, inflictedDamage);
      }
    }

    if(spawnTracer){ spawnTracer(muzzlePos, hitPoint); }
    crosshairBloom?.();
    screenShake?.(damageWasHeadshot ? 0.02 : 0.01, 0.06);
    showHitmarker?.();

    player.ammo -= 1;
    updateAmmoDisplay?.();

    applyShotRecoil(ads);

    weaponState.spreadCurrent = Math.min(stanceMax, weaponState.spreadCurrent + (ads ? 0.08 : 0.18) * (playerState.semiAuto ? CONFIG.RECOIL.semiAutoFactor : 1));

    noteGunshotNoise?.();
    player.fireCooldown = fireModeDelay;
    playerState.lastShotTime = now;
    if(playerState.semiAuto){ playerState.semiAutoReady = false; }
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
      ? first.face.normal.clone().applyMatrix3(tempMat3.getNormalMatrix(mesh.matrixWorld)).normalize()
      : tempVecD.subVectors(first.point, mesh.getWorldPosition(tempVecE)).normalize();
    const incidence = Math.abs(dir.dot(normal));

    let ricochet = false;
    if(mesh.userData.ricochet && incidence < Math.cos(CONFIG.WEAPONS.ricochetAngle)){
      if(Math.random() < CONFIG.WEAPONS.ricochetChance){
        ricochet = true;
      }
    }

    if(ricochet){
      const reflected = dir.clone().reflect(normal).normalize();
      const newOrigin = first.point.clone().add(reflected.clone().multiplyScalar(0.02));
      helperRay.set(newOrigin, reflected);
      const combined = helperRay.intersectObjects([...enemyMeshes, ...staticObjs], false);
      const maxDistance = CONFIG.WEAPONS.ricochetRange;
      const endPoint = newOrigin.clone().add(reflected.clone().multiplyScalar(maxDistance));
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
                if(enemy.health <= 0) removeEnemy(enemy);
              }
            }
            break;
          }
        }
      }
      spawnTracer?.(first.point, endPoint, 0.5);
      if(spawnImpactDecal) spawnImpactDecal(first.point, normal);
      return;
    }

    if(approxThickness <= CONFIG.WEAPONS.penetrationThickness){
      const newOrigin = first.point.clone().add(dir.clone().multiplyScalar(0.05));
      helperRay.set(newOrigin, dir);
      const nextHits = helperRay.intersectObjects([...enemyMeshes, ...staticObjs.filter(obj => obj !== mesh)], false);
      let endPoint = newOrigin.clone().add(dir.clone().multiplyScalar(40));
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
            if(enemy.health <= 0) removeEnemy(enemy);
          }
        }
      }
      spawnTracer?.(first.point, endPoint, 0.4);
    } else {
      spawnImpactDecal?.(first.point, normal);
    }
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------
  function patchedSpawnEnemy(){
    const p = difficulty.params;
    const spawnRadius = world.size/2 - 6;
    const attempts = CONFIG.SPAWN.maxAttempts;
    let point = null;
    for(let i=0;i<attempts;i++){
      const angle = Math.random()*Math.PI*2;
      const distance = THREE.MathUtils.randFloat(spawnRadius*0.45, spawnRadius);
      tempVecA.set(Math.cos(angle)*distance, 0, Math.sin(angle)*distance);
      if(validateSpawnPoint(tempVecA)){ point = tempVecA.clone(); break; }
    }
    if(!point){ point = tempVecA.set(THREE.MathUtils.randFloatSpread(spawnRadius), 0, THREE.MathUtils.randFloatSpread(spawnRadius)); }

    const bodyGeometry = new THREE.CapsuleGeometry(.6,1.2,6,12);
    const mat = ctx.enemyMaterialTemplate ? ctx.enemyMaterialTemplate.clone() : new THREE.MeshStandardMaterial({ color:0x223344 });
    const enemyMesh = new THREE.Mesh(bodyGeometry, mat);
    enemyMesh.position.set(point.x, 1.5, point.z);
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
      lastSeenPlayerAt: controls.getObject().position.clone(),
      targetPoint: new THREE.Vector3(),
      subTimer: 0,
      strafeTimer: 0,
      strafeDir: Math.random()<0.5?-1:1,
    };
    assignPatrol(enemy);
    enemies.push(enemy);
  }

  function validateSpawnPoint(pos){
    const playerPos = controls.getObject().position;
    if(pos.distanceTo(playerPos) < CONFIG.SPAWN.safeRadius) return false;
    const height = 1.6;
    const from = pos.clone().setY(height);
    const to = playerPos.clone();
    const dir = tempVecB.subVectors(to, from).normalize();
    helperRay.set(from, dir);
    const statics = [...world.walls, ...world.obstacles];
    const hits = helperRay.intersectObjects(statics, false);
    const dist = from.distanceTo(to);
    if(!hits.length) return false;
    return hits[0].distance < dist - 0.75;
  }

  function createEnemyBrain(){
    return {
      mode: 'patrol',
      modeTime: 0,
      coverTimer: 0,
      peekTimer: 0,
      flankCooldown: 0,
      lastSeen: -Infinity,
      lastHeard: -Infinity,
      focusOffset: 0,
      relocateTimer: 0,
      coverPoint: null,
      flankTarget: null,
    };
  }

  function assignPatrol(enemy){
    enemy.brain.mode = 'patrol';
    enemy.brain.modeTime = 0;
    enemy.subTimer = THREE.MathUtils.randFloat(2.5, 5.5);
    enemy.targetPoint.set(THREE.MathUtils.randFloatSpread(world.size*0.6), 0, THREE.MathUtils.randFloatSpread(world.size*0.6));
  }

  function patchedMoveTowards(enemy, target, speed, delta){
    tempVecA.subVectors(target, enemy.mesh.position);
    tempVecA.y = 0;
    const dist = tempVecA.length();
    if(dist < 0.1) return;
    tempVecA.normalize();
    enemy.mesh.position.addScaledVector(tempVecA, speed * delta);
    enemy.mesh.lookAt(enemy.mesh.position.clone().add(tempVecA));
  }

  function patchedUpdateEnemies(delta){
    if(game.state === 'over') return;
    if(game.state === 'buyPhase' || playerState.storeOpen) return;

    const playerPos = controls.getObject().position.clone();
    const statics = [...world.walls, ...world.obstacles];
    const params = difficulty.params;
    const now = performance.now();

    for(const enemy of enemies){
      const brain = enemy.brain = enemy.brain || createEnemyBrain();
      brain.modeTime += delta;
      brain.flankCooldown = Math.max(0, brain.flankCooldown - delta);
      brain.relocateTimer = Math.max(0, brain.relocateTimer - delta);

      const enemyPos = enemy.mesh.position;
      const toPlayerFlat = tempVecA.subVectors(playerPos, enemyPos).setY(0);
      const distance = toPlayerFlat.length();
      const seen = distance < params.losRange && hasLineOfSight(enemyPos, playerPos);
      const noiseInfo = getNoiseInfo();
      const noisePos = noiseInfo.noise?.pos || playerPos;
      const heardNoise = noiseInfo.lastNoiseAt && now - noiseInfo.lastNoiseAt < 1500 && enemyPos.distanceTo(noisePos) < 30;

      if(seen){
        brain.lastSeen = now;
        enemy.lastSeenPlayerAt.copy(playerPos);
      }
      if(heardNoise) brain.lastHeard = now;

      const suppressed = now < enemy.suppressedUntil * 1000;

      if(seen && distance < params.engage){
        brain.mode = 'attack';
      } else if(seen){
        brain.mode = 'chase';
      } else if(now - brain.lastSeen < 2500 || now - brain.lastHeard < 1500){
        if(brain.flankCooldown <= 0){
          const flank = findFlank(enemy);
          if(flank){ brain.mode = 'flank'; brain.flankTarget = flank; brain.flankCooldown = 6; }
          else brain.mode = 'search';
        } else {
          brain.mode = 'search';
        }
      } else {
        brain.mode = 'patrol';
      }

      if(suppressed){
        brain.mode = 'reposition';
      }

      switch(brain.mode){
        case 'patrol':
          enemy.subTimer -= delta;
          patchedMoveTowards(enemy, enemy.targetPoint, enemy.patrolSpeed, delta);
          if(enemy.subTimer <= 0){ assignPatrol(enemy); }
          break;
        case 'chase':
          patchedMoveTowards(enemy, enemy.lastSeenPlayerAt, enemy.chaseSpeed, delta);
          break;
        case 'search':
          if(brain.flankTarget){
            patchedMoveTowards(enemy, brain.flankTarget, enemy.chaseSpeed, delta);
            if(enemy.mesh.position.distanceTo(brain.flankTarget) < 1){ brain.flankTarget = null; }
          } else {
            patchedMoveTowards(enemy, enemy.lastSeenPlayerAt, enemy.patrolSpeed, delta);
          }
          break;
        case 'flank':
          if(brain.flankTarget){
            patchedMoveTowards(enemy, brain.flankTarget, enemy.chaseSpeed, delta);
            if(enemy.mesh.position.distanceTo(brain.flankTarget) < 1){ brain.flankTarget = null; brain.mode = 'attack'; }
          }
          break;
        case 'reposition':
          if(brain.relocateTimer <= 0){
            const cover = findCover(enemy, playerPos);
            if(cover){
              brain.coverPoint = cover.position;
              brain.coverTimer = THREE.MathUtils.randFloat(...CONFIG.AI.coverDuration);
              brain.relocateTimer = CONFIG.STIM.relocateCooldown;
              patchedMoveTowards(enemy, cover.position, enemy.chaseSpeed, delta);
            }
          }
          break;
        case 'attack':
          handleEnemyAttack(enemy, delta, distance, params);
          break;
      }

      resolveCollisions(enemy, statics);
    }
  }

  function handleEnemyAttack(enemy, delta, distance, params){
    const lookDir = tempVecB.subVectors(controls.getObject().position.clone(), enemy.mesh.position).setY(0).normalize();
    if(distance < params.retreat){
      enemy.mesh.position.addScaledVector(lookDir, -enemy.chaseSpeed * delta * 1.1);
    } else if(distance > params.engage){
      enemy.mesh.position.addScaledVector(lookDir, enemy.chaseSpeed * delta * 0.9);
    } else {
      enemy.strafeTimer -= delta;
      if(enemy.strafeTimer <= 0){
        enemy.strafeTimer = THREE.MathUtils.randFloat(0.4, 0.9);
        enemy.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const strafe = tempVecC.set(-lookDir.z, 0, lookDir.x).multiplyScalar(enemy.chaseSpeed * 0.9 * enemy.strafeDir * delta);
      enemy.mesh.position.add(strafe);
    }
    enemy.mesh.lookAt(enemy.mesh.position.clone().add(lookDir));

    enemy.fireCooldown -= delta;
    if(enemy.fireCooldown <= 0){
      if(enemy.burstShotsLeft <= 0){
        const burstRange = difficulty.params.burstSize;
        enemy.burstShotsLeft = THREE.MathUtils.randInt(burstRange[0], burstRange[1]);
        enemy.brain.focusOffset = THREE.MathUtils.randFloat(...CONFIG.AI.focusBurstOffset);
      }
      if(enemy.burstShotsLeft > 0){
        patchedEnemyHitscanShoot(enemy);
        enemy.burstShotsLeft -= 1;
        const cd = enemy.burstShotsLeft > 0 ? THREE.MathUtils.randFloat(...CONFIG.AI.burstCooldown) : params.restAfterBurst;
        enemy.fireCooldown = cd + enemy.brain.focusOffset;
      }
    }
  }

  function resolveCollisions(enemy, statics){
    tempBox.setFromObject(enemy.mesh);
    for(const s of statics){
      const sBox = new THREE.Box3().setFromObject(s);
      if(tempBox.intersectsBox(sBox)){
        const ep = enemy.mesh.position;
        const closest = sBox.clampPoint(ep, new THREE.Vector3());
        const push = ep.clone().sub(closest);
        if(push.lengthSq() === 0) push.set(Math.random()-0.5, 0, Math.random()-0.5);
        push.y = 0; push.normalize();
        enemy.mesh.position.addScaledVector(push, 0.25);
        tempBox.setFromObject(enemy.mesh);
      }
    }
  }

  function hasLineOfSight(from, to){
    if(CONFIG.PERF.losReuse){
      const key = `${from.x.toFixed(1)},${from.z.toFixed(1)}->${to.x.toFixed(1)},${to.z.toFixed(1)}`;
      const cached = losCache.get(key);
      if(cached && performance.now() - cached.time < 80) return cached.hit;
      helperRay.set(from.clone().setY(1.3), tempVecC.subVectors(to, from).normalize());
      const statics = [...world.walls, ...world.obstacles];
      const hits = helperRay.intersectObjects(statics, false);
      const dist = from.distanceTo(to);
      const result = !hits.length || hits[0].distance > dist - 0.4;
      losCache.set(key, { hit: result, time: performance.now() });
      return result;
    }
    helperRay.set(from.clone().setY(1.3), tempVecC.subVectors(to, from).normalize());
    const hits = helperRay.intersectObjects([...world.walls, ...world.obstacles], false);
    const dist = from.distanceTo(to);
    return !hits.length || hits[0].distance > dist - 0.4;
  }

  function findCover(enemy, playerPos){
    let best = null;
    let bestDist = Infinity;
    for(const cover of coverPoints){
      const distToEnemy = enemy.mesh.position.distanceTo(cover.position);
      if(distToEnemy < bestDist && cover.normal.dot(tempVecA.subVectors(playerPos, cover.position).setY(0).normalize()) < -0.1){
        best = cover;
        bestDist = distToEnemy;
      }
    }
    return best;
  }

  function findFlank(enemy){
    const obstacle = world.obstacles[Math.floor(Math.random()*world.obstacles.length)];
    if(!obstacle) return null;
    const bbox = new THREE.Box3().setFromObject(obstacle);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const lateral = tempVecB.subVectors(center, controls.getObject().position).setY(0).normalize();
    const perpendicular = new THREE.Vector3(-lateral.z, 0, lateral.x);
    const offset = perpendicular.multiplyScalar(size.length() * 0.5 + CONFIG.AI.flankRadius);
    return center.clone().add(offset);
  }

  function patchedEnemyHitscanShoot(enemy){
    const now = performance.now();
    if(now - game.roundStartAt < 1200) return;
    const origin = enemy.mesh.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    const targetHeadHeight = playerState.crouched ? 0.4 : 0.9;
    const playerTarget = controls.getObject().position.clone().add(new THREE.Vector3(0, targetHeadHeight, 0));
    tempVecA.subVectors(playerTarget, origin).normalize();

    const extraSpread = now < enemy.suppressedUntil * 1000 ? CONFIG.STIM.suppressionSpread : 0;
    const yawOff = (Math.random()*2-1) * (enemy.aimSpread + extraSpread);
    const pitchOff = (Math.random()*2-1) * ((enemy.aimSpread*0.6) + extraSpread*0.4);
    tempEuler.set(pitchOff, yawOff, 0);
    tempQuat.setFromEuler(tempEuler);
    tempVecA.applyQuaternion(tempQuat).normalize();

    helperRay.set(origin, tempVecA);
    const statics = [...world.walls, ...world.obstacles];
    const hits = helperRay.intersectObjects(statics, false);

    const playerPos = controls.getObject().position.clone().add(new THREE.Vector3(0, targetHeadHeight, 0));
    const distToPlayer = origin.distanceTo(playerPos);
    let blocked = false;
    for(const mesh of statics){
      const arr = helperRay.intersectObject(mesh, false);
      if(arr.length && arr[0].distance < distToPlayer){ blocked = true; break; }
    }

    let hitPoint = origin.clone().add(tempVecA.clone().multiplyScalar(100));
    if(!blocked){
      patchedDamagePlayer(difficulty.params.enemyDamage);
      hitPoint.copy(playerPos);
    } else if(hits.length){
      hitPoint.copy(hits[0].point);
    }
    spawnTracer?.(origin, hitPoint, 0.45);
  }

  // ---------------------------------------------------------------------------
  // SPAWN/ROUNDS
  // ---------------------------------------------------------------------------
  function patchedStartNextRound(){
    if(playerState.buyPhase){
      endBuyPhase();
    }
    const params = difficulty.params;
    game.round += 1;
    ui.roundEl.textContent = `Round: ${game.round}`;
    const toSpawn = params.spawnBase + Math.floor(game.round * params.spawnScale);
    game.enemiesRemaining = toSpawn;
    ui.enemiesEl.textContent = `Hayatta Kalan Düşman: ${game.enemiesRemaining}`;
    game.spawnQueue = toSpawn;
    game.spawnDelay = 0;
    game.state = 'spawning';
    game.roundStartAt = performance.now();
    patchedShowRoundBanner(`ROUND ${game.round} — ${difficulty.name}`);
  }

  function patchedAnimate(){
    requestAnimationFrame(patchedAnimate);
    const delta = Math.min(0.05, clock.getDelta());
    if(player.fireCooldown > 0) player.fireCooldown -= delta;
    if(getShooting() && player.fireCooldown <= 0){
      if(!playerState.semiAuto || playerState.semiAutoReady){
        patchedHitscanShoot();
      }
    } else if(!getShooting() && playerState.semiAuto){
      playerState.semiAutoReady = true;
    }

    if(game.state !== 'over'){
      patchedUpdatePlayer(delta);
      if(game.state !== 'buyPhase' && !playerState.storeOpen){
        patchedUpdateEnemies(delta);
      }
      if(functions.updateTracers) functions.updateTracers(delta);
      if(updateLoot) updateLoot(delta);
      patchedUpdateMinimap();
      handleSpawning(delta);
      updateBuyPhase(delta);
    }
    renderer.render(scene, camera);
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
    hideBuyBanner();
  }

  function patchedShowRoundBanner(text){
    if(originalShowRoundBanner) originalShowRoundBanner(text);
  }

  // ---------------------------------------------------------------------------
  // ECONOMY/STORE
  // ---------------------------------------------------------------------------
  function patchedRemoveEnemy(enemy){
    if(!enemy) return;
    const idx = enemies.indexOf(enemy);
    if(idx !== -1){
      maybeDropLoot(enemy.mesh.position);
      scene.remove(enemy.mesh);
      enemies.splice(idx,1);
      const now = performance.now();
      game.score += 10;
      ui.scoreEl.textContent = `Skor: ${game.score}`;
      const headshot = now - playerState.lastKillTime < CONFIG.ECONOMY.streakWindow && playerState.headshotStreak > 1;
      let reward = CONFIG.ECONOMY.baseKill;
      if(headshot) reward += CONFIG.ECONOMY.headshotBonus;
      if(playerState.headshotStreak >= 3) reward += CONFIG.ECONOMY.streakBonus;
      player.credits = (player.credits || 0) + reward;
      updateCredits();
      updateCreditLine();
      game.enemiesRemaining -= 1;
      ui.enemiesEl.textContent = `Hayatta Kalan Düşman: ${Math.max(game.enemiesRemaining,0)}`;
      if(game.enemiesRemaining <= 0 && game.spawnQueue <= 0 && enemies.length === 0){
        beginBuyPhase();
      }
    }
  }

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
  // UI/MINIMAP
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
    const yaw = camera.rotation.y;
    const project = (pos) => ({ x: size/2 + pos.x*scale, y: size/2 + pos.z*scale });
    const p = project(playerPos);
    minimapCtx.fillStyle = '#50c8ff';
    minimapCtx.beginPath();
    minimapCtx.arc(p.x, p.y, 6, 0, Math.PI*2);
    minimapCtx.fill();

    const coneLength = 26;
    const left = yaw - 0.35;
    const right = yaw + 0.35;
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

  // ---------------------------------------------------------------------------
  // PERF
  // ---------------------------------------------------------------------------
  function setupCoverPoints(){
    world.obstacles.forEach(ob => {
      const bbox = new THREE.Box3().setFromObject(ob);
      const center = bbox.getCenter(new THREE.Vector3());
      const size = bbox.getSize(new THREE.Vector3());
      const normal = new THREE.Vector3(0,0,1);
      coverPoints.push({ position: center.clone().add(new THREE.Vector3(size.x*0.5+0.6, 0, 0)), normal });
      coverPoints.push({ position: center.clone().add(new THREE.Vector3(-size.x*0.5-0.6, 0, 0)), normal: new THREE.Vector3(0,0,-1) });
      coverPoints.push({ position: center.clone().add(new THREE.Vector3(0, 0, size.z*0.5+0.6)), normal: new THREE.Vector3(1,0,0) });
      coverPoints.push({ position: center.clone().add(new THREE.Vector3(0, 0, -size.z*0.5-0.6)), normal: new THREE.Vector3(-1,0,0) });
      ob.userData.ricochet = size.length() > 6;
    });
  }

  function setupStaminaIcon(){
    if(!ui.ammoEl) return;
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
    const ratio = playerState.stamina / CONFIG.STAMINA.max;
    playerState.staminaFill.style.width = `${(ratio*100).toFixed(1)}%`;
    if(CONFIG.STORE.showStaminaHud || ratio < 0.9 || playerState.stamina < CONFIG.STAMINA.max){
      playerState.staminaIcon.style.opacity = '1';
    } else {
      playerState.staminaIcon.style.opacity = '0';
    }
  }

  function setupStore(){
    const overlay = document.createElement('div');
    overlay.id = 'storeOverlay';
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'none';
    overlay.style.background = 'rgba(5,10,18,0.84)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.color = '#fff';
    overlay.style.fontFamily = 'inherit';
    overlay.style.zIndex = '5';

    const panel = document.createElement('div');
    panel.style.position = 'absolute';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.width = 'min(520px, 90vw)';
    panel.style.background = 'rgba(12,18,28,0.85)';
    panel.style.border = '1px solid rgba(255,255,255,0.12)';
    panel.style.borderRadius = '16px';
    panel.style.padding = '24px';
    panel.style.boxShadow = '0 20px 40px rgba(0,0,0,0.45)';
    panel.style.pointerEvents = 'auto';

    const title = document.createElement('h2');
    title.textContent = 'Field Supply';
    title.style.margin = '0 0 12px';
    title.style.fontSize = '26px';
    panel.appendChild(title);

    const creditLine = document.createElement('div');
    creditLine.style.fontSize = '16px';
    creditLine.style.marginBottom = '16px';
    panel.appendChild(creditLine);
    playerState.creditLine = creditLine;

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gridTemplateColumns = 'repeat(auto-fit,minmax(220px,1fr))';
    list.style.gap = '14px';

    CONFIG.STORE.items.forEach(item => {
      const card = document.createElement('button');
      card.type = 'button';
      card.style.background = 'rgba(20,30,45,0.85)';
      card.style.border = '1px solid rgba(255,255,255,0.14)';
      card.style.borderRadius = '12px';
      card.style.padding = '12px';
      card.style.textAlign = 'left';
      card.style.color = '#fff';
      card.style.fontSize = '15px';
      card.style.cursor = 'pointer';
      card.innerHTML = `<strong>${item.label}</strong><br/><span style="opacity:.75;font-size:13px;">${item.description}</span><br/><span style="opacity:.6;font-size:12px;">${item.cost} CR</span>`;
      card.addEventListener('click', ()=>{
        if((player.credits||0) < item.cost) return;
        player.credits -= item.cost;
        item.apply();
        updateCredits();
        updateCreditLine();
      });
      list.appendChild(card);
    });
    panel.appendChild(list);

    const modPanel = document.createElement('div');
    modPanel.style.marginTop = '18px';
    modPanel.style.display = 'none';
    modPanel.style.gap = '12px';
    modPanel.style.gridTemplateColumns = '1fr 1fr';
    modPanel.style.fontSize = '14px';
    modPanel.style.color = '#fff';
    modPanel.style.pointerEvents = 'none';
    panel.appendChild(modPanel);
    playerState.modPanel = modPanel;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Return to Battle (Esc)';
    closeBtn.style.marginTop = '18px';
    closeBtn.style.padding = '10px 18px';
    closeBtn.style.borderRadius = '999px';
    closeBtn.style.border = 'none';
    closeBtn.style.background = '#29b5ff';
    closeBtn.style.color = '#02101c';
    closeBtn.style.fontWeight = '600';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', closeStore);
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    ui.hud.appendChild(overlay);
    playerState.storeOverlay = overlay;

    updateCredits();
  }

  function openModSelector(){
    if(!playerState.modPanel) return;
    playerState.modPanel.innerHTML = '<p style="margin:0 0 12px">Select a mod:</p>';
    playerState.modPanel.style.display = 'grid';
    playerState.modPanel.style.pointerEvents = 'auto';
    CONFIG.STORE.mods.forEach(mod => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${mod.label}`;
      btn.style.padding = '8px';
      btn.style.border = '1px solid rgba(255,255,255,0.15)';
      btn.style.borderRadius = '10px';
      btn.style.background = 'rgba(28,40,55,0.9)';
      btn.style.color = '#fff';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', ()=>{
        mod.apply();
        playerState.modPanel.style.display = 'none';
        playerState.modPanel.style.pointerEvents = 'none';
      });
      playerState.modPanel.appendChild(btn);
    });
  }

  function openStore(fromBuyPhase=false){
    if(playerState.storeOpen) return;
    playerState.storeOpen = true;
    playerState.storeOverlay.style.display = 'block';
    playerState.storeOverlay.focus?.();
    updateCredits();
    updateCreditLine();
    updateBuyBanner();
    controls.unlock();
    setTimeout(()=>{ playerState.storeOverlay.style.pointerEvents='auto'; }, 40);
    if(!fromBuyPhase) game.stateBeforeStore = game.state;
    game.state = 'store';
  }

  function closeStore(){
    if(!playerState.storeOpen) return;
    playerState.storeOpen = false;
    playerState.storeOverlay.style.display = 'none';
    if(game.state === 'store'){ game.state = game.stateBeforeStore || 'inRound'; }
    if(playerState.buyPhase){
      endBuyPhase();
      patchedStartNextRound();
    }
    controls.lock();
  }

  function updateCredits(){
    player.credits = player.credits || 0;
    if(!ui.creditsEl){
      const el = document.createElement('div');
      el.id = 'credits';
      el.style.position = 'absolute';
      el.style.left = '16px';
      el.style.bottom = '140px';
      el.style.fontSize = '18px';
      el.style.textShadow = '0 0 6px rgba(0,0,0,0.7)';
      ui.hud.appendChild(el);
      ui.creditsEl = el;
    }
    ui.creditsEl.textContent = `Kredi: ${player.credits}`;
  }

  function updateCreditLine(){
    if(playerState.creditLine){
      playerState.creditLine.textContent = `Available Credits: ${player.credits}`;
    }
  }

  let buyBanner;
  function showBuyBanner(){
    if(!buyBanner){
      buyBanner = document.createElement('div');
      buyBanner.id = 'buyBanner';
      buyBanner.style.position = 'absolute';
      buyBanner.style.top = '50%';
      buyBanner.style.left = '50%';
      buyBanner.style.transform = 'translate(-50%, -50%)';
      buyBanner.style.fontSize = 'clamp(32px,5vw,54px)';
      buyBanner.style.fontWeight = '700';
      buyBanner.style.letterSpacing = '4px';
      buyBanner.style.textShadow = '0 0 16px rgba(0,0,0,0.6)';
      buyBanner.style.pointerEvents = 'none';
      ui.hud.appendChild(buyBanner);
    }
    buyBanner.style.display = 'block';
    updateBuyBanner();
  }

  function updateBuyBanner(){
    if(!buyBanner || !playerState.buyPhase) return;
    buyBanner.textContent = `BUY PHASE — ${Math.ceil(game.buyTimer)}s`;
  }

  function hideBuyBanner(){
    if(buyBanner) buyBanner.style.display = 'none';
  }

  function updateArmorBadge(){
    if(!ui.armorBadge){
      const badge = document.createElement('div');
      badge.id = 'armorBadge';
      badge.style.position = 'absolute';
      badge.style.left = '16px';
      badge.style.bottom = '110px';
      badge.style.padding = '6px 10px';
      badge.style.fontSize = '14px';
      badge.style.background = 'rgba(0,0,0,0.45)';
      badge.style.border = '1px solid rgba(255,255,255,0.12)';
      badge.style.borderRadius = '10px';
      badge.style.textShadow = '0 0 6px rgba(0,0,0,0.7)';
      ui.hud.appendChild(badge);
      ui.armorBadge = badge;
    }
    if(playerState.armorCharges > 0){
      ui.armorBadge.textContent = `Armor: ${playerState.armorCharges}`;
      ui.armorBadge.style.display = 'block';
    } else if(ui.armorBadge){
      ui.armorBadge.style.display = 'none';
    }
  }

  function updateHealthBar(){
    if(!ui.healthBarEl) return;
    const ratio = player.health / 100;
    ui.healthBarEl.style.width = `${Math.min(ratio, 1) * 100}%`;
  }

  // ---------------------------------------------------------------------------
  // INPUT
  // ---------------------------------------------------------------------------
  function hookInput(){
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
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
  // HELPERS
  // ---------------------------------------------------------------------------
  function maybeDropLoot(position){
    if(functions.maybeDropLoot) functions.maybeDropLoot(position);
  }

  function safeCall(fn){
    if(typeof fn === 'function'){ fn(); }
  }

  function enableDebug(flag){
    PATCH_NS.debug = !!flag;
  }
}
