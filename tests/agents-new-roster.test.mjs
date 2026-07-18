import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS } from '../src/agentCatalog.js';
import {
  initAgentState, placeAstraStar, consumeAstraStar, reclaimGekkoGlobule,
  consumeIsoShield, canClovePostDeathCast, activateCloveRevive,
  harmonizePair, isDebuffImmune, placeReturnAnchor, returnToLightAnchor,
  selectTejoTarget,
} from '../src/agentMechanics.js';

const ent = (agent,id=1) => ({agent,id,team:'ally',alive:true,hp:100,pos:{x:0,y:0,z:0},abilityState:{},resources:{},ab:{}});

test('all ten missing agents have four unique playable runtime types', () => {
  for(const id of ['astra','clove','gekko','iso','miks','tejo','veto','vyse','waylay','yoru']){
    const types=Object.values(AGENTS[id].ab).map(a=>a.type);
    assert.equal(new Set(types).size,4,id);
    assert.equal(types.every(type=>type.startsWith(id)),true,`${id}: ${types.join(', ')}`);
  }
});

test('Astra stars are finite and can be consumed once', () => {
  const astra=ent('astra');initAgentState(astra);
  const star=placeAstraStar(astra,{x:4,y:0,z:2});
  assert.equal(astra.resources.stars,3);
  assert.equal(consumeAstraStar(astra,star.id,'gravity'),true);
  assert.equal(consumeAstraStar(astra,star.id,'nova'),false);
});

test('Clove can cast Ruse after death and revive only inside the ultimate window', () => {
  const clove=ent('clove');clove.alive=false;clove.abilityState.cloveDeathUntil=20;
  assert.equal(canClovePostDeathCast(clove,'cloveRuse',15),true);
  assert.equal(canClovePostDeathCast(clove,'cloveMeddle',15),false);
  clove.abilityState.cloveReviveUntil=18;
  assert.equal(activateCloveRevive(clove,17),true);
  assert.equal(clove.alive,true);
});

test('Gekko can reclaim a creature globule once', () => {
  const gekko=ent('gekko');initAgentState(gekko);
  gekko.resources.globules.wingman={until:12};
  assert.equal(reclaimGekkoGlobule(gekko,'wingman',10),true);
  assert.equal(reclaimGekkoGlobule(gekko,'wingman',10),false);
});

test('Iso Double Tap shield blocks one damage instance', () => {
  const iso=ent('iso');iso.abilityState.isoShield=true;
  assert.equal(consumeIsoShield(iso),true);
  assert.equal(consumeIsoShield(iso),false);
});

test('Miks Harmonize applies the same refresh window to both players', () => {
  const miks=ent('miks',1),ally=ent('jett',2);
  harmonizePair(miks,ally,10);
  assert.equal(miks.abilityState.harmonizeUntil,20);
  assert.equal(ally.abilityState.harmonizeUntil,20);
});

test('Veto Evolution makes all debuffs ineffective', () => {
  const veto=ent('veto');veto.abilityState.evolutionUntil=30;
  assert.equal(isDebuffImmune(veto,20),true);
  assert.equal(isDebuffImmune(veto,31),false);
});

test('Waylay and Yoru return anchors restore their stored position', () => {
  for(const agent of ['waylay','yoru']){
    const actor=ent(agent);actor.pos={x:3,y:0,z:4};placeReturnAnchor(actor,agent,20);
    actor.pos={x:20,y:0,z:20};assert.equal(returnToLightAnchor(actor,agent,10),true);
    assert.deepEqual(actor.pos,{x:3,y:0,z:4});
  }
});

test('Tejo Guided Salvo accepts exactly two map targets', () => {
  const tejo=ent('tejo');
  assert.equal(selectTejoTarget(tejo,{x:1,z:2}),1);
  assert.equal(selectTejoTarget(tejo,{x:3,z:4}),2);
  assert.equal(selectTejoTarget(tejo,{x:5,z:6}),2);
});
