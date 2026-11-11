import { ownerColor } from './theme';
import type { SoldierFrame } from './pixel-sprites';
import { Container, Sprite, Texture } from 'pixi.js';
import type { HexCell } from '../game/map/map.types';
import type { GameState } from '../game/state/state.types';
import { DETAIL_TILE_PX, type HexRange } from './terrain-layer';
import type { WorldIndex } from '../game/map/world-index.types';
import { SOLDIER_SIZE, SOLDIER_SPRITES, SPRITE_PALETTE } from './pixel-sprites';
import { axialToPixel } from '@the-big-war/game-engine/world-tile/world-tile.service';

const ATTACK_CYCLE = 0.6;
const MARCH_CYCLE = 0.5;
const GATHERER_SCALE = 0.26;
const GATHERER_COLOR = 0x8a5a2b;
const REFRESH_FRAMES = 12;

export class SoldiersLayer {

  readonly container: Container;
  private readonly textures = new Map<string, Texture>();
  private readonly pool: Sprite[] = [];
  private used = 0;
  private gatherers: HexCell[] = [];
  private index: WorldIndex | null = null;
  private frame = 0;

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
  }

  draw(state: GameState, hexSize: number, range: HexRange | null, tilePx: number): void {
    this.used = 0;
    this.refreshBusyCells(state);
    if (range) {
      if (tilePx >= DETAIL_TILE_PX) {
        this.drawGatherers(hexSize, state.elapsed, range);
        this.drawWalkers(state, hexSize, range);
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  private refreshBusyCells(state: GameState): void {
    if (state.index === this.index && ++this.frame < REFRESH_FRAMES) return;
    this.index = state.index;
    this.frame = 0;
    this.gatherers = [];
    for (const at of state.index.buildings) {
      const cell = state.grid.cells[at]!;
      const building = cell.building;
      if (!building) continue;
      if (building.gatherers.length > 0) this.gatherers.push(cell);
    }
  }

  reset(): void {
    for (const sprite of this.pool) sprite.destroy();
    this.pool.length = 0;
    this.used = 0;
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
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
    sprite.tint = 0xffffff;
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

