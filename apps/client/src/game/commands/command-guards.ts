import type { Empire } from '../empire/empire.types';
import type { GameState } from '../state/state.types';
import type { Command, CommandResult } from './commands.types';
import { fail } from '@the-big-war/game-engine/commands/command.service';

export function withLiveEmpire<C extends Command & { readonly empire: number }>(
  handler: (state: GameState, command: C, empire: Empire) => CommandResult,
): (state: GameState, command: C) => CommandResult {
  return (state, command) => {
    const empire = state.empires[command.empire];
    if (!empire || !empire.alive) return fail(command.type, 'no_empire');
    return handler(state, command, empire);
  };
}
