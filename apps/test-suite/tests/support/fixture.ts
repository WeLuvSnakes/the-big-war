import type { Empire } from '@the-big-war/client/game/empire/empire.types';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { setBuilding } from '@the-big-war/client/game/map/world-index.service';
import type { Building } from '@the-big-war/client/game/building/building.types';
import { encampmentCapacity } from '@the-big-war/client/game/troops/troops.service';
import { emptyModifierTotals } from '@the-big-war/client/game/modifier/modifier.service';
import { buildingCellsOf, ownedCells } from '@the-big-war/client/game/map/world-index.service';
import { createBuilding, isEncampment } from '@the-big-war/client/game/building/building.service';

const STAGING_KINDS: readonly string[] = ['city', 'barracks', 'fort'];

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
    troopBalance: 0,
    soldiers: 100,
    reserveCap: 500,
    drafting: false,
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

export function setTroops(state: GameState, empire: number, troops: number): void {
  for (const cell of buildingCellsOf(state, empire)) if (cell.building) cell.building.garrison = 0;
  const owner = state.empires[empire]!;
  const home = stagingCamp(state, empire);
  const room = home ? encampmentCapacity(state, empire, home) / owner.bonuses.reserveCap.mul : 1;
  owner.bonuses = { ...owner.bonuses, reserveCap: { add: 0, mul: Math.max(owner.bonuses.reserveCap.mul, troops / room) } };
  if (home) home.garrison = troops;
  state.empires[empire]!.soldiers = home ? troops : 0;
}

function stagingCamp(state: GameState, empire: number): Building | null {
  const held = buildingCellsOf(state, empire).find(cell => cell.building && isEncampment(cell.building.kind));
  if (held) return held.building;
  const site = [...ownedCells(state, empire)].find(cell => !cell.building);
  if (!site) return null;
  const fort = createBuilding(state, 'fort', 1, 0);
  setBuilding(state, site, fort);
  return fort;
}
