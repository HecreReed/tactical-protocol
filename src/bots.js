import { G } from './state.js';
import { V3, dist2d, yawTo, pitchTo, angDiff, clamp, rand, pick, gauss, deg, dirFromYawPitch } from './utils.js';
import { curWeapon, moveSpeed, moveEntity, fireShot, eyePos, losBlocked, updateBodyPose, rayWalls } from './combat.js';
import { findPath, inSite, nearestWp, pathClear } from './map.js';
import { useAbility, botCast } from './abilities.js';
import { sfx } from './audio.js';

const THINK_DT = .12;

export function initBotAI(ent, i){
  ent.ai = {
    nextThink: rand(0, THINK_DT),
    path: [], pathI: 0, goal: null,
    hold: null, holdLook: null,
    target: null, reactAt: 0, acqT: 0, lastSeenAt: -9, lastSeenPos: V3(),
    burstLeft: 0, burstPause: 0,
    strafeDir: 1, strafeT: 0,
    repathT: 0, stuckT: 0, lastPos: V3(), sideUntil: 0, sideDir: 1,
    role: i, planStartAt: 0, stageAt: 0,
    flags: {}, abGate: 0,
    aimHead: false, rotated: false,
    state: 'wait',
  };
}

export function resetBotRound(ent){
  const a = ent.ai; if(!a) return;
  a.path = []; a.pathI = 0; a.goal = null; a.hold = null; a.holdLook = null;
  a.target = null; a.lastSeenAt = -9; a.burstLeft = 0; a.acqT = 0;
  a.flags = {}; a.abGate = 0; a.rotated = false;
  a.stuckT = 0; a.sideUntil = 0; a.state = 'wait'; a.stageAt = 0;
  a.planStartAt = G.now + rand(.1, .9);
  a.anchor = ent.pos.clone();
  a.wander = null; a.wanderT = 0; a.wanderYaw = ent.yaw;
}

const sideOf = ent => ent.team === 'ally' ? G.match.allySide : (G.match.allySide==='atk'?'def':'atk');
const D = ()=> G.match.diff; // 0.55 - 1.25

// ---------- 感知 ----------
function findTarget(bot){
  if(G.now < (bot.flashUntil||0)) return null;
  const eye = eyePos(bot);
  let best = null, bd = Infinity;
  for(const e of G.ents){
    if(!e.alive || e.team === bot.team) continue;
    const d = dist2d(bot.pos, e.pos);
    if(d > 55) continue;
    const ty = yawTo(bot.pos, e.pos);
    const fov = d < 4 ? Math.PI : deg(60 + 60*D());
    if(Math.abs(angDiff(bot.yaw, ty)) > fov/1.4) continue;
    const te = eyePos(e);
    if(losBlocked(eye, te)) continue;
    const hspd = Math.hypot(e.vel.x, e.vel.z);
    if(hspd < 2.5 && d > 28 + 12*D() && Math.random() < .5 - .2*D()) continue;
    // 优先打伤害来源
    let score = d;
    if(bot.lastDamaged > G.now - 2 && e.lastShotAt > G.now - 1.5) score *= .5;
    if(score < bd){ bd = score; best = e; }
  }
  return best;
}

function setPath(bot, dest){
  const a = bot.ai;
  const raw = findPath(bot.pos, dest);
  a.path = raw.length ? raw : [];
  if(raw.length) a.path.push(dest.clone ? dest.clone() : V3(dest.x,0,dest.z));
  a.pathI = 0;
  a.repathT = G.now + 3;
}

function lookaheadTarget(bot, path, pathI){
  const maxSteps = 5, maxD = 6.5;
  let best = pathI;
  for(let i = pathI + 1; i < path.length && i <= pathI + maxSteps; i++){
    const wp = path[i];
    if(dist2d(bot.pos, wp) > maxD) break;
    if(pathClear(bot.pos, wp, .35)) best = i;
  }
  return path[best];
}

function followPath(bot, dt, sprint=true){
  const a = bot.ai;
  if(a.pathI >= a.path.length){ bot.vel.x *= .8; bot.vel.z *= .8; return true; }

  // 如果已经越过当前节点且能看见下一段，就推进索引，避免切角后卡住
  while(a.pathI < a.path.length - 1){
    const cur = a.path[a.pathI], nxt = a.path[a.pathI+1];
    const dx = nxt.x - cur.x, dz = nxt.z - cur.z;
    const len2 = dx*dx + dz*dz;
    if(len2 < 1e-4){ a.pathI++; continue; }
    const t = ((bot.pos.x - cur.x)*dx + (bot.pos.z - cur.z)*dz) / len2;
    if(t > 0.75 && pathClear(bot.pos, nxt, .35)){ a.pathI++; }
    else break;
  }
  if(a.pathI >= a.path.length){ bot.vel.x *= .8; bot.vel.z *= .8; return true; }

  const wp = lookaheadTarget(bot, a.path, a.pathI);
  const ty = yawTo(bot.pos, wp);
  if(!a.target){
    bot.yaw += angDiff(bot.yaw, ty) * Math.min(1, dt*8);
    bot.pitch *= (1 - dt*4);
  }
  const spd = moveSpeed(bot) * (sprint?1:.55);
  const dx = wp.x - bot.pos.x, dz = wp.z - bot.pos.z;
  const l = Math.hypot(dx,dz)||1;
  let mx = dx/l, mz = dz/l;

  // 卡死恢复侧移：沿着面朝方向左右平移，并实时检测侧向空间
  if(a.sideUntil && G.now < a.sideUntil){
    const rightX = Math.cos(bot.yaw), rightZ = -Math.sin(bot.yaw);
    const sideX = rightX * a.sideDir, sideZ = rightZ * a.sideDir;
    const sideD = rayWalls(V3(bot.pos.x, bot.pos.y+.7, bot.pos.z), V3(sideX,0,sideZ), 1.0);
    if(sideD < .6){ a.sideDir *= -1; }
    bot.vel.x = rightX * a.sideDir * spd;
    bot.vel.z = rightZ * a.sideDir * spd;
    return false;
  }

  // 前方障碍探测与绕障
  const feet = V3(bot.pos.x, bot.pos.y+.7, bot.pos.z);
  const fwd = V3(mx,0,mz);
  const aheadD = rayWalls(feet, fwd, 1.5);
  if(aheadD < 1.2){
    const high = rayWalls(V3(bot.pos.x, bot.pos.y+1.35, bot.pos.z), fwd, 1.7);
    if(high > 1.5 && bot.grounded && aheadD < 1.0){
      bot.vel.y = 5.2; bot.grounded = false;
    } else if(high <= 1.5){
      const leftX = -mz, leftZ = mx;
      const rightX = mz, rightZ = -mx;
      const ld = rayWalls(feet, V3(leftX,0,leftZ), 1.4);
      const rd = rayWalls(feet, V3(rightX,0,rightZ), 1.4);
      if(ld > .8 || rd > .8){
        const sx = ld > rd ? leftX : rightX;
        const sz = ld > rd ? leftZ : rightZ;
        mx = mx*.35 + sx*.85; mz = mz*.35 + sz*.85;
        const n = Math.hypot(mx,mz); mx/=n; mz/=n;
      } else {
        // 两侧都堵：减速等待路径转向或触发卡死恢复
        mx *= .25; mz *= .25;
      }
    }
  }

  bot.vel.x = mx * spd;
  bot.vel.z = mz * spd;
  bot.stepAcc += spd*dt;
  if(bot.stepAcc > 2.8){
    bot.stepAcc = 0;
    if(G.player?.alive) sfx.step(dist2d(bot.pos, G.player.pos));
    G.hooks.noise?.(bot.pos, bot);
  }
  return false;
}

function stuckCheck(bot, dt){
  const a = bot.ai;
  const speed = Math.hypot(bot.vel.x, bot.vel.z);
  const intent = speed > 1;
  const moved = dist2d(bot.pos, a.lastPos);
  a.lastPos.copy(bot.pos);

  // 同时观察朝向目标的整体推进，避免贴墙蹭动被误判为正常
  let progress = 0;
  if(a.goal){
    const gd = dist2d(bot.pos, a.goal);
    progress = (a.lastGoalDist || gd) - gd;
    a.lastGoalDist = gd;
  }

  if(intent && moved < .03 && progress < .02){
    a.stuckT += dt;
    if(a.stuckT > .5 && (!a.sideUntil || G.now > a.sideUntil + .4)){
      // 选择侧向空间更大的一边
      const rightX = Math.cos(bot.yaw), rightZ = -Math.sin(bot.yaw);
      const leftD = rayWalls(V3(bot.pos.x, bot.pos.y+.7, bot.pos.z), V3(-rightX,0,-rightZ), 1.2);
      const rightD = rayWalls(V3(bot.pos.x, bot.pos.y+.7, bot.pos.z), V3(rightX,0,rightZ), 1.2);
      a.sideDir = leftD > rightD ? -1 : 1;
      a.sideUntil = G.now + .6;
    }
    if(a.stuckT > 1.2 && a.goal){
      setPath(bot, a.goal);
      a.stuckT = .6;
    }
    if(a.stuckT > 2.5 && !a.target){
      // 兜底：拉回最近可达导航点（水平面），杜绝卡进墙体
      const w = G.map.wps[nearestWp(bot.pos)];
      bot.pos.x = w.x; bot.pos.z = w.z; bot.pos.y = Math.max(bot.pos.y, w.y - 1.1);
      bot.vel.set(0,0,0);
      a.stuckT = 0; a.sideUntil = 0; a.lastGoalDist = undefined;
      if(a.goal) setPath(bot, a.goal);
    }
  } else if(moved > .05 || progress > .04){
    a.stuckT = Math.max(0, a.stuckT - dt*2.5);
    if(a.stuckT <= 0){ a.stuckT = 0; a.sideUntil = 0; }
  }
}

// ---------- 交火 ----------
function combatUpdate(bot, dt){
  const a = bot.ai;
  const t = a.target;
  const w = curWeapon(bot);
  const d = dist2d(bot.pos, t.pos);
  const blinded = G.now < (bot.flashUntil||0);

  if(blinded){
    a.strafeT -= dt;
    if(a.strafeT<=0){ a.strafeT=rand(.3,.6); a.strafeDir = Math.random()<.5?-1:1; }
    const px = Math.cos(bot.yaw), pz = -Math.sin(bot.yaw);
    const spd = moveSpeed(bot)*.8;
    bot.vel.x = px*a.strafeDir*spd; bot.vel.z = pz*a.strafeDir*spd;
    if(Math.random()<.02 && w.ammo>0 && w.def.cat!=='melee'){
      w.ammo--; fireShot(bot, dirFromYawPitch(bot.yaw+gauss()*.5, gauss()*.2), w.def, deg(6));
    }
    return;
  }

  // 目标习得：持续可见时间越长瞄得越准
  a.acqT += dt;
  const acqNorm = clamp(a.acqT / (1.0 - .45*D()), 0, 1);
  const errMul = 2.3 - 1.3*acqNorm;

  // 瞄准点 + 移动预判
  const aimP = eyePos(t);
  if(!a.aimHead) aimP.y -= t.crouch ? .35 : .48;
  const leadK = d * .022 * (.3 + .7*D());
  aimP.x += clamp(t.vel.x * leadK, -1.4, 1.4);
  aimP.z += clamp(t.vel.z * leadK, -1.4, 1.4);

  const ty = yawTo(bot.pos, aimP);
  const eye = eyePos(bot);
  const tp = pitchTo(eye, aimP);
  const aimSpd = 7 + D()*8;
  bot.yaw += angDiff(bot.yaw, ty) * Math.min(1, dt*aimSpd);
  bot.pitch += (tp - bot.pitch) * Math.min(1, dt*aimSpd);

  // 换弹时后撤拉开
  if(w.reloadEnd){
    if(G.now >= w.reloadEnd){
      const need = w.def.mag - w.ammo, take = Math.min(need, w.reserve);
      w.ammo += take; w.reserve -= take; w.reloadEnd = 0;
    } else {
      const dx = bot.pos.x - t.pos.x, dz = bot.pos.z - t.pos.z;
      const l = Math.hypot(dx,dz)||1;
      const px = Math.cos(bot.yaw), pz = -Math.sin(bot.yaw);
      const spd = moveSpeed(bot)*.85;
      bot.vel.x = (dx/l*.8 + px*a.strafeDir*.5)*spd;
      bot.vel.z = (dz/l*.8 + pz*a.strafeDir*.5)*spd;
      return;
    }
  }

  // 移动：Valorant 风格“停住再打” + 安全横移
  const firing = a.burstLeft > 0 && G.now >= a.reactAt;
  bot.crouch = firing && d > 22 && D() > .75;
  a.strafeT -= dt;
  if(a.strafeT <= 0){
    a.strafeT = rand(.35, .7);
    // 优先尝试有空间的左右，都不行就原地站定
    const px = Math.cos(bot.yaw), pz = -Math.sin(bot.yaw);
    const eye = eyePos(bot);
    const leftD = rayWalls(eye, V3(-px,0,-pz), 1.2);
    const rightD = rayWalls(eye, V3(px,0,pz), 1.2);
    const order = Math.random() < .5 ? [-1, 1, 0] : [1, -1, 0];
    a.strafeDir = 0;
    for(const dir of order){
      if(dir === 0){ a.strafeDir = 0; break; }
      const sd = dir < 0 ? leftD : rightD;
      if(sd > .75){ a.strafeDir = dir; break; }
    }
  }
  const wantStand = w.def.cat==='sniper' || d > 35 || (firing && d > 8) || (firing && D() > .55);
  if(!wantStand && !bot.channel){
    const px = Math.cos(bot.yaw), pz = -Math.sin(bot.yaw);
    const spd = moveSpeed(bot)*.7;
    bot.vel.x = px*a.strafeDir*spd;
    bot.vel.z = pz*a.strafeDir*spd;
  } else { bot.vel.x *= .5; bot.vel.z *= .5; }

  if(w.def.cat!=='melee' && w.ammo<=0 && !w.reloadEnd){
    if(w.reserve>0){ w.reloadEnd = G.now + w.def.rl; }
    else if(bot.weapons.secondary && bot.slot!=='secondary'){ bot.slot='secondary'; }
  }

  if(G.now < a.reactAt || w.reloadEnd) return;
  if(G.now >= w.nextFire && w.ammo > 0){
    if(a.burstLeft <= 0){
      if(G.now < a.burstPause) return;
      const closeBonus = d < 12 ? 4 : 0;
      a.burstLeft = w.def.alt ? Math.round(rand(3, 5 + 4*D() + closeBonus)) : 1;
      a.aimHead = Math.random() < (.1 + .3*D()) && d < 24;
    }
    a.burstLeft--;
    if(a.burstLeft<=0) a.burstPause = G.now + rand(.12, .45 - .18*D());
    w.ammo--;
    w.nextFire = G.now + w.def.fi * rand(1,1.12);
    const meMoving = Math.hypot(bot.vel.x,bot.vel.z) > 1.5;
    const errDeg = (1.0 + d*.055) * errMul * (meMoving?1.6:1) * (bot.crouch ? .85 : 1) * (2.05 - D());
    const dir = dirFromYawPitch(bot.yaw, bot.pitch);
    fireShot(bot, dir, w.def, deg(errDeg)*.5);
  }
}

// ---------- 技能算法 ----------
function tryGate(a, key, cd=5){
  if(G.now < a.abGate) return false;
  a.abGate = G.now + cd;
  return true;
}
function nearestChokeTo(pos){
  let best = null, bd = Infinity;
  for(const k of Object.keys(G.map.chokes||{})){
    const c = G.map.chokes[k];
    const d = Math.hypot(pos.x-c[0], pos.z-c[1]);
    if(d < bd){ bd = d; best = V3(c[0],0,c[1]); }
  }
  return bd < 30 ? best : null;
}
const pushing = a => a.state==='advance' || a.state==='execute';

function botAbilities(bot){
  const a = bot.ai, m = G.match, side = sideOf(bot);
  const t = a.target;
  const sp = m.spike;
  const inCombat = !!t;
  const hurt = bot.hp < 50;
  const safeTime = G.now - bot.lastDamaged > 4;
  const enemyChanneling = G.ents.find(e=>e.alive && e.team!==bot.team && e.channel);
  const executing = a.state==='execute';

  switch(bot.agent){
    case 'fengying': {
      if(hurt && inCombat && bot.ab.e.n>0 && tryGate(a,'e',8)) useAbility(bot,'e');
      if(inCombat && bot.ult>=7 && !bot.weapons.primary && tryGate(a,'x',10)) useAbility(bot,'x');
      if(bot.channel==='plant' && bot.ab.c.n>0 && tryGate(a,'c',10)) botCast(bot,'c', bot.pos);
      break;
    }
    case 'lieyan': {
      if(side==='atk' && executing && a.goal && bot.ab.q.n>0 && !a.flags.entryFlash && tryGate(a,'q',4)){
        a.flags.entryFlash = true;
        botCast(bot,'q', a.goal);
      }
      if(!inCombat && G.now-a.lastSeenAt < 2 && a.state==='hunt' && bot.ab.q.n>0 && tryGate(a,'q',8))
        botCast(bot,'q', a.lastSeenPos);
      if(side==='def' && sp.state==='planted' && dist2d(bot.pos,sp.pos)<18 && bot.ab.q.n>0 && !a.flags.retakeFlash && tryGate(a,'q',6)){
        a.flags.retakeFlash = true;
        botCast(bot,'q', sp.pos);
      }
      if(side==='def' && inCombat && dist2d(bot.pos,t.pos)<18 && bot.ab.c.n>0 && !a.flags.fw && tryGate(a,'c',10)){
        a.flags.fw = true;
        bot.yaw = yawTo(bot.pos, t.pos);
        useAbility(bot,'c');
      }
      if(bot.hp<60 && !inCombat && safeTime && bot.ab.e.n>0 && tryGate(a,'e',6)) useAbility(bot,'e');
      if(bot.hp<35 && inCombat && bot.ult>=7 && tryGate(a,'x',10)) useAbility(bot,'x');
      break;
    }
    case 'tianqiong': {
      if(inCombat && G.now>bot.stimUntil && bot.ab.q.n>0 && tryGate(a,'q',12)) useAbility(bot,'q');
      if(side==='atk' && (executing || (pushing(a) && a.goal && dist2d(bot.pos,a.goal)<28)) && bot.ab.e.n>0 && !a.flags.execSmoke && tryGate(a,'e',4)){
        a.flags.execSmoke = true;
        const pts = (G.map.smokePoints[m.plan.site]||[]).slice(0, Math.max(1,bot.ab.e.n));
        for(const pt of pts) botCast(bot,'e', V3(pt[0],0,pt[1]));
      }
      if(side==='def' && !a.flags.defOpenSmoke && a.hold && G.now - m.liveStart > 2 && G.now - m.liveStart < 10 && bot.ab.e.n>0){
        a.flags.defOpenSmoke = true;
        const ch = nearestChokeTo(a.hold);
        if(ch) botCast(bot,'e', ch);
      }
      if(enemyChanneling && sp.state==='planted'){
        if(bot.ult>=8 && tryGate(a,'x',8)) botCast(bot,'x', sp.pos);
        else if(bot.ab.c.n>0 && tryGate(a,'c',8)) botCast(bot,'c', sp.pos);
      }
      if(enemyChanneling && sp.state==='carried' && bot.ab.c.n>0 && tryGate(a,'c',8))
        botCast(bot,'c', enemyChanneling.pos);
      break;
    }
    case 'anmu': {
      if(side==='atk' && (executing || (pushing(a) && a.goal && dist2d(bot.pos,a.goal)<28)) && bot.ab.c.n>0 && !a.flags.execSmoke && tryGate(a,'c',4)){
        a.flags.execSmoke = true;
        const pts = (G.map.smokePoints[m.plan.site]||[]).slice(0,1);
        for(const pt of pts) botCast(bot,'c', V3(pt[0],0,pt[1]));
      }
      if(side==='def' && !a.flags.defOpenSmoke && a.hold && G.now - m.liveStart > 2 && G.now - m.liveStart < 10 && bot.ab.c.n>0){
        a.flags.defOpenSmoke = true;
        const ch = nearestChokeTo(a.hold);
        if(ch) botCast(bot,'c', ch);
      }
      if(side==='atk' && executing && a.goal && dist2d(bot.pos,a.goal)<18 && bot.ab.q.n>0 && !a.flags.para && tryGate(a,'q',6)){
        a.flags.para = true;
        botCast(bot,'q', a.goal);
      }
      if(side==='def' && sp.state==='planted' && dist2d(bot.pos,sp.pos)<16 && bot.ab.q.n>0 && tryGate(a,'q',10))
        botCast(bot,'q', sp.pos);
      if(hurt && inCombat && bot.ab.e.n>0 && tryGate(a,'e',8)){
        bot.yaw += Math.PI;
        useAbility(bot,'e');
        bot.yaw -= Math.PI;
      }
      break;
    }
    case 'lieying': {
      if(side==='atk' && pushing(a) && !a.flags.recon && bot.ab.c.n>0 && tryGate(a,'c',5)){
        a.flags.recon = true;
        const site = G.map.sites[m.plan.site];
        botCast(bot,'c', V3(site.plant[0],0,site.plant[1]));
      }
      if(bot.ab.e.n>0 && G.now>bot.abCd.e && tryGate(a,'e',6)){
        const nearGoal = a.goal && dist2d(bot.pos,a.goal)<12;
        const retaking = side==='def' && sp.state==='planted' && dist2d(bot.pos,sp.pos)<20;
        if(nearGoal || retaking) useAbility(bot,'e');
      }
      if(enemyChanneling && bot.ab.q.n>0 && tryGate(a,'q',6)) botCast(bot,'q', enemyChanneling.pos);
      if(bot.ult>=8){
        const revealed = G.ents.find(e=>e.alive && e.team!==bot.team && G.now<(e.revealedUntil||0));
        if(revealed && tryGate(a,'x',6)) botCast(bot,'x', revealed.pos, revealed);
      }
      break;
    }
    case 'shengyu': {
      if(bot.ab.e.n>0 && G.now>bot.abCd.e && !inCombat && safeTime){
        let target = null;
        for(const e of G.ents) if(e.alive && e.team===bot.team && e.hp<60 && dist2d(e.pos,bot.pos)<12)
          if(!target || e.hp < target.hp) target = e;
        if(!target && bot.hp < 65) target = bot;
        if(target && tryGate(a,'e',5)) botCast(bot,'e', null, target);
      }
      if(bot.channel==='plant' && bot.ab.c.n>0 && tryGate(a,'c',10)) useAbility(bot,'c');
      if(side==='def' && inCombat && dist2d(bot.pos,t.pos)<24 && bot.ab.q.n>0 && tryGate(a,'q',10))
        botCast(bot,'q', t.pos);
      if(bot.ult>=8 && !inCombat && safeTime){
        const corpse = G.corpses.find(c=>c.ent.team===bot.team && !c.ent.alive && dist2d(c.pos,bot.pos)<8);
        if(corpse && tryGate(a,'x',5)) useAbility(bot,'x');
      }
      break;
    }
  }
}

// 购买阶段：在天幕内自由走动/张望
function buyWander(bot, dt){
  const a = bot.ai;
  if(!a.anchor) a.anchor = bot.pos.clone();
  if(G.now > a.wanderT){
    a.wanderT = G.now + rand(1.5, 3.5);
    if(Math.random() < .35){
      a.wander = null;
      a.wanderYaw = bot.yaw + rand(-1.6, 1.6);
    } else {
      a.wander = V3(a.anchor.x + rand(-5,5), 0, a.anchor.z + rand(-3.5,3.5));
    }
  }
  if(a.wander){
    const d = dist2d(bot.pos, a.wander);
    if(d < .6){
      a.wander = null;
      bot.vel.x *= .7; bot.vel.z *= .7;
    } else {
      const ty = yawTo(bot.pos, a.wander);
      bot.yaw += angDiff(bot.yaw, ty) * Math.min(1, dt*6);
      const spd = moveSpeed(bot) * .42;
      const dx = a.wander.x - bot.pos.x, dzz = a.wander.z - bot.pos.z;
      const l = Math.hypot(dx,dzz)||1;
      bot.vel.x = dx/l*spd; bot.vel.z = dzz/l*spd;
    }
  } else {
    bot.vel.x *= .8; bot.vel.z *= .8;
    bot.yaw += angDiff(bot.yaw, a.wanderYaw) * Math.min(1, dt*3);
    bot.pitch *= (1 - dt*2);
  }
}

// ---------- 主循环 ----------
export function updateBots(dt){
  const m = G.match;
  if(!m || m.phase==='select' || m.phase==='over') return;
  for(const bot of G.ents){
    if(bot.isPlayer || !bot.alive){ if(!bot.isPlayer) updateBodyPose(bot); continue; }
    const a = bot.ai;
    if(m.phase==='buy'){
      buyWander(bot, dt);
      moveEntity(bot, dt);
      updateBodyPose(bot);
      continue;
    }

    // 技能区躲避：优先级最高
    const dz = G.zones.find(z=> z.dps>0 &&
      !(z.owner && z.owner.team===bot.team && z.owner!==bot) &&
      dist2d(bot.pos, z.pos) < z.r + .6);
    if(dz){
      if(bot.channel) G.hooks.stopChannel?.(bot);
      const dx = bot.pos.x - dz.pos.x, dzz = bot.pos.z - dz.pos.z;
      const l = Math.hypot(dx,dzz)||1;
      const spd = moveSpeed(bot);
      bot.vel.x = dx/l*spd; bot.vel.z = dzz/l*spd;
      moveEntity(bot, dt);
      updateBodyPose(bot);
      continue;
    }

    a.nextThink -= dt;
    if(a.nextThink <= 0){
      a.nextThink = THINK_DT;
      think(bot);
    }

    if(a.target && a.target.alive) combatUpdate(bot, dt);
    else { bot.crouch = false; navUpdate(bot, dt); }

    moveEntity(bot, dt);
    stuckCheck(bot, dt);
    updateBodyPose(bot);
  }
}

function think(bot){
  const a = bot.ai;
  const m = G.match;

  const t = findTarget(bot);
  if(t && t !== a.target){
    a.target = t;
    a.acqT = 0;
    const reactMul = 1.85 - D();
    a.reactAt = G.now + rand(.14, .38) * reactMul;
  } else if(a.target){
    if(!a.target.alive){ a.target = null; a.acqT = 0; }
    else {
      const eye = eyePos(bot), te = eyePos(a.target);
      if(losBlocked(eye, te) || dist2d(bot.pos,a.target.pos) > 60){
        a.lastSeenAt = G.now; a.lastSeenPos.copy(a.target.pos);
        a.target = null; a.acqT = 0;
        a.state = 'hunt';
      }
    }
  }
  if(!a.target){
    for(const e of G.ents){
      if(!e.alive || e.team===bot.team || G.now >= (e.revealedUntil||0)) continue;
      if(dist2d(bot.pos,e.pos) < 40){ a.lastSeenPos.copy(e.pos); a.lastSeenAt = G.now; break; }
    }
  }

  botAbilities(bot);
  if(a.target) return;

  const side = sideOf(bot);
  if(side==='atk') thinkAttack(bot);
  else thinkDefend(bot);
}

// ---------- 进攻：集合-齐推战术 ----------
function thinkAttack(bot){
  const a = bot.ai, m = G.match, sp = m.spike;
  const site = m.plan.site;
  const sd = G.map.sites[site];
  const plantPos = V3(sd.plant[0], 0, sd.plant[1]);
  const stagePt = G.map.stages?.[site];
  const stagePos = stagePt ? V3(stagePt[0],0,stagePt[1]) : plantPos;

  if(sp.state==='dropped'){
    if(!sp.claimer || !sp.claimer.alive) sp.claimer = bot;
    if(sp.claimer === bot){ a.state='fetch'; a.goal = sp.pos; if(needRepath(bot, sp.pos)) setPath(bot, sp.pos); return; }
  }
  if(sp.state==='planted'){
    if(!a.hold){
      const h = pick(G.map.atkHolds[sp.site]);
      a.hold = V3(h.p[0],0,h.p[1]); a.holdLook = V3(h.look[0],1.5,h.look[1]);
    }
    a.state='hold'; a.goal = a.hold;
    if(needRepath(bot, a.hold)) setPath(bot, a.hold);
    return;
  }

  if(G.now < a.planStartAt){
    // 开局前 1 秒内先向集结点慢走，避免站在原地
    const preGoal = a.goal || stagePos;
    if(preGoal) moveDirect(bot, preGoal, dt, false);
    return;
  }

  // 转点重置
  if(m.planSwitchedAt && a.planSite !== site && a.state!=='hunt'){
    a.state = 'wait'; a.hold = null;
  }
  a.planSite = site;

  const isLurker = a.role===3 && sp.carrier!==bot && G.map.siteKeys.length>1 && D()>.6;

  switch(a.state){
    case 'wait': {
      a.state = 'advance';
      let dest = stagePos;
      if(isLurker){
        const other = G.map.siteKeys.find(k=>k!==site);
        const os = G.map.stages?.[other];
        if(os) dest = V3(os[0],0,os[1]);
        a.flags.lurk = true;
      }
      a.goal = dest.clone();
      setPath(bot, a.goal);
      break;
    }
    case 'advance': {
      if(dist2d(bot.pos, a.goal) < 4){
        a.state = 'stage'; a.stageAt = G.now;
      } else if(needRepath(bot, a.goal)) setPath(bot, a.goal);
      break;
    }
    case 'stage': {
      // 集合判定：主攻组到齐或超时 → 触发齐推
      if(!a.flags.lurk){
        const mates = G.ents.filter(e=>e.alive && sideOf(e)==='atk' && !e.isPlayer && !e.ai?.flags.lurk);
        const near = mates.filter(e=>dist2d(e.pos, stagePos) < 11).length;
        const need = Math.min(2, mates.length);
        if(!m.executeT && (near >= need || G.now - a.stageAt > 5)){
          m.executeT = G.now; m.execSite = site;
        }
      }
      if(m.executeT && (m.execSite===site || a.flags.lurk)){
        a.state = 'execute';
        const off = V3(rand(-3.5,3.5), 0, rand(-3.5,3.5));
        a.goal = (sp.carrier===bot ? plantPos.clone() : plantPos.clone().add(off));
        setPath(bot, a.goal);
      }
      break;
    }
    case 'execute': {
      if(sp.carrier===bot && inSite(bot.pos) && dist2d(bot.pos, plantPos) < 4){
        a.state = 'plant';
      } else if(dist2d(bot.pos, a.goal) < 3){
        const h = pick(G.map.atkHolds[site]);
        a.hold = V3(h.p[0],0,h.p[1]); a.holdLook = V3(h.look[0],1.5,h.look[1]);
        a.goal = a.hold; a.state='hold';
        setPath(bot, a.hold);
      } else if(needRepath(bot, a.goal)) setPath(bot, a.goal);
      break;
    }
    case 'plant': {
      if(!(sp.state==='carried' && sp.carrier===bot)){ a.state='wait'; break; }
      a.goal = plantPos;
      if(dist2d(bot.pos, plantPos) > 3.5 && needRepath(bot, plantPos)) setPath(bot, plantPos);
      break;
    }
    case 'hunt': {
      a.goal = a.lastSeenPos.clone();
      if(needRepath(bot, a.goal)) setPath(bot, a.goal);
      if(dist2d(bot.pos, a.goal) < 3 || G.now - a.lastSeenAt > 6) a.state='wait';
      break;
    }
    case 'hold': break;
    default: a.state = 'wait';
  }

  // 携包者若已齐推且到点直接下包
  if(sp.state==='carried' && sp.carrier===bot && m.executeT && a.state!=='plant' && inSite(bot.pos)){
    a.state = 'plant';
  }
}

function thinkDefend(bot){
  const a = bot.ai, m = G.match, sp = m.spike;

  if(sp.state==='planted'){
    const defenders = G.ents.filter(e=>e.alive && sideOf(e)==='def' && !e.isPlayer);
    const d3 = Math.hypot(bot.pos.x-sp.pos.x, bot.pos.y-sp.pos.y, bot.pos.z-sp.pos.z);
    // 只有在安全（无可见敌、近期未受伤）时才拆包
    const safe = !a.target && G.now - bot.lastDamaged > 1.5;
    if(defenders[0]===bot && d3 < 2.2 && safe){
      a.state='defuse'; bot.vel.x=0; bot.vel.z=0;
      return;
    }
    a.state='retake'; a.goal = sp.pos;
    if(needRepath(bot, sp.pos)) setPath(bot, sp.pos);
    return;
  }

  if(a.state==='hunt'){
    a.goal = a.lastSeenPos.clone();
    if(needRepath(bot, a.goal)) setPath(bot, a.goal);
    if(dist2d(bot.pos, a.goal) < 3 || G.now - a.lastSeenAt > 5){ a.state='post'; a.hold=null; }
    return;
  }

  if(m.rotateCall && G.now < m.rotateCall.until && !a.rotated && Math.random() < .3 + .3*D()){
    a.rotated = true;
    a.hold = m.rotateCall.pos.clone();
    a.holdLook = null;
    a.state='post';
    setPath(bot, a.hold);
  }

  if(!a.hold){
    const posts = G.map.defPostList;
    const p = posts[bot.ai.role % posts.length];
    a.hold = V3(p.p[0],0,p.p[1]);
    a.holdLook = V3(p.look[0],1.5,p.look[1]);
    a.state='post';
    setPath(bot, a.hold);
  }
  a.goal = a.hold;
}

function needRepath(bot, dest){
  const a = bot.ai;
  if(G.now > a.repathT) return true;
  if(a.pathI >= a.path.length) return dist2d(bot.pos, dest) > 2.5;
  const last = a.path[a.path.length-1];
  return dist2d(last, dest) > 3;
}

// 无路点时的兜底直走：贴墙会自己绕
function moveDirect(bot, goal, dt, sprint=true){
  const a=bot.ai;
  const ty=yawTo(bot.pos, goal);
  bot.yaw += angDiff(bot.yaw, ty)*Math.min(1, dt*6);
  const spd=moveSpeed(bot)*(sprint?1:.55);
  const dx=goal.x-bot.pos.x, dz=goal.z-bot.pos.z;
  const l=Math.hypot(dx,dz)||1;
  let mx=dx/l, mz=dz/l;
  const feet=V3(bot.pos.x, bot.pos.y+.7, bot.pos.z);
  const fwd=V3(mx,0,mz);
  const aheadD=rayWalls(feet, fwd, 1.5);
  if(aheadD < 1.2){
    const leftX=-mz, leftZ=mx, rightX=mz, rightZ=-mx;
    const ld=rayWalls(feet, V3(leftX,0,leftZ), 1.4);
    const rd=rayWalls(feet, V3(rightX,0,rightZ), 1.4);
    if(ld>.8 || rd>.8){
      const sx=ld>rd?leftX:rightX, sz=ld>rd?leftZ:rightZ;
      mx=mx*.35+sx*.85; mz=mz*.35+sz*.85; const n=Math.hypot(mx,mz); mx/=n; mz/=n;
    } else {
      mx*=.25; mz*=.25;
    }
  }
  bot.vel.x=mx*spd; bot.vel.z=mz*spd;
  bot.stepAcc += spd*dt;
  if(bot.stepAcc > 2.8){ bot.stepAcc=0; if(G.player?.alive) sfx.step(dist2d(bot.pos,G.player.pos)); G.hooks.noise?.(bot.pos, bot); }
}

function navUpdate(bot, dt){
  const a = bot.ai, m = G.match, sp = m.spike;

  if(a.state==='plant' && sp.state==='carried' && sp.carrier===bot && inSite(bot.pos) && dist2d(bot.pos, a.goal||bot.pos) < 4){
    bot.vel.x = 0; bot.vel.z = 0;
    G.hooks.plantTick?.(bot, dt);
    return;
  }
  if(a.state==='plant'){
    const arrived0 = a.path.length ? followPath(bot, dt, true) : false;
    if(!arrived0 && a.goal) moveDirect(bot, a.goal, dt, true);
    if(arrived0 && sp.state==='carried' && sp.carrier===bot && inSite(bot.pos)){
      bot.vel.x = 0; bot.vel.z = 0;
      G.hooks.plantTick?.(bot, dt);
    }
    return;
  }
  if(a.state==='defuse' && sp.state==='planted' && dist2d(bot.pos, sp.pos) < 2.2){
    bot.vel.x = 0; bot.vel.z = 0;
    G.hooks.defuseTick?.(bot, dt);
    return;
  }

  let arrived = false;
  if(a.path.length){
    arrived = followPath(bot, dt, a.state!=='post');
  } else if(a.goal){
    moveDirect(bot, a.goal, dt, a.state!=='post');
  } else {
    arrived = true;
  }
  if(arrived && (a.hold || a.state==='stage')){
    // 驻守朝向：优先最近接敌情报，其次预设视角
    const c = m.contact[bot.team];
    let look = a.holdLook;
    if(c && G.now - c.t < 4 && dist2d(c.pos, bot.pos) < 32) look = c.pos;
    if(look){
      const ty = yawTo(bot.pos, look);
      bot.yaw += angDiff(bot.yaw, ty)*Math.min(1,dt*5);
      bot.pitch *= (1-dt*3);
    }
    bot.vel.x *= .6; bot.vel.z *= .6;
  }
  if(arrived && a.state==='fetch' && sp.state==='dropped' && dist2d(bot.pos, sp.pos)<1.4){
    G.hooks.pickSpike?.(bot);
  }
}
