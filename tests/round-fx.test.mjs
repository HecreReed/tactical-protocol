import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { G } from '../src/state.js?v=30';
import { V3 } from '../src/utils.js';
import { initFX, targetRing, updateFX, clearRoundFX } from '../src/effects.js';

function setup(){
  const scene = new THREE.Scene();
  initFX(scene);
  G.scene = scene;
  G.player = null;
  G.now = 10;
  G.smokes.length=0; G.zones.length=0; G.dynColliders.length=0;
  G.corpses.length=0; G.turrets.length=0; G.traps.length=0;
  G.drops.length=0; G.projectiles.length=0;
  G.transientFX.length=0;
  return scene;
}

test('target rings use millisecond durations on the game clock', () => {
  const scene=setup();
  const ring=targetRing(V3(2,0,3),4,900);
  assert.equal(scene.children.includes(ring),true);
  assert.equal(G.transientFX.length,1);
  G.now=10.89; updateFX(.89);
  assert.equal(scene.children.includes(ring),true);
  G.now=10.91; updateFX(.02);
  assert.equal(scene.children.includes(ring),false);
  assert.equal(G.transientFX.length,0);
});

test('round cleanup removes target rings and pending round events immediately', () => {
  const scene=setup();
  const ring=targetRing(V3(),3,2600);
  G.abilityEvents.push({at:G.now+2,callback(){},tag:'test'});
  G.castMode={kind:'aim'};
  clearRoundFX();
  assert.equal(scene.children.includes(ring),false);
  assert.equal(G.transientFX.length,0);
  assert.equal(G.abilityEvents.length,0);
  assert.equal(G.castMode,null);
});
