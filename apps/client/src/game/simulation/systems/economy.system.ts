import type { GameState } from '../../state/state.types';
import type { EmpireId } from '../../empire/empire.types';
import { refillUnlimited } from '../../empire/empire.service';
import { populationWeight } from '../../map/world-index.service';
import type { OwnedBuilding } from '../../building/building.types';
import { resolveModifier } from '@the-big-war/game-engine/modifier/modifier.service';
import { isProductionBuilding, ownedBuildings } from '../../building/building.service';

const civilianGrowthRate: number[] = [];

export function civilianGrowthRateOf(empireId: EmpireId): number {
  return civilianGrowthRate[empireId] ?? 0;
}

export function stepEconomy(state: GameState, dt: number): void {
  const econ = state.config.economy;

  for (const empire of state.empires) {
    if (!empire.alive) {
      empire.goldBalance = 0;
      empire.scienceBalance = 0;
      empire.civilianBalance = 0;
      civilianGrowthRate[empire.id] = 0;
      continue;
    }
    const owned = ownedBuildings(state, empire.id);
    let jobs = 0;
    for (const { building } of owned) {
      if (isProductionBuilding(building.kind)) jobs += econ.workersPerBuilding;
    }
    const workers = Math.min(empire.civilians, jobs);
    const staffing = jobs > 0 ? workers / jobs : 1;

    let rawGold = 0;
    let rawScience = 0;
    for (const { building } of owned) {
      switch (building.kind) {
        case 'market':
          rawGold += econ.marketGoldPerSecond;
          break;
        case 'fishery':
          rawGold += econ.fisheryGoldPerSecond;
          break;
        case 'lab':
          rawScience += econ.labSciencePerSecond * labLevelBonus(building.level);
          break;
        default:
          break;
      }
    }

    const tax = populationWeight(state, empire.id) * econ.taxGoldPerTile;
    const goldIncome = resolveModifier(rawGold, empire.bonuses.goldIncome) * staffing + tax;
    empire.gold += goldIncome * dt;
    if (empire.gold < 0) empire.gold = 0;

    const labGoldCost = econ.labGoldPerSecond * staffing * labsOf(owned) * dt;
    let scienceProduction = resolveModifier(rawScience, empire.bonuses.scienceRate) * staffing;
    let labGoldSpent = 0;
    if (empire.gold <= 0 && labGoldCost > 0) scienceProduction = 0;
    else {
      empire.gold = Math.max(0, empire.gold - labGoldCost);
      labGoldSpent = labGoldCost > 0 ? labGoldCost / dt : 0;
    }
    empire.science += scienceProduction * dt;
    empire.goldBalance = goldIncome - labGoldSpent;
    empire.scienceBalance = scienceProduction;
    refillUnlimited(empire);

    const passive = econ.baseGrowthPerSecond + populationWeight(state, empire.id) * econ.growthPerTile;
    let farmGrowth = 0;
    let cityGrowth = 0;
    for (const { building } of owned) {
      if (building.kind === 'city') {
        cityGrowth += econ.cityGrowthPerCity * building.level;
        continue;
      }
      if (building.kind !== 'farm') continue;
      building.growth = Math.min(econ.farmGrowthMax, building.growth + dt / farmMaturitySeconds(state));
      farmGrowth += econ.farmGrowthPerFarm * (1 + building.growth);
    }
    const growth = resolveModifier(passive + cityGrowth + farmGrowth * staffing, empire.bonuses.growth);
    civilianGrowthRate[empire.id] = growth;
  }
}

function labsOf(owned: readonly OwnedBuilding[]): number {
  let count = 0;
  for (const { building } of owned) if (building.kind === 'lab') count += 1;
  return count;
}

function farmMaturitySeconds(state: GameState): number {
  return state.config.economy.farmGrowthMax * 60;
}

function labLevelBonus(level: number): number {
  return 1 + (level - 1) * 0.25;
}
