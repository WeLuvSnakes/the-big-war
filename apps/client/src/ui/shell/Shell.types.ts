import type { MatchRuntime } from '../../session/runtime';

export type PanelId = 'build' | 'research' | 'diplomacy' | 'wiki' | null;

export interface NoticesProps {
  readonly controllers: MatchRuntime['controllers'];
}
