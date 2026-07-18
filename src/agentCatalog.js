const slot = (id, key, name, type, cost, max, start, cd=0, extra={}) => ({
  name, type, impl:`${id}-${key}-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`,
  cost, max, start, cd, icon:`./assets/agents/${id}/${key}.png`, ...extra,
});

const agent = (id, name, role, color, ultCost, desc, abilities) => ({
  name, role, color, ultCost, desc, portrait:`./assets/agents/${id}/portrait.webp`,
  ab: {
    c: slot(id, 'c', ...abilities.c),
    q: slot(id, 'q', ...abilities.q),
    e: slot(id, 'e', ...abilities.e),
    x: slot(id, 'x', ...abilities.x),
  },
});

export const AGENTS = {
  astra: agent('astra','Astra','Controller',0x7f66d9,7,'Harness the cosmos with reusable stars.',{
    c:['Gravity Well','astraGravity',150,1,1], q:['Nova Pulse','astraNova',150,1,1],
    e:['Nebula / Dissipate','astraNebula',0,2,2,25,{free:true}], x:['Astral Form / Cosmic Divide','astraDivide',0,1,0,0,{free:true}],
  }),
  breach: agent('breach','Breach','Initiator',0xd8a75a,9,'Blast through terrain to disrupt entrenched enemies.',{
    c:['Aftershock','quake',200,1,1], q:['Flashpoint','wallFlash',250,2,1],
    e:['Fault Line','stunWave',0,1,1,40,{free:true}], x:['Rolling Thunder','bigStun',0,1,0,0,{free:true}],
  }),
  brimstone: agent('brimstone','Brimstone','Controller',0xf5c56b,8,'Deliver precise orbital utility from a tactical map.',{
    c:['Stim Beacon','stimBeacon',200,1,1], q:['Incendiary','molly',250,1,1],
    e:['Sky Smoke','smokeSky',0,3,3,19.25,{free:true}], x:['Orbital Strike','orbital',0,1,0,0,{free:true}],
  }),
  chamber: agent('chamber','Chamber','Sentinel',0xd8b45a,8,'Hold long angles with bespoke weapons and a teleport anchor.',{
    c:['Trademark','tripwire',200,1,1], q:['Headhunter','headhunter',100,8,0],
    e:['Rendezvous','chamberRendezvous',0,1,1,30,{free:true}], x:['Tour De Force','tourdeforce',0,1,0,0,{free:true}],
  }),
  clove: agent('clove','Clove','Controller',0xe48ac5,8,'Fight beyond death with smokes, decay, and a self-revive.',{
    c:['Pick-me-up','clovePickMeUp',200,1,1], q:['Meddle','cloveMeddle',250,1,1],
    e:['Ruse','cloveRuse',0,2,2,30,{free:true}], x:['Not Dead Yet','cloveRevive',0,1,0,0,{free:true}],
  }),
  cypher: agent('cypher','Cypher','Sentinel',0xd8d0b8,6,'Watch the map through traps, cages, and a remote camera.',{
    c:['Trapwire','tripwire',200,2,1], q:['Cyber Cage','cage',100,2,1],
    e:['Spycam','cypherSpycam',0,1,1,30,{free:true}], x:['Neural Theft','cypherNeuralTheft',0,1,0,0,{free:true}],
  }),
  deadlock: agent('deadlock','Deadlock','Sentinel',0xe0b8c8,7,'Fortify sites with reactive sensors and nanowire.',{
    c:['GravNet','deadlockGravNet',200,1,1], q:['Sonic Sensor','deadlockSensor',200,2,1],
    e:['Barrier Mesh','deadlockBarrier',0,1,1,40,{free:true}], x:['Annihilation','deadlockAnnihilation',0,1,0,0,{free:true}],
  }),
  fade: agent('fade','Fade','Initiator',0x6a5acd,8,'Track enemies with nightmares, tethers, and prowlers.',{
    c:['Prowler','fadeProwler',250,2,1], q:['Seize','fadeSeize',200,1,1],
    e:['Haunt','fadeHaunt',0,1,1,40,{free:true}], x:['Nightfall','nightfall',0,1,0,0,{free:true}],
  }),
  gekko: agent('gekko','Gekko','Initiator',0x8bd450,7,'Deploy a reclaimable crew of creatures.',{
    c:['Mosh Pit','gekkoMosh',250,1,1], q:['Wingman','gekkoWingman',300,1,1],
    e:['Dizzy','gekkoDizzy',0,1,1,10,{free:true}], x:['Thrash','gekkoThrash',0,1,0,0,{free:true}],
  }),
  harbor: agent('harbor','Harbor','Controller',0x3fa8a0,7,'Shape water into moving cover and concussive waves.',{
    c:['Storm Surge','harborStormSurge',200,1,1], q:['High Tide','harborHighTide',300,1,1],
    e:['Cove','harborCove',0,1,1,40,{free:true}], x:['Reckoning','harborReckoning',0,1,0,0,{free:true}],
  }),
  iso: agent('iso','Iso','Duelist',0x6d5dfc,7,'Create isolated duels and convert kills into shields.',{
    c:['Contingency','isoContingency',250,1,1], q:['Undercut','isoUndercut',200,1,1],
    e:['Double Tap','isoDoubleTap',0,1,1,20,{free:true}], x:['Kill Contract','isoKillContract',0,1,0,0,{free:true}],
  }),
  jett: agent('jett','Jett','Duelist',0x8fd3ff,8,'Take space with wind-powered movement and knives.',{
    c:['Cloudburst','smokeProj',200,2,1], q:['Updraft','updraft',150,2,1],
    e:['Tailwind','jettTailwind',0,1,1,0,{free:true}], x:['Blade Storm','knifeUlt',0,1,0,0,{free:true}],
  }),
  kayo: agent('kayo','KAY/O','Initiator',0x9fb4ff,8,'Suppress enemy technology and lead explosive entries.',{
    c:['FRAG/ment','fragNade',200,1,1], q:['FLASH/drive','flash',250,2,1],
    e:['ZERO/point','suppressNade',0,1,1,40,{free:true}], x:['NULL/cmd','kayoNullCmd',0,1,0,0,{free:true}],
  }),
  killjoy: agent('killjoy','Killjoy','Sentinel',0xffd447,9,'Lock down territory with recallable autonomous devices.',{
    c:['Nanoswarm','nanoSwarm',200,2,1], q:['ALARMBOT','alarmBot',200,1,1],
    e:['TURRET','turret',0,1,1,0,{free:true}], x:['Lockdown','lockdown',0,1,0,0,{free:true}],
  }),
  miks: agent('miks','Miks','Controller',0xe562a7,8,'Coordinate the team with smoke and sonic energy.',{
    c:['M-pulse','miksPulse',200,1,1], q:['Harmonize','miksHarmonize',200,1,1],
    e:['Waveform','miksWaveform',0,2,2,30,{free:true}], x:['Bassquake','miksBassquake',0,1,0,0,{free:true}],
  }),
  neon: agent('neon','Neon','Duelist',0x58b8ff,8,'Spend energy to sprint, slide, and fire a lightning beam.',{
    c:['Fast Lane','neonFastLane',300,1,1], q:['Relay Bolt','neonRelayBolt',200,2,1],
    e:['High Gear','neonHighGear',0,1,1,0,{free:true}], x:['Overdrive','neonOverdrive',0,1,0,0,{free:true}],
  }),
  omen: agent('omen','Omen','Controller',0x8a6fd8,7,'Blind through walls and teleport between shadows.',{
    c:['Shrouded Step','shadowStep',100,2,1], q:['Paranoia','paranoia',250,1,1],
    e:['Dark Cover','smokeSky',0,2,2,30,{free:true}], x:['From the Shadows','shadowUlt',0,1,0,0,{free:true}],
  }),
  phoenix: agent('phoenix','Phoenix','Duelist',0xff7a30,6,'Curve flashes, heal in fire, and return from death.',{
    c:['Blaze','firewall',150,1,1], q:['Curveball','flash',250,2,1],
    e:['Hot Hands','hotHands',0,1,1,0,{free:true}], x:['Run it Back','phoenixRunItBack',0,1,0,0,{free:true}],
  }),
  raze: agent('raze','Raze','Duelist',0xff9a3d,8,'Clear space with mobile explosives and cluster damage.',{
    c:['Boom Bot','boomBot',300,1,1], q:['Blast Pack','razeBlastPack',200,2,1],
    e:['Paint Shells','bignade',0,1,1,0,{free:true}], x:['Showstopper','rocketUlt',0,1,0,0,{free:true}],
  }),
  reyna: agent('reyna','Reyna','Duelist',0xc45ad0,6,'Consume soul orbs to heal or become intangible.',{
    c:['Leer','reynaLeer',250,2,1], q:['Devour','reynaDevour',200,2,1],
    e:['Dismiss','reynaDismiss',0,2,1,0,{free:true}], x:['Empress','empress',0,1,0,0,{free:true}],
  }),
  sage: agent('sage','Sage','Sentinel',0xe8e6da,8,'Protect allies with healing, barriers, and resurrection.',{
    c:['Barrier Orb','wall',400,1,1], q:['Slow Orb','slowProj',200,2,1],
    e:['Healing Orb','heal',0,1,1,40,{free:true}], x:['Resurrection','rez',0,1,0,0,{free:true}],
  }),
  skye: agent('skye','Skye','Initiator',0x9fe08a,8,'Guide controllable creatures and channel team healing.',{
    c:['Regrowth','skyeRegrowth',200,1,1], q:['Trailblazer','skyeTrailblazer',250,1,1],
    e:['Guiding Light','skyeGuidingLight',0,2,2,40,{free:true}], x:['Seekers','seekers',0,1,0,0,{free:true}],
  }),
  sova: agent('sova','Sova','Initiator',0x69c77e,8,'Scout with a drone and expose enemies with recon arrows.',{
    c:['Owl Drone','sovaDrone',400,1,1], q:['Shock Bolt','shock',150,2,1],
    e:['Recon Bolt','recon',0,1,1,40,{free:true}], x:["Hunter's Fury",'hunterUlt',0,1,0,0,{free:true}],
  }),
  tejo: agent('tejo','Tejo','Initiator',0xe7783f,8,'Deliver map-targeted missiles and remote reconnaissance.',{
    c:['Stealth Drone','tejoDrone',300,1,1], q:['Special Delivery','tejoDelivery',200,1,1],
    e:['Guided Salvo','tejoSalvo',0,1,1,40,{free:true}], x:['Armageddon','tejoArmageddon',0,1,0,0,{free:true}],
  }),
  veto: agent('veto','Veto','Sentinel',0x55b77a,7,'Destroy hostile utility and mutate beyond debuffs.',{
    c:['Crosscut','vetoCrosscut',200,1,1], q:['Chokehold','vetoChokehold',200,1,1],
    e:['Interceptor','vetoInterceptor',0,1,1,40,{free:true}], x:['Evolution','vetoEvolution',0,1,0,0,{free:true}],
  }),
  viper: agent('viper','Viper','Controller',0x59d97f,9,'Spend fuel to maintain a toxic screen and poison cloud.',{
    c:['Snake Bite','acidPool',200,2,1], q:['Poison Cloud','toxicSmoke',200,1,1],
    e:['Toxic Screen','toxicWall',0,1,1,0,{free:true}], x:["Viper's Pit",'toxicDome',0,1,0,0,{free:true}],
  }),
  vyse: agent('vyse','Vyse','Sentinel',0xb88de8,8,'Set hidden metal traps that isolate and disarm enemies.',{
    c:['Razorvine','vyseRazorvine',150,2,1], q:['Shear','vyseShear',200,1,1],
    e:['Arc Rose','vyseArcRose',0,1,1,20,{free:true}], x:['Steel Garden','vyseSteelGarden',0,1,0,0,{free:true}],
  }),
  waylay: agent('waylay','Waylay','Duelist',0xf2d25c,8,'Burst through space and snap back to a light anchor.',{
    c:['Saturate','waylaySaturate',200,1,1], q:['Lightspeed','waylayLightspeed',200,2,1],
    e:['Refract','waylayRefract',0,1,1,30,{free:true}], x:['Convergent Paths','waylayConvergent',0,1,0,0,{free:true}],
  }),
  yoru: agent('yoru','Yoru','Duelist',0x4169e1,7,'Misdirect enemies with decoys, flashes, and dimensional travel.',{
    c:['FAKEOUT','yoruFakeout',100,1,1], q:['BLINDSIDE','yoruBlindside',250,2,1],
    e:['GATECRASH','yoruGatecrash',0,1,1,30,{free:true}], x:['DIMENSIONAL DRIFT','yoruDrift',0,1,0,0,{free:true}],
  }),
};

export const AGENT_LIST = Object.keys(AGENTS);
