import type { HexCell } from '../../map/map.types';
import { isPassable } from '../../map/terrain.service';
import type { GameState } from '../../state/state.types';
import { lerp } from '@the-big-war/game-engine/math/math.service';
import type { Building, Walker } from '../../building/building.types';
import { addRoad, buildingCellsOf } from '../../map/world-index.service';
import { aStar } from '@the-big-war/game-engine/pathfinding/a-star.service';
import { distance, gridAt, gridIndex, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

const ROAD_STEP_COST = 0.5;

export function crewConstruction(state: GameState, active: readonly Building[]): Building[] {
  return active.filter(building => {
    const walker = state.walkers.find(item => item.site === building.id);
    if (walker) return walker.phase === 'building';
    const crew = dispatch(state, building);
    if (crew) state.walkers.push(crew);
    return false;
  });
}

function siteOf(state: GameState, walker: Walker): HexCell | null {
  const goal = state.grid.cells[walker.path[walker.path.length - 1]!]!;
  return goal.building?.id === walker.site && goal.owner === walker.empire ? goal : null;
}

function dispatch(state: GameState, building: Building): Walker | null {
  let site: HexCell | null = null;
  for (const cell of state.index.buildings.map(at => state.grid.cells[at]!)) {
    if (cell.building === building) site = cell;
  }
  if (!site) return null;
  const home = nearestHome(state, site);
  const at = gridIndex(state.grid, site.q, site.r);
  const path = (home && route(state, home, site)) ?? [at];
  const start = state.grid.cells[path[0]!]!;
  return { site: building.id, empire: site.owner, path, pos: { q: start.q, r: start.r }, phase: 'outbound', leg: 0, progress: 0 };
}

function nearestHome(state: GameState, site: HexCell): HexCell | null {
  let best: HexCell | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const cell of buildingCellsOf(state, site.owner)) {
    const building = cell.building;
    if (!building || cell === site || building.buildRemaining > 0) continue;
    const score = distance(cell, site);
    if (score < bestScore) {
      best = cell;
      bestScore = score;
    }
  }
  return best;
}

function route(state: GameState, from: HexCell, to: HexCell): number[] | null {
  const { grid } = state;
  const goal = gridIndex(grid, to.q, to.r);
  return aStar({
    start: gridIndex(grid, from.q, from.r),
    goal,
    heuristic: at => distance(grid.cells[at]!, to),
    neighbors: (at, visit) => {
      for (const hex of neighbors(grid.cells[at]!)) {
        const next = gridAt(grid, hex);
        if (!next || next.owner !== to.owner || !isPassable(next.terrain)) continue;
        visit(gridIndex(grid, next.q, next.r), next.road ? ROAD_STEP_COST : 1);
      }
    },
  });
}

export function stepWalkers(state: GameState, dt: number): void {
  for (const walker of [...state.walkers]) {
    if (walker.phase === 'outbound') walkOut(state, walker, dt);
    else if (walker.phase === 'building') {
      if (siteOf(state, walker)?.building?.buildRemaining) continue;
      turnBack(walker);
    } else walkHome(state, walker, dt);
  }
}

function turnBack(walker: Walker): void {
  walker.phase = 'returning';
  walker.leg = walker.path.length - 1;
  walker.progress = 0;
}

function walkOut(state: GameState, walker: Walker, dt: number): void {
  if (!siteOf(state, walker)) {
    removeWalker(state, walker);
    return;
  }
  walker.progress += dt;
  for (;;) {
    const here = state.grid.cells[walker.path[walker.leg]!]!;
    const next = state.grid.cells[walker.path[walker.leg + 1]!];
    if (!next) {
      walker.phase = 'building';
      walker.pos = { q: here.q, r: here.r };
      return;
    }
    const seconds = legSeconds(state, here, next);
    if (walker.progress < seconds) {
      place(walker, here, next, walker.progress / seconds);
      return;
    }
    walker.progress -= seconds;
    walker.leg += 1;
  }
}

function walkHome(state: GameState, walker: Walker, dt: number): void {
  walker.progress += dt;
  for (;;) {
    const here = state.grid.cells[walker.path[walker.leg]!]!;
    const next = state.grid.cells[walker.path[walker.leg - 1]!];
    if (walker.path.length > 1) addRoad(state, here);
    if (!next) {
      removeWalker(state, walker);
      return;
    }
    const seconds = legSeconds(state, here, next);
    if (walker.progress < seconds) {
      place(walker, here, next, walker.progress / seconds);
      return;
    }
    walker.progress -= seconds;
    walker.leg -= 1;
  }
}

function legSeconds(state: GameState, from: HexCell, to: HexCell): number {
  const { walkSecondsPerHex, roadWalkFactor } = state.config.gather;
  return walkSecondsPerHex * (from.road && to.road ? roadWalkFactor : 1);
}

function place(walker: Walker, from: HexCell, to: HexCell, t: number): void {
  walker.pos = { q: lerp(from.q, to.q, t), r: lerp(from.r, to.r, t) };
}

function removeWalker(state: GameState, walker: Walker): void {
  state.walkers.splice(state.walkers.indexOf(walker), 1);
}
