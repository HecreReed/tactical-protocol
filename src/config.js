import { AGENTS as OFFICIAL_AGENTS, AGENT_LIST as OFFICIAL_AGENT_LIST } from './agentCatalog.js';

export const ECONOMY = {
  max: 9000, start: 800, kill: 200, plant: 300, win: 3000,
  lossBonus: [1900, 2400, 2900],
  startAfterSwap: 800,
};

export const L_ARMOR_COST = 400, L_ARMOR_HP = 25, H_ARMOR_COST = 1000, H_ARMOR_HP = 50;
export const ARMOR_ABSORB = 0.66;

export const DIFFICULTIES = [
  { id:'easy',   name:'新手',   diff:0.55 },
  { id:'normal', name:'常规',   diff:0.8 },
  { id:'hard',   name:'困难',   diff:1.0 },
  { id:'elite',  name:'天梯',   diff:1.25 },
];

export const SKINS = [
  { id:'default', name:'制式',   body:0x222a33, accent:0x5a6a75, glow:0x000000, tracer:0xffe9a0 },
  { id:'ice',     name:'玄冰',   body:0x16283c, accent:0x9fd8ff, glow:0x2f7fd0, tracer:0x9fd8ff },
  { id:'magma',   name:'熔核',   body:0x2a1512, accent:0xff7a30, glow:0xcc2810, tracer:0xffb060 },
  { id:'gold',    name:'鎏金',   body:0x35290f, accent:0xf5c56b, glow:0x8f6a18, tracer:0xffe080 },
  { id:'jade',    name:'翡翠',   body:0x102418, accent:0x58e0a0, glow:0x1d8f56, tracer:0x80ffc0 },
  { id:'prism',   name:'棱彩',   body:0x1c1430, accent:0xc080ff, glow:0x7030d0, tracer:0xd0a0ff, rainbow:true },
];

export const WEAPONS = [
  { id:'classic',    cat:'pistol', cost:0,  mag:12, res:36, fi:0.148, rl:1.75,
    dmg:{0:{h:78,b:26,l:22}, 20:{h:66,b:22,l:18}, 50:{h:48,b:16,l:13}},
    spread:{base:1.4,mv:0.8,bloom:1.9}, recoil:{perShot:8,cap:70,wander:1.8,decay:35},
    ads:{fov:60,spread:0.7,mv:0.6,recoil:0.75}, vm:{x:.18,y:-.16,z:-.32,sc:.04,rot:[0,0,.06]}, name:'Classic', alt:false },
  { id:'ghost',      cat:'pistol', cost:500,mag:15,res:45, fi:0.148,rl:1.8,
    dmg:{0:{h:105,b:30,l:25}, 30:{h:88,b:25,l:21}, 50:{h:74,b:21,l:17}},
    spread:{base:1.1,mv:0.6,bloom:1.6}, recoil:{perShot:9,cap:80,wander:1.6,decay:32},
    ads:{fov:60,spread:0.7,mv:0.6,recoil:0.75}, vm:{x:.18,y:-.15,z:-.32,sc:.04,rot:[0,0,.04]}, name:'Ghost', alt:false },
  { id:'sheriff',    cat:'pistol', cost:800,mag:6, res:18, fi:0.4,  rl:2.3,
    dmg:{0:{h:159,b:55,l:46}, 30:{h:145,b:50,l:42}, 50:{h:120,b:42,l:35}},
    spread:{base:0.9,mv:1.2,bloom:2.1}, recoil:{perShot:22,cap:180,wander:3,decay:28},
    ads:{fov:55,spread:0.65,mv:0.55,recoil:0.7}, vm:{x:.18,y:-.14,z:-.33,sc:.042,rot:[0,0,.05]}, name:'Sheriff', alt:false },
  { id:'frenzy',     cat:'pistol', cost:450,mag:13,res:39, fi:0.1,  rl:1.9,
    dmg:{0:{h:78,b:26,l:22}, 20:{h:63,b:21,l:17}, 50:{h:45,b:15,l:12}},
    spread:{base:2.5,mv:0.8,bloom:1.9}, recoil:{perShot:10,cap:90,wander:2.2,decay:30},
    ads:{fov:60,spread:0.65,mv:0.55,recoil:0.75}, vm:{x:.18,y:-.15,z:-.31,sc:.038,rot:[0,0,.03]}, name:'Frenzy', alt:true },
  { id:'stinger',    cat:'smg',   cost:950,mag:20,res:60, fi:0.0625,rl:2.0,
    dmg:{0:{h:67,b:27,l:22}, 20:{h:57,b:23,l:19}, 50:{h:43,b:17,l:14}},
    spread:{base:2.9,mv:1.2,bloom:1.4}, recoil:{perShot:12,cap:120,wander:3,decay:26},
    ads:{fov:60,spread:0.65,mv:0.55,recoil:0.75}, vm:{x:.18,y:-.15,z:-.36,sc:.045,rot:[0,0,.07]}, name:'Stinger', alt:true },
  { id:'spectre',    cat:'smg',   cost:1600,mag:30,res:90, fi:0.075, rl:2.2,
    dmg:{0:{h:78,b:26,l:22}, 20:{h:66,b:22,l:18}, 50:{h:48,b:16,l:13}},
    spread:{base:2.4,mv:1.1,bloom:1.4}, recoil:{perShot:10,cap:110,wander:2.8,decay:28},
    ads:{fov:60,spread:0.65,mv:0.55,recoil:0.75}, vm:{x:.18,y:-.15,z:-.38,sc:.048,rot:[0,0,.06]}, name:'Spectre', alt:true },
  { id:'bucky',      cat:'shotgun',cost:850, mag:5, res:10, fi:0.9,  rl:2.5,
    dmg:{0:{h:40,b:20,l:18}, 8:{h:34,b:17,l:15}, 12:{h:20,b:10,l:9}},
    spread:{base:3.5,mv:1.0,bloom:1.2}, recoil:{perShot:14,cap:90,wander:2,decay:40}, pellets:15,
    ads:{fov:60,spread:0.55,mv:0.6,recoil:0.7}, vm:{x:.18,y:-.14,z:-.37,sc:.05,rot:[0,0,.08]}, name:'Bucky', alt:false },
  { id:'judge',      cat:'shotgun', cost:1850,mag:7, res:21, fi:0.45, rl:2.6,
    dmg:{0:{h:34,b:17,l:14}, 8:{h:28,b:14,l:11}, 12:{h:17,b:8,l:7}},
    spread:{base:4.2,mv:1.0,bloom:1.0}, recoil:{perShot:13,cap:80,wander:2.5,decay:38}, pellets:12,
    ads:{fov:60,spread:0.55,mv:0.6,recoil:0.7}, vm:{x:.18,y:-.14,z:-.38,sc:.052,rot:[0,0,.07]}, name:'Judge', alt:true },
  { id:'bulldog',    cat:'rifle',  cost:2050,mag:24,res:72, fi:0.105, rl:2.5,
    dmg:{0:{h:115,b:35,l:29}, 30:{h:110,b:33,l:28}, 50:{h:90,b:27,l:22}},
    spread:{base:1.6,mv:1.2,bloom:1.5}, recoil:{perShot:16,cap:180,wander:2.2,decay:30},
    ads:{fov:56,spread:0.55,mv:0.55,recoil:0.7}, vm:{x:.18,y:-.15,z:-.42,sc:.05,rot:[0,0,.05]}, name:'Bulldog', alt:false },
  { id:'guardian',   cat:'rifle',  cost:2250,mag:12,res:36, fi:0.165, rl:2.5,
    dmg:{0:{h:195,b:65,l:49}, 30:{h:185,b:62,l:46}, 50:{h:150,b:50,l:38}},
    spread:{base:0.8,mv:1.5,bloom:2.0}, recoil:{perShot:24,cap:240,wander:3,decay:25},
    ads:{fov:55,spread:0.45,mv:0.55,recoil:0.65}, vm:{x:.18,y:-.14,z:-.44,sc:.048,rot:[0,0,.04]}, name:'Guardian', alt:false },
  { id:'phantom',    cat:'rifle',  cost:2900,mag:30,res:90, fi:0.09,  rl:2.6,
    dmg:{0:{h:156,b:39,l:33}, 15:{h:140,b:35,l:29}, 30:{h:124,b:31,l:26}, 50:{h:105,b:26,l:22}},
    spread:{base:1.5,mv:1.2,bloom:1.5}, recoil:{perShot:18,cap:210,wander:2.5,decay:28},
    ads:{fov:58,spread:0.55,mv:0.6,recoil:0.72}, vm:{x:.18,y:-.15,z:-.45,sc:.052,rot:[0,0,.04]}, name:'Phantom', alt:true },
  { id:'vandal',     cat:'rifle',  cost:2900,mag:25,res:75, fi:0.11,  rl:2.6,
    dmg:{0:{h:160,b:40,l:34}, 20:{h:160,b:40,l:34}, 50:{h:140,b:35,l:29}},
    spread:{base:1.4,mv:1.3,bloom:1.6}, recoil:{perShot:20,cap:230,wander:2.8,decay:27},
    ads:{fov:58,spread:0.55,mv:0.6,recoil:0.7}, vm:{x:.18,y:-.15,z:-.44,sc:.05,rot:[0,0,.04]}, name:'Vandal', alt:true },
  { id:'marshal',    cat:'sniper', cost:950, mag:5, res:15, fi:1.5,  rl:2.4,
    dmg:{0:{h:202,b:101,l:85}, 50:{h:180,b:90,l:76}},
    spread:{base:0.4,mv:3.0,bloom:3.5}, recoil:{perShot:50,cap:300,wander:5,decay:20},
    ads:{fov:22,spread:0.12,mv:0.45,recoil:0.55,scope:true}, vm:{x:.18,y:-.14,z:-.46,sc:.055,rot:[0,0,.03]}, name:'Marshal', alt:false },
  { id:'operator',   cat:'sniper', cost:4700,mag:5, res:15, fi:1.5,  rl:3.5,
    dmg:{0:{h:255,b:150,l:120}, 50:{h:240,b:140,l:110}},
    spread:{base:0.3,mv:4.0,bloom:5.0}, recoil:{perShot:70,cap:400,wander:6,decay:16},
    ads:{fov:17,spread:0.08,mv:0.4,recoil:0.5,scope:true}, vm:{x:.18,y:-.14,z:-.49,sc:.06,rot:[0,0,.02]}, name:'Operator', alt:false },
  { id:'ares',       cat:'heavy',  cost:1600,mag:50,res:150, fi:0.077, rl:3.0,
    dmg:{0:{h:72,b:30,l:25}, 30:{h:67,b:28,l:23}, 50:{h:55,b:23,l:19}},
    spread:{base:2.6,mv:1.4,bloom:1.2}, recoil:{perShot:8,cap:100,wander:3.5,decay:24},
    ads:{fov:58,spread:0.4,mv:0.5,recoil:0.6}, vm:{x:.18,y:-.14,z:-.45,sc:.058,rot:[0,0,.08]}, name:'Ares', alt:true },
  { id:'odin',       cat:'heavy',  cost:3200,mag:100,res:200, fi:0.065,rl:3.4,
    dmg:{0:{h:95,b:38,l:32}, 30:{h:85,b:34,l:28}, 50:{h:70,b:28,l:23}},
    spread:{base:2.2,mv:1.5,bloom:1.1}, recoil:{perShot:7,cap:90,wander:3.2,decay:26},
    ads:{fov:58,spread:0.35,mv:0.5,recoil:0.6}, vm:{x:.18,y:-.14,z:-.47,sc:.06,rot:[0,0,.07]}, name:'Odin', alt:true },
  { id:'knife',      cat:'melee',  cost:0,  mag:-1, res:-1, fi:0.4,  rl:0,
    dmg:{0:{h:100,b:50,l:50}}, spread:{base:0,mv:0,bloom:0}, recoil:{perShot:0,cap:0,wander:0,decay:0},
    ads:{fov:0}, vm:{x:.14,y:-.2,z:-.28,sc:.035,rot:[0.6,0,0]}, name:'刀', range:2.6, alt:false },
];

export { OFFICIAL_AGENTS as AGENTS, OFFICIAL_AGENT_LIST as AGENT_LIST };
export const WS = WEAPONS;
export const WIDE = id => WEAPONS.find(w=>w.id===id);
