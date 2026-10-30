import { Container, Text } from 'pixi.js';
import type { GameState } from '../game/state/state.types';
import type { EmpireId } from '../game/empire/empire.types';
import { NEUTRAL_OWNER } from '../game/empire/empire.constants';
import { axialToPixel, gridCoord, neighbors, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';

const LABEL_ALPHA = 0.28;
const MIN_HEXES = 6;
const FONT_SCALE = 0.12;
const MAX_SPAN = 0.5;

export class NationLabelsLayer {
  readonly container: Container;
  private readonly labels = new Map<EmpireId, Text>();
  private lastTick = -1;

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
  }

  draw(state: GameState, hexSize: number): void {
    if (state.tick === this.lastTick) return;
    this.lastTick = state.tick;

    const sums = largestClusters(state, hexSize);

    for (const empire of state.empires) {
      const s = sums.get(empire.id);
      let label = this.labels.get(empire.id);
      if (!s || s.n < MIN_HEXES) {
        if (label) label.visible = false;
        continue;
      }
      if (!label) {
        label = new Text({
          text: empire.name.toUpperCase(),
          style: { fontFamily: 'sans-serif', fontWeight: '900', fill: 0xffffff, letterSpacing: 4, align: 'center' },
        });
        label.anchor.set(0.5);
        label.alpha = LABEL_ALPHA;
        this.labels.set(empire.id, label);
        this.container.addChild(label);
      }
      const name = empire.name.toUpperCase();
      if (label.text !== name) label.text = name;
      label.visible = true;
      label.scale.set(1);
      label.style.fontSize = Math.max(8, hexSize * FONT_SCALE * Math.sqrt(s.n));
      const spanW = (s.maxX - s.minX + hexSize) * MAX_SPAN;
      const spanH = (s.maxY - s.minY + hexSize) * MAX_SPAN;
      label.scale.set(Math.min(1, spanW / label.width, spanH / label.height));
      label.position.set(s.x / s.n, s.y / s.n);
    }
  }
}

interface Cluster {
  x: number;
  y: number;
  n: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function largestClusters(state: GameState, hexSize: number): Map<EmpireId, Cluster> {
  const { grid } = state;
  const seen = new Uint8Array(grid.cells.length);
  const best = new Map<EmpireId, Cluster>();
  grid.cells.forEach((cell, start) => {
    if (seen[start] || cell.owner === NEUTRAL_OWNER) return;
    const owner = cell.owner;
    const first = axialToPixel(gridCoord(grid, start), hexSize);
    const cluster: Cluster = { x: 0, y: 0, n: 0, minX: first.x, maxX: first.x, minY: first.y, maxY: first.y };
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop()!;
      const hex = gridCoord(grid, index);
      const p = axialToPixel(hex, hexSize);
      cluster.x += p.x;
      cluster.y += p.y;
      cluster.n += 1;
      cluster.minX = Math.min(cluster.minX, p.x);
      cluster.maxX = Math.max(cluster.maxX, p.x);
      cluster.minY = Math.min(cluster.minY, p.y);
      cluster.maxY = Math.max(cluster.maxY, p.y);
      for (const next of neighbors(hex)) {
        if (next.q < 0 || next.r < 0 || next.q >= grid.width || next.r >= grid.height) continue;
        const nextIndex = gridIndex(grid, next.q, next.r);
        if (seen[nextIndex] || grid.cells[nextIndex]!.owner !== owner) continue;
        seen[nextIndex] = 1;
        stack.push(nextIndex);
      }
    }
    const current = best.get(owner);
    if (!current || cluster.n > current.n) best.set(owner, cluster);
  });
  return best;
}

