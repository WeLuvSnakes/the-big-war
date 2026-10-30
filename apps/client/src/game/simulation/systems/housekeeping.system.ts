import { removeShipsOf } from '../../ship/ship.service';
import type { GameState } from '../../state/state.types';
import { refreshHexCounts } from '../../empire/empire.service';
import { removeDemolishedBuildings } from './buildings.system';
import { endOffensivesBetween } from '../../offensive/offensive.service';
import { dissolveDiplomacy, expireOffers } from '../../diplomacy/diplomacy.service';

export function stepHousekeeping(state: GameState): void {
  removeDemolishedBuildings(state);
  refreshHexCounts(state);
  eliminateDeadEmpires(state);
  expireOffers(state);
}

function eliminateDeadEmpires(state: GameState): void {
  for (const empire of state.empires) {
    if (!empire.alive) continue;
    if (empire.hexCount > 0) continue;
    empire.alive = false;
    empire.eliminatedAt = state.elapsed;
    empire.civilians = 0;
    empire.civilianBalance = 0;
    empire.troopBalance = 0;
    for (const other of state.empires) {
      if (other.id !== empire.id) endOffensivesBetween(state, empire.id, other.id);
    }
    removeShipsOf(state, empire.id);
    dissolveDiplomacy(state, empire.id);
  }
}
