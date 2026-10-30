import { RESEARCH_BY_ID } from './research.constants';
import type { GameState } from '../state/state.types';
import { FACTIONS } from '../faction/faction.constants';
import type { Modifier } from '../modifier/modifier.types';
import { aggregateModifiers } from '../modifier/modifier.service';
import type { ResearchNode, ResearchOption } from './research.types';
import type { Empire, EmpireId, EmpireResearch } from '../empire/empire.types';

export function isComplete(research: EmpireResearch, nodeId: string): boolean {
  return research.completed.includes(nodeId);
}

export function missingRequirements(research: EmpireResearch, node: ResearchNode): string[] {
  return node.requires.filter(req => !isComplete(research, req));
}

export function meetsRequirements(research: EmpireResearch, node: ResearchNode): boolean {
  return missingRequirements(research, node).length === 0;
}

export function chosenOption(research: EmpireResearch, node: ResearchNode): ResearchOption | undefined {
  const optionId = research.chosen[node.id];
  if (!optionId || !node.options) return undefined;
  return node.options.find(option => option.id === optionId);
}

export function researchModifiers(research: EmpireResearch): Modifier[] {
  const modifiers: Modifier[] = [];
  for (const nodeId of research.completed) {
    const node = RESEARCH_BY_ID.get(nodeId);
    if (!node) continue;
    for (const effect of node.effects) {
      if (effect.kind === 'modifier') modifiers.push(...effect.modifiers);
    }
    const option = chosenOption(research, node);
    if (option) {
      for (const effect of option.effects) {
        if (effect.kind === 'modifier') modifiers.push(...effect.modifiers);
      }
    }
  }
  return modifiers;
}

export function recomputeEmpireBonuses(state: GameState, empireId: EmpireId): void {
  const empire = state.empires[empireId];
  if (!empire) return;
  const faction = FACTIONS.find(f => f.id === empire.factionId);
  const modifiers: Modifier[] = [
    ...(faction?.bonuses ?? []),
    ...researchModifiers(empire.research),
  ];
  empire.bonuses = aggregateModifiers(modifiers);
}

export function completeResearch(state: GameState, empireId: EmpireId): void {
  const empire = state.empires[empireId];
  if (!empire) return;
  const active = empire.research.active;
  if (!active) return;
  const node = RESEARCH_BY_ID.get(active.nodeId);
  if (!node) return;
  empire.research.completed.push(node.id);
  if (active.optionId !== null) empire.research.chosen[node.id] = active.optionId;
  for (const effect of node.effects) {
    if (effect.kind === 'unlock') empire.unlocks.push(effect.key);
  }
  const option = chosenOption(empire.research, node);
  if (option) {
    for (const effect of option.effects) {
      if (effect.kind === 'unlock') empire.unlocks.push(effect.key);
    }
  }
  empire.research.active = null;
  recomputeEmpireBonuses(state, empireId);
}

export function hasUnlock(empire: Empire, key: string): boolean {
  return empire.unlocks.includes(key);
}

export function researchDuration(nodeId: string): number {
  return RESEARCH_BY_ID.get(nodeId)?.duration ?? 0;
}

export function recomputeAllBonuses(state: GameState): void {
  for (const empire of state.empires) recomputeEmpireBonuses(state, empire.id);
}
