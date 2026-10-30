import type { Accessor } from 'solid-js';
import type { Controllers } from './controllers';
import type { WorldRenderer } from '../render/world';
import type { ClientStore } from '../game/store/store.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export interface MatchRuntimeOptions {
  readonly store: ClientStore;
  readonly world: WorldRenderer;
  
  readonly host: HTMLElement;
  readonly onEnded?: (winner: number | null) => void;
}

export interface MatchRuntime {
  readonly controllers: Controllers;

  readonly cameraMoved: Accessor<boolean>;

  readonly choosingSpawn: Accessor<boolean>;

  beginSpawnChoice(): void;

  confirmSpawn(): void;
  
  start(): void;
  
  stop(): void;
  
  centreOnEmpire(empire: number): void;
  fillScreenFromLeft(): void;
  
  centreOnHex(hex: Axial): void;

  resetCamera(): void;
}
