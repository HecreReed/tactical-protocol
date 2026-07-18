const clonePoint = p => p?.clone ? p.clone() : { x:p?.x||0, y:p?.y||0, z:p?.z||0 };
const restorePoint = (ent, point) => {
  if(ent.pos?.copy) ent.pos.copy(point);
  else ent.pos = clonePoint(point);
};

export function initAgentState(ent){
  ent.abilityState ||= {};
  ent.resources ||= {};
  if(ent.agent==='viper') ent.resources.fuel = 100;
  if(ent.agent==='neon') ent.resources.energy = 100;
  if(ent.agent==='neon'){ ent.resources.slideCharges = 1; ent.resources.slideKills = 0; }
  if(ent.agent==='reyna') ent.resources.soulOrbs = [];
  if(ent.agent==='astra'){ ent.resources.stars = 4; ent.resources.starSeq=1; ent.resources.placedStars=[]; }
  if(ent.agent==='skye') ent.resources.regrowth = 100;
  if(ent.agent==='raze') ent.resources.paintKills = 0;
  if(ent.agent==='gekko') ent.resources.globules = {};
}

export function placeAstraStar(ent,pos){
  if((ent.resources?.stars||0)<=0)return null;
  const star={id:`star-${ent.resources.starSeq++}`,pos:clonePoint(pos),active:true};
  ent.resources.stars--;ent.resources.placedStars.push(star);return star;
}

export function consumeAstraStar(ent,id,effect){
  const star=ent.resources?.placedStars?.find(item=>item.id===id&&item.active);
  if(!star)return false;star.active=false;star.effect=effect;return true;
}

export function primeJettDash(ent, now){
  ent.abilityState.jettDash = { primedAt:now, until:now+7.5 };
}

export function consumeJettDash(ent, now){
  const dash = ent.abilityState.jettDash;
  if(!dash || now < dash.primedAt || now > dash.until) return false;
  delete ent.abilityState.jettDash;
  return true;
}

export function activateReturnAnchor(ent, until){
  ent.abilityState.runItBack = { pos:clonePoint(ent.pos), until };
}

export function returnToAnchor(ent){
  const anchor = ent.abilityState?.runItBack;
  if(!anchor) return false;
  restorePoint(ent, anchor.pos);
  ent.hp = 100;
  ent.healQueue = 0;
  ent.channel = null;
  delete ent.abilityState.runItBack;
  return true;
}

export function resolveAgentFatality(ent, now){
  if(ent.agent==='phoenix' && ent.abilityState?.runItBack && now <= ent.abilityState.runItBack.until){
    returnToAnchor(ent);
    return { prevented:true, mode:'return' };
  }
  if(ent.agent==='kayo' && now <= (ent.abilityState?.nullCmdUntil||0)){
    ent.hp = 1;
    ent.channel = 'downed';
    ent.abilityState.downedUntil = now + 15;
    return { prevented:true, mode:'downed' };
  }
  return { prevented:false };
}

export function handleAgentKill(killer, target, now){
  if(killer.agent==='jett' && killer.knifeUlt > 0) killer.knifeUlt = 5;
  if(killer.agent==='raze'){
    killer.resources.paintKills = (killer.resources.paintKills||0) + 1;
    if(killer.resources.paintKills >= 2){
      killer.resources.paintKills = 0;
      if(killer.ab?.e) killer.ab.e.n = Math.min(killer.ab.e.def?.max||1, killer.ab.e.n+1);
    }
  }
  if(killer.agent==='reyna'){
    killer.resources.soulOrbs ||= [];
    killer.resources.soulOrbs.push({ pos:clonePoint(target.pos||killer.pos), until:now+3 });
  }
  if(killer.agent==='neon'){
    killer.resources.energy = Math.min(100, (killer.resources.energy||0)+25);
    killer.resources.slideKills = (killer.resources.slideKills||0)+1;
    if(killer.resources.slideKills>=2){ killer.resources.slideKills=0; killer.resources.slideCharges=1; }
  }
  if(killer.agent==='iso' && now < (killer.abilityState?.doubleTapUntil||0)) killer.abilityState.isoShield = true;
  if(killer.agent==='clove') killer.abilityState.pickMeUpUntil = now + 10;
  if(killer.agent==='clove'&&killer.abilityState.cloveProveUntil)delete killer.abilityState.cloveProveUntil;
  if(killer.agent==='miks' && now < (killer.abilityState?.harmonizeUntil||0)) killer.abilityState.harmonizeUntil = now + 10;
}

export function consumeReynaSoul(ent, mode, now){
  const orbs = ent.resources?.soulOrbs || [];
  const index = orbs.findIndex(orb => now <= orb.until);
  if(index < 0) return false;
  orbs.splice(index,1);
  if(mode==='devour'){
    ent.healQueue = Math.max(ent.healQueue||0, 100);
    ent.abilityState.overhealHoldUntil = now + 30;
  } else if(mode==='dismiss') ent.abilityState.dismissUntil = now + 2;
  return true;
}

export function startNeonSprint(ent){
  if((ent.resources?.energy||0)<=0) return false;
  ent.abilityState.neonSprinting = true;
  return true;
}

export function useNeonSlide(ent){
  if((ent.resources?.slideCharges||0)<=0) return false;
  ent.resources.slideCharges--;
  ent.abilityState.neonSlide = true;
  return true;
}

export function placeRendezvous(ent, pos){
  ent.abilityState.rendezvous = { pos:clonePoint(pos), active:true };
}

export function useRendezvous(ent){
  const anchor = ent.abilityState?.rendezvous;
  if(!anchor?.active) return false;
  restorePoint(ent, anchor.pos);
  anchor.active = false;
  return true;
}

export function canNeuralTheft(ent, corpses, now){
  return corpses.some(c => c.ent?.team!==ent.team && now-(c.diedAt??-Infinity)<=6);
}

export function applySkyeRegrowth(skye, entities, dt){
  if((skye.resources?.regrowth||0)<=0) return false;
  let healed=false;
  for(const ent of entities){
    if(ent===skye || ent.team!==skye.team || ent.hp<=0 || ent.hp>=100) continue;
    ent.hp=Math.min(100,ent.hp+20*dt); healed=true;
  }
  if(healed) skye.resources.regrowth=Math.max(0,skye.resources.regrowth-20*dt);
  return healed;
}

export function canClovePostDeathCast(ent,type,now){
  return ent.agent==='clove'&&!ent.alive&&type==='cloveRuse'&&now<=(ent.abilityState?.cloveDeathUntil||0);
}

export function activateCloveRevive(ent,now){
  if(ent.agent!=='clove'||now>(ent.abilityState?.cloveReviveUntil||0))return false;
  ent.alive=true;ent.hp=100;ent.channel=null;delete ent.abilityState.cloveReviveUntil;return true;
}

export function recordAgentDeath(ent,now){
  if(ent.agent==='clove')ent.abilityState.cloveDeathUntil=now+30;
}

export function reclaimGekkoGlobule(ent,key,now){
  const globule=ent.resources?.globules?.[key];
  if(!globule||now>globule.until)return false;
  delete ent.resources.globules[key];return true;
}

export function consumeIsoShield(ent){
  if(!ent.abilityState?.isoShield)return false;
  ent.abilityState.isoShield=false;return true;
}

export function harmonizePair(miks,ally,now){
  miks.abilityState.harmonizeUntil=now+10;ally.abilityState.harmonizeUntil=now+10;
  miks.stimUntil=now+10;ally.stimUntil=now+10;
}

export function isDebuffImmune(ent,now){
  return ent.agent==='veto'&&now<(ent.abilityState?.evolutionUntil||0);
}

export function placeReturnAnchor(ent,key,until){
  ent.abilityState[`${key}Anchor`]={pos:clonePoint(ent.pos),until};
}

export function returnToLightAnchor(ent,key,now){
  const anchor=ent.abilityState?.[`${key}Anchor`];
  if(!anchor||now>anchor.until)return false;
  restorePoint(ent,anchor.pos);delete ent.abilityState[`${key}Anchor`];return true;
}

export function selectTejoTarget(ent,pos){
  ent.abilityState.tejoTargets ||= [];
  if(ent.abilityState.tejoTargets.length<2)ent.abilityState.tejoTargets.push(clonePoint(pos));
  return ent.abilityState.tejoTargets.length;
}

export function setViperEmitter(ent, key, active){
  ent.abilityState.viperEmitters ||= {};
  ent.abilityState.viperEmitters[key] = active;
}

export function tickAgentState(ent, now, dt){
  if(ent.agent==='phoenix' && ent.abilityState?.runItBack && now >= ent.abilityState.runItBack.until) returnToAnchor(ent);
  if(ent.agent==='kayo' && ent.channel==='downed' && now >= (ent.abilityState?.downedUntil||0)) ent.hp = 0;
  if(ent.agent==='viper'){
    const active = Object.values(ent.abilityState.viperEmitters||{}).some(Boolean);
    const rate = active ? -15 : 5;
    ent.resources.fuel = Math.max(0, Math.min(100, (ent.resources.fuel??100) + rate*dt));
    if(ent.resources.fuel <= 0) for(const key of Object.keys(ent.abilityState.viperEmitters||{})) ent.abilityState.viperEmitters[key] = false;
  }
  if(ent.agent==='neon'){
    const sprinting = !!ent.abilityState.neonSprinting;
    ent.resources.energy = Math.max(0, Math.min(100, (ent.resources.energy??100) + (sprinting?-10:5)*dt));
    if(ent.resources.energy <= 0) ent.abilityState.neonSprinting = false;
  }
  if(ent.agent==='clove'&&ent.alive&&ent.abilityState.cloveProveUntil&&now>=ent.abilityState.cloveProveUntil){delete ent.abilityState.cloveProveUntil;ent.abilityState.forceDeath=true;}
  if(ent.agent==='yoru'&&ent.speedMul>1&&now>=((ent.abilityState?.driftUntil)||0))ent.speedMul=1;
  if(ent.agent==='reyna' && ent.armor > (ent.armorMax||0) && now >= (ent.abilityState.overhealHoldUntil||0)){
    ent.armor = Math.max(ent.armorMax||0, ent.armor - 2*dt);
  }
}
