import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS } from '../src/agentCatalog.js';
import {
  initAgentState, primeJettDash, consumeJettDash, activateReturnAnchor,
  resolveAgentFatality, handleAgentKill, setViperEmitter, tickAgentState,
} from '../src/agentMechanics.js';

function ent(agent){
  return { agent, hp:100, armor:0, pos:{x:0,y:0,z:0}, abilityState:{}, resources:{}, ab:{ e:{n:0} } };
}

test('core roster uses official names and agent-specific signatures', () => {
  const names = ['Jett','Phoenix','Brimstone','Omen','Sova','Sage','Raze','Killjoy','Breach','Viper','KAY/O'];
  for(const name of names){
    const agent = Object.values(AGENTS).find(a => a.name===name);
    assert.ok(agent, name);
    assert.ok(agent.ab.e.impl.startsWith(name.toLowerCase().replace('/','')), name);
  }
});

test('Jett Tailwind must be primed before its directional dash', () => {
  const jett = ent('jett');
  initAgentState(jett);
  primeJettDash(jett, 10);
  assert.equal(consumeJettDash(jett, 9.9), false);
  assert.equal(consumeJettDash(jett, 10.1), true);
  assert.equal(consumeJettDash(jett, 10.2), false);
});

test('Jett Blade Storm refills all knives on a kill', () => {
  const jett = ent('jett');
  initAgentState(jett);
  jett.knifeUlt = 1;
  handleAgentKill(jett, {}, 5);
  assert.equal(jett.knifeUlt, 5);
});

test('Phoenix Run it Back intercepts death and restores the anchor', () => {
  const phoenix = ent('phoenix');
  phoenix.pos = { x:8, y:0, z:4 };
  activateReturnAnchor(phoenix, 20);
  phoenix.pos = { x:30, y:0, z:30 };
  phoenix.hp = -20;
  assert.equal(resolveAgentFatality(phoenix, 12).prevented, true);
  assert.deepEqual(phoenix.pos, { x:8, y:0, z:4 });
  assert.equal(phoenix.hp, 100);
});

test('Raze Paint Shells recharges after two kills', () => {
  const raze = ent('raze');
  raze.ab.e = { n:0, def:{ max:1 } };
  initAgentState(raze);
  handleAgentKill(raze, {}, 1);
  assert.equal(raze.ab.e.n, 0);
  handleAgentKill(raze, {}, 2);
  assert.equal(raze.ab.e.n, 1);
});

test('Viper fuel drains while emitters are active and regenerates while off', () => {
  const viper = ent('viper');
  initAgentState(viper);
  setViperEmitter(viper, 'screen', true);
  tickAgentState(viper, 1, 2);
  assert.equal(viper.resources.fuel, 70);
  setViperEmitter(viper, 'screen', false);
  tickAgentState(viper, 3, 2);
  assert.equal(viper.resources.fuel, 80);
});

test('KAY/O enters a revivable downed state during NULL/cmd', () => {
  const kayo = ent('kayo');
  initAgentState(kayo);
  kayo.abilityState.nullCmdUntil = 30;
  kayo.hp = -10;
  const result = resolveAgentFatality(kayo, 20);
  assert.equal(result.prevented, true);
  assert.equal(kayo.channel, 'downed');
  assert.equal(kayo.abilityState.downedUntil, 35);
});
