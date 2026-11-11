import type { Modifier as EngineModifier, ModifierTotals as EngineModifierTotals } from '@the-big-war/game-engine/modifier/modifier.types';

export type ModifierKey =
  | 'goldIncome'
  | 'scienceRate'
  | 'growth'
  | 'buildCost'
  | 'attack'
  | 'defence'
  | 'trainSpeed';

export type Modifier = EngineModifier<ModifierKey>;

export type ModifierTotals = EngineModifierTotals<ModifierKey>;
