import * as THREE from 'three';

export const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
export const lerp = (a,b,t)=> a+(b-a)*t;
export const rand = (a=1,b)=> b===undefined ? Math.random()*a : a+Math.random()*(b-a);
export const randi = (a,b)=> Math.floor(rand(a,b+1));
export const pick = arr => arr[Math.floor(Math.random()*arr.length)];
export function gauss(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
export const deg = d => d*Math.PI/180;

export const V3 = (x=0,y=0,z=0)=> new THREE.Vector3(x,y,z);
export const dist2d = (a,b)=> Math.hypot(a.x-b.x, a.z-b.z);

export function dirFromYawPitch(yaw, pitch, out){
  out = out || new THREE.Vector3();
  const cp = Math.cos(pitch);
  out.set(-cp*Math.sin(yaw), Math.sin(pitch), -cp*Math.cos(yaw));
  return out;
}
export const yawTo = (from, to)=> Math.atan2(-(to.x-from.x), -(to.z-from.z));
export function pitchTo(from, to){
  const d2 = Math.hypot(to.x-from.x, to.z-from.z);
  return Math.atan2(to.y-from.y, d2);
}
export function angDiff(a,b){ let d=(b-a)%(Math.PI*2);
  if(d>Math.PI)d-=Math.PI*2; if(d<-Math.PI)d+=Math.PI*2; return d; }

// Ray vs AABB (slab). Returns hit distance or Infinity.
export function rayAABB(o, d, box, maxD){
  let tmin = 0, tmax = maxD;
  for(const ax of ['x','y','z']){
    if(Math.abs(d[ax]) < 1e-8){
      if(o[ax] < box.min[ax] || o[ax] > box.max[ax]) return Infinity;
      continue;
    }
    const inv = 1/d[ax];
    let t1 = (box.min[ax]-o[ax])*inv, t2 = (box.max[ax]-o[ax])*inv;
    if(t1>t2){ const t=t1; t1=t2; t2=t; }
    tmin = Math.max(tmin,t1); tmax = Math.min(tmax,t2);
    if(tmin>tmax) return Infinity;
  }
  return Math.max(0, tmin);
}

// Ray vs sphere. Returns nearest positive distance or Infinity.
export function raySphere(o, d, c, r, maxD){
  const ox=o.x-c.x, oy=o.y-c.y, oz=o.z-c.z;
  const b = ox*d.x+oy*d.y+oz*d.z;
  const cc = ox*ox+oy*oy+oz*oz - r*r;
  const disc = b*b - cc;
  if(disc<0) return Infinity;
  const sq = Math.sqrt(disc);
  let t = -b-sq;
  if(t<0) t = -b+sq;
  if(t<0 || t>maxD) return Infinity;
  return t;
}

// Segment vs sphere boolean (for smoke LOS blocking)
export function segHitsSphere(a, b, c, r){
  const abx=b.x-a.x, aby=b.y-a.y, abz=b.z-a.z;
  const acx=c.x-a.x, acy=c.y-a.y, acz=c.z-a.z;
  const len2 = abx*abx+aby*aby+abz*abz;
  let t = len2>0 ? (acx*abx+acy*aby+acz*abz)/len2 : 0;
  t = clamp(t,0,1);
  const px=a.x+abx*t-c.x, py=a.y+aby*t-c.y, pz=a.z+abz*t-c.z;
  return px*px+py*py+pz*pz <= r*r;
}

export function fmtTime(s){
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}
