const clamp01 = value => Math.max(0, Math.min(1, value));

const TEAM_ROLES = {
  atk: ['entry','trader','info','support','lurker'],
  def: ['anchor','anchor','info','support','rotator'],
};

export function assignTeamRole(index, side){
  const roles = TEAM_ROLES[side] || TEAM_ROLES.atk;
  return roles[((index % roles.length) + roles.length) % roles.length];
}

export function updateContactMemory(memory, observation, now, difficulty=.8){
  if(observation){
    const sight = observation.kind === 'sight';
    return {
      kind: observation.kind,
      sourceId: observation.sourceId ?? null,
      pos: {x:observation.pos.x, y:observation.pos.y ?? 0, z:observation.pos.z},
      observedAt: now,
      confidenceAtObservation: sight ? 1 : .58 + clamp01(difficulty)*.08,
      uncertaintyAtObservation: sight ? .25 : 2.8 - clamp01(difficulty)*.6,
      confidence: sight ? 1 : .58 + clamp01(difficulty)*.08,
      uncertainty: sight ? .25 : 2.8 - clamp01(difficulty)*.6,
    };
  }
  if(!memory) return null;
  const age = Math.max(0, now-memory.observedAt);
  const memorySeconds = (memory.kind==='sight' ? 3.2 : 2.4) + clamp01(difficulty)*2.8;
  const confidence = memory.confidenceAtObservation * Math.exp(-age/memorySeconds);
  if(confidence < .08) return null;
  const spreadRate = memory.kind==='sight' ? .42 : .85;
  return {
    ...memory,
    confidence,
    uncertainty: memory.uncertaintyAtObservation + age*spreadRate,
  };
}

export function scoreTarget({
  visible=false, distance=60, health=100, vertical=0, angularExposure=1,
  spikeAction=null, recentlyDamagedBot=false, teammateCoverage=0,
}={}){
  if(!visible) return -Infinity;
  let score = 120;
  score -= Math.min(70, distance*1.15);
  score -= Math.abs(vertical)*4;
  score += (100-Math.max(0,health))*.22;
  score += clamp01(angularExposure)*8;
  score -= Math.max(0,teammateCoverage)*11;
  if(spikeAction==='plant' || spikeAction==='defuse') score += 42;
  if(recentlyDamagedBot) score += 28;
  return score;
}

export function isReloadSafe({
  ammo=0, visibleEnemies=0, recentDamageAge=Infinity, coverDistance=Infinity,
  allyCovering=false, distanceToThreat=Infinity,
}={}){
  if(ammo <= 0) return true;
  if(visibleEnemies <= 0 && recentDamageAge > 1.2) return true;
  if(coverDistance <= 1.8) return true;
  return allyCovering && distanceToThreat >= 18 && recentDamageAge > .7;
}

export function tradeSpacing(distance){
  if(distance >= 4 && distance <= 9) return 1;
  if(distance < 4) return clamp01(distance/4);
  return clamp01(1-(distance-9)/12);
}

export function shouldGroupForRetake({aliveDefenders=1,nearbyDefenders=0,spikeTimeLeft=45}={}){
  if(aliveDefenders <= 1 || spikeTimeLeft <= 8) return true;
  return nearbyDefenders >= 1;
}

export function scoreCover({
  distance=0, threatExposure=1, teammateCrowding=0,
  protectsFromThreat=false, heightDelta=0,
}={}){
  let score = 55 - Math.max(0,distance)*2.2;
  score -= clamp01(threatExposure)*42;
  score -= Math.max(0,teammateCrowding)*18;
  score -= Math.abs(heightDelta)*4;
  if(protectsFromThreat) score += 38;
  return score;
}

export function reserveApproachLane({role='support',index=0,lanes=[],reservations=new Map()}={}){
  if(!lanes.length) return null;
  const preferred = role==='lurker' ? 'flank' : role==='info' ? 'mid' : role==='entry' || role==='trader' ? 'main' : null;
  if(preferred && lanes.includes(preferred)) return preferred;
  return lanes.reduce((best,lane)=>{
    const load = reservations.get(lane) || 0;
    const bestLoad = reservations.get(best) || 0;
    if(load !== bestLoad) return load < bestLoad ? lane : best;
    return lanes.indexOf(lane) === index%lanes.length ? lane : best;
  }, lanes[index%lanes.length]);
}

export function chooseUtilityIntent({
  enemyChanneling=false, hurt=false, safeEscape=false, retaking=false,
  contactConfidence=0, executing=false, dangerousSightline=false,
}={}){
  if(enemyChanneling) return 'deny';
  if(hurt && safeEscape) return 'escape';
  if(retaking && contactConfidence < .55) return 'info';
  if(executing && dangerousSightline) return 'cover';
  if(executing) return 'entry';
  return 'hold';
}
