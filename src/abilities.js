import * as THREE from 'three';
import { G } from './state.js?v=28';
import { V3, dirFromYawPitch, dist2d, yawTo, deg, rand, angDiff, clamp, gauss } from './utils.js?v=28';
import { AGENTS } from './config.js?v=28';
import { spawnSmoke, spawnZone, spawnWall, targetRing, teleportFX, flashFX, spawnTurret, spawnTrap, spawnDevice, suppressFX, explosionFX, tracer, removeMesh, attachProjectileVisual, updateProjectileVisual, removeProjectileVisual } from './effects.js?v=28';
import { eyePos, rayWalls, traceRay, makeWeapon, applyDamage, hitSpheres, losBlocked } from './combat.js?v=28';
import { inAnyOpen, colQuery } from './map.js?v=28';
import { sfx } from './audio.js?v=28';
import { raySphere } from './utils.js?v=28';
import { commitAbility, runAbilityEvents, scheduleAbilityEvent } from './abilityCore.js';
import { interceptProjectile, tickUtilities } from './abilityRuntime.js';

export function initAbilities(ent){
  const a = AGENTS[ent.agent];
  ent.ab = {};
  for(const k of ['c','q','e','x']){
    ent.ab[k] = { n: a.ab[k].start, def: a.ab[k] };
  }
  ent.abCd = { e: 0 };
  ent.abilityState = {};
  ent.resources = {};
}

export function roundRefill(ent){
  const a = AGENTS[ent.agent];
  for(const k of ['c','q','e']){
    if(a.ab[k].free || a.ab[k].cost===0) ent.ab[k].n = Math.max(ent.ab[k].n, a.ab[k].start);
  }
  ent.abCd.e = 0;
  ent.knifeUlt = 0;
  ent.arrowUlt = 0;
  ent.rocketUlt = 0;
  ent.flashUntil = 0; ent.revealedUntil = 0; ent.resistUntil = 0;
  ent.suppressedUntil = 0; ent.dazeUntil = 0;
  ent.empressUntil = 0;
}

function throwProj(ent, type, speed=16, upBoost=3){
  const dir = dirFromYawPitch(ent.yaw, ent.pitch);
  const o = eyePos(ent);
  G.projectiles.push({
    type, owner: ent,
    pos: o.clone().addScaledVector(dir,.6),
    vel: dir.clone().multiplyScalar(speed).add(V3(0,upBoost,0)),
    born: G.now,
  });
}

function aimPoint(ent, maxD){
  const dir = dirFromYawPitch(ent.yaw, ent.pitch);
  const o = eyePos(ent);
  const d = Math.min(rayWalls(o, dir, maxD), maxD);
  const p = o.clone().addScaledVector(dir, d);
  p.y = 0;
  return p;
}

// ---------- 闪光 ----------
export function popFlash(point, owner){
  flashFX(point);
  sfx.flashPop(G.player? point.distanceTo(G.player.pos):0);
  for(const e of G.ents){
    if(!e.alive) continue;
    const eye = eyePos(e);
    const d = eye.distanceTo(point);
    if(d > 30) continue;
    if(losBlocked(eye, point)) continue;
    const look = dirFromYawPitch(e.yaw, e.pitch);
    const toP = point.clone().sub(eye).normalize();
    const dot = look.dot(toP);
    let dur = 0;
    if(dot > .35) dur = 2.0;
    else if(dot > -.1) dur = 1.0;
    else dur = .4;
    dur *= Math.max(.4, 1 - d/40);
    if(dur > .2){
      e.flashUntil = Math.max(e.flashUntil||0, G.now + dur);
      if(e.isPlayer){ G.hooks.flash?.(dur); sfx.blinded(); }
      if(!e.isPlayer && e.ai) e.ai.target = null;
    }
  }
}

export function coneFlash(ent, dur=1.8){
  const look = dirFromYawPitch(ent.yaw, 0);
  for(const e of G.ents){
    if(!e.alive || e.team === ent.team) continue;
    const to = V3(e.pos.x-ent.pos.x, 0, e.pos.z-ent.pos.z);
    const d = to.length();
    if(d > 22) continue;
    to.normalize();
    if(look.dot(to) < .8) continue; // ~37° cone, 穿墙
    e.flashUntil = Math.max(e.flashUntil||0, G.now + dur*Math.max(.5,1-d/30));
    if(e.isPlayer){ G.hooks.flash?.(dur); sfx.blinded(); }
    if(!e.isPlayer && e.ai) e.ai.target = null;
  }
  sfx.flashPop(0);
}

// ---------- 侦查 ----------
export function revealArea(point, r, dur, team){
  let any = false;
  for(const e of G.ents){
    if(!e.alive || e.team === team) continue;
    if(dist2d(e.pos, point) > r) continue;
    e.revealedUntil = Math.max(e.revealedUntil||0, G.now + dur);
    any = true;
    if(e.isPlayer) sfx.revealed();
    // 通知本方 bot 前往猎杀
    for(const b of G.ents){
      if(b.team !== team || b.isPlayer || !b.alive || !b.ai) continue;
      if(!b.ai.target && dist2d(b.pos, e.pos) < 45){
        b.ai.lastSeenPos.copy(e.pos);
        b.ai.lastSeenAt = G.now;
        if(b.ai.state==='post'||b.ai.state==='hold'||b.ai.state==='push') b.ai.state='hunt';
      }
    }
  }
  if(any && team === G.player?.team) sfx.reveal();
  targetRing(point, r, 900);
  return any;
}

// ---------- 传送 ----------
function shadowStep(ent, dist, throughWalls){
  const dir = dirFromYawPitch(ent.yaw, 0);
  const o = V3(ent.pos.x, ent.pos.y+1, ent.pos.z);
  let d = dist;
  if(!throughWalls){
    d = Math.min(dist, rayWalls(o, dir, dist) - .7);
    if(d < 1) d = Math.max(0, rayWalls(o, dir, dist) - .7);
  }
  let tx = ent.pos.x + dir.x*d, tz = ent.pos.z + dir.z*d;
  // 落点必须在可行走区域
  let tries = 0;
  while(!inAnyOpen(tx,tz) && tries++ < 20){
    d -= 1.2;
    if(d <= 0) return false;
    tx = ent.pos.x + dir.x*d; tz = ent.pos.z + dir.z*d;
  }
  teleportFX(ent.pos.clone());
  ent.pos.set(tx, ent.pos.y, tz);
  ent.vel.set(0,0,0);
  teleportFX(ent.pos.clone());
  sfx.teleport(G.player? ent.pos.distanceTo(G.player.pos):0);
  return true;
}

// ---------- 火墙 ----------
function fireWall(ent){
  const dir = dirFromYawPitch(ent.yaw, 0);
  for(let i=1;i<=5;i++){
    const p = V3(ent.pos.x + dir.x*i*2.4, 0, ent.pos.z + dir.z*i*2.4);
    if(!inAnyOpen(p.x,p.z)) break;
    spawnZone('molly', p, 1.7, 6.5, 32, ent);
  }
  sfx.molly(0);
}

// ---------- 震慑（岚切） ----------
export function coneDaze(ent, range, dot, dur){
  const look = dirFromYawPitch(ent.yaw, 0);
  for(const e of G.ents){
    if(!e.alive || e.team === ent.team) continue;
    const to = V3(e.pos.x-ent.pos.x, 0, e.pos.z-ent.pos.z);
    const d = to.length();
    if(d > range) continue;
    to.normalize();
    if(d > 3 && look.dot(to) < dot) continue;  // 锥形，穿墙
    e.dazeUntil = Math.max(e.dazeUntil||0, G.now + dur);
    e.slowUntil = Math.max(e.slowUntil||0, G.now + dur*.6);
    if(e.isPlayer) G.hooks.dazed?.(dur);
    if(!e.isPlayer && e.ai){ e.ai.burstLeft = 0; }
  }
  sfx.stun(0);
}

// ---------- 爆炸（雷奕/零式） ----------
export function boomAt(pos, r, dmgNear, dmgFar, owner, name){
  explosionFX(pos);
  sfx.nade(G.player ? pos.distanceTo(G.player.pos) : 0);
  G.hooks.noise?.(pos, owner);   // 爆炸声情报：对方队伍据此判断动向（佯攻可拉动防守）
  for(const e of G.ents){
    if(!e.alive || (owner && e.team === owner.team)) continue;
    const d = dist2d(e.pos, pos);
    if(d > r || Math.abs(e.pos.y - pos.y) > 3.2) continue;
    const dmg = dmgFar + (dmgNear - dmgFar) * clamp(1 - d/r, 0, 1);
    applyDamage(e, Math.round(dmg), owner, name, 'b');
  }
}

// 雷奕彩弹集束雷：主爆后分裂出子雷弹跳散开二次起爆
export function clusterBoom(pos, owner){
  boomAt(pos.clone(), 3.8, 65, 28, owner, '彩弹集束雷');
  const n = 5;
  for(let i=0;i<n;i++){
    const a = i/n*Math.PI*2 + rand(-.35,.35);
    G.projectiles.push({
      type:'clusterlet', owner,
      pos: V3(pos.x, Math.max(pos.y, .25) + .45, pos.z),
      vel: V3(Math.cos(a)*rand(3.5,6), rand(4.5,6.5), Math.sin(a)*rand(3.5,6)),
      born: G.now,
    });
  }
}

// ---------- 压制（零式）：禁用技能 ----------
export function popSuppress(point, r, dur, owner){
  suppressFX(point);
  targetRing(V3(point.x,0,point.z), r, 900, 0xb478ff);
  sfx.suppress(G.player ? point.distanceTo(G.player.pos) : 0);
  for(const e of G.ents){
    if(!e.alive || (owner && e.team === owner.team)) continue;
    if(dist2d(e.pos, point) > r) continue;
    e.suppressedUntil = Math.max(e.suppressedUntil||0, G.now + dur);
    if(e.isPlayer) G.hooks.hudMsg?.('你被压制了——技能暂时无法使用！');
  }
}

// ---------- 部署物运行（哨戒炮 / 绊网） ----------
export function updateDeployables(dt){
  const ph = G.match?.phase;
  // 哨戒炮塔
  for(let i=G.turrets.length-1;i>=0;i--){
    const t = G.turrets[i];
    if(t.hp <= 0 || G.now > t.until){
      if(t.hp <= 0) explosionFX(t.pos);
      removeMesh(t.mesh); G.turrets.splice(i,1); continue;
    }
    if(t.lamp) t.lamp.scale.setScalar(.9 + Math.sin(G.now*6 + 1)*.45);
    if(ph!=='live' && ph!=='planted') continue;
    const te = V3(t.pos.x, t.pos.y+.75, t.pos.z);
    let best=null, bd=26;
    for(const e of G.ents){
      if(!e.alive || e.team===t.team || G.now < (e.suppressedUntil||-1)*0) continue;
      const d = dist2d(e.pos, t.pos);
      if(d < bd && !losBlocked(te, eyePos(e))){ bd = d; best = e; }
    }
    if(best){
      const ty = yawTo(t.pos, best.pos);
      t.yaw += angDiff(t.yaw, ty) * Math.min(1, dt*7);
      if(t.mesh) t.mesh.rotation.y = t.yaw;
      if(G.now >= t.nextFire && Math.abs(angDiff(t.yaw, ty)) < .25){
        t.nextFire = G.now + .55;
        tracer(te, eyePos(best), 0xffd070);
        sfx.shot('smg', G.player ? te.distanceTo(G.player.pos) : 0);
        if(Math.random() < .78) applyDamage(best, 7, t.owner, '哨戒炮', 'b');
      }
    }
  }
  // 部署装置（纳米蜂群/警报机器人/兴奋信标/全域封锁/绊网）
  const pulse = .55 + Math.sin(G.now*6)*.45;
  for(let i=G.traps.length-1;i>=0;i--){
    const tr = G.traps[i];
    if(G.now > tr.until){ removeMesh(tr.mesh); G.traps.splice(i,1); continue; }
    // 醒目度：警灯闪烁 + 增益/充能环动画
    if(tr.lamp){
      tr.lamp.scale.setScalar(.8 + pulse*.5);
      if(tr.lamp.material) tr.lamp.material.opacity = 1;
    }
    if(tr.ring){
      const t = (G.now*.9) % 1;
      tr.ring.scale.setScalar(.4 + t*(tr.type==='lockdown'?3.2:1.6));
      tr.ring.material.opacity = .6*(1-t);
    }
    if(ph!=='live' && ph!=='planted') continue;

    if(tr.type==='beacon'){
      // 兴奋信标：范围内友军持续获得射速/移速增益
      for(const e of G.ents){
        if(!e.alive || e.team !== tr.team) continue;
        if(dist2d(e.pos, tr.pos) < tr.r) e.stimUntil = Math.max(e.stimUntil||0, G.now + .6);
      }
      continue;
    }
    if(tr.type==='lockdown'){
      // 全域封锁：充能完毕后大范围禁锢敌人
      if(tr.armAt && G.now >= tr.armAt){
        sfx.beamFire(G.player ? tr.pos.distanceTo(G.player.pos) : 0);
        for(const e of G.ents){
          if(!e.alive || e.team === tr.team) continue;
          if(dist2d(e.pos, tr.pos) < tr.r){
            e.slowUntil = Math.max(e.slowUntil||0, G.now + 7);
            e.suppressedUntil = Math.max(e.suppressedUntil||0, G.now + 7);
            e.revealedUntil = Math.max(e.revealedUntil||0, G.now + 4);
            if(e.isPlayer) G.hooks.hudMsg?.('你被全域封锁禁锢了！');
          }
        }
        removeMesh(tr.mesh); G.traps.splice(i,1);
      }
      continue;
    }
    // 触发式装置：nano（蜂群爆发）/ alarm（警报震慑）/ wire（旧绊网）
    for(const e of G.ents){
      if(!e.alive || e.team === tr.team) continue;
      const trigR = tr.type==='nano' ? 3 : tr.type==='alarm' ? 3.6 : 2.1;
      if(dist2d(e.pos, tr.pos) < trigR && Math.abs(e.pos.y - tr.pos.y) < 1.8){
        if(tr.type==='nano'){
          spawnZone('molly', V3(tr.pos.x,0,tr.pos.z), 3, 4, 40, tr.owner);
          sfx.molly(G.player ? tr.pos.distanceTo(G.player.pos) : 0);
        } else {
          e.dazeUntil = Math.max(e.dazeUntil||0, G.now + 2.2);
          e.slowUntil = Math.max(e.slowUntil||0, G.now + 2.6);
          e.revealedUntil = Math.max(e.revealedUntil||0, G.now + 4);
          if(e.isPlayer) G.hooks.dazed?.(1.4);
          sfx.revealed();
        }
        for(const b of G.ents){
          if(b.team!==tr.team || !b.alive || b.isPlayer || !b.ai) continue;
          if(dist2d(b.pos, tr.pos) < 40){ b.ai.lastSeenPos.copy(e.pos); b.ai.lastSeenAt = G.now; }
        }
        removeMesh(tr.mesh); G.traps.splice(i,1);
        break;
      }
    }
  }
}

// ============ 主动使用（玩家/AI 自身向技能） ============
function gateAbility(ent, key){
  if(!ent.alive || ent.channel) return null;
  const ph = G.match?.phase;
  if(ph !== 'live' && ph !== 'planted') return null;
  if(G.now < (ent.suppressedUntil||0)){
    if(ent.isPlayer){ sfx.deny(); G.hooks.hudMsg?.('技能被压制中！'); }
    return null;
  }
  const slot = ent.ab[key];
  if(!slot) return null;
  const def = slot.def;
  const agent = AGENTS[ent.agent];
  if(key==='x'){
    if(ent.ult < agent.ultCost) { if(ent.isPlayer) sfx.deny(); return null; }
  } else {
    if(slot.n <= 0) { if(ent.isPlayer) sfx.deny(); return null; }
    if(key==='e' && G.now < ent.abCd.e) { if(ent.isPlayer) sfx.deny(); return null; }
  }
  return { slot, def };
}

function finishAbility(ent, key, slot, used){
  if(key==='x'){
    if(used) ent.ult = 0;
    return used;
  }
  return commitAbility(slot, used);
}

function schedule(delay, callback, tag){
  return scheduleAbilityEvent(G.abilityEvents, G.now + delay, callback, tag);
}

export function useAbility(ent, key){
  const g = gateAbility(ent, key);
  if(!g) return false;
  return finishAbility(ent, key, g.slot, performAbility(ent, key, g.slot, g.def, {}));
}

// 投掷参数表（速度/上抛）——供投掷轨迹预览使用
export const THROW_PARAMS = {
  smokeProj:[21,3], flash:[26,3], molly:[24,4], slowProj:[20,3.5], shock:[28,3], recon:[34,2.5],
  nade:[24,3.5], bignade:[22,4], fragNade:[24,3.5], acidPool:[22,3], suppressNade:[22,3],
  hotHands:[22,3.5], nanoSwarm:[21,3],
};

// ===== 装备式施法（复刻无畏契约：按技能键持在手上，左键释放/右键低抛或取消） =====
const EQUIP_THROW = new Set(['smokeProj','flash','molly','slowProj','shock','recon','nade','bignade','fragNade','acidPool','suppressNade','hotHands','nanoSwarm','droneScan','boomBot']);
const EQUIP_AIM = new Set(['wall','firewall','quake','paranoia','wallFlash','stunWave','shadowStep','tripwire','turret','cage','toxicSmoke','toxicWall','alarmBot','stimBeacon']);

export function startCast(ent, key){
  if(G.castMode){
    const same = G.castMode.key === key;
    cancelCast();
    if(same) return false;
  }
  const g = gateAbility(ent, key);
  if(!g) return false;
  const t = g.def.type;
  if(ent.isPlayer && (EQUIP_THROW.has(t) || EQUIP_AIM.has(t))){
    G.castMode = { ent, key, def: g.def, slot: g.slot, kind: EQUIP_THROW.has(t)?'throw':'aim', until: G.now + 10 };
    sfx.equip();
    G.hooks.hudMsg?.(EQUIP_THROW.has(t)
      ? `已手持「${g.def.name}」— 左键 投掷 · 右键 低抛 · 再按 ${key.toUpperCase()} 收回`
      : `瞄准「${g.def.name}」— 左键 释放 · 右键 收回`);
    G.hooks.rebuildViewModel?.();
    return true;
  }
  return finishAbility(ent, key, g.slot, performAbility(ent, key, g.slot, g.def, {}));
}

export function confirmCast(alt=false){
  const cm = G.castMode;
  if(!cm) return false;
  G.castMode = null;
  const { ent, key, def, slot } = cm;
  if(!ent.alive){ G.hooks.rebuildViewModel?.(); return false; }
  const ph = G.match?.phase;
  if(ph !== 'live' && ph !== 'planted'){ G.hooks.rebuildViewModel?.(); return false; }
  const used = finishAbility(ent, key, slot, performAbility(ent, key, slot, def, { alt }));
  G.hooks.rebuildViewModel?.();
  G.hooks.refreshBuy?.();
  return used;
}

export function cancelCast(){
  if(!G.castMode) return;
  G.castMode = null;
  sfx.equip();
  G.hooks.rebuildViewModel?.();
}

// 实际执行技能效果（opts.alt = 低抛变体）
export function performAbility(ent, key, slot, def, opts={}){
  let used = true;
  switch(def.type){
    case 'dash': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      const mv = V3(ent.vel.x,0,ent.vel.z);
      const d = mv.lengthSq() > 4 ? mv.normalize() : dir;
      ent.vel.x = d.x*16; ent.vel.z = d.z*16;
      ent.dashUntil = G.now + .28;
      if(key==='e') ent.abCd.e = G.now + (def.cd||22);
      sfx.dash();
      break;
    }
    case 'updraft':
      ent.vel.y = 11; ent.grounded = false; sfx.dash(); break;
    case 'smokeProj':
      throwProj(ent, 'smoke', opts.alt?7:21, opts.alt?2.2:3); sfx.ability(); break;
    case 'smokeSky': {
      if(ent.isPlayer && ent.agent==='tianqiong'){
        // 天穹（原版炼狱式）：打开战术地图，点击地图选点投放，投放时才消耗
        G.hooks.openSmokeMap?.(ent, key);
        used = false;
        break;
      }
      if(ent.isPlayer && ent.agent==='anmu'){
        // 暗幕（原版幽影式）：进入下烟模式（指针可穿墙瞄点，左键确认时才消耗）
        G.smokeMode = { agent: ent, key, cd: def.cd||20, until: G.now + 12 };
        G.hooks.hudMsg?.('下烟模式：瞄准落点（可越过墙体）· 左键投放 · 其他键取消');
        used = false;
        break;
      }
      // bot / 非玩家：直接瞄点投放
      const p = aimPoint(ent, 60);
      targetRing(p, 4.5, 1200, 0xff4655, ent);
      schedule(1.1, ()=>{ if(G.match?.phase==='live'||G.match?.phase==='planted') spawnSmoke(p, 4.5, 19); }, 'smoke');
      if(key==='e') ent.abCd.e = G.now + def.cd;
      sfx.ability();
      break;
    }
    case 'molly':
      throwProj(ent, 'molly', opts.alt?7:24, opts.alt?2.2:4); sfx.ability(); break;
    case 'stim':
      ent.stimUntil = G.now + 12; sfx.ability(); break;
    case 'orbital': {
      const p = aimPoint(ent, 80);
      castOrbital(ent, p);
      break;
    }
    case 'wall': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      const p = V3(ent.pos.x + dir.x*4, 0, ent.pos.z + dir.z*4);
      spawnWall(p, ent.yaw, 30);
      break;
    }
    case 'slowProj':
      throwProj(ent, 'slow', opts.alt?7:20, opts.alt?2.2:3.5); sfx.ability(); break;
    case 'heal': {
      let target = ent;
      const dir = dirFromYawPitch(ent.yaw, ent.pitch);
      const o = eyePos(ent);
      const hit = traceRay(o, dir, 14, ent);
      if(hit.ent && hit.ent.team === ent.team) target = hit.ent;
      if(target.hp >= 100 && target === ent){ used = false; if(ent.isPlayer) sfx.deny(); break; }
      target.healQueue = Math.min(target.healQueue + 60, 100 - target.hp + 5);
      if(key==='e') ent.abCd.e = G.now + def.cd;
      sfx.heal();
      break;
    }
    case 'rez': {
      let best = null, bd = 9;
      for(const c of G.corpses){
        if(c.ent.team !== ent.team || c.ent.alive || c.ent === ent) continue;
        const d = dist2d(c.pos, ent.pos);
        if(d < bd){ bd = d; best = c; }
      }
      if(!best){ used = false; if(ent.isPlayer) sfx.deny(); break; }
      const t = best.ent;
      t.alive = true; t.hp = 100; t.armor = 0;
      t.pos.copy(best.pos); t.vel.set(0,0,0);
      if(t.mesh){ t.mesh.rotation.set(0,t.yaw,0); if(t.tag) t.tag.visible = true; }
      G.corpses.splice(G.corpses.indexOf(best),1);
      sfx.heal();
      G.hooks.hudMsg?.(`${ent.name} 复活了 ${t.name}`);
      break;
    }
    case 'knifeUlt':
      ent.knifeUlt = 5;
      ent.ultWeapon = {
        id:'ultblade',
        def:{ name:'锋刃', cat:'ult', mag:999, res:0, fi:.33, rl:0, alt:false, pellets:1,
          dmg:{0:{h:150,b:50,l:50}},
          spread:{base:.2,mv:.2,bloom:0}, recoil:{perShot:0,cap:0,wander:0,decay:30},
          ads:{}, vm:{x:.14,y:-.2,z:-.28,sc:.035,rot:[0.6,0,0]} },
        ammo:999, reserve:0, nextFire:0, reloadEnd:0, shots:0, lastShot:0,
      };
      sfx.ultReady();
      break;
    // ---- 新技能 ----
    case 'flash':
      throwProj(ent, 'flash', opts.alt?8:26, opts.alt?2:3); sfx.ability(); break;
    case 'firewall':
      fireWall(ent); break;
    case 'selfheal':
      if(ent.hp >= 100){ used=false; if(ent.isPlayer) sfx.deny(); break; }
      ent.healQueue = Math.min(ent.healQueue + 50, 100 - ent.hp + 5);
      ent.abCd.e = G.now + def.cd;
      sfx.heal();
      break;
    case 'phoenixUlt':
      ent.hp = 100; ent.healQueue = 0;
      ent.resistUntil = G.now + 8;
      sfx.ultReady();
      G.hooks.hudMsg?.(`${ent.name} 涅槃重生！`);
      break;
    case 'paranoia':
      coneFlash(ent); break;
    case 'shadowStep':
      if(!shadowStep(ent, 9, false)){ used=false; break; }
      ent.abCd.e = G.now + def.cd;
      break;
    case 'shadowUlt':
      if(ent.isPlayer){
        // 从影而袭（原版幽影大招）：打开战术地图点击传送
        G.hooks.openSmokeMap?.(ent, key, 'tp');
        used = false;
        break;
      }
      if(!shadowStep(ent, 40, true)){ used=false; if(ent.isPlayer) sfx.deny(); break; }
      break;
    case 'recon':
      throwProj(ent, 'recon', opts.alt?9:34, opts.alt?2:2.5); if(key==='e') ent.abCd.e = G.now + (def.cd||35); sfx.ability(); break;
    case 'shock':
      throwProj(ent, 'shock', opts.alt?8:28, opts.alt?2.2:3); sfx.ability(); break;
    case 'pulse':
      revealArea(ent.pos.clone(), 22, 2.5, ent.team);
      ent.abCd.e = G.now + def.cd;
      break;
    case 'hunterUlt':
      ent.arrowUlt = 3;
      sfx.ultReady();
      break;
    // ---- 雷奕 ----
    case 'nade':
      throwProj(ent, 'nade', opts.alt?7:24, opts.alt?2.2:3.5); sfx.ability(); break;
    case 'bignade':
      throwProj(ent, 'bignade', opts.alt?7:22, opts.alt?2.4:4); sfx.ability(); break;
    case 'blastjump': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      ent.vel.x = dir.x*8; ent.vel.z = dir.z*8; ent.vel.y = 7.2;
      ent.grounded = false;
      ent.dashUntil = G.now + .3;
      ent.abCd.e = G.now + (def.cd||25);
      boomAt(V3(ent.pos.x, ent.pos.y, ent.pos.z), 2, 0, 0, null, '爆炸跳跃');
      sfx.dash();
      break;
    }
    case 'rocketUlt':
      ent.rocketUlt = 1;
      sfx.ultReady();
      break;
    // ---- 蛛影 ----
    case 'tripwire': {
      const p = aimPoint(ent, 9);
      spawnTrap(V3(p.x, ent.pos.y, p.z), ent.yaw, ent);
      sfx.ability();
      break;
    }
    case 'turret': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      const p = V3(ent.pos.x + dir.x*1.4, ent.pos.y, ent.pos.z + dir.z*1.4);
      if(!inAnyOpen(p.x, p.z)){ p.set(ent.pos.x, ent.pos.y, ent.pos.z); }
      spawnTurret(p, ent.yaw, ent);
      break;
    }
    case 'cage': {
      const p = aimPoint(ent, 26);
      spawnSmoke(p, 3.4, 8);
      spawnZone('slow', p, 3.4, 8, 0, ent);
      if(key==='e') ent.abCd.e = G.now + (def.cd||30);
      break;
    }
    case 'revealAll': {
      let n = 0;
      for(const e of G.ents){
        if(!e.alive || e.team === ent.team) continue;
        e.revealedUntil = Math.max(e.revealedUntil||0, G.now + 5);
        if(e.isPlayer) sfx.revealed();
        n++;
        for(const b of G.ents){
          if(b.team !== ent.team || b.isPlayer || !b.alive || !b.ai) continue;
          if(!b.ai.target && dist2d(b.pos, e.pos) < 50){ b.ai.lastSeenPos.copy(e.pos); b.ai.lastSeenAt = G.now; }
        }
      }
      sfx.reveal();
      if(ent.isPlayer) G.hooks.hudMsg?.(`全域窃视：标记了 ${n} 名敌人`);
      break;
    }
    // ---- 岚切 ----
    case 'quake': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      const p = V3(ent.pos.x + dir.x*7.5, 0, ent.pos.z + dir.z*7.5);
      targetRing(p, 3.2, 650, 0xffa040);
      schedule(.65, ()=>{
        const phn = G.match?.phase;
        if(phn!=='live' && phn!=='planted') return;
        explosionFX(V3(p.x, .5, p.z));
        sfx.nade(G.player ? p.distanceTo(G.player.pos) : 0);
        for(const e of G.ents){
          if(!e.alive || e.team===ent.team) continue;
          if(dist2d(e.pos, p) < 3.4 && e.pos.y < 3) applyDamage(e, 60, ent, '震荡爆破', 'b');
        }
      }, 'aftershock');
      sfx.ability();
      break;
    }
    case 'wallFlash':
      coneFlash(ent, 1.5); break;
    case 'stunWave':
      coneDaze(ent, 18, .72, 2.4);
      ent.abCd.e = G.now + (def.cd||35);
      break;
    case 'bigStun':
      coneDaze(ent, 26, .55, 3.2);
      sfx.ultReady();
      break;
    // ---- 青鸩 ----
    case 'toxicSmoke': {
      const p = aimPoint(ent, 40);
      spawnSmoke(p, 3.8, 11);
      spawnZone('toxic', p, 3.4, 11, 8, ent);
      break;
    }
    case 'acidPool':
      throwProj(ent, 'acid', opts.alt?7:22, opts.alt?2.2:3); sfx.ability(); break;
    case 'toxicWall': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      for(let i=0;i<7;i++){
        const p = V3(ent.pos.x + dir.x*(4+i*3), 0, ent.pos.z + dir.z*(4+i*3));
        spawnSmoke(p, 2.4, 12);
      }
      ent.abCd.e = G.now + (def.cd||32);
      break;
    }
    case 'toxicDome': {
      const p = aimPoint(ent, 45);
      spawnSmoke(p, 9, 26);
      spawnZone('toxic', p, 8.5, 26, 6, ent);
      sfx.ultReady();
      break;
    }
    // ---- 零式 ----
    case 'suppressNade':
      throwProj(ent, 'suppress', opts.alt?7:22, opts.alt?2.2:3); sfx.ability(); break;
    case 'nanoSwarm':
      throwProj(ent, 'nanoproj', opts.alt?7:21, opts.alt?2.2:3); sfx.ability(); break;
    case 'fragNade':
      throwProj(ent, 'frag', opts.alt?7:24, opts.alt?2.2:3.5); sfx.ability(); break;
    case 'nullPulse': {
      popSuppress(V3(ent.pos.x, ent.pos.y+1, ent.pos.z), 16, 6, ent);
      ent.stimUntil = G.now + 8;
      sfx.ultReady();
      break;
    }
    // ---- 魅影 ----
    case 'devour': {
      if(G.now - (ent.lastKillAt||-99) > 6){ used=false; if(ent.isPlayer){ sfx.deny(); G.hooks.hudMsg?.('吞噬：需要在击杀后 6 秒内使用'); } break; }
      ent.healQueue = Math.min(ent.healQueue + 80, Math.max(0, 100 - ent.hp) + 5);
      // 吞噬同时恢复并强化护盾：+25 护盾（上限 50）
      ent.armor = Math.min(50, ent.armor + 25);
      ent.armorMax = Math.max(ent.armorMax, ent.armor);
      if(ent.isPlayer) G.hooks.hudMsg?.('吞噬：生命回复 + 护盾强化');
      sfx.heal();
      break;
    }
    case 'dismiss': {
      const dd = dirFromYawPitch(ent.yaw, 0);
      const mvv = V3(ent.vel.x,0,ent.vel.z);
      const dv = mvv.lengthSq() > 4 ? mvv.normalize() : dd;
      ent.vel.x = dv.x*18; ent.vel.z = dv.z*18;
      ent.dashUntil = G.now + .3;
      ent.resistUntil = Math.max(ent.resistUntil||0, G.now + 1.2);
      teleportFX(ent.pos.clone());
      if(key==='e') ent.abCd.e = G.now + (def.cd||26);
      sfx.dash();
      break;
    }
    case 'empress': {
      ent.empressUntil = G.now + 14;
      ent.stimUntil = Math.max(ent.stimUntil||0, G.now + 14);
      ent.healQueue = Math.min(ent.healQueue + 30, 100 - ent.hp + 5);
      sfx.ultReady();
      G.hooks.hudMsg?.(`${ent.name} 进入女皇仪式——击杀即满血！`);
      break;
    }
    // ---- 灵愈 ----
    case 'seekers': {
      const foes = G.ents.filter(e=>e.alive && e.team!==ent.team)
        .sort((x,y)=>dist2d(x.pos,ent.pos)-dist2d(y.pos,ent.pos)).slice(0,3);
      if(!foes.length){ used=false; if(ent.isPlayer) sfx.deny(); break; }
      for(const f of foes){
        targetRing(V3(f.pos.x,0,f.pos.z), 1.6, 2400, 0x9fe08a);
        schedule(2.2, ()=>{
          const phn=G.match?.phase;
          if((phn!=='live'&&phn!=='planted') || !f.alive) return;
          f.revealedUntil = Math.max(f.revealedUntil||0, G.now+4);
          f.dazeUntil = Math.max(f.dazeUntil||0, G.now+2.2);
          f.slowUntil = Math.max(f.slowUntil||0, G.now+2.2);
          if(f.isPlayer){ G.hooks.dazed?.(1.5); sfx.revealed(); }
          for(const b of G.ents){
            if(b.team !== ent.team || b.isPlayer || !b.alive || !b.ai) continue;
            if(!b.ai.target && dist2d(b.pos, f.pos) < 45){ b.ai.lastSeenPos.copy(f.pos); b.ai.lastSeenAt = G.now; }
          }
        }, 'seeker');
      }
      sfx.reveal();
      if(ent.isPlayer) G.hooks.hudMsg?.(`追猎之灵：锁定了 ${foes.length} 名敌人`);
      break;
    }
    // ---- 噬梦 ----
    case 'nightfall': {
      revealArea(ent.pos.clone().setY(0), 26, 3.5, ent.team);
      coneDaze(ent, 24, .55, 3.5);
      for(const e of G.ents){
        if(!e.alive || e.team===ent.team) continue;
        if(dist2d(ent.pos, e.pos) < 24){ e.slowUntil = Math.max(e.slowUntil||0, G.now + 4); }
      }
      sfx.ultReady();
      if(ent.isPlayer) G.hooks.hudMsg?.('夜幕低语：区域显形 + 大范围震慑减速');
      break;
    }
    // ---- 伯爵 ----
    case 'headhunter': {
      ent.weapons.secondary = {
        id:'headhunter',
        def:{ name:'猎头者', cat:'pistol', mag:8, res:0, fi:.15, rl:0, alt:false, pellets:1,
          dmg:{0:{h:159,b:55,l:46}, 30:{h:145,b:50,l:42}},
          spread:{base:.55,mv:.8,bloom:1.4}, recoil:{perShot:14,cap:100,wander:1.8,decay:32},
          ads:{}, vm:{x:.18,y:-.14,z:-.33,sc:.042,rot:[0,0,.05]} },
        ammo:8, reserve:0, nextFire:0, reloadEnd:0, shots:0, lastShot:0,
      };
      ent.slot = 'secondary';
      if(ent.isPlayer) { G.hooks.rebuildViewModel?.(); }
      sfx.buy();
      break;
    }
    case 'tourdeforce': {
      const w = {
        id:'tourdeforce',
        def:{ name:'决胜者', cat:'sniper', mag:5, res:0, fi:.9, rl:0, alt:false, pellets:1,
          dmg:{0:{h:255,b:150,l:120}, 50:{h:240,b:140,l:110}},
          spread:{base:.22,mv:2.5,bloom:3.0}, recoil:{perShot:45,cap:240,wander:4,decay:18},
          ads:{fov:18,spread:.06,mv:.4,recoil:.5,scope:true}, vm:{x:.18,y:-.14,z:-.49,sc:.06,rot:[0,0,.02]} },
        ammo:5, reserve:0, nextFire:0, reloadEnd:0, shots:0, lastShot:0,
      };
      if(ent.weapons.primary) ent.weapons.primary = ent.weapons.secondary;
      ent.weapons.primary = w;
      ent.slot = 'primary';
      if(ent.isPlayer) { G.hooks.rebuildViewModel?.(); }
      sfx.ultReady();
      break;
    }
    // ---- 织锁 ----
    case 'cocoon': {
      // 选中半径内最近敌人（无视墙体），束缚禁锢
      const t = G.ents.filter(e=>e.alive && e.team!==ent.team && dist2d(e.pos, ent.pos) < 16)
        .sort((a,b)=>dist2d(a.pos,ent.pos)-dist2d(b.pos,ent.pos))[0];
      if(!t){ used=false; if(ent.isPlayer) sfx.deny(); break; }
      t.revealedUntil = Math.max(t.revealedUntil||0, G.now + 6);
      t.slowUntil = Math.max(t.slowUntil||0, G.now + 7);
      t.suppressedUntil = Math.max(t.suppressedUntil||0, G.now + 7);
      t.dazeUntil = Math.max(t.dazeUntil||0, G.now + 4);
      if(t.isPlayer) G.hooks.hudMsg?.('你被湮灭之茧束缚了！');
      if(!t.isPlayer && t.ai){ t.ai.burstLeft = 0; }
      sfx.beamFire(G.player ? t.pos.distanceTo(G.player.pos) : 0);
      if(ent.isPlayer) G.hooks.hudMsg?.('湮灭之茧：拘捕一名敌人');
      break;
    }
    // ---- 复刻原版新技能 ----
    case 'hotHands':
      throwProj(ent, 'hot', opts.alt?7:22, opts.alt?2.2:3.5); sfx.ability(); break;
    case 'stimBeacon': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      const p = V3(ent.pos.x + dir.x*1.2, ent.pos.y, ent.pos.z + dir.z*1.2);
      spawnDevice('beacon', p, ent, { until: G.now + 10, r: 5.5 });
      sfx.ability();
      break;
    }
    case 'droneScan': {
      const dir = dirFromYawPitch(ent.yaw, ent.pitch*.3);
      const o = eyePos(ent);
      G.projectiles.push({ type:'drone', owner:ent, pos:o.clone().addScaledVector(dir,.8),
        vel: dir.clone().multiplyScalar(8), born:G.now, nextPing:G.now+.3 });
      sfx.reveal();
      break;
    }
    case 'boomBot': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      G.projectiles.push({ type:'boombot', owner:ent,
        pos:V3(ent.pos.x + dir.x*.8, .32, ent.pos.z + dir.z*.8),
        vel: dir.clone().multiplyScalar(6.5), born:G.now });
      sfx.ability();
      break;
    }
    case 'alarmBot': {
      const p = aimPoint(ent, 8);
      spawnDevice('alarm', V3(p.x, ent.pos.y, p.z), ent, { until: G.now + 90, r: 3.6 });
      sfx.ability();
      break;
    }
    case 'lockdown': {
      const p = V3(ent.pos.x, ent.pos.y, ent.pos.z);
      spawnDevice('lockdown', p, ent, { until: G.now + 24, armAt: G.now + 8, r: 26 });
      if(ent.isPlayer) G.hooks.hudMsg?.('全域封锁启动：8 秒后大范围禁锢');
      sfx.beamCharge(G.player ? p.distanceTo(G.player.pos) : 0);
      break;
    }
  }
  return used;
}

function castOrbital(ent, p){
  targetRing(p, 5.5, 2600);
  const pd = G.player ? p.distanceTo(G.player.pos) : 0;
  sfx.beamCharge(pd);
  schedule(2.5, ()=>{
    if(!G.match || G.match.phase==='end' || G.match.phase==='over') return;
    spawnZone('orbital', p, 5.5, 3.2, 260, ent);
    sfx.beamFire(pd);
  }, 'orbital');
}

// ============ AI 定点施放接口 ============
// AI 通过世界坐标目标点施放，不依赖视角。返回是否成功。
const BOT_AREA_JITTER = new Set(['nade','bignade','fragNade','quake','suppressNade','acidPool','hotHands',
  'toxicSmoke','toxicDome','cage','molly','shock','smokeSky','wallFlash','flash','headhunter','tourdeforce',
  'nightfall','cocoon','devour','dismiss','empress','seekers']);
export function botCast(bot, key, point, target){
  if(!bot.alive) return false;
  const ph = G.match?.phase;
  if(ph !== 'live' && ph !== 'planted') return false;
  if(G.now < (bot.suppressedUntil||0)) return false;
  const slot = bot.ab[key];
  // AI 投掷落点误差：随距离和难度扩散（玩家投不准，AI 也不该像素级精准）
  if(point && slot && BOT_AREA_JITTER.has(slot.def.type)){
    const D = G.match?.diff ?? .8;
    const err = (1.1 + dist2d(bot.pos, point)*.05) * Math.max(.3, 1.7 - D);
    point = V3(point.x + gauss()*err, point.y||0, point.z + gauss()*err);
  }
  if(!slot) return false;
  const def = slot.def;
  const agent = AGENTS[bot.agent];
  if(key==='x'){ if(bot.ult < agent.ultCost) return false; }
  else {
    if(slot.n <= 0) return false;
    if(key==='e' && G.now < bot.abCd.e) return false;
  }

  let used = true;
  switch(def.type){
    case 'smokeSky': case 'smokeProj': {
      const p = V3(point.x, 0, point.z);
      targetRing(p, 4.2, 1200);
      schedule(1.1, ()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') spawnSmoke(p, 4.2, 16); }, 'bot-smoke');
      if(key==='e') bot.abCd.e = G.now + (def.cd||20);
      break;
    }
    case 'molly': case 'shock': {
      const p = V3(point.x, 0, point.z);
      targetRing(p, 3.6, 800);
      schedule(.8, ()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted'){
        spawnZone('molly', p, def.type==='shock'?3.2:4, def.type==='shock'?4:7, def.type==='shock'?70:55, bot);
        sfx.molly(G.player? p.distanceTo(G.player.pos):0);
      } }, 'bot-damage-zone');
      break;
    }
    case 'slowProj':
      spawnZone('slow', V3(point.x,0,point.z), 4.5, 6.5, 0, bot); break;
    case 'orbital':
      castOrbital(bot, V3(point.x,0,point.z)); break;
    case 'wall': {
      const yaw = yawTo(bot.pos, point) + Math.PI/2;
      spawnWall(V3(point.x,0,point.z), yaw - Math.PI/2, 30);
      break;
    }
    case 'flash': {
      const p = V3(point.x, 1.6, point.z);
      schedule(.5, ()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') popFlash(p, bot); }, 'bot-flash');
      break;
    }
    case 'paranoia':
      bot.yaw = yawTo(bot.pos, point);
      coneFlash(bot); break;
    case 'recon':
      schedule(.8, ()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') revealArea(V3(point.x,0,point.z), 14, 2.5, bot.team); }, 'bot-recon');
      schedule(2.4, ()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') revealArea(V3(point.x,0,point.z), 14, 2.5, bot.team); }, 'bot-recon');
      break;
    case 'pulse':
      revealArea(bot.pos.clone(), 22, 2.5, bot.team);
      bot.abCd.e = G.now + def.cd;
      break;
    case 'heal': {
      const t = target && target.team===bot.team ? target : bot;
      t.healQueue = Math.min(t.healQueue + 60, 100 - t.hp + 5);
      if(key==='e') bot.abCd.e = G.now + def.cd;
      sfx.heal();
      break;
    }
    case 'selfheal':
      bot.healQueue = Math.min(bot.healQueue + 50, 100 - bot.hp + 5);
      bot.abCd.e = G.now + def.cd;
      break;
    case 'stim': bot.stimUntil = G.now + 12; break;
    case 'dash': case 'updraft': case 'shadowStep': case 'phoenixUlt': case 'knifeUlt': case 'rez': case 'firewall':
    case 'blastjump': case 'revealAll': case 'nullPulse': case 'bigStun': case 'stunWave': case 'turret':
    case 'stimBeacon': case 'droneScan': case 'boomBot': case 'lockdown':
    case 'devour': case 'dismiss': case 'empress': case 'seekers':
    case 'nightfall': case 'cocoon': case 'headhunter': case 'tourdeforce':
      return useAbility(bot, key);
    case 'hotHands': {
      const p = V3(point.x, 0, point.z);
      const z = spawnZone('molly', p, 3.6, 8, 26, bot);
      z.healOwner = true;
      sfx.molly(G.player ? p.distanceTo(G.player.pos) : 0);
      break;
    }
    case 'nanoSwarm':
      spawnDevice('nano', V3(point.x, 0, point.z), bot, { until: G.now + 90, r: 3 }); break;
    case 'alarmBot':
      spawnDevice('alarm', V3(point.x, 0, point.z), bot, { until: G.now + 90, r: 3.6 }); break;
    case 'nade': case 'bignade': case 'fragNade': {
      const p = V3(point.x, 0, point.z);
      targetRing(p, 3, 700, 0xffa040, bot);
      const big = def.type==='bignade';
      schedule(.7, ()=>{ const phn=G.match?.phase; if(phn!=='live'&&phn!=='planted') return;
        if(big) clusterBoom(p, bot);
        else boomAt(p, 3.2, 50, 22, bot, def.name); }, 'bot-grenade');
      break;
    }
    case 'rocketUlt': {
      const o = eyePos(bot);
      const dir = V3(point.x - o.x, (point.y||0) + .5 - o.y, point.z - o.z).normalize();
      G.projectiles.push({ type:'rocket', owner:bot, pos:o.clone().addScaledVector(dir,.8),
        vel: dir.multiplyScalar(26), born:G.now });
      sfx.shot('ult', G.player ? o.distanceTo(G.player.pos) : 0);
      break;
    }
    case 'tripwire':
      spawnTrap(V3(point.x, bot.pos.y, point.z), yawTo(bot.pos, point) + Math.PI/2, bot); break;
    case 'cage': {
      const p = V3(point.x, 0, point.z);
      spawnSmoke(p, 3.4, 8);
      spawnZone('slow', p, 3.4, 8, 0, bot);
      if(key==='e') bot.abCd.e = G.now + (def.cd||30);
      break;
    }
    case 'quake': {
      const p = V3(point.x, 0, point.z);
      targetRing(p, 3.2, 650, 0xffa040);
      schedule(.65, ()=>{
        const phn = G.match?.phase;
        if(phn!=='live' && phn!=='planted') return;
        explosionFX(V3(p.x,.5,p.z));
        sfx.nade(G.player ? p.distanceTo(G.player.pos) : 0);
        for(const e of G.ents){
          if(!e.alive || e.team===bot.team) continue;
          if(dist2d(e.pos, p) < 3.4 && e.pos.y < 3) applyDamage(e, 60, bot, '震荡爆破', 'b');
        }
      }, 'bot-aftershock');
      break;
    }
    case 'wallFlash':
      bot.yaw = yawTo(bot.pos, point);
      coneFlash(bot, 1.5); break;
    case 'toxicSmoke': {
      const p = V3(point.x, 0, point.z);
      spawnSmoke(p, 3.8, 11);
      spawnZone('toxic', p, 3.4, 11, 8, bot);
      break;
    }
    case 'acidPool':
      spawnZone('toxic', V3(point.x,0,point.z), 3.6, 8, 12, bot);
      sfx.molly(G.player ? point.distanceTo(G.player.pos) : 0);
      break;
    case 'toxicWall': {
      bot.yaw = yawTo(bot.pos, point);
      const dir = dirFromYawPitch(bot.yaw, 0);
      for(let i=0;i<7;i++){
        const p = V3(bot.pos.x + dir.x*(4+i*3), 0, bot.pos.z + dir.z*(4+i*3));
        spawnSmoke(p, 2.4, 12);
      }
      bot.abCd.e = G.now + (def.cd||32);
      break;
    }
    case 'toxicDome': {
      const p = V3(point.x, 0, point.z);
      spawnSmoke(p, 9, 26);
      spawnZone('toxic', p, 8.5, 26, 6, bot);
      break;
    }
    case 'suppressNade': {
      const p = V3(point.x, .8, point.z);
      targetRing(V3(p.x,0,p.z), 5.5, 700, 0xb478ff, bot);
      schedule(.7, ()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') popSuppress(p, 5.5, 5, bot); }, 'bot-suppress');
      break;
    }
    case 'hunterUlt': {
      // 穿墙猎杀：对目标直接三段能量矢
      const t = target;
      if(!t || !t.alive){ used=false; break; }
      for(let i=0;i<3;i++){
        schedule(i*.6, ()=>{
          if(!t.alive || !bot.alive) return;
          const o = eyePos(bot);
          const dir = V3().subVectors(eyePos(t), o).normalize();
          import('./effects.js?v=28').then(fx=> fx.tracer(o, eyePos(t), 0x80c0ff));
          sfx.shot('ult', G.player? o.distanceTo(G.player.pos):0);
          if(Math.random() < .7) applyDamage(t, 90, bot, '猎杀之矢', 'b');
        }, 'hunter-fury');
      }
      break;
    }
    default: used = false;
  }
  if(used){
    if(key==='x') bot.ult = 0;
    else slot.n--;
  }
  return used;
}

export function buyAbility(ent, key){
  const slot = ent.ab[key];
  const def = slot.def;
  if(slot.n >= def.max || def.cost===0) return false;
  if(ent.money < def.cost) return false;
  ent.money -= def.cost;
  slot.n++;
  const r = G.match?.round || 0;
  if(slot.boughtRound !== r){ slot.boughtRound = r; slot.boughtN = 0; }
  slot.boughtN++;
  return true;
}

// 右键出售本回合购买的技能（复刻无畏契约）
export function sellAbility(ent, key){
  const m = G.match;
  if(!m || m.phase!=='buy') return false;
  const slot = ent.ab[key];
  const def = slot.def;
  if(slot.boughtRound !== m.round || !(slot.boughtN > 0) || slot.n <= 0 || def.cost <= 0) return false;
  slot.n--;
  slot.boughtN--;
  ent.money = Math.min(9000, ent.money + def.cost);
  return true;
}

// ---------- 投掷物弹跳物理：墙面/箱体反弹 + 落地衰减滚动，静止或超时后生效 ----------
const BOUNCY = new Set(['smoke','flash','molly','slow','shock','nade','bignade','frag','acid','hot','nanoproj','clusterlet']);
function projBlocked(pos, r){
  const lists = [colQuery(pos.x-r-.5, pos.z-r-.5, pos.x+r+.5, pos.z+r+.5), G.dynColliders];
  for(const list of lists) for(const b of list){
    if(pos.x+r>b.min.x && pos.x-r<b.max.x &&
       pos.y+r>b.min.y && pos.y-r<b.max.y &&
       pos.z+r>b.min.z && pos.z-r<b.max.z) return true;
  }
  return false;
}
function stepBouncy(p, dt){
  const r = .12, damp = .45;
  // 分轴积分：碰撞轴反弹衰减，切向轴摩擦减速
  p.pos.x += p.vel.x*dt;
  if(projBlocked(p.pos, r)){ p.pos.x -= p.vel.x*dt; p.vel.x *= -damp; p.vel.z *= .88; }
  p.pos.z += p.vel.z*dt;
  if(projBlocked(p.pos, r)){ p.pos.z -= p.vel.z*dt; p.vel.z *= -damp; p.vel.x *= .88; }
  p.pos.y += p.vel.y*dt;
  if(p.pos.y <= r){
    p.pos.y = r;
    if(p.vel.y < -4.2){ p.vel.y *= -.32; p.vel.x *= .72; p.vel.z *= .72; }
    else return true;                                   // 轻触地面：落定生效
  } else if(projBlocked(p.pos, r)){
    p.pos.y -= p.vel.y*dt;
    if(p.vel.y < 0 && p.vel.y > -4.2) return true;      // 缓落箱顶：落定生效
    p.vel.y *= -.32;
  }
  // 滚动到几乎静止，或飞行超时 → 生效
  if(Math.hypot(p.vel.x, p.vel.z) < 1 && Math.abs(p.vel.y) < 1 && p.pos.y < 1.2) return true;
  return G.now - p.born > 3.2;
}

export function updateProjectiles(dt){
  runAbilityEvents(G.abilityEvents, G.now);
  tickUtilities(G.utilities, G.now);
  for(let i=G.projectiles.length-1;i>=0;i--){
    const p = G.projectiles[i];
    if(interceptProjectile(G.utilities, { ...p, team:p.owner?.team, interceptable:p.interceptable!==false })){
      removeProjectileVisual(p); G.projectiles.splice(i,1); continue;
    }
    if(!p.mesh) attachProjectileVisual(p);
    if(p.type==='drone'){
      // 侦察机：无重力直线巡航，周期性扫描显形
      if(G.now >= p.nextPing){
        p.nextPing = G.now + .45;
        revealArea(p.pos.clone().setY(0), 9, 1.4, p.owner.team);
      }
      if(G.now - p.born > 3.6){ removeProjectileVisual(p); G.projectiles.splice(i,1); continue; }
    } else if(p.type==='boombot'){
      // 轰轰机器人：贴地滚进，靠近敌人自爆
      p.pos.y = .32; p.vel.y = 0;
      let boom = G.now - p.born > 5;
      for(const e of G.ents){
        if(!e.alive || e.team===p.owner.team) continue;
        if(dist2d(e.pos, p.pos) < 2.4 && Math.abs(e.pos.y - p.pos.y) < 2){ boom = true; break; }
      }
      if(boom){
        boomAt(p.pos.clone(), 3.4, 70, 30, p.owner, '轰轰机器人');
        removeProjectileVisual(p); G.projectiles.splice(i,1); continue;
      }
    } else {
      p.vel.y -= (p.type==='rocket' ? 2.5 : 11)*dt;
    }
    let landed = false;
    if(BOUNCY.has(p.type)){
      landed = stepBouncy(p, dt);
    } else {
      const step = p.vel.length()*dt;
      const dir = p.vel.clone().normalize();
      const wallD = rayWalls(p.pos, dir, step + .2);
      if(wallD <= step + .1){
        p.pos.addScaledVector(dir, Math.max(0, wallD - .1));
        landed = true;
      } else {
        p.pos.addScaledVector(dir, step);
      }
      if(p.pos.y <= .15){ p.pos.y = .15; landed = true; }
    }
    // 闪光弹空中起爆
    if(p.type==='flash' && !landed && G.now - p.born > .55) landed = true;
    // 集束子雷：短引信起爆
    if(p.type==='clusterlet' && !landed && G.now - p.born > 1.05) landed = true;
    // 火箭弹直接命中检测
    if(p.type==='rocket' && !landed){
      for(const e of G.ents){
        if(e===p.owner || !e.alive) continue;
        if(p.pos.distanceTo(V3(e.pos.x, e.pos.y+1, e.pos.z)) < .9){ landed = true; break; }
      }
      if(G.now - p.born > 4) landed = true;
    }
    if(landed){
      switch(p.type){
        case 'smoke': spawnSmoke(p.pos.clone().setY(0), 3.4, 5.5); break;
        case 'molly':
          spawnZone('molly', p.pos.clone().setY(0), 4, 7, 55, p.owner);
          sfx.molly(G.player ? p.pos.distanceTo(G.player.pos) : 0);
          break;
        case 'slow': spawnZone('slow', p.pos.clone().setY(0), 4.5, 6.5, 0, p.owner); break;
        case 'flash': popFlash(p.pos.clone().setY(Math.max(1.4,p.pos.y)), p.owner); break;
        case 'shock':
          spawnZone('molly', p.pos.clone().setY(0), 3.2, 4, 70, p.owner);
          sfx.molly(G.player ? p.pos.distanceTo(G.player.pos) : 0);
          break;
        case 'recon': {
          const pt = p.pos.clone().setY(0);
          revealArea(pt, 14, 2.5, p.owner.team);
          schedule(1.6, ()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') revealArea(pt, 14, 2.5, p.owner.team); }, 'recon');
          break;
        }
        case 'nade': boomAt(p.pos.clone(), 3.2, 50, 22, p.owner, '爆破雷'); break;
        case 'bignade': clusterBoom(p.pos, p.owner); break;
        case 'clusterlet': boomAt(p.pos.clone(), 2.8, 50, 20, p.owner, '彩弹集束雷'); break;
        case 'frag': boomAt(p.pos.clone(), 3.4, 55, 25, p.owner, '破片雷'); break;
        case 'rocket': boomAt(p.pos.clone(), 5.2, 150, 60, p.owner, '毁灭者火箭'); break;
        case 'acid':
          spawnZone('toxic', p.pos.clone().setY(0), 3.6, 8, 12, p.owner);
          sfx.molly(G.player ? p.pos.distanceTo(G.player.pos) : 0);
          break;
        case 'suppress': popSuppress(p.pos.clone().setY(Math.max(.8,p.pos.y)), 5.5, 5, p.owner); break;
        case 'hot': {
          const z = spawnZone('molly', p.pos.clone().setY(0), 3.6, 8, 26, p.owner);
          z.healOwner = true;
          sfx.molly(G.player ? p.pos.distanceTo(G.player.pos) : 0);
          break;
        }
        case 'nanoproj': {
          spawnDevice('nano', p.pos.clone().setY(0), p.owner, { until: G.now + 90, r: 3 });
          break;
        }
        case 'drone': break;
        case 'boombot': boomAt(p.pos.clone(), 3.4, 70, 30, p.owner, '轰轰机器人'); break;
      }
      removeProjectileVisual(p);
      G.projectiles.splice(i,1);
    } else {
      updateProjectileVisual(p, dt);
    }
  }
}

export function tickHealAndZones(dt){
  for(const e of G.ents){
    if(!e.alive) continue;
    if(e.healQueue > 0){
      const amt = Math.min(e.healQueue, 15*dt);
      e.healQueue -= amt;
      e.hp = Math.min(100, e.hp + amt);
      if(e.hp >= 100) e.healQueue = 0;
    }
    let slowed = false;
    for(const z of G.zones){
      const dx = e.pos.x - z.pos.x, dz = e.pos.z - z.pos.z;
      if(dx*dx + dz*dz > z.r*z.r || e.pos.y > 3) continue;
      if(z.type==='slow') slowed = true;
      else if(z.dps > 0){
        if(z.owner && z.owner.team === e.team){
          // 火热双手：烈焰站在自己的火圈里持续回血
          if(z.healOwner && z.owner === e) e.hp = Math.min(100, e.hp + 13*dt);
          continue;
        }
        e._zoneDmg = (e._zoneDmg||0) + z.dps*dt;
        if(e._zoneDmg >= 5){
          const d = Math.floor(e._zoneDmg);
          e._zoneDmg -= d;
          applyDamage(e, d, z.owner!==e?z.owner:null, z.type==='orbital'?'轨道打击':'燃烧弹', 'b');
        }
      }
    }
    if(slowed) e.slowUntil = G.now + .3;
  }
}
