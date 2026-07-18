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
  if(ent.agent==='reyna') ent.resources.soulOrbs = [];
  if(ent.agent==='astra') ent.resources.stars = 4;
  if(ent.agent==='skye') ent.resources.regrowth = 100;
  if(ent.agent==='raze') ent.resources.paintKills = 0;
  if(ent.agent==='gekko') ent.resources.globules = {};
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
  if(killer.agent==='neon') killer.resources.energy = Math.min(100, (killer.resources.energy||0)+25);
  if(killer.agent==='iso' && now < (killer.abilityState?.doubleTapUntil||0)) killer.abilityState.isoShield = true;
  if(killer.agent==='clove') killer.abilityState.pickMeUpUntil = now + 10;
  if(killer.agent==='miks' && now < (killer.abilityState?.harmonizeUntil||0)) killer.abilityState.harmonizeUntil = now + 10;
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
  if(ent.agent==='reyna' && ent.armor > (ent.armorMax||0) && now >= (ent.abilityState.overhealHoldUntil||0)){
    ent.armor = Math.max(ent.armorMax||0, ent.armor - 2*dt);
  }
}
