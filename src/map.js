import * as THREE from "three";
import { G } from "./state.js?v=16";
import { V3, rayAABB, dist2d } from "./utils.js?v=16";
import { MAPS as NEW_MAPS } from "./mapData.js?v=16";
const OLD_MAPS = [
  {
    id:"yiji", name:"遗迹", desc:"双点·走廊网络·A天台·中路广场·猫道窗口·市场",
    sky:{ top:"#3d6b8f", mid:"#9fb8c8", bot:"#d8c9a8", fog:0x9fb8c8, fogFar:170, sun:0xfff2dd, sunPos:[35,60,25], hemi:[0xd8e8f0,0x3a4048] },
    wallTone:0x9aa8ad, accent:0x39d0c9,
    open: [
      [-38,34,38,38],
      [-38,26,38,34],
      [18,28,32,34],
      [18,20,38,28],
      [24,10,38,20],
      [28,10,32,12],
      [30,6,36,8],
      [-32,20,-18,34],
      [-38,20,-32,28],
      [-38,10,-28,20],
      [-32,10,-30,12],
      [-12,10,-18,12],
      [-16,4,-12,6],
      [-10,10,10,26],
      [-6,4,4,10],
      [-4,-6,4,4],
      [-10,2,-4,6],
      [4,4,8,6],
      [8,-6,14,6],
      [12,-10,18,-4],
      [10,-2,14,2],
      [-18,-6,-8,6],
      [-14,-12,-6,-4],
      [16,-20,36,-4],
      [14,-24,20,-20],
      [32,-24,38,-20],
      [18,-26,28,-24],
      [22,-20,28,-18],
      [-36,-20,-14,-4],
      [-20,-24,-14,-20],
      [-38,-24,-28,-20],
      [-28,-26,-18,-24],
      [-22,-20,-18,-18],
      [-8,-24,10,-20],
      [-16,-36,16,-24],
      [-4,-26,6,-22],
      [-10,-18,-8,-14],
      [6,-18,8,-14],
      // 新增：中路市场建筑、A/B 点小房、侧翼通道
      [-8,2,8,8],
      [-6,4,6,7],
      [20,-12,30,-6],
      [-30,-12,-20,-6],
      [14,-4,18,2],
      [-18,-4,-14,2],
      [-6,-14,6,-10],
      // 中路侧翼连接桥，确保出生点到 A/B 的连通
      [-8,-6,-4,6],
      [4,-6,8,6]
    ],
    innerWalls: [
      [24,16,34,17,4],
      [22,8,28,9,4],
      [26,2,30,3,4],
      [-34,16,-28,17,4],
      [-30,10,-24,11,4],
      [-28,4,-24,5,4],
      [-2,12,2,13,4],
      [-6,6,-4,7,4],
      [6,6,8,7,4],
      [-4,14,4,15,4],
      [-2,20,2,21,4],
      [-2,-2,2,-1,4],
      [-6,0,-4,1,4],
      [18,-10,22,-9,4],
      [22,-18,26,-17,4],
      [32,-18,36,-17,4],
      [16,-22,18,-21,4],
      [24,-24,28,-23,4],
      [-22,-10,-18,-9,4],
      [-26,-18,-22,-17,4],
      [-36,-18,-32,-17,4],
      [-18,-22,-16,-21,4],
      [-28,-24,-24,-23,4],
      [10,-4,12,-3,4],
      [12,-8,14,-7,4],
      [-12,-4,-10,-3,4],
      [-12,-8,-10,-7,4],
      [4,-22,6,-21,4],
      [-4,-22,-2,-21,4],
      [8,-26,10,-25,4],
      [-10,-26,-8,-25,4],
      [8,-16,10,-15,4],
      // 中路市场：两座对称小房 + 中央通道
      [-8,8,-2,9,4],
      [-8,2,-2,3,4],
      [-8,2,-7,8,4],
      [-3,2,-2,4.5,4],
      [-3,6,-2,8,4],
      [2,8,8,9,4],
      [2,2,8,3,4],
      [7,2,8,8,4],
      [2,2,3,4.5,4],
      [2,6,3,8,4],
      // A 点小房
      [20,-12,30,-11,4],
      [20,-12,21,-6,4],
      [29,-12,30,-6,4],
      [20,-7,24,-6,4],
      [26,-7,30,-6,4],
      [24,-12,26,-11,1.1],
      // B 点小房
      [-30,-12,-20,-11,4],
      [-30,-12,-29,-6,4],
      [-21,-12,-20,-6,4],
      [-30,-7,-26,-6,4],
      [-24,-7,-20,-6,4],
      [-26,-12,-24,-11,1.1],
      // 侧翼矮墙窗口
      [14,-4,18,-3,1.1],
      [-18,-4,-14,-3,1.1],
      [-6,-14,6,-13,1.1]
    ],
    platforms: [ [18,-18,24,-12] ],
    stairs: [ {x1:16,z1:-20,x2:20,z2:-17,dir:"+z",h:2.2} ],
    crates: [
      [22,-14,2,1,0],
      [24,-18,2.4,2,1],
      [34,-18,2,1,0],
      [35.5,-20,1.4,1,0],
      [34.6,-21.8,1,0.5,0],
      [18,-22,1.8,1,0],
      [28,-18,1.6,1,0],
      [26,-6,2,1,0],
      [27.5,-6.6,1,0.5,0],
      [28,24,2,1,0],
      [29.8,23.2,1,0.5,0],
      [34,22,1.6,1,0],
      [30,14,1.8,1,0],
      [-24,-14,2,1,0],
      [-26,-18,2.4,2,1],
      [-34,-18,2,1,0],
      [-35.5,-20,1.4,1,0],
      [-20,-22,1.8,1,0],
      [-30,-18,1.6,1,0],
      [-28,-6,2,1,0],
      [-29.5,-6.6,1,0.5,0],
      [-30,24,2,1,0],
      [-29.8,23.2,1,0.5,0],
      [-34,22,1.6,1,0],
      [-32,14,1.8,1,0],
      [0,18,1.8,2,1],
      [0,16,1.4,1,0],
      [0,6,1.2,1,0],
      [-4,0,1.2,1,0],
      [10,-30,1.6,2,1],
      [-10,-30,1.6,2,1],
      [0,-28,1.4,1,0],
      // 新增掩体（不堵死中央通道）
      [-6.5,6.5,1.2,1,0],
      [6.5,6.5,1.2,1,0],
      [-6.5,3.5,1.2,1,0],
      [6.5,3.5,1.2,1,0],
      [0,-28,1.4,1,0],
      [24,-8,1.6,1,0],
      [26,-8,1.6,1,0],
      [-24,-8,1.6,1,0],
      [-26,-8,1.6,1,0],
      [16,-2,1.4,1,0],
      [-16,-2,1.4,1,0],
      [0,-12,1.8,1,0]
    ],
    sites: { A:{ rect:[16,-22,36,-6], plant:[24,-15] }, B:{ rect:[-36,-22,-14,-6], plant:[-26,-15] } },
    wps: [
      [0,36],
      [8,36],
      [-8,36],
      [0,32],
      [14,31],
      [-14,31],
      [0,28],
      [28,31],
      [28,24],
      [24,21],
      [24,14],
      [30,12],
      [34,8],
      [34,0],
      [30,-4],
      [28,-6],
      [-28,31],
      [-28,24],
      [-24,21],
      [-24,14],
      [-30,12],
      [-34,8],
      [-34,0],
      [-30,-4],
      [-28,-6],
      [0,20],
      [0,12],
      [0,8],
      [-4,4],
      [-4,0],
      [0,-4],
      [4,4],
      [4,0],
      [0,-8],
      [-6,-4],
      [6,-4],
      [10,2],
      [12,-8],
      [14,-4],
      [-10,2],
      [-12,-8],
      [18,-6],
      [22,-6],
      [26,-6],
      [30,-6],
      [34,-6],
      [20,-18],
      [26,-18],
      [34,-18],
      [18,-22],
      [20,-16,2.2],
      [-18,-6],
      [-22,-6],
      [-26,-6],
      [-30,-6],
      [-34,-6],
      [-20,-18],
      [-26,-18],
      [-34,-18],
      [-18,-22],
      [0,-22],
      [0,-28],
      [0,-35],
      [8,-30],
      [-8,-30],
      [10,-33],
      [-10,-33],
      [0,-25],
      // 新增导航点：市场、A/B 小房、侧翼
      [-5,7], [5,7], [-5,5], [5,5], [0,5],
      [-5,3], [5,3], [-1.5,5], [1.5,5],
      [25,-8], [25,-10], [25,-7],
      [-25,-8], [-25,-10], [-25,-7],
      [16,-2], [-16,-2], [0,-12]
    ],
    extraEdges: [[50,41],[68,70],[70,73],[69,71],[71,74],[72,75],[72,76],[75,70],[76,71],[72,27],[72,30],[72,28],[72,31],[77,41],[77,45],[77,78],[77,79],[78,47],[78,48],[80,52],[80,56],[80,81],[80,82],[81,58],[81,59],[83,40],[83,36],[84,53],[84,38],[85,60],[85,61],[85,67]],
    stages: { A:[28,2], B:[-28,2] },
    defPostList: [
      {p:[20,-16],look:[24,8]},
      {p:[-22,-10],look:[-26,6]},
      {p:[0,-12],look:[0,18]},
      {p:[34,-18],look:[22,-10]},
      {p:[-34,-18],look:[-18,-8]}
    ],
    atkHolds: { A:[{p:[34,-20],look:[18,-14]}, {p:[26,-20],look:[22,4]}, {p:[18,-6],look:[14,-22]}], B:[{p:[-34,-20],look:[-18,-12]}, {p:[-26,-20],look:[-22,4]}, {p:[-18,-6],look:[-10,-22]}] },
    smokePoints: { A:[[26,-6],[14,-8]], B:[[-26,-6],[-12,-8]] },
    chokes: { A:[26,-7], B:[-26,-7] },
    spawns: { atk:[[-8,36],[0,36],[8,36],[-4,38],[4,38]], atkYaw:0, def:[[-6,-30],[0,-32],[6,-30],[-4,-34],[4,-34]], defYaw:3.14159 },
    barriers: [
      {rect:[-38,25.8,38,26.3], side:"atk"},
      {rect:[18,-5.8,36,-4.8], side:"def"},
      {rect:[-36,-5.8,-16,-4.8], side:"def"}
    ]
  },
  {
    id:"santa", name:"三塔", desc:"三点位·肘弯长廊·横向回廊·高台",
    sky:{ top:"#5a3a6b", mid:"#c8907f", bot:"#f0c8a0", fog:0xc8a08c, fogFar:180, sun:0xffd8b0, sunPos:[-40,55,20], hemi:[0xf0d8c8,0x403238] },
    wallTone:0xa89a8c, accent:0xf5c56b,
    open: [
      [-38,32,38,38],
      [-38,28,38,32],
      [22,24,36,28],
      [22,16,36,24],
      [26,6,36,16],
      [28,4,30,6],
      [-36,24,-22,28],
      [-36,16,-22,24],
      [-36,6,-26,16],
      [-30,4,-28,6],
      [-6,18,6,28],
      [-4,10,4,18],
      [-4,4,4,10],
      [-4,0,4,4],
      [12,10,22,14],
      // 中路连接 A/B/C 的侧翼通道
      [4,0,6,4],
      [-6,0,-4,4],
      [14,0,16,4],
      [-16,0,-14,4],
      [14,-4,16,0],
      [-16,-4,-14,0],
      [-4,-4,4,0],
      [-22,10,-12,14],
      [6,0,14,4],
      [-14,0,-6,4],
      [16,-22,36,-4],
      [-6,-22,6,-4],
      [-36,-22,-16,-4],
      [14,-28,22,-22],
      [22,-34,30,-28],
      [-22,-28,-14,-22],
      [-30,-34,-22,-28],
      [-4,-28,8,-22],
      [-8,-34,4,-28],
      [-24,-38,24,-28],
      [-12,-28,14,-22]
    ],
    innerWalls: [
      [24,20,30,21,4],
      [30,10,36,11,4],
      [-30,20,-24,21,4],
      [-36,10,-30,11,4],
      [-2,14,2,15,4],
      [-2,6,2,7,4],
      [18,-10,22,-9,4],
      [22,-18,26,-17,4],
      [32,-18,36,-17,4],
      [-22,-10,-18,-9,4],
      [-26,-18,-22,-17,4],
      [-36,-18,-32,-17,4],
      // 中路折返矮墙（保留通道，不封死 B 点入口）
      [-2,-10,-1,-9,4],
      [1,-10,2,-9,4],
      [-4,-16,-1,-15,4],
      [1,-16,4,-15,4],
      [6,-14,8,-13,2],
      [8,-22,10,-21,4],
      [-10,-22,-8,-21,4],
      [12,-26,16,-25,4],
      [-16,-26,-12,-25,4],
      // A/B/C 点小房，增加掩体复杂度
      [18,-20,22,-19,4],
      [18,-20,19,-16,4],
      [21,-20,22,-16,4],
      [-22,-20,-18,-19,4],
      [-22,-20,-19,-16,4],
      [-18,-20,-17,-16,4],
      [-2,-20,-0.5,-17,4],
      [0.5,-20,2,-17,4]
    ],
    platforms: [ [4,-18,8,-14] ],
    stairs: [ {x1:0,z1:-18,x2:4,z2:-14,dir:"+x",h:2} ],
    crates: [
      [22,-14,2,1,0],
      [24,-18,2.4,2,1],
      [34,-18,2,1,0],
      [32,-18,1,0.5,0],
      [18,-22,1.8,1,0],
      [-2,-14,2,1,0],
      [-4,-18,2.4,2,1],
      [4,-18,1.4,1,0],
      [-22,-14,2,1,0],
      [-24,-18,2.4,2,1],
      [-34,-18,2,1,0],
      [-32,-18,1,0.5,0],
      [-18,-22,1.8,1,0],
      [28,20,2,2,1],
      [24.8,21,1.4,1,0],
      [-28,20,2,2,1],
      [-24.8,21,1.4,1,0],
      [0,12,1.8,2,1],
      [12,-28,1.6,2,1],
      [-12,-28,1.6,2,1],
      [0,-32,1.4,1,0],
      // 侧翼与点位新增掩体
      [8,2,1.2,1,0],
      [-8,2,1.2,1,0],
      [20,-18,1.4,1,0],
      [26,-18,1.2,1,0],
      [-20,-18,1.4,1,0],
      [-26,-18,1.2,1,0],
      [0,-18,1.4,1,0]
    ],
    sites: { A:{ rect:[16,-22,36,-6], plant:[26,-10] }, B:{ rect:[-6,-22,6,-6], plant:[0,-10] }, C:{ rect:[-36,-22,-16,-6], plant:[-26,-10] } },
    wps: [
      [0,35],
      [10,35],
      [-10,35],
      [6,38],
      [-6,38],
      [0,30],
      [28,30],
      [28,22],
      [26,18],
      [26,12],
      [30,10],
      [34,6],
      [34,0],
      [34,-4],
      [28,-6],
      [-28,30],
      [-28,22],
      [-26,18],
      [-26,12],
      [-30,10],
      [-34,6],
      [-34,0],
      [-34,-4],
      [-28,-6],
      [0,22],
      [0,14],
      [0,6],
      [0,0],
      [0,-6],
      [18,12],
      [-18,12],
      [18,-6],
      [24,-6],
      [34,-6],
      [22,-18],
      [34,-18],
      [20,-24],
      [28,-28],
      [0,-6],
      [0,-16],
      [6,-18],
      [4,-18,2],
      [-1,-18],
      [-18,-6],
      [-24,-6],
      [-34,-6],
      [-22,-18],
      [-34,-18],
      [-20,-24],
      [-28,-28],
      [0,-28],
      [0,-36],
      [12,-30],
      [-12,-30],
      [8,-34],
      [-8,-34]
    ],
    extraEdges: [[42,43]],
    stages: { A:[28,2], B:[0,2], C:[-28,2] },
    defPostList: [
      {p:[22,-6],look:[30,8]},
      {p:[0,-10],look:[0,14]},
      {p:[-22,-6],look:[-30,8]},
      {p:[34,-16],look:[24,-8]},
      {p:[6,-18],look:[0,14]},
      {p:[-34,-16],look:[-24,-8]}
    ],
    atkHolds: { A:[{p:[34,-20],look:[16,-8]}, {p:[24,-18],look:[30,0]}, {p:[18,-6],look:[14,-20]}], B:[{p:[-4,-20],look:[0,2]}, {p:[4,-6],look:[0,-24]}, {p:[0,-6],look:[-4,14]}], C:[{p:[-34,-20],look:[-16,-8]}, {p:[-24,-18],look:[-30,0]}, {p:[-18,-6],look:[-14,-20]}] },
    smokePoints: { A:[[28,-3],[14,-7]], B:[[0,-4],[-4,8]], C:[[-28,-3],[-14,-7]] },
    chokes: { A:[28,-4], B:[0,-4], C:[-28,-4] },
    spawns: { atk:[[-8,34],[0,34],[8,34],[-4,38],[4,38]], atkYaw:0, def:[[-6,-32],[0,-34],[6,-32],[-4,-36],[4,-36]], defYaw:3.14159 },
    barriers: [
      {rect:[-38,27.8,38,28.3], side:"atk"},
      {rect:[18,-5.8,36,-4.8], side:"def"},
      {rect:[-36,-5.8,-16,-4.8], side:"def"},
      {rect:[-6,-5.8,6,-4.8], side:"def"}
    ]
  },
  {
    id:"liexia", name:"裂峡", desc:"双点·中桥掩体·肘弯街道·侧翼暗格",
    sky:{ top:"#1d3a50", mid:"#4a6a80", bot:"#8fb0a0", fog:0x5a7a88, fogFar:130, sun:0xcfe8ff, sunPos:[20,50,-30], hemi:[0xb8d0dd,0x28323a] },
    wallTone:0x7f909a, accent:0xff4655,
    open: [
      [-34,28,34,38],
      [-34,22,34,28],
      [16,16,26,22],
      [18,8,28,16],
      [20,2,30,8],
      [22,-2,26,2],
      [-26,16,-16,22],
      [-28,8,-18,16],
      [-30,2,-20,8],
      [-26,-2,-22,2],
      [-6,14,6,22],
      [-4,6,4,14],
      [-2,0,2,6],
      [-4,-4,4,0],
      [-4,-10,4,-4],
      [6,6,16,12],
      [-16,6,-6,12],
      [6,0,12,2],
      [-12,0,-6,2],
      [12,-24,34,-4],
      [8,-30,16,-24],
      [28,-30,38,-24],
      [-34,-24,-12,-4],
      [-16,-30,-8,-24],
      [-38,-30,-28,-24],
      [-16,-36,16,-24],
      [12,-26,18,-22],
      [-18,-26,-12,-22],
      // 中路垂直通道 + 侧翼回廊，确保双点可达
      [-4,-24,4,-10],
      [4,6,6,12],
      [-6,6,-4,12],
      [6,-24,16,12],
      [-16,-24,-6,12]
    ],
    innerWalls: [
      [20,16,26,17,4],
      [24,6,28,7,4],
      [-26,16,-20,17,4],
      [-28,6,-24,7,4],
      [-2,12,2,13,4],
      [-4,4,4,5,4],
      [4,6,6,7,4],
      [-6,6,-4,7,4],
      [14,-10,18,-9,4],
      [16,-18,20,-17,4],
      [30,-18,34,-17,4],
      [-18,-10,-14,-9,4],
      [-20,-18,-16,-17,4],
      [-34,-18,-30,-17,4],
      [12,-20,14,-19,4],
      [-14,-20,-12,-19,4],
      [8,-22,10,-21,4],
      [-10,-22,-8,-21,4],
      // 侧翼小房 + A/B 点掩体房
      [8,-4,12,-3,4],
      [8,-4,9,-1,4],
      [11,-4,12,-1,4],
      [-12,-4,-8,-3,4],
      [-12,-4,-11,-1,4],
      [-9,-4,-8,-1,4],
      [16,-20,20,-19,4],
      [16,-20,17,-16,4],
      [19,-20,20,-16,4],
      [-20,-20,-16,-19,4],
      [-20,-20,-19,-16,4],
      [-17,-20,-16,-16,4]
    ],
    platforms: [  ],
    stairs: [  ],
    crates: [
      [22,-14,2,1,0],
      [24,-18,2.4,2,1],
      [34,-18,2,1,0],
      [30,-18,1,0.5,0],
      [14,-24,1.8,1,0],
      [-22,-14,2,1,0],
      [-24,-18,2.4,2,1],
      [-34,-18,2,1,0],
      [-34,-20,1.4,1,0],
      [-14,-24,1.8,1,0],
      [0,6,1.6,1,0],
      [17,10,1.8,1,0],
      [-17,10,1.8,1,0],
      [0,-30,1.6,2,1],
      [16,-30,1.4,1,0],
      [-16,-30,1.4,1,0],
      // 新增掩体
      [10,-2,1.2,1,0],
      [-10,-2,1.2,1,0],
      [20,-18,1.4,1,0],
      [-20,-18,1.4,1,0],
      [0,-18,1.4,1,0]
    ],
    sites: { A:{ rect:[14,-24,34,-6], plant:[24,-15] }, B:{ rect:[-34,-24,-14,-6], plant:[-24,-15] } },
    wps: [
      [0,34],
      [12,34],
      [-12,34],
      [6,38],
      [-6,38],
      [0,28],
      [22,28],
      [22,20],
      [20,14],
      [20,8],
      [24,6],
      [28,4],
      [28,-2],
      [24,-6],
      [-22,28],
      [-22,20],
      [-20,14],
      [-20,8],
      [-24,6],
      [-28,4],
      [-28,-2],
      [-24,-6],
      [0,22],
      [0,14],
      [0,2],
      [0,-4],
      [0,-8],
      [0,-14],
      [12,8],
      [-12,8],
      [20,-6],
      [24,-6],
      [34,-6],
      [20,-18],
      [34,-18],
      [16,-24],
      [30,-30],
      [-20,-6],
      [-24,-6],
      [-34,-6],
      [-20,-18],
      [-34,-18],
      [-16,-24],
      [-30,-30],
      [0,-30],
      [0,-37],
      [12,-30],
      [-12,-30]
    ],
    extraEdges: [],
    stages: { A:[24,2], B:[-24,2] },
    defPostList: [
      {p:[20,-8],look:[24,8]},
      {p:[-20,-8],look:[-24,8]},
      {p:[0,-8],look:[0,14]},
      {p:[32,-18],look:[14,-4]},
      {p:[-32,-18],look:[-14,-4]}
    ],
    atkHolds: { A:[{p:[34,-20],look:[16,-10]}, {p:[24,-18],look:[26,2]}, {p:[14,-12],look:[12,-22]}], B:[{p:[-34,-20],look:[-16,-10]}, {p:[-24,-18],look:[-26,2]}, {p:[-14,-12],look:[-12,-22]}] },
    smokePoints: { A:[[24,-4],[12,-10]], B:[[-24,-4],[-12,-10]] },
    chokes: { A:[24,-6], B:[-24,-6] },
    spawns: { atk:[[-8,34],[0,34],[8,34],[-4,38],[4,38]], atkYaw:0, def:[[-6,-33],[0,-35],[6,-33],[-4,-37],[4,-37]], defYaw:3.14159 },
    barriers: [
      {rect:[-36,21.8,36,22.3], side:"atk"},
      {rect:[16,-5.8,34,-4.8], side:"def"},
      {rect:[-34,-5.8,-14,-4.8], side:"def"}
    ]
  }
];

export const MAPS = NEW_MAPS;

const inRect = (x,z,r)=> x>=r[0]&&x<=r[2]&&z>=r[1]&&z<=r[3];

export function inSite(pos){for(const k of Object.keys(G.map.sites)){if(inRect(pos.x,pos.z,G.map.sites[k].rect))return k;}return null;}
export function inAnyOpen(x,z){return G.map.openRects.some(r=>inRect(x,z,r));}

function buildWalls(open){
  const isOpen=(x,z)=>open.some(r=>inRect(x,z,r));
  const boxes=[];
  for(let z=-40;z<40;z+=1){let rs=null;
    for(let x=-40;x<=40;x+=1){const solid=x<40&&!isOpen(x+.5,z+.5);
      if(solid&&rs===null)rs=x;if((!solid||x===40)&&rs!==null){boxes.push({min:V3(rs,0,z),max:V3(x,4,z+1)});rs=null;}}}
  return boxes;
}
function buildStairBoxes(s){
  const boxes=[],steps=Math.max(2,Math.ceil(s.h/.28));
  for(let i=0;i<steps;i++){
    const h=s.h*(i+1)/steps;
    let x1=s.x1,x2=s.x2,z1=s.z1,z2=s.z2;
    if(s.dir==='+x'){const w=(s.x2-s.x1)/steps;x1=s.x1+i*w;x2=x1+w;}
    else if(s.dir==='-x'){const w=(s.x2-s.x1)/steps;x2=s.x2-i*w;x1=x2-w;}
    else if(s.dir==='+z'){const w=(s.z2-s.z1)/steps;z1=s.z1+i*w;z2=z1+w;}
    else if(s.dir==='-z'){const w=(s.z2-s.z1)/steps;z2=s.z2-i*w;z1=z2-w;}
    boxes.push({min:V3(x1,0,z1),max:V3(x2,h,z2)});}
  return boxes;
}

// 从地图数据构建碰撞体（外墙 + 内墙 + 平台 + 桥面 + 楼梯 + 箱子）
export function buildColliders(md, open){
  const colliders=[];
  for(const b of buildWalls(open)) colliders.push(b);
  for(const[x1,z1,x2,z2,h]of(md.innerWalls||[])) colliders.push({min:V3(x1,0,z1),max:V3(x2,h,z2)});
  for(const[x1,z1,x2,z2,h]of(md.platforms||[])) colliders.push({min:V3(x1,0,z1),max:V3(x2,h,z2)});
  for(const[x1,z1,x2,z2,y]of(md.bridges||[])) colliders.push({min:V3(x1,y-.35,z1),max:V3(x2,y,z2)});
  for(const s of(md.stairs||[])) for(const b of buildStairBoxes(s)) colliders.push(b);
  for(const[cx,cz,s,h,tone,y0]of(md.crates||[])) colliders.push({min:V3(cx-s/2,y0||0,cz-s/2),max:V3(cx+s/2,(y0||0)+h,cz+s/2)});
  // 屋顶碰撞体向上加高：任何跳跃/技能都无法站上屋顶
  for(const[x1,z1,x2,z2,y]of(md.roofs||[])) colliders.push({min:V3(x1,y,z1),max:V3(x2,y+2.6,z2)});
  return colliders;
}

// 双层网格导航：每格采样可站立楼层（地面 + 高台/桥面/楼梯顶 ≤3.2），
// 相邻格高差 ≤.62 才连边（楼梯提供渐变），支持 AI 在高低差地图上寻路
export function buildNav(md, colliders){
  const open = md.open;
  const MARGIN = 0.45;
  const inAny = (x,z)=>open.some(r=>inRect(x,z,r));
  const overlapsM = (b,x,z)=> x>b.min.x-MARGIN && x<b.max.x+MARGIN && z>b.min.z-MARGIN && z<b.max.z+MARGIN;

  const cells = new Map();       // "ix,iz,f" -> {x,z,y:f}
  const byCell = new Map();      // "ix,iz" -> [f,...]
  for(let ix=-40;ix<40;ix++){
    for(let iz=-40;iz<40;iz++){
      const x=ix+.5, z=iz+.5;
      if(!inAny(x,z)) continue;
      const floors=new Set([0]);
      for(const b of colliders){
        if(b.max.y>3.2 || b.max.y<.25) continue;
        if(x>b.min.x-.15 && x<b.max.x+.15 && z>b.min.z-.15 && z<b.max.z+.15) floors.add(Math.round(b.max.y*20)/20);
      }
      for(const f of floors){
        let blocked=false;
        for(const b of colliders){
          if(b.max.y<=f+.45 || b.min.y>=f+1.65) continue;
          if(overlapsM(b,x,z)){ blocked=true; break; }
        }
        if(blocked) continue;
        cells.set(`${ix},${iz},${f}`, {x,z,y:f});
        const ck=`${ix},${iz}`;
        if(!byCell.has(ck)) byCell.set(ck,[]);
        byCell.get(ck).push(f);
      }
    }
  }

  const idx = new Map(), wps=[], edges=[];
  let id=0;
  for(const [key,c] of cells){
    idx.set(key,id++);
    wps.push(V3(c.x, c.y+1.1, c.z));
    edges.push([]);
  }

  const _los=(a,b)=>{const dir=V3(b.x-a.x,b.y-a.y,b.z-a.z);const len=dir.length();if(len<1e-4)return true;dir.divideScalar(len);for(const box of colliders)if(rayAABB(a,dir,box,len)<len)return false;return true;};
  const _edge=(a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,px=-dz/l*.35,pz=dx/l*.35;
    for(const[ox,oz]of[[0,0],[px,pz],[-px,-pz]]){const A=V3(a.x+ox,a.y,a.z+oz),B=V3(b.x+ox,b.y,b.z+oz);if(!_los(A,B))return false;const Al=V3(A.x,a.y-.55,A.z),Bl=V3(B.x,b.y-.55,B.z);if(!_los(Al,Bl))return false;}return true;};
  const nearFloor=(ck,f)=>{
    const fl=byCell.get(ck); if(!fl) return null;
    let best=null,bd=.63;
    for(const g of fl){ const d=Math.abs(g-f); if(d<bd){bd=d;best=g;} }
    return best;
  };

  const STEP = .62;
  for(const [key,c] of cells){
    const i=idx.get(key);
    const [ix,iz] = key.split(',').map(Number);
    const f = c.y;
    const dirs = [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for(const [dx,dz] of dirs){
      const nf = nearFloor(`${ix+dx},${iz+dz}`, f);
      if(nf===null || Math.abs(nf-f)>STEP) continue;
      const k2=`${ix+dx},${iz+dz},${nf}`;
      if(!cells.has(k2)) continue;
      const j=idx.get(k2);
      if(dx!==0 && dz!==0){
        const o1=nearFloor(`${ix+dx},${iz}`, f), o2=nearFloor(`${ix},${iz+dz}`, f);
        if(o1===null || o2===null || Math.abs(o1-f)>STEP || Math.abs(o2-f)>STEP) continue;
      }
      if(edges[i].includes(j)) continue;
      const c2=cells.get(k2);
      if(!_edge(V3(c.x,f+1.1,c.z), V3(c2.x,nf+1.1,c2.z))) continue;
      edges[i].push(j); edges[j].push(i);
    }
  }

  // 先找出进攻出生点可达的最大连通区域，再在该区域内剪死胡同
  const startCells = md.spawns.atk.map(([x,z])=>`${Math.floor(x)},${Math.floor(z)},0`).filter(k=>cells.has(k));
  const start = startCells.length ? idx.get(startCells[0]) : 0;
  const mainSet=new Set([start]), q=[start];
  while(q.length){const c=q.shift();for(const n of edges[c])if(!mainSet.has(n)){mainSet.add(n);q.push(n);}}
  if(mainSet.size!==wps.length) console.warn(`[map ${md.id}] nav disconnected cells: ${wps.length-mainSet.size}`);

  return pruneDeadEnds(wps, edges, md, mainSet);
}

function pruneDeadEnds(wps, edges, md, mainSet){
  const n=wps.length;
  const keep=new Array(n).fill(false);
  for(const i of mainSet) keep[i]=true;
  const protect=new Array(n).fill(false);
  const inRectW=(w,r)=> w.x>=r[0]-.5 && w.x<=r[2]+.5 && w.z>=r[1]-.5 && w.z<=r[3]+.5;
  for(let i=0;i<n;i++){
    if(!keep[i]) continue;
    const w=wps[i];
    const near=(x,z,rad)=>Math.hypot(w.x-x,w.z-z)<rad;
    for(const [x,z] of md.spawns.atk) if(near(x,z,3)){ protect[i]=true; break; }
    for(const [x,z] of md.spawns.def) if(near(x,z,3)){ protect[i]=true; break; }
    if(!protect[i]) for(const k of Object.keys(md.sites||{})) if(inRectW(w,md.sites[k].rect)){ protect[i]=true; break; }
    if(!protect[i]) for(const p of md.defPostList||[]) if(near(p.p[0],p.p[1],3)){ protect[i]=true; break; }
    if(!protect[i]) for(const k of Object.keys(md.atkHolds||{})) for(const h of md.atkHolds[k]) if(near(h.p[0],h.p[1],3)){ protect[i]=true; break; }
    if(!protect[i]) for(const k of Object.keys(md.stages||{})){ const s=md.stages[k]; if(near(s[0],s[1],3)){ protect[i]=true; break; } }
    if(!protect[i]) for(const k of Object.keys(md.chokes||{})){ const c=md.chokes[k]; if(near(c[0],c[1],2.5)){ protect[i]=true; break; } }
    if(!protect[i]) for(const k of Object.keys(md.smokePoints||{})) for(const p of md.smokePoints[k]) if(near(p[0],p[1],2)){ protect[i]=true; break; }
  }
  const deg=edges.map(e=>e.length);
  let changed=true;
  while(changed){
    changed=false;
    for(let i=0;i<n;i++) if(keep[i] && !protect[i] && deg[i]<=1){
      keep[i]=false; changed=true;
      for(const nb of edges[i]) if(keep[nb]) deg[nb]--;
    }
  }
  const remap=new Map(), outW=[], outE=[];
  for(let i=0;i<n;i++) if(keep[i]){ remap.set(i,outW.length); outW.push(wps[i]); outE.push([]); }
  for(let i=0;i<n;i++) if(keep[i]) for(const j of edges[i]) if(keep[j]) outE[remap.get(i)].push(remap.get(j));
  // 二次验证连通性
  const comp=new Array(outW.length).fill(-1); let cid=0;
  for(let i=0;i<outW.length;i++) if(comp[i]===-1){ const q=[i]; comp[i]=cid; while(q.length){ const c=q.shift(); for(const nb of outE[c]) if(comp[nb]===-1){ comp[nb]=cid; q.push(nb);} } cid++; }
  if(cid>1) console.warn(`[map ${md.id}] nav components after prune: ${cid}`);
  return {wps:outW, edges:outE};
}

let wt, ft, ct, mt;
function wallTexture(tone=0x9aa8ad){
  if(wt)return wt;
  const c=document.createElement('canvas');c.width=512;c.height=512;
  const g=c.getContext('2d');
  // 基色：根据地图主色调微调
  const base='#'+tone.toString(16).padStart(6,'0');
  g.fillStyle=base;g.fillRect(0,0,512,512);
  // 大块镶板
  g.strokeStyle='rgba(20,28,34,.28)';g.lineWidth=4;
  for(let y=0;y<=512;y+=128){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();}
  for(let x=0;x<=512;x+=256){g.beginPath();g.moveTo(x,0);g.lineTo(x,512);g.stroke();}
  // 内部细缝
  g.strokeStyle='rgba(20,28,34,.14)';g.lineWidth=2;
  for(let y=64;y<512;y+=128){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();}
  // 轻微污渍
  g.fillStyle='rgba(30,38,44,.08)';
  for(let i=0;i<40;i++){
    const x=Math.random()*512,y=Math.random()*512,r=20+Math.random()*60;
    g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
  // 细微噪点（统一冷灰，不乱）
  for(let i=0;i<2000;i++){
    const v=Math.random()<.5?0:255,a=Math.random()*.035;
    g.fillStyle=`rgba(${v},${v},${v},${a})`;g.fillRect(Math.random()*512,Math.random()*512,2,2);
  }
  wt=new THREE.CanvasTexture(c);wt.wrapS=wt.wrapT=THREE.RepeatWrapping;wt.colorSpace=THREE.SRGBColorSpace;
  return wt;
}
function floorTexture(){
  if(ft)return ft;
  const c=document.createElement('canvas');c.width=512;c.height=512;
  const g=c.getContext('2d');
  g.fillStyle='#5a646d';g.fillRect(0,0,512,512);
  // 大瓷砖
  g.strokeStyle='rgba(18,24,30,.45)';g.lineWidth=3;
  for(let y=0;y<=512;y+=128)for(let x=0;x<=512;x+=128)g.strokeRect(x+1,y+1,126,126);
  // 内部细纹
  g.strokeStyle='rgba(25,32,38,.22)';g.lineWidth=1;
  for(let y=0;y<=512;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();}
  for(let x=0;x<=512;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,512);g.stroke();}
  // 磨损斑点
  g.fillStyle='rgba(35,43,50,.12)';
  for(let i=0;i<30;i++){const x=Math.random()*512,y=Math.random()*512,r=15+Math.random()*45;g.beginPath();g.arc(x,y,r,0,7);g.fill();}
  ft=new THREE.CanvasTexture(c);ft.wrapS=ft.wrapT=THREE.RepeatWrapping;ft.colorSpace=THREE.SRGBColorSpace;
  return ft;
}
function crateTexture(){
  if(ct)return ct;
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#7d6850';g.fillRect(0,0,256,256);
  // 木板条
  g.strokeStyle='rgba(30,22,14,.55)';g.lineWidth=5;
  for(let y=0;y<=256;y+=42){g.beginPath();g.moveTo(0,y);g.lineTo(256,y);g.stroke();}
  g.strokeStyle='rgba(255,235,200,.12)';g.lineWidth=2;
  for(let y=20;y<=256;y+=42){g.beginPath();g.moveTo(0,y);g.lineTo(256,y);g.stroke();}
  // 钉孔
  g.fillStyle='rgba(20,14,10,.5)';
  for(let y=10;y<256;y+=42)for(let x=20;x<256;x+=60)g.fillRect(x,y,4,4);
  ct=new THREE.CanvasTexture(c);ct.wrapS=ct.wrapT=THREE.RepeatWrapping;ct.colorSpace=THREE.SRGBColorSpace;
  return ct;
}
function metalTexture(){
  if(mt)return mt;
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#5e6a72';g.fillRect(0,0,256,256);
  // 金属波纹
  const grad=g.createLinearGradient(0,0,256,256);
  grad.addColorStop(0,'rgba(255,255,255,.08)');grad.addColorStop(.5,'rgba(0,0,0,.08)');grad.addColorStop(1,'rgba(255,255,255,.06)');
  g.fillStyle=grad;g.fillRect(0,0,256,256);
  g.strokeStyle='rgba(15,22,28,.45)';g.lineWidth=3;g.strokeRect(8,8,240,240);
  // 铆钉
  g.fillStyle='rgba(20,28,34,.65)';
  for(const[x,y]of[[20,20],[236,20],[20,236],[236,236]]){g.beginPath();g.arc(x,y,5,0,7);g.fill();}
  mt=new THREE.CanvasTexture(c);mt.wrapS=mt.wrapT=THREE.RepeatWrapping;mt.colorSpace=THREE.SRGBColorSpace;
  return mt;
}
function skyTexture(md){
  const c=document.createElement('canvas');c.width=32;c.height=512;
  const g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,0,512);
  grad.addColorStop(0,md.sky.top);
  grad.addColorStop(.45,md.sky.mid);
  grad.addColorStop(.78,md.sky.bot);
  grad.addColorStop(1,md.sky.bot);
  g.fillStyle=grad;g.fillRect(0,0,32,512);
  // 远距薄云
  g.fillStyle='rgba(255,255,255,.08)';
  for(let i=0;i<6;i++){const y=200+Math.random()*200,r=30+Math.random()*60;g.beginPath();g.arc(16+Math.random()*10-5,y,r,0,7);g.fill();}
  return new THREE.CanvasTexture(c);
}
function letterTexture(ch,color){
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const g=c.getContext('2d');
  g.strokeStyle=color;g.lineWidth=14;g.globalAlpha=.9;
  g.font='900 190px Arial';g.textAlign='center';g.textBaseline='middle';
  g.strokeText(ch,128,138);
  g.lineWidth=4;g.globalAlpha=.55;g.strokeText(ch,128,138);
  return new THREE.CanvasTexture(c);
}

let winT=null;
function windowTexture(){
  if(winT)return winT;
  const c=document.createElement('canvas');c.width=128;c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#3a444c';g.fillRect(0,0,128,256);
  for(let y=14;y<244;y+=34){
    for(let x=12;x<116;x+=28){
      const lit=Math.random()<.3;
      g.fillStyle=lit?'#ffd98a':'#232c33';
      g.fillRect(x,y,16,22);
      if(lit){g.fillStyle='rgba(255,217,138,.25)';g.fillRect(x-3,y-3,22,28);}
    }
  }
  winT=new THREE.CanvasTexture(c);winT.colorSpace=THREE.SRGBColorSpace;
  return winT;
}

// 地图外围环境：环形城镇建筑 + 树木 + 远山剪影
function addEnvironment(scene, md){
  let seed=0;for(const ch of md.id)seed+=ch.charCodeAt(0)*7;
  const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
  const grp=new THREE.Group();
  const boxGeo=new THREE.BoxGeometry(1,1,1);
  const winTex=windowTexture();
  const bMats=[
    new THREE.MeshStandardMaterial({map:winTex,color:md.wallTone,roughness:.92}),
    new THREE.MeshStandardMaterial({map:winTex,color:new THREE.Color(md.wallTone).offsetHSL(0,.02,-.08),roughness:.92}),
    new THREE.MeshStandardMaterial({map:winTex,color:new THREE.Color(md.wallTone).offsetHSL(.02,.03,.05),roughness:.92}),
  ];
  const roofMat=new THREE.MeshStandardMaterial({color:0x33302c,roughness:.95});
  // 环形建筑群
  const N=34;
  for(let i=0;i<N;i++){
    const ang=i/N*Math.PI*2+rnd()*.16;
    const rad=54+rnd()*24;
    const w=5+rnd()*9,d=5+rnd()*9,h=5+rnd()*15;
    const x=Math.cos(ang)*rad,z=Math.sin(ang)*rad;
    const m=new THREE.Mesh(boxGeo,bMats[i%3]);
    m.scale.set(w,h,d);m.position.set(x,h/2-.8,z);m.rotation.y=rnd()*Math.PI;
    grp.add(m);
    if(rnd()<.55){
      const r=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*.75,2.5+rnd()*3,4),roofMat);
      r.position.set(x,h-.8+1.4,z);r.rotation.y=m.rotation.y+Math.PI/4;grp.add(r);
    }
  }
  // 树木
  const trunkMat=new THREE.MeshStandardMaterial({color:0x4a3826,roughness:.95});
  const leafMat=new THREE.MeshStandardMaterial({color:0x2e5c3a,roughness:.95});
  const leafMat2=new THREE.MeshStandardMaterial({color:0x3a6b42,roughness:.95});
  for(let i=0;i<24;i++){
    const ang=i/24*Math.PI*2+rnd()*.3;
    const rad=45+rnd()*9;
    const x=Math.cos(ang)*rad,z=Math.sin(ang)*rad;
    const s=.8+rnd()*.7;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16*s,.24*s,1.6*s,5),trunkMat);
    trunk.position.set(x,.8*s,z);grp.add(trunk);
    const l1=new THREE.Mesh(new THREE.ConeGeometry(1.3*s,2.4*s,6),i%2?leafMat:leafMat2);
    l1.position.set(x,1.6*s+1.1*s,z);grp.add(l1);
    const l2=new THREE.Mesh(new THREE.ConeGeometry(.95*s,1.8*s,6),i%2?leafMat2:leafMat);
    l2.position.set(x,1.6*s+2.2*s,z);grp.add(l2);
  }
  // 远山剪影
  const mtnMat=new THREE.MeshBasicMaterial({color:new THREE.Color(md.sky.fog).offsetHSL(0,0,-.12)});
  for(let i=0;i<9;i++){
    const ang=i/9*Math.PI*2+rnd()*.4;
    const rad=95+rnd()*30;
    const h=22+rnd()*26,r=26+rnd()*22;
    const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,5),mtnMat);
    m.position.set(Math.cos(ang)*rad,h/2-4,Math.sin(ang)*rad);
    m.rotation.y=rnd()*Math.PI;grp.add(m);
  }
  grp.traverse(o=>{o.matrixAutoUpdate=false;o.updateMatrix();});
  scene.add(grp);
}

export function buildMap(scene, mapId){
  const md = MAPS.find(m=>m.id===mapId)||MAPS[0];
  const open = md.open.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const walls = buildWalls(open);
  const colliders = [];

  // 天空 + 雾
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(220,32,16),
    new THREE.MeshBasicMaterial({map:skyTexture(md),side:THREE.BackSide,depthWrite:false,fog:false})));
  scene.fog = new THREE.Fog(md.sky.fog, 45, md.sky.fogFar + 25);
  scene.background = new THREE.Color(md.sky.mid);

  // 太阳盘 + 光晕
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9,32),new THREE.MeshBasicMaterial({color:0xfff4d8,fog:false,transparent:true,opacity:.9}));
  sunDisc.position.set(md.sky.sunPos[0]*2.6, md.sky.sunPos[1]*2.6, md.sky.sunPos[2]*2.6);sunDisc.lookAt(0,0,0);scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(new THREE.CircleGeometry(22,32),new THREE.MeshBasicMaterial({color:md.sky.sun,transparent:true,opacity:.12,fog:false,depthWrite:false}));
  sunGlow.position.copy(sunDisc.position);sunGlow.lookAt(0,0,0);scene.add(sunGlow);

  // 地面
  const ft0=floorTexture();ft0.repeat.set(24,24);
  const floor=new THREE.Mesh(new THREE.BoxGeometry(84,1,84),new THREE.MeshStandardMaterial({map:ft0,color:0xbfc8cd,roughness:.92,metalness:.05}));
  floor.position.y=-.5;floor.receiveShadow=true;scene.add(floor);

  // 开放区域着色 + 边界线
  const tintMat=new THREE.MeshStandardMaterial({color:0x3e4a54,roughness:.94,transparent:true,opacity:.42});
  for(const r of open){
    const m=new THREE.Mesh(new THREE.BoxGeometry(r[2]-r[0],.04,r[3]-r[1]),tintMat);m.position.set((r[0]+r[2])/2,.02,(r[1]+r[3])/2);m.receiveShadow=true;scene.add(m);
  }

  // 点位
  const siteMat=new THREE.MeshStandardMaterial({color:0x2a4a50,roughness:.9,emissive:0x1a3a40,emissiveIntensity:.35});
  const emSite=new THREE.MeshStandardMaterial({color:md.accent,emissive:md.accent,emissiveIntensity:1.8,roughness:.6});
  for(const k of Object.keys(md.sites)){const s=md.sites[k],r=s.rect;
    const m=new THREE.Mesh(new THREE.BoxGeometry(r[2]-r[0],.06,r[3]-r[1]),siteMat);m.position.set((r[0]+r[2])/2,.035,(r[1]+r[3])/2);scene.add(m);
    const letter=new THREE.Mesh(new THREE.PlaneGeometry(7,7),new THREE.MeshBasicMaterial({map:letterTexture(k,'#7fd0d4'),transparent:true,depthWrite:false}));letter.rotation.x=-Math.PI/2;letter.position.set(s.plant[0],.09,s.plant[1]);scene.add(letter);
    // 发光边框
    const stripW=new THREE.Mesh(new THREE.BoxGeometry(r[2]-r[0],.12,.22),emSite);stripW.position.set((r[0]+r[2])/2,.07,r[1]);scene.add(stripW);
    const stripE=stripW.clone();stripE.position.z=r[3];scene.add(stripE);
    const stripN=new THREE.Mesh(new THREE.BoxGeometry(.22,.12,r[3]-r[1]),emSite);stripN.position.set(r[0],.07,(r[1]+r[3])/2);scene.add(stripN);
    const stripS=stripN.clone();stripS.position.x=r[2];scene.add(stripS);
  }

  // 外墙 InstancedMesh
  const wt0=wallTexture(md.wallTone);wt0.repeat.set(2,1);
  const wallGeo=new THREE.BoxGeometry(1,1,1),wallMat=new THREE.MeshStandardMaterial({map:wt0,color:md.wallTone,roughness:.82,metalness:.08});
  const inst=new THREE.InstancedMesh(wallGeo,wallMat,walls.length);
  const M=new THREE.Matrix4(),colBase=new THREE.Color(0xffffff);
  walls.forEach((b,i)=>{const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;M.makeScale(sx,sy,sz);M.setPosition((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2);inst.setMatrixAt(i,M);inst.setColorAt(i,colBase.clone().offsetHSL(0,0,((i*7)%13)*.005-.025));colliders.push(b);});
  inst.castShadow=true;inst.receiveShadow=true;scene.add(inst);

  // 内墙 + 发光腰线
  const mmExtra = [];
  const iwMat=new THREE.MeshStandardMaterial({map:wallTexture(md.wallTone),color:md.wallTone,roughness:.82,metalness:.08});
  const stripMat=new THREE.MeshStandardMaterial({color:md.accent,emissive:md.accent,emissiveIntensity:1.5,roughness:.6});
  for(const[x1,z1,x2,z2,h]of(md.innerWalls||[])){
    const w=x2-x1,d=z2-z1;
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),iwMat);m.position.set((x1+x2)/2,h/2,(z1+z2)/2);m.castShadow=true;m.receiveShadow=true;scene.add(m);colliders.push({min:V3(x1,0,z1),max:V3(x2,h,z2)});mmExtra.push({x1,z1,x2,z2,type:'wall'});
    // 顶部/侧面发光条：长边加
    if(w>d && w>2.5){const strip=new THREE.Mesh(new THREE.BoxGeometry(w,.10,.12),stripMat);strip.position.set((x1+x2)/2,h-.05,(z1+z2)/2);scene.add(strip);}
    else if(d>=w && d>2.5){const strip=new THREE.Mesh(new THREE.BoxGeometry(.12,.10,d),stripMat);strip.position.set((x1+x2)/2,h-.05,(z1+z2)/2);scene.add(strip);}
  }

  // 高台+楼梯
  const mt0=metalTexture(),platMat=new THREE.MeshStandardMaterial({map:mt0,color:0x9fb0ba,roughness:.75,metalness:.35});
  for(const[x1,z1,x2,z2,h]of(md.platforms||[])){const m=new THREE.Mesh(new THREE.BoxGeometry(x2-x1,h,z2-z1),platMat);m.position.set((x1+x2)/2,h/2,(z1+z2)/2);m.castShadow=true;m.receiveShadow=true;scene.add(m);colliders.push({min:V3(x1,0,z1),max:V3(x2,h,z2)});mmExtra.push({x1,z1,x2,z2,type:'plat'});
    const edge=new THREE.Mesh(new THREE.BoxGeometry(x2-x1,.08,.12),new THREE.MeshStandardMaterial({color:md.accent,emissive:md.accent,emissiveIntensity:1.4}));edge.position.set((x1+x2)/2,h+.04,z2);scene.add(edge);}
  for(const s of(md.stairs||[]))for(const b of buildStairBoxes(s)){const m=new THREE.Mesh(new THREE.BoxGeometry(b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z),platMat);m.position.set((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2);m.castShadow=true;m.receiveShadow=true;scene.add(m);colliders.push(b);}

  // 桥面（可上可下穿）：悬空板 + 发光沿
  for(const[x1,z1,x2,z2,y]of(md.bridges||[])){
    const m=new THREE.Mesh(new THREE.BoxGeometry(x2-x1,.35,z2-z1),platMat);
    m.position.set((x1+x2)/2,y-.175,(z1+z2)/2);m.castShadow=true;m.receiveShadow=true;scene.add(m);
    colliders.push({min:V3(x1,y-.35,z1),max:V3(x2,y,z2)});
    mmExtra.push({x1,z1,x2,z2,type:'plat'});
    const glowMat=new THREE.MeshStandardMaterial({color:md.accent,emissive:md.accent,emissiveIntensity:1.4});
    const e1=new THREE.Mesh(new THREE.BoxGeometry(x2-x1,.07,.1),glowMat);e1.position.set((x1+x2)/2,y+.03,z1+.05);scene.add(e1);
    const e2=e1.clone();e2.position.z=z2-.05;scene.add(e2);
  }

  // 箱子（支持第 6 位参数 y0：放置在高台/桥面上）
  const ct0=crateTexture();
  for(const[cx,cz,s,h,tone,y0]of md.crates){const base=y0||0;const m=new THREE.Mesh(new THREE.BoxGeometry(s,h,s),new THREE.MeshStandardMaterial({map:tone?mt0:ct0,roughness:.85,metalness:tone?.25:0}));m.position.set(cx,base+h/2,cz);m.castShadow=true;m.receiveShadow=true;scene.add(m);colliders.push({min:V3(cx-s/2,base,cz-s/2),max:V3(cx+s/2,base+h,cz+s/2)});mmExtra.push({x1:cx-s/2,z1:cz-s/2,x2:cx+s/2,z2:cz+s/2,type:'crate'});}

  // 屋顶（可从下方穿行）：平板 + 屋脊 + 檐口发光条
  const roofMat=new THREE.MeshStandardMaterial({color:0x4a3f36,roughness:.9,metalness:.05});
  const ridgeMat=new THREE.MeshStandardMaterial({color:0x3a322b,roughness:.9});
  for(const[x1,z1,x2,z2,y]of(md.roofs||[])){
    const w=x2-x1,d=z2-z1;
    const slab=new THREE.Mesh(new THREE.BoxGeometry(w,.25,d),roofMat);
    slab.position.set((x1+x2)/2,y+.125,(z1+z2)/2);slab.castShadow=true;slab.receiveShadow=true;scene.add(slab);
    // 简易坡屋脊
    const ridge=new THREE.Mesh(new THREE.BoxGeometry(w>d?w:.5,.55,w>d?.5:d),ridgeMat);
    ridge.position.set((x1+x2)/2,y+.5,(z1+z2)/2);ridge.castShadow=true;scene.add(ridge);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(w,.08,.1),new THREE.MeshStandardMaterial({color:md.accent,emissive:md.accent,emissiveIntensity:1.2}));
    trim.position.set((x1+x2)/2,y+.02,z1+.05);scene.add(trim);
    const trim2=trim.clone();trim2.position.z=z2-.05;scene.add(trim2);
    colliders.push({min:V3(x1,y,z1),max:V3(x2,y+2.6,z2)});   // 碰撞体加高：屋顶不可站立
  }

  // 周围环境装饰（地图边界外：城镇建筑、树木、远山）
  addEnvironment(scene, md);

  G.colliders = colliders;

  // 自动生成网格导航图
  const nav = buildNav(md, colliders);
  const wps = nav.wps, edges = nav.edges;

  G.map = {
    id:md.id,name:md.name,data:md,
    walls,wps,edges,
    openRects:open,
    sites:Object.fromEntries(Object.entries(md.sites).map(([k,s])=>[k,{min:{x:s.rect[0],z:s.rect[1]},max:{x:s.rect[2],z:s.rect[3]},plant:s.plant,rect:s.rect}])),
    siteKeys:Object.keys(md.sites),
    defPostList:md.defPostList,atkHolds:md.atkHolds,
    smokePoints:md.smokePoints,chokes:md.chokes,stages:md.stages,
    spawns:{atk:md.spawns.atk.map(([x,z])=>({pos:V3(x,0,z),yaw:md.spawns.atkYaw})),def:md.spawns.def.map(([x,z])=>({pos:V3(x,0,z),yaw:md.spawns.defYaw}))},
    barriers:md.barriers.map(b=>({min:V3(b.rect[0],0,b.rect[1]),max:V3(b.rect[2],4,b.rect[3]),side:b.side})),
    accent:md.accent,mmExtra
  };

  // 确保出生点不在墙里 / 地图外：若非法则吸附到最近可用导航格
  function safeSpawn(pos){
    const open=G.map.openRects;
    const inAny=(x,z)=>open.some(r=>x>=r[0]&&x<=r[2]&&z>=r[1]&&z<=r[3]);
    const inSolid=(x,z)=>G.colliders.some(b=>b.max.y>0.5 && b.min.y<=1.4 && x>=b.min.x-0.35 && x<=b.max.x+0.35 && z>=b.min.z-0.35 && z<=b.max.z+0.35);
    if(inAny(pos.x,pos.z) && !inSolid(pos.x,pos.z)) return;
    let best=null,bd=Infinity;
    for(const w of G.map.wps){
      if(!inAny(w.x,w.z)) continue;
      if(inSolid(w.x,w.z)) continue;
      const d=Math.hypot(w.x-pos.x,w.z-pos.z);
      if(d<bd){ bd=d; best=w; }
    }
    if(best){ pos.x=best.x; pos.z=best.z; }
  }
  for(const s of G.map.spawns.atk) safeSpawn(s.pos);
  for(const s of G.map.spawns.def) safeSpawn(s.pos);
}

export function validateMaps(){
  const out={};
  for(const md of MAPS){
    const open=md.open.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const colliders=buildColliders(md, open);
    const nav=buildNav(md, colliders);
    out[md.id]={totalCells:nav.wps.length, unreachable:nav.wps.length<1?1:0};
  }
  return out;
}

export function nearestWp(pos, yw=2){
  let best=0,bd=Infinity;
  G.map.wps.forEach((w,i)=>{const d=dist2d(w,pos)+Math.abs((w.y-1.1)-pos.y)*yw;if(d<bd){bd=d;best=i;}});
  return best;
}
// 路径线段是否畅通（带玩家半径余量，检查静态和动态碰撞体；高度相对判定，支持高台/桥面）
export function pathClear(a,b, margin=.45){
  const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
  const len = Math.hypot(dx,dy,dz); if(len<1e-4) return true;
  const l2 = Math.hypot(dx,dz)||1;
  const px = -dz/l2*margin, pz = dx/l2*margin;
  const feet = Math.min(a.y,b.y) - 1.1;
  for(const list of [G.colliders, G.dynColliders]){
    for(const box of list){
      if(box.max.y < feet + .45) continue;         // 脚下楼层 / 可跨矮台阶
      if(box.min.y > feet + 1.8) continue;         // 高于头顶（桥面/屋顶下穿行）
      for(const off of [[0,0],[px,pz],[-px,-pz]]){
        const o = V3(a.x+off[0], a.y, a.z+off[1]);
        const dir = V3(dx,dy,dz); dir.divideScalar(len);
        if(rayAABB(o, dir, box, len) < len) return false;
        if(rayAABB(V3(o.x,o.y-.55,o.z), dir, box, len) < len) return false;
      }
    }
  }
  return true;
}

// 把目标点吸附到最近导航节点所在楼层（使高台/桥面上的驻点获得正确高度）
export function snapToNav(p){
  let best=null,bd=Infinity;
  for(const w of G.map.wps){ const d=dist2d(w,p); if(d<bd){ bd=d; best=w; } }
  if(best) p.y = Math.max(0, best.y - 1.1);
  return p;
}

// ---- A* pathfinding with diagonal edges ----
function heappush(h, id, f){
  let i = h.length; h.push({id, f});
  while(i>0){ const p=(i-1)>>1; if(h[p].f <= f) break; h[i]=h[p]; i=p; }
  h[i] = {id, f};
}
function heappop(h){
  if(h.length===1) return h.pop();
  const r=h[0]; const last=h.pop();
  let i=0, n=h.length;
  while(true){
    let sm=i, l=i*2+1, r=l+1;
    if(l<n && h[l].f<h[sm].f) sm=l;
    if(r<n && h[r].f<h[sm].f) sm=r;
    if(sm===i) break;
    h[i]=h[sm]; i=sm;
  }
  h[i]=last;
  return r;
}
export function findPath(fromPos, toPos, jitter=0){
  const { wps, edges } = G.map;
  const a = nearestWp(fromPos), b = nearestWp(toPos);
  if(a===b) return [];
  const n = wps.length;
  const c2d = (i,j)=>{ const dx=wps[i].x-wps[j].x, dz=wps[i].z-wps[j].z; return Math.hypot(dx,dz); };
  const cost = (i,j)=> c2d(i,j) * (Math.abs(wps[i].y-wps[j].y)>.2?1.35:1);
  const g = new Float32Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  g[a] = 0;
  const open = [];
  heappush(open, a, c2d(a,b));
  let found = false;
  while(open.length){
    const cur = heappop(open).id ?? heappop(open); // unwrap if stored as object
    if(cur === b){ found = true; break; }
    for(const nx of edges[cur]){
      const tg = g[cur] + cost(cur, nx);
      if(tg < g[nx]){
        g[nx] = tg; cameFrom[nx] = cur;
        heappush(open, nx, tg + c2d(nx, b) * (jitter>0?(.85+Math.random()*jitter):1));
      }
    }
  }
  if(!found) return [];
  const raw=[]; let c=b; while(c!==a){ raw.push(c); c=cameFrom[c]; } raw.push(a); raw.reverse();
  return raw.map(i=> wps[i].clone ? wps[i].clone() : V3(wps[i].x,wps[i].y,wps[i].z));
}
