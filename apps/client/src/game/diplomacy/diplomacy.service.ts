import { tileScale } from '../map/terrain.service';
import { troopsAtSea } from '../ship/ship.service';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import { endOffensivesBetween } from '../offensive/offensive.service';
import type { AttackCheck, DiplomaticRelation, DiplomaticStatus, OfferCooldown, PendingOffer } from './diplomacy.types';

const AT_PEACE: DiplomaticRelation = { status: 'peace', treatyUntil: null };

export function relationKey(a: EmpireId, b: EmpireId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function getRelation(state: GameState, a: EmpireId, b: EmpireId): DiplomaticRelation {
  if (a === b) return AT_PEACE;
  return state.relations?.[relationKey(a, b)] ?? AT_PEACE;
}

export function setRelation(
  state: GameState,
  a: EmpireId,
  b: EmpireId,
  status: DiplomaticStatus,
  treatyUntil: number | null = null,
): void {
  if (a === b) return;
  if (!state.relations) {
    state.relations = {};
  }
  state.relations[relationKey(a, b)] = { status, treatyUntil };
}

export function treatySecondsLeft(state: GameState, a: EmpireId, b: EmpireId): number {
  const { treatyUntil } = getRelation(state, a, b);
  return treatyUntil === null ? 0 : Math.max(0, treatyUntil - state.elapsed);
}

export function isProtected(state: GameState, a: EmpireId, b: EmpireId): boolean {
  return a !== b && treatySecondsLeft(state, a, b) > 0;
}

export function isTotalWar(state: GameState): boolean {
  return state.elapsed >= state.config.diplomacy.totalWarSecondsPerScale * tileScale(state);
}

export function canAttack(
  state: GameState,
  attacker: EmpireId,
  defender: EmpireId,
): AttackCheck {
  if (attacker === defender) {
    return { allowed: false, reason: 'invalid_target' };
  }
  if (isProtected(state, attacker, defender)) {
    return { allowed: false, reason: 'in_peace' };
  }
  return { allowed: true };
}

export function declareWar(state: GameState, attacker: EmpireId, defender: EmpireId): boolean {
  if (attacker === defender || isProtected(state, attacker, defender)) return false;
  setRelation(state, attacker, defender, 'war', null);
  return true;
}

export function agreePeace(state: GameState, a: EmpireId, b: EmpireId): void {
  if (a === b) return;
  setRelation(state, a, b, 'peace', state.elapsed + state.config.diplomacy.treatySeconds);
  endOffensivesBetween(state, a, b);
}

export function dissolveDiplomacy(state: GameState, empireId: EmpireId): void {
  if (state.pendingOffers) {
    state.pendingOffers = state.pendingOffers.filter(offer => offer.from !== empireId && offer.to !== empireId);
  }
  if (!state.relations) return;
  for (const key of Object.keys(state.relations)) {
    const parts = key.split(':');
    if (parts[0] === String(empireId) || parts[1] === String(empireId)) {
      delete state.relations[key];
    }
  }
}

export function offerKey(from: EmpireId, to: EmpireId): string {
  return `${from}>${to}`;
}

export function offerCooldown(state: GameState, from: EmpireId, to: EmpireId): OfferCooldown | null {
  const cooldown = state.offerCooldowns?.[offerKey(from, to)];
  if (!cooldown || state.elapsed >= cooldown.until) return null;
  return cooldown;
}

export function rejectOffer(state: GameState, from: EmpireId, to: EmpireId): void {
  if (!state.offerCooldowns) state.offerCooldowns = {};
  state.offerCooldowns[offerKey(from, to)] = {
    until: state.elapsed + state.config.diplomacy.rejectCooldownSeconds,
    rejectedBy: to,
  };
}

export function decidesOwnOffers(state: GameState, empireId: EmpireId): boolean {
  return state.empires[empireId]?.isHuman === true;
}

export function pendingOffer(state: GameState, from: EmpireId, to: EmpireId): PendingOffer | null {
  return state.pendingOffers?.find(offer => offer.from === from && offer.to === to) ?? null;
}

export function pendingOffersTo(state: GameState, to: EmpireId): PendingOffer[] {
  return state.pendingOffers?.filter(offer => offer.to === to) ?? [];
}

export function proposeOffer(state: GameState, from: EmpireId, to: EmpireId): void {
  if (!state.pendingOffers) state.pendingOffers = [];
  state.pendingOffers.push({ from, to, expiresAt: state.elapsed + state.config.diplomacy.offerExpirySeconds });
}

export function takeOffer(state: GameState, from: EmpireId, to: EmpireId): PendingOffer | null {
  const offer = pendingOffer(state, from, to);
  if (offer) state.pendingOffers = state.pendingOffers.filter(other => other !== offer);
  return offer;
}

export function expireOffers(state: GameState): void {
  if (!state.pendingOffers?.length) return;
  const live: PendingOffer[] = [];
  for (const offer of state.pendingOffers) {
    if (state.elapsed < offer.expiresAt) live.push(offer);
    else rejectOffer(state, offer.from, offer.to);
  }
  state.pendingOffers = live;
}

export function acceptsOffer(state: GameState, from: EmpireId, target: EmpireId): boolean {
  const offerer = state.empires[from];
  const receiver = state.empires[target];
  if (!offerer || !receiver) return false;
  if (receiver.neutralState) return true;
  const offererStrength = offerer.soldiers + offerer.hexCount + troopsAtSea(state, from);
  const receiverStrength = receiver.soldiers + receiver.hexCount + troopsAtSea(state, target);
  if (isTotalWar(state)) return receiverStrength <= offererStrength * state.config.diplomacy.totalWarPeaceRatio;
  const leniency = 1.5 - state.config.bot.aggression;
  return receiverStrength <= offererStrength * 1.5 * leniency;
}
