import { createSignal } from 'solid-js';
import type { SelectionBox } from '../render/units-layer.types';
import { unitStats, groupFormation } from '../game/unit/unit.service';
import type { Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type { UnitControlDeps, UnitControls, UnitMenu } from './unit-controls.types';
import type { Formation, Unit, UnitId, UnitKind, UnitOrder } from '../game/unit/unit.types';

export type * from './unit-controls.types';

const PICK_PX = 10;
const DOUBLE_CLICK_MS = 350;
const MOVE_COLOR = 0x7cc46a;
const GUARD_COLOR = 0xe8c95a;
const ATTACK_COLOR = 0xff6a55;
const ARRANGE_COLOR = 0xffffff;

export function createUnitControls(deps: UnitControlDeps): UnitControls {
  const { store } = deps;
  const [selected, setSelected] = createSignal<ReadonlySet<UnitId>>(new Set());
  const [box, setBox] = createSignal<SelectionBox | null>(null);
  const [menu, setMenu] = createSignal<UnitMenu | null>(null);
  let lastClick = { at: 0, id: -1 };

  const player = () => store.state.playerEmpire;
  const selectedUnits = (): Unit[] => {
    const ids = selected();
    return store.state.units.filter(unit => ids.has(unit.id));
  };

  const unitAt = (world: Pixel, mine: boolean): Unit | null => {
    let best: Unit | null = null;
    let reach = PICK_PX / Math.max(deps.view().scale, 0.6);
    for (const unit of store.state.units) {
      if ((unit.empire === player()) !== mine) continue;
      const gap = Math.hypot(unit.x - world.x, unit.y - world.y) - unitStats(unit.kind).size + 5;
      if (gap < reach) {
        reach = gap;
        best = unit;
      }
    }
    return best;
  };

  const order = (order: UnitOrder): void => {
    const units = selectedUnits().map(unit => unit.id);
    if (units.length === 0) return;
    deps.run({ type: 'OrderUnits', empire: player(), units, order });
  };

  const moveTo = (world: Pixel, mode: 'amove' | 'guard'): void => {
    order({ kind: 'move', mode, x: world.x, y: world.y, formation: groupFormation(selectedUnits()) });
    deps.ping(world, mode === 'guard' ? GUARD_COLOR : MOVE_COLOR);
  };

  const attackUnit = (foe: Unit): void => {
    order({ kind: 'attack', target: foe.id });
    deps.ping({ x: foe.x, y: foe.y }, ATTACK_COLOR);
  };

  const inView = (unit: Unit): boolean => {
    const { min, max } = deps.view();
    return unit.x >= min.x && unit.x <= max.x && unit.y >= min.y && unit.y <= max.y;
  };

  const controls: UnitControls = {
    selected,
    box,
    menu,
    tap(world, shift) {
      setMenu(null);
      const mine = unitAt(world, true);
      if (!mine && selected().size > 0) {
        const foe = unitAt(world, false);
        if (foe) attackUnit(foe);
        else moveTo(world, 'amove');
        return true;
      }
      if (!mine) return false;
      const now = performance.now();
      if (lastClick.id === mine.id && now - lastClick.at < DOUBLE_CLICK_MS) {
        const same = store.state.units.filter(unit => unit.empire === player() && unit.kind === mine.kind && inView(unit));
        setSelected(new Set([...selected(), ...same.map(unit => unit.id)]));
      } else if (shift) {
        const next = new Set(selected());
        if (next.has(mine.id)) next.delete(mine.id);
        else next.add(mine.id);
        setSelected(next);
      } else setSelected(new Set([mine.id]));
      lastClick = { at: now, id: mine.id };
      return true;
    },
    boxStart(world) {
      setMenu(null);
      setBox({ x0: world.x, y0: world.y, x1: world.x, y1: world.y });
    },
    boxMove(world) {
      const current = box();
      if (current) setBox({ ...current, x1: world.x, y1: world.y });
    },
    boxEnd(world, shift) {
      const current = box();
      setBox(null);
      if (!current) return;
      const minX = Math.min(current.x0, world.x);
      const maxX = Math.max(current.x0, world.x);
      const minY = Math.min(current.y0, world.y);
      const maxY = Math.max(current.y0, world.y);
      const picked = store.state.units.filter(
        unit => unit.empire === player() && unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY,
      );
      setSelected(new Set([...(shift ? selected() : []), ...picked.map(unit => unit.id)]));
    },
    context(world, at) {
      const mine = unitAt(world, true);
      if (mine && !selected().has(mine.id)) setSelected(new Set([mine.id]));
      const units = selectedUnits();
      if (units.length === 0) {
        setMenu(null);
        return false;
      }
      const foe = unitAt(world, false);
      setMenu({ at, world, foe: foe?.id ?? null, count: units.length, formation: groupFormation(units) });
      return true;
    },
    closeMenu: () => setMenu(null),
    attack() {
      const current = menu();
      setMenu(null);
      if (!current) return;
      const foe = current.foe === null ? undefined : store.state.units.find(unit => unit.id === current.foe);
      if (foe) attackUnit(foe);
      else moveTo(current.world, 'amove');
    },
    guard() {
      const current = menu();
      setMenu(null);
      if (current) moveTo(current.world, 'guard');
    },
    hold() {
      setMenu(null);
      order({ kind: 'hold' });
    },
    arrange(formation: Formation) {
      setMenu(null);
      const units = selectedUnits();
      if (units.length === 0) return;
      order({ kind: 'arrange', formation });
      deps.ping({ x: units.reduce((sum, unit) => sum + unit.x, 0) / units.length, y: units.reduce((sum, unit) => sum + unit.y, 0) / units.length }, ARRANGE_COLOR);
    },
    selectKind(kind: UnitKind, add: boolean) {
      const picked = store.state.units.filter(unit => unit.empire === player() && unit.kind === kind).map(unit => unit.id);
      setSelected(new Set([...(add ? selected() : []), ...picked]));
    },
    selectAll(ids) {
      setSelected(new Set(ids));
    },
    clear() {
      if (menu()) {
        setMenu(null);
        return true;
      }
      if (selected().size === 0) return false;
      setSelected(new Set<UnitId>());
      return true;
    },
    centre() {
      const units = selectedUnits();
      if (units.length === 0) return null;
      return {
        x: units.reduce((sum, unit) => sum + unit.x, 0) / units.length,
        y: units.reduce((sum, unit) => sum + unit.y, 0) / units.length,
      };
    },
    prune() {
      const ids = selected();
      if (ids.size === 0) return;
      const alive = new Set(store.state.units.filter(unit => ids.has(unit.id)).map(unit => unit.id));
      if (alive.size !== ids.size) setSelected(alive);
    },
  };
  return controls;
}
