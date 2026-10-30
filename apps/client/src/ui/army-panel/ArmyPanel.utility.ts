import type { Offensive } from '../../game/offensive/offensive.types';

export function missionLabel(mission: Offensive['mission'], taken: number): string {
  if (mission === 'hold') return 'Holding';
  if (mission === 'retreat') return 'Retreating';
  return `${taken} tiles taken`;
}
