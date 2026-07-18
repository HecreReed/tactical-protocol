// icons.js — 全英雄技能矢量图标（手工设计的线性图标，随主题色着色）
const P = {
  // 风影
  dash:       '<path d="M4 6l7 6-7 6"/><path d="M12 6l7 6-7 6" opacity=".55"/>',
  updraft:    '<path d="M12 20V6.5"/><path d="M6.5 12L12 6.5 17.5 12"/><path d="M4.5 20.5c2.4-1.8 4.6-1.8 7 0M12.5 20.5c2.4-1.8 4.6-1.8 7 0" opacity=".5"/>',
  smokeProj:  '<path d="M6.8 16.5a3.6 3.6 0 1 1 .7-7.1 5.2 5.2 0 0 1 10 1.3 3.4 3.4 0 0 1-1 6.6H7.5z"/><path d="M5 20h10" opacity=".45"/>',
  knifeUlt:   '<path d="M12 21V9.5L10.6 4 12 2.2 13.4 4z"/><path d="M11 13L5.6 6.8 5 3.4l2.8 1.8z" opacity=".7"/><path d="M13 13l5.4-6.2.6-3.4-2.8 1.8z" opacity=".7"/>',
  // 烈焰
  firewall:   '<path d="M3.5 20.5h17"/><path d="M6.5 20c-1.8-2.4-.4-4.8.6-6.6.6 1.3 1.6 2 1.6 2 .6-1.6 1-3.4.4-5.6 2.2 1.8 3.4 4.4 3 7.2"/><path d="M13.5 20c-.8-1.8.2-3.4 1-4.8.5 1 1.2 1.6 1.2 1.6.4-1.2.6-2.4.3-4 1.8 1.5 2.8 3.6 2.4 5.9" opacity=".65"/>',
  flash:      '<path d="M12 2.5v4.4M12 17.1v4.4M2.5 12h4.4M17.1 12h4.4M5.3 5.3l3.1 3.1M15.6 15.6l3.1 3.1M18.7 5.3l-3.1 3.1M8.4 15.6l-3.1 3.1"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/>',
  selfheal:   '<path d="M12 3.5c.9 2.7 4.5 4.6 4.5 8.2a4.5 4.5 0 0 1-9 0c0-1.8.9-3.2 2-4.6.9 1.1 2.5-1.5 2.5-3.6z"/><path d="M17.5 16.5v5M15 19h5"/>',
  phoenixUlt: '<path d="M12 21.5c0-5.5-3.6-7.4-7.5-7.4 2.8-1 4.7-2.8 4.7-5.6C11 10.3 12 11.5 12 11.5s1-1.2 2.8-3c0 2.8 1.9 4.6 4.7 5.6-3.9 0-7.5 1.9-7.5 7.4z"/><path d="M12 8V2.8M9.5 4.5L12 2l2.5 2.5" opacity=".6"/>',
  // 天穹
  molly:      '<path d="M12 3.2c1 3 4.8 5 4.8 8.8a4.8 4.8 0 0 1-9.6 0c0-1.9.9-3.4 2.2-4.9.9 1.2 2.6-1.6 2.6-3.9z"/><path d="M12 18.5a2.6 2.6 0 0 0 2.4-3.6" opacity=".6"/>',
  stim:       '<path d="M8.5 20.5l-5-5L13 6l5 5-9.5 9.5z"/><path d="M14.5 4.5l5 5M17 2l5 5M5.5 17.5L3 20M10 12l2 2"/>',
  smokeSky:   '<path d="M7.2 9.5a3 3 0 1 1 .6-5.9 4.5 4.5 0 0 1 8.5 1.1 3 3 0 0 1-.4 5.9H7.6z"/><path d="M12 12.5v8M8.6 17.3l3.4 3.2 3.4-3.2"/>',
  orbital:    '<path d="M12 2.5v5.5"/><path d="M9.8 5.5L12 8l2.2-2.5" opacity=".7"/><circle cx="12" cy="15" r="5.2"/><circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M5 15H3.2M20.8 15H19M12 21.8V20" opacity=".6"/>',
  // 暗幕
  paranoia:   '<path d="M2.8 12S6.3 6.8 12 6.8 21.2 12 21.2 12 17.7 17.2 12 17.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.4"/><path d="M4.5 19.5l15-15"/>',
  shadowStep: '<circle cx="6" cy="16.5" r="2.6" opacity=".45"/><circle cx="17.2" cy="7.8" r="2.6"/><path d="M8.2 14.4l6.8-4.8" stroke-dasharray="2.2 2.2"/>',
  shadowUlt:  '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5" opacity=".65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  // 猎鹰
  recon:      '<path d="M12 21.5V10"/><path d="M9 13l3-3 3 3"/><path d="M7.5 7a6.4 6.4 0 0 1 9 0" opacity=".65"/><path d="M4.8 4.2a10.2 10.2 0 0 1 14.4 0" opacity=".35"/>',
  shock:      '<path d="M13.5 2.5L6 13.5h4.8L8.6 21.5l7.6-11.4h-4.8l2.1-7.6z"/>',
  pulse:      '<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="5.6" opacity=".7"/><circle cx="12" cy="12" r="9.2" opacity=".35"/>',
  hunterUlt:  '<path d="M2.5 12h16M15 8l4.5 4-4.5 4"/><circle cx="8.5" cy="12" r="3.2" opacity=".65"/>',
  // 圣愈
  wall:       '<rect x="3.5" y="8.5" width="4.4" height="11.5" rx="1"/><rect x="9.8" y="5" width="4.4" height="15" rx="1"/><rect x="16.1" y="8.5" width="4.4" height="11.5" rx="1"/>',
  slowProj:   '<circle cx="12" cy="12" r="7.5" opacity=".5"/><path d="M12 5.5v13M6.4 8.8l11.2 6.4M17.6 8.8L6.4 15.2"/>',
  heal:       '<circle cx="12" cy="12" r="8.8" opacity=".5"/><path d="M12 6.5v11M6.5 12h11"/>',
  rez:        '<path d="M12 20.8s-6.8-4.4-6.8-9.6a3.9 3.9 0 0 1 6.8-2.6 3.9 3.9 0 0 1 6.8 2.6c0 5.2-6.8 9.6-6.8 9.6z"/><path d="M12 5.8V1.6M10 3.4l2-1.8 2 1.8" opacity=".7"/>',
  // 雷奕
  nade:       '<circle cx="12" cy="14" r="5.8"/><path d="M12 8.2V5.6h3.6"/><path d="M17.8 3.2a1.7 1.7 0 1 1-1.2 3" opacity=".7"/>',
  bignade:    '<circle cx="12" cy="13" r="6.4"/><path d="M12 6.6V4.4"/><circle cx="4.5" cy="19.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="19.5" cy="19.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="19.8" cy="6" r="1.2" fill="currentColor" stroke="none" opacity=".7"/>',
  blastjump:  '<path d="M12 16.5V4.5M8 8.5l4-4 4 4"/><path d="M5.5 21l2-2.8M18.5 21l-2-2.8M12 21.5v-2.7" opacity=".7"/>',
  rocketUlt:  '<path d="M12 2.2c3 2.4 4 5.8 4 8.8l-4 4.4-4-4.4c0-3 1-6.4 4-8.8z"/><circle cx="12" cy="8.8" r="1.5"/><path d="M8.4 14.6L6.2 20l3.6-1.8M15.6 14.6l2.2 5.4-3.6-1.8" opacity=".7"/>',
  // 蛛影
  tripwire:   '<path d="M5 21V8.5M19 21V8.5"/><path d="M5 12.5h3.2l2.2 2.4 2.6-3.4 2.4 2.4H19" opacity=".8"/><circle cx="5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="19" cy="7" r="1.1" fill="currentColor" stroke="none"/>',
  turret:     '<rect x="7" y="9.5" width="9" height="6.5" rx="1.2"/><path d="M16 12.2h5.5"/><path d="M8.5 16l-3.2 5.2M14.5 16l3.2 5.2"/><circle cx="11" cy="12.8" r="1.3" fill="currentColor" stroke="none"/>',
  cage:       '<path d="M6.8 15a3.6 3.6 0 1 1 .7-7.1 5.2 5.2 0 0 1 10 1.3 3.4 3.4 0 0 1-1 6.4H7.5z" opacity=".6"/><path d="M7.5 8v13M12 8.5v12.5M16.5 8v13"/>',
  revealAll:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18" opacity=".6"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  // 岚切
  quake:      '<path d="M3 20.5h18"/><path d="M12 20.5l-2.4-4.4 3.2-2.8-2.2-3.2 3-4.6"/><path d="M6.5 17.5l-1.4-1.8M18 17.8l1.2-2" opacity=".6"/>',
  wallFlash:  '<path d="M9 3.5v17" opacity=".8"/><path d="M13 12h8.5M13 7.5l6.5-3M13 16.5l6.5 3" opacity=".9"/><circle cx="13" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  stunWave:   '<circle cx="12" cy="8.2" r="2.1" fill="currentColor" stroke="none"/><path d="M8.2 13.6a5.4 5.4 0 0 1 7.6 0"/><path d="M5.8 16.8a9 9 0 0 1 12.4 0" opacity=".6"/><path d="M3.6 20.2a12.6 12.6 0 0 1 16.8 0" opacity=".3"/>',
  bigStun:    '<path d="M12.8 2.5L7.5 11h3.8L9.6 18l6.6-8.8h-3.8l1.6-6.7z"/><path d="M4 19.6a11 11 0 0 1 6-3.2M20 19.6a11 11 0 0 0-4.6-3" opacity=".55"/>',
  // 青鸩
  toxicSmoke: '<path d="M6.8 15.5a3.6 3.6 0 1 1 .7-7.1 5.2 5.2 0 0 1 10 1.3 3.4 3.4 0 0 1-1 6.6H7.5z"/><circle cx="10" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="11.5" r="1" fill="currentColor" stroke="none"/><path d="M10.6 14h2.8" opacity=".8"/>',
  acidPool:   '<path d="M12 3.5c1.8 2.6 4.2 5.2 4.2 8a4.2 4.2 0 0 1-8.4 0c0-2.8 2.4-5.4 4.2-8z"/><path d="M4 20.5c2.6-1.6 5.2 1.4 8 0s5.4 1.4 8 0" opacity=".7"/>',
  toxicWall:  '<rect x="3.2" y="7.5" width="4.6" height="13" rx="2.3"/><rect x="9.7" y="4" width="4.6" height="16.5" rx="2.3"/><rect x="16.2" y="7.5" width="4.6" height="13" rx="2.3"/>',
  toxicDome:  '<path d="M4 17.5a8 8 0 0 1 16 0"/><path d="M2.8 17.5h18.4"/><path d="M8 17.5v2.6M12 17.5v3.6M16 17.5v2.6" opacity=".6"/>',
  // 复刻原版新增
  hotHands:   '<path d="M12 3.5c.9 2.7 4.5 4.6 4.5 8.2a4.5 4.5 0 0 1-9 0c0-1.8.9-3.2 2-4.6.9 1.1 2.5-1.5 2.5-3.6z"/><path d="M9.5 19.5h5M12 17v5" opacity=".8"/>',
  stimBeacon: '<path d="M12 21v-8"/><circle cx="12" cy="9.5" r="2.4" fill="currentColor" stroke="none"/><path d="M7 14a7 7 0 0 1 0-9M17 14a7 7 0 0 0 0-9" opacity=".6"/><path d="M4.5 16.5a10.5 10.5 0 0 1 0-14M19.5 16.5a10.5 10.5 0 0 0 0-14" opacity=".3"/>',
  droneScan:  '<rect x="8.5" y="9" width="7" height="5" rx="1.4"/><path d="M8.5 11.5H3.5M15.5 11.5h5M5.5 9.5v4M18.5 9.5v4"/><circle cx="12" cy="11.5" r="1.1" fill="currentColor" stroke="none"/><path d="M9 17.5a4.5 4.5 0 0 0 6 0" opacity=".6"/>',
  boomBot:    '<rect x="6" y="8" width="12" height="7" rx="2"/><circle cx="9" cy="17.5" r="2"/><circle cx="15" cy="17.5" r="2"/><path d="M12 8V5.5M10.5 5.5h3" opacity=".8"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/>',
  nanoSwarm:  '<circle cx="12" cy="15" r="4.5"/><circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none"/><path d="M8 8.5L10.5 12M12 6.5V10.5M16 8.5L13.5 12" opacity=".55"/>',
  alarmBot:   '<rect x="8" y="10" width="8" height="7" rx="1.4"/><path d="M10 17v3M14 17v3M12 10V7.5"/><circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none"/><path d="M7.5 4.5a6 6 0 0 1 9 0" opacity=".55"/>',
  lockdown:   '<rect x="7" y="11" width="10" height="8" rx="1.5"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="9.5" opacity=".3"/>',
  // 零式
  suppressNade:'<path d="M12 3.6l8.4 8.4-8.4 8.4-8.4-8.4z" opacity=".8"/><path d="M5.2 5.2l13.6 13.6"/>',
  fragNade:   '<circle cx="12" cy="13.5" r="5.6"/><path d="M12 7.9V5.4h3.4"/><path d="M7 6.2l1.8 1.8M17.6 18.4l1.6 1.6M5 15.5H2.8" opacity=".6"/>',
  nullPulse:  '<circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="8.4" opacity=".4"/><path d="M9.7 9.7l4.6 4.6M14.3 9.7l-4.6 4.6"/>',
  // 魅影
  devour:     '<path d="M12 20.5s-7-4.4-7-9.8A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7c0 5.4-7 9.8-7 9.8z"/><path d="M12 8V3M9.8 5.2L12 3l2.2 2.2" opacity=".7"/>',
  dismiss:    '<circle cx="7" cy="12" r="3.2" opacity=".4"/><circle cx="15.5" cy="12" r="3.2" opacity=".7"/><path d="M10 12h8.5M16 9.5l2.5 2.5-2.5 2.5"/>',
  empress:    '<path d="M4.5 18.5h15"/><path d="M4.5 18.5L3 8l5 4 4-7 4 7 5-4-1.5 10.5z"/><circle cx="12" cy="13.5" r="1.3" fill="currentColor" stroke="none"/>',
  // 灵愈
  seekers:    '<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5" opacity=".8"/><path d="M12 19.5A7.5 7.5 0 0 1 4.5 12" opacity=".8"/><path d="M17 15.5l3.5 3.5M7 8.5L3.5 5" opacity=".55"/>',
  // 新英雄
  headhunter: '<circle cx="12" cy="13" r="4.2"/><path d="M12 8.8V6.2h2.5"/><path d="M16 3.8a.9.9 0 0 1-1.8 0h1.8z" opacity=".7"/><circle cx="12" cy="13" r=".8" fill="currentColor" stroke="none"/>',
  tourdeforce:'<path d="M4.5 18.5h15"/><path d="M12 18.5V7"/><circle cx="12" cy="12" r="5.5"/><path d="M7.5 9.5l5.5-5.5 5.5 5.5" opacity=".6"/><circle cx="12" cy="4.5" r=".8" fill="currentColor" stroke="none"/>',
  nightfall:  '<path d="M4 19h16"/><circle cx="12" cy="10" r="6.5"/><circle cx="12" cy="10" r="0.7" fill="currentColor" stroke="none"/><path d="M12 2.8V.4M17.2 5.2L18.8 3.6M6.8 5.2L5.2 3.6" opacity=".6"/>',
  cocoon:     '<ellipse cx="12" cy="14" rx="5.5" ry="7"/><path d="M7.5 10.5a4.5 4.5 0 0 1 9 0"/><path d="M9 7.8l1.2-1M15 7.8l-1.2-1M5.5 14h13M5.5 16h13M5.5 18h13" opacity=".6"/>',
};

const FALLBACK = '<circle cx="12" cy="12" r="7"/>';

export function abilityIcon(defOrType, cls=''){
  if(typeof defOrType==='object' && defOrType?.icon){
    return `<img class="abIcon ${cls}" src="${defOrType.icon}" alt="" loading="lazy">`;
  }
  const t = typeof defOrType === 'string' ? defOrType : (defOrType?.icon || defOrType?.type);
  return `<svg class="abIcon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[t]||FALLBACK}</svg>`;
}
