import * as THREE from 'three';
import { G } from './state.js?v=30';
import { V3, dist2d, rand, pick, clamp } from './utils.js?v=30';
import { ECONOMY, AGENT_LIST, AGENTS, WIDE, L_ARMOR_COST, L_ARMOR_HP, H_ARMOR_COST, H_ARMOR_HP } from './config.js?v=30';
import { makeEnt, makeWeapon, buildBody, resetBody, applyDamage } from './combat.js?v=30';
import { initAbilities, roundRefill } from './abilities.js?v=30';
import { initBotAI, resetBotRound } from './bots.js?v=30';
import { inSite } from './map.js?v=30';
import { clearRoundFX, explosionFX, addMesh, removeMesh, addBarriers, removeBarriers, removeDrop, spawnDrop } from './effects.js?v=30';
import { buildViewModel, switchSlot } from './player.js?v=30';
import { sfx } from './audio.js?v=30';

const BOT_NAMES_ALLY = [];
const BOT_NAMES_ENEMY = [];

let spikeMesh = null, nextBeep = 0, pickupGate = 0;

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

export function startMatch(agentKey, observer=false){
  G.observer = observer;
  const m = G.match = {
    round: 0, phase: 'buy', tPhase: 0,
    score: { ally: 0, enemy: 0 },
    loss: { ally: 0, enemy: 0 },
    allySide: 'atk',
    diff: G.settings.diff,
    spike: { state:'none', carrier:null, pos:V3(), site:null, explodeAt:0, prog:0, defProg:0, actor:null },
    plan: { site: 'A', t: 0 },
    liveStart: 0, planSwitchedAt: 0,
    executeT: 0, execSite: null,
    contact: { ally:{pos:V3(),t:-99}, enemy:{pos:V3(),t:-99} },
    rotateCall: null,
    winner: null,
  };

  if(observer){
    // 观战模式：没有玩家，5v5 全 AI
    G.player = null;
    const allyAgents = shuffle([...AGENT_LIST]).slice(0,5);
    allyAgents.forEach((ag,i)=>{
      const b = makeEnt({ name:AGENTS[ag].name, team:'ally', agent:ag });
      initAbilities(b); initBotAI(b, i);
      buildBody(b);
      G.ents.push(b);
    });
  } else {
    // 每队 5 名特工不重复；机器人直接以特工为名
    const player = makeEnt({ name:'你', team:'ally', agent:agentKey, isPlayer:true });
    G.player = player;
    G.ents.push(player);
    initAbilities(player);

    const allyAgents = shuffle(AGENT_LIST.filter(a=>a!==agentKey)).slice(0,4);
    allyAgents.forEach((ag,i)=>{
      const b = makeEnt({ name:AGENTS[ag].name, team:'ally', agent:ag });
      initAbilities(b); initBotAI(b, i);
      buildBody(b);
      G.ents.push(b);
    });
  }

  const enemyAgents = shuffle([...AGENT_LIST]).slice(0,5);
  enemyAgents.forEach((ag,i)=>{
    const b = makeEnt({ name:AGENTS[ag].name, team:'enemy', agent:ag });
    initAbilities(b); initBotAI(b, i);
    buildBody(b);
    G.ents.push(b);
  });

  buildSpikeMesh();
  hookUp();
  startRound();
}

function buildSpikeMesh(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.22,.3,.42,6),
    new THREE.MeshStandardMaterial({color:0x3a4650, roughness:.5}));
  body.position.y = .21;
  const core = new THREE.Mesh(new THREE.SphereGeometry(.1,8,6),
    new THREE.MeshBasicMaterial({color:0xff4655}));
  core.position.y = .45;
  g.add(body, core);
  g.visible = false;
  spikeMesh = g;
  spikeMesh.core = core;
  addMesh(g);
}

const sideOf = ent => ent.team === 'ally' ? G.match.allySide : (G.match.allySide==='atk'?'def':'atk');
export { sideOf };

export function startRound(){
  const m = G.match;
  // 战斗报告快照：上回合数据供购买阶段显示
  if(G.report && (Object.keys(G.report.dealt).length || Object.keys(G.report.taken).length)){
    G.lastReport = G.report;
  } else if(m.round > 0 && G.report){
    G.lastReport = null;
  }
  G.report = { dealt:{}, taken:{} };
  m.round++;
  m.phase = 'buy';
  m.tPhase = G.now + 30;
  m.rotateCall = null;
  m.plan = { site: pick(G.map.siteKeys), t: G.now };
  m.strategy = { pace: pick(['rush','default','slow']), coord: pick(['split','group']) };
  // 战术假打（无畏契约式）：先去假点造势拉动防守，再全队转真点执行
  const fakeable = G.map.siteKeys.filter(k=>k!==m.plan.site);
  m.strategy.fake = fakeable.length && m.strategy.pace!=='rush' && Math.random() < .38 ? pick(fakeable) : null;
  m.fakeDone = false; m.fakeEndT = 0;
  m.planSwitchedAt = 0;
  m.executeT = 0; m.execSite = null;
  m.contact.ally.t = -99; m.contact.enemy.t = -99;
  clearRoundFX();
  G.projectiles.length = 0;
  G.abilityEvents.length = 0;
  G.utilities.items.length = 0;
  G.utilities.nextId = 1;
  G.controlMode = null;
  if(G.smokeMode?.ring) G.scene.remove(G.smokeMode.ring);
  G.smokeMode = null;
  G.castMode = null;
  addBarriers();

  // spike reset
  m.spike = { state:'none', carrier:null, pos:V3(), site:null, explodeAt:0, prog:0, defProg:0, actor:null, claimer:null };
  spikeMesh.visible = false;

  const atkSpawns = [...G.map.spawns.atk];
  const defSpawns = [...G.map.spawns.def];

  for(const e of G.ents){
    const side = sideOf(e);
    const sp = side==='atk' ? atkSpawns.shift() : defSpawns.shift();
    e.pos.copy(sp.pos); e.vel.set(0,0,0);
    e.yaw = sp.yaw; e.pitch = 0;
    e.crouch = false; e.channel = null; e.scopeToggle = false;
    e.slowUntil = 0; e.stimUntil = 0; e.healQueue = 0; e.dashUntil = 0;
    if(!e.alive){
      // died last round: lose weapons
      e.weapons.primary = null;
      e.weapons.secondary = makeWeapon('classic');
      e.armor = 0; e.armorMax = 0;
    }
    e.alive = true; e.hp = 100;
    // refill ammo
    for(const k of ['primary','secondary']){
      const w = e.weapons[k];
      if(w){ w.ammo = w.def.mag; w.reserve = w.def.res; w.reloadEnd = 0; w.nextFire = 0; }
    }
    e.slot = e.weapons.primary ? 'primary' : 'secondary';
    roundRefill(e);
    if(!e.isPlayer){ resetBotRound(e); resetBody(e); }
  }

  // give spike to a random attacker (prefer player)
  const attackers = G.ents.filter(e=>sideOf(e)==='atk');
  const playerAtk = attackers.find(e=>e.isPlayer);
  const carrier = playerAtk && Math.random()<.6 ? playerAtk : pick(attackers);
  m.spike.state = 'carried';
  m.spike.carrier = carrier;

  // bots buy
  for(const e of G.ents) if(!e.isPlayer) botBuy(e);

  if(G.player) buildViewModel();
  sfx.roundStart();
  G.hooks.banner?.(`回合 ${m.round}`, m.allySide==='atk'?'进攻方 — 安放 Spike':'防守方 — 守住点位', 2.2);
  G.hooks.refreshBuy?.();
  G.hooks.hudMsg?.('购买阶段 — 按 B 打开商店');
}

function botBuy(e){
  const m = G.match;
  // 经济局判断（像人一样存钱）：没好枪且钱不够全购 → 大概率 eco 憋下一局
  const goodPrimary = e.weapons.primary && e.weapons.primary.def.cost >= 2000;
  if(!goodPrimary && m.round > 1 && e.money < 2300 && Math.random() < .75){
    if(e.money >= 800 && Math.random() < .4){
      e.money -= 400; e.armor = e.armorMax = Math.max(e.armor, 25);
    }
    return;
  }
  const buy = (id)=>{
    const def = WIDE(id);
    if(e.money < def.cost) return false;
    e.money -= def.cost;
    const slot = def.cat==='pistol' ? 'secondary' : 'primary';
    e.weapons[slot] = makeWeapon(id);
    return true;
  };
  const armor = (heavy)=>{
    const cost = heavy?H_ARMOR_COST:L_ARMOR_COST;
    if(e.money>=cost){ e.money-=cost; e.armor = e.armorMax = heavy?H_ARMOR_HP:L_ARMOR_HP; }
  };
  const hasPrimary = !!e.weapons.primary;
  if(!hasPrimary || e.weapons.primary.def.cost < 2000){
    if(e.money >= 3900){ buy(Math.random()<.5?'vandal':'phantom'); armor(true); }
    else if(e.money >= 2400 && Math.random()<.4){ buy('bulldog'); armor(false); }
    else if(e.money >= 2000){ buy('spectre'); armor(false); }
    else if(e.money >= 1400 && Math.random()<.5){ buy(pick(['stinger','marshal','bucky'])); armor(false); }
    else if(e.money >= 800 && G.match.round===1){ if(Math.random()<.5) buy(pick(['ghost','frenzy'])); else armor(false); }
  } else {
    if(e.armor < e.armorMax/2 && e.money >= H_ARMOR_COST) armor(true);
  }
  // 补技能弹药（保留 400 底金）
  for(const k of ['c','q']){
    const slot = e.ab[k], d = slot.def;
    while(d.cost>0 && slot.n < d.max && e.money - d.cost >= 400){
      e.money -= d.cost; slot.n++;
    }
  }
}

function hookUp(){
  G.hooks.onDeath = onDeath;
  G.hooks.plantTick = plantTick;
  G.hooks.defuseTick = defuseTick;
  G.hooks.pickSpike = pickSpike;
  G.hooks.interactTick = playerInteract;
  G.hooks.noise = onNoise;
  G.hooks.stopChannel = stopChannel;
}

// 枪声/脚步情报：为对方队伍记录“最近接敌位置”
function onNoise(pos, ent){
  const m = G.match;
  if(!m || !ent) return;
  const other = ent.team === 'ally' ? 'enemy' : 'ally';
  let heard = false;
  for(const e of G.ents){
    if(e.team !== other || !e.alive) continue;
    if(dist2d(e.pos, pos) < 45){
      heard = true;
      if(e.ai) e.ai.pendingContact = {kind:'sound',pos:pos.clone(),sourceId:ent.id};
    }
  }
  if(heard){
    m.contact[other].pos.copy(pos);
    m.contact[other].t = G.now;
    m.contact[other].confidence = .62;
  }
}

function onDeath(victim, killer){
  const m = G.match;
  // drop spike
  if(m.spike.state==='carried' && m.spike.carrier===victim){
    m.spike.state = 'dropped';
    m.spike.pos.copy(victim.pos);
    m.spike.carrier = null;
    m.spike.claimer = null;
    spikeMesh.visible = true;
    spikeMesh.position.copy(victim.pos).y = 0;
    if(victim.isPlayer) G.hooks.hudMsg?.('你掉落了 Spike！');
  }
  // 补枪联动：附近队友获知击杀者位置
  if(killer && killer !== victim){
    for(const e of G.ents){
      if(e.team !== victim.team || !e.alive || e.isPlayer || !e.ai) continue;
      if(dist2d(e.pos, victim.pos) < 28){
        e.ai.pendingContact = {kind:'sound',pos:victim.pos.clone(),sourceId:killer.id};
        if(['push','advance','stage','post','hold'].includes(e.ai.state) && dist2d(e.pos,victim.pos)<18) e.ai.state = 'hunt';
      }
    }
  }
  // defender death broadcast for rotates
  if(sideOf(victim)==='def'){
    m.rotateCall = { pos: victim.pos.clone(), until: G.now + 6, strength:1 };
  }
  if(m.phase==='live' || m.phase==='planted') checkElimination();
}

function checkElimination(){
  const m = G.match;
  const atkAlive = G.ents.filter(e=>e.alive && sideOf(e)==='atk').length;
  const defAlive = G.ents.filter(e=>e.alive && sideOf(e)==='def').length;
  if(m.phase==='planted'){
    if(defAlive===0) endRound('atk', '歼灭防守方');
    // attackers dead: round continues (defenders must defuse)
  } else {
    if(atkAlive===0) endRound('def', '歼灭进攻方');
    else if(defAlive===0) endRound('atk', '歼灭防守方');
  }
}

// ---------- spike ----------
function pickSpike(ent){
  const m = G.match;
  if(m.spike.state!=='dropped') return;
  m.spike.state = 'carried';
  m.spike.carrier = ent;
  spikeMesh.visible = false;
  if(ent.isPlayer) G.hooks.hudMsg?.('你拾取了 Spike');
}

function plantTick(ent, dt){
  const m = G.match;
  if(m.phase!=='live' || m.spike.carrier!==ent) return;
  if(!inSite(ent.pos) || !ent.grounded) { ent.channel=null; return; }
  ent.channel = 'plant';
  if(m.spike.actor !== ent){ m.spike.actor = ent; m.spike.prog = 0; }
  m.spike.prog += dt;
  if(Math.floor(m.spike.prog*4)!==Math.floor((m.spike.prog-dt)*4)) sfx.plantTick();
  if(m.spike.prog >= 4){
    ent.channel = null;
    plantSpike(ent);
  }
}

function plantSpike(ent){
  const m = G.match;
  m.spike.state = 'planted';
  m.spike.site = inSite(ent.pos) || m.plan.site;
  m.spike.pos.copy(ent.pos);
  m.spike.carrier = null;
  m.spike.explodeAt = G.now + 45;
  m.spike.defProg = 0; m.spike.actor = null;
  m.phase = 'planted';
  m.tPhase = m.spike.explodeAt;
  spikeMesh.visible = true;
  spikeMesh.position.copy(ent.pos);
  ent.ult = Math.min(9, ent.ult+1);
  // plant bonus
  for(const e of G.ents) if(sideOf(e)==='atk') e.money = Math.min(ECONOMY.max, e.money + ECONOMY.plant);
  sfx.planted();
  G.hooks.banner?.('SPIKE 已安放', '45 秒后引爆', 2.5);
  nextBeep = G.now + .5;
  checkElimination();
}

function defuseTick(ent, dt){
  const m = G.match;
  if(m.phase!=='planted') return;
  if(Math.hypot(ent.pos.x-m.spike.pos.x, ent.pos.y-m.spike.pos.y, ent.pos.z-m.spike.pos.z) > 2.2){ ent.channel=null; return; }
  ent.channel = 'defuse';
  if(m.spike.actor !== ent && m.spike.actor){ /* someone else was defusing */ }
  m.spike.actor = ent;
  m.spike.defProg += dt;
  if(Math.floor(m.spike.defProg*4)!==Math.floor((m.spike.defProg-dt)*4)) sfx.plantTick();
  if(m.spike.defProg >= 7){
    ent.channel = null;
    ent.ult = Math.min(9, ent.ult+1);
    sfx.defused();
    endRound('def', 'Spike 已拆除');
  }
}

export function stopChannel(ent){
  const m = G.match;
  if(ent.channel==='plant'){ m.spike.prog = 0; m.spike.actor = null; }
  if(ent.channel==='defuse'){
    // half-defuse checkpoint
    m.spike.defProg = m.spike.defProg >= 3.5 ? 3.5 : 0;
    m.spike.actor = null;
  }
  ent.channel = null;
}

// player interact (F)
function playerInteract(p, dt){
  const m = G.match;
  const holding = !!G.keys['KeyF'];
  const side = sideOf(p);
  let tip = null;

  if(side==='atk' && m.spike.carrier===p && m.phase==='live'){
    if(inSite(p.pos)){
      tip = '按住 [F] 安放 Spike';
      if(holding){ plantTick(p, dt); }
      else if(p.channel==='plant') stopChannel(p);
    } else if(p.channel==='plant') stopChannel(p);
  } else if(side==='def' && m.phase==='planted' && dist2d(p.pos, m.spike.pos) < 2.2){
    tip = '按住 [F] 拆除 Spike';
    if(holding){ defuseTick(p, dt); }
    else if(p.channel==='defuse') stopChannel(p);
  } else if(p.channel) stopChannel(p);

  // auto pickup dropped spike
  if(side==='atk' && m.spike.state==='dropped' && dist2d(p.pos, m.spike.pos) < 1.4) pickSpike(p);

  // 拾取掉落武器（复刻无畏契约：走近按 F 换枪）
  if(!tip && !p.channel && (m.phase==='live'||m.phase==='planted'||m.phase==='buy')){
    let nd = null, dd = 1.8;
    for(const d of G.drops){
      const dist = dist2d(p.pos, d.pos);
      if(dist < dd && Math.abs(p.pos.y - d.pos.y) < 1.6){ dd = dist; nd = d; }
    }
    if(nd){
      tip = `按 [F] 拾取 ${nd.w.def.name}（${nd.w.ammo}/${nd.w.reserve}）`;
      if(holding && G.now > pickupGate){
        pickupGate = G.now + .6;
        const slot = nd.w.def.cat==='pistol' ? 'secondary' : 'primary';
        const old = p.weapons[slot];
        if(old && old.def.cost > 0 && old.id !== 'classic') spawnDrop(old, p.pos.clone());
        p.weapons[slot] = nd.w;
        removeDrop(nd);
        p.slot = slot;
        buildViewModel();
        sfx.buy();
        G.hooks.hudMsg?.(`拾取了 ${nd.w.def.name}`);
      }
    }
  }

  G.hooks.interactTip?.(tip, p.channel, p.channel==='plant' ? m.spike.prog/4 : m.spike.defProg/7);
}

// ---------- round end / economy ----------
function endRound(winnerSide, reason){
  const m = G.match;
  if(m.phase==='end' || m.phase==='over') return;
  m.phase = 'end';
  m.tPhase = G.now + 5;
  for(const e of G.ents){ if(e.channel) e.channel = null; }

  const winnerTeam = m.allySide===winnerSide ? 'ally' : 'enemy';
  m.score[winnerTeam]++;
  const loserTeam = winnerTeam==='ally' ? 'enemy' : 'ally';
  m.loss[winnerTeam] = 0;
  m.loss[loserTeam] = Math.min(3, m.loss[loserTeam]+1);
  const lossBonus = ECONOMY.lossBonus[m.loss[loserTeam]-1];

  for(const e of G.ents){
    const won = e.team===winnerTeam;
    e.money = Math.min(ECONOMY.max, e.money + (won ? ECONOMY.win : lossBonus));
  }

  const allyWon = winnerTeam==='ally';
  if(allyWon) sfx.roundWin(); else sfx.roundLose();
  G.hooks.banner?.(allyWon?'回合胜利':'回合失败', reason, 4);
}

export function updateGame(dt){
  const m = G.match;
  if(!m || m.phase==='select' || m.phase==='over') return;

  // spike carried visual for player HUD handled by hud; beeping
  if(m.phase==='planted'){
    const remain = m.spike.explodeAt - G.now;
    if(G.now >= nextBeep){
      const fast = remain < 10;
      sfx.spikeBeep(fast);
      nextBeep = G.now + (remain<5? .18 : fast? .4 : remain<25? .7 : 1);
      spikeMesh.core.material.color.setHex(spikeMesh.core.material.color.getHex()===0xff4655?0xffd040:0xff4655);
    }
    if(remain <= 0){
      // explode
      explosionFX(m.spike.pos);
      sfx.explosion(G.player? dist2d(m.spike.pos, G.player.pos):0);
      for(const e of G.ents){
        if(e.alive && dist2d(e.pos, m.spike.pos) < 12) { e.hp = 0; e.alive = false; e.deaths++;
          if(e.mesh){ e.mesh.rotation.x = -Math.PI/2; e.mesh.position.y=.25; }
          if(e.isPlayer) G.hooks.damaged?.(null);
        }
      }
      spikeMesh.visible = false;
      endRound('atk', 'Spike 引爆');
      return;
    }
  }

  switch(m.phase){
    case 'buy':
      if(G.now >= m.tPhase){
        m.phase = 'live';
        m.tPhase = G.now + 100;
        m.liveStart = G.now;
        removeBarriers();
        G.hooks.closeBuy?.();
        G.hooks.banner?.('行动开始','',1.5);
        sfx.barrier();
        sfx.roundStart();
      }
      break;
    case 'live':
      // 佯攻兜底：开局 20 秒后强制结束假打（佯攻组阵亡也能收队转真点）
      if(m.strategy?.fake && !m.fakeDone && G.now - m.liveStart > 16) m.fakeDone = true;
      // 进攻方久攻不下 → 全队转点
      if(!m.planSwitchedAt && G.now - m.liveStart > 45 && m.spike.state!=='planted'){
        const others = G.map.siteKeys.filter(k=>k!==m.plan.site);
        if(others.length > 0){
          m.plan = { site: pick(others), t: G.now };
          m.planSwitchedAt = G.now;
          m.executeT = 0; m.execSite = null;
        for(const e of G.ents){
          if(e.isPlayer || !e.alive || !e.ai) continue;
          if((e.team==='ally'?m.allySide:(m.allySide==='atk'?'def':'atk'))!=='atk') continue;
          if(e.ai.state==='hold'||e.ai.state==='push'){ e.ai.state='wait'; e.ai.hold=null; e.ai.planStartAt = G.now + rand(0,2); }
        }
        }
        if(m.allySide==='atk') G.hooks.hudMsg?.(`队伍转点 → ${m.plan.site} 点`);
      }
      if(G.now >= m.tPhase) endRound('def', '时间耗尽');
      break;
    case 'end':
      if(G.now >= m.tPhase){
        // match over?
        if(m.score.ally >= 13 || m.score.enemy >= 13){
          m.phase = 'over';
          m.winner = m.score.ally > m.score.enemy ? 'ally' : 'enemy';
          G.hooks.matchOver?.(m.winner);
          return;
        }
        // halftime swap after round 12
        if(m.round === 12){
          m.allySide = m.allySide==='atk' ? 'def' : 'atk';
          m.loss.ally = 0; m.loss.enemy = 0;
          for(const e of G.ents){
            e.money = ECONOMY.startAfterSwap;
            e.weapons.primary = null;
            e.weapons.secondary = makeWeapon('classic');
            e.armor = 0; e.armorMax = 0; e.ult = Math.min(e.ult, 4);
          }
          G.hooks.banner?.('换边', m.allySide==='atk'?'你现在是进攻方':'你现在是防守方', 3);
        }
        if(m.round === 24 && m.score.ally===12 && m.score.enemy===12){
          G.hooks.hudMsg?.('决胜局！');
        }
        startRound();
      }
      break;
  }
}

// buying API used by HUD
export function tryBuyWeapon(id){
  const p = G.player, m = G.match;
  if(!p || m.phase!=='buy') return false;
  const def = WIDE(id);
  if(!def) { sfx.deny(); return false; }
  const slot = def.cat==='pistol' ? 'secondary' : 'primary';
  if(p.weapons[slot]?.id === id) { sfx.deny(); return false; }
  // 同回合已购武器被替换时先全额退款（复刻无畏契约，防误购亏钱）
  const old = p.weapons[slot];
  const refund = (old && old.boughtRound === m.round && old.def.cost > 0) ? old.def.cost : 0;
  if(p.money + refund < def.cost) { sfx.deny(); return false; }
  p.money = Math.min(ECONOMY.max, p.money + refund) - def.cost;
  p.weapons[slot] = makeWeapon(id);
  p.weapons[slot].boughtRound = m.round;
  switchSlot(p, slot);
  p.slot = slot;
  buildViewModel();
  sfx.buy();
  return true;
}
// 右键出售：同回合购买的武器可全额退款（复刻无畏契约）
export function trySellWeapon(id){
  const p = G.player, m = G.match;
  if(!p || m.phase!=='buy') return false;
  const def = WIDE(id);
  if(!def) return false;
  const slot = def.cat==='pistol' ? 'secondary' : 'primary';
  const w = p.weapons[slot];
  if(!w || w.id !== id || w.boughtRound !== m.round || def.cost <= 0){ sfx.deny(); return false; }
  p.money = Math.min(ECONOMY.max, p.money + def.cost);
  if(slot === 'primary'){
    p.weapons.primary = null;
    if(p.slot === 'primary') switchSlot(p, 'secondary');
  } else {
    p.weapons.secondary = makeWeapon('classic');
    if(p.slot === 'secondary') buildViewModel();
  }
  sfx.buy();
  return true;
}
export function tryBuyArmor(heavy){
  const p = G.player, m = G.match;
  if(!p || m.phase!=='buy') return false;
  const cost = heavy?H_ARMOR_COST:L_ARMOR_COST;
  const hp = heavy?H_ARMOR_HP:L_ARMOR_HP;
  if(p.money < cost || (p.armor >= hp)) { sfx.deny(); return false; }
  if(!p.armorPurchase || p.armorPurchase.round !== m.round){
    p.armorPurchase = { round: m.round, spent: 0, prevArmor: p.armor, prevMax: p.armorMax };
  }
  p.armorPurchase.spent += cost;
  p.money -= cost;
  p.armor = p.armorMax = hp;
  sfx.buy();
  return true;
}
// 右键出售本回合购买的护甲（全额退款并还原原有护甲值）
export function trySellArmor(){
  const p = G.player, m = G.match;
  if(!p || m.phase!=='buy') return false;
  const ap = p.armorPurchase;
  if(!ap || ap.round !== m.round || ap.spent <= 0){ sfx.deny(); return false; }
  p.money = Math.min(ECONOMY.max, p.money + ap.spent);
  p.armor = ap.prevArmor;
  p.armorMax = ap.prevMax;
  p.armorPurchase = null;
  sfx.buy();
  return true;
}
export function spikeInfo(){ return G.match?.spike; }
