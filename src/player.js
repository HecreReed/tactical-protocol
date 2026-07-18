import * as THREE from 'three';
import { G, sens } from './state.js?v=25';
import { V3, clamp, dirFromYawPitch, gauss, deg, lerp } from './utils.js?v=25';
import { SKINS, AGENTS } from './config.js?v=25';
import { curWeapon, moveSpeed, moveEntity, fireShot, meleeAttack, eyeH, eyePos, traceRay, applyDamage, rayWalls } from './combat.js?v=25';
import { useAbility, startCast, confirmCast, cancelCast, THROW_PARAMS } from './abilities.js?v=25';
import { tracer, spawnSmoke } from './effects.js?v=25';
import { sfx } from './audio.js?v=25';

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
  // Pointer Lock 已知浏览器 bug：偶发超大 movementX/Y 尖峰导致视角猛跳。
  // 过滤：突然出现且远大于上一帧的超大位移视为坏数据，用上一帧值代替。
  let lastMX = 0, lastMY = 0;
  const despike = (v, last)=>{
    if(Math.abs(v) > 200 && Math.abs(v) > Math.abs(last)*4 + 120) return last;
    return clamp(v, -400, 400);
  };
  window.addEventListener('mousemove', e=>{
    if(!G.locked || !G.player?.alive) return;
    const mx = despike(e.movementX, lastMX);
    const my = despike(e.movementY, lastMY);
    lastMX = mx; lastMY = my;
    const s = sens() * (G.player.ads && curWeapon(G.player).def.ads.scope ? .35 : 1);
    G.player.yaw -= mx * s;
    G.player.pitch = clamp(G.player.pitch - my * s, -1.55, 1.55);
  });
  window.addEventListener('mousedown', e=>{
    // 狙击枪右键 = 切换开/关镜（不需要按住）
    if(e.button===2 && G.locked && G.player?.alive && !G.castMode && !G.smokeMode){
      const wd = curWeapon(G.player).def;
      if(wd.ads?.scope) G.player.scopeToggle = !G.player.scopeToggle;
    }
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
    if(e.code==='Tab'){ e.preventDefault(); G.hooks.showBoard?.(true); }
    if(!G.player) return;
    const p = G.player;
    if(!p.alive) return;
    // 天穹战术地图打开时：E/Esc/其他技能键关闭地图
    if(G.hooks.smokeMapKey?.(e.code)) return;
    // 下烟模式中：用左键确认，其他按键取消
    if(G.smokeMode && G.smokeMode.agent === p && !G.mouse.lmb){
      if(e.code==='KeyC'||e.code==='KeyQ'||e.code==='KeyE'||e.code==='KeyX'||
         e.code==='Digit1'||e.code==='Digit2'||e.code==='Digit3'){
        cancelSmokeMode();
        return;
      }
    }
    // 装备式施法中：换武器键收回技能；技能键切换/收回
    if(G.castMode && G.castMode.ent === p){
      if(e.code==='Digit1'||e.code==='Digit2'||e.code==='Digit3'||e.code==='KeyR'){
        cancelCast();
      }
    }
    switch(e.code){
      case 'KeyR': startReload(p); break;
      case 'Digit1': switchSlot(p,'primary'); break;
      case 'Digit2': switchSlot(p,'secondary'); break;
      case 'Digit3': switchSlot(p,'knife'); break;
      case 'KeyC': startCast(p,'c'); break;
      case 'KeyQ': startCast(p,'q'); break;
      case 'KeyE': startCast(p,'e'); break;
      case 'KeyX': if(G.castMode) cancelCast(); if(useAbility(p,'x')) buildViewModel(); break;
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

function cancelSmokeMode(){
  if(!G.smokeMode) return;
  if(G.smokeMode.ring) G.scene.remove(G.smokeMode.ring);
  G.smokeMode = null;
}

// ---------- 装备式施法瞄准指示环 ----------
let castRing = null;
function ensureCastRing(){
  if(castRing) return castRing;
  castRing = new THREE.Mesh(new THREE.RingGeometry(.8,1,28),
    new THREE.MeshBasicMaterial({color:0x39d0c9, transparent:true, opacity:.85, side:THREE.DoubleSide, depthWrite:false}));
  castRing.rotation.x = -Math.PI/2;
  castRing.visible = false;
  G.scene.add(castRing);
  return castRing;
}
const ARC_N = 48;
let castArc = null;
function ensureCastArc(){
  if(castArc) return castArc;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N*3), 3));
  castArc = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color:0x39d0c9, transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false }));
  castArc.frustumCulled = false;
  castArc.visible = false;
  G.scene.add(castArc);
  return castArc;
}
function hideCastArc(){ if(castArc) castArc.visible = false; }
function updateCastArc(p, cm, alt=false){
  const prm = THROW_PARAMS[cm.def.type];
  if(!prm){ hideCastArc(); return; }
  const arc = ensureCastArc();
  const speed = alt ? 7 : prm[0], up = alt ? 2.2 : prm[1];
  const dir = dirFromYawPitch(p.yaw, p.pitch);
  const pos = eyePos(p).addScaledVector(dir, .6);
  const vel = dir.clone().multiplyScalar(speed).add(V3(0, up, 0));
  const a = arc.geometry.attributes.position.array;
  const DT = .05;
  let n = 0;
  for(let i=0;i<ARC_N;i++){
    a[i*3]=pos.x; a[i*3+1]=pos.y; a[i*3+2]=pos.z;
    n = i+1;
    vel.y -= 11*DT;
    const step = vel.length()*DT;
    const d = vel.clone().normalize();
    if(rayWalls(pos, d, step + .1) <= step){ break; }
    pos.addScaledVector(d, step);
    if(pos.y <= .15) break;
  }
  for(let i=n;i<ARC_N;i++){ a[i*3]=pos.x; a[i*3+1]=pos.y; a[i*3+2]=pos.z; }
  arc.geometry.attributes.position.needsUpdate = true;
  arc.visible = true;
}
function hideCastRing(){ if(castRing) castRing.visible = false; hideCastArc(); }
function updateCastRing(p, cm){
  if(cm.kind !== 'aim'){ hideCastRing(); updateCastArc(p, cm, false); return; }
  hideCastArc();
  const ring = ensureCastRing();
  const t = cm.def.type;
  const dir = dirFromYawPitch(p.yaw, p.pitch);
  const o = eyePos(p);
  const hx = -Math.sin(p.yaw), hz = -Math.cos(p.yaw);
  let pt, r = 1.2;
  const ground = (maxD)=>{ const d = Math.min(rayWalls(o, dir, maxD), maxD); const v = o.clone().addScaledVector(dir, d); v.y = 0; return v; };
  switch(t){
    case 'quake':      pt = V3(p.pos.x+hx*7.5, 0, p.pos.z+hz*7.5); r = 3.2; break;
    case 'wall':       pt = V3(p.pos.x+hx*4, 0, p.pos.z+hz*4); r = 2.6; break;
    case 'firewall':   pt = V3(p.pos.x+hx*5, 0, p.pos.z+hz*5); r = 1.4; break;
    case 'tripwire':   pt = ground(9); break;
    case 'turret':     pt = V3(p.pos.x+hx*1.4, 0, p.pos.z+hz*1.4); r = .9; break;
    case 'cage':       pt = ground(26); r = 3.4; break;
    case 'toxicSmoke': pt = ground(40); r = 3.8; break;
    case 'toxicWall':  pt = V3(p.pos.x+hx*6, 0, p.pos.z+hz*6); r = 1.4; break;
    case 'shadowStep': { const d = Math.min(rayWalls(o, dir, 9), 9)*.9; pt = o.clone().addScaledVector(dir, d); pt.y = 0; break; }
    case 'alarmBot':   pt = ground(8); r = 1; break;
    case 'stimBeacon': pt = V3(p.pos.x+hx*1.2, 0, p.pos.z+hz*1.2); r = 5.5; break;
    case 'paranoia': case 'wallFlash': case 'stunWave':
      pt = V3(p.pos.x+hx*6, 0, p.pos.z+hz*6); r = 1.6; break;
    default: pt = ground(25); break;
  }
  ring.scale.setScalar(r);
  ring.position.set(pt.x, .1, pt.z);
  ring.visible = true;
}

export function switchSlot(p, slot){
  if(p.knifeUlt>0) return;
  if(slot==='primary' && !p.weapons.primary) return;
  p.scopeToggle = false;
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
  if(G.castMode && G.castMode.ent === p){
    // 手持技能（装备式施法）：发光法球 + 握持手
    const col = AGENTS[p.agent]?.color ?? 0x39d0c9;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.055,12,10),
      new THREE.MeshStandardMaterial({color:col, emissive:col, emissiveIntensity:.7, roughness:.35}));
    orb.position.set(0,-.01,-.18);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(.055,.05,.11), dark);
    hand.position.set(0,-.075,-.1);
    hand.rotation.x = .35;
    g.add(orb, hand);
  } else if(p.rocketUlt > 0){
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(.055,.06,.62,10), dark);
    tube.rotation.x = Math.PI/2; tube.position.z = -.3;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(.07,.075,.1,10), accent);
    muzzle.rotation.x = Math.PI/2; muzzle.position.z = -.62;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.035,.1,.045), dark);
    grip.position.set(0,-.09,-.12); grip.rotation.x = .3;
    g.add(tube, muzzle, grip);
  } else if(w.def.cat==='melee' || p.knifeUlt>0){
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.015,.05,.26), accent);
    blade.position.z = -.16;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.03,.04,.1), dark);
    g.add(blade, handle);
  } else {
    // ---- 精细化枪模：按类别组装（机匣/枪管/护木/准星/弹匣/枪托/消音器等） ----
    const lenMap = {pistol:.28, smg:.42, rifle:.55, sniper:.68, heavy:.55, shotgun:.5};
    const L = lenMap[w.def.cat] || .4;
    const grey = new THREE.MeshStandardMaterial({color:0x39424c, roughness:.5, metalness:.35});
    // 机匣
    const body = new THREE.Mesh(new THREE.BoxGeometry(.045,.075,L*.55), dark);
    body.position.z = -L*.32;
    g.add(body);
    // 护木（前段稍窄）
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.04,.06,L*.4), grey);
    guard.position.set(0,-.005,-L*.75);
    g.add(guard);
    // 枪管 + 枪口
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.012,.013,L*.35,8), dark);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0,.012,-L-.05);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.06,8), accent);
    muzzle.rotation.x = Math.PI/2; muzzle.position.set(0,.012,-L-.2);
    g.add(barrel, muzzle);
    // 准星（前柱 + 后照门）
    const fSight = new THREE.Mesh(new THREE.BoxGeometry(.006,.03,.01), dark);
    fSight.position.set(0,.055,-L-.02);
    const rSight = new THREE.Mesh(new THREE.BoxGeometry(.03,.022,.012), dark);
    rSight.position.set(0,.052,-L*.12);
    g.add(fSight, rSight);
    // 握把 + 扳机护圈
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.034,.1,.045), dark);
    grip.position.set(0,-.075,-.06); grip.rotation.x = .32;
    const tGuard = new THREE.Mesh(new THREE.BoxGeometry(.008,.012,.07), grey);
    tGuard.position.set(0,-.045,-.12);
    g.add(grip, tGuard);
    // 侧面能量条（皮肤发光装饰）
    const railGlow = new THREE.Mesh(new THREE.BoxGeometry(.004,.014,L*.42), accent);
    railGlow.position.set(.026,.012,-L*.4);
    g.add(railGlow);
    if(w.def.cat!=='pistol'){
      // 弹匣（微弯两段）
      const mag1 = new THREE.Mesh(new THREE.BoxGeometry(.032,.07,.05), grey);
      mag1.position.set(0,-.075,-L*.5); mag1.rotation.x = -.12;
      const mag2 = new THREE.Mesh(new THREE.BoxGeometry(.03,.05,.046), dark);
      mag2.position.set(0,-.125,-L*.48); mag2.rotation.x = -.3;
      g.add(mag1, mag2);
      // 枪托
      const stock = new THREE.Mesh(new THREE.BoxGeometry(.036,.06,.14), grey);
      stock.position.set(0,-.012,.1);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(.04,.08,.02), dark);
      pad.position.set(0,-.015,.18);
      g.add(stock, pad);
    } else {
      // 手枪：套筒 + 击锤
      const slide = new THREE.Mesh(new THREE.BoxGeometry(.042,.03,L*.7), grey);
      slide.position.set(0,.038,-L*.35);
      const hammer = new THREE.Mesh(new THREE.BoxGeometry(.014,.02,.02), dark);
      hammer.position.set(0,.04,.02);
      g.add(slide, hammer);
    }
    if(w.def.cat==='smg'){
      const fGrip = new THREE.Mesh(new THREE.BoxGeometry(.026,.07,.03), dark);
      fGrip.position.set(0,-.055,-L*.8);
      g.add(fGrip);
    }
    if(w.def.cat==='shotgun'){
      const pump = new THREE.Mesh(new THREE.BoxGeometry(.05,.05,.12), accent);
      pump.position.set(0,-.03,-L*.7);
      g.add(pump);
    }
    if(w.def.cat==='heavy'){
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.045,12), grey);
      drum.rotation.z = Math.PI/2; drum.position.set(0,-.06,-L*.42);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(.012,.03,.16), dark);
      handle.position.set(0,.075,-L*.3);
      g.add(drum, handle);
    }
    if(w.def.ads?.scope){
      // 狙击镜：镜筒 + 发光物镜 + 支架
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.16,10), dark);
      tube.rotation.x = Math.PI/2; tube.position.set(0,.078,-L*.42);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(.019,12),
        new THREE.MeshStandardMaterial({color:0x223a4a, emissive:0x39d0c9, emissiveIntensity:.6}));
      lens.position.set(0,.078,-L*.42-.081);
      const mount = new THREE.Mesh(new THREE.BoxGeometry(.012,.03,.04), grey);
      mount.position.set(0,.055,-L*.42);
      g.add(tube, lens, mount);
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
  {
    const wd = curWeapon(p).def;
    p.ads = !G.castMode && wd.cat!=='melee' && p.knifeUlt<=0 &&
      (wd.ads?.scope ? p.scopeToggle : G.mouse.rmb);
  }

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

  // 装备式施法（拿在手上）：左键释放 / 右键低抛或收回
  if(G.castMode && G.castMode.ent === p){
    const cm = G.castMode;
    const phOk = phase==='live' || phase==='planted';
    if(!phOk || G.now > cm.until || !p.alive){
      cancelCast(); hideCastRing();
    } else {
      updateCastRing(p, cm);
      if(G.locked && G.mouse.lmb){
        G.mouse.lmb = false;
        hideCastRing();
        confirmCast(false);
      } else if(G.locked && G.mouse.rmb){
        G.mouse.rmb = false;
        hideCastRing();
        if(cm.kind==='throw') confirmCast(true);
        else cancelCast();
      }
    }
  } else hideCastRing();

  const canShoot = (phase==='live'||phase==='planted') && !p.channel && G.now > P.equipUntil && !G.buyOpen && G.locked && !G.castMode;
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
    } else if(p.rocketUlt > 0){
      if(G.now >= w.nextFire){
        w.nextFire = G.now + .9;
        const dir = dirFromYawPitch(p.yaw, p.pitch);
        const o = eyePos(p);
        G.projectiles.push({ type:'rocket', owner:p, pos:o.clone().addScaledVector(dir,.8),
          vel: dir.clone().multiplyScalar(26).add(V3(0,.4,0)), born:G.now });
        sfx.shot('ult', 0);
        p.rocketUlt--;
        P.vmKick = .14; P.camShake = 1;
        G.mouse.lmb = false;
        if(p.rocketUlt<=0) buildViewModel();
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
  P.bloom = approach(P.bloom, 0, 4.4*dt);
  P.vmKick = approach(P.vmKick, 0, .5*dt);
  P.camShake = approach(P.camShake, 0, 3*dt);

  // interact (plant/defuse)
  G.hooks.interactTick?.(p, dt);

  // 下烟模式（暗幕 · 原版幽影式）：瞄准指针可越过墙体投至远处地面，左键投放
  if(G.smokeMode){
    const sm = G.smokeMode;
    if(G.now > sm.until){ cancelSmokeMode(); }
    else {
      const dir = dirFromYawPitch(p.yaw, p.pitch);
      const o = eyePos(p);
      const maxD = 45;
      // 无视墙体：向下瞄时投影到地面交点，平视/上瞄时按视角距离推远
      let d;
      if(dir.y < -0.04) d = clamp(-o.y/dir.y, 4, maxD);
      else d = clamp(maxD * (1 - dir.y*1.4), 10, maxD);
      const pt = o.clone().addScaledVector(dir, d); pt.y = 0;
      if(!sm.ring){
        sm.ring = new THREE.Mesh(new THREE.RingGeometry(4.3,4.5,32),
          new THREE.MeshBasicMaterial({color:0x39d0c9, transparent:true, opacity:.85, side:THREE.DoubleSide, depthWrite:false}));
        sm.ring.rotation.x = -Math.PI/2;
        G.scene.add(sm.ring);
      }
      sm.ring.position.copy(pt).y += .06;
      if(G.mouse.lmb){
        G.mouse.lmb = false;
        spawnSmoke(pt, 4.5, 15);   // 暗幕烟 15s（原版）
        const ent = sm.agent;
        if(sm.key==='e') ent.abCd.e = G.now + sm.cd;
        ent.ab[sm.key].n--;
        G.hooks.refreshBuy?.();
        sfx.smokePop(pt.distanceTo(p.pos));
        G.scene.remove(sm.ring);
        G.smokeMode = null;
      }
    }
  }

  updateCamera(p, dt);
}

import { hitSpheres } from './combat.js?v=25';
import { raySphere } from './utils.js?v=25';
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
  let spread = w.def.spread.base + moveFactor*w.def.spread.mv*2.3 + P.bloom;
  // 首发精准（原版手感）：停枪 0.35s 后第一发几乎必中准星
  if(w.shots <= 1 && moveFactor < .35) spread *= .3;
  if(ads) spread *= adsDef.spread ?? .6;
  if(p.crouch) spread *= .8;
  if(!p.grounded) spread *= 2.5;
  if(G.now < p.dazeUntil) spread *= 1.8;
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
  P.bloom += w.def.spread.bloom * .2;
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
  cam.rotation.y = p.yaw;                 // 不再叠加水平后座晃动，视角只随鼠标转动
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
