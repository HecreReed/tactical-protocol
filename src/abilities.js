import * as THREE from 'three';
import { G } from './state.js?v=10';
import { V3, dirFromYawPitch, dist2d, yawTo, deg, rand } from './utils.js?v=10';
import { AGENTS } from './config.js?v=10';
import { spawnSmoke, spawnZone, spawnWall, targetRing, teleportFX, flashFX } from './effects.js?v=10';
import { eyePos, rayWalls, traceRay, makeWeapon, applyDamage, hitSpheres, losBlocked } from './combat.js?v=10';
import { inAnyOpen } from './map.js?v=10';
import { sfx } from './audio.js?v=10';
import { raySphere } from './utils.js?v=10';

export function initAbilities(ent){
  const a = AGENTS[ent.agent];
  ent.ab = {};
  for(const k of ['c','q','e','x']){
    ent.ab[k] = { n: a.ab[k].start, def: a.ab[k] };
  }
  ent.abCd = { e: 0 };
}

export function roundRefill(ent){
  const a = AGENTS[ent.agent];
  for(const k of ['c','q','e']){
    if(a.ab[k].free || a.ab[k].cost===0) ent.ab[k].n = Math.max(ent.ab[k].n, a.ab[k].start);
  }
  ent.abCd.e = 0;
  ent.knifeUlt = 0;
  ent.arrowUlt = 0;
  ent.flashUntil = 0; ent.revealedUntil = 0; ent.resistUntil = 0;
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

// ============ 主动使用（玩家/AI 自身向技能） ============
export function useAbility(ent, key){
  if(!ent.alive || ent.channel) return false;
  const ph = G.match?.phase;
  if(ph !== 'live' && ph !== 'planted') return false;
  const slot = ent.ab[key];
  if(!slot) return false;
  const def = slot.def;
  const agent = AGENTS[ent.agent];

  if(key==='x'){
    if(ent.ult < agent.ultCost) { if(ent.isPlayer) sfx.deny(); return false; }
  } else {
    if(slot.n <= 0) { if(ent.isPlayer) sfx.deny(); return false; }
    if(key==='e' && G.now < ent.abCd.e) { if(ent.isPlayer) sfx.deny(); return false; }
  }

  let used = true;
  switch(def.type){
    case 'dash': {
      const dir = dirFromYawPitch(ent.yaw, 0);
      const mv = V3(ent.vel.x,0,ent.vel.z);
      const d = mv.lengthSq() > 4 ? mv.normalize() : dir;
      ent.vel.x = d.x*16; ent.vel.z = d.z*16;
      ent.dashUntil = G.now + .28;
      sfx.dash();
      break;
    }
    case 'updraft':
      ent.vel.y = 11; ent.grounded = false; sfx.dash(); break;
    case 'smokeProj':
      throwProj(ent, 'smoke', 15, 3); sfx.ability(); break;
    case 'smokeSky': {
      const p = aimPoint(ent, 60);
      targetRing(p, 4.5, 1200);
      setTimeout(()=>{ if(G.match?.phase==='live'||G.match?.phase==='planted') spawnSmoke(p, 4.5, 19); }, 1100);
      if(key==='e') ent.abCd.e = G.now + def.cd;
      sfx.ability();
      break;
    }
    case 'molly':
      throwProj(ent, 'molly', 17, 4); sfx.ability(); break;
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
      throwProj(ent, 'slow', 15, 3.5); sfx.ability(); break;
    case 'heal': {
      let target = ent;
      const dir = dirFromYawPitch(ent.yaw, ent.pitch);
      const o = eyePos(ent);
      const hit = traceRay(o, dir, 14, ent);
      if(hit.ent && hit.ent.team === ent.team) target = hit.ent;
      if(target.hp >= 100 && target === ent){ used = false; if(ent.isPlayer) sfx.deny(); break; }
      target.healQueue = Math.min(target.healQueue + 60, 100 - target.hp + 5);
      ent.abCd.e = G.now + def.cd;
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
      throwProj(ent, 'flash', 19, 3); sfx.ability(); break;
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
      if(!shadowStep(ent, 40, true)){ used=false; if(ent.isPlayer) sfx.deny(); break; }
      break;
    case 'recon':
      throwProj(ent, 'recon', 24, 2); sfx.ability(); break;
    case 'shock':
      throwProj(ent, 'shock', 20, 3); sfx.ability(); break;
    case 'pulse':
      revealArea(ent.pos.clone(), 22, 2.5, ent.team);
      ent.abCd.e = G.now + def.cd;
      break;
    case 'hunterUlt':
      ent.arrowUlt = 3;
      sfx.ultReady();
      break;
  }

  if(used){
    if(key==='x') ent.ult = 0;
    else slot.n--;
  }
  return used;
}

function castOrbital(ent, p){
  targetRing(p, 5.5, 2600);
  const pd = G.player ? p.distanceTo(G.player.pos) : 0;
  sfx.beamCharge(pd);
  setTimeout(()=>{
    if(!G.match || G.match.phase==='end' || G.match.phase==='over') return;
    spawnZone('orbital', p, 5.5, 3.2, 260, ent);
    sfx.beamFire(pd);
  }, 2500);
}

// ============ AI 定点施放接口 ============
// AI 通过世界坐标目标点施放，不依赖视角。返回是否成功。
export function botCast(bot, key, point, target){
  if(!bot.alive) return false;
  const ph = G.match?.phase;
  if(ph !== 'live' && ph !== 'planted') return false;
  const slot = bot.ab[key];
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
      setTimeout(()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') spawnSmoke(p, 4.2, 16); }, 1100);
      if(key==='e') bot.abCd.e = G.now + (def.cd||20);
      break;
    }
    case 'molly': case 'shock': {
      const p = V3(point.x, 0, point.z);
      targetRing(p, 3.6, 800);
      setTimeout(()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted'){
        spawnZone('molly', p, def.type==='shock'?3.2:4, def.type==='shock'?4:7, def.type==='shock'?70:55, bot);
        sfx.molly(G.player? p.distanceTo(G.player.pos):0);
      } }, 800);
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
      setTimeout(()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') popFlash(p, bot); }, 500);
      break;
    }
    case 'paranoia':
      bot.yaw = yawTo(bot.pos, point);
      coneFlash(bot); break;
    case 'recon':
      setTimeout(()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') revealArea(V3(point.x,0,point.z), 14, 2.5, bot.team); }, 800);
      setTimeout(()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') revealArea(V3(point.x,0,point.z), 14, 2.5, bot.team); }, 2400);
      break;
    case 'pulse':
      revealArea(bot.pos.clone(), 22, 2.5, bot.team);
      bot.abCd.e = G.now + def.cd;
      break;
    case 'heal': {
      const t = target && target.team===bot.team ? target : bot;
      t.healQueue = Math.min(t.healQueue + 60, 100 - t.hp + 5);
      bot.abCd.e = G.now + def.cd;
      sfx.heal();
      break;
    }
    case 'selfheal':
      bot.healQueue = Math.min(bot.healQueue + 50, 100 - bot.hp + 5);
      bot.abCd.e = G.now + def.cd;
      break;
    case 'stim': bot.stimUntil = G.now + 12; break;
    case 'dash': case 'updraft': case 'shadowStep': case 'phoenixUlt': case 'knifeUlt': case 'rez': case 'firewall':
      return useAbility(bot, key);
    case 'hunterUlt': {
      // 穿墙猎杀：对目标直接三段能量矢
      const t = target;
      if(!t || !t.alive){ used=false; break; }
      for(let i=0;i<3;i++){
        setTimeout(()=>{
          if(!t.alive || !bot.alive) return;
          const o = eyePos(bot);
          const dir = V3().subVectors(eyePos(t), o).normalize();
          import('./effects.js?v=10').then(fx=> fx.tracer(o, eyePos(t), 0x80c0ff));
          sfx.shot('ult', G.player? o.distanceTo(G.player.pos):0);
          if(Math.random() < .7) applyDamage(t, 90, bot, '猎杀之矢', 'b');
        }, i*600);
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
  return true;
}

export function updateProjectiles(dt){
  for(let i=G.projectiles.length-1;i>=0;i--){
    const p = G.projectiles[i];
    p.vel.y -= 14*dt;
    const step = p.vel.length()*dt;
    const dir = p.vel.clone().normalize();
    const wallD = rayWalls(p.pos, dir, step + .2);
    let landed = false;
    if(wallD <= step + .1){
      p.pos.addScaledVector(dir, Math.max(0, wallD - .1));
      landed = true;
    } else {
      p.pos.addScaledVector(dir, step);
    }
    if(p.pos.y <= .15){ p.pos.y = .15; landed = true; }
    // 闪光弹空中起爆
    if(p.type==='flash' && !landed && G.now - p.born > .55) landed = true;
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
          setTimeout(()=>{ const phn=G.match?.phase; if(phn==='live'||phn==='planted') revealArea(pt, 14, 2.5, p.owner.team); }, 1600);
          break;
        }
      }
      G.projectiles.splice(i,1);
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
        if(z.owner && z.owner.team === e.team && z.owner !== e) continue;
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
