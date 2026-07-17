//  procedurally-generated 3-lane tactical maps (no dead-ends)
const LANE_L = [-34, -22];
const LANE_M = [-8, 8];
const LANE_R = [22, 34];
const LANES = { L: LANE_L, M: LANE_M, R: LANE_R };
const Z_TOP = 38, Z_BOT = -38;
const CROSS_Z = [24, 0, -24];

function rect(x1, z1, x2, z2){ return [x1, z1, x2, z2]; }
function centerX([x1, x2]){ return (x1 + x2) / 2; }
function centerR([x1, z1, x2, z2]){ return [(x1 + x2) / 2, (z1 + z2) / 2]; }

function makeMap({ id, name, desc, sky, wallTone, accent, threeSites }){
  const open = [];
  const innerWalls = [];
  const crates = [];

  // spawn zones
  open.push(rect(-38, 30, 38, 38));
  open.push(rect(-38, -38, 38, -30));

  // three main lanes (full height)
  for(const [x1, x2] of Object.values(LANES)){
    open.push(rect(x1, Z_BOT, x2, Z_TOP));
  }

  // cross connectors -> creates loops
  for(const zc of CROSS_Z){
    open.push(rect(-34, zc - 3, 34, zc + 3));
  }

  // sites
  const sites = threeSites ? {
    A:{ rect:rect(22, -28, 36, -12), plant:[29, -20] },
    B:{ rect:rect(-8, -28, 8, -12), plant:[0, -20] },
    C:{ rect:rect(-36, -28, -22, -12), plant:[-29, -20] },
  } : {
    A:{ rect:rect(22, -28, 36, -12), plant:[29, -20] },
    B:{ rect:rect(-36, -28, -22, -12), plant:[-29, -20] },
  };
  for(const s of Object.values(sites)) open.push(s.rect);

  // small connector from mid lane to B site area on 2-site maps (extra loop)
  if(!threeSites){
    open.push(rect(-18, -16, 8, -10)); // ties mid to left-site approach
    open.push(rect(-8, -24, 8, -16));  // vertical link
  }

  // cover walls at choke/cross: transverse wall in each lane leaving two gaps
  for(const zc of CROSS_Z.concat([30, -6])){
    for(const [x1, x2] of Object.values(LANES)){
      const cx = (x1 + x2) / 2;
      innerWalls.push([cx - 2, zc - 0.5, cx + 2, zc + 0.5, 4]);
    }
  }

  // site cover crates (tall + low) placed at corners so entrances stay open
  for(const s of Object.values(sites)){
    const [x1, z1, x2, z2] = s.rect;
    const [cx, cz] = centerR(s.rect);
    const innerX = cx > 0 ? x1 : x2;          // side toward mid
    const outerX = cx > 0 ? x2 : x1;
    // back corners tall cover
    crates.push([outerX - (cx>0?2:-2), cz - 4, 2, 2, 1]);
    crates.push([outerX - (cx>0?2:-2), cz + 4, 2, 2, 1]);
    // side low cover near inner entrance
    crates.push([innerX + (cx>0?2:-2), cz - 4, 2, 1, 0]);
    crates.push([innerX + (cx>0?2:-2), cz + 4, 2, 1, 0]);
    // plant box
    crates.push([cx, cz, 1.6, 1, 0]);
  }

  // choke / cross crates
  for(const zc of [0, -24]){
    crates.push([-28, zc + 2, 2, 1, 0]);
    crates.push([28, zc - 2, 2, 1, 0]);
    crates.push([0, zc + 3, 2, 1, 0]);
  }
  // mid-lane top / bottom extra cover
  crates.push([0, 18, 2, 2, 1]);
  crates.push([0, -10, 2, 2, 1]);

  // metadata
  const siteKeys = Object.keys(sites);
  const chokes = {};
  for(const k of siteKeys) chokes[k] = [centerR(sites[k].rect)[0], -6];

  const stages = { L:[-28, 2], M:[0, 2], R:[28, 2] };

  const defPostList = [
    { p:[-28, -2], look:[-28, 20] },
    { p:[0, -2], look:[0, 20] },
    { p:[28, -2], look:[28, 20] },
    { p:[-28, -20], look:[-28, 20] },
    { p:[28, -20], look:[28, 20] },
  ];

  const atkHolds = {};
  for(const k of siteKeys){
    const [cx, cz] = centerR(sites[k].rect);
    atkHolds[k] = [
      { p:[cx - 6, cz - 6], look:[cx, cz + 12] },
      { p:[cx + 6, cz - 6], look:[cx, cz + 12] },
      { p:[cx, cz + 6], look:[cx, cz - 12] },
    ];
  }

  const smokePoints = {};
  for(const k of siteKeys){
    const cx = centerR(sites[k].rect)[0];
    smokePoints[k] = [[cx, -6], [cx, 2]];
  }

  const defBarriers = [];
  for(const [x1, x2] of Object.values(LANES)){
    defBarriers.push({ rect:[x1, -7, x2, -6], side:'def' });
  }

  return {
    id, name, desc,
    sky, wallTone, accent,
    open, innerWalls, platforms:[], stairs:[], crates,
    sites,
    wps:[], extraEdges:[],
    stages,
    defPostList,
    atkHolds,
    smokePoints,
    chokes,
    spawns:{
      atk:[[-8,36],[0,36],[8,36],[-4,38],[4,38]], atkYaw:0,
      def:[[-6,-33],[0,-35],[6,-33],[-4,-37],[4,-37]], defYaw:Math.PI,
    },
    barriers:[
      { rect:[-38, 28, 38, 29], side:'atk' },
      ...defBarriers,
    ],
  };
}

export const MAPS = [
  makeMap({
    id:'yiji', name:'遗迹', desc:'双点·三主路·中路广场·侧翼回廊·包点小房',
    sky:{ top:'#3d6b8f', mid:'#9fb8c8', bot:'#d8c9a8', fog:0x9fb8c8, fogFar:170, sun:0xfff2dd, sunPos:[35,60,25], hemi:[0xd8e8f0,0x3a4048] },
    wallTone:0x9aa8ad, accent:0x39d0c9,
    threeSites:false,
  }),
  makeMap({
    id:'santa', name:'三塔', desc:'三点位·三主路·横向回廊·高台包点',
    sky:{ top:'#5a3a6b', mid:'#c8907f', bot:'#f0c8a0', fog:0xc8a08c, fogFar:180, sun:0xffd8b0, sunPos:[-40,55,20], hemi:[0xf0d8c8,0x403238] },
    wallTone:0xa89a8c, accent:0xf5c56b,
    threeSites:true,
  }),
  makeMap({
    id:'liexia', name:'裂峡', desc:'双点·三主路·中路峡谷·侧翼暗格',
    sky:{ top:'#1d3a50', mid:'#4a6a80', bot:'#8fb0a0', fog:0x5a7a88, fogFar:130, sun:0xcfe8ff, sunPos:[20,50,-30], hemi:[0xb8d0dd,0x28323a] },
    wallTone:0x7f909a, accent:0xff4655,
    threeSites:false,
  }),
];
