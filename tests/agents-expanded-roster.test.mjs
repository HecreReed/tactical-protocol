import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS } from '../src/agentCatalog.js';
import {
  initAgentState, handleAgentKill, consumeReynaSoul, startNeonSprint,
  useNeonSlide, placeRendezvous, useRendezvous, canNeuralTheft,
  applySkyeRegrowth,
} from '../src/agentMechanics.js';

const ent = agent => ({ agent, id:1, team:'ally', hp:60, pos:{x:1,y:0,z:2}, abilityState:{}, resources:{}, ab:{} });

test('expanded roster does not dispatch through unrelated legacy ability types', () => {
  const forbidden = new Set(['tripwire','cage','paranoia','heal','flash','boomBot','firewall','shock','stim','orbital','slowProj','wall','bigStun','shadowStep']);
  for(const id of ['cypher','reyna','skye','neon','harbor','fade','deadlock','chamber']){
    for(const ability of Object.values(AGENTS[id].ab)) assert.equal(forbidden.has(ability.type), false, `${id}:${ability.type}`);
  }
});

test('Reyna can only consume a live soul orb once', () => {
  const reyna = ent('reyna');
  initAgentState(reyna);
  handleAgentKill(reyna, {pos:{x:4,y:0,z:5}}, 10);
  assert.equal(consumeReynaSoul(reyna, 'devour', 12), true);
  assert.equal(consumeReynaSoul(reyna, 'dismiss', 12), false);
  handleAgentKill(reyna, {pos:{x:4,y:0,z:5}}, 20);
  assert.equal(consumeReynaSoul(reyna, 'dismiss', 24), false);
});

test('Neon sprint spends energy and slide has a kill-recharged charge', () => {
  const neon = ent('neon');
  initAgentState(neon);
  assert.equal(startNeonSprint(neon), true);
  assert.equal(useNeonSlide(neon), true);
  assert.equal(useNeonSlide(neon), false);
  handleAgentKill(neon, {}, 2);
  handleAgentKill(neon, {}, 3);
  assert.equal(useNeonSlide(neon), true);
});

test('Chamber Rendezvous requires an anchor and returns to it', () => {
  const chamber = ent('chamber');
  initAgentState(chamber);
  assert.equal(useRendezvous(chamber, 1), false);
  placeRendezvous(chamber, {x:3,y:0,z:4});
  chamber.pos = {x:20,y:0,z:20};
  assert.equal(useRendezvous(chamber, 1), true);
  assert.deepEqual(chamber.pos, {x:3,y:0,z:4});
});

test('Cypher Neural Theft requires a recent enemy corpse', () => {
  const cypher = ent('cypher');
  assert.equal(canNeuralTheft(cypher, [], 10), false);
  assert.equal(canNeuralTheft(cypher, [{ent:{team:'enemy'},diedAt:4,pos:{x:1,z:3}}], 10), true);
  assert.equal(canNeuralTheft(cypher, [{ent:{team:'enemy'},diedAt:1,pos:{x:1,z:3}}], 10), false);
});

test('Skye Regrowth heals allies but never Skye herself', () => {
  const skye = ent('skye');
  const ally = {...ent('jett'), id:2, hp:40};
  const enemy = {...ent('jett'), id:3, team:'enemy', hp:40};
  initAgentState(skye);
  applySkyeRegrowth(skye, [skye,ally,enemy], 1);
  assert.equal(skye.hp, 60);
  assert.ok(ally.hp > 40);
  assert.equal(enemy.hp, 40);
});
