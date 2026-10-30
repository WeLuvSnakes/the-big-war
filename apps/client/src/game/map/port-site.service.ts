import { MAP_SHAPE } from './map.constants';
import { isClaimable, isWater } from './terrain.service';
import type { HexCell, HexGrid, WorldLabels } from './map.types';
import { gridAt, gridIndex, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

export function portWaterBody(grid: HexGrid, labels: WorldLabels, cell: HexCell): number {
  if (!isClaimable(cell.terrain)) return -1;
  let best = -1;
  for (const hex of neighbors(cell)) {
    const next = gridAt(grid, hex);
    if (!next || !isWater(next.terrain)) continue;
    const body = labels.waterBody[gridIndex(grid, hex.q, hex.r)]!;
    if (labels.waterSizes[body]! < MAP_SHAPE.portMinWater) continue;
    if (best === -1 || labels.waterSizes[body]! > labels.waterSizes[best]!) best = body;
  }
  return best;
}

export function isPortSite(grid: HexGrid, labels: WorldLabels, cell: HexCell): boolean {
  return cell.building === null && portWaterBody(grid, labels, cell) !== -1;
}
