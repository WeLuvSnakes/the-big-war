import { withLiveEmpire } from '../command-guards';
import { incidentFronts } from '../../front/front.service';
import type { FireCannonCommand } from '../commands.types';
import { shellingFactor } from '../../building/building.service';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import { distance, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';

export const handleFireCannon = withLiveEmpire<FireCannonCommand>((state, command, empire) => {
  const from = gridAt(state.grid, command.from);
  if (!from || from.owner !== command.empire) return fail(command.type, 'invalid_target');
  if (from.building?.kind !== 'cannon' || from.building.buildRemaining > 0) return fail(command.type, 'invalid_target');
  if (from.building.cooldown > 0) return fail(command.type, 'cooldown');
  const target = gridAt(state.grid, command.target);
  if (!target) return fail(command.type, 'invalid_target');
  const cannon = state.config.cannon;
  if (distance(command.from, command.target) > cannon.range) return fail(command.type, 'invalid_target');
  if (empire.gold < cannon.cost) return fail(command.type, 'insufficient_gold');

  empire.gold -= cannon.cost;
  from.building.cooldown = cannon.cooldown;

  for (const front of incidentFronts(state, command.target)) {
    const lossesA = Math.min(front.sideA.troops, cannon.damage * shellingFactor(state, front.sideA.empire, front.hexA));
    const lossesB = Math.min(front.sideB.troops, cannon.damage * shellingFactor(state, front.sideB.empire, front.hexB));
    front.sideA.troops -= lossesA;
    front.sideB.troops -= lossesB;
    front.resolution = { at: state.elapsed, lossesA, lossesB, capturedBy: null };
  }

  if (cannon.destroysTerrain.includes(target.terrain)) target.terrain = 'plain';
  return ok(command.type);
});
