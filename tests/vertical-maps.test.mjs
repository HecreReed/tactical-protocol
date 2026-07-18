import test from 'node:test';
import assert from 'node:assert/strict';
import { G } from '../src/state.js?v=29';
import { V3 } from '../src/utils.js';
import { MAPS, buildColliders, buildNav, findPath, navDistance, snapToNav } from '../src/map.js';

const NEW_IDS=['yunque','chaomen','chilian','jingcheng','longji'];

function point3(raw){
  if(Array.isArray(raw))return V3(raw[0],raw[2]??0,raw[1]);
  if(raw?.p)return V3(raw.p[0],raw.y??raw.p[2]??0,raw.p[1]);
  return V3(raw.x,raw.y??0,raw.z);
}

function install(md){
  const colliders=buildColliders(md,md.open);
  const nav=buildNav(md,colliders);
  G.colliders=colliders;G.dynColliders=[];
  G.map={id:md.id,wps:nav.wps,edges:nav.edges,openRects:md.open};
  return nav;
}

function tacticalPoints(md){
  const out=[];
  for(const site of Object.values(md.sites))out.push(site.plant);
  out.push(...Object.values(md.stages||{}));
  out.push(...(md.defPostList||[]));
  for(const holds of Object.values(md.atkHolds||{}))out.push(...holds);
  return out;
}

test('catalog includes five named vertical maps',()=>{
  assert.equal(MAPS.length,16);
  assert.deepEqual(NEW_IDS.filter(id=>!MAPS.some(map=>map.id===id)),[]);
});

for(const id of NEW_IDS){
  test(`${id} has complex multi-level combat structure`,()=>{
    const md=MAPS.find(map=>map.id===id);
    assert.ok(md,id);
    assert.ok(md.open.length>=16,`${id} open areas`);
    assert.ok(md.stairs.length>=3,`${id} stairs`);
    assert.ok(md.bridges.length>=1,`${id} bridge`);
    assert.ok(md.platforms.length>=2,`${id} platforms`);
    const heightBands=new Set([0,...md.platforms.map(p=>p[4]),...md.bridges.map(b=>b[4])]);
    assert.ok(heightBands.size>=3,`${id} height bands`);
    assert.ok(md.stairs.some(st=>md.bridges.some(bridge=>Math.abs(st.h-bridge[4])<.3)),`${id} bridge access`);
    const elevated=tacticalPoints(md).some(raw=>{
      if(Array.isArray(raw))return (raw[2]||0)>1;
      return (raw.y??raw.p?.[2]??0)>1;
    });
    assert.equal(elevated,true,`${id} elevated tactical point`);
    assert.ok(Object.keys(md.sites).length>=2,`${id} sites`);
  });

  test(`${id} connects every spawn to every tactical objective`,()=>{
    const md=MAPS.find(map=>map.id===id);
    if(!md)return assert.fail(`${id} missing`);
    install(md);
    const failures=[];
    for(const spawn of [...md.spawns.atk,...md.spawns.def]){
      const from=point3(spawn);
      for(const raw of tacticalPoints(md)){
        const to=snapToNav(point3(raw));
        if(navDistance(from,to)>1.1&&!findPath(from,to,2).length)failures.push([spawn,raw]);
      }
    }
    assert.deepEqual(failures,[]);
  });
}
