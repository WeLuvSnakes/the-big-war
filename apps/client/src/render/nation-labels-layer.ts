import { Container, Text } from 'pixi.js';
import type { GameState } from '../game/state/state.types';
import type { EmpireId } from '../game/empire/empire.types';
import type { WorldIndex } from '../game/map/world-index.types';

const LABEL_ALPHA = 0.28;
const MIN_HEXES = 6;
const FONT_SCALE = 0.12;
const MAX_SPAN = 0.5;
const REFRESH_SECONDS = 1;
const MAX_FONT = 96;
const FONT_STEP = 4;

export class NationLabelsLayer {
  readonly container: Container;
  private readonly labels = new Map<EmpireId, Text>();
  private lastElapsed = Number.NEGATIVE_INFINITY;
  private index: WorldIndex | null = null;

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
  }

  draw(state: GameState, hexSize: number): void {
    const fresh = state.index !== this.index || state.elapsed < this.lastElapsed;
    if (!fresh && state.elapsed - this.lastElapsed < REFRESH_SECONDS) return;
    this.index = state.index;
    this.lastElapsed = state.elapsed;

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
      const wanted = Math.max(8, hexSize * FONT_SCALE * Math.sqrt(s.n));
      const font = Math.min(MAX_FONT, Math.round(wanted / FONT_STEP) * FONT_STEP || FONT_STEP);
      label.scale.set(1);
      if (label.style.fontSize !== font) label.style.fontSize = font;
      const spanW = (s.maxX - s.minX + hexSize) * MAX_SPAN;
      const spanH = (s.maxY - s.minY + hexSize) * MAX_SPAN;
      label.scale.set(Math.min(wanted / font, spanW / label.width, spanH / label.height));
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
  const { grid, index } = state;
  const { width, height, cells } = grid;
  const seen = new Uint8Array(cells.length);
  const stack: number[] = [];
  const best = new Map<EmpireId, Cluster>();
  for (const [owner, tiles] of index.tiles) {
    for (const start of tiles) {
      if (seen[start]) continue;
      const cluster: Cluster = {
        x: 0,
        y: 0,
        n: 0,
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      };
      seen[start] = 1;
      stack.push(start);
      while (stack.length > 0) {
        const at = stack.pop()!;
        const q = at % width;
        const r = (at - q) / width;
        const x = (q + 0.5) * hexSize;
        const y = (r + 0.5) * hexSize;
        cluster.x += x;
        cluster.y += y;
        cluster.n += 1;
        if (x < cluster.minX) cluster.minX = x;
        if (x > cluster.maxX) cluster.maxX = x;
        if (y < cluster.minY) cluster.minY = y;
        if (y > cluster.maxY) cluster.maxY = y;
        if (q + 1 < width) visit(at + 1);
        if (q > 0) visit(at - 1);
        if (r + 1 < height) visit(at + width);
        if (r > 0) visit(at - width);
      }
      const current = best.get(owner);
      if (!current || cluster.n > current.n) best.set(owner, cluster);

      function visit(next: number): void {
        if (seen[next] || cells[next]!.owner !== owner) return;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return best;
}
