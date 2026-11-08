import { ownerColor } from './theme';
import { Container, Graphics } from 'pixi.js';
import { unitStats } from '../game/unit/unit.service';
import { UNIT_TUNING } from '../game/unit/unit.constants';
import type { GameState } from '../game/state/state.types';
import type { Unit, UnitEvent, UnitShape } from '../game/unit/unit.types';
import type { UnitMark, UnitsView, UnitBody, UnitBoom, UnitShot } from './units-layer.types';

export type * from './units-layer.types';

const SHOT_SECONDS = 0.12;
const HEAVY_SHOT_SECONDS = 0.2;
const MAX_BODIES = 300;
const MARK_SECONDS = 0.66;
const SELECTED_COLOR = 0xffffff;
const OUTLINE_COLOR = 0x000000;
const TRACER_COLOR = 0xffd27a;
const HEAVY_TRACER_COLOR = 0xffffff;
const MUZZLE_COLOR = 0xfff3b0;
const BOOM_COLOR = 0xffb347;
const SMOKE_COLOR = 0x55504a;
const WRECK_COLOR = 0x1d1b17;
const SCORCH_COLOR = 0x3b2a1a;
const TRACK_COLOR = 0x222222;
const HP_BACK = 0x000000;
const HP_GOOD = 0x7cc46a;
const HP_LOW = 0xe0a03a;
const PINNED_COLOR = 0xffcc00;
const GUARD_COLOR = 0xe8c95a;
const HOLD_COLOR = 0xcccccc;
const RANGE_COLOR = 0xffffff;
const BOX_COLOR = 0x7cc46a;
const ORDER_LINE_COLOR = 0x7cc46a;
const SETUP_COLOR = 0xffffff;

export class UnitsLayer {
  readonly container: Container;
  private readonly ground = new Graphics();
  private readonly gfx = new Graphics();
  private readonly fx = new Graphics();
  private shots: UnitShot[] = [];
  private booms: UnitBoom[] = [];
  private bodies: UnitBody[] = [];
  private marks: UnitMark[] = [];
  private lastEvent = 0;

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
    this.container.addChild(this.ground, this.gfx, this.fx);
  }

  ping(x: number, y: number, color: number): void {
    this.marks.push({ x, y, color, life: 1 });
  }

  draw(state: GameState, view: UnitsView, scale: number, dt: number): void {
    this.consume(state.unitEvents);
    this.age(dt);
    this.drawGround();
    const g = this.gfx;
    g.clear();
    const selected = state.units.filter(unit => view.selected.has(unit.id));
    this.drawOrders(g, selected, scale);
    for (const unit of state.units) this.drawUnit(g, unit, view.selected.has(unit.id), unit.empire === view.player);
    this.drawEffects(scale);
    if (view.box) {
      const { x0, y0, x1, y1 } = view.box;
      g.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.fill({ color: BOX_COLOR, alpha: 0.13 });
      g.stroke({ width: 1 / scale, color: BOX_COLOR });
    }
  }

  reset(): void {
    this.shots = [];
    this.booms = [];
    this.bodies = [];
    this.marks = [];
    this.lastEvent = 0;
    this.ground.clear();
    this.gfx.clear();
    this.fx.clear();
  }

  private consume(events: readonly UnitEvent[]): void {
    for (const event of events) {
      if (event.id <= this.lastEvent) continue;
      this.lastEvent = event.id;
      if (event.kind === 'shot') {
        this.shots.push({ x: event.x, y: event.y, ex: event.ex, ey: event.ey, heavy: event.heavy, sniper: event.sound === 'sniper', life: event.heavy ? HEAVY_SHOT_SECONDS : SHOT_SECONDS });
        if (event.heavy) this.booms.push({ x: event.ex, y: event.ey, r: event.radius, life: 1 });
        continue;
      }
      this.bodies.push({ x: event.x, y: event.y, empire: event.empire, angle: event.angle, wreck: event.vehicle, size: event.size });
      if (this.bodies.length > MAX_BODIES) this.bodies.shift();
      if (event.vehicle) this.booms.push({ x: event.x, y: event.y, r: event.radius, life: 1.4 });
    }
  }

  private age(dt: number): void {
    for (const shot of this.shots) shot.life -= dt;
    this.shots = this.shots.filter(shot => shot.life > 0);
    for (const boom of this.booms) boom.life -= dt * 1.6;
    this.booms = this.booms.filter(boom => boom.life > 0);
    for (const mark of this.marks) mark.life -= dt / MARK_SECONDS;
    this.marks = this.marks.filter(mark => mark.life > 0);
  }

  private drawGround(): void {
    const g = this.ground;
    g.clear();
    for (const body of this.bodies) {
      if (body.wreck) {
        rotatedRect(g, body.x, body.y, body.angle, -body.size * 1.3, -body.size * 0.8, body.size * 2.6, body.size * 1.6);
        g.fill({ color: WRECK_COLOR });
        g.circle(body.x, body.y, body.size * 0.6);
        g.fill({ color: SCORCH_COLOR });
        continue;
      }
      rotatedRect(g, body.x, body.y, body.angle, -5, -2, 10, 4);
      g.fill({ color: darken(ownerColor(body.empire)) });
    }
  }

  private drawOrders(g: Graphics, selected: readonly Unit[], scale: number): void {
    if (selected.length === 0) return;
    const guards = new Set<string>();
    for (const unit of selected) {
      if (unit.mode === 'guard' && !guards.has(`${unit.gx},${unit.gy}`)) {
        guards.add(`${unit.gx},${unit.gy}`);
        g.circle(unit.gx, unit.gy, UNIT_TUNING.guardRadius);
        g.stroke({ width: 1 / scale, color: GUARD_COLOR, alpha: 0.4 });
      }
      if (Math.hypot(unit.tx - unit.x, unit.ty - unit.y) > 4) {
        g.moveTo(unit.x, unit.y);
        g.lineTo(unit.tx, unit.ty);
        g.stroke({ width: 1 / scale, color: unit.mode === 'guard' ? GUARD_COLOR : ORDER_LINE_COLOR, alpha: 0.4 });
      }
    }
    const cx = selected.reduce((sum, unit) => sum + unit.x, 0) / selected.length;
    const cy = selected.reduce((sum, unit) => sum + unit.y, 0) / selected.length;
    const reach = Math.max(...selected.map(unit => unitStats(unit.kind).weapon.range));
    g.circle(cx, cy, reach);
    g.stroke({ width: 1.5 / scale, color: RANGE_COLOR, alpha: 0.15 });
  }

  private drawUnit(g: Graphics, unit: Unit, selected: boolean, own: boolean): void {
    const stats = unitStats(unit.kind);
    const color = ownerColor(unit.empire);
    if (stats.vehicle) this.drawVehicle(g, unit, color, selected);
    else {
      shapePath(g, stats.shape, unit.x, unit.y, stats.size);
      g.fill({ color });
      g.stroke({ width: selected ? 2 : 1, color: selected ? SELECTED_COLOR : OUTLINE_COLOR, alpha: selected ? 1 : 0.5 });
      g.moveTo(unit.x, unit.y);
      g.lineTo(unit.x + Math.cos(unit.face) * 9, unit.y + Math.sin(unit.face) * 9);
      g.stroke({ width: 1, color: OUTLINE_COLOR, alpha: 0.65 });
    }
    if (unit.hp < stats.hp) {
      const width = stats.size * 2.8;
      const top = unit.y - stats.size - 6;
      g.rect(unit.x - width / 2, top, width, 2);
      g.fill({ color: HP_BACK });
      g.rect(unit.x - width / 2, top, (width * Math.max(0, unit.hp)) / stats.hp, 2);
      g.fill({ color: unit.hp / stats.hp > 0.4 ? HP_GOOD : HP_LOW });
    }
    if (own && stats.setupSeconds > 0 && unit.setup > 0) {
      g.arc(unit.x, unit.y, stats.size + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - unit.setup / stats.setupSeconds));
      g.stroke({ width: 1, color: SETUP_COLOR, alpha: 0.8 });
    } else if (own && unit.mode !== 'amove') {
      g.circle(unit.x, unit.y + stats.size + 5, 1.6);
      g.fill({ color: unit.mode === 'hold' ? HOLD_COLOR : GUARD_COLOR });
    }
    if (unit.suppression > UNIT_TUNING.suppressedAt) {
      g.rect(unit.x + stats.size + 1, unit.y - stats.size - 3, 1.4, 4);
      g.fill({ color: PINNED_COLOR });
    }
  }

  private drawVehicle(g: Graphics, unit: Unit, color: number, selected: boolean): void {
    const s = unitStats(unit.kind).size;
    const { x, y, hull, face } = unit;
    const outline = { width: selected ? 2 : 1, color: selected ? SELECTED_COLOR : OUTLINE_COLOR, alpha: selected ? 1 : 0.65 };
    if (unit.kind === 'tank') {
      rotatedRect(g, x, y, hull, -s * 1.2, -s * 0.95, s * 2.4, s * 0.35);
      rotatedRect(g, x, y, hull, -s * 1.2, s * 0.6, s * 2.4, s * 0.35);
      g.fill({ color: TRACK_COLOR });
      rotatedRect(g, x, y, hull, -s * 1.1, -s * 0.65, s * 2.2, s * 1.3);
      g.fill({ color });
      g.stroke(outline);
      rotatedRect(g, x, y, face, 0, -1.5, s * 1.7, 3);
      g.fill({ color });
      g.circle(x, y, s * 0.5);
      g.fill({ color });
      g.stroke({ width: 1, color: OUTLINE_COLOR, alpha: 0.8 });
      return;
    }
    g.poly(
      rotated(x, y, hull, [
        [-s, -s * 0.6],
        [s * 0.7, -s * 0.6],
        [s * 1.1, -s * 0.3],
        [s * 1.1, s * 0.3],
        [s * 0.7, s * 0.6],
        [-s, s * 0.6],
      ]),
    );
    g.fill({ color });
    g.stroke(outline);
    rotatedRect(g, x, y, hull, s * 0.35, -s * 0.5, s * 0.3, s);
    g.fill({ color: OUTLINE_COLOR, alpha: 0.4 });
    rotatedRect(g, x, y, face, 0, -1, s * 0.9, 2);
    g.fill({ color });
    const [tx, ty] = rotated(x, y, face, [[-s * 0.1, 0]]);
    g.circle(tx!, ty!, s * 0.3);
    g.fill({ color });
    g.stroke({ width: 1, color: OUTLINE_COLOR, alpha: 0.8 });
  }

  private drawEffects(scale: number): void {
    const g = this.fx;
    g.clear();
    for (const shot of this.shots) {
      const alpha = Math.min(1, shot.life / SHOT_SECONDS);
      g.moveTo(shot.x, shot.y);
      g.lineTo(shot.ex, shot.ey);
      g.stroke({ width: shot.heavy ? 2.6 : shot.sniper ? 1.6 : 1, color: shot.heavy || shot.sniper ? HEAVY_TRACER_COLOR : TRACER_COLOR, alpha });
      g.circle(shot.x, shot.y, 2.5);
      g.fill({ color: MUZZLE_COLOR, alpha });
    }
    for (const boom of this.booms) {
      const grown = 1 - boom.life;
      g.circle(boom.x, boom.y, boom.r * (0.3 + grown * 0.7));
      g.fill({ color: BOOM_COLOR, alpha: clamp01(boom.life) });
      g.circle(boom.x, boom.y, boom.r * (0.5 + Math.abs(grown)));
      g.fill({ color: SMOKE_COLOR, alpha: clamp01(boom.life * 0.6) });
    }
    for (const mark of this.marks) {
      g.circle(mark.x, mark.y, 14 * (1.4 - mark.life));
      g.stroke({ width: 2 / scale, color: mark.color, alpha: clamp01(mark.life) });
    }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function darken(color: number): number {
  const r = ((color >> 16) & 0xff) * 0.5;
  const g = ((color >> 8) & 0xff) * 0.5;
  const b = (color & 0xff) * 0.5;
  return (r << 16) | (g << 8) | b;
}

function rotated(x: number, y: number, angle: number, points: readonly (readonly [number, number])[]): number[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out: number[] = [];
  for (const [px, py] of points) out.push(x + px * cos - py * sin, y + px * sin + py * cos);
  return out;
}

function rotatedRect(g: Graphics, x: number, y: number, angle: number, left: number, top: number, width: number, height: number): void {
  g.poly(
    rotated(x, y, angle, [
      [left, top],
      [left + width, top],
      [left + width, top + height],
      [left, top + height],
    ]),
  );
}

function shapePath(g: Graphics, shape: UnitShape, x: number, y: number, r: number): void {
  if (shape === 'circle') g.circle(x, y, r);
  else if (shape === 'square') g.rect(x - r, y - r, r * 2, r * 2);
  else if (shape === 'diamond') g.poly([x, y - r - 1, x + r + 1, y, x, y + r + 1, x - r - 1, y]);
  else g.poly([x, y - r - 1, x + r + 1, y + r, x - r - 1, y + r]);
}
