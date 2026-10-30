import { withLiveEmpire } from '../command-guards';
import { isPassable } from '../../map/terrain.service';
import type { GameState } from '../../state/state.types';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { canAttack, declareWar } from '../../diplomacy/diplomacy.service';
import { percentShare } from '@the-big-war/game-engine/math/math.service';
import type { CommandResult, SendTroopsCommand } from '../commands.types';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { distance, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { joinFront, launchExpedition, marchPath, stagingHex } from '../../troops/troops.service';

export const handleSendTroops = withLiveEmpire<SendTroopsCommand>((state, command, empire) => {

  const troops = percentShare(empire.soldiers, command.percent);
  if (troops <= 0) return fail(command.type, 'insufficient_troops');

  const from = gridAt(state.grid, command.hex);
  const to = gridAt(state.grid, command.target);
  if (!from || !to || !isPassable(to.terrain)) return fail(command.type, 'invalid_target');
  if (from.owner !== command.empire || to.owner === command.empire) return fail(command.type, 'invalid_target');
  if (distance(command.hex, command.target) !== 1) return marchColumn(state, command, troops);
  if (command.intent === 'attack' && stagingHex(state, command.empire, command.target)) {
    return marchColumn(state, command, troops, command.hex);
  }

  if (to.owner === NEUTRAL_OWNER) {
    if (command.intent !== 'attack') return fail(command.type, 'invalid_target');
    empire.soldiers -= troops;
    launchExpedition(state, command.empire, command.target, troops);
    return ok(command.type);
  }

  if (command.intent === 'attack') {
    const attackCheck = canAttack(state, command.empire, to.owner);
    if (!attackCheck.allowed) return fail(command.type, attackCheck.reason ?? 'invalid_target');
    declareWar(state, command.empire, to.owner);
  }

  empire.soldiers -= troops;
  if (!joinFront(state, command.empire, command.hex, command.target, troops, command.intent)) {
    empire.soldiers += troops;
    return fail(command.type, 'invalid_target');
  }
  return ok(command.type);
});

function marchColumn(
  state: GameState,
  command: SendTroopsCommand,
  troops: number,
  border: Axial | null = null,
): CommandResult {
  if (command.intent !== 'attack') return fail(command.type, 'invalid_target');
  const path = marchPath(state, command.empire, command.target, border);
  if (!path) return fail(command.type, 'invalid_target');
  const targetOwner = gridAt(state.grid, command.target)!.owner;
  if (targetOwner !== NEUTRAL_OWNER) {
    const attackCheck = canAttack(state, command.empire, targetOwner);
    if (!attackCheck.allowed) return fail(command.type, attackCheck.reason ?? 'invalid_target');
  }
  state.empires[command.empire]!.soldiers -= troops;
  const mission = targetOwner === NEUTRAL_OWNER ? 'claim' : 'attack';
  state.columns.push({ empire: command.empire, mission, path, step: 0, progress: 0, troops });
  return ok(command.type);
}
