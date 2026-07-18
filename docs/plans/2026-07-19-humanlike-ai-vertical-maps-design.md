# Humanlike AI And Vertical Maps Design

Date: 2026-07-19

## Goal

Make bots navigate reliably and play rounds with recognizable human tactical behavior, fix round-persistent ability indicators, and add five complex maps built around meaningful elevation changes. The result must remain a static Three.js game suitable for GitHub Pages.

## Confirmed Problems

The current A* search stops after 9,000 heap pops while maps contain roughly 7,500-9,100 navigation nodes. Because nodes can be pushed and expanded repeatedly, critical routes frequently return no path even though the graph is connected. A full spawn-to-objective audit found empty paths for roughly 60-70 percent of critical pairs. Browser simulations reproduced bots stalled 20-38 meters from an active goal with an empty path.

Navigation and tactical arrival checks are mostly two-dimensional. A bot directly below a bridge or platform can therefore be treated as close enough to a goal on another floor. Tactical map points do not consistently encode their intended floor.

Bot tests currently cover ability dispatch but not perception, memory, target scoring, team coordination, replanning, vertical arrival, or round outcomes. Map validation only checks that a navigation graph exists; it does not prove that spawns, sites, staging points, holds, and defender posts can reach one another.

`targetRing()` receives durations in milliseconds but multiplies them by 1,000 before scheduling removal. A 900 ms indicator therefore survives for 900 seconds. Rings are not tracked by `clearRoundFX()`, so the next round can retain the previous round's red indicators.

## Chosen Approach

Keep the current grid navigation and state-machine architecture, but make its core deterministic, floor-aware, testable, and team-aware. This preserves the working collision, combat, skill, and map renderer while fixing the actual failure points.

Rejected alternatives:

- Raising the A* pop limit alone would hide duplicate expansion, leave vertical arrival wrong, and add more cost as maps grow.
- Replacing the system with a full navmesh and behavior tree would require a large engine rewrite without proportionate benefit for this static game.

## Navigation Architecture

A* will maintain a closed generation array and ignore already-finalized nodes. Route diversity will use a deterministic, non-negative edge bias derived from a route seed instead of randomizing the heuristic. The search limit will scale with graph size and count finalized nodes, making connected critical routes reliable without unbounded work.

All navigation distances will distinguish feet positions from waypoint eye-height positions. A shared floor-aware goal metric will be used by arrival checks, replanning, staging, planting, defusing, hunting, and stuck detection. Tactical positions may specify an optional height and will snap to the nearest waypoint using both horizontal and vertical distance.

Replanning will try a deterministic alternate route seed before any position correction. Teleport-style recovery remains a last resort only when the bot is off the navigation graph, not a normal response to a failed search.

## Humanlike Bot Behavior

Perception will retain uncertain sound and sight memories rather than turning every lost target into an exact chase. Target scoring will account for line of sight, angular exposure, distance, target health, spike interaction, recent damage, vertical separation, and whether a teammate is already covering the opponent.

Team intent will assign stable round roles: entry, trade, information, support, lurk, anchor, and rotator. Attackers will reserve different approach lanes, wait for nearby trade partners, use entry utility before crossing a choke, clear a bounded sequence of angles, and plant only after a minimum local safety check. Defenders will anchor separate sites, rotate based on confirmed contact strength rather than one random sound, establish crossfires, and retake in pairs when possible.

Combat movement will choose cover-relative actions: stop before accurate bursts, shoulder peek from cover, avoid reloading in exposed sightlines, fall back to the nearest safe waypoint when hurt, maintain trade distance, and avoid stacking inside a teammate's collision radius. Difficulty will alter reaction, memory confidence, aim error, burst discipline, and coordination delay rather than bypassing the same rules.

Abilities will use the same tactical context: information utility before entry, cover utility across dangerous sightlines, denial on spike interactions, escape only when a safe destination exists, and ultimates only for a meaningful target or round state.

## Round Lifecycle And FX Cleanup

Short-lived rings and similar indicators will be tracked as deterministic transient effects with `until` timestamps on the game clock. `updateFX()` will expire them, and `clearRoundFX()` will remove every remaining transient mesh immediately. Browser `setTimeout` will no longer own gameplay-visible round effects.

The cleanup contract will cover rings, projectile trails, smokes, zones, walls, deployables, dropped weapons, pooled flashes/tracers, controlled units, scheduled ability events, and targeting modes. A test will create a ring, advance a round, and assert that no transient mesh or pending event remains.

## Five Maps

### Cloud Court (`yunque`, 云阙)

A three-site mountain palace with a lower service court, main palace floor, and 3 m observatory platforms. Two stair systems and a central bridge let teams contest height without forcing one choke.

### Tidegate (`chaomen`, 潮门)

A two-site dockyard with a canal floor, dock level, and crane catwalks. Attackers can use drainage tunnels, container lanes, or two elevated bridge routes; defenders must choose between long upper sightlines and fast low rotations.

### Red Forge (`chilian`, 赤炼)

A three-site refinery with cooling trenches, production floor, and furnace pipewalks. Sites are connected by a low maintenance loop and a high but exposed industrial bridge network.

### Mirror City (`jingcheng`, 镜城)

A two-site urban atrium with basement links, street-level shops, and crossed skybridges. The middle atrium supports vertical crossfires while side stairwells allow safe counter-rotations.

### Dragon Ridge (`longji`, 龙脊)

A three-site mountain fortress with ravine tunnels, stepped courtyards, and wall-top battlements. Each site has at least one low and one high entry, and the defender spawn has separate ridge and tunnel rotation routes.

Every map will contain explicit high tactical posts, multiple stair approaches, at least one bridge, non-overlapping spawn barriers, cover on each exposed level, and routes that remain valid for both players and bots.

## Validation

Node tests will cover deterministic A*, no duplicate expansion, route diversity, floor-aware goal arrival, sound-memory decay, target scoring, trade spacing, coordinated rotations, cover selection, and complete transient cleanup.

Map tests will require 16 total maps, five exact new ids, at least two height bands per new map, multiple stairs, a bridge, valid sites and spawns, and successful paths between every spawn and every plant, stage, hold, defender post, and elevated tactical point.

Browser AI simulations will run representative attack and defense rounds on all five maps. An active bot may not remain more than three seconds without progress, attackers must reach stage/execute/plant states, defenders must reach post/retake/defuse states, and no bot may report arrival on the wrong floor. Screenshots will verify all three elevation bands, HUD framing, nonblank WebGL output, and a clean console.

## Delivery

The static cache marker will be bumped after implementation. The branch will pass unit tests, map validation, AI simulation, local smoke, and screenshot inspection before it is merged to `main`, pushed, and verified on GitHub Pages.
