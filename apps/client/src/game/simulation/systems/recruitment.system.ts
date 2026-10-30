import { civilianGrowthRateOf } from './economy.system';
import type { Empire } from '../../empire/empire.types';
import type { GameState } from '../../state/state.types';
import { barracksTier } from '../../building/building.service';
import { garrisonedTroops } from '../../trench/trench.service';
import { allBuildingCells, populationWeight } from '../../map/world-index.service';
import { resolveModifier } from '@the-big-war/game-engine/modifier/modifier.service';
import { addToEncampments, deployedTroops, killExcessTroops, troopCapacity } from '../../troops/troops.service';

export function stepRecruitment(state: GameState, dt: number): void {
  const recruit = state.config.recruit;
  const output = barracksOutput(state);

  for (const empire of state.empires) {
    empire.soldiers = garrisonedTroops(state, empire.id);
    killExcessTroops(state, empire.id);
    if (!empire.alive) {
      empire.civilianBalance = 0;
      empire.troopBalance = 0;
      continue;
    }
    const barracks = output.count[empire.id] ?? 0;
    const rawSpeed = output.speed[empire.id] ?? 0;
    const goldPerSoldier = rawSpeed > 0 ? (output.gold[empire.id] ?? 0) / rawSpeed : 0;
    const cap = reserveCapOf(state, empire);
    empire.reserveCap = cap;

    const speed = rawSpeed > 0 ? Math.max(0, resolveModifier(rawSpeed, empire.bonuses.recruitSpeed)) : 0;

    const targetReserve = cap * recruit.targetReserveRatio;
    const fielded = empire.soldiers + deployedTroops(state, empire.id);
    const draftTarget = Math.min(targetReserve, draftCapOf(state, empire, cap));
    if (barracks > 0 && fielded < draftTarget) empire.drafting = true;
    if (barracks <= 0 || fielded >= draftTarget || empire.civilians < recruit.civiliansPerSoldier) empire.drafting = false;

    let drafted = 0;
    if (empire.drafting) {
      drafted = Math.min(
        draftTarget - fielded,
        dt / recruit.draftSecondsPerSoldier,
        empire.civilians / recruit.civiliansPerSoldier,
      );
      addToEncampments(state, empire.id, drafted);
      empire.civilians = Math.max(0, empire.civilians - drafted * recruit.civiliansPerSoldier);
    }

    const grown = Math.max(0, civilianGrowthRateOf(empire.id)) * dt;
    const trained = Math.max(
      0,
      Math.min(
        targetReserve - fielded - drafted,
        (speed / recruit.secondsPerSoldier) * dt,
        grown / recruit.civiliansPerSoldier,
        goldPerSoldier > 0 ? empire.gold / goldPerSoldier : Infinity,
      ),
    );
    addToEncampments(state, empire.id, trained);
    empire.gold = Math.max(0, empire.gold - trained * goldPerSoldier);
    empire.civilians = Math.max(0, empire.civilians + civilianGrowthRateOf(empire.id) * dt - trained * recruit.civiliansPerSoldier);

    const consumed = (drafted + trained) * recruit.civiliansPerSoldier;
    empire.civilianBalance = civilianGrowthRateOf(empire.id) - consumed / dt;
    empire.troopBalance = (drafted + trained) / dt;
  }
}

export function draftCapOf(state: GameState, empire: Empire, cap: number): number {
  const { draftUntilRatio, troopsPerTile } = state.config.recruit;
  const militia = Math.min(cap, populationWeight(state, empire.id) * troopsPerTile);
  return militia + (cap - militia) * draftUntilRatio;
}

export function reserveCapOf(state: GameState, empire: Empire): number {
  return Math.max(0, Math.floor(troopCapacity(state, empire.id)));
}

interface BarracksOutput {
  readonly count: number[];
  readonly speed: number[];
  readonly gold: number[];
}

function barracksOutput(state: GameState): BarracksOutput {
  const out: BarracksOutput = { count: [], speed: [], gold: [] };
  for (const cell of allBuildingCells(state)) {
    const building = cell.building;
    if (cell.owner < 0 || building?.kind !== 'barracks' || building.buildRemaining > 0) continue;
    const tier = barracksTier(state, building);
    out.count[cell.owner] = (out.count[cell.owner] ?? 0) + 1;
    out.speed[cell.owner] = (out.speed[cell.owner] ?? 0) + tier.speed;
    out.gold[cell.owner] = (out.gold[cell.owner] ?? 0) + tier.speed * tier.goldPerSoldier;
  }
  return out;
}
