

import { Container, Graphics } from 'pixi.js';
import type { OverlayState, SpawnPlot } from './overlay-layer.types';
import { PLOT_BEFORE, START_PLOT } from '../game/state/setup.constants';
import type { Axial, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { axialToPixel, hexCorners, ring } from '@the-big-war/game-engine/world-tile/world-tile.service';
import {
  DANGER_COLOR,
  HOVER_COLOR,
  HOVER_WIDTH,
  INFO_COLOR,
  SELECTION_COLOR,
  SELECTION_WIDTH,
} from './theme';

export type * from './overlay-layer.types';


export class OverlayLayer {
  
  readonly container: Container;
  private readonly gfx: Graphics;

  constructor() {
    this.container = new Container();
    this.gfx = new Graphics();
    this.gfx.eventMode = 'none';
    this.container.eventMode = 'none';
    this.container.addChild(this.gfx);
  }

  draw(state: OverlayState, hexSize: number): void {
    const g = this.gfx;
    g.clear();

    for (const plot of state.spawnPlots) this.drawSpawnPlot(g, plot, hexSize);

    if (state.selected) this.drawOutline(g, state.selected, hexSize, SELECTION_COLOR, SELECTION_WIDTH, 1);
    if (state.hovered && !sameHex(state.hovered, state.selected)) {
      this.drawOutline(g, state.hovered, hexSize, HOVER_COLOR, HOVER_WIDTH, 0.6);
    }

    if (state.ghost && !state.ghost.valid) {
      this.drawOutline(g, state.ghost.hex, hexSize, DANGER_COLOR, HOVER_WIDTH, 0.8);
    }

    if (state.cannonFrom) {
      this.drawRangeRing(g, state.cannonFrom, state.cannonRange, hexSize);
      if (state.cannonTarget) this.drawReticle(g, state.cannonTarget, hexSize);
    }
  }

  private drawSpawnPlot(g: Graphics, plot: SpawnPlot, hexSize: number): void {
    const center = axialToPixel(plot.hex, hexSize);
    const left = center.x - hexSize * (PLOT_BEFORE + 0.5);
    const top = center.y - hexSize * (PLOT_BEFORE + 0.5);
    const side = hexSize * START_PLOT;
    g.rect(left, top, side, side);
    g.fill({ color: plot.color, alpha: plot.own ? 0.85 : 0.6 });
    g.rect(left, top, side, side);
    g.stroke({ width: hexSize * (plot.own ? 0.5 : 0.25), color: plot.own ? 0xffffff : plot.color, alpha: 1 });
  }

  private drawOutline(
    g: Graphics,
    hex: Axial,
    hexSize: number,
    color: number,
    width: number,
    alpha: number,
  ): void {
    const center = axialToPixel(hex, hexSize);
    const points = hexPolygon(center, hexSize * 0.98);
    g.poly(points);
    g.stroke({ width, color, alpha });
  }

  private drawRangeRing(g: Graphics, from: Axial, range: number, hexSize: number): void {
    
    const center = axialToPixel(from, hexSize);
    for (const hex of ring(from, range)) {
      g.poly(hexPolygon(axialToPixel(hex, hexSize), hexSize * 0.9));
    }
    g.stroke({ width: 1.5, color: INFO_COLOR, alpha: 0.35 });
    g.circle(center.x, center.y, 3);
    g.fill({ color: INFO_COLOR, alpha: 0.9 });
  }

  private drawReticle(g: Graphics, target: Axial, hexSize: number): void {
    const center = axialToPixel(target, hexSize);
    const outer = hexSize * 0.85;
    const inner = hexSize * 0.4;
    g.moveTo(center.x - outer, center.y);
    g.lineTo(center.x - inner, center.y);
    g.moveTo(center.x + inner, center.y);
    g.lineTo(center.x + outer, center.y);
    g.moveTo(center.x, center.y - outer);
    g.lineTo(center.x, center.y - inner);
    g.moveTo(center.x, center.y + inner);
    g.lineTo(center.x, center.y + outer);
    g.stroke({ width: 2, color: DANGER_COLOR, alpha: 0.95 });
    g.circle(center.x, center.y, inner);
    g.stroke({ width: 1.5, color: DANGER_COLOR, alpha: 0.8 });
  }
}

function hexPolygon(center: Pixel, size: number): number[] {
  return hexCorners(center, size).flatMap(corner => [corner.x, corner.y]);
}

function sameHex(a: Axial, b: Axial | null): boolean {
  return b !== null && a.q === b.q && a.r === b.r;
}
