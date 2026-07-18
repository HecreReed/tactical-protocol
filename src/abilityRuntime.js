export function createUtilityStore(){
  return { items:[], nextId:1 };
}

export function registerUtility(store, spec){
  const utility = {
    id:`utility-${store.nextId++}`, hp:1, active:true, recallable:false,
    radius:0, until:Infinity, pos:{x:0,y:0,z:0}, ...spec,
  };
  store.items.push(utility);
  return utility;
}

function removeUtility(store, utility, reason){
  const index = store.items.indexOf(utility);
  if(index >= 0) store.items.splice(index, 1);
  utility.active = false;
  utility.onDestroy?.(utility, reason);
  return utility;
}

export function damageUtility(store, id, amount, sourceTeam){
  const utility = store.items.find(item => item.id === id);
  if(!utility || utility.team === sourceTeam) return false;
  utility.hp -= Math.max(0, amount);
  if(utility.hp > 0) return false;
  removeUtility(store, utility, 'damage');
  return true;
}

export function recallUtility(store, id, ownerId){
  const utility = store.items.find(item => item.id === id);
  if(!utility?.recallable || utility.ownerId !== ownerId) return null;
  return removeUtility(store, utility, 'recall');
}

export function interceptProjectile(store, projectile){
  if(!projectile.interceptable) return false;
  for(const utility of store.items){
    if(!utility.active || utility.type !== 'interceptor' || utility.team === projectile.team) continue;
    const dx = utility.pos.x - projectile.pos.x;
    const dy = (utility.pos.y || 0) - (projectile.pos.y || 0);
    const dz = utility.pos.z - projectile.pos.z;
    if(dx*dx + dy*dy + dz*dz <= utility.radius*utility.radius){
      utility.onIntercept?.(projectile);
      return true;
    }
  }
  return false;
}

export function tickUtilities(store, now){
  for(let i=store.items.length-1; i>=0; i--){
    const utility = store.items[i];
    utility.update?.(utility, now);
    if(now >= utility.until) removeUtility(store, utility, 'expired');
  }
}

export function beginControl(state, owner, unit, until=Infinity){
  state.controlMode = { owner, unit, until };
  return state.controlMode;
}

export function endControl(state){
  const owner = state.controlMode?.owner || null;
  state.controlMode = null;
  return owner;
}

export function validTeleportDestination(point, { inBounds, blocked }){
  return !!point && inBounds(point) && !blocked(point);
}
