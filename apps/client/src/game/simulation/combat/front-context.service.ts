import { ENGINE_TUNING } from '../simulation.constants';
import type { GameState } from '../../state/state.types';
import type { EmpireId } from '../../empire/empire.types';
import { isMannedMachineGun } from '../../trench/trench.service';
import { barracksTier, countSupport } from '../../building/building.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type { FrontModifiersResult, FrontTickContext } from '../simulation.types';
import { resolveModifier } from '@the-big-war/game-engine/modifier/modifier.service';
import { area, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { terrainAt, terrainDefenceAt, terrainLabel } from '../../map/terrain.service';
import type { Front, FrontSide, FrontSideKey, ModifierLine } from '../../front/front.types';

export function buildFrontContext(state: GameState, front: Front): FrontTickContext | null {
  if (front.sideA.empire === front.sideB.empire) return null;
  const terrainDefenceA = terrainDefenceAt(state, front.hexA);
  const terrainDefenceB = terrainDefenceAt(state, front.hexB);
  const multiFrontA = multiFrontBonusFor(state, front.sideA.empire, front.sideB.empire, front.cluster);
  const multiFrontB = multiFrontBonusFor(state, front.sideB.empire, front.sideA.empire, front.cluster);
  const sideA = resolveFrontSide(state, front, 'A', multiFrontA);
  const sideB = resolveFrontSide(state, front, 'B', multiFrontB);
  return {
    sideA,
    sideB,
    terrainDefenceA,
    terrainDefenceB,
    attackerA: front.sideA.mode === 'attack' || front.sideA.mode === 'counterattack',
    attackerB: front.sideB.mode === 'attack' || front.sideB.mode === 'counterattack',
  };
}

function resolveFrontSide(
  state: GameState,
  front: Front,
  which: FrontSideKey,
  multiFrontBonus: number,
): FrontModifiersResult {
  const side: FrontSide = which === 'A' ? front.sideA : front.sideB;
  const enemy: FrontSide = which === 'A' ? front.sideB : front.sideA;
  const homeHex = which === 'A' ? front.hexA : front.hexB;
  const enemyHex = which === 'A' ? front.hexB : front.hexA;
  const empire = state.empires[side.empire];
  const lines: ModifierLine[] = [];
  if (!empire) return { attack: 1, defence: 1, lines };

  const bonuses = empire.bonuses;
  const factionAttack = resolveModifier(1, bonuses.attack);
  const factionDefence = resolveModifier(1, bonuses.defence);
  const frontAttack = resolveModifier(1, bonuses.frontAttack);
  const frontDefence = resolveModifier(1, bonuses.frontDefence);

  const homeTerrain = terrainAt(state, homeHex);
  const terrain = state.config.combat.terrainDefence[homeTerrain] ?? 1;
  lines.push({ label: terrainLabel(homeTerrain), attack: 1, defence: terrain });

  const cityDefence = countSupport(state, side.empire, homeHex, state.config.support.cityDefenceRadius, k => k === 'city');
  const cityAttack = countSupport(
    state,
    side.empire,
    enemyHex,
    state.config.support.cityAttackRadius,
    k => k === 'city',
    state.config.support.cityAttackLevel,
  );

  const barracks = barracksPower(state, side.empire, enemyHex);
  const forts = countSupport(
    state,
    side.empire,
    homeHex,
    state.config.support.fortDefenceRadius,
    k => k === 'fort',
    1,
    true,
  );

  const support = state.config.support;
  const trench = countSupport(state, side.empire, homeHex, 0, k => k === 'trench');
  const enemyTanks = countSupport(state, enemy.empire, homeHex, support.tankRadius, k => k === 'tank');
  const machineGuns = countSupport(state, side.empire, homeHex, support.machineGunRadius, (_, cell) =>
    isMannedMachineGun(state, cell),
  );
  const bunkers = countSupport(state, side.empire, homeHex, support.bunkerRadius, k => k === 'bunker');
  const tanks = countSupport(state, side.empire, enemyHex, support.tankRadius, k => k === 'tank');

  const cityDefenceMul = 1 + ENGINE_TUNING.cityDefenceBonusPer * cityDefence;
  const cityAttackMul = 1 + ENGINE_TUNING.cityAttackBonusPer * cityAttack;
  const barracksMul = 1 + ENGINE_TUNING.barracksAttackBonusPer * barracks;
  const fortMul = forts > 0 ? 1 + ENGINE_TUNING.fortBonus : 1;
  const trenchMul = trench > 0 && enemyTanks === 0 ? 1 + ENGINE_TUNING.trenchDefenceBonus : 1;
  const holding = side.mode === 'defence' && machineGuns > 0;
  const machineGunAttackMul = holding ? 1 + ENGINE_TUNING.machineGunAttackBonus : 1;
  const machineGunDefenceMul = holding ? 1 + ENGINE_TUNING.machineGunDefenceBonus : 1;
  const bunkerMul = bunkers > 0 ? 1 + ENGINE_TUNING.bunkerDefenceBonus : 1;
  const tankMul = tanks > 0 ? 1 + ENGINE_TUNING.tankAttackBonus : 1;
  if (cityDefence > 0) lines.push({ label: 'City defence', attack: 1, defence: cityDefenceMul });
  if (cityAttack > 0) lines.push({ label: 'City attack', attack: cityAttackMul, defence: 1 });
  if (barracks > 0) lines.push({ label: 'Barracks', attack: barracksMul, defence: 1 });
  if (forts > 0) lines.push({ label: 'Fort', attack: fortMul, defence: fortMul });
  if (trench > 0 && enemyTanks > 0) lines.push({ label: 'Trench (overrun by tanks)', attack: 1, defence: 1 });
  else if (trench > 0) lines.push({ label: 'Trench', attack: 1, defence: trenchMul });
  if (holding) lines.push({ label: 'Machine guns', attack: machineGunAttackMul, defence: machineGunDefenceMul });
  if (bunkers > 0) lines.push({ label: 'Bunker', attack: 1, defence: bunkerMul });
  if (tanks > 0) lines.push({ label: 'Tanks', attack: tankMul, defence: 1 });
  if (multiFrontBonus > 0) lines.push({ label: 'Multi-front', attack: 1 + multiFrontBonus, defence: 1 });

  const counterattack: FrontSide['mode'] = side.mode;
  const counterAttackMul = counterattack === 'counterattack' ? state.config.combat.counterattack.attackMultiplier : 1;
  const counterDefenceMul = counterattack === 'counterattack' ? state.config.combat.counterattack.defenceMultiplier : 1;
  if (counterattack === 'counterattack') {
    lines.push({ label: 'Counterattack', attack: counterAttackMul, defence: counterDefenceMul });
  }

  const attack =
    factionAttack ** ENGINE_TUNING.frontAttackShare *
    frontAttack *
    cityAttackMul *
    barracksMul *
    fortMul *
    machineGunAttackMul *
    tankMul *
    counterAttackMul *
    (1 + multiFrontBonus);
  const defence =
    factionDefence ** ENGINE_TUNING.frontDefenceShare *
    frontDefence *
    terrain *
    cityDefenceMul *
    fortMul *
    trenchMul *
    machineGunDefenceMul *
    bunkerMul *
    counterDefenceMul;

  return { attack, defence, lines };
}

function multiFrontBonusFor(state: GameState, attacker: EmpireId, enemy: EmpireId, ownCluster: number): number {
  const clusters = new Set<number>();
  for (const front of state.fronts) {
    if (front.cluster === ownCluster) continue;
    const pair = [front.sideA.empire, front.sideB.empire];
    if (!pair.includes(attacker) || !pair.includes(enemy)) continue;
    clusters.add(front.cluster);
  }

  return Math.min(
    state.config.combat.multiFront.maxBonus,
    clusters.size * state.config.combat.multiFront.perExtraFront,
  );
}


function barracksPower(state: GameState, empireId: EmpireId, hex: Axial): number {
  let power = 0;
  for (const candidate of area(hex, state.config.support.barracksAttackRadius)) {
    const cell = gridAt(state.grid, candidate);
    const building = cell?.building;
    if (!cell || cell.owner !== empireId || building?.kind !== 'barracks' || building.buildRemaining > 0) continue;
    power += barracksTier(state, building).attackPower;
  }
  return power;
}
