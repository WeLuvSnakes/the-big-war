import { FACTIONS } from './faction.constants';
import type { FactionDef } from './faction.types';

export function factionById(id: string): FactionDef | undefined {
  return FACTIONS.find(faction => faction.id === id);
}
