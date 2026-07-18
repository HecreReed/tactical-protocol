# VALORANT Official Agent Fidelity Design

Date: 2026-07-18

## Goal

Replace the project's fictional agent roster with the 29 agents currently listed on Riot's official VALORANT agent page. Existing agents must stop borrowing unrelated ability implementations, and the ten missing agents must be added. The result remains a static Three.js game that can be hosted on GitHub Pages.

The roster is: Astra, Breach, Brimstone, Chamber, Clove, Cypher, Deadlock, Fade, Gekko, Harbor, Iso, Jett, KAY/O, Killjoy, Miks, Neon, Omen, Phoenix, Raze, Reyna, Sage, Skye, Sova, Tejo, Veto, Viper, Vyse, Waylay, and Yoru.

## Chosen Approach

Keep the existing map, weapon, round, economy, rendering, and bot foundations, but replace the agent layer with agent-specific ability state machines built on shared gameplay primitives. This avoids a risky full-engine rewrite while removing the current type aliases that make different abilities behave identically.

Rejected alternatives:

- Renaming agents and tuning the current aliases is fast but cannot reproduce controlled units, recalls, destructible utility, alternate fire, kill contracts, post-death casting, or agent-specific resources.
- Rewriting the entire game would permit deeper simulation, but it would discard working maps, combat, economy, AI navigation, and performance work without improving the requested agent fidelity proportionally.

## Fidelity Contract

Each agent uses the official name, role, portrait, ability names, and ability icons. Ability identity and interaction rules take priority over decorative effects. Timings, charges, damage, healing, shields, debuffs, ultimate points, and cooldowns are stored as explicit data and follow the current live descriptions and balance data where public values are available.

One world unit continues to represent approximately one meter. Ranges therefore remain directly comparable to official meter values. When an official mechanic depends on geometry the browser engine cannot represent exactly, the implementation must preserve the gameplay decision: line of sight, wall penetration, destructibility, recall, remote activation, alternate fire, or ally/enemy filtering.

Official portraits and ability icons are stored locally so GitHub Pages does not depend on a third-party runtime API. Public Riot media may be used for presentation audio. Non-public game audio is not copied from unverified sources; the existing procedural audio layer supplies equivalent cues where no publishable official file is available.

## Architecture

`config.js` becomes roster metadata rather than an ability implementation switchboard. Every ability definition contains an implementation id plus charges, costs, cooldowns, duration, radius, damage, and interaction flags.

`abilities.js` is split conceptually into:

- Cast lifecycle: equip, preview, confirm, alternate fire, cancel, channel, interrupt, refund, and round cleanup.
- Ability primitives: ballistic projectiles, directed waves, targeted zones, smoke placement, controlled scouts, destructible devices, tethers, temporary weapons, teleports, walls, and map targeting.
- Agent mechanics: soul orbs, fuel, stars, kill contracts, post-death smoke, resurrection anchors, recall/redeploy, transformation, and other state that must not be flattened into generic cooldowns.
- Runtime updates: projectiles, devices, zones, controlled units, debuffs, and delayed effects all advance from the game clock rather than browser timers.

All utility receives a stable id, owner, team, health where applicable, activation state, expiry, and cleanup policy. Utility damage and interception flow through one registry so abilities such as Veto's Interceptor, Killjoy's devices, Cypher's trips, and Gekko's creatures follow the same destruction rules.

## Input And Data Flow

The player presses C/Q/E/X. The cast layer validates round state, suppression, inventory, cooldown, and agent resource. It then opens the correct interaction mode or executes an instant ability. Confirmation creates runtime entities through shared primitives; agent-specific callbacks apply the unique rule. Only a successful commit spends a charge or ultimate points.

Bots call the same cast functions. Their decision layer supplies targets and activation timing but cannot bypass range, line of sight, charges, destructibility, or cast delay. Controlled-unit abilities use an AI steering adapter while player-controlled versions temporarily transfer input and camera control.

The HUD renders definitions and live runtime state from the same data: charges, cooldowns, fuel, active anchors, recast availability, ultimate progress, and post-death casts. The selection screen renders all 29 agents from the roster and uses local official portrait/icon assets.

## Agent Coverage

Existing 19 agents are corrected rather than renamed in place. Major required fixes include Jett's primed dash and kill-refilling knives, Phoenix's return anchor, Sova's controlled drone and line-of-sight recon pulses, KAY/O's downed ultimate state, Cypher's controllable camera and corpse-gated ultimate, Reyna's soul-orb economy, Skye's controlled creatures and channeled heal, Neon's sprint/slide and beam ultimate, Harbor's steerable wall and bullet-blocking Cove, Fade's Haunt/Seize/Prowler entities, Deadlock's mesh and cocoon pull, and Chamber's anchor teleport and kill slow fields.

Missing agents receive full kits: Astra, Clove, Gekko, Iso, Miks, Tejo, Veto, Vyse, Waylay, and Yoru. Their agent-specific resource or recast mechanics are part of the first implementation, not deferred placeholders.

## Error Handling And Cleanup

Invalid placement, missing targets, blocked destinations, expired recast windows, insufficient resources, and disallowed phase changes fail without spending the ability. Every runtime object has deterministic round cleanup. Death, suppression, control transfer, halftime, and match end cancel channels and restore the camera/input owner safely.

## Testing

Node tests exercise pure ability rules with a deterministic clock and seeded positions. Every one of the 116 standard ability slots has at least a registry/dispatch test, while mechanically risky abilities receive focused behavior tests for resource spending, damage or healing, team filtering, line of sight, wall interaction, duration, destructibility, recast, and cleanup.

Browser tests cover agent selection, entering a match, equipping and cancelling abilities, using alternate fire, switching into and out of controlled units, HUD state, death/revival flows, and a complete round reset. Desktop and mobile screenshots verify that 29 roster cards, ability text, icons, and controls do not overlap. Console errors and blank WebGL frames are treated as failures.

## Delivery

Implementation lands on `main`, passes map validation, unit tests, and browser smoke tests, and is pushed to `origin/main`. GitHub Pages is then checked at `https://hecrereed.github.io/tactical-protocol/` for the deployed commit and a clean console.
