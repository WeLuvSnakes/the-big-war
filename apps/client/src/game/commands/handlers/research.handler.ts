import { withLiveEmpire } from '../command-guards';
import type { StartResearchCommand } from '../commands.types';
import { RESEARCH_BY_ID } from '../../research/research.constants';
import { meetsRequirements } from '../../research/research.service';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';

export const handleStartResearch = withLiveEmpire<StartResearchCommand>((_state, command, empire) => {
  const node = RESEARCH_BY_ID.get(command.nodeId);
  if (!node) return fail(command.type, 'research_unavailable');
  if (!meetsRequirements(empire.research, node)) return fail(command.type, 'research_unavailable');
  if (empire.research.active) return fail(command.type, 'research_unavailable');
  if (empire.research.completed.includes(node.id)) return fail(command.type, 'research_unavailable');
  if (empire.science < node.cost) return fail(command.type, 'insufficient_science');

  let optionId: string | null = null;
  if (node.kind === 'choice') {
    if (!command.optionId || !node.options?.some(option => option.id === command.optionId)) {
      return fail(command.type, 'invalid_target');
    }
    optionId = command.optionId;
  }
  empire.science -= node.cost;
  empire.research.active = { nodeId: node.id, progress: 0, optionId };
  return ok(command.type);
});
