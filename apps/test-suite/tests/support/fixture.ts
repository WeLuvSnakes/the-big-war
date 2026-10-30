import type { Empire } from '@the-big-war/client/game/empire/empire.types';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { emptyModifierTotals } from '@the-big-war/client/game/modifier/modifier.service';

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
    if (cell.building && STAGING_KINDS.includes(cell.building.kind)) cell.building = null;
  }
}
