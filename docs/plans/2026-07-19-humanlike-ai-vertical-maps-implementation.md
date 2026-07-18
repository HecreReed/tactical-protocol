# Humanlike AI And Vertical Maps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make bots navigate every tactical route, reason and coordinate like human players, clear round-scoped effects reliably, and add five playable multi-level maps.

**Architecture:** Preserve the Three.js grid-navigation and bot state-machine architecture, but extract deterministic tactical helpers and use one floor-aware distance contract throughout navigation and AI. Track visual effects on the game clock, describe elevated tactical points explicitly in map data, and validate real paths rather than map metadata alone.

**Tech Stack:** JavaScript ES modules, Three.js, Node test runner, Playwright, static GitHub Pages.

---

### Task 1: Deterministic Complete A* Search

**Files:**
- Create: `tests/navigation.test.mjs`
- Modify: `src/map.js:1418-1555`

**Step 1: Write the failing tests**

Build every map's colliders and navigation graph, install it into `G.map`, and assert that `findPath()` returns a path from every attacker and defender spawn to every site plant and stage point. Add a synthetic graph assertion that the search reports no duplicate finalized nodes and that the same route seed returns the same path.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/navigation.test.mjs`
Expected: FAIL because existing critical routes return empty arrays and randomized jitter is nondeterministic.

**Step 3: Implement the minimal navigation fix**

Add a closed-generation buffer beside `_pfGen`, skip stale/finalized heap entries, and cap finalized nodes relative to `wps.length`. Replace randomized heuristic multiplication with a deterministic non-negative edge bias derived from `(routeSeed, currentId, nextId)`, while keeping the geometric heuristic admissible. Export compact path diagnostics for tests and map validation.

**Step 4: Verify tests pass**

Run: `node --test tests/navigation.test.mjs`
Expected: PASS for all existing maps and deterministic seeds.

**Step 5: Commit**

```bash
git add tests/navigation.test.mjs src/map.js
git commit -m "fix: make bot pathfinding complete and deterministic"
```

### Task 2: Floor-Aware Navigation Contract

**Files:**
- Modify: `tests/navigation.test.mjs`
- Modify: `src/map.js:1429-1555`
- Modify: `src/bots.js:102-280, 1027-1405`

**Step 1: Write the failing tests**

Add tests proving a position directly below a bridge is not considered at the bridge goal, `snapToNav()` honors explicit tactical height, and vertical progress contributes to stuck detection.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/navigation.test.mjs`
Expected: FAIL because current snapping and arrival checks use X/Z only.

**Step 3: Implement the floor-aware helpers**

Export `navDistance()`, `atNavGoal()`, and a height-aware `snapToNav()`. Normalize tactical point forms (`[x,z]`, `[x,z,y]`, and `{p, y}`), then replace bot arrival, replanning, watchdog, plant, defuse, hold, and hunt checks with the shared metric. Retry with an alternate deterministic route seed before any off-graph recovery.

**Step 4: Verify tests and regressions**

Run: `node --test tests/navigation.test.mjs && npm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/navigation.test.mjs src/map.js src/bots.js
git commit -m "fix: make bot navigation floor aware"
```

### Task 3: Testable Human Tactical Decisions

**Files:**
- Create: `src/botTactics.js`
- Create: `tests/bot-tactics.test.mjs`

**Step 1: Write the failing tests**

Cover stable role assignment, sight and sound memory confidence decay, target scoring, reload safety, trade distance, grouped retake readiness, cover scoring, lane reservation, and utility intent selection.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/bot-tactics.test.mjs`
Expected: FAIL because the tactical helpers do not exist.

**Step 3: Implement pure decision helpers**

Implement deterministic functions that accept plain snapshots and return scores or choices: `assignTeamRole`, `updateContactMemory`, `scoreTarget`, `isReloadSafe`, `tradeSpacing`, `shouldGroupForRetake`, `scoreCover`, `reserveApproachLane`, and `chooseUtilityIntent`. Keep rendering, Three.js objects, and mutation out of this module.

**Step 4: Verify tests pass**

Run: `node --test tests/bot-tactics.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/botTactics.js tests/bot-tactics.test.mjs
git commit -m "feat: add humanlike bot tactical decisions"
```

### Task 4: Integrate Perception, Coordination, And Combat Behavior

**Files:**
- Modify: `src/bots.js`
- Modify: `src/game.js`
- Modify: `tests/bot-tactics.test.mjs`

**Step 1: Add failing integration assertions**

Assert that bots retain uncertain sound contacts, stop sharing exact unseen positions, avoid exposed reloads, choose different team lanes, wait within trade distance before entry, pair for retakes, prefer nearby cover when hurt, and rotate only on confirmed contact strength.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/bot-tactics.test.mjs`
Expected: FAIL against current bot state and random rotation rules.

**Step 3: Wire decisions into the bot loop**

Extend `initBotAI()` and `resetBotRound()` with role, memory, lane, cover, confidence, and coordination state. Replace target selection with tactical scoring; connect sight, noise, damage and spike events to decaying memories; require safe exposure for reloads; add entry/trader spacing, angle-clear queues, crossfire posts, delayed support utility, cover fallback, bounded lurks, and pair-based retakes. Difficulty changes reaction and uncertainty, not access to hidden information.

**Step 4: Run focused and full tests**

Run: `node --test tests/bot-tactics.test.mjs && npm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/bots.js src/game.js src/botTactics.js tests/bot-tactics.test.mjs
git commit -m "feat: coordinate bot perception combat and objectives"
```

### Task 5: Round-Scoped Transient Effects

**Files:**
- Create: `tests/round-fx.test.mjs`
- Modify: `src/state.js`
- Modify: `src/effects.js:1-130`
- Modify: `src/game.js`

**Step 1: Write the failing tests**

Initialize a Three.js scene, create a 900 ms target ring, assert it remains before `G.now + 0.9`, expires after that point, and is immediately removed by `clearRoundFX()`. Assert no scheduled targeting event survives round reset.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/round-fx.test.mjs`
Expected: FAIL because rings use `setTimeout(dur * 1000)` and are untracked.

**Step 3: Implement tracked transient effects**

Store rings and similar short-lived meshes in `G.transientFX` with second-based `until` timestamps. Expire them in `updateFX()` and remove all remaining meshes in `clearRoundFX()`. Cancel targeting modes and scheduled round ability events in the same cleanup contract.

**Step 4: Verify tests and regressions**

Run: `node --test tests/round-fx.test.mjs && npm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/round-fx.test.mjs src/state.js src/effects.js src/game.js
git commit -m "fix: clear target rings and transient effects each round"
```

### Task 6: Vertical Map Schema And Structural Validation

**Files:**
- Create: `tests/vertical-maps.test.mjs`
- Modify: `src/mapData.js:1-55`
- Modify: `src/map.js:1141-1430`

**Step 1: Write the failing schema tests**

Require 16 maps and exact ids `yunque`, `chaomen`, `chilian`, `jingcheng`, and `longji`. For each new map require two or more traversable height bands, at least three stairs, one bridge, valid spawns/sites, explicit elevated tactical points, and paths from both teams to all tactical objectives.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/vertical-maps.test.mjs`
Expected: FAIL because the five maps are absent and validation only checks waypoint count.

**Step 3: Extend schema and validation**

Allow tactical points to carry height, expose a test-safe map installation helper, and make `validateMaps()` audit critical routes with detailed failures. Keep legacy two-coordinate data compatible.

**Step 4: Verify the expected remaining failure**

Run: `node --test tests/vertical-maps.test.mjs`
Expected: FAIL only for the five missing map ids.

**Step 5: Commit**

```bash
git add tests/vertical-maps.test.mjs src/map.js src/mapData.js
git commit -m "test: enforce vertical map structure and connectivity"
```

### Task 7: Add Cloud Court And Tidegate

**Files:**
- Modify: `src/mapData.js`
- Modify: `tests/vertical-maps.test.mjs`

**Step 1: Add focused failing expectations**

Assert Cloud Court has lower court, palace and observatory routes with two stair systems and a bridge. Assert Tidegate has canal, dock, crane catwalk, drainage route and two elevated bridge approaches.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/vertical-maps.test.mjs`
Expected: FAIL for `yunque` and `chaomen`.

**Step 3: Define both maps**

Add asymmetric rooms/corridors, platforms, bridges, stairs, cover, sites, spawns, barriers, stages, holds, defender posts, chokes, smoke points, themes, and official Chinese display names `云阙` and `潮门`.

**Step 4: Verify paths and structure**

Run: `node --test tests/navigation.test.mjs tests/vertical-maps.test.mjs && npm run validate`
Expected: PASS for both new maps with no unreachable critical point.

**Step 5: Commit**

```bash
git add src/mapData.js tests/vertical-maps.test.mjs
git commit -m "feat: add Cloud Court and Tidegate maps"
```

### Task 8: Add Red Forge And Mirror City

**Files:**
- Modify: `src/mapData.js`
- Modify: `tests/vertical-maps.test.mjs`

**Step 1: Add focused failing expectations**

Assert Red Forge contains trench, production floor, furnace pipewalk and upper bridge network. Assert Mirror City contains basement links, street level, crossed skybridges and counter-rotation stairs.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/vertical-maps.test.mjs`
Expected: FAIL for `chilian` and `jingcheng`.

**Step 3: Define both maps**

Add complete tactical data, cover and traversal for `赤炼` and `镜城`, ensuring each elevated position has a real stair approach and no isolated navigation island.

**Step 4: Verify paths and structure**

Run: `node --test tests/navigation.test.mjs tests/vertical-maps.test.mjs && npm run validate`
Expected: PASS for both maps.

**Step 5: Commit**

```bash
git add src/mapData.js tests/vertical-maps.test.mjs
git commit -m "feat: add Red Forge and Mirror City maps"
```

### Task 9: Add Dragon Ridge

**Files:**
- Modify: `src/mapData.js`
- Modify: `tests/vertical-maps.test.mjs`

**Step 1: Add focused failing expectations**

Assert Dragon Ridge has ravine tunnels, stepped courtyards, battlements, separate ridge and tunnel rotations, and both high and low entries at all three sites.

**Step 2: Run tests to verify it fails**

Run: `node --test tests/vertical-maps.test.mjs`
Expected: FAIL for `longji`.

**Step 3: Define Dragon Ridge**

Add all geometry and tactical data for `龙脊`, with explicit elevated holds and multiple defended routes.

**Step 4: Verify all 16 maps**

Run: `node --test tests/navigation.test.mjs tests/vertical-maps.test.mjs && npm run validate`
Expected: PASS with 16 valid maps and 100 percent critical-route connectivity.

**Step 5: Commit**

```bash
git add src/mapData.js tests/vertical-maps.test.mjs
git commit -m "feat: add Dragon Ridge vertical fortress map"
```

### Task 10: Browser AI Simulation And Visual Verification

**Files:**
- Create: `tools/simulate_bots.mjs`
- Modify: `package.json`
- Modify: `src/game.js`

**Step 1: Write the failing browser simulation**

Use Playwright to enter attack and defense rounds on each new map, sample `render_game_to_text()`, and fail when an active bot makes no navigation progress for over three seconds, arrives on the wrong floor, or never advances through objective states. Capture one desktop and one mobile screenshot per map and collect console errors.

**Step 2: Run it to expose remaining failures**

Run: `node tools/simulate_bots.mjs`
Expected: FAIL with actionable bot/map diagnostics until the final tuning is complete.

**Step 3: Tune only evidence-backed failures**

Adjust cover, navigation, tactical thresholds, spawn placement or map geometry for reproduced failures. Add the required fields to `render_game_to_text()` without exposing hidden opponent data in normal gameplay.

**Step 4: Verify browser behavior and pixels**

Run: `node tools/simulate_bots.mjs && npm run smoke`
Expected: PASS with nonblank canvases, no console errors, no cross-floor false arrival, and no active bot stalled over three seconds.

**Step 5: Inspect screenshots and commit**

Inspect all generated map screenshots for visible height bands, unclipped HUD, clear traversal, and no overlap.

```bash
git add tools/simulate_bots.mjs package.json src/game.js src/bots.js src/map.js src/mapData.js
git commit -m "test: verify humanlike bots across vertical maps"
```

### Task 11: Cache Version, Full Verification, And Deployment

**Files:**
- Modify: `index.html`
- Modify: `src/*.js`
- Modify: `sw.js` if present

**Step 1: Bump static asset cache markers**

Update the shared module query version and service worker cache key so GitHub Pages cannot serve the previous AI or maps.

**Step 2: Run all verification**

Run: `npm test && npm run validate && node tools/simulate_bots.mjs && npm run smoke`
Expected: all tests and browser checks PASS.

**Step 3: Review the final diff**

Run: `git diff --check && git status --short && git diff --stat main...HEAD`
Expected: no whitespace errors or unrelated files.

**Step 4: Commit the cache bump**

```bash
git add index.html src sw.js
git commit -m "chore: refresh tactical protocol assets"
```

**Step 5: Merge, push, and verify Pages**

Merge `codex/ai-vertical-maps` into `main`, push `main`, wait for the Pages workflow, then open `https://hecrereed.github.io/tactical-protocol/` and verify the deployed cache marker, all five maps, a live AI round, canvas pixels, and a clean browser console.
