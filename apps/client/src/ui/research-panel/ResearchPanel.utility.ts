import type { EmpireResearch } from '../../game/empire/empire.types';
import { RESEARCH_NODES } from '../../game/research/research.constants';
import { isComplete, missingRequirements } from '../../game/research/research.service';
import type { ResearchBranch, ResearchNode } from '../../game/research/research.types';

export type ResearchStatus = 'done' | 'active' | 'available' | 'locked';

export const RESEARCH_BRANCHES: readonly ResearchBranch[] = ['economy', 'military', 'territory'];

const STATUS_ORDER: Readonly<Record<ResearchStatus, number>> = { active: 0, available: 1, locked: 2, done: 3 };

export function branchLabel(branch: ResearchBranch): string {
  switch (branch) {
    case 'economy':
      return 'Economy';
    case 'military':
      return 'Military';
    case 'territory':
      return 'Territory';
  }
}

export function researchStatus(research: EmpireResearch, node: ResearchNode): ResearchStatus {
  if (isComplete(research, node.id)) return 'done';
  if (research.active?.nodeId === node.id) return 'active';
  if (missingRequirements(research, node).length > 0) return 'locked';
  return 'available';
}

function chainOrder(nodes: readonly ResearchNode[]): { node: ResearchNode; chain: number }[] {
  const ids = new Set(nodes.map(node => node.id));
  const ordered: { node: ResearchNode; chain: number }[] = [];
  const seen = new Set<string>();
  let chain = 0;
  const visit = (node: ResearchNode) => {
    if (seen.has(node.id)) return;
    if (node.requires.some(req => ids.has(req) && !seen.has(req))) return;
    seen.add(node.id);
    ordered.push({ node, chain });
    for (const child of nodes) if (child.requires.includes(node.id)) visit(child);
  };
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    visit(node);
    chain++;
  }
  for (const node of nodes) if (!seen.has(node.id)) ordered.push({ node, chain: chain++ });
  return ordered;
}

export function researchNodes(branch: ResearchBranch, research: EmpireResearch): ResearchNode[] {
  const visible = chainOrder(RESEARCH_NODES.filter(node => node.branch === branch))
    .filter(entry => researchStatus(research, entry.node) !== 'locked')
    .map((entry, index) => ({ ...entry, index, rank: STATUS_ORDER[researchStatus(research, entry.node)] }));
  const chainRank = new Map<number, number>();
  for (const entry of visible) {
    chainRank.set(entry.chain, Math.min(chainRank.get(entry.chain) ?? Infinity, entry.rank));
  }
  return visible
    .sort((a, b) => chainRank.get(a.chain)! - chainRank.get(b.chain)! || a.index - b.index)
    .map(entry => entry.node);
}

export function researchSecondsLeft(research: EmpireResearch, node: ResearchNode): number {
  return Math.ceil((1 - (research.active?.progress ?? 0)) * node.duration);
}
