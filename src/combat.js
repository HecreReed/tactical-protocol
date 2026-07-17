import * as THREE from 'three';
import { G } from './state.js?v=13';
import { V3, rayAABB, raySphere, segHitsSphere, clamp, gauss, rand } from './utils.js?v=13';
import { WIDE } from './config.js?v=13';
import { tracer, impactFX, bloodFX, muzzleFX, addMesh } from './effects.js?v=13';
import { sfx } from './audio.js?v=13';

let nextId = 1;

export function makeWeapon(id){
  const def = WIDE(id);
  return { id, def, ammo:def.mag, reserve:def.res, nextFire:0, reloadEnd:0, shots:0, lastShot:0 };
}

export function makeEnt({name, team, agent, isPlayer=false}){
  const ent = {
    id: nextId++, name, team, agent, isPlayer,
    alive: true, hp: 100, armor: 0, armorMax: 0,
    pos: V3(), vel: V3(), yaw: 0, pitch: 0,
    crouch: false, walking: false, grounded: true,
    speedMul: 1, slowUntil: 0, stimUntil: 0,
    money: 800, kills: 0, deaths: 0, ult: 0,
    weapons: { primary: null, secondary: makeWeapon('classic'), knife: makeWeapon('knife') },
    slot: 'secondary',
    ab: {}, abCd: {},
    channel: null,           // 'plant' | 'defuse'
    knifeUlt: 0, arrowUlt: 0,
    flashUntil: 0, revealedUntil: 0, resistUntil: 0,
    mesh: null, tag: null, gunMesh: null,
    ai: null,
    lastDamaged: -99, lastShotAt: -99,
    healQueue: 0,
    stepAcc: 0,
    dashUntil: 0,
    glide: false, ultWeapon: null,
  };
  return ent;
}

export function curWeapon(ent){
  if(ent.knifeUlt > 0 && ent.ultWeapon) return ent.ultWeapon;
  return ent.weapons[ent.slot] || ent.weapons.knife;
}

export function eyeH(ent){ return ent.crouch ? 1.15 : 1.55; }
export function eyePos(ent, out){
  out = out || V3();
  return out.set(ent.pos.x, ent.pos.y + eyeH(ent), ent.pos.z);
}

export function moveSpeed(ent){
  const w = curWeapon(ent);
  const catMul = {melee:1.12, ult:1.12, pistol:1.0, smg:.96, rifle:.9, sniper:.84, heavy:.82, shotgun:.96}[w.def.cat] || 1;
  let s = 6.0 * catMul;
  if(ent.walking) s *= .52;
  if(ent.crouch) s *= .62;
  if(ent.ads) s *= .75;
  if(G.now < ent.slowUntil) s *= .45;
  if(G.now < ent.stimUntil) s *= 1.12;
  if(ent.channel) s = 0;
  return s * ent.speedMul;
}

// ---------- collision ----------
function collideAxis(ent, axis, r, h){
  const p = ent.pos;
  const step = ent.vel.y > 2 ? .2 : .35;  // 上升稍严防止穿箱，但不过分硬以免视角抖
  const all = [G.colliders, G.dynColliders];
  for(const list of all) for(const b of list){
    if(p.y + h <= b.min.y + .08 || p.y + step >= b.max.y) continue;
    if(p.x + r <= b.min.x || p.x - r >= b.max.x) continue;
    if(p.z + r <= b.min.z || p.z - r >= b.max.z) continue;
    if(axis==='x'){
      const cx = (b.min.x+b.max.x)/2;
      p.x = p.x < cx ? b.min.x - r : b.max.x + r;
    } else {
      const cz = (b.min.z+b.max.z)/2;
      p.z = p.z < cz ? b.min.z - r : b.max.z + r;
    }
  }
}
// 站到 topY 上后头顶是否有足够空间（防止被吸到屋内箱顶后卡进屋顶）
function headroomClear(p, r, h, topY){
  const all = [G.colliders, G.dynColliders];
  for(const list of all) for(const b of list){
    if(b.min.y < topY + .1 || b.min.y >= topY + h) continue;
    if(p.x + r <= b.min.x || p.x - r >= b.max.x) continue;
    if(p.z + r <= b.min.z || p.z - r >= b.max.z) continue;
    return false;
  }
  return true;
}
export function moveEntity(ent, dt){
  const r = .38, h = ent.crouch ? 1.3 : 1.75;
  const p = ent.pos;
  p.x += ent.vel.x * dt; collideAxis(ent,'x',r,h);
  p.z += ent.vel.z * dt; collideAxis(ent,'z',r,h);
  // vertical
  ent.vel.y -= 19 * dt;
  if(ent.glide && ent.vel.y < -2) ent.vel.y = -2;   // 风影被动：滞空滑翔
  p.y += ent.vel.y * dt;
  const rising = ent.vel.y > 0;
  let floorY = 0;
  const all = [G.colliders, G.dynColliders];
  for(const list of all) for(const b of list){
    if(p.x + r <= b.min.x || p.x - r >= b.max.x) continue;
    if(p.z + r <= b.min.z || p.z - r >= b.max.z) continue;
    // head bump
    if(rising && p.y + h > b.min.y && p.y + .55 < b.min.y){ p.y = b.min.y - h; ent.vel.y = 0; }
    // 只在非上升阶段吸附地面/箱顶，且要求头顶有空间
    if(!rising && b.max.y > floorY && b.max.y <= p.y + .55 && headroomClear(p, r, h, b.max.y)) floorY = b.max.y;
  }
  if(p.y <= floorY){
    p.y = floorY;
    if(ent.vel.y < 0) ent.vel.y = 0;
    ent.grounded = true;
  } else ent.grounded = p.y - floorY < .05;
  // bounds safety
  p.x = clamp(p.x, -39.5, 39.5);
  p.z = clamp(p.z, -39.5, 39.5);
}

// ---------- hitboxes ----------
export function hitSpheres(ent){
  const s = ent.crouch ? .78 : 1;
  const y = ent.pos.y;
  return [
    { part:'h', c:V3(ent.pos.x, y + 1.5*s + (ent.crouch ? .12 : 0), ent.pos.z), r:.17 },
    { part:'b', c:V3(ent.pos.x, y + 1.05*s, ent.pos.z), r:.31 },
    { part:'l', c:V3(ent.pos.x, y + .45*s, ent.pos.z), r:.29 },
  ];
}

export function rayWalls(o, dir, maxD){
  let best = maxD;
  for(const b of G.colliders){ const d = rayAABB(o,dir,b,best); if(d<best) best = d; }
  for(const b of G.dynColliders){ const d = rayAABB(o,dir,b,best); if(d<best) best = d; }
  return best;
}

export function traceRay(o, dir, maxD, ignore){
  const wallD = rayWalls(o, dir, maxD);
  let hitEnt = null, part = null, best = wallD;
  for(const e of G.ents){
    if(e === ignore || !e.alive) continue;
    for(const s of hitSpheres(e)){
      const d = raySphere(o, dir, s.c, s.r, best);
      if(d < best){ best = d; hitEnt = e; part = s.part; }
    }
  }
  return { dist: best, ent: hitEnt, part, wall: hitEnt===null && wallD < maxD };
}

export function losBlocked(a, b){
  const dir = V3(b.x-a.x, b.y-a.y, b.z-a.z);
  const len = dir.length(); if(len < 1e-4) return false;
  dir.divideScalar(len);
  if(rayWalls(a, dir, len) < len - .01) return true;
  for(const s of G.smokes) if(segHitsSphere(a, b, s.pos, s.r*.92)) return true;
  return false;
}

// ---------- damage ----------
export function applyDamage(target, dmg, killer, weaponName, part){
  if(!target.alive) return;
  if(target.resistUntil > G.now) dmg *= .55;
  const absorb = Math.min(target.armor, dmg * .66);
  target.armor -= Math.floor(absorb);
  target.hp -= Math.round(dmg - absorb);
  target.lastDamaged = G.now;
  if(target.isPlayer){ G.hooks.damaged?.(killer); sfx.hurt(); }
  if(target.hp <= 0){
    target.hp = 0;
    killEnt(target, killer, weaponName, part);
  }
}

export function killEnt(target, killer, weaponName, part){
  target.alive = false;
  target.deaths++;
  target.ult = Math.min(9, target.ult + 1);
  target.channel = null;
  target.knifeUlt = 0;
  if(killer && killer !== target){
    killer.kills++;
    killer.money = Math.min(9000, killer.money + 200);
    killer.ult = Math.min(9, killer.ult + 1);
    if(killer.knifeUlt > 0) killer.knifeUlt = 5;
    if(killer.isPlayer){ sfx.kill(); G.hooks.hitmarker?.(part==='h', true); }
  }
  // corpse
  if(target.mesh){
    target.mesh.rotation.x = -Math.PI/2;
    target.mesh.position.y = .25;
    if(target.tag) target.tag.visible = false;
  }
  G.corpses.push({ ent: target, pos: target.pos.clone() });
  G.hooks.killfeed?.(killer, target, weaponName, part==='h');
  G.hooks.onDeath?.(target, killer);
}

// 鞭尸：射线检测尸体（不挡活人子弹，仅在未命中实体时结算）
function corpseHit(origin, dir, maxD){
  let best = Infinity, cp = null;
  for(const c of G.corpses){
    const center = V3(c.pos.x, c.pos.y + .3, c.pos.z);
    const d = raySphere(origin, dir, center, .55, maxD);
    if(d < best){ best = d; cp = c; }
  }
  return cp ? best : Infinity;
}

// ---------- firing ----------
export function fireShot(shooter, baseDir, def, spreadRad, opts={}){
  const origin = eyePos(shooter);
  const right = V3().crossVectors(baseDir, V3(0,1,0)).normalize();
  const up = V3().crossVectors(right, baseDir).normalize();
  const pellets = def.pellets || 1;
  let hitAny = false, hs = false;
  const tracerColor = opts.color ?? 0xffe9a0;
  for(let i=0;i<pellets;i++){
    const rr = spreadRad * Math.sqrt(Math.random());
    const th = Math.random()*Math.PI*2;
    const a = rr*Math.cos(th) + (opts.yawOff||0);
    const b = rr*Math.sin(th) + (opts.pitchOff||0);
    const dir = V3().copy(baseDir).addScaledVector(right, a).addScaledVector(up, b).normalize();
    const hit = traceRay(origin, dir, 200, shooter);
    let end = V3().copy(origin).addScaledVector(dir, hit.dist);
    let corpse = false;
    if(!hit.ent){
      const cd = corpseHit(origin, dir, hit.dist);
      if(cd < hit.dist){ corpse = true; end = V3().copy(origin).addScaledVector(dir, cd); }
    }
    tracer(V3().copy(origin).addScaledVector(dir, 1.2).addScaledVector(right, shooter.isPlayer?.12:0), end, tracerColor);
    if(hit.ent){
      hitAny = true;
      const tiers = Object.keys(def.dmg).map(Number).sort((x,y)=>x-y);
      let tier = tiers[0];
      for(const t of tiers) if(hit.dist >= t) tier = t;
      const row = def.dmg[tier];
      const dmg = hit.part==='h' ? row.h : hit.part==='b' ? row.b : row.l;
      if(hit.part==='h') hs = true;
      bloodFX(end);
      applyDamage(hit.ent, dmg, shooter, def.name, hit.part);
    } else if(corpse){
      bloodFX(end);
    } else if(hit.dist < 200){
      impactFX(end);
      if(G.player){ sfx.impact(end.distanceTo(G.player.pos)); }
    }
  }
  if(shooter.isPlayer && hitAny){
    G.hooks.hitmarker?.(hs, false);
    if(hs) sfx.headshot(); else sfx.hit();
  }
  muzzleFX(V3().copy(origin).addScaledVector(baseDir, .9));
  const d = G.player && !shooter.isPlayer ? origin.distanceTo(G.player.pos) : 0;
  sfx.shot(opts.sndCat || def.cat, d);
  G.hooks.noise?.(shooter.pos, shooter);
  shooter.lastShotAt = G.now;
}

export function meleeAttack(ent, heavy){
  const origin = eyePos(ent);
  const dir = V3(); 
  const cp = Math.cos(ent.pitch);
  dir.set(-cp*Math.sin(ent.yaw), Math.sin(ent.pitch), -cp*Math.cos(ent.yaw));
  const hit = traceRay(origin, dir, 2.2, ent);
  sfx.shot('melee', 0);
  if(hit.ent){
    bloodFX(V3().copy(origin).addScaledVector(dir, hit.dist));
    applyDamage(hit.ent, heavy?150:50, ent, '近战', hit.part);
    if(ent.isPlayer) G.hooks.hitmarker?.(false,false);
  } else {
    const cd = corpseHit(origin, dir, hit.dist);
    if(cd < hit.dist) bloodFX(V3().copy(origin).addScaledVector(dir, cd));
  }
}

// ---------- bot body ----------
import { AGENTS } from './config.js?v=13';
const teamColors = { ally:{head:0x3fb3ad, trim:0x2f8f8a}, enemy:{head:0xd04555, trim:0xb03040} };
export function buildBody(ent){
  const g = new THREE.Group();
  const tc = teamColors[ent.team];
  const agentColor = AGENTS[ent.agent]?.color ?? 0x8fd3ff;
  const torsoMat = new THREE.MeshStandardMaterial({color:agentColor, roughness:.7, emissive:agentColor, emissiveIntensity:.12});
  const hmat = new THREE.MeshStandardMaterial({color:tc.head, roughness:.6});
  const legs = new THREE.Mesh(new THREE.BoxGeometry(.42,.8,.3), new THREE.MeshStandardMaterial({color:0x2a333c, roughness:.9}));
  legs.position.y = .4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.56,.62,.34), torsoMat);
  torso.position.y = 1.06;
  // 队伍色肩甲 + 胸带
  const trimMat = new THREE.MeshStandardMaterial({color:tc.trim, roughness:.55, emissive:tc.trim, emissiveIntensity:.25});
  const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(.14,.14,.36), trimMat);
  shoulderL.position.set(-.35,1.3,0);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = .35;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(.58,.1,.36), trimMat);
  belt.position.y = .82;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17,10,8), hmat);
  head.position.y = 1.52;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.22,.07,.06), new THREE.MeshStandardMaterial({color:0x101820}));
  visor.position.set(0,1.53,-.15);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(.08,.1,.62), new THREE.MeshStandardMaterial({color:0x232b33}));
  gun.position.set(.2,1.18,-.34);
  g.add(legs,torso,shoulderL,shoulderR,belt,head,visor,gun);
  g.traverse(m=>{ if(m.isMesh) m.castShadow = true; });
  // name tag for allies
  if(ent.team==='ally'){
    const c = document.createElement('canvas'); c.width=256; c.height=64;
    const x = c.getContext('2d');
    x.font='700 30px Arial'; x.textAlign='center';
    x.fillStyle='#'+agentColor.toString(16).padStart(6,'0');
    x.fillText(ent.name, 128, 40);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c), transparent:true, depthTest:false}));
    sp.scale.set(1.6,.4,1);
    sp.position.y = 2.0;
    g.add(sp);
    ent.tag = sp;
  }
  ent.mesh = g;
  addMesh(g);
}

export function updateBodyPose(ent){
  if(!ent.mesh) return;
  if(!ent.alive) return;
  ent.mesh.position.copy(ent.pos);
  ent.mesh.rotation.set(0, ent.yaw, 0);
  ent.mesh.visible = !ent.isPlayer && G.spectatingEnt !== ent;
}

export function resetBody(ent){
  if(!ent.mesh) return;
  ent.mesh.rotation.set(0, ent.yaw, 0);
  ent.mesh.position.copy(ent.pos);
  if(ent.tag) ent.tag.visible = true;
  ent.mesh.visible = !ent.isPlayer;
}
