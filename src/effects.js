import * as THREE from 'three';
import { G } from './state.js?v=28';
import { V3 } from './utils.js?v=28';
import { sfx } from './audio.js?v=28';
import { registerUtility } from './abilityRuntime.js';

const pools = { tracers:[], flashes:[] };
let scene;

export function initFX(s){ scene = s; }

function getTracer(){
  let t = pools.tracers.find(t=>!t.active);
  if(!t){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6),3));
    const mat = new THREE.LineBasicMaterial({color:0xffe9a0, transparent:true, opacity:.95, blending:THREE.AdditiveBlending, depthWrite:false});
    t = {line:new THREE.Line(geo,mat), active:false, life:0};
    scene.add(t.line);
    pools.tracers.push(t);
  }
  return t;
}
export function tracer(from,to,color=0xffe9a0){
  const t = getTracer();
  const p = t.line.geometry.attributes.position.array;
  p[0]=from.x;p[1]=from.y;p[2]=from.z;p[3]=to.x;p[4]=to.y;p[5]=to.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.material.color.setHex(color);
  t.line.material.opacity = .95;
  t.line.visible = true; t.active = true; t.life = .07;
}

function getFlash(color, size){
  let f = pools.flashes.find(f=>!f.active);
  if(!f){
    f = {mesh:new THREE.Mesh(new THREE.SphereGeometry(1,6,4),
      new THREE.MeshBasicMaterial({transparent:true})), active:false, life:0, max:0};
    scene.add(f.mesh);
    pools.flashes.push(f);
  }
  f.mesh.material.color.setHex(color);
  f.mesh.scale.setScalar(size);
  f.mesh.visible = true; f.active = true;
  return f;
}
export function impactFX(p){ const f=getFlash(0xe0e0d8,.09); f.mesh.position.copy(p); f.life=f.max=.1; }
export function bloodFX(p){ const f=getFlash(0xc02030,.16); f.mesh.position.copy(p); f.life=f.max=.16; }
export function muzzleFX(p){ const f=getFlash(0xffd070,.12); f.mesh.position.copy(p); f.life=f.max=.055; f.grow=2.5; }
export function teleportFX(p){ const f=getFlash(0x8040d0,.55); f.mesh.position.copy(p).y+=1; f.life=f.max=.4; f.grow=5; }
export function flashFX(p){ const f=getFlash(0xffffff,.5); f.mesh.position.copy(p); f.life=f.max=.45; f.grow=18; }

// ---- smokes ----
const smokeMat = new THREE.MeshStandardMaterial({color:0xdce2ea, roughness:1, transparent:true, opacity:.985, flatShading:false, side:THREE.DoubleSide});
export function spawnSmoke(pos, r, dur){
  // 主体 + 内部发光核，营造体积感
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r*.55, 2),
    new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.18, depthWrite:false}));
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), smokeMat.clone());
  mesh.position.copy(pos).y += r*0.5;
  core.position.copy(mesh.position);
  mesh.scale.setScalar(.1); core.scale.setScalar(.1);
  scene.add(mesh); scene.add(core);
  const s = {pos:mesh.position.clone(), r, until:G.now+dur, mesh, core, born:G.now};
  G.smokes.push(s);
  const d = G.player ? pos.distanceTo(G.player.pos) : 0;
  sfx.smokePop(d);
  return s;
}

// ---- zones (molly / slow / orbital) ----
const zoneColors = { molly:0xff7a30, slow:0x7fd0ff, orbital:0xffd040, toxic:0x59d97f };
export function spawnZone(type, pos, r, dur, dps, owner){
  const mat = new THREE.MeshBasicMaterial({color:zoneColors[type]||0xffffff, transparent:true, opacity:.35, side:THREE.DoubleSide, depthWrite:false});
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r,28), mat);
  disc.rotation.x = -Math.PI/2;
  disc.position.copy(pos).y += .06;
  scene.add(disc);
  let beam = null;
  if(type==='orbital'){
    beam = new THREE.Mesh(new THREE.CylinderGeometry(r*.85,r*.85,34,20,1,true),
      new THREE.MeshBasicMaterial({color:0xffe680, transparent:true, opacity:.4, side:THREE.DoubleSide, depthWrite:false}));
    beam.position.copy(pos).y += 17;
    scene.add(beam);
  }
  const z = {type, pos:pos.clone(), r, until:G.now+dur, dps, owner, mesh:disc, beam, tick:0};
  G.zones.push(z);
  return z;
}

export function targetRing(pos, r, dur, color=0xff4655, owner=null){
  // 敌方的技能落点指示环不给玩家看（避免地上出现莫名其妙的红圈）
  if(owner && G.player && owner.team !== G.player.team) return;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r*.9,r,32),
    new THREE.MeshBasicMaterial({color, transparent:true, opacity:.8, side:THREE.DoubleSide, depthWrite:false}));
  ring.rotation.x = -Math.PI/2;
  ring.position.copy(pos).y += .08;
  scene.add(ring);
  setTimeout(()=>scene.remove(ring), dur*1000);
}

// ---- 蛛影：哨戒炮塔 ----
export function spawnTurret(pos, yaw, ent){
  const g = new THREE.Group();
  const teamCol = ent.team==='ally' ? 0x3fb3ad : 0xd04555;
  const legMat = new THREE.MeshStandardMaterial({color:0x2a333c, roughness:.8});
  for(let i=0;i<3;i++){
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.06,.5,.06), legMat);
    const a = i/3*Math.PI*2;
    leg.position.set(Math.cos(a)*.22,.25,Math.sin(a)*.22);
    leg.rotation.z = Math.cos(a)*.35; leg.rotation.x = -Math.sin(a)*.35;
    g.add(leg);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(.42,.3,.42),
    new THREE.MeshStandardMaterial({color:0x9fb0ba, roughness:.6, metalness:.3}));
  head.position.y = .62;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.4),
    new THREE.MeshStandardMaterial({color:0x232b33, roughness:.5}));
  barrel.rotation.x = Math.PI/2; barrel.position.set(0,.62,-.35);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.05,6,4),
    new THREE.MeshBasicMaterial({color:teamCol}));
  eye.position.set(0,.7,-.22);
  g.add(head, barrel, eye);
  g.position.copy(pos); g.rotation.y = yaw;
  scene.add(g);
  const t = { pos:pos.clone(), yaw, team:ent.team, owner:ent, hp:125, nextFire:0, mesh:g, lamp:eye, until:G.now+45 };
  t.utility = registerUtility(G.utilities, { type:'turret', team:ent.team, ownerId:ent.id, hp:t.hp, pos:t.pos, until:t.until, recallable:true, source:t, onDestroy:()=>{ t.hp=0; } });
  G.turrets.push(t);
  sfx.wall(G.player? pos.distanceTo(G.player.pos):0);
  return t;
}

// ---- 蛛影：绊网 ----
export function spawnTrap(pos, yaw, ent){
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({color:0x2a333c, roughness:.8});
  const w = 2.2;
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,.9,5), postMat);
  const p2 = p1.clone();
  p1.position.set(-w/2,.45,0); p2.position.set(w/2,.45,0);
  const wire = new THREE.Mesh(new THREE.BoxGeometry(w,.02,.02),
    new THREE.MeshBasicMaterial({color:ent.team==='ally'?0x3fd0c9:0xff5060, transparent:true, opacity:.75}));
  wire.position.y = .55;
  g.add(p1,p2,wire);
  g.position.copy(pos); g.rotation.y = yaw;
  scene.add(g);
  const tr = { pos:pos.clone(), team:ent.team, owner:ent, mesh:g, until:G.now+90 };
  tr.utility = registerUtility(G.utilities, { type:'trapwire', team:ent.team, ownerId:ent.id, hp:20, pos:tr.pos, until:tr.until, recallable:true, source:tr });
  G.traps.push(tr);
  return tr;
}

// ---- 投掷物可视化：发光弹体 + 拖尾轨迹 ----
const projColors = { smoke:0xbfc9d8, flash:0xffe9a0, molly:0xff7a30, slow:0x7fd0ff, shock:0x8fd3ff,
  recon:0x39d0c9, nade:0xff9a3d, bignade:0xff7a30, frag:0x9fb4ff, acid:0x59d97f, suppress:0xb478ff, rocket:0xffd070, clusterlet:0xffb060 };
const TRAIL_N = 16;
export function attachProjectileVisual(p){
  const col = projColors[p.type] ?? 0xffffff;
  const big = p.type==='rocket';
  const core = new THREE.Mesh(new THREE.SphereGeometry(big?.17:.11, 10, 8),
    new THREE.MeshStandardMaterial({color:col, emissive:col, emissiveIntensity:1.1, roughness:.3}));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(big?.3:.2, 8, 6),
    new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:.22, blending:THREE.AdditiveBlending, depthWrite:false}));
  const g = new THREE.Group();
  g.add(core, halo);
  g.position.copy(p.pos);
  scene.add(g);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N*3), 3));
  const trail = new THREE.Line(trailGeo,
    new THREE.LineBasicMaterial({color:col, transparent:true, opacity:.6, blending:THREE.AdditiveBlending, depthWrite:false}));
  trail.frustumCulled = false;
  scene.add(trail);
  p.mesh = g; p.trail = trail; p.trailPts = [];
}
export function updateProjectileVisual(p, dt){
  if(!p.mesh) return;
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y += dt*7; p.mesh.rotation.x += dt*5;
  p.trailPts.push(p.pos.clone());
  if(p.trailPts.length > TRAIL_N) p.trailPts.shift();
  const a = p.trail.geometry.attributes.position.array;
  for(let i=0;i<TRAIL_N;i++){
    const q = p.trailPts[Math.min(i, p.trailPts.length-1)] || p.pos;
    a[i*3]=q.x; a[i*3+1]=q.y; a[i*3+2]=q.z;
  }
  p.trail.geometry.attributes.position.needsUpdate = true;
}
export function removeProjectileVisual(p){
  if(p.mesh){ scene.remove(p.mesh); p.mesh = null; }
  if(p.trail){ scene.remove(p.trail); p.trail = null; }
}

// ---- 掉落武器 ----
export function spawnDrop(weapon, pos){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.09,.09,.72),
    new THREE.MeshStandardMaterial({color:0x2c3640, roughness:.55, metalness:.35}));
  const mag = new THREE.Mesh(new THREE.BoxGeometry(.06,.16,.13),
    new THREE.MeshStandardMaterial({color:0x1e262e, roughness:.7}));
  mag.position.set(0,-.05,.08);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(.11,.02,.2),
    new THREE.MeshBasicMaterial({color:0xf5c56b, transparent:true, opacity:.9}));
  glow.position.set(0,.06,-.15);
  g.add(body, mag, glow);
  g.position.set(pos.x, .12, pos.z);
  g.rotation.y = Math.random()*Math.PI*2;
  g.rotation.z = .12;
  scene.add(g);
  const d = { w: weapon, pos: V3(pos.x, pos.y||0, pos.z), mesh: g };
  G.drops.push(d);
  return d;
}
export function removeDrop(d){
  scene.remove(d.mesh);
  const i = G.drops.indexOf(d);
  if(i>=0) G.drops.splice(i,1);
}

// ---- 通用部署装置（醒目可辨识：队伍色脉冲灯 + 独特轮廓） ----
export function spawnDevice(type, pos, ent, opts={}){
  const teamCol = ent.team==='ally' ? 0x39d0c9 : 0xff4655;
  const g = new THREE.Group();
  const lampMat = new THREE.MeshBasicMaterial({color:teamCol});
  let lamp = null, ring = null;
  if(type==='nano'){
    // 纳米蜂群：地面圆盘 + 四颗浮动蜂群粒
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,.12,10),
      new THREE.MeshStandardMaterial({color:0x2c3640, roughness:.6, metalness:.3}));
    disc.position.y = .06;
    g.add(disc);
    for(let i=0;i<4;i++){
      const bee = new THREE.Mesh(new THREE.SphereGeometry(.05,6,5), lampMat);
      const a = i/4*Math.PI*2;
      bee.position.set(Math.cos(a)*.3, .3, Math.sin(a)*.3);
      g.add(bee);
    }
    lamp = new THREE.Mesh(new THREE.SphereGeometry(.08,8,6), lampMat);
    lamp.position.y = .16;
    g.add(lamp);
  } else if(type==='alarm'){
    // 警报机器人：立式小机器人 + 天线警灯
    const body = new THREE.Mesh(new THREE.BoxGeometry(.34,.5,.3),
      new THREE.MeshStandardMaterial({color:0x9fb0ba, roughness:.5, metalness:.35}));
    body.position.y = .45;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(.08,.2,.12), new THREE.MeshStandardMaterial({color:0x2a333c}));
    legL.position.set(-.12,.1,0);
    const legR = legL.clone(); legR.position.x = .12;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.4,5), new THREE.MeshStandardMaterial({color:0x2a333c}));
    antenna.position.y = .9;
    lamp = new THREE.Mesh(new THREE.SphereGeometry(.09,8,6), lampMat);
    lamp.position.y = 1.14;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.22,.07,.04), new THREE.MeshBasicMaterial({color:0x101820}));
    eye.position.set(0,.55,-.16);
    g.add(body, legL, legR, antenna, lamp, eye);
  } else if(type==='beacon'){
    // 兴奋信标：立柱 + 扩散增益环
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,.85,8),
      new THREE.MeshStandardMaterial({color:0xd8b45a, roughness:.4, metalness:.4}));
    pole.position.y = .42;
    lamp = new THREE.Mesh(new THREE.SphereGeometry(.12,8,6), new THREE.MeshBasicMaterial({color:0xffe08a}));
    lamp.position.y = .95;
    ring = new THREE.Mesh(new THREE.RingGeometry(.9,1.05,28),
      new THREE.MeshBasicMaterial({color:0xffd870, transparent:true, opacity:.55, side:THREE.DoubleSide, depthWrite:false}));
    ring.rotation.x = -Math.PI/2; ring.position.y = .1;
    g.add(pole, lamp, ring);
  } else if(type==='lockdown'){
    // 全域封锁：大型装置 + 充能环
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.55,.7,1.1,8),
      new THREE.MeshStandardMaterial({color:0xbfcbd8, roughness:.4, metalness:.5}));
    core.position.y = .55;
    lamp = new THREE.Mesh(new THREE.SphereGeometry(.16,10,8), lampMat);
    lamp.position.y = 1.25;
    ring = new THREE.Mesh(new THREE.RingGeometry(1.3,1.55,36),
      new THREE.MeshBasicMaterial({color:teamCol, transparent:true, opacity:.5, side:THREE.DoubleSide, depthWrite:false}));
    ring.rotation.x = -Math.PI/2; ring.position.y = .12;
    g.add(core, lamp, ring);
  }
  g.position.copy(pos);
  scene.add(g);
  const d = { type, pos:pos.clone(), team:ent.team, owner:ent, mesh:g, lamp, ring,
    until: opts.until ?? (G.now+60), armAt: opts.armAt ?? 0, r: opts.r ?? 3, tick: 0 };
  const hp = type==='lockdown' ? 200 : type==='beacon' ? 100 : 20;
  d.utility = registerUtility(G.utilities, { type, team:ent.team, ownerId:ent.id, hp, pos:d.pos, until:d.until, radius:d.r, recallable:type==='alarm', source:d });
  G.traps.push(d);
  sfx.wall(G.player ? pos.distanceTo(G.player.pos) : 0);
  return d;
}

export function suppressFX(p){
  const f = getFlash(0xb478ff, .5);
  f.mesh.position.copy(p).y += 1;
  f.life = f.max = .5; f.grow = 12;
}

// ---- sage wall ----
export function spawnWall(pos, yaw, dur){
  const w=5, h=2.2, t=.5;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,t),
    new THREE.MeshStandardMaterial({color:0x9fe8dc, roughness:.4, transparent:true, opacity:.92}));
  mesh.position.set(pos.x, h/2, pos.z);
  mesh.rotation.y = yaw;
  mesh.castShadow = true;
  scene.add(mesh);
  // axis-aligned approx collider (use widest footprint)
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const hx = (w*s + t*c)/2 + .05, hz = (w*c + t*s)/2 + .05;
  // wall is perpendicular to facing: rotate footprint
  const ex = (w*c + t*s)/2, ez = (w*s + t*c)/2;
  const box = {min:V3(pos.x-ex,0,pos.z-ez), max:V3(pos.x+ex,h,pos.z+ez), until:G.now+dur, mesh};
  G.dynColliders.push(box);
  const d = G.player ? pos.distanceTo(G.player.pos) : 0;
  sfx.wall(d);
  return box;
}

export function explosionFX(pos){
  const f = getFlash(0xffc860, 1);
  f.mesh.position.copy(pos).y += 1;
  f.life = f.max = .9; f.grow = 26;
  const f2 = getFlash(0xff5030, 1);
  f2.mesh.position.copy(pos).y += 1;
  f2.life = f2.max = .6; f2.grow = 16;
}

// ---- 出生天幕屏障 ----
const barrierMeshes = [];
export function addBarriers(){
  for(const b of G.map.barriers){
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z, h = b.max.y - b.min.y;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(d,.3)),
      new THREE.MeshBasicMaterial({
        color: b.side==='atk' ? 0x39d0c9 : 0xff4655,
        transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false,
      }));
    mesh.position.set((b.min.x+b.max.x)/2, h/2, (b.min.z+b.max.z)/2);
    scene.add(mesh);
    const box = { min: b.min, max: b.max, until: Infinity, mesh, isBarrier: true };
    G.dynColliders.push(box);
    barrierMeshes.push(box);
  }
}
export function removeBarriers(){
  for(const b of barrierMeshes){
    scene.remove(b.mesh);
    const i = G.dynColliders.indexOf(b);
    if(i>=0) G.dynColliders.splice(i,1);
  }
  barrierMeshes.length = 0;
}
export function pulseBarriers(){
  for(const b of barrierMeshes) b.mesh.material.opacity = .16 + Math.sin(G.now*2.4)*.07;
}

export function updateFX(dt){
  for(const t of pools.tracers) if(t.active){
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life/.07)*.95;
    if(t.life<=0){ t.active=false; t.line.visible=false; }
  }
  for(const f of pools.flashes) if(f.active){
    f.life -= dt;
    if(f.grow) f.mesh.scale.addScalar(f.grow*dt);
    f.mesh.material.opacity = Math.max(0, f.life/f.max);
    f.mesh.material.transparent = true;
    if(f.life<=0){ f.active=false; f.mesh.visible=false; f.grow=0; }
  }
  // smokes
  for(let i=G.smokes.length-1;i>=0;i--){
    const s = G.smokes[i];
    const age = G.now - s.born;
    const scl = Math.min(1, age/.45);
    if(s.mesh) s.mesh.scale.setScalar(scl);
    if(s.core) s.core.scale.setScalar(scl*.92);
    if(s.mesh) s.mesh.rotation.y += dt*.15; s.mesh.rotation.z += dt*.08;
    if(s.core) s.core.rotation.y -= dt*.12;
    const rem = s.until - G.now;
    if(rem < 1.0){
      const op = Math.max(0, rem/1.0);
      s.mesh.material.opacity = .985 * op;
      if(s.core) s.core.material.opacity = .18 * op;
    }
    if(rem <= 0){ if(s.mesh) scene.remove(s.mesh); if(s.core) scene.remove(s.core); G.smokes.splice(i,1); }
  }
  // zones
  for(let i=G.zones.length-1;i>=0;i--){
    const z = G.zones[i];
    z.mesh.material.opacity = .28 + Math.sin(G.now*8)*.1;
    if(z.beam) z.beam.material.opacity = .3 + Math.sin(G.now*20)*.15;
    if(G.now >= z.until){
      scene.remove(z.mesh); if(z.beam) scene.remove(z.beam);
      G.zones.splice(i,1);
    }
  }
  // dyn colliders (walls)
  for(let i=G.dynColliders.length-1;i>=0;i--){
    const w = G.dynColliders[i];
    const rem = w.until - G.now;
    if(rem<.6 && w.mesh) w.mesh.material.opacity = Math.max(0,rem/.6)*.92;
    if(rem<=0){ if(w.mesh) scene.remove(w.mesh); G.dynColliders.splice(i,1); }
  }
}

export function clearRoundFX(){
  for(const s of G.smokes) scene.remove(s.mesh);
  G.smokes.length = 0;
  for(const z of G.zones){ scene.remove(z.mesh); if(z.beam) scene.remove(z.beam); }
  G.zones.length = 0;
  for(const w of G.dynColliders) if(w.mesh) scene.remove(w.mesh);
  G.dynColliders.length = 0;
  for(const c of G.corpses) if(c.mesh) scene.remove(c.mesh);
  G.corpses.length = 0;
  for(const t of G.turrets) if(t.mesh) scene.remove(t.mesh);
  G.turrets.length = 0;
  for(const t of G.traps) if(t.mesh) scene.remove(t.mesh);
  G.traps.length = 0;
  for(const d of G.drops) if(d.mesh) scene.remove(d.mesh);
  G.drops.length = 0;
  for(const p of G.projectiles) removeProjectileVisual(p);
  G.projectiles.length = 0;
  G.utilities.items.length = 0;
  G.utilities.nextId = 1;
  G.controlMode = null;
}
export function removeMesh(m){ if(m) scene.remove(m); }
export function addMesh(m){ scene.add(m); }


// ---------- 着色器预热：把所有运行期特效在屏外生成一次并预编译，消除首次使用卡顿 ----------
export function warmUpFX(){
  try {
    const p = V3(0, -120, 0);
    spawnSmoke(p, 2, .05);
    spawnZone('molly', p, 2, .05, 0, null);
    spawnZone('slow', p, 2, .05, 0, null);
    spawnZone('toxic', p, 2, .05, 0, null);
    tracer(p, V3(1,-120,1));
    impactFX(p); bloodFX(p, V3(0,1,0)); explosionFX(p); teleportFX(p); suppressFX(p);
    targetRing(V3(0,-119,0), 2, 60);
    const dummy = { team:'ally', pos:p };
    const t = spawnTurret(p.clone(), 0, dummy); t.until = G.now + .05; t.hp = 0;
    for(const ty of ['nano','alarm','beacon','lockdown']){
      const d = spawnDevice(ty, p.clone(), dummy, { until: G.now + .05, r: 1 });
    }
    const proj = { type:'nade', pos:p.clone(), vel:V3(0,0,0) };
    attachProjectileVisual(proj); updateProjectileVisual(proj, .016);
    setTimeout(()=> removeProjectileVisual(proj), 80);
    const drop = spawnDrop({ def:{name:'x',cost:0,cat:'rifle'}, ammo:0, reserve:0, id:'warm' }, p);
    setTimeout(()=> removeDrop(drop), 80);
    G.renderer?.compile?.(G.scene, G.camera);
  } catch(err){ console.warn('warmUpFX', err); }
}
