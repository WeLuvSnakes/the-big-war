import type { HexCell } from '../../game/map/map.types';
import type { GameState } from '../../game/state/state.types';
import type { EmpireId } from '../../game/empire/empire.types';
import type { Building } from '../../game/building/building.types';
import { barracksTier } from '../../game/building/building.service';
import { isMannedMachineGun } from '../../game/trench/trench.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { gridAt, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

const ROMAN = ['I', 'II', 'III'] as const;

export function romanLevel(level: number): string {
  return ROMAN[level - 1] ?? `${level}`;
}

export function buildingState(state: GameState, building: Building): string {
  const parts: string[] = [
    building.kind === 'barracks' ? `L${romanLevel(building.level)}` : `L${building.level}`,
  ];
  if (building.kind === 'barracks') parts.push(barracksTier(state, building).troop);
  if (building.kind === 'cannon' && building.cooldown > 0) {
    parts.push(`Reloading ${building.cooldown.toFixed(0)}s`);
  }
  if (building.kind === 'trench' || building.kind === 'city') parts.push(`${Math.floor(building.garrison)} troops`);
  if (building.machineGun) parts.push('MG');
  if (building.kind === 'farm') parts.push(`+${Math.round(building.growth * 100)}%`);
  if (building.demolishAt !== null) parts.push('Demolish');
  return parts.join(' · ');
}

export function attackFrom(state: GameState, hex: Axial, player: EmpireId): Axial | null {
  for (const candidate of neighbors(hex)) {
    if (gridAt(state.grid, candidate)?.owner === player) return candidate;
  }
  return null;
}

export function machineGunStatus(cell: HexCell): string {
  if (!cell.building?.machineGun) return 'None';
  return isMannedMachineGun(cell) ? 'Manned' : 'Unmanned';
}

export function ownNeighbourCount(state: GameState, hex: Axial, player: EmpireId): number {
  return neighbors(hex).filter(candidate => gridAt(state.grid, candidate)?.owner === player).length;
}

export function trenchTargets(state: GameState, hex: Axial, player: EmpireId): number {
  return neighbors(hex).filter(candidate => {
    const owner = gridAt(state.grid, candidate)?.owner;
    return owner !== undefined && owner >= 0 && owner !== player;
  }).length;
}
