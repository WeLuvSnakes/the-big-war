import type { GameState } from '../../state/state.types';
import type { EmpireId } from '../../empire/empire.types';
import type { HexCell, Terrain } from '../../map/map.types';
import { refillUnlimited } from '../../empire/empire.service';
import type { Gatherer } from '../../building/building.types';
import { lerp } from '@the-big-war/game-engine/math/math.service';
import { GATHERED_TERRAIN } from '../../building/building.constants';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { resolveModifier } from '@the-big-war/game-engine/modifier/modifier.service';
import { distance, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';

export function stepGathering(state: GameState, dt: number): void {
  const gather = state.config.gather;
  for (const cell of state.grid.cells) {
    const building = cell.building;
    if (!building || building.buildRemaining > 0) continue;
    const terrain = GATHERED_TERRAIN[building.kind];
    if (!terrain) continue;
    const empire = state.empires[cell.owner];
    if (!empire || !empire.alive) continue;
    const home = { q: cell.q, r: cell.r };
    const goldPerLoad = terrain === 'ore' ? gather.oreGoldPerLoad : gather.goldPerLoad;
    while (building.gatherers.length < gather.workersPerBuilding) {
      building.gatherers.push({ pos: home, target: null, phase: 'idle', progress: 0, duration: 0 });
    }
    for (const gatherer of building.gatherers) {
      const delivered = stepGatherer(state, gatherer, home, cell.owner, terrain, dt);
      if (delivered <= 0) continue;
      empire.gold += resolveModifier(delivered * goldPerLoad, empire.bonuses.goldIncome);
      refillUnlimited(empire);
    }
  }
}

function stepGatherer(
  state: GameState,
  gatherer: Gatherer,
  home: Axial,
  owner: EmpireId,
  terrain: Terrain,
  dt: number,
): number {
  const gather = state.config.gather;
  if (gatherer.phase === 'idle') {
    const target = nearestResource(state, home, owner, terrain);
    if (!target) {
      gatherer.pos = home;
      return 0;
    }
    gatherer.target = target;
    startLeg(gatherer, 'outbound', distance(home, target) * gather.walkSecondsPerHex);
  }

  gatherer.progress += dt;
  const target = gatherer.target!;
  const t = gatherer.duration > 0 ? Math.min(1, gatherer.progress / gatherer.duration) : 1;
  if (gatherer.phase === 'outbound') gatherer.pos = lerpHex(home, target, t);
  else if (gatherer.phase === 'returning') gatherer.pos = lerpHex(target, home, t);
  if (gatherer.progress < gatherer.duration) return 0;

  switch (gatherer.phase) {
    case 'outbound': {
      const cell = gridAt(state.grid, target);
      if (!cell || cell.terrain !== terrain || cell.owner !== owner) {
        gatherer.phase = 'idle';
        return 0;
      }
      startLeg(gatherer, 'working', gather.workSeconds);
      return 0;
    }
    case 'working': {
      const cell = gridAt(state.grid, target);
      if (!cell || cell.terrain !== terrain) {
        gatherer.phase = 'idle';
        return 0;
      }
      harvest(state, cell);
      startLeg(gatherer, 'returning', distance(home, target) * gather.walkSecondsPerHex);
      return 0;
    }
    case 'returning':
      gatherer.pos = home;
      gatherer.target = null;
      gatherer.phase = 'idle';
      return 1;
    default:
      return 0;
  }
}

function startLeg(gatherer: Gatherer, phase: Gatherer['phase'], duration: number): void {
  gatherer.phase = phase;
  gatherer.progress = 0;
  gatherer.duration = duration;
}

function harvest(state: GameState, cell: HexCell): void {
  cell.harvested = (cell.harvested ?? 0) + 1;
  const loads = cell.terrain === 'ore' ? state.config.gather.oreLoadsPerTile : state.config.gather.loadsPerTile;
  if (cell.harvested < loads) return;
  cell.terrain = 'plain';
  cell.harvested = 0;
}

function nearestResource(state: GameState, home: Axial, owner: EmpireId, terrain: Terrain): Axial | null {
  let best: Axial | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of state.grid.cells) {
    if (cell.terrain !== terrain || cell.owner !== owner || cell.building) continue;
    const d = distance(home, cell);
    if (d < bestDistance) {
      best = { q: cell.q, r: cell.r };
      bestDistance = d;
    }
  }
  return best;
}

function lerpHex(a: Axial, b: Axial, t: number): Axial {
  return { q: lerp(a.q, b.q, t), r: lerp(a.r, b.r, t) };
}
