import { Container, Graphics } from 'pixi.js';
import type { HexCell } from '../game/map/map.types';
import type { AxialGrid } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { axialToPixel, gridAt, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

const ROAD_COLOR = 0x9a7b4f;
const ROAD_WIDTH = 0.16;
const ROAD_ALPHA = 0.85;

export class RoadsLayer {

  readonly container: Container;
  private readonly lines = new Graphics();
  private drawn = 0;

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
    this.container.addChild(this.lines);
  }

  draw(grid: AxialGrid<HexCell>, roads: readonly number[], hexSize: number): void {
    if (roads.length === this.drawn) return;
    this.drawn = roads.length;
    this.lines.clear();
    for (const at of roads) {
      const cell = grid.cells[at]!;
      const from = axialToPixel(cell, hexSize);
      for (const hex of neighbors(cell)) {
        const next = gridAt(grid, hex);
        if (!next?.road || next.r < cell.r || (next.r === cell.r && next.q < cell.q)) continue;
        const to = axialToPixel(next, hexSize);
        this.lines.moveTo(from.x, from.y).lineTo(to.x, to.y);
      }
    }
    this.lines.stroke({ color: ROAD_COLOR, width: hexSize * ROAD_WIDTH, alpha: ROAD_ALPHA, cap: 'round' });
  }

  reset(): void {
    this.lines.clear();
    this.drawn = 0;
  }
}
