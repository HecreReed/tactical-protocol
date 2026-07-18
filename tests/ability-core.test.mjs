import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitAbility, clampResource, extendStatus, openRecast, consumeRecast,
  scheduleAbilityEvent, runAbilityEvents,
} from '../src/abilityCore.js';

test('failed casts do not spend a charge', () => {
  const slot = { n:1 };
  assert.equal(commitAbility(slot, false), false);
  assert.equal(slot.n, 1);
});

test('successful casts spend exactly one charge', () => {
  const slot = { n:2 };
  assert.equal(commitAbility(slot, true), true);
  assert.equal(slot.n, 1);
});

test('agent resources stay inside their configured bounds', () => {
  assert.equal(clampResource(112, 0, 100), 100);
  assert.equal(clampResource(-4, 0, 100), 0);
});

test('a shorter status cannot overwrite a longer active status', () => {
  const ent = { slowUntil:10 };
  extendStatus(ent, 'slowUntil', 8);
  assert.equal(ent.slowUntil, 10);
  extendStatus(ent, 'slowUntil', 12);
  assert.equal(ent.slowUntil, 12);
});

test('recasts expire and can only be consumed once', () => {
  const ent = { abilityState:{} };
  openRecast(ent, 'gatecrash', { until:15, payload:{ x:2 } });
  assert.equal(consumeRecast(ent, 'gatecrash', 16), null);
  openRecast(ent, 'gatecrash', { until:20, payload:{ x:4 } });
  assert.deepEqual(consumeRecast(ent, 'gatecrash', 18), { x:4 });
  assert.equal(consumeRecast(ent, 'gatecrash', 18), null);
});

test('scheduled effects only run when the game clock reaches them', () => {
  const queue = [];
  const calls = [];
  scheduleAbilityEvent(queue, 5, () => calls.push('pulse'), 'recon');
  runAbilityEvents(queue, 4.9);
  assert.deepEqual(calls, []);
  runAbilityEvents(queue, 5);
  assert.deepEqual(calls, ['pulse']);
  assert.equal(queue.length, 0);
});
