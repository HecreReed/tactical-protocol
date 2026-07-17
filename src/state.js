const saved = (()=>{ try { return JSON.parse(localStorage.getItem('tp_settings_v2')||'{}'); } catch { return {}; } })();

export const G = {
  scene: null, camera: null, renderer: null, sun: null,
  now: 0, dt: 0,
  ents: [], player: null,
  colliders: [],      // static AABB {min,max}
  dynColliders: [],   // sage walls / barriers {min,max,until?,mesh}
  smokes: [],         // {pos,r,until,mesh}
  zones: [],          // {type,pos,r,until,dps,owner}
  turrets: [],        // 哨戒炮 {pos,yaw,team,owner,hp,nextFire,mesh,until}
  traps: [],          // 绊网 {pos,team,owner,mesh,until}
  corpses: [],
  projectiles: [],
  map: null,
  match: null,
  keys: {},
  mouse: { lmb: false, rmb: false },
  settings: Object.assign({
    sensMul: 1.0, fov: 71, volume: 0.5,
    shadows: 'high',      // off | low | high
    quality: 'high',      // low | high
    diff: 0.8,
    skin: 'default',
  }, saved),
  locked: false,
  buyOpen: false,
  menuOpen: false,
  spectatingEnt: null,
  hooks: {},
};

export function saveSettings(){
  try { localStorage.setItem('tp_settings_v2', JSON.stringify(G.settings)); } catch {}
}
export const sens = ()=> 0.0022 * G.settings.sensMul;
