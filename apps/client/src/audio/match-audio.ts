import { audio } from './audio.service';
import type { GameState } from '../game/state/state.types';
import type { MatchSnapshot, SoundId } from './audio.types';
import type { ClientStore } from '../game/store/store.types';
import { allBuildingCells } from '../game/map/world-index.service';
import { pendingOffersTo } from '../game/diplomacy/diplomacy.service';

const SAMPLE_SECONDS = 0.1;
const WAR_HOLD_SECONDS = 8;

export function snapshotMatch(state: GameState): MatchSnapshot {
  const player = state.playerEmpire;
  const cooldowns = new Map<number, number>();
  const ownBuildings = new Map<number, boolean>();
  for (const cell of allBuildingCells(state)) {
    const building = cell.building;
    if (!building) continue;
    if (building.kind === 'cannon' || building.kind === 'battery') cooldowns.set(building.id, building.cooldown);
    if (cell.owner === player) ownBuildings.set(building.id, building.buildRemaining <= 0);
  }
  const ownShips = new Map<number, number>();
  for (const ship of state.ships) if (ship.empire === player) ownShips.set(ship.id, ship.cooldown);
  const empire = state.empires.find(item => item.id === player);
  return {
    hexes: empire?.hexCount ?? 0,
    research: empire?.research.completed.length ?? 0,
    offers: pendingOffersTo(state, player).length,
    playerFronts: state.units.filter(unit => unit.empire === player && unit.target !== null).length,
    frontTroops: state.units.filter(unit => unit.empire === player).length,
    aliveEmpires: state.empires.filter(item => item.alive).length,
    cooldowns,
    ownBuildings,
    ownShips,
  };
}

export function diffSounds(previous: MatchSnapshot, next: MatchSnapshot): readonly SoundId[] {
  const sounds: SoundId[] = [];
  if (next.hexes > previous.hexes) sounds.push('capture');
  if (next.hexes < previous.hexes) sounds.push('hexLost');
  if (next.research > previous.research) sounds.push('research');
  if (next.offers > previous.offers) sounds.push('offer');
  if (next.playerFronts > previous.playerFronts) sounds.push('battle');
  if (next.playerFronts >= previous.playerFronts && next.frontTroops < previous.frontTroops) sounds.push('pain');
  if (next.aliveEmpires < previous.aliveEmpires) sounds.push('elimination');

  for (const [id, cooldown] of next.ownShips) {
    const before = previous.ownShips.get(id);
    if (before === undefined) sounds.push('shipHorn');
    else if (cooldown > before) sounds.push('shipGun');
  }
  for (const id of previous.ownShips.keys()) if (!next.ownShips.has(id)) sounds.push('shipSunk');

  for (const [id, ready] of next.ownBuildings) {
    const before = previous.ownBuildings.get(id);
    if (before === undefined && !ready) sounds.push('build');
    if (before === false && ready) sounds.push('buildDone');
  }
  for (const [id, cooldown] of next.cooldowns) {
    const audible = next.ownBuildings.has(id) || next.playerFronts > 0;
    if (audible && cooldown > (previous.cooldowns.get(id) ?? 0)) sounds.push('artillery');
  }
  return sounds;
}

export function createMatchAudio(store: ClientStore) {
  let previous = snapshotMatch(store.state);
  let sampleIn = SAMPLE_SECONDS;
  let warHold = 0;

  return {
    update(dt: number): void {
      if (store.status() !== 'playing' || store.paused()) return;

      warHold = previous.playerFronts > 0 ? WAR_HOLD_SECONDS : Math.max(0, warHold - dt);
      audio.setMood(warHold > 0 ? 'war' : 'peace');

      sampleIn -= dt;
      if (sampleIn > 0) return;
      sampleIn = SAMPLE_SECONDS;
      const next = snapshotMatch(store.state);
      for (const sound of diffSounds(previous, next)) audio.play(sound);
      previous = next;
    },
  };
}
