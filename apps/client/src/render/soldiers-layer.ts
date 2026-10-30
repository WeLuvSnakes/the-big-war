import { ownerColor } from './theme';
import type { SoldierFrame } from './pixel-sprites';
import type { HexCell } from '../game/map/map.types';
import { Container, Sprite, Text, Texture } from 'pixi.js';
import type { GameState } from '../game/state/state.types';
import type { EmpireId } from '../game/empire/empire.types';
import { DETAIL_TILE_PX, type HexRange } from './terrain-layer';
import type { WorldIndex } from '../game/map/world-index.types';
import type { Offensive } from '../game/offensive/offensive.types';
import { trenchFront, trenchShape, trenchSlots } from './trench-geometry';
import { SOLDIER_SIZE, SOLDIER_SPRITES, SPRITE_PALETTE } from './pixel-sprites';
import { axialToPixel } from '@the-big-war/game-engine/world-tile/world-tile.service';

const MAX_WAVE_SOLDIERS = 30;
const MAX_TRENCH_SOLDIERS = 8;
const FIRE_CYCLE = 0.45;
const IDLE_CYCLE = 1.3;
const SOLDIER_SCALE = 0.32;
const ATTACK_CYCLE = 0.6;
const MARCH_CYCLE = 0.5;
const COUNT_SIZE = 0.34;
const GATHERER_SCALE = 0.26;
const GATHERER_COLOR = 0x8a5a2b;
const REFRESH_FRAMES = 12;
const FAR_COUNT_PX = 14;

export class SoldiersLayer {

  readonly container: Container;
  private readonly textures = new Map<string, Texture>();
  private readonly pool: Sprite[] = [];
  private used = 0;
  private readonly labels: Text[] = [];
  private labelsUsed = 0;
  private garrisons: HexCell[] = [];
  private gatherers: HexCell[] = [];
  private index: WorldIndex | null = null;
  private frame = 0;

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
  }

  draw(state: GameState, hexSize: number, range: HexRange | null, tilePx: number): void {
    this.used = 0;
    this.labelsUsed = 0;
    this.refreshBusyCells(state);
    if (range) {
      const detail = tilePx >= DETAIL_TILE_PX;
      if (detail) this.drawGarrisons(state, hexSize, range);
      for (const offensive of state.offensives) {
        if (detail) this.drawWave(offensive, hexSize, state.elapsed, range);
        else this.drawFarWave(offensive, hexSize, tilePx, range);
      }
      if (detail) {
        this.drawGatherers(hexSize, state.elapsed, range);
        this.drawWalkers(state, hexSize, range);
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
    for (let i = this.labelsUsed; i < this.labels.length; i++) this.labels[i]!.visible = false;
  }

  private refreshBusyCells(state: GameState): void {
    if (state.index === this.index && ++this.frame < REFRESH_FRAMES) return;
    this.index = state.index;
    this.frame = 0;
    this.garrisons = [];
    this.gatherers = [];
    for (const at of state.index.buildings) {
      const cell = state.grid.cells[at]!;
      const building = cell.building;
      if (!building) continue;
      if (building.kind === 'trench' && building.garrison > 0) this.garrisons.push(cell);
      if (building.gatherers.length > 0) this.gatherers.push(cell);
    }
  }

  reset(): void {
    for (const sprite of this.pool) sprite.destroy();
    this.pool.length = 0;
    for (const label of this.labels) label.destroy();
    this.labels.length = 0;
    this.labelsUsed = 0;
    this.used = 0;
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
  }

  private drawGarrisons(state: GameState, hexSize: number, range: HexRange): void {
    for (const cell of this.garrisons) {
      const building = cell.building;
      if (!building || building.kind !== 'trench' || building.garrison <= 0 || !inRange(cell, range)) continue;
      this.drawInTrench(state, cell, building.garrison, cell.owner, false, hexSize);
    }
  }

  private drawInTrench(
    state: GameState,
    cell: HexCell,
    troops: number,
    empire: EmpireId,
    firing: boolean,
    hexSize: number,
  ): void {
    const shape = trenchShape(state.grid, cell);
    const front = trenchFront(shape);
    const center = axialToPixel(cell, hexSize);
    const slots = trenchSlots(shape, hexSize, Math.min(MAX_TRENCH_SOLDIERS, Math.ceil(troops)));
    const color = ownerColor(empire);
    const pixel = (hexSize * SOLDIER_SCALE) / SOLDIER_SIZE;
    let sumX = 0;
    let topY = Number.POSITIVE_INFINITY;
    slots.forEach((slot, i) => {
      const phase = state.elapsed + i * 0.23 + ((cell.q * 7 + cell.r * 13) % 10) / 10;
      let frame: SoldierFrame = 'crouch';
      if (firing) {
        const t = (phase / FIRE_CYCLE) % 1;
        frame = t < 0.18 ? 'fire' : 'aim';
      } else if (Math.floor(phase / IDLE_CYCLE) % 5 === 0) frame = 'aim';
      const sprite = this.acquire();
      sprite.texture = this.texture(color, frame);
      const flip = front.x < 0;
      sprite.scale.set(flip ? -pixel : pixel, pixel);
      sprite.position.set(center.x + slot.x, center.y + slot.y);
      sprite.zIndex = sprite.position.y;
      sumX += sprite.position.x;
      topY = Math.min(topY, sprite.position.y);
    });
    if (slots.length === 0) return;
    const headroom = SOLDIER_SIZE * pixel * 0.7 + hexSize * 0.08;
    this.drawCount(Math.ceil(troops), color, sumX / slots.length, topY - headroom, hexSize * COUNT_SIZE);
  }

  private drawCount(troops: number, color: number, x: number, y: number, size: number): void {
    let label = this.labels[this.labelsUsed];
    if (!label) {
      label = new Text({
        text: '',
        resolution: 4,
        style: { fontFamily: 'Ubuntu, sans-serif', fontWeight: '700', fontSize: 24, fill: 0xffffff, stroke: { color: 0x1b1330, width: 5 } },
      });
      label.anchor.set(0.5, 1);
      label.eventMode = 'none';
      label.zIndex = Number.MAX_SAFE_INTEGER;
      this.labels.push(label);
      this.container.addChild(label);
    }
    this.labelsUsed++;
    const text = String(troops);
    if (label.text !== text) label.text = text;
    label.tint = mixTowardWhite(color);
    label.scale.set(size / 24);
    label.position.set(x, y);
    label.visible = true;
  }

  private drawFarWave(offensive: Offensive, hexSize: number, tilePx: number, range: HexRange): void {
    const { recent } = offensive;
    if (recent.length === 0 || !recent.some(hex => inRange(hex, range))) return;
    let sumX = 0;
    let sumY = 0;
    for (const hex of recent) {
      const at = axialToPixel(hex, hexSize);
      sumX += at.x;
      sumY += at.y;
    }
    const size = (FAR_COUNT_PX * hexSize) / tilePx;
    const color = ownerColor(offensive.empire);
    this.drawCount(Math.ceil(offensive.troops), color, sumX / recent.length, sumY / recent.length, size);
  }

  private drawWave(offensive: Offensive, hexSize: number, elapsed: number, range: HexRange): void {
    const { recent } = offensive;
    if (recent.length === 0 || !recent.some(hex => inRange(hex, range))) return;
    const color = ownerColor(offensive.empire);
    const pixel = (hexSize * SOLDIER_SCALE) / SOLDIER_SIZE;
    const count = Math.min(MAX_WAVE_SOLDIERS, Math.ceil(offensive.troops));
    let sumX = 0;
    let topY = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i++) {
      const hex = recent[i % recent.length]!;
      const at = axialToPixel(hex, hexSize);
      const seed = (i * 37 + offensive.id * 11) % 100;
      const phase = elapsed + seed / 100;
      const t = (phase / ATTACK_CYCLE) % 1;
      const lateral = ((seed % 10) / 10 - 0.5) * hexSize * 0.8;
      const depth = (((seed * 7) % 10) / 10 - 0.5) * hexSize * 0.8;
      const sprite = this.acquire();
      const marchFrame = t < 0.5 ? 'step' : 'idle';
      sprite.texture = this.texture(color, offensive.march ? marchFrame : t < 0.45 ? 'windup' : 'strike');
      sprite.scale.set(offensive.focus.q < hex.q ? -pixel : pixel, pixel);
      sprite.position.set(at.x + lateral, at.y + depth);
      sprite.zIndex = sprite.position.y;
      sumX += sprite.position.x;
      topY = Math.min(topY, sprite.position.y);
    }
    if (count === 0) return;
    const headroom = SOLDIER_SIZE * pixel * 0.85 + hexSize * 0.08;
    this.drawCount(Math.ceil(offensive.troops), color, sumX / count, topY - headroom, hexSize * COUNT_SIZE);
  }

  private drawGatherers(hexSize: number, elapsed: number, range: HexRange): void {
    const pixel = (hexSize * GATHERER_SCALE) / SOLDIER_SIZE;
    for (const cell of this.gatherers) {
      const building = cell.building;
      if (!building || building.gatherers.length === 0 || !inRange(cell, range)) continue;
      building.gatherers.forEach((gatherer, i) => {
        if (gatherer.phase === 'idle') return;
        const at = axialToPixel(gatherer.pos, hexSize);
        const phase = elapsed + i * 0.29;
        let frame: SoldierFrame;
        if (gatherer.phase === 'working') frame = Math.floor(phase / ATTACK_CYCLE) % 2 === 0 ? 'windup' : 'strike';
        else frame = Math.floor(phase / (MARCH_CYCLE / 2)) % 2 === 0 ? 'step' : 'idle';
        const toward = gatherer.phase === 'returning' ? cell.q - gatherer.pos.q : (gatherer.target?.q ?? cell.q) - cell.q;
        const sprite = this.acquire();
        sprite.texture = this.texture(GATHERER_COLOR, frame);
        sprite.scale.set(toward < 0 ? -pixel : pixel, pixel);
        const offset = (i - (building.gatherers.length - 1) / 2) * hexSize * 0.25;
        sprite.position.set(at.x + offset, at.y + hexSize * 0.1);
        sprite.zIndex = sprite.position.y;
      });
    }
  }

  private drawWalkers(state: GameState, hexSize: number, range: HexRange): void {
    const pixel = (hexSize * GATHERER_SCALE) / SOLDIER_SIZE;
    state.walkers.forEach((walker, i) => {
      if (!inRange(walker.pos, range)) return;
      const phase = state.elapsed + i * 0.29;
      let frame: SoldierFrame;
      if (walker.phase === 'building') frame = Math.floor(phase / ATTACK_CYCLE) % 2 === 0 ? 'windup' : 'strike';
      else frame = Math.floor(phase / (MARCH_CYCLE / 2)) % 2 === 0 ? 'step' : 'idle';
      const at = axialToPixel(walker.pos, hexSize);
      const sprite = this.acquire();
      sprite.texture = this.texture(ownerColor(walker.empire), frame);
      sprite.scale.set(pixel, pixel);
      sprite.position.set(at.x, at.y + hexSize * 0.3);
      sprite.zIndex = sprite.position.y;
    });
  }

  private acquire(): Sprite {
    let sprite = this.pool[this.used];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5, 0.85);
      sprite.eventMode = 'none';
      this.pool.push(sprite);
      this.container.addChild(sprite);
    }
    sprite.visible = true;
    this.used++;
    return sprite;
  }

  private texture(color: number, frame: SoldierFrame): Texture {
    const key = `${color},${frame}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const rows = SOLDIER_SPRITES[frame];
    const width = Math.max(...rows.map(row => row.length));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = rows.length;
    const ctx = canvas.getContext('2d')!;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        const value = ch === 'c' ? color : SPRITE_PALETTE[ch];
        if (value === undefined) continue;
        ctx.fillStyle = `#${value.toString(16).padStart(6, '0')}`;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
    this.textures.set(key, texture);
    return texture;
  }
}

function inRange(hex: { readonly q: number; readonly r: number }, range: HexRange): boolean {
  return hex.q >= range.minQ && hex.q <= range.maxQ && hex.r >= range.minR && hex.r <= range.maxR;
}

function mixTowardWhite(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lift = (channel: number): number => Math.round(channel + (255 - channel) * 0.45);
  return (lift(r) << 16) | (lift(g) << 8) | lift(b);
}
