import type { Accessor } from 'solid-js';
import type { ShipId } from '../game/ship/ship.types';
import type { ClientStore } from '../game/store/store.types';
import type { BuildingKind } from '../game/building/building.types';
import type { CommandError } from '../game/commands/commands.types';
import type { Axial, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';

export type Tool =
  | { readonly kind: 'idle' }
  | { readonly kind: 'place'; readonly building: BuildingKind }
  | { readonly kind: 'cannon'; readonly from: Axial }
  | { readonly kind: 'trench-attack'; readonly from: Axial };

export interface CommandNotice {
  readonly id: number;
  readonly reason: CommandError;
}

export interface Controllers {
  readonly selectedHex: Accessor<Axial | null>;
  readonly hoverHex: Accessor<Axial | null>;
  readonly tool: Accessor<Tool>;
  readonly troopPercent: Accessor<number>;
  readonly notices: Accessor<readonly CommandNotice[]>;
  readonly selectedShip: Accessor<ShipId | null>;

  selectHex(hex: Axial | null): void;
  selectShip(ship: ShipId | null): void;
  setHover(hex: Axial | null): void;
  setTroopPercent(percent: number): void;
  setTool(tool: Tool): void;
  cancelTool(): void;

  hexAtScreen(at: Pixel): Axial | null;

  tap(at: Pixel): void;

  dragOver(client: Pixel): void;
  dropAt(client: Pixel): void;
  
  secondary(at: Pixel): void;
  
  key(key: string): void;
  
  notice(reason: CommandError): void;
  dismissNotice(id: number): void;
}

export interface ControllerDeps {
  readonly store: ClientStore;
  
  readonly viewport: () => Pixel;
  
  readonly screenToHex: (at: Pixel) => Axial | null;

  readonly clientToHex: (at: Pixel) => Axial | null;
  
  readonly onTroopsSent?: (target: Axial) => void;
  
  readonly onToolChanged?: (tool: Tool) => void;
}
