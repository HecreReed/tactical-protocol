import { G, saveSettings } from './state.js?v=10';
import { WEAPONS, AGENTS, SKINS, DIFFICULTIES, L_ARMOR_COST, H_ARMOR_COST } from './config.js?v=10';
import { MAPS } from './map.js?v=10';
import { fmtTime, clamp, dist2d } from './utils.js?v=10';
import { curWeapon, eyePos, losBlocked } from './combat.js?v=10';
import { tryBuyWeapon, tryBuyArmor, sideOf } from './game.js?v=10';
import { buyAbility } from './abilities.js?v=10';
import { sfx, setVolume } from './audio.js?v=10';

const $ = id => document.getElementById(id);
let els = {};
let mmStatic = null;
let visCache = { t: 0, list: [] };

export function initHUD(){
  els = {
    hud: $('hud'), scoreAlly: $('scoreAlly'), scoreEnemy: $('scoreEnemy'),
    clock: $('clock'), roundLabel: $('roundLabel'), sideTag: $('sideTag'),
    dotsAlly: $('dotsAlly'), dotsEnemy: $('dotsEnemy'),
    hpNum: $('hpNum'), armorNum: $('armorNum'), hpBox: $('hpBox'), ammoBox: $('ammoBox'),
    hpBar: $('hpBar').firstElementChild, armorBar: $('armorBar').firstElementChild,
    money: $('moneyBox'), ultPts: $('ultPts'),
    ammoNum: $('ammoNum'), weapName: $('weapName'),
    slot1: $('slot1'), slot2: $('slot2'), slot3: $('slot3'),
    abilityBox: $('abilityBox'), killfeed: $('killfeed'),
    banner: $('banner'), bannerBig: $('bannerBig'), bannerSub: $('bannerSub'),
    interactTip: $('interactTip'), progWrap: $('progWrap'), progLabel: $('progLabel'), progBar: $('progBar').firstElementChild,
    vignette: $('vignette'), hitmarker: $('hitmarker'), scope: $('scope'),
    spikeTag: $('spikeTag'), minimap: $('minimap'), teamBar: $('teamBar'),
    buyMenu: $('buyMenu'), buyMoney: $('buyMoney'), buyWeapons: $('buyWeapons'), buyRight: $('buyRight'),
    scoreboard: $('scoreboard'), sbBody: $('sbBody'), sbScore: $('sbScore'),
    agentSelect: $('agentSelect'), agentCards: $('agentCards'),
    mapCards: $('mapCards'), diffBtns: $('diffBtns'),
    lockHint: $('lockHint'), endScreen: $('endScreen'), endTitle: $('endTitle'), endSub: $('endSub'),
    helpTip: $('helpTip'),
    crosshair: $('crosshair'),
    flashOverlay: $('flashOverlay'),
    settingsMenu: $('settingsMenu'),
  };

  G.hooks.killfeed = killfeed;
  G.hooks.hitmarker = hitmarker;
  G.hooks.damaged = damaged;
  G.hooks.banner = banner;
  G.hooks.hudMsg = hudMsg;
  G.hooks.interactTip = interactTip;
  G.hooks.showBoard = showBoard;
  G.hooks.closeBuy = ()=> setBuyOpen(false);
  G.hooks.refreshBuy = buildBuyMenu;
  G.hooks.matchOver = matchOver;
  G.hooks.flash = playerFlashed;

  $('buyClose').onclick = ()=> setBuyOpen(false);
  $('gearBtn').onclick = ()=> openSettings();
  $('lockSettings').onclick = (e)=>{ e.stopPropagation(); openSettings(); };
  $('settingsClose').onclick = ()=> closeSettings();
  window.addEventListener('keydown', e=>{
    if(e.code==='KeyB' && G.match && G.match.phase==='buy') setBuyOpen(!G.buyOpen);
    if(e.code==='Escape' && G.buyOpen) setBuyOpen(false);
  });
  buildSettings();
  prerenderMinimap();
}

// ---------- 闪光 ----------
let flashTimer = null;
function playerFlashed(dur){
  const el = els.flashOverlay;
  el.style.transition = 'none';
  el.style.opacity = .96;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(()=>{
    el.style.transition = `opacity ${dur*.75}s ease-in`;
    el.style.opacity = 0;
  }, dur*250);
}

// ---------- 设置 ----------
function buildSettings(){
  const s = G.settings;
  const sens = $('setSens'), fov = $('setFov'), vol = $('setVol');
  const upd = ()=>{
    $('setSensV').textContent = (+sens.value).toFixed(2);
    $('setFovV').textContent = fov.value;
    $('setVolV').textContent = Math.round(vol.value*100)+'%';
  };
  sens.value = s.sensMul; fov.value = s.fov; vol.value = s.volume;
  upd();
  sens.oninput = ()=>{ s.sensMul = +sens.value; upd(); };
  fov.oninput = ()=>{ s.fov = +fov.value; upd(); };
  vol.oninput = ()=>{ s.volume = +vol.value; setVolume(s.volume); upd(); };

  const mkBtns = (id, opts, get, set)=>{
    const box = $(id);
    box.innerHTML = '';
    for(const o of opts){
      const b = document.createElement('button');
      b.textContent = o.name;
      if(get()===o.v) b.classList.add('sel');
      b.onclick = ()=>{
        set(o.v);
        box.querySelectorAll('button').forEach(x=>x.classList.remove('sel'));
        b.classList.add('sel');
      };
      box.appendChild(b);
    }
  };
  mkBtns('setShadow', [{name:'关闭',v:'off'},{name:'低',v:'low'},{name:'高',v:'high'}],
    ()=>s.shadows, v=>{ s.shadows=v; G.hooks.applyGraphics?.(); });
  mkBtns('setQuality', [{name:'省电',v:'low'},{name:'高清',v:'high'}],
    ()=>s.quality, v=>{ s.quality=v; G.hooks.applyGraphics?.(); });
  mkBtns('setDiff', DIFFICULTIES.map(d=>({name:d.name, v:d.diff})),
    ()=>s.diff, v=>{ s.diff=v; if(G.match) G.match.diff=v; });

  const row = $('skinRow');
  row.innerHTML = '';
  for(const sk of SKINS){
    const d = document.createElement('div');
    d.className = 'skinItem' + (s.skin===sk.id?' sel':'');
    const c1 = '#'+sk.accent.toString(16).padStart(6,'0');
    const c2 = '#'+sk.body.toString(16).padStart(6,'0');
    d.innerHTML = `<div class="sw" style="background:linear-gradient(90deg,${c2},${c1})"></div>${sk.name}`;
    d.onclick = ()=>{
      s.skin = sk.id;
      row.querySelectorAll('.skinItem').forEach(x=>x.classList.remove('sel'));
      d.classList.add('sel');
      G.hooks.rebuildViewModel?.();
    };
    row.appendChild(d);
  }
}
export function openSettings(){
  G.menuOpen = true;
  els.settingsMenu.classList.remove('hidden');
  document.exitPointerLock?.();
}
function closeSettings(){
  G.menuOpen = false;
  saveSettings();
  els.settingsMenu.classList.add('hidden');
}

// ---------- 开局选择 ----------
export function showAgentSelect(cb){
  // 地图
  let mapSel = MAPS[0].id;
  els.mapCards.innerHTML = '';
  MAPS.forEach((m,i)=>{
    const card = document.createElement('div');
    card.className = 'mapCard' + (i===0?' sel':'');
    card.innerHTML = `<h3>${m.name}</h3><div class="d">${m.desc}</div>`;
    card.onclick = ()=>{
      mapSel = m.id;
      els.mapCards.querySelectorAll('.mapCard').forEach(x=>x.classList.remove('sel'));
      card.classList.add('sel');
    };
    els.mapCards.appendChild(card);
  });
  // 难度
  els.diffBtns.innerHTML = '';
  DIFFICULTIES.forEach(d=>{
    const b = document.createElement('div');
    b.className = 'diffBtn' + (G.settings.diff===d.diff?' sel':'');
    b.textContent = d.name;
    b.onclick = ()=>{
      G.settings.diff = d.diff; saveSettings();
      els.diffBtns.querySelectorAll('.diffBtn').forEach(x=>x.classList.remove('sel'));
      b.classList.add('sel');
    };
    els.diffBtns.appendChild(b);
  });
  // 特工
  els.agentCards.innerHTML = '';
  for(const [key,a] of Object.entries(AGENTS)){
    const card = document.createElement('div');
    card.className = 'agentCard';
    card.innerHTML = `<div class="icon">${a.emoji}</div><h2>${a.name}</h2><div class="role">${a.role} · ${a.desc}</div>
      <ul>
        <li>[C] <b>${a.ab.c.name}</b></li>
        <li>[Q] <b>${a.ab.q.name}</b></li>
        <li>[E] <b>${a.ab.e.name}</b>（免费）</li>
        <li>[X] <b>${a.ab.x.name}</b>（${a.ultCost}点）</li>
      </ul>`;
    card.onclick = ()=>{
      els.agentSelect.classList.add('hidden');
      els.hud.classList.remove('hidden');
      cb(mapSel, key, false);
    };
    els.agentCards.appendChild(card);
  }
  // 观战模式按钮
  const obsBtn = document.createElement('button');
  obsBtn.className = 'obsBtn';
  obsBtn.textContent = '🎥 观战模式（只看 AI 对战）';
  obsBtn.style.cssText = 'margin-top:14px;padding:10px 22px;font-size:15px;background:#1a2a36;border:1px solid #39d0c9;color:#39d0c9;border-radius:6px;cursor:pointer;';
  obsBtn.onmouseenter = ()=> obsBtn.style.background='#223644';
  obsBtn.onmouseleave = ()=> obsBtn.style.background='#1a2a36';
  obsBtn.onclick = ()=>{
    els.agentSelect.classList.add('hidden');
    els.hud.classList.remove('hidden');
    cb(mapSel, null, true);
  };
  els.agentCards.parentElement.appendChild(obsBtn);
}

// ---------- buy ----------
export function setBuyOpen(open){
  if(open && G.match?.phase!=='buy') return;
  G.buyOpen = open;
  els.buyMenu.classList.toggle('hidden', !open);
  if(open){
    document.exitPointerLock?.();
    buildBuyMenu();
  }
}

function buildBuyMenu(){
  const p = G.player; if(!p) return;
  els.buyMoney.textContent = `¥ ${p.money}`;
  const cats = [
    ['pistol','副武器'],['smg','冲锋枪'],['shotgun','霰弹枪'],
    ['rifle','步枪'],['sniper','狙击枪'],['heavy','重机枪'],
  ];
  let html = '';
  for(const [cat,label] of cats){
    html += `<div class="bcat"><h3>${label}</h3><div class="bgrid">`;
    for(const w of WEAPONS.filter(w=>w.cat===cat)){
      const owned = p.weapons.primary?.id===w.id || p.weapons.secondary?.id===w.id;
      const cls = owned?'owned': p.money<w.cost?'noafford':'';
      html += `<div class="bitem ${cls}" data-w="${w.id}"><div class="nm">${w.name}</div><div class="pr">¥ ${w.cost}</div></div>`;
    }
    html += `</div></div>`;
  }
  els.buyWeapons.innerHTML = html;
  els.buyWeapons.querySelectorAll('.bitem').forEach(el=>{
    el.onclick = ()=>{ if(tryBuyWeapon(el.dataset.w)) buildBuyMenu(); };
  });

  const a = AGENTS[p.agent];
  let rhtml = `<div class="bcat"><h3>护甲</h3><div class="bgrid">
    <div class="bitem ${p.armorMax>=25?'owned':p.money<L_ARMOR_COST?'noafford':''}" data-a="l"><div class="nm">轻型护甲 +25</div><div class="pr">¥ ${L_ARMOR_COST}</div></div>
    <div class="bitem ${p.armorMax>=50?'owned':p.money<H_ARMOR_COST?'noafford':''}" data-a="h"><div class="nm">重型护甲 +50</div><div class="pr">¥ ${H_ARMOR_COST}</div></div>
  </div></div>`;
  rhtml += `<div class="bcat"><h3>技能 — ${a.name}</h3><div class="bgrid">`;
  for(const k of ['c','q']){
    const ab = p.ab[k], d = ab.def;
    const full = ab.n >= d.max;
    rhtml += `<div class="bitem ${full?'owned':p.money<d.cost?'noafford':''}" data-ab="${k}">
      <div class="nm">[${k.toUpperCase()}] ${d.name} (${ab.n}/${d.max})</div><div class="pr">¥ ${d.cost}</div></div>`;
  }
  rhtml += `</div></div>
  <div class="bcat"><h3>说明</h3>
  <div style="font-size:12px;color:#8b978f;line-height:2">
  经济：击杀 +200 · 下包全队 +300 · 胜利 +3000<br>连败补偿 1900/2400/2900 · 存活保留装备<br>购买阶段结束自动开局</div></div>`;
  els.buyRight.innerHTML = rhtml;
  els.buyRight.querySelectorAll('[data-a]').forEach(el=>{
    el.onclick = ()=>{ if(tryBuyArmor(el.dataset.a==='h')) buildBuyMenu(); };
  });
  els.buyRight.querySelectorAll('[data-ab]').forEach(el=>{
    el.onclick = ()=>{ if(buyAbility(G.player, el.dataset.ab)){ sfx.buy(); buildBuyMenu(); } else sfx.deny(); };
  });
}

// ---------- feedback ----------
function killfeed(killer, victim, weapon, hs){
  const el = document.createElement('div');
  el.className = 'kf';
  const kName = killer ? killer.name : '世界';
  const kCls = killer?.team==='ally' ? 'a' : 'a enemy';
  const vCls = victim.team==='ally' ? 'v ally' : 'v';
  el.innerHTML = `<span class="${kCls}">${kName}</span><span class="w">${weapon||''}${hs?' <span class="hs">爆头</span>':''}</span><span class="${vCls}">${victim.name}</span>`;
  els.killfeed.appendChild(el);
  setTimeout(()=>{ el.style.opacity = 0; el.style.transition='opacity .5s'; }, 4200);
  setTimeout(()=> el.remove(), 4800);
  while(els.killfeed.children.length > 6) els.killfeed.firstChild.remove();
}

let hmT = 0;
function hitmarker(hs, kill){
  els.hitmarker.style.opacity = 1;
  els.hitmarker.classList.toggle('hs', !!hs);
  clearTimeout(hmT);
  hmT = setTimeout(()=> els.hitmarker.style.opacity = 0, kill?220:110);
}

let vigT = 0;
function damaged(){
  els.vignette.style.opacity = .9;
  clearTimeout(vigT);
  vigT = setTimeout(()=> els.vignette.style.opacity = 0, 320);
}

let banT = 0;
function banner(big, sub, dur=2.5){
  els.banner.classList.remove('hidden');
  els.bannerBig.textContent = big;
  els.bannerSub.textContent = sub || '';
  clearTimeout(banT);
  banT = setTimeout(()=> els.banner.classList.add('hidden'), dur*1000);
}

let msgT = 0;
function hudMsg(text){
  els.helpTip.textContent = text;
  els.helpTip.classList.remove('hidden');
  clearTimeout(msgT);
  msgT = setTimeout(()=> els.helpTip.classList.add('hidden'), 3500);
}

function interactTip(tip, channel, prog){
  els.interactTip.classList.toggle('hidden', !tip || !!channel);
  if(tip && !channel) els.interactTip.textContent = tip;
  els.progWrap.classList.toggle('hidden', !channel);
  if(channel){
    els.progLabel.textContent = channel==='plant' ? '正在安放 SPIKE' : '正在拆除 SPIKE';
    els.progBar.style.width = `${clamp(prog,0,1)*100}%`;
  }
}

function showBoard(show){
  els.scoreboard.classList.toggle('hidden', !show);
  if(!show) return;
  const m = G.match;
  els.sbScore.textContent = `${m.score.ally} : ${m.score.enemy}`;
  const rows = [...G.ents].sort((a,b)=> (a.team===b.team ? b.kills-a.kills : a.team==='ally'?-1:1));
  els.sbBody.innerHTML = rows.map(e=>{
    const w = e.weapons.primary?.def.name || e.weapons.secondary?.def.name || '';
    const a = AGENTS[e.agent];
    const label = e.isPlayer ? `${a.emoji} ${a.name}（你）` : `${a.emoji} ${a.name}`;
    return `<tr class="${e.isPlayer?'me':''} ${e.alive?'':'dead'}">
      <td class="${e.team==='ally'?'tAlly':'tEnemy'}">${label}</td>
      <td>${a.role}</td><td>${e.kills}</td><td>${e.deaths}</td>
      <td>¥${e.money}</td><td>${w}</td></tr>`;
  }).join('');
}

function matchOver(winner){
  els.endScreen.classList.remove('hidden');
  document.exitPointerLock?.();
  const won = winner==='ally';
  els.endTitle.textContent = won ? '胜 利' : '失 败';
  els.endTitle.className = `big ${won?'win':'lose'}`;
  const m = G.match;
  if(G.player){
    els.endSub.textContent = `${m.score.ally} : ${m.score.enemy} — 你 ${G.player.kills} 杀 / ${G.player.deaths} 死`;
  } else {
    els.endSub.textContent = `${m.score.ally} : ${m.score.enemy} — 观战结束`;
  }
}

// ---------- minimap ----------
function prerenderMinimap(){
  mmStatic = document.createElement('canvas');
  mmStatic.width = mmStatic.height = 230;
}
export function renderMinimapStatic(){
  const g = mmStatic.getContext('2d');
  g.fillStyle = '#0c141c';
  g.fillRect(0,0,230,230);
  const k = 230/84, off = 42;
  g.fillStyle = '#26333d';
  for(const b of G.map.walls){
    g.fillRect((b.min.x+off)*k, (b.min.z+off)*k, (b.max.x-b.min.x)*k, (b.max.z-b.min.z)*k);
  }
  // 内墙/高台/箱子
  for(const r of G.map.mmExtra||[]){
    g.fillStyle = r.type==='wall' ? '#26333d' : r.type==='plat' ? '#3a4f5c' : '#31414d';
    g.fillRect((r.x1+off)*k, (r.z1+off)*k, (r.x2-r.x1)*k, (r.z2-r.z1)*k);
  }
  g.fillStyle = 'rgba(127,208,212,.15)';
  for(const key of Object.keys(G.map.sites)){
    const s = G.map.sites[key];
    g.fillRect((s.min.x+off)*k,(s.min.z+off)*k,(s.max.x-s.min.x)*k,(s.max.z-s.min.z)*k);
    g.fillStyle = 'rgba(127,208,212,.6)';
    g.font = '700 16px Arial';
    g.fillText(key, (s.plant[0]+off)*k-5, (s.plant[1]+off)*k+6);
    g.fillStyle = 'rgba(127,208,212,.15)';
  }
}

function drawMinimap(){
  const c = els.minimap, g = c.getContext('2d');
  g.clearRect(0,0,230,230);
  g.drawImage(mmStatic,0,0);
  const k = 230/84, off = 42;
  const P = pos => [(pos.x+off)*k, (pos.z+off)*k];
  const m = G.match;

  // visible enemies (cache 0.25s)
  if(G.now - visCache.t > .25){
    visCache.t = G.now;
    visCache.list = [];
    if(G.player?.alive){
      const pe = eyePos(G.player);
      for(const e of G.ents){
        if(e.team!=='enemy' || !e.alive) continue;
        if(G.now < (e.revealedUntil||0) || !losBlocked(pe, eyePos(e))) visCache.list.push(e);
      }
    } else if(!G.player){
      // 观战模式显示所有存活 AI
      for(const e of G.ents) if(e.alive) visCache.list.push(e);
    }
  }

  // spike
  if(m && (m.spike.state==='planted' || m.spike.state==='dropped')){
    const [x,y] = P(m.spike.pos);
    g.fillStyle = '#ff4655';
    g.beginPath(); g.arc(x,y,4,0,7); g.fill();
    g.strokeStyle = '#ff4655';
    if(m.spike.state==='planted'){ g.beginPath(); g.arc(x,y,6+Math.sin(G.now*6)*2,0,7); g.stroke(); }
  }
  // allies
  for(const e of G.ents){
    if(!e.alive) continue;
    if(e.team==='ally' && !e.isPlayer){
      const [x,y] = P(e.pos);
      g.fillStyle = '#39d0c9';
      g.beginPath(); g.arc(x,y,3,0,7); g.fill();
    }
  }
  // 玩家可见敌人 / 观战全图
  for(const e of visCache.list){
    if(!e.alive) continue;
    const [x,y] = P(e.pos);
    g.fillStyle = e.team==='ally' ? '#39d0c9' : '#ff4655';
    g.beginPath(); g.arc(x,y,3,0,7); g.fill();
  }
  // 非观战模式仍按常规显示队友
  if(G.player){
    for(const e of G.ents){
      if(!e.alive || e.team!=='ally' || e.isPlayer) continue;
      const [x,y] = P(e.pos);
      g.fillStyle = '#39d0c9';
      g.beginPath(); g.arc(x,y,3,0,7); g.fill();
    }
  }
  // player wedge
  const p = G.player;
  if(p){
    const [x,y] = P(p.pos);
    g.save();
    g.translate(x,y);
    g.rotate(-p.yaw);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0,-6); g.lineTo(4,4); g.lineTo(-4,4); g.closePath();
    g.fill();
    g.restore();
  }
}

// ---------- per-frame ----------
export function updateHUD(){
  const m = G.match, p = G.player;
  if(!m) return;

  els.scoreAlly.textContent = m.score.ally;
  els.scoreEnemy.textContent = m.score.enemy;
  els.roundLabel.textContent = `回合 ${m.round}`;
  els.sideTag.textContent = m.allySide==='atk' ? '进攻方' : '防守方';

  let t = m.tPhase - G.now;
  if(m.phase==='buy') els.clock.textContent = `购买 ${fmtTime(t)}`;
  else if(m.phase==='planted') els.clock.textContent = fmtTime(m.spike.explodeAt - G.now);
  else if(m.phase==='end') els.clock.textContent = '—';
  else els.clock.textContent = fmtTime(t);
  els.clock.classList.toggle('danger', m.phase==='planted' || (m.phase==='live' && t<20));
  els.spikeTag.classList.toggle('hidden', m.phase!=='planted');

  // alive dots
  const allies = G.ents.filter(e=>e.team==='ally');
  const enemies = G.ents.filter(e=>e.team==='enemy');
  const dots = (box, list)=>{
    if(box.children.length !== list.length){
      box.innerHTML = list.map(()=> '<i></i>').join('');
    }
    list.forEach((e,i)=> box.children[i].classList.toggle('dead', !e.alive));
  };
  dots(els.dotsAlly, allies);
  dots(els.dotsEnemy, enemies);

  if(!p){
    // 观战模式：隐藏玩家专属 UI，保留雷达/队伍状态
    els.hpBox?.classList.add('hidden');
    els.ammoBox?.classList.add('hidden');
    els.money?.classList.add('hidden');
    els.ultPts?.parentElement?.classList.add('hidden');
    els.abilityBox?.classList.add('hidden');
    els.crosshair.style.display = 'none';
    els.scope.classList.add('hidden');
    drawMinimap();
    renderTeamBar();
    return;
  }
  // 正常模式确保 UI 显示
  els.hpBox?.classList.remove('hidden');
  els.ammoBox?.classList.remove('hidden');
  els.money?.classList.remove('hidden');
  els.ultPts?.parentElement?.classList.remove('hidden');
  els.abilityBox?.classList.remove('hidden');

  // hp
  els.hpNum.textContent = Math.ceil(p.hp);
  els.armorNum.textContent = p.armor;
  els.hpBar.style.transform = `scaleX(${clamp(p.hp/100,0,1)})`;
  els.armorBar.style.transform = `scaleX(${clamp(p.armor/50,0,1)})`;
  els.money.textContent = `¥ ${p.money}`;
  const aDef = AGENTS[p.agent];
  els.ultPts.textContent = `${p.ult}/${aDef.ultCost}`;

  // ammo
  const w = curWeapon(p);
  if(p.knifeUlt>0){
    els.ammoNum.innerHTML = `${p.knifeUlt} <span>飞刃</span>`;
    els.weapName.textContent = '锋刃风暴';
  } else if(p.arrowUlt>0){
    els.ammoNum.innerHTML = `${p.arrowUlt} <span>能量矢</span>`;
    els.weapName.textContent = '猎杀之矢（穿墙）';
  } else if(w.def.cat==='melee'){
    els.ammoNum.innerHTML = '—';
    els.weapName.textContent = '战术刀';
  } else {
    els.ammoNum.innerHTML = `${w.ammo} <span>/ ${w.reserve}</span>`;
    els.weapName.textContent = w.def.name.toUpperCase() + (w.reloadEnd>G.now?' 换弹中…':'');
  }
  els.slot1.classList.toggle('on', p.slot==='primary');
  els.slot2.classList.toggle('on', p.slot==='secondary');
  els.slot3.classList.toggle('on', p.slot==='knife');
  els.slot1.style.opacity = p.weapons.primary ? 1 : .35;

  // abilities
  renderAbilities(p, aDef);

  // scope
  const scoped = p.ads && w.def.ads?.scope && p.alive;
  els.scope.classList.toggle('hidden', !scoped);
  els.crosshair.style.display = scoped || !p.alive ? 'none' : 'block';

  drawMinimap();
  renderTeamBar();
}

let abCache = '';
function renderAbilities(p, aDef){
  const parts = [];
  for(const k of ['c','q','e']){
    const ab = p.ab[k];
    const onCd = k==='e' && G.now < p.abCd.e;
    const cdTxt = onCd ? Math.ceil(p.abCd.e - G.now) : '';
    parts.push({k, name:ab.def.name, n:ab.n, empty: ab.n<=0||onCd, cdTxt});
  }
  const ultReady = p.ult >= aDef.ultCost;
  const sig = parts.map(x=>`${x.k}${x.n}${x.empty}${x.cdTxt}`).join()+`x${p.ult}${ultReady}`;
  if(sig===abCache) return;
  abCache = sig;
  const icons = {c:'◆', q:'●', e:'▲', x:'✦'};
  els.abilityBox.innerHTML = parts.map(x=>
    `<div class="ab ${x.empty?'empty':''}" title="${x.name}">
      <span class="key">${x.k.toUpperCase()}</span><span class="ic">${icons[x.k]}</span>
      <span class="n">${x.cdTxt||x.n}</span></div>`
  ).join('') + `<div class="ab ult ${ultReady?'ready':''}" title="${aDef.ab.x.name}">
    <span class="key">X</span><span class="ic">${icons.x}</span>
    <span class="n">${p.ult}/${aDef.ultCost}</span></div>`;
}

let tbCache = '';
function renderTeamBar(){
  const allies = G.ents.filter(e=>e.team==='ally' && !e.isPlayer);
  const sig = allies.map(e=>`${e.name}${e.alive}${Math.ceil(e.hp)}`).join();
  if(sig===tbCache) return;
  tbCache = sig;
  els.teamBar.innerHTML = allies.map(e=>
    `<div class="tm ${e.alive?'':'dead'}"><span>${AGENTS[e.agent].emoji}</span><span>${e.name}</span>
     <span class="hp">${e.alive?Math.ceil(e.hp):'☠'}</span></div>`).join('');
}

export function showLockHint(show){
  els.lockHint.classList.toggle('hidden', !show);
}
