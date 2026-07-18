import test from 'node:test';
import assert from 'node:assert/strict';
import { G } from '../src/state.js?v=29';
import { V3 } from '../src/utils.js';
import {
  MAPS, buildColliders, buildNav, findPath, getLastPathStats,
  navDistance, atNavGoal, snapToNav,
} from '../src/map.js';

function point3(point, fallbackY=0){
  if(Array.isArray(point)) return V3(point[0], point[2] ?? fallbackY, point[1]);
  if(point?.p) return V3(point.p[0], point.y ?? point.p[2] ?? fallbackY, point.p[1]);
  return V3(point.x, point.y ?? fallbackY, point.z);
}

function installMap(md){
  const colliders = buildColliders(md, md.open);
  const nav = buildNav(md, colliders);
  G.colliders = colliders;
  G.dynColliders = [];
  G.map = { id:md.id, wps:nav.wps, edges:nav.edges, openRects:md.open };
  return nav;
}

function tacticalPoints(md){
  const points = [];
  for(const [site, data] of Object.entries(md.sites)) points.push([`${site} plant`, data.plant]);
  for(const [site, point] of Object.entries(md.stages || {})) points.push([`${site} stage`, point]);
  for(const [index, post] of (md.defPostList || []).entries()) points.push([`def post ${index}`, post]);
  for(const [site, holds] of Object.entries(md.atkHolds || {})){
    holds.forEach((hold, index)=>points.push([`${site} hold ${index}`, hold]));
  }
  return points;
}

test('all existing map spawns can reach every critical tactical point', () => {
  const failures = [];
  for(const md of MAPS){
    installMap(md);
    const spawns = [...md.spawns.atk, ...md.spawns.def];
    for(let spawnIndex=0; spawnIndex<spawns.length; spawnIndex++){
      const from = point3(spawns[spawnIndex]);
      for(const [label, raw] of tacticalPoints(md)){
        const to = snapToNav(point3(raw));
        const path = findPath(from, to, 0);
        if(!path.length && navDistance(from, to) > 1.1){
          failures.push(`${md.id} spawn ${spawnIndex} -> ${label}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('route seeds are deterministic and never finalize a waypoint twice', () => {
  const md = MAPS[0];
  installMap(md);
  const from = point3(md.spawns.atk[0]);
  const to = snapToNav(point3(Object.values(md.sites)[0].plant));
  const first = findPath(from, to, 3).map(p=>[p.x,p.y,p.z]);
  const firstStats = getLastPathStats();
  const second = findPath(from, to, 3).map(p=>[p.x,p.y,p.z]);
  const secondStats = getLastPathStats();
  assert.deepEqual(first, second);
  assert.equal(firstStats.duplicateFinalized, 0);
  assert.equal(secondStats.duplicateFinalized, 0);
  assert.ok(firstStats.finalized <= G.map.wps.length);
});

test('floor-aware goal checks reject a position directly below the goal', () => {
  const feet = V3(4, 0, 7);
  const bridge = V3(4, 3, 7);
  assert.ok(navDistance(feet, bridge) > 2.5);
  assert.equal(atNavGoal(feet, bridge, 1.1), false);
  assert.equal(atNavGoal(V3(4.4, 3, 7.3), bridge, 1.1), true);
});

test('snapToNav respects an explicitly requested floor', () => {
  G.map = {
    wps:[V3(5,1.1,5), V3(5,4.1,5)],
    edges:[[],[]],
  };
  const upper = snapToNav(V3(5.1,3,5.1));
  const lower = snapToNav(V3(5.1,0,5.1));
  assert.ok(Math.abs(upper.y - 3) < 1e-9);
  assert.ok(Math.abs(lower.y) < 1e-9);
});
