# Official Agent Fidelity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fictional 19-agent roster with all 29 current official VALORANT agents, locally hosted official visual assets, agent-specific ability behavior, shared AI use, and automated verification.

**Architecture:** Generate a static agent catalog and local media from Riot-extracted public metadata, then move reusable rule calculations into a DOM-free ability core. Keep `abilities.js` as the Three.js runtime adapter, but dispatch unique implementation ids for each official ability and store persistent recast/resource state on each entity. Bots and players call the same runtime functions.

**Tech Stack:** JavaScript ES modules, Node.js test runner, Three.js 0.160, static HTML/CSS, Playwright browser verification, GitHub Pages.

---

### Task 1: Establish the test harness and official catalog contract

**Files:**
- Modify: `package.json`
- Create: `tests/agent-catalog.test.mjs`
- Create: `src/agentCatalog.js`
- Create: `tools/sync_agents.mjs`

**Step 1: Write the failing catalog test**

Assert that the catalog contains exactly the 29 official names, four standard C/Q/E/X slots per agent, a unique runtime implementation id for every slot, official role metadata, an ultimate cost, and local portrait/icon paths.

```js
test('catalog contains the current 29-agent official roster', () => {
  assert.equal(AGENT_LIST.length, 29);
  assert.deepEqual(AGENT_LIST.map(id => AGENTS[id].name).sort(), EXPECTED_NAMES);
  for (const agent of Object.values(AGENTS)) {
    assert.deepEqual(Object.keys(agent.ab), ['c', 'q', 'e', 'x']);
    assert.equal(new Set(Object.values(agent.ab).map(a => a.impl)).size, 4);
  }
});
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- tests/agent-catalog.test.mjs`

Expected: FAIL because `src/agentCatalog.js` does not exist.

**Step 3: Add the sync script and generated static catalog**

Fetch `https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US`, map the four gameplay slots to C/Q/E/X using explicit per-agent overrides, download portraits and icons to `assets/agents/<slug>/`, and generate stable catalog metadata. Reject duplicate names, missing icons, missing slot mappings, or a roster count other than 29.

**Step 4: Run the catalog test and asset audit**

Run: `npm run sync:agents && npm test -- tests/agent-catalog.test.mjs`

Expected: PASS with 29 agents and 116 local ability icons.

**Step 5: Commit**

```bash
git add package.json tools/sync_agents.mjs src/agentCatalog.js tests/agent-catalog.test.mjs assets/agents
git commit -m "feat: add official 29-agent catalog and media"
```

### Task 2: Add deterministic ability rules and entity resources

**Files:**
- Create: `src/abilityCore.js`
- Create: `tests/ability-core.test.mjs`
- Modify: `src/abilities.js`
- Modify: `src/game.js`
- Modify: `src/state.js`

**Step 1: Write failing tests for resource, commit, and cleanup rules**

Cover failed casts not spending charges, successful casts spending exactly once, ultimate points, kill/refill resources, fuel, recast windows, post-death casts, suppression, round reset, and deterministic scheduled effects.

```js
test('failed placement never spends a charge', () => {
  const slot = { n: 1, def: { cost: 200 } };
  assert.equal(commitAbility(slot, false), false);
  assert.equal(slot.n, 1);
});
```

**Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/ability-core.test.mjs`

Expected: FAIL because the pure rule helpers do not exist.

**Step 3: Implement the pure rule layer and runtime scheduler**

Add pure helpers for charge validation, resource clamping, status stacking, range/team/LOS filtering, and recast state. Replace ability `setTimeout` calls with `G.abilityEvents` entries keyed to `G.now`, and clear them on round transitions.

**Step 4: Run focused tests**

Run: `npm test -- tests/ability-core.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/abilityCore.js src/abilities.js src/game.js src/state.js tests/ability-core.test.mjs
git commit -m "refactor: add deterministic ability runtime core"
```

### Task 3: Build shared ability primitives and destructible utility

**Files:**
- Create: `tests/ability-runtime.test.mjs`
- Modify: `src/abilities.js`
- Modify: `src/effects.js`
- Modify: `src/combat.js`
- Modify: `src/player.js`

**Step 1: Write failing runtime tests**

Test ballistic bounces, line-of-sight reveal, wall-penetrating waves, destructible devices, recall/refund, remote activation, projectile interception, controlled-unit handoff, teleport destination validation, and temporary weapon cleanup.

**Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/ability-runtime.test.mjs`

Expected: FAIL on missing utility registry and control modes.

**Step 3: Implement the primitives**

Introduce one utility registry with ids, health, team, owner, active state, expiry, and callbacks. Add controlled-scout mode, channel mode, map targeter, tether, projectile interceptor, anchor teleport, directional wall, expanding wave, and temporary weapon helpers. Route gunfire and damaging abilities through utility hit detection.

**Step 4: Run tests and map validation**

Run: `npm test -- tests/ability-runtime.test.mjs && npm run validate`

Expected: PASS and all maps valid.

**Step 5: Commit**

```bash
git add src/abilities.js src/effects.js src/combat.js src/player.js tests/ability-runtime.test.mjs
git commit -m "feat: add destructible and controllable utility primitives"
```

### Task 4: Correct the original eleven agents

**Files:**
- Create: `tests/agents-core-roster.test.mjs`
- Modify: `src/agentCatalog.js`
- Modify: `src/abilities.js`
- Modify: `src/combat.js`
- Modify: `src/player.js`

**Step 1: Write behavior tests for Jett, Phoenix, Brimstone, Omen, Sova, Sage, Raze, Killjoy, Breach, Viper, and KAY/O**

Include Jett's primed directional dash and knife refill, Phoenix's return anchor, Brimstone's multi-smoke targeter, Omen's cancelable ultimate, Sova's controlled drone and LOS recon, Sage's segmented wall and targeted resurrection, Raze's placed satchels, Killjoy recallable devices, Breach's wall geometry, Viper fuel/toggles, and KAY/O's downed NULL/cmd state.

**Step 2: Verify the tests fail against the aliases**

Run: `npm test -- tests/agents-core-roster.test.mjs`

Expected: FAIL on agent-specific behavior.

**Step 3: Implement each kit through unique catalog ids**

Keep common primitives shared, but do not map unrelated abilities to the same implementation id. Add kill, death, damage, and round hooks where agent resources require them.

**Step 4: Run focused and full tests**

Run: `npm test -- tests/agents-core-roster.test.mjs && npm test`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/agentCatalog.js src/abilities.js src/combat.js src/player.js tests/agents-core-roster.test.mjs
git commit -m "feat: faithfully rebuild the core eleven agent kits"
```

### Task 5: Correct the eight later existing agents

**Files:**
- Create: `tests/agents-expanded-roster.test.mjs`
- Modify: `src/agentCatalog.js`
- Modify: `src/abilities.js`
- Modify: `src/combat.js`
- Modify: `src/player.js`

**Step 1: Write behavior tests for Cypher, Reyna, Skye, Neon, Harbor, Fade, Deadlock, and Chamber**

Cover Cypher camera/corpse-gated Neural Theft, Reyna soul orbs and overheal decay, Skye controlled Trailblazer/channelled Regrowth, Neon energy sprint/slide/Overdrive, Harbor steerable wall and bullet-blocking Cove, Fade Haunt/Seize/Prowler trails, Deadlock sensor/mesh/Annihilation pull, and Chamber Rendezvous/Headhunter/kill slow fields.

**Step 2: Verify the tests fail**

Run: `npm test -- tests/agents-expanded-roster.test.mjs`

Expected: FAIL because the current kits borrow unrelated behavior.

**Step 3: Implement all eight kits**

Use the common registry for destructibility and recalls, explicit per-agent resources for soul orbs and Neon energy, and combat hooks for overheal, weapon kills, and slow fields.

**Step 4: Run focused and full tests**

Run: `npm test -- tests/agents-expanded-roster.test.mjs && npm test`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/agentCatalog.js src/abilities.js src/combat.js src/player.js tests/agents-expanded-roster.test.mjs
git commit -m "feat: faithfully rebuild eight expanded agent kits"
```

### Task 6: Add the ten missing agents

**Files:**
- Create: `tests/agents-new-roster.test.mjs`
- Modify: `src/agentCatalog.js`
- Modify: `src/abilities.js`
- Modify: `src/combat.js`
- Modify: `src/player.js`

**Step 1: Write behavior tests for Astra, Clove, Gekko, Iso, Miks, Tejo, Veto, Vyse, Waylay, and Yoru**

Test Astra stars and Astral Form, Clove post-death Ruse and resurrection, Gekko pickup/reuse creatures, Iso shield/arena contract, Miks dual-mode M-pulse and paired Harmonize, Tejo map-targeted salvos and drone, Veto interception and debuff immunity, Vyse hidden/reactivated traps, Waylay Refract return and movement burst, and Yoru decoy/flash/anchor/Dimensional Drift.

**Step 2: Verify the tests fail**

Run: `npm test -- tests/agents-new-roster.test.mjs`

Expected: FAIL because the agents do not yet exist in gameplay.

**Step 3: Implement all ten kits**

Add the required persistent resources, post-death availability, pickup/recast objects, paired buffs, immunity filtering, arena boundaries, return anchors, and alternate fire behavior.

**Step 4: Run focused and full tests**

Run: `npm test -- tests/agents-new-roster.test.mjs && npm test`

Expected: PASS with 29 playable agents and no placeholder dispatch ids.

**Step 5: Commit**

```bash
git add src/agentCatalog.js src/abilities.js src/combat.js src/player.js tests/agents-new-roster.test.mjs
git commit -m "feat: add ten missing official agents"
```

### Task 7: Update bots, HUD, roster UI, and asset presentation

**Files:**
- Create: `tests/agent-ui.test.mjs`
- Modify: `src/bots.js`
- Modify: `src/hud.js`
- Modify: `src/icons.js`
- Modify: `src/game.js`
- Modify: `index.html`

**Step 1: Write failing UI/AI contract tests**

Assert every catalog agent can be assigned to a bot, every ability has a decision category, the selection screen uses 29 portraits, HUD exposes resources/recasts, and no fictional agent names remain in user-visible source.

**Step 2: Verify the tests fail**

Run: `npm test -- tests/agent-ui.test.mjs`

Expected: FAIL on old names and missing bot decisions.

**Step 3: Implement data-driven UI and bot decisions**

Replace per-agent display duplication with catalog rendering. Give each ability a bot intent such as entry, reveal, escape, heal, deny, post-plant, retake, or setup; use the same validation/cast runtime as players. Show portraits, official ability icons, cooldown/resource overlays, and long-name-safe roster cards.

**Step 4: Run tests and source audit**

Run: `npm test && rg -n "风影|烈焰|天穹|暗幕|猎鹰|圣愈|雷奕|蛛影|岚切|青鸩|零式|影猎|魅影|灵愈|疾电|潮汐|噬梦|织锁|伯爵" src index.html`

Expected: tests pass and `rg` returns no user-visible fictional names.

**Step 5: Commit**

```bash
git add src/bots.js src/hud.js src/icons.js src/game.js index.html tests/agent-ui.test.mjs
git commit -m "feat: integrate official roster with bots and HUD"
```

### Task 8: Browser verification, versioning, and deployment

**Files:**
- Create: `tools/smoke_game.mjs`
- Modify: `index.html`
- Modify: `src/*.js`

**Step 1: Add a browser smoke script**

Serve the game locally, select representative agents from every mechanic family, enter a match, use/cancel/recast abilities, force death/revival paths, and collect console/page errors. Add screenshot and canvas pixel checks at desktop and mobile viewports.

**Step 2: Run all verification commands**

Run: `npm test && npm run validate && npm run smoke`

Expected: all tests pass, all maps validate, no console errors, and nonblank screenshots are produced.

**Step 3: Manually inspect screenshots and interaction state**

Check the 29-card selection layout, long names such as `KAY/O`, ability icon loading, HUD overlap, pointer lock recovery, controlled-unit camera return, and WebGL framing.

**Step 4: Bump the static module cache version and commit**

```bash
git add index.html src tools/smoke_game.mjs package.json
git commit -m "test: verify official agent overhaul in browser"
```

**Step 5: Push and verify GitHub Pages**

Run: `git push origin main`

Open `https://hecrereed.github.io/tactical-protocol/`, verify the deployed commit's version marker, select agents, enter a match, and confirm a clean console.
