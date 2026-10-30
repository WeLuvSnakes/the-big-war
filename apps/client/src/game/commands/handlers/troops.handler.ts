import { withLiveEmpire } from '../command-guards';
import type { GameState } from '../../state/state.types';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { garrisonedTroops } from '../../trench/trench.service';
import { isEncampment } from '../../building/building.service';
import { buildingCellsOf } from '../../map/world-index.service';
import { isClaimable, isWater } from '../../map/terrain.service';
import type { Offensive } from '../../offensive/offensive.types';
import { drawFromEncampments } from '../../troops/troops.service';
import { launchTransport, planLanding } from '../../ship/ship.service';
import { canAttack, declareWar } from '../../diplomacy/diplomacy.service';
import { percentShare } from '@the-big-war/game-engine/math/math.service';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { distance, gridAt, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { bordersOwner, canLaunch, launchOffensive, seedFrontier, startMarch } from '../../offensive/offensive.service';
import type { CommandResult, OrderOffensiveCommand, RecallOffensiveCommand, SendTroopsCommand } from '../commands.types';

export const handleSendTroops = withLiveEmpire<SendTroopsCommand>((state, command) => {
  const troops = percentShare(garrisonedTroops(state, command.empire), command.percent);
  if (troops <= 0) return fail(command.type, 'insufficient_troops');

  const to = gridAt(state.grid, command.target);
  if (!to || to.owner === command.empire) return fail(command.type, 'invalid_target');

  if (isWater(to.terrain)) return fail(command.type, 'invalid_target');
  const target = landTarget(state, command.empire, to.owner, landmassAt(state, command.target));
  if (target === null) return sendByTransport(state, command, to.owner, troops);
  if (target !== NEUTRAL_OWNER) {
    const attackCheck = canAttack(state, command.empire, target);
    if (!attackCheck.allowed) return fail(command.type, attackCheck.reason ?? 'invalid_target');
    declareWar(state, command.empire, target);
  }

  if (!canLaunch(state, command.empire, target, command.target)) return fail(command.type, 'invalid_target');
  const drawn = drawFromEncampments(state, command.empire, command.target, troops);
  if (!drawn) return fail(command.type, 'insufficient_troops');
  launchOffensive(state, command.empire, target, command.target, drawn.troops, drawn.from);
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
  const drawn = drawFromEncampments(state, command.empire, command.target, troops);
  if (!drawn) return fail(command.type, 'insufficient_troops');
  launchTransport(state, command.empire, plan, command.target, drawn.troops);
  return ok(command.type);
}

function ownOffensive(state: GameState, empire: number, id: number): Offensive | undefined {
  return state.offensives.find(item => item.id === id && item.empire === empire);
}

export const handleOrderOffensive = withLiveEmpire<OrderOffensiveCommand>((state, command) => {
  const offensive = ownOffensive(state, command.empire, command.offensive);
  const to = gridAt(state.grid, command.target);
  if (!offensive || !to || !isClaimable(to.terrain)) return fail(command.type, 'invalid_target');
  if (to.owner === command.empire) {
    offensive.mission = 'hold';
    offensive.focus = { q: to.q, r: to.r };
    startMarch(state, offensive, offensive.head, offensive.focus);
    return ok(command.type);
  }
  if (to.owner !== NEUTRAL_OWNER) {
    const attackCheck = canAttack(state, command.empire, to.owner);
    if (!attackCheck.allowed) return fail(command.type, attackCheck.reason ?? 'invalid_target');
    declareWar(state, command.empire, to.owner);
  }
  offensive.mission = 'attack';
  offensive.target = to.owner;
  offensive.focus = { q: to.q, r: to.r };
  seedFrontier(state, offensive);
  const entry = nearestQueued(state, offensive);
  if (entry) startMarch(state, offensive, offensive.head, entry);
  return ok(command.type);
});

function nearestQueued(state: GameState, offensive: Offensive): Axial | null {
  let best: Axial | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const at of offensive.queued) {
    const cell = state.grid.cells[at]!;
    const d = distance(cell, offensive.head);
    if (d < bestDistance) {
      best = { q: cell.q, r: cell.r };
      bestDistance = d;
    }
  }
  return best;
}

export const handleRecallOffensive = withLiveEmpire<RecallOffensiveCommand>((state, command) => {
  const offensive = ownOffensive(state, command.empire, command.offensive);
  if (!offensive) return fail(command.type, 'invalid_target');
  offensive.troops *= 1 - state.config.wave.retreatPenalty;
  offensive.mission = 'retreat';
  const home = nearestEncampment(state, offensive);
  if (home) startMarch(state, offensive, offensive.head, home);
  else offensive.march = null;
  return ok(command.type);
});

function nearestEncampment(state: GameState, offensive: Offensive): Axial | null {
  let best: Axial | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of buildingCellsOf(state, offensive.empire)) {
    if (!cell.building || !isEncampment(cell.building.kind) || cell.building.buildRemaining > 0) continue;
    const d = distance(cell, offensive.head);
    if (d < bestDistance) {
      best = { q: cell.q, r: cell.r };
      bestDistance = d;
    }
  }
  return best;
}
