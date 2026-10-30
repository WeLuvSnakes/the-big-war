import type { GameState } from '../state/state.types';
import type { ModifierLine } from './offensive.types';
import type { EmpireId } from '../empire/empire.types';
import { isMannedMachineGun } from '../trench/trench.service';
import { ENGINE_TUNING } from '../simulation/simulation.constants';
import { barracksTier, countSupport } from '../building/building.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { resolveModifier } from '@the-big-war/game-engine/modifier/modifier.service';
import { area, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { biomeDefenceAt, biomeLabel, terrainAt, terrainDefenceAt, terrainLabel } from '../map/terrain.service';

export interface WavePower {
  readonly value: number;
  readonly lines: readonly ModifierLine[];
}

function barracksPower(state: GameState, empire: EmpireId, hex: Axial): number {
  let power = 0;
  for (const candidate of area(hex, state.config.support.barracksAttackRadius)) {
    const cell = gridAt(state.grid, candidate);
    const building = cell?.building;
    if (!cell || cell.owner !== empire || building?.kind !== 'barracks' || building.buildRemaining > 0) continue;
    power += barracksTier(state, building).attackPower;
  }
  return power;
}

export function attackPowerAt(state: GameState, empire: EmpireId, hex: Axial): WavePower {
  const owner = state.empires[empire];
  const lines: ModifierLine[] = [];
  if (!owner) return { value: 1, lines };
  const { support } = state.config;
  const faction = resolveModifier(1, owner.bonuses.attack) ** ENGINE_TUNING.frontAttackShare;
  const doctrine = resolveModifier(1, owner.bonuses.frontAttack);
  const cities = countSupport(state, empire, hex, support.cityAttackRadius, k => k === 'city', support.cityAttackLevel);
  const barracks = barracksPower(state, empire, hex);
  const tanks = countSupport(state, empire, hex, support.tankRadius, k => k === 'tank');

  const cityMul = 1 + ENGINE_TUNING.cityAttackBonusPer * cities;
  const barracksMul = 1 + ENGINE_TUNING.barracksAttackBonusPer * barracks;
  const tankMul = tanks > 0 ? 1 + ENGINE_TUNING.tankAttackBonus : 1;
  if (cities > 0) lines.push({ label: 'City attack', attack: cityMul, defence: 1 });
  if (barracks > 0) lines.push({ label: 'Barracks', attack: barracksMul, defence: 1 });
  if (tanks > 0) lines.push({ label: 'Tanks', attack: tankMul, defence: 1 });
  return { value: faction * doctrine * cityMul * barracksMul * tankMul, lines };
}

export function defencePowerAt(state: GameState, empire: EmpireId, attacker: EmpireId, hex: Axial): WavePower {
  const owner = state.empires[empire];
  const lines: ModifierLine[] = [];
  if (!owner) return { value: 1, lines };
  const { support } = state.config;
  const faction = resolveModifier(1, owner.bonuses.defence) ** ENGINE_TUNING.frontDefenceShare;
  const doctrine = resolveModifier(1, owner.bonuses.frontDefence);
  const terrain = terrainDefenceAt(state, hex);
  lines.push({ label: terrainLabel(terrainAt(state, hex)), attack: 1, defence: terrain });
  const cell = gridAt(state.grid, hex);
  const biome = cell ? biomeDefenceAt(state, cell) : 1;
  if (cell && biome !== 1) lines.push({ label: biomeLabel(cell.biome), attack: 1, defence: biome });

  const cities = countSupport(state, empire, hex, support.cityDefenceRadius, k => k === 'city');
  const forts = countSupport(state, empire, hex, support.fortDefenceRadius, k => k === 'fort', 1, true);
  const trench = countSupport(state, empire, hex, 0, k => k === 'trench');
  const enemyTanks = countSupport(state, attacker, hex, support.tankRadius, k => k === 'tank');
  const machineGuns = countSupport(state, empire, hex, support.machineGunRadius, (_, cell) => isMannedMachineGun(cell));
  const bunkers = countSupport(state, empire, hex, support.bunkerRadius, k => k === 'bunker');

  const cityMul = 1 + ENGINE_TUNING.cityDefenceBonusPer * cities;
  const fortMul = forts > 0 ? 1 + ENGINE_TUNING.fortBonus : 1;
  const trenchMul = trench > 0 && enemyTanks === 0 ? 1 + ENGINE_TUNING.trenchDefenceBonus : 1;
  const gunMul = machineGuns > 0 ? 1 + ENGINE_TUNING.machineGunDefenceBonus : 1;
  const bunkerMul = bunkers > 0 ? 1 + ENGINE_TUNING.bunkerDefenceBonus : 1;
  if (cities > 0) lines.push({ label: 'City defence', attack: 1, defence: cityMul });
  if (forts > 0) lines.push({ label: 'Fort', attack: 1, defence: fortMul });
  if (trench > 0 && enemyTanks > 0) lines.push({ label: 'Trench (overrun by tanks)', attack: 1, defence: 1 });
  else if (trench > 0) lines.push({ label: 'Trench', attack: 1, defence: trenchMul });
  if (machineGuns > 0) lines.push({ label: 'Machine guns', attack: 1, defence: gunMul });
  if (bunkers > 0) lines.push({ label: 'Bunker', attack: 1, defence: bunkerMul });
  return { value: faction * doctrine * terrain * biome * cityMul * fortMul * trenchMul * gunMul * bunkerMul, lines };
}
