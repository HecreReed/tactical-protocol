// 地图完整性验证：基于真实导航图（含高低差双层导航）
// live: 进攻方可达所有包点/集结点/驻守位/hold（含高台）
// buy : 光幕作为“边阻断”注入——防守方可达包点+驻守位；到不了进攻出生/中立集结；进攻方到不了包点
import { MAPS } from '../src/mapData.js?v=27';
import { buildColliders, buildNav } from '../src/map.js?v=27';

function segX(ax,az,bx,bz,r){ // 2D 线段 vs 矩形 (Liang-Barsky)
  const dx=bx-ax, dz=bz-az;
  let t0=0,t1=1;
  const clip=(p,q)=>{ if(Math.abs(p)<1e-9) return q>=0; const t=q/p; if(p<0){ if(t>t1) return false; if(t>t0) t0=t; } else { if(t<t0) return false; if(t<t1) t1=t; } return true; };
  if(!clip(-dx, ax-r[0])) return false;
  if(!clip(dx, r[2]-ax)) return false;
  if(!clip(-dz, az-r[1])) return false;
  if(!clip(dz, r[3]-az)) return false;
  return t0<=t1;
}
function nodesNear(nav,x,z,rad=2){
  const out=[];
  nav.wps.forEach((w,i)=>{ if(Math.hypot(w.x-x,w.z-z)<rad) out.push(i); });
  return out;
}
function flood(nav, starts, barriers){
  const seen=new Set(starts), q=[...starts];
  while(q.length){
    const c=q.shift();
    const wc=nav.wps[c];
    for(const n of nav.edges[c]){
      if(seen.has(n)) continue;
      const wn=nav.wps[n];
      if(barriers && barriers.some(B=>segX(wc.x,wc.z,wn.x,wn.z,B.rect))) continue;
      seen.add(n); q.push(n);
    }
  }
  return seen;
}
let fail=0;
for(const md of MAPS){
  const open=md.open.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const report=[];
  const col=buildColliders(md, open);
  const nav=buildNav(md, col);
  const atkStart=nodesNear(nav, md.spawns.atk[1][0], md.spawns.atk[1][1]);
  const defStart=nodesNear(nav, md.spawns.def[1][0], md.spawns.def[1][1]);
  const atkL=flood(nav, atkStart, null);
  const reach=(set,x,z,label,rad=2.2)=>{ const ns=nodesNear(nav,x,z,rad); if(!ns.some(n=>set.has(n))){ report.push(label); fail++; } };
  const noReach=(set,x,z,label)=>{ const ns=nodesNear(nav,x,z,1.2); if(ns.some(n=>set.has(n))){ report.push(label); fail++; } };
  for(const k of Object.keys(md.sites)) reach(atkL, md.sites[k].plant[0], md.sites[k].plant[1], `live:ATK不能到${k}点`);
  for(const p of md.defPostList) reach(atkL, p.p[0], p.p[1], `live:驻点${p.p}不可达`);
  for(const k of Object.keys(md.stages||{})) reach(atkL, md.stages[k][0], md.stages[k][1], `live:集结${k}不可达`);
  for(const k of Object.keys(md.atkHolds||{})) for(const h of md.atkHolds[k]) reach(atkL, h.p[0], h.p[1], `live:hold${h.p}不可达`);
  // 购买阶段
  const defB=flood(nav, defStart, md.barriers);
  const atkB=flood(nav, atkStart, md.barriers);
  for(const k of Object.keys(md.sites)) reach(defB, md.sites[k].plant[0], md.sites[k].plant[1], `buy:DEF不能到${k}点`);
  for(const p of md.defPostList) reach(defB, p.p[0], p.p[1], `buy:DEF不能到驻点${p.p}`);
  for(const s of md.spawns.atk) noReach(defB, s[0], s[1], `漏洞:DEF可达进攻出生${s}`);
  for(const k of Object.keys(md.stages||{})) noReach(defB, md.stages[k][0], md.stages[k][1], `漏洞:DEF可达中立集结${k}`);
  for(const k of Object.keys(md.sites)) noReach(atkB, md.sites[k].plant[0], md.sites[k].plant[1], `漏洞:ATK购买阶段可达${k}点`);
  console.log(`[${md.id}] ${report.length? report.join(' | ') : 'OK ✓'} (节点${nav.wps.length} buy-def可达${defB.size} buy-atk可达${atkB.size})`);
}
process.exit(fail?1:0);
