import { audio } from './audio.service';
import type { GameState } from '../game/state/state.types';
import type { GameStore } from '../game/store/store.types';
import type { MatchSnapshot, SoundId } from './audio.types';
import { pendingOffersTo } from '../game/diplomacy/diplomacy.service';

const SAMPLE_SECONDS = 0.1;
const WAR_HOLD_SECONDS = 8;
const RIFLE_MIN_SECONDS = 0.15;
const RIFLE_SPREAD_SECONDS = 1.1;
const MAX_RIFLE_FRONTS = 3;

const playerTroops = (state: GameState): number => {
  let troops = 0;
  for (const front of state.fronts) {
    if (front.sideA.empire === state.playerEmpire) troops += front.sideA.troops;
    if (front.sideB.empire === state.playerEmpire) troops += front.sideB.troops;
  }
  return troops;
};

export function snapshotMatch(state: GameState): MatchSnapshot {
  const player = state.playerEmpire;
  const cooldowns = new Map<number, number>();
  const ownBuildings = new Map<number, boolean>();
  for (const cell of state.grid.cells) {
    const building = cell.building;
    if (!building) continue;
    if (building.kind === 'cannon' || building.kind === 'battery') cooldowns.set(building.id, building.cooldown);
    if (cell.owner === player) ownBuildings.set(building.id, building.buildRemaining <= 0);
  }
  const empire = state.empires.find(item => item.id === player);
  return {
    hexes: empire?.hexCount ?? 0,
    research: empire?.research.completed.length ?? 0,
    offers: pendingOffersTo(state, player).length,
    playerFronts: state.fronts.filter(front => front.sideA.empire === player || front.sideB.empire === player).length,
    frontTroops: playerTroops(state),
    aliveEmpires: state.empires.filter(item => item.alive).length,
    cooldowns,
    ownBuildings,
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

export function createMatchAudio(store: GameStore) {
  let previous = snapshotMatch(store.state);
  let sampleIn = SAMPLE_SECONDS;
  let rifleIn = 0;
  let warHold = 0;

  return {
    update(dt: number): void {
      if (store.status() !== 'playing' || store.paused()) return;

      if (previous.playerFronts > 0) {
        warHold = WAR_HOLD_SECONDS;
        rifleIn -= dt;
        if (rifleIn <= 0) {
          audio.play('rifle');
          const crowding = Math.min(previous.playerFronts, MAX_RIFLE_FRONTS);
          rifleIn = RIFLE_MIN_SECONDS + (Math.random() * RIFLE_SPREAD_SECONDS) / crowding;
        }
      } else {
        warHold = Math.max(0, warHold - dt);
      }
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
