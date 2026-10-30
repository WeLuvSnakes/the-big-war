import { withLiveEmpire } from '../command-guards';
import { isWater } from '../../map/terrain.service';
import type { Empire } from '../../empire/empire.types';
import type { GameState } from '../../state/state.types';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { launchTransport, planLanding } from '../../ship/ship.service';
import { canAttack, declareWar } from '../../diplomacy/diplomacy.service';
import { percentShare } from '@the-big-war/game-engine/math/math.service';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import { bordersOwner, launchOffensive } from '../../offensive/offensive.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { gridAt, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { CommandResult, RecallOffensiveCommand, SendTroopsCommand } from '../commands.types';

export const handleSendTroops = withLiveEmpire<SendTroopsCommand>((state, command, empire) => {
  const troops = percentShare(empire.soldiers, command.percent);
  if (troops <= 0) return fail(command.type, 'insufficient_troops');

  const to = gridAt(state.grid, command.target);
  if (!to || to.owner === command.empire) return fail(command.type, 'invalid_target');

  if (isWater(to.terrain)) return fail(command.type, 'invalid_target');
  const target = landTarget(state, command.empire, to.owner, landmassAt(state, command.target));
  if (target === null) return sendByTransport(state, command, empire, to.owner, troops);
  if (target !== NEUTRAL_OWNER) {
    const attackCheck = canAttack(state, command.empire, target);
    if (!attackCheck.allowed) return fail(command.type, attackCheck.reason ?? 'invalid_target');
    declareWar(state, command.empire, target);
  }

  if (!launchOffensive(state, command.empire, target, command.target, troops)) {
    return fail(command.type, 'invalid_target');
  }
  empire.soldiers -= troops;
  return ok(command.type);
});

function landmassAt(state: GameState, hex: Axial): number {
  return state.map.landmass[gridIndex(state.grid, hex.q, hex.r)]!;
}

function landTarget(state: GameState, empire: number, owner: number, landmass: number): number | null {
  if (bordersOwner(state, empire, owner, landmass)) return owner;
  return bordersOwner(state, empire, NEUTRAL_OWNER, landmass) ? NEUTRAL_OWNER : null;
}

function sendByTransport(
  state: GameState,
  command: SendTroopsCommand,
  empire: Empire,
  owner: number,
  troops: number,
): CommandResult {
  if (owner !== NEUTRAL_OWNER) {
    const attackCheck = canAttack(state, command.empire, owner);
    if (!attackCheck.allowed) return fail(command.type, attackCheck.reason ?? 'invalid_target');
  }
  const plan = planLanding(state, command.empire, command.target, owner);
  if (typeof plan === 'string') return fail(command.type, plan);
  if (owner !== NEUTRAL_OWNER) declareWar(state, command.empire, owner);
  launchTransport(state, command.empire, plan, command.target, troops);
  empire.soldiers -= troops;
  return ok(command.type);
}

export const handleRecallOffensive = withLiveEmpire<RecallOffensiveCommand>((state, command, empire) => {
  const index = state.offensives.findIndex(item => item.id === command.offensive && item.empire === command.empire);
  if (index < 0) return fail(command.type, 'invalid_target');
  const offensive = state.offensives[index]!;
  empire.soldiers += offensive.troops * (1 - state.config.wave.retreatPenalty);
  offensive.troops = 0;
  state.offensives.splice(index, 1);
  return ok(command.type);
});
