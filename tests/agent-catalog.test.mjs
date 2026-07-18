import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { AGENTS, AGENT_LIST } from '../src/config.js';

const EXPECTED_NAMES = [
  'Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher', 'Deadlock',
  'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett', 'KAY/O', 'Killjoy', 'Miks',
  'Neon', 'Omen', 'Phoenix', 'Raze', 'Reyna', 'Sage', 'Skye', 'Sova',
  'Tejo', 'Veto', 'Viper', 'Vyse', 'Waylay', 'Yoru',
];

test('catalog contains the current 29-agent official roster', () => {
  assert.equal(AGENT_LIST.length, 29);
  assert.deepEqual(AGENT_LIST.map(id => AGENTS[id].name).sort(), EXPECTED_NAMES);
});

test('every agent exposes four distinct official ability slots', () => {
  const implementationIds = new Set();
  for(const id of AGENT_LIST){
    const agent = AGENTS[id];
    assert.deepEqual(Object.keys(agent.ab), ['c', 'q', 'e', 'x'], id);
    assert.match(agent.portrait, /^\.\/assets\/agents\/[a-z0-9-]+\/portrait\.webp$/);
    for(const [key, ability] of Object.entries(agent.ab)){
      assert.ok(ability.impl, `${id}.${key} has an implementation id`);
      assert.equal(implementationIds.has(ability.impl), false, ability.impl);
      implementationIds.add(ability.impl);
      assert.match(ability.icon, /^\.\/assets\/agents\/[a-z0-9-]+\/[cqex]\.png$/);
    }
  }
  assert.equal(implementationIds.size, 116);
});

test('all catalog media is stored locally and nonempty', async () => {
  for(const agent of Object.values(AGENTS)){
    const media = [agent.portrait, ...Object.values(agent.ab).map(a => a.icon)];
    for(const relative of media){
      const info = await stat(new URL(`../${relative.replace('./','')}`, import.meta.url));
      assert.ok(info.size > 100, relative);
    }
  }
});
