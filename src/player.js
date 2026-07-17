import * as THREE from 'three';
import { G, sens } from './state.js?v=11';
import { V3, clamp, dirFromYawPitch, gauss, deg, lerp } from './utils.js?v=11';
import { SKINS } from './config.js?v=11';
import { curWeapon, moveSpeed, moveEntity, fireShot, meleeAttack, eyeH, eyePos, traceRay, applyDamage } from './combat.js?v=11';
import { useAbility } from './abilities.js?v=11';
import { tracer } from './effects.js?v=11';
import { sfx } from './audio.js?v=11';

const P = {
  recoilPitch: 0, recoilYaw: 0, bloom: 0,
  vmKick: 0, bobT: 0,
  equipUntil: 0,
  lastMelee: 0,
  spectateIdx: 0,
  camShake: 0,
};
export const playerView = P;

let vmGroup = null, vmGun = null;

export function initPlayerInput(){
  window.addEventListener('mousemove', e=>{
    if(!G.locked || !G.player?.alive) return;
    const s = sens() * (G.player.ads && curWeapon(G.player).def.ads.scope ? .35 : 1);
    G.player.yaw -= e.movementX * s;
    G.player.pitch = clamp(G.player.pitch - e.movementY * s, -1.55, 1.55);
  });
  window.addEventListener('mousedown', e=>{
    if(!G.locked) return;
    if(e.button===0) G.mouse.lmb = true;
    if(e.button===2) G.mouse.rmb = true;
  });
  window.addEventListener('mouseup', e=>{
    if(e.button===0) G.mouse.lmb = false;
    if(e.button===2) G.mouse.rmb = false;
  });
  window.addEventListener('contextmenu', e=> e.preventDefault());
  window.addEventListener('keydown', e=>{
    G.keys[e.code] = true;
    if(!G.player) return;
    const p = G.player;
    if(e.code==='Tab'){ e.preventDefault(); G.hooks.showBoard?.(true); }
    if(!p.alive) return;
    switch(e.code){
      case 'KeyR': startReload(p); break;
      case 'Digit1': switchSlot(p,'primary'); break;
      case 'Digit2': switchSlot(p,'secondary'); break;
      case 'Digit3': switchSlot(p,'knife'); break;
      case 'KeyC': useAbility(p,'c'); break;
      case 'KeyQ': useAbility(p,'q'); break;
      case 'KeyE': useAbility(p,'e'); break;
      case 'KeyX': if(useAbility(p,'x')) buildViewModel(); break;
    }
  });
  window.addEventListener('keyup', e=>{
    G.keys[e.code] = false;
    if(e.code==='Tab') G.hooks.showBoard?.(false);
  });
}

let skinMats = { body: null, accent: null };
function curSkin(){ return SKINS.find(s=>s.id===G.settings.skin) || SKINS[0]; }
export function playerTracerColor(){ return curSkin().tracer; }

export function switchSlot(p, slot){
  if(p.knifeUlt>0) return;
  if(slot==='primary' && !p.weapons.primary) return;
  if(p.slot === slot) return;
  p.slot = slot;
  const w = curWeapon(p);
  w.reloadEnd = 0;
  P.equipUntil = G.now + .45;
  P.recoilPitch = P.recoilYaw = P.bloom = 0;
  sfx.equip();
  buildViewModel();
}

export function startReload(p){
  const w = curWeapon(p);
  if(w.def.cat==='melee' || w.reloadEnd > G.now) return;
  if(w.ammo >= w.def.mag || w.reserve <= 0) return;
  w.reloadEnd = G.now + w.def.rl;
  sfx.reload();
}

function finishReload(w){
  const need = w.def.mag - w.ammo;
  const take = Math.min(need, w.reserve);
  w.ammo += take; w.reserve -= take;
}

// ---------------- view model ----------------
export function buildViewModel(){
  if(!vmGroup){
    vmGroup = new THREE.Group();
    G.camera.add(vmGroup);
  }
  if(vmGun){ vmGroup.remove(vmGun); vmGun = null; }
  const p = G.player; if(!p) return;
  const w = curWeapon(p);
  const g = new THREE.Group();
  const sk = curSkin();
  const dark = new THREE.MeshStandardMaterial({color:sk.body, roughness:.55, metalness:.25});
  const accent = new THREE.MeshStandardMaterial({
    color: p.knifeUlt>0 ? 0x7fd0d4 : sk.accent, roughness:.4, metalness:.35,
    emissive: sk.glow, emissiveIntensity: sk.glow ? .55 : 0,
  });
  skinMats = { body: dark, accent };
  if(w.def.cat==='melee' || p.knifeUlt>0){
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.015,.05,.26), accent);
    blade.position.z = -.16;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.03,.04,.1), dark);
    g.add(blade, handle);
  } else {
    const lenMap = {pistol:.28, smg:.42, rifle:.55, sniper:.68, heavy:.55, shotgun:.5};
    const L = lenMap[w.def.cat] || .4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(.045,.085,L), dark);
    body.position.z = -L/2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.14), accent);
    barrel.rotation.x = Math.PI/2; barrel.position.z = -L-.06;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.035,.1,.045), dark);
    grip.position.set(0,-.08,-.05); grip.rotation.x = .3;
    g.add(body, barrel, grip);
    if(w.def.cat!=='pistol'){
      const mag = new THREE.Mesh(new THREE.BoxGeometry(.035,.11,.05), accent);
      mag.position.set(0,-.09,-L*.55); mag.rotation.x = -.15;
      g.add(mag);
    }
    if(w.def.ads?.scope){
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.14), dark);
      scope.rotation.x = Math.PI/2; scope.position.set(0,.075,-L*.45);
      g.add(scope);
    }
  }
  vmGun = g;
  vmGroup.add(g);
}

// ---------------- update ----------------
export function updatePlayer(dt){
  const p = G.player;
  if(!p) return;
  if(!p.alive){ spectate(dt); return; }
  G.spectatingEnt = null;

  const phase = G.match?.phase;
  const canMove = phase==='buy' || phase==='live' || phase==='planted' || phase==='end';

  p.crouch = !!G.keys['ControlLeft'] || !!G.keys['KeyZ'];
  p.walking = !!G.keys['ShiftLeft'];
  p.ads = G.mouse.rmb && curWeapon(p).def.cat!=='melee' && p.knifeUlt<=0;

  // movement intent
  let fx = 0, fz = 0;
  if(G.keys['KeyW']) fz -= 1;
  if(G.keys['KeyS']) fz += 1;
  if(G.keys['KeyA']) fx -= 1;
  if(G.keys['KeyD']) fx += 1;
  const spd = canMove ? moveSpeed(p) : 0;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let wx = (-sy*-fz + cy*fx), wz = (-cy*-fz - sy*fx);
  const l = Math.hypot(wx,wz);
  if(l>0){ wx/=l; wz/=l; }
  const dashing = G.now < p.dashUntil;
  if(!dashing){
    const accel = p.grounded ? 40 : 8;
    p.vel.x = approach(p.vel.x, wx*spd, accel*dt);
    p.vel.z = approach(p.vel.z, wz*spd, accel*dt);
  }
  if(canMove && G.keys['Space'] && p.grounded && !p.channel){
    p.vel.y = 5.6; p.grounded = false;
  }
  // 风影被动：空中按住空格滑翔（缓降）
  p.glide = p.agent==='fengying' && !p.grounded && !!G.keys['Space'] && canMove;
  moveEntity(p, dt);

  // footsteps
  const hspd = Math.hypot(p.vel.x, p.vel.z);
  if(p.grounded && hspd > 2){
    p.stepAcc += hspd*dt;
    const stride = p.walking||p.crouch ? 3.4 : 2.6;
    if(p.stepAcc > stride){ p.stepAcc = 0; if(!p.walking && !p.crouch) sfx.step(0); G.hooks.noise?.(p.pos, p, !p.walking&&!p.crouch); }
  }

  // weapon logic
  const w = curWeapon(p);
  if(w.reloadEnd && G.now >= w.reloadEnd){ finishReload(w); w.reloadEnd = 0; }

  const canShoot = (phase==='live'||phase==='planted') && !p.channel && G.now > P.equipUntil && !G.buyOpen && G.locked;
  if(canShoot && G.mouse.lmb){
    if(p.knifeUlt > 0){
      if(G.now >= w.nextFire){
        w.nextFire = G.now + .33;
        const dir = dirFromYawPitch(p.yaw, p.pitch);
        fireShot(p, dir, {name:'锋刃', cat:'ult', dmg:{0:{h:150,b:50,l:50}}, pellets:1}, deg(.15), {sndCat:'ult', color:playerTracerColor()});
        p.knifeUlt--;
        P.vmKick = .05;
        if(p.knifeUlt<=0){ p.slot='knife'; buildViewModel(); }
      }
    } else if(p.arrowUlt > 0){
      if(G.now >= w.nextFire){
        w.nextFire = G.now + .8;
        // 穿墙能量矢：只检测实体命中
        const dir = dirFromYawPitch(p.yaw, p.pitch);
        const o = eyePos(p);
        let bestD = 200, bestEnt = null, bestPart = null;
        for(const e of G.ents){
          if(e===p || !e.alive) continue;
          const hit = traceThroughWalls(o, dir, e);
          if(hit && hit.d < bestD){ bestD = hit.d; bestEnt = e; bestPart = hit.part; }
        }
        const end = o.clone().addScaledVector(dir, bestEnt?bestD:60);
        tracer(o.clone().addScaledVector(dir,1.2), end, 0x80c0ff);
        sfx.shot('ult', 0);
        if(bestEnt){
          applyDamage(bestEnt, bestPart==='h'?180:90, p, '猎杀之矢', bestPart);
          G.hooks.hitmarker?.(bestPart==='h', false);
        }
        p.arrowUlt--;
        P.vmKick = .09;
        if(p.arrowUlt<=0) buildViewModel();
      }
    } else if(w.def.cat==='melee'){
      if(G.now - P.lastMelee > .45){ P.lastMelee = G.now; meleeAttack(p, false); P.vmKick = .09; }
    } else if(G.now >= w.nextFire && !w.reloadEnd){
      if(w.ammo <= 0){
        sfx.dryfire(); w.nextFire = G.now + .25;
        if(w.reserve>0) startReload(p);
      } else {
        shootPlayer(p, w, dt);
        if(!w.def.alt) G.mouse.lmb = false; // semi-auto: require re-click
      }
    }
  }
  if(G.mouse.rmb && w.def.cat==='melee' && canShoot && G.now - P.lastMelee > .8){
    P.lastMelee = G.now; meleeAttack(p, true); P.vmKick = .13; G.mouse.rmb = false;
  }

  // recoil recovery & bloom decay
  const rec = w.def.recoil;
  P.recoilPitch = approach(P.recoilPitch, 0, (rec.decay||30)*8*dt);
  P.recoilYaw = approach(P.recoilYaw, 0, (rec.decay||30)*5*dt);
  P.bloom = approach(P.bloom, 0, 3.2*dt);
  P.vmKick = approach(P.vmKick, 0, .5*dt);
  P.camShake = approach(P.camShake, 0, 3*dt);

  // interact (plant/defuse)
  G.hooks.interactTick?.(p, dt);

  updateCamera(p, dt);
}

import { hitSpheres } from './combat.js?v=11';
import { raySphere } from './utils.js?v=11';
function traceThroughWalls(o, dir, e){
  let best = null;
  for(const s of hitSpheres(e)){
    const d = raySphere(o, dir, s.c, s.r, 200);
    if(d < 200 && (!best || d < best.d)) best = { d, part: s.part };
  }
  return best;
}

function shootPlayer(p, w, dt){
  w.ammo--;
  if(G.now - w.lastShot > .4) w.shots = 0;
  w.shots++;
  w.lastShot = G.now;
  w.nextFire = G.now + w.def.fi * (G.now < p.stimUntil ? .85 : 1);

  const ads = p.ads, adsDef = w.def.ads;
  const hspd = Math.hypot(p.vel.x, p.vel.z);
  const moveFactor = clamp(hspd/6, 0, 1);
  let spread = w.def.spread.base + moveFactor*w.def.spread.mv*3 + P.bloom;
  if(ads) spread *= adsDef.spread ?? .6;
  if(p.crouch) spread *= .8;
  if(!p.grounded) spread *= 2.5;
  const spreadRad = deg(spread);

  // recoil offsets applied to shot dir
  const recScale = ads ? (adsDef.recoil ?? .7) : 1;
  const yawOff = deg(P.recoilYaw*.01) * recScale;
  const pitchOff = deg(P.recoilPitch*.01) * recScale;

  const dir = dirFromYawPitch(p.yaw, p.pitch);
  fireShot(p, dir, w.def, spreadRad, {yawOff, pitchOff, color: playerTracerColor()});

  // build up recoil
  const rec = w.def.recoil;
  P.recoilPitch = Math.min(rec.cap, P.recoilPitch + rec.perShot*(1 + w.shots*.06));
  P.recoilYaw += (Math.sin(w.shots*.9) + gauss()*.4) * rec.wander;
  P.bloom += w.def.spread.bloom * .25;
  P.vmKick = Math.min(.12, P.vmKick + .035);
  P.camShake = Math.min(1, P.camShake + .25);
}

function approach(v, target, amt){
  if(v < target) return Math.min(target, v+amt);
  return Math.max(target, v-amt);
}

function updateCamera(p, dt){
  const cam = G.camera;
  cam.position.set(p.pos.x, p.pos.y + eyeH(p) + (p.ads?0:Math.sin(P.bobT)*0.008), p.pos.z);
  const hspd = Math.hypot(p.vel.x,p.vel.z);
  if(p.grounded && hspd>1) P.bobT += dt*hspd*1.7; 
  cam.rotation.order = 'YXZ';
  const visRecoil = deg(P.recoilPitch*.01)*.5;
  cam.rotation.y = p.yaw + deg(P.recoilYaw*.01)*.3;
  cam.rotation.x = p.pitch + visRecoil;
  cam.rotation.z = 0;

  // FOV / ADS
  const w = curWeapon(p);
  const targetFov = p.ads && w.def.ads.fov ? w.def.ads.fov : G.settings.fov;
  cam.fov = lerp(cam.fov, targetFov, Math.min(1, dt*14));
  cam.updateProjectionMatrix();

  // view model
  if(vmGroup){
    const sk = curSkin();
    if(sk.rainbow && skinMats.accent){
      skinMats.accent.color.setHSL((G.now*.12)%1, .7, .6);
      skinMats.accent.emissive.setHSL((G.now*.12+.5)%1, .8, .3);
    }
    const vm = w.def.vm;
    const scoped = p.ads && w.def.ads.scope;
    vmGroup.visible = !scoped;
    const tx = p.ads ? 0 : vm.x;
    const ty = (p.ads ? -.12 : vm.y) + Math.sin(P.bobT)*0.004*(p.ads?0.2:1);
    const tz = vm.z + P.vmKick;
    vmGroup.position.lerp(V3(tx,ty,tz), Math.min(1, dt*18));
    if(vmGun){
      vmGun.rotation.x = vm.rot[0]*(p.ads?0:1) + P.vmKick*1.4;
      vmGun.rotation.z = vm.rot[2]*(p.ads?0:1);
      const rl = w.reloadEnd > G.now;
      vmGun.position.y = rl ? -0.12 - Math.sin((w.reloadEnd-G.now)*6)*.03 : 0;
      vmGun.rotation.x += rl ? .5 : 0;
    }
  }
}

function spectate(dt){
  const allies = G.ents.filter(e=>e.team==='ally' && e.alive && !e.isPlayer);
  const cam = G.camera;
  if(allies.length){
    const t = allies[P.spectateIdx % allies.length];
    G.spectatingEnt = t;               // 隐藏被观战者自己的模型，防止挡镜头
    cam.position.set(t.pos.x, t.pos.y + 1.55, t.pos.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = t.yaw; cam.rotation.x = t.pitch; cam.rotation.z = 0;
    if(vmGroup) vmGroup.visible = false;
  } else {
    G.spectatingEnt = null;
    cam.position.set(0, 42, 12);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-1.25, 0, 0);
    if(vmGroup) vmGroup.visible = false;
  }
  cam.fov = lerp(cam.fov, G.settings.fov, dt*10);
  cam.updateProjectionMatrix();
}

let obsTarget = null;
let obsPos = new THREE.Vector3(0, 6, 0);
let obsYaw = 0, obsPitch = -0.25;
let obsFP = false;
export function toggleObserverView(){
  obsFP = !obsFP;
  G.hooks.hudMsg?.(obsFP ? '第一人称观战（V 切回第三人称）' : '第三人称观战（V 切回第一人称）');
}
export function updateObserver(dt){
  const cam = G.camera;
  const alive = G.ents.filter(e=>e.alive);
  // 按空格循环目标，或当前目标死亡时自动换
  if(alive.length){
    if(!obsTarget || !obsTarget.alive){
      P.spectateIdx = 0;
      obsTarget = alive[0];
    }
    const t = alive[P.spectateIdx % alive.length];
    if(t !== obsTarget) obsTarget = t;
    G.spectatingEnt = t;
    cam.rotation.order = 'YXZ';
    if(obsFP){
      // 第一人称：直接使用目标视角
      obsPos.lerp(new THREE.Vector3(t.pos.x, t.pos.y + eyeH(t), t.pos.z), Math.min(1, dt*20));
      cam.position.copy(obsPos);
      let dy = t.yaw - obsYaw;
      while(dy > Math.PI) dy -= Math.PI*2;
      while(dy < -Math.PI) dy += Math.PI*2;
      obsYaw += dy * Math.min(1, dt*14);
      obsPitch += (t.pitch - obsPitch) * Math.min(1, dt*14);
      cam.rotation.y = obsYaw;
      cam.rotation.x = obsPitch;
      cam.rotation.z = 0;
    } else {
      // 第三人称：目标身后上方，看向前方
      const d = 3.2;
      const tx = t.pos.x - Math.sin(t.yaw)*d;
      const tz = t.pos.z - Math.cos(t.yaw)*d;
      const ty = t.pos.y + 2.4;
      obsPos.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt*6));
      cam.position.copy(obsPos);
      const targetYaw = t.yaw;
      const targetPitch = -0.18;
      // 平滑插值角度
      let dy = targetYaw - obsYaw;
      while(dy > Math.PI) dy -= Math.PI*2;
      while(dy < -Math.PI) dy += Math.PI*2;
      obsYaw += dy * Math.min(1, dt*5);
      obsPitch += (targetPitch - obsPitch) * Math.min(1, dt*5);
      cam.rotation.y = obsYaw;
      cam.rotation.x = obsPitch;
      cam.rotation.z = 0;
    }
  } else {
    G.spectatingEnt = null;
    cam.position.lerp(new THREE.Vector3(0, 42, 12), Math.min(1, dt*3));
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-1.25, 0, 0);
  }
  cam.fov = lerp(cam.fov, G.settings.fov, dt*10);
  cam.updateProjectionMatrix();
  if(vmGroup) vmGroup.visible = false;
}

window.addEventListener('mousedown', ()=>{
  if(G.player && !G.player.alive) P.spectateIdx++;
});
window.addEventListener('keydown', e=>{
  if(!G.player && e.code==='Space'){
    P.spectateIdx++;
    const alive = G.ents.filter(e=>e.alive);
    if(alive.length) obsTarget = alive[P.spectateIdx % alive.length];
  }
  if(!G.player && G.observer && e.code==='KeyV') toggleObserverView();
});
