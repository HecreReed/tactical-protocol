import * as THREE from 'three';
import { G } from './state.js?v=28';
import { V3, rayAABB, raySphere, segHitsSphere, clamp, gauss, rand } from './utils.js?v=28';
import { WIDE } from './config.js?v=28';
import { WORLD } from './mapData.js?v=28';
import { colQuery } from './map.js?v=28';
const LIM = WORLD/2 - .5;
import { tracer, impactFX, bloodFX, muzzleFX, addMesh, spawnDrop } from './effects.js?v=28';
import { sfx } from './audio.js?v=28';
import { damageUtility } from './abilityRuntime.js';
import { handleAgentKill, resolveAgentFatality } from './agentMechanics.js';

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
    scopeToggle: false,
    ab: {}, abCd: {},
    channel: null,           // 'plant' | 'defuse'
    knifeUlt: 0, arrowUlt: 0, rocketUlt: 0,
    flashUntil: 0, revealedUntil: 0, resistUntil: 0,
    suppressedUntil: 0, dazeUntil: 0,
    empressUntil: 0, lastKillAt: -99,
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
  if(G.now < ent.dazeUntil) s *= .6;
  if(G.now < ent.stimUntil) s *= 1.12;
  if(ent.channel) s = 0;
  return s * ent.speedMul;
}

// ---------- collision ----------
function collideAxis(ent, axis, r, h){
  const p = ent.pos;
  const step = ent.vel.y > 2 ? .2 : .35;  // 上升稍严防止穿箱，但不过分硬以免视角抖
  const all = [colQuery(p.x-r-1, p.z-r-1, p.x+r+1, p.z+r+1), G.dynColliders];
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
  const all = [colQuery(p.x-r-1, p.z-r-1, p.x+r+1, p.z+r+1), G.dynColliders];
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
  const all = [colQuery(p.x-r-1, p.z-r-1, p.x+r+1, p.z+r+1), G.dynColliders];
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
  p.x = clamp(p.x, -LIM, LIM);
  p.z = clamp(p.z, -LIM, LIM);
}

// ---------- hitboxes ----------
const _hs = [
  { part:'h', c:V3(), r:.18 },
  { part:'b', c:V3(), r:.32 },
  { part:'l', c:V3(), r:.3 },
];
export function hitSpheres(ent){
  const s = ent.crouch ? .78 : 1;
  const y = ent.pos.y;
  _hs[0].c.set(ent.pos.x, y + 1.64*s + (ent.crouch ? .12 : 0), ent.pos.z);
  _hs[1].c.set(ent.pos.x, y + 1.18*s, ent.pos.z);
  _hs[2].c.set(ent.pos.x, y + .5*s, ent.pos.z);
  return _hs;
}

export function rayWalls(o, dir, maxD){
  let best = maxD;
  for(const b of G.dynColliders){ const d = rayAABB(o,dir,b,best); if(d<best) best = d; }
  // 静态碰撞体：沿射线分段查询空间网格（长弹道也只访问路径附近的桶）
  const CH = 14;
  for(let t=0; t<maxD && t<best; t+=CH){
    const t2 = Math.min(t+CH, maxD);
    const x1=o.x+dir.x*t, z1=o.z+dir.z*t, x2=o.x+dir.x*t2, z2=o.z+dir.z*t2;
    const list = colQuery(Math.min(x1,x2)-1, Math.min(z1,z2)-1, Math.max(x1,x2)+1, Math.max(z1,z2)+1);
    for(const b of list){ const d = rayAABB(o,dir,b,best); if(d<best) best = d; }
    if(best <= t2) break;
  }
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
  if(killer && killer !== target && killer.team === target.team) return;   // 友伤关闭
  if(target.resistUntil > G.now) dmg *= .55;
  const absorb = Math.min(target.armor, dmg * .66);
  const hpBefore = target.hp;
  target.armor -= Math.floor(absorb);
  target.hp -= Math.round(dmg - absorb);
  target.lastDamaged = G.now;
  // 战斗报告（无畏契约式）：记录玩家给予/承受伤害
  const R = G.report;
  if(R && killer && killer !== target){
    const applied = Math.round(hpBefore - Math.max(0, target.hp));
    if(killer.isPlayer && !target.isPlayer){
      const r = R.dealt[target.id] || (R.dealt[target.id] = {name:target.name, agent:target.agent, dmg:0, hits:0, killed:false});
      r.dmg += applied; r.hits++;
    } else if(target.isPlayer && !killer.isPlayer){
      const r = R.taken[killer.id] || (R.taken[killer.id] = {name:killer.name, agent:killer.agent, dmg:0, hits:0, killedMe:false});
      r.dmg += applied; r.hits++;
    }
  }
  if(target.isPlayer){ G.hooks.damaged?.(killer); sfx.hurt(); }
  if(target.hp <= 0){
    target.hp = 0;
    killEnt(target, killer, weaponName, part);
  }
}

export function killEnt(target, killer, weaponName, part){
  if(resolveAgentFatality(target, G.now).prevented) return;
  const R = G.report;
  if(R && killer && killer !== target){
    if(killer.isPlayer && !target.isPlayer){
      const r = R.dealt[target.id] || (R.dealt[target.id] = {name:target.name, agent:target.agent, dmg:0, hits:0, killed:false});
      r.killed = true;
    } else if(target.isPlayer && !killer.isPlayer){
      const r = R.taken[killer.id] || (R.taken[killer.id] = {name:killer.name, agent:killer.agent, dmg:0, hits:0, killedMe:false});
      r.killedMe = true;
    }
  }
  target.alive = false;
  target.deaths++;
  target.ult = Math.min(9, target.ult + 1);
  target.channel = null;
  target.knifeUlt = 0;
  if(killer && killer !== target){
    killer.kills++;
    killer.lastKillAt = G.now;
    killer.money = Math.min(9000, killer.money + 200);
    killer.ult = Math.min(9, killer.ult + 1);
    handleAgentKill(killer, target, G.now);
    if(killer.knifeUlt > 0) killer.knifeUlt = 5;
    // 魅影女皇仪式：击杀全额回血并刷新持续时间
    if((killer.empressUntil||0) > G.now){
      killer.healQueue = Math.min(killer.healQueue + 100, 100);
      killer.empressUntil = G.now + 14;
      killer.stimUntil = Math.max(killer.stimUntil||0, G.now + 14);
    }
    if(killer.isPlayer){ sfx.kill(); G.hooks.hitmarker?.(part==='h', true); }
  }
  // 掉落武器：主武器优先，其次非初始手枪
  const dropW = target.weapons.primary ||
    (target.weapons.secondary && target.weapons.secondary.id!=='classic' ? target.weapons.secondary : null);
  if(dropW){
    if(target.weapons.primary === dropW) target.weapons.primary = null;
    else target.weapons.secondary = makeWeapon('classic');
    spawnDrop(dropW, target.pos.clone());
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
    // 哨戒炮塔受击（挡在弹道上时优先命中）
    let tHit = null;
    for(const t of G.turrets){
      if(t.team === shooter.team || t.hp <= 0) continue;
      const d = raySphere(origin, dir, V3(t.pos.x, t.pos.y+.6, t.pos.z), .62, hit.dist);
      if(d < hit.dist && (!tHit || d < tHit.d)) tHit = { t, d };
    }
    if(tHit){
      end = V3().copy(origin).addScaledVector(dir, tHit.d);
      if(tHit.t.utility){
        damageUtility(G.utilities, tHit.t.utility.id, 34, shooter.team);
        tHit.t.hp = Math.max(0, tHit.t.utility.hp);
      } else tHit.t.hp -= 34;
      impactFX(end);
      tracer(V3().copy(origin).addScaledVector(dir, 1.2).addScaledVector(right, shooter.isPlayer?.12:0), end, tracerColor);
      if(shooter.isPlayer) G.hooks.hitmarker?.(false, false);
      continue;
    }
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
import { AGENTS } from './config.js?v=28';
const teamColors = { ally:{head:0x3fb3ad, trim:0x2f8f8a}, enemy:{head:0xd04555, trim:0xb03040} };
export function buildBody(ent){
  const g = new THREE.Group();
  const tc = teamColors[ent.team];
  const agentColor = AGENTS[ent.agent]?.color ?? 0x8fd3ff;
  const torsoMat = new THREE.MeshStandardMaterial({color:agentColor, roughness:.7, emissive:agentColor, emissiveIntensity:.12});
  const darkMat = new THREE.MeshStandardMaterial({color:0x2a333c, roughness:.9});
  const greyMat = new THREE.MeshStandardMaterial({color:0x3c4650, roughness:.75});
  const hmat = new THREE.MeshStandardMaterial({color:tc.head, roughness:.6});
  const trimMat = new THREE.MeshStandardMaterial({color:tc.trim, roughness:.55, emissive:tc.trim, emissiveIntensity:.3});

  // 双腿（髋部铰点，可摆动）
  const legGeo = new THREE.BoxGeometry(.17,.78,.22); legGeo.translate(0,-.39,0);
  const legL = new THREE.Mesh(legGeo, darkMat); legL.position.set(-.13,.82,0);
  const legR = new THREE.Mesh(legGeo, darkMat); legR.position.set(.13,.82,0);
  // 靴子
  const bootGeo = new THREE.BoxGeometry(.19,.12,.3); bootGeo.translate(0,-.72,-.03);
  const bootL = new THREE.Mesh(bootGeo, greyMat); legL.add(bootL);
  const bootR = new THREE.Mesh(bootGeo, greyMat); legR.add(bootR);
  // 髋部
  const hips = new THREE.Mesh(new THREE.BoxGeometry(.46,.18,.3), greyMat);
  hips.position.y = .9;
  // 躯干组（含胸甲/背包/肩甲/手臂/头）——蹲下时整体下沉
  const upper = new THREE.Group(); upper.position.y = 0;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.54,.56,.32), torsoMat);
  torso.position.y = 1.24;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(.42,.3,.08), trimMat);
  chest.position.set(0,1.3,-.19);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.36,.4,.15), greyMat);
  pack.position.set(0,1.22,.23);
  const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(.16,.12,.3), trimMat);
  shoulderL.position.set(-.35,1.48,0);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = .35;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(.56,.08,.34), trimMat);
  belt.position.y = 1.0;
  // 双臂（肩部铰点）：右臂托枪前伸，左臂扶护木
  const armGeo = new THREE.BoxGeometry(.12,.56,.14); armGeo.translate(0,-.28,0);
  const armL = new THREE.Mesh(armGeo, torsoMat); armL.position.set(-.33,1.45,0); armL.rotation.x = -.9; armL.rotation.z = .35;
  const armR = new THREE.Mesh(armGeo, torsoMat); armR.position.set(.33,1.45,0); armR.rotation.x = -1.05; armR.rotation.z = -.15;
  // 头 + 头盔 + 发光面甲
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17,10,8), hmat);
  head.position.y = 1.66;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.19,10,6,0,Math.PI*2,0,Math.PI*.55), greyMat);
  helmet.position.y = 1.68;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.24,.07,.05),
    new THREE.MeshStandardMaterial({color:0x0c141c, emissive:tc.trim, emissiveIntensity:.8}));
  visor.position.set(0,1.67,-.16);
  // 手中武器（机匣+弹匣+枪管）
  const gunGrp = new THREE.Group();
  const gBody = new THREE.Mesh(new THREE.BoxGeometry(.07,.09,.5), new THREE.MeshStandardMaterial({color:0x232b33, roughness:.5, metalness:.3}));
  const gMag = new THREE.Mesh(new THREE.BoxGeometry(.05,.12,.06), greyMat); gMag.position.set(0,-.09,-.05);
  const gBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.2,6), darkMat);
  gBarrel.rotation.x = Math.PI/2; gBarrel.position.set(0,.015,-.33);
  gunGrp.add(gBody, gMag, gBarrel);
  gunGrp.position.set(.2,1.32,-.36); gunGrp.rotation.x = .06;
  upper.add(torso, chest, pack, shoulderL, shoulderR, belt, armL, armR, head, helmet, visor, gunGrp);
  g.add(legL, legR, hips, upper);
  g.traverse(m=>{ if(m.isMesh) m.castShadow = true; });
  g.userData = { legL, legR, armL, armR, upper };
  // name tag for allies
  if(ent.team==='ally'){
    const c = document.createElement('canvas'); c.width=256; c.height=64;
    const x = c.getContext('2d');
    x.font='700 30px Arial'; x.textAlign='center';
    x.fillStyle='#'+agentColor.toString(16).padStart(6,'0');
    x.fillText(ent.name, 128, 40);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c), transparent:true, depthTest:false}));
    sp.scale.set(1.6,.4,1);
    sp.position.y = 2.1;
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
  // 走路摆腿摆臂 + 蹲姿下沉
  const ud = ent.mesh.userData;
  if(ud && ud.legL){
    const sp = Math.hypot(ent.vel.x, ent.vel.z);
    const amp = Math.min(.55, sp*.1);
    const swing = Math.sin(G.now*9.5 + ent.id*2) * amp;
    ud.legL.rotation.x = swing;
    ud.legR.rotation.x = -swing;
    ud.armL.rotation.x = -.9 - swing*.5;
    ud.armR.rotation.x = -1.05 + swing*.35;
    ud.upper.position.y = ent.crouch ? -.3 : 0;
    ud.legL.scale.y = ent.crouch ? .72 : 1;
    ud.legR.scale.y = ent.crouch ? .72 : 1;
  }
}

export function resetBody(ent){
  if(!ent.mesh) return;
  ent.mesh.rotation.set(0, ent.yaw, 0);
  ent.mesh.position.copy(ent.pos);
  if(ent.tag) ent.tag.visible = true;
  ent.mesh.visible = !ent.isPlayer;
}
