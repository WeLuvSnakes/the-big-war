# The Big War

Experimental concept expanding upon OpenFront.

## Repository

This is a Bun-workspace monorepo:

- `apps/client` — the game: rules and content (`src/game`), PIXI renderer, session and SolidJS UI (`bun run dev`)
- `apps/test-suite` — Bun test suite (`bun test`)
- `libs/game-engine` — generic engine: tile grid, RNG, modifiers, system stepper, command dispatcher, agents, store
- `libs/frontend` — reusable UI kit components, camera, input, frame loop, hooks and formatters
- `libs/linter` — project lint rules
- `libs/scaffold` — generators for new systems, commands and panels

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the dependency rules.

## Commands

```sh
bun install
bun run dev
bun run build
bun run typecheck
bun test
bun run lint
bun run check
bun run new <system|command|panel> <kebab-case-name>
```
