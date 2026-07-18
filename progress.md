Original prompt: 完成当前目录的 VALORANT 复刻游戏，修正所有不完整的角色技能，补齐当前正式服全部特工，使用官方名称与官方视觉素材，验证后提交并发布到 https://hecrereed.github.io/tactical-protocol/

## 2026-07-18

- Confirmed Riot's official agent page currently lists 29 agents.
- Design committed as `ddb718f`; implementation plan committed as `81bf3bf`.
- Isolated worktree: `/Users/hecrereed/.config/superpowers/worktrees/csgo/official-agent-fidelity` on `codex/official-agent-fidelity`.
- Baseline `npm run validate` passes for all 11 maps with zero unreachable cells.
- Current batch: official catalog/assets, deterministic ability core, utility runtime primitives.
- Task 1 complete in `afa134a`: 29 official agents, 29 WebP portraits, and 116 PNG ability icons; catalog tests pass.
- Task 2 complete: added pure charge/resource/status/recast rules and deterministic game-clock ability events; 9 tests pass and map validation remains green.
- Task 3 complete: unified destructible utility registry, owner-only recalls, projectile interception, control handoff, and teleport validation; 16 tests pass and all 11 maps validate.
- Task 4 complete: core eleven official kits now have agent state hooks, including Jett dash/knives, Phoenix return anchor, Raze recharge/satchel, Sova controlled drone, Viper fuel toggles, and KAY/O downed state; 23 tests pass.
- Task 5 complete: rebuilt Cypher, Reyna, Skye, Neon, Harbor, Fade, Deadlock, and Chamber with unique runtime types and agent-specific state; 29 tests pass.
- Task 6 complete: added Astra, Clove, Gekko, Iso, Miks, Tejo, Veto, Vyse, Waylay, and Yoru with 40 handled runtime types; 38 tests pass.
- Task 7 complete: official portrait/icon UI, compact 29-card roster, data-driven bot intents, generic official ability casting, and removal of legacy agent configuration; 42 tests pass.
- Task 8 complete: v29 cache marker, deterministic text/time hooks, desktop/mobile roster checks, Jett cast/recast/cancel, Sova Owl Drone control return, Phoenix fatality return, console error capture, and nonblank canvas pixel validation.
- Browser debugging fixed the missing `AGENTS` bot import, ambiguous canvas screenshot selector, and mobile agent-select scroll carry-over. Smoke screenshots were visually inspected at 1280x800 and 390x844.
- Final local verification: 44/44 tests pass, all 11 maps report zero unreachable cells, browser smoke passes, and the source audit contains no legacy fictional agent names or v28 module references.
- Online verification found and fixed the only page-owned console error by declaring a local official icon as the favicon.

## TODO

- Merge into `main`, push, and verify the GitHub Pages deployment.

## 2026-07-19 Humanlike AI And Vertical Maps

- Follow-up prompt: strengthen all AI behavior, not only pathfinding; make bots play more like people; clear red ground rings between rounds; add five complex maps with meaningful elevation.
- Replaced incomplete randomized A* with deterministic closed-set search; all tactical routes are reachable and navigation goals are floor-aware.
- Added stable attack/defense roles, uncertain sight/sound memory, tactical target scoring, safe reloads, cover fallback, trade spacing, lane reservations, grouped retakes, and context-aware utility intent.
- Moved target rings to game-clock transient effects; 900 ms rings now expire correctly and round cleanup removes every remaining ring and pending event.
- Added `云阙`, `潮门`, `赤炼`, `镜城`, and `龙脊`; all have three height bands, stairs, bridges, elevated tactical positions, and low-route counters.
- Current verification: 70/70 tests pass; 16 maps and 2,900 spawn-to-objective routes validate with zero unreachable routes.
- Browser simulation found and fixed deferred A* requests being silently dropped after the two-path frame budget.
- Browser simulation found and fixed elevated cover crates occupying tactical posts on `赤炼` and `龙脊`.
- Third-person observer placement now uses the actual behind direction and clips against walls; mobile HUD elements no longer overlap at 390x844.
- Five-map deterministic simulation passes with 27.5-50 seconds of sampled live play per map, no 3.5-second navigation stalls, no wrong-floor goals, clean console output, nonblank pixels, and verified round-ring cleanup.
- Final AI/map screenshots and the existing official-agent browser smoke were visually inspected.
- Static module cache marker is now `v30`. Fresh final verification passed 70/70 tests, all 2,900 critical routes, the complete five-map AI simulation, and the official-agent browser smoke.

## TODO 2026-07-19

- Merge to `main`, push, and verify GitHub Pages.
