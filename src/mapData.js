//  mapData.js: hand-crafted winding tactical maps with loops and small alleys
const MAPS=[];

function room(x1, z1, x2, z2){ return [x1, z1, x2, z2]; }

// create an L/Z-shaped corridor from a polyline; w = half-width (total width = 2*w)
function corridor(points, w){
  const rects=[];
  for(let i=0;i<points.length-1;i++){
    const [x1,z1]=points[i], [x2,z2]=points[i+1];
    const minx=Math.min(x1,x2)-w, maxx=Math.max(x1,x2)+w;
    const minz=Math.min(z1,z2)-w, maxz=Math.max(z1,z2)+w;
    rects.push([minx, minz, maxx, maxz]);
  }
  return rects;
}

function makeMap({id,name,desc,sky,wallTone,accent,rooms,corridors,sites,spawns,barriers,stages,defPostList,atkHolds,smokePoints,chokes,crates}){
  let open=[];
  for(const r of rooms) open.push(r);
  for(const c of corridors) open=open.concat(c);
  return {id,name,desc,sky,wallTone,accent,open,innerWalls:[],platforms:[],stairs:[],crates:crates||[],sites,wps:[],extraEdges:[],stages,defPostList,atkHolds,smokePoints,chokes,spawns,barriers};
}

function spawnSets(){
  return {
    atk:[[-8,36],[0,36],[8,36],[-4,38],[4,38]], atkYaw:0,
    def:[[-6,-33],[0,-35],[6,-33],[-4,-37],[4,-37]], defYaw:Math.PI,
  };
}
function stdBarriers(defRects){
  return [{rect:[-38,28,38,29], side:'atk'}].concat(defRects.map(r=>({rect:r, side:'def'})));
}

// ---------- yiji ----------
(function buildYiji(){
  const W=3.5; // corridor half-width
  const rooms=[];
  const corridors=[];
  rooms.push(room(-38,30,38,38)); // spawn
  rooms.push(room(-34,20,-22,28)); // TL
  rooms.push(room(-8,20,8,28));    // TM
  rooms.push(room(22,20,34,28));   // TR
  rooms.push(room(-30,4,-18,12));  // ML
  rooms.push(room(-8,4,8,12));     // MM
  rooms.push(room(18,4,30,12));    // MR
  rooms.push(room(-30,-12,-18,-4)); // LL
  rooms.push(room(-8,-12,8,-4));    // LM
  rooms.push(room(18,-12,30,-4));   // LR
  rooms.push(room(-34,-28,-22,-20)); // B site room
  rooms.push(room(22,-28,34,-20));   // A site room
  rooms.push(room(-6,-28,6,-20));    // bottom mid
  rooms.push(room(-38,-38,38,-30));  // def spawn

  // spawn to top (no straight to site)
  corridors.push(corridor([[-28,30],[-28,24]],W));
  corridors.push(corridor([[0,30],[0,24]],W));
  corridors.push(corridor([[28,30],[28,24]],W));
  // left wing: zigzag down to B
  corridors.push(corridor([[-28,20],[-28,14],[-24,14],[-24,8]],W));
  corridors.push(corridor([[-24,4],[-24,-2],[-28,-2],[-28,-8]],W));
  corridors.push(corridor([[-28,-12],[-28,-18],[-28,-24]],W));
  // right wing: zigzag down to A
  corridors.push(corridor([[28,20],[28,14],[24,14],[24,8]],W));
  corridors.push(corridor([[24,4],[24,-2],[28,-2],[28,-8]],W));
  corridors.push(corridor([[28,-12],[28,-18],[28,-24]],W));
  // mid wing with a jog
  corridors.push(corridor([[0,20],[0,8],[0,-4],[0,-12],[0,-20]],W));
  // def spawn connectors
  corridors.push(corridor([[-28,-30],[-28,-24]],W));
  corridors.push(corridor([[28,-30],[28,-24]],W));
  corridors.push(corridor([[0,-30],[0,-24]],W));
  // cross alleys (loops / small paths)
  corridors.push(corridor([[-22,24],[-12,24],[-12,8],[-18,8]],W-1));
  corridors.push(corridor([[22,24],[12,24],[12,8],[18,8]],W-1));
  corridors.push(corridor([[-24,0],[-8,0]],W-1));
  corridors.push(corridor([[24,0],[8,0]],W-1));
  corridors.push(corridor([[-22,-8],[-6,-8]],W-1));
  corridors.push(corridor([[22,-8],[6,-8]],W-1));
  corridors.push(corridor([[-18,-24],[18,-24]],W-1));
  // A-B direct small path through def spawn area
  corridors.push(corridor([[-28,-34],[28,-34]],W-1));

  const sites={
    A:{rect:[22,-28,34,-20], plant:[28,-24]},
    B:{rect:[-34,-28,-22,-20], plant:[-28,-24]},
  };
  const stages={A:[24,-2], B:[-24,-2]};
  const defPostList=[
    {p:[-24,8], look:[-24,24]},
    {p:[0,8], look:[0,24]},
    {p:[24,8], look:[24,24]},
    {p:[-24,-8], look:[-24,8]},
    {p:[24,-8], look:[24,8]},
  ];
  const atkHolds={
    A:[{p:[24,-18], look:[24,8]}, {p:[30,-24], look:[0,-24]}, {p:[18,-24], look:[30,-24]}],
    B:[{p:[-24,-18], look:[-24,8]}, {p:[-30,-24], look:[0,-24]}, {p:[-18,-24], look:[-30,-24]}],
  };
  const chokes={A:[24,-6], B:[-24,-6]};
  const smokePoints={A:[[24,0],[24,-12]], B:[[-24,0],[-24,-12]]};
  const crates=[];
  const bends=[[-28,14],[28,14],[-24,-2],[24,-2],[-28,-18],[28,-18],[0,-12]];
  for(const [x,z] of bends) crates.push([x,z, 2,2,1]);
  crates.push([28,-28, 2,2,1], [28,-20, 2,2,1], [-28,-28, 2,2,1], [-28,-20, 2,2,1]);
  crates.push([0,-6, 2,1,0], [-12,0, 1.6,1,0], [12,0, 1.6,1,0]);

  MAPS.push(makeMap({
    id:'yiji', name:'遗迹', desc:'双点·蜿蜒回廊·侧翼小道·包点转角',
    sky:{ top:'#3d6b8f', mid:'#9fb8c8', bot:'#d8c9a8', fog:0x9fb8c8, fogFar:170, sun:0xfff2dd, sunPos:[35,60,25], hemi:[0xd8e8f0,0x3a4048] },
    wallTone:0x9aa8ad, accent:0x39d0c9,
    rooms, corridors, sites, stages, defPostList, atkHolds, chokes, smokePoints, crates,
    spawns:spawnSets(),
    barriers:stdBarriers([[-34,-7,-22,-6],[-8,-7,8,-6],[22,-7,34,-6]]),
  }));
})();

// ---------- santa ----------
(function buildSanta(){
  const W=3.5;
  const rooms=[];
  const corridors=[];
  rooms.push(room(-38,30,38,38));
  rooms.push(room(-34,20,-22,28)); // TL
  rooms.push(room(-8,20,8,28));    // TM
  rooms.push(room(22,20,34,28));   // TR
  rooms.push(room(-30,4,-18,12));  // L1
  rooms.push(room(-8,4,8,12));     // M1
  rooms.push(room(18,4,30,12));    // R1
  rooms.push(room(-30,-12,-18,-4)); // L2
  rooms.push(room(-8,-12,8,-4));    // M2
  rooms.push(room(18,-12,30,-4));   // R2
  rooms.push(room(-34,-28,-22,-20)); // C
  rooms.push(room(-8,-28,8,-20));    // B
  rooms.push(room(22,-28,34,-20));   // A
  rooms.push(room(-38,-38,38,-30));  // def spawn

  corridors.push(corridor([[-28,30],[-28,24]],W));
  corridors.push(corridor([[0,30],[0,24]],W));
  corridors.push(corridor([[28,30],[28,24]],W));
  corridors.push(corridor([[-28,20],[-28,14],[-24,14],[-24,8]],W));
  corridors.push(corridor([[28,20],[28,14],[24,14],[24,8]],W));
  corridors.push(corridor([[-24,4],[-24,-2],[-28,-2],[-28,-8]],W));
  corridors.push(corridor([[24,4],[24,-2],[28,-2],[28,-8]],W));
  corridors.push(corridor([[-28,-12],[-28,-18],[-28,-24]],W));
  corridors.push(corridor([[28,-12],[28,-18],[28,-24]],W));
  corridors.push(corridor([[0,20],[0,14],[4,14],[4,8],[0,8],[0,-4],[0,-12],[0,-20]],W));
  // def spawn connectors
  corridors.push(corridor([[-28,-30],[-28,-24]],W));
  corridors.push(corridor([[0,-30],[0,-24]],W));
  corridors.push(corridor([[28,-30],[28,-24]],W));
  corridors.push(corridor([[-18,-34],[18,-34]],W-1));
  corridors.push(corridor([[-22,24],[-12,24],[-12,8],[-18,8]],W-1));
  corridors.push(corridor([[22,24],[12,24],[12,8],[18,8]],W-1));
  corridors.push(corridor([[-24,0],[-8,0]],W-1));
  corridors.push(corridor([[24,0],[8,0]],W-1));
  corridors.push(corridor([[-22,-8],[-6,-8]],W-1));
  corridors.push(corridor([[22,-8],[6,-8]],W-1));
  corridors.push(corridor([[-18,-24],[18,-24]],W-1));
  corridors.push(corridor([[-8,-20],[8,-20]],W-1));

  const sites={
    A:{rect:[22,-28,34,-20], plant:[28,-24]},
    B:{rect:[-8,-28,8,-20], plant:[0,-24]},
    C:{rect:[-34,-28,-22,-20], plant:[-28,-24]},
  };
  const stages={A:[24,-2], B:[0,-2], C:[-24,-2]};
  const defPostList=[
    {p:[-24,8], look:[-24,24]},
    {p:[0,8], look:[0,24]},
    {p:[24,8], look:[24,24]},
    {p:[-24,-8], look:[-24,8]},
    {p:[24,-8], look:[24,8]},
  ];
  const atkHolds={
    A:[{p:[24,-18], look:[24,8]}, {p:[30,-24], look:[0,-24]}],
    B:[{p:[0,-18], look:[0,8]}, {p:[-6,-24], look:[6,-24]}],
    C:[{p:[-24,-18], look:[-24,8]}, {p:[-30,-24], look:[0,-24]}],
  };
  const chokes={A:[24,-6], B:[0,-6], C:[-24,-6]};
  const smokePoints={A:[[24,0],[24,-12]], B:[[0,0],[0,-12]], C:[[-24,0],[-24,-12]]};
  const crates=[];
  const bends=[[-28,14],[28,14],[-24,-2],[24,-2],[-28,-18],[28,-18],[4,14],[0,-12]];
  for(const [x,z] of bends) crates.push([x,z, 2,2,1]);
  crates.push([28,-28,2,2,1],[28,-20,2,2,1],[-28,-28,2,2,1],[-28,-20,2,2,1]);
  crates.push([0,-6,2,1,0],[-12,0,1.6,1,0],[12,0,1.6,1,0]);

  MAPS.push(makeMap({
    id:'santa', name:'三塔', desc:'三点位·折返长廊·中路转角·包点环道',
    sky:{ top:'#5a3a6b', mid:'#c8907f', bot:'#f0c8a0', fog:0xc8a08c, fogFar:180, sun:0xffd8b0, sunPos:[-40,55,20], hemi:[0xf0d8c8,0x403238] },
    wallTone:0xa89a8c, accent:0xf5c56b,
    rooms, corridors, sites, stages, defPostList, atkHolds, chokes, smokePoints, crates,
    spawns:spawnSets(),
    barriers:stdBarriers([[-34,-7,-22,-6],[-8,-7,8,-6],[22,-7,34,-6]]),
  }));
})();

// ---------- liexia ----------
(function buildLiexia(){
  const W=3.5;
  const rooms=[];
  const corridors=[];
  rooms.push(room(-34,30,34,38)); // atk spawn
  rooms.push(room(-34,-38,34,-30)); // def spawn
  rooms.push(room(-28,18,-16,26)); // TL
  rooms.push(room(-6,18,6,26));    // TM
  rooms.push(room(16,18,28,26));   // TR
  rooms.push(room(-28,2,-16,10));  // ML
  rooms.push(room(-6,2,6,10));     // MM
  rooms.push(room(16,2,28,10));    // MR
  rooms.push(room(-28,-14,-16,-6)); // LL
  rooms.push(room(-6,-14,6,-6));    // LM
  rooms.push(room(16,-14,28,-6));   // LR
  rooms.push(room(-30,-28,-14,-20)); // B
  rooms.push(room(14,-28,30,-20));   // A

  corridors.push(corridor([[-22,30],[-22,22]],W));
  corridors.push(corridor([[0,30],[0,22]],W));
  corridors.push(corridor([[22,30],[22,22]],W));
  corridors.push(corridor([[-22,18],[-22,12],[-26,12],[-26,6],[-22,6]],W));
  corridors.push(corridor([[22,18],[22,12],[26,12],[26,6],[22,6]],W));
  corridors.push(corridor([[-22,2],[-22,-4],[-26,-4],[-26,-10],[-22,-10]],W));
  corridors.push(corridor([[22,2],[22,-4],[26,-4],[26,-10],[22,-10]],W));
  corridors.push(corridor([[-22,-14],[-22,-20],[-22,-24]],W));
  corridors.push(corridor([[22,-14],[22,-20],[22,-24]],W));
  corridors.push(corridor([[0,18],[0,10],[0,2],[4,2],[4,-6],[0,-6],[0,-14],[0,-20]],W));
  // def spawn connectors
  corridors.push(corridor([[-22,-30],[-22,-24]],W));
  corridors.push(corridor([[22,-30],[22,-24]],W));
  corridors.push(corridor([[0,-30],[0,-24]],W));
  corridors.push(corridor([[-14,-34],[14,-34]],W-1));
  corridors.push(corridor([[-16,22],[-8,22],[-8,6],[-16,6]],W-1));
  corridors.push(corridor([[16,22],[8,22],[8,6],[16,6]],W-1));
  corridors.push(corridor([[-22,0],[0,0]],W-1));
  corridors.push(corridor([[22,0],[0,0]],W-1));
  corridors.push(corridor([[-16,-10],[-6,-10]],W-1));
  corridors.push(corridor([[16,-10],[6,-10]],W-1));
  corridors.push(corridor([[-14,-24],[14,-24]],W-1));

  const sites={
    A:{rect:[14,-28,30,-20], plant:[22,-24]},
    B:{rect:[-30,-28,-14,-20], plant:[-22,-24]},
  };
  const stages={A:[22,-2], B:[-22,-2]};
  const defPostList=[
    {p:[-22,6], look:[-22,22]},
    {p:[0,6], look:[0,22]},
    {p:[22,6], look:[22,22]},
    {p:[-22,-10], look:[-22,2]},
    {p:[22,-10], look:[22,2]},
  ];
  const atkHolds={
    A:[{p:[22,-18], look:[22,2]}, {p:[26,-24], look:[0,-24]}, {p:[18,-24], look:[26,-24]}],
    B:[{p:[-22,-18], look:[-22,2]}, {p:[-26,-24], look:[0,-24]}, {p:[-18,-24], look:[-26,-24]}],
  };
  const chokes={A:[22,-6], B:[-22,-6]};
  const smokePoints={A:[[22,0],[22,-12]], B:[[-22,0],[-22,-12]]};
  const crates=[];
  const bends=[[-22,12],[22,12],[-26,6],[26,6],[-26,-4],[26,-4],[-22,-20],[22,-20],[4,-6]];
  for(const [x,z] of bends) crates.push([x,z, 2,2,1]);
  crates.push([22,-28,2,2,1],[22,-20,2,2,1],[-22,-28,2,2,1],[-22,-20,2,2,1]);
  crates.push([0,-6,2,1,0],[-10,0,1.6,1,0],[10,0,1.6,1,0]);

  MAPS.push(makeMap({
    id:'liexia', name:'裂峡', desc:'双点·峡谷弯道·中路折线·底部环通',
    sky:{ top:'#1d3a50', mid:'#4a6a80', bot:'#8fb0a0', fog:0x5a7a88, fogFar:130, sun:0xcfe8ff, sunPos:[20,50,-30], hemi:[0xb8d0dd,0x28323a] },
    wallTone:0x7f909a, accent:0xff4655,
    rooms, corridors, sites, stages, defPostList, atkHolds, chokes, smokePoints, crates,
    spawns:spawnSets(),
    barriers:stdBarriers([[-30,-7,-14,-6],[-6,-7,6,-6],[14,-7,30,-6]]),
  }));
})();

export { MAPS };
export default MAPS;
