import { G } from './state.js?v=21';
import { V3, dist2d, yawTo, pitchTo, angDiff, clamp, rand, pick, gauss, deg, dirFromYawPitch } from './utils.js?v=21';
import { curWeapon, moveSpeed, moveEntity, fireShot, meleeAttack, eyePos, losBlocked, updateBodyPose, rayWalls } from './combat.js?v=21';
import { findPath, inSite, nearestWp, pathClear, snapToNav } from './map.js?v=21';
import { useAbility, botCast } from './abilities.js?v=21';
import { removeDrop } from './effects.js?v=21';
import { sfx } from './audio.js?v=21';

const THINK_DT = .12;

export function initBotAI(ent, i){
  ent.ai = {
    nextThink: rand(0, THINK_DT),
    path: [], pathI: 0, goal: null,
    hold: null, holdLook: null,
    target: null, reactAt: 0, acqT: 0, lastSeenAt: -9, lastSeenPos: V3(),
    burstLeft: 0, burstPause: 0,
    strafeDir: 1, strafeT: 0,
    repathT: 0, stuckT: 0, lastPos: V3(), sideUntil: 0, sideDir: 1, backUntil: 0, detourT: 0, giveUp: 0,
    role: i, planStartAt: 0, stageAt: 0, assaultRole: null,
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
  a.fellBack = false; a.fallbackUntil = 0;
  a.repositioned = false; a.introtGate = 0;
  a.lootDrop = null;
  a.planStartAt = G.now + rand(.1, .9);
  a.anchor = ent.pos.clone();
  a.wander = null; a.wanderT = 0; a.wanderYaw = ent.yaw;
}

const sideOf = ent => ent.team === 'ally' ? G.match.allySide : (G.match.allySide==='atk'?'def':'atk');
const D = ()=> G.match.diff; // 0.55 - 1.25

// ---------- 武器维护（像人一样管理弹药） ----------
function totalRangedAmmo(bot){
  let t = 0;
  for(const k of ['primary','secondary']){
    const w = bot.weapons[k];
    if(w) t += w.ammo + w.reserve;
  }
  return t;
}
function weaponUpkeep(bot){
  // 换弹完成结算（无论是否在战斗中）
  for(const k of ['primary','secondary']){
    const w = bot.weapons[k];
    if(w && w.reloadEnd && G.now >= w.reloadEnd){
      const need = w.def.mag - w.ammo, take = Math.min(need, w.reserve);
      w.ammo += take; w.reserve -= take; w.reloadEnd = 0;
    }
  }
  const a = bot.ai;
  if(a.target) return;
  // 空闲时机装填：脱战 1.6s 且弹匣不满
  const w = curWeapon(bot);
  if(w.def.cat!=='melee' && !w.reloadEnd && w.reserve>0 && w.ammo < w.def.mag*.55 && G.now - bot.lastShotAt > 1.6){
    w.reloadEnd = G.now + w.def.rl;
  }
  // 有弹药的更强武器优先：切回主武器 / 副武器
  const pri = bot.weapons.primary, sec = bot.weapons.secondary;
  if(bot.slot!=='primary' && pri && (pri.ammo>0 || pri.reserve>0)) bot.slot = 'primary';
  else if(bot.slot==='knife' && sec && (sec.ammo>0 || sec.reserve>0)) bot.slot = 'secondary';
}

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
    // 优先打伤害来源 + 残血敌人
    let score = d * (.55 + e.hp/220);
    if(bot.lastDamaged > G.now - 2 && e.lastShotAt > G.now - 1.5) score *= .5;
    if(score < bd){ bd = score; best = e; }
  }
  return best;
}

function setPath(bot, dest){
  const a = bot.ai;
  const raw = findPath(bot.pos, dest, 0.15);  // 轻微随机让路线多样但不乱
  a.path = raw.length ? raw : [];
  if(raw.length){
    const dc = dest.clone ? dest.clone() : V3(dest.x,0,dest.z);
    dc.y = raw[raw.length-1].y;   // 终点与路径末端同层（路点 y 语义），保证 lookahead/推进判定正确
    a.path.push(dc);
  }
  a.pathI = 0;
  a.repathT = G.now + 3.5;
  a.wdBest = Infinity;       // 进度看门狗：最近的最好目标距离
  a.wdAt = G.now;
}

function lookaheadTarget(bot, path, pathI){
  const maxSteps = 8, maxD = 7;
  const from = V3(bot.pos.x, bot.pos.y + 1.1, bot.pos.z);  // 转为路点 y 语义
  let best = pathI;
  for(let i = pathI + 1; i < path.length && i <= pathI + maxSteps; i++){
    const wp = path[i];
    if(dist2d(bot.pos, wp) > maxD) break;
    if(pathClear(from, wp, .45)) best = i;
  }
  return path[best];
}

function followPath(bot, dt, sprint=true){
  const a = bot.ai;
  if(a.pathI >= a.path.length){ bot.vel.x *= .8; bot.vel.z *= .8; return true; }
  // 如果紧贴第一个路径点则直接推进
  if(a.pathI===0 && a.path.length>0 && dist2d(bot.pos, a.path[0]) < .55) a.pathI++;
  // 到达最终节点附近：减速并标记到达
  if(a.pathI >= a.path.length - 1 && a.goal && dist2d(bot.pos, a.goal) < 1.1){
    bot.vel.x *= .35; bot.vel.z *= .35; return true;
  }
  // 推进已越过的中间节点
  const fromWp = V3(bot.pos.x, bot.pos.y + 1.1, bot.pos.z);
  while(a.pathI < a.path.length - 1){
    const cur = a.path[a.pathI], nxt = a.path[a.pathI+1];
    const dx = nxt.x - cur.x, dz = nxt.z - cur.z;
    const len2 = dx*dx + dz*dz;
    if(len2 < 1e-4){ a.pathI++; continue; }
    const t = ((bot.pos.x - cur.x)*dx + (bot.pos.z - cur.z)*dz) / len2;
    if(t > 0.65 && pathClear(fromWp, nxt, .45)){ a.pathI++; }
    else break;
  }
  if(a.pathI >= a.path.length){ bot.vel.x *= .8; bot.vel.z *= .8; return true; }

  const wp = lookaheadTarget(bot, a.path, a.pathI);
  const ty = yawTo(bot.pos, wp);
  if(!a.target){
    // 进点预瞄：执行进攻接近包点时，枪口预先对准架点视线方向（像人一样预瞄角落）
    let aimY;
    if(a.state==='execute' && a.holdLook && a.goal && dist2d(bot.pos, a.goal) < 13){
      aimY = yawTo(bot.pos, a.holdLook);
    } else {
      // 行进扫视：推进/搜索时视线在前进方向附近来回检查角落（更像人）
      const scanning = a.state==='advance' || a.state==='hunt' || a.state==='fetch' || a.state==='retake' || a.state==='execute';
      const sway = scanning ? Math.sin(G.now*1.15 + bot.id*1.7)*.2 : 0;
      aimY = ty + sway;
    }
    bot.yaw += angDiff(bot.yaw, aimY) * Math.min(1, dt*8);
    bot.pitch *= (1 - dt*4);
  }
  bot.walking = a.state==='execute' && a.goal && dist2d(bot.pos, a.goal) < 15 && (G.match.strategy?.pace) !== 'rush';
  let spd = moveSpeed(bot) * (sprint?1:.55);
  // 离最终目标很近时减速
  if(a.pathI >= a.path.length-1 && a.goal){
    spd *= Math.min(1, dist2d(bot.pos, a.goal)*.35);
  }
  const dx = wp.x - bot.pos.x, dz = wp.z - bot.pos.z;
  const l = Math.hypot(dx,dz)||1;
  let mx = dx/l, mz = dz/l;

  // 后撤脱困：先反向移动一小段再侧移
  if(a.backUntil && G.now < a.backUntil){
    bot.vel.x = -mx * spd*.7; bot.vel.z = -mz * spd*.7; return false;
  }
  // 侧向脱困
  if(a.sideUntil && G.now < a.sideUntil){
    const rightX = Math.cos(bot.yaw), rightZ = -Math.sin(bot.yaw);
    const sideX = rightX * a.sideDir, sideZ = rightZ * a.sideDir;
    const sideD = rayWalls(V3(bot.pos.x, bot.pos.y+.7, bot.pos.z), V3(sideX,0,sideZ), 1.0);
    if(sideD < .6){ a.sideDir *= -1; }
    bot.vel.x = rightX * a.sideDir * spd;
    bot.vel.z = rightZ * a.sideDir * spd;
    return false;
  }

  // 前方障碍探测与绕障 / 跳跃
  const feet = V3(bot.pos.x, bot.pos.y+.7, bot.pos.z);
  const fwd = V3(mx,0,mz);
  const aheadD = rayWalls(feet, fwd, 1.5);
  if(aheadD < 1.2){
    const high = rayWalls(V3(bot.pos.x, bot.pos.y+1.35, bot.pos.z), fwd, 1.7);
    if(high > 1.5 && bot.grounded && aheadD < 1.0){
      bot.vel.y = 5.6; bot.grounded = false;
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
        mx *= .15; mz *= .15;  // 两侧全堵：极慢爬行，等待卡死检测接管
      }
    }
  }

  // 减速到目标周围时进一步减速（防止在 hold 位抖动）
  if(a.pathI >= a.path.length-1 && a.goal && dist2d(bot.pos, a.goal) < 1.8){
    spd *= Math.min(1, dist2d(bot.pos, a.goal)*.5);
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

  let progress = 0;
  if(a.goal){
    const gd = dist2d(bot.pos, a.goal);
    progress = (a.lastGoalDist||gd) - gd;
    a.lastGoalDist = gd;
  }

  if(intent && moved < .12 && progress < .02){
    a.stuckT += dt;
    // 分级脱困
    if(a.stuckT > .4 && (!a.sideUntil || G.now > a.sideUntil + .4)){
      const rightX = Math.cos(bot.yaw), rightZ = -Math.sin(bot.yaw);
      const leftD = rayWalls(V3(bot.pos.x, bot.pos.y+.7, bot.pos.z), V3(-rightX,0,-rightZ), 1.2);
      const rightD = rayWalls(V3(bot.pos.x, bot.pos.y+.7, bot.pos.z), V3(rightX,0,rightZ), 1.2);
      a.sideDir = leftD > rightD ? -1 : 1;
      a.sideUntil = G.now + .6;
    }
    if(a.stuckT > 1.0 && !a.backUntil && !a.sideUntil){
      a.backUntil = G.now + .45; // 先反向退
    }
    if(a.stuckT > 1.8 && a.goal){
      a.detourT = G.now;
      setPath(bot, a.goal);       // 重寻路（jitter 加持）
      a.stuckT = 1.0;
    }
    if(a.stuckT > 3.5 && !a.target){
      const w = G.map.wps[nearestWp(bot.pos)];
      bot.pos.x = w.x; bot.pos.z = w.z; bot.pos.y = Math.max(0, w.y - 1.1); bot.vel.set(0,0,0);
      a.stuckT = 0; a.sideUntil = 0; a.backUntil = 0; a.lastGoalDist = undefined;
      if(a.goal) setPath(bot, a.goal);
    }
    // 放弃无望目标
    if(a.stuckT > 6.5 && !a.target){
      a.giveUp = (a.giveUp||0) + 1;
      if(a.giveUp > 2){ a.goal = null; a.state = 'wait'; a.giveUp = 0; }
      a.stuckT = 0;
    }
  } else if(progress > .04 || (!a.goal && moved > .05)){
    a.stuckT = Math.max(0, a.stuckT - dt*2.8);
    if(a.stuckT <= 0){ a.stuckT = 0; a.sideUntil = 0; a.backUntil = 0; a.giveUp = 0; }
  }
}

// ---------- 交火 ----------
function combatUpdate(bot, dt){
  const a = bot.ai;
  a.wdAt = G.now;              // 战斗不算卡死
  bot.walking = false;
  const t = a.target;
  const w = curWeapon(bot);
  const d = dist2d(bot.pos, t.pos);
  const blinded = G.now < (bot.flashUntil||0);

  // 拼刀：没有任何子弹时持刀直冲目标
  if(w.def.cat==='melee' && bot.knifeUlt<=0){
    const ty0 = yawTo(bot.pos, t.pos);
    bot.yaw += angDiff(bot.yaw, ty0) * Math.min(1, dt*10);
    bot.pitch += (pitchTo(eyePos(bot), eyePos(t)) - bot.pitch) * Math.min(1, dt*10);
    const spd = moveSpeed(bot);
    const dx0 = t.pos.x - bot.pos.x, dz0 = t.pos.z - bot.pos.z, l0 = Math.hypot(dx0,dz0)||1;
    // 蛇皮走位逼近
    a.strafeT -= dt;
    if(a.strafeT<=0){ a.strafeT = rand(.25,.5); a.strafeDir = Math.random()<.5?-1:1; }
    const px0 = Math.cos(bot.yaw), pz0 = -Math.sin(bot.yaw);
    bot.vel.x = (dx0/l0 + px0*a.strafeDir*.4)*spd;
    bot.vel.z = (dz0/l0 + pz0*a.strafeDir*.4)*spd;
    if(d < 2.1 && G.now >= w.nextFire){
      w.nextFire = G.now + .75;
      meleeAttack(bot, Math.random()<.3);
    }
    return;
  }

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
  const dazed = G.now < (bot.dazeUntil||0);
  const errMul = (2.3 - 1.3*acqNorm) * (dazed ? 2.3 : 1);

  // 瞄准点 + 移动预判
  const aimP = eyePos(t);
  if(!a.aimHead) aimP.y -= t.crouch ? .35 : .48;
  const leadK = d * .022 * (.3 + .7*D());
  aimP.x += clamp(t.vel.x * leadK, -1.4, 1.4);
  aimP.z += clamp(t.vel.z * leadK, -1.4, 1.4);

  const ty = yawTo(bot.pos, aimP);
  const eye = eyePos(bot);
  const tp = pitchTo(eye, aimP);
  const aimSpd = (7 + D()*8) * (dazed ? .45 : 1);
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
    const px = Math.cos(bot.yaw), pz = -Math.sin(bot.yaw);
    const feetCheck = V3(bot.pos.x, bot.pos.y+.6, bot.pos.z);
    const leftD = rayWalls(feetCheck, V3(-px,0,-pz), 1.2);
    const rightD = rayWalls(feetCheck, V3(px,0,pz), 1.2);
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
    const sec = bot.weapons.secondary;
    // 敌人近：快速切副武器保命，而不是站着换弹
    if(d < 22 && bot.slot==='primary' && sec && sec.ammo>0){ bot.slot='secondary'; }
    else if(w.reserve>0){ w.reloadEnd = G.now + w.def.rl; }
    else if(bot.slot!=='secondary' && sec && (sec.ammo>0 || sec.reserve>0)){ bot.slot='secondary'; }
    else { bot.slot='knife'; }   // 全空：拔刀拼命
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
    if(bot.knifeUlt > 0) bot.knifeUlt--;
    w.nextFire = G.now + w.def.fi * rand(1,1.12) * (G.now < bot.stimUntil ? .85 : 1);
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
  // 公平感知：只有「看得见」或「离得近听得到」且已持续一会儿的下包/拆包才会被技能针对
  let enemyChanneling = null;
  {
    const chRaw = G.ents.find(e=>e.alive && e.team!==bot.team && e.channel);
    if(chRaw){
      const prog = chRaw.channel==='plant' ? sp.prog : sp.defProg;
      if(prog > .8){
        const seen = !losBlocked(eyePos(bot), eyePos(chRaw));
        const close = dist2d(bot.pos, chRaw.pos) < 20;
        if(seen || close) enemyChanneling = chRaw;
      }
    }
  }
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
      if(bot.hp<60 && !inCombat && safeTime && bot.ab.e.n>0 && tryGate(a,'e',6)){
        botCast(bot,'e', V3(bot.pos.x, 0, bot.pos.z));   // 火热双手丢脚下回血
      }
      if(bot.hp<35 && inCombat && bot.ult>=7 && tryGate(a,'x',10)) useAbility(bot,'x');
      break;
    }
    case 'tianqiong': {
      if(bot.ab.q.n>0 && tryGate(a,'q',14)){
        const pushingNow = side==='atk' && executing;
        const holdingSpike = side==='def' && sp.state==='planted' && dist2d(bot.pos,sp.pos)<14;
        if(pushingNow || holdingSpike || (inCombat && G.now>bot.stimUntil)) useAbility(bot,'q');
      }
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
      if(side==='atk' && (executing || (pushing(a) && a.goal && dist2d(bot.pos,a.goal)<28)) && bot.ab.e.n>0 && G.now>bot.abCd.e && !a.flags.execSmoke && tryGate(a,'e',4)){
        a.flags.execSmoke = true;
        const pts = (G.map.smokePoints[m.plan.site]||[]).slice(0,1);
        for(const pt of pts) botCast(bot,'e', V3(pt[0],0,pt[1]));
      }
      if(side==='def' && !a.flags.defOpenSmoke && a.hold && G.now - m.liveStart > 2 && G.now - m.liveStart < 10 && bot.ab.e.n>0 && G.now>bot.abCd.e){
        a.flags.defOpenSmoke = true;
        const ch = nearestChokeTo(a.hold);
        if(ch) botCast(bot,'e', ch);
      }
      if(hurt && inCombat && bot.ab.c.n>0 && tryGate(a,'c',8)){
        bot.yaw += Math.PI;
        useAbility(bot,'c');
        bot.yaw -= Math.PI;
      }
      if(side==='atk' && executing && a.goal && dist2d(bot.pos,a.goal)<18 && bot.ab.q.n>0 && !a.flags.para && tryGate(a,'q',6)){
        a.flags.para = true;
        botCast(bot,'q', a.goal);
      }
      if(side==='def' && sp.state==='planted' && dist2d(bot.pos,sp.pos)<16 && bot.ab.q.n>0 && tryGate(a,'q',10))
        botCast(bot,'q', sp.pos);
      break;
    }
    case 'lieying': {
      if(bot.ab.e.n>0 && G.now>bot.abCd.e && !a.flags.recon && pushing(a) && tryGate(a,'e',5)){
        a.flags.recon = true;
        const site = G.map.sites[m.plan.site];
        botCast(bot,'e', V3(site.plant[0],0,site.plant[1]));
      }
      if(bot.ab.c.n>0 && tryGate(a,'c',8)){
        const nearGoal = a.state==='execute' && a.goal && dist2d(bot.pos,a.goal)<20;
        const retaking = side==='def' && sp.state==='planted' && dist2d(bot.pos,sp.pos)<24;
        if(nearGoal || retaking){
          const dest = nearGoal ? a.goal : sp.pos;
          bot.yaw = yawTo(bot.pos, dest);
          useAbility(bot,'c');   // 放出侦察机
        }
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
    case 'leiyi': {
      if(side==='atk' && executing && a.goal && bot.ab.e.n>0 && !a.flags.execNade && tryGate(a,'e',4)){
        a.flags.execNade = true;
        botCast(bot,'e', a.goal);
      }
      if(!inCombat && G.now-a.lastSeenAt < 2 && a.state==='hunt' && bot.ab.c.n>0 && tryGate(a,'c',7)){
        bot.yaw = yawTo(bot.pos, a.lastSeenPos);
        useAbility(bot,'c');   // 放出轰轰机器人追击
      }
      if(enemyChanneling && bot.ab.e.n>0 && tryGate(a,'e',6)) botCast(bot,'e', enemyChanneling.pos);
      if(bot.ult>=8 && inCombat && dist2d(bot.pos,t.pos)>8 && dist2d(bot.pos,t.pos)<30 && tryGate(a,'x',10))
        botCast(bot,'x', eyePos(t), t);
      break;
    }
    case 'zhuying': {
      // 到达驻点后布防：哨戒炮塔 + 纳米蜂群 + 警报机器人
      const settled = a.hold && dist2d(bot.pos, a.hold) < 3 && !inCombat;
      if(settled && bot.ab.e.n>0 && !a.flags.turret && tryGate(a,'e',3)){
        a.flags.turret = true;
        useAbility(bot,'e');
      }
      if(settled && bot.ab.c.n>0 && !a.flags.nano && tryGate(a,'c',3)){
        a.flags.nano = true;
        const ch = nearestChokeTo(bot.pos);
        botCast(bot,'c', ch || V3(bot.pos.x+rand(-3,3),0,bot.pos.z+rand(-3,3)));
      }
      if(settled && bot.ab.q.n>0 && !a.flags.alarm && tryGate(a,'q',3)){
        a.flags.alarm = true;
        const ch = nearestChokeTo(bot.pos);
        botCast(bot,'q', ch ? V3(ch.x+rand(-2,2),0,ch.z+rand(-2,2)) : V3(bot.pos.x+rand(-4,4),0,bot.pos.z+rand(-4,4)));
      }
      if(bot.ult>=8 && sp.state==='planted' && dist2d(bot.pos,sp.pos)<22 && tryGate(a,'x',10))
        useAbility(bot,'x');
      break;
    }
    case 'lanqie': {
      if(side==='atk' && executing && a.goal && bot.ab.q.n>0 && !a.flags.entryFlash && tryGate(a,'q',4)){
        a.flags.entryFlash = true;
        botCast(bot,'q', a.goal);
      }
      if(inCombat && dist2d(bot.pos,t.pos)<17 && bot.ab.e.n>0 && G.now>bot.abCd.e && tryGate(a,'e',8)){
        bot.yaw = yawTo(bot.pos, t.pos);
        useAbility(bot,'e');
      }
      if(enemyChanneling && bot.ab.c.n>0 && tryGate(a,'c',6)) botCast(bot,'c', enemyChanneling.pos);
      if(!inCombat && G.now-a.lastSeenAt < 2 && a.state==='hunt' && bot.ab.c.n>0 && tryGate(a,'c',8))
        botCast(bot,'c', a.lastSeenPos);
      if(bot.ult>=8 && ((side==='atk'&&executing) || (side==='def'&&sp.state==='planted'&&dist2d(bot.pos,sp.pos)<24)) && tryGate(a,'x',8)){
        const dest = side==='atk' ? a.goal : sp.pos;
        if(dest){ bot.yaw = yawTo(bot.pos, dest); useAbility(bot,'x'); }
      }
      break;
    }
    case 'qingzhen': {
      if(side==='atk' && (executing || (pushing(a) && a.goal && dist2d(bot.pos,a.goal)<30)) && bot.ab.e.n>0 && G.now>bot.abCd.e && !a.flags.wall && tryGate(a,'e',4)){
        a.flags.wall = true;
        botCast(bot,'e', a.goal || V3(bot.pos.x,0,bot.pos.z-10));
      }
      if(side==='def' && !a.flags.defOpenSmoke && a.hold && G.now - m.liveStart > 2 && G.now - m.liveStart < 10 && bot.ab.q.n>0){
        a.flags.defOpenSmoke = true;
        const ch = nearestChokeTo(a.hold);
        if(ch) botCast(bot,'q', ch);
      }
      if(enemyChanneling && bot.ab.c.n>0 && tryGate(a,'c',6)) botCast(bot,'c', enemyChanneling.pos);
      if(bot.ult>=8 && sp.state==='planted' && tryGate(a,'x',10)) botCast(bot,'x', sp.pos);
      break;
    }
    case 'lingshi': {
      if(side==='atk' && executing && a.goal && bot.ab.e.n>0 && !a.flags.suppress && tryGate(a,'e',4)){
        a.flags.suppress = true;
        botCast(bot,'e', a.goal);
      }
      if(side==='def' && sp.state==='planted' && dist2d(bot.pos,sp.pos)<20 && bot.ab.e.n>0 && tryGate(a,'e',8))
        botCast(bot,'e', sp.pos);
      if(!inCombat && G.now-a.lastSeenAt < 2 && a.state==='hunt' && bot.ab.q.n>0 && tryGate(a,'q',8))
        botCast(bot,'q', a.lastSeenPos);
      if(enemyChanneling && bot.ab.c.n>0 && tryGate(a,'c',6)) botCast(bot,'c', enemyChanneling.pos);
      if(bot.ult>=7 && tryGate(a,'x',6)){
        const near = G.ents.filter(e=>e.alive && e.team!==bot.team && dist2d(e.pos,bot.pos)<15).length;
        if(near >= 2) useAbility(bot,'x');
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

// ---------- bot 间分离力（防止叠在一起互堵门） ----------
function separateBots(){
  for(let i=0;i<G.ents.length;i++){
    const a=G.ents[i]; if(a.isPlayer || !a.alive || !a.ai) continue;
    for(let j=i+1;j<G.ents.length;j++){
      const b=G.ents[j]; if(b.isPlayer || !b.alive || !b.ai) continue;
      const dx=a.pos.x-b.pos.x, dz=a.pos.z-b.pos.z, d=Math.hypot(dx,dz)||.01;
      if(d < .85){
        const push = (.85-d)*1.2;
        a.vel.x += dx/d*push; a.vel.z += dz/d*push;
        b.vel.x -= dx/d*push; b.vel.z -= dz/d*push;
      }
    }
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
      // 防守方开局立刻前往点位架枪（像真人一样提前就位）；进攻方在天幕内自由活动
      if(sideOf(bot)==='def' && G.map.defPostList?.length){
        if(!a.hold){
          const posts = G.map.defPostList;
          const p = posts[a.role % posts.length];
          a.hold = snapToNav(V3(p.p[0],0,p.p[1]));
          a.holdLook = V3(p.look[0],1.5,p.look[1]);
          a.goal = a.hold;
          a.state = 'post';
          setPath(bot, a.hold);
        }
        let arrived = false;
        if(a.path.length) arrived = followPath(bot, dt, true);
        else if(dist2d(bot.pos, a.hold) > 1.4) moveDirect(bot, a.hold, dt, true);
        else arrived = true;
        if(arrived){
          bot.vel.x *= .6; bot.vel.z *= .6;
          if(a.holdLook){
            const ty = yawTo(bot.pos, a.holdLook) + Math.sin(G.now*.5 + bot.id*1.9)*.35;
            bot.yaw += angDiff(bot.yaw, ty) * Math.min(1, dt*4);
            bot.pitch *= (1 - dt*3);
          }
        }
        moveEntity(bot, dt);
        stuckCheck(bot, dt);
        updateBodyPose(bot);
        continue;
      }
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

    weaponUpkeep(bot);

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
  separateBots();   // 分离力每帧一次（此前在循环内重复执行导致互相推挤乱走）
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
        // 携弹者不追猎（专注进点下包），其他人追击
        if(G.match.spike?.carrier !== bot) a.state = 'hunt';
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

  // 弹药耗尽：优先去捡战场掉落的武器（角色死亡会掉枪）
  if(totalRangedAmmo(bot) <= 0 && G.drops.length){
    let best = null, bd = 50;
    for(const d of G.drops){
      if(d.w.ammo + d.w.reserve <= 0) continue;
      const dist = dist2d(bot.pos, d.pos);
      if(dist < bd){ bd = dist; best = d; }
    }
    if(best){
      a.state = 'loot';
      a.lootDrop = best;
      a.goal = best.pos.clone();
      if(needRepath(bot, a.goal)) setPath(bot, a.goal);
      return;
    }
  }
  if(a.state==='loot'){
    // 目标掉落物没了/捡到了 → 回到正常思考
    if(!a.lootDrop || !G.drops.includes(a.lootDrop) || totalRangedAmmo(bot) > 0){ a.state='wait'; a.lootDrop=null; }
    else return;   // 继续赶路捡枪
  }

  const side = sideOf(bot);
  if(side==='atk') thinkAttack(bot);
  else thinkDefend(bot);
}

// ---------- 进攻：策略驱动·分工协作 ----------
function thinkAttack(bot){
  const a = bot.ai, m = G.match, sp = m.spike;
  const site = m.plan.site;
  const sd = G.map.sites[site];
  const plantPos = V3(sd.plant[0], 0, sd.plant[1]);
  const stagePt = G.map.stages?.[site];
  const stagePos = stagePt ? V3(stagePt[0],0,stagePt[1]) : plantPos;
  const stg = m.strategy || { pace:'default', coord:'group' };

  // 分配进攻角色（entry / scout / flank / support）
  if(!a.assaultRole){
    const roles = ['entry','entry','scout','flank','support'];
    a.assaultRole = roles[a.role % roles.length];
    // 延迟出发时间
    const baseDelay = stg.pace==='rush'?.5: stg.pace==='slow'?2.5:1.2;
    a.planStartAt = G.now + a.role * .15 + baseDelay * gauss();
  }

  if(sp.state==='dropped'){
    if(!sp.claimer || !sp.claimer.alive) sp.claimer = bot;
    if(sp.claimer === bot){ a.state='fetch'; a.goal = sp.pos; if(needRepath(bot, sp.pos)) setPath(bot, sp.pos); return; }
  }
  if(sp.state==='planted'){
    if(!a.hold){
      const holds = G.map.atkHolds[sp.site] || [];
      const h = holds[a.role % holds.length];
      a.hold = snapToNav(V3(h.p[0],0,h.p[1])); a.holdLook = V3(h.look[0],1.5,h.look[1]);
    }
    a.state='hold'; a.goal = a.hold;
    if(needRepath(bot, a.hold)) setPath(bot, a.hold);
    return;
  }

  if(G.now < a.planStartAt){ return; }

  // 残血且刚受伤：暂时后撤拉开，找队友/等回血，再重新进攻（更像人）
  if(bot.hp < 32 && G.now - bot.lastDamaged < 2.5 && !a.fellBack &&
     a.state!=='fallback' && a.state!=='plant' && sp.carrier!==bot && sp.state!=='planted'){
    a.fellBack = true;
    a.state = 'fallback';
    a.fallbackUntil = G.now + rand(3.5, 5.5);
    let dest = null, bd = Infinity;
    for(const e of G.ents){
      if(e===bot || !e.alive || e.team!==bot.team) continue;
      const d = dist2d(e.pos, bot.pos);
      if(d > 6 && d < bd){ bd = d; dest = e.pos.clone(); }
    }
    if(!dest) dest = V3(bot.pos.x*.5, 0, clamp(bot.pos.z + 16, -36, 36));
    a.goal = dest;
    setPath(bot, dest);
    return;
  }

  // 转点重置
  if(m.planSwitchedAt && a.planSite !== site && a.state!=='hunt'){
    a.state = 'wait'; a.hold = null;
  }
  a.planSite = site;

  // 分工路线
  const isLurker = a.assaultRole==='flank' && sp.carrier!==bot && G.map.siteKeys.length>1;
  const isScout  = a.assaultRole==='scout' && !isLurker;

  switch(a.state){
    case 'wait': {
      a.state = 'advance';
      let dest = stagePos;
      if(isLurker){
        const other = G.map.siteKeys.find(k=>k!==site);
        const os = G.map.stages?.[other];
        if(os) dest = V3(os[0],0,os[1]);
        a.flags.lurk = true;
      } else if(isScout){
        // scout goes slightly off-axis from main push
        dest = V3(stagePos.x + rand(-4,4), 0, stagePos.z + rand(-4,4));
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
      if(!a.flags.lurk){
        const mates = G.ents.filter(e=>e.alive && sideOf(e)==='atk' && !e.isPlayer && !e.ai?.flags.lurk);
        const near = mates.filter(e=>dist2d(e.pos, stagePos) < 13).length;
        const need = Math.max(1, Math.ceil(mates.length * (stg.coord==='group'?.6:.3)));
        if(!m.executeT && (near >= need || G.now - a.stageAt > (stg.pace==='rush'?3:stg.pace==='slow'?9:5))){
          m.executeT = G.now; m.execSite = site;
        }
      }
      if(m.executeT && (m.execSite===site || a.flags.lurk)){
        a.state = 'execute';
        const holds = G.map.atkHolds[site] || [];
        const h = holds[a.role % holds.length];
        a.hold = snapToNav(V3(h.p[0],0,h.p[1])); a.holdLook = V3(h.look[0],1.5,h.look[1]);
        a.goal = (sp.carrier===bot ? plantPos.clone() : a.hold.clone());
        setPath(bot, a.goal);
      }
      break;
    }
    case 'execute': {
      if(sp.carrier===bot && inSite(bot.pos) && dist2d(bot.pos, plantPos) < 4){
        a.state = 'plant';
      } else if(dist2d(bot.pos, a.goal) < 3){
        a.state='hold'; setPath(bot, a.goal);
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
      if(dist2d(bot.pos, a.lastSeenPos) > 42){ a.state='wait'; break; }   // 太远不追
      a.goal = a.lastSeenPos.clone();
      if(needRepath(bot, a.goal)) setPath(bot, a.goal);
      if(dist2d(bot.pos, a.goal) < 3 || G.now - a.lastSeenAt > 6) a.state='wait';
      break;
    }
    case 'fallback': {
      if(G.now > a.fallbackUntil || bot.hp > 55){ a.state='wait'; break; }
      if(needRepath(bot, a.goal)) setPath(bot, a.goal);
      break;
    }
    case 'hold': break;
    default: a.state = 'wait';
  }

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
    if(dist2d(bot.pos, a.lastSeenPos) > 38){ a.state='post'; }
    else {
      a.goal = a.lastSeenPos.clone();
      if(needRepath(bot, a.goal)) setPath(bot, a.goal);
      if(dist2d(bot.pos, a.goal) < 3 || G.now - a.lastSeenAt > 5){ a.state='post'; a.hold=null; }
      return;
    }
  }

  if(m.rotateCall && G.now < m.rotateCall.until && !a.rotated && Math.random() < .3 + .3*D()){
    a.rotated = true;
    a.hold = m.rotateCall.pos.clone();
    a.holdLook = null;
    a.state='post';
    setPath(bot, a.hold);
  }

  // 驻点被打残：换到另一个防守位重新架枪（像人一样避免死守被清的点）
  if(a.hold && !a.target && bot.hp < 60 && G.now - bot.lastDamaged < 2 && !a.repositioned){
    a.repositioned = true;
    const posts = G.map.defPostList;
    if(posts.length > 1){
      const p = posts[(a.role + 1 + Math.floor(Math.random()*(posts.length-1))) % posts.length];
      a.hold = snapToNav(V3(p.p[0],0,p.p[1]));
      a.holdLook = V3(p.look[0],1.5,p.look[1]);
      a.state='post'; a.goal = a.hold;
      setPath(bot, a.hold);
    }
  }

  // 听声转位：己方情报点离驻点很远时，按难度概率移动过去支援
  const c = m.contact[bot.team];
  if(c && G.now - c.t < 3 && a.hold && dist2d(c.pos, a.hold) > 22 && G.now > (a.introtGate||0)){
    a.introtGate = G.now + 12;
    if(Math.random() < .2 + .4*D()){
      a.hold = c.pos.clone();
      a.holdLook = null;
      a.state='post'; a.goal = a.hold;
      setPath(bot, a.hold);
    }
  }

  if(!a.hold){
    const posts = G.map.defPostList;
    const p = posts[bot.ai.role % posts.length];
    a.hold = snapToNav(V3(p.p[0],0,p.p[1]));
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

  // 进度看门狗：像真人一样绝不长时间卡死——无进展就换路，再不行瞬移到最近路点
  if(a.goal && a.path.length){
    const gd = dist2d(bot.pos, a.goal);
    if(gd > 2.4){
      if(gd < (a.wdBest ?? Infinity) - .45){ a.wdBest = gd; a.wdAt = G.now; }
      else if(G.now - (a.wdAt||G.now) > 6){
        setPath(bot, a.goal);                          // 6 秒无进展：换一条路
        a.wdAt = G.now;
        a.wdKick = (a.wdKick||0) + 1;
        if(a.wdKick >= 2){                              // 连续两次仍无进展：吸附到最近路点重走
          const w = G.map.wps[nearestWp(bot.pos)];
          bot.pos.x = w.x; bot.pos.z = w.z; bot.pos.y = Math.max(0, w.y - 1.1);
          bot.vel.set(0,0,0);
          a.wdKick = 0;
        }
      }
    } else { a.wdBest = gd; a.wdAt = G.now; a.wdKick = 0; }
  }

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
    // 驻守朝向：优先最近接敌情报，其次预设视角；无情报时缓慢扫描角度（像人巡视）
    const c = m.contact[bot.team];
    const fresh = c && G.now - c.t < 4 && dist2d(c.pos, bot.pos) < 32;
    let look = a.holdLook;
    if(fresh) look = c.pos;
    if(look){
      const sweep = fresh ? 0 : Math.sin(G.now*.55 + bot.id*2.1)*.3;
      const ty = yawTo(bot.pos, look) + sweep;
      bot.yaw += angDiff(bot.yaw, ty)*Math.min(1,dt*5);
      bot.pitch *= (1-dt*3);
    }
    // 微走位：每隔几秒在驻点附近小幅挪动（像真人架枪时的小碎步）
    if(a.hold){
      if(!a.microT || G.now > a.microT){
        a.microT = G.now + rand(4.5, 8.5);
        a.microOff = V3(a.hold.x + rand(-1.5,1.5), a.hold.y, a.hold.z + rand(-1.5,1.5));
      }
      if(a.microOff && dist2d(bot.pos, a.microOff) > .45){
        const mdx = a.microOff.x - bot.pos.x, mdz = a.microOff.z - bot.pos.z;
        const ml = Math.hypot(mdx,mdz)||1;
        const mspd = moveSpeed(bot) * .3;
        bot.vel.x = mdx/ml*mspd; bot.vel.z = mdz/ml*mspd;
      } else { bot.vel.x *= .6; bot.vel.z *= .6; }
    } else { bot.vel.x *= .6; bot.vel.z *= .6; }
  }
  if(arrived && a.state==='fetch' && sp.state==='dropped' && dist2d(bot.pos, sp.pos)<1.4){
    G.hooks.pickSpike?.(bot);
  }
  // 捡枪：到达目标掉落物
  if(a.state==='loot' && a.lootDrop && G.drops.includes(a.lootDrop) && dist2d(bot.pos, a.lootDrop.pos) < 1.5){
    botPickupDrop(bot, a.lootDrop);
    a.lootDrop = null;
    a.state = 'wait';
  }
  // 顺路捡：没有主武器时路过掉落的主武器直接捡
  if(!bot.weapons.primary && G.drops.length && !a.target){
    for(const d of G.drops){
      if(d.w.def.cat==='pistol') continue;
      if(dist2d(bot.pos, d.pos) < 1.4 && Math.abs(bot.pos.y - d.pos.y) < 1.6){ botPickupDrop(bot, d); break; }
    }
  }
}

function botPickupDrop(bot, d){
  const slot = d.w.def.cat==='pistol' ? 'secondary' : 'primary';
  bot.weapons[slot] = d.w;
  bot.slot = slot;
  removeDrop(d);
  if(G.player && dist2d(bot.pos, G.player.pos) < 30) sfx.equip();
}
