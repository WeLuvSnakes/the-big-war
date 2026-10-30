import type { HexRange } from './terrain-layer';
import type { GameState } from '../game/state/state.types';
import { DANGER_COLOR, ACCENT_COLOR, ownerColor } from './theme';
import { allBuildingCells } from '../game/map/world-index.service';
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Ship, ShipId, ShipKind } from '../game/ship/ship.types';
import { isBlockaded, isFinishedPort } from '../game/ship/ship.service';
import { SHIP_SPRITES, SHIP_SPRITE_WIDTH, SPRITE_PALETTE } from './pixel-sprites';
import type { Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { axialToPixel, gridCoord } from '@the-big-war/game-engine/world-tile/world-tile.service';

const MIN_ART_PX = 2;
const ART_PX_PER_TILE_PX = 0.12;
const BAR_WIDTH = 22;
const BAR_HEIGHT = 3;
const FLASH_SECONDS = 0.2;
const CULL_MARGIN = 8;
const BLOCKADE_REFRESH_FRAMES = 30;

interface ShipEntry {
  readonly root: Container;
  readonly sprite: Sprite;
  readonly bar: Graphics;
  readonly flash: Graphics;
  readonly ring: Graphics;
  label: Text | null;
  barHp: number;
  facing: number;
}

export class ShipsLayer {
  readonly container: Container;
  private readonly marks = new Graphics();
  private readonly entries = new Map<ShipId, ShipEntry>();
  private readonly textures = new Map<string, Texture>();
  private blockaded: Pixel[] = [];
  private frame = 0;

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
    this.marks.eventMode = 'none';
    this.container.addChild(this.marks);
  }

  draw(state: GameState, hexSize: number, scale: number, range: HexRange | null, selected: ShipId | null): void {
    const tilePx = hexSize * scale;
    const artPx = Math.max(MIN_ART_PX, tilePx * ART_PX_PER_TILE_PX);
    const live = new Set<ShipId>();
    this.marks.clear();
    this.drawBlockades(state, hexSize, scale);
    for (const ship of state.ships) {
      if (ship.hp <= 0) continue;
      live.add(ship.id);
      const entry = this.entryFor(ship.id);
      const at = shipPixel(ship, hexSize);
      entry.root.visible = inRange(ship, range);
      if (ship.id === selected) this.drawCourse(state, ship, at, hexSize, scale);
      if (!entry.root.visible) continue;
      entry.root.position.set(at.x, at.y);
      entry.root.scale.set(1 / scale);
      this.paint(entry, state, ship, artPx, ship.id === selected);
    }
    for (const [id, entry] of this.entries) {
      if (live.has(id)) continue;
      entry.root.destroy({ children: true });
      this.entries.delete(id);
    }
  }

  reset(): void {
    for (const entry of this.entries.values()) entry.root.destroy({ children: true });
    this.entries.clear();
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
    this.blockaded = [];
  }

  private drawBlockades(state: GameState, hexSize: number, scale: number): void {
    if (++this.frame >= BLOCKADE_REFRESH_FRAMES) {
      this.frame = 0;
      this.blockaded = [];
      if (state.ships.some(ship => ship.kind === 'battleship')) {
        for (const cell of allBuildingCells(state)) {
          if (isFinishedPort(cell) && isBlockaded(state, cell)) this.blockaded.push(axialToPixel(cell, hexSize));
        }
      }
    }
    for (const at of this.blockaded) {
      this.marks.circle(at.x, at.y, Math.max(hexSize, 10 / scale));
      this.marks.stroke({ width: 2 / scale, color: DANGER_COLOR });
    }
  }

  private drawCourse(state: GameState, ship: Ship, from: Pixel, hexSize: number, scale: number): void {
    const path = ship.path.slice(ship.pathAt);
    if (path.length === 0) return;
    this.marks.moveTo(from.x, from.y);
    let end = from;
    for (const at of path) {
      end = axialToPixel(gridCoord(state.grid, at), hexSize);
      this.marks.lineTo(end.x, end.y);
    }
    this.marks.stroke({ width: 2 / scale, color: ACCENT_COLOR, alpha: 0.8 });
    this.marks.circle(end.x, end.y, 5 / scale);
    this.marks.stroke({ width: 2 / scale, color: ACCENT_COLOR });
  }

  private paint(entry: ShipEntry, state: GameState, ship: Ship, artPx: number, selected: boolean): void {
    if (ship.next && ship.next.q !== ship.pos.q) entry.facing = ship.next.q < ship.pos.q ? -1 : 1;
    const art = SHIP_SPRITES[ship.kind];
    const halfWidth = (SHIP_SPRITE_WIDTH * artPx) / 2;
    const top = -(art.length * artPx) / 2;
    entry.sprite.texture = this.texture(ownerColor(ship.empire), ship.kind);
    entry.sprite.scale.set(entry.facing * artPx, artPx);

    const fraction = Math.max(0, ship.hp / state.config.ship[ship.kind].hp);
    if (entry.barHp !== ship.hp) {
      entry.barHp = ship.hp;
      entry.bar.clear();
      entry.bar.rect(-BAR_WIDTH / 2 - 1, -1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
      entry.bar.fill({ color: 0x0b0f20 });
      entry.bar.rect(-BAR_WIDTH / 2, 0, BAR_WIDTH * fraction, BAR_HEIGHT);
      entry.bar.fill({ color: fraction > 0.35 ? 0x6fd36f : DANGER_COLOR });
    }
    entry.bar.position.set(0, top - BAR_HEIGHT - 3);

    const firing = ship.kind === 'battleship' && ship.cooldown > state.config.ship.cooldown - FLASH_SECONDS;
    entry.flash.visible = firing;
    entry.flash.position.set(entry.facing * (halfWidth + 3), 0);

    entry.ring.visible = selected;
    entry.ring.scale.set(halfWidth + 5);

    this.drawTroops(entry, ship, top - BAR_HEIGHT - 5);
  }

  private drawTroops(entry: ShipEntry, ship: Ship, y: number): void {
    if (ship.kind !== 'transport') {
      if (entry.label) entry.label.visible = false;
      return;
    }
    entry.label ??= shipLabel(entry.root);
    const text = String(Math.ceil(ship.troops));
    if (entry.label.text !== text) entry.label.text = text;
    entry.label.visible = true;
    entry.label.position.set(0, y);
  }

  private entryFor(id: ShipId): ShipEntry {
    const existing = this.entries.get(id);
    if (existing) return existing;
    const root = new Container();
    root.eventMode = 'none';
    const ring = new Graphics();
    ring.circle(0, 0, 1);
    ring.stroke({ width: 0.08, color: ACCENT_COLOR });
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    const bar = new Graphics();
    const flash = new Graphics();
    flash.circle(0, 0, 6);
    flash.fill({ color: SPRITE_PALETTE.y ?? ACCENT_COLOR });
    root.addChild(ring, sprite, bar, flash);
    this.container.addChild(root);
    const entry: ShipEntry = { root, sprite, bar, flash, ring, label: null, barHp: -1, facing: 1 };
    this.entries.set(id, entry);
    return entry;
  }

  private texture(color: number, kind: ShipKind): Texture {
    const key = `${color},${kind}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const rows = SHIP_SPRITES[kind];
    const canvas = document.createElement('canvas');
    canvas.width = SHIP_SPRITE_WIDTH;
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

function shipLabel(parent: Container): Text {
  const label = new Text({
    text: '',
    resolution: 2,
    style: { fontFamily: 'Ubuntu, sans-serif', fontWeight: '700', fontSize: 12, fill: 0xffffff, stroke: { color: 0x1b1330, width: 3 } },
  });
  label.anchor.set(0.5, 1);
  label.eventMode = 'none';
  parent.addChild(label);
  return label;
}

function shipPixel(ship: Ship, hexSize: number): Pixel {
  const from = axialToPixel(ship.pos, hexSize);
  if (!ship.next) return from;
  const to = axialToPixel(ship.next, hexSize);
  return { x: from.x + (to.x - from.x) * ship.progress, y: from.y + (to.y - from.y) * ship.progress };
}

function inRange(ship: Ship, range: HexRange | null): boolean {
  if (!range) return false;
  const { q, r } = ship.pos;
  return q >= range.minQ - CULL_MARGIN && q <= range.maxQ + CULL_MARGIN && r >= range.minR - CULL_MARGIN && r <= range.maxR + CULL_MARGIN;
}
