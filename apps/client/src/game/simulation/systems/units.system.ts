import { stepBoarding } from './boarding.system';
import type { HexCell } from '../../map/map.types';
import { isClaimable } from '../../map/terrain.service';
import { UNIT_TUNING } from '../../unit/unit.constants';
import { setOwner } from '../../map/world-index.service';
import type { GameState } from '../../state/state.types';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { nextFloat } from '@the-big-war/game-engine/rng/rng.service';
import { gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { resolveModifier } from '@the-big-war/game-engine/modifier/modifier.service';
import type { ProductionQueue, Unit, UnitStats, WeaponStats } from '../../unit/unit.types';
import {
  cellAtPixel,
  createUnit,
  hostileUnits,
  isCover,
  isWalkable,
  pushUnitEvent,
  unitStats,
  weaponDamage,
} from '../../unit/unit.service';

const BUCKET_PX = 64;

interface UnitWorld {
  readonly state: GameState;
  readonly byId: ReadonlyMap<number, Unit>;
  readonly buckets: Map<number, Unit[]>;
  readonly relations: Map<number, boolean>;
}

const bucketKey = (bx: number, by: number): number => bx * 4096 + by;

function indexUnits(state: GameState): UnitWorld {
  const buckets = new Map<number, Unit[]>();
  for (const unit of state.units) {
    const key = bucketKey(Math.floor(unit.x / BUCKET_PX), Math.floor(unit.y / BUCKET_PX));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(unit);
    else buckets.set(key, [unit]);
  }
  return { state, byId: new Map(state.units.map(unit => [unit.id, unit])), buckets, relations: new Map() };
}

function hostile(world: UnitWorld, a: number, b: number): boolean {
  if (a === b) return false;
  const key = a * 1024 + b;
  let known = world.relations.get(key);
  if (known === undefined) {
    known = hostileUnits(world.state, a, b);
    world.relations.set(key, known);
  }
  return known;
}

function near(world: UnitWorld, x: number, y: number, radius: number, visit: (unit: Unit) => void): void {
  const minX = Math.floor((x - radius) / BUCKET_PX);
  const maxX = Math.floor((x + radius) / BUCKET_PX);
  const minY = Math.floor((y - radius) / BUCKET_PX);
  const maxY = Math.floor((y + radius) / BUCKET_PX);
  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      const bucket = world.buckets.get(bucketKey(bx, by));
      if (bucket) for (const unit of bucket) visit(unit);
    }
  }
}

export function stepUnits(state: GameState, dt: number): void {
  if (state.units.some(unit => !state.empires[unit.empire]?.alive)) {
    state.units = state.units.filter(unit => state.empires[unit.empire]?.alive);
  }
  stepProduction(state, dt);
  if (state.units.length === 0) return;
  const world = indexUnits(state);
  for (const unit of state.units) stepUnit(world, unit, dt);
  removeDead(state);
  const after = indexUnits(state);
  for (const unit of state.units) stepCapture(after, unit, dt);
  stepBoarding(state);
}

function stepProduction(state: GameState, dt: number): void {
  state.production = state.production.filter(line => producerAlive(state, line));
  for (const line of state.production) {
    const kind = line.queue[0];
    if (!kind) {
      line.progress = 0;
      continue;
    }
    const trainSpeed = state.empires[line.empire]?.bonuses.trainSpeed;
    line.progress += dt * (trainSpeed ? resolveModifier(1, trainSpeed) : 1);
    if (line.progress < unitStats(kind).trainSeconds) continue;
    line.progress = 0;
    line.queue.shift();
    spawnFrom(state, line, kind);
  }
}

function producerAlive(state: GameState, line: ProductionQueue): boolean {
  const cell = state.grid.cells[line.at];
  return !!cell && cell.owner === line.empire && cell.building?.id === line.building && cell.building.demolishAt === null;
}

function spawnFrom(state: GameState, line: ProductionQueue, kind: Unit['kind']): void {
  const cell = state.grid.cells[line.at]!;
  const size = state.config.map.hexSize;
  const cx = (cell.q + 0.5) * size;
  const cy = (cell.r + 0.5) * size;
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = nextFloat(state.rng) * Math.PI * 2;
    const x = cx + Math.cos(angle) * UNIT_TUNING.spawnRadius;
    const y = cy + Math.sin(angle) * UNIT_TUNING.spawnRadius;
    if (!isWalkable(cellAtPixel(state, x, y))) continue;
    state.units.push(createUnit(state, kind, line.empire, x, y, angle));
    return;
  }
  state.units.push(createUnit(state, kind, line.empire, cx, cy));
}

const MAX_UNIT_SIZE = 13;

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

function pickTarget(world: UnitWorld, unit: Unit, range: number, preferVehicles: boolean, infantryOnly: boolean): Unit | null {
  let best: Unit | null = null;
  let bestDistance = Infinity;
  let vehicle: Unit | null = null;
  let vehicleDistance = Infinity;
  near(world, unit.x, unit.y, range, other => {
    if (other.empire === unit.empire || other.hp <= 0 || !hostile(world, unit.empire, other.empire)) return;
    const gap = distance(unit, other);
    if (gap > range) return;
    const isVehicle = unitStats(other.kind).vehicle;
    if (infantryOnly && isVehicle) return;
    if (gap < bestDistance) {
      bestDistance = gap;
      best = other;
    }
    if (isVehicle && gap < vehicleDistance) {
      vehicleDistance = gap;
      vehicle = other;
    }
  });
  return preferVehicles && vehicle ? vehicle : best;
}

function hitChance(state: GameState, shooter: Unit, weapon: WeaponStats, target: Unit, moving: boolean): number {
  const shooterStats = unitStats(shooter.kind);
  const targetStats = unitStats(target.kind);
  const range = 1 - (weapon.falloff * distance(shooter, target)) / weapon.range;
  const movement = moving ? (shooterStats.vehicle ? UNIT_TUNING.vehicleMovingAccuracy : UNIT_TUNING.movingAccuracy) : 1;
  const pinned = shooter.suppression > UNIT_TUNING.suppressedAt ? UNIT_TUNING.suppressedAccuracy : 1;
  const cover = !targetStats.vehicle && isCover(cellAtPixel(state, target.x, target.y)) ? UNIT_TUNING.coverAccuracy : 1;
  const size = targetStats.vehicle ? UNIT_TUNING.vehicleTargetBonus : 1;
  return weapon.accuracy * range * movement * pinned * cover * size;
}

function fire(world: UnitWorld, shooter: Unit, weapon: WeaponStats, target: Unit, moving: boolean): void {
  const { state } = world;
  const hit = nextFloat(state.rng) < hitChance(state, shooter, weapon, target, moving);
  const spread = weapon.splash > 0 ? UNIT_TUNING.missSpreadHeavy : UNIT_TUNING.missSpreadSmall;
  const miss = hit ? 0 : UNIT_TUNING.missSpread + nextFloat(state.rng) * spread;
  const angle = nextFloat(state.rng) * Math.PI * 2;
  const ex = target.x + Math.cos(angle) * miss;
  const ey = target.y + Math.sin(angle) * miss;
  pushUnitEvent(state, {
    kind: 'shot',
    empire: shooter.empire,
    x: shooter.x,
    y: shooter.y,
    ex,
    ey,
    sound: weapon.sound,
    heavy: weapon.splash > 0,
    vehicle: false,
    angle: 0,
    size: 0,
    radius: weapon.splash,
  });
  if (weapon.splash > 0) {
    near(world, ex, ey, weapon.splash * UNIT_TUNING.splashSuppressionRange, other => {
      if (other.empire === shooter.empire || !hostile(world, shooter.empire, other.empire)) return;
      const gap = Math.hypot(other.x - ex, other.y - ey);
      if (gap < weapon.splash) {
        const falloff = 1 - (gap / weapon.splash) * UNIT_TUNING.splashFalloff;
        other.hp -= weaponDamage(unitStats(other.kind), weapon.penetration, weapon.damage * falloff * combatScale(world.state, shooter, other));
      }
      if (gap < weapon.splash * UNIT_TUNING.splashSuppressionRange) other.suppression = 100;
    });
    return;
  }
  if (hit) target.hp -= weaponDamage(unitStats(target.kind), weapon.penetration, weapon.damage * combatScale(world.state, shooter, target));
  target.suppression = Math.min(100, target.suppression + weapon.suppression);
}

function combatScale(state: GameState, shooter: Unit, target: Unit): number {
  const attack = state.empires[shooter.empire]?.bonuses.attack;
  const defence = state.empires[target.empire]?.bonuses.defence;
  return (attack ? resolveModifier(1, attack) : 1) / (defence ? resolveModifier(1, defence) : 1);
}

function jitter(state: GameState): number {
  return 1 - UNIT_TUNING.cooldownJitter / 2 + nextFloat(state.rng) * UNIT_TUNING.cooldownJitter;
}

function stepUnit(world: UnitWorld, unit: Unit, dt: number): void {
  const { state, byId } = world;
  const stats = unitStats(unit.kind);
  unit.suppression = stats.vehicle ? 0 : Math.max(0, unit.suppression - dt * UNIT_TUNING.suppressionDecay);

  let chased = unit.target === null ? undefined : byId.get(unit.target);
  if (chased && (chased.hp <= 0 || !hostile(world, unit.empire, chased.empire))) chased = undefined;
  if (!chased) unit.target = null;

  if (unit.mode === 'guard') {
    const leash = UNIT_TUNING.guardRadius + UNIT_TUNING.guardLeash;
    if (chased && Math.hypot(chased.x - unit.gx, chased.y - unit.gy) > leash) {
      chased = undefined;
      unit.target = null;
    }
    if (!chased) {
      let best: number = UNIT_TUNING.guardRadius;
      near(world, unit.gx, unit.gy, best, other => {
        if (other.empire === unit.empire || other.hp <= 0 || !hostile(world, unit.empire, other.empire)) return;
        const gap = Math.hypot(other.x - unit.gx, other.y - unit.gy);
        if (gap < best) {
          best = gap;
          chased = other;
          unit.target = other.id;
        }
      });
    }
  }

  let target = chased && distance(unit, chased) <= stats.weapon.range ? chased : null;
  if (!target) target = pickTarget(world, unit, stats.weapon.range, unit.kind === 'tank', false);

  let goalX = unit.tx;
  let goalY = unit.ty;
  if (unit.mode === 'guard' && !chased) {
    goalX = unit.gx;
    goalY = unit.gy;
  }
  if (chased && !target && unit.mode !== 'hold') {
    goalX = chased.x;
    goalY = chased.y;
  }

  const dx = goalX - unit.x;
  const dy = goalY - unit.y;
  const gap = Math.hypot(dx, dy);
  const moving = gap > UNIT_TUNING.arriveDistance && !(chased && target);
  if (moving) {
    const pinned = unit.suppression > UNIT_TUNING.suppressedAt ? UNIT_TUNING.suppressedSpeed : 1;
    const travel = Math.min(stats.speed * pinned * dt, gap);
    move(state, unit, (dx / gap) * travel, (dy / gap) * travel);
    unit.face = Math.atan2(dy, dx);
    unit.hull = unit.face;
    unit.setup = stats.setupSeconds;
    unit.moving = true;
  } else {
    unit.moving = false;
    if (unit.setup > 0) unit.setup -= dt;
    if (!target && unit.heading !== null) {
      const turn = Math.atan2(Math.sin(unit.heading - unit.face), Math.cos(unit.heading - unit.face));
      unit.face += turn * Math.min(1, dt * 6);
    }
  }

  separate(world, unit, stats);

  unit.cooldown -= dt;
  if (target && unit.cooldown <= 0 && unit.setup <= 0) {
    unit.face = Math.atan2(target.y - unit.y, target.x - unit.x);
    fire(world, unit, stats.weapon, target, moving);
    unit.cooldown = stats.weapon.cooldown * jitter(state);
  }
  if (stats.coax) {
    unit.coaxCooldown -= dt;
    const close = unit.coaxCooldown <= 0 ? pickTarget(world, unit, stats.coax.range, false, true) : null;
    if (close) {
      fire(world, unit, stats.coax, close, moving);
      unit.coaxCooldown = stats.coax.cooldown * jitter(state);
    }
  }
}

function move(state: GameState, unit: Unit, dx: number, dy: number): void {
  if (isWalkable(cellAtPixel(state, unit.x + dx, unit.y + dy))) {
    unit.x += dx;
    unit.y += dy;
  } else if (isWalkable(cellAtPixel(state, unit.x + dx, unit.y))) {
    unit.x += dx;
  } else if (isWalkable(cellAtPixel(state, unit.x, unit.y + dy))) {
    unit.y += dy;
  }
}

function separate(world: UnitWorld, unit: Unit, stats: UnitStats): void {
  const { state } = world;
  near(world, unit.x, unit.y, stats.size + MAX_UNIT_SIZE, other => {
    if (other === unit) return;
    const otherSize = unitStats(other.kind).size;
    const ox = unit.x - other.x;
    const oy = unit.y - other.y;
    const gap = Math.hypot(ox, oy);
    const need = stats.size + otherSize - 1;
    if (gap >= need || gap <= 0) return;
    const push = (need - gap) * (otherSize > stats.size ? 0.8 : 0.5);
    move(state, unit, (ox / gap) * push, (oy / gap) * push);
  });
  const width = state.grid.width * state.config.map.hexSize;
  const height = state.grid.height * state.config.map.hexSize;
  unit.x = Math.min(width - 5, Math.max(5, unit.x));
  unit.y = Math.min(height - 5, Math.max(5, unit.y));
}

function removeDead(state: GameState): void {
  if (!state.units.some(unit => unit.hp <= 0)) return;
  for (const unit of state.units) {
    if (unit.hp > 0) continue;
    const stats = unitStats(unit.kind);
    pushUnitEvent(state, {
      kind: 'death',
      empire: unit.empire,
      x: unit.x,
      y: unit.y,
      ex: unit.x,
      ey: unit.y,
      sound: unit.kind,
      heavy: stats.vehicle,
      vehicle: stats.vehicle,
      angle: stats.vehicle ? unit.hull : nextFloat(state.rng) * Math.PI * 2,
      size: stats.size,
      radius: stats.vehicle ? UNIT_TUNING.deathBlastRadius : 0,
    });
  }
  state.units = state.units.filter(unit => unit.hp > 0);
}

function capturable(world: UnitWorld, unit: Unit, cell: HexCell): boolean {
  if (!isClaimable(cell.terrain) || cell.owner === unit.empire) return false;
  return cell.owner === NEUTRAL_OWNER || hostile(world, unit.empire, cell.owner);
}

function contested(world: UnitWorld, unit: Unit): boolean {
  let found = false;
  near(world, unit.x, unit.y, UNIT_TUNING.captureClearRadius, other => {
    if (found || other.empire === unit.empire || !hostile(world, unit.empire, other.empire)) return;
    found = distance(unit, other) < UNIT_TUNING.captureClearRadius;
  });
  return found;
}

function stepCapture(world: UnitWorld, unit: Unit, dt: number): void {
  const { state } = world;
  const cell = cellAtPixel(state, unit.x, unit.y);
  if (!cell || !capturable(world, unit, cell)) {
    unit.captureAt = -1;
    unit.capture = 0;
    return;
  }
  const at = gridIndex(state.grid, cell.q, cell.r);
  if (unit.captureAt !== at) {
    unit.captureAt = at;
    unit.capture = 0;
  }
  if (contested(world, unit)) return;
  const building = cell.building;
  unit.capture += dt;
  if (unit.capture < UNIT_TUNING.captureSeconds) return;
  unit.capture = 0;
  setOwner(state, cell, unit.empire);
  if (building) {
    if (building.kind === 'cannon' || building.kind === 'battery') building.cooldown = 0;
    building.demolishAt = null;
    building.shipBuild = 0;
  }
}
