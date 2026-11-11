import { createUnit } from '@the-big-war/client/game/unit/unit.service';
import type { Empire } from '@the-big-war/client/game/empire/empire.types';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { setBuilding } from '@the-big-war/client/game/map/world-index.service';
import type { Unit, UnitKind } from '@the-big-war/client/game/unit/unit.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { emptyModifierTotals } from '@the-big-war/client/game/modifier/modifier.service';

const STAGING_KINDS: readonly string[] = ['city', 'barracks'];

export function testEmpire(fields: Partial<Empire> & { readonly id: number }): Empire {
  return {
    name: `Empire ${fields.id}`,
    factionId: 'ironclad',
    isHuman: fields.id === 0,
    neutralState: false,
    colorIndex: fields.id,
    gold: 1000,
    science: 1000,
    goldBalance: 0,
    scienceBalance: 0,
    civilians: 100,
    civilianBalance: 0,
    bonuses: emptyModifierTotals(),
    research: { completed: [], chosen: {}, active: null },
    unlocks: [],
    hexCount: 0,
    alive: true,
    eliminatedAt: null,
    ...fields,
  };
}

export function clearStaging(state: GameState): void {
  for (const cell of state.grid.cells) {
    if (cell.building && STAGING_KINDS.includes(cell.building.kind)) setBuilding(state, cell, null);
  }
}

export function spawnUnits(state: GameState, empire: number, hex: Axial, count: number, kind: UnitKind = 'infantry'): Unit[] {
  const size = state.config.map.hexSize;
  return Array.from({ length: count }, () => {
    const unit = createUnit(state, kind, empire, (hex.q + 0.5) * size, (hex.r + 0.5) * size);
    state.units.push(unit);
    return unit;
  });
}
