import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignTeamRole, updateContactMemory, scoreTarget, isReloadSafe,
  tradeSpacing, shouldGroupForRetake, scoreCover, reserveApproachLane,
  chooseUtilityIntent,
} from '../src/botTactics.js';

test('five-player teams receive stable complementary roles', () => {
  assert.deepEqual(
    Array.from({length:5},(_,i)=>assignTeamRole(i,'atk')),
    ['entry','trader','info','support','lurker'],
  );
  assert.deepEqual(
    Array.from({length:5},(_,i)=>assignTeamRole(i,'def')),
    ['anchor','anchor','info','support','rotator'],
  );
  assert.equal(assignTeamRole(7,'atk'), assignTeamRole(2,'atk'));
});

test('sound memories are uncertain and decay instead of granting wall knowledge', () => {
  const heard = updateContactMemory(null, {kind:'sound',pos:{x:10,y:0,z:4},sourceId:9}, 20, .8);
  assert.equal(heard.kind, 'sound');
  assert.ok(heard.confidence < 1);
  assert.ok(heard.uncertainty >= 2);
  const later = updateContactMemory(heard, null, 24, .8);
  assert.ok(later.confidence < heard.confidence);
  assert.ok(later.uncertainty > heard.uncertainty);
  assert.deepEqual(later.pos, heard.pos);
  assert.equal(updateContactMemory(heard, null, 40, .8), null);
});

test('visible spike interactions and recent attackers outrank covered targets', () => {
  const base = {visible:true,distance:18,health:100,vertical:0,angularExposure:.5};
  const covered = scoreTarget({...base, teammateCoverage:2});
  const exposed = scoreTarget({...base, teammateCoverage:0});
  const planter = scoreTarget({...base, spikeAction:'plant'});
  const aggressor = scoreTarget({...base, recentlyDamagedBot:true});
  assert.ok(exposed > covered);
  assert.ok(planter > exposed);
  assert.ok(aggressor > exposed);
  assert.ok(scoreTarget({...base,vertical:8}) < exposed);
});

test('bots only reload when cover, distance, or teammate pressure makes it safe', () => {
  const exposed = {ammo:8,mag:25,visibleEnemies:1,recentDamageAge:.4,coverDistance:6,allyCovering:false,distanceToThreat:11};
  assert.equal(isReloadSafe(exposed), false);
  assert.equal(isReloadSafe({...exposed,coverDistance:1.2}), true);
  assert.equal(isReloadSafe({...exposed,allyCovering:true,distanceToThreat:22,recentDamageAge:.8}), true);
  assert.equal(isReloadSafe({...exposed,ammo:0}), true);
});

test('trade spacing rewards a nearby partner without collision stacking', () => {
  assert.ok(tradeSpacing(6) > tradeSpacing(1));
  assert.ok(tradeSpacing(6) > tradeSpacing(16));
  assert.equal(tradeSpacing(6), 1);
});

test('retakers group in pairs unless the spike clock forces action', () => {
  assert.equal(shouldGroupForRetake({aliveDefenders:3,nearbyDefenders:0,spikeTimeLeft:28}), false);
  assert.equal(shouldGroupForRetake({aliveDefenders:3,nearbyDefenders:1,spikeTimeLeft:28}), true);
  assert.equal(shouldGroupForRetake({aliveDefenders:3,nearbyDefenders:0,spikeTimeLeft:6}), true);
  assert.equal(shouldGroupForRetake({aliveDefenders:1,nearbyDefenders:0,spikeTimeLeft:28}), true);
});

test('cover scoring favors protected nearby positions without teammate crowding', () => {
  const safe = scoreCover({distance:5,threatExposure:0,teammateCrowding:0,protectsFromThreat:true,heightDelta:0});
  const open = scoreCover({distance:5,threatExposure:1,teammateCrowding:0,protectsFromThreat:false,heightDelta:0});
  const stacked = scoreCover({distance:5,threatExposure:0,teammateCrowding:2,protectsFromThreat:true,heightDelta:0});
  assert.ok(safe > open);
  assert.ok(safe > stacked);
});

test('lane reservations distribute roles predictably across available approaches', () => {
  const lanes = ['main','mid','flank'];
  const reservations = new Map();
  const entry = reserveApproachLane({role:'entry',index:0,lanes,reservations});
  reservations.set(entry,1);
  const trader = reserveApproachLane({role:'trader',index:1,lanes,reservations});
  reservations.set(trader,1);
  const lurker = reserveApproachLane({role:'lurker',index:4,lanes,reservations});
  assert.equal(entry, 'main');
  assert.equal(trader, 'main');
  assert.equal(lurker, 'flank');
});

test('utility intent follows tactical context instead of random cooldown use', () => {
  assert.equal(chooseUtilityIntent({enemyChanneling:true}), 'deny');
  assert.equal(chooseUtilityIntent({hurt:true,safeEscape:true}), 'escape');
  assert.equal(chooseUtilityIntent({retaking:true,contactConfidence:.2}), 'info');
  assert.equal(chooseUtilityIntent({executing:true,dangerousSightline:true}), 'cover');
  assert.equal(chooseUtilityIntent({executing:true}), 'entry');
  assert.equal(chooseUtilityIntent({}), 'hold');
});
