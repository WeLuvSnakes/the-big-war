import type { GameState } from '../state/state.types';
import type { Empire, EmpireSeed } from './empire.types';
import type { GameConfig } from '../config/config.types';
import { ownedTileCount } from '../map/world-index.service';
import { emptyModifierTotals } from '../modifier/modifier.service';
import { CHEAT_UNLIMITED_AMOUNT, CHEAT_UNLIMITED_NAME } from './empire.constants';

export function createEmpire(config: GameConfig, seed: EmpireSeed): Empire {
  const unlimited = seed.isHuman && isUnlimitedName(seed.name);
  return {
    id: seed.id,
    name: seed.name,
    factionId: seed.factionId,
    isHuman: seed.isHuman,
    neutralState: seed.neutralState,
    colorIndex: seed.id,
    gold: unlimited ? CHEAT_UNLIMITED_AMOUNT : config.start.gold,
    science: unlimited ? CHEAT_UNLIMITED_AMOUNT : config.start.science,
    civilians: config.start.civilians,
    goldBalance: 0,
    scienceBalance: 0,
    civilianBalance: 0,
    troopBalance: 0,
    soldiers: config.start.soldiers,
    reserveCap: config.recruit.cityReserveCap,
    drafting: false,
    bonuses: emptyModifierTotals(),
    research: { completed: [], chosen: {}, active: null },
    unlocks: [],
    hexCount: 0,
    alive: true,
    eliminatedAt: null,
  };
}

export function refreshHexCounts(state: GameState): void {
  for (const empire of state.empires) empire.hexCount = ownedTileCount(state, empire.id);
}

export function hasUnlimitedResources(empire: Empire): boolean {
  return empire.isHuman && isUnlimitedName(empire.name);
}

export function refillUnlimited(empire: Empire): void {
  if (!hasUnlimitedResources(empire)) return;
  empire.gold = CHEAT_UNLIMITED_AMOUNT;
  empire.science = CHEAT_UNLIMITED_AMOUNT;
}

export function isUnlimitedName(name: string): boolean {
  return name.trim().toLowerCase() === CHEAT_UNLIMITED_NAME;
}
