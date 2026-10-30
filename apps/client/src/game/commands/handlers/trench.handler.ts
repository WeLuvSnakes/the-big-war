import { withLiveEmpire } from '../command-guards';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { launchOffensive } from '../../offensive/offensive.service';
import { canAttack, declareWar } from '../../diplomacy/diplomacy.service';
import { percentShare } from '@the-big-war/game-engine/math/math.service';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import { addToEncampments, drawFromEncampments } from '../../troops/troops.service';
import { garrisonedTroops, garrisonRoom, ownTrench } from '../../trench/trench.service';
import { distance, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { LeaveTrenchCommand, ManTrenchCommand, TrenchAttackCommand } from '../commands.types';

export const handleManTrench = withLiveEmpire<ManTrenchCommand>((state, command, empire) => {
  const trench = ownTrench(state, command.empire, command.hex);
  if (!trench) return fail(command.type, 'invalid_target');
  const room = garrisonRoom(state, trench);
  if (room <= 0) return fail(command.type, 'trench_full');
  const available = garrisonedTroops(state, command.empire) - trench.garrison;
  const troops = Math.min(room, percentShare(available, command.percent));
  if (troops <= 0) return fail(command.type, 'insufficient_troops');
  const drawn = drawFromEncampments(state, command.empire, command.hex, troops, trench);
  if (!drawn) return fail(command.type, 'insufficient_troops');
  trench.garrison += drawn.troops;
  empire.soldiers += drawn.troops;
  return ok(command.type);
});

export const handleLeaveTrench = withLiveEmpire<LeaveTrenchCommand>((state, command, empire) => {
  const trench = ownTrench(state, command.empire, command.hex);
  if (!trench) return fail(command.type, 'invalid_target');
  const troops = Math.min(trench.garrison, percentShare(trench.garrison, command.percent));
  if (troops <= 0) return fail(command.type, 'insufficient_troops');
  trench.garrison -= troops;
  empire.soldiers -= troops;
  addToEncampments(state, command.empire, troops, trench);
  return ok(command.type);
});

export const handleTrenchAttack = withLiveEmpire<TrenchAttackCommand>((state, command, empire) => {
  const trench = ownTrench(state, command.empire, command.hex);
  if (!trench) return fail(command.type, 'invalid_target');
  const to = gridAt(state.grid, command.target);
  if (!to || to.owner === command.empire || to.owner === NEUTRAL_OWNER) return fail(command.type, 'invalid_target');
  if (distance(command.hex, command.target) !== 1) return fail(command.type, 'invalid_target');
  const troops = Math.min(trench.garrison, percentShare(trench.garrison, command.percent));
  if (troops <= 0) return fail(command.type, 'insufficient_troops');

  const attackCheck = canAttack(state, command.empire, to.owner);
  if (!attackCheck.allowed) return fail(command.type, attackCheck.reason ?? 'invalid_target');
  declareWar(state, command.empire, to.owner);

  if (!launchOffensive(state, command.empire, to.owner, command.target, troops, command.hex)) {
    return fail(command.type, 'invalid_target');
  }
  trench.garrison -= troops;
  empire.soldiers -= troops;
  return ok(command.type);
});
