Original prompt: 完成当前目录的 VALORANT 复刻游戏，修正所有不完整的角色技能，补齐当前正式服全部特工，使用官方名称与官方视觉素材，验证后提交并发布到 https://hecrereed.github.io/tactical-protocol/

## 2026-07-18

- Confirmed Riot's official agent page currently lists 29 agents.
- Design committed as `ddb718f`; implementation plan committed as `81bf3bf`.
- Isolated worktree: `/Users/hecrereed/.config/superpowers/worktrees/csgo/official-agent-fidelity` on `codex/official-agent-fidelity`.
- Baseline `npm run validate` passes for all 11 maps with zero unreachable cells.
- Current batch: official catalog/assets, deterministic ability core, utility runtime primitives.
- Task 1 complete in `afa134a`: 29 official agents, 29 WebP portraits, and 116 PNG ability icons; catalog tests pass.
- Task 2 complete: added pure charge/resource/status/recast rules and deterministic game-clock ability events; 9 tests pass and map validation remains green.

## TODO

- Complete Tasks 1-8 in `docs/plans/2026-07-18-official-agent-fidelity-implementation.md`.
- Add `window.render_game_to_text` and `window.advanceTime` before browser automation.
- Run browser screenshots for agent select and live gameplay at desktop/mobile viewports.
- Merge into `main`, push, and verify GitHub Pages.
