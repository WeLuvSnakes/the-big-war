#!/usr/bin/env bun
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CLIENT = join(ROOT, 'apps/client/src');

const pascal = (name: string): string => name.split('-').map(part => part[0]!.toUpperCase() + part.slice(1)).join('');

function write(path: string, content: string): void {
  if (existsSync(path)) throw new Error(`Refusing to overwrite ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`created ${path.slice(ROOT.length)}`);
}

function system(name: string): string {
  const fn = `step${pascal(name)}`;
  write(
    join(CLIENT, `game/simulation/systems/${name}.system.ts`),
    `import type { GameState } from '../../state/state.types';\n\nexport function ${fn}(state: GameState, _dt: number): void {\n  for (const empire of state.empires) {\n    if (!empire.alive) continue;\n  }\n}\n`,
  );
  return `Add ${fn} to GAME_SYSTEMS in game/simulation/simulation.service.ts`;
}

function command(name: string): string {
  const type = pascal(name);
  write(
    join(CLIENT, `game/commands/handlers/${name}.handler.ts`),
    `import { withLiveEmpire } from '../command-guards';\nimport type { ${type}Command } from '../commands.types';\nimport { ok } from '@the-big-war/game-engine/commands/command.service';\n\nexport const handle${type} = withLiveEmpire<${type}Command>((_state, command, _empire) => {\n  return ok(command.type);\n});\n`,
  );
  return `Add ${type}Command to the Command union in game/commands/commands.types.ts and handle${type} to dispatch in game/commands/commands.service.ts`;
}

function panel(name: string): string {
  const type = pascal(name);
  const dir = join(CLIENT, `ui/${name}`);
  write(join(dir, `${type}.types.ts`), `export interface ${type}Props {\n  readonly onClose: () => void;\n}\n`);
  write(join(dir, `${type}.css`), `.${name} {\n  display: grid;\n}\n`);
  write(
    join(dir, `${type}.tsx`),
    `import './${type}.css';\nimport type { ${type}Props } from './${type}.types';\nimport { Panel } from '@the-big-war/frontend/ui/panel/Panel';\n\nexport type { ${type}Props };\n\nexport const ${type} = (props: ${type}Props) => (\n  <Panel title="${type}" class="${name}" onClose={props.onClose}>\n    {null}\n  </Panel>\n);\n`,
  );
  return `Mount ${type} in ui/shell/Shell.tsx`;
}

const GENERATORS: Record<string, (name: string) => string> = { system, command, panel };

const [kind, name] = process.argv.slice(2);
const generate = kind ? GENERATORS[kind] : undefined;
if (!generate || !name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error('Usage: bun run new <system|command|panel> <kebab-case-name>');
  process.exit(1);
}
console.log(generate(name));
