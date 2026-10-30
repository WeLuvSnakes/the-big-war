import { BOT_TUNING } from './bot.constants';
import type { HexCell } from '../map/map.types';
import { ownTrench } from '../trench/trench.service';
import { seaIndex } from '../ship/sea-route.service';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import { hasUnlock } from '../research/research.service';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import type { BuildingKind } from '../building/building.types';
import type { Bot, CannonShot, HostileEdge } from './bot.types';
import { GATHERED_TERRAIN } from '../building/building.constants';
import { clamp01 } from '@the-big-war/game-engine/math/math.service';
import { isPortSite, portWaterBody } from '../map/port-site.service';
import { canAttack, getRelation } from '../diplomacy/diplomacy.service';
import { buildingCellsOf, ownedCells } from '../map/world-index.service';
import { isClaimable, isPassable, isWater } from '../map/terrain.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { atWar, boatsFrom, finishedPorts, hasPort, isBlockaded, isCoastal, portBoatLimit } from '../ship/ship.service';
import { area, distance, gridAt, gridCoord, gridIndex, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

const MAX_COAST_SAMPLES = 400;
const GATHERER_SITE_RADIUS = 3;

export function isFreeSite(cell: HexCell): boolean {
  return cell.building === null && cell.terrain === 'plain';
}

export function findSite(state: GameState, empireId: EmpireId, kind: BuildingKind): Axial | null {
  const spec = state.config.buildings[kind];
  if (!spec) return null;
  if (spec.requiresResearch !== null) {
    const empire = state.empires[empireId];
    if (!empire || !hasUnlock(empire, `building:${kind}`)) return null;
  }
  if (kind === 'machine_gun') return unarmedTrench(state, empireId);
  if (kind === 'trench') return borderTrenchSite(state, empireId);
  const gathered = GATHERED_TERRAIN[kind];
  if (gathered) return gathererSite(state, empireId, gathered);
  if (kind === 'port') return firstSite(state, empireId, cell => isPassable(cell.terrain) && isPortSite(state.grid, state.map, cell));
  if (kind === 'fishery') return firstSite(state, empireId, cell => isFreeSite(cell) && isCoastal(state, cell));
  const keepCoast = !hasPort(state, empireId);
  return firstSite(state, empireId, cell => isFreeSite(cell) && !(keepCoast && isPortSite(state.grid, state.map, cell)));
}

function firstSite(state: GameState, empireId: EmpireId, accept: (cell: HexCell) => boolean): Axial | null {
  const site = ownedCells(state, empireId).find(accept);
  return site ? { q: site.q, r: site.r } : null;
}

function gathererSite(state: GameState, empireId: EmpireId, terrain: HexCell['terrain']): Axial | null {
  for (const cell of ownedCells(state, empireId)) {
    if (cell.terrain !== terrain || cell.building !== null) continue;
    for (const hex of area(cell, GATHERER_SITE_RADIUS)) {
      const site = gridAt(state.grid, hex);
      if (site && site.owner === empireId && isFreeSite(site)) return { q: site.q, r: site.r };
    }
  }
  return null;
}

export function bordersForeignEmpire(state: GameState, empireId: EmpireId, hex: Axial): boolean {
  for (const neighbour of neighbors(hex)) {
    const owner = gridAt(state.grid, neighbour)?.owner;
    if (owner !== undefined && owner !== NEUTRAL_OWNER && owner !== empireId) return true;
  }
  return false;
}

function unarmedTrench(state: GameState, empireId: EmpireId): Axial | null {
  for (const cell of ownedCells(state, empireId)) {
    const hex = { q: cell.q, r: cell.r };
    if (ownTrench(state, empireId, hex)?.machineGun === false) return hex;
  }
  return null;
}

function borderTrenchSite(state: GameState, empireId: EmpireId): Axial | null {
  for (const cell of ownedCells(state, empireId)) {
    if (cell.building !== null || cell.terrain !== 'plain') continue;
    const hex = { q: cell.q, r: cell.r };
    if (bordersForeignEmpire(state, empireId, hex)) return hex;
  }
  return null;
}

export function unmannedBorderTrench(state: GameState, empireId: EmpireId): Axial | null {
  for (const cell of ownedCells(state, empireId)) {
    const hex = { q: cell.q, r: cell.r };
    const trench = ownTrench(state, empireId, hex);
    if (trench && trench.garrison === 0 && bordersForeignEmpire(state, empireId, hex)) return hex;
  }
  return null;
}

export function findCannonShot(state: GameState, empireId: EmpireId): CannonShot | null {
  const range = state.config.cannon.range;
  for (const cell of buildingCellsOf(state, empireId)) {
    if (cell.building?.kind !== 'cannon') continue;
    if (cell.building.cooldown > 0 || cell.building.buildRemaining > 0) continue;
    const from = { q: cell.q, r: cell.r };
    for (const neighbour of neighbors(from)) {
      for (let step = 1; step <= range; step++) {
        const probe = { q: from.q + (neighbour.q - from.q) * step, r: from.r + (neighbour.r - from.r) * step };
        const target = gridAt(state.grid, probe);
        if (!target) continue;
        if (distance(from, probe) > range) continue;
        if (target.owner !== empireId && target.owner !== NEUTRAL_OWNER) return { from, target: { q: probe.q, r: probe.r } };
      }
    }
  }
  return null;
}

export function effectiveAggression(bot: Bot, state: GameState): number {
  const shifted = bot.personality.aggression + state.config.bot.aggression - 0.5;
  return clamp01(shifted);
}

export function borderingEmpires(state: GameState, empireId: EmpireId): Set<EmpireId> {
  const found = new Set<EmpireId>();
  for (const cell of ownedCells(state, empireId)) {
    for (const neighbour of neighbors({ q: cell.q, r: cell.r })) {
      const owner = gridAt(state.grid, neighbour)?.owner;
      if (owner !== undefined && owner >= 0 && owner !== empireId) found.add(owner);
    }
  }
  return found;
}

function touchedWaters(state: GameState, empireId: EmpireId): Set<number> {
  const waters = new Set<number>();
  for (const cell of ownedCells(state, empireId)) {
    for (const hex of neighbors(cell)) {
      const next = gridAt(state.grid, hex);
      if (next && isWater(next.terrain)) waters.add(state.map.waterBody[gridIndex(state.grid, hex.q, hex.r)]!);
    }
  }
  return waters;
}

function touchesAnyWater(state: GameState, empireId: EmpireId, waters: ReadonlySet<number>): boolean {
  for (const cell of ownedCells(state, empireId)) {
    for (const hex of neighbors(cell)) {
      const next = gridAt(state.grid, hex);
      if (next && isWater(next.terrain) && waters.has(state.map.waterBody[gridIndex(state.grid, hex.q, hex.r)]!)) return true;
    }
  }
  return false;
}

export function reachableEmpires(state: GameState, empireId: EmpireId): Set<EmpireId> {
  const found = borderingEmpires(state, empireId);
  const waters = touchedWaters(state, empireId);
  if (waters.size === 0) return found;
  for (const other of state.empires) {
    if (other.id === empireId || !other.alive || found.has(other.id)) continue;
    if (touchesAnyWater(state, other.id, waters)) found.add(other.id);
  }
  return found;
}

function landmassesOf(state: GameState, empireId: EmpireId): Set<number> {
  const masses = new Set<number>();
  for (const cell of ownedCells(state, empireId)) masses.add(state.map.landmass[gridIndex(state.grid, cell.q, cell.r)]!);
  return masses;
}

function sharesLandWithRival(state: GameState, empireId: EmpireId): boolean {
  const mine = landmassesOf(state, empireId);
  for (const other of state.empires) {
    if (other.id === empireId || !other.alive) continue;
    for (const mass of landmassesOf(state, other.id)) if (mine.has(mass)) return true;
  }
  return false;
}

export function wantsPort(state: GameState, empireId: EmpireId): boolean {
  const empire = state.empires[empireId];
  if (!empire || empire.neutralState || hasPort(state, empireId)) return false;
  if (empire.gold >= state.config.buildings.port.cost * BOT_TUNING.navyGoldMultiple) return true;
  return !sharesLandWithRival(state, empireId) || hostileEdges(state, empireId).length === 0;
}

export function hasFreeBoat(state: GameState, empireId: EmpireId): boolean {
  return finishedPorts(state, empireId).some(
    port => !isBlockaded(state, port) && boatsFrom(state, port.building!.id) < portBoatLimit(state, port.building!),
  );
}

export function overseasTarget(state: GameState, empireId: EmpireId): Axial | null {
  const ports = finishedPorts(state, empireId);
  const home = ports[0];
  if (!home) return null;
  const neutralAllowed = !state.empires[empireId]?.neutralState;
  const index = seaIndex(state.grid, state.map);
  let best: Axial | null = null;
  let bestScore = Infinity;
  for (const body of new Set(ports.map(port => portWaterBody(state.grid, state.map, port)))) {
    const coast = index.coastByBody.get(body) ?? [];
    const stride = Math.max(1, Math.floor(coast.length / MAX_COAST_SAMPLES));
    for (let at = 0; at < coast.length; at += stride) {
      const cell = state.grid.cells[coast[at]!.beach]!;
      if (cell.owner === empireId || !isPassable(cell.terrain)) continue;
      if (cell.owner === NEUTRAL_OWNER ? !neutralAllowed : !atWar(state, empireId, cell.owner)) continue;
      const score = distance(home, cell);
      if (score >= bestScore) continue;
      best = { q: cell.q, r: cell.r };
      bestScore = score;
    }
  }
  return best;
}

export function hostileWaters(state: GameState, empireId: EmpireId, body: number): Axial | null {
  const coast = seaIndex(state.grid, state.map).coastByBody.get(body) ?? [];
  const stride = Math.max(1, Math.floor(coast.length / MAX_COAST_SAMPLES));
  for (let at = 0; at < coast.length; at += stride) {
    const tile = coast[at]!;
    const owner = state.grid.cells[tile.beach]!.owner;
    if (owner !== NEUTRAL_OWNER && atWar(state, empireId, owner)) return gridCoord(state.grid, tile.water);
  }
  return null;
}

export function hostileEdges(state: GameState, empireId: EmpireId): HostileEdge[] {
  const edges: HostileEdge[] = [];
  const neutralState = state.empires[empireId]?.neutralState ?? false;
  for (const cell of ownedCells(state, empireId)) {
    for (const neighbour of neighbors({ q: cell.q, r: cell.r })) {
      const other = gridAt(state.grid, neighbour);
      if (!other || other.owner === empireId || !isClaimable(other.terrain)) continue;
      if (neutralState && other.owner < 0) continue;
      if (other.owner >= 0 && getRelation(state, empireId, other.owner).status !== 'war') continue;
      if (!canAttack(state, empireId, other.owner).allowed) continue;
      edges.push({ from: { q: cell.q, r: cell.r }, target: { q: other.q, r: other.r }, defender: other.owner });
    }
  }
  return edges;
}
