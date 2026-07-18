export function commitAbility(slot, used){
  if(!used) return false;
  slot.n = Math.max(0, slot.n - 1);
  return true;
}

export function clampResource(value, min=0, max=100){
  return Math.max(min, Math.min(max, value));
}

export function extendStatus(ent, key, until){
  ent[key] = Math.max(ent[key] || 0, until);
  return ent[key];
}

export function openRecast(ent, key, { until, payload=null }){
  ent.abilityState ||= {};
  ent.abilityState[key] = { until, payload };
}

export function consumeRecast(ent, key, now){
  const recast = ent.abilityState?.[key];
  if(!recast) return null;
  delete ent.abilityState[key];
  return now <= recast.until ? recast.payload : null;
}

export function scheduleAbilityEvent(queue, at, callback, tag='ability'){
  const event = { at, callback, tag };
  queue.push(event);
  queue.sort((a,b) => a.at - b.at);
  return event;
}

export function runAbilityEvents(queue, now){
  while(queue.length && queue[0].at <= now){
    queue.shift().callback();
  }
}
