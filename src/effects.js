import * as THREE from 'three';
import { G } from './state.js?v=12';
import { V3 } from './utils.js?v=12';
import { sfx } from './audio.js?v=12';

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
const smokeMat = new THREE.MeshStandardMaterial({color:0xdce2ea, roughness:1, transparent:true, opacity:.985, flatShading:false});
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
const zoneColors = { molly:0xff7a30, slow:0x7fd0ff, orbital:0xffd040 };
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

export function targetRing(pos, r, dur){
  const ring = new THREE.Mesh(new THREE.RingGeometry(r*.9,r,32),
    new THREE.MeshBasicMaterial({color:0xff4655, transparent:true, opacity:.8, side:THREE.DoubleSide, depthWrite:false}));
  ring.rotation.x = -Math.PI/2;
  ring.position.copy(pos).y += .08;
  scene.add(ring);
  setTimeout(()=>scene.remove(ring), dur*1000);
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
}
export function removeMesh(m){ if(m) scene.remove(m); }
export function addMesh(m){ scene.add(m); }
