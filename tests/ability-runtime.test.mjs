import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUtilityStore, registerUtility, damageUtility, recallUtility,
  interceptProjectile, tickUtilities, beginControl, endControl,
  validTeleportDestination,
} from '../src/abilityRuntime.js';

test('destructible utility uses stable ids and fires its destroy callback', () => {
  const store = createUtilityStore();
  const destroyed = [];
  const utility = registerUtility(store, { type:'turret', team:'ally', ownerId:7, hp:100, onDestroy:u=>destroyed.push(u.id) });
  assert.equal(utility.id, 'utility-1');
  assert.equal(damageUtility(store, utility.id, 40, 'enemy'), false);
  assert.equal(utility.hp, 60);
  assert.equal(damageUtility(store, utility.id, 60, 'enemy'), true);
  assert.deepEqual(destroyed, ['utility-1']);
  assert.equal(store.items.length, 0);
});

test('friendly damage cannot destroy owned utility', () => {
  const store = createUtilityStore();
  const utility = registerUtility(store, { type:'camera', team:'ally', ownerId:3, hp:20 });
  damageUtility(store, utility.id, 50, 'ally');
  assert.equal(utility.hp, 20);
});

test('only the owner can recall recallable utility', () => {
  const store = createUtilityStore();
  const utility = registerUtility(store, { type:'anchor', team:'ally', ownerId:3, recallable:true });
  assert.equal(recallUtility(store, utility.id, 8), null);
  assert.equal(recallUtility(store, utility.id, 3), utility);
  assert.equal(store.items.length, 0);
});

test('interceptors only remove nearby enemy projectiles that opt in', () => {
  const store = createUtilityStore();
  registerUtility(store, { type:'interceptor', team:'ally', ownerId:2, active:true, radius:5, pos:{x:0,y:0,z:0} });
  const hostile = { team:'enemy', pos:{x:3,y:0,z:0}, interceptable:true };
  const friendly = { team:'ally', pos:{x:2,y:0,z:0}, interceptable:true };
  const beam = { team:'enemy', pos:{x:1,y:0,z:0}, interceptable:false };
  assert.equal(interceptProjectile(store, hostile), true);
  assert.equal(interceptProjectile(store, friendly), false);
  assert.equal(interceptProjectile(store, beam), false);
});

test('expired utility is removed on the game clock', () => {
  const store = createUtilityStore();
  registerUtility(store, { type:'smoke-anchor', team:'ally', ownerId:1, until:12 });
  tickUtilities(store, 11.9);
  assert.equal(store.items.length, 1);
  tickUtilities(store, 12);
  assert.equal(store.items.length, 0);
});

test('controlled units return control to their original owner', () => {
  const state = { controlMode:null };
  const owner = { id:1 };
  const unit = { id:'drone-1' };
  beginControl(state, owner, unit, 10);
  assert.equal(state.controlMode.unit, unit);
  assert.equal(endControl(state), owner);
  assert.equal(state.controlMode, null);
});

test('teleport destinations require both walkable space and clearance', () => {
  const point = { x:5, y:0, z:4 };
  assert.equal(validTeleportDestination(point, { inBounds:()=>true, blocked:()=>false }), true);
  assert.equal(validTeleportDestination(point, { inBounds:()=>false, blocked:()=>false }), false);
  assert.equal(validTeleportDestination(point, { inBounds:()=>true, blocked:()=>true }), false);
});
