# Architecture

## Dependency rules

- `libs/*` never import from `apps/*`.
- `libs/game-engine` knows nothing about the game's rules or about the UI kit.
- `libs/frontend` may import `libs/game-engine`.
- `apps/client/src/game` holds rules and content, and does not import from `render`, `session` or `ui`.
- `apps/test-suite` may import everything.

## Adding features

| To add | Run | Then |
| --- | --- | --- |
| A per-tick rule | `bun run new system <name>` | Add it to `GAME_SYSTEMS`; order matters |
| A player or bot action | `bun run new command <name>` | Add its type to `Command` and its handler to `dispatch` |
| A UI drawer | `bun run new panel <name>` | Mount it in `Shell` |

## Toolkit

| Need | Use |
| --- | --- |
| Reject commands from dead or missing empires | `withLiveEmpire` in `game/commands/command-guards.ts` |
| Bounds, interpolation, troop percentages | `game-engine/math/math.service` |
| Grid lookups and hex maths | `game-engine/world-tile/world-tile.service` |
| Seeded randomness in rules (never `Math.random`) | `game-engine/rng/rng.service` |
| A UI value that follows game state | `live(() => ...)` in `game/store/store.service.ts` |
| An animation loop | `createFrameLoop` in `frontend/session/frame-loop` |
| Window listeners and click-outside | `frontend/ui/hooks/hooks` |
| Signed numbers, rates, clocks, class lists | `frontend/ui/format/format` |
| Empires in tests | `testEmpire` in `apps/test-suite/tests/support/fixture.ts` |

Run `bun run check` before committing.
